<?php
// Database access for SQLite, MySQL/MariaDB and PostgreSQL through PDO, with one portable schema.
declare(strict_types=1);

final class DB
{
    /** Column types: pk = string primary key, auto = auto-increment primary key, s<N> = varchar, t = text, i = int, b = bigint, f = 0/1 flag. */
    public const SCHEMA = [
        'users' => [
            'cols' => ['id' => 's40 pk', 'username' => 's32', 'email' => 's190 null', 'phone' => 's32 null', 'name' => 's80', 'bio' => 's200',
                'role' => 's16', 'status' => 's16', 'status_reason' => 's200', 'status_at' => 'b', 'pub_key' => 's64',
                'pw_salt' => 's64', 'pw_wrap' => 't', 'auth_hash' => 's128', 'rc_salt' => 's64', 'rc_wrap' => 't', 'rc_hash' => 's128',
                'vault' => 't', 'vault_ver' => 'i', 'avatar' => 's40 null', 'findable' => 'f', 'show_online' => 'f', 'receipts' => 'f',
                'phone_vis' => 's16', 'phone_shares' => 't', 'totp_secret' => 's64 null', 'totp_on' => 'f', 'backup_codes' => 't',
                'quota_mb' => 'i', 'invite' => 's40 null', 'created_at' => 'b', 'last_seen' => 'b', 'seq' => 'b'],
            'unique' => [['username']], 'index' => [['email'], ['phone'], ['seq']],
        ],
        'sessions' => [
            'cols' => ['id' => 's40 pk', 'user_id' => 's40', 'token_hash' => 's64', 'kind' => 's8', 'device' => 's80', 'ua' => 's300', 'ip' => 's45',
                'created_at' => 'b', 'last_seen' => 'b', 'expires_at' => 'b', 'revoked' => 'f', 'revoked_by' => 's16', 'mfa_until' => 'b'],
            'unique' => [['token_hash']], 'index' => [['user_id']],
        ],
        'chats' => [
            'cols' => ['id' => 's40 pk', 'type' => 's8', 'meta' => 't', 'created_by' => 's40', 'created_at' => 'b', 'last_at' => 'b',
                'seq' => 'b', 'invite_hash' => 's64 null', 'invite_wrap' => 't', 'size_bytes' => 'b'],
            'index' => [['invite_hash']],
        ],
        'members' => [
            'cols' => ['chat_id' => 's40', 'user_id' => 's40', 'role' => 's8', 'key_box' => 't', 'status' => 's8', 'joined_at' => 'b',
                'read_seq' => 'b', 'muted' => 'f', 'cleared_seq' => 'b', 'seq' => 'b'],
            'pk' => ['chat_id', 'user_id'], 'index' => [['user_id', 'status']],
        ],
        'messages' => [
            'cols' => ['id' => 'auto', 'chat_id' => 's40', 'sender_id' => 's40', 'kind' => 's8', 'ct' => 't', 'sys' => 't', 'client_id' => 's40',
                'created_at' => 'b', 'edited_at' => 'b', 'deleted' => 'f', 'hidden' => 'f', 'reports' => 'i', 'seq' => 'b', 'blob_ids' => 't'],
            'index' => [['chat_id', 'seq'], ['seq'], ['sender_id', 'created_at'], ['client_id']],
        ],
        'blobs' => [
            'cols' => ['id' => 's40 pk', 'owner_id' => 's40', 'size' => 'b', 'backend' => 's8', 'purpose' => 's8', 'created_at' => 'b'],
            'index' => [['owner_id']],
        ],
        'blob_refs' => [
            'cols' => ['blob_id' => 's40', 'chat_id' => 's40', 'msg_id' => 'b'],
            'pk' => ['blob_id', 'chat_id', 'msg_id'], 'index' => [['chat_id'], ['msg_id']],
        ],
        'invites' => [
            'cols' => ['code' => 's32 pk', 'label' => 's80', 'max_uses' => 'i', 'used' => 'i', 'expires_at' => 'b', 'quota_mb' => 'i',
                'approve' => 'f', 'preview' => 'f', 'created_by' => 's40', 'created_at' => 'b', 'revoked' => 'f'],
        ],
        'reports' => [
            'cols' => ['id' => 's16 pk', 'msg_id' => 'b', 'chat_id' => 's40', 'author_id' => 's40', 'reporter_id' => 's40', 'reason' => 's32',
                'note' => 's240', 'body' => 't', 'created_at' => 'b', 'status' => 's12', 'outcome' => 's120', 'resolved_by' => 's40', 'resolved_at' => 'b'],
            'index' => [['status']],
        ],
        'announcements' => [
            'cols' => ['id' => 'auto', 'body' => 's300', 'level' => 's8', 'publish_at' => 'b', 'created_by' => 's40', 'created_at' => 'b',
                'reach' => 'i', 'user_id' => 's40 null'],
            'index' => [['publish_at']],
        ],
        'audit' => [
            'cols' => ['id' => 'auto', 'at' => 'b', 'actor' => 's40', 'type' => 's16', 'action' => 's200', 'target' => 's120', 'ip' => 's45'],
            'index' => [['at']],
        ],
        'push_subs' => [
            'cols' => ['id' => 'auto', 'session_id' => 's40', 'user_id' => 's40', 'endpoint' => 's600', 'p256dh' => 's200', 'auth' => 's64',
                'created_at' => 'b', 'fails' => 'i'],
            'index' => [['user_id'], ['session_id']],
        ],
        'counters' => ['cols' => ['k' => 's32 pk', 'v' => 'b']],
        'stats' => ['cols' => ['bucket' => 'b', 'k' => 's16', 'v' => 'b'], 'pk' => ['bucket', 'k']],
        'logs' => ['cols' => ['id' => 'auto', 'at' => 'b', 'level' => 's8', 'msg' => 's500'], 'index' => [['at']]],
        'attempts' => ['cols' => ['k' => 's80', 'at' => 'b'], 'index' => [['k', 'at']]],
        'kv' => ['cols' => ['k' => 's64 pk', 'v' => 't']],
        'typing' => ['cols' => ['chat_id' => 's40', 'user_id' => 's40', 'exp_at' => 'b'], 'pk' => ['chat_id', 'user_id'], 'index' => [['exp_at']]],
    ];
    /** Bump when SCHEMA gains a table or index; installed servers add it on their next request. */
    public const SCHEMA_VERSION = 2;

