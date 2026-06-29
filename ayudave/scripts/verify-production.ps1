param(
  [string] $BaseUrl = "http://ayudave.mranalytics.info"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
$base = $BaseUrl.TrimEnd("/")

function Get-FirstMatch([string] $Text, [string] $Pattern) {
  $match = [regex]::Match($Text, $Pattern)
  if ($match.Success) { return $match.Value }
  return $null
}

function Count-SensitiveMatches([string[]] $Texts) {
  $joined = $Texts -join "`n"
  $patterns = @(
    '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}',
    '\+\d{1,3}[\s.\-]*(?:\d[\s.\-]*){7,14}\d',
    '(?:\+?58[\s.\-]*)?(?:0?4(?:12|14|16|24|26)|2\d{2})[\s.\-]*\d{3}[\s.\-]*\d{2}[\s.\-]*\d{2}',
    '\b(?:V|E|J|G)[\s.\-]?\d{6,9}\b'
  )
  $hits = 0
  foreach ($pattern in $patterns) {
    $hits += ([regex]::Matches($joined, $pattern, "IgnoreCase")).Count
  }
  return $hits
}

function Invoke-OptionalJson([string] $Uri) {
  try {
    return Invoke-RestMethod -Uri $Uri -Headers @{ Accept = "application/json"; "Cache-Control" = "no-cache" }
  } catch {
    return $null
  }
}

$localIndex = Get-Content -Raw -LiteralPath (Join-Path $dist "index.html")
$localAdmin = Get-Content -Raw -LiteralPath (Join-Path $dist "admin.html")
$expectedApp = Get-FirstMatch $localIndex 'assets/app-[^"]+\.js'
$expectedAdmin = Get-FirstMatch $localAdmin 'assets/admin-[^"]+\.js'

$homePage = Invoke-WebRequest -Uri "$base/?verify=$(Get-Date -Format yyyyMMddHHmmss)" -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache" }
$adminPage = Invoke-WebRequest -Uri "$base/admin.html?verify=$(Get-Date -Format yyyyMMddHHmmss)" -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache" }
$health = Invoke-RestMethod -Uri "$base/api.php?action=health&t=$(Get-Date -Format yyyyMMddHHmmss)" -Headers @{ Accept = "application/json"; "Cache-Control" = "no-cache" }
$export = Invoke-RestMethod -Uri "$base/api.php?action=export_public&t=$(Get-Date -Format yyyyMMddHHmmss)" -Headers @{ Accept = "application/json"; "Cache-Control" = "no-cache" }
$metadata = Invoke-OptionalJson "$base/api.php?action=metadata&t=$(Get-Date -Format yyyyMMddHHmmss)"
$syncStatus = Invoke-OptionalJson "$base/api.php?action=sync_status&t=$(Get-Date -Format yyyyMMddHHmmss)"
$openapi = Invoke-OptionalJson "$base/openapi.json?t=$(Get-Date -Format yyyyMMddHHmmss)"

$texts = @()
foreach ($report in @($export.reports)) {
  $texts += [string] $report.detail
}
foreach ($point in @($export.helpPoints)) {
  $texts += [string] $point.service
}

$metadataSources = if ($metadata -and $metadata.sources) { @($metadata.sources) } else { @() }
$sourceIds = $metadataSources | ForEach-Object { [string] $_.id }
$reportSample = @($export.reports) | Select-Object -First 1
$helpPointSample = @($export.helpPoints) | Select-Object -First 1
$hasTrustLevels = [bool] (
  $metadata.trustLevels -and
  $metadata.trustLevels.verified_origin -and
  $metadata.trustLevels.external_pending -and
  $metadata.trustLevels.community_pending
)
$exportHasTrustFields = [bool] (
  ($reportSample -and $reportSample.PSObject.Properties.Name -contains "trustLevel" -and $reportSample.PSObject.Properties.Name -contains "trustLabel") -or
  ($helpPointSample -and $helpPointSample.PSObject.Properties.Name -contains "trustLevel" -and $helpPointSample.PSObject.Properties.Name -contains "trustLabel")
)
$exportHasPrivacyFields = [bool] (
  -not $reportSample -or
  ($reportSample.PSObject.Properties.Name -contains "privacyReview")
)

[pscustomobject]@{
  baseUrl = $base
  homeStatus = [int] $homePage.StatusCode
  adminStatus = [int] $adminPage.StatusCode
  expectedApp = $expectedApp
  expectedAdmin = $expectedAdmin
  appDeployed = $expectedApp -and $homePage.Content.Contains($expectedApp)
  adminDeployed = $expectedAdmin -and $adminPage.Content.Contains($expectedAdmin)
  healthOk = [bool] $health.ok
  database = [bool] $health.health.database
  totalRecords = [int] $health.health.total
  healthHasQualityMetrics = [bool] (
    $health.health.PSObject.Properties.Name -contains "missingCoordinates" -and
    $health.health.PSObject.Properties.Name -contains "privacyReviewed" -and
    $health.health.PSObject.Properties.Name -contains "externalPending"
  )
  missingCoordinates = if ($health.health.PSObject.Properties.Name -contains "missingCoordinates") { [int] $health.health.missingCoordinates } else { $null }
  privacyReviewed = if ($health.health.PSObject.Properties.Name -contains "privacyReviewed") { [int] $health.health.privacyReviewed } else { $null }
  externalPending = if ($health.health.PSObject.Properties.Name -contains "externalPending") { [int] $health.health.externalPending } else { $null }
  reports = @($export.reports).Count
  helpPoints = @($export.helpPoints).Count
  metadataOk = [bool] ($metadata.ok -and $metadata.schema -eq "ayudave-public-metadata-v1")
  metadataSources = $metadataSources.Count
  metadataHasTrustLevels = $hasTrustLevels
  metadataHasAcopiosRefugios = $sourceIds -contains "acopios_refugios"
  metadataHasOpenApi = [bool] ($metadata.exports -and $metadata.exports.openapi -and $metadata.exports.openapi.EndsWith("/openapi.json"))
  metadataHasSyncStatus = [bool] ($metadata.exports -and $metadata.exports.syncStatus -and $metadata.exports.syncStatus.EndsWith("/api.php?action=sync_status"))
  syncStatusOk = [bool] ($syncStatus.ok -and $syncStatus.schema -eq "ayudave-sync-status-v1" -and $syncStatus.PSObject.Properties.Name -contains "cron" -and $syncStatus.PSObject.Properties.Name -contains "sources")
  openApiOk = [bool] ($openapi.openapi -eq "3.0.3" -and $openapi.paths.PSObject.Properties.Name -contains "/api.php")
  exportSchemaOk = [bool] ($export.ok -and $export.schema -eq "ayudave-public-export-v1")
  exportHasTrustFields = $exportHasTrustFields
  exportHasPrivacyFields = $exportHasPrivacyFields
  sensitiveTextHits = Count-SensitiveMatches $texts
} | ConvertTo-Json -Compress
