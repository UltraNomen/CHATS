<?php
// Public routes: server info, first-run setup, sign-up, login (+2FA), password recovery.
declare(strict_types=1);

function server_info(): array
{
    $s = Config::get('server');
    $keys = Config::keys();
    $installedAt = (int)$keys['installedAt'];
    $up = @file_get_contents('/proc/uptime');
    $uptime = $up ? (int)(float)$up : max(0, now() - $installedAt);
    return [
        'installed' => Config::installed(), 'name' => $s['name'] ?: ($_SERVER['HTTP_HOST'] ?? 'chats'), 'welcome' => $s['welcome'],
        'version' => 'chats-server ' . ltrim(CHATS_VERSION, 'v'), 'protocol' => CHATS_PROTOCOL, 'signup' => $s['reg'], 'fingerprint' => Config::fingerprint(),
        'uptime' => $uptime, 'fields' => ['email' => $s['emailField'], 'phone' => $s['phoneField']], 'theme' => $s['theme'],
        'caps' => Config::caps(), 'limits' => ['upload' => (int)$s['upload'], 'rate' => (int)$s['rate'], 'group' => (int)$s['group'], 'quota' => (int)$s['quota']],
        'tfaUsers' => $s['tfaUsers'], 'tfaAdmins' => $s['tfaAdmins'], 'tfaEmail' => (bool)$s['tfaEmail'] && (bool)Config::get('smtp')['on'], 'tfaBackup' => (bool)$s['tfaBackup'],
        'maint' => (bool)$s['maint'], 'maintMsg' => $s['maintMsg'], 'clientUrl' => (string)($s['clientUrl'] ?? ''), 'vapid' => $keys['vapidPub'] ?? '', 'time' => now(),
        'kdf' => ['alg' => 'argon2id', 'm' => 65536, 't' => 3, 'p' => 1],
    ] + (Config::installed() ? [] : ['drivers' => ['sqlite' => extension_loaded('pdo_sqlite'), 'mysql' => extension_loaded('pdo_mysql'), 'postgres' => extension_loaded('pdo_pgsql')], 'dataDir' => Config::dataDir()]);
}

function r_info(): never
{
    out(['server' => server_info()]);
}

function r_invite_preview(): never
{
    $db = DB::main();
    $code = strtoupper(str_arg('code', 32));
    $inv = $db->one('SELECT * FROM invites WHERE code = ?', [$code]);
    $live = $inv && !(int)$inv['revoked'] && (!(int)$inv['expires_at'] || (int)$inv['expires_at'] > now()) && (!(int)$inv['max_uses'] || (int)$inv['used'] < (int)$inv['max_uses']);
    out(['valid' => (bool)$live, 'approve' => $live && (int)$inv['approve'] === 1, 'server' => $live && (int)$inv['preview'] ? Config::server('name') : '']);
}

// ---------------------------------------------------------------- setup

function setup_guard(): void
{
    if (Config::installed()) fail(403, 'installed', 'this server is already set up');
    $token = getenv('CHATS_SETUP_TOKEN') ?: (defined('CHATS_SETUP_TOKEN') ? CHATS_SETUP_TOKEN : '');
    if ($token !== '' && !hash_equals($token, (string)arg('setupToken', ''))) fail(403, 'setup_token', 'this server needs a setup token');
}

function clean_db_cfg($in): array
{
    $c = is_array($in) ? $in : [];
    $out = Config::DB_DEFAULTS;
    foreach ($out as $k => $v) if (array_key_exists($k, $c)) $out[$k] = is_bool($v) ? (bool)$c[$k] : clean_str((string)$c[$k], 300);
    if (!in_array($out['engine'], ['sqlite', 'mysql', 'postgres'], true)) fail(400, 'db_engine', $out['engine'] === 'json' ? 'the json engine is not available in this build · use sqlite' : 'unknown engine');
    return $out;
}

function clean_storage_cfg($in): array
{
    $c = is_array($in) ? $in : [];
    $out = Config::STORAGE_DEFAULTS;
    foreach ($out as $k => $v) if (array_key_exists($k, $c)) $out[$k] = is_bool($v) ? (bool)$c[$k] : clean_str((string)$c[$k], 300);
    if (!in_array($out['backend'], ['local', 's3'], true)) fail(400, 'bad_request', 'unknown storage backend');
    return $out;
}

