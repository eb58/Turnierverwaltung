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

function schachPayload(int $anzahl): array
{
    return ['titel' => 'Schachturnier', 'sportart' => 'schach', 'modus' => 'jeder-gegen-jeden',
        'teilnehmer' => array_map(fn(int $id): array => ['spieler' => [['name' => 'Spieler ' . $id]]], range(1, $anzahl))];
}

test('Schach erzeugt für 2 bis 32 Spieler vollständige Paarungen und ausgeglichene Farben', function (): void {
    for ($n = 2; $n <= 32; $n++) {
        $turnier = neuesTurnier(schachPayload($n), 1); $begegnungen = []; $farben = []; $pausen = [];
        gleich($n % 2 ? $n : $n - 1, count($turnier['runden']));
        foreach ($turnier['runden'] as $runde) {
            $inRunde = [];
            gleich(intdiv($n, 2), count($runde));
            foreach ($runde as $spiel) {
                wahr($spiel['a'] !== $spiel['b'], 'Ein Spieler spielt gegen sich selbst.');
                wahr(!isset($inRunde[$spiel['a']]) && !isset($inRunde[$spiel['b']]), "Spieler doppelt in einer Runde bei $n Spielern");
                $inRunde[$spiel['a']] = $inRunde[$spiel['b']] = true;
                $ids = [$spiel['a'], $spiel['b']]; sort($ids);
                $key = implode('-', $ids); wahr(!isset($begegnungen[$key]), 'Doppelte Paarung.'); $begegnungen[$key] = true;
                $farben[$spiel['a']]['weiss'] = ($farben[$spiel['a']]['weiss'] ?? 0) + 1;
                $farben[$spiel['b']]['schwarz'] = ($farben[$spiel['b']]['schwarz'] ?? 0) + 1;
            }
            foreach ($turnier['teilnehmer'] as $person) {
                if (!isset($inRunde[$person['id']])) $pausen[$person['id']] = ($pausen[$person['id']] ?? 0) + 1;
            }
        }
        gleich((int) ($n * ($n - 1) / 2), count($begegnungen));
        foreach ($turnier['teilnehmer'] as $person) {
            $weiss = $farben[$person['id']]['weiss'] ?? 0; $schwarz = $farben[$person['id']]['schwarz'] ?? 0;
            gleich($n - 1, $weiss + $schwarz);
            wahr(abs($weiss - $schwarz) <= 1, "Unausgeglichene Farben bei $n Spielern");
            gleich($n % 2, $pausen[$person['id']] ?? 0);
        }
    }
});

test('Schach akzeptiert alle Ergebnisse und setzt bei Remis keinen Sieger', function (): void {
    $turnier = neuesTurnier(schachPayload(10), 1); $spiel = $turnier['runden'][0][0];
    foreach ([[1, 0, $spiel['a']], [0, 1, $spiel['b']], [0.5, 0.5, null]] as [$a, $b, $sieger]) {
        $turnier = turnierErgebnis($turnier, $spiel['id'], ['punkteA' => $a, 'punkteB' => $b]);
        gleich('fertig', $turnier['runden'][0][0]['status']);
        gleich($sieger, $turnier['runden'][0][0]['sieger']);
    }
    $turnier = turnierErgebnis($turnier, $spiel['id'], ['punkteA' => null, 'punkteB' => null]);
    gleich('offen', $turnier['runden'][0][0]['status']);
    gleich(null, $turnier['runden'][0][0]['punkteA']);
    gleich(null, $turnier['runden'][0][0]['sieger']);
    foreach ([[0, 0], [1, 1], [2, 1], [0.5, 0], [null, 1], ['1', 0], [true, 0], [-1, 2]] as [$a, $b]) {
        apiFehler(fn() => turnierErgebnis($turnier, $spiel['id'], ['punkteA' => $a, 'punkteB' => $b]));
    }
    apiFehler(fn() => turnierErgebnis($turnier, $spiel['id'], ['saetze' => []]));
    apiFehler(fn() => turnierErgebnis($turnier, $spiel['id'], []));
});

