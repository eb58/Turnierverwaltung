# Turnierverwaltung

Webanwendung für Tischtennis-Doppelturniere und Schachturniere im Seniorenclub Lübars. Sie bietet Spielpläne, Ergebniserfassung, Tabellen und eine öffentliche Zuschaueransicht. Änderungen sind durch eine PIN für die Turnierleitung geschützt.

Die Anwendung verwendet HTML, CSS, Vanilla JavaScript und PHP. Sie benötigt weder einen Build-Schritt noch eine Datenbank oder zusätzliche Softwarepakete. Die Turnierdaten werden serverseitig als JSON gespeichert.

## Kurzanleitungen

- [Bedienungsanleitung für Turnierleiter](docs/turnierleitung.md)
- [Bedienungsanleitung für die Gesamtverwaltung](docs/gesamtverwaltung.md)

## Funktionen

| | Tischtennis | Schach |
| --- | --- | --- |
| Teilnehmer | 5 bis 32 feste Doppelpaare | 2 bis 32 Einzelspieler |
| Turniermodus | Jeder gegen jeden oder K.-o.-System | Jeder gegen jeden |
| Spielwertung | Zwei oder drei Gewinnsätze; Satzergebnis oder einzelne Sätze | Sieg: 1 Punkt, Remis: ½ Punkt, Niederlage: 0 Punkte |
| Spielplan | Runden, Freilose und automatische Fortschreibung der K.-o.-Sieger | Eine Partie pro Paarung oder Hin- und Rückspiel mit Farbenwechsel |
| Tabelle | Siege, Satzdifferenz und direkter Vergleich | Punkte, direkter Vergleich und Kreuztabelle mit Farben und Ergebnissen |

Gemeinsame Funktionen:

- Verwaltung mehrerer Turniere mit eigenen PINs für die jeweilige Turnierleitung
- Optionale Tisch- bzw. Brettanzahl mit Zuordnung zu Spielblöcken und Tischen/Brettern
- Öffentliche Zuschauer- und Beameransicht mit automatischer Aktualisierung
- Direkte Links zu einzelnen Turnieren
- Druckansicht und Urkunden für die Plätze 1 bis 3; beim Doppel für beide Spieler
- JSON-Export und -Import einzelner Turniere
- Automatische Sicherungen mit Vorschau und Wiederherstellung, auch für gelöschte Turniere
- Versionsprüfung zum Schutz vor dem Überschreiben paralleler Änderungen

Für Schach gibt es außerdem eine Anwesenheitsauswahl und Tagesauslosungen mit gespeicherter Spieltagshistorie.

## Voraussetzungen

- **PHP ab 8.1**, lokal als Kommandozeilenprogramm `php` verfügbar. Der Code verwendet unter anderem `readonly`, `never` und `array_is_list`.
- **Ein moderner Browser** mit JavaScript, ES-Modulen und Cookies für die Anmeldung.
- **Schreibrechte im Datenverzeichnis** für den Benutzer, unter dem PHP ausgeführt wird. Standardmäßig ist dies `data/`; das Verzeichnis wird bei Bedarf angelegt.
- **Für Tests zusätzlich Node.js und npm.** Es werden der integrierte Node-Test-Runner und `fetch` verwendet. Es gibt keine npm-Abhängigkeiten; `npm install` ist nicht erforderlich.
- **Für das Deployment per Skript zusätzlich PowerShell, SSH und SCP.** Auf dem Zielserver wird Apache mit PHP, `mod_rewrite` und aktivierter Verarbeitung der `.htaccess` benötigt.

## Lokal starten

Alle Befehle im Projektverzeichnis ausführen.

### 1. PIN der Gesamtverwaltung einrichten

```powershell
php server/pin-einrichten.php
```

Das Skript erzeugt eine zufällige achtstellige PIN und zeigt sie einmal im Terminal an. Die PIN für die spätere Anmeldung aufbewahren. Gespeichert wird ausschließlich ihr Passwort-Hash.

Alternativ lässt sich eine eigene PIN mit 6 bis 12 Ziffern über die Standardeingabe setzen:

