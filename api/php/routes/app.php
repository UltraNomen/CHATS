<?php
// Chat client routes. Message bodies, group names, file contents and contacts arrive and leave encrypted.
declare(strict_types=1);

function used_bytes(DB $db, string $uid): int
{
    return (int)$db->value('SELECT COALESCE(SUM(size), 0) FROM blobs WHERE owner_id = ?', [$uid]);
}

function quota_bytes(array $u): int
{
    return ((int)$u['quota_mb'] ?: (int)Config::server('quota')) * 1048576;
}

function fmt_me(DB $db, array $u): array
{
    return ['id' => $u['id'], 'username' => $u['username'], 'name' => $u['name'], 'bio' => $u['bio'], 'email' => $u['email'] ?? '', 'phone' => $u['phone'] ?? '',
        'phoneVis' => $u['phone_vis'], 'findable' => (bool)$u['findable'], 'showOnline' => (bool)$u['show_online'], 'receipts' => (bool)$u['receipts'],
        'avatar' => $u['avatar'], 'role' => $u['role'], 'status' => $u['status'], 'mfa' => (bool)$u['totp_on'], 'vaultVer' => (int)$u['vault_ver'],
        'used' => used_bytes($db, $u['id']), 'quota' => quota_bytes($u), 'created' => (int)$u['created_at'], 'pubKey' => $u['pub_key']];
}

/** Another user as $viewer may see them (online status and phone follow both users' privacy settings). */
function fmt_person(array $p, array $viewer): array
{
    $seenOk = (int)$p['show_online'] && (int)$viewer['show_online'];
    $out = ['id' => $p['id'], 'username' => $p['username'], 'name' => $p['name'], 'bio' => $p['bio'], 'avatar' => $p['avatar'], 'pubKey' => $p['pub_key'],
        'seen' => $seenOk ? (int)$p['last_seen'] : null, 'phone' => null, 'phoneShares' => [], 'gone' => $p['status'] === 'deleted'];
    if ($p['phone_vis'] === 'everyone') $out['phone'] = $p['phone'] ?? null;
    elseif ($p['phone_vis'] === 'contacts') $out['phoneShares'] = json_decode((string)$p['phone_shares'], true) ?: [];
    return $out;
}

function fmt_msg(array $m): array
{
    $deleted = (int)$m['deleted'] === 1;
    return ['id' => (int)$m['id'], 'chat' => $m['chat_id'], 'from' => $m['sender_id'], 'kind' => $m['kind'], 'ct' => $deleted || (int)$m['hidden'] ? null : ($m['ct'] ?? ''),
        'sys' => $m['kind'] === 'sys' ? json_decode((string)$m['sys'], true) : null, 'at' => (int)$m['created_at'], 'edited' => (int)$m['edited_at'],
        'deleted' => $deleted, 'hidden' => (int)$m['hidden'] === 1, 'seq' => (int)$m['seq'], 'cid' => $m['client_id']];
}

function member_of(DB $db, string $chatId, string $uid, bool $active = true): array
{
    $m = $db->one('SELECT * FROM members WHERE chat_id = ? AND user_id = ?' . ($active ? " AND status = 'active'" : ''), [$chatId, $uid]);
    if (!$m) fail(404, 'no_chat', 'chat not found');
    return $m;
}

function sys_message(DB $db, string $chatId, string $by, array $sys): void
{
    $seq = $db->nextSeq();
    $db->insert('messages', ['chat_id' => $chatId, 'sender_id' => $by, 'kind' => 'sys', 'ct' => '', 'sys' => json_encode($sys), 'client_id' => '',
        'created_at' => now(), 'edited_at' => 0, 'deleted' => 0, 'hidden' => 0, 'reports' => 0, 'seq' => $seq, 'blob_ids' => '[]']);
    $db->update('chats', ['seq' => $seq, 'last_at' => now()], 'id = ?', [$chatId]);
}

function chat_summary(DB $db, array $chat, array $me, array $mine): array
{
    $members = $db->all("SELECT m.user_id, m.role, m.read_seq, m.status, u.receipts FROM members m LEFT JOIN users u ON u.id = m.user_id WHERE m.chat_id = ? AND m.status = 'active'", [$chat['id']]);
    $receipts = (int)$me['receipts'];
    $last = $db->one("SELECT * FROM messages WHERE chat_id = ? AND id > ? ORDER BY id DESC LIMIT 1", [$chat['id'], (int)$mine['cleared_seq']]);
    $unread = (int)$db->value("SELECT COUNT(*) FROM messages WHERE chat_id = ? AND id > ? AND id > ? AND sender_id <> ? AND kind = 'msg' AND deleted = 0",
        [$chat['id'], (int)$mine['read_seq'], (int)$mine['cleared_seq'], $me['id']]);
    return [
        'id' => $chat['id'], 'type' => $chat['type'], 'meta' => $chat['meta'] ?? '', 'seq' => (int)$chat['seq'], 'createdBy' => $chat['created_by'],
        'createdAt' => (int)$chat['created_at'], 'lastAt' => (int)$chat['last_at'], 'status' => $mine['status'], 'box' => $mine['key_box'] ?? '',
        'role' => $mine['role'], 'muted' => (bool)$mine['muted'], 'readSeq' => (int)$mine['read_seq'], 'clearedSeq' => (int)$mine['cleared_seq'],
        'unread' => $unread, 'last' => $last ? fmt_msg($last) : null, 'hasInvite' => (bool)$chat['invite_hash'],
        'members' => array_map(fn($m) => ['id' => $m['user_id'], 'role' => $m['role'],
            'read' => ($receipts && (int)$m['receipts']) || $m['user_id'] === $me['id'] ? (int)$m['read_seq'] : null], $members),
    ];
}

