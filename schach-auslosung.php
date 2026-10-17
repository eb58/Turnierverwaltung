<?php

declare(strict_types=1);

function schachPaarSchluessel(int $a, int $b): string { return min($a, $b) . '-' . max($a, $b); }

/** Maximales Matching eines ungerichteten Graphen mit Kontraktion ungerader Kreise. */
function schachMatching(array $nachbarn): array
{
    $n = count($nachbarn); $partner = array_fill(0, $n, -1);
    $eltern = []; $basis = []; $besucht = []; $kreis = [];
    $wurzel = function (int $a, int $b) use (&$basis, &$partner, &$eltern, $n): int {
        $pfad = array_fill(0, $n, false);
        while (true) {
            $a = $basis[$a]; $pfad[$a] = true;
            if ($partner[$a] === -1) break;
            $a = $eltern[$partner[$a]];
        }
        while (!$pfad[$basis[$b]]) $b = $eltern[$partner[$basis[$b]]];
        return $basis[$b];
    };
    $markieren = function (int $v, int $b, int $kind) use (&$basis, &$partner, &$eltern, &$kreis): void {
        while ($basis[$v] !== $b) {
            $kreis[$basis[$v]] = $kreis[$basis[$partner[$v]]] = true;
            $eltern[$v] = $kind; $kind = $partner[$v]; $v = $eltern[$partner[$v]];
        }
    };
    $suchen = function (int $start) use (&$partner, &$eltern, &$basis, &$besucht, &$kreis, $nachbarn, $n, $wurzel, $markieren): int {
        $eltern = array_fill(0, $n, -1); $basis = range(0, $n - 1); $besucht = array_fill(0, $n, false);
        $warteschlange = [$start]; $besucht[$start] = true;
        for ($kopf = 0; $kopf < count($warteschlange); $kopf++) {
            $v = $warteschlange[$kopf];
            foreach ($nachbarn[$v] as $u) {
                if ($basis[$v] === $basis[$u] || $partner[$v] === $u) continue;
                if ($u === $start || ($partner[$u] !== -1 && $eltern[$partner[$u]] !== -1)) {
                    $b = $wurzel($v, $u); $kreis = array_fill(0, $n, false);
                    $markieren($v, $b, $u); $markieren($u, $b, $v);
                    for ($i = 0; $i < $n; $i++) if ($kreis[$basis[$i]]) {
                        $basis[$i] = $b;
                        if (!$besucht[$i]) { $besucht[$i] = true; $warteschlange[] = $i; }
                    }
                } elseif ($eltern[$u] === -1) {
                    $eltern[$u] = $v;
                    if ($partner[$u] === -1) return $u;
                    $u = $partner[$u]; $besucht[$u] = true; $warteschlange[] = $u;
                }
            }
        }
        return -1;
    };
    for ($i = 0; $i < $n; $i++) if ($partner[$i] === -1) {
        $v = $suchen($i);
        while ($v !== -1) {
            $p = $eltern[$v]; $weiter = $p === -1 ? -1 : $partner[$p];
            $partner[$v] = $p; if ($p !== -1) $partner[$p] = $v; $v = $weiter;
        }
    }
    return $partner;
}

function schachAuslosungBegonnen(array $turnier, array $tag): bool
{
    $ids = array_flip(array_merge(...array_column($tag['gruppen'], 'spiele')));
    foreach ($turnier['runden'] as $runde) foreach ($runde as $spiel) {
        if (isset($ids[$spiel['id']]) && $spiel['status'] === 'fertig') return true;
    }
    return false;
}