```powershell
$neueLeitungsPin = Read-Host 'Neue PIN der Gesamtverwaltung'
$neueLeitungsPin | php server/pin-einrichten.php --stdin
Remove-Variable neueLeitungsPin
```

Eine vorhandene PIN wird bei einem erneuten Aufruf nicht überschrieben. Zum bewussten Zurücksetzen der PIN der Gesamtverwaltung:

```powershell
php server/pin-einrichten.php --zuruecksetzen
```

Die PINs der einzelnen Turnierleitungen bleiben dabei erhalten. `--zuruecksetzen` lässt sich mit `--stdin` kombinieren. Das Einrichtungsskript ist ausschließlich über die PHP-Kommandozeile ausführbar.

### 2. Webserver starten

```powershell
php -S localhost:8001 -t client server/router.php
```

Alternativ `npm start`. Anschließend <http://localhost:8001> öffnen. Der lokale Router liefert die Oberfläche aus `client/` und die API aus `server/` aus und sperrt den direkten Webzugriff auf `data/` und `server/`. Zum Beenden des Servers im Terminal `Strg+C` drücken.

### 3. Erstes Turnier anlegen

1. **Anmelden** wählen und die PIN der Gesamtverwaltung eingeben.
2. **Neues Turnier anlegen** öffnen, Sportart und Modus wählen und die Teilnehmer eintragen.
3. Bei Bedarf über **Turnier-PIN festlegen** eine eigene PIN für dieses Turnier vergeben.
4. Ergebnisse im Spielplan erfassen; bei Schach zunächst die Anwesenden auswählen und Paarungen auslosen.

## Anmeldung und Berechtigungen

Ohne Anmeldung startet die Anwendung in der Zuschaueransicht.

| Rolle | Anmeldung | Berechtigungen |
| --- | --- | --- |
| Zuschauer | Keine PIN | Turniere, Spielpläne, Tabellen und Ergebnisse ansehen; Beameransicht öffnen |
| Turnierleitung | PIN des ausgewählten Turniers | Dieses Turnier bearbeiten, Ergebnisse erfassen, Spieltage auslosen und beenden, drucken, Urkunden ausgeben, exportieren und dessen Sicherungen nutzen |
| Gesamtverwaltung | PIN aus `pin-einrichten.php` | Alle Turniere verwalten, anlegen, löschen und importieren sowie Turnier-PINs vergeben, ersetzen oder entfernen |

Ein Turnier ohne eigene PIN kann nur die Gesamtverwaltung bearbeiten. Eine Sitzung kann für mehrere Turniere angemeldet sein; für die übrigen Turniere bleibt sie in der Zuschaueransicht. Die Turnierleitung kann ihre eigene PIN ändern. Beim Löschen eines Turniers wird dessen PIN entfernt.

Die Berechtigungen werden bei jeder Aktion serverseitig geprüft. Beameransichten bleiben schreibgeschützt. Nach acht Stunden ohne Aktivität läuft die Anmeldung ab. Eine PIN-Änderung macht andere Sitzungen mit dieser PIN ungültig.

Die Funktionen stehen in der linken Seitenleiste. Am Desktop lässt sie sich zu einer Symbolleiste verkleinern; der Browser merkt sich diesen Zustand. Auf schmalen Bildschirmen öffnet die Menütaste die Navigation. Beim Drucken und in der Beameransicht wird die Seitenleiste ausgeblendet.

## Turnierbetrieb

### Tischtennis

Die Anwendung verwaltet feste Doppelpaare. Bei **Jeder gegen jeden** spielt jedes Paar einmal gegen jedes andere Paar. Die Tabelle wertet Siege, Satzdifferenz und anschließend den direkten Vergleich; bei vollständigem Gleichstand werden Ränge geteilt. Im **K.-o.-System** werden Freilose berücksichtigt und Sieger automatisch in die nächste Runde übernommen.

Es können zwei oder drei Gewinnsätze eingestellt werden. Ergebnisse lassen sich als Satzergebnis, beispielsweise `2:1`, oder mit den Punkten jedes einzelnen Satzes erfassen. Die aktuelle Runde ist hervorgehoben, weitere Runden lassen sich einklappen.

