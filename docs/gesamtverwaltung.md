# Kurzanleitung für die Gesamtverwaltung

Die Gesamtverwaltung verwaltet alle Turniere und deren Zugänge. Die laufende Ergebniserfassung ist in der [Kurzanleitung für Turnierleiter](turnierleitung.md) beschrieben.

## 1. Anmelden

Die [Hauptseite der Turnierverwaltung](https://senioren-luebars.berlin/turnierverwaltung/) öffnen, **Anmelden** wählen und die PIN der Gesamtverwaltung eingeben. Die Hauptseite ohne `?turnier=…` verwenden. Nach der Anmeldung öffnet sich das zuletzt auf diesem Gerät ausgewählte Turnier.

Oben in der Seitenleiste führt **Gesamtverwaltung** zur Übersicht aller Turniere (direkt erreichbar über `?verwaltung`). Dort stehen Neuanlage, Import, Sicherungen und für jedes Turnier eine Karte mit Fortschritt, Turnier-PIN und letzter Änderung sowie den Aktionen **Öffnen**, **Ändern**, **Link kopieren**, **PIN festlegen** bzw. **PIN ändern** und **Löschen**. Mit **Öffnen** geht es zum Spielplan eines Turniers.

## 2. Turnier anlegen

1. In der Gesamtverwaltung **Neues Turnier** wählen und einen Titel eingeben.
2. Sportart und Modus festlegen:
   - **Tischtennis-Doppel:** 5 bis 32 feste Doppelpaare, jeder gegen jeden oder K.-o.; zwei oder drei Gewinnsätze und Art der Ergebniserfassung wählen.
   - **Schach:** 2 bis 32 Einzelspieler, jeder gegen jeden; eine Partie pro Paarung oder Hin- und Rückspiel wählen.
3. Spielernamen eintragen und bei Bedarf die Tisch- bzw. Brettanzahl festlegen. Gleichnamige Personen unterscheidbar benennen.
4. **Turnier anlegen** anklicken und die Angaben prüfen.

Über **Ändern** auf der Turnierkarte oder **Turnier ändern** in der Seitenleiste lassen sich Angaben korrigieren. Sportart, Modus, Spielwertung und Teilnehmerzahl sind nach dem ersten Ergebnis bzw. der ersten Auslosung gesperrt; Titel, Namen und Tisch- bzw. Brettanzahl bleiben bearbeitbar.

## 3. Turnierleitung einrichten

1. In der Gesamtverwaltung auf der Karte des Turniers **PIN festlegen** wählen.
2. Eine PIN mit 6 bis 12 Ziffern zweimal eingeben und **PIN speichern** wählen.
3. Über **Link kopieren** den passenden Link kopieren. Link und Turnier-PIN an die zuständige Turnierleitung geben.

Eine neue Turnier-PIN ersetzt die bisherige; betroffene Geräte müssen sich neu anmelden. Über **PIN entfernen** lässt sich der Zugang der Turnierleitung aufheben. Danach kann nur die Gesamtverwaltung dieses Turnier bearbeiten. Für die Turnierleitung eine eigene Turnier-PIN verwenden.

## 4. Sichern und wiederherstellen

- **Exportieren:** Das Turnier öffnen und in der Seitenleiste **Exportieren** wählen. Es wird als JSON-Datei heruntergeladen.
- **Importieren:** In der Gesamtverwaltung **Importieren** wählen und eine zuvor exportierte Datei auswählen. Es entsteht ein zusätzliches Turnier; anschließend bei Bedarf eine eigene Turnier-PIN vergeben.
- **Sicherungen & Verlauf:** In der Gesamtverwaltung öffnen sich die Sicherungen aller Turniere, in der Seitenleiste die des geöffneten Turniers. Turnier und Änderungszeitpunkt auswählen, den gesicherten Stand ansehen und **Diesen Stand wiederherstellen** wählen. Die Wiederherstellung ersetzt den aktuellen Stand dieses Turniers. Der aktuelle Stand wird dabei automatisch gesichert; andere Turniere bleiben erhalten.

Turnierexporte enthalten keine PINs. Einrichtung, vollständige Datensicherung und Serverbetrieb sind in der [README](../README.md) beschrieben.

## 5. Turnier löschen

In der Gesamtverwaltung auf der Karte des richtigen Turniers **Löschen** anklicken, den angezeigten Namen prüfen und **Endgültig löschen** bestätigen. Dabei wird auch die Turnier-PIN entfernt.

Ein gelöschtes Turnier kann in der Gesamtverwaltung über **Sicherungen & Verlauf** aus einem früheren Stand wiederhergestellt werden. Danach die Turnier-PIN neu vergeben.

## 6. Eigene PIN und Abmeldung

**Eigene PIN ändern** betrifft bei Anmeldung als Gesamtverwaltung die PIN der Gesamtverwaltung. Bisherige PIN und zweimal die neue PIN eingeben. Andere als Gesamtverwaltung angemeldete Geräte müssen sich anschließend neu anmelden. Zum Abschluss **Abmelden** wählen.

Bei vergessener PIN der Gesamtverwaltung erfolgt das Zurücksetzen auf dem Server über `server/pin-einrichten.php`; siehe [README](../README.md#1-pin-der-gesamtverwaltung-einrichten).
