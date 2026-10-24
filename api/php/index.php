<?php
// CHATS server API · front controller. Deployed as <web root>/api/index.php; called as api/?r=<route>.
declare(strict_types=1);

// Responses are JSON: PHP notices go to the server's error log, never into a response (they would also leak paths).
ini_set('display_errors', '0');
ini_set('log_errors', '1');

define('CHATS_ROOT', dirname(__DIR__));
if (is_file(__DIR__ . '/config.local.php')) require __DIR__ . '/config.local.php';

foreach (['util', 'config', 'db', 'storage', 'mail', 'totp', 'push', 'auth'] as $f) require __DIR__ . '/lib/' . $f . '.php';
foreach (['public', 'app', 'admin'] as $f) require __DIR__ . '/routes/' . $f . '.php';

// Clients may be served from another origin and authenticate with bearer tokens (no cookies), so any origin may call the API.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Expose-Headers: Content-Length');
header('Access-Control-Max-Age: 86400');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

const ROUTES = [
    'GET info' => 'r_info', 'GET invite' => 'r_invite_preview',
    'GET setup/status' => 'r_setup_status', 'POST setup/unlock' => 'r_setup_unlock', 'POST setup/test' => 'r_setup_test', 'POST setup/launch' => 'r_setup_launch',
    'POST auth/check' => 'r_auth_check', 'POST auth/prelogin' => 'r_auth_prelogin', 'POST auth/login' => 'r_auth_login', 'POST auth/2fa' => 'r_auth_2fa',
    'POST auth/2fa-email' => 'r_auth_2fa_email', 'POST auth/enroll' => 'r_auth_enroll', 'POST auth/signup' => 'r_auth_signup',
    'POST auth/recover-salt' => 'r_auth_recover_salt', 'POST auth/recover' => 'r_auth_recover', 'POST auth/reset' => 'r_auth_reset', 'POST auth/logout' => 'r_auth_logout',
    'POST sync' => 'r_sync', 'GET history' => 'r_history',
    'POST chat/direct' => 'r_chat_direct', 'POST chat/group' => 'r_chat_group', 'POST chat/add' => 'r_chat_add', 'POST chat/join-info' => 'r_chat_join_info',
    'POST chat/join' => 'r_chat_join', 'POST chat/leave' => 'r_chat_leave', 'POST chat/update' => 'r_chat_update', 'POST chat/typing' => 'r_chat_typing',
    'POST msg/send' => 'r_msg_send', 'POST msg/edit' => 'r_msg_edit', 'POST msg/delete' => 'r_msg_delete', 'POST msg/report' => 'r_msg_report',
    'POST file/upload' => 'r_file_upload', 'GET file' => 'r_file_get', 'POST avatar/remove' => 'r_avatar_remove',
    'POST profile' => 'r_profile', 'POST vault' => 'r_vault', 'POST phrase' => 'r_phrase',
    'GET users/search' => 'r_users_search', 'POST users/lookup' => 'r_users_lookup',
    'GET devices' => 'r_devices', 'POST devices/revoke' => 'r_devices_revoke',
    'POST push/subscribe' => 'r_push_subscribe', 'POST push/unsubscribe' => 'r_push_unsubscribe', 'GET push/peek' => 'r_push_peek', 'GET notify/poll' => 'r_notify_poll',
    'POST mfa/setup' => 'r_mfa_setup', 'POST mfa/enable' => 'r_mfa_enable', 'POST mfa/disable' => 'r_mfa_disable', 'POST mfa/backup' => 'r_mfa_backup',
    'POST ann/ack' => 'r_ann_ack',
    'GET admin/me' => 'r_admin_me', 'POST admin/mfa' => 'r_admin_mfa', 'GET admin/overview' => 'r_admin_overview',
    'GET admin/users' => 'r_admin_users', 'GET admin/user' => 'r_admin_user', 'POST admin/user' => 'r_admin_user_action', 'POST admin/users/bulk' => 'r_admin_users_bulk',
    'GET admin/reports' => 'r_admin_reports', 'POST admin/report' => 'r_admin_report',
    'GET admin/invites' => 'r_admin_invites', 'POST admin/invite' => 'r_admin_invite_create', 'POST admin/invite/revoke' => 'r_admin_invite_revoke',
    'GET admin/chats' => 'r_admin_chats', 'POST admin/chat/delete' => 'r_admin_chat_delete',
    'GET admin/storage' => 'r_admin_storage', 'POST admin/orphans' => 'r_admin_orphans', 'POST admin/blob/delete' => 'r_admin_blob_delete',
    'GET admin/config' => 'r_admin_config', 'POST admin/config' => 'r_admin_config_save', 'POST admin/test' => 'r_admin_test',
    'POST admin/announce' => 'r_admin_announce', 'GET admin/announcements' => 'r_admin_announcements', 'GET admin/audit' => 'r_admin_audit',
    'GET admin/admins' => 'r_admin_admins', 'POST admin/ips' => 'r_admin_ips', 'POST admin/session/revoke' => 'r_admin_session_revoke',
    'GET admin/health' => 'r_admin_health', 'POST admin/backup' => 'r_admin_backup', 'GET admin/backup' => 'r_admin_backup_download',
];

$route = trim((string)($_GET['r'] ?? ''), '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
try {
    $fn = ROUTES[$method . ' ' . $route] ?? null;
    if (!$fn) fail(404, 'no_route', 'unknown endpoint ' . $method . ' ' . $route);
    $fn();
} catch (HttpError $e) {
    http_response_code($e->status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if ($e->status === 503 && $e->codeName === 'maintenance') header('Retry-After: 30');
    echo json_encode(['ok' => false, 'code' => $e->codeName, 'error' => $e->getMessage()] + $e->extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    error_log('chats: ' . $e);
    try { if (Config::installed()) DB::main()->log('ERR', $route . ': ' . $e->getMessage()); } catch (Throwable) {}
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'code' => 'server_error', 'error' => 'server error · see the error log']);
}
