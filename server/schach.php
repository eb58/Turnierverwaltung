<?php

declare(strict_types=1);

function istSchach(array $turnier): bool
{
    return ($turnier['sportart'] ?? 'tischtennis') === 'schach';
}

function schachSpielplan(array $ids, int $durchgaenge = 1): array
{
    // Bei ungerader Spielerzahl bleibt die Pause an der festen Position.
    // So hat jeder Spieler gleich viele weiße wie schwarze Partien.
    if (count($ids) % 2) array_unshift($ids, null);
    $anzahl = count($ids); $runden = [];
    for ($r = 0; $r < $anzahl - 1; $r++) {
        $runde = [];
        for ($s = 0; $s < $anzahl / 2; $s++) {
            $a = $ids[$s]; $b = $ids[$anzahl - 1 - $s];
            if ($a === null || $b === null) continue;
            if ($s === 0 ? $r % 2 === 1 : $s % 2 === 0) [$a, $b] = [$b, $a];
            // a spielt Weiß, b spielt Schwarz.
            $runde[] = spiel($r, count($runde), $a, $b);
        }
        $runden[] = $runde;
        $letzter = array_pop($ids); array_splice($ids, 1, 0, [$letzter]);
    }
    if ($durchgaenge === 2) {
        foreach ($runden as $runde) {
            $rueckrunde = [];
            foreach ($runde as $s => $partie) $rueckrunde[] = spiel(count($runden), $s, $partie['b'], $partie['a']);
            $runden[] = $rueckrunde;
        }
    }
    return $runden;
}

function schachErgebnis(mixed $a, mixed $b): void
{
    if ((!is_int($a) && !is_float($a)) || (!is_int($b) && !is_float($b))
        || !in_array([$a, $b], [[1, 0], [0, 1], [0.5, 0.5]], false)) {
        throw new ApiError('Eine Schachpartie endet 1:0, ½:½ oder 0:1.');
    }
}

// Historische Tabellen enthalten nur die Summe beider Partien, keine Farben oder Einzelergebnisse.
function schachAltErgebnisse(array $turnier, mixed $ergebnisse): array
{
    if (!is_array($ergebnisse) || !array_is_list($ergebnisse) || count($ergebnisse) > 496
        || !istSchach($turnier) || ($turnier['durchgaenge'] ?? 1) !== 2) throw new ApiError('Ungültige historische Schachergebnisse.');
    $ids = array_column($turnier['teilnehmer'], 'id'); $gesehen = []; $sauber = [];
    foreach ($ergebnisse as $e) {
        if (!is_array($e)) throw new ApiError('Ungültiges historisches Ergebnis.');
        $a = $e['a'] ?? null; $b = $e['b'] ?? null; $pa = $e['punkteA'] ?? null; $pb = $e['punkteB'] ?? null;
        if (!in_array($a, $ids, true) || !in_array($b, $ids, true) || $a === $b
            || (!is_int($pa) && !is_float($pa)) || (!is_int($pb) && !is_float($pb))
            || !in_array($pa, [0, .5, 1, 1.5, 2], true) || !in_array($pb, [0, .5, 1, 1.5, 2], true) || $pa + $pb != 2) throw new ApiError('Ungültige Punktesumme für Hin- und Rückspiel.');
        $key = schachPaarSchluessel($a, $b);
        if (isset($gesehen[$key])) throw new ApiError('Historische Paarung doppelt.');
        $gesehen[$key] = true;
        $keineDoppelRemis = $e['keineDoppelRemis'] ?? false;
        if (!is_bool($keineDoppelRemis)) throw new ApiError('Ungültige Angabe zur historischen Einzelwertung.');
        $sauber[] = ['a' => $a, 'b' => $b, 'punkteA' => $pa, 'punkteB' => $pb,
            'stand' => text($e['stand'] ?? null, 10, 'den Tabellenstand'), 'quelle' => text($e['quelle'] ?? null, 200, 'die Ergebnisquelle'),
            'keineDoppelRemis' => $keineDoppelRemis];
        foreach ($turnier['runden'] as &$runde) foreach ($runde as &$spiel) {
            if (schachPaarSchluessel($spiel['a'], $spiel['b']) !== $key) continue;
            if ($spiel['punkteA'] !== null || $spiel['punkteB'] !== null) throw new ApiError('Historisches Ergebnis überschneidet sich mit Einzelpartien.');
            $spiel['altErgebnis'] = ['punkteA' => $spiel['a'] === $a ? $pa : $pb, 'punkteB' => $spiel['a'] === $a ? $pb : $pa];
        }
        unset($runde, $spiel);
    }
    $turnier['altErgebnisse'] = $sauber;
    return berechnen($turnier);
}

