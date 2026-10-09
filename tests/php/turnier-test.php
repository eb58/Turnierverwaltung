<?php
declare(strict_types=1);

define('TURNIER_API_NO_DISPATCH', true);
require dirname(__DIR__, 2) . '/api.php';

$tests = [];
function test(string $name, callable $test): void { global $tests; $tests[$name] = $test; }
function gleich(mixed $erwartet, mixed $tatsaechlich, string $hinweis = ''): void
{
    if ($erwartet !== $tatsaechlich) throw new RuntimeException(($hinweis ? $hinweis . ': ' : '') . 'erwartet ' . var_export($erwartet, true) . ', erhalten ' . var_export($tatsaechlich, true));
}
function wahr(bool $wert, string $hinweis): void { if (!$wert) throw new RuntimeException($hinweis); }
function apiFehler(callable $aufruf): void
{
    try { $aufruf(); } catch (ApiError) { return; }
    throw new RuntimeException('ApiError erwartet.');
}
function payload(int $anzahl, string $modus = 'jeder-gegen-jeden'): array
{
    $paare = [];
    for ($i = 1; $i <= $anzahl; $i++) $paare[] = ['spieler' => [['name' => 'A' . $i], ['name' => 'B' . $i]]];
    return ['titel' => 'Testturnier', 'modus' => $modus, 'teilnehmer' => $paare, 'anzahlTische' => null];
}

test('Jeder-gegen-jeden erzeugt für 5 bis 32 Paare jede Begegnung genau einmal', function (): void {
    for ($n = 5; $n <= 32; $n++) {
        $turnier = neuesTurnier(payload($n), 1); $begegnungen = [];
        foreach ($turnier['runden'] as $runde) {
            $inRunde = [];
            foreach ($runde as $spiel) {
                wahr(!isset($inRunde[$spiel['a']]) && !isset($inRunde[$spiel['b']]), "Paar doppelt in einer Runde bei $n Teilnehmern");
                $inRunde[$spiel['a']] = $inRunde[$spiel['b']] = true;
                $ids = [$spiel['a'], $spiel['b']]; sort($ids); $begegnungen[implode('-', $ids)] = true;
            }
        }
        gleich((int) ($n * ($n - 1) / 2), count($begegnungen), "Begegnungszahl bei $n Teilnehmern");
    }
});

test('K.-o. ermittelt für 5 bis 32 Paare mit n-1 Spielen einen Sieger', function (): void {
    for ($n = 5; $n <= 32; $n++) {
        $turnier = neuesTurnier(payload($n, 'ko'), 1); $gespielt = 0;
        foreach (array_keys($turnier['runden']) as $r) foreach (array_keys($turnier['runden'][$r]) as $s) {
            $spiel = $turnier['runden'][$r][$s];
            if ($spiel['status'] === 'freilos') continue;
            gleich('offen', $spiel['status']);
            $turnier = turnierErgebnis($turnier, $spiel['id'], ['punkteA' => 2, 'punkteB' => 0]); $gespielt++;
        }
        gleich($n - 1, $gespielt, "Spielzahl bei $n Teilnehmern");
        wahr($turnier['runden'][count($turnier['runden']) - 1][0]['sieger'] !== null, "Sieger fehlt bei $n Teilnehmern");
    }
});

test('Neun Doppelpaare spielen zuerst vier Begegnungen mit einem Freilos', function (): void {
    $turnier = neuesTurnier(payload(9, 'ko'), 1);
    gleich('kompakt', $turnier['koSchema']);
    gleich(5, count($turnier['runden'][0]));
    gleich(1, count(array_filter($turnier['runden'][0], fn(array $spiel): bool => $spiel['status'] === 'freilos')));
    gleich(4, count(array_filter($turnier['runden'][0], fn(array $spiel): bool => $spiel['status'] === 'offen')));
    gleich([3, 2, 1], array_map('count', array_slice($turnier['runden'], 1)));
});

test('Ungespielte alte K.-o.-Turniere werden umgestellt, begonnene bleiben erhalten', function (): void {
    $alt = payload(9, 'ko'); $alt['koSchema'] = 'klassisch';
    $ungespielt = neuesTurnier($alt, 1);
    $begonnen = neuesTurnier($alt, 2);
    $spielId = $begonnen['runden'][0][7]['id'];
    $begonnen = turnierErgebnis($begonnen, $spielId, ['punkteA' => 2, 'punkteB' => 0]);
    $turniere = [$ungespielt, $begonnen];
    ungespielteKoTurniereUmstellen($turniere);
    gleich('kompakt', $turniere[0]['koSchema']);
    gleich(5, count($turniere[0]['runden'][0]));
    gleich($ungespielt['version'] + 1, $turniere[0]['version']);
    gleich('klassisch', $turniere[1]['koSchema']);
    gleich(8, count($turniere[1]['runden'][0]));
});

