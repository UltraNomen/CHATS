<?php
// Offline unit checks; no network requests or deployed credentials.
declare(strict_types=1);
require __DIR__ . '/../lib/util.php';
require __DIR__ . '/../lib/push.php';
function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
foreach (['https://fcm.googleapis.com/wp/test', 'https://updates.push.services.mozilla.com/wpush/v2/test',
    'https://web.push.apple.com/test', 'https://wns2-test.notify.windows.com/w/?token=x'] as $url) {
    check(Push::validEndpoint($url), 'supported provider rejected');
}
foreach (['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://localhost/x',
    'https://fcm.googleapis.com.evil.test/x', 'https://evil.test@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x', "https://fcm.googleapis.com/x\r\nHost:localhost", 'https://fcm.googleapis.com/x#fragment',
    'https://fcm.googleapis.com./x', 'https://fcm.googleapis.com\\@127.0.0.1/x'] as $url) {
    check(!Push::validEndpoint($url), 'unsafe endpoint accepted');
    check(Push::send(['endpoint' => $url], []) === 410, 'historical unsafe endpoint reached delivery');
}
foreach (['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '198.18.0.1', '224.0.0.1', '::1',
    '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2002:7f00:1::1', '2001:0:1::1'] as $ip) {
    check(!Push::publicAddress($ip), 'non-public address allowed: ' . $ip);
}
foreach (['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'] as $ip) check(Push::publicAddress($ip), 'public address rejected');
foreach ([['', ''], [b64(random_bytes(65)), b64(random_bytes(16))], [b64("\x04" . str_repeat("\x01", 64)), b64(random_bytes(16))]] as [$k, $a]) {
    check(Push::send(['endpoint' => 'https://fcm.googleapis.com/wp/x', 'p256dh' => $k, 'auth' => $a], ['v' => 1]) === 410, 'unusable subscription keys not pruned before any network use');
}
echo "PASS push: provider policy, parser aliases, stored subscriptions and address ranges\n";

define('CHATS_ROOT', dirname(__DIR__, 2));
define('CHATS_DATA', sys_get_temp_dir() . '/chats-security-unit-' . bin2hex(random_bytes(8)));
foreach (['config', 'db', 'totp', 'auth'] as $lib) require __DIR__ . '/../lib/' . $lib . '.php';
require __DIR__ . '/../routes/public.php';
require __DIR__ . '/../routes/app.php';
Config::save(['installed' => true, 'server' => ['tfaEmail' => true, 'tfaBackup' => true], 'smtp' => ['on' => true]]);
$db = DB::main();
$db->createSchema();
$uid = 'u_0123456789abcdef';
$db->insert('users', ['id' => $uid, 'username' => 'unituser', 'role' => 'user', 'status' => 'active', 'email' => 'unit@example.test']);
$u = $db->one('SELECT * FROM users WHERE id = ?', [$uid]);
$a = Auth::ticket('2fa', $uid); $b = Auth::ticket('2fa', $uid);
$db->kvSet(email_challenge_key($a), ['hash' => hash('sha256', '123456'), 'exp' => now() + 100]);
check(!check_second_factor($db, $u, 'email', '123456', $b), 'email code crossed challenge boundary');
check(check_second_factor($db, $u, 'email', '123456', $a), 'correct email challenge failed');
check(!check_second_factor($db, $u, 'email', '123456', $a), 'email code reused');
check(!in_array('email', login_factors($u, true), true), 'admin email factor allowed');
$u['role'] = 'admin';
check(!in_array('email', login_factors($u, false), true), 'staff app used email factor');
$reset = Auth::ticket('reset', $uid);
$db->tx(function () use ($db, $uid, $reset) { $db->lockUser($uid); Auth::consumeReset($db, $reset); });
try { Auth::checkTicket($reset, 'reset'); throw new RuntimeException('consumed reset accepted'); } catch (HttpError $e) { check($e->codeName === 'bad_ticket', 'wrong reset error'); }
$reset = Auth::ticket('reset', $uid);
$db->update('users', ['rc_hash' => 'rotated'], 'id = ?', [$uid]);
try { Auth::checkTicket($reset, 'reset'); throw new RuntimeException('rotated recovery state accepted'); } catch (HttpError $e) { check($e->codeName === 'bad_ticket', 'wrong rotation error'); }
echo "PASS challenges: email policy, ticket binding, code consumption and reset invalidation\n";

$db->update('users', ['auth_hash' => hash('sha256', 'a'), 'pw_salt' => 's1'], 'id = ?', [$uid]);
$u = $db->one('SELECT * FROM users WHERE id = ?', [$uid]);
$trust = trust_token($u, 7);
check(trust_ok($u, $trust), 'fresh trust token rejected');
foreach ([['auth_hash' => hash('sha256', 'b')], ['totp_secret' => 'JBSWY3DPEHPK3PXP', 'totp_on' => 1]] as $change) {
    $db->update('users', $change, 'id = ?', [$uid]);
    check(!trust_ok($db->one('SELECT * FROM users WHERE id = ?', [$uid]), $trust), 'trust token survived a credential change');
}
check(!trust_ok(['id' => 'u_other'] + $u, $trust), 'trust token crossed accounts');
echo "PASS trust tokens are bound to the account and its current credentials\n";

// No push service reachable (e.g. domestic-only internet): after two failed rounds, sending pauses instead of slowing every message.
putenv('CHATS_PUSH_HOSTS=push.invalid');
$k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
$ec = openssl_pkey_get_details($k)['ec'];
$p256 = "\x04" . str_pad($ec['x'], 32, "\0", STR_PAD_LEFT) . str_pad($ec['y'], 32, "\0", STR_PAD_LEFT);
$db->insert('push_subs', ['session_id' => 's_unit', 'user_id' => $uid, 'endpoint' => 'https://push.invalid/sub', 'p256dh' => b64url($p256), 'auth' => b64url(random_bytes(16)), 'created_at' => now(), 'fails' => 0]);
$fails = fn() => (int)$db->value('SELECT fails FROM push_subs WHERE user_id = ?', [$uid]);
Push::toUsers($db, [$uid], ['v' => 1]);
check($fails() === 1 && (int)$db->kvGet('push_pause_until', 0) === 0, 'push paused after a single unreachable round');
Push::toUsers($db, [$uid], ['v' => 1]);
check($fails() === 2 && (int)$db->kvGet('push_pause_until', 0) > now(), 'push not paused after two unreachable rounds');
Push::toUsers($db, [$uid], ['v' => 1]);
check($fails() === 2, 'paused push still tried to send');
$db->exec('DELETE FROM push_subs WHERE user_id = ?', [$uid]);
echo "PASS push pauses itself when no push service is reachable\n";

// Even old direct chats with matching invitation hashes cannot be joined.
$finished = false;
register_shutdown_function(function () use (&$finished) { if (!$finished) { fwrite(STDERR, "FAIL direct join escaped its type guard\n"); exit(1); } });
$sess = Auth::createSession($db, $uid, 'app');
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $sess['token'];
$_POST = ['chat' => 'd_contaminated', 'hash' => str_repeat('a', 64), 'box' => b64(random_bytes(96))];
$db->insert('chats', ['id' => 'd_contaminated', 'type' => 'direct', 'invite_hash' => $_POST['hash']]);
try { r_chat_join(); throw new RuntimeException('direct join returned'); } catch (HttpError $e) { check($e->codeName === 'bad_invite', 'unexpected direct join error'); }
$finished = true;
echo "PASS direct join rejects previously contaminated invitation state\n";