function clean_smtp_cfg($in): array
{
    $c = is_array($in) ? $in : [];
    $out = Config::SMTP_DEFAULTS;
    foreach ($out as $k => $v) if (array_key_exists($k, $c)) $out[$k] = is_bool($v) ? (bool)$c[$k] : clean_str((string)$c[$k], 300);
    if (!in_array($out['sec'], ['none', 'starttls', 'tls'], true)) $out['sec'] = 'starttls';
    return $out;
}

function clean_server_cfg($in, array $base): array
{
    $c = is_array($in) ? $in : [];
    $out = $base + Config::SERVER_DEFAULTS;
    $enums = ['reg' => ['open', 'invite', 'closed'], 'theme' => ['green', 'lime', 'cyan', 'amber', 'pink'], 'emailField' => ['off', 'optional', 'required'],
        'phoneField' => ['off', 'optional', 'required'], 'reportHide' => ['off', '3', '5', '10'], 'editWindow' => ['15', '60', '1440', 'always'],
        'tfaUsers' => ['off', 'optional', 'required'], 'tfaAdmins' => ['optional', 'required'], 'tfaRemember' => ['0', '7', '30']];
    foreach (Config::SERVER_DEFAULTS as $k => $def) {
        if (!array_key_exists($k, $c)) continue;
        if (is_bool($def)) $out[$k] = (bool)$c[$k];
        elseif (isset($enums[$k])) { if (in_array((string)$c[$k], $enums[$k], true)) $out[$k] = (string)$c[$k]; }
        elseif (in_array($k, ['upload', 'group', 'rate', 'quota'], true)) $out[$k] = (string)max(1, min(100000, (int)$c[$k]));
        elseif ($k === 'clientUrl') {
            $u = rtrim(trim((string)$c[$k]), '/');
            if ($u !== '' && (!preg_match('~^https?://[^\s/?#]+(/[^\s?#]*)?$~i', $u) || strlen($u) > 200)) fail(400, 'bad_request', 'chat app address must be a full http(s) url without ? or #');
            $out[$k] = $u;
        }
        else $out[$k] = clean_str((string)$c[$k], $k === 'welcome' ? 300 : 160, $k === 'welcome');
    }
    return $out;
}

function test_db(array $cfg): array
{
    try {
        $t0 = microtime(true);
        $db = new DB($cfg);
        $v = $db->version();
        $ms = (int)round((microtime(true) - $t0) * 1000);
        if ($cfg['engine'] === 'sqlite') return [true, '[ OK ] ' . ($cfg['path'] ?: Config::dataDir() . '/chats.db') . ' is writable · ' . $v];
        return [true, '[ OK ] connected · ' . $v . ' · ' . $cfg['name'] . ' · ' . $ms . ' ms'];
    } catch (HttpError $e) {
        return [false, '[FAIL] ' . $e->getMessage()];
    } catch (Throwable $e) {
        return [false, '[FAIL] ' . preg_replace('/^SQLSTATE\[\w+\]\s*(\[\d+\])?\s*/', '', $e->getMessage())];
    }
}

function test_storage(array $cfg): array
{
    try { return Storage::for($cfg['backend'], $cfg)->test(); } catch (Throwable $e) { return [false, '[FAIL] ' . $e->getMessage()]; }
}

function test_smtp(array $cfg, string $to): array
{
    try {
        $reply = Mail::send($cfg, $to, 'CHATS test email', "this is a test from your CHATS server.\nif you can read this, outgoing email works.\n");
        return [true, '[ OK ] ' . preg_replace('/\s+/', ' ', substr($reply, 0, 60)) . ' · sent to ' . $to];
    } catch (Throwable $e) {
        return [false, '[FAIL] ' . $e->getMessage()];
    }
}

/** Environment presets as the wizard may see them: secrets replaced by a flag saying they are set. */
function preset_public(): array
{
    $p = Config::envPreset();
    if (isset($p['db'])) { $p['db']['passSet'] = ($p['db']['pass'] ?? '') !== ''; unset($p['db']['pass']); }
    if (isset($p['storage'])) { $p['storage']['secretSet'] = ($p['storage']['secret'] ?? '') !== ''; unset($p['storage']['secret']); }
    return $p;
}

