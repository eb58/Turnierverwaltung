<?php

declare(strict_types=1);

function datenOrdner(): string
{
    $dir = dirname(DATA_FILE);
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) throw new ApiError('Datenordner konnte nicht angelegt werden.', 500);
    return $dir;
}

function jsonDatei(string $pfad, mixed $standard = null): mixed
{
    if (!is_file($pfad)) return $standard;
    $raw = @file_get_contents($pfad);
    if ($raw === false || $raw === '') throw new ApiError('Eine Datendatei konnte nicht gelesen werden. Die vorhandenen Daten bleiben erhalten.', 500);
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
}

function jsonAtomarSpeichern(string $pfad, array $daten): void
{
    $json = json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
    $temp = @tempnam(dirname($pfad), '.turnier-');
    if ($temp === false) throw new ApiError('Die Sicherung konnte nicht vorbereitet werden.', 500);
    try {
        if (@file_put_contents($temp, $json, LOCK_EX) !== strlen($json)) throw new ApiError('Die Daten konnten nicht vollständig gespeichert werden.', 500);
        @chmod($temp, 0600);
        if (!@rename($temp, $pfad)) throw new ApiError('Die Daten konnten nicht gespeichert werden. Der bisherige Stand bleibt erhalten.', 500);
    } finally { if (is_file($temp)) unlink($temp); }
}

function mitDateiSperre(string $pfad, callable $callback, bool $schreiben = true): mixed
{
    $handle = @fopen($pfad, 'c+');
    if ($handle === false) throw new ApiError('Die Daten sind gerade nicht verfügbar.', 503);
    @chmod($pfad, 0600);
    try {
        if (!flock($handle, $schreiben ? LOCK_EX : LOCK_SH)) throw new ApiError('Die Daten sind gerade nicht verfügbar.', 503);
        return $callback();
    } finally { flock($handle, LOCK_UN); fclose($handle); }
}

function sicherungsOrdner(): string
{
    $dir = datenOrdner() . DIRECTORY_SEPARATOR . 'sicherungen';
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) throw new ApiError('Sicherungsordner konnte nicht angelegt werden.', 500);
    return $dir;
}

function aenderungsBeschreibung(?array $vorher, ?array $nachher, string $aktion): string
{
    if ($aktion === 'wiederherstellen') return 'Früheren Stand wiederhergestellt';
    if ($vorher === null) return $aktion === 'importieren' ? 'Turnier importiert' : 'Turnier angelegt';
    if ($nachher === null) return 'Turnier gelöscht';
    if ($aktion === 'ergebnis') {
        $namen = array_column($nachher['teilnehmer'], 'name', 'id');
        foreach ($nachher['runden'] as $r => $runde) foreach ($runde as $s => $spiel) {
            $alt = $vorher['runden'][$r][$s];
            if ($alt['punkteA'] === $spiel['punkteA'] && $alt['punkteB'] === $spiel['punkteB'] && $alt['saetze'] === $spiel['saetze']) continue;
            $format = fn(array $partie): string => $partie['punkteA'] === null ? 'offen' : str_replace('0.5', '½', $partie['punkteA'] . ':' . $partie['punkteB']);
            return 'Runde ' . ($r + 1) . ': ' . $namen[$spiel['a']] . ' – ' . $namen[$spiel['b']] . ': ' . $format($alt) . ' → ' . $format($spiel);
        }
    }
    return match ($aktion) {
        'umbenennen' => 'Turnier umbenannt', 'teilnehmer' => 'Teilnehmer geändert',
        'tische' => 'Tisch- oder Brettanzahl geändert', 'spielwertung' => 'Spielwertung geändert',
        'erfassungsart' => 'Ergebniserfassung geändert', 'wartung' => 'Spielplan aktualisiert',
        'auslosen' => 'Anwesende Spieler ausgelost', 'spieltag-beenden' => 'Spieltag beendet',
        default => 'Turnierdaten geändert',
    };
}

function withStore(callable $callback, bool $write = false): mixed
{
    datenOrdner();
    return mitDateiSperre(DATA_FILE . '.lock', function () use ($callback, $write): mixed {
        $dokument = jsonDatei(DATA_FILE, []);
        if (!is_array($dokument)) throw new ApiError('Ungültige Turnierdaten. Die Datei wird nicht überschrieben.', 500);
        if (array_is_list($dokument)) { $turniere = $dokument; $verlauf = []; }
        elseif (($dokument['format'] ?? '') === 'turnierverwaltung-store' && is_array($dokument['turniere'] ?? null) && is_array($dokument['verlauf'] ?? null)) {
            $turniere = $dokument['turniere']; $verlauf = $dokument['verlauf'];
        } else throw new ApiError('Unbekanntes Datenformat. Die Datei wird nicht überschrieben.', 500);
        $original = $turniere;
        $result = $callback($turniere, $verlauf);
        if ($write && $turniere !== $original) {
            $alte = array_column($original, null, 'id'); $neue = array_column($turniere, null, 'id');
            foreach (array_unique([...array_keys($alte), ...array_keys($neue)]) as $id) {
                $vorher = $alte[$id] ?? null; $nachher = $neue[$id] ?? null;
                if ($vorher === $nachher) continue;
                $aktion = $_GET['action'] ?? 'wartung';
                $eintrag = ['id' => bin2hex(random_bytes(12)), 'zeit' => gmdate('c'), 'turnierId' => $id,
                    'titel' => ($nachher ?? $vorher)['titel'], 'aktion' => $aktion,
                    'beschreibung' => aenderungsBeschreibung($vorher, $nachher, $aktion),
                    'vorherVersion' => $vorher['version'] ?? null, 'nachherVersion' => $nachher['version'] ?? null];
                jsonAtomarSpeichern(sicherungsOrdner() . '/' . $eintrag['id'] . '.json', ['eintrag' => $eintrag, 'vorher' => $vorher, 'nachher' => $nachher]);
                $verlauf[] = $eintrag;
            }
            // Erst nachdem die Sicherungen vollständig geschrieben sind, wird der aktuelle Stand ersetzt.
            jsonAtomarSpeichern(DATA_FILE, ['format' => 'turnierverwaltung-store', 'version' => 1, 'turniere' => $turniere, 'verlauf' => $verlauf]);
        }
        return $result;
    }, $write);
}

function naechsteTurnierId(array $turniere, array $verlauf): int
{
    return max([0, ...array_column($turniere, 'id'), ...array_column($verlauf, 'turnierId')]) + 1;
}

function sicherungsStand(array $verlauf, mixed $id, mixed $seite): array
{
    if (!is_string($id) || !preg_match('/^[a-f0-9]{24}$/D', $id) || !in_array($seite, ['vorher', 'nachher'], true)) throw new ApiError('Ungültiger Sicherungsstand.');
    foreach ($verlauf as $eintrag) {
        if ($eintrag['id'] !== $id) continue;
        $sicherung = jsonDatei(sicherungsOrdner() . '/' . $id . '.json');
        $stand = $sicherung[$seite] ?? null;
        if (!is_array($stand)) throw new ApiError('Zu diesem Zeitpunkt war das Turnier nicht vorhanden.', 404);
        return ['turnier' => $stand, 'eintrag' => $eintrag];
    }
    throw new ApiError('Sicherung nicht gefunden.', 404);
}
