<?php
// RFC 6238 time-based one-time codes (SHA1, 6 digits, 30 s) with base32 secrets.
declare(strict_types=1);

final class Totp
{
    private const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function newSecret(): string
    {
        $bytes = random_bytes(20);
        $bits = '';
        foreach (str_split($bytes) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        $out = '';
        foreach (str_split($bits, 5) as $chunk) $out .= self::B32[bindec(str_pad($chunk, 5, '0'))];
        return $out;
    }

    private static function decode(string $b32): string
    {
        $b32 = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $b32));
        $bits = '';
        foreach (str_split($b32) as $c) $bits .= str_pad(decbin(strpos(self::B32, $c)), 5, '0', STR_PAD_LEFT);
        $out = '';
        foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
        return $out;
    }

    public static function code(string $secret, int $counter): string
    {
        $h = hash_hmac('sha1', pack('J', $counter), self::decode($secret), true);
        $o = ord($h[19]) & 0xf;
        $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
        return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
    }

    /** Accepts the current code and one step either side for clock drift. */
    public static function verify(string $secret, string $code): bool
    {
        if (!preg_match('/^\d{6}$/', $code)) return false;
        $t = intdiv(time(), 30);
        foreach ([0, -1, 1] as $d) if (hash_equals(self::code($secret, $t + $d), $code)) return true;
        return false;
    }

    public static function uri(string $secret, string $account, string $issuer): string
    {
        return 'otpauth://totp/' . rawurlencode($issuer . ':' . $account) . '?secret=' . $secret . '&issuer=' . rawurlencode($issuer) . '&algorithm=SHA1&digits=6&period=30';
    }

    /** "JBSW Y3DP …" groups of four, as shown in the console. */
    public static function pretty(string $secret): string { return trim(chunk_split($secret, 4, ' ')); }

    public static function backupCodes(): array
    {
        $a = 'abcdefghjkmnpqrstuvwxyz23456789';
        $codes = [];
        for ($i = 0; $i < 8; $i++) {
            $c = '';
            for ($j = 0; $j < 8; $j++) $c .= $a[random_int(0, strlen($a) - 1)];
            $codes[] = substr($c, 0, 4) . '-' . substr($c, 4);
        }
        return $codes;
    }
}
