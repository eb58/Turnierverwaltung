import test from 'node:test';
import assert from 'node:assert/strict';
import { turnierFortschritt, turnierPlatzierungen, turnierTabelle } from '../../client/turnier-domain.js';

const teilnehmer = [1, 2, 3, 4, 5].map(id => ({ id, name: `Paar ${id}` }));
const spiel = (a, b, punkteA, punkteB) => ({ a, b, punkteA, punkteB, sieger: punkteA > punkteB ? a : b, status: 'fertig' });

test('Fortschritt zählt Freilose nicht als Begegnungen', () => {
  assert.deepEqual(turnierFortschritt({ runden: [[{ status: 'freilos' }, { status: 'fertig' }], [{ status: 'offen' }]] }), { fertig: 1, gesamt: 2 });
});

test('Tabelle zählt Spiele, Siege, Niederlagen und Sätze', () => {
  const tabelle = turnierTabelle({ teilnehmer, runden: [[spiel(1, 2, 3, 1), spiel(3, 4, 3, 2)], [spiel(1, 3, 3, 0)]] });
  const erstesPaar = tabelle.find(zeile => zeile.id === 1);
  assert.equal(erstesPaar.spiele, 2);
  assert.equal(erstesPaar.siege, 2);
  assert.equal(erstesPaar.fuer, 6);
  assert.equal(erstesPaar.gegen, 1);
  assert.equal(tabelle[0].id, 1);
  assert.equal(tabelle.find(zeile => zeile.id === 2).niederlagen, 1);
});

test('Rangfolge verwendet Siege, Satzdifferenz und direkten Vergleich', () => {
  const drei = teilnehmer.slice(0, 3);
  const tabelle = turnierTabelle({ teilnehmer: drei, runden: [[
    spiel(1, 2, 3, 1),
    spiel(2, 3, 3, 0),
    spiel(3, 1, 3, 2),
  ]] });
  assert.deepEqual(tabelle.map(zeile => zeile.id), [1, 2, 3]);
  assert.deepEqual(tabelle.map(zeile => zeile.rang), [1, 2, 3]);
});

test('Vollständig gleiche Wertung teilt denselben Rang', () => {
  const tabelle = turnierTabelle({ teilnehmer, runden: [] });
  assert.deepEqual(tabelle.map(zeile => zeile.rang), [1, 1, 1, 1, 1]);
});

test('Platzierungen umfassen die ersten drei Tabellenränge', () => {
  const drei = teilnehmer.slice(0, 3).map((paar, index) => ({ ...paar, spieler: [{ name: `A${index}` }, { name: `B${index}` }] }));
  const turnier = { modus: 'jeder-gegen-jeden', teilnehmer: drei, runden: [[
    spiel(1, 2, 3, 0), spiel(1, 3, 3, 1), spiel(2, 3, 3, 2),
  ]] };
  assert.deepEqual(turnierPlatzierungen(turnier).map(paar => [paar.id, paar.platz]), [[1, 1], [2, 2], [3, 3]]);
});

test('K.-o.-Platzierungen enthalten Sieger, Finalverlierer und beide Halbfinalverlierer', () => {
  const vier = teilnehmer.slice(0, 4).map((paar, index) => ({ ...paar, spieler: [{ name: `A${index}` }, { name: `B${index}` }] }));
  const turnier = { modus: 'ko', teilnehmer: vier, runden: [
    [spiel(1, 2, 3, 1), spiel(3, 4, 3, 2)],
    [spiel(1, 3, 3, 2)],
  ] };
  assert.deepEqual(turnierPlatzierungen(turnier).map(paar => [paar.id, paar.platz]), [[1, 1], [3, 2], [2, 3], [4, 3]]);
});