/** Puts environment secrets back into a wizard config that targets the preset database or bucket and left them empty. */
function with_env_secrets(array $cfg, string $section): array
{
    $p = Config::envPreset()[$section] ?? null;
    if (!$p) return $cfg;
    if ($section === 'db' && $cfg['pass'] === '' && $cfg['engine'] === ($p['engine'] ?? '') && $cfg['host'] === ($p['host'] ?? $cfg['host'])) $cfg['pass'] = $p['pass'] ?? '';
    if ($section === 'storage' && $cfg['backend'] === 's3' && $cfg['secret'] === '' && $cfg['bucket'] === ($p['bucket'] ?? '') && $cfg['endpoint'] === ($p['endpoint'] ?? $cfg['endpoint'])) $cfg['secret'] = $p['secret'] ?? '';
    return $cfg;
}

/** Lets the wizard check a setup token before the admin fills in every step; answers with the environment presets. */
function r_setup_unlock(): never
{
    usleep(300000);
    setup_guard();
    out(['preset' => preset_public()]);
}

function r_setup_status(): never
{
    // After install this is public, so it says nothing about the host.
    if (Config::installed()) out(['installed' => true]);
    $needsToken = (bool)(getenv('CHATS_SETUP_TOKEN') ?: (defined('CHATS_SETUP_TOKEN') ? CHATS_SETUP_TOKEN : ''));
    out(['installed' => false, 'needsToken' => $needsToken, 'preset' => $needsToken ? (object)[] : (object)preset_public(),
        'drivers' => ['sqlite' => extension_loaded('pdo_sqlite'), 'mysql' => extension_loaded('pdo_mysql'), 'postgres' => extension_loaded('pdo_pgsql')],
        'dataDir' => Config::dataDir(), 'freeBytes' => (int)(free_bytes(Config::dataDir()) ?? 0)]);
}

function r_setup_test(): never
{
    setup_guard();
    $what = str_arg('what', 16);
    [$ok, $msg] = match ($what) {
        'db' => test_db(with_env_secrets(clean_db_cfg(arg('db')), 'db')),
        'storage' => test_storage(with_env_secrets(clean_storage_cfg(arg('storage')), 'storage')),
        'smtp' => test_smtp(clean_smtp_cfg(arg('smtp')), str_arg('to', 190)),
        default => [false, 'unknown test'],
    };
    out(['pass' => $ok, 'msg' => $msg]);
}

/** Writes the configuration, creates the schema and the owner account, and starts TOTP enrollment. */
function r_setup_launch(): never
{
    setup_guard();
    $dbCfg = with_env_secrets(clean_db_cfg(arg('db')), 'db');
    $stCfg = with_env_secrets(clean_storage_cfg(arg('storage')), 'storage');
    $smtp = clean_smtp_cfg(arg('smtp'));
    $server = clean_server_cfg(arg('server'), []);
    if ($server['name'] === '') fail(400, 'bad_request', 'server name required');
    [$ok, $msg] = test_db($dbCfg);
    if (!$ok) fail(400, 'db_failed', $msg);
    [$ok, $msg] = test_storage($stCfg);
    if (!$ok) fail(400, 'storage_failed', $msg);
    $db = new DB($dbCfg);
    $db->createSchema();
    if ((int)$db->value("SELECT COUNT(*) FROM users WHERE role = 'owner'")) fail(409, 'installed', 'this database already has an owner · pick an empty database');
    $all = Config::all();
    $all['server'] = $server;
    $all['db'] = $dbCfg;
    $all['storage'] = $stCfg;
    $all['smtp'] = $smtp;
    $all['security'] = ['ips' => []];
    Config::save($all);
    Config::keys();
    DB::setMain($db);
    $owner = create_account($db, is_array(arg('owner')) ? arg('owner') : [], 'owner', true);
    $all = Config::all();
    $all['installed'] = true;
    $all['schemaVer'] = DB::SCHEMA_VERSION;
    Config::save($all);
    Auth::$user = $owner;
    Auth::audit($db, 'config', 'server set up', $server['name']);
    out(Auth::beginEnrollment($db, $owner, 'initial'));
}

// ---------------------------------------------------------------- accounts

