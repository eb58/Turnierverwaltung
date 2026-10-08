<?php

declare(strict_types=1);

define('DATA_FILE', getenv('TURNIER_DATA_FILE') ?: __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'turniere.json');

header('Content-Type: application/json; charset=utf-8');

final class ApiError extends RuntimeException
{
    public function __construct(string $message, public readonly int $statusCode = 400)
    {
        parent::__construct($message);
    }
}

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

function withStore(callable $callback, bool $write = false): mixed
{
    $dir = dirname(DATA_FILE);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) throw new ApiError('Datenordner konnte nicht angelegt werden.', 500);
    $handle = fopen(DATA_FILE, 'c+');
    if ($handle === false) throw new ApiError('Turnierdaten konnten nicht geöffnet werden.', 500);
    try {
        if (!flock($handle, $write ? LOCK_EX : LOCK_SH)) throw new ApiError('Turnierdaten sind gerade nicht verfügbar.', 503);
        rewind($handle);
        $raw = stream_get_contents($handle);
        $turniere = $raw ? json_decode($raw, true, 512, JSON_THROW_ON_ERROR) : [];
        if (!is_array($turniere)) $turniere = [];
        $result = $callback($turniere);
        if ($write) {
            rewind($handle); ftruncate($handle, 0);
            fwrite($handle, json_encode($turniere, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
            fflush($handle);
        }
        flock($handle, LOCK_UN);
        return $result;
    } finally { fclose($handle); }
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
                $rechts = $turnier['runden'][$r - 1][$s * 2 + 1];
                $a = $links['sieger']; $b = $rechts['sieger'];
                if ($begegnung['a'] !== $a || $begegnung['b'] !== $b) {
                    $begegnung['punkteA'] = $begegnung['punkteB'] = null;
                    $begegnung['saetze'] = [];
                }
                $begegnung['a'] = $a; $begegnung['b'] = $b;
                $bereit = $a !== null && $b !== null;
            }
            $begegnung['sieger'] = null;
            $begegnung['status'] = $bereit ? 'offen' : 'wartet';
            if ($turnier['modus'] === 'ko' && $r === 0 && $begegnung['b'] === null) {
                $begegnung['sieger'] = $begegnung['a']; $begegnung['status'] = 'freilos';
            } elseif ($bereit && $begegnung['punkteA'] !== null && $begegnung['punkteB'] !== null) {
                $begegnung['status'] = 'fertig';
                $begegnung['sieger'] = $begegnung['punkteA'] > $begegnung['punkteB'] ? $begegnung['a'] : $begegnung['b'];
            }
            $turnier['runden'][$r][$s] = $begegnung;
        }
    }
    return $turnier;
}