test('Schachsicherungen erhalten Farben, Remis und offene Partien', function (): void {
    $turnier = neuesTurnier(schachPayload(11), 1);
    $turnier = turnierErgebnis($turnier, 'r1-s1', ['punkteA' => 0.5, 'punkteB' => 0.5]);
    $turnier = turnierErgebnis($turnier, 'r2-s1', ['punkteA' => 0, 'punkteB' => 1]);
    $payload = ['format' => 'turnierverwaltung-backup', 'version' => 1, 'turnier' => $turnier];
    $importiert = importiertesTurnier($payload, 2);
    gleich('schach', $importiert['sportart']);
    gleich($turnier['runden'], $importiert['runden']);
    $payload['turnier']['runden'][0][0]['punkteA'] = 2;
    apiFehler(fn() => importiertesTurnier($payload, 3));
    $payload['turnier'] = $turnier;
    [$payload['turnier']['runden'][0][0]['a'], $payload['turnier']['runden'][0][0]['b']] = [$turnier['runden'][0][0]['b'], $turnier['runden'][0][0]['a']];
    apiFehler(fn() => importiertesTurnier($payload, 3));
});

test('Schach validiert Einzelspieler und Sportart, alte Sicherungen bleiben Tischtennis', function (): void {
    apiFehler(fn() => neuesTurnier(schachPayload(1), 1));
    apiFehler(fn() => neuesTurnier(schachPayload(33), 1));
    apiFehler(fn() => neuesTurnier(['sportart' => 'schach'] + payload(5), 1));
    apiFehler(fn() => neuesTurnier(['modus' => 'ko'] + schachPayload(10), 1));
    apiFehler(fn() => neuesTurnier(['sportart' => 'unbekannt'] + payload(5), 1));
    $doppelt = schachPayload(10); $doppelt['teilnehmer'][1] = $doppelt['teilnehmer'][0];
    apiFehler(fn() => neuesTurnier($doppelt, 1));
    $alt = neuesTurnier(payload(5), 1); unset($alt['sportart']);
    $alt = turnierErgebnis($alt, 'r1-s1', ['punkteA' => 2, 'punkteB' => 1]);
    $importiert = importiertesTurnier(['format' => 'turnierverwaltung-backup', 'turnier' => $alt], 2);
    gleich('tischtennis', $importiert['sportart']);
    gleich($alt['runden'], $importiert['runden']);
});

test('Hin- und Rückspiel erzeugt jede Paarung zweimal mit vertauschten Farben', function (): void {
    for ($n = 2; $n <= 32; $n++) {
        $turnier = neuesTurnier(['durchgaenge' => 2] + schachPayload($n), 1); $paare = [];
        foreach ($turnier['runden'] as $runde) foreach ($runde as $spiel) $paare[$spiel['a'] . '-' . $spiel['b']] = true;
        gleich($n * ($n - 1), count($paare));
        foreach ($turnier['teilnehmer'] as $a) foreach ($turnier['teilnehmer'] as $b) {
            if ($a['id'] !== $b['id']) wahr(isset($paare[$a['id'] . '-' . $b['id']]), 'Farbe oder Rückspiel fehlt.');
        }
    }
    apiFehler(fn() => neuesTurnier(['durchgaenge' => 3] + schachPayload(5), 1));
});

test('Matching findet die größtmögliche Einteilung auch mit ungeraden Kreisen', function (): void {
    mt_srand(20261017);
    for ($versuch = 0; $versuch < 500; $versuch++) {
        $n = 2 + $versuch % 9; $graph = array_fill(0, $n, []);
        for ($a = 0; $a < $n; $a++) for ($b = $a + 1; $b < $n; $b++) if (mt_rand(0, 99) < $versuch % 101) {
            $graph[$a][] = $b; $graph[$b][] = $a;
        }
        $memo = [];
        $exakt = function (int $maske) use (&$exakt, &$memo, $graph, $n): int {
            if (!$maske) return 0;
            if (isset($memo[$maske])) return $memo[$maske];
            $a = 0; while (!(($maske >> $a) & 1)) $a++;
            $rest = $maske & ~(1 << $a); $maximum = $exakt($rest);
            foreach ($graph[$a] as $b) if (($rest >> $b) & 1) $maximum = max($maximum, 1 + $exakt($rest & ~(1 << $b)));
            return $memo[$maske] = $maximum;
        };
        $matching = schachMatching($graph); $anzahl = 0;
        foreach ($matching as $a => $b) if ($b !== -1) {
            wahr($a !== $b && in_array($b, $graph[$a], true), 'Ungültige Kante im Matching.');
            gleich($a, $matching[$b]); $anzahl++;
        }
        gleich($exakt((1 << $n) - 1), intdiv($anzahl, 2), "Matching bei Versuch $versuch");
    }
});

