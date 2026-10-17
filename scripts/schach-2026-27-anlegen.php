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
    return schachAltErgebnisse($turnier, $alt);
}

if (defined('SCHACH_SAISON_NUR_FUNKTIONEN')) return;
$_GET['action'] = 'importieren';
$turnier = withStore(function (array &$turniere, array $verlauf): array {
    foreach ($turniere as $index => $vorhanden) {
        if ($vorhanden['titel'] !== 'Schachturnier 2026/27' || !istSchach($vorhanden)) continue;
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
