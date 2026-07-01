<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

$publicReadActions = ['metadata', 'sync_status', 'export_public', 'export_csv', 'people', 'external_metrics'];
$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$requestAction = preg_replace('/[^a-z0-9_]/i', '', (string) ($_GET['action'] ?? ''));
if (in_array($requestAction, $publicReadActions, true) && in_array($requestMethod, ['GET', 'HEAD', 'OPTIONS'], true)) {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
    header('Access-Control-Allow-Headers: Accept');
    header('Vary: Accept');
    if ($requestMethod === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

$allowedTypes = ['Agua', 'Comida', 'Medicina', 'Refugio', 'Traslado', 'Energia/senal'];
$allowedPriorities = ['Alta', 'Media', 'Baja'];
$allowedStatuses = ['Sin validar', 'Confirmado', 'Resuelto'];
$allowedMemberRoles = ['voluntario', 'punto_ayuda', 'salud', 'transporte', 'verificador'];
$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/reports.json';
$membersFile = $dataDir . '/community-members.json';
$cronLogFile = $dataDir . '/cron-sync.log';
$syncCursorFile = $dataDir . '/sync-cursors.json';
$configFile = __DIR__ . '/config.php';
$sourcesFile = __DIR__ . '/sources.json';
$adminPin = getenv('AYUDAVE_ADMIN_PIN') ?: '';
$cronToken = getenv('AYUDAVE_CRON_TOKEN') ?: '';
$syncSources = ['terremotovenezuela_reports', 'centros_acopio', 'venezuela_reporta_sitios', 'refugios_venezuela', 'acopios_refugios', 'venezuela_reporta_personas', 'venezuela_reporta_ingresos', 'localizados_venezuela'];
$publicExportConfig = ['enabled' => true, 'max_reports' => 500, 'max_help_points' => 1000, 'max_missing_people' => 5000];
$externalApiKeys = [];
$dbConfig = null;
$dbRequired = false;

if (is_file($configFile)) {
    $config = require $configFile;
    if (is_array($config) && isset($config['admin_pin'])) {
        $adminPin = (string) $config['admin_pin'];
    }
    if (is_array($config) && isset($config['cron_token'])) {
        $cronToken = (string) $config['cron_token'];
    }
    if (is_array($config) && isset($config['sync_sources']) && is_array($config['sync_sources'])) {
        $syncSources = array_values(array_filter(array_map('strval', $config['sync_sources'])));
    }
    foreach (['venezuela_reporta_personas', 'venezuela_reporta_ingresos', 'localizados_venezuela'] as $requiredSource) {
        if (!in_array($requiredSource, $syncSources, true)) {
            $syncSources[] = $requiredSource;
        }
    }
    if (is_array($config) && isset($config['public_export']) && is_array($config['public_export'])) {
        $publicExportConfig = array_merge($publicExportConfig, $config['public_export']);
    }
    if (is_array($config) && isset($config['external_api_keys']) && is_array($config['external_api_keys'])) {
        $externalApiKeys = $config['external_api_keys'];
    }
    if (is_array($config) && isset($config['db']) && is_array($config['db'])) {
        $dbConfig = $config['db'];
    }
    if (is_array($config) && isset($config['db_required'])) {
        $dbRequired = (bool) $config['db_required'];
    }
}

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function respond_csv(string $filename, array $columns, array $rows): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $output = fopen('php://output', 'w');
    if ($output === false) {
        respond(500, ['ok' => false, 'error' => 'No se pudo generar CSV.']);
    }
    fputcsv($output, $columns);
    foreach ($rows as $row) {
        $line = [];
        foreach ($columns as $column) {
            $value = $row[$column] ?? '';
            if (is_bool($value)) {
                $value = $value ? 'true' : 'false';
            }
            $line[] = $value === null ? '' : (string) $value;
        }
        fputcsv($output, $line);
    }
    fclose($output);
    exit;
}

function public_base_url(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $path = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? ''))), '/');
    return $scheme . '://' . $host . ($path === '' ? '' : $path);
}

function read_public_sources(string $sourcesFile): array
{
    if (!is_file($sourcesFile)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($sourcesFile), true);
    return is_array($decoded) ? $decoded : [];
}

function public_data_policy(): array
{
    return [
        'license' => [
            'name' => 'CC BY 4.0',
            'url' => 'https://creativecommons.org/licenses/by/4.0/',
        ],
        'usage' => [
            'attributionRequired' => true,
            'attributionText' => 'Datos: AyudaVE y fuentes externas indicadas en cada registro.',
            'privacy' => 'No reidentificar personas ni combinar estos datos con listas de desaparecidos, cedulas, telefonos privados o datos de menores.',
            'validation' => 'Antes de movilizar recursos, priorizar registros Confirmado o Verificado en origen y revalidar localmente los registros Sin validar.',
        ],
    ];
}

function public_metadata(string $sourcesFile, array $publicExportConfig): array
{
    $baseUrl = public_base_url();
    $sources = read_public_sources($sourcesFile);
    $policy = public_data_policy();
    return [
        'ok' => true,
        'schema' => 'ayudave-public-metadata-v1',
        'generatedAt' => date(DATE_ATOM),
        'source' => 'AyudaVE',
        'baseUrl' => $baseUrl,
        'license' => $policy['license'],
        'usage' => $policy['usage'],
        'exports' => [
            'json' => $baseUrl . '/api.php?action=export_public',
            'jsonIncremental' => $baseUrl . '/api.php?action=export_public&since=2026-06-28T00:00:00Z',
            'csvReports' => $baseUrl . '/api.php?action=export_csv&dataset=reports',
            'csvHelpPoints' => $baseUrl . '/api.php?action=export_csv&dataset=helpPoints',
            'csvMissingPeople' => $baseUrl . '/api.php?action=export_csv&dataset=missingPeople',
            'syncStatus' => $baseUrl . '/api.php?action=sync_status',
            'externalMetrics' => $baseUrl . '/api.php?action=external_metrics',
            'schema' => $baseUrl . '/ayudave-public-export.schema.json',
            'openapi' => $baseUrl . '/openapi.json',
            'enabled' => !empty($publicExportConfig['enabled']),
        ],
        'statuses' => [
            'Sin validar' => 'Necesita confirmacion local antes de movilizar recursos.',
            'Confirmado' => 'Validado por fuente externa confiable o moderacion comunitaria.',
            'Resuelto' => 'Necesidad atendida o ya no activa.',
            'Abierto' => 'Punto de ayuda informado como operativo por una fuente externa.',
        ],
        'trustLevels' => [
            'verified_origin' => 'Dato confirmado por su fuente original.',
            'external_pending' => 'Dato de fuente externa que debe validarse localmente.',
            'community_confirmed' => 'Dato confirmado por moderacion o seguimiento comunitario.',
            'community_pending' => 'Dato comunitario recibido, pendiente de validacion.',
            'resolved' => 'Dato marcado como resuelto.',
        ],
        'privacy' => [
            'personalContacts' => false,
            'sensitiveFieldsRedacted' => true,
            'exactPrivateAddressesDiscouraged' => true,
        ],
        'sources' => $sources['sources'] ?? [],
        'sourcesUpdatedAt' => $sources['updated'] ?? null,
    ];
}

function read_cron_status(string $cronLogFile): array
{
    if (!is_file($cronLogFile)) {
        return ['configured' => false, 'lastRunAt' => null, 'lastStatus' => null, 'lastOk' => null, 'lastSummary' => null];
    }

    $lines = file($cronLogFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) {
        return ['configured' => true, 'lastRunAt' => null, 'lastStatus' => null, 'lastOk' => null, 'lastSummary' => null];
    }

    $lastLine = (string) end($lines);
    if (preg_match('/^\[(.*?)\]\s+status=(\d+)\s+ok=(true|false)\s*(.*)$/', $lastLine, $matches)) {
        return [
            'configured' => true,
            'lastRunAt' => $matches[1],
            'lastStatus' => (int) $matches[2],
            'lastOk' => $matches[3] === 'true',
            'lastSummary' => clean_text($matches[4] ?? '', 600),
        ];
    }

    return [
        'configured' => true,
        'lastRunAt' => null,
        'lastStatus' => null,
        'lastOk' => null,
        'lastSummary' => clean_text($lastLine, 600),
    ];
}

function write_cron_status(string $cronLogFile, int $status, bool $ok, array $payload): void
{
    $dir = dirname($cronLogFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $summary = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $line = sprintf("[%s] status=%d ok=%s %s\n", date(DATE_ATOM), $status, $ok ? 'true' : 'false', clean_text($summary ?: '', 1200));
    @file_put_contents($cronLogFile, $line, FILE_APPEND | LOCK_EX);
}

function read_sync_cursors(string $cursorFile): array
{
    if (!is_file($cursorFile)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($cursorFile), true);
    return is_array($decoded) ? $decoded : [];
}

function write_sync_cursors(string $cursorFile, array $cursors): void
{
    $dir = dirname($cursorFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents($cursorFile, json_encode($cursors, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
}

function file_sync_summary(string $dataFile): array
{
    $reports = read_reports($dataFile);
    $summary = [];
    foreach ($reports as $report) {
        $source = (string) ($report['source'] ?? 'ayudave');
        if ($source === '') $source = 'ayudave';
        if (!isset($summary[$source])) {
            $summary[$source] = [
                'source' => $source,
                'total' => 0,
                'pending' => 0,
                'confirmed' => 0,
                'resolved' => 0,
                'lastSyncedAt' => null,
                'lastUpdatedAt' => null,
            ];
        }
        $status = (string) ($report['status'] ?? 'Sin validar');
        $summary[$source]['total']++;
        if ($status === 'Sin validar') $summary[$source]['pending']++;
        if ($status === 'Confirmado') $summary[$source]['confirmed']++;
        if ($status === 'Resuelto') $summary[$source]['resolved']++;
        if (!empty($report['syncedAt'])) $summary[$source]['lastSyncedAt'] = (string) $report['syncedAt'];
        if (!empty($report['updatedAt'])) $summary[$source]['lastUpdatedAt'] = (string) $report['updatedAt'];
    }
    ksort($summary);
    return array_values($summary);
}

function file_read_health(string $dataFile): array
{
    $reports = read_reports($dataFile);
    $health = [
        'database' => false,
        'total' => count($reports),
        'localReports' => 0,
        'externalRecords' => 0,
        'pending' => 0,
        'confirmed' => 0,
        'resolved' => 0,
        'missingCoordinates' => 0,
        'privacyReviewed' => 0,
        'externalPending' => 0,
        'lastUpdatedAt' => null,
        'lastSyncedAt' => null,
        'sources' => file_sync_summary($dataFile),
    ];

    $lastUpdated = 0;
    $lastSynced = 0;
    foreach ($reports as $report) {
        $source = trim((string) ($report['source'] ?? ''));
        $status = (string) ($report['status'] ?? 'Sin validar');
        $lat = $report['lat'] ?? null;
        $lng = $report['lng'] ?? null;

        if ($source === '') {
            $health['localReports']++;
        } else {
            $health['externalRecords']++;
        }
        if ($status === 'Sin validar') $health['pending']++;
        if ($status === 'Confirmado') $health['confirmed']++;
        if ($status === 'Resuelto') $health['resolved']++;
        if (!is_numeric($lat) || !is_numeric($lng)) $health['missingCoordinates']++;
        if (!empty($report['privacyReviewed']) || !empty($report['privacy_review'])) $health['privacyReviewed']++;
        if ($source !== '' && $status === 'Sin validar') $health['externalPending']++;

        $updated = payload_changed_at($report);
        if ($updated > $lastUpdated) $lastUpdated = $updated;
        if (!empty($report['syncedAt'])) {
            $synced = strtotime((string) $report['syncedAt']);
            if ($synced !== false && $synced > $lastSynced) $lastSynced = $synced;
        }
    }

    $health['lastUpdatedAt'] = $lastUpdated > 0 ? date(DATE_ATOM, $lastUpdated) : null;
    $health['lastSyncedAt'] = $lastSynced > 0 ? date(DATE_ATOM, $lastSynced) : null;
    return $health;
}

function public_sync_status(?PDO $pdo, string $dataFile, string $cronLogFile): array
{
    $health = $pdo
        ? db_read_health($pdo)
        : file_read_health($dataFile);

    return [
        'ok' => true,
        'schema' => 'ayudave-sync-status-v1',
        'generatedAt' => date(DATE_ATOM),
        'source' => 'AyudaVE',
        'database' => (bool) ($health['database'] ?? false),
        'totalRecords' => (int) ($health['total'] ?? 0),
        'lastUpdatedAt' => $health['lastUpdatedAt'] ?? null,
        'lastSyncedAt' => $health['lastSyncedAt'] ?? null,
        'cron' => read_cron_status($cronLogFile),
        'sources' => $health['sources'] ?? [],
    ];
}

function normalize_external_people_metrics(array $payload): array
{
    $geo = isset($payload['geo']) && is_array($payload['geo']) ? $payload['geo'] : $payload;
    $children = isset($payload['children']) && is_array($payload['children']) ? $payload['children'] : [];
    $topRegions = [];
    foreach (array_slice($children, 0, 5) as $child) {
        if (!is_array($child)) continue;
        $metrics = isset($child['metrics']) && is_array($child['metrics']) ? $child['metrics'] : [];
        $topRegions[] = [
            'name' => clean_text($child['nombre'] ?? $child['name'] ?? 'Sin nombre', 80),
            'total' => (int) ($metrics['totalPersonas'] ?? $metrics['personasUnicas'] ?? 0),
            'withoutContact' => (int) ($metrics['sinContacto'] ?? 0),
            'localized' => (int) ($metrics['localizados'] ?? $metrics['localizado'] ?? 0),
        ];
    }

    return [
        'totalPeople' => (int) ($geo['totalPersonas'] ?? $geo['personasUnicas'] ?? $geo['total'] ?? 0),
        'withoutContact' => (int) ($geo['sinContacto'] ?? 0),
        'localized' => (int) ($geo['localizados'] ?? $geo['localizado'] ?? 0),
        'localizedHospital' => (int) ($geo['localizadosHospital'] ?? 0),
        'localizedCenter' => (int) ($geo['localizadosCentro'] ?? 0),
        'reportedConcerns' => (int) ($geo['denunciadas'] ?? 0),
        'topRegions' => $topRegions,
    ];
}

function public_external_metrics(): array
{
    $sourceUrl = 'https://desaparecidosterremotovenezuela.com/';
    $apiUrls = [
        'https://desaparecidos-terremoto-api.theempire.tech/api/metricas',
        'http://desaparecidos-terremoto-api.theempire.tech/api/metricas',
    ];
    $payload = null;
    $apiUrl = $apiUrls[0];
    foreach ($apiUrls as $candidateUrl) {
        try {
            $payload = http_get_json($candidateUrl);
            $apiUrl = $candidateUrl;
            break;
        } catch (Throwable $error) {
            error_log('AyudaVE external metrics candidate failed: ' . $candidateUrl . ' ' . $error->getMessage());
        }
    }
    if (!is_array($payload)) {
        $snapshotFile = __DIR__ . '/external-metrics.json';
        if (is_file($snapshotFile)) {
            $snapshot = json_decode((string) file_get_contents($snapshotFile), true);
            if (is_array($snapshot) && isset($snapshot['metrics']) && is_array($snapshot['metrics'])) {
                return [
                    'ok' => true,
                    'schema' => 'ayudave-external-metrics-v1',
                    'generatedAt' => date(DATE_ATOM),
                    'source' => $snapshot['source'] ?? [
                        'id' => 'desaparecidos_terremoto_venezuela',
                        'name' => 'Desaparecidos Terremoto Venezuela',
                        'url' => $sourceUrl,
                        'mode' => 'aggregate_snapshot',
                    ],
                    'privacy' => $snapshot['privacy'] ?? [
                        'aggregateOnly' => true,
                        'peopleImported' => false,
                    ],
                    'metrics' => $snapshot['metrics'],
                    'snapshotAt' => $snapshot['snapshotAt'] ?? null,
                ];
            }
        }
        throw new RuntimeException('No se pudieron leer metricas externas.');
    }
    return [
        'ok' => true,
        'schema' => 'ayudave-external-metrics-v1',
        'generatedAt' => date(DATE_ATOM),
        'source' => [
            'id' => 'desaparecidos_terremoto_venezuela',
            'name' => 'Desaparecidos Terremoto Venezuela',
            'url' => $sourceUrl,
            'api' => $apiUrl,
            'mode' => 'aggregate_only',
        ],
        'privacy' => [
            'aggregateOnly' => true,
            'peopleImported' => false,
            'note' => 'AyudaVE muestra solo metricas agregadas; no importa fichas personales, fotos, documentos ni contactos desde esta fuente.',
        ],
        'metrics' => normalize_external_people_metrics($payload),
    ];
}

function safe_error_message(Throwable $error): string
{
    error_log('AyudaVE operation failed: ' . $error->getMessage());
    return 'No se pudo completar la operacion.';
}

function start_admin_session(): void
{
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_name('AYUDAVE_ADMIN');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function ensure_admin_pin_configured(string $adminPin): void
{
    if ($adminPin === '' || $adminPin === 'cambiar-este-pin') {
        respond(503, ['ok' => false, 'error' => 'Configura admin_pin en config.php.']);
    }
}

function admin_pin_matches(array $input, string $adminPin): bool
{
    $givenPin = (string) ($input['admin_pin'] ?? '');
    return $givenPin !== '' && hash_equals($adminPin, $givenPin);
}

function establish_admin_session(): void
{
    start_admin_session();
    session_regenerate_id(true);
    $_SESSION['ayudave_admin'] = true;
    $_SESSION['ayudave_admin_expires'] = time() + (8 * 60 * 60);
}

function admin_session_is_valid(): bool
{
    start_admin_session();
    $expires = (int) ($_SESSION['ayudave_admin_expires'] ?? 0);
    if (!empty($_SESSION['ayudave_admin']) && $expires > time()) {
        $_SESSION['ayudave_admin_expires'] = time() + (8 * 60 * 60);
        return true;
    }
    unset($_SESSION['ayudave_admin'], $_SESSION['ayudave_admin_expires']);
    return false;
}

function clear_admin_session(): void
{
    start_admin_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'] ?? '',
            'secure' => (bool) $params['secure'],
            'httponly' => (bool) $params['httponly'],
            'samesite' => $params['samesite'] ?? 'Strict',
        ]);
    }
    session_destroy();
}

function clean_text(mixed $value, int $maxLength): string
{
    $text = trim((string) $value);
    $text = strip_tags($text);
    $text = preg_replace('/\s+/u', ' ', $text) ?? '';
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }
    return substr($text, 0, $maxLength);
}

function redact_sensitive_text(string $text): array
{
    $patterns = [
        '/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/iu',
        '/\+\d{1,3}[\s.\-]*(?:\d[\s.\-]*){7,14}\d/u',
        '/(?:\+?58[\s.\-]*)?(?:0?4(?:12|14|16|24|26)|2\d{2})[\s.\-]*\d{3}[\s.\-]*\d{2}[\s.\-]*\d{2}/u',
        '/\b(?:c\.?\s*i\.?|cedula|cedula\s+de\s+identidad|dni|documento)[:\s.#-]*(?:nro\.?|nº|no\.?)?[:\s.#-]*(?:[VEJG][\s.\-]*)?\d{1,3}(?:[\s.\-]?\d{3}){1,3}(?!\d)/iu',
        '/\b(?:[VEJG][\s.\-]*)?\d{1,3}(?:[\s.\-]?\d{3}){2,3}\b/iu',
        '/\b(?:V|E|J|G)?[\s.\-]?\d{6,9}\b/iu',
    ];
    $redacted = $text;
    $hits = 0;
    foreach ($patterns as $pattern) {
        $redacted = preg_replace($pattern, '[dato privado removido]', $redacted, -1, $count) ?? $redacted;
        $hits += $count;
    }
    return ['text' => $redacted, 'hasSensitive' => $hits > 0];
}

function mask_contact(string $contact): string
{
    $contact = clean_text($contact, 160);
    if ($contact === '') {
        return 'No publicado';
    }
    if (str_contains($contact, '@')) {
        [$name, $domain] = array_pad(explode('@', $contact, 2), 2, '');
        $prefix = function_exists('mb_substr') ? mb_substr($name, 0, 2, 'UTF-8') : substr($name, 0, 2);
        return $prefix . '***@' . $domain;
    }
    $digits = preg_replace('/\D+/', '', $contact) ?? '';
    if (strlen($digits) >= 6) {
        return '***' . substr($digits, -4);
    }
    return 'Dato privado';
}

function privacy_review_flag(string ...$parts): bool
{
    foreach ($parts as $part) {
        if (redact_sensitive_text($part)['hasSensitive']) {
            return true;
        }
    }
    return false;
}

function trust_level(array $report): string
{
    $source = trim((string) ($report['source'] ?? ''));
    $status = (string) ($report['status'] ?? 'Sin validar');
    if ($source !== '' && ($status === 'Confirmado' || $status === 'Abierto')) {
        return 'verified_origin';
    }
    if ($source !== '') {
        return 'external_pending';
    }
    if ($status === 'Confirmado' || $status === 'Abierto') {
        return 'community_confirmed';
    }
    if ($status === 'Resuelto') {
        return 'resolved';
    }
    return 'community_pending';
}

function trust_label(string $trustLevel): string
{
    $labels = [
        'verified_origin' => 'Verificado en origen',
        'external_pending' => 'Fuente externa / a validar',
        'community_confirmed' => 'Confirmado por comunidad',
        'resolved' => 'Resuelto',
        'community_pending' => 'Comunidad / sin validar',
    ];
    return $labels[$trustLevel] ?? $labels['community_pending'];
}

function parse_export_since(mixed $value): ?array
{
    $raw = trim((string) $value);
    if ($raw === '') {
        return null;
    }
    $timestamp = strtotime($raw);
    if ($timestamp === false) {
        respond(400, ['ok' => false, 'error' => 'Parametro since/updated_since invalido. Usa fecha ISO 8601.']);
    }
    return [
        'atom' => date(DATE_ATOM, $timestamp),
        'mysql' => date('Y-m-d H:i:s', $timestamp),
        'timestamp' => $timestamp,
    ];
}

function query_int(mixed $value, int $default, int $min, int $max): int
{
    if ($value === null || $value === '' || !is_numeric($value)) {
        return $default;
    }
    return max($min, min($max, (int) $value));
}

function payload_changed_at(array $payload): int
{
    foreach (['updatedAt', 'syncedAt', 'createdAt'] as $field) {
        if (!empty($payload[$field])) {
            $timestamp = strtotime((string) $payload[$field]);
            if ($timestamp !== false) {
                return $timestamp;
            }
        }
    }
    return 0;
}

function ensure_storage(string $dataDir, string $dataFile): void
{
    if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true)) {
        respond(500, ['ok' => false, 'error' => 'No se pudo crear almacenamiento.']);
    }

    $denyFile = $dataDir . '/.htaccess';
    if (!file_exists($denyFile)) {
        @file_put_contents($denyFile, "Require all denied\nDeny from all\n");
    }

    if (!file_exists($dataFile) && file_put_contents($dataFile, "[]\n", LOCK_EX) === false) {
        respond(500, ['ok' => false, 'error' => 'No se pudo inicializar reportes.']);
    }
}

