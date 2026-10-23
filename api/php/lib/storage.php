<?php
// Encrypted blob storage: a local directory or any S3-compatible bucket (AWS SigV4, no SDK).
declare(strict_types=1);

abstract class Storage
{
    abstract public function put(string $id, string $data): void;
    abstract public function get(string $id): ?string;
    abstract public function delete(string $id): void;
    abstract public function describe(): string;

    /** The backend new uploads go to. */
    public static function active(): Storage { return self::for(Config::get('storage')['backend']); }

    /** The backend for a config, or the active config when none is given (used by "test storage"). */
    public static function for(string $backend, ?array $cfg = null): Storage
    {
        $cfg ??= Config::get('storage');
        return $backend === 's3' ? new S3Storage($cfg) : new LocalStorage($cfg['path'] ?: Config::dataDir() . '/blobs');
    }

    /**
     * Each blob records the location it was written to: 'l' or 's' plus a short hash of the directory or endpoint + bucket.
     * Locations the admin switched away from are kept in config.json so older blobs stay readable.
     */
    public static function tag(array $cfg): string
    {
        $where = $cfg['backend'] === 's3' ? rtrim($cfg['endpoint'] ?: 'https://s3.amazonaws.com', '/') . '|' . $cfg['bucket'] : ($cfg['path'] ?: Config::dataDir() . '/blobs');
        return ($cfg['backend'] === 's3' ? 's' : 'l') . substr(hash('sha256', $where), 0, 7);
    }

    /** The storage a blob lives in, from the tag stored with it ('local' / 's3' are rows written before tags). */
    public static function at(string $tag): Storage
    {
        $cur = Config::get('storage');
        if ($tag === self::tag($cur) || $tag === $cur['backend']) return self::for($cur['backend'], $cur);
        $old = Config::all()['storageLocations'] ?? [];
        if (isset($old[$tag])) return self::for($old[$tag]['backend'], $old[$tag]);
        foreach (array_reverse($old) as $c) if ($c['backend'] === $tag) return self::for($c['backend'], $c);
        throw new RuntimeException('unknown storage location ' . $tag);
    }

    /** put → get → delete round trip, for the admin's "test storage" button. */
    public function test(): array
    {
        $id = 'probe-' . bin2hex(random_bytes(6));
        $data = random_bytes(64);
        $t0 = microtime(true);
        try {
            $this->put($id, $data);
            $ok = $this->get($id) === $data;
            $this->delete($id);
        } catch (Throwable $e) {
            return [false, '[FAIL] ' . $e->getMessage()];
        }
        $ms = (int)round((microtime(true) - $t0) * 1000);
        return $ok ? [true, '[ OK ] put / get / delete on ' . $this->describe() . ' · ' . $ms . ' ms'] : [false, '[FAIL] read back different data'];
    }
}

final class LocalStorage extends Storage
{
    public function __construct(private string $dir) {}

    private function path(string $id): string
    {
        if (!preg_match('/^[A-Za-z0-9_-]{6,64}$/', $id)) throw new RuntimeException('bad blob id');
        return $this->dir . '/' . substr($id, -2) . '/' . $id;
    }

    public function put(string $id, string $data): void
    {
        $p = $this->path($id);
        if (!is_dir(dirname($p)) && !@mkdir(dirname($p), 0700, true) && !is_dir(dirname($p))) throw new RuntimeException($this->dir . ' is not writable');
        $tmp = $p . '.tmp';
        if (file_put_contents($tmp, $data) === false || !rename($tmp, $p)) throw new RuntimeException('write failed in ' . $this->dir);
    }

    public function get(string $id): ?string
    {
        $r = @file_get_contents($this->path($id));
        return $r === false ? null : $r;
    }

    public function delete(string $id): void { @unlink($this->path($id)); }

    public function describe(): string { return $this->dir; }

    public function freeBytes(): ?int
    {
        return free_bytes($this->dir);
    }
}

final class S3Storage extends Storage
{
    private string $endpoint, $region, $bucket, $key, $secret;
    private bool $pathStyle;

