# Kurzanleitung für die Gesamtverwaltung

Die Gesamtverwaltung verwaltet alle Turniere und deren Zugänge. Die laufende Ergebniserfassung ist in der [Kurzanleitung für Turnierleiter](turnierleitung.md) beschrieben.

## 1. Anmelden

Die [Hauptseite der Turnierverwaltung](https://senioren-luebars.berlin/turnierverwaltung/) öffnen, **Anmelden** wählen und die PIN der Gesamtverwaltung eingeben. Die Hauptseite ohne `?turnier=…` verwenden, damit Turnierauswahl, Neuanlage und Import sichtbar sind.

## 2. Turnier anlegen

1. **Neues Turnier anlegen** wählen und einen Titel eingeben.
2. Sportart und Modus festlegen:
   - **Tischtennis-Doppel:** 5 bis 32 feste Doppelpaare, jeder gegen jeden oder K.-o.; zwei oder drei Gewinnsätze und Art der Ergebniserfassung wählen.
   - **Schach:** 2 bis 32 Einzelspieler, jeder gegen jeden; eine Partie pro Paarung oder Hin- und Rückspiel wählen.
3. Spielernamen eintragen und bei Bedarf die Tisch- bzw. Brettanzahl festlegen. Gleichnamige Personen unterscheidbar benennen.
4. **Turnier anlegen** anklicken und die Angaben prüfen.

Über **Turnier ändern** lassen sich Angaben korrigieren. Sportart, Modus, Spielwertung und Teilnehmerzahl sind nach dem ersten Ergebnis bzw. der ersten Auslosung gesperrt; Titel, Namen und Tisch- bzw. Brettanzahl bleiben bearbeitbar.

## 3. Turnierleitung einrichten

1. Das gewünschte Turnier auswählen und **Turnier-PIN festlegen** öffnen.
2. Eine PIN mit 6 bis 12 Ziffern zweimal eingeben und **PIN speichern** wählen.
3. Über **Link zu diesem Turnier** den passenden Link kopieren. Link und Turnier-PIN an die zuständige Turnierleitung geben.

Eine neue Turnier-PIN ersetzt die bisherige; betroffene Geräte müssen sich neu anmelden. Über **PIN entfernen** lässt sich der Zugang der Turnierleitung aufheben. Danach kann nur die Gesamtverwaltung dieses Turnier bearbeiten. Für die Turnierleitung eine eigene Turnier-PIN verwenden.

## 4. Sichern und wiederherstellen

- **Exportieren:** Das ausgewählte Turnier als JSON-Datei herunterladen.
- **Importieren:** Eine zuvor exportierte Datei auswählen. Es entsteht ein zusätzliches Turnier; anschließend bei Bedarf eine eigene Turnier-PIN vergeben.
- **Sicherungen & Verlauf:** Turnier und Änderungszeitpunkt auswählen, den gesicherten Stand ansehen und **Diesen Stand wiederherstellen** wählen. Die Wiederherstellung ersetzt den aktuellen Stand dieses Turniers. Der aktuelle Stand wird dabei automatisch gesichert; andere Turniere bleiben erhalten.

Turnierexporte enthalten keine PINs. Einrichtung, vollständige Datensicherung und Serverbetrieb sind in der [README](../README.md) beschrieben.

## 5. Turnier löschen

Das richtige Turnier auswählen, **Turnier löschen** anklicken, den angezeigten Namen prüfen und **Endgültig löschen** bestätigen. Dabei wird auch die Turnier-PIN entfernt.

Ein gelöschtes Turnier kann über **Sicherungen & Verlauf** aus einem früheren Stand wiederhergestellt werden. Danach die Turnier-PIN neu vergeben.

## 6. Eigene PIN und Abmeldung

**Eigene PIN ändern** betrifft bei Anmeldung als Gesamtverwaltung die PIN der Gesamtverwaltung. Bisherige PIN und zweimal die neue PIN eingeben. Andere als Gesamtverwaltung angemeldete Geräte müssen sich anschließend neu anmelden. Zum Abschluss **Abmelden** wählen.

Bei vergessener PIN der Gesamtverwaltung erfolgt das Zurücksetzen auf dem Server über `pin-einrichten.php`; siehe [README](../README.md#1-pin-der-gesamtverwaltung-einrichten).
