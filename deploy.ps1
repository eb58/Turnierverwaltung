param(
    [string] $Server = "56759440.ssh.w1.strato.hosting",
    [string] $User = "stu512072182",
    [int] $Port = 22,
    [string] $Webroot = "Seniorenclub",
    [string] $AppPath = "turnierverwaltung",
    [switch] $WhatIfOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$appFiles = @(".htaccess", "api.php", "app.js", "turnier-domain.js", "index.html", "reinickendorf-wappen.svg", "styles.css")
$sshOpt = "-o UpdateHostKeys=no"
$remoteApp = "${Webroot}/${AppPath}"
$uploadFiles = $appFiles | ForEach-Object {
    $path = Join-Path $projectRoot $_
    if (!(Test-Path -LiteralPath $path)) { throw "Datei fehlt: $path" }
    $path
}

if ($WhatIfOnly) {
    Write-Host "Wuerde nach ${User}@${Server}:${remoteApp}/ hochladen:" -ForegroundColor Yellow
    $appFiles | ForEach-Object { Write-Host "  $_" }
    exit 0
}

Write-Host "Bereinige Zielverzeichnis..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "mkdir -p '${remoteApp}/data' && find '${remoteApp}' -mindepth 1 -maxdepth 1 ! -name 'data' -exec rm -rf -- {} \;"
if ($LASTEXITCODE -ne 0) { throw "Remote-Verzeichnis konnte nicht vorbereitet werden." }

Write-Host "Lade App hoch..." -ForegroundColor Cyan
scp -P $Port $sshOpt @uploadFiles "${User}@${Server}:${remoteApp}/"
if ($LASTEXITCODE -ne 0) { throw "Upload fehlgeschlagen." }

Write-Host "Setze Dateirechte..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "find '${remoteApp}' -type d -exec chmod 755 {} \; && find '${remoteApp}' -type f -exec chmod 644 {} \; && chmod 775 '${remoteApp}/data'"
if ($LASTEXITCODE -ne 0) { throw "Dateirechte konnten nicht gesetzt werden." }

Write-Host "Fertig! https://senioren-luebars.berlin/${AppPath}/" -ForegroundColor Green
