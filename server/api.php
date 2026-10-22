<?php

declare(strict_types=1);

define('DATA_FILE', getenv('TURNIER_DATA_FILE') ?: dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'turniere.json');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

final class ApiError extends RuntimeException
{
    public function __construct(string $message, public readonly int $statusCode = 400)
    {
        parent::__construct($message);
    }
}

require_once __DIR__ . '/schach.php';
require_once __DIR__ . '/schach-auslosung.php';
require_once __DIR__ . '/speicher.php';
require_once __DIR__ . '/leitung.php';

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
    exit;
}

function body(): array
{
    $decoded = json_decode(file_get_contents('php://input') ?: 'null', true);
    if (!is_array($decoded)) throw new ApiError('Ungültige Anfrage.');
    return $decoded;
}

function text(mixed $value, int $max, string $label): string
{
    if (!is_string($value) || trim($value) === '' || strlen(trim($value)) > $max) {
        throw new ApiError("Bitte $label eingeben (maximal $max Zeichen).");
    }
    return trim(preg_replace('/\s+/', ' ', $value));
}

function spiel(int $runde, int $index, ?int $a, ?int $b): array
{
    return ['id' => 'r' . ($runde + 1) . '-s' . ($index + 1), 'a' => $a, 'b' => $b,
        'saetze' => [], 'punkteA' => null, 'punkteB' => null, 'sieger' => null, 'status' => 'offen'];
}

function berechnen(array $turnier): array
{
    foreach ($turnier['runden'] as $r => $runde) {
        foreach ($runde as $s => $begegnung) {
            $bereit = true;
            if ($turnier['modus'] === 'ko' && $r > 0) {
                $links = $turnier['runden'][$r - 1][$s * 2];
                $rechts = $turnier['runden'][$r - 1][$s * 2 + 1] ?? null;
                $a = $links['sieger']; $b = $rechts['sieger'] ?? null;
                if ($begegnung['a'] !== $a || $begegnung['b'] !== $b) {
                    $begegnung['punkteA'] = $begegnung['punkteB'] = null;
                    $begegnung['saetze'] = [];
                }
                $begegnung['a'] = $a; $begegnung['b'] = $b;
                $bereit = $a !== null && ($rechts === null || $b !== null);
            }
            $begegnung['sieger'] = null;
            $begegnung['status'] = $bereit ? 'offen' : 'wartet';
            if (istSchach($turnier) && isset($begegnung['altErgebnis'])) {
                $begegnung['status'] = 'fertig';
                $turnier['runden'][$r][$s] = $begegnung;
                continue;
            }
            $istFreilos = $turnier['modus'] === 'ko' && $begegnung['b'] === null
                && ($r === 0 || (($turnier['koSchema'] ?? 'klassisch') === 'kompakt' && !isset($turnier['runden'][$r - 1][$s * 2 + 1])));
            if ($bereit && $istFreilos) {
                $begegnung['sieger'] = $begegnung['a']; $begegnung['status'] = 'freilos';
            } elseif ($bereit && $begegnung['punkteA'] !== null && $begegnung['punkteB'] !== null) {
                $begegnung['status'] = 'fertig';
                $begegnung['sieger'] = $begegnung['punkteA'] === $begegnung['punkteB'] ? null
                    : ($begegnung['punkteA'] > $begegnung['punkteB'] ? $begegnung['a'] : $begegnung['b']);
            }
            $turnier['runden'][$r][$s] = $begegnung;
        }
    }
    return $turnier;
}

function teilnehmerPruefen(mixed $eingaben, string $sportart): array
{
    $schach = $sportart === 'schach'; $minimum = $schach ? 2 : 5;
    if (!is_array($eingaben) || count($eingaben) < $minimum || count($eingaben) > 32) {
        throw new ApiError($schach ? 'Ein Schachturnier benötigt 2 bis 32 Spieler.' : 'Ein Turnier benötigt 5 bis 32 Doppelpaare.');
    }
    $teilnehmer = []; $namen = [];
    foreach (array_values($eingaben) as $index => $eingabe) {
        $personen = $eingabe['spieler'] ?? null;
        if (!is_array($personen) || count($personen) !== ($schach ? 1 : 2)) {
            throw new ApiError($schach ? 'Jeder Teilnehmer benötigt genau einen Spielernamen.' : 'Jedes Doppel benötigt genau zwei Spieler.');
        }
        $spieler = [];
        foreach (array_values($personen) as $person) {
            $name = text($person['name'] ?? null, 100, 'für jeden Spieler einen Namen');
            $key = function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
            if (isset($namen[$key])) throw new ApiError('Ein Spielername darf im Turnier nur einmal vorkommen. Gleichnamige Personen bitte unterscheidbar benennen.');
            $namen[$key] = true; $spieler[] = ['name' => $name];
        }
        $teilnehmer[] = ['id' => $index + 1, 'name' => implode(' / ', array_column($spieler, 'name')), 'spieler' => $spieler];
    }
    return $teilnehmer;
}

