<?php
// Server configuration: one JSON file in the data directory, written by the setup wizard and the admin console.
declare(strict_types=1);

const CHATS_VERSION = 'v2.6.1';
/** Wire protocol: bump only for breaking API changes. Clients refuse servers with a protocol they don't speak. */
const CHATS_PROTOCOL = 1;

final class Config
{
    /** Settings the admin console edits (names match the console's form fields). */
    public const SERVER_DEFAULTS = [
        'name' => '', 'welcome' => 'welcome to CHATS. be kind, keep it encrypted.', 'reg' => 'invite',
        'upload' => '25', 'group' => '200', 'rate' => '30', 'theme' => 'green', 'quota' => '500',
        'maint' => false, 'maintMsg' => 'upgrading — back in about 15 minutes.',
        'emailField' => 'off', 'phoneField' => 'off', 'reporting' => true, 'reportHide' => '3',
        'capEdit' => true, 'editWindow' => '60', 'capDelete' => true, 'capForward' => true, 'capAttach' => true, 'capGroups' => true,
        'tfaUsers' => 'optional', 'tfaAdmins' => 'optional', 'tfaBackup' => true, 'tfaEmail' => false, 'tfaRemember' => '30',
        // Where the chat app lives when it isn't next to this API (split deployments); invite links point there.
        'clientUrl' => '',
    ];
    public const DB_DEFAULTS = [
        'engine' => 'sqlite', 'path' => '', 'wal' => true,
        'host' => 'localhost', 'port' => '5432', 'name' => 'chats', 'user' => 'chats', 'pass' => '', 'ssl' => 'disable', 'pool' => '10',
    ];
    public const STORAGE_DEFAULTS = [
        'backend' => 'local', 'path' => '',
        's3Provider' => 'minio', 'endpoint' => '', 'region' => 'us-east-1', 'bucket' => '', 'key' => '', 'secret' => '', 'pathStyle' => true,
    ];
    /**
     * Database and storage settings given by the environment (Docker, compose). They pre-fill the setup wizard;
     * passwords and secret keys never leave the server and are filled back in when setup tests or launches with them.
     */
    public static function envPreset(): array
    {
        $env = fn($k) => ($v = getenv($k)) === false ? null : (string)$v;
        $out = [];
        if ($env('CHATS_DB_ENGINE') !== null) {
            $out['db'] = array_filter(['engine' => $env('CHATS_DB_ENGINE'), 'host' => $env('CHATS_DB_HOST'), 'port' => $env('CHATS_DB_PORT'),
                'name' => $env('CHATS_DB_NAME'), 'user' => $env('CHATS_DB_USER'), 'pass' => $env('CHATS_DB_PASS'), 'path' => $env('CHATS_DB_PATH')], fn($v) => $v !== null);
        }
        if ($env('CHATS_S3_BUCKET') !== null) {
            $out['storage'] = array_filter(['backend' => 's3', 's3Provider' => 'other', 'endpoint' => $env('CHATS_S3_ENDPOINT'), 'region' => $env('CHATS_S3_REGION'),
                'bucket' => $env('CHATS_S3_BUCKET'), 'key' => $env('CHATS_S3_KEY'), 'secret' => $env('CHATS_S3_SECRET'),
                'pathStyle' => $env('CHATS_S3_PATH_STYLE') === null ? null : filter_var($env('CHATS_S3_PATH_STYLE'), FILTER_VALIDATE_BOOLEAN)], fn($v) => $v !== null);
        }
        return $out;
    }

    public const SMTP_DEFAULTS = [
        'on' => false, 'host' => '', 'port' => '587', 'sec' => 'starttls', 'user' => '', 'pass' => '', 'fromName' => 'CHATS', 'from' => '',
    ];

    private static ?array $data = null;

    public static function dataDir(): string
    {
        $dir = defined('CHATS_DATA') ? CHATS_DATA : (getenv('CHATS_DATA') ?: CHATS_ROOT . '/data');
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) fail(500, 'data_dir', 'cannot create data directory ' . $dir);
        if (!is_file($dir . '/.htaccess')) {
            @file_put_contents($dir . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
        }
        return $dir;
    }

    private static function file(): string { return self::dataDir() . '/config.json'; }

    public static function installed(): bool { return (bool)(self::all()['installed'] ?? false); }

    public static function all(): array
    {
        if (self::$data === null) {
            $raw = @file_get_contents(self::file());
            self::$data = $raw ? (json_decode($raw, true) ?: []) : [];
        }
        return self::$data;
    }

    public static function get(string $section): array
    {
        $defaults = match ($section) {
            'server' => self::SERVER_DEFAULTS, 'db' => self::DB_DEFAULTS, 'storage' => self::STORAGE_DEFAULTS, 'smtp' => self::SMTP_DEFAULTS, default => [],
        };
        return (self::all()[$section] ?? []) + $defaults;
    }

    public static function server(string $key)
    {
        return self::get('server')[$key];
    }

    public static function set(string $section, array $values): void
    {
        $all = self::all();
        $all[$section] = $values;
        self::save($all);
    }

    public static function save(array $all): void
    {
        $tmp = self::file() . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($tmp, json_encode($all, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) === false || !rename($tmp, self::file())) {
            fail(500, 'config_write', 'cannot write ' . self::file());
        }
        @chmod(self::file(), 0600);
        self::$data = $all;
    }

    /** Long-lived server secrets, created on first use. */
    public static function keys(): array
    {
        $all = self::all();
        $k = $all['keys'] ?? [];
        $changed = false;
        if (empty($k['secret'])) { $k['secret'] = b64(random_bytes(32)); $changed = true; }
        if (empty($k['vapidPriv'])) {
            [$priv, $pub] = Push::generateKeys();
            $k['vapidPriv'] = $priv;
            $k['vapidPub'] = $pub;
            $changed = true;
        }
        if (empty($k['identity'])) { $k['identity'] = b64(random_bytes(32)); $changed = true; }
        if (empty($k['installedAt'])) { $k['installedAt'] = time(); $changed = true; }
        if ($changed) {
            $all['keys'] = $k;
            if (self::installed() || is_file(self::file())) self::save($all);
            else self::$data = $all;
        }
        return $k;
    }

    /** SHA-256 over the server identity key, shown to users so they can compare it with their admin. */
    public static function fingerprint(): string
    {
        $h = strtoupper(bin2hex(substr(hash('sha256', 'chats-identity:' . self::keys()['identity'], true), 0, 16)));
        $pairs = str_split($h, 2);
        return implode(':', array_slice($pairs, 0, 8)) . ' · ' . implode(':', array_slice($pairs, 8, 8));
    }

    public static function secret(): string { return unb64(self::keys()['secret']); }

    public static function caps(): array
    {
        $s = self::get('server');
        return ['edit' => (bool)$s['capEdit'], 'editWindow' => (string)$s['editWindow'], 'delete' => (bool)$s['capDelete'], 'forward' => (bool)$s['capForward'],
            'attach' => (bool)$s['capAttach'], 'groups' => (bool)$s['capGroups'], 'report' => (bool)$s['reporting']];
    }
}
