import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ergebnisAnwenden, mitOfflineErgebnissen } from '../../client/offline.js';

const spiel = (id, extra = {}) => ({ id, a: 1, b: 2, punkteA: null, punkteB: null, saetze: [], status: 'offen', sieger: null, ...extra });
const turnier = (id, spiele, extra = {}) => ({ id, version: 4, runden: [spiele], ...extra });

test('Gemerktes Endergebnis wird wie vom Server gewertet', () => {
  const neu = ergebnisAnwenden(turnier(1, [spiel('s1'), spiel('s2')]), { turnier: 1, spiel: 's1', body: { punkteA: 1, punkteB: 3 } });
  assert.deepEqual(neu.runden[0][0], spiel('s1', { punkteA: 1, punkteB: 3, status: 'fertig', sieger: 2 }));
  assert.deepEqual(neu.runden[0][1], spiel('s2'));
});

test('Gemerkte Sätze ergeben Satzstand und Sieger', () => {
  const saetze = [{ a: 11, b: 5 }, { a: 9, b: 11 }, { a: 11, b: 7 }, { a: 12, b: 10 }];
  const neu = ergebnisAnwenden(turnier(1, [spiel('s1')]), { turnier: 1, spiel: 's1', body: { saetze } });
  assert.deepEqual(neu.runden[0][0], spiel('s1', { punkteA: 3, punkteB: 1, saetze, status: 'fertig', sieger: 1 }));
});

test('Schach-Remis hat keinen Sieger, gelöschte Ergebnisse sind wieder offen', () => {
  const remis = ergebnisAnwenden(turnier(1, [spiel('s1')]), { turnier: 1, spiel: 's1', body: { punkteA: 0.5, punkteB: 0.5 } });
  assert.equal(remis.runden[0][0].status, 'fertig');
  assert.equal(remis.runden[0][0].sieger, null);
  const fertig = spiel('s1', { punkteA: 3, punkteB: 0, saetze: [{ a: 11, b: 1 }], status: 'fertig', sieger: 1 });
  for (const body of [{ punkteA: null, punkteB: null }, { saetze: [] }]) {
    assert.deepEqual(ergebnisAnwenden(turnier(1, [fertig]), { turnier: 1, spiel: 's1', body }).runden[0][0], spiel('s1'));
  }
});

test('Gemerkte Ergebnisse betreffen nur ihr Turnier und lassen sich wiederholt anwenden', () => {
  const liste = [{ turnier: 2, spiel: 's1', body: { punkteA: 3, punkteB: 2 } }];
  const turniere = [turnier(1, [spiel('s1')]), turnier(2, [spiel('s1')])];
  const einmal = mitOfflineErgebnissen(turniere, liste);
  assert.deepEqual(einmal[0], turniere[0]);
  assert.equal(einmal[1].runden[0][0].sieger, 1);
  assert.equal(einmal[1].version, 4);
  assert.deepEqual(mitOfflineErgebnissen(einmal, liste), einmal);
});
