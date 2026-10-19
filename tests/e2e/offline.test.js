// Browser-Test für das Arbeiten ohne Verbindung: steuert ein lokales Chrome über das DevTools-Protokoll.
// "Offline" heißt hier: Der PHP-Server ist beendet, wie bei einem Funkloch im Spiellokal.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projekt = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const chromePfad = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(pfad => pfad && existsSync(pfad));
const skip = chromePfad ? false : 'Kein Chrome gefunden (Pfad über CHROME_PATH angeben).';

const testPin = '482917';
const QUEUE = `JSON.parse(localStorage.getItem('turnierverwaltung:offline-ergebnisse') || '[]')`;
const FORMULARE = `[...document.querySelectorAll('form.ergebnis')].filter(form => form.elements.punkteA)`;
const warte = ms => new Promise(resolve => setTimeout(resolve, ms));
let tempOrdner, env, port, basisUrl, php, browser, ws, turnier;
const sitzung = { cookie: '', csrf: '' };

const freierPort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(error => error ? reject(error) : resolve(port)); });
});

const phpStarten = async () => {
  php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'client', 'server/router.php'], { cwd: projekt, env, stdio: 'ignore', windowsHide: true });
  for (let versuch = 0; versuch < 50; versuch++) {
    try { if ((await fetch(`${basisUrl}/api.php`)).ok) return; } catch {}
    await warte(100);
  }
  throw new Error('PHP-Testserver ist nicht gestartet.');
};
const phpStoppen = async () => {
  if (php.exitCode !== null) return;
  const beendet = new Promise(resolve => php.once('exit', resolve));
  php.kill(); await beendet;
};