### Schach: Wertung und Spielplan

Neue Schachturniere bieten standardmäßig Hin- und Rückspiel mit Farbenwechsel an. Alternativ ist eine Partie pro Paarung möglich. Bestehende Turniere behalten ihren bisherigen Modus. Der interne Spielplan verteilt Weiß und Schwarz mit höchstens einer Partie Unterschied pro Spieler; bei ungerader Spielerzahl enthält jeder Durchgang eine Pause pro Spieler. Pausen bringen keine Punkte.

| Spieler | Runden bei einer Partie pro Paarung | Partien bei einer Partie pro Paarung | Partien mit Hin- und Rückspiel |
| --- | --- | --- | --- |
| 10 | 9 | 45 | 90 |
| 11 | 11 | 55 | 110 |
| 12 | 11 | 66 | 132 |

Ergebnisse sind `1:0`, `½:½` oder `0:1`. Die Rangfolge richtet sich nach Punkten und danach nach dem direkten Vergleich innerhalb der punktgleichen Gruppe, sobald deren Begegnungen vollständig gespielt sind. Verbleibender Gleichstand ergibt geteilte Ränge. Die Kreuztabelle zeigt Ergebnisse, offene Partien und Farben aus Sicht jedes Spielers; Hin- und Rückspiel werden getrennt dargestellt.

### Schach: Anwesenheit und Tagesauslosung

1. Als Turnierleitung die anwesenden Spieler über die Namenschips markieren.
2. **Paarungen auslosen** wählen.
3. Ergebnisse direkt bei den ausgelosten Paarungen erfassen.
4. **Spieltag beenden** wählen. Der Tag erscheint anschließend unter **Bisherige Spieltage**.

Die Auslosung verwendet offene Turnierpartien und teilt nur Anwesende ein. Bei ungerader Anwesenheit entsteht eine Dreiergruppe: Die zuerst genannte Person spielt nacheinander je eine Partie gegen die beiden anderen. Diese zentrale Rolle wechselt nach Möglichkeit.

Ist für die ausgewählten Anwesenden keine vollständige Einteilung mit offenen Turnierpartien möglich, zeigt die Anwendung dies an.

Solange der laufende Spieltag keine erfassten Ergebnisse enthält, kann neu ausgelost werden. Nach dem ersten Ergebnis muss der Spieltag zuerst beendet werden. Offene Partien bleiben für spätere Spieltage verfügbar. Ergebnisse eines beendeten Spieltags können unter **Bisherige Spieltage** nachgetragen werden, bis die betreffende Partie an einem späteren Spieltag neu ausgelost wird.

Anwesenheit, Einteilung und Abschluss werden gespeichert, automatisch gesichert und bei Export und Import erhalten. Schach- und Beameransicht zeigen die tatsächlichen Tagespaarungen; die interne Rundeneinteilung bleibt ausgeblendet. Tischtennisturniere behalten ihre Rundenansicht.

### Turnierlinks und Beameransicht

**Link zu diesem Turnier** kopiert einen Link mit der Turnier-ID, zum Beispiel:

```text
http://localhost:8001/?turnier=4
http://localhost:8001/?turnier=4&beamer=1
```

Mit `?turnier=4` lädt und zeigt die Anwendung ausschließlich dieses Turnier. Turnierauswahl, Neuanlage, Import und turnierübergreifender Sicherungsverlauf sind ausgeblendet. Anmeldung, Ergebniserfassung, Tagesauslosung, Export und Beameransicht bleiben entsprechend den Berechtigungen verfügbar. Ohne den Parameter erscheint die normale Turnierauswahl.

Sichtbare Zuschauer- und Beameransichten aktualisieren sich alle 15 Sekunden automatisch.

### Ohne Internetverbindung

