<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    fwrite(STDERR, "AyudaVE cron: config.php no existe.\n");
    exit(1);
}

$config = require $configFile;
if (!is_array($config)) {
    fwrite(STDERR, "AyudaVE cron: config.php invalido.\n");
    exit(1);
}

$token = (string) ($config['cron_token'] ?? '');
if ($token === '' || $token === 'cambiar-este-token-largo') {
    fwrite(STDERR, "AyudaVE cron: cron_token no configurado.\n");
    exit(1);
}

$siteUrl = rtrim((string) ($config['site_url'] ?? ''), '/');
if ($siteUrl === '') {
    fwrite(STDERR, "AyudaVE cron: site_url no configurado.\n");
    exit(1);
}
$sources = isset($config['sync_sources']) && is_array($config['sync_sources'])
    ? implode(',', array_map('strval', $config['sync_sources']))
    : '';
$url = $siteUrl . '/api.php?action=cron_sync&token=' . rawurlencode($token);
if ($sources !== '') {
    $url .= '&sources=' . rawurlencode($sources);
}

$logDir = __DIR__ . '/data';
if (!is_dir($logDir)) {
    mkdir($logDir, 0755, true);
}

function write_cron_line(string $logDir, int $status, bool $ok, string $summary): string
{
    $line = sprintf("[%s] status=%d ok=%s %s\n", date(DATE_ATOM), $status, $ok ? 'true' : 'false', $summary);
    file_put_contents($logDir . '/cron-sync.log', $line, FILE_APPEND | LOCK_EX);
    return $line;
}

$lockHandle = fopen($logDir . '/cron-sync.lock', 'c');
if ($lockHandle === false) {
    $line = write_cron_line($logDir, 500, false, 'No se pudo abrir cron-sync.lock');
    fwrite(STDERR, $line);
    exit(1);
}
if (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
    $line = write_cron_line($logDir, 208, true, '{"skipped":"cron already running"}');
    echo $line;
    fclose($lockHandle);
    exit(0);
}

function fetch_sync_url(string $url): array
{
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        return [$status, $body === false ? '' : (string) $body, $error];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\n",
            'timeout' => 120,
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
            $status = (int) $matches[1];
            break;
        }
    }
    return [$status, $body === false ? '' : (string) $body, $body === false ? 'HTTP request failed' : ''];
}

[$status, $body, $error] = fetch_sync_url($url);
$ok = $status >= 200 && $status < 300;
$payload = json_decode($body, true);
$summary = is_array($payload) ? json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : $body;
$line = write_cron_line($logDir, $status, $ok, $summary ?: $error);
flock($lockHandle, LOCK_UN);
fclose($lockHandle);

echo $line;
exit($ok ? 0 : 1);
