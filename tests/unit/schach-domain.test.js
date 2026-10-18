import test from 'node:test';
import assert from 'node:assert/strict';
import { schachErgebnisText, schachLetzterSpieltag, schachNachtragbar, schachPunkte, schachKreuztabelle } from '../../client/schach-domain.js';
import { turnierFortschritt, turnierPlatzierungen, turnierTabelle } from '../../client/turnier-domain.js';

const teilnehmer = [1, 2, 3, 4].map(id => ({ id, name: `Spieler ${id}`, spieler: [{ name: `Spieler ${id}` }] }));
const spiel = (a, b, punkteA, punkteB) => ({ a, b, punkteA, punkteB, status: 'fertig', sieger: punkteA === punkteB ? null : punkteA > punkteB ? a : b });
const turnier = (runden, personen = teilnehmer) => ({ sportart: 'schach', modus: 'jeder-gegen-jeden', teilnehmer: personen, runden });

test('Historische Summen zählen zwei Partien ohne erfundene Remis und werden in der Kreuztabelle zusammengefasst', () => {
  const altErgebnis = { punkteA: 1.5, punkteB: 0.5 };
  const t = { ...turnier([[{ ...spiel(1, 2, null, null), altErgebnis }], [{ ...spiel(2, 1, null, null), altErgebnis: { punkteA: .5, punkteB: 1.5 } }]], teilnehmer.slice(0, 2)), durchgaenge: 2,
    altErgebnisse: [{ a: 1, b: 2, punkteA: 1.5, punkteB: .5 }] };
  assert.deepEqual(turnierFortschritt(t), { fertig: 2, gesamt: 2 });
  assert.deepEqual(turnierTabelle(t).map(z => [z.id, z.spiele, z.punkte, z.direkt, z.historisch]), [[1, 2, 1.5, 0, true], [2, 2, .5, 0, true]]);
  assert.deepEqual(schachKreuztabelle(t)[0].felder[1], { gesamt: 1.5 });
  assert.match(schachErgebnisText(t.runden[0][0]), /gesamt/);
});

test('Historische Einzelbilanz unterscheidet unbekanntes 1:1 von bestätigten gegenseitigen Siegen', () => {
  for (const [punkteA, punkteB, siege, remis, niederlagen] of [[0, 2, 0, 0, 2], [.5, 1.5, 0, 1, 1], [1, 1, 1, 0, 1], [1.5, .5, 1, 1, 0], [2, 0, 2, 0, 0]]) {
    const t = { ...turnier([], teilnehmer.slice(0, 2)), durchgaenge: 2, altErgebnisse: [{ a: 1, b: 2, punkteA, punkteB, keineDoppelRemis: true }] };
    const zeile = turnierTabelle(t).find(z => z.id === 1);
    assert.deepEqual([zeile.spiele, zeile.siege, zeile.remis, zeile.niederlagen, zeile.punkte], [2, siege, remis, niederlagen, punkteA]);
    assert.equal(Boolean(zeile.wertungUnbekannt), false);
    if (punkteA === 1) {
      delete t.altErgebnisse[0].keineDoppelRemis;
      assert.equal(turnierTabelle(t).find(z => z.id === 1).wertungUnbekannt, true);
    }
  }
});

test('Schachtabelle zählt Siege, Remis, Niederlagen und halbe Punkte', () => {
  const tabelle = turnierTabelle(turnier([[spiel(1, 2, 1, 0), spiel(3, 4, 0.5, 0.5)], [spiel(1, 3, 0, 1)]]));
  assert.deepEqual(tabelle.map(zeile => [zeile.id, zeile.punkte, zeile.siege, zeile.remis, zeile.niederlagen]), [
    [3, 1.5, 1, 1, 0], [1, 1, 1, 0, 1], [4, 0.5, 0, 1, 0], [2, 0, 0, 0, 1],
  ]);
  assert.equal(tabelle[0].spiele, 2);
});

test('Direkter Vergleich entscheidet bei gleichen Punkten ohne Vorrang der Siegzahl', () => {
  const tabelle = turnierTabelle(turnier([[
    spiel(1, 2, 0, 1), spiel(1, 3, 1, 0), spiel(1, 4, 1, 0),
    spiel(2, 3, 0.5, 0.5), spiel(2, 4, 0.5, 0.5), spiel(3, 4, 1, 0),
  ]]));
  assert.deepEqual(tabelle.map(zeile => [zeile.id, zeile.rang]), [[2, 1], [1, 2], [3, 3], [4, 4]]);
});

test('Unvollständiger direkter Vergleich einer punktgleichen Gruppe ergibt gleiche Ränge', () => {
  const tabelle = turnierTabelle(turnier([[spiel(1, 2, 1, 0), spiel(2, 4, 1, 0), spiel(3, 4, 1, 0)]]));
  assert.deepEqual(tabelle.slice(0, 3).map(zeile => zeile.rang), [1, 1, 1]);
  assert.equal(tabelle[3].rang, 4);
});

