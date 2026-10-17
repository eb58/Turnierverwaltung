# Turnierverwaltung

Eigenständige Verwaltung von Tischtennis-Doppelturnieren und Schachturnieren mit öffentlicher Zuschaueransicht und PIN für die Turnierleitung. Die Anwendung besteht aus Vanilla JavaScript und PHP und benötigt keinen Build-Schritt.

## Funktionen

- Auswahl der Sportart beim Anlegen: Tischtennis-Doppel oder Schach
- Tischtennis: 5 bis 32 feste Doppelpaare, jeder gegen jeden oder K.-o.-System
- Schach: 2 bis 32 Einzelspieler, jeder gegen jeden
- Schach wahlweise mit Hin- und Rückspiel und Farbenwechsel oder einer Partie pro Paarung
- aktuelle Runde hervorgehoben, weitere Runden einklappbar
- Tischtennis: wahlweise zwei oder drei Gewinnsätze, einfache oder satzweise Ergebniserfassung
- Tischtennistabelle mit Siegen, Satzdifferenz und direktem Vergleich
- Schach: Weiß/Schwarz mit höchstens einer Partie Unterschied pro Spieler; bei ungerader Spielerzahl eine Pause pro Spieler
- Schachergebnisse 1:0, ½:½ oder 0:1; Tabelle mit Punkten, Siegen, Remis und Niederlagen
- Schachrangfolge nach Punkten und direktem Vergleich innerhalb der punktgleichen Gruppe, sobald deren Begegnungen vollständig gespielt sind; verbleibender Gleichstand ergibt geteilte Ränge
- Schach-Kreuztabelle mit Ergebnissen, offenen Partien und Weiß/Schwarz aus Sicht jedes Spielers
- Anwesenheitsauswahl und zufällige Tagesauslosung aus noch offenen Begegnungen
- Bei ungerader Anwesenheit eine Dreiergruppe: Eine Person spielt nacheinander je eine Partie gegen die beiden anderen; die zentrale Rolle wechselt nach Möglichkeit
- Gespeicherte Spieltage mit direkter Ergebniserfassung, Zuschauer-/Beameransicht und erneuter Auslosung vor dem ersten Tagesergebnis
- Server schützt sämtliche Änderungen mit einer Leitungsanmeldung; Zuschauer können Turniere, Tabellen und Ergebnisse lesen
- Automatische Sicherungen mit Datum und Änderungsbeschreibung; Vorschau und Wiederherstellung früherer Stände, auch gelöschter Turniere
- K.-o.-Freilose und automatische Fortschreibung der Sieger
- optionale Tisch- bzw. Brettanzahl mit Anzeige von Spielblock und Tisch/Brett
- Beameransicht mit automatischer Aktualisierung
- Druckansicht sowie JSON-Export und -Import zur Datensicherung
- druckfertige Urkunden für die Plätze 1 bis 3, beim Doppel für beide Spieler
- Turniere umbenennen und mit Sicherheitsabfrage löschen
- Versionsprüfung gegen versehentliches Überschreiben paralleler Änderungen

## Lokal starten

Voraussetzung: PHP 8.x.

Vor der ersten Nutzung eine Leitungs-PIN einrichten. Die folgende Variante erzeugt eine zufällige PIN und zeigt sie einmal im Terminal an:

```powershell
php pin-einrichten.php
```

Eine eigene PIN mit 6 bis 12 Ziffern kann über die Standardeingabe gesetzt werden:

```powershell
$neueLeitungsPin = Read-Host 'Neue Leitungs-PIN'
$neueLeitungsPin | php pin-einrichten.php --stdin
Remove-Variable neueLeitungsPin
```

Eine bestehende PIN wird durch erneutes Ausführen nicht überschrieben. Zum bewussten Zurücksetzen steht `--zuruecksetzen` zur Verfügung. Die PIN kann nach Anmeldung auch in der Anwendung geändert werden. Das Einrichtungsskript ist ausschließlich über PHP-CLI ausführbar.

