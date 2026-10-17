import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projekt = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
let prozess, basisUrl, tempOrdner;
const testPin = '482917';
const leitung = { cookie: '', csrf: '' };
const gast = { cookie: '', csrf: '' };

const freierPort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(error => error ? reject(error) : resolve(port));
  });
});

const anfrage = async (action = '', method = 'GET', body, sitzung = leitung, extraHeaders = {}) => {
  const response = await fetch(`${basisUrl}/api.php${action ? `?action=${action}` : ''}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: sitzung.cookie, 'X-CSRF-Token': sitzung.csrf, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  const cookie = response.headers.get('set-cookie');
  if (cookie) sitzung.cookie = cookie.split(';')[0];
  if (payload.leitung) sitzung.csrf = payload.leitung.csrf;
  return { status: response.status, payload };
};

before(async () => {
  tempOrdner = await mkdtemp(join(tmpdir(), 'turnier-api-test-'));
  execFileSync('php', ['pin-einrichten.php', '--stdin'], { cwd: projekt, input: testPin, env: { ...process.env, TURNIER_DATA_FILE: join(tempOrdner, 'turniere.json') }, windowsHide: true });
  const port = await freierPort(); basisUrl = `http://127.0.0.1:${port}`;
  prozess = spawn('php', ['-S', `127.0.0.1:${port}`, 'router.php'], {
    cwd: projekt,
    env: { ...process.env, TURNIER_DATA_FILE: join(tempOrdner, 'turniere.json') },
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let versuch = 0; versuch < 40; versuch++) {
    try {
      if ((await fetch(`${basisUrl}/api.php`)).ok) {
        await anfrage('leitung');
        assert.equal((await anfrage('anmelden', 'POST', { pin: testPin })).status, 200);
        return;
      }
    } catch {}
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
  const angelegt = await anfrage('anlegen', 'POST', { titel: 'API-Test', modus: 'jeder-gegen-jeden', gewinnsaetze: 2, satzweise: false, teilnehmer, anzahlTische: 2 });
  assert.equal(angelegt.status, 201);
  assert.equal(angelegt.payload.turnier.teilnehmer[0].name, 'A1 / B1');
  assert.equal(angelegt.payload.turnier.gewinnsaetze, 2);
  assert.equal(angelegt.payload.turnier.satzweise, false);

  const gemeinsamGeaendert = await anfrage(`turnier&turnier=${angelegt.payload.turnier.id}`, 'PUT', {
    version: angelegt.payload.turnier.version, titel: 'API-Test geändert', modus: 'jeder-gegen-jeden',
    gewinnsaetze: 2, satzweise: false, anzahlTische: 3, teilnehmer: angelegt.payload.turnier.teilnehmer,
  });
  assert.equal(gemeinsamGeaendert.status, 200);
  assert.equal(gemeinsamGeaendert.payload.turnier.titel, 'API-Test geändert');
  assert.equal(gemeinsamGeaendert.payload.turnier.anzahlTische, 3);

  const aufBestOfFive = await anfrage(`spielwertung&turnier=${angelegt.payload.turnier.id}`, 'PUT', { version: gemeinsamGeaendert.payload.turnier.version, gewinnsaetze: 3 });
  assert.equal(aufBestOfFive.status, 200);
  assert.equal(aufBestOfFive.payload.turnier.gewinnsaetze, 3);
  const zurueckAufBestOfThree = await anfrage(`spielwertung&turnier=${angelegt.payload.turnier.id}`, 'PUT', { version: aufBestOfFive.payload.turnier.version, gewinnsaetze: 2 });
  assert.equal(zurueckAufBestOfThree.status, 200);

  const vorErgaenzung = zurueckAufBestOfThree.payload.turnier;
  const ergaenztePaare = vorErgaenzung.teilnehmer.map(paar => ({ id: paar.id, spieler: paar.spieler }));
  ergaenztePaare.push({ id: 6, spieler: [{ name: 'A6' }, { name: 'B6' }] });
  const ergaenzt = await anfrage(`teilnehmer&turnier=${vorErgaenzung.id}`, 'PUT', { version: vorErgaenzung.version, teilnehmer: ergaenztePaare });
  assert.equal(ergaenzt.status, 200);
  assert.equal(ergaenzt.payload.turnier.teilnehmer.length, 6);
  assert.equal(ergaenzt.payload.turnier.runden.length, 5);
  const wiederReduziert = await anfrage(`teilnehmer&turnier=${vorErgaenzung.id}`, 'PUT', { version: ergaenzt.payload.turnier.version, teilnehmer: ergaenztePaare.slice(0, 5) });
  assert.equal(wiederReduziert.status, 200);
  assert.equal(wiederReduziert.payload.turnier.teilnehmer.length, 5);

  const turnier = wiederReduziert.payload.turnier;
  const ergebnis = await anfrage(`ergebnis&turnier=${turnier.id}&spiel=${turnier.runden[0][0].id}`, 'PUT', { version: turnier.version, punkteA: 2, punkteB: 1 });
  assert.equal(ergebnis.status, 200);
  assert.equal(ergebnis.payload.turnier.runden[0][0].status, 'fertig');

  const gesperrteSpielwertung = await anfrage(`spielwertung&turnier=${turnier.id}`, 'PUT', { version: ergebnis.payload.turnier.version, gewinnsaetze: 3 });
  assert.equal(gesperrteSpielwertung.status, 400);

  const gesperrterModus = await anfrage(`turnier&turnier=${turnier.id}`, 'PUT', {
    version: ergebnis.payload.turnier.version, titel: turnier.titel, modus: 'ko', gewinnsaetze: 2,
    satzweise: false, anzahlTische: 3, teilnehmer: turnier.teilnehmer,
  });
  assert.equal(gesperrterModus.status, 400);

  const zuSpaetErgaenzt = [...ergaenztePaare, { id: 7, spieler: [{ name: 'A7' }, { name: 'B7' }] }];
  const gesperrteErgaenzung = await anfrage(`teilnehmer&turnier=${turnier.id}`, 'PUT', { version: ergebnis.payload.turnier.version, teilnehmer: zuSpaetErgaenzt });
  assert.equal(gesperrteErgaenzung.status, 400);

  const erfassungsart = await anfrage(`erfassungsart&turnier=${turnier.id}`, 'PUT', { version: ergebnis.payload.turnier.version, satzweise: true });
  assert.equal(erfassungsart.status, 200);
  assert.equal(erfassungsart.payload.turnier.satzweise, true);

  const konflikt = await anfrage(`tische&turnier=${turnier.id}`, 'PUT', { version: 1, anzahlTische: 3 });
  assert.equal(konflikt.status, 409);

  const geaendertePaare = erfassungsart.payload.turnier.teilnehmer.map(paar => ({ id: paar.id, spieler: paar.spieler.map(spieler => ({ name: spieler.name })) }));
  geaendertePaare[0].spieler[0].name = 'Neuer Name';
  const namen = await anfrage(`teilnehmer&turnier=${turnier.id}`, 'PUT', { version: erfassungsart.payload.turnier.version, teilnehmer: geaendertePaare });
  assert.equal(namen.status, 200);
  assert.equal(namen.payload.turnier.teilnehmer[0].name, 'Neuer Name / B1');
  assert.equal(namen.payload.turnier.runden[0][0].punkteA, 2);

  const sicherung = { format: 'turnierverwaltung-backup', version: 1, turnier: namen.payload.turnier };
  const importiert = await anfrage('importieren', 'POST', sicherung);
  assert.equal(importiert.status, 201);
  assert.notEqual(importiert.payload.turnier.id, turnier.id);
  assert.equal(importiert.payload.turnier.teilnehmer[0].name, 'Neuer Name / B1');
  assert.equal(importiert.payload.turnier.runden[0][0].punkteA, 2);

  const geloescht = await anfrage(`loeschen&turnier=${importiert.payload.turnier.id}`, 'DELETE', { version: importiert.payload.turnier.version });
  assert.equal(geloescht.status, 200);
  const geladen = await anfrage();
  assert.equal(geladen.payload.turniere.length, 1);
  assert.equal(geladen.payload.turniere[0].teilnehmer[0].name, 'Neuer Name / B1');
});

test('Schach-API verwaltet 10 bis 12 Spieler, Remis, Korrekturen und Sicherungen', async () => {
  const teilnehmer = Array.from({ length: 10 }, (_, index) => ({ spieler: [{ name: `Schachspieler ${index + 1}` }] }));
  const angelegt = await anfrage('anlegen', 'POST', { titel: 'Schach API-Test', sportart: 'schach', modus: 'jeder-gegen-jeden', teilnehmer, anzahlTische: 5 });
  assert.equal(angelegt.status, 201);
  let turnier = angelegt.payload.turnier;
  assert.equal(turnier.sportart, 'schach');
  assert.equal(turnier.teilnehmer[0].name, 'Schachspieler 1');
  assert.equal(turnier.runden.length, 9);
  assert.equal(turnier.runden.flat().length, 45);
  assert.equal(turnier.gewinnsaetze, undefined);

  const aktualisieren = async (action, body, status = 200) => {
    const response = await anfrage(`${action}&turnier=${turnier.id}`, 'PUT', { version: turnier.version, ...body });
    assert.equal(response.status, status, response.payload.error);
    if (status === 200) turnier = response.payload.turnier;
    return response;
  };
  const zwoelf = [...turnier.teilnehmer, { spieler: [{ name: 'Schachspieler 11' }] }, { spieler: [{ name: 'Schachspieler 12' }] }];
  await aktualisieren('turnier', { ...turnier, teilnehmer: zwoelf });
  assert.equal(turnier.runden.length, 11);
  assert.equal(turnier.runden.flat().length, 66);

  // Auch der bestehende Teilnehmer-Endpunkt muss die Sportart erhalten.
  const alle = turnier.teilnehmer;
  await aktualisieren('teilnehmer', { teilnehmer: alle.slice(0, 11) });
  assert.equal(turnier.sportart, 'schach');
  assert.equal(turnier.runden.flat().length, 55);
  await aktualisieren('teilnehmer', { teilnehmer: alle });

  await aktualisieren('spielwertung', { gewinnsaetze: 3 }, 400);
  await aktualisieren('erfassungsart', { satzweise: true }, 400);
  await aktualisieren('ergebnis&spiel=r1-s1', { punkteA: 2, punkteB: 1 }, 400);
  await aktualisieren('ergebnis&spiel=r1-s1', { punkteA: 0.5, punkteB: 0.5 });
  assert.equal(turnier.runden[0][0].status, 'fertig');
  assert.equal(turnier.runden[0][0].sieger, null);
  const konflikt = await anfrage(`ergebnis&turnier=${turnier.id}&spiel=r1-s1`, 'PUT', { version: 1, punkteA: 1, punkteB: 0 });
  assert.equal(konflikt.status, 409);

  await aktualisieren('turnier', { ...turnier, teilnehmer: turnier.teilnehmer.slice(0, 11) }, 400);
  await aktualisieren('turnier', { ...turnier, sportart: 'tischtennis', teilnehmer: turnier.teilnehmer.map(person => ({ spieler: [person.spieler[0], { name: `Partner ${person.id}` }] })) }, 400);
  await aktualisieren('teilnehmer', { teilnehmer: turnier.teilnehmer.slice(0, 11) }, 400);
  const umbenannt = turnier.teilnehmer.map(person => ({ ...person, spieler: person.spieler.map(spieler => ({ ...spieler })) }));
  umbenannt[0].spieler[0].name = 'Geänderter Schachname';
  await aktualisieren('teilnehmer', { teilnehmer: umbenannt.reverse() });
  assert.equal(turnier.teilnehmer[0].name, 'Geänderter Schachname');
  assert.equal(turnier.runden[0][0].punkteA, 0.5);
  await aktualisieren('turnier', { ...turnier, titel: 'Schach geändert', anzahlTische: 6 });
  assert.equal(turnier.titel, 'Schach geändert');
  assert.equal(turnier.runden[0][0].punkteB, 0.5);

  await aktualisieren('ergebnis&spiel=r1-s1', { punkteA: 0, punkteB: 1 });
  assert.equal(turnier.runden[0][0].sieger, turnier.runden[0][0].b);
  await aktualisieren('ergebnis&spiel=r1-s1', { punkteA: 1, punkteB: 0 });
  assert.equal(turnier.runden[0][0].sieger, turnier.runden[0][0].a);
  await aktualisieren('ergebnis&spiel=r1-s1', { punkteA: null, punkteB: null });
  assert.equal(turnier.runden[0][0].status, 'offen');
  await aktualisieren('ergebnis&spiel=r1-s2', { punkteA: 0.5, punkteB: 0.5 });

  const importiert = await anfrage('importieren', 'POST', { format: 'turnierverwaltung-backup', version: 1, turnier });
  assert.equal(importiert.status, 201);
  assert.equal(importiert.payload.turnier.sportart, 'schach');
  assert.deepEqual(importiert.payload.turnier.runden, turnier.runden);
  const geladen = await anfrage();
  assert.deepEqual(geladen.payload.turniere.find(item => item.id === turnier.id), turnier);
  assert.ok(geladen.payload.turniere.some(item => item.sportart === 'tischtennis'));
});

test('Zuschauer lesen Turniere, können aber weder schreiben noch Sicherungen lesen', async () => {
  const publicData = await anfrage('', 'GET', undefined, gast);
  assert.equal(publicData.status, 200);
  assert.equal(publicData.payload.leitung.angemeldet, false);
  assert.equal(publicData.payload.leitung.eingerichtet, true);
  assert.equal(publicData.payload.verlauf, undefined);
  const vorher = await readFile(join(tempOrdner, 'turniere.json'), 'utf8');
  for (const [action, method] of [['anlegen', 'POST'], ['importieren', 'POST'], ['turnier', 'PUT'], ['ergebnis', 'PUT'], ['loeschen', 'DELETE'], ['wiederherstellen', 'POST'], ['teilnehmer', 'PUT'], ['tische', 'PUT'], ['spielwertung', 'PUT'], ['erfassungsart', 'PUT'], ['umbenennen', 'PUT'], ['pin', 'POST']]) {
    assert.equal((await anfrage(`${action}&turnier=1`, method, {}, gast)).status, 401, action);
  }
  assert.equal((await anfrage('verlauf', 'GET', undefined, gast)).status, 401);
  assert.equal((await anfrage('stand&sicherung=../../leitung.json&seite=vorher', 'GET', undefined, gast)).status, 401);
  for (const pfad of ['/data/turniere.json', '/data/leitung.json', '/data/anmeldeversuche.json', '/DATA/leitung.json', '/%64ata/leitung.json', '/data/sitzungen/test', '/data/sicherungen/test.json']) {
    assert.equal((await fetch(basisUrl + pfad)).status, 403, pfad);
  }
  assert.equal((await fetch(`${basisUrl}/pin-einrichten.php`)).status, 404);
  assert.equal(await readFile(join(tempOrdner, 'turniere.json'), 'utf8'), vorher);
  assert.equal((await anfrage('umbenennen&turnier=1', 'PUT', { version: 1, titel: 'Angriff' }, leitung, { 'X-CSRF-Token': 'falsch' })).status, 403);
  assert.equal((await anfrage('anmelden', 'POST', { pin: '000000' }, gast)).status, 401);
  assert.equal((await anfrage('anmelden', 'POST', { pin: testPin }, gast, { 'X-CSRF-Token': '' })).status, 403);
});

test('Sicherungen zeigen vorher/nachher, stellen gelöschte Turniere wieder her und verhindern veraltetes Zurücksetzen', async () => {
  const teilnehmer = [1, 2, 3].map(id => ({ spieler: [{ name: `Sicherung ${id}` }] }));
  let turnier = (await anfrage('anlegen', 'POST', { titel: 'Sicherungstest', sportart: 'schach', modus: 'jeder-gegen-jeden', teilnehmer })).payload.turnier;
  const id = turnier.id;
  turnier = (await anfrage(`ergebnis&turnier=${id}&spiel=r1-s1`, 'PUT', { version: turnier.version, punkteA: 0.5, punkteB: 0.5 })).payload.turnier;
  const remisStand = structuredClone(turnier);
  turnier = (await anfrage(`ergebnis&turnier=${id}&spiel=r1-s1`, 'PUT', { version: turnier.version, punkteA: 1, punkteB: 0 })).payload.turnier;
  const log = (await anfrage('verlauf')).payload.verlauf;
  const korrektur = log.find(eintrag => eintrag.turnierId === id && eintrag.vorherVersion === 2);
  assert.match(korrektur.beschreibung, /½:½.*1:0/);
  assert.equal(korrektur.vorher, undefined);
  const vorschau = await anfrage(`stand&sicherung=${korrektur.id}&seite=vorher`);
  assert.deepEqual(vorschau.payload.turnier, remisStand);
  assert.equal(vorschau.payload.aktuelleVersion, 3);
  assert.equal((await anfrage('stand&sicherung=../../leitung&seite=vorher')).status, 400);
  assert.equal((await anfrage(`stand&sicherung=${'f'.repeat(24)}&seite=vorher`)).status, 404);
  assert.equal((await anfrage(`loeschen&turnier=${id}`, 'DELETE', { version: turnier.version })).status, 200);
  const neu = (await anfrage('anlegen', 'POST', { titel: 'Anderes Turnier', sportart: 'schach', modus: 'jeder-gegen-jeden', teilnehmer })).payload.turnier;
  assert.ok(neu.id > id, 'Gelöschte IDs dürfen nicht wiederverwendet werden.');
  const deletedPreview = (await anfrage(`stand&sicherung=${korrektur.id}&seite=vorher`)).payload;
  assert.equal(deletedPreview.aktuelleVersion, null);
  const restored = await anfrage('wiederherstellen', 'POST', { sicherung: korrektur.id, seite: 'vorher', version: null });
  assert.equal(restored.status, 200);
  assert.equal(restored.payload.turnier.id, id);
  assert.equal(restored.payload.turnier.version, 4);
  assert.deepEqual(restored.payload.turnier.runden, remisStand.runden);
  assert.equal((await anfrage('wiederherstellen', 'POST', { sicherung: korrektur.id, seite: 'vorher', version: null })).status, 409);
  const alle = (await anfrage()).payload.turniere;
  assert.deepEqual(alle.find(item => item.id === neu.id), neu);
  const wiederLog = (await anfrage('verlauf')).payload.verlauf;
  assert.equal(wiederLog[0].aktion, 'wiederherstellen');
  const dateien = await readdir(join(tempOrdner, 'sicherungen'));
  assert.equal(dateien.length, wiederLog.length);
  const roh = await readFile(join(tempOrdner, 'leitung.json'), 'utf8');
  assert.equal(roh.includes(testPin), false);
});

test('Fehlgeschlagene Sicherungen lassen aktuelle Daten und Verlauf unverändert', async () => {
  const daten = await readFile(join(tempOrdner, 'turniere.json'), 'utf8');
  const turnier = (await anfrage()).payload.turniere[0];
  const dir = join(tempOrdner, 'sicherungen'), verschoben = join(tempOrdner, 'sicherungen-test');
  await rename(dir, verschoben);
  await writeFile(dir, 'Sicherungsordner absichtlich blockiert');
  try {
    assert.equal((await anfrage(`umbenennen&turnier=${turnier.id}`, 'PUT', { version: turnier.version, titel: 'Darf nicht gespeichert werden' })).status, 500);
    assert.equal(await readFile(join(tempOrdner, 'turniere.json'), 'utf8'), daten);
  } finally { await rm(dir); await rename(verschoben, dir); }
});

test('Turnierleitungen mit eigener PIN bearbeiten nur ihr Turnier, Verwaltung bleibt beim Superadmin', async () => {
  const anlegen = async titel => (await anfrage('anlegen', 'POST', { titel, sportart: 'schach', modus: 'jeder-gegen-jeden',
    teilnehmer: [1, 2, 3].map(nr => ({ spieler: [{ name: `${titel} ${nr}` }] })) })).payload.turnier;
  let eigenes = await anlegen('Eigenes Turnier'); const fremdes = await anlegen('Fremdes Turnier');
  const turnierPin = '613579';
  const ohneLeitung = { cookie: '', csrf: '' };
  await anfrage('leitung', 'GET', undefined, ohneLeitung);
  assert.equal((await anfrage(`turnier-pin&turnier=${eigenes.id}`, 'POST', { pin: turnierPin }, ohneLeitung)).status, 401);
  assert.equal((await anfrage(`turnier-pin&turnier=${eigenes.id}`, 'POST', { pin: 'kurz' })).status, 400);
  assert.equal((await anfrage('turnier-pin&turnier=99999', 'POST', { pin: turnierPin })).status, 404);
  const gesetzt = await anfrage(`turnier-pin&turnier=${eigenes.id}`, 'POST', { pin: turnierPin });
  assert.equal(gesetzt.status, 200);
  assert.ok(gesetzt.payload.leitung.turnierPins.includes(eigenes.id));
  assert.equal((await readFile(join(tempOrdner, 'leitung.json'), 'utf8')).includes(turnierPin), false);

  const tl = { cookie: '', csrf: '' };
  await anfrage('leitung', 'GET', undefined, tl);
  assert.equal((await anfrage('anmelden', 'POST', { pin: turnierPin, turnier: fremdes.id }, tl)).status, 401, 'Turnier-PIN gilt nicht für andere Turniere.');
  const angemeldet = await anfrage('anmelden', 'POST', { pin: turnierPin, turnier: eigenes.id }, tl);
  assert.equal(angemeldet.status, 200);
  assert.deepEqual([angemeldet.payload.leitung.superadmin, angemeldet.payload.leitung.turniere], [false, [eigenes.id]]);
  assert.equal(angemeldet.payload.leitung.turnierPins, undefined);

  eigenes = (await anfrage(`ergebnis&turnier=${eigenes.id}&spiel=r1-s1`, 'PUT', { version: eigenes.version, punkteA: 1, punkteB: 0 }, tl)).payload.turnier;
  const umbenannt = await anfrage(`umbenennen&turnier=${eigenes.id}`, 'PUT', { version: eigenes.version, titel: 'Eigenes Turnier neu' }, tl);
  assert.equal(umbenannt.status, 200); eigenes = umbenannt.payload.turnier;
  const teilnehmer = eigenes.teilnehmer.map(person => ({ id: person.id, spieler: [{ name: `${person.name} geändert` }] }));
  const geaendert = await anfrage(`teilnehmer&turnier=${eigenes.id}`, 'PUT', { version: eigenes.version, teilnehmer }, tl);
  assert.equal(geaendert.status, 200, 'Turnierleitung darf Teilnehmer ändern.'); eigenes = geaendert.payload.turnier;

  assert.equal((await anfrage(`umbenennen&turnier=${fremdes.id}`, 'PUT', { version: fremdes.version, titel: 'Übernommen' }, tl)).status, 403);
  assert.equal((await anfrage(`ergebnis&turnier=${fremdes.id}&spiel=r1-s1`, 'PUT', { version: fremdes.version, punkteA: 1, punkteB: 0 }, tl)).status, 403);
  assert.equal((await anfrage('anlegen', 'POST', { titel: 'Neu', sportart: 'schach', modus: 'jeder-gegen-jeden', teilnehmer: [] }, tl)).status, 403);
  assert.equal((await anfrage(`loeschen&turnier=${eigenes.id}`, 'DELETE', { version: eigenes.version }, tl)).status, 403);
  assert.equal((await anfrage(`turnier-pin&turnier=${eigenes.id}`, 'POST', { pin: '111111' }, tl)).status, 403);
  assert.equal((await anfrage('pin', 'POST', { aktuellePin: turnierPin, neuePin: '111111' }, tl)).status, 400, 'Ohne Turnier keine Superadmin-PIN-Änderung.');

  const verlauf = (await anfrage('verlauf', 'GET', undefined, tl)).payload.verlauf;
  assert.ok(verlauf.length >= 3 && verlauf.every(eintrag => eintrag.turnierId === eigenes.id));
  const fremderEintrag = (await anfrage('verlauf')).payload.verlauf.find(eintrag => eintrag.turnierId === fremdes.id);
  assert.equal((await anfrage(`stand&sicherung=${fremderEintrag.id}&seite=nachher`, 'GET', undefined, tl)).status, 403);
  assert.equal((await anfrage('wiederherstellen', 'POST', { sicherung: fremderEintrag.id, seite: 'nachher', version: fremdes.version }, tl)).status, 403);

  const neuePin = '624680';
  assert.equal((await anfrage('pin', 'POST', { aktuellePin: '000000', neuePin, turnier: eigenes.id }, tl)).status, 400);
  assert.equal((await anfrage('pin', 'POST', { aktuellePin: turnierPin, neuePin, turnier: eigenes.id }, tl)).status, 200);
  const zweitesGeraet = { cookie: '', csrf: '' };
  await anfrage('leitung', 'GET', undefined, zweitesGeraet);
  assert.equal((await anfrage('anmelden', 'POST', { pin: neuePin, turnier: eigenes.id }, zweitesGeraet)).status, 200);

  // Superadmin ersetzt die PIN: bestehende Sitzungen der Turnierleitung verlieren den Zugriff.
  assert.equal((await anfrage(`turnier-pin&turnier=${eigenes.id}`, 'POST', { pin: '135792' })).status, 200);
  assert.equal((await anfrage('leitung', 'GET', undefined, tl)).payload.leitung.angemeldet, false);
  assert.equal((await anfrage(`umbenennen&turnier=${eigenes.id}`, 'PUT', { version: eigenes.version, titel: 'Zu spät' }, zweitesGeraet)).status, 401);

  // Beim Löschen verschwindet auch die Turnier-PIN.
  assert.equal((await anfrage(`loeschen&turnier=${eigenes.id}`, 'DELETE', { version: eigenes.version })).status, 200);
  assert.equal((await anfrage('leitung')).payload.leitung.turnierPins.includes(eigenes.id), false);
  assert.equal((await anfrage(`loeschen&turnier=${fremdes.id}`, 'DELETE', { version: fremdes.version })).status, 200);
});

test('PIN-Änderung und Abmeldung entziehen Sitzungen den Schreibzugriff', async () => {
  const zweite = { cookie: '', csrf: '' };
  await anfrage('leitung', 'GET', undefined, zweite);
  assert.equal((await anfrage('anmelden', 'POST', { pin: testPin }, zweite)).status, 200);
  assert.equal((await anfrage('pin', 'POST', { aktuellePin: '000000', neuePin: '729481' })).status, 400);
  assert.equal((await anfrage('pin', 'POST', { aktuellePin: testPin, neuePin: 'kurz' })).status, 400);
  assert.equal((await anfrage('pin', 'POST', { aktuellePin: testPin, neuePin: '729481' })).status, 200);
  assert.equal((await anfrage('verlauf', 'GET', undefined, zweite)).status, 401);
  assert.equal((await anfrage('leitung', 'GET', undefined, zweite)).payload.leitung.angemeldet, false);
  assert.equal((await anfrage('abmelden', 'POST', {})).payload.leitung.angemeldet, false);
  assert.equal((await anfrage('anlegen', 'POST', {})).status, 401);
  assert.equal((await anfrage('anmelden', 'POST', { pin: testPin })).status, 401);
  assert.equal((await anfrage('anmelden', 'POST', { pin: '729481' })).status, 200);
});

test('Zu viele falsche PINs werden auch mit neuen Sitzungen gebremst', async () => {
  for (let i = 0; i < 8; i++) {
    const neu = { cookie: '', csrf: '' };
    await anfrage('leitung', 'GET', undefined, neu);
    assert.equal((await anfrage('anmelden', 'POST', { pin: '000000' }, neu)).status, 401);
  }
  assert.equal((await anfrage('anmelden', 'POST', { pin: '729481' }, gast)).status, 429);
  assert.equal((await anfrage('verlauf')).status, 200, 'Bestehende Anmeldung bleibt nutzbar.');
});

test('Alte Turnierlisten werden verlustfrei übernommen und beschädigte Daten nicht überschrieben', async () => {
  const datei = join(tempOrdner, 'turniere.json');
  const vorher = await readFile(datei, 'utf8');
  // Ausführliches Altformat mit name und spieler an jedem Teilnehmer
  const alt = (await anfrage()).payload.turniere;
  const tischtennis = alt.find(turnier => turnier.sportart === 'tischtennis');
  delete tischtennis.sportart;
  await writeFile(datei, JSON.stringify(alt));
  try {
    assert.deepEqual((await anfrage()).payload.turniere, alt);
    assert.equal((await anfrage(`umbenennen&turnier=${tischtennis.id}`, 'PUT', { version: tischtennis.version, titel: 'Nach Datenübernahme' })).status, 200);
    const neu = JSON.parse(await readFile(datei, 'utf8'));
    assert.equal(neu.format, 'turnierverwaltung-store');
    assert.equal(neu.turniere.length, alt.length);
    assert.deepEqual(neu.turniere.find(turnier => turnier.sportart === 'schach').runden, alt.find(turnier => turnier.sportart === 'schach').runden);
    assert.equal(neu.verlauf.length, 1);
    const gespeichert = neu.turniere.find(turnier => turnier.sportart === 'schach').teilnehmer[0];
    assert.deepEqual(Object.keys(gespeichert).sort(), ['id', 'name'], 'Einzelspieler werden ohne redundante Spielerliste gespeichert.');
    assert.ok(neu.turniere.find(turnier => turnier.id === tischtennis.id).teilnehmer.every(paar => paar.spieler.length === 2 && !('name' in paar)));
    await writeFile(datei, '{kaputt');
    assert.equal((await anfrage()).status, 500);
    assert.equal((await anfrage(`umbenennen&turnier=${tischtennis.id}`, 'PUT', { version: tischtennis.version, titel: 'Nicht schreiben' })).status, 500);
    assert.equal(await readFile(datei, 'utf8'), '{kaputt');
  } finally { await writeFile(datei, vorher); }
});

test('Einzelansicht lädt nur das gewählte Turnier und fällt bei ungültigen Links nicht auf alle zurück', async () => {
  const alle = (await anfrage()).payload.turniere;
  assert.ok(alle.length >= 2);
  const id = alle[1].id;
  for (const sitzung of [leitung, gast]) {
    const response = await fetch(`${basisUrl}/api.php?turnier=${id}`, { headers: { Cookie: sitzung.cookie } });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.turniere.map(t => t.id), [id]);
  }
  for (const [wert, status] of [['0', 400], ['abc', 400], ['99999999', 404]]) {
    const response = await fetch(`${basisUrl}/api.php?turnier=${wert}`);
    assert.equal(response.status, status);
    assert.equal((await response.json()).turniere, undefined);
  }
  assert.equal((await anfrage()).payload.turniere.length, alle.length);
});

test('API speichert Anwesenheit, Dreiergruppe und Spieltagsabschluss versionssicher mit Sicherungen', async () => {
  const teilnehmer = Array.from({ length: 11 }, (_, index) => ({ spieler: [{ name: `Anwesend ${index + 1}` }] }));
  let turnier = (await anfrage('anlegen', 'POST', { titel: 'Auslosungstest', sportart: 'schach', modus: 'jeder-gegen-jeden', durchgaenge: 2, teilnehmer })).payload.turnier;
  assert.equal(turnier.runden.flat().length, 110);
  const auswahl = { datum: '2026-10-23', anwesend: [1, 3, 5, 7, 9], freiePartien: false };
  assert.equal((await anfrage(`auslosen&turnier=${turnier.id}`, 'POST', { ...auswahl, version: turnier.version }, gast)).status, 401);
  assert.equal((await anfrage(`auslosen&turnier=${turnier.id}`, 'POST', { ...auswahl, version: turnier.version }, leitung, { 'X-CSRF-Token': '' })).status, 403);
  const draw = await anfrage(`auslosen&turnier=${turnier.id}`, 'POST', { ...auswahl, version: turnier.version });
  assert.equal(draw.status, 200);
  turnier = draw.payload.turnier;
  const tag = turnier.spieltage[0];
  assert.equal(tag.gruppen.length, 2);
  assert.equal(tag.gruppen.filter(gruppe => gruppe.typ === 'dreier').length, 1);
  assert.deepEqual(tag.gruppen.flatMap(gruppe => gruppe.spieler).sort((a, b) => a - b), auswahl.anwesend);
  assert.equal((await anfrage(`auslosen&turnier=${turnier.id}`, 'POST', { ...auswahl, version: 1 })).status, 409);
  assert.equal((await anfrage(`turnier&turnier=${turnier.id}`, 'PUT', { ...turnier, durchgaenge: 1 })).status, 400);
  assert.equal((await anfrage(`teilnehmer&turnier=${turnier.id}`, 'PUT', { version: turnier.version, teilnehmer: turnier.teilnehmer.slice(0, 10) })).status, 400);
  const publicStand = (await anfrage('', 'GET', undefined, gast)).payload.turniere.find(item => item.id === turnier.id);
  assert.deepEqual(publicStand.spieltage, turnier.spieltage);
  const spielId = tag.gruppen[0].spiele[0];
  turnier = (await anfrage(`ergebnis&turnier=${turnier.id}&spiel=${spielId}`, 'PUT', { version: turnier.version, punkteA: 0.5, punkteB: 0.5 })).payload.turnier;
  assert.equal((await anfrage(`auslosen&turnier=${turnier.id}`, 'POST', { ...auswahl, version: turnier.version })).status, 400);
  const beendet = await anfrage(`spieltag-beenden&turnier=${turnier.id}`, 'POST', { version: turnier.version });
  assert.equal(beendet.status, 200); turnier = beendet.payload.turnier;
  assert.equal(turnier.spieltage[0].status, 'beendet');
  const naechster = await anfrage(`auslosen&turnier=${turnier.id}`, 'POST', { ...auswahl, datum: '2026-10-30', version: turnier.version });
  assert.equal(naechster.status, 200); turnier = naechster.payload.turnier;
  assert.equal(turnier.spieltage.length, 2);
  assert.ok(!turnier.spieltage[1].gruppen.flatMap(gruppe => gruppe.spiele).includes(spielId));
  const backup = { format: 'turnierverwaltung-backup', version: 1, turnier };
  const importiert = await anfrage('importieren', 'POST', backup);
  assert.equal(importiert.status, 201);
  assert.deepEqual(importiert.payload.turnier.spieltage, turnier.spieltage);
  assert.deepEqual(importiert.payload.turnier.runden, turnier.runden);
  backup.turnier.spieltage[0].gruppen[0].spiele[0] = 'fremdes-spiel';
  assert.equal((await anfrage('importieren', 'POST', backup)).status, 400);
  const log = (await anfrage('verlauf')).payload.verlauf;
  const auslosung = log.find(eintrag => eintrag.turnierId === turnier.id && eintrag.aktion === 'auslosen');
  assert.equal(auslosung.beschreibung, 'Anwesende Spieler ausgelost');
  const vorschau = (await anfrage(`stand&sicherung=${auslosung.id}&seite=nachher`)).payload;
  assert.equal(vorschau.turnier.spieltage.length, 2);
});
