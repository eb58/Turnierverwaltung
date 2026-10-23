import { turnierFortschritt, turnierPlatzierungen, turnierTabelle } from './turnier-domain.js?v=7';
import { istSchach, schachErgebnisText, schachPunkte, schachKreuztabelle } from './schach-domain.js?v=6';
import { renderSchachSpieltag, renderSchachHistorie } from './schach-spieltag.js?v=15';

const $ = id => document.getElementById(id);
const el = (tag, text, className = '') => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  node.className = className;
  return node;
};

const parameter = new URLSearchParams(location.search);
const einzelAnsicht = parameter.has('turnier');
const festesTurnierId = Number(parameter.get('turnier'));
document.body.classList.toggle('einzelansicht', einzelAnsicht);
const NAVIGATION_KLEIN_KEY = 'turnierverwaltung:navigation-klein';
const navigationVerkleinern = (klein, merken = true) => {
  document.body.classList.toggle('navigation-klein', klein);
  const text = klein ? 'Navigation vergrößern' : 'Navigation verkleinern';
  $('navigationUmschalten').setAttribute('aria-expanded', String(!klein));
  $('navigationUmschalten').setAttribute('aria-label', text);
  $('navigationUmschalten').title = text;
  if (merken) try { localStorage.setItem(NAVIGATION_KLEIN_KEY, klein ? '1' : '0'); } catch {}
};
const menueOeffnen = offen => {
  document.body.classList.toggle('menue-offen', offen);
  $('menueUmschalten').setAttribute('aria-expanded', String(offen));
  $('menueUmschalten').setAttribute('aria-label', offen ? 'Menü schließen' : 'Menü öffnen');
};
let navigationKleinGemerkt = false;
try { navigationKleinGemerkt = localStorage.getItem(NAVIGATION_KLEIN_KEY) === '1'; } catch {}
navigationVerkleinern(navigationKleinGemerkt, false);
$('navigationUmschalten').addEventListener('click', () => navigationVerkleinern(!document.body.classList.contains('navigation-klein')));
$('menueUmschalten').addEventListener('click', () => menueOeffnen(!document.body.classList.contains('menue-offen')));
$('navigationInhalt').addEventListener('click', event => { if (event.target.closest('button')) menueOeffnen(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('menue-offen')) menueOeffnen(false); });
document.addEventListener('click', event => { if (!event.target.closest('.seitenleiste')) menueOeffnen(false); });
const state = { turniere: [], ausgewaehlt: Number(parameter.get('turnier')) || null, busy: false, beamer: parameter.has('beamer'), leitung: { eingerichtet: false, angemeldet: false, superadmin: false, turniere: [], csrf: '' }, verlauf: [] };
const istSuperadmin = () => state.leitung.superadmin && !state.beamer;
// Turnierleitungen dürfen nur ihr eigenes Turnier bearbeiten, die Gesamtverwaltung alle.
const darfBearbeiten = () => !state.beamer && (state.leitung.superadmin || state.leitung.turniere.includes(state.ausgewaehlt));
const form = $('turnierForm');
const paare = $('paare');
const details = $('details');
const auswahl = $('turnierAuswahl');
const appDialog = $('appDialog');
const turnierDialog = $('turnierDialog');
let bearbeitetesTurnierId = null;
let turnierFormAusgangsstand = '';
const turnierFormStand = () => JSON.stringify([...form.querySelectorAll('input, select')].map(feld => [feld.name, feld.value]));
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

const zugangAktualisieren = () => {
  document.body.classList.toggle('zuschauer', !darfBearbeiten());
  // Ohne Turnier-Link und ohne Anmeldung gibt es nichts zu sehen außer dem Anmelden-Button.
  document.body.classList.toggle('nur-anmeldung', !einzelAnsicht && !state.leitung.angemeldet);
  document.body.classList.toggle('kein-superadmin', !istSuperadmin());
  for (const id of ['drucken', 'exportieren']) {
    $(id).dataset.gesperrt = String(!darfBearbeiten());
    $(id).disabled = state.busy || !darfBearbeiten();
  }
  $('leitungsStatus').textContent = istSuperadmin() ? 'Als Gesamtverwaltung angemeldet' : darfBearbeiten() ? 'Als Turnierleitung angemeldet'
    : state.leitung.angemeldet ? 'Für dieses Turnier nur Zuschaueransicht' : 'Zuschaueransicht';
  $('leitungAnmelden').hidden = darfBearbeiten();
  $('leitungAbmelden').hidden = !state.leitung.angemeldet;
  $('leitungAnmelden').dataset.gesperrt = String(!state.leitung.eingerichtet);
  $('leitungAnmelden').disabled = state.busy || !state.leitung.eingerichtet;
  $('leitungAnmelden').title = state.leitung.eingerichtet ? 'Anmelden' : 'Die Anmeldung ist noch nicht freigeschaltet.';
};