    public function __construct(array $cfg)
    {
        $this->endpoint = rtrim($cfg['endpoint'] ?: 'https://s3.amazonaws.com', '/');
        $this->region = $cfg['region'] ?: 'us-east-1';
        $this->bucket = $cfg['bucket'];
        $this->key = $cfg['key'];
        $this->secret = $cfg['secret'];
        $this->pathStyle = (bool)$cfg['pathStyle'];
        if ($this->bucket === '') throw new RuntimeException('bucket is empty');
        if ($this->key === '' || $this->secret === '') throw new RuntimeException('missing access key or secret');
    }

    public function describe(): string { return $this->bucket; }

    private function request(string $method, string $id, string $body = ''): array
    {
        $u = parse_url($this->endpoint);
        $scheme = $u['scheme'] ?? 'https';
        $host = $u['host'] ?? '';
        if (isset($u['port'])) $host .= ':' . $u['port'];
        $basePath = rtrim($u['path'] ?? '', '/');
        $objectPath = '/' . rawurlencode($id);
        if ($this->pathStyle) {
            $path = $basePath . '/' . rawurlencode($this->bucket) . $objectPath;
        } else {
            $host = $this->bucket . '.' . $host;
            $path = $basePath . $objectPath;
        }
        $amzDate = gmdate('Ymd\THis\Z');
        $date = substr($amzDate, 0, 8);
        $payloadHash = hash('sha256', $body);
        $headers = ['host' => $host, 'x-amz-content-sha256' => $payloadHash, 'x-amz-date' => $amzDate];
        if ($method === 'PUT') $headers['content-type'] = 'application/octet-stream';
        ksort($headers);
        $canonHeaders = '';
        foreach ($headers as $k => $v) $canonHeaders .= $k . ':' . trim($v) . "\n";
        $signed = implode(';', array_keys($headers));
        $canon = "$method\n$path\n\n$canonHeaders\n$signed\n$payloadHash";
        $scope = "$date/{$this->region}/s3/aws4_request";
        $toSign = "AWS4-HMAC-SHA256\n$amzDate\n$scope\n" . hash('sha256', $canon);
        $k = hash_hmac('sha256', $date, 'AWS4' . $this->secret, true);
        $k = hash_hmac('sha256', $this->region, $k, true);
        $k = hash_hmac('sha256', 's3', $k, true);
        $k = hash_hmac('sha256', 'aws4_request', $k, true);
        $sig = hash_hmac('sha256', $toSign, $k);
        $headers['authorization'] = "AWS4-HMAC-SHA256 Credential={$this->key}/$scope, SignedHeaders=$signed, Signature=$sig";
        $lines = [];
        foreach ($headers as $hk => $hv) if ($hk !== 'host') $lines[] = $hk . ': ' . $hv;
        $lines[] = 'Content-Length: ' . strlen($body);
        [$status, $resp] = http_request($method, "$scheme://$host$path", $lines, $body, 30);
        if ($status === 0) throw new RuntimeException('cannot reach ' . $this->endpoint);
        return [$status, $resp];
    }

    private static function s3Error(int $status, string $body): string
    {
        if (preg_match('#<Code>([^<]+)</Code>#', $body, $m)) return $m[1] . ' (' . $status . ')';
        return 'http ' . $status;
    }

    public function put(string $id, string $data): void
    {
        [$st, $body] = $this->request('PUT', $id, $data);
        if ($st >= 300) throw new RuntimeException('put failed: ' . self::s3Error($st, $body));
    }

    public function get(string $id): ?string
    {
        [$st, $body] = $this->request('GET', $id);
        if ($st === 404) return null;
        if ($st >= 300) throw new RuntimeException('get failed: ' . self::s3Error($st, $body));
        return $body;
    }

    public function delete(string $id): void
    {
        [$st, $body] = $this->request('DELETE', $id);
        if ($st >= 300 && $st !== 404) throw new RuntimeException('delete failed: ' . self::s3Error($st, $body));
    }
}