Fällt die Verbindung aus, merkt sich das Gerät eingetragene Ergebnisse im Browser (localStorage) und markiert sie mit „Noch nicht übertragen“. Tabelle und Kreuztabelle berücksichtigen sie sofort. Eine Leiste am unteren Rand zeigt den Offline-Zustand und die Zahl der wartenden Ergebnisse. Sobald der Server wieder erreichbar ist, überträgt die App die Ergebnisse automatisch in der eingegebenen Reihenfolge; spätestens nach 30 Sekunden oder beim erneuten Öffnen des Tabs.

Ein Service Worker (`client/sw.js`) hält die Oberfläche auf dem Gerät vor. Die App startet dadurch auch ohne Verbindung, nach einem Neuladen oder Neustart des Tablets, mit dem zuletzt geladenen Turnierstand. Voraussetzung ist, dass sie auf dem Gerät vorher einmal online geöffnet wurde. Über „Zum Startbildschirm hinzufügen“ lässt sie sich wie eine App starten.

Hinweise:

- Offline lassen sich nur Ergebnisse eintragen oder löschen. Auslosung, „Spieltag beenden“, Turnierverwaltung, PINs und Sicherungen benötigen eine Verbindung.
- Im K.-o.-System rückt ein Sieger erst nach der Übertragung in die nächste Runde vor.
- Das Gerät muss vorher online angemeldet worden sein. Ist die Anmeldung bei der Übertragung abgelaufen, bleiben die Ergebnisse gemerkt, bis erneut angemeldet wird.
- Gemerkte Ergebnisse überschreiben beim Übertragen den Serverstand. Das ist für den Betrieb mit einem Erfassungsgerät gedacht.
- Ergebnisse, die der Server ablehnt, werden verworfen und in einer Meldung genannt.
- Die gemerkten Ergebnisse liegen nur im Browser dieses Geräts. Browserdaten nicht löschen, solange die Leiste wartende Ergebnisse anzeigt.

## Datenhaltung und Sicherungen

| Pfad | Inhalt |
| --- | --- |
| `data/turniere.json` | Alle Turniere und das Verzeichnis der Änderungen |
| `data/sicherungen/` | Automatische Sicherungen mit vorherigem und neuem Turnierstand |
| `data/leitung.json` | Passwort-Hashes und Kennungen für Gesamtverwaltung und Turnierleitungen |
| `data/sitzungen/` | PHP-Anmeldesitzungen |
| `data/anmeldeversuche.json` | Daten zur Begrenzung fehlgeschlagener Anmeldeversuche |

Bei jeder Änderung an Turnierdaten wird zuerst eine Sicherung mit Datum und Beschreibung geschrieben. Erst danach ersetzt die Anwendung den aktuellen Stand atomar. Schlägt eine Sicherung fehl, bleiben die aktuellen Daten erhalten. Dateisperren und Versionsprüfungen schützen vor konkurrierenden Schreibzugriffen.

Unter **Sicherungen & Verlauf** können berechtigte Nutzer frühere Stände ansehen und wiederherstellen. Dabei entsteht eine neue Version; andere Turniere bleiben erhalten. Auch gelöschte Turniere lassen sich wiederherstellen. Die Historie beginnt mit der ersten durch diese Funktion gesicherten Änderung. Sicherungen werden dauerhaft aufbewahrt.

**Exportieren** sichert ein einzelnes Turnier als JSON. **Importieren** legt daraus ein zusätzliches Turnier an und ist der Gesamtverwaltung vorbehalten. PINs und Anmeldesitzungen sind nicht Bestandteil eines Turnierexports oder der automatischen Turniersicherungen. Für einen vollständigen Umzug oder eine zusätzliche Gesamtsicherung das gesamte `data/`-Verzeichnis kopieren.

Das Datenverzeichnis ist nicht versioniert. Apache sperrt den direkten Zugriff über die mitgelieferte `.htaccess`; lokal übernimmt dies `server/router.php`. Bei einem anderen Webserver muss eine entsprechende Zugriffssperre eingerichtet werden.

Die Umgebungsvariable `TURNIER_DATA_FILE` kann den Pfad der Turnierdatei ersetzen. PIN-Konfiguration, Sitzungen und Sicherungen werden dann ebenfalls im Verzeichnis dieser Datei angelegt. Die API-Tests nutzen dies für ein isoliertes temporäres Datenverzeichnis.

