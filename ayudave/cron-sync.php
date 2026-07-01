<?php
declare(strict_types=1);

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    cron_fail(500, 'AyudaVE cron: config.php no existe.');
}

$config = require $configFile;
if (!is_array($config)) {
    cron_fail(500, 'AyudaVE cron: config.php invalido.');
}

$token = (string) ($config['cron_token'] ?? '');
if ($token === '' || $token === 'cambiar-este-token-largo') {
    cron_fail(500, 'AyudaVE cron: cron_token no configurado.');
}

if (PHP_SAPI !== 'cli') {
    $givenToken = (string) ($_GET['token'] ?? $_GET['cron_token'] ?? '');
    if (!hash_equals($token, $givenToken)) {
        cron_fail(403, 'Token invalido.');
    }
}

$siteUrl = rtrim((string) ($config['site_url'] ?? ''), '/');
if ($siteUrl === '') {
    cron_fail(500, 'AyudaVE cron: site_url no configurado.');
}

$configuredSources = isset($config['sync_sources']) && is_array($config['sync_sources'])
    ? array_values(array_map('strval', $config['sync_sources']))
    : [];
$requestedSources = PHP_SAPI === 'cli' ? '' : (string) ($_GET['sources'] ?? '');
$sources = $requestedSources !== ''
    ? array_values(array_filter(array_map('trim', explode(',', $requestedSources))))
    : $configuredSources;

$logDir = __DIR__ . '/data';
if (!is_dir($logDir)) {
    mkdir($logDir, 0755, true);
}

function cron_fail(int $status, string $message): void
{
    if (PHP_SAPI !== 'cli') {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Robots-Tag: noindex, nofollow');
        echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    } else {
        fwrite(STDERR, $message . "\n");
    }
    exit(1);
}

function write_cron_line(string $logDir, int $status, bool $ok, string $summary): string
{
    $safeSummary = preg_replace('/token[^,} ]*/i', 'token=[removido]', $summary) ?: $summary;
    $line = sprintf("[%s] status=%d ok=%s %s\n", date(DATE_ATOM), $status, $ok ? 'true' : 'false', $safeSummary);
    file_put_contents($logDir . '/cron-sync.log', $line, FILE_APPEND | LOCK_EX);
    return $line;
}

$lockHandle = fopen($logDir . '/cron-sync.lock', 'c');
if ($lockHandle === false) {
    $line = write_cron_line($logDir, 500, false, 'No se pudo abrir cron-sync.lock');
    cron_fail(500, trim($line));
}
if (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
    $line = write_cron_line($logDir, 208, true, '{"skipped":"cron already running"}');
    if (PHP_SAPI !== 'cli') {
        http_response_code(208);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Robots-Tag: noindex, nofollow');
        echo json_encode(['ok' => true, 'skipped' => 'cron already running'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    } else {
        echo $line;
    }
    fclose($lockHandle);
    exit(0);
}

function fetch_sync_request(string $url, string $token, array $sources): array
{
    $payload = json_encode(['action' => 'cron_sync', 'sources' => $sources], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return [500, '', 'No se pudo serializar el payload.'];
    }

    $headers = [
        'Accept: application/json',
        'Content-Type: application/json',
        'X-AyudaVE-Cron-Token: ' . $token,
    ];

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        return [$status, $body === false ? '' : (string) $body, $error];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers) . "\r\n",
            'content' => $payload,
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

[$status, $body, $error] = fetch_sync_request($siteUrl . '/api.php', $token, $sources);
$ok = $status >= 200 && $status < 300;
$payload = json_decode($body, true);
$summary = is_array($payload) ? json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : $body;
$line = write_cron_line($logDir, $status, $ok, $summary ?: $error);
flock($lockHandle, LOCK_UN);
fclose($lockHandle);

if (PHP_SAPI !== 'cli') {
    http_response_code($ok ? 200 : 502);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');
    echo json_encode([
        'ok' => $ok,
        'upstreamStatus' => $status,
        'summary' => is_array($payload) ? $payload : trim($summary ?: $error),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} else {
    echo $line;
}
exit($ok ? 0 : 1);
