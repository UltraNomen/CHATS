<?php
// Admin console routes. Every mutation is written to the append-only audit log.
declare(strict_types=1);

const STAFF = ['owner', 'admin', 'moderator'];
const ADMINS = ['owner', 'admin'];

function admin_user_row(array $u): array
{
    return ['id' => $u['id'], 'name' => $u['username'], 'display' => $u['name'], 'role' => $u['role'], 'status' => $u['status'], 'created' => (int)$u['created_at'],
        'seen' => (int)$u['last_seen'], 'bytes' => (int)($u['bytes'] ?? 0), 'chats' => (int)($u['nchats'] ?? 0), 'quota' => quota_bytes($u),
        'customQuota' => (int)$u['quota_mb'], 'mfa' => (bool)$u['totp_on'], 'email' => $u['email'] ?? '', 'phone' => $u['phone'] ?? '', 'reason' => $u['status_reason']];
}

function r_admin_overview(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $day = strtotime('today UTC');
    $users = (int)$db->value("SELECT COUNT(*) FROM users");
    $week = (int)$db->value('SELECT COUNT(*) FROM users WHERE created_at > ?', [now() - 7 * 86400]);
    $online = (int)$db->value('SELECT COUNT(*) FROM users WHERE last_seen > ?', [now() - 60]);
    $today = (int)$db->value("SELECT COUNT(*) FROM messages WHERE kind = 'msg' AND created_at >= ?", [$day]);
    $yday = (int)$db->value("SELECT COUNT(*) FROM messages WHERE kind = 'msg' AND created_at >= ? AND created_at < ?", [$day - 86400, $day]);
    $errs = $db->all("SELECT level, COUNT(*) AS n FROM logs WHERE at > ? AND level IN ('ERR', 'WARN') GROUP BY level", [now() - 86400]);
    $errMap = array_column($errs, 'n', 'level');
    $open = $db->all("SELECT r.*, a.username AS author FROM reports r LEFT JOIN users a ON a.id = r.author_id WHERE r.status = 'open' ORDER BY r.created_at DESC");
    $hour = intdiv(now(), 3600);
    $series = function (string $k, int $n) use ($db, $hour) {
        $rows = array_column($db->all('SELECT bucket, v FROM stats WHERE k = ? AND bucket > ?', [$k, $hour - $n]), 'v', 'bucket');
        $out = [];
        for ($h = $hour - $n + 1; $h <= $hour; $h++) $out[] = (int)($rows[$h] ?? 0);
        return $out;
    };
    $signups = [];
    for ($d = 13; $d >= 0; $d--) $signups[] = (int)$db->value('SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at < ?', [$day - $d * 86400, $day - ($d - 1) * 86400]);
    $attach = (int)$db->value('SELECT COALESCE(SUM(size), 0) FROM blobs');
    $dir = Config::dataDir();
    $total = function_exists('disk_total_space') ? (int)(@disk_total_space($dir) ?: 0) : 0;
    $free = (int)(free_bytes($dir) ?? 0);
    $mem = null;
    if (($mi = @file_get_contents('/proc/meminfo')) && preg_match('/MemTotal:\s+(\d+)/', $mi, $a) && preg_match('/MemAvailable:\s+(\d+)/', $mi, $b)) $mem = round(100 - $b[1] / $a[1] * 100);
    $info = server_info();
    $audit = $db->all('SELECT * FROM audit ORDER BY id DESC LIMIT 5');
    out([
        'users' => $users, 'usersWeek' => $week, 'online' => $online, 'msgsToday' => $today, 'msgsYday' => $yday,
        'errors' => (int)($errMap['ERR'] ?? 0), 'warns' => (int)($errMap['WARN'] ?? 0), 'uptime' => $info['uptime'], 'version' => CHATS_VERSION,
        'reg' => Config::server('reg'), 'liveInvites' => (int)$db->value('SELECT COUNT(*) FROM invites WHERE revoked = 0 AND (expires_at = 0 OR expires_at > ?) AND (max_uses = 0 OR used < max_uses)', [now()]),
        'openReports' => array_map(fn($r) => ['id' => $r['id'], 'reason' => $r['reason'], 'author' => $r['author'] ?? 'deleted', 'msg' => $r['body'], 'at' => (int)$r['created_at']], $open),
        'attachBytes' => $attach, 'diskTotal' => $total, 'diskUsed' => max(0, $total - $free), 'memPct' => $mem,
        'msgsHour' => $series('msgs', 24), 'syncsHour' => $series('syncs', 24), 'signupsDay' => $signups,
        'audit' => array_map('fmt_audit', $audit), 'maint' => (bool)Config::server('maint'), 'name' => Config::server('name'),
    ]);
}

function fmt_audit(array $a): array
{
    return ['time' => (int)$a['at'], 'actor' => $a['actor'], 'type' => $a['type'], 'action' => $a['action'], 'target' => $a['target'], 'ip' => $a['ip']];
}

