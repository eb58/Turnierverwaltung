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
