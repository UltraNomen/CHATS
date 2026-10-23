<?php
// Local TLS transport fixture: use only in an isolated container with /tls test certificates.
declare(strict_types=1);
if (($argv[1] ?? '') === 'serve') {
    $ctx = stream_context_create(['ssl' => ['local_cert' => '/tls/cert.pem', 'local_pk' => '/tls/key.pem', 'verify_peer' => false]]);
    $server = stream_socket_server('tls://127.0.0.1:443', $errno, $error, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN, $ctx);
    if (!$server) throw new RuntimeException($error);
    for ($i = 0; $i < 2; $i++) {
        $client = stream_socket_accept($server, 15);
        if (!$client) throw new RuntimeException('TLS test client did not connect');
        $headers = '';
        while (($line = fgets($client)) !== false && trim($line) !== '') $headers .= $line;
        if (!preg_match('/^Host: push\.test\r?$/mi', $headers)) throw new RuntimeException('wrong pinned HTTP Host');
        fwrite($client, "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
        fclose($client);
    }
    fclose($server);
} else {
    require __DIR__ . '/../lib/util.php';
    [$status, $body] = http_request('GET', 'https://push.test/', [], '', 5, ['host' => 'push.test', 'ip' => '127.0.0.1']);
    if ($status !== 200 || $body !== 'ok') throw new RuntimeException('pinned TLS request failed');
    echo 'PASS pinned TLS/Host via ' . (function_exists('curl_init') ? 'cURL' : 'PHP streams') . "\n";
}