/** Validates a sign-up payload (all key material is produced by the client) and inserts the user. */
function create_account(DB $db, array $in, string $role, bool $bypassRules = false): array
{
    $g = fn($k, $d = '') => $in[$k] ?? $d;
    $username = strtolower(clean_str($g('username'), 32));
    if (!valid_username($username)) fail(400, 'bad_username', 'username: 3-32 chars, a-z 0-9 _, starts with a letter');
    if ($db->value('SELECT COUNT(*) FROM users WHERE username = ?', [$username])) fail(409, 'username_taken', 'username taken');
    $name = clean_str($g('name'), 80) ?: $username;
    $email = strtolower(clean_str($g('email'), 190));
    $phone = clean_str($g('phone'), 32);
    $s = Config::get('server');
    $invite = null;
    $status = 'active';
    $quota = 0;
    if (!$bypassRules) {
        if ($s['reg'] === 'closed') fail(403, 'signup_closed', 'this server is not accepting new accounts');
        $code = strtoupper(clean_str($g('invite'), 32));
        if ($s['reg'] === 'invite' || $code !== '') {
            $invite = $db->one('SELECT * FROM invites WHERE code = ?', [$code]);
            $live = $invite && !(int)$invite['revoked'] && (!(int)$invite['expires_at'] || (int)$invite['expires_at'] > now()) && (!(int)$invite['max_uses'] || (int)$invite['used'] < (int)$invite['max_uses']);
            if (!$live) fail(403, 'bad_invite', $code === '' ? 'this server needs an invite code' : 'invite code is invalid, used up or expired');
            if ((int)$invite['approve']) $status = 'pending';
            $quota = (int)$invite['quota_mb'];
        }
        foreach (['email' => [$email, $s['emailField']], 'phone' => [$phone, $s['phoneField']]] as $f => [$v, $mode]) {
            if ($mode === 'required' && $v === '') fail(400, 'missing_' . $f, $f . ' is required on this server');
            if ($mode === 'off') ${$f} = '';
        }
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'bad_email', 'not a valid email address');
    if ($phone !== '' && !preg_match('/^\+?[0-9 ()-]{4,32}$/', $phone)) fail(400, 'bad_phone', 'phone: digits, spaces, + ( ) - only');
    if ($email !== '' && $db->value('SELECT COUNT(*) FROM users WHERE email = ?', [$email])) fail(409, 'email_taken', 'email already in use');
    if ($phone !== '' && $db->value('SELECT COUNT(*) FROM users WHERE phone = ?', [$phone])) fail(409, 'phone_taken', 'phone already in use');
    $need = fn($k, $len) => strlen(unb64((string)$g($k))) === $len ? (string)$g($k) : fail(400, 'bad_keys', "bad $k");
    $wrap = fn($k) => (strlen((string)$g($k)) > 20 && strlen((string)$g($k)) < 400) ? (string)$g($k) : fail(400, 'bad_keys', "bad $k");
    $vault = (string)$g('vault');
    if ($vault === '' || strlen($vault) > 4_000_000) fail(400, 'bad_keys', 'bad vault');
    $id = new_id('u_', 8);
    $row = [
        'id' => $id, 'username' => $username, 'email' => $email ?: null, 'phone' => $phone ?: null, 'name' => $name, 'bio' => '',
        'role' => $role, 'status' => $status, 'status_reason' => '', 'status_at' => now(), 'pub_key' => $need('pubKey', 32),
        'pw_salt' => valid_salt($g('pwSalt')) ? $g('pwSalt') : fail(400, 'bad_keys', 'bad pwSalt'), 'pw_wrap' => $wrap('pwWrap'), 'auth_hash' => hash('sha256', unb64($need('auth', 32))),
        'rc_salt' => valid_salt($g('rcSalt')) ? $g('rcSalt') : fail(400, 'bad_keys', 'bad rcSalt'), 'rc_wrap' => $wrap('rcWrap'), 'rc_hash' => hash('sha256', unb64($need('rcAuth', 32))),
        'vault' => $vault, 'vault_ver' => 1, 'avatar' => null, 'findable' => 1, 'show_online' => 1, 'receipts' => 1,
        'phone_vis' => 'contacts', 'phone_shares' => '[]', 'totp_secret' => null, 'totp_on' => 0, 'backup_codes' => '[]',
        'quota_mb' => $quota, 'invite' => $invite['code'] ?? null, 'created_at' => now(), 'last_seen' => now(), 'seq' => 0,
    ];
    $db->tx(function () use ($db, &$row, $invite) {
        $row['seq'] = $db->nextSeq();
        $db->insert('users', $row);
        if ($invite) $db->exec('UPDATE invites SET used = used + 1 WHERE code = ?', [$invite['code']]);
    });
    $db->bump('signups');
    return $db->one('SELECT * FROM users WHERE id = ?', [$id]);
}