/** Delta sync: chats, messages and profiles changed since the client's cursor. */
function r_sync(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $since = int_arg('since', 0, 0);
    $cursor = (int)$db->value("SELECT v FROM counters WHERE k = 'seq'");
    $db->bump('syncs');
    $rows = $db->all('SELECT m.*, c.seq AS chat_seq FROM members m JOIN chats c ON c.id = m.chat_id WHERE m.user_id = ? AND (m.seq > ? OR c.seq > ?)', [$me['id'], $since, $since]);
    $chats = [];
    $people = [];
    foreach ($rows as $mine) {
        if ($mine['status'] !== 'active') { $chats[] = ['id' => $mine['chat_id'], 'status' => 'left', 'seq' => (int)$mine['seq']]; continue; }
        $chat = $db->one('SELECT * FROM chats WHERE id = ?', [$mine['chat_id']]);
        if (!$chat) continue;
        $sum = chat_summary($db, $chat, $me, $mine);
        foreach ($sum['members'] as $mm) $people[$mm['id']] = true;
        $chats[] = $sum;
    }
    $messages = [];
    $more = false;
    if ($since > 0) {
        $limit = 300;
        $messages = $db->all("SELECT msg.* FROM messages msg JOIN members m ON m.chat_id = msg.chat_id AND m.user_id = ? AND m.status = 'active'
            WHERE msg.seq > ? AND msg.id > m.cleared_seq ORDER BY msg.seq LIMIT $limit", [$me['id'], $since]);
        if (count($messages) === $limit) { $more = true; $cursor = (int)end($messages)['seq']; }
        $messages = array_map('fmt_msg', $messages);
        foreach ($messages as $m) $people[$m['from']] = true;
    }
    $watch = array_slice(array_filter((array)arg('watch', []), 'is_string'), 0, 300);
    $ids = array_values(array_unique(array_merge(array_keys($people), $watch)));
    $profiles = [];
    $presence = [];
    if ($ids) {
        foreach ($db->all('SELECT * FROM users WHERE id IN (' . $db->in($ids) . ')', $ids) as $p) {
            if ($since === 0 || (int)$p['seq'] > $since) $profiles[$p['id']] = fmt_person($p, $me);
            $presence[$p['id']] = (int)$p['show_online'] && (int)$me['show_online'] ? (int)$p['last_seen'] : null;
        }
        foreach ($ids as $id) if (!isset($presence[$id])) $profiles[$id] = ['id' => $id, 'gone' => true, 'username' => 'deleted', 'name' => 'deleted account', 'bio' => '', 'avatar' => null, 'pubKey' => '', 'seen' => null, 'phone' => null, 'phoneShares' => []];
    }
    $anns = array_map(fn($a) => ['id' => (int)$a['id'], 'body' => $a['body'], 'level' => $a['level'], 'at' => (int)$a['publish_at'], 'personal' => (bool)$a['user_id']],
        $db->all('SELECT * FROM announcements WHERE publish_at <= ? AND publish_at > ? AND id > ? AND (user_id IS NULL OR user_id = ?) ORDER BY id DESC LIMIT 5',
            [now(), now() - 30 * 86400, int_arg('ann', 0), $me['id']]));
    $fresh = $since === 0 || (int)$me['seq'] > $since;
    $typing = array_map(fn($t) => ['chat' => $t['chat_id'], 'user' => $t['user_id']],
        $db->all("SELECT t.chat_id, t.user_id FROM typing t JOIN members m ON m.chat_id = t.chat_id AND m.user_id = ? AND m.status = 'active' WHERE t.exp_at > ? AND t.user_id <> ? LIMIT 100",
            [$me['id'], now(), $me['id']]));
    maybe_daily_backup($db);
    out(['cursor' => $cursor, 'more' => $more, 'chats' => $chats, 'messages' => $messages, 'people' => (object)$profiles, 'presence' => (object)$presence,
        'me' => $fresh ? fmt_me($db, $me) : null, 'vault' => (int)arg('vaultVer', 0) !== (int)$me['vault_ver'] ? ['data' => $me['vault'], 'ver' => (int)$me['vault_ver']] : null,
        'config' => ['caps' => Config::caps(), 'upload' => (int)Config::server('upload'), 'rate' => (int)Config::server('rate'), 'group' => (int)Config::server('group'),
            'tfaUsers' => Config::server('tfaUsers'), 'tfaAdmins' => Config::server('tfaAdmins'), 'theme' => Config::server('theme'), 'name' => Config::server('name')],
        'typing' => $typing, 'announcements' => $anns, 'now' => now()]);
}

function r_history(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $chat = str_arg('chat', 40);
    $mine = member_of($db, $chat, $me['id']);
    $before = int_arg('before', PHP_INT_MAX, 0);
    $limit = int_arg('limit', 60, 1, 200);
    $rows = $db->all("SELECT * FROM messages WHERE chat_id = ? AND id < ? AND id > ? ORDER BY id DESC LIMIT $limit", [$chat, $before, (int)$mine['cleared_seq']]);
    out(['messages' => array_map('fmt_msg', array_reverse($rows)), 'complete' => count($rows) < $limit]);
}

function check_box(string $box): string
{
    if (strlen($box) < 60 || strlen($box) > 300 || !preg_match('/^[A-Za-z0-9+\/=]+$/', $box)) fail(400, 'bad_keys', 'bad key box');
    return $box;
}

/** One direct chat per pair of users. The first caller's freshly generated key wins; later callers get the existing chat. */
function r_chat_direct(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $peerId = str_arg('peer', 40);
    $peer = $db->one("SELECT * FROM users WHERE id = ? AND status <> 'deleted'", [$peerId]);
    if (!$peer || $peerId === $me['id']) fail(404, 'no_user', 'user not found');
    $pair = [$me['id'], $peerId];
    sort($pair);
    $id = 'd_' . substr(hash_hmac('sha256', implode('|', $pair), Config::secret()), 0, 22);
    $created = $db->tx(function () use ($db, $id, $me, $peerId) {
        if ($db->value('SELECT COUNT(*) FROM chats WHERE id = ?', [$id])) {
            $mine = $db->one('SELECT * FROM members WHERE chat_id = ? AND user_id = ?', [$id, $me['id']]);
            if ($mine && $mine['status'] !== 'active') {
                $db->update('members', ['status' => 'active', 'seq' => $db->nextSeq()], 'chat_id = ? AND user_id = ?', [$id, $me['id']]);
            }
            return false;
        }
        $seq = $db->nextSeq();
        $db->insert('chats', ['id' => $id, 'type' => 'direct', 'meta' => '', 'created_by' => $me['id'], 'created_at' => now(), 'last_at' => now(), 'seq' => $seq,
            'invite_hash' => null, 'invite_wrap' => '', 'size_bytes' => 0]);
        foreach ([[$me['id'], 'boxMine'], [$peerId, 'boxPeer']] as [$uid, $k]) {
            $db->insert('members', ['chat_id' => $id, 'user_id' => $uid, 'role' => 'member', 'key_box' => check_box((string)arg($k)), 'status' => 'active',
                'joined_at' => now(), 'read_seq' => 0, 'muted' => 0, 'cleared_seq' => 0, 'seq' => $seq]);
        }
        return true;
    });
    out(['id' => $id, 'created' => $created]);
}

function r_chat_group(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    if (!Config::server('capGroups') && !in_array($me['role'], ['owner', 'admin'], true)) fail(403, 'cap_off', 'only admins can create groups on this server');
    $members = (array)arg('members', []);
    if (count($members) < 2) fail(400, 'bad_request', 'pick at least 1 member');
    if (count($members) > (int)Config::server('group')) fail(400, 'group_full', 'groups are limited to ' . Config::server('group') . ' members');
    $meta = blob_arg('meta', 20000);
    $inviteWrap = blob_arg('inviteWrap', 300, false) ?? '';
    $id = new_id('g_', 10);
    $added = [];
    $db->tx(function () use ($db, $id, $me, $members, $meta, $inviteWrap, &$added) {
        $seq = $db->nextSeq();
        $db->insert('chats', ['id' => $id, 'type' => 'group', 'meta' => $meta, 'created_by' => $me['id'], 'created_at' => now(), 'last_at' => now(), 'seq' => $seq,
            'invite_hash' => preg_match('/^[a-f0-9]{64}$/', (string)arg('inviteHash')) ? (string)arg('inviteHash') : null,
            'invite_wrap' => $inviteWrap, 'size_bytes' => 0]);
        $seen = [];
        foreach ($members as $m) {
            $uid = (string)($m['id'] ?? '');
            if (isset($seen[$uid]) || !$db->value("SELECT COUNT(*) FROM users WHERE id = ? AND status <> 'deleted'", [$uid])) continue;
            $seen[$uid] = true;
            $db->insert('members', ['chat_id' => $id, 'user_id' => $uid, 'role' => $uid === $me['id'] ? 'owner' : 'member', 'key_box' => check_box((string)($m['box'] ?? '')),
                'status' => 'active', 'joined_at' => now(), 'read_seq' => 0, 'muted' => 0, 'cleared_seq' => 0, 'seq' => $seq]);
            if ($uid !== $me['id']) $added[] = $uid;
        }
        if (!isset($seen[$me['id']])) fail(400, 'bad_request', 'creator key missing');
        sys_message($db, $id, $me['id'], ['ev' => 'created']);
        if ($added) sys_message($db, $id, $me['id'], ['ev' => 'added', 'users' => $added]);
    });
    out(['id' => $id]);
}

function r_chat_add(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $chatId = str_arg('chat', 40);
    member_of($db, $chatId, $me['id']);
    $chat = $db->one('SELECT * FROM chats WHERE id = ?', [$chatId]);
    if ($chat['type'] !== 'group') fail(400, 'bad_request', 'not a group');
    $count = (int)$db->value("SELECT COUNT(*) FROM members WHERE chat_id = ? AND status = 'active'", [$chatId]);
    $add = [];
    $db->tx(function () use ($db, $chatId, $me, &$add, &$count) {
        foreach ((array)arg('members', []) as $m) {
            $uid = (string)($m['id'] ?? '');
            if (!$db->value("SELECT COUNT(*) FROM users WHERE id = ? AND status <> 'deleted'", [$uid])) continue;
            $ex = $db->one('SELECT status FROM members WHERE chat_id = ? AND user_id = ?', [$chatId, $uid]);
            if ($ex && $ex['status'] === 'active') continue;
            if (++$count > (int)Config::server('group')) fail(400, 'group_full', 'groups are limited to ' . Config::server('group') . ' members');
            $row = ['role' => 'member', 'key_box' => check_box((string)($m['box'] ?? '')), 'status' => 'active', 'joined_at' => now(), 'read_seq' => 0, 'muted' => 0, 'cleared_seq' => 0, 'seq' => $db->nextSeq()];
            if ($ex) $db->update('members', $row, 'chat_id = ? AND user_id = ?', [$chatId, $uid]);
            else $db->insert('members', $row + ['chat_id' => $chatId, 'user_id' => $uid]);
            $add[] = $uid;
        }
        if (!$add) fail(400, 'bad_request', 'nobody new to add');
        sys_message($db, $chatId, $me['id'], ['ev' => 'added', 'users' => $add]);
    });
    out(['added' => count($add)]);
}

function r_chat_join_info(): never
{
    $db = DB::main();
    Auth::app($db);
    $hash = str_arg('hash', 64);
    $chat = $db->one("SELECT id, invite_wrap, meta FROM chats WHERE invite_hash = ? AND type = 'group'", [$hash]);
    if (!$chat || !preg_match('/^[a-f0-9]{64}$/', $hash)) fail(404, 'bad_invite', 'invite link is invalid or was reset');
    out(['chat' => $chat['id'], 'wrap' => $chat['invite_wrap'], 'meta' => $chat['meta']]);
}

function r_chat_join(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $chatId = str_arg('chat', 40);
    $chat = $db->one("SELECT * FROM chats WHERE id = ? AND invite_hash = ? AND type = 'group'", [$chatId, str_arg('hash', 64)]);
    if (!$chat) fail(404, 'bad_invite', 'invite link is invalid or was reset');
    $box = check_box((string)arg('box'));
    $db->tx(function () use ($db, $chatId, $me, $box) {
        $ex = $db->one('SELECT status FROM members WHERE chat_id = ? AND user_id = ?', [$chatId, $me['id']]);
        if ($ex && $ex['status'] === 'active') return;
        if ((int)$db->value("SELECT COUNT(*) FROM members WHERE chat_id = ? AND status = 'active'", [$chatId]) >= (int)Config::server('group')) fail(400, 'group_full', 'this group is full');
        $row = ['role' => 'member', 'key_box' => $box, 'status' => 'active', 'joined_at' => now(), 'read_seq' => 0, 'muted' => 0, 'cleared_seq' => 0, 'seq' => $db->nextSeq()];
        if ($ex) $db->update('members', $row, 'chat_id = ? AND user_id = ?', [$chatId, $me['id']]);
        else $db->insert('members', $row + ['chat_id' => $chatId, 'user_id' => $me['id']]);
        sys_message($db, $chatId, $me['id'], ['ev' => 'joined']);
    });
    out(['id' => $chatId]);
}

function r_chat_leave(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $chatId = str_arg('chat', 40);
    member_of($db, $chatId, $me['id']);
    $chat = $db->one('SELECT * FROM chats WHERE id = ?', [$chatId]);
    $db->tx(function () use ($db, $chat, $me) {
        $last = (int)$db->value('SELECT MAX(id) FROM messages WHERE chat_id = ?', [$chat['id']]);
        $db->update('members', ['status' => 'left', 'cleared_seq' => $last, 'seq' => $db->nextSeq()], 'chat_id = ? AND user_id = ?', [$chat['id'], $me['id']]);
        if ($chat['type'] === 'group') sys_message($db, $chat['id'], $me['id'], ['ev' => 'left']);
    });
    out();
}

function r_chat_update(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $chatId = str_arg('chat', 40);
    $mine = member_of($db, $chatId, $me['id']);
    $set = [];
    if (arg('muted') !== null) $set['muted'] = bool_arg('muted') ? 1 : 0;
    if (bool_arg('clear')) $set['cleared_seq'] = (int)$db->value('SELECT COALESCE(MAX(id), 0) FROM messages WHERE chat_id = ?', [$chatId]);
    if (arg('read') !== null) $set['read_seq'] = max((int)$mine['read_seq'], int_arg('read', 0, 0));
    if (arg('meta') !== null) {
        if ($mine['role'] !== 'owner') fail(403, 'forbidden', 'only the group owner can rename it');
        $db->tx(function () use ($db, $chatId) { $db->update('chats', ['meta' => blob_arg('meta', 20000), 'seq' => $db->nextSeq()], 'id = ?', [$chatId]); });
    }
    if (arg('inviteHash') !== null || arg('inviteWrap') !== null) {
        $chat = $db->one('SELECT type FROM chats WHERE id = ?', [$chatId]);
        if (!$chat || $chat['type'] !== 'group') fail(403, 'forbidden', 'direct chats cannot have invitations');
        $h = (string)arg('inviteHash');
        if (!preg_match('/^[a-f0-9]{64}$/', $h)) fail(400, 'bad_request', 'bad invite hash');
        $db->tx(function () use ($db, $chatId, $h) { $db->update('chats', ['invite_hash' => $h, 'invite_wrap' => blob_arg('inviteWrap', 300), 'seq' => $db->nextSeq()], 'id = ?', [$chatId]); });
    }
    if ($set) $db->tx(function () use ($db, $chatId, $me, $set) {
        $db->update('members', $set + ['seq' => $db->nextSeq()], 'chat_id = ? AND user_id = ?', [$chatId, $me['id']]);
        if (isset($set['read_seq'])) $db->update('chats', ['seq' => $db->nextSeq()], 'id = ?', [$chatId]);
    });
    out();
}

/** "is typing" for the other members. Ephemeral: never synced as a change, gone after a few seconds or on send. */
function r_chat_typing(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $chatId = str_arg('chat', 40);
    member_of($db, $chatId, $me['id']);
    if (random_int(0, 50) === 0) $db->exec('DELETE FROM typing WHERE exp_at < ?', [now()]);
    // Hiding your online status hides typing too.
    if (!(int)$me['show_online']) out();
    if (bool_arg('stop')) $db->exec('DELETE FROM typing WHERE chat_id = ? AND user_id = ?', [$chatId, $me['id']]);
    else { try { $db->upsert('typing', ['chat_id' => $chatId, 'user_id' => $me['id'], 'exp_at' => now() + 6], ['chat_id', 'user_id']); } catch (Throwable) { /* a parallel request already wrote it */ } }
    out();
}

// ---------------------------------------------------------------- messages

function r_msg_send(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $chatId = str_arg('chat', 40);
    member_of($db, $chatId, $me['id']);
    $cid = str_arg('cid', 40);
    if ($cid !== '' && ($dup = $db->one('SELECT * FROM messages WHERE client_id = ? AND sender_id = ?', [$cid, $me['id']]))) out(['message' => fmt_msg($dup)]);
    $rate = (int)Config::server('rate');
    if ((int)$db->value('SELECT COUNT(*) FROM messages WHERE sender_id = ? AND created_at > ?', [$me['id'], now() - 60]) >= $rate) {
        $db->log('ERR', 'rate-limit: ' . $me['username'] . ' exceeded ' . $rate . ' msg/min');
        fail(429, 'rate_limited', 'slow down · max ' . $rate . ' messages per minute', ['retry' => 20]);
    }
    $ct = blob_arg('ct', 64000);
    $blobIds = array_values(array_filter((array)arg('blobs', []), fn($b) => is_string($b) && preg_match('/^b_[a-f0-9]{24}$/', $b)));
    if ($blobIds && !Config::server('capAttach')) fail(403, 'cap_off', 'attachments are turned off on this server');
    foreach ($blobIds as $b) if (!blob_access($db, $b, $me['id'])) fail(403, 'forbidden', 'file not accessible');
    $msg = $db->tx(function () use ($db, $chatId, $me, $ct, $cid, $blobIds) {
        $seq = $db->nextSeq();
        $id = (int)$db->insert('messages', ['chat_id' => $chatId, 'sender_id' => $me['id'], 'kind' => 'msg', 'ct' => $ct, 'sys' => '', 'client_id' => $cid,
            'created_at' => now(), 'edited_at' => 0, 'deleted' => 0, 'hidden' => 0, 'reports' => 0, 'seq' => $seq, 'blob_ids' => json_encode($blobIds)]);
        foreach ($blobIds as $b) {
            $db->insert('blob_refs', ['blob_id' => $b, 'chat_id' => $chatId, 'msg_id' => $id]);
            $db->exec('UPDATE chats SET size_bytes = size_bytes + (SELECT size FROM blobs WHERE id = ?) WHERE id = ?', [$b, $chatId]);
        }
        $db->update('chats', ['seq' => $seq, 'last_at' => now()], 'id = ?', [$chatId]);
        // a direct chat the peer had deleted reappears for them, starting from this message
        $db->exec("UPDATE members SET status = 'active', seq = ? WHERE chat_id = ? AND status = 'left' AND SUBSTR(chat_id, 1, 2) = 'd_'", [$seq, $chatId]);
        $db->update('members', ['read_seq' => $id], 'chat_id = ? AND user_id = ?', [$chatId, $me['id']]);
        $db->exec('DELETE FROM typing WHERE chat_id = ? AND user_id = ?', [$chatId, $me['id']]);
        return $db->one('SELECT * FROM messages WHERE id = ?', [$id]);
    });
    $db->bump('msgs');
    $recipients = array_column($db->all("SELECT user_id FROM members WHERE chat_id = ? AND status = 'active' AND muted = 0 AND user_id <> ?", [$chatId, $me['id']]), 'user_id');
    $mentions = array_values(array_filter((array)arg('mentions', []), 'is_string'));
    $mutedMentioned = $mentions ? array_column($db->all("SELECT user_id FROM members WHERE chat_id = ? AND status = 'active' AND muted = 1 AND user_id IN (" . $db->in($mentions) . ')', array_merge([$chatId], $mentions)), 'user_id') : [];
    $all = array_values(array_unique(array_merge($recipients, $mutedMentioned)));
    $chat = $db->one('SELECT type FROM chats WHERE id = ?', [$chatId]);
    defer(function () use ($db, $all, $msg, $me, $chat, $mentions) {
        foreach ($all as $uid) {
            Push::toUsers($db, [$uid], ['v' => 1, 'type' => in_array($uid, $mentions, true) ? 'mention' : 'msg', 'chat' => $msg['chat_id'], 'chatType' => $chat['type'],
                'id' => (int)$msg['id'], 'from' => $me['id'], 'fromName' => $me['name'], 'ct' => strlen((string)$msg['ct']) < 2600 ? $msg['ct'] : null, 'ts' => (int)$msg['created_at']]);
        }
    });
    out(['message' => fmt_msg($msg)]);
}

function own_message(DB $db, array $me, int $id): array
{
    $m = $db->one('SELECT * FROM messages WHERE id = ?', [$id]);
    if (!$m || (int)$m['deleted']) fail(404, 'no_message', 'message not found');
    member_of($db, $m['chat_id'], $me['id']);
    if ($m['sender_id'] !== $me['id'] || $m['kind'] !== 'msg') fail(403, 'forbidden', 'you can only change your own messages');
    return $m;
}

function r_msg_edit(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    if (!Config::server('capEdit')) fail(403, 'cap_off', 'editing is turned off on this server');
    $m = own_message($db, $me, int_arg('id'));
    $win = Config::server('editWindow');
    if ($win !== 'always' && now() - (int)$m['created_at'] > (int)$win * 60) fail(403, 'edit_window', 'messages can only be edited for ' . ((int)$win >= 60 ? ((int)$win / 60) . ' h' : $win . ' min'));
    $ct = blob_arg('ct', 64000);
    $db->tx(function () use ($db, $m, $ct) {
        $seq = $db->nextSeq();
        $db->update('messages', ['ct' => $ct, 'edited_at' => now(), 'seq' => $seq], 'id = ?', [$m['id']]);
        $db->update('chats', ['seq' => $seq], 'id = ?', [$m['chat_id']]);
    });
    out();
}

function delete_message(DB $db, array $m): void
{
    $db->tx(function () use ($db, $m) {
        $seq = $db->nextSeq();
        $db->update('messages', ['deleted' => 1, 'ct' => '', 'seq' => $seq], 'id = ?', [$m['id']]);
        $db->exec('DELETE FROM blob_refs WHERE msg_id = ?', [$m['id']]);
        $db->update('chats', ['seq' => $seq], 'id = ?', [$m['chat_id']]);
    });
}

function r_msg_delete(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    if (!Config::server('capDelete')) fail(403, 'cap_off', 'deleting is turned off on this server');
    delete_message($db, own_message($db, $me, int_arg('id')));
    out();
}

function r_msg_report(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    if (!Config::server('reporting')) fail(403, 'cap_off', 'reports are turned off on this server');
    $m = $db->one('SELECT * FROM messages WHERE id = ?', [int_arg('id')]);
    if (!$m || $m['kind'] !== 'msg') fail(404, 'no_message', 'message not found');
    member_of($db, $m['chat_id'], $me['id']);
    if ($m['sender_id'] === $me['id']) fail(400, 'bad_request', "you can't report your own message");
    $reason = str_arg('reason', 32);
    if (!in_array($reason, ['spam', 'harassment', 'illegal content', 'impersonation', 'other'], true)) fail(400, 'bad_request', 'pick a reason');
    if ($db->value("SELECT COUNT(*) FROM reports WHERE msg_id = ? AND reporter_id = ?", [$m['id'], $me['id']])) fail(409, 'already_reported', 'you already reported this message');
    $id = 'R-' . (1000 + (int)$db->value('SELECT COUNT(*) FROM reports') + 1);
    $db->insert('reports', ['id' => $id, 'msg_id' => (int)$m['id'], 'chat_id' => $m['chat_id'], 'author_id' => $m['sender_id'], 'reporter_id' => $me['id'],
        'reason' => $reason, 'note' => str_arg('note', 200, true), 'body' => str_arg('body', 4000, true), 'created_at' => now(), 'status' => 'open',
        'outcome' => '', 'resolved_by' => '', 'resolved_at' => 0]);
    $hide = Config::server('reportHide');
    $db->exec('UPDATE messages SET reports = reports + 1 WHERE id = ?', [$m['id']]);
    if ($hide !== 'off' && (int)$m['reports'] + 1 >= (int)$hide && !(int)$m['hidden']) {
        $db->tx(function () use ($db, $m) {
            $seq = $db->nextSeq();
            $db->update('messages', ['hidden' => 1, 'seq' => $seq], 'id = ?', [$m['id']]);
            $db->update('chats', ['seq' => $seq], 'id = ?', [$m['chat_id']]);
        });
    }
    out(['id' => '#' . $id]);
}

// ---------------------------------------------------------------- files

function blob_access(DB $db, string $blobId, string $uid): bool
{
    $b = $db->one('SELECT owner_id, purpose FROM blobs WHERE id = ?', [$blobId]);
    if (!$b) return false;
    if ($b['owner_id'] === $uid || $b['purpose'] === 'avatar') return true;
    return (bool)$db->value("SELECT COUNT(*) FROM blob_refs r JOIN members m ON m.chat_id = r.chat_id AND m.user_id = ? AND m.status = 'active' WHERE r.blob_id = ?", [$uid, $blobId]);
}

function r_file_upload(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $purpose = str_arg('purpose', 8) === 'avatar' ? 'avatar' : 'file';
    if ($purpose === 'file' && !Config::server('capAttach')) fail(403, 'cap_off', 'attachments are turned off on this server');
    $f = $_FILES['file'] ?? null;
    $maxMb = (int)Config::server('upload');
    if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        $tooBig = $f && in_array($f['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
        fail($tooBig ? 413 : 400, $tooBig ? 'too_large' : 'upload_failed', $tooBig ? 'file is larger than this server allows (php limit ' . ini_get('upload_max_filesize') . ')' : 'upload failed', ['max' => $maxMb]);
    }
    $size = (int)$f['size'];
    if ($purpose === 'avatar') {
        $img = @getimagesize($f['tmp_name']);
        if (!$img || !in_array($img['mime'], ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], true) || $size > 2 * 1048576) fail(400, 'bad_image', 'photo must be png, jpeg, webp or gif under 2 MB');
    } elseif ($size > $maxMb * 1048576 + 4096) {
        fail(413, 'too_large', 'this server allows ' . $maxMb . ' MB per upload', ['max' => $maxMb]);
    }
    $used = used_bytes($db, $me['id']);
    if ($purpose === 'file' && $used + $size > quota_bytes($me)) fail(413, 'storage_full', 'storage full', ['used' => $used, 'quota' => quota_bytes($me)]);
    $id = new_id('b_', 12);
    $backend = Storage::tag(Config::get('storage'));
    try {
        Storage::at($backend)->put($id, (string)file_get_contents($f['tmp_name']));
    } catch (Throwable $e) {
        $db->log('ERR', 'storage: ' . $e->getMessage());
        fail(502, 'storage_failed', 'storage backend unavailable');
    }
    $old = null;
    try {
        $db->tx(function () use ($db, $me, $id, $size, $backend, $purpose, &$old) {
            if ($purpose === 'avatar') {
                $fresh = $db->lockUser($me['id']);
                $old = $fresh['avatar'];
            }
            $db->insert('blobs', ['id' => $id, 'owner_id' => $me['id'], 'size' => $size, 'backend' => $backend, 'purpose' => $purpose, 'created_at' => now()]);
            if ($purpose === 'avatar') $db->update('users', ['avatar' => $id, 'seq' => $db->nextSeq()], 'id = ?', [$me['id']]);
        });
    } catch (Throwable $e) {
        try { Storage::at($backend)->delete($id); } catch (Throwable) { /* best effort after failed persistence */ }
        throw $e;
    }
    if ($old) delete_blob($db, $old);
    out(['id' => $id, 'size' => $size]);
}

function delete_blob(DB $db, string $id): void
{
    $b = $db->one('SELECT * FROM blobs WHERE id = ?', [$id]);
    if (!$b) return;
    try { Storage::at($b['backend'])->delete($id); } catch (Throwable $e) { $db->log('WARN', 'storage delete ' . $id . ': ' . $e->getMessage()); }
    $db->exec('DELETE FROM blobs WHERE id = ?', [$id]);
    $db->exec('DELETE FROM blob_refs WHERE blob_id = ?', [$id]);
}

function r_file_get(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $id = str_arg('id', 40);
    if (!blob_access($db, $id, $me['id'])) fail(404, 'no_file', 'file not found');
    $b = $db->one('SELECT * FROM blobs WHERE id = ?', [$id]);
    try { $data = Storage::at($b['backend'])->get($id); } catch (Throwable $e) { $data = null; $db->log('ERR', 'storage get ' . $id . ': ' . $e->getMessage()); }
    if ($data === null) fail(404, 'no_file', 'file is missing from storage');
    $mime = 'application/octet-stream';
    if ($b['purpose'] === 'avatar') { $info = @getimagesizefromstring($data); if ($info) $mime = $info['mime']; }
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . strlen($data));
    header('Cache-Control: private, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    echo $data;
    exit;
}

function r_avatar_remove(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $old = $db->tx(function () use ($db, $me) {
        $fresh = $db->lockUser($me['id']);
        $db->update('users', ['avatar' => null, 'seq' => $db->nextSeq()], 'id = ?', [$me['id']]);
        return $fresh['avatar'];
    });
    if ($old) delete_blob($db, $old);
    out();
}

// ---------------------------------------------------------------- profile, people, devices

function r_profile(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $set = [];
    if (arg('name') !== null) { $set['name'] = str_arg('name', 80); if ($set['name'] === '') fail(400, 'bad_request', 'name required'); }
    if (arg('bio') !== null) $set['bio'] = str_arg('bio', 70);
    if (arg('phone') !== null) {
        $p = str_arg('phone', 32);
        if ($p !== '' && !preg_match('/^\+?[0-9 ()-]{4,32}$/', $p)) fail(400, 'bad_phone', 'phone: digits, spaces, + ( ) - only');
        if ($p !== '' && $db->value('SELECT COUNT(*) FROM users WHERE phone = ? AND id <> ?', [$p, $me['id']])) fail(409, 'phone_taken', 'phone already in use');
        $set['phone'] = $p ?: null;
    }
    if (arg('phoneVis') !== null && in_array(arg('phoneVis'), ['everyone', 'contacts', 'nobody'], true)) $set['phone_vis'] = arg('phoneVis');
    if (arg('phoneShares') !== null) {
        $shares = array_values(array_filter((array)arg('phoneShares'), fn($s) => is_string($s) && strlen($s) < 400));
        $set['phone_shares'] = json_encode(array_slice($shares, 0, 1000));
    }
    foreach (['findable' => 'findable', 'showOnline' => 'show_online', 'receipts' => 'receipts'] as $k => $col) if (arg($k) !== null) $set[$col] = bool_arg($k) ? 1 : 0;
    if ($set) $db->tx(function () use ($db, $me, $set) { $db->update('users', $set + ['seq' => $db->nextSeq()], 'id = ?', [$me['id']]); });
    out(['me' => fmt_me($db, $db->one('SELECT * FROM users WHERE id = ?', [$me['id']]))]);
}

function r_vault(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $data = (string)arg('data', '');
    if ($data === '' || strlen($data) > 4_000_000) fail(400, 'bad_request', 'bad vault');
    $ver = int_arg('ver');
    if ($ver !== (int)$me['vault_ver']) fail(409, 'vault_conflict', 'vault changed on another device', ['data' => $me['vault'], 'ver' => (int)$me['vault_ver']]);
    // The version check above is a snapshot; the guarded update decides which of two concurrent saves wins.
    if ($db->update('users', ['vault' => $data, 'vault_ver' => $ver + 1], 'id = ? AND vault_ver = ?', [$me['id'], $ver]) !== 1) {
        $cur = $db->one('SELECT vault, vault_ver FROM users WHERE id = ?', [$me['id']]);
        fail(409, 'vault_conflict', 'vault changed on another device', ['data' => $cur['vault'], 'ver' => (int)$cur['vault_ver']]);
    }
    out(['ver' => $ver + 1]);
}

function r_phrase(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $salt = (string)arg('rcSalt', '');
    $rc = unb64(blob_arg('rcAuth', 32));
    if (!valid_salt($salt) || strlen($rc) !== 32) fail(400, 'bad_keys', 'bad key material');
    $wrap = blob_arg('rcWrap', 300);
    // A new phrase can reset the password, so a session alone is not enough: prove the current password.
    $pw = unb64(blob_arg('auth', 32));
    if (!Auth::throttle($db, 'phrase:' . $me['id'], 8, 600)) fail(429, 'rate_limited', 'too many attempts · wait 10 minutes', ['retry' => 600]);
    $db->tx(function () use ($db, $me, $salt, $wrap, $rc, $pw) {
        $u = $db->lockUser($me['id']);
        if (strlen($pw) !== 32 || !hash_equals($u['auth_hash'], hash('sha256', $pw))) fail(403, 'bad_password', 'wrong password');
        $db->update('users', ['rc_salt' => $salt, 'rc_wrap' => $wrap, 'rc_hash' => hash('sha256', $rc)], 'id = ?', [$me['id']]);
        $db->exec('DELETE FROM kv WHERE k = ?', ['reset:' . $me['id']]);
    });
    out();
}

function r_users_search(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $q = strtolower(ltrim(str_arg('q', 40), '@'));
    if (strlen($q) < 2) out(['users' => []]);
    $like = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $q);
    $rows = $db->all("SELECT * FROM users WHERE status = 'active' AND id <> ? AND ((findable = 1 AND (username LIKE ? ESCAPE '!' OR LOWER(name) LIKE ? ESCAPE '!')) OR username = ?) ORDER BY username LIMIT 20",
        [$me['id'], $like . '%', '%' . $like . '%', $q]);
    out(['users' => array_map(fn($p) => fmt_person($p, $me), $rows)]);
}