function schachAuslosen(array $turnier, array $payload): array
{
    if (!istSchach($turnier)) throw new ApiError('Die Anwesenheitsauslosung ist für Schachturniere verfügbar.');
    $anwesend = $payload['anwesend'] ?? null;
    if (!is_array($anwesend) || !array_is_list($anwesend) || count($anwesend) < 2 || count($anwesend) > 32) throw new ApiError('Bitte mindestens zwei anwesende Spieler auswählen.');
    $teilnehmer = array_column($turnier['teilnehmer'], null, 'id'); $gesehen = [];
    foreach ($anwesend as $id) {
        if (!is_int($id) || !isset($teilnehmer[$id]) || isset($gesehen[$id])) throw new ApiError('Ungültige oder doppelte Anwesenheitsauswahl.');
        $gesehen[$id] = true;
    }
    $datum = $payload['datum'] ?? null;
    $date = is_string($datum) ? DateTimeImmutable::createFromFormat('!Y-m-d', $datum) : false;
    if (!$date || $date->format('Y-m-d') !== $datum) throw new ApiError('Bitte ein gültiges Datum für den Spieltag angeben.');
    $freieErlaubt = $payload['freiePartien'] ?? false;
    if (!is_bool($freieErlaubt)) throw new ApiError('Ungültige Auswahl für freie Partien.');
    $tage = $turnier['spieltage'] ?? []; $letzter = $tage ? $tage[count($tage) - 1] : null;
    if ($letzter !== null && $letzter['status'] === 'aktiv') {
        if (schachAuslosungBegonnen($turnier, $letzter)) throw new ApiError('Bitte zuerst den laufenden Spieltag beenden. Bereits erfasste Ergebnisse bleiben erhalten.');
        array_pop($tage);
    }
    $offen = [];
    foreach ($turnier['runden'] as $runde) foreach ($runde as $spiel) {
        if ($spiel['status'] === 'offen') $offen[schachPaarSchluessel($spiel['a'], $spiel['b'])][] = $spiel;
    }
    $zentren = $anwesend; shuffle($zentren); $haeufigkeit = array_fill_keys($anwesend, 0);
    foreach ($tage as $tag) if ($tag['zentrum'] !== null && isset($haeufigkeit[$tag['zentrum']])) $haeufigkeit[$tag['zentrum']]++;
    usort($zentren, fn(int $a, int $b): int => $haeufigkeit[$a] <=> $haeufigkeit[$b]);
    if (count($anwesend) % 2 === 0) $zentren = [null];
    $loesung = null;
    foreach ([false, true] as $frei) {
        if ($frei && !$freieErlaubt) break;
        foreach ($zentren as $zentrum) {
            $knoten = $anwesend; shuffle($knoten);
            // Eine Kopie des Zentrums erlaubt genau zwei verschiedene Gegner.
            if ($zentrum !== null) $knoten[] = $zentrum;
            $graph = array_fill(0, count($knoten), []);
            foreach ($knoten as $i => $a) foreach ($knoten as $j => $b) {
                if ($a !== $b && ($frei || isset($offen[schachPaarSchluessel($a, $b)]))) $graph[$i][] = $j;
            }
            foreach ($graph as &$nachbarn) shuffle($nachbarn); unset($nachbarn);
            $matching = schachMatching($graph);
            if (in_array(-1, $matching, true)) continue;
            $loesung = [$knoten, $matching, $zentrum]; break 2;
        }
    }
    if ($loesung === null) throw new ApiError('Für diese Anwesenheitsauswahl sind keine vollständigen Turnierpaarungen mehr möglich.');
    [$knoten, $matching, $zentrum] = $loesung;
    $gruppen = []; $dreier = null;
    foreach ($matching as $i => $j) {
        if ($i > $j) continue;
        $a = $knoten[$i]; $b = $knoten[$j];
        $partien = $offen[schachPaarSchluessel($a, $b)] ?? [];
        if ($zentrum !== null && ($a === $zentrum || $b === $zentrum)) {
            $gegner = $a === $zentrum ? $b : $a;
            $dreier ??= ['typ' => 'dreier', 'spieler' => [$zentrum], 'spiele' => [], 'freiePaarungen' => []];
            $dreier['spieler'][] = $gegner;
            if ($partien) $dreier['spiele'][] = $partien[0]['id'];
            else $dreier['freiePaarungen'][] = ['a' => $zentrum, 'b' => $gegner, 'anzahl' => 1];
        } else {
            $gruppen[] = ['typ' => 'paar', 'spieler' => [$a, $b], 'spiele' => array_column($partien, 'id'),
                'freiePaarungen' => $partien ? [] : [['a' => $a, 'b' => $b, 'anzahl' => $turnier['durchgaenge'] ?? 1]]];
        }
    }
    if ($dreier !== null) $gruppen[] = $dreier;
    shuffle($gruppen);
    $tage[] = ['id' => bin2hex(random_bytes(12)), 'datum' => $datum, 'status' => 'aktiv', 'anwesend' => $anwesend,
        'zentrum' => $zentrum, 'gruppen' => $gruppen, 'freiePartien' => $freieErlaubt];
    $turnier['spieltage'] = $tage;
    return $turnier;
}

function schachSpieltagBeenden(array $turnier): array
{
    $tage = $turnier['spieltage'] ?? [];
    if (!istSchach($turnier) || !$tage || $tage[count($tage) - 1]['status'] !== 'aktiv') throw new ApiError('Es gibt keinen laufenden Spieltag.');
    $turnier['spieltage'][count($tage) - 1]['status'] = 'beendet';
    return $turnier;
}

