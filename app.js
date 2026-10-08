const $ = id => document.getElementById(id);
const el = (tag, text, className = '') => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  node.className = className;
  return node;
};

const state = { turniere: [], ausgewaehlt: null, busy: false, satzweise: false, beamer: new URLSearchParams(location.search).has('beamer') };
const form = $('turnierForm');
const paare = $('paare');
const details = $('details');
const auswahl = $('turnierAuswahl');
const appDialog = $('appDialog');
let dialogResolve;

const dialogBeenden = wert => {
  appDialog.close();
  const resolve = dialogResolve; dialogResolve = null;
  resolve?.(wert);
};

const dialogOeffnen = ({ titel, text, eingabe = null, bestaetigung = 'Bestätigen', gefahr = false }) => new Promise(resolve => {
  dialogResolve = resolve;
  $('dialogTitel').textContent = titel;
  $('dialogText').textContent = text;
  $('dialogEingabeWrap').hidden = eingabe === null;
  $('dialogEingabe').required = eingabe !== null;
  $('dialogEingabe').value = eingabe ?? '';
  $('dialogBestaetigen').textContent = bestaetigung;
  $('dialogBestaetigen').className = gefahr ? 'danger' : '';
  appDialog.showModal();
  if (eingabe !== null) { $('dialogEingabe').focus(); $('dialogEingabe').select(); }
  else $('dialogBestaetigen').focus();
});

$('dialogAbbrechen').addEventListener('click', () => dialogBeenden(null));
$('dialogForm').addEventListener('submit', event => {
  event.preventDefault();
  const mitEingabe = !$('dialogEingabeWrap').hidden;
  dialogBeenden(mitEingabe ? $('dialogEingabe').value.trim() : true);
});
appDialog.addEventListener('cancel', event => { event.preventDefault(); dialogBeenden(null); });

let meldungsTimer;
const meldung = (text, typ = 'fehler') => {
  clearTimeout(meldungsTimer);
  $('meldung').textContent = text;
  $('meldung').className = `meldung${typ === 'erfolg' ? ' erfolg' : ''}`;
  $('meldung').hidden = !text;
  if (text && typ === 'erfolg') meldungsTimer = setTimeout(() => meldung(''), 3000);
};

const setBusy = busy => {
  state.busy = busy;
  document.querySelectorAll('button, input, select').forEach(node => { node.disabled = busy; });
};