test('Auslosung teilt für 2 bis 32 Anwesende alle ein und bildet genau eine Dreiergruppe bei ungerader Anzahl', function (): void {
    for ($n = 2; $n <= 32; $n++) {
        $turnier = neuesTurnier(['durchgaenge' => 2] + schachPayload($n), 1);
        $turnier = schachAuslosen($turnier, ['anwesend' => range(1, $n), 'datum' => '2026-10-23']);
        $tag = $turnier['spieltage'][0]; $verteilt = []; $spielIds = []; $dreier = 0;
        $nachId = array_column(array_merge(...$turnier['runden']), null, 'id');
        foreach ($tag['gruppen'] as $gruppe) {
            foreach ($gruppe['spieler'] as $id) { wahr(!isset($verteilt[$id]), 'Spieler in mehreren Gruppen.'); $verteilt[$id] = true; }
            gleich([], $gruppe['freiePaarungen']);
            gleich(2, count($gruppe['spiele']));
            foreach ($gruppe['spiele'] as $id) { wahr(!isset($spielIds[$id]), 'Partie doppelt ausgelost.'); $spielIds[$id] = true; gleich('offen', $nachId[$id]['status']); }
            if ($gruppe['typ'] === 'dreier') {
                $dreier++; gleich($tag['zentrum'], $gruppe['spieler'][0]); $gegner = [];
                foreach ($gruppe['spiele'] as $id) {
                    $spiel = $nachId[$id]; wahr($spiel['a'] === $tag['zentrum'] || $spiel['b'] === $tag['zentrum'], 'Zentrum fehlt.');
                    $gegner[] = $spiel['a'] === $tag['zentrum'] ? $spiel['b'] : $spiel['a'];
                }
                gleich(2, count(array_unique($gegner)));
            }
        }
        gleich($n, count($verteilt)); gleich($n % 2, $dreier);
        gleich($tag, schachSpieltagePruefen($turnier, [$tag])[0]);
    }
});

test('Dreierzentrum wechselt bei gleicher Verfügbarkeit zwischen den Spielern', function (): void {
    $turnier = neuesTurnier(['durchgaenge' => 2] + schachPayload(5), 1); $zentren = [];
    for ($i = 0; $i < 5; $i++) {
        $turnier = schachAuslosen($turnier, ['anwesend' => range(1, 5), 'datum' => '2026-10-23']);
        $zentren[] = $turnier['spieltage'][$i]['zentrum']; $turnier = schachSpieltagBeenden($turnier);
    }
    gleich(5, count(array_unique($zentren)));
});

test('Abgeschlossene Begegnungen bleiben unverändert und freie Partien benötigen eine ausdrückliche Auswahl', function (): void {
    $turnier = neuesTurnier(['durchgaenge' => 2] + schachPayload(4), 1);
    foreach ($turnier['runden'] as $runde) foreach ($runde as $spiel) {
        if (schachPaarSchluessel($spiel['a'], $spiel['b']) !== '1-2') $turnier = turnierErgebnis($turnier, $spiel['id'], ['punkteA' => 1, 'punkteB' => 0]);
    }
    $payload = ['anwesend' => [1, 2, 3, 4], 'datum' => '2026-10-23'];
    apiFehler(fn() => schachAuslosen($turnier, $payload));
    $neu = schachAuslosen($turnier, $payload + ['freiePartien' => true]);
    gleich($turnier['runden'], $neu['runden']);
    $freie = array_merge(...array_column($neu['spieltage'][0]['gruppen'], 'freiePaarungen'));
    wahr(count($freie) >= 1, 'Freie Partie nicht gekennzeichnet.');
    foreach ($neu['spieltage'][0]['gruppen'] as $gruppe) foreach ($gruppe['spiele'] as $id) {
        $spiel = array_column(array_merge(...$turnier['runden']), null, 'id')[$id]; gleich('offen', $spiel['status']);
    }
    gleich($neu['spieltage'], schachSpieltagePruefen($neu, $neu['spieltage']));
});