function find_login_user(DB $db, string $method, string $id): ?array
{
    $id = trim($id);
    return match ($method) {
        'email' => $db->one('SELECT * FROM users WHERE email = ?', [strtolower($id)]),
        'phone' => $db->one('SELECT * FROM users WHERE phone = ?', [$id]),
        default => $db->one('SELECT * FROM users WHERE username = ?', [strtolower(ltrim($id, '@'))]),
    };
}

/** Unknown accounts get a stable fake salt so prelogin can't be used to enumerate users. */
function fake_salt(string $purpose, string $id): string
{
    $k = $purpose === 'rc' ? ['m' => 19456, 't' => 2, 'p' => 1] : server_info()['kdf'];
    return 'a2id$m=' . $k['m'] . ',t=' . $k['t'] . ',p=' . $k['p'] . '$' . b64(substr(hash_hmac('sha256', $purpose . '|' . strtolower($id), Config::secret(), true), 0, 16));
}

/** "a2id$m=…,t=…,p=…$<16-byte salt>" with sane minimums. */
function valid_salt($s): bool
{
    if (!is_string($s) || !preg_match('/^a2id\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+\/=]{20,32})$/', $s, $m)) return false;
    return (int)$m[1] >= 8192 && (int)$m[1] <= 1048576 && (int)$m[2] >= 1 && (int)$m[2] <= 20 && (int)$m[3] >= 1 && (int)$m[3] <= 8 && strlen(unb64($m[4])) === 16;
}

function r_auth_check(): never
{
    $db = DB::main();
    $u = strtolower(str_arg('u', 32));
    out(['free' => valid_username($u) && !$db->value('SELECT COUNT(*) FROM users WHERE username = ?', [$u]), 'valid' => valid_username($u)]);
}

function r_auth_prelogin(): never
{
    $db = DB::main();
    $method = str_arg('method', 10) ?: 'username';
    $id = str_arg('id', 190);
    $u = find_login_user($db, $method, $id);
    out(['salt' => $u ? $u['pw_salt'] : fake_salt('pw', $method . ':' . $id), 'kdf' => server_info()['kdf']]);
}

function session_payload(DB $db, array $u, array $sess, string $kind): array
{
    $p = ['token' => $sess['token'], 'session' => $sess['id'], 'me' => fmt_me($db, $u)];
    if ($kind === 'app') $p['keys'] = ['pwSalt' => $u['pw_salt'], 'pwWrap' => $u['pw_wrap'], 'vault' => $u['vault'], 'vaultVer' => (int)$u['vault_ver'], 'pubKey' => $u['pub_key']];
    return $p;
}

/** Remembered devices stop skipping 2FA once the password or the authenticator changes. */
function trust_state(array $u): string
{
    return substr(hash('sha256', 'trust-state|' . $u['auth_hash'] . '|' . $u['pw_salt'] . '|' . (string)$u['totp_secret'] . '|' . $u['totp_on']), 0, 16);
}

function trust_token(array $u, int $days): string
{
    $body = $u['id'] . '|' . (now() + $days * 86400) . '|' . trust_state($u);
    return b64url($body) . '.' . b64url(hash_hmac('sha256', 'trust|' . $body, Config::secret(), true));
}

function trust_ok(array $u, string $tok): bool
{
    [$b, $sig] = array_pad(explode('.', $tok, 2), 2, '');
    $body = unb64($b);
    if ($body === '' || !hash_equals(b64url(hash_hmac('sha256', 'trust|' . $body, Config::secret(), true)), $sig)) return false;
    [$id, $exp, $state] = array_pad(explode('|', $body), 3, '');
    return $id === $u['id'] && (int)$exp > now() && hash_equals(trust_state($u), $state);
}

/** Staff 2FA is optional unless the owner turns on "admins: required" in the console. */
function staff_mfa_required(): bool { return Config::server('tfaAdmins') === 'required'; }

/** Whether this account must have an authenticator before it can use the app. */
function mfa_required(array $u): bool
{
    return Config::server('tfaUsers') === 'required' || (Auth::staff($u) && staff_mfa_required());
}

