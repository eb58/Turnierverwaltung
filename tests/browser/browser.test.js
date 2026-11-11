import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projekt = fileURLToPath(new URL('../../', import.meta.url));
const pin = '482917';
let browser, server, temp, basisUrl;

before(async () => {
  temp = await mkdtemp(join(tmpdir(), 'turnier-browser-test-'));
  const env = { ...process.env, TURNIER_DATA_FILE: join(temp, 'turniere.json') };
  execFileSync('php', ['server/pin-einrichten.php', '--stdin'], {
    cwd: projekt, input: pin, env, windowsHide: true,
  });
  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
  basisUrl = `http://127.0.0.1:${port}`;
  let startFehler, ausgabe = '';
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'client', 'server/router.php'], {
    cwd: projekt, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  });
  server.on('error', error => { startFehler = error; });
  server.stderr.on('data', chunk => { ausgabe = (ausgabe + chunk).slice(-4000); });
  for (let i = 0; i < 100; i++) {
    if (startFehler) throw startFehler;
    if (server.exitCode !== null) throw new Error(`PHP-Testserver beendet: ${ausgabe}`);
    try {
      if ((await fetch(`${basisUrl}/api.php`)).ok) {
        browser = await chromium.launch();
        return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`PHP-Testserver nicht erreichbar: ${ausgabe}`);
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null && !server.killed) {
    await new Promise(resolve => { server.once('close', resolve); server.kill(); });
  }
  if (temp) await rm(temp, { recursive: true, force: true });
});

// Jede Prüfung bekommt eine frische Sitzung. Screenshots und DOM helfen bei Fehlern.
const imBrowser = async (name, mobile, pruefung) => {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile, hasTouch: mobile, locale: 'de-DE', timezoneId: 'Europe/Berlin',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const fehler = [];
  page.on('pageerror', error => fehler.push(error.message));
  try {
    await page.goto(basisUrl);
    await pruefung(page, context);
    assert.deepEqual(fehler, [], 'Keine unbehandelten JavaScript-Fehler');
  } catch (error) {
    const ordner = join(projekt, 'test-results', name);
    await mkdir(ordner, { recursive: true });
    await Promise.allSettled([
      page.screenshot({ path: join(ordner, 'fehler.png'), fullPage: true }),
      page.content().then(html => writeFile(join(ordner, 'seite.html'), html)),
    ]);
    throw error;
  } finally { await context.close(); }
};

const sichtbar = locator => locator.waitFor({ state: 'visible' });
const textSichtbar = (page, text) => sichtbar(page.getByText(text, { exact: true }));
const mutation = async (page, action, ausloesen) => {
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).searchParams.get('action') === action
      && response.request().method() !== 'GET'),
    ausloesen(),
  ]);
  const payload = await response.json();
  assert.ok(response.ok(), `${action}: ${response.status()} ${JSON.stringify(payload)}`);
  return payload;
};
const anmelden = async page => {
  await navigation(page);
  await page.locator('#leitungAnmelden').click();
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await mutation(page, 'anmelden', () => page.locator('#leitungDialog').getByRole('button', { name: 'Anmelden', exact: true }).click());
  await page.locator('#leitungDialog').waitFor({ state: 'hidden' });
  await navigation(page);
  await sichtbar(page.locator('#leitungAbmelden'));
};
const navigation = async page => {
  const menue = page.locator('#menueUmschalten');
  if (await menue.isVisible() && await menue.getAttribute('aria-expanded') === 'false') await menue.click();
};
const anlegen = async (page, sportart, anzahl, titel) => {
  await navigation(page);
  await page.locator('#verwaltungOeffnen').click();
  await page.getByRole('button', { name: 'Neues Turnier', exact: true }).click();
  const dialog = page.locator('#turnierDialog');
  await dialog.locator(`[name="sportart"][value="${sportart}"]`).check();
  await dialog.getByLabel('Turniername', { exact: true }).fill(titel);
  while (await dialog.locator('#paare fieldset').count() > anzahl) {
    const vorher = await dialog.locator('#paare fieldset').count();
    await dialog.locator('.paar-loeschen').last().click();
    await page.locator('#dialogBestaetigen').click();
    await page.waitForFunction(n => document.querySelectorAll('#paare fieldset').length === n - 1, vorher);
  }
  const inputs = dialog.locator('#paare input');
  for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).fill(`Person ${i + 1}`);
  const result = await mutation(page, 'anlegen', () => page.locator('#turnierSpeichern').click());
  await dialog.waitFor({ state: 'hidden' });
  await textSichtbar(page, 'Turnier angelegt.');
  // Direktlink bleibt beim Neuladen und in einer unabhängigen Zuschauersitzung nutzbar.
  await page.goto(`${basisUrl}/?turnier=${result.turnier.id}`);
  await sichtbar(page.getByRole('heading', { name: titel, exact: true }));
  return result.turnier;
};