```powershell
php -S localhost:8001 router.php
```

Danach <http://localhost:8001> öffnen.

Die Seite startet in der Zuschaueransicht. Über **Turnierleitung anmelden** werden Bearbeitung und **Sicherungen & Verlauf** freigeschaltet. Beameransichten bleiben schreibgeschützt. Die Anmeldung läuft nach acht Stunden ohne Aktivität ab; eine PIN-Änderung macht andere Sitzungen ungültig.

## Datenhaltung

Alle Turniere und das Verzeichnis der Änderungen werden in `data/turniere.json` gespeichert. Ältere Dateien mit einer reinen Turnierliste werden beim nächsten Speichern automatisch übernommen. Der Webserver benötigt Schreibrechte auf `data/`.

Vor jeder Änderung werden der vorherige und neue Turnierstand in einer eigenen Datei unter `data/sicherungen/` gesichert. Aktuelle Daten werden erst danach atomar ersetzt. Schlägt eine Sicherung fehl, bleibt der aktuelle Stand erhalten. Die Sicherungen werden dauerhaft aufbewahrt. Beim Wiederherstellen wird eine neue Version vergeben; andere Turniere bleiben erhalten, und parallele Änderungen werden geprüft. Sicherungen existieren ab der ersten Änderung mit dieser Version der Anwendung.

Die PIN liegt ausschließlich als Passwort-Hash in `data/leitung.json`; Sitzungen und begrenzte Anmeldeversuche werden ebenfalls unter `data/` gespeichert. Das gesamte Verzeichnis ist über Apache und den lokalen Router vom direkten Webzugriff ausgeschlossen und nicht versioniert. Für einen vollständigen Umzug bzw. eine zusätzliche Sicherung das gesamte `data/`-Verzeichnis kopieren.

