import { turnierFortschritt, turnierTabelle } from './turnier-domain.js';

const $ = id => document.getElementById(id);
const el = (tag, text, className = '') => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  node.className = className;
  return node;
};

const state = { turniere: [], ausgewaehlt: null, busy: false, beamer: new URLSearchParams(location.search).has('beamer') };
const form = $('turnierForm');
const paare = $('paare');
const details = $('details');
const auswahl = $('turnierAuswahl');
const appDialog = $('appDialog');
const turnierDialog = $('turnierDialog');
let bearbeitetesTurnierId = null;
let dialogResolve;

const dialogBeenden = wert => {
  appDialog.close();
  const resolve = dialogResolve; dialogResolve = null;
  resolve?.(wert);
};

const dialogOeffnen = ({ titel, text, hervorhebung = null, eingabe = null, bestaetigung = 'Bestätigen', gefahr = false }) => new Promise(resolve => {
  dialogResolve = resolve;
  $('dialogTitel').textContent = titel;
  if (hervorhebung === null) $('dialogText').textContent = text;
  else $('dialogText').replaceChildren(document.createTextNode(text), el('strong', hervorhebung));
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
  document.querySelectorAll('button, input, select').forEach(node => { node.disabled = busy || node.dataset.gesperrt === 'true'; });
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
const gewinnsaetze = turnier => turnier.gewinnsaetze ?? 3;
const wertungsName = turnier => `${gewinnsaetze(turnier)} Gewinnsätze (Best of ${gewinnsaetze(turnier) * 2 - 1})`;
const gueltigesErgebnis = (a, b, ziel) => Number.isInteger(a) && Number.isInteger(b)
  && ((a === ziel && b >= 0 && b < ziel) || (b === ziel && a >= 0 && a < ziel));

const aktualisiereAnzahl = () => { $('anzahl').textContent = `${paare.children.length} Doppelpaare · erlaubt: 5 bis 32`; };
const paareNeuNummerieren = container => {
  [...container.children].forEach((feld, index) => {
    const nummer = index + 1; feld.dataset.id = nummer;
    feld.querySelector('legend').textContent = `Paar ${nummer}`;
    [...feld.querySelectorAll('input')].forEach((input, position) => input.setAttribute('aria-label', `Paar ${nummer}, Spieler ${position + 1}`));
    feld.querySelector('.paar-loeschen')?.setAttribute('aria-label', `Paar ${nummer} löschen`);
  });
  container.querySelectorAll('.paar-loeschen').forEach(button => {
    button.dataset.gesperrt = String(container.children.length <= 5);
    button.disabled = container.children.length <= 5;
  });
  if (container === paare) aktualisiereAnzahl();
};
const paarFeldHinzufuegen = (container, spieler = [{ name: '' }, { name: '' }]) => {
  const nummer = container.children.length + 1;
  const feld = el('fieldset', undefined, 'paar'); feld.dataset.id = nummer;
  feld.append(el('legend', `Paar ${nummer}`));
  spieler.forEach((person, index) => {
    const box = el('div', undefined, 'person');
    const input = el('input'); input.value = person.name; input.required = true; input.maxLength = 100;
    input.placeholder = `Name Spieler ${index + 1}`;
    input.setAttribute('aria-label', `Paar ${nummer}, Spieler ${index + 1}`);
    box.append(input); feld.append(box);
  });
  const loeschen = el('button', '🗑', 'paar-loeschen small danger'); loeschen.type = 'button';
  loeschen.setAttribute('aria-label', `Paar ${nummer} löschen`); loeschen.title = 'Paar löschen';
  loeschen.addEventListener('click', () => {
    if (container.children.length <= 5) return;
    feld.remove(); paareNeuNummerieren(container);
  });
  feld.append(loeschen);
  container.append(feld); paareNeuNummerieren(container); return feld;
};
const addPaar = () => {
  if (paare.children.length >= 32) return;
  paarFeldHinzufuegen(paare); aktualisiereAnzahl();
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
  if (turnier.modus === 'ko' && turnier.koSchema === 'kompakt') {
    let paare = turnier.teilnehmer.length;
    for (let r = 0; r < index; r++) paare = Math.ceil(paare / 2);
    return paare <= 2 ? 'Finale' : paare <= 4 ? 'Halbfinale' : paare <= 8 ? 'Viertelfinale' : paare <= 16 ? 'Achtelfinale' : 'Sechzehntelfinale';
  }
  const rest = turnier.runden.length - index;
  return turnier.modus === 'ko'
    ? (rest === 1 ? 'Finale' : rest === 2 ? 'Halbfinale' : rest === 3 ? 'Viertelfinale' : `Runde ${index + 1}`)
    : `Runde ${index + 1}`;
};

const tischText = (turnier, termin, anzahlSpiele) => {
  if (!turnier.anzahlTische) return 'Tisch noch offen';
  const tisch = termin % turnier.anzahlTische + 1;
  if (anzahlSpiele <= turnier.anzahlTische) return `Tisch ${tisch}`;
  return `Spielblock ${Math.floor(termin / turnier.anzahlTische) + 1} · Tisch ${tisch}`;
};

const renderBeamer = turnier => {
  const names = new Map(turnier.teilnehmer.map(item => [item.id, item.name]));
  const fortschritt = turnierFortschritt(turnier);
  const aktuell = aktuelleRundeIndex(turnier);
  details.className = 'panel beamer-panel';
  details.append(el('h2', turnier.titel), el('p', `${modusName(turnier.modus)} · ${wertungsName(turnier)} · ${fortschritt.fertig} von ${fortschritt.gesamt} Spielen abgeschlossen`, 'muted'));
  if (turnier.modus === 'jeder-gegen-jeden') details.append(el('h3', 'Tabelle'), renderTabelle(turnier));
  for (const index of [aktuell, aktuell + 1]) {
    const runde = turnier.runden[index];
    if (!runde) continue;
    details.append(el('h3', `${index === aktuell ? 'Aktuell' : 'Danach'}: ${rundenTitel(turnier, index)}`));
    const grid = el('div', undefined, 'beamer-spiele');
    let termin = 0;
    const anzahlSpiele = runde.filter(spiel => spiel.status !== 'freilos').length;
    for (const spiel of runde) {
      const spielTermin = spiel.status === 'freilos' ? null : termin++;
      const card = el('article', undefined, 'spiel');
      card.append(el('p', `${names.get(spiel.a) ?? 'Sieger der Vorrunde'} – ${names.get(spiel.b) ?? (spiel.status === 'freilos' ? 'Freilos' : 'Sieger der Vorrunde')}`, 'paarung'));
      if (spiel.status === 'fertig') card.append(el('p', `Ergebnis ${spiel.punkteA}:${spiel.punkteB}`, 'erfolg'));
      else if (spiel.status === 'freilos') card.append(el('p', 'Automatisch weiter', 'muted'));
      else if (spiel.status === 'wartet') card.append(el('p', 'Vorherige Spiele noch offen', 'muted'));
      else {
        card.append(el('p', tischText(turnier, spielTermin, anzahlSpiele), 'muted'));
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
  kopf.append(el('h2', turnier.titel));
  details.append(kopf, el('p', `${modusName(turnier.modus)} · ${wertungsName(turnier)} · ${turnier.teilnehmer.length} Doppelpaare · ${fortschritt.fertig} von ${fortschritt.gesamt} Spielen abgeschlossen`, 'muted'));

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
    const anzahlSpiele = runde.filter(spiel => spiel.status !== 'freilos').length;
    for (const spiel of runde) {
      const card = el('article', undefined, 'spiel');
      card.append(el('p', `${names.get(spiel.a) ?? 'Sieger der Vorrunde'} – ${names.get(spiel.b) ?? (spiel.status === 'freilos' ? 'Freilos' : 'Sieger der Vorrunde')}`, 'paarung'));
      if (spiel.status !== 'freilos') {
        card.append(el('p', tischText(turnier, termin, anzahlSpiele), 'muted'));
        termin++;
      }
      if (['freilos', 'wartet'].includes(spiel.status)) {
        card.append(el('p', spiel.status === 'freilos' ? 'Automatisch weiter' : 'Vorherige Spiele sind noch offen', 'muted'));
      } else {
        const ergebnisForm = el('form', undefined, 'ergebnis');
        if (turnier.satzweise) {
          for (let index = 0; index < gewinnsaetze(turnier) * 2 - 1; index++) {
            const row = el('div', undefined, 'satz'); row.append(el('span', `Satz ${index + 1}`));
            for (const key of ['a', 'b']) {
              const input = el('input'); input.type = 'number'; input.min = '0'; input.max = '999'; input.name = `satz${index}${key}`; input.value = spiel.saetze?.[index]?.[key] ?? '';
              input.setAttribute('aria-label', `${titel}, ${spiel.id}, Satz ${index + 1}, ${names.get(spiel[key])}`); row.append(input);
            }
            ergebnisForm.append(row);
          }
        } else {
          for (const key of ['a', 'b']) {
            const input = el('input'); input.type = 'number'; input.min = '0'; input.max = String(gewinnsaetze(turnier)); input.name = `punkte${key.toUpperCase()}`; input.value = spiel[`punkte${key.toUpperCase()}`] ?? '';
            input.setAttribute('aria-label', `Spielergebnis ${names.get(spiel[key])}`); ergebnisForm.append(input);
          }
        }
        const save = el('button', 'Speichern', 'small'); save.type = 'submit'; ergebnisForm.append(save);
        ergebnisForm.addEventListener('submit', async event => {
          event.preventDefault();
          if (!turnier.satzweise) {
            const wertA = ergebnisForm.elements.punkteA.value, wertB = ergebnisForm.elements.punkteB.value;
            if (wertA === '' && wertB === '') {
              if (spiel.status !== 'fertig') { meldung('Bitte ein Spielergebnis eingeben.'); return; }
              if (!await dialogOeffnen({ titel: 'Ergebnis löschen?', text: 'Das gespeicherte Ergebnis wird entfernt.', bestaetigung: 'Ergebnis löschen', gefahr: true })) return;
              void mutation(`ergebnis&turnier=${turnier.id}&spiel=${encodeURIComponent(spiel.id)}`, { version: turnier.version, saetze: [] }, 'Ergebnis gelöscht.');
              return;
            }
            if (wertA === '' || wertB === '') { meldung('Bitte beide Ergebnisfelder ausfüllen.'); return; }
            const a = Number(wertA), b = Number(wertB);
            if (!gueltigesErgebnis(a, b, gewinnsaetze(turnier))) { meldung(`Ein Spielergebnis endet bei ${gewinnsaetze(turnier)} Gewinnsätzen.`); return; }
            speichern(turnier, spiel, { punkteA: a, punkteB: b }); return;
          }
          const saetze = []; let luecke = false;
          for (let index = 0; index < gewinnsaetze(turnier) * 2 - 1; index++) {
            const a = ergebnisForm.elements[`satz${index}a`].value, b = ergebnisForm.elements[`satz${index}b`].value;
            if (a === '' && b === '') { luecke = true; continue; }
            if (luecke || a === '' || b === '') { meldung('Bitte beide Satzpunkte ohne Lücken eingeben.'); return; }
            saetze.push({ a: Number(a), b: Number(b) });
          }
          if (!saetze.length) {
            if (spiel.status !== 'fertig') { meldung('Bitte das Satzergebnis eingeben.'); return; }
            if (!await dialogOeffnen({ titel: 'Ergebnis löschen?', text: 'Das gespeicherte Ergebnis wird entfernt.', bestaetigung: 'Ergebnis löschen', gefahr: true })) return;
            void mutation(`ergebnis&turnier=${turnier.id}&spiel=${encodeURIComponent(spiel.id)}`, { version: turnier.version, saetze: [] }, 'Ergebnis gelöscht.');
            return;
          }
          speichern(turnier, spiel, { saetze });
        });
        let ergebnisInfo;
        if (spiel.status === 'fertig') {
          ergebnisInfo = el('p', `Sätze ${spiel.punkteA}:${spiel.punkteB} · Sieger: ${names.get(spiel.sieger)}`, 'erfolg ergebnis-info');
        }
        card.append(ergebnisForm);
        if (ergebnisInfo) card.append(ergebnisInfo);
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
  $('turnierBearbeiten').dataset.gesperrt = String(state.ausgewaehlt === null);
  $('turnierBearbeiten').disabled = state.ausgewaehlt === null;
  $('turnierLoeschen').dataset.gesperrt = String(state.ausgewaehlt === null);
  $('turnierLoeschen').disabled = state.ausgewaehlt === null;
  renderDetails();
};

const load = async () => {
  if (state.busy) return;
  setBusy(true); meldung('');
  try { const result = await request(); state.turniere = result.turniere; render(); }
  catch (error) { meldung(error.message); }
  finally { setBusy(false); }
};

const turnierFormZuruecksetzen = () => {
  bearbeitetesTurnierId = null;
  form.reset();
  delete form.elements.modus.dataset.gesperrt;
  delete form.elements.gewinnsaetze.dataset.gesperrt;
  form.elements.modus.disabled = false;
  form.elements.gewinnsaetze.disabled = false;
  $('paarHinzufuegen').hidden = false;
  $('fantasiePaar').hidden = false;
  $('turnierFormTitel').textContent = 'Neues Turnier anlegen';
  $('turnierSpeichern').textContent = 'Turnier anlegen';
  paare.replaceChildren();
  for (let index = 0; index < 8; index++) addPaar();
};

const turnierFormOeffnen = turnier => {
  bearbeitetesTurnierId = turnier.id;
  form.elements.titel.value = turnier.titel;
  form.elements.modus.value = turnier.modus;
  form.elements.gewinnsaetze.value = String(gewinnsaetze(turnier));
  form.elements.satzweise.value = turnier.satzweise ? '1' : '0';
  form.elements.anzahlTische.value = turnier.anzahlTische ?? '';
  paare.replaceChildren();
  turnier.teilnehmer.forEach(teilnehmer => paarFeldHinzufuegen(paare, teilnehmer.spieler));
  aktualisiereAnzahl();
  const begonnen = turnier.runden.flat().some(spiel => spiel.punkteA !== null || spiel.punkteB !== null);
  form.elements.modus.disabled = begonnen;
  form.elements.gewinnsaetze.disabled = begonnen;
  form.elements.modus.dataset.gesperrt = String(begonnen);
  form.elements.gewinnsaetze.dataset.gesperrt = String(begonnen);
  $('paarHinzufuegen').hidden = begonnen;
  $('fantasiePaar').hidden = begonnen;
  paare.querySelectorAll('.paar-loeschen').forEach(button => { button.hidden = begonnen; });
  $('turnierFormTitel').textContent = 'Turnier bearbeiten';
  $('turnierSpeichern').textContent = 'Änderungen speichern';
  turnierDialog.showModal();
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
  const bestehend = state.turniere.find(turnier => turnier.id === bearbeitetesTurnierId);
  const payload = {
    titel: form.elements.titel.value.trim(),
    modus: form.elements.modus.value,
    gewinnsaetze: Number(form.elements.gewinnsaetze.value),
    satzweise: form.elements.satzweise.value === '1',
    anzahlTische: form.elements.anzahlTische.value ? Number(form.elements.anzahlTische.value) : null,
    teilnehmer,
    ...(bestehend ? { version: bestehend.version } : {}),
  };
  setBusy(true); meldung('');
  try {
    const result = await request(bestehend ? `turnier&turnier=${bestehend.id}` : 'anlegen', {
      method: bestehend ? 'PUT' : 'POST', body: JSON.stringify(payload),
    });
    if (bestehend) state.turniere = state.turniere.map(turnier => turnier.id === result.turnier.id ? result.turnier : turnier);
    else state.turniere.unshift(result.turnier);
    state.ausgewaehlt = result.turnier.id;
    turnierDialog.close();
    turnierFormZuruecksetzen();
    render(); meldung(bestehend ? 'Turnier geändert.' : 'Turnier angelegt.', 'erfolg');
  } catch (error) { meldung(error.message); }
  finally { setBusy(false); }
});

$('neuesTurnier').addEventListener('click', () => { turnierFormZuruecksetzen(); turnierDialog.showModal(); });
$('turnierBearbeiten').addEventListener('click', () => {
  const turnier = state.turniere.find(item => item.id === state.ausgewaehlt);
  if (turnier) turnierFormOeffnen(turnier);
});
$('turnierLoeschen').addEventListener('click', async () => {
  const turnier = state.turniere.find(item => item.id === state.ausgewaehlt);
  if (!turnier) return;
  if (!await dialogOeffnen({
    titel: 'Turnier löschen?',
    text: 'Turnier und alle Ergebnisse endgültig löschen: ',
    hervorhebung: `„${turnier.titel}“`,
    bestaetigung: 'Endgültig löschen',
    gefahr: true,
  })) return;
  setBusy(true); meldung('');
  try {
    await request(`loeschen&turnier=${turnier.id}`, { method: 'DELETE', body: JSON.stringify({ version: turnier.version }) });
    state.turniere = state.turniere.filter(item => item.id !== turnier.id);
    state.ausgewaehlt = state.turniere[0]?.id ?? null;
    render(); meldung('Turnier gelöscht.', 'erfolg');
  } catch (error) { meldung(error.message); }
  finally { setBusy(false); }
});
$('turnierAbbrechen').addEventListener('click', () => { turnierDialog.close(); turnierFormZuruecksetzen(); });
turnierDialog.addEventListener('cancel', () => turnierFormZuruecksetzen());

$('fantasiePaar').addEventListener('click', () => {
  const kandidaten = ['Anna', 'Ben', 'Clara', 'David', 'Eva', 'Felix', 'Greta', 'Hannes', 'Ida', 'Jonas', 'Klara', 'Lukas', 'Mara', 'Noah', 'Olivia', 'Paul', 'Amelie', 'Bruno', 'Carlotta', 'Daniel', 'Elena', 'Finn', 'Hanna', 'Jakob', 'Lea', 'Max', 'Nina', 'Oskar', 'Pia', 'Rafael', 'Sarah', 'Theo', 'Ulla', 'Viktor', 'Wilma', 'Yannik', 'Zoe', 'Alina', 'Bastian', 'Celine', 'Dominik', 'Elisa', 'Fabian', 'Gisela', 'Henrik', 'Ines', 'Julian', 'Katharina', 'Leon', 'Miriam', 'Niklas', 'Ophelia', 'Philipp', 'Ronja', 'Sebastian', 'Tabea', 'Ulrich', 'Valerie', 'Werner', 'Xenia', 'Yara', 'Zora', 'Moritz', 'Sophie'];
  const verwendet = new Set([...paare.querySelectorAll('input')].map(input => input.value.trim().toLocaleLowerCase('de')).filter(Boolean));
  let ziel = [...paare.children].find(paar => [...paar.querySelectorAll('input')].every(input => !input.value.trim()));
  if (!ziel && paare.children.length < 32) { addPaar(); ziel = paare.lastElementChild; }
  if (!ziel) { meldung('Alle 32 Doppelpaare sind bereits belegt.'); return; }
  const freieNamen = kandidaten.filter(name => !verwendet.has(name.toLocaleLowerCase('de'))).slice(0, 2);
  if (freieNamen.length < 2) { meldung('Es sind keine weiteren Fantasienamen verfügbar.'); return; }
  [...ziel.querySelectorAll('input')].forEach((input, index) => { input.value = freieNamen[index]; });
  ziel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  meldung('Fantasiepaar eingefügt.', 'erfolg');
});

$('paarHinzufuegen').addEventListener('click', addPaar);
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

turnierFormZuruecksetzen();
document.body.classList.toggle('beamer', state.beamer);
if (state.beamer) setInterval(() => { if (!document.hidden) void load(); }, 15000);
void load();