function r_users_lookup(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $ids = array_slice(array_values(array_filter((array)arg('ids', []), 'is_string')), 0, 500);
    $rows = $ids ? $db->all('SELECT * FROM users WHERE id IN (' . $db->in($ids) . ')', $ids) : [];
    $out = [];
    foreach ($rows as $p) $out[$p['id']] = fmt_person($p, $me);
    out(['people' => (object)$out]);
}

function r_devices(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $rows = $db->all("SELECT * FROM sessions WHERE user_id = ? AND kind = 'app' AND revoked = 0 AND expires_at > ? ORDER BY last_seen DESC", [$me['id'], now()]);
    out(['devices' => array_map(function ($s) {
        [$browser, $os] = ua_summary($s['ua']);
        $standalone = str_contains($s['device'], 'pwa');
        return ['id' => $s['id'], 'name' => $s['device'], 'ua' => $browser . ' · ' . $os, 'where' => $s['ip'], 'seen' => (int)$s['last_seen'],
            'mobile' => in_array($os, ['ios', 'ipados', 'android'], true), 'current' => $s['id'] === Auth::$session['id'], 'pwa' => $standalone];
    }, $rows)]);
}

function r_devices_revoke(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    if (bool_arg('all')) {
        $n = Auth::revokeUser($db, $me['id'], 'self', Auth::$session['id']);
        out(['revoked' => $n]);
    }
    $id = str_arg('id', 40);
    if ($id === Auth::$session['id']) fail(400, 'bad_request', 'use log out for this device');
    $n = $db->exec("UPDATE sessions SET revoked = 1, revoked_by = 'self' WHERE id = ? AND user_id = ?", [$id, $me['id']]);
    $db->exec('DELETE FROM push_subs WHERE session_id = ?', [$id]);
    out(['revoked' => $n]);
}

