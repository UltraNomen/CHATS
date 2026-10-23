<?php
// Shared helpers: JSON I/O, errors, ids, validation, base64url.
declare(strict_types=1);

final class HttpError extends RuntimeException
{
    public function __construct(public int $status, public string $codeName, string $message = '', public array $extra = [])
    {
        parent::__construct($message !== '' ? $message : $codeName);
    }
}

/** Abort the request with a machine-readable error code and a human message. */
function fail(int $status, string $code, string $message = '', array $extra = []): never
{
    throw new HttpError($status, $code, $message, $extra);
}

function out(array $data = [], int $status = 200): never
{
    http_response_code($status);
    $body = json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('Content-Length: ' . strlen($body));
    echo $body;
    run_deferred();
    exit;
}

/** Work that runs after the response is sent (push fan-out, daily backup). */
function defer(callable $fn): void { $GLOBALS['__deferred'][] = $fn; }

function run_deferred(): void
{
    $tasks = $GLOBALS['__deferred'] ?? [];
    if (!$tasks) return;
    $GLOBALS['__deferred'] = [];
    if (function_exists('ignore_user_abort')) ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    else { while (ob_get_level()) ob_end_flush(); flush(); }
    if (function_exists('set_time_limit')) @set_time_limit(300);
    foreach ($tasks as $t) {
        try { $t(); } catch (Throwable $e) { error_log('chats deferred: ' . $e->getMessage()); }
    }
}