const api = async (action = '', method = 'GET', body) => {
  const response = await fetch(`${basisUrl}/api.php${action ? `?action=${action}` : ''}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Cookie: sitzung.cookie, 'X-CSRF-Token': sitzung.csrf },
  });
  const cookie = response.headers.get('set-cookie');
  if (cookie) sitzung.cookie = cookie.split(';')[0];
  const payload = await response.json();
  if (payload.leitung) sitzung.csrf = payload.leitung.csrf;
  return payload;
};
const serverSpiele = async () => (await api()).turniere.find(item => item.id === turnier.id).runden.flat();

let befehl = 0;
const offen = new Map();
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++befehl;
  offen.set(id, nachricht => nachricht.error ? reject(new Error(nachricht.error.message)) : resolve(nachricht.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async ausdruck => {
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
};
const bis = async (ausdruck, beschreibung) => {
  for (let versuch = 0; versuch < 100; versuch++) {
    try { if (await js(ausdruck)) return; } catch {}
    await warte(100);
  }
  throw new Error(`Zeitüberschreitung: ${beschreibung}`);
};
const eintragen = (index, a, b) => js(`(() => {
  const form = ${FORMULARE}[${index}];
  form.elements.punkteA.value = '${a}'; form.elements.punkteB.value = '${b}'; form.requestSubmit();
})()`);
const wiederOnline = async () => { await phpStarten(); await js(`window.dispatchEvent(new Event('online'))`); };
const meldung = () => js(`document.getElementById('meldung').textContent`);

before(async () => {
  if (skip) return;
  tempOrdner = await mkdtemp(join(tmpdir(), 'turnier-offline-test-'));
  env = { ...process.env, TURNIER_DATA_FILE: join(tempOrdner, 'daten', 'turniere.json') };
  execFileSync('php', ['server/pin-einrichten.php', '--stdin'], { cwd: projekt, input: testPin, env, windowsHide: true });
  port = await freierPort(); basisUrl = `http://127.0.0.1:${port}`;
  await phpStarten();
  await api('leitung'); await api('anmelden', 'POST', { pin: testPin });
  const teilnehmer = Array.from({ length: 5 }, (_, index) => ({ spieler: [{ name: `A${index + 1}` }, { name: `B${index + 1}` }] }));
  turnier = (await api('anlegen', 'POST', { titel: 'Offline-Test', modus: 'jeder-gegen-jeden', gewinnsaetze: 2, satzweise: false, teilnehmer, anzahlTische: 2 })).turnier;

  const profil = join(tempOrdner, 'chrome');
  browser = spawn(chromePfad, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let debugPort;
  for (let versuch = 0; versuch < 100 && !debugPort; versuch++) {
    try { debugPort = (await readFile(join(profil, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await warte(100); }
  }
  const seite = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(ziel => ziel.type === 'page');
  ws = new WebSocket(seite.webSocketDebuggerUrl);
  ws.addEventListener('message', event => {
    const nachricht = JSON.parse(event.data);
    offen.get(nachricht.id)?.(nachricht); offen.delete(nachricht.id);
  });
  await new Promise(resolve => ws.addEventListener('open', resolve));

  const [name, wert] = sitzung.cookie.split('=');
  await cdp('Network.setCookie', { name, value: wert, url: basisUrl });
  await cdp('Page.navigate', { url: `${basisUrl}/` });
  await bis(`${FORMULARE}.length > 0`, 'Ergebnisformulare');
  // Erst nach einem Neuladen läuft die Seite über den Service Worker.
  await js(`navigator.serviceWorker.ready.then(() => true)`);
  await cdp('Page.reload');
  await bis(`navigator.serviceWorker.controller && ${FORMULARE}.length > 0`, 'Seite unter Service Worker');
});

after(async () => {
  ws?.close(); browser?.kill();
  if (php) await phpStoppen();
  await warte(300);
  if (tempOrdner) await rm(tempOrdner, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('Offline eingetragene Ergebnisse überstehen ein Neuladen und werden danach übertragen', { skip }, async () => {
  await phpStoppen();
  await eintragen(0, 2, 1);
  await bis(`document.querySelectorAll('.offline-markierung').length === 1`, 'Markierung');
  assert.equal(await js(`${QUEUE}.length`), 1);
  assert.match(await js(`document.getElementById('offlineStatus').textContent`), /^Offline · Stand vom .* · 1 Ergebnis noch nicht übertragen$/);

  await cdp('Page.reload');
  await bis(`${FORMULARE}.length > 0`, 'Start ohne Verbindung');
  assert.equal(await js(`${FORMULARE}[0].elements.punkteA.value`), '2');
  assert.equal(await js(`document.querySelectorAll('.offline-markierung').length`), 1);

  await eintragen(1, 0, 2);
  await bis(`${QUEUE}.length === 2`, 'zweites gemerktes Ergebnis');

  await wiederOnline();
  await bis(`${QUEUE}.length === 0 && document.getElementById('offlineStatus').hidden`, 'Übertragung');
  assert.equal(await meldung(), '2 gemerkte Ergebnisse übertragen.');
  assert.equal(await js(`document.querySelectorAll('.offline-markierung').length`), 0);
  const [erstes, zweites] = await serverSpiele();
  assert.deepEqual([erstes.punkteA, erstes.punkteB, erstes.status, erstes.sieger], [2, 1, 'fertig', erstes.a]);
  assert.deepEqual([zweites.punkteA, zweites.punkteB, zweites.status, zweites.sieger], [0, 2, 'fertig', zweites.b]);
});

test('Bei abgelaufener Anmeldung bleiben gemerkte Ergebnisse bis zur neuen Anmeldung erhalten', { skip }, async () => {
  await phpStoppen();
  await eintragen(2, 2, 0);
  await bis(`${QUEUE}.length === 1`, 'gemerktes Ergebnis');
  await rm(join(tempOrdner, 'daten', 'sitzungen'), { recursive: true, force: true });

  await wiederOnline();
  await bis(`document.getElementById('meldung').textContent.startsWith('Bitte anmelden')`, 'Hinweis zur Anmeldung');
  assert.equal(await meldung(), 'Bitte anmelden, damit das gemerkte Ergebnis übertragen wird.');
  assert.equal(await js(`${QUEUE}.length`), 1);
  assert.equal((await serverSpiele())[2].status, 'offen');

  await js(`document.getElementById('leitungAnmelden').click()`);
  await js(`(() => { const form = document.getElementById('leitungForm'); form.elements.pin.value = '${testPin}'; form.requestSubmit(); })()`);
  await bis(`${QUEUE}.length === 0`, 'Übertragung nach Anmeldung');
  const spiel = (await serverSpiele())[2];
  assert.deepEqual([spiel.punkteA, spiel.punkteB, spiel.status], [2, 0, 'fertig']);
});

test('Vom Server abgelehnte Ergebnisse werden verworfen und gemeldet', { skip }, async () => {
  const spiel = (await serverSpiele())[3];
  await js(`localStorage.setItem('turnierverwaltung:offline-ergebnisse', JSON.stringify([{ turnier: ${turnier.id}, spiel: '${spiel.id}', body: { punkteA: 5, punkteB: 0 } }]))`);
  await js(`window.dispatchEvent(new Event('online'))`);
  await bis(`${QUEUE}.length === 0`, 'Abgleich');
  await bis(`document.getElementById('meldung').textContent.startsWith('Vom Server abgelehnt')`, 'Meldung');
  assert.match(await meldung(), /^Vom Server abgelehnt und verworfen: Offline-Test: /);
  assert.equal((await serverSpiele())[3].status, 'offen');
});
