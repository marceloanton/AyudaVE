param(
  [string] $HostName = $env:AYUDAVE_SFTP_HOST,
  [string] $UserName = $env:AYUDAVE_SFTP_USER,
  [string] $Password = $env:AYUDAVE_SFTP_PASSWORD,
  [string] $Protocol = $(if ($env:AYUDAVE_DEPLOY_PROTOCOL) { $env:AYUDAVE_DEPLOY_PROTOCOL } else { "sftp" }),
  [int] $Port = $(if ($env:AYUDAVE_DEPLOY_PORT) { [int] $env:AYUDAVE_DEPLOY_PORT } else { 22 }),
  [string] $RemotePath = "/ayudave",
  [string] $WinScp = "C:\Program Files (x86)\WinSCP\WinSCP.com"
)

$ErrorActionPreference = "Stop"

if (-not $HostName -or -not $UserName -or -not $Password) {
  throw "Set AYUDAVE_SFTP_HOST, AYUDAVE_SFTP_USER and AYUDAVE_SFTP_PASSWORD before deploying."
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
if (-not (Test-Path $dist)) {
  throw "Build first with npm run build."
}

$escapedPassword = [Uri]::EscapeDataString($Password)
$openCommand = "open $Protocol`://$UserName`:$escapedPassword@$HostName`:$Port/"
if ($Protocol -eq "sftp") {
  $openCommand = "$openCommand -hostkey=*"
} elseif ($Protocol -like "ftp*") {
  $openCommand = "$openCommand -certificate=*"
}

$script = Join-Path $env:TEMP ("ayudave-deploy-" + [guid]::NewGuid() + ".txt")
$commands = @(
  "option batch abort",
  "option confirm off",
  $openCommand,
  "mkdir $RemotePath",
  "cd $RemotePath",
  "lcd `"$dist`"",
  "synchronize remote . . -filemask=`"|config.php; data/`"",
  "put -nopreservetime api.php api.php",
  "put -nopreservetime cron-sync.php cron-sync.php",
  "put -nopreservetime index.html index.html",
  "put -nopreservetime admin.html admin.html",
  "exit"
)

try {
  Set-Content -LiteralPath $script -Value $commands -Encoding ASCII
  & $WinScp /ini=nul /script=$script
  if ($LASTEXITCODE -ne 0) {
    throw "WinSCP deploy failed with exit code $LASTEXITCODE."
  }
} finally {
  Remove-Item -LiteralPath $script -Force -ErrorAction SilentlyContinue
}