Anmeldesitzungen verwenden einen eigenen CSRF-Token sowie Cookies mit HttpOnly und SameSite=Strict, bei HTTPS zusätzlich Secure. Verwendete PHP-Grundlagen: [Sitzungseinstellungen](https://www.php.net/manual/en/session.security.ini.php), [Passwort-Hashing](https://www.php.net/manual/en/function.password-hash.php).

Bestehende Turniere und ältere Sicherungen ohne `sportart` gelten weiterhin als Tischtennis-Doppel. Schachregeln und -wertung liegen getrennt in `schach.php` und `schach-domain.js`. Gemeinsame Ansichten und Speicherung werden für beide Sportarten verwendet.

Ein Schachturnier mit 10 Spielern umfasst 9 Runden und 45 Partien, mit 11 Spielern 11 Runden und 55 Partien (je eine Pause), mit 12 Spielern 11 Runden und 66 Partien. Pausen bringen keine Punkte.

Diese Zahlen gelten bei einer Partie pro Paarung. Bei Hin- und Rückspiel verdoppelt sich die Zahl der Partien: 90, 110 bzw. 132. Neue Schachturniere bieten standardmäßig Hin- und Rückspiel an; bestehende Turniere behalten ihren bisherigen Modus. Die Kreuztabelle zeigt die beiden Ergebnisse getrennt.

## Anwesenheit und Tagesauslosung

Als Turnierleitung im Schachturnier die anwesenden Spieler über Namenschips markieren und **Paarungen auslosen** wählen. Anschließend die Ergebnisse direkt bei den ausgelosten Paarungen erfassen und den Spieltag beenden. Normale Paare erhalten ihre noch offenen Partien gegeneinander. In einer Dreiergruppe spielt die zuerst genannte Person nacheinander je eine Partie gegen die beiden anderen. Nicht anwesende Spieler werden nicht eingeteilt.

Es wird zuerst nach einer vollständigen Einteilung ausschließlich mit offenen Turnierpartien gesucht. Ist diese nicht möglich, können über die sichtbar auswählbare Option **freie Partien** ergänzt werden, damit alle Anwesenden spielen. Diese Partien sind ausdrücklich als ungewertet gekennzeichnet und verändern die Turniertabelle nicht. Die Auswahl kann ausgeschaltet werden; dann wird stattdessen erklärt, dass keine vollständige Einteilung möglich ist.

Vor dem ersten erfassten Tagesergebnis kann neu ausgelost werden. Danach zuerst **Spieltag beenden** wählen. Offene Partien bleiben für weitere Spieltage verfügbar. Anwesenheit, Einteilung und Abschluss werden gespeichert, automatisch gesichert und beim JSON-Export/-Import erhalten. Abgeschlossene Spieltage erscheinen unter **Bisherige Spieltage**. Die Schachansicht und die Beameransicht zeigen ausschließlich tatsächliche Tagespaarungen; die interne Rundeneinteilung wird nicht angezeigt. Tischtennisturniere behalten ihre Rundenansicht.

## Prüfen

### Vorhandene Saison 2026/27 anlegen

Die rekonstruierten Spieltage vom 02., 09. und 16.10.2026 werden unter **Bisherige Spieltage** mit Paarungen und Ergebnissen angezeigt. Quellen und Rekonstruktionshinweise bleiben zur Nachvollziehbarkeit in den gespeicherten Daten. Bei einem bereits angelegten Turnier ergänzt `php scripts/schach-2026-27-anlegen.php --spieltage-ergaenzen` diese Historie mit automatischer Sicherung, ohne die Ergebnisse oder spätere Auslosungen zu verändern. Export und Wiederimport erhalten sie. Unbelegte Anwesenheit und nicht dokumentierte Partien werden nicht ergänzt.

`php scripts/schach-2026-27-anlegen.php` legt die elf Spieler und zwölf belegten Paarergebnisse aus Rolfs Tabellen (Stand 16.10.2026) lokal an. Ein erneuter Aufruf lässt ein bereits vorhandenes gleichnamiges Schachturnier unverändert. Der Import verwendet die reguläre Validierung und automatische Sicherung.

Historische Summen aus Hin- und Rückspiel werden als solche gespeichert: 24 von 110 Partien sind abgeschlossen. Laut Nutzerbestätigung vom 17.10.2026 gab es keine Paarung mit zwei Remis: Ein historisches 1:1 bedeutet je einen Sieg. Damit ist die Einzelbilanz eindeutig; Farben und Reihenfolge bleiben unbekannt. Diese Klarstellung lässt sich bei einem bereits angelegten Turnier mit `php scripts/schach-2026-27-anlegen.php --einzelwertung-ergaenzen` einmalig ergänzen; bestehende Ergebnisse bleiben erhalten und die Änderung wird gesichert. Die entsprechenden Paarungen stehen nicht mehr für die Auslosung zur Verfügung. Export und Wiederimport erhalten diese Angaben. Die Punktesummen stimmen mit der Quelle überein; die angezeigten Ränge folgen der Wertung der App.

```powershell
npm.cmd test
```

Die Testsuite enthält JavaScript-Unit-Tests für Tabellen und Fortschritt, PHP-Domänentests für Spielpläne, Farbverteilung, K.-o.-Fortschreibung und Ergebniswertung sowie API-Tests für beide Sportarten mit einer isolierten temporären Datendatei.

## Deployment

```powershell
.\deploy.ps1 -WhatIfOnly
.\deploy.ps1
```

Das Standardsziel ist `https://senioren-luebars.berlin/turnierverwaltung/`. Die lokale `router.php` wird nicht hochgeladen; Apache verwendet `.htaccess`.

Das Deployment lädt zuerst die Zugriffssperre für `data/` hoch. Bestehende Turniere, Sicherungen und PIN-Konfigurationen werden erhalten. Nur bei der Ersteinrichtung wird der lokale PIN-Hash übernommen. Die lokale `data/leitung.json` muss deshalb vor dem ersten Deployment eingerichtet sein.

Das verwendete Reinickendorfer Bezirkssymbol ohne Mauerkrone stammt aus [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Emblem_of_borough_Reinickendorf.svg).
