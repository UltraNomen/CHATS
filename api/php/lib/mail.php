<?php
// Minimal SMTP client: plain, STARTTLS or implicit TLS, AUTH LOGIN.
declare(strict_types=1);

final class Mail
{
    public static function send(array $cfg, string $to, string $subject, string $text): string
    {
        if (!$cfg['host']) throw new RuntimeException('host is empty');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('enter a recipient address');
        $sec = $cfg['sec'];
        $port = (int)$cfg['port'] ?: ($sec === 'tls' ? 465 : ($sec === 'starttls' ? 587 : 25));
        $remote = ($sec === 'tls' ? 'ssl://' : 'tcp://') . $cfg['host'] . ':' . $port;
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
        $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) throw new RuntimeException('cannot connect to ' . $cfg['host'] . ':' . $port . ' · ' . $errstr);
        stream_set_timeout($fp, 20);
        $read = function () use ($fp): array {
            $text = '';
            while (($line = fgets($fp, 1024)) !== false) {
                $text .= $line;
                if (strlen($line) < 4 || $line[3] === ' ') break;
            }
            return [(int)substr($text, 0, 3), trim($text)];
        };
        $cmd = function (string $c, array $expect) use ($fp, $read): string {
            fwrite($fp, $c . "\r\n");
            [$code, $msg] = $read();
            if (!in_array($code, $expect, true)) throw new RuntimeException($msg ?: 'no reply to ' . strtok($c, ' '));
            return $msg;
        };
        try {
            [$code, $msg] = $read();
            if ($code !== 220) throw new RuntimeException($msg ?: 'no greeting');
            $helo = gethostname() ?: 'localhost';
            $cmd('EHLO ' . $helo, [250]);
            if ($sec === 'starttls') {
                $cmd('STARTTLS', [220]);
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) throw new RuntimeException('tls handshake failed');
                $cmd('EHLO ' . $helo, [250]);
            }
            if ($cfg['user'] !== '') {
                $cmd('AUTH LOGIN', [334]);
                $cmd(base64_encode($cfg['user']), [334]);
                $cmd(base64_encode($cfg['pass']), [235]);
            }
            $from = $cfg['from'] ?: 'no-reply@' . $cfg['host'];
            $cmd('MAIL FROM:<' . $from . '>', [250]);
            $cmd('RCPT TO:<' . $to . '>', [250, 251]);
            $cmd('DATA', [354]);
            $headers = [
                'From: ' . self::encode($cfg['fromName'] ?: 'CHATS') . ' <' . $from . '>',
                'To: <' . $to . '>',
                'Subject: ' . self::encode($subject),
                'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
                'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . (explode('@', $from)[1] ?? 'chats') . '>',
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=utf-8',
                'Content-Transfer-Encoding: 8bit',
            ];
            $body = preg_replace('/^\./m', '..', str_replace(["\r\n", "\r"], "\n", $text));
            $reply = $cmd(implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", $body) . "\r\n.", [250]);
            $cmd('QUIT', [221]);
            return $reply;
        } finally {
            fclose($fp);
        }
    }

    private static function encode(string $s): string
    {
        return preg_match('/[^\x20-\x7E]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
    }
}