/** Shared end of every app sign-in (password login and password reset): asks for the second factor or opens a session. */
function app_signin(DB $db, array $u): never
{
    $s = Config::get('server');
    $staff = Auth::staff($u);
    if ((int)$u['totp_on'] && ($staff || $s['tfaUsers'] !== 'off') && ($staff || !trust_ok($u, (string)arg('trust', '')))) {
        out(['need2fa' => true, 'ticket' => Auth::ticket('2fa', $u['id']), 'methods' => login_factors($u, false), 'remember' => (int)$s['tfaRemember']]);
    }
    $sess = Auth::createSession($db, $u['id'], 'app', str_arg('device', 80));
    $required = mfa_required($u) && !(int)$u['totp_on'];
    if ($required) $db->update('sessions', ['mfa_until' => -1], 'id = ?', [$sess['id']]);
    out(session_payload($db, $u, $sess, 'app') + ['mfaRequired' => $required]);
}

function r_auth_login(): never
{
    $db = DB::main();
    $method = str_arg('method', 10) ?: 'username';
    $id = str_arg('id', 190);
    $kind = bool_arg('admin') ? 'admin' : 'app';
    if (!Auth::throttle($db, 'login:' . client_ip(), 30, 600) || !Auth::throttle($db, 'login:' . strtolower($id), 10, 600)) {
        fail(429, 'rate_limited', 'too many attempts · wait 10 minutes', ['retry' => 600]);
    }
    $u = find_login_user($db, $method, $id);
    $auth = unb64((string)arg('auth', ''));
    if (!$u || strlen($auth) !== 32 || !hash_equals($u['auth_hash'], hash('sha256', $auth))) {
        usleep(random_int(150000, 350000));
        fail(403, 'bad_credentials', $kind === 'admin' ? '✕ invalid username or password' : 'wrong ' . $method . ' or password');
    }
    Auth::clearThrottle($db, 'login:' . strtolower($id));
    if ($kind === 'admin') {
        if (!in_array($u['role'], ['owner', 'admin', 'moderator'], true) || $u['status'] !== 'active') fail(403, 'bad_credentials', '✕ invalid username or password');
        if ((int)$u['totp_on']) out(['need2fa' => true, 'ticket' => Auth::ticket('2fa-admin', $u['id']), 'methods' => ['totp', 'backup']]);
        if (staff_mfa_required()) out(['needEnroll' => true] + Auth::beginEnrollment($db, $u, 'initial'));
        $sess = Auth::createSession($db, $u['id'], 'admin', 'console');
        Auth::$user = $u;
        Auth::audit($db, 'auth', 'admin login (password only)', $u['username']);
        out(session_payload($db, $u, $sess, 'admin'));
    }
    if ($u['status'] === 'disabled') fail(403, 'account_disabled', 'account disabled by an admin', ['since' => (int)$u['status_at'], 'reason' => (string)$u['status_reason']]);
    app_signin($db, $u);
}

function login_factors(array $u, bool $admin): array
{
    if ($admin || Auth::staff($u)) return ['totp', 'backup'];
    $m = ['totp'];
    if (Config::server('tfaBackup')) $m[] = 'backup';
    if (Config::server('tfaEmail') && Config::get('smtp')['on'] && $u['email']) $m[] = 'email';
    return $m;
}

function email_challenge_key(string $ticket): string { return 'emailcode:' . substr(hash('sha256', $ticket), 0, 48); }

function check_second_factor(DB $db, array $u, string $kind, string $code, string $ticket = ''): bool
{
    $code = trim(strtolower($code));
    if ($kind === 'totp') return (bool)$u['totp_secret'] && Totp::verify($u['totp_secret'], $code);
    if ($kind === 'backup') {
        $codes = json_decode((string)$u['backup_codes'], true) ?: [];
        foreach ($codes as $i => $h) {
            if (hash_equals($h, hash('sha256', $code))) {
                unset($codes[$i]);
                $db->update('users', ['backup_codes' => json_encode(array_values($codes))], 'id = ?', [$u['id']]);
                return true;
            }
        }
        return false;
    }
    if ($kind === 'email') {
        if ($ticket === '') return false;
        $rec = $db->kvGet(email_challenge_key($ticket));
        if (!$rec || $rec['exp'] < now()) return false;
        $ok = hash_equals($rec['hash'], hash('sha256', $code));
        if ($ok) $db->exec('DELETE FROM kv WHERE k = ?', [email_challenge_key($ticket)]);
        return $ok;
    }
    return false;
}