test('Browser: falsche PIN, Anmeldung, Sitzung nach Neuladen und Abmeldung', { timeout: 60000 }, () =>
  imBrowser('anmeldung', false, async page => {
    await page.locator('#leitungAnmelden').click();
    await page.getByLabel('PIN', { exact: true }).fill('000000');
    await page.locator('#leitungDialog').getByRole('button', { name: 'Anmelden', exact: true }).click();
    await sichtbar(page.locator('#leitungFehler'));
    assert.ok(await page.locator('#leitungDialog').isVisible());
    await page.locator('#leitungAbbrechen').click();
    await anmelden(page);
    await page.reload();
    await sichtbar(page.locator('#leitungAbmelden'));
    await mutation(page, 'abmelden', () => page.locator('#leitungAbmelden').click());
    await sichtbar(page.locator('#leitungAnmelden'));
    assert.equal(await page.getByRole('button', { name: 'Neues Turnier', exact: true }).isVisible(), false);
    await page.reload();
    await sichtbar(page.locator('#leitungAnmelden'));
    assert.equal(await page.locator('#leitungAbmelden').isVisible(), false);
  }));

for (const mobile of [false, true]) {
  const name = mobile ? 'mobil' : 'desktop';
  test(`Browser ${name}: Tischtennis anlegen, ungültiges Ergebnis ablehnen, speichern, korrigieren und löschen`, { timeout: 90000 }, () =>
    imBrowser(`tischtennis-${name}`, mobile, async (page, context) => {
      await anmelden(page);
      const turnier = await anlegen(page, 'tischtennis', 5, `Browser Tischtennis ${name}`);
      const karte = page.locator('.runde').first().locator('.spiel').first();
      const a = karte.locator('[name="punkteA"]'), b = karte.locator('[name="punkteB"]');
      const speichern = () => karte.getByRole('button', { name: 'Speichern', exact: true }).click();
      await a.fill('1'); await b.fill('1'); await speichern();
      await textSichtbar(page, 'Ein Spielergebnis endet bei 2 Gewinnsätzen.');
      await a.fill('2'); await b.fill('1');
      await mutation(page, 'ergebnis', speichern);
      await sichtbar(karte.getByText(/^Sätze 2:1/));
      await page.reload();
      await sichtbar(karte.getByText(/^Sätze 2:1/));
      assert.equal(await a.inputValue(), '2');
      await a.fill('0'); await b.fill('2');
      await mutation(page, 'ergebnis', speichern);
      await sichtbar(karte.getByText(/^Sätze 0:2/));
      // Gast sieht das gespeicherte Ergebnis, aber keine Eingabefelder.
      const gastContext = await browser.newContext({ viewport: context.pages()[0].viewportSize() });
      try {
        const gast = await gastContext.newPage();
        await gast.goto(`${basisUrl}/?turnier=${turnier.id}`);
        await sichtbar(gast.locator('.runde').first().getByText(/^Sätze 0:2/));
        assert.equal(await gast.locator('#details input').count(), 0);
      } finally { await gastContext.close(); }
      await a.fill(''); await b.fill(''); await speichern();
      await sichtbar(page.getByRole('dialog', { name: 'Ergebnis löschen?' }));
      await page.locator('#dialogAbbrechen').click();
      assert.ok(await karte.getByText(/^Sätze 0:2/).isVisible());
      await speichern();
      await mutation(page, 'ergebnis', () => page.locator('#dialogBestaetigen').click());
      await textSichtbar(page, 'Ergebnis gelöscht.');
      await page.reload();
      await sichtbar(a);
      assert.equal(await a.inputValue(), '');
      assert.equal(await b.inputValue(), '');
      assert.match(await page.locator('#details').innerText(), /0 von 10 Spielen abgeschlossen/);
    }));
}

