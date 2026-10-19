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
$serverFiles = @("server/api.php", "server/schach.php", "server/schach-auslosung.php", "server/speicher.php", "server/leitung.php", "server/pin-einrichten.php")
$clientFiles = @("client/index.html", "client/app.js", "client/turnier-domain.js", "client/schach-domain.js", "client/schach-spieltag.js", "client/offline.js", "client/sw.js", "client/manifest.json", "client/styles.css")
$assetFiles = @("client/assets/tischtennis.svg", "client/assets/schach.svg", "client/assets/reinickendorf-wappen.svg")
# Dateien der frueheren, flachen Struktur werden nach dem Upload entfernt.
$legacyFiles = @("api.php", "schach.php", "schach-auslosung.php", "speicher.php", "leitung.php", "pin-einrichten.php", "app.js", "turnier-domain.js", "schach-domain.js", "schach-spieltag.js", "index.html", "reinickendorf-wappen.svg", "styles.css", "assets/tischtennis.svg", "assets/schach.svg")
$sshOpt = "-o UpdateHostKeys=no"
$remoteApp = "${Webroot}/${AppPath}"
function Get-UploadPaths([string[]] $files) {
    $files | ForEach-Object {
        $path = Join-Path $projectRoot $_
        if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Datei fehlt: $path" }
        $path
    }
}
$uploadServer = Get-UploadPaths $serverFiles
$uploadClient = Get-UploadPaths $clientFiles
$uploadAssets = Get-UploadPaths $assetFiles
$rootHtaccess = Get-UploadPaths @(".htaccess")

if ($WhatIfOnly) {
    Write-Host "Wuerde nach ${User}@${Server}:${remoteApp}/ hochladen:" -ForegroundColor Yellow
    (@(".htaccess") + $serverFiles + $clientFiles + $assetFiles) | ForEach-Object { Write-Host "  $_" }
    Write-Host "Die lokale PIN-Konfiguration wird nur bei der Ersteinrichtung uebernommen. Vorhandene Daten und Sicherungen bleiben erhalten."
    exit 0
}

$localPinFile = Join-Path $projectRoot 'data/leitung.json'
if (!(Test-Path -LiteralPath $localPinFile -PathType Leaf)) { throw 'Bitte zuerst die PIN der Gesamtverwaltung mit php server/pin-einrichten.php einrichten.' }

Write-Host "Bereite Zielverzeichnis vor..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "mkdir -p '${remoteApp}/data' '${remoteApp}/server' '${remoteApp}/client/assets'"
if ($LASTEXITCODE -ne 0) { throw "Remote-Verzeichnis konnte nicht vorbereitet werden." }

Write-Host "Lade Server und Client hoch..." -ForegroundColor Cyan
scp -P $Port $sshOpt @uploadServer "${User}@${Server}:${remoteApp}/server/"
if ($LASTEXITCODE -ne 0) { throw "Upload des Servers fehlgeschlagen." }
scp -P $Port $sshOpt @uploadClient "${User}@${Server}:${remoteApp}/client/"
if ($LASTEXITCODE -ne 0) { throw "Upload des Clients fehlgeschlagen." }
scp -P $Port $sshOpt @uploadAssets "${User}@${Server}:${remoteApp}/client/assets/"
if ($LASTEXITCODE -ne 0) { throw "Upload der SVG-Grafiken fehlgeschlagen." }

# Erst wenn client/ und server/ vollstaendig sind, leitet die .htaccess dorthin um.
# Sie sperrt data/ und server/ weiterhin gegen direkten Zugriff.
scp -P $Port $sshOpt @rootHtaccess "${User}@${Server}:${remoteApp}/.htaccess"
if ($LASTEXITCODE -ne 0) { throw '.htaccess konnte nicht hochgeladen werden.' }

$legacyPaths = ($legacyFiles | ForEach-Object { "'${remoteApp}/$_'" }) -join ' '
ssh -p $Port $sshOpt "${User}@${Server}" "rm -f $legacyPaths && (rmdir '${remoteApp}/assets' 2>/dev/null || true)"
if ($LASTEXITCODE -ne 0) { throw 'Alte Anwendungsdateien konnten nicht entfernt werden.' }

Write-Host "Pruefe PIN der Gesamtverwaltung..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "test -f '${remoteApp}/data/leitung.json'"
if ($LASTEXITCODE -eq 1) {
    scp -P $Port $sshOpt $localPinFile "${User}@${Server}:${remoteApp}/data/leitung-initial.json"
    if ($LASTEXITCODE -ne 0) { throw 'PIN-Konfiguration konnte nicht uebertragen werden.' }
    ssh -p $Port $sshOpt "${User}@${Server}" "if [ ! -f '${remoteApp}/data/leitung.json' ]; then mv '${remoteApp}/data/leitung-initial.json' '${remoteApp}/data/leitung.json'; else rm -f '${remoteApp}/data/leitung-initial.json'; fi; chmod 600 '${remoteApp}/data/leitung.json'"
    if ($LASTEXITCODE -ne 0) { throw 'PIN der Gesamtverwaltung konnte nicht eingerichtet werden.' }
} elseif ($LASTEXITCODE -ne 0) { throw 'PIN-Konfiguration auf dem Server konnte nicht geprueft werden.' }

Write-Host "Setze Dateirechte..." -ForegroundColor Cyan
ssh -p $Port $sshOpt "${User}@${Server}" "chmod 755 '${remoteApp}' '${remoteApp}/server' '${remoteApp}/client' '${remoteApp}/client/assets' && chmod 644 '${remoteApp}/.htaccess' && find '${remoteApp}/server' '${remoteApp}/client' -type f -exec chmod 644 {} \; && chmod 775 '${remoteApp}/data'"
if ($LASTEXITCODE -ne 0) { throw "Dateirechte konnten nicht gesetzt werden." }

Write-Host "Fertig! https://senioren-luebars.berlin/${AppPath}/" -ForegroundColor Green