test('Leere Turniere und reine Freilosrunden erhalten keine vorzeitigen Platzierungen', () => {
  for (const runden of [[], [[]], [[{ a: 1, b: null, status: 'freilos', sieger: 1 }]]]) {
    const t = { modus: 'ko', teilnehmer, runden };
    assert.deepEqual(turnierFortschritt(t), { fertig: 0, gesamt: 0 });
    assert.deepEqual(turnierPlatzierungen(t), []);
  }
  assert.deepEqual(turnierTabelle({ teilnehmer: [], runden: [] }), []);
});

test('Offene, wartende und Freilos-Spiele fließen nicht in die Tischtennistabelle ein', () => {
  const t = { teilnehmer, runden: [[spiel(1, 2, 2, 0),
    { a: 3, b: 4, status: 'offen', punkteA: null, punkteB: null },
    { a: null, b: null, status: 'wartet', punkteA: null, punkteB: null },
    { a: 5, b: null, status: 'freilos', sieger: 5 },
  ]] };
  const tabelle = turnierTabelle(t);
  assert.deepEqual(tabelle.filter(z => z.id >= 3).map(z => [z.spiele, z.siege, z.niederlagen, z.fuer, z.gegen]),
    Array.from({ length: 3 }, () => [0, 0, 0, 0, 0]));
  assert.deepEqual(turnierFortschritt(t), { fertig: 1, gesamt: 3 });
  assert.deepEqual(turnierPlatzierungen({ ...t, modus: 'jeder-gegen-jeden' }), []);
});

test('Vollständiger direkter Vergleich entscheidet zwischen gleicher Siegzahl und Satzdifferenz', () => {
  const tabelle = turnierTabelle({ teilnehmer: teilnehmer.slice(0, 4), runden: [[
    spiel(1, 2, 3, 1), spiel(3, 1, 3, 1), spiel(2, 4, 3, 1),
  ]] });
  assert.deepEqual(tabelle.map(z => [z.id, z.rang]), [[3, 1], [1, 2], [2, 3], [4, 4]]);
  assert.deepEqual(tabelle.filter(z => [1, 2].includes(z.id)).map(z => [z.siege, z.fuer - z.gegen, z.direkt]),
    [[1, 0, 1], [1, 0, 0]]);
});

test('Unvollständiger direkter Vergleich einer Dreiergruppe löst den geteilten Rang noch nicht auf', () => {
  const tabelle = turnierTabelle({ teilnehmer, runden: [[
    spiel(1, 2, 2, 0), spiel(2, 4, 2, 0), spiel(5, 1, 2, 0),
    spiel(3, 4, 2, 0), spiel(5, 3, 2, 0),
  ]] });
  assert.deepEqual(tabelle.map(z => [z.id, z.rang]), [[5, 1], [1, 2], [2, 2], [3, 2], [4, 5]]);
  assert.deepEqual(tabelle.filter(z => [1, 2, 3].includes(z.id)).map(z => z.direkt), [0, 0, 0]);
});

test('K.-o.-Finale mit Sieger auf Position B vergibt auch ohne Halbfinale die richtigen Plätze', () => {
  const t = { modus: 'ko', teilnehmer: teilnehmer.slice(0, 2), runden: [[spiel(1, 2, 0, 2)]] };
  assert.deepEqual(turnierPlatzierungen(t).map(z => [z.id, z.platz]), [[2, 1], [1, 2]]);
  t.runden[0][0] = { a: 1, b: 2, status: 'offen', sieger: null };
  assert.deepEqual(turnierPlatzierungen(t), []);
});

test('Tischtennisauswertungen verändern die gespeicherten Teilnehmer und Ergebnisse nicht', () => {
  const t = { modus: 'jeder-gegen-jeden', teilnehmer: [...teilnehmer].reverse(),
    runden: [[spiel(1, 2, 0, 2), spiel(3, 4, 2, 1)]] };
  const vorher = structuredClone(t);
  const ersteTabelle = turnierTabelle(t);
  turnierPlatzierungen(t);
  turnierFortschritt(t);
  assert.deepEqual(turnierTabelle(t), ersteTabelle);
  assert.deepEqual(t, vorher);
});