function schachSpieltagePruefen(array $turnier, mixed $tage): array
{
    $fehler = fn() => throw new ApiError('Die gesicherten Spieltage passen nicht zum Turnier.');
    if (!is_array($tage) || !array_is_list($tage) || count($tage) > 1000) $fehler();
    $personen = array_column($turnier['teilnehmer'], null, 'id');
    $partien = array_column(array_merge(...$turnier['runden']), null, 'id'); $tagIds = []; $result = [];
    foreach ($tage as $index => $tag) {
        if (!is_array($tag) || !is_string($tag['id'] ?? null) || !preg_match('/^[a-f0-9]{24}$/D', $tag['id']) || isset($tagIds[$tag['id']])) $fehler();
        $tagIds[$tag['id']] = true;
        $datum = $tag['datum'] ?? null; $date = is_string($datum) ? DateTimeImmutable::createFromFormat('!Y-m-d', $datum) : false;
        if (!$date || $date->format('Y-m-d') !== $datum || !in_array($tag['status'] ?? null, ['aktiv', 'beendet'], true)
            || ($tag['status'] === 'aktiv' && $index !== count($tage) - 1) || !is_bool($tag['freiePartien'] ?? null)) $fehler();
        $anwesend = $tag['anwesend'] ?? null; $gesehen = [];
        if (!is_array($anwesend) || !array_is_list($anwesend) || count($anwesend) < 2 || count($anwesend) > count($personen)) $fehler();
        foreach ($anwesend as $id) {
            if (!is_int($id) || !isset($personen[$id]) || isset($gesehen[$id])) $fehler();
            $gesehen[$id] = true;
        }
        $zentrum = $tag['zentrum'] ?? null;
        if (count($anwesend) % 2 ? (!is_int($zentrum) || !isset($gesehen[$zentrum])) : $zentrum !== null) $fehler();
        $gruppen = $tag['gruppen'] ?? null; $verteilt = []; $spielIds = []; $dreierAnzahl = 0; $sauber = [];
        if (!is_array($gruppen) || !array_is_list($gruppen)) $fehler();
        foreach ($gruppen as $gruppe) {
            if (!is_array($gruppe) || !in_array($gruppe['typ'] ?? null, ['paar', 'dreier'], true)) $fehler();
            $ids = $gruppe['spieler'] ?? null; $spiele = $gruppe['spiele'] ?? null; $freie = $gruppe['freiePaarungen'] ?? null;
            $dreier = $gruppe['typ'] === 'dreier';
            if (!is_array($ids) || !array_is_list($ids) || count($ids) !== ($dreier ? 3 : 2)
                || !is_array($spiele) || !array_is_list($spiele) || !is_array($freie) || !array_is_list($freie)) $fehler();
            if ($dreier) { $dreierAnzahl++; if ($ids[0] !== $zentrum) $fehler(); }
            foreach ($ids as $id) {
                if (!is_int($id) || !isset($gesehen[$id]) || isset($verteilt[$id])) $fehler();
                $verteilt[$id] = true;
            }
            $paarAnzahl = []; $gruppeIds = array_flip($ids);
            foreach ($spiele as $id) {
                if (!is_string($id) || !isset($partien[$id]) || isset($spielIds[$id])) $fehler();
                $spielIds[$id] = true; $spiel = $partien[$id];
                if (!isset($gruppeIds[$spiel['a']], $gruppeIds[$spiel['b']]) || ($dreier && $spiel['a'] !== $zentrum && $spiel['b'] !== $zentrum)) $fehler();
                $key = schachPaarSchluessel($spiel['a'], $spiel['b']); $paarAnzahl[$key] = ($paarAnzahl[$key] ?? 0) + 1;
            }
            $freieSauber = [];
            foreach ($freie as $paar) {
                if (!$tag['freiePartien'] || !is_array($paar) || !is_int($paar['a'] ?? null) || !is_int($paar['b'] ?? null)
                    || $paar['a'] === $paar['b'] || !isset($gruppeIds[$paar['a']], $gruppeIds[$paar['b']])
                    || !is_int($paar['anzahl'] ?? null) || $paar['anzahl'] < 1 || $paar['anzahl'] > ($turnier['durchgaenge'] ?? 1)
                    || ($dreier && ($paar['a'] !== $zentrum || $paar['anzahl'] !== 1))) $fehler();
                $key = schachPaarSchluessel($paar['a'], $paar['b']); $paarAnzahl[$key] = ($paarAnzahl[$key] ?? 0) + $paar['anzahl'];
                $freieSauber[] = ['a' => $paar['a'], 'b' => $paar['b'], 'anzahl' => $paar['anzahl']];
            }
            if ($dreier) {
                if (count($paarAnzahl) !== 2) $fehler();
                foreach ([$ids[1], $ids[2]] as $gegner) if (($paarAnzahl[schachPaarSchluessel($zentrum, $gegner)] ?? 0) !== 1) $fehler();
            } elseif (count($paarAnzahl) !== 1 || reset($paarAnzahl) < 1 || reset($paarAnzahl) > ($turnier['durchgaenge'] ?? 1)) $fehler();
            $sauber[] = ['typ' => $gruppe['typ'], 'spieler' => $ids, 'spiele' => $spiele, 'freiePaarungen' => $freieSauber];
        }
        if (count($verteilt) !== count($anwesend) || $dreierAnzahl !== count($anwesend) % 2) $fehler();
        $result[] = ['id' => $tag['id'], 'datum' => $datum, 'status' => $tag['status'], 'anwesend' => $anwesend,
            'zentrum' => $zentrum, 'gruppen' => $sauber, 'freiePartien' => $tag['freiePartien']];
    }
    return $result;
}
