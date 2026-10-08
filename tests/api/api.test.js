import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projekt = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
let prozess, basisUrl, tempOrdner;

const freierPort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(error => error ? reject(error) : resolve(port));
  });
});

const anfrage = async (action = '', method = 'GET', body) => {
  const response = await fetch(`${basisUrl}/api.php${action ? `?action=${action}` : ''}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
};

before(async () => {
  tempOrdner = await mkdtemp(join(tmpdir(), 'turnier-api-test-'));
  const port = await freierPort(); basisUrl = `http://127.0.0.1:${port}`;
  prozess = spawn('php', ['-S', `127.0.0.1:${port}`, 'router.php'], {
    cwd: projekt,
    env: { ...process.env, TURNIER_DATA_FILE: join(tempOrdner, 'turniere.json') },
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let versuch = 0; versuch < 40; versuch++) {
    try { if ((await fetch(`${basisUrl}/api.php`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('PHP-Testserver ist nicht gestartet.');
});

after(async () => {
  if (prozess && !prozess.killed) prozess.kill();
  if (tempOrdner) await rm(tempOrdner, { recursive: true, force: true });
});

test('API speichert Turnier, Ergebnisse, Namen und Sicherungen versionssicher', async () => {
  const teilnehmer = Array.from({ length: 5 }, (_, index) => ({ spieler: [{ name: `A${index + 1}` }, { name: `B${index + 1}` }] }));
  const angelegt = await anfrage('anlegen', 'POST', { titel: 'API-Test', modus: 'jeder-gegen-jeden', teilnehmer, anzahlTische: 2 });
  assert.equal(angelegt.status, 201);
  assert.equal(angelegt.payload.turnier.teilnehmer[0].name, 'A1 / B1');

  const turnier = angelegt.payload.turnier;
  const ergebnis = await anfrage(`ergebnis&turnier=${turnier.id}&spiel=${turnier.runden[0][0].id}`, 'PUT', { version: turnier.version, punkteA: 3, punkteB: 1 });
  assert.equal(ergebnis.status, 200);
  assert.equal(ergebnis.payload.turnier.runden[0][0].status, 'fertig');

  const konflikt = await anfrage(`tische&turnier=${turnier.id}`, 'PUT', { version: 1, anzahlTische: 3 });
  assert.equal(konflikt.status, 409);

  const geaendertePaare = ergebnis.payload.turnier.teilnehmer.map(paar => ({ id: paar.id, spieler: paar.spieler.map(spieler => ({ name: spieler.name })) }));
  geaendertePaare[0].spieler[0].name = 'Neuer Name';
  const namen = await anfrage(`teilnehmer&turnier=${turnier.id}`, 'PUT', { version: ergebnis.payload.turnier.version, teilnehmer: geaendertePaare });
  assert.equal(namen.status, 200);
  assert.equal(namen.payload.turnier.teilnehmer[0].name, 'Neuer Name / B1');
  assert.equal(namen.payload.turnier.runden[0][0].punkteA, 3);

  const sicherung = { format: 'turnierverwaltung-backup', version: 1, turnier: namen.payload.turnier };
  const importiert = await anfrage('importieren', 'POST', sicherung);
  assert.equal(importiert.status, 201);
  assert.notEqual(importiert.payload.turnier.id, turnier.id);
  assert.equal(importiert.payload.turnier.teilnehmer[0].name, 'Neuer Name / B1');
  assert.equal(importiert.payload.turnier.runden[0][0].punkteA, 3);

  const geloescht = await anfrage(`loeschen&turnier=${importiert.payload.turnier.id}`, 'DELETE', { version: importiert.payload.turnier.version });
  assert.equal(geloescht.status, 200);
  const geladen = await anfrage();
  assert.equal(geladen.payload.turniere.length, 1);
  assert.equal(geladen.payload.turniere[0].teilnehmer[0].name, 'Neuer Name / B1');
});
