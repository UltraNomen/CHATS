<?php
// Sessions, request authentication, admin guard, throttling and short-lived signed tickets.
declare(strict_types=1);

final class Auth
{
    public const ADMIN_IDLE = 1800;
    public const APP_TTL = 31536000;
    public static ?array $user = null;
    public static ?array $session = null;

    public static function token(): string
    {
        $h = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if ($h === '' && function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v;
        }
        return preg_match('/^Bearer\s+([A-Za-z0-9_-]{20,128})$/', $h, $m) ? $m[1] : '';
    }

    public static function createSession(DB $db, string $uid, string $kind, string $device = ''): array
    {
        $token = b64url(random_bytes(32));
        $ua = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300);
        [$browser, $os] = ua_summary($ua);
        $id = new_id('s_');
        $db->insert('sessions', [
            'id' => $id, 'user_id' => $uid, 'token_hash' => hash('sha256', $token), 'kind' => $kind,
            'device' => clean_str($device, 80) ?: "$browser · $os", 'ua' => $ua, 'ip' => client_ip(),
            'created_at' => now(), 'last_seen' => now(), 'expires_at' => now() + ($kind === 'admin' ? self::ADMIN_IDLE : self::APP_TTL),
            'revoked' => 0, 'revoked_by' => '', 'mfa_until' => 0,
        ]);
        return ['token' => $token, 'id' => $id];
    }

    /** Authenticates an app request. Throws the error codes the client turns into status screens. */
    public static function app(DB $db, bool $allowPendingMfa = false): array
    {
        $s = self::lookup($db, 'app', true);
        $u = $db->one('SELECT * FROM users WHERE id = ?', [$s['user_id']]);
        if (!$u) fail(401, 'session_revoked', 'account no longer exists');
        if ($u['status'] === 'disabled') {
            fail(403, 'account_disabled', 'account disabled by an admin', ['since' => (int)$u['status_at'], 'reason' => (string)$u['status_reason']]);
        }
        self::checkRevoked($s);
        if ($u['status'] === 'pending') fail(403, 'account_pending', 'waiting for admin approval');
        if ((int)$s['mfa_until'] === -1 && !$allowPendingMfa) fail(403, 'mfa_enroll_required', 'this server requires two-factor authentication');
        if (Config::server('maint') && !in_array($u['role'], ['owner', 'admin'], true)) {
            fail(503, 'maintenance', (string)Config::server('maintMsg'), ['since' => (int)$db->kvGet('maint_since', 0)]);
        }
        if (now() - (int)$s['last_seen'] > 30) $db->update('sessions', ['last_seen' => now(), 'ip' => client_ip()], 'id = ?', [$s['id']]);
        if (now() - (int)$u['last_seen'] > 15) $db->update('users', ['last_seen' => now()], 'id = ?', [$u['id']]);
        self::$user = $u;
        self::$session = $s;
        return $u;
    }

    public static function admin(DB $db, array $roles = ['owner', 'admin', 'moderator']): array
    {
        $ips = Config::all()['security']['ips'] ?? [];
        if ($ips) {
            $ok = false;
            foreach ($ips as $r) if (ip_in_cidr(client_ip(), $r['cidr'])) $ok = true;
            if (!$ok) fail(403, 'ip_blocked', 'console not reachable from ' . client_ip());
        }
        $s = self::lookup($db, 'admin');
        $u = $db->one('SELECT * FROM users WHERE id = ?', [$s['user_id']]);
        if (!$u || !in_array($u['role'], $roles, true) || $u['status'] !== 'active') fail(403, 'forbidden', 'not allowed for your role');
        $db->update('sessions', ['last_seen' => now(), 'expires_at' => now() + self::ADMIN_IDLE, 'ip' => client_ip()], 'id = ?', [$s['id']]);
        self::$user = $u;
        self::$session = $s;
        return $u;
    }

    private static function lookup(DB $db, string $kind, bool $deferRevoked = false): array
    {
        $t = self::token();
        if ($t === '') fail(401, 'no_session', 'not signed in');
        $s = $db->one('SELECT * FROM sessions WHERE token_hash = ? AND kind = ?', [hash('sha256', $t), $kind]);
        if (!$s) fail(401, 'no_session', 'not signed in');
        if (!$deferRevoked) self::checkRevoked($s);
        return $s;
    }

    private static function checkRevoked(array $s): void
    {
        if ((int)$s['revoked']) fail(401, 'session_revoked', $s['revoked_by'] === 'admin' ? 'an admin ended this session' : 'session ended', ['by' => $s['revoked_by'], 'at' => (int)$s['last_seen']]);
        if ((int)$s['expires_at'] < now()) fail(401, 'session_expired', 'session expired');
    }

    public static function revokeUser(DB $db, string $uid, string $by, ?string $exceptSession = null): int
    {
        $sql = 'UPDATE sessions SET revoked = 1, revoked_by = ? WHERE user_id = ? AND revoked = 0';
        $p = [$by, $uid];
        if ($exceptSession) { $sql .= ' AND id <> ?'; $p[] = $exceptSession; }
        $n = $db->exec($sql, $p);
        $db->exec('DELETE FROM push_subs WHERE user_id = ?' . ($exceptSession ? ' AND session_id <> ?' : ''), $exceptSession ? [$uid, $exceptSession] : [$uid]);
        return $n;
    }

    /** Fixed-window throttle. Returns false when $key has exceeded $max attempts in $window seconds. */
    public static function throttle(DB $db, string $key, int $max, int $window): bool
    {
        if (random_int(0, 50) === 0) $db->exec('DELETE FROM attempts WHERE at < ?', [now() - 86400]);
        $n = (int)$db->value('SELECT COUNT(*) FROM attempts WHERE k = ? AND at > ?', [$key, now() - $window]);
        if ($n >= $max) return false;
        $db->insert('attempts', ['k' => $key, 'at' => now()]);
        return true;
    }

    public static function clearThrottle(DB $db, string $key): void { $db->exec('DELETE FROM attempts WHERE k = ?', [$key]); }

    /** Signed, expiring ticket for multi-step flows (2FA, password reset). */
    public static function ticket(string $purpose, string $uid, int $ttl = 300): string
    {
        $body = $purpose . '|' . $uid . '|' . (now() + $ttl) . '|' . bin2hex(random_bytes(6));
        $ticket = b64url($body) . '.' . b64url(hash_hmac('sha256', $body, Config::secret(), true));
        if ($purpose === 'reset') {
            $db = DB::main();
            $u = $db->one('SELECT * FROM users WHERE id = ?', [$uid]);
            $db->kvSet('reset:' . $uid, ['hash' => hash('sha256', $ticket), 'state' => self::credentialState($u)]);
        }
        return $ticket;
    }

    public static function checkTicket(string $ticket, string $purpose): string
    {
        [$b, $sig] = array_pad(explode('.', $ticket, 2), 2, '');
        $body = unb64($b);
        if ($body === '' || !hash_equals(b64url(hash_hmac('sha256', $body, Config::secret(), true)), $sig)) fail(400, 'bad_ticket', 'expired, start again');
        [$p, $uid, $exp] = array_pad(explode('|', $body), 3, '');
        if ($p !== $purpose || (int)$exp < now()) fail(400, 'bad_ticket', 'expired, start again');
        if ($purpose === 'reset') {
            $db = DB::main();
            $rec = $db->kvGet('reset:' . $uid);
            $u = $db->one('SELECT * FROM users WHERE id = ?', [$uid]);
            if (!$u || !is_array($rec) || !hash_equals($rec['hash'] ?? '', hash('sha256', $ticket))
                || !hash_equals($rec['state'] ?? '', self::credentialState($u))) fail(400, 'bad_ticket', 'expired, start again');
        }
        return $uid;
    }

    private static function credentialState(array $u): string
    {
        return hash('sha256', $u['auth_hash'] . '|' . $u['rc_hash'] . '|' . $u['pw_salt'] . '|' . $u['rc_salt']);
    }

    /** Caller holds the user lock; consumption and password update must commit together. */
    public static function consumeReset(DB $db, string $ticket): string
    {
        $uid = self::checkTicket($ticket, 'reset');
        if ($db->exec('DELETE FROM kv WHERE k = ?', ['reset:' . $uid]) !== 1) fail(400, 'bad_ticket', 'expired, start again');
        return $uid;
    }

    public static function staff(array $u): bool { return in_array($u['role'], ['owner', 'admin', 'moderator'], true); }

    /** Fresh proof of an existing factor, independent of possession of the session. */
    public static function factorState(array $u): string { return hash('sha256', (string)$u['totp_secret'] . '|' . $u['totp_on']); }

    public static function requireFactor(DB $db, array $u, string $field = 'currentCode'): string
    {
        if (!self::throttle($db, 'factor:' . $u['id'], 8, 600)) fail(429, 'rate_limited', 'too many codes · wait 10 minutes');
        $code = str_arg($field, 20);
        $kind = str_contains($code, '-') ? 'backup' : 'totp';
        $state = $db->tx(function () use ($db, $u, $kind, $code) {
            $fresh = $db->lockUser($u['id']);
            return (int)$fresh['totp_on'] && check_second_factor($db, $fresh, $kind, $code) ? self::factorState($fresh) : null;
        });
        if ($state === null) fail(403, 'bad_code', 'enter a current authenticator or backup code');
        return $state;
    }

    public static function beginEnrollment(DB $db, array $u, string $flow): array
    {
        $ticket = $flow === 'app' ? '' : self::ticket('enroll', $u['id'], 1800);
        $secret = Totp::newSecret();
        $db->kvSet('totp_pending:' . $u['id'], ['secret' => $secret, 'exp' => now() + 1800, 'flow' => $flow,
            'session' => self::$session['id'] ?? '', 'ticket' => hash('sha256', $ticket),
            'factor' => hash('sha256', (string)$u['totp_secret'] . '|' . $u['totp_on'])]);
        return ['ticket' => $ticket, 'secret' => Totp::pretty($secret), 'uri' => Totp::uri($secret, $u['username'], Config::server('name') ?: 'CHATS')];
    }

    /** Read only after lockUser, so stale/competing enrollment cannot replace a newly enabled factor. */
    public static function pendingEnrollment(DB $db, array $u, string $flow, string $ticket = ''): string
    {
        $p = $db->kvGet('totp_pending:' . $u['id']);
        if (!is_array($p) || ($p['exp'] ?? 0) < now() || ($p['flow'] ?? '') !== $flow
            || !hash_equals($p['factor'] ?? '', hash('sha256', (string)$u['totp_secret'] . '|' . $u['totp_on']))) fail(400, 'bad_ticket', 'enrollment expired, start again');
        if ($flow === 'app') {
            if ((int)$u['totp_on'] || ($p['session'] ?? '') !== (self::$session['id'] ?? '')) fail(403, 'forbidden', 'authenticator already enabled or enrollment belongs to another session');
        } else {
            if (!hash_equals($p['ticket'] ?? '', hash('sha256', $ticket))) fail(400, 'bad_ticket', 'enrollment expired, start again');
            if ($flow === 'initial' && (int)$u['totp_on']) fail(403, 'forbidden', 'authenticator already enabled');
            if ($flow === 'admin') {
                $s = $db->one('SELECT * FROM sessions WHERE id = ? AND user_id = ? AND kind = ?', [$p['session'], $u['id'], 'admin']);
                if (!$s || !self::staff($u) || $u['status'] !== 'active') fail(403, 'forbidden', 'admin enrollment is no longer authorized');
                self::checkRevoked($s);
            }
        }
        return $p['secret'];
    }

    public static function audit(DB $db, string $type, string $action, string $target = ''): void
    {
        $db->insert('audit', ['at' => now(), 'actor' => self::$user['username'] ?? 'system', 'type' => $type,
            'action' => mb_substr_safe($action, 200), 'target' => mb_substr_safe($target, 120), 'ip' => client_ip()]);
    }
}