function neuesTurnier(array $payload, int $id): array
{
    $titel = text($payload['titel'] ?? null, 100, 'einen Turniernamen');
    $sportart = $payload['sportart'] ?? 'tischtennis';
    if (!in_array($sportart, ['tischtennis', 'schach'], true)) throw new ApiError('Unbekannte Sportart.');
    $schach = $sportart === 'schach';
    $modus = $payload['modus'] ?? '';
    if (!in_array($modus, ['jeder-gegen-jeden', 'ko'], true)) throw new ApiError('Unbekannter Turniermodus.');
    if ($schach && $modus !== 'jeder-gegen-jeden') throw new ApiError('Schachturniere werden jeder gegen jeden gespielt.');
    $durchgaenge = $payload['durchgaenge'] ?? 1;
    if ($schach && (!is_int($durchgaenge) || !in_array($durchgaenge, [1, 2], true))) throw new ApiError('Bitte eine Partie oder Hin- und Rückspiel auswählen.');
    $gewinnsaetze = $schach ? null : gewinnsatzanzahl($payload['gewinnsaetze'] ?? 2);
    $satzweise = $schach ? false : ($payload['satzweise'] ?? false);
    if (!is_bool($satzweise)) throw new ApiError('Ungültige Ergebniserfassung.');
    $teilnehmer = teilnehmerPruefen($payload['teilnehmer'] ?? null, $sportart);
    $koSchema = $payload['koSchema'] ?? 'kompakt';
    if ($modus === 'ko' && !in_array($koSchema, ['kompakt', 'klassisch'], true)) throw new ApiError('Unbekanntes K.-o.-Schema.');
    $turnier = ['id' => $id, 'version' => 1, 'titel' => $titel, 'sportart' => $sportart, 'modus' => $modus, 'teilnehmer' => $teilnehmer, 'runden' => [], 'anzahlTische' => tischanzahl($payload['anzahlTische'] ?? null)];
    if (!$schach) { $turnier['gewinnsaetze'] = $gewinnsaetze; $turnier['satzweise'] = $satzweise; }
    if ($modus === 'ko') $turnier['koSchema'] = $koSchema;
    $ids = array_column($teilnehmer, 'id');
    if ($schach) {
        $turnier['durchgaenge'] = $durchgaenge;
        $turnier['runden'] = schachSpielplan($ids, $durchgaenge);
    } elseif ($modus === 'jeder-gegen-jeden') {
        if (count($ids) % 2) $ids[] = null;
        $anzahl = count($ids);
        for ($r = 0; $r < $anzahl - 1; $r++) {
            $runde = [];
            for ($s = 0; $s < $anzahl / 2; $s++) {
                $a = $ids[$s]; $b = $ids[$anzahl - 1 - $s];
                if ($a !== null && $b !== null) $runde[] = spiel($r, count($runde), $a, $b);
            }
            $turnier['runden'][] = $runde;
            $letzter = array_pop($ids); array_splice($ids, 1, 0, [$letzter]);
        }
    } else {
        if ($koSchema === 'kompakt') {
            for ($r = 0, $anzahl = count($ids); $anzahl > 1; $r++, $anzahl = (int) ceil($anzahl / 2)) {
                $runde = [];
                for ($s = 0; $s < (int) ceil($anzahl / 2); $s++) {
                    $runde[] = spiel($r, $s, $r === 0 ? $ids[$s * 2] : null, $r === 0 ? ($ids[$s * 2 + 1] ?? null) : null);
                }
                $turnier['runden'][] = $runde;
            }
        } else {
            $groesse = 1; while ($groesse < count($ids)) $groesse *= 2;
            $freilose = $groesse - count($ids); $teilnehmerIndex = 0;
            for ($r = 0, $spiele = $groesse / 2; $spiele >= 1; $r++, $spiele /= 2) {
                $runde = [];
                for ($s = 0; $s < $spiele; $s++) {
                    $a = $r === 0 ? $ids[$teilnehmerIndex++] : null;
                    $b = $r === 0 && $s >= $freilose ? $ids[$teilnehmerIndex++] : null;
                    $runde[] = spiel($r, $s, $a, $b);
                }
                $turnier['runden'][] = $runde;
            }
        }
    }
    return berechnen($turnier);
}