function input(): array
{
    static $in = null;
    if ($in === null) {
        $raw = (string)file_get_contents('php://input');
        $in = $raw !== '' && str_starts_with((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') ? json_decode($raw, true) : null;
        if (!is_array($in)) $in = $_POST ?: [];
    }
    return $in;
}

function arg(string $key, $default = null)
{
    $in = input();
    return array_key_exists($key, $in) ? $in[$key] : ($_GET[$key] ?? $default);
}

/** A trimmed, control-character-free string of at most $max characters. */
function str_arg(string $key, int $max, bool $multiline = false, string $default = ''): string
{
    return clean_str(arg($key, $default), $max, $multiline);
}

function clean_str($s, int $max, bool $multiline = false): string
{
    if (!is_string($s) && !is_int($s)) return '';
    $s = preg_replace($multiline ? '/[\x00-\x09\x0B-\x1F\x7F]/u' : '/[\x00-\x1F\x7F]/u', '', (string)$s) ?? '';
    $s = trim($s);
    return mb_substr_safe($s, $max);
}

function mb_substr_safe(string $s, int $max): string
{
    return preg_match('/^.{0,' . $max . '}/su', $s, $m) ? $m[0] : '';
}

function int_arg(string $key, int $default = 0, int $min = PHP_INT_MIN, int $max = PHP_INT_MAX): int
{
    $v = arg($key, $default);
    $v = is_numeric($v) ? (int)$v : $default;
    return max($min, min($max, $v));
}

function bool_arg(string $key, bool $default = false): bool
{
    $v = arg($key, $default);
    return $v === true || $v === 1 || $v === '1' || $v === 'true';
}

function new_id(string $prefix, int $bytes = 8): string
{
    return $prefix . bin2hex(random_bytes($bytes));
}

function b64(string $bin): string { return base64_encode($bin); }

function unb64(?string $s): string
{
    if ($s === null) return '';
    $r = base64_decode(strtr($s, '-_', '+/'), true);
    return $r === false ? '' : $r;
}

function b64url(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }

/** Ciphertext / key blobs from clients are base64 strings with a sane size cap. */
function blob_arg(string $key, int $maxBytes, bool $required = true): ?string
{
    $v = arg($key);
    if ($v === null || $v === '') {
        if ($required) fail(400, 'bad_request', "missing $key");
        return null;
    }
    if (!is_string($v) || strlen($v) > (int)ceil($maxBytes * 4 / 3) + 8 || !preg_match('/^[A-Za-z0-9+\/=_-]+$/', $v)) fail(400, 'bad_request', "bad $key");
    return $v;
}

function valid_username(string $u): bool { return (bool)preg_match('/^[a-z][a-z0-9_]{2,31}$/', $u); }

function now(): int { return time(); }

function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }

function ip_in_cidr(string $ip, string $cidr): bool
{
    [$net, $bits] = array_pad(explode('/', $cidr, 2), 2, '32');
    $ipL = ip2long($ip);
    $netL = ip2long($net);
    if ($ipL === false || $netL === false) return false;
    $bits = max(0, min(32, (int)$bits));
    $mask = $bits === 0 ? 0 : (~0 << (32 - $bits)) & 0xFFFFFFFF;
    return ($ipL & $mask) === ($netL & $mask);
}

function ua_summary(string $ua): array
{
    $ua = substr($ua, 0, 300);
    $browser = match (true) {
        str_contains($ua, 'Edg/') => 'edge',
        str_contains($ua, 'Firefox/') => 'firefox',
        str_contains($ua, 'Chrome/') => 'chrome',
        str_contains($ua, 'Safari/') => 'safari',
        default => 'browser',
    };
    $os = match (true) {
        str_contains($ua, 'iPhone') => 'ios',
        str_contains($ua, 'iPad') => 'ipados',
        str_contains($ua, 'Android') => 'android',
        str_contains($ua, 'Mac OS X') => 'macos',
        str_contains($ua, 'Windows') => 'windows',
        str_contains($ua, 'Linux') => 'linux',
        default => 'unknown',
    };
    return [$browser, $os];
}

function fmt_bytes(int $b): string
{
    if ($b >= 1073741824) return round($b / 1073741824, 1) . ' GB';
    if ($b >= 1048576) return round($b / 1048576, 1) . ' MB';
    if ($b >= 1024) return round($b / 1024, 1) . ' KB';
    return $b . ' B';
}

/** Free space on the volume holding $dir, or null when the host disables disk_free_space() (common on shared hosting). */
function free_bytes(string $dir): ?int
{
    if (!function_exists('disk_free_space')) return null;
    $f = @disk_free_space(is_dir($dir) ? $dir : dirname($dir));
    return $f === false ? null : (int)$f;
}

/**
 * Outgoing HTTP request. Uses cURL when it is installed and falls back to PHP streams, so it works on hosts that turn off
 * allow_url_fopen (common on cPanel) as well as on minimal PHP builds without cURL. $headers are "Name: value" lines.
 * Returns [status, body]; status 0 means the host could not be reached.
 */
function http_request(string $method, string $url, array $headers = [], string $body = '', int $timeout = 30, ?array $pin = null): array
{
    if ($pin !== null && (parse_url($url, PHP_URL_SCHEME) !== 'https' || strtolower((string)parse_url($url, PHP_URL_HOST)) !== $pin['host']
        || !filter_var($pin['ip'], FILTER_VALIDATE_IP))) throw new RuntimeException('invalid pinned HTTPS destination');
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => array_merge($headers, ['Expect:']),
            CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => min(10, $timeout), CURLOPT_FOLLOWLOCATION => false]);
        if ($method !== 'GET' && $method !== 'HEAD') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        if ($method === 'HEAD') curl_setopt($ch, CURLOPT_NOBODY, true);
        if ($pin !== null) {
            $ip = str_contains($pin['ip'], ':') ? '[' . $pin['ip'] . ']' : $pin['ip'];
            curl_setopt_array($ch, [CURLOPT_RESOLVE => [$pin['host'] . ':443:' . $ip], CURLOPT_PROXY => '', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
        }
        $resp = curl_exec($ch);
        $status = $resp === false ? 0 : (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$status, $resp === false ? '' : (string)$resp];
    }
    if (!filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) throw new RuntimeException('outgoing http needs the curl extension or allow_url_fopen');
    $ssl = [];
    if ($pin !== null) {
        $u = parse_url($url);
        $address = str_contains($pin['ip'], ':') ? '[' . $pin['ip'] . ']' : $pin['ip'];
        $headers[] = 'Host: ' . $pin['host'];
        $url = 'https://' . $address . ($u['path'] ?? '/') . (isset($u['query']) ? '?' . $u['query'] : '');
        $ssl = ['peer_name' => $pin['host'], 'SNI_enabled' => true, 'verify_peer' => true, 'verify_peer_name' => true];
    }
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body,
        'ignore_errors' => true, 'timeout' => $timeout, 'protocol_version' => 1.1, 'follow_location' => 0], 'ssl' => $ssl]);
    $resp = @file_get_contents($url, false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $status = (int)$m[1];
    return [$status, $resp === false ? '' : $resp];
}
