param(
  [string] $OutputDir = "deploy"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
if (-not (Test-Path $dist)) {
  throw "Build first with npm run build."
}

$targetDir = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipPath = Join-Path $targetDir "ayudave-ionos-$stamp.zip"
$manifestPath = Join-Path $targetDir "ayudave-ionos-$stamp-manifest.txt"
$staging = Join-Path $env:TEMP "ayudave-package-$stamp"

if (Test-Path $staging) {
  Remove-Item -LiteralPath $staging -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $staging | Out-Null

try {
  Copy-Item -Path (Join-Path $dist "*") -Destination $staging -Recurse -Force
  Remove-Item -LiteralPath (Join-Path $staging "config.php") -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $staging "data") -Recurse -Force -ErrorAction SilentlyContinue

  if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -CompressionLevel Optimal

  Get-ChildItem -LiteralPath $staging -Recurse -File |
    Sort-Object FullName |
    ForEach-Object {
      $relative = $_.FullName.Substring($staging.Length + 1).Replace("\", "/")
      $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
      "$hash  $relative"
    } | Set-Content -LiteralPath $manifestPath -Encoding ASCII

  [pscustomobject]@{
    zip = $zipPath
    manifest = $manifestPath
    files = (Get-ChildItem -LiteralPath $staging -Recurse -File).Count
    sizeBytes = (Get-Item -LiteralPath $zipPath).Length
  } | ConvertTo-Json -Compress
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