function r_push_subscribe(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $endpoint = str_arg('endpoint', 600);
    if (!Push::validEndpoint($endpoint)) fail(400, 'bad_request', 'unsupported push endpoint');
    $p256dh = blob_arg('p256dh', 100);
    $auth = blob_arg('auth', 32);
    if (!Push::validKeys(unb64($p256dh), unb64($auth))) fail(400, 'bad_request', 'invalid push subscription keys');
    $db->exec('DELETE FROM push_subs WHERE session_id = ? OR endpoint = ?', [Auth::$session['id'], $endpoint]);
    $db->insert('push_subs', ['session_id' => Auth::$session['id'], 'user_id' => $me['id'], 'endpoint' => $endpoint,
        'p256dh' => $p256dh, 'auth' => $auth, 'created_at' => now(), 'fails' => 0]);
    out();
}

function r_push_unsubscribe(): never
{
    $db = DB::main();
    Auth::app($db);
    $db->exec('DELETE FROM push_subs WHERE session_id = ?', [Auth::$session['id']]);
    out();
}

function r_push_peek(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    $m = $db->one('SELECT * FROM messages WHERE id = ?', [int_arg('id')]);
    if (!$m) fail(404, 'no_message', 'gone');
    $mine = member_of($db, $m['chat_id'], $me['id']);
    out(['message' => fmt_msg($m), 'box' => $mine['key_box'], 'unread' => (int)$db->value("SELECT COUNT(*) FROM messages msg JOIN members mm ON mm.chat_id = msg.chat_id AND mm.user_id = ? AND mm.status = 'active' WHERE msg.id > mm.read_seq AND msg.sender_id <> ? AND msg.kind = 'msg' AND msg.deleted = 0", [$me['id'], $me['id']])]);
}