function ungespielteKoTurniereUmstellen(array &$turniere): void
{
    foreach ($turniere as &$turnier) {
        if (($turnier['modus'] ?? null) !== 'ko' || ($turnier['koSchema'] ?? 'klassisch') !== 'klassisch') continue;
        foreach ($turnier['runden'] as $runde) foreach ($runde as $spiel) {
            if (($spiel['punkteA'] ?? null) !== null || ($spiel['punkteB'] ?? null) !== null) continue 3;
        }
        $neu = neuesTurnier([
            'titel' => $turnier['titel'], 'modus' => 'ko', 'koSchema' => 'kompakt',
            'gewinnsaetze' => $turnier['gewinnsaetze'] ?? 3,
            'satzweise' => $turnier['satzweise'] ?? false,
            'teilnehmer' => $turnier['teilnehmer'],
            'anzahlTische' => $turnier['anzahlTische'] ?? null,
        ], $turnier['id']);
        $neu['version'] = $turnier['version'] + 1;
        $turnier = $neu;
    }
    unset($turnier);
}

function importiertesTurnier(array $payload, int $id): array
{
    $quelle = $payload['turnier'] ?? null;
    if (!is_array($quelle) || ($payload['format'] ?? '') !== 'turnierverwaltung-backup') {
        throw new ApiError('Die Datei ist keine gültige Turnierverwaltung-Sicherung.');
    }
    $basis = neuesTurnier([
        'titel' => $quelle['titel'] ?? null,
        'sportart' => $quelle['sportart'] ?? 'tischtennis',
        'durchgaenge' => $quelle['durchgaenge'] ?? 1,
        'modus' => $quelle['modus'] ?? null,
        'koSchema' => $quelle['koSchema'] ?? 'klassisch',
        'gewinnsaetze' => $quelle['gewinnsaetze'] ?? 3,
        'satzweise' => $quelle['satzweise'] ?? false,
        'teilnehmer' => $quelle['teilnehmer'] ?? null,
        'anzahlTische' => $quelle['anzahlTische'] ?? null,
    ], $id);
    $runden = $quelle['runden'] ?? null;
    if (!is_array($runden) || count($runden) !== count($basis['runden'])) throw new ApiError('Der gesicherte Spielplan passt nicht zum Turnier.');
    foreach ($basis['runden'] as $r => $runde) {
        if ($r > 0) $basis = berechnen($basis);
        $runde = $basis['runden'][$r];
        if (!is_array($runden[$r] ?? null) || count($runden[$r]) !== count($runde)) throw new ApiError('Der gesicherte Spielplan ist unvollständig.');
        foreach ($runde as $s => $spiel) {
            $gesichert = $runden[$r][$s];
            if (!is_array($gesichert) || ($gesichert['a'] ?? null) !== $spiel['a'] || ($gesichert['b'] ?? null) !== $spiel['b']) {
                throw new ApiError('Der gesicherte Spielplan wurde verändert.');
            }
            $saetze = $gesichert['saetze'] ?? [];
            if (istSchach($basis)) {
                if ($saetze !== []) throw new ApiError('Schachpartien haben keine Sätze.');
                $a = $gesichert['punkteA'] ?? null; $b = $gesichert['punkteB'] ?? null;
                if ($a !== null || $b !== null) schachErgebnis($a, $b);
                $basis['runden'][$r][$s]['punkteA'] = $a;
                $basis['runden'][$r][$s]['punkteB'] = $b;
            } elseif (is_array($saetze) && $saetze) {
                [$a, $b] = satzErgebnis($saetze, $basis['gewinnsaetze']);
                $basis['runden'][$r][$s]['saetze'] = $saetze;
                $basis['runden'][$r][$s]['punkteA'] = $a;
                $basis['runden'][$r][$s]['punkteB'] = $b;
            } elseif (($gesichert['punkteA'] ?? null) !== null || ($gesichert['punkteB'] ?? null) !== null) {
                $a = $gesichert['punkteA'] ?? null; $b = $gesichert['punkteB'] ?? null;
                endErgebnis($a, $b, $basis['gewinnsaetze']);
                $basis['runden'][$r][$s]['punkteA'] = $a;
                $basis['runden'][$r][$s]['punkteB'] = $b;
            }
        }
    }
    if (array_key_exists('altErgebnisse', $quelle)) $basis = schachAltErgebnisse($basis, $quelle['altErgebnisse']);
    $basis = berechnen($basis);
    if (istSchach($basis) && array_key_exists('spieltage', $quelle)) $basis['spieltage'] = schachSpieltagePruefen($basis, $quelle['spieltage']);
    if (array_key_exists('historischeSpieltage', $quelle)) $basis['historischeSpieltage'] = schachHistorischeSpieltagePruefen($basis, $quelle['historischeSpieltage']);
    return $basis;
}

