<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Run from CLI only.\n");
    exit(1);
}

$root = dirname(__DIR__);
$configFile = $root . '/config.php';
if (!is_file($configFile)) {
    fwrite(STDERR, "config.php not found.\n");
    exit(1);
}

$config = require $configFile;
if (!is_array($config) || !isset($config['db']) || !is_array($config['db'])) {
    fwrite(STDERR, "Database config missing.\n");
    exit(1);
}

function redact_sensitive_text_cli(string $text): array
{
    $patterns = [
        '/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/iu',
        '/\+\d{1,3}[\s.\-]*(?:\d[\s.\-]*){7,14}\d/u',
        '/(?:\+?58[\s.\-]*)?(?:0?4(?:12|14|16|24|26)|2\d{2})[\s.\-]*\d{3}[\s.\-]*\d{2}[\s.\-]*\d{2}/u',
        '/\b(?:V|E|J|G)?[\s.\-]?\d{6,9}\b/iu',
    ];
    $redacted = $text;
    $hits = 0;
    foreach ($patterns as $pattern) {
        $redacted = preg_replace($pattern, '[dato privado removido]', $redacted, -1, $count) ?? $redacted;
        $hits += $count;
    }
    return ['text' => $redacted, 'hits' => $hits];
}

$db = $config['db'];
$dsn = sprintf(
    'mysql:host=%s;port=%d;dbname=%s;charset=%s',
    (string) $db['host'],
    (int) ($db['port'] ?? 3306),
    (string) $db['database'],
    (string) ($db['charset'] ?? 'utf8mb4')
);

try {
    $pdo = new PDO($dsn, (string) $db['username'], (string) ($db['password'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (Throwable $error) {
    fwrite(STDERR, "Database connection failed.\n");
    exit(1);
}

try {
    $pdo->exec("ALTER TABLE reports ADD COLUMN IF NOT EXISTS privacy_review TINYINT(1) NOT NULL DEFAULT 0 AFTER dedupe_key");
} catch (Throwable $error) {
    // MariaDB 10.11 supports IF NOT EXISTS; if this fails, continue so older schemas can still be sanitized.
}

$select = $pdo->query("SELECT id, detail, contact FROM reports ORDER BY updated_at DESC, created_at DESC");
$update = $pdo->prepare(
    "UPDATE reports
     SET detail = :detail, contact = :contact, privacy_review = GREATEST(privacy_review, :privacy_review), updated_at = NOW()
     WHERE id = :id"
);

$checked = 0;
$changed = 0;
$hits = 0;

foreach ($select->fetchAll() as $row) {
    $checked++;
    $detail = redact_sensitive_text_cli((string) ($row['detail'] ?? ''));
    $contact = redact_sensitive_text_cli((string) ($row['contact'] ?? ''));
    $rowHits = $detail['hits'] + $contact['hits'];
    if ($rowHits === 0) {
        continue;
    }
    $hits += $rowHits;
    $changed++;
    $update->execute([
        ':detail' => $detail['text'],
        ':contact' => $contact['text'],
        ':privacy_review' => 1,
        ':id' => (string) $row['id'],
    ]);
}

echo json_encode([
    'ok' => true,
    'checked' => $checked,
    'changed' => $changed,
    'redactions' => $hits,
], JSON_UNESCAPED_SLASHES) . PHP_EOL;