/**
 * Background check for the Android app when push services are out of reach: how many new messages arrived after
 * message id `since`, without any content and without marking the user online. since = 0 only reports the latest id.
 */
function r_notify_poll(): never
{
    $db = DB::main();
    $me = Auth::app($db, false, false);
    $since = max(0, int_arg('since'));
    $from = "FROM messages m JOIN members mm ON mm.chat_id = m.chat_id AND mm.user_id = ? AND mm.status = 'active' AND mm.muted = 0 WHERE m.kind = 'msg' AND m.deleted = 0";
    $latest = (int)$db->value("SELECT COALESCE(MAX(m.id), 0) $from", [$me['id']]);
    $count = $since > 0 ? (int)$db->value("SELECT COUNT(*) $from AND m.id > ? AND m.sender_id <> ?", [$me['id'], $since, $me['id']]) : 0;
    out(['latest' => $latest, 'count' => $count]);
}

// ---------------------------------------------------------------- user two-factor

function r_mfa_setup(): never
{
    $db = DB::main();
    $me = Auth::app($db, true);
    $result = $db->tx(function () use ($db, $me) {
        $u = $db->lockUser($me['id']);
        if ((int)$u['totp_on']) fail(403, 'forbidden', 'authenticator already enabled; use the console to replace a staff authenticator');
        return Auth::beginEnrollment($db, $u, 'app');
    });
    out($result);
}