const request = async (action = '', options = {}) => {
  const query = action ? `?action=${action}` : einzelAnsicht ? `?turnier=${encodeURIComponent(festesTurnierId)}` : '';
  const response = await fetch(`api.php${query}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.leitung.csrf, ...options.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && action !== 'anmelden') {
      Object.assign(state.leitung, { angemeldet: false, superadmin: false, turniere: [] });
      turnierDialog.close(); $('verlaufDialog').close(); $('pinDialog').close(); $('turnierPinDialog').close();
      render();
      meldung(payload.error || 'Bitte erneut anmelden.');
    }
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
};

const modusName = modus => modus === 'ko' ? 'K.-o.-System' : 'Jeder gegen jeden';
const sportartName = turnier => istSchach(turnier) ? 'Schach' : 'Tischtennis-Doppel';
// Absolute Asset-URLs funktionieren auch im separat geöffneten Urkundenfenster.
const sportartMotivUrl = turnier => new URL(istSchach(turnier) ? 'assets/schach.svg' : 'assets/tischtennis.svg', import.meta.url).href;
const renderTurnierTitel = turnier => {
  const titel = el('div', undefined, 'turnier-titel');
  const motiv = el('img', undefined, 'sportart-motiv');
  motiv.src = sportartMotivUrl(turnier); motiv.alt = ''; motiv.width = 96; motiv.height = 72;
  titel.append(motiv, el('h2', turnier.titel));
  return titel;
};
const gewinnsaetze = turnier => turnier.gewinnsaetze ?? 3;
const wertungsName = turnier => istSchach(turnier) ? `${turnier.durchgaenge === 2 ? 'Hin- und Rückspiel' : 'Eine Partie pro Paarung'} · Sieg 1 · Remis ½ · Niederlage 0` : `${gewinnsaetze(turnier)} Gewinnsätze (Best of ${gewinnsaetze(turnier) * 2 - 1})`;
const gueltigesErgebnis = (a, b, ziel) => Number.isInteger(a) && Number.isInteger(b)
  && ((a === ziel && b >= 0 && b < ziel) || (b === ziel && a >= 0 && a < ziel));

const turnierIstAbgeschlossen = turnier => {
  const fortschritt = turnierFortschritt(turnier);
  return fortschritt.gesamt > 0 && fortschritt.fertig === fortschritt.gesamt;
};

const htmlSicher = wert => String(wert).replace(/[&<>"']/g, zeichen => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[zeichen]);

const siegerurkundenDrucken = turnier => {
  if (!darfBearbeiten()) return;
  const paare = turnierPlatzierungen(turnier);
  if (!paare.length) { meldung('Urkunden sind nach Abschluss des Turniers verfügbar.'); return; }
  const urkunden = paare.flatMap(paar => paar.spieler.map(spieler => ({
    name: spieler.name,
    partner: paar.spieler.find(person => person !== spieler)?.name ?? '',
    platz: paar.platz,
  })));
  const fenster = window.open('', '_blank');
  if (!fenster) { meldung('Das Urkundenfenster wurde vom Browser blockiert. Bitte Pop-ups für diese Seite erlauben.'); return; }
  const datum = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date());
  const logo = new URL('assets/reinickendorf-wappen.svg', import.meta.url).href;
  const seiten = urkunden.map(urkunde => `
    <main class="urkunde">
      <div class="rahmen">
        <img class="sportart-motiv" src="${htmlSicher(sportartMotivUrl(turnier))}" alt="">
        <img src="${htmlSicher(logo)}" alt="Bezirkssymbol Reinickendorf">
        <p class="verein">${istSchach(turnier) ? 'Schachturnier' : 'Tischtennis-Doppelturnier'}</p>
        <h1>${urkunde.platz === 1 ? 'Siegerurkunde' : 'Urkunde'}</h1>
        <p class="einleitung">Diese Urkunde wird verliehen an</p>
        <p class="name">${htmlSicher(urkunde.name)}</p>
        <p class="leistung">für den <strong>${urkunde.platz}. Platz</strong> beim</p>
        <h2>${htmlSicher(turnier.titel)}</h2>
        ${istSchach(turnier) ? '' : `<p class="doppel">im Doppel mit ${htmlSicher(urkunde.partner)}</p>`}
        <div class="abschluss"><span>${htmlSicher(datum)}</span><span>Turnierleitung</span></div>
      </div>
    </main>`).join('');
  fenster.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Urkunden – ${htmlSicher(turnier.titel)}</title>
    <style>
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #173f3a; background: #e8efed; font-family: Georgia, "Times New Roman", serif; }
      .aktionen { position: fixed; z-index: 2; top: 1rem; right: 1rem; }
      button { padding: .7rem 1rem; color: white; background: #0f766e; border: 0; border-radius: 8px; font: 700 1rem "Segoe UI", sans-serif; cursor: pointer; }
      .urkunde { width: 297mm; height: 210mm; padding: 13mm; margin: 0 auto 1rem; background: white; break-after: page; page-break-after: always; }
      .urkunde:last-child { break-after: auto; page-break-after: auto; }
      .rahmen { position: relative; display: flex; height: 100%; padding: 12mm 18mm; align-items: center; flex-direction: column; text-align: center; border: 2.5mm double #0f766e; }
      .rahmen::before, .rahmen::after { content: ""; position: absolute; width: 24mm; height: 24mm; border-color: #d5a62e; }
      .rahmen::before { top: 5mm; left: 5mm; border-top: 1mm solid #d5a62e; border-left: 1mm solid #d5a62e; }
      .rahmen::after { right: 5mm; bottom: 5mm; border-right: 1mm solid #d5a62e; border-bottom: 1mm solid #d5a62e; }
      .sportart-motiv { position: absolute; top: 11mm; right: 12mm; width: 30mm; height: 22.5mm; }
      img { width: 24mm; height: 29mm; object-fit: contain; }
      p { margin: 0; }
      .verein { margin-top: 2mm; color: #526b67; font: 600 11pt "Segoe UI", sans-serif; letter-spacing: .12em; text-transform: uppercase; }
      h1 { margin: 3mm 0 2mm; color: #0f766e; font-size: 31pt; letter-spacing: .05em; }
      .einleitung, .leistung, .doppel { font-size: 14pt; }
      .name { margin: 5mm 0; color: #173f3a; font-size: 29pt; font-weight: 700; border-bottom: .5mm solid #d5a62e; }
      h2 { max-width: 220mm; margin: 3mm 0; color: #173f3a; font-size: 21pt; }
      .doppel { color: #526b67; }
      .abschluss { display: flex; width: 72%; margin-top: auto; justify-content: space-between; gap: 25mm; font: 11pt "Segoe UI", sans-serif; }
      .abschluss span { width: 65mm; padding-top: 2mm; border-top: .35mm solid #526b67; }
      @media print { body { background: white; } .aktionen { display: none; } .urkunde { margin: 0; } }
    </style></head><body><div class="aktionen"><button onclick="window.print()">Urkunden drucken</button></div>${seiten}</body></html>`);
  fenster.document.close();
  fenster.focus();
};

