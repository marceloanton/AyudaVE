param(
  [int] $Port = 4340,
  [string] $Php = "C:\xampp\php\php.exe"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
if (-not (Test-Path $dist)) {
  throw "Build first with npm run build."
}
if (-not (Test-Path $Php)) {
  throw "PHP executable not found at $Php."
}

$indexPath = Join-Path $dist "index.html"
$adminPath = Join-Path $dist "admin.html"
$apiPath = Join-Path $dist "api.php"
$swPath = Join-Path $dist "sw.js"
foreach ($path in @($indexPath, $adminPath, $apiPath, $swPath, (Join-Path $dist "sources.json"), (Join-Path $dist "ayudave-public-export.schema.json"), (Join-Path $dist "openapi.json"))) {
  if (-not (Test-Path $path)) {
    throw "Missing required build artifact: $path"
  }
}

$index = Get-Content -Raw -LiteralPath $indexPath
$admin = Get-Content -Raw -LiteralPath $adminPath
$expectedApp = [regex]::Match($index, 'assets/app-[^"]+\.js').Value
$expectedAdmin = [regex]::Match($admin, 'assets/admin-[^"]+\.js').Value
if (-not $expectedApp -or -not (Test-Path (Join-Path $dist $expectedApp))) {
  throw "Compiled app asset not found."
}
if (-not $expectedAdmin -or -not (Test-Path (Join-Path $dist $expectedAdmin))) {
  throw "Compiled admin asset not found."
}
$appBundle = Get-Content -Raw -LiteralPath (Join-Path $dist $expectedApp)
$sw = Get-Content -Raw -LiteralPath $swPath

$tmp = Join-Path $env:TEMP ("ayudave-local-verify-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$proc = $null

try {
  Copy-Item -Path (Join-Path $dist "*") -Destination $tmp -Recurse -Force
  @'
<?php
return [
    'site_url' => 'http://127.0.0.1',
    'admin_pin' => '1234',
    'cron_token' => 'token-local',
    'sync_sources' => ['terremotovenezuela_reports', 'centros_acopio', 'venezuela_reporta_sitios', 'refugios_venezuela', 'acopios_refugios'],
    'public_export' => ['enabled' => true, 'max_reports' => 500, 'max_help_points' => 1000],
    'db_required' => false,
];
'@ | Set-Content -LiteralPath (Join-Path $tmp "config.php") -Encoding ASCII

  New-Item -ItemType Directory -Force -Path (Join-Path $tmp "data") | Out-Null
  @'
[
  {"id":"local-1","type":"Medicina","area":"Petare","city":"Caracas","priority":"Alta","status":"Sin validar","detail":"Insulina para adulto mayor. Contactar 0412-123-45-67 cedula V12345678","contact":"0412-123-45-67","lat":10.4764,"lng":-66.8079,"createdAt":"Hoy 10:00"},
  {"id":"external-1","type":"Refugio","area":"Centro comunitario","city":"La Guaira","priority":"Media","status":"Confirmado","detail":"Refugio temporal aprobado","contact":"Sin validar","lat":10.6104,"lng":-66.8859,"source":"acopios-refugios.vercel.app","source_url":"https://acopios-refugios.vercel.app/","external_id":"test-1","createdAt":"Hoy 09:00","syncedAt":"2026-06-28T00:00:00+00:00"}
]
'@ | Set-Content -LiteralPath (Join-Path $tmp "data\reports.json") -Encoding ASCII

  $proc = Start-Process -FilePath $Php -ArgumentList @("-S", "127.0.0.1:$Port", "-t", $tmp) -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 900
  $base = "http://127.0.0.1:$Port"

  $metadata = Invoke-RestMethod -Uri "$base/api.php?action=metadata" -Headers @{ Accept = "application/json" }
  $metadataCors = Invoke-WebRequest -UseBasicParsing -Uri "$base/api.php?action=metadata" -Headers @{ Accept = "application/json"; Origin = "https://integrador.example" }
  $syncStatus = Invoke-RestMethod -Uri "$base/api.php?action=sync_status" -Headers @{ Accept = "application/json" }
  $export = Invoke-RestMethod -Uri "$base/api.php?action=export_public" -Headers @{ Accept = "application/json" }
  $incrementalExport = Invoke-RestMethod -Uri "$base/api.php?action=export_public&since=2026-06-28T00:00:00Z" -Headers @{ Accept = "application/json" }
  $health = Invoke-RestMethod -Uri "$base/api.php?action=health" -Headers @{ Accept = "application/json" }
  $openapi = Invoke-RestMethod -Uri "$base/openapi.json" -Headers @{ Accept = "application/json" }

  $sanitizeBody = @{ action = "sanitize_privacy"; admin_pin = "1234"; id = "local-1" } | ConvertTo-Json
  $sanitized = Invoke-RestMethod -Uri "$base/api.php" -Method Post -Body $sanitizeBody -ContentType "application/json" -Headers @{ Accept = "application/json" }

  $honeypotBlocked = $false
  $botBody = @{
    type = "Agua"
    area = "Sector bot"
    city = "Caracas"
    priority = "Media"
    detail = "Este reporte deberia ser bloqueado por honeypot"
    contact = "Sin validar"
    website = "https://spam.example"
  } | ConvertTo-Json
  try {
    Invoke-RestMethod -Uri "$base/api.php" -Method Post -Body $botBody -ContentType "application/json" -Headers @{ Accept = "application/json"; "User-Agent" = "AyudaVE-local-verifier-bot" } | Out-Null
  } catch {
    $response = $_.Exception.Response
    if ($response -and [int] $response.StatusCode -eq 400) {
      $honeypotBlocked = $true
    } else {
      throw
    }
  }

  $rateLimited = $false
  for ($i = 1; $i -le 9; $i++) {
    $reportBody = @{
      type = "Agua"
      area = "Sector prueba $i"
      city = "Caracas"
      priority = "Media"
      detail = "Reporte de prueba para limite de frecuencia $i"
      contact = "Sin validar"
    } | ConvertTo-Json
    try {
      Invoke-RestMethod -Uri "$base/api.php" -Method Post -Body $reportBody -ContentType "application/json" -Headers @{ Accept = "application/json"; "User-Agent" = "AyudaVE-local-verifier" } | Out-Null
    } catch {
      $response = $_.Exception.Response
      if ($response -and [int] $response.StatusCode -eq 429) {
        $rateLimited = $true
        break
      }
      throw
    }
  }

  $sourceIds = @($metadata.sources) | ForEach-Object { [string] $_.id }
  $reportSample = @($export.reports) | Select-Object -First 1
  $helpPointSample = @($export.helpPoints) | Select-Object -First 1
  $exportJson = $export | ConvertTo-Json -Depth 12 -Compress

  $checks = [ordered]@{
    appAsset = [bool] $expectedApp
    adminAsset = [bool] $expectedAdmin
    serviceWorkerAsset = [bool] ($sw.Contains("CACHE_NAME") -and $sw.Contains("/api.php") -and $sw.Contains("shouldBypassCache"))
    serviceWorkerRegistered = [bool] ($appBundle.Contains("serviceWorker") -and $appBundle.Contains("sw.js"))
    metadataOk = [bool] ($metadata.ok -and $metadata.schema -eq "ayudave-public-metadata-v1")
    publicCorsOk = [bool] ($metadataCors.Headers["Access-Control-Allow-Origin"] -eq "*")
    metadataHasTrustLevels = [bool] ($metadata.trustLevels.verified_origin -and $metadata.trustLevels.external_pending -and $metadata.trustLevels.community_pending)
    metadataHasAcopiosRefugios = [bool] ($sourceIds -contains "acopios_refugios")
    metadataHasOpenApi = [bool] ($metadata.exports.openapi -and $metadata.exports.openapi.EndsWith("/openapi.json"))
    metadataHasSyncStatus = [bool] ($metadata.exports.syncStatus -and $metadata.exports.syncStatus.EndsWith("/api.php?action=sync_status"))
    metadataHasIncrementalExport = [bool] ($metadata.exports.jsonIncremental -and $metadata.exports.jsonIncremental.Contains("since="))
    metadataHasUsagePolicy = [bool] ($metadata.license.name -eq "CC BY 4.0" -and $metadata.usage.attributionRequired -eq $true -and $metadata.usage.privacy)
    syncStatusOk = [bool] ($syncStatus.ok -and $syncStatus.schema -eq "ayudave-sync-status-v1" -and $syncStatus.PSObject.Properties.Name -contains "cron" -and $syncStatus.PSObject.Properties.Name -contains "sources")
    openApiOk = [bool] ($openapi.openapi -eq "3.0.3" -and $openapi.paths.PSObject.Properties.Name -contains "/api.php")
    exportSchemaOk = [bool] ($export.ok -and $export.schema -eq "ayudave-public-export-v1")
    exportHasUsagePolicy = [bool] ($export.license.name -eq "CC BY 4.0" -and $export.usage.attributionRequired -eq $true -and $export.usage.validation)
    incrementalExportOk = [bool] (
      $incrementalExport.ok -and
      $incrementalExport.schema -eq "ayudave-public-export-v1" -and
      $incrementalExport.mode -eq "incremental" -and
      $incrementalExport.since -and
      $incrementalExport.counts.reports -eq @($incrementalExport.reports).Count -and
      $incrementalExport.counts.helpPoints -eq @($incrementalExport.helpPoints).Count
    )
    exportHasTrustFields = [bool] (
      ($reportSample -and $reportSample.PSObject.Properties.Name -contains "trustLevel" -and $reportSample.PSObject.Properties.Name -contains "trustLabel") -or
      ($helpPointSample -and $helpPointSample.PSObject.Properties.Name -contains "trustLevel" -and $helpPointSample.PSObject.Properties.Name -contains "trustLabel")
    )
    exportHasPrivacyFields = [bool] (-not $reportSample -or $reportSample.PSObject.Properties.Name -contains "privacyReview")
    exportRedactsSensitiveText = [bool] (
      $exportJson.Contains("[dato privado removido]") -and
      $exportJson -notmatch "0412-123-45-67|V12345678|[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}"
    )
    healthOk = [bool] $health.ok
    healthHasQualityMetrics = [bool] (
      $health.health.PSObject.Properties.Name -contains "missingCoordinates" -and
      $health.health.PSObject.Properties.Name -contains "privacyReviewed" -and
      $health.health.PSObject.Properties.Name -contains "externalPending" -and
      $health.health.PSObject.Properties.Name -contains "localReports" -and
      $health.health.PSObject.Properties.Name -contains "externalRecords"
    )
    sanitizePrivacyOk = [bool] ($sanitized.ok -and -not $sanitized.report.privacyReview -and $sanitized.report.privacyReviewed -and $sanitized.report.detail.Contains("[dato privado removido]") -and $sanitized.report.contact.Contains("[dato privado removido]"))
    honeypotOk = [bool] $honeypotBlocked
    rateLimitOk = [bool] $rateLimited
  }

  $failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
  $result = [pscustomobject]@{
    ok = $failed.Count -eq 0
    failed = $failed
    expectedApp = $expectedApp
    expectedAdmin = $expectedAdmin
    checks = $checks
  }
  $result | ConvertTo-Json -Depth 5 -Compress
  if ($failed.Count -gt 0) {
    exit 1
  }
} finally {
  if ($proc) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
