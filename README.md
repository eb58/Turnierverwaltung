# Turnierverwaltung

Eigenständige Verwaltung von Tischtennis-Doppelturnieren – ohne Anmeldung und ohne Verbindung zur Mitgliederverwaltung. Die Anwendung besteht aus Vanilla JavaScript und PHP und benötigt keinen Build-Schritt.

## Funktionen

- 5 bis 32 feste Doppelpaare mit frei eingegebenen Namen
- Jeder gegen jeden oder K.-o.-System
- aktuelle Runde hervorgehoben, weitere Runden einklappbar
- einfache Ergebniserfassung (`3:0` bis `3:2`) oder optionale Erfassung jedes Satzes
- automatische Tabelle mit Siegen, Satzdifferenz und direktem Vergleich
- K.-o.-Freilose und automatische Fortschreibung der Sieger
- optionale Tischanzahl mit Anzeige von Durchgang und Tisch
- Beameransicht mit automatischer Aktualisierung
- Druckansicht sowie JSON-Export und -Import zur Datensicherung
- Turniere umbenennen und mit Sicherheitsabfrage löschen
- Versionsprüfung gegen versehentliches Überschreiben paralleler Änderungen

## Lokal starten

Voraussetzung: PHP 8.x.

```powershell
php -S localhost:8001 router.php
```

Danach <http://localhost:8001> öffnen.

## Datenhaltung

Alle Turniere werden in `data/turniere.json` gespeichert. Die Datei wird automatisch angelegt und ist nicht versioniert. Der Webserver benötigt Schreibrechte auf `data/`.

## Prüfen

```powershell
npm.cmd test
```

## Deployment

```powershell
.\deploy.ps1 -WhatIfOnly
.\deploy.ps1
```

Das Standardsziel ist `https://senioren-luebars.berlin/turnierverwaltung/`. Die lokale `router.php` wird nicht hochgeladen; Apache verwendet `.htaccess`.

Das verwendete Reinickendorfer Bezirkssymbol ohne Mauerkrone stammt aus [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Emblem_of_borough_Reinickendorf.svg).
