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

// Eingerücktes JSON, bei dem kleine Objekte und Listen auf einer Zeile bleiben.
function jsonKompakt(mixed $wert, string $einzug = ''): string
{
    $flags = JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR;
    $zeile = json_encode($wert, $flags);
    if (!is_array($wert) || $wert === [] || strlen($einzug) + strlen($zeile) <= 160) return $zeile;
    $liste = array_is_list($wert); $innen = $einzug . '    '; $teile = [];
    foreach ($wert as $schluessel => $eintrag) {
        $teile[] = $innen . ($liste ? '' : json_encode((string) $schluessel, $flags) . ': ') . jsonKompakt($eintrag, $innen);
    }
    return ($liste ? '[' : '{') . "\n" . implode(",\n", $teile) . "\n" . $einzug . ($liste ? ']' : '}');
}

function jsonAtomarSpeichern(string $pfad, array $daten): void
{
    $json = jsonKompakt($daten);
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

// Mehrere Sperren immer in der übergebenen Reihenfolge nehmen, damit sich Anfragen nicht gegenseitig blockieren.
function mitSperren(array $pfade, callable $callback): mixed
{
    if ($pfade === []) return $callback();
    $erste = array_shift($pfade);
    return mitDateiSperre($erste, fn(): mixed => mitSperren($pfade, $callback));
}

function turniereWurzel(): string
{
    $dir = datenOrdner() . DIRECTORY_SEPARATOR . 'turniere';
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) throw new ApiError('Turnierordner konnte nicht angelegt werden.', 500);
    return $dir;
}

function turnierOrdner(int $id): string
{
    return turniereWurzel() . DIRECTORY_SEPARATOR . $id;
}

function sicherungsOrdner(int $id): string
{
    $dir = turnierOrdner($id) . DIRECTORY_SEPARATOR . 'sicherungen';
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) throw new ApiError('Sicherungsordner konnte nicht angelegt werden.', 500);
    return $dir;
}

// Jedes Turnier hat einen eigenen Ordner. Ein gelöschtes Turnier behält Verlauf und Sicherungen, nur turnier.json fehlt.
function turnierIds(): array
{
    $ids = [];
    foreach (scandir(turniereWurzel()) ?: [] as $name) {
        if (preg_match('/^[1-9][0-9]*$/D', $name) && is_dir(turniereWurzel() . DIRECTORY_SEPARATOR . $name)) $ids[] = (int) $name;
    }
    sort($ids);
    return $ids;
}

function turnierLaden(int $id): ?array
{
    $turnier = jsonDatei(turnierOrdner($id) . '/turnier.json');
    if ($turnier === null) return null;
    if (!is_array($turnier) || ($turnier['id'] ?? null) !== $id) throw new ApiError('Ungültige Turnierdaten. Die Datei wird nicht überschrieben.', 500);
    return turnierAusSpeicherform($turnier);
}

function verlaufLaden(int $id): array
{
    $verlauf = jsonDatei(turnierOrdner($id) . '/verlauf.json', []);
    if (!is_array($verlauf) || !array_is_list($verlauf)) throw new ApiError('Ungültiger Turnierverlauf. Die Datei wird nicht überschrieben.', 500);
    return $verlauf;
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
        'auslosung-zuruecknehmen' => 'Auslosung zurückgenommen',
        default => 'Turnierdaten geändert',
    };
}

// In Dateien steht nur, was sich nicht ableiten lässt: bei Einzelspielern der Name, bei Doppeln die Spieler.
function turnierSpeicherform(?array $turnier): ?array
{
    if ($turnier === null || !is_array($turnier['teilnehmer'] ?? null)) return $turnier;
    $turnier['teilnehmer'] = array_map(function (mixed $teilnehmer): mixed {
        if (!is_array($teilnehmer) || !is_array($teilnehmer['spieler'] ?? null)) return $teilnehmer;
        if ($teilnehmer['spieler'] === [['name' => $teilnehmer['name'] ?? null]]) { unset($teilnehmer['spieler']); return $teilnehmer; }
        if (($teilnehmer['name'] ?? null) === implode(' / ', array_column($teilnehmer['spieler'], 'name'))) unset($teilnehmer['name']);
        return $teilnehmer;
    }, $turnier['teilnehmer']);
    return $turnier;
}

function turnierAusSpeicherform(?array $turnier): ?array
{
    if ($turnier === null || !is_array($turnier['teilnehmer'] ?? null)) return $turnier;
    $turnier['teilnehmer'] = array_map(function (mixed $teilnehmer): mixed {
        if (!is_array($teilnehmer)) return $teilnehmer;
        if (!isset($teilnehmer['spieler']) && is_string($teilnehmer['name'] ?? null)) $teilnehmer['spieler'] = [['name' => $teilnehmer['name']]];
        if (!isset($teilnehmer['name']) && is_array($teilnehmer['spieler'] ?? null)) $teilnehmer['name'] = implode(' / ', array_column($teilnehmer['spieler'], 'name'));
        return ['id' => $teilnehmer['id'] ?? null, 'name' => $teilnehmer['name'] ?? null, 'spieler' => $teilnehmer['spieler'] ?? null] + $teilnehmer;
    }, $turnier['teilnehmer']);
    return $turnier;
}