// Ein zweites, unabhängig angemeldetes Gerät, das direkt mit der API spricht.
const zweitesGeraet = async () => {
  let cookie = '', csrf = '';
  const api = async (action, method = 'GET', body) => {
    const response = await fetch(`${basisUrl}/api.php${action ? `?action=${action}` : ''}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const gesetzt = response.headers.getSetCookie().map(zeile => zeile.split(';')[0]).at(-1);
    if (gesetzt) cookie = gesetzt;
    const payload = await response.json();
    if (payload.leitung?.csrf) csrf = payload.leitung.csrf;
    assert.ok(response.ok, `${action}: ${response.status} ${JSON.stringify(payload)}`);
    return payload;
  };
  await api('leitung');
  await api('anmelden', 'POST', { pin });
  return api;
};

for (const mobile of [false, true]) {
  const name = mobile ? 'mobil' : 'desktop';
  test(`Browser ${name}: Fehlermeldung im Turnierdialog ist sichtbar und nicht verdeckt`, { timeout: 60000 }, () =>
    imBrowser(`dialog-meldung-${name}`, mobile, async page => {
      await anmelden(page);
      await page.locator('#verwaltungOeffnen').click();
      await page.getByRole('button', { name: 'Neues Turnier', exact: true }).click();
      const dialog = page.locator('#turnierDialog');
      await dialog.getByLabel('Turniername', { exact: true }).fill('Doppelte Namen');
      const inputs = dialog.locator('#paare input');
      for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).fill('Gleicher Name');
      await page.locator('#turnierSpeichern').click();
      const meldung = dialog.locator('#meldung');
      await sichtbar(meldung);
      assert.match(await meldung.innerText(), /nur einmal vorkommen/);
      // Das oberste Element an der Position der Meldung ist die Meldung selbst, nicht Dialog oder Hintergrund.
      assert.ok(await meldung.evaluate(node => {
        const box = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
      }), 'Meldung liegt sichtbar über dem Dialog');
      await meldung.click();
      await meldung.waitFor({ state: 'hidden' });
      await page.locator('#turnierAbbrechen').click();
      await dialog.waitFor({ state: 'hidden' });
    }));
}

test('Browser: Versionskonflikt lädt automatisch den aktuellen Stand', { timeout: 60000 }, () =>
  imBrowser('konflikt', false, async page => {
    await anmelden(page);
    const turnier = await anlegen(page, 'tischtennis', 5, 'Browser Konflikt');
    const anderes = await zweitesGeraet();
    await anderes(`umbenennen&turnier=${turnier.id}`, 'PUT', { version: turnier.version, titel: 'Browser Konflikt geändert' });
    const karte = page.locator('.runde').first().locator('.spiel').first();
    await karte.locator('[name="punkteA"]').fill('2'); await karte.locator('[name="punkteB"]').fill('1');
    const [konflikt] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).searchParams.get('action') === 'ergebnis'),
      karte.getByRole('button', { name: 'Speichern', exact: true }).click(),
    ]);
    assert.equal(konflikt.status(), 409);
    await sichtbar(page.getByText(/auf einem anderen Gerät geändert/));
    await sichtbar(page.getByRole('heading', { name: 'Browser Konflikt geändert', exact: true }));
    await karte.locator('[name="punkteA"]').fill('2'); await karte.locator('[name="punkteB"]').fill('1');
    await mutation(page, 'ergebnis', () => karte.getByRole('button', { name: 'Speichern', exact: true }).click());
    await sichtbar(karte.getByText(/^Sätze 2:1/));
  }));

test('Browser: Schach auslosen, Remis korrigieren, Spieltag abschließen und Historie öffnen', { timeout: 90000 }, () =>
  imBrowser('schach', false, async page => {
    await anmelden(page);
    await anlegen(page, 'schach', 2, 'Browser Schach');
    const tag = page.getByRole('region', { name: 'Anwesenheit und Auslosung', exact: true });
    await tag.getByRole('button', { name: 'Alle auswählen', exact: true }).click();
    await mutation(page, 'auslosen', () => tag.getByRole('button', { name: 'Paarungen auslosen', exact: true }).click());
    await textSichtbar(page, 'Anwesende Spieler ausgelost.');
    const partien = tag.locator('.spieltag-partie');
    assert.equal(await partien.count(), 2);
    await mutation(page, 'ergebnis', () => partien.first().getByRole('radio', { name: '½:½', exact: true }).click());
    await sichtbar(partien.first().getByText('½:½ · Remis', { exact: true }));
    await mutation(page, 'ergebnis', () => partien.first().getByRole('radio', { name: '1:0', exact: true }).click());
    await sichtbar(partien.first().getByText(/^1:0 · Sieger:/));
    await mutation(page, 'ergebnis', () => partien.nth(1).getByRole('radio', { name: '½:½', exact: true }).click());
    await sichtbar(partien.nth(1).getByText('½:½ · Remis', { exact: true }));
    await tag.getByRole('button', { name: 'Spieltag beenden', exact: true }).click();
    await sichtbar(page.getByRole('dialog', { name: 'Spieltag beenden?' }));
    await mutation(page, 'spieltag-beenden', () => page.locator('#dialogBestaetigen').click());
    await sichtbar(page.getByRole('heading', { name: 'Turnier abgeschlossen', exact: true }));
    await page.reload();
    await sichtbar(page.getByRole('heading', { name: 'Turnier abgeschlossen', exact: true }));
    const historie = page.locator('.spieltag-historie');
    await historie.locator('summary').click();
    await sichtbar(historie.getByRole('cell', { name: '½:½', exact: true }));
    await sichtbar(historie.getByRole('cell', { name: '1:0', exact: true }));
    assert.equal(await historie.getByRole('radio').count(), 0);
    await historie.getByRole('button', { name: 'Ergebnisse bearbeiten', exact: true }).click();
    await sichtbar(historie.getByRole('radio', { name: '1:0', exact: true }).first());
    assert.equal(await historie.getByRole('radio', { name: '1:0', exact: true }).first().isChecked(), true);
  }));