function r_admin_users(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $q = strtolower(str_arg('q', 40));
    $filt = str_arg('filt', 10) ?: 'all';
    $sortMap = ['name' => 'u.username', 'created' => 'u.created_at', 'seen' => 'u.last_seen', 'mb' => 'bytes', 'chats' => 'nchats'];
    $sort = $sortMap[str_arg('sort', 10)] ?? 'u.created_at';
    $dir = int_arg('dir', -1) > 0 ? 'ASC' : 'DESC';
    $page = int_arg('page', 0, 0);
    $where = ["u.status <> 'deleted'"];
    $p = [];
    if ($q !== '') { $where[] = "(u.username LIKE ? ESCAPE '!' OR LOWER(u.name) LIKE ? ESCAPE '!')"; $l = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $q) . '%'; $p[] = $l; $p[] = $l; }
    $filters = ['all' => '1 = 1', 'active' => "u.status = 'active'", 'disabled' => "u.status = 'disabled'", 'pending' => "u.status = 'pending'", 'admin' => "u.role IN ('owner', 'admin', 'moderator')"];
    $counts = [];
    foreach ($filters as $k => $cond) $counts[$k] = (int)$db->value('SELECT COUNT(*) FROM users u WHERE ' . implode(' AND ', $where) . " AND $cond", $p);
    $where[] = $filters[$filt] ?? '1 = 1';
    $sql = "SELECT u.*, (SELECT COALESCE(SUM(b.size), 0) FROM blobs b WHERE b.owner_id = u.id) AS bytes,
        (SELECT COUNT(*) FROM members m WHERE m.user_id = u.id AND m.status = 'active') AS nchats
        FROM users u WHERE " . implode(' AND ', $where) . " ORDER BY $sort $dir LIMIT 8 OFFSET " . ($page * 8);
    out(['rows' => array_map('admin_user_row', $db->all($sql, $p)), 'counts' => $counts, 'total' => $counts[$filt] ?? $counts['all'], 'page' => $page]);
}

