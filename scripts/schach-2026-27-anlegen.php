<?php
declare(strict_types=1);

// Bewusst nur lokal per CLI ausführen; keine Daten oder Verwaltungsaktion im Web anbieten.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (!defined('TURNIER_API_NO_DISPATCH')) define('TURNIER_API_NO_DISPATCH', true);
require_once dirname(__DIR__) . '/api.php';

function schachSaison2026(int $id): array
{
    $namen = ['Andreas', 'Dominik', 'Erich', 'Henry', 'Klaus', 'Klaus-Peter', 'Renate', 'Roger', 'Rolf', 'Stathi', 'Wolfhart'];
    $turnier = neuesTurnier(['titel' => 'Schachturnier 2026/27', 'sportart' => 'schach', 'modus' => 'jeder-gegen-jeden', 'durchgaenge' => 2,
        'teilnehmer' => array_map(fn($name) => ['spieler' => [['name' => $name]]], $namen)], $id);
    // Erste bekannte Tabelle vom 04.10.; weitere Tabellen vom 09.10. und 16.10.
    // "stand" bezeichnet den belegten Tabellenstand, kein vermutetes Spieldatum.
    $werte = [
        [1, 6, 0, 2, '2026-10-04'], [2, 5, 0, 2, '2026-10-04'], [3, 4, 0, 2, '2026-10-04'], [9, 11, 1, 1, '2026-10-04'],
        [2, 4, 2, 0, '2026-10-09'], [3, 9, 0, 2, '2026-10-09'], [5, 11, 2, 0, '2026-10-09'],
        [1, 5, 0, 2, '2026-10-16'], [2, 9, 1.5, .5, '2026-10-16'], [4, 11, 1, 1, '2026-10-16'],
        [6, 8, 1, 1, '2026-10-16'], [7, 10, 0, 2, '2026-10-16'],
    ];
    $alt = array_map(fn($w) => ['a' => $w[0], 'b' => $w[1], 'punkteA' => $w[2], 'punkteB' => $w[3], 'stand' => $w[4],
        'quelle' => 'Rolf Prums: Turniertabelle 2026-27.ods, E-Mail vom ' . $w[4] . '; Nutzerbestätigung 17.10.2026: keine zwei Remis pro Paarung',
        'keineDoppelRemis' => true], $werte);
    $turnier = schachAltErgebnisse($turnier, $alt);
    $turnier['historischeSpieltage'] = schachSaisonSpieltage2026($turnier);
    return $turnier;
}

function schachSaisonSpieltage2026(array $turnier): array
{
    $mail = fn($id, $titel) => ['titel' => $titel, 'url' => 'https://mail.google.com/mail/u/0/#all/' . $id];
    return schachHistorischeSpieltagePruefen($turnier, [
        ['datum' => '2026-10-02', 'paarungen' => ['1-6', '2-5', '3-4', '9-11'], 'anwesend' => [1, 2, 3, 4, 5, 6, 9, 11], 'anwesenheitVollstaendig' => false,
            'hinweis' => 'Datum aus Rolfs Mail vom 03.10. („gestrige Spielergebnisse“) und der nachgereichten „Tabelle von Freitag“ vom 04.10. abgeleitet. Die vier Paarungen stehen in dieser ersten Tabelle. Weitere Anwesende sind nicht belegt.',
            'quellen' => [$mail('1a10263f0c43e4fe', '03.10.2026: Schachturnier'), $mail('1a1075e1c5c6814d', '04.10.2026: Tabelle von Freitag')]],
        ['datum' => '2026-10-09', 'paarungen' => ['2-4', '5-11', '3-9'], 'anwesend' => [2, 3, 4, 5, 9, 11], 'anwesenheitVollstaendig' => true,
            'hinweis' => 'Rolf nennt sechs Mitspieler und die drei Hin- und Rückspielergebnisse ausdrücklich in seiner Mail. Sie stimmen mit den neuen Einträgen der Tabelle überein.',
            'quellen' => [$mail('1a1214ce39be6bd2', '09.10.2026: Schachergebnisse und Tabelle')]],
        ['datum' => '2026-10-16', 'paarungen' => ['1-5', '2-9', '4-11', '6-8', '7-10'], 'anwesend' => range(1, 11), 'anwesenheitVollstaendig' => true,
            'hinweis' => 'Laut Rolf waren alle elf anwesend. Die fünf Paarungen ergeben sich aus den neuen Einträgen gegenüber der Tabelle vom 09.10. Für Erich ist an diesem Tag keine gewertete Partie dokumentiert. Eine zusätzliche Partie oder Dreiergruppe ist aus den Mails nicht rekonstruierbar.',
            'quellen' => [$mail('1a1214ce39be6bd2', '09.10.2026: vorheriger Tabellenstand'), $mail('1a145a320da4aa65', '16.10.2026: Schachergebnisse 16.10.26')]],
    ]);
}

