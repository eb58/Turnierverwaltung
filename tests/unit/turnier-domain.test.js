import test from 'node:test';
import assert from 'node:assert/strict';
import { turnierFortschritt, turnierTabelle } from '../../turnier-domain.js';

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