function tischanzahl(mixed $value): ?int
{
    if ($value === null) return null;
    if (!is_int($value) || $value < 1 || $value > 32) throw new ApiError('Bitte eine Anzahl von 1 bis 32 angeben oder das Feld leer lassen.');
    return $value;
}

function gewinnsatzanzahl(mixed $value): int
{
    if (!is_int($value) || !in_array($value, [2, 3], true)) throw new ApiError('Bitte 2 oder 3 Gewinnsätze auswählen.');
    return $value;
}

function satzErgebnis(array $saetze, int $gewinnsaetze): array
{
    if (!$saetze) return [null, null];
    $maximaleSaetze = $gewinnsaetze * 2 - 1;
    if (count($saetze) < $gewinnsaetze || count($saetze) > $maximaleSaetze) throw new ApiError("Eine Begegnung benötigt $gewinnsaetze bis $maximaleSaetze Sätze.");
    $a = $b = 0;
    foreach ($saetze as $satz) {
        if ($a === $gewinnsaetze || $b === $gewinnsaetze) throw new ApiError("Nach dem $gewinnsaetze. Gewinnsatz darf kein weiterer Satz folgen.");
        $x = $satz['a'] ?? null; $y = $satz['b'] ?? null;
        if (!is_int($x) || !is_int($y) || $x < 0 || $y < 0 || $x > 999 || $y > 999) throw new ApiError('Satzpunkte müssen ganze Zahlen sein.');
        $max = max($x, $y); $min = min($x, $y);
        if ($max < 11 || ($max === 11 ? $min > 9 : $max - $min !== 2)) throw new ApiError('Ein Satz endet bei 11 Punkten, danach mit genau 2 Punkten Vorsprung.');
        if ($x > $y) $a++; else $b++;
    }
    if ($a !== $gewinnsaetze && $b !== $gewinnsaetze) throw new ApiError("Die Begegnung endet erst bei $gewinnsaetze Gewinnsätzen.");
    return [$a, $b];
}

function endErgebnis(mixed $a, mixed $b, int $gewinnsaetze): void
{
    if (!is_int($a) || !is_int($b) || !(($a === $gewinnsaetze && $b >= 0 && $b < $gewinnsaetze) || ($b === $gewinnsaetze && $a >= 0 && $a < $gewinnsaetze))) {
        throw new ApiError("Ein Spielergebnis endet bei $gewinnsaetze Gewinnsätzen.");
    }
}