test('Korrektur eines K.-o.-Siegers setzt nur betroffene Folgespiele zurück', function (): void {
    $turnier = neuesTurnier(payload(8, 'ko'), 1);
    foreach (array_keys($turnier['runden']) as $r) foreach (array_keys($turnier['runden'][$r]) as $s) {
        $turnier = turnierErgebnis($turnier, $turnier['runden'][$r][$s]['id'], ['punkteA' => 2, 'punkteB' => 0]);
    }
    $turnier = turnierErgebnis($turnier, 'r1-s1', ['punkteA' => 0, 'punkteB' => 2]);
    gleich('offen', $turnier['runden'][1][0]['status']);
    gleich(null, $turnier['runden'][1][0]['punkteA']);
    gleich('fertig', $turnier['runden'][1][1]['status']);
    gleich('wartet', $turnier['runden'][2][0]['status']);
});

test('Leeres Satzergebnis öffnet ein gespeichertes Spiel wieder', function (): void {
    $turnier = neuesTurnier(payload(5), 1); $id = $turnier['runden'][0][0]['id'];
    $turnier = turnierErgebnis($turnier, $id, ['punkteA' => 2, 'punkteB' => 1]);
    $turnier = turnierErgebnis($turnier, $id, ['saetze' => []]);
    gleich('offen', $turnier['runden'][0][0]['status']); gleich(null, $turnier['runden'][0][0]['punkteA']);
});

test('Satzwertung akzeptiert reguläre Ergebnisse und lehnt ungültige ab', function (): void {
    gleich([2, 0], satzErgebnis([['a' => 11, 'b' => 0], ['a' => 14, 'b' => 12]], 2));
    gleich([2, 1], satzErgebnis([['a' => 0, 'b' => 11], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 1]], 2));
    gleich([3, 1], satzErgebnis([['a' => 11, 'b' => 0], ['a' => 0, 'b' => 11], ['a' => 11, 'b' => 5], ['a' => 11, 'b' => 8]], 3));
    apiFehler(fn() => satzErgebnis([['a' => 11, 'b' => 10], ['a' => 11, 'b' => 0]], 2));
    apiFehler(fn() => satzErgebnis([['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0], ['a' => 11, 'b' => 0]], 2));
});

test('Best of 3 ist Standard und Best of 5 kann gewählt werden', function (): void {
    $standard = neuesTurnier(payload(5), 1);
    gleich(2, $standard['gewinnsaetze']); gleich(false, $standard['satzweise']);
    $bestOfFive = payload(5); $bestOfFive['gewinnsaetze'] = 3;
    $turnier = neuesTurnier($bestOfFive, 1);
    gleich(3, $turnier['gewinnsaetze']);
    $spielId = $turnier['runden'][0][0]['id'];
    gleich('fertig', turnierErgebnis($turnier, $spielId, ['punkteA' => 3, 'punkteB' => 2])['runden'][0][0]['status']);
});

test('Wartende Spiele und Freilose können nicht gespielt werden', function (): void {
    $turnier = neuesTurnier(payload(5, 'ko'), 1);
    $freilos = array_values(array_filter($turnier['runden'][0], fn(array $spiel): bool => $spiel['status'] === 'freilos'))[0];
    $wartend = array_values(array_filter(array_merge(...$turnier['runden']), fn(array $spiel): bool => $spiel['status'] === 'wartet'))[0];
    apiFehler(fn() => turnierErgebnis($turnier, $freilos['id'], ['punkteA' => 2, 'punkteB' => 0]));
    apiFehler(fn() => turnierErgebnis($turnier, $wartend['id'], ['punkteA' => 2, 'punkteB' => 0]));
});

test('Teilnehmergrenzen, doppelte Namen und Tischanzahl werden validiert', function (): void {
    apiFehler(fn() => neuesTurnier(payload(4), 1));
    apiFehler(fn() => neuesTurnier(payload(33), 1));
    $doppelt = payload(5); $doppelt['teilnehmer'][1]['spieler'][0]['name'] = 'A1';
    apiFehler(fn() => neuesTurnier($doppelt, 1));
    gleich(null, tischanzahl(null)); gleich(3, tischanzahl(3)); apiFehler(fn() => tischanzahl(0));
});

$fehler = 0;
foreach ($tests as $name => $test) {
    try { $test(); echo "OK  $name\n"; }
    catch (Throwable $error) { $fehler++; fwrite(STDERR, "FEHLER  $name\n  {$error->getMessage()}\n"); }
}
echo count($tests) . " PHP-Tests, $fehler Fehler\n";
exit($fehler === 0 ? 0 : 1);