const formularIstSchach = () => form.elements.sportart.value === 'schach';
const teilnehmerMinimum = () => formularIstSchach() ? 2 : 5;
const aktualisiereAnzahl = () => { $('anzahl').textContent = `${paare.children.length} ${formularIstSchach() ? 'Spieler' : 'Doppelpaare'} · erlaubt: ${teilnehmerMinimum()} bis 32`; };
const turnierFormAnpassen = () => {
  const schach = formularIstSchach(), begonnen = form.dataset.begonnen === 'true';
  form.dataset.sportart = form.elements.sportart.value;
  if (schach) form.elements.modus.value = 'jeder-gegen-jeden';
  for (const [name, gesperrt] of [['sportart', begonnen], ['modus', begonnen || schach], ['durchgaenge', begonnen || !schach], ['gewinnsaetze', begonnen || schach], ['satzweise', schach]]) {
    form.elements[name].dataset.gesperrt = String(gesperrt);
    form.elements[name].disabled = state.busy || gesperrt;
  }
  $('spielwertungFeld').hidden = schach;
  $('erfassungsartFeld').hidden = schach;
  $('schachHinweis').hidden = !schach;
  $('schachDurchgaengeFeld').hidden = !schach;
  $('tischanzahlLabel').textContent = schach ? 'Verfügbare Bretter (optional)' : 'Verfügbare Tische (optional)';
  $('teilnehmerHinweis').textContent = schach ? 'Für jeden Spieler einen Namen eingeben. Möglich sind 2 bis 32 Spieler.' : 'Je Doppelpaar die Namen der beiden Spieler eingeben. Möglich sind 5 bis 32 Doppelpaare.';
  $('paarHinzufuegen').textContent = schach ? 'Spieler hinzufügen' : 'Paar hinzufügen';
  $('fantasiePaar').textContent = schach ? 'Fantasiespieler einfügen' : 'Fantasiepaar einfügen';
  aktualisiereAnzahl();
};
const paareNeuNummerieren = container => {
  const schach = formularIstSchach();
  [...container.children].forEach((feld, index) => {
    const nummer = index + 1; feld.dataset.id = nummer;
    feld.querySelector('legend').textContent = `${schach ? 'Spieler' : 'Paar'} ${nummer}`;
    [...feld.querySelectorAll('input')].forEach((input, position) => input.setAttribute('aria-label', schach ? `Spieler ${nummer}` : `Paar ${nummer}, Spieler ${position + 1}`));
    feld.querySelector('.paar-loeschen')?.setAttribute('aria-label', `${schach ? 'Spieler' : 'Paar'} ${nummer} löschen`);
  });
  container.querySelectorAll('.paar-loeschen').forEach(button => {
    button.dataset.gesperrt = String(container.children.length <= teilnehmerMinimum());
    button.disabled = state.busy || container.children.length <= teilnehmerMinimum();
  });
  if (container === paare) aktualisiereAnzahl();
};
const paarFeldHinzufuegen = (container, spieler = Array.from({ length: formularIstSchach() ? 1 : 2 }, () => ({ name: '' }))) => {
  const nummer = container.children.length + 1;
  const feld = el('fieldset', undefined, 'paar'); feld.dataset.id = nummer;
  feld.append(el('legend', `Paar ${nummer}`));
  const namen = el('div', undefined, 'paar-namen');
  spieler.forEach((person, index) => {
    const box = el('div', undefined, 'person');
    const input = el('input'); input.value = person.name; input.required = true; input.maxLength = 100;
    input.placeholder = formularIstSchach() ? 'Name des Spielers' : `Name Spieler ${index + 1}`;
    input.setAttribute('aria-label', `Paar ${nummer}, Spieler ${index + 1}`);
    box.append(input); namen.append(box);
  });
  const loeschen = el('button', '🗑', 'paar-loeschen small danger'); loeschen.type = 'button';
  loeschen.title = formularIstSchach() ? 'Spieler löschen' : 'Paar löschen';
  loeschen.addEventListener('click', async () => {
    if (container.children.length <= teilnehmerMinimum()) return;
    const namen = [...feld.querySelectorAll('input')].map(input => input.value.trim()).filter(Boolean);
    const bezeichnung = namen.length ? namen.join(' / ') : `${formularIstSchach() ? 'Spieler' : 'Paar'} ${feld.dataset.id}`;
    if (!await dialogOeffnen({
      titel: formularIstSchach() ? 'Spieler entfernen?' : 'Doppelpaar entfernen?',
      text: formularIstSchach() ? 'Diesen Spieler wirklich aus dem Turnier entfernen? ' : 'Dieses Doppelpaar wirklich aus dem Turnier entfernen? ',
      hervorhebung: bezeichnung,
      bestaetigung: formularIstSchach() ? 'Spieler entfernen' : 'Doppelpaar entfernen',
      gefahr: true,
    })) return;
    feld.remove(); paareNeuNummerieren(container);
  });
  feld.append(namen, loeschen);
  container.append(feld); paareNeuNummerieren(container); return feld;
};
const addPaar = () => {
  if (paare.children.length >= 32) return;
  paarFeldHinzufuegen(paare); aktualisiereAnzahl();
};

const aktualisiereFantasiePaarSichtbarkeit = () => {
  const istTestturnier = form.elements.titel.value.trim().toLocaleLowerCase('de').includes('test');
  $('fantasiePaar').hidden = form.dataset.begonnen === 'true' || !istTestturnier;
};

const renderTabelle = turnier => {
  const schach = istSchach(turnier);
  const wrap = el('div', undefined, 'table-wrap'), table = el('table', undefined, 'rangtabelle');
  table.append(el('caption', schach ? 'Rangfolge: Punkte, direkter Vergleich innerhalb der punktgleichen Gruppe (sobald vollständig gespielt), sonst gleicher Rang.' : 'Rangfolge: Siege, Satzdifferenz, direkter Vergleich.'));
  const thead = el('thead'), header = el('tr');
  // Die letzte Spalte ist das Hauptkriterium und wird hervorgehoben.
  const spalten = schach ? ['Rang', 'Spieler', 'Partien', 'Siege', 'Remis', 'Niederlagen', 'Punkte'] : ['Rang', 'Doppelpaar', 'Spiele', 'Siege', 'Niederlagen', 'Sätze', 'Differenz'];
  const klasse = index => index === 0 ? 'rang' : index === 1 ? 'name' : index === spalten.length - 1 ? 'zahl haupt' : 'zahl';
  spalten.forEach((text, index) => {
    const th = el('th', text, klasse(index)); th.scope = 'col'; header.append(th);
  });
  thead.append(header); table.append(thead);
  const tbody = el('tbody');
  for (const zeile of turnierTabelle(turnier)) {
    const row = el('tr', undefined, zeile.rang <= 3 && zeile.spiele > 0 ? `platz-${zeile.rang}` : '');
    const differenz = zeile.fuer - zeile.gegen;
    const werte = schach ? [zeile.rang, zeile.name, zeile.spiele, ...[zeile.siege, zeile.remis, zeile.niederlagen].map(wert => zeile.wertungUnbekannt ? '—' : wert), schachPunkte(zeile.punkte)] : [zeile.rang, zeile.name, zeile.spiele, zeile.siege, zeile.niederlagen, `${zeile.fuer}:${zeile.gegen}`, differenz > 0 ? `+${differenz}` : differenz];
    werte.forEach((text, index) => {
      if (index === 0) { const td = el('td', undefined, 'rang'); td.append(el('span', text, 'rang-marke')); row.append(td); return; }
      row.append(el('td', text, klasse(index)));
    });
    tbody.append(row);
  }
  table.append(tbody); wrap.append(table);
  return wrap;
};