const request = async (action = '', options = {}) => {
  const response = await fetch(`api.php${action ? `?action=${action}` : ''}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
};

const modusName = modus => modus === 'ko' ? 'K.-o.-System' : 'Jeder gegen jeden';
const gueltigesErgebnis = (a, b) => Number.isInteger(a) && Number.isInteger(b)
  && ((a === 3 && b >= 0 && b <= 2) || (b === 3 && a >= 0 && a <= 2));

const turnierFortschritt = turnier => {
  const spiele = turnier.runden.flat().filter(spiel => spiel.status !== 'freilos');
  return { fertig: spiele.filter(spiel => spiel.status === 'fertig').length, gesamt: spiele.length };
};

const turnierTabelle = turnier => {
  const zeilen = new Map(turnier.teilnehmer.map(teilnehmer => [teilnehmer.id, {
    ...teilnehmer, spiele: 0, siege: 0, niederlagen: 0, fuer: 0, gegen: 0,
  }]));
  for (const spiel of turnier.runden.flat()) {
    if (spiel.status !== 'fertig') continue;
    const a = zeilen.get(spiel.a), b = zeilen.get(spiel.b);
    a.spiele++; b.spiele++;
    a.fuer += spiel.punkteA; a.gegen += spiel.punkteB;
    b.fuer += spiel.punkteB; b.gegen += spiel.punkteA;
    const sieger = spiel.punkteA > spiel.punkteB ? a : b;
    const verlierer = sieger === a ? b : a;
    sieger.siege++; verlierer.niederlagen++;
  }
  const gruppen = new Map();
  for (const zeile of zeilen.values()) {
    const key = `${zeile.siege}:${zeile.fuer - zeile.gegen}`;
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(zeile);
  }
  for (const gruppe of gruppen.values()) {
    const ids = new Set(gruppe.map(zeile => zeile.id));
    const direkte = turnier.runden.flat().filter(spiel => spiel.status === 'fertig' && ids.has(spiel.a) && ids.has(spiel.b));
    const komplett = direkte.length === gruppe.length * (gruppe.length - 1) / 2;
    for (const zeile of gruppe) zeile.direkt = komplett ? direkte.filter(spiel => spiel.sieger === zeile.id).length : 0;
  }
  const wertung = (a, b) => b.siege - a.siege || (b.fuer - b.gegen) - (a.fuer - a.gegen) || b.direkt - a.direkt;
  const sortiert = [...zeilen.values()].sort((a, b) => wertung(a, b) || a.name.localeCompare(b.name, 'de') || a.id - b.id);
  let rang = 0;
  return sortiert.map((zeile, index) => {
    if (!sortiert[index - 1] || wertung(zeile, sortiert[index - 1]) !== 0) rang = index + 1;
    return { ...zeile, rang };
  });
};

const aktualisiereAnzahl = () => { $('anzahl').textContent = `${paare.children.length} Doppelpaare · erlaubt: 5 bis 32`; };
const addPaar = () => {
  if (paare.children.length >= 32) return;
  const nummer = paare.children.length + 1;
  const feld = el('fieldset', undefined, 'paar');
  feld.append(el('legend', `Paar ${nummer}`));
  for (let position = 1; position <= 2; position++) {
    const box = el('div', undefined, 'person');
    const input = el('input');
    input.required = true;
    input.maxLength = 100;
    input.placeholder = `Name Spieler ${position}`;
    input.setAttribute('aria-label', `Paar ${nummer}, Spieler ${position}`);
    box.append(input); feld.append(box);
  }
  paare.append(feld); aktualisiereAnzahl();
};

const renderTabelle = turnier => {
  const wrap = el('div', undefined, 'table-wrap'), table = el('table');
  table.append(el('caption', 'Rangfolge: Siege, Satzdifferenz, direkter Vergleich.'));
  const thead = el('thead'), header = el('tr');
  for (const text of ['Rang', 'Doppelpaar', 'Spiele', 'Siege', 'Niederlagen', 'Sätze', 'Differenz']) {
    const th = el('th', text); th.scope = 'col'; header.append(th);
  }
  thead.append(header); table.append(thead);
  const tbody = el('tbody');
  for (const zeile of turnierTabelle(turnier)) {
    const row = el('tr');
    for (const text of [zeile.rang, zeile.name, zeile.spiele, zeile.siege, zeile.niederlagen, `${zeile.fuer}:${zeile.gegen}`, zeile.fuer - zeile.gegen]) row.append(el('td', text));
    tbody.append(row);
  }
  table.append(tbody); wrap.append(table); return wrap;
};

const mutation = async (action, body, erfolgstext = 'Ergebnis gespeichert.') => {
  if (state.busy) return;
  setBusy(true); meldung('');
  try {
    const result = await request(action, { method: 'PUT', body: JSON.stringify(body) });
    state.turniere = state.turniere.map(turnier => turnier.id === result.turnier.id ? result.turnier : turnier);
    render();
    meldung(erfolgstext, 'erfolg');
  } catch (error) { meldung(error.message); }
  finally { setBusy(false); }
};

const speichern = async (turnier, spiel, body) => {
  if (turnier.modus === 'ko' && spiel.status === 'fertig'
    && !await dialogOeffnen({
      titel: 'Ergebnis ändern?',
      text: 'Bei einem geänderten Sieger werden betroffene Folgespiele zurückgesetzt.',
      bestaetigung: 'Ergebnis ändern',
    })) return;
  void mutation(`ergebnis&turnier=${turnier.id}&spiel=${encodeURIComponent(spiel.id)}`, { version: turnier.version, ...body });
};

const aktuelleRundeIndex = turnier => {
  const index = turnier.runden.findIndex(runde => runde.some(spiel => !['fertig', 'freilos'].includes(spiel.status)));
  return index < 0 ? Math.max(0, turnier.runden.length - 1) : index;
};

const rundenTitel = (turnier, index) => {
  const rest = turnier.runden.length - index;
  return turnier.modus === 'ko'
    ? (rest === 1 ? 'Finale' : rest === 2 ? 'Halbfinale' : rest === 3 ? 'Viertelfinale' : `Runde ${index + 1}`)
    : `Runde ${index + 1}`;
};

const renderBeamer = turnier => {
  const names = new Map(turnier.teilnehmer.map(item => [item.id, item.name]));
  const fortschritt = turnierFortschritt(turnier);
  const aktuell = aktuelleRundeIndex(turnier);
  details.className = 'panel beamer-panel';
  details.append(el('h2', turnier.titel), el('p', `${modusName(turnier.modus)} · ${fortschritt.fertig} von ${fortschritt.gesamt} Spielen abgeschlossen`, 'muted'));
  if (turnier.modus === 'jeder-gegen-jeden') details.append(el('h3', 'Tabelle'), renderTabelle(turnier));
  for (const index of [aktuell, aktuell + 1]) {
    const runde = turnier.runden[index];
    if (!runde) continue;
    details.append(el('h3', `${index === aktuell ? 'Aktuell' : 'Danach'}: ${rundenTitel(turnier, index)}`));
    const grid = el('div', undefined, 'beamer-spiele');
    let termin = 0;
    for (const spiel of runde) {
      const card = el('article', undefined, 'spiel');
      card.append(el('p', `${names.get(spiel.a) ?? 'Sieger der Vorrunde'} – ${names.get(spiel.b) ?? (spiel.status === 'freilos' ? 'Freilos' : 'Sieger der Vorrunde')}`, 'paarung'));
      if (spiel.status === 'fertig') card.append(el('p', `Ergebnis ${spiel.punkteA}:${spiel.punkteB}`, 'erfolg'));
      else if (spiel.status === 'freilos') card.append(el('p', 'Automatisch weiter', 'muted'));
      else if (spiel.status === 'wartet') card.append(el('p', 'Vorherige Spiele noch offen', 'muted'));
      else {
        card.append(el('p', turnier.anzahlTische ? `Durchgang ${Math.floor(termin / turnier.anzahlTische) + 1} · Tisch ${termin % turnier.anzahlTische + 1}` : 'Tisch noch offen', 'muted'));
        termin++;
      }
      grid.append(card);
    }
    details.append(grid);
  }
};

const renderDetails = () => {
  details.replaceChildren();
  details.className = 'panel';
  const turnier = state.turniere.find(item => item.id === state.ausgewaehlt);
  if (!turnier) { details.append(el('p', 'Noch kein Turnier angelegt.', 'muted')); return; }
  if (state.beamer) { renderBeamer(turnier); return; }
  const names = new Map(turnier.teilnehmer.map(item => [item.id, item.name]));
  const fortschritt = turnierFortschritt(turnier);
  const kopf = el('div', undefined, 'turnier-kopf toolbar');
  const kopfAktionen = el('div', undefined, 'toolbar');
  const umbenennen = el('button', 'Umbenennen', 'secondary'); umbenennen.type = 'button';
  umbenennen.addEventListener('click', async () => {
    const titel = await dialogOeffnen({ titel: 'Turnier umbenennen', text: 'Gib einen neuen Namen für das Turnier ein.', eingabe: turnier.titel, bestaetigung: 'Speichern' });
    if (titel === null || titel === turnier.titel) return;
    void mutation(`umbenennen&turnier=${turnier.id}`, { version: turnier.version, titel }, 'Turnier umbenannt.');
  });
  const istTestturnier = turnier.titel.trim().toLocaleLowerCase('de') === 'testturnier';
  const loeschen = el('button', istTestturnier ? 'Testturnier löschen' : 'Turnier löschen', 'danger'); loeschen.type = 'button';
  loeschen.addEventListener('click', async () => {
    if (!await dialogOeffnen({
      titel: 'Turnier löschen?',
      text: `„${turnier.titel}“ und alle zugehörigen Ergebnisse werden endgültig gelöscht.`,
      bestaetigung: 'Endgültig löschen',
      gefahr: true,
    })) return;
    setBusy(true); meldung('');
    try {
      await request(`loeschen&turnier=${turnier.id}`, { method: 'DELETE', body: JSON.stringify({ version: turnier.version }) });
      state.turniere = state.turniere.filter(item => item.id !== turnier.id);
      state.ausgewaehlt = state.turniere[0]?.id ?? null;
      render();
      meldung(`${istTestturnier ? 'Testturnier' : 'Turnier'} gelöscht.`, 'erfolg');
    } catch (error) { meldung(error.message); }
    finally { setBusy(false); }
  });
  kopfAktionen.append(umbenennen, loeschen);
  kopf.append(el('h2', turnier.titel), kopfAktionen);
  details.append(kopf, el('p', `${modusName(turnier.modus)} · ${turnier.teilnehmer.length} Doppelpaare · ${fortschritt.fertig} von ${fortschritt.gesamt} Spielen abgeschlossen`, 'muted'));

  const erfassung = el('label', undefined, 'erfassungsart');
  const schalter = el('input'); schalter.type = 'checkbox'; schalter.role = 'switch'; schalter.checked = state.satzweise;
  schalter.addEventListener('change', () => { state.satzweise = schalter.checked; renderDetails(); });
  erfassung.append(schalter, document.createTextNode(' Sätze einzeln erfassen')); details.append(erfassung);

  const tischForm = el('form', undefined, 'toolbar tisch-form');
  const tischLabel = el('label', 'Verfügbare Tische (optional)');
  const tischInput = el('input'); tischInput.type = 'number'; tischInput.min = '1'; tischInput.max = '32'; tischInput.value = turnier.anzahlTische ?? ''; tischInput.placeholder = 'offen';
  const tischButton = el('button', 'Tischanzahl speichern', 'secondary'); tischButton.type = 'submit';
  tischLabel.append(tischInput); tischForm.append(tischLabel, tischButton);
  tischForm.addEventListener('submit', event => { event.preventDefault(); void mutation(`tische&turnier=${turnier.id}`, { version: turnier.version, anzahlTische: tischInput.value ? Number(tischInput.value) : null }, 'Tischanzahl gespeichert.'); });
  details.append(tischForm);

  if (turnier.modus === 'jeder-gegen-jeden') {
    details.append(el('h3', 'Tabelle'), renderTabelle(turnier));
    if (fortschritt.fertig === fortschritt.gesamt) details.append(el('p', 'Turnier abgeschlossen.', 'erfolg'));
  } else {
    const finale = turnier.runden.at(-1)[0];
    if (finale.sieger !== null) details.append(el('p', `Turniersieger: ${names.get(finale.sieger)}`, 'erfolg'));
  }

  const runden = el('div', undefined, 'runden');
  const aktuelleRunde = aktuelleRundeIndex(turnier);
  for (const [rundenIndex, runde] of turnier.runden.entries()) {
    const section = el('details', undefined, `runde${rundenIndex === aktuelleRunde ? ' aktuell' : ''}`);
    section.open = rundenIndex === aktuelleRunde;
    const spiele = el('div', undefined, 'runden-spiele');
    const titel = rundenTitel(turnier, rundenIndex);
    const status = runde.every(spiel => ['fertig', 'freilos'].includes(spiel.status)) ? 'abgeschlossen' : rundenIndex === aktuelleRunde ? 'aktuell' : 'später';
    section.append(el('summary', `${titel} · ${status}`));
    if (turnier.modus === 'jeder-gegen-jeden') {
      const dabei = new Set(runde.flatMap(spiel => [spiel.a, spiel.b]));
      const pause = turnier.teilnehmer.filter(item => !dabei.has(item.id));
      if (pause.length) spiele.append(el('p', `Pause: ${pause.map(item => item.name).join(', ')}`, 'muted'));
    }
    let termin = 0;
    for (const spiel of runde) {
      const card = el('article', undefined, 'spiel');
      card.append(el('p', `${names.get(spiel.a) ?? 'Sieger der Vorrunde'} – ${names.get(spiel.b) ?? (spiel.status === 'freilos' ? 'Freilos' : 'Sieger der Vorrunde')}`, 'paarung'));
      if (spiel.status !== 'freilos') {
        card.append(el('p', turnier.anzahlTische ? `Durchgang ${Math.floor(termin / turnier.anzahlTische) + 1} · Tisch ${termin % turnier.anzahlTische + 1}` : 'Tisch noch offen', 'muted'));
        termin++;
      }
      if (['freilos', 'wartet'].includes(spiel.status)) {
        card.append(el('p', spiel.status === 'freilos' ? 'Automatisch weiter' : 'Vorherige Spiele sind noch offen', 'muted'));
      } else {
        const ergebnisForm = el('form', undefined, 'ergebnis');
        if (state.satzweise) {
          for (let index = 0; index < 5; index++) {
            const row = el('div', undefined, 'satz'); row.append(el('span', `Satz ${index + 1}`));
            for (const key of ['a', 'b']) {
              const input = el('input'); input.type = 'number'; input.min = '0'; input.max = '999'; input.name = `satz${index}${key}`; input.value = spiel.saetze?.[index]?.[key] ?? '';
              input.setAttribute('aria-label', `${titel}, ${spiel.id}, Satz ${index + 1}, ${names.get(spiel[key])}`); row.append(input);
            }
            ergebnisForm.append(row);
          }
        } else {
          for (const key of ['a', 'b']) {
            const input = el('input'); input.type = 'number'; input.min = '0'; input.max = '3'; input.required = true; input.name = `punkte${key.toUpperCase()}`; input.value = spiel[`punkte${key.toUpperCase()}`] ?? '';
            input.setAttribute('aria-label', `Spielergebnis ${names.get(spiel[key])}`); ergebnisForm.append(input);
          }
        }
        const save = el('button', 'Speichern', 'small'); save.type = 'submit'; ergebnisForm.append(save);
        ergebnisForm.addEventListener('submit', event => {
          event.preventDefault();
          if (!state.satzweise) {
            const a = Number(ergebnisForm.elements.punkteA.value), b = Number(ergebnisForm.elements.punkteB.value);
            if (!gueltigesErgebnis(a, b)) { meldung('Das Spielergebnis muss 3:0, 3:1, 3:2 oder umgekehrt lauten.'); return; }
            speichern(turnier, spiel, { punkteA: a, punkteB: b }); return;
          }
          const saetze = []; let luecke = false;
          for (let index = 0; index < 5; index++) {
            const a = ergebnisForm.elements[`satz${index}a`].value, b = ergebnisForm.elements[`satz${index}b`].value;
            if (a === '' && b === '') { luecke = true; continue; }
            if (luecke || a === '' || b === '') { meldung('Bitte beide Satzpunkte ohne Lücken eingeben.'); return; }
            saetze.push({ a: Number(a), b: Number(b) });
          }
          if (!saetze.length) { meldung('Bitte das Satzergebnis eingeben.'); return; }
          speichern(turnier, spiel, { saetze });
        });
        if (spiel.status === 'fertig') {
          card.append(el('p', `Sätze ${spiel.punkteA}:${spiel.punkteB} · Sieger: ${names.get(spiel.sieger)}`, 'erfolg'));
          const reset = el('button', 'Zurücksetzen', 'secondary small'); reset.type = 'button'; reset.addEventListener('click', () => speichern(turnier, spiel, { saetze: [] })); ergebnisForm.append(reset);
        }
        card.append(ergebnisForm);
      }
      spiele.append(card);
    }
    section.append(spiele);
    runden.append(section);
  }
  details.append(runden);
};

const render = () => {
  auswahl.replaceChildren();
  for (const turnier of state.turniere) {
    const option = el('option', `${turnier.titel} · ${modusName(turnier.modus)}`); option.value = turnier.id; auswahl.append(option);
  }
  if (!state.turniere.some(turnier => turnier.id === state.ausgewaehlt)) state.ausgewaehlt = state.turniere[0]?.id ?? null;
  auswahl.value = state.ausgewaehlt ?? '';
  renderDetails();
};

const load = async () => {
  if (state.busy) return;
  setBusy(true); meldung('');
  try { const result = await request(); state.turniere = result.turniere; render(); }
  catch (error) { meldung(error.message); }
  finally { setBusy(false); }
};

const turnierAnlegen = async ({ titel, modus, teilnehmer }) => {
  setBusy(true); meldung('');
  try {
    const result = await request('anlegen', {
      method: 'POST',
      body: JSON.stringify({ titel, modus, teilnehmer, anzahlTische: null }),
    });
    state.turniere.unshift(result.turnier);
    state.ausgewaehlt = result.turnier.id;
    render();
    form.reset();
    paare.replaceChildren();
    for (let index = 0; index < 8; index++) addPaar();
    $('anlegenPanel').open = false;
    meldung('Turnier angelegt.', 'erfolg');
  } catch (error) { meldung(error.message); }
  finally { setBusy(false); }
};

form.addEventListener('submit', async event => {
  event.preventDefault();
  const doppelte = new Set(), teilnehmer = [];
  for (const paar of paare.children) {
    const spieler = [];
    for (const input of paar.querySelectorAll('input')) {
      const name = input.value.trim().replace(/\s+/g, ' '), key = name.toLocaleLowerCase('de');
      if (!name) { meldung('Bitte für jeden Spieler einen Namen angeben.'); return; }
      if (doppelte.has(key)) { meldung('Ein Spieler darf nur in einem Doppelpaar vorkommen. Gleichnamige Personen bitte unterscheidbar benennen.'); return; }
      doppelte.add(key); spieler.push({ name });
    }
    teilnehmer.push({ spieler });
  }
  await turnierAnlegen({ titel: form.elements.titel.value.trim(), modus: form.elements.modus.value, teilnehmer });
});

$('fantasiePaar').addEventListener('click', () => {
  const vornamen = ['Alva', 'Borin', 'Cira', 'Darian', 'Elva', 'Falk', 'Gilda', 'Hanno', 'Ilva', 'Jorin', 'Kora', 'Lian', 'Mira', 'Nero', 'Orla', 'Piran'];
  const nachnamen = ['Falkenwind', 'Sternenflug', 'Mondtal', 'Silberblatt', 'Drachenfels', 'Wolkenlauf', 'Feuerhain', 'Nebelbach'];
  const verwendet = new Set([...paare.querySelectorAll('input')].map(input => input.value.trim().toLocaleLowerCase('de')).filter(Boolean));
  let ziel = [...paare.children].find(paar => [...paar.querySelectorAll('input')].every(input => !input.value.trim()));
  if (!ziel && paare.children.length < 32) { addPaar(); ziel = paare.lastElementChild; }
  if (!ziel) { meldung('Alle 32 Doppelpaare sind bereits belegt.'); return; }
  const kandidaten = Array.from({ length: vornamen.length * nachnamen.length }, (_, index) =>
    `${vornamen[index % vornamen.length]} ${nachnamen[Math.floor(index / vornamen.length)]}`);
  const freieNamen = kandidaten.filter(name => !verwendet.has(name.toLocaleLowerCase('de'))).slice(0, 2);
  if (freieNamen.length < 2) { meldung('Es sind keine weiteren Fantasienamen verfügbar.'); return; }
  [...ziel.querySelectorAll('input')].forEach((input, index) => { input.value = freieNamen[index]; });
  ziel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  meldung('Fantasiepaar eingefügt.', 'erfolg');
});

$('paarHinzufuegen').addEventListener('click', addPaar);
$('paarEntfernen').addEventListener('click', () => { if (paare.children.length > 5) { paare.lastElementChild.remove(); aktualisiereAnzahl(); } });
$('neuLaden').addEventListener('click', () => { void load(); });
auswahl.addEventListener('change', () => { state.ausgewaehlt = Number(auswahl.value); renderDetails(); });

$('beamerAnsicht').addEventListener('click', () => {
  const url = new URL(location.href); url.searchParams.set('beamer', '1');
  window.open(url, '_blank', 'noopener');
});
$('drucken').addEventListener('click', () => window.print());
$('exportieren').addEventListener('click', () => {
  const turnier = state.turniere.find(item => item.id === state.ausgewaehlt);
  if (!turnier) { meldung('Bitte zuerst ein Turnier auswählen.'); return; }
  const inhalt = JSON.stringify({ format: 'turnierverwaltung-backup', version: 1, turnier }, null, 2);
  const blob = new Blob([inhalt], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${turnier.titel.replace(/[^a-z0-9äöüß_-]+/gi, '-') || 'turnier'}-backup.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  meldung('Turnier exportiert.', 'erfolg');
});
$('importieren').addEventListener('click', () => $('importDatei').click());
$('importDatei').addEventListener('change', async event => {
  const datei = event.target.files[0];
  event.target.value = '';
  if (!datei) return;
  setBusy(true); meldung('');
  try {
    const sicherung = JSON.parse(await datei.text());
    const result = await request('importieren', { method: 'POST', body: JSON.stringify(sicherung) });
    state.turniere.unshift(result.turnier);
    state.ausgewaehlt = result.turnier.id;
    render();
    meldung('Turnier importiert.', 'erfolg');
  } catch (error) { meldung(error instanceof SyntaxError ? 'Die ausgewählte Datei enthält kein gültiges JSON.' : error.message); }
  finally { setBusy(false); }
});

for (let index = 0; index < 8; index++) addPaar();
document.body.classList.toggle('beamer', state.beamer);
if (state.beamer) setInterval(() => { if (!document.hidden) void load(); }, 15000);
void load();