function r_auth_2fa(): never
{
    $db = DB::main();
    $admin = bool_arg('admin');
    $ticket = str_arg('ticket', 300);
    $uid = Auth::checkTicket($ticket, $admin ? '2fa-admin' : '2fa');
    if (!Auth::throttle($db, '2fa:' . $uid, 8, 600)) fail(429, 'rate_limited', 'too many codes · wait 10 minutes', ['retry' => 600]);
    $factor = str_arg('kind', 10) ?: 'totp';
    $code = str_arg('code', 20);
    // Serialize all consumers of one-time backup/email codes with factor-management mutations.
    $u = $db->tx(function () use ($db, $uid, $admin, $factor, $code, $ticket) {
        $u = $db->lockUser($uid);
        if ($u['status'] !== 'active' || ($admin && !Auth::staff($u))) return null;
        return in_array($factor, login_factors($u, $admin), true) && check_second_factor($db, $u, $factor, $code, $ticket) ? $u : null;
    });
    if (!$u) fail(403, 'bad_code', 'code rejected · check your device clock');
    Auth::clearThrottle($db, '2fa:' . $uid);
    $sess = Auth::createSession($db, $uid, $admin ? 'admin' : 'app', str_arg('device', 80));
    $extra = [];
    if ($admin) {
        Auth::$user = $u;
        Auth::audit($db, 'auth', 'admin login (totp)', $u['username']);
    } elseif (bool_arg('remember') && (int)Config::server('tfaRemember') > 0) {
        $extra['trust'] = trust_token($u, (int)Config::server('tfaRemember'));
    }
    out(session_payload($db, $u, $sess, $admin ? 'admin' : 'app') + $extra);
}

function r_auth_2fa_email(): never
{
    $db = DB::main();
    $ticket = str_arg('ticket', 300);
    $uid = Auth::checkTicket($ticket, '2fa');
    $u = $db->one('SELECT * FROM users WHERE id = ?', [$uid]);
    $smtp = Config::get('smtp');
    if (!$u || !in_array('email', login_factors($u, false), true)) fail(400, 'no_email', 'email codes are not available');
    if (!Auth::throttle($db, 'mailcode:' . $uid, 3, 900)) fail(429, 'rate_limited', 'wait a few minutes before asking again', ['retry' => 900]);
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $db->kvSet(email_challenge_key($ticket), ['hash' => hash('sha256', $code), 'exp' => now() + 600]);
    try {
        Mail::send($smtp, $u['email'], 'your CHATS sign-in code', "your sign-in code for " . Config::server('name') . " is $code\nit expires in 10 minutes.\n");
    } catch (Throwable $e) {
        $db->log('ERR', 'smtp: ' . $e->getMessage());
        fail(502, 'smtp_failed', 'could not send the email');
    }
    out(['sent' => preg_replace('/^(.).*(@.*)$/', '$1•••$2', $u['email'])]);
}

/** First TOTP enrollment for admins (and the setup owner): verify a code from the pending secret. */
function r_auth_enroll(): never
{
    $db = DB::main();
    $ticket = str_arg('ticket', 300);
    $uid = Auth::checkTicket($ticket, 'enroll');
    if (!Auth::throttle($db, 'enroll:' . $uid, 8, 600)) fail(429, 'rate_limited', 'too many codes');
    [$u, $codes] = $db->tx(function () use ($db, $uid, $ticket) {
        $u = $db->lockUser($uid);
        $pending = $db->kvGet('totp_pending:' . $uid);
        $flow = is_array($pending) ? ($pending['flow'] ?? '') : '';
        if (!in_array($flow, ['initial', 'admin'], true)) fail(400, 'bad_ticket', 'start enrollment again');
        $secret = Auth::pendingEnrollment($db, $u, $flow, $ticket);
        if (!Totp::verify($secret, str_arg('code', 6))) fail(403, 'bad_code', 'enter the code from your app');
        $codes = Totp::backupCodes();
        $db->update('users', ['totp_secret' => $secret, 'totp_on' => 1, 'backup_codes' => json_encode(array_map(fn($c) => hash('sha256', $c), $codes))], 'id = ?', [$uid]);
        $db->exec('DELETE FROM kv WHERE k = ?', ['totp_pending:' . $uid]);
        return [$u, $codes];
    });
    Auth::$user = $u;
    Auth::audit($db, 'auth', 'enrolled authenticator', $u['username']);
    out(['enabled' => true, 'backupCodes' => $codes]);
}