const renderKreuztabelle = turnier => {
  const abschnitt = el('details', undefined, 'kreuztabelle'); abschnitt.open = true;
  abschnitt.append(el('summary', 'Kreuztabelle'));
  const wrap = el('div', undefined, 'table-wrap'), table = el('table');
  table.append(el('caption', 'Zeile gegen Spalte: Punkte gegen den jeweiligen Gegner. Die Spaltennummern entsprechen der Nummer vor dem Namen.'));
  const head = el('thead'), header = el('tr');
  const kopf = (text, className = '', title = '') => { const th = el('th', text, className); th.scope = 'col'; if (title) th.title = title; header.append(th); };
  kopf('Nr.', 'nr'); kopf('Spieler', 'name');
  turnier.teilnehmer.forEach((person, index) => kopf(String(index + 1), 'gegner', person.name));
  kopf('Punkte', 'summe'); kopf('Rang', 'summe');
  head.append(header); table.append(head);
  const tabelle = new Map(turnierTabelle(turnier).map(person => [person.id, person]));
  // Gewonnene, remisierte und verlorene Begegnungen werden farblich unterschieden.
  const wertung = (erzielt, moeglich) => erzielt > moeglich / 2 ? 'sieg' : erzielt < moeglich / 2 ? 'niederlage' : 'remis';
  const tbody = el('tbody');
  schachKreuztabelle(turnier).forEach((zeile, nummer) => {
    const row = el('tr');
    row.append(el('td', String(nummer + 1), 'nr'));
    const name = el('th', zeile.name, 'name'); name.scope = 'row'; row.append(name);
    zeile.felder.forEach((feld, gegner) => {
      if (feld?.gesamt !== undefined) {
        const td = el('td', schachPunkte(feld.gesamt), `ergebnis-feld ${wertung(feld.gesamt, 2)}`);
        td.title = 'Punkte aus Hin- und Rückspiel.';
        td.setAttribute('aria-label', `${zeile.name} gegen ${turnier.teilnehmer[gegner].name}: ${schachPunkte(feld.gesamt)} Punkte aus Hin- und Rückspiel`);
        row.append(td); return;
      }
      const partien = feld === null ? [] : (feld.partien ?? [feld]);
      const offen = partien.some(partie => partie.punkte === null);
      const text = partien.every(partie => partie.punkte === null) ? '' : partien.map(partie => partie.punkte === null ? '·' : schachPunkte(partie.punkte)).join(' / ');
      const summe = partien.reduce((gesamt, partie) => gesamt + (partie.punkte ?? 0), 0);
      const td = el('td', feld === null ? '' : text, feld === null ? 'diagonale' : offen ? 'ergebnis-feld offene-partie' : `ergebnis-feld ${wertung(summe, partien.length)}`);
      td.setAttribute('aria-label', feld === null ? 'Keine Partie gegen sich selbst' : `${zeile.name} gegen ${turnier.teilnehmer[gegner].name}: ${partien.map((partie, index) => `Partie ${index + 1}: ${partie.punkte === null ? 'noch offen' : `${schachPunkte(partie.punkte)} Punkte`}`).join('; ')}`);
      td.title = td.getAttribute('aria-label'); row.append(td);
    });
    const person = tabelle.get(zeile.id);
    row.append(el('td', schachPunkte(person.punkte), 'summe punkte'), el('td', String(person.rang), 'summe'));
    tbody.append(row);
  });
  table.append(tbody); wrap.append(table); abschnitt.append(wrap); return abschnitt;
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
  await mutation(`ergebnis&turnier=${turnier.id}&spiel=${encodeURIComponent(spiel.id)}`, { version: turnier.version, ...body });
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
  const bezeichnung = istSchach(turnier) ? 'Brett' : 'Tisch';
  if (!turnier.anzahlTische) return `${bezeichnung} noch offen`;
  const tisch = termin % turnier.anzahlTische + 1;
  if (anzahlSpiele <= turnier.anzahlTische) return `${bezeichnung} ${tisch}`;
  return `Spielblock ${Math.floor(termin / turnier.anzahlTische) + 1} · ${bezeichnung} ${tisch}`;
};

const paarungsText = (turnier, spiel, names) => istSchach(turnier)
  ? spiel.altErgebnis ? `${names.get(spiel.a)} – ${names.get(spiel.b)} (historische Paarung)` : `${names.get(spiel.a)} – ${names.get(spiel.b)}`
  : `${names.get(spiel.a) ?? 'Sieger der Vorrunde'} – ${names.get(spiel.b) ?? (spiel.status === 'freilos' ? 'Freilos' : 'Sieger der Vorrunde')}`;

const schachErgebnisInfo = (spiel, names) => spiel.altErgebnis ? schachErgebnisText(spiel) : `${schachErgebnisText(spiel)} · ${spiel.sieger === null ? 'Remis' : `Sieger: ${names.get(spiel.sieger)}`}`;

const renderSchachErgebnis = (turnier, spiel, titel, names) => {
  const ergebnisForm = el('form', undefined, 'ergebnis');
  const auswahl = el('select'); auswahl.name = 'ergebnis'; auswahl.required = true;
  auswahl.setAttribute('aria-label', `${titel}: Ergebnis ${names.get(spiel.a)} (Weiß) gegen ${names.get(spiel.b)} (Schwarz)`);
  for (const [wert, text] of [['', 'Ergebnis wählen …'], ['1:0', '1:0 · Weiß gewinnt'], ['0.5:0.5', '½:½ · Remis'], ['0:1', '0:1 · Schwarz gewinnt']]) {
    const option = el('option', text); option.value = wert; auswahl.append(option);
  }
  const gespeichert = spiel.status === 'fertig' ? `${spiel.punkteA}:${spiel.punkteB}` : '';
  auswahl.value = gespeichert;
  ergebnisForm.append(auswahl);
  ergebnisForm.addEventListener('submit', event => event.preventDefault());
  // Speichert direkt bei Auswahl; bei Fehler oder laufender Speicherung zeigt die Auswahl wieder den gespeicherten Stand.
  auswahl.addEventListener('change', async () => {
    if (!auswahl.value) { auswahl.value = gespeichert; return; }
    if (state.busy) { auswahl.value = gespeichert; meldung('Bitte warten, bis das vorige Ergebnis gespeichert ist.'); return; }
    const [punkteA, punkteB] = auswahl.value.split(':').map(Number);
    await speichern(turnier, spiel, { punkteA, punkteB });
    if (auswahl.isConnected) auswahl.value = gespeichert;
  });
  if (spiel.status === 'fertig') {
    const loeschen = el('button', undefined, 'small secondary icon-button'); loeschen.type = 'button';
    loeschen.title = 'Ergebnis löschen'; loeschen.setAttribute('aria-label', `${titel}: Ergebnis ${names.get(spiel.a)} gegen ${names.get(spiel.b)} löschen`);
    loeschen.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"/></svg>';
    loeschen.addEventListener('click', async () => {
      if (!await dialogOeffnen({ titel: 'Ergebnis löschen?', text: 'Das gespeicherte Ergebnis wird entfernt.', bestaetigung: 'Ergebnis löschen', gefahr: true })) return;
      void mutation(`ergebnis&turnier=${turnier.id}&spiel=${encodeURIComponent(spiel.id)}`, { version: turnier.version, punkteA: null, punkteB: null }, 'Ergebnis gelöscht.');
    });
    ergebnisForm.append(loeschen);
  }
  return ergebnisForm;
};

const spieltagAnsicht = (turnier, bearbeiten) => renderSchachSpieltag(turnier, {
  el, bearbeiten, busy: () => state.busy, setBusy, request, meldung, bestaetigen: dialogOeffnen,
  abgeschlossen: turnierIstAbgeschlossen(turnier), sieger: turnierPlatzierungen(turnier).filter(zeile => zeile.platz === 1),
  ergebnisForm: renderSchachErgebnis, paarungsText,
  aktualisieren: geaendert => {
    state.turniere = state.turniere.map(item => item.id === geaendert.id ? geaendert : item);
    render();
  },
});