    public string $dialect;
    private PDO $pdo;
    private int $txDepth = 0;
    private static ?DB $main = null;

    public function __construct(array $cfg)
    {
        $engine = $cfg['engine'] ?? 'sqlite';
        $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false];
        if ($engine === 'sqlite') {
            if (!extension_loaded('pdo_sqlite')) fail(500, 'db_driver', 'php extension pdo_sqlite is not installed');
            $path = $cfg['path'] ?: Config::dataDir() . '/chats.db';
            $dir = dirname($path);
            if (!is_dir($dir) && !@mkdir($dir, 0700, true)) fail(500, 'db_path', 'cannot create ' . $dir);
            $this->pdo = new PDO('sqlite:' . $path, null, null, $opts);
            $this->pdo->exec('PRAGMA busy_timeout = 5000');
            $this->pdo->exec('PRAGMA foreign_keys = ON');
            $this->pdo->exec(($cfg['wal'] ?? true) ? 'PRAGMA journal_mode = WAL' : 'PRAGMA journal_mode = DELETE');
            $this->pdo->exec('PRAGMA synchronous = NORMAL');
            $this->dialect = 'sqlite';
        } elseif ($engine === 'mysql') {
            if (!extension_loaded('pdo_mysql')) fail(500, 'db_driver', 'php extension pdo_mysql is not installed');
            $dsn = 'mysql:host=' . $cfg['host'] . ';port=' . ((int)$cfg['port'] ?: 3306) . ';dbname=' . $cfg['name'] . ';charset=utf8mb4';
            if (($cfg['ssl'] ?? 'disable') !== 'disable' && defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) {
                $opts[PDO::MYSQL_ATTR_SSL_CA] = '';
                $opts[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = $cfg['ssl'] === 'verify-full';
            }
            $this->pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], $opts);
            $this->pdo->exec("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE'");
            $this->dialect = 'mysql';
        } elseif ($engine === 'postgres') {
            if (!extension_loaded('pdo_pgsql')) fail(500, 'db_driver', 'php extension pdo_pgsql is not installed');
            $dsn = 'pgsql:host=' . $cfg['host'] . ';port=' . ((int)$cfg['port'] ?: 5432) . ';dbname=' . $cfg['name'] . ';sslmode=' . ($cfg['ssl'] ?? 'prefer');
            $this->pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], $opts);
            $this->dialect = 'pgsql';
        } else {
            fail(400, 'db_engine', 'unsupported database engine: ' . $engine);
        }
    }

    public static function main(): DB
    {
        if (self::$main === null) {
            if (!Config::installed()) fail(503, 'not_installed', 'server is not set up yet');
            self::$main = new DB(Config::get('db'));
            if ((int)(Config::all()['schemaVer'] ?? 1) < self::SCHEMA_VERSION) {
                self::$main->createSchema();
                $all = Config::all();
                $all['schemaVer'] = self::SCHEMA_VERSION;
                Config::save($all);
            }
        }
        return self::$main;
    }

    public static function setMain(DB $db): void { self::$main = $db; }

    public function version(): string
    {
        return match ($this->dialect) {
            'sqlite' => 'sqlite ' . $this->value('SELECT sqlite_version()'),
            'mysql' => 'mysql ' . $this->value('SELECT VERSION()'),
            default => 'postgresql ' . preg_replace('/^PostgreSQL ([\d.]+).*$/', '$1', (string)$this->value('SELECT version()')),
        };
    }

    // ---- schema

    private function colType(string $spec): string
    {
        $parts = explode(' ', $spec);
        $t = $parts[0];
        $null = in_array('null', $parts, true);
        if ($t === 'auto') {
            return match ($this->dialect) { 'sqlite' => 'INTEGER PRIMARY KEY AUTOINCREMENT', 'mysql' => 'BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY', default => 'BIGSERIAL PRIMARY KEY' };
        }
        $sql = match (true) {
            $t[0] === 's' => 'VARCHAR(' . (int)substr($t, 1) . ')',
            $t === 't' => $this->dialect === 'mysql' ? 'LONGTEXT' : 'TEXT',
            $t === 'i' => 'INTEGER',
            $t === 'b' => 'BIGINT',
            $t === 'f' => 'SMALLINT',
        };
        if (in_array('pk', $parts, true)) return $sql . ' NOT NULL PRIMARY KEY';
        if ($null) return $sql . ' NULL';
        if ($t === 't') return $sql . ($this->dialect === 'mysql' ? ' NULL' : " NOT NULL DEFAULT ''");
        return $sql . ' NOT NULL DEFAULT ' . ($t[0] === 's' ? "''" : '0');
    }

    public function createSchema(): void
    {
        foreach (self::SCHEMA as $table => $def) {
            $cols = [];
            foreach ($def['cols'] as $c => $spec) $cols[] = $c . ' ' . $this->colType($spec);
            if (!empty($def['pk'])) $cols[] = 'PRIMARY KEY (' . implode(', ', $def['pk']) . ')';
            $tail = $this->dialect === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin' : '';
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS $table (" . implode(', ', $cols) . ")$tail");
            foreach (['unique' => 'UNIQUE INDEX', 'index' => 'INDEX'] as $key => $kw) {
                foreach ($def[$key] ?? [] as $cols2) {
                    $name = 'ix_' . $table . '_' . implode('_', $cols2);
                    if ($this->dialect === 'mysql') {
                        if ($this->value('SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', [$table, $name])) continue;
                        $this->pdo->exec("CREATE $kw $name ON $table (" . implode(', ', $cols2) . ')');
                    } else {
                        $this->pdo->exec("CREATE $kw IF NOT EXISTS $name ON $table (" . implode(', ', $cols2) . ')');
                    }
                }
            }
        }
        if (!$this->value("SELECT COUNT(*) FROM counters WHERE k = 'seq'")) $this->insert('counters', ['k' => 'seq', 'v' => 0]);
    }

    /** Copy every row into another database (used when the admin switches engines). */
    public function copyTo(DB $target): array
    {
        $target->createSchema();
        $counts = [];
        $target->tx(function () use ($target, &$counts) {
            foreach (array_keys(self::SCHEMA) as $table) {
                $target->exec("DELETE FROM $table");
                $n = 0;
                $offset = 0;
                while ($rows = $this->all("SELECT * FROM $table ORDER BY 1 LIMIT 500 OFFSET $offset")) {
                    foreach ($rows as $r) { $target->insert($table, $r); $n++; }
                    $offset += 500;
                }
                $counts[$table] = $n;
            }
            if ($target->dialect === 'pgsql') {
                foreach (self::SCHEMA as $table => $def) {
                    if (($def['cols']['id'] ?? '') === 'auto') $target->exec("SELECT setval(pg_get_serial_sequence('$table', 'id'), COALESCE((SELECT MAX(id) FROM $table), 0) + 1, false)");
                }
            }
        });
        return $counts;
    }

    // ---- queries

    public function exec(string $sql, array $params = []): int
    {
        $st = $this->pdo->prepare($sql);
        $st->execute(array_values($params));
        return $st->rowCount();
    }

    public function all(string $sql, array $params = []): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute(array_values($params));
        return $st->fetchAll();
    }

    public function one(string $sql, array $params = []): ?array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute(array_values($params));
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    public function value(string $sql, array $params = [])
    {
        $st = $this->pdo->prepare($sql);
        $st->execute(array_values($params));
        $r = $st->fetchColumn();
        return $r === false ? null : $r;
    }

    public function insert(string $table, array $row): string
    {
        $cols = array_keys($row);
        $this->exec("INSERT INTO $table (" . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')', $row);
        if ((self::SCHEMA[$table]['cols']['id'] ?? '') === 'auto' && !isset($row['id'])) {
            return (string)$this->pdo->lastInsertId($this->dialect === 'pgsql' ? $table . '_id_seq' : null);
        }
        return (string)($row['id'] ?? '');
    }

    public function update(string $table, array $set, string $where, array $params = []): int
    {
        $parts = [];
        foreach (array_keys($set) as $c) $parts[] = "$c = ?";
        return $this->exec("UPDATE $table SET " . implode(', ', $parts) . " WHERE $where", array_merge(array_values($set), array_values($params)));
    }

    /** Insert-or-replace by primary key, portable across the three engines. */
    public function upsert(string $table, array $row, array $keys): void
    {
        $where = implode(' AND ', array_map(fn($k) => "$k = ?", $keys));
        $kv = array_map(fn($k) => $row[$k], $keys);
        $set = array_diff_key($row, array_flip($keys));
        if ($this->value("SELECT COUNT(*) FROM $table WHERE $where", $kv)) {
            if ($set) $this->update($table, $set, $where, $kv);
        } else {
            $this->insert($table, $row);
        }
    }

    public function in(array $values): string
    {
        return $values ? implode(', ', array_fill(0, count($values), '?')) : 'NULL';
    }

    public function tx(callable $fn)
    {
        if ($this->txDepth > 0) return $fn();
        $this->txDepth++;
        $this->pdo->beginTransaction();
        try {
            $r = $fn();
            $this->pdo->commit();
            return $r;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        } finally {
            $this->txDepth--;
        }
    }

    /** Monotonic change counter: every chat, message, member and profile change gets a new value, which clients sync from. */
    public function nextSeq(): int
    {
        return (int)$this->tx(function () {
            $this->exec("UPDATE counters SET v = v + 1 WHERE k = 'seq'");
            return $this->value("SELECT v FROM counters WHERE k = 'seq'");
        });
    }

    /** Call inside tx(): acquire the user write lock before taking a fresh snapshot on every PDO engine. */
    public function lockUser(string $uid): array
    {
        $this->exec('UPDATE users SET seq = seq WHERE id = ?', [$uid]);
        $u = $this->one('SELECT * FROM users WHERE id = ?', [$uid]);
        if (!$u) fail(404, 'no_user', 'account no longer exists');
        return $u;
    }

    public function kvGet(string $k, $default = null)
    {
        $v = $this->value('SELECT v FROM kv WHERE k = ?', [$k]);
        return $v === null ? $default : json_decode((string)$v, true);
    }

    public function kvSet(string $k, $v): void { $this->upsert('kv', ['k' => $k, 'v' => json_encode($v)], ['k']); }

    public function bump(string $k, int $by = 1): void
    {
        $bucket = intdiv(time(), 3600);
        if (!$this->exec('UPDATE stats SET v = v + ? WHERE bucket = ? AND k = ?', [$by, $bucket, $k])) {
            try { $this->insert('stats', ['bucket' => $bucket, 'k' => $k, 'v' => $by]); } catch (Throwable) { $this->exec('UPDATE stats SET v = v + ? WHERE bucket = ? AND k = ?', [$by, $bucket, $k]); }
        }
    }

    public function log(string $level, string $msg): void
    {
        try { $this->insert('logs', ['at' => time(), 'level' => $level, 'msg' => mb_substr_safe($msg, 500)]); } catch (Throwable) {}
    }

    /** Approximate on-disk size, for the health page. */
    public function sizeBytes(): int
    {
        try {
            return (int)match ($this->dialect) {
                'sqlite' => (int)$this->value('PRAGMA page_count') * (int)$this->value('PRAGMA page_size'),
                'mysql' => $this->value('SELECT SUM(data_length + index_length) FROM information_schema.tables WHERE table_schema = DATABASE()'),
                default => $this->value('SELECT pg_database_size(current_database())'),
            };
        } catch (Throwable) { return 0; }
    }
}