function r_auth_signup(): never
{
    $db = DB::main();
    if (!Auth::throttle($db, 'signup:' . client_ip(), 10, 3600)) fail(429, 'rate_limited', 'too many sign-ups from this address', ['retry' => 3600]);
    $u = create_account($db, input(), 'user');
    if ($u['status'] === 'pending') out(['pending' => true, 'me' => fmt_me($db, $u)]);
    $sess = Auth::createSession($db, $u['id'], 'app', str_arg('device', 80));
    $required = Config::server('tfaUsers') === 'required';
    if ($required) $db->update('sessions', ['mfa_until' => -1], 'id = ?', [$sess['id']]);
    out(session_payload($db, $u, $sess, 'app') + ['mfaRequired' => $required]);
}

function r_auth_recover_salt(): never
{
    $db = DB::main();
    $name = strtolower(ltrim(str_arg('u', 32), '@'));
    $u = $db->one('SELECT rc_salt FROM users WHERE username = ?', [$name]);
    out(['salt' => $u ? $u['rc_salt'] : fake_salt('rc', $name), 'kdf' => server_info()['kdf']]);
}

function r_auth_recover(): never
{
    $db = DB::main();
    $name = strtolower(ltrim(str_arg('u', 32), '@'));
    if (!Auth::throttle($db, 'recover:' . $name, 5, 3600) || !Auth::throttle($db, 'recover:' . client_ip(), 20, 3600)) {
        fail(429, 'rate_limited', 'too many attempts · wait an hour', ['retry' => 3600]);
    }
    $u = $db->one('SELECT * FROM users WHERE username = ?', [$name]);
    $rc = unb64((string)arg('rcAuth', ''));
    if (!$u || strlen($rc) !== 32) fail(403, 'bad_phrase', 'phrase does not match this account');
    $result = $db->tx(function () use ($db, $u, $rc) {
        $u = $db->lockUser($u['id']);
        if (!hash_equals($u['rc_hash'], hash('sha256', $rc))) fail(403, 'bad_phrase', 'phrase does not match this account');
        return ['ticket' => Auth::ticket('reset', $u['id'], 900), 'rcWrap' => $u['rc_wrap']];
    });
    out($result);
}

function r_auth_reset(): never
{
    $db = DB::main();
    $ticket = str_arg('ticket', 300);
    $uid = Auth::checkTicket($ticket, 'reset');
    $salt = (string)arg('pwSalt', '');
    $wrap = blob_arg('pwWrap', 300);
    $auth = unb64(blob_arg('auth', 32));
    if (!valid_salt($salt) || strlen($auth) !== 32) fail(400, 'bad_keys', 'bad key material');
    $db->tx(function () use ($db, $uid, $ticket, $salt, $wrap, $auth) {
        $db->lockUser($uid);
        Auth::consumeReset($db, $ticket);
        $db->update('users', ['pw_salt' => $salt, 'pw_wrap' => $wrap, 'auth_hash' => hash('sha256', $auth)], 'id = ?', [$uid]);
        Auth::revokeUser($db, $uid, 'reset');
    });
    $u = $db->one('SELECT * FROM users WHERE id = ?', [$uid]);
    if ($u['status'] !== 'active') fail(403, $u['status'] === 'pending' ? 'account_pending' : 'account_disabled', 'password changed, but this account cannot sign in yet');
    // The recovery phrase replaces the password, not the second factor.
    app_signin($db, $u);
}

function r_auth_logout(): never
{
    $db = DB::main();
    $t = Auth::token();
    if ($t !== '') {
        $s = $db->one('SELECT id FROM sessions WHERE token_hash = ?', [hash('sha256', $t)]);
        if ($s) {
            $db->update('sessions', ['revoked' => 1, 'revoked_by' => 'self'], 'id = ?', [$s['id']]);
            $db->exec('DELETE FROM push_subs WHERE session_id = ?', [$s['id']]);
        }
    }
    out();
}