Ältere Dateien mit einer reinen Turnierliste werden beim nächsten Speichern automatisch übernommen. Turniere und Sicherungen ohne `sportart` gelten weiterhin als Tischtennis-Doppel.

Anmeldungen verwenden CSRF-Token und Cookies mit `HttpOnly` und `SameSite=Strict`, bei HTTPS zusätzlich `Secure`. PINs werden ausschließlich als Passwort-Hashes gespeichert.

## Projektstruktur

```text
Turnierverwaltung/
├── client/                       # Browser-Oberfläche (statische Dateien)
│   ├── index.html                # Oberfläche und Dialoge
│   ├── styles.css                # Layout, mobile Ansicht und Druckdarstellung
│   ├── app.js                    # Bedienung, Darstellung und API-Anbindung
│   ├── turnier-domain.js         # Tabellen, Fortschritt und Platzierungen
│   ├── schach-domain.js          # Schachwertung und Kreuztabelle
│   ├── schach-spieltag.js        # Oberfläche für Auslosung und Spieltagshistorie
│   ├── offline.js                # Offline gemerkte Ergebnisse und zuletzt bekannter Stand
│   ├── sw.js                     # Service Worker: App-Dateien für den Offline-Start
│   ├── manifest.json             # App-Manifest für den Startbildschirm
│   └── assets/                   # Wappen und SVG-Motive für Turnieranzeige und Urkunden
├── server/                       # PHP-Backend (nicht direkt per Web abrufbar)
│   ├── api.php                   # HTTP-API und gemeinsame Turnierlogik
│   ├── schach.php                # Schachspielplan, Ergebnisse und Validierung
│   ├── schach-auslosung.php      # Tagesauslosung und Spieltagsverwaltung
│   ├── speicher.php              # JSON-Speicher, Sperren und Sicherungen
│   ├── leitung.php               # PINs, Sitzungen und Berechtigungen
│   ├── pin-einrichten.php        # CLI zur Einrichtung der PIN der Gesamtverwaltung
│   └── router.php                # Router für den lokalen PHP-Webserver
├── data/                         # Laufzeitdaten; wird automatisch angelegt
├── .htaccess                     # Apache: leitet auf client/ bzw. server/api.php um, sperrt data/ und server/
├── deploy.ps1                    # Deployment über SSH/SCP
├── package.json                  # Befehle für Start, Syntaxprüfung und Tests
├── docs/                         # Kurzanleitungen für Turnierleitung und Gesamtverwaltung
├── scripts/                      # CLI für die bestehende Schachsaison
└── tests/                        # JavaScript-, PHP- und API-Tests
```

Die öffentlichen Adressen sind unabhängig von dieser Aufteilung: Die Oberfläche liegt unter `/`, die API unter `/api.php`.

## Tests

Die vollständige Testsuite unter Windows/PowerShell starten:

```powershell
npm.cmd test
```

In anderen Shells lautet der Befehl `npm test`. PHP und Node.js müssen im `PATH` verfügbar sein.

| Befehl in PowerShell | Prüfung |
| --- | --- |
| `npm.cmd run test:syntax` | JavaScript- und PHP-Syntax |
| `npm.cmd run test:unit` | JavaScript-Tests für Tabellen, Wertung, Fortschritt und Platzierungen |
| `npm.cmd run test:php` | PHP-Tests für Spielpläne, Farben, K.-o.-Fortschreibung, Auslosung und Ergebnisse |
| `npm.cmd run test:api` | API-Tests für Speicherung, Berechtigungen, PINs, Sicherungen und Spieltage |
| `npm.cmd run test:e2e` | Browser-Tests für das Arbeiten ohne Verbindung (nicht Teil von `npm test`) |

Die API-Tests starten selbst einen lokalen PHP-Testserver auf einem freien Port. Sie verwenden ein temporäres Datenverzeichnis und verändern die regulären Turnierdaten nicht.