function read_reports(string $dataFile): array
{
    $handle = fopen($dataFile, 'c+');
    if ($handle === false) {
        respond(500, ['ok' => false, 'error' => 'No se pudo abrir almacenamiento.']);
    }

    flock($handle, LOCK_SH);
    $contents = stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    $decoded = json_decode($contents ?: '[]', true);
    return is_array($decoded) ? $decoded : [];
}

function write_reports(string $dataFile, array $reports): void
{
    $handle = fopen($dataFile, 'c+');
    if ($handle === false) {
        respond(500, ['ok' => false, 'error' => 'No se pudo abrir almacenamiento.']);
    }

    flock($handle, LOCK_EX);
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($reports, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function client_rate_key(): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $agent = clean_text($_SERVER['HTTP_USER_AGENT'] ?? '', 120);
    return hash('sha256', $ip . '|' . $agent);
}

function enforce_create_rate_limit(string $dataDir, int $maxAttempts = 8, int $windowSeconds = 600, string $errorMessage = 'Demasiados reportes desde este dispositivo. Intenta de nuevo mas tarde.'): void
{
    if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true)) {
        respond(500, ['ok' => false, 'error' => 'No se pudo crear almacenamiento.']);
    }

    $file = $dataDir . '/rate-limit.json';
    $handle = fopen($file, 'c+');
    if ($handle === false) {
        respond(500, ['ok' => false, 'error' => 'No se pudo verificar limite de reportes.']);
    }

    flock($handle, LOCK_EX);
    $contents = stream_get_contents($handle);
    $state = json_decode($contents ?: '{}', true);
    if (!is_array($state)) {
        $state = [];
    }

    $now = time();
    $key = client_rate_key();
    foreach ($state as $storedKey => $entry) {
        if (!is_array($entry) || (int) ($entry['resetAt'] ?? 0) <= $now) {
            unset($state[$storedKey]);
        }
    }

    $entry = $state[$key] ?? ['count' => 0, 'resetAt' => $now + $windowSeconds];
    $resetAt = (int) ($entry['resetAt'] ?? ($now + $windowSeconds));
    if ($resetAt <= $now) {
        $entry = ['count' => 0, 'resetAt' => $now + $windowSeconds];
        $resetAt = (int) $entry['resetAt'];
    }

    $count = (int) ($entry['count'] ?? 0);
    if ($count >= $maxAttempts) {
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($state, JSON_UNESCAPED_SLASHES) . "\n");
        fflush($handle);
        flock($handle, LOCK_UN);
        fclose($handle);
        header('Retry-After: ' . max(1, $resetAt - $now));
        respond(429, ['ok' => false, 'error' => $errorMessage]);
    }

    $entry['count'] = $count + 1;
    $entry['resetAt'] = $resetAt;
    $state[$key] = $entry;
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($state, JSON_UNESCAPED_SLASHES) . "\n");
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function db_connect(?array $dbConfig): ?PDO
{
    if ($dbConfig === null || empty($dbConfig['host']) || empty($dbConfig['database']) || empty($dbConfig['username'])) {
        return null;
    }

    try {
        $port = (int) ($dbConfig['port'] ?? 3306);
        $charset = (string) ($dbConfig['charset'] ?? 'utf8mb4');
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            (string) $dbConfig['host'],
            $port,
            (string) $dbConfig['database'],
            $charset
        );
        $pdo = new PDO($dsn, (string) $dbConfig['username'], (string) ($dbConfig['password'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        ensure_db_schema($pdo);
        return $pdo;
    } catch (Throwable $error) {
        error_log('AyudaVE DB unavailable: ' . $error->getMessage());
        return null;
    }
}

function ensure_db_schema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS reports (
            id VARCHAR(80) NOT NULL PRIMARY KEY,
            type VARCHAR(40) NOT NULL,
            area VARCHAR(140) NOT NULL,
            city VARCHAR(80) NOT NULL,
            priority VARCHAR(20) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'Sin validar',
            detail TEXT NOT NULL,
            contact VARCHAR(120) NULL,
            x TINYINT UNSIGNED NOT NULL DEFAULT 50,
            y TINYINT UNSIGNED NOT NULL DEFAULT 50,
            lat DECIMAL(10,7) NULL,
            lng DECIMAL(10,7) NULL,
            source VARCHAR(80) NULL,
            source_url VARCHAR(255) NULL,
            external_id VARCHAR(120) NULL,
            source_hash CHAR(64) NULL,
            dedupe_key VARCHAR(191) NULL,
            privacy_review TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL,
            synced_at DATETIME NULL,
            INDEX idx_reports_status (status),
            INDEX idx_reports_created_at (created_at),
            INDEX idx_reports_source_synced (source, synced_at),
            INDEX idx_reports_dedupe_key (dedupe_key),
            UNIQUE KEY uniq_reports_source_external (source, external_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    foreach ([
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7) NULL AFTER y",
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7) NULL AFTER lat",
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS source VARCHAR(80) NULL AFTER y",
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_url VARCHAR(255) NULL AFTER source",
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS external_id VARCHAR(120) NULL AFTER source_url",
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_hash CHAR(64) NULL AFTER external_id",
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(191) NULL AFTER source_hash",
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS privacy_review TINYINT(1) NOT NULL DEFAULT 0 AFTER dedupe_key",
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS synced_at DATETIME NULL AFTER updated_at",
        "ALTER TABLE reports ADD INDEX IF NOT EXISTS idx_reports_source_synced (source, synced_at)",
        "ALTER TABLE reports ADD INDEX IF NOT EXISTS idx_reports_dedupe_key (dedupe_key)",
        "ALTER TABLE reports ADD UNIQUE KEY IF NOT EXISTS uniq_reports_source_external (source, external_id)",
    ] as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Throwable $error) {
            error_log('AyudaVE schema migration skipped: ' . $error->getMessage());
        }
    }
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS help_point_validations (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            help_point_id VARCHAR(80) NOT NULL,
            vote VARCHAR(20) NOT NULL,
            visitor_hash CHAR(64) NOT NULL,
            validation_day DATE NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL,
            INDEX idx_help_validations_point (help_point_id, validation_day),
            UNIQUE KEY uniq_help_validation_daily (help_point_id, visitor_hash, validation_day)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS community_members (
            id VARCHAR(80) NOT NULL PRIMARY KEY,
            alias VARCHAR(80) NOT NULL,
            role VARCHAR(40) NOT NULL,
            area VARCHAR(160) NOT NULL,
            availability VARCHAR(120) NULL,
            contact_type VARCHAR(30) NULL,
            contact_private VARCHAR(180) NULL,
            contact_masked VARCHAR(80) NULL,
            notes TEXT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'Sin validar',
            source VARCHAR(40) NOT NULL DEFAULT 'ayudave',
            privacy_consent TINYINT(1) NOT NULL DEFAULT 0,
            visitor_hash CHAR(64) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL,
            INDEX idx_members_status (status),
            INDEX idx_members_role (role),
            INDEX idx_members_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS missing_people (
            id VARCHAR(90) NOT NULL PRIMARY KEY,
            display_name VARCHAR(140) NOT NULL,
            status VARCHAR(30) NOT NULL,
            age SMALLINT UNSIGNED NULL,
            gender VARCHAR(30) NULL,
            city VARCHAR(120) NULL,
            zone VARCHAR(160) NULL,
            last_seen VARCHAR(200) NULL,
            description TEXT NULL,
            photo_url VARCHAR(500) NULL,
            is_minor TINYINT(1) NOT NULL DEFAULT 0,
            verified TINYINT(1) NOT NULL DEFAULT 0,
            source VARCHAR(80) NOT NULL,
            source_url VARCHAR(255) NULL,
            external_id VARCHAR(120) NOT NULL,
            source_hash CHAR(64) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL,
            synced_at DATETIME NULL,
            INDEX idx_missing_status (status),
            INDEX idx_missing_source_synced (source, synced_at),
            INDEX idx_missing_updated (updated_at),
            UNIQUE KEY uniq_missing_source_external (source, external_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    foreach ([
        "ALTER TABLE missing_people ADD COLUMN IF NOT EXISTS source_hash CHAR(64) NULL AFTER external_id",
        "ALTER TABLE missing_people ADD COLUMN IF NOT EXISTS synced_at DATETIME NULL AFTER updated_at",
        "ALTER TABLE missing_people ADD INDEX IF NOT EXISTS idx_missing_status (status)",
        "ALTER TABLE missing_people ADD INDEX IF NOT EXISTS idx_missing_source_synced (source, synced_at)",
        "ALTER TABLE missing_people ADD UNIQUE KEY IF NOT EXISTS uniq_missing_source_external (source, external_id)",
    ] as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Throwable $error) {
            error_log('AyudaVE missing_people migration skipped: ' . $error->getMessage());
        }
    }
}

function format_db_report(array $row): array
{
    $created = isset($row['created_at']) ? strtotime((string) $row['created_at']) : false;
    $updated = isset($row['updated_at']) ? strtotime((string) $row['updated_at']) : false;
    $detail = redact_sensitive_text((string) $row['detail']);
    $contact = redact_sensitive_text((string) ($row['contact'] ?? 'Sin validar'));
    $trustLevel = trust_level($row);
    return [
        'id' => (string) $row['id'],
        'type' => (string) $row['type'],
        'area' => (string) $row['area'],
        'city' => (string) $row['city'],
        'priority' => (string) $row['priority'],
        'status' => (string) $row['status'],
        'trustLevel' => $trustLevel,
        'trustLabel' => trust_label($trustLevel),
        'detail' => $detail['text'],
        'contact' => $contact['text'],
        'x' => (int) $row['x'],
        'y' => (int) $row['y'],
        'lat' => isset($row['lat']) ? (float) $row['lat'] : null,
        'lng' => isset($row['lng']) ? (float) $row['lng'] : null,
        'source' => $row['source'] ?? null,
        'source_url' => $row['source_url'] ?? null,
        'external_id' => $row['external_id'] ?? null,
        'privacyReview' => $detail['hasSensitive'] || $contact['hasSensitive'],
        'privacyReviewed' => !empty($row['privacy_review']),
        'createdAt' => $created ? date('d/m H:i', $created) : '',
        'updatedAt' => $updated ? date('d/m H:i', $updated) : null,
    ];
}

function db_read_reports(PDO $pdo): array
{
    $stmt = $pdo->query(
        "SELECT id, type, area, city, priority, status, detail, contact, x, y, lat, lng, source, source_url, external_id, privacy_review, created_at, updated_at
         FROM reports
         WHERE source IS NULL OR source NOT IN ('centrosdeacopiove.com', 'venezuelareporta.org', 'refugiosvenezuela.com', 'acopios-refugios.vercel.app')
         ORDER BY created_at DESC
         LIMIT 200"
    );
    return array_map('format_db_report', $stmt->fetchAll());
}

function db_read_admin_reports(PDO $pdo): array
{
    $stmt = $pdo->query(
        "SELECT id, type, area, city, priority, status, detail, contact, x, y, lat, lng, source, source_url, external_id, privacy_review, created_at, updated_at
         FROM reports
         ORDER BY
            CASE WHEN status = 'Sin validar' THEN 0 WHEN priority = 'Alta' THEN 1 ELSE 2 END,
            created_at DESC
         LIMIT 800"
    );
    return array_map('format_db_report', $stmt->fetchAll());
}

function db_read_sync_summary(PDO $pdo): array
{
    $stmt = $pdo->query(
        "SELECT
            COALESCE(source, 'ayudave') AS source,
            COUNT(*) AS total,
            SUM(status = 'Sin validar') AS pending,
            SUM(status = 'Confirmado') AS confirmed,
            SUM(status = 'Resuelto') AS resolved,
            MAX(synced_at) AS last_synced_at,
            MAX(updated_at) AS last_updated_at
         FROM reports
         GROUP BY COALESCE(source, 'ayudave')
         ORDER BY source ASC"
    );

    return array_map(static function (array $row): array {
        $synced = isset($row['last_synced_at']) ? strtotime((string) $row['last_synced_at']) : false;
        $updated = isset($row['last_updated_at']) ? strtotime((string) $row['last_updated_at']) : false;
        return [
            'source' => (string) $row['source'],
            'total' => (int) $row['total'],
            'pending' => (int) $row['pending'],
            'confirmed' => (int) $row['confirmed'],
            'resolved' => (int) $row['resolved'],
            'lastSyncedAt' => $synced ? date(DATE_ATOM, $synced) : null,
            'lastUpdatedAt' => $updated ? date(DATE_ATOM, $updated) : null,
        ];
    }, $stmt->fetchAll());
}

function db_read_missing_people_sync_summary(PDO $pdo): array
{
    $stmt = $pdo->query(
        "SELECT
            COALESCE(source, 'missing_people') AS source,
            COUNT(*) AS total,
            SUM(status = 'Buscando') AS pending,
            SUM(status IN ('Localizado', 'Encontrado')) AS confirmed,
            0 AS resolved,
            MAX(synced_at) AS last_synced_at,
            MAX(updated_at) AS last_updated_at
         FROM missing_people
         GROUP BY COALESCE(source, 'missing_people')
         ORDER BY source ASC"
    );

    return array_map(static function (array $row): array {
        $synced = isset($row['last_synced_at']) ? strtotime((string) $row['last_synced_at']) : false;
        $updated = isset($row['last_updated_at']) ? strtotime((string) $row['last_updated_at']) : false;
        return [
            'source' => (string) $row['source'],
            'category' => 'people',
            'total' => (int) $row['total'],
            'pending' => (int) $row['pending'],
            'confirmed' => (int) $row['confirmed'],
            'resolved' => (int) $row['resolved'],
            'lastSyncedAt' => $synced ? date(DATE_ATOM, $synced) : null,
            'lastUpdatedAt' => $updated ? date(DATE_ATOM, $updated) : null,
        ];
    }, $stmt->fetchAll());
}

function db_read_health(PDO $pdo): array
{
    $counts = $pdo->query(
        "SELECT
            COUNT(*) AS total,
            SUM(source IS NULL) AS local_reports,
            SUM(source IS NOT NULL) AS external_records,
            SUM(status = 'Sin validar') AS pending,
            SUM(status = 'Confirmado') AS confirmed,
            SUM(status = 'Resuelto') AS resolved,
            SUM(lat IS NULL OR lng IS NULL) AS missing_coordinates,
            SUM(privacy_review = 1) AS privacy_reviewed,
            SUM(source IS NOT NULL AND status = 'Sin validar') AS external_pending,
            MAX(updated_at) AS last_updated_at,
            MAX(synced_at) AS last_synced_at
         FROM reports"
    )->fetch();

    $updated = isset($counts['last_updated_at']) ? strtotime((string) $counts['last_updated_at']) : false;
    $synced = isset($counts['last_synced_at']) ? strtotime((string) $counts['last_synced_at']) : false;
    $peopleCounts = db_missing_people_counts($pdo);
    $reportSources = array_map(static function (array $source): array {
        return ['category' => 'reports'] + $source;
    }, db_read_sync_summary($pdo));
    return [
        'database' => true,
        'total' => (int) ($counts['total'] ?? 0),
        'localReports' => (int) ($counts['local_reports'] ?? 0),
        'externalRecords' => (int) ($counts['external_records'] ?? 0),
        'pending' => (int) ($counts['pending'] ?? 0),
        'confirmed' => (int) ($counts['confirmed'] ?? 0),
        'resolved' => (int) ($counts['resolved'] ?? 0),
        'missingCoordinates' => (int) ($counts['missing_coordinates'] ?? 0),
        'privacyReviewed' => (int) ($counts['privacy_reviewed'] ?? 0),
        'externalPending' => (int) ($counts['external_pending'] ?? 0),
        'lastUpdatedAt' => $updated ? date(DATE_ATOM, $updated) : null,
        'lastSyncedAt' => $synced ? date(DATE_ATOM, $synced) : null,
        'missingPeople' => $peopleCounts,
        'sources' => array_merge($reportSources, db_read_missing_people_sync_summary($pdo)),
    ];
}

function format_db_help_point(array $row): array
{
    $service = redact_sensitive_text((string) $row['detail']);
    $trustLevel = trust_level($row);
    return [
        'id' => (string) $row['id'],
        'name' => (string) $row['area'],
        'type' => (string) $row['type'],
        'service' => $service['text'],
        'area' => (string) $row['city'],
        'hours' => 'Fuente externa',
        'status' => (string) $row['status'],
        'trustLevel' => $trustLevel,
        'trustLabel' => trust_label($trustLevel),
        'lat' => isset($row['lat']) ? (float) $row['lat'] : null,
        'lng' => isset($row['lng']) ? (float) $row['lng'] : null,
        'source' => $row['source'] ?? null,
        'source_url' => $row['source_url'] ?? null,
        'external_id' => $row['external_id'] ?? null,
        'validationActive' => (int) ($row['validation_active'] ?? 0),
        'validationReview' => (int) ($row['validation_review'] ?? 0),
        'lastValidatedAt' => $row['last_validated_at'] ?? null,
    ];
}

function db_read_help_points(PDO $pdo): array
{
    $stmt = $pdo->query(
        "SELECT
            reports.id,
            reports.type,
            reports.area,
            reports.city,
            reports.status,
            reports.detail,
            reports.lat,
            reports.lng,
            reports.source,
            reports.source_url,
            reports.external_id,
            reports.updated_at,
            SUM(help_point_validations.vote = 'active' AND help_point_validations.validation_day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS validation_active,
            SUM(help_point_validations.vote = 'review' AND help_point_validations.validation_day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS validation_review,
            MAX(help_point_validations.updated_at) AS last_validated_at
         FROM reports
         LEFT JOIN help_point_validations ON help_point_validations.help_point_id = reports.id
         WHERE source IN ('centrosdeacopiove.com', 'venezuelareporta.org', 'refugiosvenezuela.com', 'acopios-refugios.vercel.app')
         GROUP BY reports.id, reports.type, reports.area, reports.city, reports.status, reports.detail, reports.lat, reports.lng, reports.source, reports.source_url, reports.external_id, reports.updated_at
         ORDER BY updated_at DESC, area ASC
         LIMIT 300"
    );
    return array_map('format_db_help_point', $stmt->fetchAll());
}

function db_validate_help_point(PDO $pdo, string $id, string $vote): ?array
{
    $stmt = $pdo->prepare(
        "SELECT id
         FROM reports
         WHERE id = :id
           AND source IN ('centrosdeacopiove.com', 'venezuelareporta.org', 'refugiosvenezuela.com', 'acopios-refugios.vercel.app')
         LIMIT 1"
    );
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        return null;
    }

    $visitorHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . ($_SERVER['HTTP_USER_AGENT'] ?? '') . '|' . date('Y-m-d'));
    $insert = $pdo->prepare(
        "INSERT INTO help_point_validations (help_point_id, vote, visitor_hash, validation_day, created_at, updated_at)
         VALUES (:help_point_id, :vote, :visitor_hash, CURDATE(), NOW(), NOW())
         ON DUPLICATE KEY UPDATE vote = VALUES(vote), updated_at = NOW()"
    );
    $insert->execute([
        ':help_point_id' => $id,
        ':vote' => $vote,
        ':visitor_hash' => $visitorHash,
    ]);

    $counts = $pdo->prepare(
        "SELECT
            SUM(vote = 'active') AS active_votes,
            SUM(vote = 'review') AS review_votes
         FROM help_point_validations
         WHERE help_point_id = :id
           AND validation_day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
    );
    $counts->execute([':id' => $id]);
    $row = $counts->fetch() ?: ['active_votes' => 0, 'review_votes' => 0];
    $activeVotes = (int) ($row['active_votes'] ?? 0);
    $reviewVotes = (int) ($row['review_votes'] ?? 0);
    if ($activeVotes >= 2 && $activeVotes >= $reviewVotes) {
        $pdo->prepare("UPDATE reports SET status = 'Confirmado', updated_at = NOW() WHERE id = :id")->execute([':id' => $id]);
    } elseif ($reviewVotes >= 2 && $reviewVotes > $activeVotes) {
        $pdo->prepare("UPDATE reports SET status = 'Sin validar', updated_at = NOW() WHERE id = :id")->execute([':id' => $id]);
    } else {
        $pdo->prepare("UPDATE reports SET updated_at = NOW() WHERE id = :id")->execute([':id' => $id]);
    }

    $stmt = $pdo->prepare(
        "SELECT
            reports.id,
            reports.type,
            reports.area,
            reports.city,
            reports.status,
            reports.detail,
            reports.lat,
            reports.lng,
            reports.source,
            reports.source_url,
            reports.external_id,
            reports.updated_at,
            SUM(help_point_validations.vote = 'active' AND help_point_validations.validation_day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS validation_active,
            SUM(help_point_validations.vote = 'review' AND help_point_validations.validation_day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS validation_review,
            MAX(help_point_validations.updated_at) AS last_validated_at
         FROM reports
         LEFT JOIN help_point_validations ON help_point_validations.help_point_id = reports.id
         WHERE reports.id = :id
         GROUP BY reports.id, reports.type, reports.area, reports.city, reports.status, reports.detail, reports.lat, reports.lng, reports.source, reports.source_url, reports.external_id, reports.updated_at"
    );
    $stmt->execute([':id' => $id]);
    $point = $stmt->fetch();
    return $point ? format_db_help_point($point) : null;
}

function format_member(array $row, bool $includePrivate = false): array
{
    $created = isset($row['created_at']) ? strtotime((string) $row['created_at']) : false;
    $member = [
        'id' => (string) ($row['id'] ?? ''),
        'alias' => (string) ($row['alias'] ?? ''),
        'role' => (string) ($row['role'] ?? ''),
        'area' => (string) ($row['area'] ?? ''),
        'availability' => (string) ($row['availability'] ?? ''),
        'contactType' => (string) ($row['contact_type'] ?? ''),
        'contactMasked' => (string) ($row['contact_masked'] ?? 'No publicado'),
        'notes' => (string) ($row['notes'] ?? ''),
        'status' => (string) ($row['status'] ?? 'Sin validar'),
        'source' => (string) ($row['source'] ?? 'ayudave'),
        'privacyConsent' => !empty($row['privacy_consent']),
        'createdAt' => $created ? date('d/m H:i', $created) : (string) ($row['createdAt'] ?? ''),
    ];
    if ($includePrivate) {
        $member['contactPrivate'] = (string) ($row['contact_private'] ?? '');
    }
    return $member;
}

function db_insert_member(PDO $pdo, array $member): array
{
    $stmt = $pdo->prepare(
        "INSERT INTO community_members (id, alias, role, area, availability, contact_type, contact_private, contact_masked, notes, status, source, privacy_consent, visitor_hash, created_at)
         VALUES (:id, :alias, :role, :area, :availability, :contact_type, :contact_private, :contact_masked, :notes, :status, :source, :privacy_consent, :visitor_hash, NOW())"
    );
    $stmt->execute([
        ':id' => $member['id'],
        ':alias' => $member['alias'],
        ':role' => $member['role'],
        ':area' => $member['area'],
        ':availability' => $member['availability'],
        ':contact_type' => $member['contactType'],
        ':contact_private' => $member['contactPrivate'],
        ':contact_masked' => $member['contactMasked'],
        ':notes' => $member['notes'],
        ':status' => $member['status'],
        ':source' => 'ayudave',
        ':privacy_consent' => $member['privacyConsent'] ? 1 : 0,
        ':visitor_hash' => $member['visitorHash'],
    ]);

    $stmt = $pdo->prepare(
        "SELECT id, alias, role, area, availability, contact_type, contact_private, contact_masked, notes, status, source, privacy_consent, created_at
         FROM community_members
         WHERE id = :id"
    );
    $stmt->execute([':id' => $member['id']]);
    return format_member($stmt->fetch() ?: $member);
}

function db_read_members(PDO $pdo): array
{
    $stmt = $pdo->query(
        "SELECT id, alias, role, area, availability, contact_type, contact_private, contact_masked, notes, status, source, privacy_consent, created_at
         FROM community_members
         ORDER BY created_at DESC
         LIMIT 300"
    );
    return array_map(static fn (array $row): array => format_member($row), $stmt->fetchAll());
}

function file_insert_member(string $membersFile, array $member): array
{
    $members = read_reports($membersFile);
    array_unshift($members, $member);
    $members = array_slice($members, 0, 300);
    write_reports($membersFile, $members);
    return format_member($member);
}

function file_read_members(string $membersFile): array
{
    return array_map(static fn (array $row): array => format_member($row), read_reports($membersFile));
}

function public_report_payload(array $report): array
{
    $area = redact_sensitive_text(clean_text($report['area'] ?? '', 140));
    $city = redact_sensitive_text(clean_text($report['city'] ?? '', 80));
    $detail = redact_sensitive_text(clean_text($report['detail'] ?? '', 360));
    $trustLevel = trust_level($report);
    return [
        'id' => (string) ($report['id'] ?? ''),
        'type' => (string) ($report['type'] ?? ''),
        'area' => $area['text'],
        'city' => $city['text'],
        'priority' => (string) ($report['priority'] ?? ''),
        'status' => (string) ($report['status'] ?? 'Sin validar'),
        'trustLevel' => $trustLevel,
        'trustLabel' => trust_label($trustLevel),
        'detail' => $detail['text'],
        'privacyReview' => $area['hasSensitive'] || $city['hasSensitive'] || $detail['hasSensitive'] || !empty($report['privacyReview']),
        'lat' => isset($report['lat']) ? (float) $report['lat'] : null,
        'lng' => isset($report['lng']) ? (float) $report['lng'] : null,
        'source' => $report['source'] ?? null,
        'source_url' => $report['source_url'] ?? null,
        'external_id' => $report['external_id'] ?? null,
        'createdAt' => $report['createdAt'] ?? null,
        'updatedAt' => $report['updatedAt'] ?? null,
        'syncedAt' => $report['syncedAt'] ?? null,
    ];
}

function format_public_report(array $row): array
{
    $created = isset($row['created_at']) ? strtotime((string) $row['created_at']) : false;
    $updated = isset($row['updated_at']) ? strtotime((string) $row['updated_at']) : false;
    $synced = isset($row['synced_at']) ? strtotime((string) $row['synced_at']) : false;
    return public_report_payload([
        'id' => $row['id'] ?? '',
        'type' => $row['type'] ?? '',
        'area' => $row['area'] ?? '',
        'city' => $row['city'] ?? '',
        'priority' => $row['priority'] ?? '',
        'status' => $row['status'] ?? 'Sin validar',
        'detail' => $row['detail'] ?? '',
        'lat' => $row['lat'] ?? null,
        'lng' => $row['lng'] ?? null,
        'source' => $row['source'] ?? null,
        'source_url' => $row['source_url'] ?? null,
        'external_id' => $row['external_id'] ?? null,
        'privacyReview' => !empty($row['privacy_review']),
        'createdAt' => $created ? date(DATE_ATOM, $created) : null,
        'updatedAt' => $updated ? date(DATE_ATOM, $updated) : null,
        'syncedAt' => $synced ? date(DATE_ATOM, $synced) : null,
    ]);
}

function format_public_help_point(array $row): array
{
    $payload = format_public_report($row);
    $service = redact_sensitive_text((string) $payload['detail']);
    return [
        'id' => $payload['id'],
        'name' => $payload['area'],
        'type' => $payload['type'],
        'service' => $service['text'],
        'area' => $payload['city'],
        'status' => $payload['status'],
        'trustLevel' => $payload['trustLevel'],
        'trustLabel' => $payload['trustLabel'],
        'lat' => $payload['lat'],
        'lng' => $payload['lng'],
        'source' => $payload['source'],
        'source_url' => $payload['source_url'],
        'external_id' => $payload['external_id'],
        'updatedAt' => $payload['updatedAt'],
        'syncedAt' => $payload['syncedAt'],
    ];
}

function map_missing_person_status(string $status): string
{
    $normalized = strtolower(trim($status));
    return match ($normalized) {
        'a_salvo', 'encontrado', 'encontrada', 'found', 'safe' => 'Encontrado',
        'localizado', 'localizada', 'located', 'ingreso', 'ingresado', 'listado' => 'Localizado',
        default => 'Buscando',
    };
}

function likely_minor_from_person_data(mixed $age, string ...$textParts): bool
{
    if (is_numeric($age) && (int) $age > 0 && (int) $age < 18) {
        return true;
    }
    $haystack = normalize_location_text(implode(' ', $textParts));
    foreach (['menor', 'nino', 'nina', 'adolescente', 'bebe', 'recien nacido'] as $needle) {
        if (str_contains($haystack, $needle)) {
            return true;
        }
    }
    return false;
}

function safe_person_display_name(string $name, bool $isMinor): string
{
    $name = clean_text(redact_sensitive_text($name)['text'], 140);
    if ($name === '') {
        return 'Persona sin identificar';
    }
    if (!$isMinor) {
        return $name;
    }
    $parts = preg_split('/\s+/', $name) ?: [];
    $first = $parts[0] ?? 'Menor';
    $lastInitial = isset($parts[1]) ? mb_substr((string) $parts[1], 0, 1, 'UTF-8') . '.' : '';
    return trim($first . ' ' . $lastInitial);
}

function format_missing_person(array $row): array
{
    $created = isset($row['created_at']) ? strtotime((string) $row['created_at']) : false;
    $updated = isset($row['updated_at']) ? strtotime((string) $row['updated_at']) : false;
    $synced = isset($row['synced_at']) ? strtotime((string) $row['synced_at']) : false;
    $description = redact_sensitive_text((string) ($row['description'] ?? ''));
    return [
        'id' => (string) ($row['id'] ?? ''),
        'displayName' => (string) ($row['display_name'] ?? ''),
        'status' => (string) ($row['status'] ?? 'Buscando'),
        'age' => isset($row['age']) ? (int) $row['age'] : null,
        'gender' => (string) ($row['gender'] ?? ''),
        'city' => (string) ($row['city'] ?? ''),
        'zone' => (string) ($row['zone'] ?? ''),
        'lastSeen' => (string) ($row['last_seen'] ?? ''),
        'description' => $description['text'],
        'photoUrl' => (string) ($row['photo_url'] ?? ''),
        'isMinor' => !empty($row['is_minor']),
        'verified' => !empty($row['verified']),
        'source' => (string) ($row['source'] ?? ''),
        'sourceUrl' => (string) ($row['source_url'] ?? ''),
        'externalId' => (string) ($row['external_id'] ?? ''),
        'createdAt' => $created ? date(DATE_ATOM, $created) : null,
        'updatedAt' => $updated ? date(DATE_ATOM, $updated) : null,
        'syncedAt' => $synced ? date(DATE_ATOM, $synced) : null,
    ];
}

function missing_people_where(?array $since = null, array $filters = []): array
{
    $where = [];
    $params = [];
    if ($since) {
        $where[] = 'COALESCE(updated_at, created_at, synced_at) >= :since';
        $params[':since'] = $since['mysql'];
    }
    $status = clean_text($filters['status'] ?? '', 40);
    if (in_array($status, ['Buscando', 'Localizado', 'Encontrado'], true)) {
        $where[] = 'status = :person_status';
        $params[':person_status'] = $status;
    }
    $query = clean_text($filters['q'] ?? '', 80);
    if ($query !== '') {
        $where[] = '(display_name LIKE :people_query OR city LIKE :people_query OR zone LIKE :people_query OR last_seen LIKE :people_query OR source LIKE :people_query)';
        $params[':people_query'] = '%' . $query . '%';
    }
    return [$where ? 'WHERE ' . implode(' AND ', $where) : '', $params];
}

function db_count_missing_people(PDO $pdo, ?array $since = null, array $filters = []): int
{
    [$where, $params] = missing_people_where($since, $filters);
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM missing_people {$where}");
    $stmt->execute($params);
    return (int) $stmt->fetchColumn();
}

function db_read_missing_people(PDO $pdo, int $limit = 300, ?array $since = null, int $offset = 0, array $filters = []): array
{
    $limit = max(1, min(5000, $limit));
    $offset = max(0, min(250000, $offset));
    [$where, $params] = missing_people_where($since, $filters);
    $stmt = $pdo->prepare(
        "SELECT id, display_name, status, age, gender, city, zone, last_seen, description, photo_url, is_minor, verified, source, source_url, external_id, created_at, updated_at, synced_at
         FROM missing_people
         {$where}
         ORDER BY
            CASE WHEN status = 'Buscando' THEN 0 WHEN status = 'Localizado' THEN 1 ELSE 2 END,
            COALESCE(updated_at, created_at, synced_at) DESC
         LIMIT {$limit} OFFSET {$offset}"
    );
    $stmt->execute($params);
    return array_map('format_missing_person', $stmt->fetchAll());
}

function db_missing_people_counts(PDO $pdo): array
{
    $row = $pdo->query(
        "SELECT
            COUNT(*) AS total,
            SUM(status = 'Buscando') AS searching,
            SUM(status = 'Localizado') AS localized,
            SUM(status = 'Encontrado') AS found,
            MAX(synced_at) AS last_synced_at
         FROM missing_people"
    )->fetch() ?: [];
    $synced = isset($row['last_synced_at']) ? strtotime((string) $row['last_synced_at']) : false;
    return [
        'total' => (int) ($row['total'] ?? 0),
        'searching' => (int) ($row['searching'] ?? 0),
        'localized' => (int) ($row['localized'] ?? 0),
        'found' => (int) ($row['found'] ?? 0),
        'lastSyncedAt' => $synced ? date(DATE_ATOM, $synced) : null,
    ];
}

function db_read_public_export(PDO $pdo, int $maxReports, int $maxHelpPoints, int $maxMissingPeople = 500, ?array $since = null, int $missingOffset = 0, array $missingFilters = []): array
{
    $reportsStmt = $pdo->prepare(
        "SELECT id, type, area, city, priority, status, detail, lat, lng, source, source_url, external_id, privacy_review, created_at, updated_at, synced_at
         FROM reports
         WHERE (source IS NULL OR source NOT IN ('centrosdeacopiove.com', 'venezuelareporta.org', 'refugiosvenezuela.com', 'acopios-refugios.vercel.app'))
           AND (:reports_since_filter IS NULL OR COALESCE(updated_at, synced_at, created_at) >= :reports_since_value)
         ORDER BY created_at DESC
         LIMIT :limit"
    );
    if ($since === null) {
        $reportsStmt->bindValue(':reports_since_filter', null, PDO::PARAM_NULL);
        $reportsStmt->bindValue(':reports_since_value', null, PDO::PARAM_NULL);
    } else {
        $reportsStmt->bindValue(':reports_since_filter', $since['mysql']);
        $reportsStmt->bindValue(':reports_since_value', $since['mysql']);
    }
    $reportsStmt->bindValue(':limit', max(1, min($maxReports, 2000)), PDO::PARAM_INT);
    $reportsStmt->execute();

    $helpStmt = $pdo->prepare(
        "SELECT id, type, area, city, priority, status, detail, lat, lng, source, source_url, external_id, created_at, updated_at, synced_at
         FROM reports
         WHERE source IN ('centrosdeacopiove.com', 'venezuelareporta.org', 'refugiosvenezuela.com', 'acopios-refugios.vercel.app')
           AND (:help_since_filter IS NULL OR COALESCE(updated_at, synced_at, created_at) >= :help_since_value)
         ORDER BY updated_at DESC, area ASC
         LIMIT :limit"
    );
    if ($since === null) {
        $helpStmt->bindValue(':help_since_filter', null, PDO::PARAM_NULL);
        $helpStmt->bindValue(':help_since_value', null, PDO::PARAM_NULL);
    } else {
        $helpStmt->bindValue(':help_since_filter', $since['mysql']);
        $helpStmt->bindValue(':help_since_value', $since['mysql']);
    }
    $helpStmt->bindValue(':limit', max(1, min($maxHelpPoints, 3000)), PDO::PARAM_INT);
    $helpStmt->execute();
    $missingPeople = db_read_missing_people($pdo, $maxMissingPeople, $since, $missingOffset, $missingFilters);
    $missingTotal = db_count_missing_people($pdo, $since, $missingFilters);

    return [
        'reports' => array_map('format_public_report', $reportsStmt->fetchAll()),
        'helpPoints' => array_map('format_public_help_point', $helpStmt->fetchAll()),
        'missingPeople' => $missingPeople,
        'missingPeopleTotal' => $missingTotal,
    ];
}

function file_read_public_export(string $dataFile, int $maxReports, ?array $since = null): array
{
    $reports = array_map('public_report_payload', array_slice(read_reports($dataFile), 0, max(1, min($maxReports, 500))));
    if ($since !== null) {
        $reports = array_values(array_filter($reports, static fn (array $report): bool => payload_changed_at($report) >= $since['timestamp']));
    }
    return ['reports' => $reports, 'helpPoints' => [], 'missingPeople' => [], 'missingPeopleTotal' => 0];
}

function db_insert_report(PDO $pdo, array $report): array
{
    $stmt = $pdo->prepare(
        "INSERT INTO reports (id, type, area, city, priority, status, detail, contact, x, y, lat, lng, source, source_url, external_id, privacy_review, created_at)
         VALUES (:id, :type, :area, :city, :priority, :status, :detail, :contact, :x, :y, :lat, :lng, :source, :source_url, :external_id, :privacy_review, NOW())"
    );
    $stmt->execute([
        ':id' => $report['id'],
        ':type' => $report['type'],
        ':area' => $report['area'],
        ':city' => $report['city'],
        ':priority' => $report['priority'],
        ':status' => $report['status'],
        ':detail' => $report['detail'],
        ':contact' => $report['contact'],
        ':x' => $report['x'],
        ':y' => $report['y'],
        ':lat' => $report['lat'] ?? null,
        ':lng' => $report['lng'] ?? null,
        ':source' => $report['source'] ?? null,
        ':source_url' => $report['source_url'] ?? null,
        ':external_id' => $report['external_id'] ?? null,
        ':privacy_review' => (!empty($report['privacyReview']) || !empty($report['privacyReviewed'])) ? 1 : 0,
    ]);

    $stmt = $pdo->prepare(
        "SELECT id, type, area, city, priority, status, detail, contact, x, y, lat, lng, source, source_url, external_id, privacy_review, created_at, updated_at
         FROM reports
         WHERE id = :id"
    );
    $stmt->execute([':id' => $report['id']]);
    return format_db_report($stmt->fetch() ?: $report);
}

function db_update_report_status(PDO $pdo, string $id, string $status): ?array
{
    $stmt = $pdo->prepare("UPDATE reports SET status = :status, updated_at = NOW() WHERE id = :id");
    $stmt->execute([':status' => $status, ':id' => $id]);
    if ($stmt->rowCount() < 1) {
        return null;
    }

    $stmt = $pdo->prepare(
        "SELECT id, type, area, city, priority, status, detail, contact, x, y, lat, lng, source, source_url, external_id, privacy_review, created_at, updated_at
         FROM reports
         WHERE id = :id"
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    return $row ? format_db_report($row) : null;
}

function db_sanitize_report_privacy(PDO $pdo, string $id): ?array
{
    $stmt = $pdo->prepare(
        "SELECT id, detail, contact
         FROM reports
         WHERE id = :id"
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    $detail = redact_sensitive_text((string) ($row['detail'] ?? ''));
    $contact = redact_sensitive_text((string) ($row['contact'] ?? ''));
    $update = $pdo->prepare(
        "UPDATE reports
         SET detail = :detail, contact = :contact, privacy_review = 1, updated_at = NOW()
         WHERE id = :id"
    );
    $update->execute([
        ':detail' => $detail['text'],
        ':contact' => $contact['text'],
        ':id' => $id,
    ]);

    $stmt = $pdo->prepare(
        "SELECT id, type, area, city, priority, status, detail, contact, x, y, lat, lng, source, source_url, external_id, privacy_review, created_at, updated_at
         FROM reports
         WHERE id = :id"
    );
    $stmt->execute([':id' => $id]);
    $updated = $stmt->fetch();
    return $updated ? format_db_report($updated) : null;
}

function http_get_text(string $url): string
{
    $context = stream_context_create([
        'http' => [
            'timeout' => 12,
            'header' => "Accept: application/json,text/plain,*/*\r\nUser-Agent: AyudaVE/1.0\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    if ($body !== false) {
        return $body;
    }

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        if ($curl !== false) {
            curl_setopt_array($curl, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_TIMEOUT => 12,
                CURLOPT_HTTPHEADER => ['Accept: application/json,text/plain,*/*', 'User-Agent: AyudaVE/1.0'],
            ]);
            $curlBody = curl_exec($curl);
            $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            $curlError = curl_error($curl);
            curl_close($curl);
            if (is_string($curlBody) && $curlBody !== '' && $status >= 200 && $status < 300) {
                return $curlBody;
            }
            error_log('AyudaVE curl source failed: status=' . $status . ' error=' . $curlError);
        }
    }

    throw new RuntimeException('No se pudo leer fuente externa.');
}

function http_get_json(string $url): array
{
    $decoded = json_decode(http_get_text($url), true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Fuente externa no devolvio JSON valido.');
    }
    return $decoded;
}

function http_get_json_with_headers(string $url, array $headers): array
{
    $headerLines = ["Accept: application/json", "User-Agent: AyudaVE/1.0"];
    foreach ($headers as $name => $value) {
        $headerLines[] = $name . ': ' . $value;
    }
    $context = stream_context_create([
        'http' => [
            'timeout' => 12,
            'header' => implode("\r\n", $headerLines) . "\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    if ($body === false) {
        throw new RuntimeException('No se pudo leer fuente externa.');
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Fuente externa no devolvio JSON valido.');
    }
    return $decoded;
}

function decode_jsonp_array(string $body): array
{
    $trimmed = trim($body);
    if (!preg_match('/^[A-Za-z_$][A-Za-z0-9_$]*\(([\s\S]*)\);?$/', $trimmed, $matches)) {
        throw new RuntimeException('JSONP invalido.');
    }
    $decoded = json_decode($matches[1], true);
    if (!is_array($decoded)) {
        throw new RuntimeException('JSONP no devolvio datos validos.');
    }
    return $decoded;
}

function stable_hash(mixed $value): string
{
    return hash('sha256', json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function normalized_key(string ...$parts): string
{
    $value = strtolower(implode('|', $parts));
    $value = preg_replace('/[^a-z0-9]+/i', '-', $value) ?? '';
    return trim($value, '-');
}

function contains_text(string $haystack, string $needle): bool
{
    return strpos($haystack, $needle) !== false;
}

function coordinates_to_position(?float $lat, ?float $lng): array
{
    if ($lat === null || $lng === null) {
        return [random_int(18, 82), random_int(20, 78)];
    }
    $x = (int) max(12, min(88, round((($lng + 73.5) / 14.5) * 76 + 12)));
    $y = (int) max(14, min(84, round(((13.2 - $lat) / 8.8) * 70 + 14)));
    return [$x, $y];
}

function normalize_location_text(string $value): string
{
    $normalized = function_exists('iconv') ? iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) : false;
    if ($normalized === false) $normalized = $value;
    $normalized = strtr($normalized, [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n',
        'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u', 'Ñ' => 'n',
    ]);
    return strtolower($normalized);
}

function infer_approximate_coordinates(string ...$parts): array
{
    $locations = [
        ['petare', 10.4764, -66.8079],
        ['la dolorita', 10.4672, -66.7863],
        ['caracas', 10.4806, -66.9036],
        ['la guaira', 10.599, -66.9346],
        ['valencia', 10.162, -68.0077],
        ['maracay', 10.2469, -67.5958],
        ['barquisimeto', 10.0678, -69.3467],
        ['maracaibo', 10.6427, -71.6125],
        ['cumana', 10.4635, -64.1775],
        ['puerto la cruz', 10.2138, -64.6328],
        ['barcelona', 10.1363, -64.6862],
        ['ciudad bolivar', 8.1292, -63.5409],
        ['maturin', 9.7457, -63.1832],
        ['san cristobal', 7.7669, -72.225],
        ['merida', 8.5897, -71.1561],
        ['punto fijo', 11.7167, -70.1833],
        ['coro', 11.4045, -69.6734],
        ['san felix', 8.3436, -62.641],
        ['puerto ordaz', 8.2989, -62.7193],
        ['porlamar', 10.957, -63.8491],
        ['guarenas', 10.4703, -66.6167],
        ['guatire', 10.474, -66.5427],
        ['los teques', 10.3445, -67.0433],
    ];
    $haystack = normalize_location_text(implode(' ', $parts));
    foreach ($locations as [$name, $lat, $lng]) {
        if (str_contains($haystack, $name)) {
            return ['lat' => $lat, 'lng' => $lng];
        }
    }
    return ['lat' => null, 'lng' => null];
}

function input_coordinate(mixed $value, float $min, float $max): ?float
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $number = (float) $value;
    return ($number >= $min && $number <= $max) ? $number : null;
}

function map_external_type(string $sourceType, string $text = ''): string
{
    $haystack = strtolower($sourceType . ' ' . $text);
    if (contains_text($haystack, 'agua')) return 'Agua';
    if (contains_text($haystack, 'medic') || contains_text($haystack, 'farmacia')) return 'Medicina';
    if (contains_text($haystack, 'energia') || contains_text($haystack, 'electric') || contains_text($haystack, 'signal') || contains_text($haystack, 'senal') || contains_text($haystack, 'nopower')) return 'Energia/senal';
    if (contains_text($haystack, 'refug') || contains_text($haystack, 'shelter') || contains_text($haystack, 'building') || contains_text($haystack, 'edificio')) return 'Refugio';
    if (contains_text($haystack, 'traslado') || contains_text($haystack, 'rescue') || contains_text($haystack, 'critical')) return 'Traslado';
    return 'Comida';
}

function map_external_priority(string $sourceType, string $text = ''): string
{
    $haystack = strtolower($sourceType . ' ' . $text);
    if (contains_text($haystack, 'critical') || contains_text($haystack, 'urgente') || contains_text($haystack, 'alta')) return 'Alta';
    if (contains_text($haystack, 'baja')) return 'Baja';
    return 'Media';
}

function status_from_confirmations(mixed $confirmations): string
{
    return is_numeric($confirmations) && (int) $confirmations > 0 ? 'Confirmado' : 'Sin validar';
}

function status_from_center_source(mixed $source, mixed $active): string
{
    if (!$active) {
        return 'Sin validar';
    }

    // centrosdeacopiove.com publishes this dataset as active collection points.
    // Treat active rows as validated in origin, while still showing source details.
    return 'Confirmado';
}

function normalize_terremoto_reports(): array
{
    $url = 'https://terremotovenezuela.app/api/reports';
    $payload = http_get_json($url);
    $items = is_array($payload['reports'] ?? null) ? $payload['reports'] : [];
    $rows = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $lat = isset($item['lat']) && is_numeric($item['lat']) ? (float) $item['lat'] : null;
        $lng = isset($item['lng']) && is_numeric($item['lng']) ? (float) $item['lng'] : null;
        [$x, $y] = coordinates_to_position($lat, $lng);
        $sourceType = clean_text($item['type'] ?? '', 60);
        $place = clean_text($item['place'] ?? 'Venezuela', 120);
        $needs = clean_text($item['needs'] ?? '', 620);
        $externalId = clean_text($item['id'] ?? stable_hash($item), 120);
        $type = map_external_type($sourceType, $needs . ' ' . $place);
        $confirmations = isset($item['confirmations']) && is_numeric($item['confirmations']) ? (int) $item['confirmations'] : 0;
        $status = status_from_confirmations($confirmations);
        $detail = clean_text(
            $status === 'Confirmado'
                ? "Reporte externo de {$type} con {$confirmations} confirmacion(es) en la fuente. Revalidar condiciones antes de movilizar recursos."
                : "Reporte externo de {$type}. Validar necesidad y punto de ayuda con referentes locales antes de movilizar recursos.",
            520
        );
        $city = clean_text($place, 80) ?: 'Venezuela';
        $rows[] = [
            'id' => 'ext-tvapp-' . substr(stable_hash($externalId), 0, 18),
            'type' => $type,
            'area' => $place ?: 'Reporte externo',
            'city' => $city,
            'priority' => map_external_priority($sourceType, $needs),
            'status' => $status,
            'detail' => $detail,
            'contact' => 'Sin validar',
            'x' => $x,
            'y' => $y,
            'lat' => $lat,
            'lng' => $lng,
            'source' => 'terremotovenezuela.app',
            'source_url' => $url,
            'external_id' => $externalId,
            'source_hash' => stable_hash($item),
            'dedupe_key' => normalized_key($type, $place, (string) round((float) $lat, 3), (string) round((float) $lng, 3)),
        ];
    }
    return $rows;
}

function normalize_centros_acopio(): array
{
    $url = 'https://centrosdeacopiove.com/data/centros_v2.js?v=12';
    $text = http_get_text($url);
    if (!preg_match('/const\s+CENTROS_DE_ACOPIO\s*=\s*(\[[\s\S]*?\]);/m', $text, $matches)) {
        throw new RuntimeException('No se pudo parsear centros de acopio.');
    }
    $items = json_decode($matches[1], true);
    if (!is_array($items)) {
        throw new RuntimeException('Centros de acopio no devolvio datos validos.');
    }
    $rows = [];
    foreach ($items as $item) {
        if (!is_array($item) || !($item['active'] ?? true)) continue;
        $lat = isset($item['lat']) && is_numeric($item['lat']) ? (float) $item['lat'] : null;
        $lng = isset($item['lng']) && is_numeric($item['lng']) ? (float) $item['lng'] : null;
        [$x, $y] = coordinates_to_position($lat, $lng);
        $name = clean_text($item['name'] ?? 'Centro de acopio', 120);
        $country = clean_text($item['country'] ?? 'Venezuela', 80) ?: 'Venezuela';
        $cityBase = clean_text(($item['city'] ?? '') ?: ($item['state'] ?? '') ?: $country, 80);
        $city = ($country !== '' && strcasecmp($country, 'Venezuela') !== 0 && stripos($cityBase, $country) === false)
            ? clean_text($cityBase . ', ' . $country, 80)
            : $cityBase;
        $address = clean_text($item['address'] ?? '', 180);
        $notes = clean_text($item['notes'] ?? '', 180);
        $status = status_from_center_source($item['source'] ?? '', $item['active'] ?? true);
        $sourceNote = $status === 'Confirmado' ? 'Fuente externa verificada.' : 'Fuente externa a validar.';
        $countryNote = strcasecmp($country, 'Venezuela') !== 0 ? 'Pais: ' . $country . ' - ' : '';
        $detail = clean_text(trim($countryNote . $address . ($notes ? ' - ' . $notes : '') . ' - ' . $sourceNote), 520);
        $externalId = clean_text($item['id'] ?? stable_hash([$name, $city, $address, $lat, $lng]), 120);
        $type = map_external_type('acopio', $notes . ' ' . $name);
        $rows[] = [
            'id' => 'ext-centro-' . substr(stable_hash($externalId), 0, 18),
            'type' => $type,
            'area' => $name,
            'city' => $city ?: 'Venezuela',
            'priority' => 'Media',
            'status' => $status,
            'detail' => $detail ?: 'Centro de acopio - ' . $sourceNote,
            'contact' => 'Sin validar',
            'x' => $x,
            'y' => $y,
            'lat' => $lat,
            'lng' => $lng,
            'source' => 'centrosdeacopiove.com',
            'source_url' => $url,
            'external_id' => $externalId,
            'source_hash' => stable_hash($item),
            'dedupe_key' => normalized_key($type, $name, $city, (string) round((float) $lat, 3), (string) round((float) $lng, 3)),
        ];
    }
    return $rows;
}

function normalize_venezuela_reporta_sitios(): array
{
    $url = 'https://venezuelareporta.org/api/v1/sitios?limit=500';
    $payload = http_get_json($url);
    $items = is_array($payload['sitios'] ?? null) ? $payload['sitios'] : [];
    $rows = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $lat = isset($item['lat']) && is_numeric($item['lat']) ? (float) $item['lat'] : null;
        $lng = isset($item['lng']) && is_numeric($item['lng']) ? (float) $item['lng'] : null;
        [$x, $y] = coordinates_to_position($lat, $lng);
        $name = clean_text($item['nombre'] ?? 'Sitio de ayuda', 120);
        $siteType = clean_text($item['tipo'] ?? '', 60);
        $needs = is_array($item['necesidades'] ?? null) ? implode(', ', array_map('strval', $item['necesidades'])) : '';
        $municipio = clean_text($item['municipio'] ?? '', 80);
        $statusSource = strtolower(clean_text($item['estado_operativo'] ?? '', 40));
        $freshness = strtolower(clean_text($item['frescura'] ?? '', 40));
        $reports = isset($item['reportes']) && is_numeric($item['reportes']) ? (int) $item['reportes'] : 0;
        $status = ($statusSource === 'abierto' && $freshness !== 'desactualizado' && $reports > 1) ? 'Confirmado' : 'Sin validar';
        $type = map_external_type($siteType, $needs . ' ' . $name);
        $sourceNote = $status === 'Confirmado' ? 'Fuente externa con multiples reportes recientes.' : 'Fuente externa a validar antes de movilizar recursos.';
        $detailParts = array_filter([
            $siteType ? 'Tipo: ' . $siteType : '',
            $needs ? 'Necesidades: ' . $needs : '',
            $statusSource ? 'Estado operativo: ' . $statusSource : '',
            $freshness ? 'Frescura: ' . $freshness : '',
            $sourceNote,
        ]);
        $externalId = clean_text($item['id'] ?? stable_hash($item), 120);
        $rows[] = [
            'id' => 'ext-vreporta-' . substr(stable_hash($externalId), 0, 18),
            'type' => $type,
            'area' => $name,
            'city' => $municipio ?: 'Venezuela',
            'priority' => map_external_priority($siteType, $needs),
            'status' => $status,
            'detail' => clean_text(implode(' - ', $detailParts), 520) ?: 'Sitio publicado por Venezuela Reporta.',
            'contact' => 'Sin validar',
            'x' => $x,
            'y' => $y,
            'lat' => $lat,
            'lng' => $lng,
            'source' => 'venezuelareporta.org',
            'source_url' => 'https://venezuelareporta.org/api-abierta',
            'external_id' => $externalId,
            'source_hash' => stable_hash($item),
            'dedupe_key' => normalized_key($type, $name, $municipio, (string) round((float) $lat, 3), (string) round((float) $lng, 3)),
        ];
    }
    return $rows;
}

function external_api_key(array $externalApiKeys, string $name): string
{
    $envName = 'AYUDAVE_' . strtoupper(preg_replace('/[^A-Z0-9]+/i', '_', $name) ?? $name) . '_API_KEY';
    $envValue = getenv($envName);
    if (is_string($envValue) && $envValue !== '') {
        return $envValue;
    }
    return clean_text($externalApiKeys[$name] ?? '', 240);
}

function refugios_venezuela_fetch_all(string $endpoint, array $externalApiKeys): array
{
    $baseUrl = 'https://jewiqrfjotzbwsmiomjx.supabase.co/functions/v1/' . $endpoint;
    $apiKey = external_api_key($externalApiKeys, 'refugios_venezuela');
    if ($apiKey === '') {
        throw new RuntimeException('Configura external_api_keys.refugios_venezuela para sincronizar Refugios Venezuela.');
    }
    $headers = ['apikey' => $apiKey];
    $rows = [];
    $page = 1;
    do {
        $payload = http_get_json_with_headers($baseUrl . '?page=' . $page . '&page_size=100', $headers);
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        $rows = array_merge($rows, $data);
        $pagination = is_array($payload['pagination'] ?? null) ? $payload['pagination'] : [];
        $hasMore = (bool) ($pagination['has_more'] ?? false);
        $page++;
    } while ($hasMore && $page <= 20);
    return $rows;
}

function normalize_refugios_venezuela(array $externalApiKeys): array
{
    $items = array_merge(
        refugios_venezuela_fetch_all('refugios', $externalApiKeys),
        refugios_venezuela_fetch_all('centros-comida', $externalApiKeys)
    );
    $rows = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $lat = isset($item['latitude']) && is_numeric($item['latitude']) ? (float) $item['latitude'] : null;
        $lng = isset($item['longitude']) && is_numeric($item['longitude']) ? (float) $item['longitude'] : null;
        [$x, $y] = coordinates_to_position($lat, $lng);
        $name = clean_text($item['name'] ?? 'Punto de ayuda', 120);
        $kind = clean_text($item['kind'] ?? '', 50);
        $type = map_external_type($kind ?: ($item['type'] ?? ''), ($item['notes'] ?? '') . ' ' . ($item['needs'] ?? '') . ' ' . $name);
        $city = clean_text(($item['city'] ?? '') ?: ($item['state'] ?? '') ?: 'Venezuela', 80);
        $address = clean_text($item['address'] ?? '', 160);
        $notes = clean_text($item['notes'] ?? '', 180);
        $needs = clean_text($item['needs'] ?? '', 180);
        $capacity = isset($item['capacity']) && is_numeric($item['capacity']) ? 'Capacidad: ' . (int) $item['capacity'] : '';
        $services = [];
        if (!empty($item['has_water'])) $services[] = 'agua';
        if (!empty($item['has_food'])) $services[] = 'comida';
        if (!empty($item['has_medical'])) $services[] = 'atencion medica';
        if (!empty($item['has_electricity'])) $services[] = 'electricidad';
        if (!empty($item['pets_allowed'])) $services[] = 'acepta mascotas';
        $verified = !empty($item['verified']);
        $active = strtolower(clean_text($item['status'] ?? '', 40)) === 'activo';
        $status = ($verified && $active) ? 'Confirmado' : 'Sin validar';
        $sourceNote = $status === 'Confirmado' ? 'Fuente externa verificada.' : 'Fuente externa a validar.';
        $detail = clean_text(implode(' - ', array_filter([
            $address,
            $capacity,
            $services ? 'Servicios: ' . implode(', ', $services) : '',
            $needs ? 'Necesidades: ' . $needs : '',
            $notes,
            $sourceNote,
        ])), 520);
        $externalId = clean_text(($kind ?: 'punto') . '-' . ($item['id'] ?? stable_hash($item)), 120);
        $rows[] = [
            'id' => 'ext-refve-' . substr(stable_hash($externalId), 0, 18),
            'type' => $type,
            'area' => $name,
            'city' => $city,
            'priority' => map_external_priority($kind, $needs . ' ' . $notes),
            'status' => $status,
            'detail' => $detail ?: 'Punto publicado por Refugios Venezuela - ' . $sourceNote,
            'contact' => 'Sin validar',
            'x' => $x,
            'y' => $y,
            'lat' => $lat,
            'lng' => $lng,
            'source' => 'refugiosvenezuela.com',
            'source_url' => 'https://refugiosvenezuela.com/api',
            'external_id' => $externalId,
            'source_hash' => stable_hash($item),
            'dedupe_key' => normalized_key($type, $name, $city, (string) round((float) $lat, 3), (string) round((float) $lng, 3)),
        ];
    }
    return $rows;
}

function normalize_acopios_refugios(): array
{
    $url = 'https://script.google.com/macros/s/AKfycbzKAcMzH739iu1nL6ztBmm3uymajUy6V0lPEQmbQeBjABUJ84odAxEnv0QD9Cjy5pP0Tw/exec?callback=ayudaveImport';
    $items = decode_jsonp_array(http_get_text($url));
    $rows = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $lat = isset($item['lat']) && is_numeric($item['lat']) ? (float) $item['lat'] : null;
        $lng = isset($item['lng']) && is_numeric($item['lng']) ? (float) $item['lng'] : null;
        if ($lat === null || $lng === null) continue;
        [$x, $y] = coordinates_to_position($lat, $lng);
        $kind = strtolower(clean_text($item['tipo'] ?? '', 40));
        $moderation = strtolower(clean_text($item['estado_moderacion'] ?? '', 40));
        if ($moderation !== 'aprobado' && !($kind === 'acopio' && $moderation === 'por_verificar')) {
            continue;
        }
        $name = clean_text($item['nombre'] ?? 'Punto de ayuda', 120);
        $state = clean_text($item['estado'] ?? 'Venezuela', 80);
        $address = clean_text($item['direccion'] ?? '', 180);
        $needs = clean_text($item['necesidades'] ?? '', 180);
        $capacity = clean_text($item['capacidad'] ?? '', 80);
        $type = map_external_type($kind, $needs . ' ' . $name);
        $status = $moderation === 'aprobado' ? 'Confirmado' : 'Sin validar';
        $sourceNote = $status === 'Confirmado'
            ? 'Fuente externa aprobada por moderacion de origen.'
            : 'Acopio publicado por fuente externa como sin verificar; validar localmente.';
        $detail = clean_text(implode(' - ', array_filter([
            $address,
            $needs ? 'Necesidades: ' . $needs : '',
            $capacity ? 'Capacidad: ' . $capacity : '',
            $sourceNote,
        ])), 520);
        $externalId = stable_hash([$kind, $name, $state, $address, $lat, $lng]);
        $rows[] = [
            'id' => 'ext-acref-' . substr(stable_hash($externalId), 0, 18),
            'type' => $type,
            'area' => $name,
            'city' => $state ?: 'Venezuela',
            'priority' => map_external_priority($kind, $needs . ' ' . $capacity),
            'status' => $status,
            'detail' => $detail ?: 'Punto publicado por Venezuela Resiste - ' . $sourceNote,
            'contact' => 'Sin validar',
            'x' => $x,
            'y' => $y,
            'lat' => $lat,
            'lng' => $lng,
            'source' => 'acopios-refugios.vercel.app',
            'source_url' => 'https://acopios-refugios.vercel.app/',
            'external_id' => $externalId,
            'source_hash' => stable_hash($item),
            'dedupe_key' => normalized_key($type, $name, $state, (string) round($lat, 3), (string) round($lng, 3)),
        ];
    }
    return $rows;
}

function normalize_venezuela_reporta_personas(int $startOffset = 0, int $maxRows = 5000): array
{
    $baseUrl = 'https://venezuelareporta.org/api/v1/personas';
    $rows = [];
    $limit = 100;
    $startOffset = max(0, $startOffset);
    $maxRows = max(100, min(5000, $maxRows));
    for ($offset = $startOffset; $offset < $startOffset + $maxRows; $offset += $limit) {
        $payload = http_get_json($baseUrl . '?limit=' . $limit . '&offset=' . $offset);
        $items = is_array($payload['personas'] ?? null) ? $payload['personas'] : [];
        if (!$items) {
            break;
        }
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $externalId = clean_text($item['id'] ?? stable_hash($item), 120);
            $isMinor = !empty($item['menor']);
            $displayName = safe_person_display_name((string) ($item['nombre'] ?? ''), $isMinor);
            $city = clean_text($item['ciudad'] ?? '', 120);
            $zone = clean_text($item['zona'] ?? '', 160);
            $lastSeen = clean_text($item['ultima_vez'] ?? '', 200);
            $description = redact_sensitive_text(clean_text($item['descripcion'] ?? '', 420));
            $age = isset($item['edad']) && is_numeric($item['edad']) ? max(0, min(120, (int) $item['edad'])) : null;
            $createdAt = strtotime((string) ($item['created_at'] ?? '')) ?: time();
            $verifiedAt = strtotime((string) ($item['verificado_at'] ?? '')) ?: $createdAt;
            $sourceUrl = clean_text($item['ficha_url'] ?? 'https://venezuelareporta.org/', 255);
            $photoUrl = clean_text($item['foto_url'] ?? '', 500);
            if ($isMinor && $photoUrl !== '' && !str_contains($photoUrl, 'foto-difuminada')) {
                $photoUrl = '';
            }
            $rows[] = [
                'id' => 'person-vreporta-' . substr(stable_hash($externalId), 0, 18),
                'display_name' => $displayName,
                'status' => map_missing_person_status((string) ($item['status'] ?? 'buscando')),
                'age' => $age,
                'gender' => clean_text($item['genero'] ?? '', 30),
                'city' => $city,
                'zone' => $zone,
                'last_seen' => $lastSeen,
                'description' => $description['text'],
                'photo_url' => $photoUrl,
                'is_minor' => $isMinor ? 1 : 0,
                'verified' => !empty($item['verificado']) ? 1 : 0,
                'source' => 'venezuelareporta.org',
                'source_url' => $sourceUrl,
                'external_id' => $externalId,
                'source_hash' => stable_hash([
                    $item['status'] ?? '',
                    $displayName,
                    $city,
                    $zone,
                    $lastSeen,
                    $item['verificado'] ?? false,
                    $item['verificado_at'] ?? null,
                    $item['created_at'] ?? null,
                ]),
                'created_at' => date('Y-m-d H:i:s', $createdAt),
                'updated_at' => date('Y-m-d H:i:s', max($createdAt, $verifiedAt)),
            ];
        }
        if (count($items) < $limit) {
            break;
        }
    }
    return $rows;
}

function normalize_venezuela_reporta_ingresos(int $startOffset = 0, int $maxRows = 5000): array
{
    $baseUrl = 'https://venezuelareporta.org/api/v1/ingresos';
    $rows = [];
    $limit = 100;
    $startOffset = max(0, $startOffset);
    $maxRows = max(100, min(5000, $maxRows));
    for ($offset = $startOffset; $offset < $startOffset + $maxRows; $offset += $limit) {
        $payload = http_get_json($baseUrl . '?limit=' . $limit . '&offset=' . $offset);
        $items = is_array($payload['personas'] ?? null) ? $payload['personas'] : [];
        if (!$items) {
            break;
        }
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $externalId = clean_text($item['id'] ?? stable_hash($item), 120);
            $age = isset($item['edad']) && is_numeric($item['edad']) ? max(0, min(120, (int) $item['edad'])) : null;
            $name = (string) ($item['nombre'] ?? '');
            $location = clean_text($item['ubicacion'] ?? '', 180);
            $origin = clean_text($item['procedencia'] ?? '', 140);
            $sourceName = clean_text($item['fuente'] ?? '', 120);
            $collector = clean_text($item['recopilado_de'] ?? '', 120);
            $isMinor = likely_minor_from_person_data($age, $name, $origin, $location);
            $createdAt = strtotime((string) ($item['created_at'] ?? '')) ?: time();
            $description = clean_text(implode(' - ', array_filter([
                $collector ? 'Recopilado de: ' . $collector : '',
                $sourceName ? 'Fuente: ' . $sourceName : '',
                'Listado externo. No confirma por si solo que la persona este a salvo; validar en la ficha original.',
            ])), 420);
            $rows[] = [
                'id' => 'person-vreporta-ingreso-' . substr(stable_hash($externalId), 0, 18),
                'display_name' => safe_person_display_name($name, $isMinor),
                'status' => 'Localizado',
                'age' => $age,
                'gender' => clean_text($item['sexo'] ?? '', 30),
                'city' => $origin,
                'zone' => $location,
                'last_seen' => $location,
                'description' => redact_sensitive_text($description)['text'],
                'photo_url' => '',
                'is_minor' => $isMinor ? 1 : 0,
                'verified' => 0,
                'source' => 'venezuelareporta.org/ingresos',
                'source_url' => clean_text($item['ficha_url'] ?? $baseUrl, 255),
                'external_id' => $externalId,
                'source_hash' => stable_hash([$name, $age, $origin, $location, $sourceName, $collector, $item['created_at'] ?? null]),
                'created_at' => date('Y-m-d H:i:s', $createdAt),
                'updated_at' => date('Y-m-d H:i:s', $createdAt),
            ];
        }
        if (count($items) < $limit) {
            break;
        }
    }
    return $rows;
}

function normalize_localizados_venezuela(int $startPage = 1, int $maxPages = 50): array
{
    $baseUrl = 'https://localizadosvenezuela.com/api/v1/localizados';
    $rows = [];
    $limit = 100;
    $startPage = max(1, $startPage);
    $maxPages = max(1, min(50, $maxPages));
    for ($page = $startPage; $page < $startPage + $maxPages; $page++) {
        $payload = http_get_json($baseUrl . '?limit=' . $limit . '&page=' . $page);
        $items = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        if (!$items) {
            break;
        }
        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $externalId = clean_text($item['slug'] ?? stable_hash($item), 140);
            $name = (string) ($item['nombreCompleto'] ?? '');
            $address = clean_text($item['direccion'] ?? '', 180);
            $placeName = clean_text($item['lugarNombre'] ?? '', 160);
            $condition = clean_text($item['condicion'] ?? '', 120);
            $notes = clean_text($item['observaciones'] ?? '', 260);
            $sourceName = clean_text($item['fuente'] ?? '', 120);
            $isMinor = likely_minor_from_person_data(null, $name, $condition, $notes);
            $publishedAt = strtotime((string) ($item['publicadoEn'] ?? '')) ?: time();
            $description = clean_text(implode(' - ', array_filter([
                $condition ? 'Condicion: ' . $condition : '',
                $notes,
                $sourceName ? 'Fuente: ' . $sourceName : '',
                'Listado externo de persona localizada. Validar datos sensibles en la fuente original.',
            ])), 420);
            $rows[] = [
                'id' => 'person-localizadosve-' . substr(stable_hash($externalId), 0, 18),
                'display_name' => safe_person_display_name($name, $isMinor),
                'status' => 'Localizado',
                'age' => null,
                'gender' => '',
                'city' => $address,
                'zone' => $placeName,
                'last_seen' => $placeName,
                'description' => redact_sensitive_text($description)['text'],
                'photo_url' => '',
                'is_minor' => $isMinor ? 1 : 0,
                'verified' => 0,
                'source' => 'localizadosvenezuela.com',
                'source_url' => 'https://localizadosvenezuela.com/',
                'external_id' => $externalId,
                'source_hash' => stable_hash([$name, $address, $placeName, $condition, $notes, $sourceName, $item['publicadoEn'] ?? null]),
                'created_at' => date('Y-m-d H:i:s', $publishedAt),
                'updated_at' => date('Y-m-d H:i:s', $publishedAt),
            ];
        }
        $meta = is_array($payload['meta'] ?? null) ? $payload['meta'] : [];
        $totalPages = isset($meta['totalPages']) && is_numeric($meta['totalPages']) ? (int) $meta['totalPages'] : null;
        if (count($items) < $limit || ($totalPages !== null && $page >= $totalPages)) {
            break;
        }
    }
    return $rows;
}

function normalize_desaparecidos_terremoto_personas(int $page = 1, int $maxPages = 10): array
{
    $baseUrl = 'https://desaparecidos-terremoto-api.theempire.tech/api/personas';
    $rows = [];
    $page = max(1, $page);
    $maxPages = max(1, min(25, $maxPages));
    for ($currentPage = $page; $currentPage < $page + $maxPages; $currentPage++) {
        $query = http_build_query([
            'page' => $currentPage,
            'pageSize' => 100,
        ]);
        $payload = http_get_json($baseUrl . '?' . $query);
        $items = [];
        if (is_array($payload['items'] ?? null)) {
            $items = $payload['items'];
        } elseif (is_array($payload['personas'] ?? null)) {
            $items = $payload['personas'];
        } elseif (array_is_list($payload)) {
            $items = $payload;
        }
        if (!$items) {
            break;
        }

        foreach ($items as $item) {
            if (!is_array($item)) continue;
            $externalId = clean_text($item['id'] ?? $item['_id'] ?? $item['slug'] ?? stable_hash($item), 140);
            $name = (string) ($item['nombre'] ?? $item['nombreCompleto'] ?? $item['name'] ?? '');
            $age = isset($item['edad']) && is_numeric($item['edad']) ? max(0, min(120, (int) $item['edad'])) : null;
            $city = clean_text($item['estadoNombre'] ?? $item['estado'] ?? $item['ciudad'] ?? $item['ubicacion'] ?? '', 120);
            $zone = clean_text($item['municipioNombre'] ?? $item['municipio'] ?? $item['parroquiaNombre'] ?? $item['parroquia'] ?? '', 160);
            $lastSeen = clean_text($item['ultimaVez'] ?? $item['ultima_vez'] ?? $item['ubicacion'] ?? '', 200);
            $rawStatus = (string) ($item['estadoPersona'] ?? $item['estado'] ?? $item['status'] ?? '');
            $isMinor = likely_minor_from_person_data($age, $name, $city, $zone);
            $createdAt = strtotime((string) ($item['createdAt'] ?? $item['created_at'] ?? $item['fechaReporte'] ?? '')) ?: time();
            $updatedAt = strtotime((string) ($item['updatedAt'] ?? $item['updated_at'] ?? '')) ?: $createdAt;
            $sourceUrl = clean_text($item['url'] ?? $item['ficha_url'] ?? 'https://desaparecidosterremotovenezuela.com/', 255);
            $description = clean_text(implode(' - ', array_filter([
                clean_text($item['descripcion'] ?? $item['observaciones'] ?? '', 240),
                'Fuente externa sensible. AyudaVE importa version reducida; validar en origen antes de actuar.',
            ])), 420);
            $rows[] = [
                'id' => 'person-dtv-' . substr(stable_hash($externalId), 0, 18),
                'display_name' => safe_person_display_name($name, $isMinor),
                'status' => map_missing_person_status($rawStatus),
                'age' => $age,
                'gender' => clean_text($item['genero'] ?? $item['sexo'] ?? '', 30),
                'city' => $city,
                'zone' => $zone,
                'last_seen' => $lastSeen,
                'description' => redact_sensitive_text($description)['text'],
                'photo_url' => '',
                'is_minor' => $isMinor ? 1 : 0,
                'verified' => 0,
                'source' => 'desaparecidosterremotovenezuela.com',
                'source_url' => $sourceUrl,
                'external_id' => $externalId,
                'source_hash' => stable_hash([
                    $externalId,
                    $rawStatus,
                    $name,
                    $age,
                    $city,
                    $zone,
                    $lastSeen,
                    $item['updatedAt'] ?? $item['updated_at'] ?? null,
                ]),
                'created_at' => date('Y-m-d H:i:s', $createdAt),
                'updated_at' => date('Y-m-d H:i:s', max($createdAt, $updatedAt)),
            ];
        }

        $totalPages = isset($payload['totalPages']) && is_numeric($payload['totalPages']) ? (int) $payload['totalPages'] : null;
        if (count($items) < 100 || ($totalPages !== null && $currentPage >= $totalPages)) {
            break;
        }
    }
    return $rows;
}

function db_upsert_missing_people(PDO $pdo, array $rows): array
{
    $stats = ['fetched' => count($rows), 'inserted' => 0, 'updated' => 0, 'skipped' => 0];
    $sql = "INSERT INTO missing_people
        (id, display_name, status, age, gender, city, zone, last_seen, description, photo_url, is_minor, verified, source, source_url, external_id, source_hash, created_at, updated_at, synced_at)
        VALUES
        (:id, :display_name, :status, :age, :gender, :city, :zone, :last_seen, :description, :photo_url, :is_minor, :verified, :source, :source_url, :external_id, :source_hash, :created_at, :updated_at, NOW())
        ON DUPLICATE KEY UPDATE
          display_name = VALUES(display_name),
          status = VALUES(status),
          age = VALUES(age),
          gender = VALUES(gender),
          city = VALUES(city),
          zone = VALUES(zone),
          last_seen = VALUES(last_seen),
          description = VALUES(description),
          photo_url = VALUES(photo_url),
          is_minor = VALUES(is_minor),
          verified = VALUES(verified),
          source_url = VALUES(source_url),
          source_hash = VALUES(source_hash),
          updated_at = IF(source_hash <> VALUES(source_hash), NOW(), updated_at),
          synced_at = NOW()";
    $stmt = $pdo->prepare($sql);
    foreach ($rows as $row) {
        try {
            $stmt->execute([
                ':id' => $row['id'],
                ':display_name' => $row['display_name'],
                ':status' => $row['status'],
                ':age' => $row['age'],
                ':gender' => $row['gender'],
                ':city' => $row['city'],
                ':zone' => $row['zone'],
                ':last_seen' => $row['last_seen'],
                ':description' => $row['description'],
                ':photo_url' => $row['photo_url'],
                ':is_minor' => $row['is_minor'],
                ':verified' => $row['verified'],
                ':source' => $row['source'],
                ':source_url' => $row['source_url'],
                ':external_id' => $row['external_id'],
                ':source_hash' => $row['source_hash'],
                ':created_at' => $row['created_at'],
                ':updated_at' => $row['updated_at'],
            ]);
            $affected = $stmt->rowCount();
            if ($affected === 1) $stats['inserted']++;
            elseif ($affected === 2) $stats['updated']++;
            else $stats['skipped']++;
        } catch (Throwable $error) {
            $stats['skipped']++;
        }
    }
    return $stats;
}

function db_upsert_external_reports(PDO $pdo, array $rows): array
{
    $stats = ['fetched' => count($rows), 'inserted' => 0, 'updated' => 0, 'skipped' => 0];
    $sql = "INSERT INTO reports
        (id, type, area, city, priority, status, detail, contact, x, y, lat, lng, source, source_url, external_id, source_hash, dedupe_key, created_at, updated_at, synced_at)
        VALUES
        (:id, :type, :area, :city, :priority, :status, :detail, :contact, :x, :y, :lat, :lng, :source, :source_url, :external_id, :source_hash, :dedupe_key, NOW(), NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          type = VALUES(type),
          area = VALUES(area),
          city = VALUES(city),
          priority = VALUES(priority),
          status = CASE
            WHEN status = 'Resuelto' THEN status
            WHEN VALUES(status) = 'Confirmado' THEN 'Confirmado'
            ELSE status
          END,
          detail = VALUES(detail),
          x = VALUES(x),
          y = VALUES(y),
          lat = VALUES(lat),
          lng = VALUES(lng),
          source_url = VALUES(source_url),
          source_hash = VALUES(source_hash),
          dedupe_key = VALUES(dedupe_key),
          updated_at = IF(source_hash <> VALUES(source_hash), NOW(), updated_at),
          synced_at = NOW()";
    $stmt = $pdo->prepare($sql);
    foreach ($rows as $row) {
        try {
            $stmt->execute([
                ':id' => $row['id'],
                ':type' => $row['type'],
                ':area' => $row['area'],
                ':city' => $row['city'],
                ':priority' => $row['priority'],
                ':status' => $row['status'],
                ':detail' => $row['detail'],
                ':contact' => $row['contact'],
                ':x' => $row['x'],
                ':y' => $row['y'],
                ':lat' => $row['lat'],
                ':lng' => $row['lng'],
                ':source' => $row['source'],
                ':source_url' => $row['source_url'],
                ':external_id' => $row['external_id'],
                ':source_hash' => $row['source_hash'],
                ':dedupe_key' => $row['dedupe_key'],
            ]);
            $affected = $stmt->rowCount();
            if ($affected === 1) $stats['inserted']++;
            elseif ($affected === 2) $stats['updated']++;
            else $stats['skipped']++;
        } catch (Throwable $error) {
            $stats['skipped']++;
        }
    }
    return $stats;
}

function sync_external_source(PDO $pdo, string $source, array $externalApiKeys, array $options = []): array
{
    if ($source === 'venezuela_reporta_personas') {
        return db_upsert_missing_people($pdo, normalize_venezuela_reporta_personas((int) ($options['offset'] ?? 0), (int) ($options['maxRows'] ?? 5000)));
    }
    if ($source === 'venezuela_reporta_ingresos') {
        return db_upsert_missing_people($pdo, normalize_venezuela_reporta_ingresos((int) ($options['offset'] ?? 0), (int) ($options['maxRows'] ?? 5000)));
    }
    if ($source === 'localizados_venezuela') {
        return db_upsert_missing_people($pdo, normalize_localizados_venezuela((int) ($options['page'] ?? 1), (int) ($options['maxPages'] ?? 50)));
    }
    if ($source === 'desaparecidos_terremoto_venezuela_personas') {
        return db_upsert_missing_people($pdo, normalize_desaparecidos_terremoto_personas((int) ($options['page'] ?? 1), (int) ($options['maxPages'] ?? 10)));
    }

    $rows = match ($source) {
        'terremotovenezuela_reports' => normalize_terremoto_reports(),
        'centros_acopio' => normalize_centros_acopio(),
        'venezuela_reporta_sitios' => normalize_venezuela_reporta_sitios(),
        'refugios_venezuela' => normalize_refugios_venezuela($externalApiKeys),
        'acopios_refugios' => normalize_acopios_refugios(),
        default => throw new RuntimeException('Fuente externa no permitida.'),
    };
    return db_upsert_external_reports($pdo, $rows);
}

function sync_external_sources(PDO $pdo, array $sources, array $externalApiKeys, ?string $syncCursorFile = null, bool $useCursor = false): array
{
    $lockDir = __DIR__ . '/data';
    if (!is_dir($lockDir)) {
        @mkdir($lockDir, 0755, true);
    }
    $lockHandle = fopen($lockDir . '/sync.lock', 'c');
    if ($lockHandle === false || !flock($lockHandle, LOCK_EX | LOCK_NB)) {
        if (is_resource($lockHandle)) {
            fclose($lockHandle);
        }
        return ['_sync' => ['ok' => false, 'error' => 'Sincronizacion ya en curso.']];
    }

    $results = [];
    $cursors = ($useCursor && $syncCursorFile) ? read_sync_cursors($syncCursorFile) : [];
    try {
        foreach ($sources as $source) {
            $source = clean_text($source, 60);
            if ($source === '') continue;
            try {
                $options = [];
                if ($useCursor && in_array($source, ['venezuela_reporta_personas', 'venezuela_reporta_ingresos'], true)) {
                    $options = ['offset' => (int) ($cursors[$source]['offset'] ?? 0), 'maxRows' => 1000];
                } elseif ($useCursor && in_array($source, ['localizados_venezuela', 'desaparecidos_terremoto_venezuela_personas'], true)) {
                    $options = ['page' => (int) ($cursors[$source]['page'] ?? 1), 'maxPages' => 10];
                }
                $results[$source] = sync_external_source($pdo, $source, $externalApiKeys, $options);
                if ($useCursor && in_array($source, ['venezuela_reporta_personas', 'venezuela_reporta_ingresos'], true)) {
                    $currentOffset = (int) ($options['offset'] ?? 0);
                    $fetched = (int) ($results[$source]['fetched'] ?? 0);
                    $nextOffset = $fetched > 0 ? $currentOffset + $fetched : 0;
                    $cursors[$source] = ['offset' => $nextOffset, 'updatedAt' => date(DATE_ATOM)];
                    $results[$source]['cursor'] = ['offset' => $currentOffset, 'nextOffset' => $nextOffset];
                } elseif ($useCursor && in_array($source, ['localizados_venezuela', 'desaparecidos_terremoto_venezuela_personas'], true)) {
                    $currentPage = (int) ($options['page'] ?? 1);
                    $fetched = (int) ($results[$source]['fetched'] ?? 0);
                    $nextPage = $fetched > 0 ? $currentPage + (int) ceil($fetched / 100) : 1;
                    $cursors[$source] = ['page' => $nextPage, 'updatedAt' => date(DATE_ATOM)];
                    $results[$source]['cursor'] = ['page' => $currentPage, 'nextPage' => $nextPage];
                }
            } catch (Throwable $error) {
                error_log('AyudaVE source sync failed for ' . $source . ': ' . $error->getMessage());
                $results[$source] = ['ok' => false, 'error' => 'Fuente no disponible temporalmente.'];
            }
        }
        if ($useCursor && $syncCursorFile) {
            write_sync_cursors($syncCursorFile, $cursors);
        }
        return $results;
    } finally {
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
    }
}

function sync_results_failed_sources(array $results): array
{
    $failed = [];
    foreach ($results as $source => $result) {
        if (!is_array($result)) continue;
        if (($result['ok'] ?? true) === false) {
            $failed[] = (string) $source;
        }
    }
    return $failed;
}

function require_admin(array $input, string $adminPin): void
{
    ensure_admin_pin_configured($adminPin);
    if (admin_session_is_valid()) {
        return;
    }
    if (admin_pin_matches($input, $adminPin)) {
        establish_admin_session();
        return;
    }
    respond(403, ['ok' => false, 'error' => 'Sesion admin requerida.']);
}

function require_admin_pin(array $input, string $adminPin): void
{
    ensure_admin_pin_configured($adminPin);
    if (!admin_pin_matches($input, $adminPin)) {
        respond(403, ['ok' => false, 'error' => 'PIN invalido.']);
    }
}

function require_cron_token(string $givenToken, string $cronToken): void
{
    if ($cronToken === '' || $cronToken === 'cambiar-este-token-largo') {
        respond(503, ['ok' => false, 'error' => 'Configura cron_token en config.php.']);
    }
    if (!hash_equals($cronToken, $givenToken)) {
        respond(403, ['ok' => false, 'error' => 'Token invalido.']);
    }
}

function cron_token_from_request(array $input): string
{
    $headerToken = (string) ($_SERVER['HTTP_X_AYUDAVE_CRON_TOKEN'] ?? '');
    if ($headerToken !== '') {
        return clean_text($headerToken, 160);
    }
    return clean_text($input['token'] ?? '', 160);
}

ensure_storage($dataDir, $dataFile);
ensure_storage($dataDir, $membersFile);
$pdo = db_connect($dbConfig);
if ($dbRequired && !$pdo) {
    respond(500, ['ok' => false, 'error' => 'Base de datos no disponible.']);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = clean_text($_GET['action'] ?? 'payload', 40);
    if ($action === 'metadata') {
        respond(200, public_metadata($sourcesFile, $publicExportConfig));
    }
    if ($action === 'sync_status') {
        respond(200, public_sync_status($pdo, $dataFile, $cronLogFile));
    }
    if ($action === 'external_metrics') {
        try {
            respond(200, public_external_metrics());
        } catch (Throwable $error) {
            error_log('AyudaVE external metrics failed: ' . $error->getMessage());
            respond(502, ['ok' => false, 'error' => 'No se pudieron leer metricas externas.']);
        }
    }
    if ($action === 'people') {
        if (!$pdo) {
            respond(200, ['ok' => true, 'people' => [], 'pagination' => ['limit' => 0, 'offset' => 0, 'total' => 0, 'hasMore' => false], 'counts' => ['total' => 0, 'searching' => 0, 'localized' => 0, 'found' => 0]]);
        }
        $limit = query_int($_GET['limit'] ?? null, 300, 1, 500);
        $offset = query_int($_GET['offset'] ?? null, 0, 0, 250000);
        $filters = [
            'status' => clean_text($_GET['status'] ?? '', 40),
            'q' => clean_text($_GET['q'] ?? '', 80),
        ];
        $people = db_read_missing_people($pdo, $limit, null, $offset, $filters);
        $total = db_count_missing_people($pdo, null, $filters);
        respond(200, [
            'ok' => true,
            'generatedAt' => date(DATE_ATOM),
            'people' => $people,
            'pagination' => [
                'limit' => $limit,
                'offset' => $offset,
                'total' => $total,
                'nextOffset' => $offset + count($people),
                'hasMore' => $offset + count($people) < $total,
            ],
            'counts' => db_missing_people_counts($pdo),
        ]);
    }
    if ($action === 'export_public') {
        if (empty($publicExportConfig['enabled'])) {
            respond(404, ['ok' => false, 'error' => 'Exportacion no disponible.']);
        }
        $maxReports = (int) ($publicExportConfig['max_reports'] ?? 500);
        $maxHelpPoints = (int) ($publicExportConfig['max_help_points'] ?? 1000);
        $maxMissingPeople = query_int($_GET['missing_limit'] ?? $_GET['people_limit'] ?? null, (int) ($publicExportConfig['max_missing_people'] ?? 500), 1, 5000);
        $missingOffset = query_int($_GET['missing_offset'] ?? $_GET['people_offset'] ?? null, 0, 0, 250000);
        $missingFilters = [
            'status' => clean_text($_GET['people_status'] ?? $_GET['status'] ?? '', 40),
            'q' => clean_text($_GET['people_q'] ?? $_GET['q'] ?? '', 80),
        ];
        $since = parse_export_since($_GET['since'] ?? $_GET['updated_since'] ?? '');
        $export = $pdo
            ? db_read_public_export($pdo, $maxReports, $maxHelpPoints, $maxMissingPeople, $since, $missingOffset, $missingFilters)
            : file_read_public_export($dataFile, $maxReports, $since);
        $policy = public_data_policy();
        respond(200, [
            'ok' => true,
            'schema' => 'ayudave-public-export-v1',
            'generatedAt' => date(DATE_ATOM),
            'source' => 'AyudaVE',
            'license' => $policy['license'],
            'usage' => $policy['usage'],
            'mode' => $since ? 'incremental' : 'full',
            'since' => $since['atom'] ?? null,
            'counts' => [
                'reports' => count($export['reports']),
                'helpPoints' => count($export['helpPoints']),
                'missingPeople' => count($export['missingPeople']),
                'missingPeopleTotal' => (int) ($export['missingPeopleTotal'] ?? count($export['missingPeople'])),
            ],
            'pagination' => [
                'missingPeople' => [
                    'limit' => $maxMissingPeople,
                    'offset' => $missingOffset,
                    'total' => (int) ($export['missingPeopleTotal'] ?? count($export['missingPeople'])),
                    'nextOffset' => $missingOffset + count($export['missingPeople']),
                    'hasMore' => $missingOffset + count($export['missingPeople']) < (int) ($export['missingPeopleTotal'] ?? count($export['missingPeople'])),
                ],
            ],
            'reports' => $export['reports'],
            'helpPoints' => $export['helpPoints'],
            'missingPeople' => $export['missingPeople'],
        ]);
    }
    if ($action === 'export_csv') {
        if (empty($publicExportConfig['enabled'])) {
            respond(404, ['ok' => false, 'error' => 'Exportacion no disponible.']);
        }
        $dataset = clean_text($_GET['dataset'] ?? 'reports', 40);
        $maxReports = (int) ($publicExportConfig['max_reports'] ?? 500);
        $maxHelpPoints = (int) ($publicExportConfig['max_help_points'] ?? 1000);
        $maxMissingPeople = (int) ($publicExportConfig['max_missing_people'] ?? 500);
        $export = $pdo
            ? db_read_public_export($pdo, $maxReports, $maxHelpPoints, $maxMissingPeople)
            : file_read_public_export($dataFile, $maxReports);
        if ($dataset === 'helpPoints') {
            respond_csv(
                'ayudave-help-points.csv',
                ['id', 'name', 'type', 'service', 'area', 'status', 'trustLevel', 'trustLabel', 'lat', 'lng', 'source', 'source_url', 'external_id', 'updatedAt', 'syncedAt'],
                $export['helpPoints']
            );
        }
        if ($dataset === 'missingPeople') {
            respond_csv(
                'ayudave-missing-people.csv',
                ['id', 'displayName', 'status', 'age', 'gender', 'city', 'zone', 'lastSeen', 'description', 'photoUrl', 'isMinor', 'verified', 'source', 'sourceUrl', 'externalId', 'createdAt', 'updatedAt', 'syncedAt'],
                $export['missingPeople']
            );
        }
        respond_csv(
            'ayudave-reports.csv',
            ['id', 'type', 'area', 'city', 'priority', 'status', 'trustLevel', 'trustLabel', 'detail', 'privacyReview', 'lat', 'lng', 'source', 'source_url', 'external_id', 'createdAt', 'updatedAt', 'syncedAt'],
            $export['reports']
        );
    }
    if ($action === 'health') {
        respond(200, [
            'ok' => true,
            'generatedAt' => date(DATE_ATOM),
            'health' => $pdo
                ? db_read_health($pdo)
                : file_read_health($dataFile),
        ]);
    }
    if ($action === 'cron_sync') {
        respond(405, ['ok' => false, 'error' => 'Usa POST con X-AyudaVE-Cron-Token.']);
    }
    if ($action !== 'payload') {
        respond(400, ['ok' => false, 'error' => 'Accion invalida.']);
    }
    $reports = $pdo ? db_read_reports($pdo) : read_reports($dataFile);
    $helpPoints = $pdo ? db_read_help_points($pdo) : [];
    $missingPeople = $pdo ? db_read_missing_people($pdo, 300) : [];
    $missingPeopleCounts = $pdo ? db_missing_people_counts($pdo) : ['total' => 0, 'searching' => 0, 'localized' => 0, 'found' => 0];
    respond(200, ['ok' => true, 'reports' => array_slice($reports, 0, 200), 'helpPoints' => $helpPoints, 'missingPeople' => $missingPeople, 'missingPeopleCounts' => $missingPeopleCounts]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Metodo no permitido.']);
}

$input = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($input)) {
    respond(400, ['ok' => false, 'error' => 'JSON invalido.']);
}

$action = clean_text($input['action'] ?? 'create', 40);
if ($action === 'cron_sync') {
    require_cron_token(cron_token_from_request($input), $cronToken);
    if (!$pdo) {
        $payload = ['ok' => false, 'error' => 'La sincronizacion requiere base de datos.'];
        write_cron_status($cronLogFile, 503, false, $payload);
        respond(503, $payload);
    }
    $sources = isset($input['sources']) && is_array($input['sources']) ? $input['sources'] : $syncSources;
    $useCursor = !array_key_exists('cursor', $input) || !empty($input['cursor']);
    $results = sync_external_sources($pdo, $sources, $externalApiKeys, $syncCursorFile, $useCursor);
    $failedSources = sync_results_failed_sources($results);
    $ok = count($failedSources) === 0;
    $statusCode = $ok ? 200 : 207;
    $payload = ['ok' => $ok, 'generatedAt' => date(DATE_ATOM), 'failedSources' => $failedSources, 'sources' => $results];
    write_cron_status($cronLogFile, $statusCode, $ok, $payload);
    respond($statusCode, $payload);
}

if ($action === 'admin_login') {
    enforce_create_rate_limit($dataDir, 6, 900, 'Demasiados intentos de admin. Intenta de nuevo mas tarde.');
    require_admin_pin($input, $adminPin);
    establish_admin_session();
    respond(200, ['ok' => true, 'authenticated' => true, 'expiresInSeconds' => 8 * 60 * 60]);
}

if ($action === 'admin_logout') {
    clear_admin_session();
    respond(200, ['ok' => true, 'authenticated' => false]);
}

if ($action === 'admin_session') {
    ensure_admin_pin_configured($adminPin);
    respond(200, ['ok' => true, 'authenticated' => admin_session_is_valid()]);
}

if ($action === 'update_status') {
    require_admin($input, $adminPin);

    $id = clean_text($input['id'] ?? '', 80);
    $status = clean_text($input['status'] ?? '', 30);
    if ($id === '' || !in_array($status, $allowedStatuses, true)) {
        respond(422, ['ok' => false, 'error' => 'Reporte o estado invalido.']);
    }

    if ($pdo) {
        $updatedReport = db_update_report_status($pdo, $id, $status);
    } else {
        $reports = read_reports($dataFile);
        $updatedReport = null;
        foreach ($reports as &$report) {
            if (($report['id'] ?? '') === $id) {
                $report['status'] = $status;
                $report['updatedAt'] = date('d/m H:i');
                $updatedReport = $report;
                break;
            }
        }
        unset($report);
        if ($updatedReport !== null) {
            write_reports($dataFile, $reports);
        }
    }

    if ($updatedReport === null) {
        respond(404, ['ok' => false, 'error' => 'Reporte no encontrado.']);
    }

    respond(200, ['ok' => true, 'report' => $updatedReport]);
}

if ($action === 'sanitize_privacy') {
    require_admin($input, $adminPin);

    $id = clean_text($input['id'] ?? '', 80);
    if ($id === '') {
        respond(422, ['ok' => false, 'error' => 'Reporte invalido.']);
    }

    if ($pdo) {
        $updatedReport = db_sanitize_report_privacy($pdo, $id);
    } else {
        $reports = read_reports($dataFile);
        $updatedReport = null;
        foreach ($reports as &$report) {
            if (($report['id'] ?? '') === $id) {
                $detail = redact_sensitive_text((string) ($report['detail'] ?? ''));
                $contact = redact_sensitive_text((string) ($report['contact'] ?? ''));
                $report['detail'] = $detail['text'];
                $report['contact'] = $contact['text'];
                $report['privacyReview'] = false;
                $report['privacyReviewed'] = true;
                $report['updatedAt'] = date('d/m H:i');
                $updatedReport = $report;
                break;
            }
        }
        unset($report);
        if ($updatedReport) {
            write_reports($dataFile, $reports);
        }
    }

    if (!$updatedReport) {
        respond(404, ['ok' => false, 'error' => 'Reporte no encontrado.']);
    }

    respond(200, ['ok' => true, 'report' => $updatedReport]);
}

if ($action === 'admin_payload') {
    require_admin($input, $adminPin);
    if (!$pdo) {
        respond(503, ['ok' => false, 'error' => 'La moderacion requiere base de datos.']);
    }
    respond(200, [
        'ok' => true,
        'generatedAt' => date(DATE_ATOM),
        'reports' => db_read_admin_reports($pdo),
        'members' => db_read_members($pdo),
        'syncSummary' => db_read_sync_summary($pdo),
    ]);
}

if ($action === 'sync_external') {
    require_admin($input, $adminPin);
    if (!$pdo) {
        respond(503, ['ok' => false, 'error' => 'La sincronizacion requiere base de datos.']);
    }
    $source = clean_text($input['source'] ?? 'terremotovenezuela_reports', 60);
    try {
        if ($source === 'all') {
            respond(200, ['ok' => true, 'source' => 'all', 'sources' => sync_external_sources($pdo, $syncSources, $externalApiKeys)]);
        }
        $stats = sync_external_source($pdo, $source, $externalApiKeys);
        respond(200, ['ok' => true, 'source' => $source, 'stats' => $stats]);
    } catch (Throwable $error) {
        respond(500, ['ok' => false, 'error' => safe_error_message($error)]);
    }
}

if ($action === 'validate_help_point') {
    if (!$pdo) {
        respond(503, ['ok' => false, 'error' => 'La validacion de lugares requiere base de datos.']);
    }
    $id = clean_text($input['id'] ?? '', 80);
    $vote = clean_text($input['vote'] ?? '', 20);
    if ($id === '' || !in_array($vote, ['active', 'review'], true)) {
        respond(422, ['ok' => false, 'error' => 'Lugar o validacion invalida.']);
    }

    enforce_create_rate_limit($dataDir, 30, 600);
    $helpPoint = db_validate_help_point($pdo, $id, $vote);
    if (!$helpPoint) {
        respond(404, ['ok' => false, 'error' => 'Lugar no encontrado.']);
    }

    respond(200, ['ok' => true, 'helpPoint' => $helpPoint]);
}

if ($action === 'register_member') {
    foreach (['website', 'homepage', 'url', 'company'] as $honeypotField) {
        if (trim((string) ($input[$honeypotField] ?? '')) !== '') {
            respond(400, ['ok' => false, 'error' => 'Registro invalido.']);
        }
    }

    $alias = clean_text($input['alias'] ?? '', 80);
    $role = clean_text($input['role'] ?? '', 40);
    $area = clean_text($input['area'] ?? '', 160);
    $availability = clean_text($input['availability'] ?? '', 120);
    $contactType = clean_text($input['contactType'] ?? 'otro', 30);
    $contactPrivate = clean_text($input['contact'] ?? '', 180);
    $notesPrivacy = redact_sensitive_text(clean_text($input['notes'] ?? '', 260));
    $privacyConsent = !empty($input['privacyConsent']);

    if ($alias === '' || $area === '' || !in_array($role, $allowedMemberRoles, true)) {
        respond(422, ['ok' => false, 'error' => 'Faltan datos obligatorios del registro.']);
    }
    if (!$privacyConsent) {
        respond(422, ['ok' => false, 'error' => 'Debes aceptar que el contacto sera privado y no se publicara en el mapa.']);
    }

    enforce_create_rate_limit($dataDir, 12, 600);
    $member = [
        'id' => 'mem-' . date('YmdHis') . '-' . bin2hex(random_bytes(4)),
        'alias' => $alias,
        'role' => $role,
        'area' => $area,
        'availability' => $availability,
        'contactType' => $contactType,
        'contactPrivate' => $contactPrivate,
        'contactMasked' => mask_contact($contactPrivate),
        'notes' => $notesPrivacy['text'],
        'status' => 'Sin validar',
        'privacyConsent' => true,
        'visitorHash' => hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . ($_SERVER['HTTP_USER_AGENT'] ?? '')),
        'createdAt' => date('d/m H:i'),
    ];

    $storedMember = $pdo ? db_insert_member($pdo, $member) : file_insert_member($membersFile, $member);
    respond(201, ['ok' => true, 'member' => $storedMember]);
}

if ($action !== 'create') {
    respond(400, ['ok' => false, 'error' => 'Accion invalida.']);
}

foreach (['website', 'homepage', 'url', 'company'] as $honeypotField) {
    if (trim((string) ($input[$honeypotField] ?? '')) !== '') {
        respond(400, ['ok' => false, 'error' => 'Reporte invalido.']);
    }
}

$type = clean_text($input['type'] ?? '', 40);
$priority = clean_text($input['priority'] ?? '', 20);
if (!in_array($type, $allowedTypes, true) || !in_array($priority, $allowedPriorities, true)) {
    respond(422, ['ok' => false, 'error' => 'Tipo o prioridad invalida.']);
}

$area = clean_text($input['area'] ?? '', 140);
$city = clean_text($input['city'] ?? '', 80);
$detail = clean_text($input['detail'] ?? '', 520);
$contact = clean_text($input['contact'] ?? 'Sin validar', 120);
$lat = input_coordinate($input['lat'] ?? null, -10.0, 16.0);
$lng = input_coordinate($input['lng'] ?? null, -82.0, -52.0);
$approximateCoordinates = ($lat === null || $lng === null) ? infer_approximate_coordinates($city, $area) : ['lat' => null, 'lng' => null];
if ($lat === null && $approximateCoordinates['lat'] !== null) {
    $lat = (float) $approximateCoordinates['lat'];
}
if ($lng === null && $approximateCoordinates['lng'] !== null) {
    $lng = (float) $approximateCoordinates['lng'];
}
$legacyPosition = coordinates_to_position($lat, $lng);
$detailPrivacy = redact_sensitive_text($detail);
$contactPrivacy = redact_sensitive_text($contact);
$detail = $detailPrivacy['text'];
$contact = $contactPrivacy['text'];
$privacyWasRedacted = $detailPrivacy['hasSensitive'] || $contactPrivacy['hasSensitive'];

if ($area === '' || $city === '' || $detail === '') {
    respond(422, ['ok' => false, 'error' => 'Faltan datos obligatorios.']);
}

enforce_create_rate_limit($dataDir);

$report = [
    'id' => 'srv-' . date('YmdHis') . '-' . bin2hex(random_bytes(4)),
    'type' => $type,
    'area' => $area,
    'city' => $city,
    'priority' => $priority,
    'status' => 'Sin validar',
    'detail' => $detail,
    'contact' => $contact !== '' ? $contact : 'Sin validar',
    'privacyReview' => false,
    'privacyReviewed' => $privacyWasRedacted,
    'lat' => $lat,
    'lng' => $lng,
    'x' => $legacyPosition[0],
    'y' => $legacyPosition[1],
    'createdAt' => date('d/m H:i'),
];

if ($pdo) {
    $report = db_insert_report($pdo, $report);
} else {
    $reports = read_reports($dataFile);
    array_unshift($reports, $report);
    $reports = array_slice($reports, 0, 200);
    write_reports($dataFile, $reports);
}

respond(201, ['ok' => true, 'report' => $report]);