// Übernimmt die frühere Sammeldatei (turniere.json samt sicherungen/) in einen Ordner je Turnier.
function turnierDatenUebernehmen(): void
{
    if (!is_file(DATA_FILE)) return;
    mitSperren([turniereWurzel() . '/.sperre'], function (): void {
        if (!is_file(DATA_FILE)) return;
        $dokument = jsonDatei(DATA_FILE, []);
        if (!is_array($dokument)) throw new ApiError('Ungültige Turnierdaten. Die Datei wird nicht überschrieben.', 500);
        if (array_is_list($dokument)) { $turniere = $dokument; $verlauf = []; }
        elseif (($dokument['format'] ?? '') === 'turnierverwaltung-store' && is_array($dokument['turniere'] ?? null) && is_array($dokument['verlauf'] ?? null)) {
            $turniere = $dokument['turniere']; $verlauf = $dokument['verlauf'];
        } else throw new ApiError('Unbekanntes Datenformat. Die Datei wird nicht überschrieben.', 500);
        $verlaufNach = []; $nachId = [];
        foreach ($verlauf as $eintrag) $verlaufNach[(int) $eintrag['turnierId']][] = $eintrag;
        foreach ($turniere as $turnier) $nachId[(int) $turnier['id']] = $turnier;
        foreach (array_unique([...array_keys($nachId), ...array_keys($verlaufNach)]) as $id) {
            if ($id < 1) throw new ApiError('Ungültige Turniernummer in den Daten. Die Datei wird nicht übernommen.', 500);
            if (!is_dir(turnierOrdner($id)) && !@mkdir(turnierOrdner($id), 0770, true) && !is_dir(turnierOrdner($id))) throw new ApiError('Turnierordner konnte nicht angelegt werden.', 500);
            $voriger = null; $erster = true;
            foreach ($verlaufNach[$id] ?? [] as $eintrag) {
                $quelle = datenOrdner() . '/sicherungen/' . $eintrag['id'] . '.json';
                if (!preg_match('/^[a-f0-9]{24}$/D', (string) $eintrag['id']) || !is_file($quelle)) { $erster = false; $voriger = false; continue; }
                $sicherung = jsonDatei($quelle);
                // "vorher" nur behalten, wenn es nicht schon der neue Stand der vorigen Sicherung ist.
                if (!$erster && $voriger !== false && ($sicherung['vorher'] ?? null) === $voriger) unset($sicherung['vorher']);
                elseif ($erster && ($sicherung['vorher'] ?? null) === null) unset($sicherung['vorher']);
                jsonAtomarSpeichern(sicherungsOrdner($id) . '/' . $eintrag['id'] . '.json', $sicherung);
                @unlink($quelle);
                $voriger = $sicherung['nachher'] ?? null; $erster = false;
            }
            if (isset($verlaufNach[$id])) jsonAtomarSpeichern(turnierOrdner($id) . '/verlauf.json', $verlaufNach[$id]);
            if (isset($nachId[$id])) jsonAtomarSpeichern(turnierOrdner($id) . '/turnier.json', turnierSpeicherform($nachId[$id]));
        }
        $ziel = DATA_FILE . '.alt';
        if (file_exists($ziel)) $ziel .= '.' . time();
        if (!@rename(DATA_FILE, $ziel)) throw new ApiError('Die alte Turnierdatei konnte nicht beiseitegelegt werden.', 500);
        @rmdir(datenOrdner() . '/sicherungen');
    });
}