function r_admin_user(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $u = $db->one("SELECT u.*, (SELECT COALESCE(SUM(b.size), 0) FROM blobs b WHERE b.owner_id = u.id) AS bytes,
        (SELECT COUNT(*) FROM members m WHERE m.user_id = u.id AND m.status = 'active') AS nchats FROM users u WHERE u.id = ?", [str_arg('id', 40)]);
    if (!$u) fail(404, 'no_user', 'user not found');
    $sess = $db->all("SELECT * FROM sessions WHERE user_id = ? AND revoked = 0 AND expires_at > ? AND kind = 'app' ORDER BY last_seen DESC", [$u['id'], now()]);
    out(['user' => admin_user_row($u), 'devices' => array_map(function ($s) {
        [$b, $o] = ua_summary($s['ua']);
        return ['id' => $s['id'], 'name' => $s['device'] ?: "$b · $o", 'where' => $s['ip'], 'last' => (int)$s['last_seen']];
    }, $sess)]);
}

function guard_target(array $actor, array $target, string $action): void
{
    if ($target['role'] === 'owner' && $actor['id'] !== $target['id']) fail(403, 'forbidden', "the owner can't be changed by other admins");
    if ($actor['role'] === 'moderator' && in_array($target['role'], ADMINS, true)) fail(403, 'forbidden', 'moderators cannot change admins');
    if ($actor['id'] === $target['id'] && in_array($action, ['disable', 'delete', 'role'], true)) fail(400, 'bad_request', "you can't do that to your own account");
}

function user_action(DB $db, array $actor, array $u, string $action, array $opt = []): string
{
    guard_target($actor, $u, $action);
    $bump = fn(array $set) => $db->tx(fn() => $db->update('users', $set + ['seq' => $db->nextSeq()], 'id = ?', [$u['id']]));
    switch ($action) {
        case 'disable':
            $bump(['status' => 'disabled', 'status_at' => now(), 'status_reason' => clean_str($opt['reason'] ?? 'disabled by an admin', 200)]);
            Auth::revokeUser($db, $u['id'], 'admin');
            return 'disabled user';
        case 'enable':
        case 'approve':
            $bump(['status' => 'active', 'status_at' => now(), 'status_reason' => '']);
            return $action === 'approve' ? 'approved user' : 'enabled user';
        case 'logout':
            Auth::revokeUser($db, $u['id'], 'admin');
            return 'forced logout';
        case 'role':
            $role = $opt['role'] ?? 'user';
            if (!in_array($role, ['user', 'admin', 'moderator'], true)) fail(400, 'bad_request', 'bad role');
            if ($role !== 'user' && !in_array($actor['role'], ADMINS, true)) fail(403, 'forbidden', 'only admins can promote');
            $bump(['role' => $role]);
            if ($role === 'user') $db->exec("UPDATE sessions SET revoked = 1, revoked_by = 'admin' WHERE user_id = ? AND kind = 'admin'", [$u['id']]);
            return 'changed role → ' . $role;
        case 'quota':
            $mb = (int)($opt['mb'] ?? 0);
            $db->update('users', ['quota_mb' => max(0, min(1048576, $mb))], 'id = ?', [$u['id']]);
            return 'set quota ' . fmt_bytes($mb * 1048576);
        case 'delete':
            foreach ($db->all('SELECT id FROM blobs WHERE owner_id = ?', [$u['id']]) as $b) delete_blob($db, $b['id']);
            $db->tx(function () use ($db, $u) {
                $seq = $db->nextSeq();
                $db->exec('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
                $db->exec('DELETE FROM push_subs WHERE user_id = ?', [$u['id']]);
                foreach ($db->all("SELECT chat_id FROM members WHERE user_id = ? AND status = 'active'", [$u['id']]) as $m) $db->update('chats', ['seq' => $seq], 'id = ?', [$m['chat_id']]);
                $db->exec('DELETE FROM members WHERE user_id = ?', [$u['id']]);
                $db->exec('DELETE FROM users WHERE id = ?', [$u['id']]);
            });
            return 'deleted user';
        case 'revoke':
            $db->exec("UPDATE sessions SET revoked = 1, revoked_by = 'admin' WHERE id = ? AND user_id = ?", [(string)($opt['session'] ?? ''), $u['id']]);
            $db->exec('DELETE FROM push_subs WHERE session_id = ?', [(string)($opt['session'] ?? '')]);
            return 'revoked session';
    }
    fail(400, 'bad_request', 'unknown action');
}

function r_admin_user_action(): never
{
    $db = DB::main();
    $actor = Auth::admin($db, STAFF);
    $u = $db->one('SELECT * FROM users WHERE id = ?', [str_arg('id', 40)]);
    if (!$u) fail(404, 'no_user', 'user not found');
    $action = str_arg('action', 12);
    $msg = user_action($db, $actor, $u, $action, ['role' => str_arg('role', 12), 'mb' => int_arg('mb'), 'session' => str_arg('session', 40), 'reason' => str_arg('reason', 200)]);
    Auth::audit($db, $action === 'quota' ? 'storage' : 'users', $msg, '@' . $u['username']);
    out(['msg' => $msg]);
}

function r_admin_users_bulk(): never
{
    $db = DB::main();
    $actor = Auth::admin($db, STAFF);
    $action = str_arg('action', 12);
    if (!in_array($action, ['enable', 'disable', 'logout', 'delete'], true)) fail(400, 'bad_request', 'unknown action');
    $n = 0;
    foreach (array_slice((array)arg('ids', []), 0, 500) as $id) {
        $u = $db->one('SELECT * FROM users WHERE id = ?', [(string)$id]);
        if (!$u) continue;
        try { user_action($db, $actor, $u, $action); $n++; } catch (HttpError) {}
    }
    Auth::audit($db, 'users', ($action === 'logout' ? 'forced logout' : $action . 'd users'), $n . ' users');
    out(['count' => $n]);
}

// ---------------------------------------------------------------- reports

function r_admin_reports(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $rows = $db->all('SELECT r.*, a.username AS author, p.username AS reporter FROM reports r LEFT JOIN users a ON a.id = r.author_id LEFT JOIN users p ON p.id = r.reporter_id ORDER BY r.created_at DESC LIMIT 300');
    out(['reports' => array_map(fn($r) => ['id' => $r['id'], 'author' => $r['author'] ?? 'deleted', 'authorId' => $r['author_id'], 'reporter' => $r['reporter'] ?? 'deleted',
        'reason' => $r['reason'], 'at' => (int)$r['created_at'], 'chat' => $r['chat_id'], 'msg' => $r['body'], 'note' => $r['note'], 'status' => $r['status'], 'outcome' => $r['outcome']], $rows),
        'reporting' => (bool)Config::server('reporting')]);
}

function r_admin_report(): never
{
    $db = DB::main();
    $actor = Auth::admin($db, STAFF);
    $r = $db->one('SELECT * FROM reports WHERE id = ?', [str_arg('id', 16)]);
    if (!$r) fail(404, 'no_report', 'report not found');
    $action = str_arg('action', 10);
    $author = $db->one('SELECT * FROM users WHERE id = ?', [$r['author_id']]);
    $m = $db->one('SELECT * FROM messages WHERE id = ?', [(int)$r['msg_id']]);
    $touchMsg = function (array $set) use ($db, $m) {
        if (!$m) return;
        $db->tx(function () use ($db, $m, $set) { $seq = $db->nextSeq(); $db->update('messages', $set + ['seq' => $seq], 'id = ?', [$m['id']]); $db->update('chats', ['seq' => $seq], 'id = ?', [$m['chat_id']]); });
    };
    if ($action === 'undo') {
        $prev = (array)$db->kvGet('report_undo:' . $r['id'], []);
        if (($prev['action'] ?? '') === 'delete') $touchMsg(['deleted' => 0, 'hidden' => 0]);
        if (($prev['action'] ?? '') === 'disable' && $author) user_action($db, $actor, $author, 'enable');
        if (($prev['action'] ?? '') === 'warn' && !empty($prev['ann'])) $db->exec('DELETE FROM announcements WHERE id = ?', [$prev['ann']]);
        $db->update('reports', ['status' => 'open', 'outcome' => '', 'resolved_by' => '', 'resolved_at' => 0], 'id = ?', [$r['id']]);
        Auth::audit($db, 'reports', 'reopened report', $r['id']);
        out();
    }
    $undo = ['action' => $action];
    $outcome = match ($action) {
        'dismiss' => 'dismissed',
        'warn' => 'warned @' . ($author['username'] ?? 'deleted'),
        'delete' => 'message deleted',
        'disable' => 'disabled @' . ($author['username'] ?? 'deleted'),
        default => fail(400, 'bad_request', 'unknown action'),
    };
    if ($action === 'delete') $touchMsg(['deleted' => 1, 'hidden' => 1]);
    if ($action === 'disable' && $author) user_action($db, $actor, $author, 'disable', ['reason' => 'reported for ' . $r['reason']]);
    if ($action === 'warn' && $author) {
        $undo['ann'] = (int)$db->insert('announcements', ['body' => 'an admin reviewed one of your messages (' . $r['reason'] . '). please follow the rules of ' . Config::server('name') . '.',
            'level' => 'warn', 'publish_at' => now(), 'created_by' => $actor['id'], 'created_at' => now(), 'reach' => 0, 'user_id' => $author['id']]);
    }
    $db->kvSet('report_undo:' . $r['id'], $undo);
    $db->update('reports', ['status' => 'resolved', 'outcome' => $outcome . ' by ' . $actor['username'], 'resolved_by' => $actor['id'], 'resolved_at' => now()], 'id = ?', [$r['id']]);
    Auth::audit($db, 'reports', $outcome, $r['id']);
    out(['outcome' => $outcome]);
}

// ---------------------------------------------------------------- invites, chats, storage

function r_admin_invites(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $rows = $db->all('SELECT i.*, u.username AS byname FROM invites i LEFT JOIN users u ON u.id = i.created_by ORDER BY i.created_at DESC LIMIT 500');
    out(['invites' => array_map(fn($i) => ['code' => $i['code'], 'label' => $i['label'], 'used' => (int)$i['used'], 'max' => (int)$i['max_uses'], 'exp' => (int)$i['expires_at'],
        'by' => $i['byname'] ?? '—', 'revoked' => (bool)$i['revoked'], 'approve' => (bool)$i['approve'], 'quota' => (int)$i['quota_mb'], 'created' => (int)$i['created_at']], $rows)]);
}

function r_admin_invite_create(): never
{
    $db = DB::main();
    $actor = Auth::admin($db, STAFF);
    $a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $rc = function () use ($a) { $s = ''; for ($i = 0; $i < 4; $i++) $s .= $a[random_int(0, 31)]; return $s; };
    $code = 'GRN-' . $rc() . '-' . $rc();
    $exp = ['24h' => 86400, '7d' => 604800, '30d' => 2592000, 'never' => 0][str_arg('exp', 6)] ?? 604800;
    $quota = str_arg('quota', 8);
    $db->insert('invites', ['code' => $code, 'label' => str_arg('label', 80), 'max_uses' => int_arg('uses', 5, 0, 100000), 'used' => 0,
        'expires_at' => $exp ? now() + $exp : 0, 'quota_mb' => ctype_digit($quota) ? (int)$quota : 0, 'approve' => bool_arg('approve') ? 1 : 0,
        'preview' => bool_arg('preview') ? 1 : 0, 'created_by' => $actor['id'], 'created_at' => now(), 'revoked' => 0]);
    Auth::audit($db, 'invites', 'created invite', $code);
    out(['code' => $code]);
}

function r_admin_invite_revoke(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $code = str_arg('code', 32);
    $db->update('invites', ['revoked' => 1], 'code = ?', [$code]);
    Auth::audit($db, 'invites', 'revoked invite', $code);
    out();
}

function r_admin_chats(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $rows = $db->all("SELECT c.id, c.type, c.size_bytes, c.last_at, (SELECT COUNT(*) FROM members m WHERE m.chat_id = c.id AND m.status = 'active') AS n FROM chats c ORDER BY c.last_at DESC LIMIT 500");
    out(['chats' => array_map(fn($c) => ['id' => $c['id'], 'type' => $c['type'], 'members' => (int)$c['n'], 'size' => (int)$c['size_bytes'], 'last' => (int)$c['last_at']], $rows)]);
}

function r_admin_chat_delete(): never
{
    $db = DB::main();
    Auth::admin($db, ADMINS);
    $id = str_arg('id', 40);
    $blobs = array_column($db->all('SELECT DISTINCT blob_id FROM blob_refs WHERE chat_id = ?', [$id]), 'blob_id');
    $db->tx(function () use ($db, $id) {
        $seq = $db->nextSeq();
        $db->update('members', ['status' => 'left', 'seq' => $seq], 'chat_id = ?', [$id]);
        $db->exec('DELETE FROM messages WHERE chat_id = ?', [$id]);
        $db->exec('DELETE FROM blob_refs WHERE chat_id = ?', [$id]);
        $db->exec('DELETE FROM chats WHERE id = ?', [$id]);
    });
    foreach ($blobs as $b) if (!$db->value('SELECT COUNT(*) FROM blob_refs WHERE blob_id = ?', [$b])) delete_blob($db, $b);
    Auth::audit($db, 'chats', 'deleted chat', $id);
    out();
}

function r_admin_storage(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $users = $db->all("SELECT u.id, u.username, u.quota_mb, (SELECT COALESCE(SUM(b.size), 0) FROM blobs b WHERE b.owner_id = u.id) AS bytes FROM users u ORDER BY bytes DESC LIMIT 8");
    $files = $db->all('SELECT b.*, u.username FROM blobs b LEFT JOIN users u ON u.id = b.owner_id ORDER BY b.size DESC LIMIT 8');
    $cfg = Config::get('storage');
    $free = null;
    if ($cfg['backend'] === 'local') $free = (new LocalStorage($cfg['path'] ?: Config::dataDir() . '/blobs'))->freeBytes();
    out(['total' => (int)$db->value('SELECT COALESCE(SUM(size), 0) FROM blobs'), 'count' => (int)$db->value('SELECT COUNT(*) FROM blobs'), 'free' => $free,
        'users' => array_map(fn($u) => ['id' => $u['id'], 'name' => $u['username'], 'bytes' => (int)$u['bytes'], 'quota' => quota_bytes($u)], $users),
        'files' => array_map(fn($f) => ['id' => $f['id'], 'size' => (int)$f['size'], 'at' => (int)$f['created_at'], 'owner' => $f['username'] ?? '—'], $files),
        'lastOrphan' => $db->kvGet('orphan_last')]);
}

function orphan_query(DB $db): array
{
    return $db->all("SELECT b.id, b.size FROM blobs b WHERE b.created_at < ? AND (b.purpose = 'file' OR (b.purpose = 'avatar' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar = b.id))) AND NOT EXISTS (SELECT 1 FROM blob_refs r WHERE r.blob_id = b.id)", [now() - 3600]);
}

function r_admin_orphans(): never
{
    $db = DB::main();
    Auth::admin($db, ADMINS);
    $rows = orphan_query($db);
    $bytes = array_sum(array_map(fn($r) => (int)$r['size'], $rows));
    if (bool_arg('delete')) {
        foreach ($rows as $r) delete_blob($db, $r['id']);
        $db->kvSet('orphan_last', ['at' => now(), 'freed' => $bytes, 'count' => count($rows)]);
        Auth::audit($db, 'storage', 'orphan cleanup freed ' . fmt_bytes($bytes), 'storage');
        $db->log('INFO', 'orphan-cleanup removed ' . count($rows) . ' blobs (' . fmt_bytes($bytes) . ')');
    }
    out(['count' => count($rows), 'bytes' => $bytes, 'scanned' => (int)$db->value('SELECT COUNT(*) FROM blobs')]);
}

function r_admin_blob_delete(): never
{
    $db = DB::main();
    Auth::admin($db, ADMINS);
    $b = $db->one('SELECT * FROM blobs WHERE id = ?', [str_arg('id', 40)]);
    if (!$b) fail(404, 'no_file', 'blob not found');
    delete_blob($db, $b['id']);
    Auth::audit($db, 'storage', 'deleted blob ' . fmt_bytes((int)$b['size']), $b['id']);
    out();
}

// ---------------------------------------------------------------- configuration

function r_admin_config(): never
{
    $db = DB::main();
    Auth::admin($db, ADMINS);
    out(['server' => Config::get('server'), 'db' => Config::get('db'), 'storage' => Config::get('storage'), 'smtp' => Config::get('smtp'),
        'drivers' => ['sqlite' => extension_loaded('pdo_sqlite'), 'mysql' => extension_loaded('pdo_mysql'), 'postgres' => extension_loaded('pdo_pgsql')],
        'dbVersion' => $db->version(), 'dbSize' => $db->sizeBytes(), 'dataDir' => Config::dataDir(), 'vapid' => (bool)(Config::keys()['vapidPub'] ?? '')]);
}

function r_admin_test(): never
{
    $db = DB::main();
    Auth::admin($db, ADMINS);
    $what = str_arg('what', 16);
    [$ok, $msg] = match ($what) {
        'db' => test_db(clean_db_cfg(arg('db'))),
        'storage' => test_storage(clean_storage_cfg(arg('storage'))),
        'smtp' => test_smtp(clean_smtp_cfg(arg('smtp')), str_arg('to', 190)),
        default => [false, 'unknown test'],
    };
    Auth::audit($db, 'config', 'tested ' . $what, $ok ? 'ok' : 'failed');
    out(['pass' => $ok, 'msg' => $msg]);
}

function r_admin_config_save(): never
{
    $db = DB::main();
    $actor = Auth::admin($db, ADMINS);
    $all = Config::all();
    $changed = [];
    $requireStaffMfa = false;
    if (is_array(arg('server'))) {
        $old = Config::get('server');
        $new = clean_server_cfg(arg('server'), $old);
        foreach ($new as $k => $v) if (($old[$k] ?? null) !== $v) $changed[] = $k;
        if (!$old['maint'] && $new['maint']) $db->kvSet('maint_since', now());
        if ($old['tfaAdmins'] !== 'required' && $new['tfaAdmins'] === 'required') {
            if (!(int)$actor['totp_on']) fail(400, 'enroll_first', 'set up your own authenticator before requiring it for every admin');
            $requireStaffMfa = true;
        }
        $all['server'] = $new;
    }
    if (is_array(arg('smtp'))) {
        $new = clean_smtp_cfg(arg('smtp'));
        if ($new !== Config::get('smtp')) $changed[] = 'smtp';
        $all['smtp'] = $new;
    }
    if (is_array(arg('storage'))) {
        $new = clean_storage_cfg(arg('storage'));
        $cur = Config::get('storage');
        if ($new !== $cur) {
            [$ok, $msg] = test_storage($new);
            if (!$ok) fail(400, 'storage_failed', $msg);
            $changed[] = 'storage';
            // keep the old location so blobs already written there stay readable
            if (Storage::tag($new) !== Storage::tag($cur)) $all['storageLocations'][Storage::tag($cur)] = $cur;
        }
        $all['storage'] = $new;
    }
    $migrated = null;
    if (is_array(arg('db'))) {
        $new = clean_db_cfg(arg('db'));
        $old = Config::get('db');
        if ($new !== $old) {
            $sameTarget = $new['engine'] === $old['engine'] && ($new['engine'] === 'sqlite' ? $new['path'] === $old['path'] : $new['host'] === $old['host'] && $new['port'] === $old['port'] && $new['name'] === $old['name']);
            [$ok, $msg] = test_db($new);
            if (!$ok) fail(400, 'db_failed', $msg);
            if (!$sameTarget) {
                $target = new DB($new);
                $target->createSchema();
                if ((int)$target->value('SELECT COUNT(*) FROM users') > 0 && !bool_arg('overwrite')) fail(409, 'db_not_empty', 'the target database already has data · empty it first');
                $migrated = $db->copyTo($target);
                $db->log('INFO', 'database migrated ' . $old['engine'] . ' → ' . $new['engine']);
            }
            $changed[] = 'database';
        }
        $all['db'] = $new;
    }
    Config::save($all);
    if ($migrated !== null) DB::setMain(new DB($all['db']));
    if ($requireStaffMfa) {
        // Staff without an authenticator: console sessions end (sign-in now enrolls), app sessions wait for enrollment.
        $noMfa = "user_id IN (SELECT id FROM users WHERE role IN ('owner', 'admin', 'moderator') AND totp_on = 0)";
        DB::main()->exec("UPDATE sessions SET revoked = 1, revoked_by = 'admin' WHERE kind = 'admin' AND revoked = 0 AND $noMfa");
        DB::main()->exec("UPDATE sessions SET mfa_until = -1 WHERE kind = 'app' AND revoked = 0 AND $noMfa");
    }
    if ($changed) {
        Auth::audit(DB::main(), 'config', 'changed ' . implode(', ', $changed), 'server');
        DB::main()->log('INFO', 'config changed by ' . Auth::$user['username'] . ' (' . implode(', ', $changed) . ')');
    }
    out(['changed' => $changed, 'migrated' => $migrated]);
}

function r_admin_announce(): never
{
    $db = DB::main();
    $actor = Auth::admin($db, ADMINS);
    $body = str_arg('body', 240);
    if ($body === '') fail(400, 'bad_request', 'write something first');
    $level = str_arg('level', 8) === 'warn' ? 'warn' : 'info';
    $at = arg('at') ? (int)strtotime((string)arg('at') . ' UTC') : now();
    if ($at <= 0) $at = now();
    $id = (int)$db->insert('announcements', ['body' => $body, 'level' => $level, 'publish_at' => $at, 'created_by' => $actor['id'], 'created_at' => now(), 'reach' => 0, 'user_id' => null]);
    if ($at <= now()) {
        $users = array_column($db->all("SELECT DISTINCT user_id FROM push_subs"), 'user_id');
        defer(fn() => Push::toUsers($db, $users, ['v' => 1, 'type' => 'announce', 'id' => $id, 'body' => $body, 'server' => Config::server('name')]));
    }
    Auth::audit($db, 'config', $at <= now() ? 'published announcement' : 'scheduled announcement', 'all users');
    out(['id' => $id]);
}

function r_admin_announcements(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $rows = $db->all('SELECT a.*, u.username FROM announcements a LEFT JOIN users u ON u.id = a.created_by WHERE a.user_id IS NULL ORDER BY a.id DESC LIMIT 50');
    out(['rows' => array_map(fn($a) => ['id' => (int)$a['id'], 'body' => $a['body'], 'level' => $a['level'], 'at' => (int)$a['publish_at'], 'by' => $a['username'] ?? '—',
        'reach' => (int)$a['reach'], 'pending' => (int)$a['publish_at'] > now()], $rows)]);
}

function r_admin_audit(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $where = [];
    $p = [];
    $type = str_arg('type', 16);
    if ($type !== '' && $type !== 'all') { $where[] = 'type = ?'; $p[] = $type; }
    $q = strtolower(str_arg('q', 60));
    if ($q !== '') {
        $l = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $q) . '%';
        $where[] = "(LOWER(actor) LIKE ? ESCAPE '!' OR LOWER(target) LIKE ? ESCAPE '!' OR ip LIKE ? ESCAPE '!' OR LOWER(action) LIKE ? ESCAPE '!')";
        array_push($p, $l, $l, $l, $l);
    }
    $db->exec('DELETE FROM audit WHERE at < ?', [now() - 90 * 86400]);
    $rows = $db->all('SELECT * FROM audit' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 1000', $p);
    out(['rows' => array_map('fmt_audit', $rows)]);
}

function r_admin_admins(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $admins = $db->all("SELECT u.*, (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id AND s.kind = 'admin') AS last_login FROM users u WHERE u.role IN ('owner', 'admin', 'moderator') ORDER BY u.created_at");
    $sess = $db->all("SELECT s.*, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.kind = 'admin' AND s.revoked = 0 AND s.expires_at > ? ORDER BY s.last_seen DESC", [now()]);
    out(['admins' => array_map(fn($a) => ['id' => $a['id'], 'name' => $a['username'], 'role' => $a['role'], 'totp' => (bool)$a['totp_on'], 'last' => (int)$a['last_login']], $admins),
        'ips' => Config::all()['security']['ips'] ?? [], 'myIp' => client_ip(),
        'sessions' => array_map(function ($s) {
            [$b, $o] = ua_summary($s['ua']);
            return ['id' => $s['id'], 'who' => $s['username'], 'client' => "$b · $o", 'ip' => $s['ip'], 'last' => (int)$s['last_seen'], 'current' => $s['id'] === Auth::$session['id']];
        }, $sess),
        'usersMfa' => (int)$db->value('SELECT COUNT(*) FROM users WHERE totp_on = 1'), 'users' => (int)$db->value('SELECT COUNT(*) FROM users')]);
}

function r_admin_ips(): never
{
    $db = DB::main();
    Auth::admin($db, ADMINS);
    $ips = [];
    foreach ((array)arg('ips', []) as $r) {
        $cidr = clean_str($r['cidr'] ?? '', 18);
        if (!preg_match('/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/', $cidr)) fail(400, 'bad_request', 'expected IPv4 or CIDR, e.g. 203.0.113.0/24');
        $ips[] = ['cidr' => $cidr, 'note' => clean_str($r['note'] ?? '', 60)];
    }
    if ($ips) {
        $ok = false;
        foreach ($ips as $r) if (ip_in_cidr(client_ip(), $r['cidr'])) $ok = true;
        if (!$ok) fail(400, 'lockout', 'your address ' . client_ip() . ' is not in the list · you would lock yourself out');
    }
    $all = Config::all();
    $all['security']['ips'] = $ips;
    Config::save($all);
    Auth::audit($db, 'config', 'updated ip allow-list', count($ips) . ' entries');
    out();
}

function r_admin_session_revoke(): never
{
    $db = DB::main();
    Auth::admin($db, ADMINS);
    $s = $db->one('SELECT s.*, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [str_arg('id', 40)]);
    if (!$s) fail(404, 'no_session', 'session not found');
    $db->update('sessions', ['revoked' => 1, 'revoked_by' => 'admin'], 'id = ?', [$s['id']]);
    Auth::audit($db, 'auth', 'revoked admin session', '@' . $s['username']);
    out();
}

function r_admin_me(): never
{
    $db = DB::main();
    $u = Auth::admin($db, STAFF);
    out(['me' => ['id' => $u['id'], 'username' => $u['username'], 'role' => $u['role'], 'mfa' => (bool)$u['totp_on'], 'mfaRequired' => staff_mfa_required(),
        'backupLeft' => count(json_decode((string)$u['backup_codes'], true) ?: []), 'expires' => (int)Auth::$session['expires_at']],
        'server' => server_info()]);
}

/** enroll (first time, or replace with a current code) · backup (needs a current code) · disable (needs a current code, only while optional). */
function r_admin_mfa(): never
{
    $db = DB::main();
    $u = Auth::admin($db, STAFF);
    $action = str_arg('action', 10);
    if (!in_array($action, ['enroll', 'backup', 'disable'], true)) fail(400, 'bad_request', 'unknown action');
    if ($action === 'disable' && staff_mfa_required()) fail(403, 'mfa_required', 'two-factor is required for admins on this server');
    // Adding a first authenticator needs no code; anything that changes or removes an existing one does.
    $state = (int)$u['totp_on'] || $action !== 'enroll' ? Auth::requireFactor($db, $u) : Auth::factorState($u);
    $result = $db->tx(function () use ($db, $u, $state, $action) {
        $u = $db->lockUser($u['id']);
        if (!hash_equals($state, Auth::factorState($u))) fail(403, 'forbidden', 'factor changed, start again');
        if ($action === 'backup') {
            $codes = Totp::backupCodes();
            $db->update('users', ['backup_codes' => json_encode(array_map(fn($c) => hash('sha256', $c), $codes))], 'id = ?', [$u['id']]);
            Auth::audit($db, 'auth', 'regenerated backup codes', $u['username']);
            return ['backupCodes' => $codes];
        }
        if ($action === 'disable') {
            $db->update('users', ['totp_secret' => null, 'totp_on' => 0, 'backup_codes' => '[]'], 'id = ?', [$u['id']]);
            $db->exec('DELETE FROM kv WHERE k = ?', ['totp_pending:' . $u['id']]);
            Auth::audit($db, 'auth', 'turned off authenticator', $u['username']);
            return ['disabled' => true];
        }
        return Auth::beginEnrollment($db, $u, 'admin');
    });
    out($result);
}

// ---------------------------------------------------------------- health & backups

function r_admin_health(): never
{
    $db = DB::main();
    Auth::admin($db, STAFF);
    $hour = intdiv(now(), 3600);
    $syncs = (int)$db->value("SELECT COALESCE(SUM(v), 0) FROM stats WHERE k = 'syncs' AND bucket = ?", [$hour]);
    $pushFails = (int)$db->value("SELECT COALESCE(SUM(v), 0) FROM stats WHERE k = 'push_fail' AND bucket >= ?", [$hour]);
    $st = Config::get('storage');
    $smtp = Config::get('smtp');
    $services = [
        ['api', 'UP', 'php ' . PHP_VERSION . ' · ' . $syncs . ' syncs this hour'],
        ['sync', 'UP', (int)$db->value('SELECT COUNT(*) FROM users WHERE last_seen > ?', [now() - 60]) . ' clients polling'],
        ['push gateway', $pushFails > 5 ? 'DEGRADED' : 'UP', 'web push · ' . $pushFails . ' failures / 1h · ' . (int)$db->value('SELECT COUNT(*) FROM push_subs') . ' devices'],
        ['database', 'UP', $db->version() . ' · ' . fmt_bytes($db->sizeBytes())],
        ['blob storage', 'UP', ($st['backend'] === 's3' ? 's3 · ' . $st['bucket'] : 'local') . ' · ' . fmt_bytes((int)$db->value('SELECT COALESCE(SUM(size), 0) FROM blobs')) . ' · ' . (int)$db->value('SELECT COUNT(*) FROM blobs') . ' objects'],
        ['smtp', $smtp['on'] ? 'UP' : 'OFF', $smtp['on'] ? $smtp['host'] . ':' . $smtp['port'] : 'not configured'],
    ];
    if (bool_arg('deep')) {
        try { Storage::active()->test()[0] ?: $services[4][1] = 'DOWN'; } catch (Throwable) { $services[4][1] = 'DOWN'; }
    }
    $logs = $db->all('SELECT * FROM logs ORDER BY id DESC LIMIT 60');
    out(['services' => array_map(fn($s) => ['name' => $s[0], 'st' => $s[1], 'meta' => $s[2]], $services),
        'log' => array_map(fn($l) => ['at' => (int)$l['at'], 'lv' => $l['level'], 'msg' => $l['msg']], $logs),
        'errCount' => (int)$db->value("SELECT COUNT(*) FROM logs WHERE level = 'ERR' AND at > ?", [now() - 86400]),
        'backups' => $db->kvGet('backups', []), 'version' => CHATS_VERSION]);
}

function backup_dir(): string
{
    $d = Config::dataDir() . '/backups';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    return $d;
}

/** Database snapshot as gzipped JSON lines (attachments are already encrypted and live in blob storage). */
function run_backup(DB $db, string $trigger): array
{
    $t0 = microtime(true);
    $name = 'chats-backup-' . gmdate('Ymd-His') . '.jsonl.gz';
    $path = backup_dir() . '/' . $name;
    $gz = @gzopen($path, 'wb6');
    if (!$gz) {
        $entry = ['st' => 'FAIL', 'at' => now(), 'size' => 0, 'name' => '', 'note' => 'cannot write ' . backup_dir()];
    } else {
        gzwrite($gz, json_encode(['chats_backup' => 1, 'version' => CHATS_VERSION, 'engine' => $db->dialect, 'at' => now()]) . "\n");
        foreach (array_keys(DB::SCHEMA) as $table) {
            $offset = 0;
            while ($rows = $db->all("SELECT * FROM $table ORDER BY 1 LIMIT 1000 OFFSET $offset")) {
                foreach ($rows as $r) gzwrite($gz, json_encode(['t' => $table, 'r' => $r], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n");
                $offset += 1000;
            }
        }
        gzclose($gz);
        @chmod($path, 0600);
        $entry = ['st' => 'OK', 'at' => now(), 'size' => (int)filesize($path), 'name' => $name, 'note' => $trigger . ' · ' . round(microtime(true) - $t0, 1) . 's'];
        $db->log('INFO', 'backup: snapshot ' . fmt_bytes($entry['size']) . ' ok in ' . round(microtime(true) - $t0, 1) . 's');
    }
    $hist = $db->kvGet('backups', []);
    array_unshift($hist, $entry);
    foreach (array_slice($hist, 14) as $old) if (!empty($old['name'])) @unlink(backup_dir() . '/' . $old['name']);
    $db->kvSet('backups', array_slice($hist, 0, 14));
    return $entry;
}

function maybe_daily_backup(DB $db): void
{
    $hist = $db->kvGet('backups', []);
    $last = $hist[0]['at'] ?? 0;
    if (now() - $last < 82800 || (int)gmdate('G') < 3) return;
    if ((int)$db->kvGet('backup_lock', 0) > now() - 600) return;
    $db->kvSet('backup_lock', now());
    defer(fn() => run_backup($db, 'daily'));
}

function r_admin_backup(): never
{
    $db = DB::main();
    Auth::admin($db, ADMINS);
    if (function_exists('set_time_limit')) @set_time_limit(600);
    $e = run_backup($db, 'manual');
    Auth::audit($db, 'config', 'manual backup ' . strtolower($e['st']), 'backup');
    out(['backup' => $e, 'backups' => $db->kvGet('backups', [])]);
}

function r_admin_backup_download(): never
{
    $db = DB::main();
    Auth::admin($db, ADMINS);
    $name = basename(str_arg('name', 80));
    $path = backup_dir() . '/' . $name;
    if (!preg_match('/^chats-backup-[\d-]+\.jsonl\.gz$/', $name) || !is_file($path)) fail(404, 'no_backup', 'backup not found');
    Auth::audit($db, 'config', 'downloaded backup', $name);
    header('Content-Type: application/gzip');
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $name . '"');
    readfile($path);
    exit;
}
