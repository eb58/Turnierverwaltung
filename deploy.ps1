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
$appFiles = @(".htaccess", "api.php", "schach.php", "schach-auslosung.php", "speicher.php", "leitung.php", "pin-einrichten.php", "app.js", "turnier-domain.js", "schach-domain.js", "schach-spieltag.js", "index.html", "reinickendorf-wappen.svg", "styles.css")
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
    Write-Host "Die lokale PIN-Konfiguration wird nur bei der Ersteinrichtung uebernommen. Vorhandene Daten und Sicherungen bleiben erhalten."
    exit 0
}

$localPinFile = Join-Path $projectRoot 'data/leitung.json'
if (!(Test-Path -LiteralPath $localPinFile -PathType Leaf)) { throw 'Bitte zuerst die PIN der Gesamtverwaltung mit php pin-einrichten.php einrichten.' }

Write-Host "Bereite Zielverzeichnis vor..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "mkdir -p '${remoteApp}/data'"
if ($LASTEXITCODE -ne 0) { throw "Remote-Verzeichnis konnte nicht vorbereitet werden." }

# Die Zugriffssperre bleibt auch waehrend eines Updates aktiv.
$rootHtaccess = Join-Path $projectRoot '.htaccess'
scp -P $Port $sshOpt $rootHtaccess "${User}@${Server}:${remoteApp}/.htaccess"
if ($LASTEXITCODE -ne 0) { throw 'Datenschutz fuer das Datenverzeichnis konnte nicht vorbereitet werden.' }

Write-Host "Lade App hoch..." -ForegroundColor Cyan
scp -P $Port $sshOpt @uploadFiles "${User}@${Server}:${remoteApp}/"
if ($LASTEXITCODE -ne 0) { throw "Upload fehlgeschlagen." }

Write-Host "Pruefe PIN der Gesamtverwaltung..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "test -f '${remoteApp}/data/leitung.json'"
if ($LASTEXITCODE -eq 1) {
    scp -P $Port $sshOpt $localPinFile "${User}@${Server}:${remoteApp}/data/leitung-initial.json"
    if ($LASTEXITCODE -ne 0) { throw 'PIN-Konfiguration konnte nicht uebertragen werden.' }
    ssh -p $Port $sshOpt "${User}@${Server}" "if [ ! -f '${remoteApp}/data/leitung.json' ]; then mv '${remoteApp}/data/leitung-initial.json' '${remoteApp}/data/leitung.json'; else rm -f '${remoteApp}/data/leitung-initial.json'; fi; chmod 600 '${remoteApp}/data/leitung.json'"
    if ($LASTEXITCODE -ne 0) { throw 'PIN der Gesamtverwaltung konnte nicht eingerichtet werden.' }
} elseif ($LASTEXITCODE -ne 0) { throw 'PIN-Konfiguration auf dem Server konnte nicht geprueft werden.' }

Write-Host "Setze Dateirechte..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "chmod 755 '${remoteApp}' && find '${remoteApp}' -maxdepth 1 -type f -exec chmod 644 {} \; && chmod 775 '${remoteApp}/data'"
if ($LASTEXITCODE -ne 0) { throw "Dateirechte konnten nicht gesetzt werden." }

Write-Host "Fertig! https://senioren-luebars.berlin/${AppPath}/" -ForegroundColor Green