test('Spieltag schützt begonnene Auslosungen, validiert Anwesenheit und erhält Sicherungen', function (): void {
    $basis = neuesTurnier(['durchgaenge' => 2] + schachPayload(6), 1);
    foreach ([[1], [1, 1], [1, 99], [1, '2']] as $anwesend) apiFehler(fn() => schachAuslosen($basis, ['anwesend' => $anwesend, 'datum' => '2026-10-23']));
    apiFehler(fn() => schachAuslosen($basis, ['anwesend' => [1, 2], 'datum' => '2026-02-30']));
    $turnier = schachAuslosen($basis, ['anwesend' => [2, 4, 6], 'datum' => '2026-10-23']);
    $turnier = schachAuslosen($turnier, ['anwesend' => [1, 2, 3], 'datum' => '2026-10-23']);
    gleich(1, count($turnier['spieltage']));
    $spielId = $turnier['spieltage'][0]['gruppen'][0]['spiele'][0];
    $turnier = turnierErgebnis($turnier, $spielId, ['punkteA' => 0.5, 'punkteB' => 0.5]);
    apiFehler(fn() => schachAuslosen($turnier, ['anwesend' => [1, 2, 3], 'datum' => '2026-10-23']));
    $turnier = schachSpieltagBeenden($turnier);
    $turnier = schachAuslosen($turnier, ['anwesend' => [1, 2, 3], 'datum' => '2026-10-30']);
    foreach ($turnier['spieltage'][1]['gruppen'] as $gruppe) wahr(!in_array($spielId, $gruppe['spiele'], true), 'Gespielte Partie erneut ausgelost.');
    $import = importiertesTurnier(['format' => 'turnierverwaltung-backup', 'turnier' => $turnier], 9);
    gleich($turnier['spieltage'], $import['spieltage']); gleich($turnier['runden'], $import['runden']);
    $kaputt = $turnier['spieltage']; $kaputt[0]['gruppen'][0]['spiele'][0] = 'fremde-partie';
    apiFehler(fn() => schachSpieltagePruefen($turnier, $kaputt));
    $kaputt = $turnier['spieltage']; $kaputt[0]['gruppen'][0]['spieler'][0] = 99;
    apiFehler(fn() => schachSpieltagePruefen($turnier, $kaputt));
});

test('Echte Saison 2026/27 erhält 24 historische Partien ohne erfundene Einzelresultate', function (): void {
    define('SCHACH_SAISON_NUR_FUNKTIONEN', true);
    require dirname(__DIR__, 2) . '/scripts/schach-2026-27-anlegen.php';
    $turnier = schachSaison2026(4);
    $spiele = array_merge(...$turnier['runden']);
    gleich(11, count($turnier['teilnehmer'])); gleich(110, count($spiele));
    gleich(24, count(array_filter($spiele, fn($s) => $s['status'] === 'fertig')));
    foreach ($spiele as $s) if (isset($s['altErgebnis'])) { gleich(null, $s['punkteA']); gleich(null, $s['sieger']); }
    $import = importiertesTurnier(['format' => 'turnierverwaltung-backup', 'turnier' => $turnier], 4);
    gleich($turnier, $import);
    foreach ($import['altErgebnisse'] as $alt) gleich(true, $alt['keineDoppelRemis']);
    $falscheWertung = $turnier['altErgebnisse']; $falscheWertung[0]['keineDoppelRemis'] = 'ja';
    apiFehler(fn() => schachAltErgebnisse($turnier, $falscheWertung));
    $fertig = array_values(array_filter($spiele, fn($s) => isset($s['altErgebnis'])))[0];
    apiFehler(fn() => turnierErgebnis($turnier, $fertig['id'], ['punkteA' => 1, 'punkteB' => 0]));
    apiFehler(fn() => schachAltErgebnisse($turnier, [$turnier['altErgebnisse'][0], $turnier['altErgebnisse'][0]]));
    $falsch = $turnier['altErgebnisse']; $falsch[0]['punkteA'] = 1;
    apiFehler(fn() => schachAltErgebnisse($turnier, $falsch));
    for ($i = 0; $i < 10; $i++) {
        $tag = schachAuslosen($turnier, ['anwesend' => range(1, 11), 'datum' => '2026-10-23', 'freiePartien' => true]);
        foreach (end($tag['spieltage'])['gruppen'] as $gruppe) foreach ($gruppe['spiele'] as $id) {
            $s = array_values(array_filter($spiele, fn($s) => $s['id'] === $id))[0];
            wahr(!isset($s['altErgebnis']), 'Historische Paarung erneut ausgelost');
        }
    }
});

$fehler = 0;
foreach ($tests as $name => $test) {
    try { $test(); echo "OK  $name\n"; }
    catch (Throwable $error) { $fehler++; fwrite(STDERR, "FEHLER  $name\n  {$error->getMessage()}\n"); }
}
echo count($tests) . " PHP-Tests, $fehler Fehler\n";
exit($fehler === 0 ? 0 : 1);