const renderBeamer = turnier => {
  const names = new Map(turnier.teilnehmer.map(item => [item.id, item.name]));
  const fortschritt = turnierFortschritt(turnier);
  const aktuell = aktuelleRundeIndex(turnier);
  details.className = 'panel beamer-panel';
  details.append(renderTurnierTitel(turnier), el('p', `${sportartName(turnier)} · ${modusName(turnier.modus)} · ${wertungsName(turnier)} · ${fortschritt.fertig} von ${fortschritt.gesamt} ${istSchach(turnier) ? 'Partien' : 'Spielen'} abgeschlossen`, 'muted'));
  if (turnier.modus === 'jeder-gegen-jeden') details.append(el('h3', 'Tabelle'), renderTabelle(turnier));
  if (istSchach(turnier)) {
    const spieltag = spieltagAnsicht(turnier, false);
    if (spieltag) details.append(spieltag);
    return;
  }
  for (const index of [aktuell, aktuell + 1]) {
    const runde = turnier.runden[index];
    if (!runde) continue;
    details.append(el('h3', `${index === aktuell ? 'Aktuell' : 'Danach'}: ${rundenTitel(turnier, index)}`));
    if (turnier.modus === 'jeder-gegen-jeden') {
      const dabei = new Set(runde.flatMap(spiel => [spiel.a, spiel.b]));
      const pause = turnier.teilnehmer.filter(item => !dabei.has(item.id));
      if (pause.length) details.append(el('p', `Pause: ${pause.map(item => item.name).join(', ')}`, 'muted'));
    }
    const grid = el('div', undefined, 'beamer-spiele');
    let termin = 0;
    const anzahlSpiele = runde.filter(spiel => spiel.status !== 'freilos').length;
    for (const spiel of runde) {
      const spielTermin = spiel.status === 'freilos' ? null : termin++;
      const card = el('article', undefined, 'spiel');
      card.append(el('p', paarungsText(turnier, spiel, names), 'paarung'));
      if (spiel.status === 'fertig') card.append(el('p', istSchach(turnier) ? schachErgebnisInfo(spiel, names) : `Ergebnis ${spiel.punkteA}:${spiel.punkteB}`, 'erfolg'));
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
  if (!turnier) { details.append(el('p', einzelAnsicht || state.leitung.angemeldet ? 'Noch kein Turnier angelegt.' : 'Bitte anmelden, um die Turniere zu verwalten.', 'muted')); return; }
  if (state.beamer) { renderBeamer(turnier); return; }
  const names = new Map(turnier.teilnehmer.map(item => [item.id, item.name]));
  const fortschritt = turnierFortschritt(turnier);
  const kopf = el('div', undefined, 'turnier-kopf toolbar');
  kopf.append(renderTurnierTitel(turnier));
  details.append(kopf, el('p', `${sportartName(turnier)} · ${modusName(turnier.modus)} · ${wertungsName(turnier)} · ${turnier.teilnehmer.length} ${istSchach(turnier) ? 'Spieler' : 'Doppelpaare'} · ${fortschritt.fertig} von ${fortschritt.gesamt} ${istSchach(turnier) ? 'Partien' : 'Spielen'} abgeschlossen`, 'muted'));
  // Gemeinsamer Rahmen, damit Spieltage, Tabelle und Kreuztabelle gleich breit sind.
  const tabellen = el('div', undefined, 'tabellen');
  if (istSchach(turnier)) {
    const spieltag = spieltagAnsicht(turnier, darfBearbeiten());
    if (spieltag) (turnier.modus === 'jeder-gegen-jeden' ? tabellen : details).append(spieltag);
  }

  if (turnier.modus === 'jeder-gegen-jeden') {
    tabellen.append(el('h3', 'Tabelle'), renderTabelle(turnier));
    if (istSchach(turnier)) tabellen.append(renderKreuztabelle(turnier));
    details.append(tabellen);
    if (!istSchach(turnier) && fortschritt.fertig === fortschritt.gesamt) details.append(el('p', 'Turnier abgeschlossen.', 'erfolg'));
  } else {
    const finale = turnier.runden.at(-1)[0];
    if (finale.sieger !== null) details.append(el('p', `Turniersieger: ${names.get(finale.sieger)}`, 'erfolg'));
  }

  if (istSchach(turnier)) {
    const historie = renderSchachHistorie(turnier, { el, bearbeiten: darfBearbeiten(), ergebnisForm: renderSchachErgebnis });
    if (historie) (tabellen.isConnected ? tabellen : details).append(historie);
    return;
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
      card.append(el('p', paarungsText(turnier, spiel, names), 'paarung'));
      if (spiel.status !== 'freilos') {
        card.append(el('p', tischText(turnier, termin, anzahlSpiele), 'muted'));
        termin++;
      }
      if (spiel.altErgebnis) {
        card.append(el('p', `${schachErgebnisText(spiel)} · Farben und Reihenfolge unbekannt.`, 'erfolg ergebnis-info'));
      } else if (['freilos', 'wartet'].includes(spiel.status)) {
        card.append(el('p', spiel.status === 'freilos' ? 'Automatisch weiter' : 'Vorherige Spiele sind noch offen', 'muted'));
      } else if (!darfBearbeiten()) {
        card.append(el('p', spiel.status !== 'fertig' ? 'Ergebnis noch offen' : istSchach(turnier) ? schachErgebnisInfo(spiel, names) : `Sätze ${spiel.punkteA}:${spiel.punkteB} · Sieger: ${names.get(spiel.sieger)}`, spiel.status === 'fertig' ? 'erfolg ergebnis-info' : 'muted'));
      } else if (istSchach(turnier)) {
        card.append(renderSchachErgebnis(turnier, spiel, titel, names));
        if (spiel.status === 'fertig') card.append(el('p', schachErgebnisInfo(spiel, names), 'erfolg ergebnis-info'));
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
  zugangAktualisieren();
  auswahl.replaceChildren();
  for (const turnier of state.turniere) {
    const option = el('option', `${turnier.titel} · ${sportartName(turnier)} · ${modusName(turnier.modus)}`); option.value = turnier.id; auswahl.append(option);
  }
  if (!state.turniere.some(turnier => turnier.id === state.ausgewaehlt)) state.ausgewaehlt = state.turniere[0]?.id ?? null;
  auswahl.value = state.ausgewaehlt ?? '';
  $('turnierBearbeiten').dataset.gesperrt = String(state.ausgewaehlt === null);
  $('turnierBearbeiten').disabled = state.ausgewaehlt === null;
  $('turnierLoeschen').dataset.gesperrt = String(state.ausgewaehlt === null);
  $('turnierLink').dataset.gesperrt = String(state.ausgewaehlt === null);
  $('turnierLink').disabled = state.ausgewaehlt === null;
  $('turnierLoeschen').disabled = state.ausgewaehlt === null;
  const aktuellesTurnier = state.turniere.find(turnier => turnier.id === state.ausgewaehlt);
  const urkundenGesperrt = !darfBearbeiten() || !aktuellesTurnier || !turnierIstAbgeschlossen(aktuellesTurnier);
  $('siegerurkunden').dataset.gesperrt = String(urkundenGesperrt);
  $('siegerurkunden').disabled = urkundenGesperrt;
  renderDetails();
};

const load = async () => {
  if (state.busy) return;
  setBusy(true); meldung('');
  try { const result = await request(); state.turniere = result.turniere; state.leitung = result.leitung; render(); }
  catch (error) { meldung(error.message); }
  finally { setBusy(false); }
};

const turnierFormZuruecksetzen = () => {
  bearbeitetesTurnierId = null;
  form.dataset.begonnen = 'false';
  form.reset();
  turnierFormAnpassen();
  $('paarHinzufuegen').hidden = false;
  aktualisiereFantasiePaarSichtbarkeit();
  $('turnierFormTitel').textContent = 'Neues Turnier anlegen';
  $('turnierSpeichern').textContent = 'Turnier anlegen';
  paare.replaceChildren();
  for (let index = 0; index < 8; index++) addPaar();
};

const turnierFormOeffnen = turnier => {
  bearbeitetesTurnierId = turnier.id;
  form.elements.sportart.value = turnier.sportart ?? 'tischtennis';
  form.elements.durchgaenge.value = String(turnier.durchgaenge ?? 1);
  form.elements.titel.value = turnier.titel;
  form.elements.modus.value = turnier.modus;
  form.elements.gewinnsaetze.value = String(gewinnsaetze(turnier));
  form.elements.satzweise.value = turnier.satzweise ? '1' : '0';
  form.elements.anzahlTische.value = turnier.anzahlTische ?? '';
  paare.replaceChildren();
  turnier.teilnehmer.forEach(teilnehmer => paarFeldHinzufuegen(paare, teilnehmer.spieler));
  aktualisiereAnzahl();
  const begonnen = Boolean(turnier.spieltage?.length || turnier.altErgebnisse?.length) || turnier.runden.flat().some(spiel => spiel.punkteA !== null || spiel.punkteB !== null);
  form.dataset.begonnen = String(begonnen);
  turnierFormAnpassen();
  $('paarHinzufuegen').hidden = begonnen;
  aktualisiereFantasiePaarSichtbarkeit();
  paare.querySelectorAll('.paar-loeschen').forEach(button => { button.hidden = begonnen; });
  $('turnierFormTitel').textContent = 'Turnier bearbeiten';
  $('turnierSpeichern').textContent = 'Änderungen speichern';
  turnierFormAusgangsstand = turnierFormStand();
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
      if (doppelte.has(key)) { meldung('Ein Spielername darf im Turnier nur einmal vorkommen. Gleichnamige Personen bitte unterscheidbar benennen.'); return; }
      doppelte.add(key); spieler.push({ name });
    }
    teilnehmer.push({ spieler });
  }
  const bestehend = state.turniere.find(turnier => turnier.id === bearbeitetesTurnierId);
  const payload = {
    titel: form.elements.titel.value.trim(),
    sportart: form.elements.sportart.value,
    modus: form.elements.modus.value,
    ...(formularIstSchach() ? { durchgaenge: Number(form.elements.durchgaenge.value) } : {}),
    ...(!formularIstSchach() ? { gewinnsaetze: Number(form.elements.gewinnsaetze.value), satzweise: form.elements.satzweise.value === '1' } : {}),
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

$('neuesTurnier').addEventListener('click', () => { turnierFormZuruecksetzen(); turnierFormAusgangsstand = turnierFormStand(); turnierDialog.showModal(); });
$('turnierZumMenue').addEventListener('click', async event => {
  event.stopPropagation();
  if (state.busy) return;
  if (turnierFormStand() !== turnierFormAusgangsstand && !await dialogOeffnen({
    titel: 'Eingaben verwerfen?',
    text: 'Die Änderungen am Turnier sind noch nicht gespeichert. Zurück zum Menü gehen und diese Eingaben verwerfen?',
    bestaetigung: 'Verwerfen und zum Menü',
    gefahr: true,
  })) return;
  turnierDialog.close(); turnierFormZuruecksetzen(); menueOeffnen(true);
  $('menueUmschalten').focus();
});
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
  if (!form.elements.titel.value.trim().toLocaleLowerCase('de').includes('test')) return;
  const kandidaten = ['Anna', 'Ben', 'Clara', 'David', 'Eva', 'Felix', 'Greta', 'Hannes', 'Ida', 'Jonas', 'Klara', 'Lukas', 'Mara', 'Noah', 'Olivia', 'Paul', 'Amelie', 'Bruno', 'Carlotta', 'Daniel', 'Elena', 'Finn', 'Hanna', 'Jakob', 'Lea', 'Max', 'Nina', 'Oskar', 'Pia', 'Rafael', 'Sarah', 'Theo', 'Ulla', 'Viktor', 'Wilma', 'Yannik', 'Zoe', 'Alina', 'Bastian', 'Celine', 'Dominik', 'Elisa', 'Fabian', 'Gisela', 'Henrik', 'Ines', 'Julian', 'Katharina', 'Leon', 'Miriam', 'Niklas', 'Ophelia', 'Philipp', 'Ronja', 'Sebastian', 'Tabea', 'Ulrich', 'Valerie', 'Werner', 'Xenia', 'Yara', 'Zora', 'Moritz', 'Sophie'];
  const verwendet = new Set([...paare.querySelectorAll('input')].map(input => input.value.trim().toLocaleLowerCase('de')).filter(Boolean));
  let ziel = [...paare.children].find(paar => [...paar.querySelectorAll('input')].every(input => !input.value.trim()));
  if (!ziel && paare.children.length < 32) { addPaar(); ziel = paare.lastElementChild; }
  if (!ziel) { meldung(`Alle 32 ${formularIstSchach() ? 'Spieler' : 'Doppelpaare'} sind bereits belegt.`); return; }
  const benoetigt = formularIstSchach() ? 1 : 2;
  const freieNamen = kandidaten.filter(name => !verwendet.has(name.toLocaleLowerCase('de'))).slice(0, benoetigt);
  if (freieNamen.length < benoetigt) { meldung('Es sind keine weiteren Fantasienamen verfügbar.'); return; }
  [...ziel.querySelectorAll('input')].forEach((input, index) => { input.value = freieNamen[index]; });
  ziel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  meldung(formularIstSchach() ? 'Fantasiespieler eingefügt.' : 'Fantasiepaar eingefügt.', 'erfolg');
});

form.elements.sportart.addEventListener('change', () => {
  const namen = [...paare.querySelectorAll('input')].map(input => input.value.trim()).filter(Boolean);
  if (formularIstSchach() && namen.length > 32) {
    form.elements.sportart.value = form.dataset.sportart;
    meldung('Für Schach sind höchstens 32 Spieler möglich. Bitte zuerst die Teilnehmerzahl reduzieren.');
    return;
  }
  turnierFormAnpassen();
  paare.replaceChildren();
  const proTeilnehmer = formularIstSchach() ? 1 : 2;
  const anzahl = namen.length ? Math.max(teilnehmerMinimum(), Math.ceil(namen.length / proTeilnehmer)) : (formularIstSchach() ? 10 : 8);
  for (let i = 0; i < anzahl; i++) paarFeldHinzufuegen(paare, Array.from({ length: proTeilnehmer }, (_, j) => ({ name: namen[i * proTeilnehmer + j] ?? '' })));
});

form.elements.titel.addEventListener('input', aktualisiereFantasiePaarSichtbarkeit);

$('paarHinzufuegen').addEventListener('click', addPaar);
auswahl.addEventListener('change', () => { state.ausgewaehlt = Number(auswahl.value); render(); });

$('beamerAnsicht').addEventListener('click', () => {
  const url = new URL(location.href); url.searchParams.set('beamer', '1');
  if (state.ausgewaehlt !== null) url.searchParams.set('turnier', state.ausgewaehlt);
  window.open(url, '_blank', 'noopener');
});
$('turnierLink').addEventListener('click', async () => {
  if (state.ausgewaehlt === null) return;
  const url = new URL(location.pathname, location.origin); url.searchParams.set('turnier', state.ausgewaehlt);
  try {
    await navigator.clipboard.writeText(url.href);
    meldung(`Link kopiert: ${url.href}`, 'erfolg');
  } catch { window.prompt('Link zu diesem Turnier:', url.href); }
});
$('drucken').addEventListener('click', () => { if (darfBearbeiten()) window.print(); });
$('siegerurkunden').addEventListener('click', () => {
  const turnier = state.turniere.find(item => item.id === state.ausgewaehlt);
  if (turnier) siegerurkundenDrucken(turnier);
});
$('exportieren').addEventListener('click', () => {
  if (!darfBearbeiten()) return;
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

const inlineFehler = (id, text = '') => { $(id).textContent = text; $(id).hidden = !text; };

$('leitungAnmelden').addEventListener('click', () => {
  $('leitungForm').reset(); inlineFehler('leitungFehler');
  $('leitungDialog').showModal(); $('leitungForm').elements.pin.focus();
});
$('leitungAbbrechen').addEventListener('click', () => $('leitungDialog').close());
$('leitungDialog').addEventListener('close', () => $('leitungForm').reset());
$('leitungForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) return;
  const pin = $('leitungForm').elements.pin.value;
  setBusy(true); inlineFehler('leitungFehler');
  try {
    state.leitung = (await request('anmelden', { method: 'POST', body: JSON.stringify({ pin, turnier: state.ausgewaehlt }) })).leitung;
    const result = await request(); state.turniere = result.turniere; state.leitung = result.leitung;
    $('leitungDialog').close(); render(); meldung(istSuperadmin() ? 'Als Gesamtverwaltung angemeldet.' : 'Als Turnierleitung angemeldet.', 'erfolg');
  } catch (error) { inlineFehler('leitungFehler', error.message); }
  finally { $('leitungForm').elements.pin.value = ''; setBusy(false); }
});
$('leitungAbmelden').addEventListener('click', async () => {
  if (state.busy) return;
  setBusy(true);
  try {
    state.leitung = (await request('abmelden', { method: 'POST', body: '{}' })).leitung;
    if (!einzelAnsicht) state.turniere = [];
    turnierDialog.close(); $('verlaufDialog').close(); $('pinDialog').close(); $('turnierPinDialog').close();
    render(); meldung('Abgemeldet. Die Zuschaueransicht ist aktiv.', 'erfolg');
  } catch (error) { meldung(error.message); }
  finally { setBusy(false); }
});
$('pinAendern').addEventListener('click', () => {
  const turnier = state.turniere.find(item => item.id === state.ausgewaehlt);
  $('pinTitel').textContent = istSuperadmin() ? 'PIN der Gesamtverwaltung ändern' : 'Turnier-PIN ändern';
  $('pinHinweis').textContent = istSuperadmin()
    ? 'Die PIN der Gesamtverwaltung gilt für alle Turniere. Andere als Gesamtverwaltung angemeldete Geräte müssen sich danach erneut anmelden.'
    : `Die PIN gilt nur für „${turnier?.titel ?? ''}“. Andere angemeldete Geräte dieser Turnierleitung müssen sich danach erneut anmelden.`;
  $('pinForm').reset(); inlineFehler('pinFehler'); $('pinDialog').showModal(); $('pinForm').elements.aktuellePin.focus();
});
$('pinAbbrechen').addEventListener('click', () => $('pinDialog').close());
$('pinDialog').addEventListener('close', () => $('pinForm').reset());
$('pinForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) return;
  const felder = $('pinForm').elements;
  if (felder.neuePin.value !== felder.wiederholung.value) { inlineFehler('pinFehler', 'Die neuen PINs stimmen nicht überein.'); return; }
  const payload = { aktuellePin: felder.aktuellePin.value, neuePin: felder.neuePin.value, ...(istSuperadmin() ? {} : { turnier: state.ausgewaehlt }) };
  setBusy(true); inlineFehler('pinFehler');
  try {
    state.leitung = (await request('pin', { method: 'POST', body: JSON.stringify(payload) })).leitung;
    $('pinDialog').close(); render(); meldung('PIN geändert.', 'erfolg');
  } catch (error) { inlineFehler('pinFehler', error.message); }
  finally { $('pinForm').reset(); setBusy(false); }
});

const turnierPinSpeichern = async pin => {
  if (state.busy) return;
  setBusy(true); inlineFehler('turnierPinFehler');
  try {
    state.leitung = (await request(`turnier-pin&turnier=${state.ausgewaehlt}`, { method: 'POST', body: JSON.stringify({ pin }) })).leitung;
    $('turnierPinDialog').close(); render(); meldung(pin === null ? 'Turnier-PIN entfernt.' : 'Turnier-PIN gespeichert.', 'erfolg');
  } catch (error) { inlineFehler('turnierPinFehler', error.message); }
  finally { $('turnierPinForm').reset(); setBusy(false); }
};
$('turnierPinOeffnen').addEventListener('click', () => {
  const turnier = state.turniere.find(item => item.id === state.ausgewaehlt);
  if (!turnier || !istSuperadmin()) return;
  const vorhanden = state.leitung.turnierPins?.includes(turnier.id);
  $('turnierPinHinweis').textContent = vorhanden
    ? `„${turnier.titel}“ hat bereits eine eigene PIN. Eine neue PIN ersetzt sie; angemeldete Geräte der Turnierleitung müssen sich neu anmelden.`
    : `„${turnier.titel}“ hat noch keine eigene PIN und kann nur von der Gesamtverwaltung bearbeitet werden.`;
  $('turnierPinEntfernen').hidden = !vorhanden;
  $('turnierPinForm').reset(); inlineFehler('turnierPinFehler'); $('turnierPinDialog').showModal(); $('turnierPinForm').elements.neuePin.focus();
});
$('turnierPinAbbrechen').addEventListener('click', () => $('turnierPinDialog').close());
$('turnierPinDialog').addEventListener('close', () => $('turnierPinForm').reset());
$('turnierPinForm').addEventListener('submit', event => {
  event.preventDefault();
  const felder = $('turnierPinForm').elements;
  if (felder.neuePin.value !== felder.wiederholung.value) { inlineFehler('turnierPinFehler', 'Die PINs stimmen nicht überein.'); return; }
  void turnierPinSpeichern(felder.neuePin.value);
});
$('turnierPinEntfernen').addEventListener('click', async () => {
  $('turnierPinDialog').close();
  if (!await dialogOeffnen({ titel: 'Turnier-PIN entfernen?', text: 'Danach kann nur noch die Gesamtverwaltung dieses Turnier bearbeiten.', bestaetigung: 'PIN entfernen', gefahr: true })) return;
  void turnierPinSpeichern(null);
});

const zeitText = zeit => new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(zeit));

const sicherungAnsehen = async (eintrag, seite) => {
  if (state.busy) return;
  setBusy(true); inlineFehler('verlaufFehler');
  try {
    const result = await request(`stand&sicherung=${encodeURIComponent(eintrag.id)}&seite=${seite}`);
    const turnier = result.turnier, vorschau = $('sicherungsVorschau');
    const fortschritt = turnierFortschritt(turnier);
    vorschau.replaceChildren(el('h3', `${turnier.titel} · Stand ${seite === 'vorher' ? 'vor' : 'nach'} der Änderung`),
      el('p', `${zeitText(eintrag.zeit)} · ${sportartName(turnier)} · Version ${turnier.version} · ${fortschritt.fertig} von ${fortschritt.gesamt} Spielen abgeschlossen`));
    const toolbar = el('div', undefined, 'toolbar');
    const wiederherstellen = el('button', 'Diesen Stand wiederherstellen'); wiederherstellen.type = 'button';
    wiederherstellen.addEventListener('click', async () => {
      if (state.busy || !await dialogOeffnen({ titel: 'Früheren Stand wiederherstellen?',
        text: 'Der angezeigte Stand ersetzt das aktuelle Turnier. Der aktuelle Stand wird dabei automatisch gesichert. ',
        hervorhebung: turnier.titel, bestaetigung: 'Stand wiederherstellen' })) return;
      setBusy(true); inlineFehler('verlaufFehler');
      try {
        const restored = await request('wiederherstellen', { method: 'POST', body: JSON.stringify({ sicherung: eintrag.id, seite, version: result.aktuelleVersion }) });
        state.turniere = [restored.turnier, ...state.turniere.filter(item => item.id !== restored.turnier.id)];
        state.ausgewaehlt = restored.turnier.id;
        $('verlaufDialog').close(); render(); meldung('Turnierstand wiederhergestellt.', 'erfolg');
      } catch (error) { inlineFehler('verlaufFehler', error.message); }
      finally { setBusy(false); }
    });
    const tabellen = el('div', undefined, 'tabellen'); tabellen.append(renderTabelle(turnier));
    if (istSchach(turnier)) tabellen.append(renderKreuztabelle(turnier));
    toolbar.append(wiederherstellen); vorschau.append(toolbar, tabellen);
    const plan = el('details'); plan.append(el('summary', 'Gesicherten Spielplan ansehen'));
    const names = new Map(turnier.teilnehmer.map(item => [item.id, item.name]));
    if (istSchach(turnier)) plan.append(el('p', 'Der jeweils zuerst genannte Spieler hat Weiß.', 'hint'));
    turnier.runden.forEach((runde, index) => {
      plan.append(el('h4', rundenTitel(turnier, index)));
      runde.forEach(spiel => plan.append(el('p', `${paarungsText(turnier, spiel, names)} · ${spiel.status === 'fertig' ? (istSchach(turnier) ? schachErgebnisText(spiel) : `${spiel.punkteA}:${spiel.punkteB}`) : spiel.status === 'freilos' ? 'Freilos' : 'offen'}`)));
    });
    vorschau.append(plan); vorschau.hidden = false; vorschau.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } catch (error) { inlineFehler('verlaufFehler', error.message); }
  finally { setBusy(false); }
};

const renderVerlauf = (limit = 50) => {
  const filter = $('verlaufFilter').value, liste = $('verlaufListe'); liste.replaceChildren();
  const eintraege = state.verlauf.filter(eintrag => !filter || eintrag.turnierId === Number(filter));
  if (!eintraege.length) liste.append(el('p', 'Noch keine Änderungen gesichert.', 'muted'));
  for (const eintrag of eintraege.slice(0, limit)) {
    const artikel = el('article', undefined, 'verlauf-eintrag');
    artikel.append(el('p', `${zeitText(eintrag.zeit)} · ${eintrag.titel}`), el('p', eintrag.beschreibung));
    const toolbar = el('div', undefined, 'toolbar');
    for (const [seite, version] of [['vorher', eintrag.vorherVersion], ['nachher', eintrag.nachherVersion]]) {
      if (version === null) continue;
      const button = el('button', `Stand ${seite} ansehen (Version ${version})`, 'secondary small'); button.type = 'button';
      button.addEventListener('click', () => void sicherungAnsehen(eintrag, seite)); toolbar.append(button);
    }
    artikel.append(toolbar); liste.append(artikel);
  }
  if (eintraege.length > limit) {
    const mehr = el('button', 'Weitere Änderungen anzeigen', 'secondary'); mehr.type = 'button';
    mehr.addEventListener('click', () => renderVerlauf(limit + 50)); liste.append(mehr);
  }
};

$('verlaufOeffnen').addEventListener('click', async () => {
  if (state.busy) return;
  $('sicherungsVorschau').hidden = true; inlineFehler('verlaufFehler');
  $('verlaufDialog').showModal(); setBusy(true);
  try {
    state.verlauf = (await request('verlauf')).verlauf;
    const filter = $('verlaufFilter'); filter.replaceChildren();
    const alle = el('option', 'Alle Turniere'); alle.value = ''; filter.append(alle);
    const turniere = new Map();
    for (const eintrag of state.verlauf) if (!turniere.has(eintrag.turnierId)) turniere.set(eintrag.turnierId, eintrag.titel);
    for (const [id, titel] of turniere) {
      const vorhanden = state.turniere.some(turnier => turnier.id === id);
      const option = el('option', `${titel}${vorhanden ? '' : ' (gelöscht)'}`); option.value = id; filter.append(option);
    }
    renderVerlauf();
  } catch (error) { inlineFehler('verlaufFehler', error.message); }
  finally { setBusy(false); }
});
$('verlaufFilter').addEventListener('change', () => { $('sicherungsVorschau').hidden = true; renderVerlauf(); });
$('verlaufSchliessen').addEventListener('click', () => $('verlaufDialog').close());

turnierFormZuruecksetzen();
document.body.classList.toggle('beamer', state.beamer);
setInterval(() => { if ((state.beamer || !darfBearbeiten()) && !document.hidden && !$('leitungDialog').open) void load(); }, 15000);
void load();