if (defined('SCHACH_SAISON_NUR_FUNKTIONEN')) return;
$_GET['action'] = 'importieren';
$turnier = withStore(function (array &$turniere, array $verlauf): array {
    foreach ($turniere as $index => $vorhanden) {
        if ($vorhanden['titel'] !== 'Schachturnier 2026/27' || !istSchach($vorhanden)) continue;
        if (in_array('--spieltage-ergaenzen', $GLOBALS['argv'], true)) {
            $tage = schachSaisonSpieltage2026($vorhanden);
            if (!empty($vorhanden['historischeSpieltage']) && $vorhanden['historischeSpieltage'] !== $tage) throw new ApiError('Bereits vorhandene historische Spieltage werden nicht ersetzt.');
            if (($vorhanden['historischeSpieltage'] ?? []) !== $tage) {
                $vorhanden['historischeSpieltage'] = $tage;
                $neu = importiertesTurnier(['format' => 'turnierverwaltung-backup', 'turnier' => $vorhanden], $vorhanden['id']);
                $neu['version'] = $vorhanden['version'] + 1;
                $turniere[$index] = $neu;
                return $neu;
            }
        }
        if (in_array('--einzelwertung-ergaenzen', $GLOBALS['argv'], true)) {
            // Nur die bestätigte Einzelwertung ergänzen, keine bestehenden Partien ersetzen.
            $geaendert = false;
            foreach ($vorhanden['altErgebnisse'] ?? [] as $i => $alt) {
                if ($alt['keineDoppelRemis'] ?? false) continue;
                $vorhanden['altErgebnisse'][$i]['keineDoppelRemis'] = true;
                $vorhanden['altErgebnisse'][$i]['quelle'] .= '; Nutzerbestätigung 17.10.2026: keine zwei Remis pro Paarung';
                $geaendert = true;
            }
            if ($geaendert) {
                $neu = importiertesTurnier(['format' => 'turnierverwaltung-backup', 'turnier' => $vorhanden], $vorhanden['id']);
                $neu['version'] = $vorhanden['version'] + 1;
                $turniere[$index] = $neu;
                return $neu;
            }
        }
        return $vorhanden;
    }
    $neu = schachSaison2026(naechsteTurnierId($turniere, $verlauf));
    // Derselbe Validator wie beim regulären Import, bevor echte Daten gespeichert werden.
    $neu = importiertesTurnier(['format' => 'turnierverwaltung-backup', 'turnier' => $neu], $neu['id']);
    $turniere[] = $neu;
    return $neu;
}, true);
echo json_encode(['id' => $turnier['id'], 'titel' => $turnier['titel'], 'spieler' => count($turnier['teilnehmer']),
    'partien' => count(array_merge(...$turnier['runden'])), 'abgeschlossen' => count(array_filter(array_merge(...$turnier['runden']), fn($s) => $s['status'] === 'fertig'))], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), "\n";