test('Remis sind abgeschlossene Partien und können zu geteilten Urkundenplätzen führen', () => {
  const schach = turnier([[spiel(1, 2, 0.5, 0.5), spiel(1, 3, 0.5, 0.5), spiel(2, 3, 0.5, 0.5)]], teilnehmer.slice(0, 3));
  assert.deepEqual(turnierFortschritt(schach), { fertig: 3, gesamt: 3 });
  assert.deepEqual(turnierPlatzierungen(schach).map(zeile => [zeile.id, zeile.platz]), [[1, 1], [2, 1], [3, 1]]);
  schach.runden[0][0].status = 'offen';
  assert.deepEqual(turnierPlatzierungen(schach), []);
  assert.equal(turnierTabelle(schach).find(zeile => zeile.id === 1).spiele, 1);
});

test('Schachpunkte und Remisergebnisse werden lesbar mit ½ angezeigt', () => {
  assert.equal(schachPunkte(0), '0');
  assert.equal(schachPunkte(0.5), '½');
  assert.equal(schachPunkte(1.5), '1½');
  assert.equal(schachPunkte(10.5), '10½');
  assert.equal(schachErgebnisText(spiel(1, 2, 0.5, 0.5)), '½:½');
});

test('Kreuztabelle spiegelt Ergebnisse und Farben aus Sicht beider Spieler', () => {
  const schach = turnier([[spiel(1, 2, 1, 0)], [spiel(3, 1, 0.5, 0.5)], [{ a: 2, b: 3, status: 'offen', punkteA: null, punkteB: null }]], teilnehmer.slice(0, 3));
  const matrix = schachKreuztabelle(schach);
  assert.equal(matrix[0].felder[0], null);
  assert.deepEqual(matrix[0].felder[1], { runde: 1, farbe: 'Weiß', punkte: 1 });
  assert.deepEqual(matrix[1].felder[0], { runde: 1, farbe: 'Schwarz', punkte: 0 });
  assert.deepEqual(matrix[0].felder[2], { runde: 2, farbe: 'Schwarz', punkte: 0.5 });
  assert.deepEqual(matrix[2].felder[1], { runde: 3, farbe: 'Schwarz', punkte: null });
});

test('Kreuztabelle und direkter Vergleich berücksichtigen beide Durchgänge', () => {
  const schach = { ...turnier([[spiel(1, 2, 1, 0), spiel(1, 3, 1, 0), spiel(2, 3, 1, 0), spiel(2, 4, 1, 0)], [{ a: 2, b: 1, status: 'offen', punkteA: null, punkteB: null }]]), durchgaenge: 2 };
  const matrix = schachKreuztabelle(schach);
  assert.deepEqual(matrix[0].felder[1].partien, [{ runde: 1, farbe: 'Weiß', punkte: 1 }, { runde: 2, farbe: 'Schwarz', punkte: null }]);
  const tabelle = turnierTabelle(schach);
  assert.equal(tabelle.find(zeile => zeile.id === 1).direkt, 0);
  assert.equal(tabelle.find(zeile => zeile.id === 2).direkt, 0);
  assert.equal(tabelle[0].rang, tabelle[1].rang);
});

test('Offene Partien beendeter Spieltage sind nur nachtragbar, solange sie nicht neu ausgelost wurden', () => {
  const partie = (id, a, b, status = 'offen') => ({ id, a, b, status, punkteA: status === 'fertig' ? 1 : null, punkteB: status === 'fertig' ? 0 : null });
  const t = { ...turnier([[partie('p1', 1, 2, 'fertig'), partie('p2', 3, 4)], [partie('p3', 1, 3), partie('p4', 2, 4)]]),
    spieltage: [
      { id: 'tag1', status: 'beendet', gruppen: [{ spiele: ['p1'] }, { spiele: ['p2'] }, { spiele: ['p3'] }] },
      { id: 'tag2', status: 'aktiv', gruppen: [{ spiele: ['p3'] }, { spiele: ['p4'] }] },
    ] };
  const [tag1, tag2] = t.spieltage;
  const letzter = schachLetzterSpieltag(t);
  assert.equal(letzter.get('p1'), tag1);
  assert.equal(letzter.get('p3'), tag2);
  assert.deepEqual(schachNachtragbar(t, tag1), ['p2']);
  assert.deepEqual(schachNachtragbar(t, tag2), ['p3', 'p4']);
  t.runden[0][1] = partie('p2', 3, 4, 'fertig');
  assert.deepEqual(schachNachtragbar(t, tag1), []);
  assert.deepEqual(schachNachtragbar({ ...t, spieltage: [] }, { datum: '2025-01-01', paarungen: ['1-2'] }), []);
});
