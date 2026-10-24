<?php
// Web Push: VAPID (ES256) authentication and RFC 8291 "aes128gcm" payload encryption, using only openssl.
declare(strict_types=1);

final class Push
{
    private const SPKI_P256 = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

    /** Only browser push services (or explicitly operator-approved hosts), never arbitrary user URLs. */
    public static function validEndpoint(string $endpoint): bool
    {
        if (preg_match('/[\x00-\x20\x7f\\\\]/', $endpoint)) return false;
        $u = parse_url($endpoint);
        if (!$u || ($u['scheme'] ?? '') !== 'https' || isset($u['user']) || isset($u['pass']) || isset($u['fragment'])
            || (isset($u['port']) && $u['port'] !== 443)) return false;
        $host = strtolower($u['host'] ?? '');
        if (!preg_match('/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/', $host)) return false;
        $extra = array_filter(array_map('trim', explode(',', getenv('CHATS_PUSH_HOSTS') ?: '')));
        return in_array($host, array_merge(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'], $extra), true)
            || (strlen($host) > strlen('.notify.windows.com') && str_ends_with($host, '.notify.windows.com'));
    }

    public static function publicAddress(string $ip): bool
    {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
        if (str_contains($ip, ':')) {
            // Global unicast only; excludes mapped IPv4, multicast, ULA and link-local representations.
            $raw = inet_pton($ip);
            return $raw !== false && (ord($raw[0]) & 0xe0) === 0x20
                && !in_array(substr($raw, 0, 4), [hex2bin('20010000'), hex2bin('20010db8')], true)
                && substr($raw, 0, 2) !== hex2bin('2002');
        }
        foreach (['100.64.0.0/10', '192.0.0.0/24', '192.0.2.0/24', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4'] as $range) {
            if (ip_in_cidr($ip, $range)) return false;
        }
        return true;
    }

    private static function endpointPin(string $endpoint): array
    {
        if (!self::validEndpoint($endpoint)) throw new RuntimeException('unsupported push endpoint');
        $host = strtolower(parse_url($endpoint, PHP_URL_HOST));
        $records = dns_get_record($host, DNS_A | DNS_AAAA);
        $ips = [];
        foreach ($records ?: [] as $r) {
            $ip = $r['ip'] ?? $r['ipv6'] ?? null;
            if ($ip === null) continue;
            if (!self::publicAddress($ip)) throw new RuntimeException('push endpoint resolves to a non-public address');
            $ips[] = $ip;
        }
        if (!$ips) throw new RuntimeException('push endpoint has no public address');
        return ['host' => $host, 'ip' => $ips[0]];
    }

    /** @return array{0:string,1:string} [private key PEM, public key (uncompressed point, base64url)] */
    public static function generateKeys(): array
    {
        $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if (!$k) return ['', ''];
        openssl_pkey_export($k, $pem);
        return [$pem, b64url(self::rawPublic($k))];
    }

    private static function rawPublic($key): string
    {
        $d = openssl_pkey_get_details($key)['ec'];
        return "\x04" . str_pad($d['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['y'], 32, "\0", STR_PAD_LEFT);
    }

    private static function publicFromRaw(string $raw)
    {
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode(hex2bin(self::SPKI_P256) . $raw), 64, "\n") . "-----END PUBLIC KEY-----\n";
        return @openssl_pkey_get_public($pem);
    }

    private static function hkdf(string $salt, string $ikm, string $info, int $len): string
    {
        $prk = hash_hmac('sha256', $ikm, $salt, true);
        return substr(hash_hmac('sha256', $info . "\x01", $prk, true), 0, $len);
    }

    private static function derToRaw(string $der): string
    {
        // SEQUENCE { INTEGER r, INTEGER s } → r || s (32 bytes each)
        $pos = 2;
        $out = '';
        for ($i = 0; $i < 2; $i++) {
            $len = ord($der[$pos + 1]);
            $int = substr($der, $pos + 2, $len);
            $out .= str_pad(ltrim($int, "\0"), 32, "\0", STR_PAD_LEFT);
            $pos += 2 + $len;
        }
        return $out;
    }

    private static function vapidHeader(string $endpoint, array $keys, string $subject): string
    {
        $u = parse_url($endpoint);
        $aud = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
        $data = b64url(json_encode(['typ' => 'JWT', 'alg' => 'ES256'])) . '.' . b64url(json_encode(['aud' => $aud, 'exp' => time() + 43200, 'sub' => $subject]));
        openssl_sign($data, $der, $keys['vapidPriv'], OPENSSL_ALGO_SHA256);
        return 'vapid t=' . $data . '.' . b64url(self::derToRaw($der)) . ', k=' . $keys['vapidPub'];
    }

    /** A browser subscription key: an uncompressed P-256 point and a 16-byte auth secret. */
    public static function validKeys(string $p256dh, string $auth): bool
    {
        return strlen($p256dh) === 65 && $p256dh[0] === "\x04" && strlen($auth) === 16 && self::publicFromRaw($p256dh) !== false;
    }

    public static function encrypt(string $payload, string $uaPublic, string $authSecret): string
    {
        if (!self::validKeys($uaPublic, $authSecret)) throw new InvalidArgumentException('invalid subscription keys');
        $eph = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        $asPublic = self::rawPublic($eph);
        $shared = openssl_pkey_derive(self::publicFromRaw($uaPublic), $eph, 32);
        if ($shared === false) throw new RuntimeException('ecdh failed');
        $ikm = self::hkdf($authSecret, $shared, "WebPush: info\0" . $uaPublic . $asPublic, 32);
        $salt = random_bytes(16);
        $cek = self::hkdf($salt, $ikm, "Content-Encoding: aes128gcm\0", 16);
        $nonce = self::hkdf($salt, $ikm, "Content-Encoding: nonce\0", 12);
        $ct = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
        return $salt . pack('N', 4096) . chr(65) . $asPublic . $ct . $tag;
    }

    /** Sends one push. Returns the HTTP status (0 when unreachable). */
    public static function send(array $sub, array $payload, int $ttl = 86400): int
    {
        // Recheck stored subscriptions and pin the validated DNS result at the connection boundary.
        if (!self::validEndpoint($sub['endpoint'])) return 410;
        // A subscription whose keys can't be used never will be; 410 prunes it instead of failing every fan-out.
        try { $body = self::encrypt(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), unb64($sub['p256dh'] ?? ''), unb64($sub['auth'] ?? '')); } catch (Throwable) { return 410; }
        try { $pin = self::endpointPin($sub['endpoint']); } catch (Throwable) { return 0; }
        $keys = Config::keys();
        if (empty($keys['vapidPriv'])) return 0;
        $host = Config::server('name') ?: 'localhost';
        $headers = [
            'Authorization: ' . self::vapidHeader($sub['endpoint'], $keys, 'mailto:admin@' . $host),
            'Content-Encoding: aes128gcm', 'Content-Type: application/octet-stream', 'TTL: ' . $ttl, 'Urgency: high',
            'Content-Length: ' . strlen($body),
        ];
        try { return http_request('POST', $sub['endpoint'], $headers, $body, 6, $pin)[0]; } catch (Throwable) { return 0; }
    }

    /** Fan out to every subscription of the given users; prunes dead endpoints. */
    public static function toUsers(DB $db, array $userIds, array $payload): void
    {
        if (!$userIds || (int)$db->kvGet('push_pause_until', 0) > now()) return;
        $subs = $db->all('SELECT * FROM push_subs WHERE user_id IN (' . $db->in($userIds) . ')', $userIds);
        $tried = $down = 0;
        foreach ($subs as $s) {
            try { $st = self::send($s, $payload); } catch (Throwable) { $st = 0; }
            $tried++;
            if ($st === 0) $down++;
            if ($st === 404 || $st === 410) {
                $db->exec('DELETE FROM push_subs WHERE id = ?', [$s['id']]);
            } elseif ($st < 200 || $st >= 300) {
                $db->exec('UPDATE push_subs SET fails = fails + 1 WHERE id = ?', [$s['id']]);
                $db->bump('push_fail');
                $db->log('WARN', 'push: ' . parse_url($s['endpoint'], PHP_URL_HOST) . ' returned ' . $st);
            } else {
                $db->exec('UPDATE push_subs SET fails = 0 WHERE id = ?', [$s['id']]);
            }
        }
        if (!$tried) return;
        // When no push service answers (typically because only the domestic internet works), every send would wait for
        // connection timeouts. After two such rounds in a row, stop trying for 10 minutes; messages themselves are unaffected.
        $streak = $down === $tried ? (int)$db->kvGet('push_down_streak', 0) + 1 : 0;
        if ($streak >= 2) {
            $db->kvSet('push_pause_until', now() + 600);
            $db->log('WARN', 'push: no push service reachable · paused for 10 minutes');
            $streak = 0;
        }
        $db->kvSet('push_down_streak', $streak);
    }
}