function neuesTurnier(array $payload, int $id): array
{
    $titel = text($payload['titel'] ?? null, 100, 'einen Turniernamen');
    $modus = $payload['modus'] ?? '';
    if (!in_array($modus, ['jeder-gegen-jeden', 'ko'], true)) throw new ApiError('Unbekannter Turniermodus.');
    $eingaben = $payload['teilnehmer'] ?? null;
    if (!is_array($eingaben) || count($eingaben) < 5 || count($eingaben) > 32) throw new ApiError('Ein Turnier benötigt 5 bis 32 Doppelpaare.');
    $teilnehmer = []; $namen = [];
    foreach (array_values($eingaben) as $index => $eingabe) {
        $personen = $eingabe['spieler'] ?? null;
        if (!is_array($personen) || count($personen) !== 2) throw new ApiError('Jedes Doppel benötigt genau zwei Spieler.');
        $spieler = [];
        foreach (array_values($personen) as $person) {
            $name = text($person['name'] ?? null, 100, 'für jeden Spieler einen Namen');
            $key = function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
            if (isset($namen[$key])) throw new ApiError('Ein Spieler darf nur in einem Doppelpaar vorkommen. Gleichnamige Personen bitte unterscheidbar benennen.');
            $namen[$key] = true; $spieler[] = ['name' => $name];
        }
        $teilnehmer[] = ['id' => $index + 1, 'name' => $spieler[0]['name'] . ' / ' . $spieler[1]['name'], 'spieler' => $spieler];
    }
    $turnier = ['id' => $id, 'version' => 1, 'titel' => $titel, 'modus' => $modus, 'teilnehmer' => $teilnehmer, 'runden' => [], 'anzahlTische' => tischanzahl($payload['anzahlTische'] ?? null)];
    $ids = array_column($teilnehmer, 'id');
    if ($modus === 'jeder-gegen-jeden') {
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
    return berechnen($turnier);
}

function importiertesTurnier(array $payload, int $id): array
{
    $quelle = $payload['turnier'] ?? null;
    if (!is_array($quelle) || ($payload['format'] ?? '') !== 'turnierverwaltung-backup') {
        throw new ApiError('Die Datei ist keine gültige Turnierverwaltung-Sicherung.');
    }
    $basis = neuesTurnier([
        'titel' => $quelle['titel'] ?? null,
        'modus' => $quelle['modus'] ?? null,
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
            if (is_array($saetze) && $saetze) {
                [$a, $b] = satzErgebnis($saetze);
                $basis['runden'][$r][$s]['saetze'] = $saetze;
                $basis['runden'][$r][$s]['punkteA'] = $a;
                $basis['runden'][$r][$s]['punkteB'] = $b;
            } elseif (($gesichert['punkteA'] ?? null) !== null || ($gesichert['punkteB'] ?? null) !== null) {
                $a = $gesichert['punkteA'] ?? null; $b = $gesichert['punkteB'] ?? null;
                endErgebnis($a, $b);
                $basis['runden'][$r][$s]['punkteA'] = $a;
                $basis['runden'][$r][$s]['punkteB'] = $b;
            }
        }
    }
    return berechnen($basis);
}

function tischanzahl(mixed $value): ?int
{
    if ($value === null) return null;
    if (!is_int($value) || $value < 1 || $value > 32) throw new ApiError('Bitte 1 bis 32 Tische angeben oder die Anzahl offen lassen.');
    return $value;
}

function satzErgebnis(array $saetze): array
{
    if (!$saetze) return [null, null];
    if (count($saetze) < 3 || count($saetze) > 5) throw new ApiError('Eine Begegnung benötigt 3 bis 5 Sätze.');
    $a = $b = 0;
    foreach ($saetze as $satz) {
        if ($a === 3 || $b === 3) throw new ApiError('Nach dem dritten Gewinnsatz darf kein weiterer Satz folgen.');
        $x = $satz['a'] ?? null; $y = $satz['b'] ?? null;
        if (!is_int($x) || !is_int($y) || $x < 0 || $y < 0 || $x > 999 || $y > 999) throw new ApiError('Satzpunkte müssen ganze Zahlen sein.');
        $max = max($x, $y); $min = min($x, $y);
        if ($max < 11 || ($max === 11 ? $min > 9 : $max - $min !== 2)) throw new ApiError('Ein Satz endet bei 11 Punkten, danach mit genau 2 Punkten Vorsprung.');
        if ($x > $y) $a++; else $b++;
    }
    if ($a !== 3 && $b !== 3) throw new ApiError('Die Begegnung endet erst bei 3 Gewinnsätzen.');
    return [$a, $b];
}

function endErgebnis(mixed $a, mixed $b): void
{
    if (!is_int($a) || !is_int($b) || !(($a === 3 && $b >= 0 && $b <= 2) || ($b === 3 && $a >= 0 && $a <= 2))) {
        throw new ApiError('Das Spielergebnis muss 3:0, 3:1, 3:2 oder umgekehrt lauten.');
    }
}

function turnierErgebnis(array $turnier, string $spielId, array $payload): array
{
    $gefunden = false;
    foreach ($turnier['runden'] as $r => $runde) foreach ($runde as $s => $begegnung) {
        if ($begegnung['id'] !== $spielId) continue;
        if (in_array($begegnung['status'], ['wartet', 'freilos'], true)) throw new ApiError('Dieses Spiel kann noch nicht gespielt werden oder ist ein Freilos.');
        if (array_key_exists('saetze', $payload)) {
            if (!is_array($payload['saetze'])) throw new ApiError('Bitte Sätze eingeben.');
            [$a, $b] = satzErgebnis($payload['saetze']);
            $turnier['runden'][$r][$s]['saetze'] = $payload['saetze'];
        } else {
            $a = $payload['punkteA'] ?? null; $b = $payload['punkteB'] ?? null; endErgebnis($a, $b);
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
    if ($method === 'GET' && $action === '') {
        respond(withStore(fn(array $turniere) => ['turniere' => $turniere]));
    }
    if ($method === 'POST' && $action === 'anlegen') {
        $payload = body();
        $result = withStore(function (array &$turniere) use ($payload): array {
            $id = $turniere ? max(array_column($turniere, 'id')) + 1 : 1;
            $turnier = neuesTurnier($payload, $id); array_unshift($turniere, $turnier);
            return ['turnier' => $turnier];
        }, true);
        respond($result, 201);
    }
    if ($method === 'POST' && $action === 'importieren') {
        $payload = body();
        $result = withStore(function (array &$turniere) use ($payload): array {
            $id = $turniere ? max(array_column($turniere, 'id')) + 1 : 1;
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
            if (!is_array($eingaben) || count($eingaben) !== count($turniere[$index]['teilnehmer'])) {
                throw new ApiError('Bitte für jedes Doppelpaar beide Spielernamen angeben.');
            }
            $nachId = [];
            foreach ($eingaben as $eingabe) {
                $paarId = $eingabe['id'] ?? null;
                if (!is_int($paarId) || isset($nachId[$paarId])) throw new ApiError('Ungültiges Doppelpaar.');
                $nachId[$paarId] = $eingabe;
            }
            $namen = [];
            foreach ($turniere[$index]['teilnehmer'] as &$teilnehmer) {
                $personen = $nachId[$teilnehmer['id']]['spieler'] ?? null;
                if (!is_array($personen) || count($personen) !== 2) throw new ApiError('Jedes Doppel benötigt genau zwei Spieler.');
                $spieler = [];
                foreach (array_values($personen) as $person) {
                    $name = text($person['name'] ?? null, 100, 'für jeden Spieler einen Namen');
                    $key = function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
                    if (isset($namen[$key])) throw new ApiError('Ein Spielername darf im Turnier nur einmal vorkommen.');
                    $namen[$key] = true; $spieler[] = ['name' => $name];
                }
                $teilnehmer['spieler'] = $spieler;
                $teilnehmer['name'] = $spieler[0]['name'] . ' / ' . $spieler[1]['name'];
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