function r_mfa_enable(): never
{
    $db = DB::main();
    $me = Auth::app($db, true);
    if (!Auth::throttle($db, 'enroll:' . $me['id'], 8, 600)) fail(429, 'rate_limited', 'too many codes');
    $codes = $db->tx(function () use ($db, $me) {
        $u = $db->lockUser($me['id']);
        $secret = Auth::pendingEnrollment($db, $u, 'app');
        if (!Totp::verify($secret, str_arg('code', 6))) fail(403, 'bad_code', 'code rejected · check your device clock');
        $codes = Config::server('tfaBackup') || Auth::staff($u) ? Totp::backupCodes() : [];
        $db->update('users', ['totp_secret' => $secret, 'totp_on' => 1, 'backup_codes' => json_encode(array_map(fn($c) => hash('sha256', $c), $codes))], 'id = ?', [$u['id']]);
        $db->exec('DELETE FROM kv WHERE k = ?', ['totp_pending:' . $u['id']]);
        $db->update('sessions', ['mfa_until' => 0], 'user_id = ? AND mfa_until = -1', [$u['id']]);
        return $codes;
    });
    out(['backupCodes' => $codes]);
}

function r_mfa_disable(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    if (mfa_required($me)) fail(403, 'mfa_required', 'this account requires two-factor authentication');
    $state = Auth::requireFactor($db, $me, 'code');
    $db->tx(function () use ($db, $me, $state) {
        $u = $db->lockUser($me['id']);
        if (mfa_required($u) || !hash_equals($state, Auth::factorState($u))) fail(403, 'forbidden', 'factor changed, start again');
        $db->update('users', ['totp_secret' => null, 'totp_on' => 0, 'backup_codes' => '[]'], 'id = ?', [$me['id']]);
        $db->exec('DELETE FROM kv WHERE k = ?', ['totp_pending:' . $me['id']]);
    });
    out();
}

function r_mfa_backup(): never
{
    $db = DB::main();
    $me = Auth::app($db);
    if (!(int)$me['totp_on'] || !Config::server('tfaBackup')) fail(400, 'bad_request', 'backup codes are not available');
    $state = Auth::requireFactor($db, $me);
    $codes = $db->tx(function () use ($db, $me, $state) {
        $u = $db->lockUser($me['id']);
        if (!hash_equals($state, Auth::factorState($u))) fail(403, 'forbidden', 'factor changed, start again');
        $codes = Totp::backupCodes();
        $db->update('users', ['backup_codes' => json_encode(array_map(fn($c) => hash('sha256', $c), $codes))], 'id = ?', [$me['id']]);
        return $codes;
    });
    out(['backupCodes' => $codes]);
}

function r_ann_ack(): never
{
    $db = DB::main();
    Auth::app($db);
    $db->exec('UPDATE announcements SET reach = reach + 1 WHERE id = ?', [int_arg('id')]);
    out();
}