function turnierErgebnis(array $turnier, string $spielId, array $payload): array
{
    $gewinnsaetze = $turnier['gewinnsaetze'] ?? 3;
    $gefunden = false;
    foreach ($turnier['runden'] as $r => $runde) foreach ($runde as $s => $begegnung) {
        if ($begegnung['id'] !== $spielId) continue;
        if (isset($begegnung['altErgebnis'])) throw new ApiError('Für diese Paarung ist nur das gemeinsame historische Ergebnis bekannt. Einzelpartien können nicht überschrieben werden.');
        if (in_array($begegnung['status'], ['wartet', 'freilos'], true)) throw new ApiError('Dieses Spiel kann noch nicht gespielt werden oder ist ein Freilos.');
        if (istSchach($turnier)) {
            if (array_key_exists('saetze', $payload)) throw new ApiError('Schachpartien haben keine Sätze.');
            $a = $payload['punkteA'] ?? null; $b = $payload['punkteB'] ?? null;
            if ($a !== null || $b !== null) schachErgebnis($a, $b);
            elseif (!array_key_exists('punkteA', $payload) || !array_key_exists('punkteB', $payload)) throw new ApiError('Bitte ein Schachergebnis auswählen.');
            $turnier['runden'][$r][$s]['saetze'] = [];
        } elseif (array_key_exists('saetze', $payload)) {
            if (!is_array($payload['saetze'])) throw new ApiError('Bitte Sätze eingeben.');
            [$a, $b] = satzErgebnis($payload['saetze'], $gewinnsaetze);
            $turnier['runden'][$r][$s]['saetze'] = $payload['saetze'];
        } else {
            $a = $payload['punkteA'] ?? null; $b = $payload['punkteB'] ?? null; endErgebnis($a, $b, $gewinnsaetze);
            $turnier['runden'][$r][$s]['saetze'] = [];
        }
        $turnier['runden'][$r][$s]['punkteA'] = $a;
        $turnier['runden'][$r][$s]['punkteB'] = $b;
        $gefunden = true; break 2;
    }
    if (!$gefunden) throw new ApiError('Spiel nicht gefunden.', 404);
    return berechnen($turnier);
}

function turnierIndex(array $turniere, int $id): int
{
    foreach ($turniere as $index => $turnier) if (($turnier['id'] ?? null) === $id) return $index;
    throw new ApiError('Turnier nicht gefunden.', 404);
}

function pruefeVersion(array $turnier, array $payload): void
{
    if (!is_int($payload['version'] ?? null) || $payload['version'] !== $turnier['version']) throw new ApiError('Das Turnier wurde inzwischen geändert. Bitte neu laden.', 409);
}