// Ohne $turnierId sieht der Aufruf alle Turniere (Sperre über alles), mit $turnierId nur dieses eine (Sperre nur dafür).
// Lesen braucht keine Sperre, weil jede Datei atomar ersetzt wird.
function withStore(callable $callback, bool $write = false, ?int $turnierId = null): mixed
{
    turnierDatenUebernehmen();
    $vorhanden = $turnierId !== null && $turnierId > 0 && is_dir(turnierOrdner($turnierId));
    $lauf = function () use ($callback, $write, $turnierId, $vorhanden): mixed {
        $ids = $turnierId === null ? turnierIds() : ($vorhanden ? [$turnierId] : []);
        $turniere = []; $verlaufNach = [];
        foreach ($ids as $id) {
            $verlaufNach[$id] = verlaufLaden($id);
            $turnier = turnierLaden($id);
            if ($turnier !== null) $turniere[] = $turnier;
        }
        usort($turniere, fn(array $a, array $b): int => $b['id'] <=> $a['id']);
        $verlauf = array_merge(...array_values($verlaufNach));
        usort($verlauf, fn(array $a, array $b): int => strcmp($a['zeit'], $b['zeit']));
        $original = $turniere;
        $result = $callback($turniere, $verlauf);
        if ($write && $turniere !== $original) {
            $alte = array_column($original, null, 'id'); $neue = array_column($turniere, null, 'id');
            foreach (array_unique([...array_keys($alte), ...array_keys($neue)]) as $id) {
                $vorher = $alte[$id] ?? null; $nachher = $neue[$id] ?? null;
                if ($vorher === $nachher) continue;
                if ($turnierId !== null && $id !== $turnierId) throw new ApiError('Ein anderes Turnier darf hier nicht geändert werden.', 500);
                $aktion = $_GET['action'] ?? 'wartung';
                $eintrag = ['id' => bin2hex(random_bytes(12)), 'zeit' => (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.vP'), 'turnierId' => $id,
                    'titel' => ($nachher ?? $vorher)['titel'], 'aktion' => $aktion,
                    'beschreibung' => aenderungsBeschreibung($vorher, $nachher, $aktion),
                    'vorherVersion' => $vorher['version'] ?? null, 'nachherVersion' => $nachher['version'] ?? null];
                // Gespeichert wird nur der neue Stand; der alte steht in der vorigen Sicherung. Erst nach der vollständigen Sicherung wird der aktuelle Stand ersetzt.
                jsonAtomarSpeichern(sicherungsOrdner($id) . '/' . $eintrag['id'] . '.json', ['eintrag' => $eintrag, 'nachher' => turnierSpeicherform($nachher)]
                    + (($verlaufNach[$id] ?? []) === [] && $vorher !== null ? ['vorher' => turnierSpeicherform($vorher)] : []));
                $verlaufNach[$id] = [...($verlaufNach[$id] ?? []), $eintrag];
                jsonAtomarSpeichern(turnierOrdner($id) . '/verlauf.json', $verlaufNach[$id]);
                if ($nachher === null) { if (!@unlink(turnierOrdner($id) . '/turnier.json')) throw new ApiError('Das Turnier konnte nicht gelöscht werden.', 500); }
                else jsonAtomarSpeichern(turnierOrdner($id) . '/turnier.json', turnierSpeicherform($nachher));
            }
        }
        return $result;
    };
    if (!$write) return $lauf();
    if ($turnierId !== null) return $vorhanden ? mitSperren([turnierOrdner($turnierId) . '/.sperre'], $lauf) : $lauf();
    return mitSperren([turniereWurzel() . '/.sperre'], fn(): mixed => mitSperren(array_map(fn(int $id): string => turnierOrdner($id) . '/.sperre', turnierIds()), $lauf));
}

// Nummern gelöschter Turniere bleiben vergeben, weil deren Ordner samt Verlauf erhalten bleibt.
function naechsteTurnierId(): int
{
    return max([0, ...turnierIds()]) + 1;
}

// "vorher" ist der neue Stand der davor liegenden Sicherung desselben Turniers, außer die Sicherung enthält ihn selbst.
function sicherungInhalt(int $turnierId, string $id, string $seite): ?array
{
    $datei = fn(string $name): mixed => jsonDatei(turnierOrdner($turnierId) . '/sicherungen/' . $name . '.json');
    $sicherung = $datei($id);
    if (!is_array($sicherung)) throw new ApiError('Sicherung nicht gefunden.', 404);
    if ($seite === 'nachher' || array_key_exists('vorher', $sicherung)) return $sicherung[$seite] ?? null;
    $ids = array_column(verlaufLaden($turnierId), 'id');
    $position = array_search($id, $ids, true);
    if ($position === false || $position === 0) return null;
    $voriger = $datei($ids[$position - 1]);
    return is_array($voriger) ? ($voriger['nachher'] ?? null) : null;
}

function sicherungsStand(array $verlauf, mixed $id, mixed $seite): array
{
    if (!is_string($id) || !preg_match('/^[a-f0-9]{24}$/D', $id) || !in_array($seite, ['vorher', 'nachher'], true)) throw new ApiError('Ungültiger Sicherungsstand.');
    foreach ($verlauf as $eintrag) {
        if ($eintrag['id'] !== $id) continue;
        $stand = sicherungInhalt((int) $eintrag['turnierId'], $id, $seite);
        if (!is_array($stand)) throw new ApiError('Zu diesem Zeitpunkt war das Turnier nicht vorhanden.', 404);
        return ['turnier' => turnierAusSpeicherform($stand), 'eintrag' => $eintrag];
    }
    throw new ApiError('Sicherung nicht gefunden.', 404);
}
