param(
    [string] $Server = "56759440.ssh.w1.strato.hosting",
    [string] $User = "stu512072182",
    [int] $Port = 22,
    [string] $Webroot = "Seniorenclub",
    [string] $AppPath = "turnierverwaltung",
    [switch] $WhatIfOnly,
    # Schreibt das Deploy-Skript nur in diese Datei, ohne Verbindung zum Server (zur Fehlersuche).
    [string] $SkriptNach
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$serverFiles = @("server/api.php", "server/schach.php", "server/schach-auslosung.php", "server/speicher.php", "server/leitung.php", "server/pin-einrichten.php")
$clientFiles = @("client/index.html", "client/app.js", "client/turnier-domain.js", "client/schach-domain.js", "client/schach-spieltag.js", "client/styles.css")
$assetFiles = @("client/assets/tischtennis.svg", "client/assets/schach.svg", "client/assets/reinickendorf-wappen.svg")
# Dateien der frueheren, flachen Struktur und der verworfenen Offline-Funktion werden nach dem Upload entfernt.
$legacyFiles = @("api.php", "schach.php", "schach-auslosung.php", "speicher.php", "leitung.php", "pin-einrichten.php", "app.js", "turnier-domain.js", "schach-domain.js", "schach-spieltag.js", "index.html", "reinickendorf-wappen.svg", "styles.css", "assets/tischtennis.svg", "assets/schach.svg", "client/offline.js", "client/sw.js", "client/manifest.json")
$remoteApp = "${Webroot}/${AppPath}"
$uploadFiles = @(".htaccess") + $serverFiles + $clientFiles + $assetFiles
foreach ($file in $uploadFiles) {
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot $file) -PathType Leaf)) { throw "Datei fehlt: $file" }
}

if ($WhatIfOnly) {
    Write-Host "Wuerde nach ${User}@${Server}:${remoteApp}/ hochladen:" -ForegroundColor Yellow
    $uploadFiles | ForEach-Object { Write-Host "  $_" }
    Write-Host "Die lokale PIN-Konfiguration wird nur bei der Ersteinrichtung uebernommen. Vorhandene Daten und Sicherungen bleiben erhalten."
    exit 0
}

$localPinFile = Join-Path $projectRoot 'data/leitung.json'
if (!(Test-Path -LiteralPath $localPinFile -PathType Leaf)) { throw 'Bitte zuerst die PIN der Gesamtverwaltung mit php server/pin-einrichten.php einrichten.' }

# Ssh meldet sich mit einem hinterlegten Schluessel an, sonst per Passwort. Damit ein Passwort hoechstens einmal abgefragt wird,
# geht alles in einer einzigen Verbindung: Die Dateien reisen als Base64-Paket im Shell-Skript mit,
# der Server entpackt sie in ein temporaeres Verzeichnis und kopiert sie an ihren Platz.
$temp = Join-Path ([IO.Path]::GetTempPath()) ("turnierverwaltung-deploy-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    Write-Host "Packe Dateien..." -ForegroundColor Cyan
    $paket = Join-Path $temp 'paket.tar.gz'
    & tar.exe --format ustar -czf $paket -C $projectRoot @uploadFiles 'data/leitung.json'
    if ($LASTEXITCODE -ne 0) { throw 'Paket konnte nicht erstellt werden.' }
    $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($paket), [Base64FormattingOptions]::InsertLineBreaks)

    $legacyPaths = ($legacyFiles | ForEach-Object { "'$_'" }) -join ' '
    $skript = @(
        'set -e'
        "app=`"`$HOME/${remoteApp}`""
        'tmp=$(mktemp -d)'
        'trap ''rm -rf "$tmp"'' EXIT'
        'base64 -d > "$tmp/paket.tar.gz" <<''PAKET'''
        ($base64 -replace "`r", '')
        'PAKET'
        'mkdir -p "$tmp/inhalt" "$app/data" "$app/server" "$app/client/assets"'
        'tar -xzf "$tmp/paket.tar.gz" -C "$tmp/inhalt"'
        'cd "$tmp/inhalt"'
        'cp server/* "$app/server/"'
        'for f in client/*; do if [ -f "$f" ]; then cp "$f" "$app/client/"; fi; done'
        'cp client/assets/* "$app/client/assets/"'
        '# Erst wenn client/ und server/ vollstaendig sind, leitet die .htaccess dorthin um. Sie sperrt data/ und server/.'
        'cp .htaccess "$app/.htaccess"'
        'cd "$app"'
        "rm -f $legacyPaths"
        'rmdir assets 2>/dev/null || true'
        '# Die PIN der Gesamtverwaltung wird nur bei der Ersteinrichtung uebernommen.'
        'if [ ! -f data/leitung.json ]; then cp "$tmp/inhalt/data/leitung.json" data/leitung.json; chmod 600 data/leitung.json; echo "PIN der Gesamtverwaltung eingerichtet."; fi'
        '# Zweite Sperre fuer data/: greift auch, falls mod_rewrite einmal nicht aktiv ist. Wird bei jedem Deploy neu geschrieben.'
        'printf ''%s\n'' ''<IfModule mod_authz_core.c>'' ''    Require all denied'' ''</IfModule>'' ''<IfModule !mod_authz_core.c>'' ''    Order allow,deny'' ''    Deny from all'' ''</IfModule>'' > data/.htaccess'
        'chmod 644 data/.htaccess'
        'chmod 755 . server client client/assets'
        'chmod 644 .htaccess'
        'find server client -type f -exec chmod 644 {} \;'
        'chmod 775 data'
        'echo DEPLOY-OK'
    ) -join "`n"
    $skriptDatei = Join-Path $temp 'deploy.sh'
    [IO.File]::WriteAllText($skriptDatei, $skript + "`n", (New-Object Text.UTF8Encoding $false))
    if ($SkriptNach) { Copy-Item -LiteralPath $skriptDatei -Destination $SkriptNach; Write-Host "Skript geschrieben: $SkriptNach"; exit 0 }

    Write-Host "Lade hoch nach ${User}@${Server}:${remoteApp}/ (ein Passwort wird nur abgefragt, wenn kein SSH-Schluessel hinterlegt ist)..." -ForegroundColor Cyan
    $ssh = Start-Process -FilePath ssh -ArgumentList @('-p', $Port, '-o', 'UpdateHostKeys=no', "${User}@${Server}", 'sh -s') `
        -RedirectStandardInput $skriptDatei -NoNewWindow -Wait -PassThru
    if ($ssh.ExitCode -ne 0) { throw "Deploy fehlgeschlagen (ssh-Exitcode $($ssh.ExitCode))." }
} finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Fertig! https://senioren-luebars.berlin/${AppPath}/" -ForegroundColor Green