if (defined('TURNIER_API_NO_DISPATCH') && TURNIER_API_NO_DISPATCH) return;

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? '';
    if ($method === 'GET' && $action === 'leitung') respond(['leitung' => leitungInfo()]);
    if ($method === 'POST' && $action === 'anmelden') { $anmeldung = body(); respond(['leitung' => leitungAnmelden($anmeldung['pin'] ?? null, $anmeldung['turnier'] ?? null)]); }
    if ($method === 'POST' && $action === 'abmelden') respond(['leitung' => leitungAbmelden()]);
    if ($method === 'POST' && $action === 'pin') respond(['leitung' => leitungPinAendern(body())]);
    if ($method !== 'GET') {
        // Die Gesamtverwaltung darf alles; Turnierleitungen nur Aktionen an ihren eigenen Turnieren.
        leitungPruefen(true);
        if (in_array($action, ['anlegen', 'importieren', 'loeschen', 'turnier-pin'], true)) superadminPruefen();
        elseif ($action !== 'wiederherstellen') turnierRechtPruefen(filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT));
    }
    if ($method === 'POST' && $action === 'turnier-pin') {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT);
        withStore(fn(array $turniere): int => turnierIndex($turniere, (int) $id));
        respond(['leitung' => turnierPinSetzen((int) $id, $payload['pin'] ?? null)]);
    }
    if ($method === 'POST' && in_array($action, ['auslosen', 'spieltag-beenden'], true)) {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT);
        respond(withStore(function (array &$turniere) use ($payload, $id, $action): array {
            $index = turnierIndex($turniere, (int) $id); pruefeVersion($turniere[$index], $payload);
            $turniere[$index] = $action === 'auslosen' ? schachAuslosen($turniere[$index], $payload) : schachSpieltagBeenden($turniere[$index]);
            $turniere[$index]['version']++;
            return ['turnier' => $turniere[$index]];
        }, true));
    }
    if ($method === 'GET' && $action === 'verlauf') {
        $info = leitungPruefen();
        respond(withStore(fn(array $turniere, array $verlauf): array => ['verlauf' => array_values(array_reverse(
            array_filter($verlauf, fn(array $eintrag): bool => darfTurnier($info, $eintrag['turnierId']))))]));
    }
    if ($method === 'GET' && $action === 'stand') {
        $info = leitungPruefen();
        respond(withStore(function (array $turniere, array $verlauf) use ($info): array {
            $result = sicherungsStand($verlauf, $_GET['sicherung'] ?? null, $_GET['seite'] ?? null);
            if (!darfTurnier($info, $result['turnier']['id'])) throw new ApiError('Für dieses Turnier bist du nicht als Turnierleitung angemeldet.', 403);
            $aktuell = array_column($turniere, null, 'id')[$result['turnier']['id']] ?? null;
            return $result + ['aktuelleVersion' => $aktuell['version'] ?? null];
        }));
    }
    if ($method === 'POST' && $action === 'wiederherstellen') {
        $payload = body(); $info = leitungInfo();
        respond(withStore(function (array &$turniere, array $verlauf) use ($payload, $info): array {
            $stand = sicherungsStand($verlauf, $payload['sicherung'] ?? null, $payload['seite'] ?? null)['turnier'];
            if (!darfTurnier($info, $stand['id'])) throw new ApiError('Für dieses Turnier bist du nicht als Turnierleitung angemeldet.', 403);
            $aktuell = array_column($turniere, null, 'id')[$stand['id']] ?? null;
            if (!array_key_exists('version', $payload) || $payload['version'] !== ($aktuell['version'] ?? null)) throw new ApiError('Das Turnier wurde inzwischen geändert. Bitte die Vorschau erneut öffnen.', 409);
            $versionen = [0, $stand['version'], $aktuell['version'] ?? 0];
            foreach ($verlauf as $eintrag) if ($eintrag['turnierId'] === $stand['id']) {
                $versionen[] = $eintrag['vorherVersion'] ?? 0; $versionen[] = $eintrag['nachherVersion'] ?? 0;
            }
            $stand['version'] = max($versionen) + 1;
            $turniere = array_values(array_filter($turniere, fn(array $turnier): bool => $turnier['id'] !== $stand['id']));
            array_unshift($turniere, $stand);
            return ['turnier' => $stand];
        }, true));
    }
    if ($method === 'GET' && $action === '') {
        $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false) throw new ApiError('Ungültige Turniernummer.');
        $leitung = leitungInfo();
        respond(withStore(function (array &$turniere) use ($leitung, $id): array {
            if ($leitung['superadmin']) ungespielteKoTurniereUmstellen($turniere);
            // Ohne Turnier-Link sieht man nur die Turniere, für die man angemeldet ist.
            $auswahl = $id !== null ? [$turniere[turnierIndex($turniere, $id)]]
                : array_values(array_filter($turniere, fn(array $turnier): bool => darfTurnier($leitung, $turnier['id'])));
            return ['turniere' => $auswahl, 'leitung' => $leitung];
        }, $leitung['superadmin']));
    }
    if ($method === 'POST' && $action === 'anlegen') {
        $payload = body();
        $result = withStore(function (array &$turniere, array $verlauf) use ($payload): array {
            $id = naechsteTurnierId($turniere, $verlauf);
            $turnier = neuesTurnier($payload, $id); array_unshift($turniere, $turnier);
            return ['turnier' => $turnier];
        }, true);
        respond($result, 201);
    }
    if ($method === 'POST' && $action === 'importieren') {
        $payload = body();
        $result = withStore(function (array &$turniere, array $verlauf) use ($payload): array {
            $id = naechsteTurnierId($turniere, $verlauf);
            $turnier = importiertesTurnier($payload, $id); array_unshift($turniere, $turnier);
            return ['turnier' => $turnier];
        }, true);
        respond($result, 201);
    }
    if ($method === 'DELETE' && $action === 'loeschen') {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT);
        $result = withStore(function (array &$turniere) use ($payload, $id): array {
            $index = turnierIndex($turniere, (int) $id); pruefeVersion($turniere[$index], $payload);
            $geloescht = $turniere[$index]['id'];
            array_splice($turniere, $index, 1);
            return ['geloescht' => $geloescht];
        }, true);
        turnierPinSetzen($result['geloescht'], null);
        respond($result);
    }
    if ($method === 'PUT' && $action === 'turnier') {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT);
        $result = withStore(function (array &$turniere) use ($payload, $id): array {
            $index = turnierIndex($turniere, (int) $id); pruefeVersion($turniere[$index], $payload);
            $bisher = $turniere[$index];
            $geprueft = neuesTurnier(['sportart' => $payload['sportart'] ?? $bisher['sportart'] ?? 'tischtennis', 'durchgaenge' => $payload['durchgaenge'] ?? $bisher['durchgaenge'] ?? 1, 'koSchema' => $bisher['koSchema'] ?? 'klassisch'] + $payload, $bisher['id']);
            $begonnen = !empty($bisher['spieltage']) || !empty($bisher['altErgebnisse']);
            foreach ($bisher['runden'] as $runde) foreach ($runde as $spiel) {
                if (($spiel['punkteA'] ?? null) !== null || ($spiel['punkteB'] ?? null) !== null) $begonnen = true;
            }
            if ($begonnen) {
                if (($geprueft['sportart'] ?? 'tischtennis') !== ($bisher['sportart'] ?? 'tischtennis')
                    || $geprueft['modus'] !== $bisher['modus']
                    || (istSchach($bisher) && ($geprueft['durchgaenge'] ?? 1) !== ($bisher['durchgaenge'] ?? 1))
                    || (!istSchach($bisher) && $geprueft['gewinnsaetze'] !== ($bisher['gewinnsaetze'] ?? 3))
                    || count($geprueft['teilnehmer']) !== count($bisher['teilnehmer'])) {
                    throw new ApiError('Sportart, Turniermodus, Spielwertung und Teilnehmerzahl können nach dem ersten Ergebnis oder der ersten Auslosung nicht mehr geändert werden.');
                }
                $bisher['titel'] = $geprueft['titel'];
                if (!istSchach($bisher)) $bisher['satzweise'] = $geprueft['satzweise'];
                $bisher['anzahlTische'] = $geprueft['anzahlTische'];
                $bisher['teilnehmer'] = $geprueft['teilnehmer'];
                $bisher['version']++;
                $turniere[$index] = berechnen($bisher);
            } else {
                $geprueft['version'] = $bisher['version'] + 1;
                $turniere[$index] = $geprueft;
            }
            return ['turnier' => $turniere[$index]];
        }, true);
        respond($result);
    }
    if ($method === 'PUT' && $action === 'umbenennen') {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT);
        $result = withStore(function (array &$turniere) use ($payload, $id): array {
            $index = turnierIndex($turniere, (int) $id); pruefeVersion($turniere[$index], $payload);
            $turniere[$index]['titel'] = text($payload['titel'] ?? null, 100, 'einen Turniernamen');
            $turniere[$index]['version']++;
            return ['turnier' => $turniere[$index]];
        }, true);
        respond($result);
    }
    if ($method === 'PUT' && $action === 'teilnehmer') {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT);
        $result = withStore(function (array &$turniere) use ($payload, $id): array {
            $index = turnierIndex($turniere, (int) $id); pruefeVersion($turniere[$index], $payload);
            $eingaben = $payload['teilnehmer'] ?? null;
            $sportart = $turniere[$index]['sportart'] ?? 'tischtennis';
            $geprueft = teilnehmerPruefen($eingaben, $sportart);
            if (count($eingaben) !== count($turniere[$index]['teilnehmer'])) {
                if (!empty($turniere[$index]['altErgebnisse'])) throw new ApiError('Die Teilnehmerzahl kann nach historischen Ergebnissen nicht geändert werden.');
                if (!empty($turniere[$index]['spieltage'])) throw new ApiError('Die Teilnehmerzahl kann nach der ersten Auslosung nicht mehr geändert werden.');
                foreach ($turniere[$index]['runden'] as $runde) foreach ($runde as $spiel) {
                    if (($spiel['punkteA'] ?? null) !== null || ($spiel['punkteB'] ?? null) !== null) {
                        throw new ApiError('Die Teilnehmerzahl kann nur vor dem ersten eingetragenen Ergebnis geändert werden.');
                    }
                }
                $bisher = $turniere[$index];
                $neu = neuesTurnier([
                    'titel' => $bisher['titel'], 'modus' => $bisher['modus'],
                    'sportart' => $sportart,
                    'durchgaenge' => $bisher['durchgaenge'] ?? 1,
                    'koSchema' => $bisher['koSchema'] ?? 'klassisch',
                    'gewinnsaetze' => $bisher['gewinnsaetze'] ?? 3, 'satzweise' => $bisher['satzweise'] ?? false,
                    'teilnehmer' => array_map(fn(array $eingabe): array => ['spieler' => $eingabe['spieler'] ?? null], $eingaben),
                    'anzahlTische' => $bisher['anzahlTische'] ?? null,
                ], $bisher['id']);
                $neu['version'] = $bisher['version'] + 1;
                $turniere[$index] = $neu;
                return ['turnier' => $neu];
            }
            $nachId = [];
            foreach ($eingaben as $eingabe) {
                $teilnehmerId = $eingabe['id'] ?? null;
                if (!is_int($teilnehmerId) || isset($nachId[$teilnehmerId])) throw new ApiError('Ungültiger Teilnehmer.');
                $nachId[$teilnehmerId] = $eingabe;
            }
            $sortiert = [];
            foreach ($turniere[$index]['teilnehmer'] as $teilnehmer) {
                if (!isset($nachId[$teilnehmer['id']])) throw new ApiError('Ungültiger Teilnehmer.');
                $sortiert[] = $nachId[$teilnehmer['id']];
            }
            $geprueft = teilnehmerPruefen($sortiert, $sportart);
            $position = 0;
            foreach ($turniere[$index]['teilnehmer'] as &$teilnehmer) {
                $teilnehmer['spieler'] = $geprueft[$position]['spieler'];
                $teilnehmer['name'] = $geprueft[$position++]['name'];
            }
            unset($teilnehmer);
            $turniere[$index]['version']++;
            return ['turnier' => $turniere[$index]];
        }, true);
        respond($result);
    }
    if ($method === 'PUT' && $action === 'tische') {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT);
        $result = withStore(function (array &$turniere) use ($payload, $id): array {
            $index = turnierIndex($turniere, (int) $id); pruefeVersion($turniere[$index], $payload);
            $turniere[$index]['anzahlTische'] = tischanzahl($payload['anzahlTische'] ?? null);
            $turniere[$index]['version']++; return ['turnier' => $turniere[$index]];
        }, true);
        respond($result);
    }
    if ($method === 'PUT' && $action === 'spielwertung') {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT);
        $result = withStore(function (array &$turniere) use ($payload, $id): array {
            $index = turnierIndex($turniere, (int) $id); pruefeVersion($turniere[$index], $payload);
            if (istSchach($turniere[$index])) throw new ApiError('Schachpartien werden mit 1, ½ oder 0 Punkten gewertet.');
            foreach ($turniere[$index]['runden'] as $runde) foreach ($runde as $spiel) {
                if (($spiel['punkteA'] ?? null) !== null || ($spiel['punkteB'] ?? null) !== null) {
                    throw new ApiError('Die Spielwertung kann nur vor dem ersten eingetragenen Ergebnis geändert werden.');
                }
            }
            $turniere[$index]['gewinnsaetze'] = gewinnsatzanzahl($payload['gewinnsaetze'] ?? null);
            $turniere[$index]['version']++; return ['turnier' => $turniere[$index]];
        }, true);
        respond($result);
    }
    if ($method === 'PUT' && $action === 'erfassungsart') {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT);
        $result = withStore(function (array &$turniere) use ($payload, $id): array {
            $index = turnierIndex($turniere, (int) $id); pruefeVersion($turniere[$index], $payload);
            if (istSchach($turniere[$index])) throw new ApiError('Schachpartien haben keine Satzwertung.');
            if (!is_bool($payload['satzweise'] ?? null)) throw new ApiError('Ungültige Ergebniserfassung.');
            $turniere[$index]['satzweise'] = $payload['satzweise'];
            $turniere[$index]['version']++; return ['turnier' => $turniere[$index]];
        }, true);
        respond($result);
    }
    if ($method === 'PUT' && $action === 'ergebnis') {
        $payload = body(); $id = filter_input(INPUT_GET, 'turnier', FILTER_VALIDATE_INT); $spielId = $_GET['spiel'] ?? '';
        $result = withStore(function (array &$turniere) use ($payload, $id, $spielId): array {
            $index = turnierIndex($turniere, (int) $id); pruefeVersion($turniere[$index], $payload);
            $turniere[$index] = turnierErgebnis($turniere[$index], $spielId, $payload); $turniere[$index]['version']++;
            return ['turnier' => $turniere[$index]];
        }, true);
        respond($result);
    }
    throw new ApiError('Endpunkt nicht gefunden.', 404);
} catch (ApiError $error) {
    respond(['error' => $error->getMessage()], $error->statusCode);
} catch (Throwable $error) {
    error_log((string) $error);
    respond(['error' => 'Interner Serverfehler.'], 500);
}