Die Browser-Tests steuern zusätzlich ein lokales Chrome oder Edge im Hintergrund und brauchen keine weiteren Pakete. Sie beenden den PHP-Testserver, um einen Verbindungsausfall nachzustellen, und prüfen: Ergebnisse offline merken, Start ohne Verbindung über den Service Worker, automatische Übertragung, Verhalten bei abgelaufener Anmeldung und bei vom Server abgelehnten Ergebnissen. Wird kein Browser gefunden, werden die Tests übersprungen; ein abweichender Pfad lässt sich über die Umgebungsvariable `CHROME_PATH` angeben.

## Bestehende Schachsaison 2026/27 übernehmen

Das projektspezifische CLI-Skript legt **Schachturnier 2026/27** mit elf Spielern und zwölf belegten Paarergebnissen aus Rolfs Tabellen an, Stand 16.10.2026:

```powershell
php scripts/schach-2026-27-anlegen.php
```

Dies ist ein gezielter Datenimport. Er schreibt in den konfigurierten Datenspeicher und verwendet die reguläre Importvalidierung und automatische Sicherung. Ein erneuter Aufruf lässt ein bereits vorhandenes gleichnamiges Schachturnier unverändert.

Die historischen Summen aus Hin- und Rückspiel entsprechen 24 von 110 abgeschlossenen Partien. Nach der Bestätigung vom 17.10.2026 gab es keine Paarung mit zwei Remis: Ein historisches `1:1` bedeutet je einen Sieg. Farben und Reihenfolge bleiben unbekannt. Bereits abgeschlossene Paarungen stehen nicht mehr für die Auslosung zur Verfügung; die angezeigten Ränge folgen der Wertung der Anwendung.

Die rekonstruierten Spieltage vom 02., 09. und 16.10.2026 erscheinen unter **Bisherige Spieltage**. Quellen und Rekonstruktionshinweise bleiben in den Daten erhalten. Unbelegte Anwesenheit und nicht dokumentierte Partien werden nicht ergänzt.

Für ältere, bereits angelegte Saisonstände gibt es zwei Ergänzungen:

```powershell
php scripts/schach-2026-27-anlegen.php --spieltage-ergaenzen
php scripts/schach-2026-27-anlegen.php --einzelwertung-ergaenzen
```

Der erste Befehl ergänzt die rekonstruierten Spieltage, der zweite die bestätigte Einzelbilanz der historischen Paarergebnisse. Bestehende Ergebnisse bleiben erhalten; Änderungen werden automatisch gesichert. Export und Wiederimport erhalten diese Angaben.

## Deployment

Das mitgelieferte Skript ist standardmäßig für `https://senioren-luebars.berlin/turnierverwaltung/` konfiguriert.

Zuerst die geplanten Dateien und das Ziel ohne Upload anzeigen:

```powershell
.\deploy.ps1 -WhatIfOnly
```

Für die Übertragung müssen SSH-Zugang und die lokale `data/leitung.json` vorhanden sein. Letztere wird mit `php server/pin-einrichten.php` angelegt.

```powershell
.\deploy.ps1
```

Das Skript spiegelt die lokale Struktur: Es lädt zuerst `server/` und `client/`, danach die `.htaccess` hoch und entfernt anschließend Dateien der früheren, flachen Struktur. Vorhandene Turniere, Sicherungen und PIN-Konfigurationen auf dem Server bleiben erhalten. Nur wenn dort noch keine `data/leitung.json` existiert, wird die lokale PIN-Konfiguration übernommen. Lokale Turnierdaten werden nicht automatisch übertragen; dafür Export und Import verwenden.

`server/router.php`, Tests und Saison-Skripte werden nicht hochgeladen. Apache verwendet die `.htaccess`. Ein anderes Ziel lässt sich mit den Parametern `-Server`, `-User`, `-Port`, `-Webroot` und `-AppPath` angeben.

## Bildquelle

Das verwendete Reinickendorfer Bezirkssymbol ohne Mauerkrone stammt aus [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Emblem_of_borough_Reinickendorf.svg) und liegt als `reinickendorf-wappen.svg` im Projekt.