// Rekonstruierte Tage verweisen auf vorhandene Summenergebnisse. Sie sind keine neuen Auslosungen.
function schachHistorischeSpieltagePruefen(array $turnier, mixed $tage): array
{
    $fehler = fn() => throw new ApiError('Die historischen Spieltage passen nicht zum Turnier.');
    if (!istSchach($turnier) || !is_array($tage) || !array_is_list($tage) || count($tage) > 1000) $fehler();
    $ids = array_column($turnier['teilnehmer'], 'id'); $alte = [];
    foreach ($turnier['altErgebnisse'] ?? [] as $e) $alte[schachPaarSchluessel($e['a'], $e['b'])] = $e;
    $daten = []; $paarungen = []; $result = [];
    foreach ($tage as $tag) {
        if (!is_array($tag)) $fehler();
        $datum = $tag['datum'] ?? null;
        $date = is_string($datum) ? DateTimeImmutable::createFromFormat('!Y-m-d', $datum) : false;
        if (!$date || $date->format('Y-m-d') !== $datum || isset($daten[$datum]) || !is_bool($tag['anwesenheitVollstaendig'] ?? null)) $fehler();
        $daten[$datum] = true;
        $anwesend = $tag['anwesend'] ?? null; $gesehen = [];
        if (!is_array($anwesend) || !array_is_list($anwesend) || count($anwesend) < 2 || count($anwesend) > count($ids)) $fehler();
        foreach ($anwesend as $id) {
            if (!in_array($id, $ids, true) || isset($gesehen[$id])) $fehler();
            $gesehen[$id] = true;
        }
        $paare = $tag['paarungen'] ?? null;
        if (!is_array($paare) || !array_is_list($paare) || !$paare || count($paare) > count($alte)) $fehler();
        foreach ($paare as $key) {
            if (!is_string($key) || !isset($alte[$key]) || isset($paarungen[$key])) $fehler();
            $e = $alte[$key];
            if (!isset($gesehen[$e['a']], $gesehen[$e['b']])) $fehler();
            $paarungen[$key] = true;
        }
        $quellen = $tag['quellen'] ?? null; $sauber = [];
        if (!is_array($quellen) || !array_is_list($quellen) || !$quellen || count($quellen) > 10) $fehler();
        foreach ($quellen as $quelle) {
            if (!is_array($quelle)) $fehler();
            $url = $quelle['url'] ?? null;
            if (!is_string($url) || strlen($url) > 500 || !filter_var($url, FILTER_VALIDATE_URL) || parse_url($url, PHP_URL_SCHEME) !== 'https') $fehler();
            $sauber[] = ['titel' => text($quelle['titel'] ?? null, 100, 'den Quellentitel'), 'url' => $url];
        }
        $result[] = ['datum' => $datum, 'paarungen' => $paare, 'anwesend' => $anwesend,
            'anwesenheitVollstaendig' => $tag['anwesenheitVollstaendig'],
            'hinweis' => text($tag['hinweis'] ?? null, 1000, 'den Rekonstruktionshinweis'), 'quellen' => $sauber];
    }
    usort($result, fn($a, $b) => strcmp($a['datum'], $b['datum']));
    return $result;
}
