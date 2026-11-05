import { schachErgebnisText, schachLetzterSpieltag, schachNachtragbar, schachPunkte } from './schach-domain.js?v=7';

const historieOffen = new Map();
const historieBearbeiten = new Map();
const datumText = datum => datum.split('-').reverse().join('.');

export const renderSchachHistorie = (turnier, { el, bearbeiten, ergebnisForm, neuZeichnen }) => {
  const tage = [...(turnier.historischeSpieltage ?? []), ...(turnier.spieltage ?? []).filter(tag => tag.status === 'beendet')]
    .sort((a, b) => a.datum.localeCompare(b.datum));
  if (!tage.length) return null;
  const letzterTag = schachLetzterSpieltag(turnier);
  const section = el('section', undefined, 'spieltag-historie');
  section.append(el('h3', `Bisherige Spieltage (${tage.length})`));
  const namen = new Map(turnier.teilnehmer.map(p => [p.id, p.name]));
  const ergebnisse = new Map((turnier.altErgebnisse ?? []).map(e => [`${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`, e]));
  const spiele = new Map(turnier.runden.flat().map(s => [s.id, s]));
  tage.forEach((tag, index) => {
    const details = el('details', undefined, 'vergangener-spieltag');
    const anzahl = tag.paarungen ? tag.paarungen.length * 2 : tag.gruppen.reduce((n, g) => n + g.spiele.length, 0);
    const nachtragbar = schachNachtragbar(turnier, tag, letzterTag).length;
    details.open = historieOffen.get(tag.id) ?? false;
    details.addEventListener('toggle', () => historieOffen.set(tag.id, details.open));
    // Ausgeloste Spieltage gelten erst als gespielt, wenn jede Partie ein Ergebnis hat.
    const offen = tag.gruppen?.some(g => g.spiele.some(id => spiele.get(id)?.status !== 'fertig'));
    const partienText = `${anzahl} ${anzahl === 1 ? 'Partie' : 'Partien'}${offen ? ' angesetzt' : ''}`;
    const ergebnisText = nachtragbar ? ` · ${nachtragbar} ${nachtragbar === 1 ? 'Ergebnis offen' : 'Ergebnisse offen'}` : '';
    details.append(el('summary', `${index + 1}. Spieltag · ${datumText(tag.datum)} · Spieltag beendet · ${partienText}${ergebnisText}`));
    // Beendete Spieltage sind schreibgeschützt, bis die Turnierleitung sie ausdrücklich zur Bearbeitung öffnet.
    const korrigierbar = bearbeiten && tag.gruppen?.some(g => g.spiele.some(id => { const spaeter = letzterTag.get(id); return !spaeter || spaeter === tag; }));
    const imBearbeiten = korrigierbar && (historieBearbeiten.get(tag.id) ?? false);
    if (bearbeiten && nachtragbar) details.append(el('p', `Offene Partien dieses Spieltags können nachgetragen werden, solange sie nicht an einem späteren Spieltag neu ausgelost wurden.${imBearbeiten ? '' : ' Dazu „Ergebnisse bearbeiten“ wählen.'}`, 'hint management-only'));
    details.append(el('p', `${tag.anwesenheitVollstaendig === false ? 'Mitgespielt' : 'Anwesend'}: ${tag.anwesend.map(id => namen.get(id)).join(', ')}`, 'muted'));
    if (tag.gruppen?.length) details.append(el('p', 'Der jeweils zuerst genannte Spieler hat Weiß.', 'hint'));
    const tabelle = el('table'), head = el('thead'), kopf = el('tr');
    for (const titel of ['Paarung', tag.paarungen ? 'Hin- und Rückspiel gesamt' : 'Ergebnis']) {
      const th = el('th', titel); th.scope = 'col'; kopf.append(th);
    }
    head.append(kopf); tabelle.append(head);
    const body = el('tbody');
    for (const key of tag.paarungen ?? []) {
      const e = ergebnisse.get(key), row = el('tr');
      row.append(el('td', `${namen.get(e.a)} – ${namen.get(e.b)}`), el('td', `${schachPunkte(e.punkteA)}:${schachPunkte(e.punkteB)}`));
      body.append(row);
    }
    for (const gruppe of tag.gruppen ?? []) {
      for (const id of gruppe.spiele) {
        const s = spiele.get(id), row = el('tr'), zelle = el('td'), spaeter = letzterTag.get(id);
        if (spaeter && spaeter !== tag) zelle.textContent = `neu ausgelost am ${datumText(spaeter.datum)}`;
        else if (imBearbeiten) zelle.append(ergebnisForm(turnier, s, `Spieltag ${tag.datum}`, namen));
        else zelle.textContent = s.status === 'fertig' ? schachErgebnisText(s) : 'offen';
        row.append(el('td', `${namen.get(s.a)} – ${namen.get(s.b)}`), zelle);
        body.append(row);
      }
      for (const frei of gruppe.freiePaarungen) {
        const row = el('tr');
        row.append(el('td', `${namen.get(frei.a)} – ${namen.get(frei.b)}`), el('td', `${frei.anzahl} freie ${frei.anzahl === 1 ? 'Partie' : 'Partien'} · ohne Turnierwertung`));
        body.append(row);
      }
    }
    tabelle.append(body); const wrap = el('div', undefined, 'table-wrap'); wrap.append(tabelle); details.append(wrap);
    if (korrigierbar) {
      const umschalten = el('button', imBearbeiten ? 'Bearbeiten beenden' : 'Ergebnisse bearbeiten', 'secondary management-only'); umschalten.type = 'button';
      umschalten.addEventListener('click', () => { historieBearbeiten.set(tag.id, !imBearbeiten); neuZeichnen(); });
      details.append(umschalten);
    }
    section.append(details);
  });
  return section;
};

const auslosungOffen = new Map();
const einteilungen = new Map();
const paarSchluessel = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;

// Bretter passend zur Anwesenheit: Paare und bei ungerader Anzahl eine Dreiergruppe am Ende.
const einteilungAnpassen = (gruppen, anwesend) => {
  const da = new Set(anwesend), anzahl = Math.floor(anwesend.length / 2);
  return Array.from({ length: anzahl }, (_, g) => Array.from({ length: anwesend.length % 2 && g === anzahl - 1 ? 3 : 2 }, (_, p) => {
    const id = gruppen[g]?.[p];
    return id != null && da.has(id) ? id : null;
  }));
};

export const renderSchachSpieltag = (turnier, hilfe) => {
  const { el, bearbeiten, busy, setBusy, request, aktualisieren, meldung, bestaetigen, ergebnisForm, paarungsText, abgeschlossen, sieger } = hilfe;
  const letzter = turnier.spieltage?.at(-1), aktiv = letzter?.status === 'aktiv';
  const section = el('section', undefined, 'spieltag');
  if (abgeschlossen && !aktiv) {
    section.setAttribute('aria-label', 'Turnierstand');
    section.append(el('h3', 'Turnier abgeschlossen'));
    if (sieger.length) section.append(el('p', `${sieger.length > 1 ? 'Turniersieger (geteilt)' : 'Turniersieger'}: ${sieger.map(person => person.name).join(', ')}`, 'erfolg'));
    return section;
  }
  const jetzt = new Date();
  const heute = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
  // Ohne laufenden Spieltag gibt es für Zuschauer nichts anzuzeigen; ein vorab ausgeloster Spieltag erscheint erst an seinem Datum.
  if (!bearbeiten && (!aktiv || letzter.datum > heute)) return null;
  section.setAttribute('aria-label', 'Anwesenheit und Auslosung');
  section.append(el('h3', aktiv ? 'Aktueller Spieltag' : 'Neuer Spieltag'));
  const namen = new Map(turnier.teilnehmer.map(person => [person.id, person.name]));
  const spiele = new Map(turnier.runden.flat().map(spiel => [spiel.id, spiel]));
  const begonnen = aktiv && letzter.gruppen.some(gruppe => gruppe.spiele.some(id => spiele.get(id)?.status === 'fertig'));
  if (bearbeiten && begonnen) section.append(el('p', 'Für diesen Spieltag wurden bereits Ergebnisse erfasst. Neu auslosen ist nicht mehr möglich; für eine neue Auslosung zuerst den Spieltag beenden.', 'hint management-only'));
  if (bearbeiten && !begonnen) {
    const form = el('form', undefined, 'auslosung-form management-only');
    // Ein vergessener Spieltag aus der Vergangenheit soll nicht unbemerkt sein altes Datum weitergeben.
    const veraltet = aktiv && letzter.datum < heute;
    if (veraltet) section.append(el('p', `Der Spieltag vom ${datumText(letzter.datum)} wurde nicht beendet. Für die neue Auslosung ist das heutige Datum eingetragen.`, 'hint management-only'));
    const datumLabel = el('label', 'Datum des Spieltags'), datum = el('input');
    datum.type = 'date'; datum.name = 'datum'; datum.required = true;
    datum.value = aktiv && !veraltet ? letzter.datum : heute;
    datumLabel.append(datum);
    const auswahl = el('fieldset', undefined, 'anwesenheit'); auswahl.append(el('legend', 'Wer ist heute anwesend?'));
    const checkboxen = [];
    for (const person of turnier.teilnehmer) {
      const label = el('label', undefined, 'anwesenheit-chip'), input = el('input'); input.type = 'checkbox'; input.name = 'anwesend'; input.value = person.id;
      input.checked = aktiv && letzter.anwesend.includes(person.id);
      label.append(input, el('span', person.name)); auswahl.append(label); checkboxen.push(input);
    }
    // Die händische Einteilung übersteht ein Neuzeichnen und startet mit der aktuellen Einteilung des Spieltags.
    const zustand = einteilungen.get(turnier.id) ?? { manuell: false, gruppen: null };
    einteilungen.set(turnier.id, zustand);
    zustand.gruppen ??= aktiv ? [...letzter.gruppen].sort((a, b) => a.spieler.length - b.spieler.length).map(gruppe => [...gruppe.spieler]) : [];
    const offenePaare = new Map();
    for (const spiel of turnier.runden.flat()) if (spiel.status === 'offen') {
      const key = paarSchluessel(spiel.a, spiel.b); offenePaare.set(key, (offenePaare.get(key) ?? 0) + 1);
    }
    const modus = el('fieldset', undefined, 'einteilung-modus'); modus.append(el('legend', 'Paarungen'));
    for (const [wert, text] of [[false, 'Automatisch auslosen'], [true, 'Selbst einteilen']]) {
      const label = el('label', undefined, 'checkbox-label'), input = el('input');
      input.type = 'radio'; input.name = 'einteilung'; input.checked = zustand.manuell === wert;
      input.addEventListener('change', () => { zustand.manuell = wert; zaehlen(); });
      label.append(input, el('span', text)); modus.append(label);
    }
    const brett = el('div', undefined, 'einteilung');
    let gewaehlt = null, gueltig = false;
    const anwesendIds = () => checkboxen.filter(input => input.checked).map(input => Number(input.value));
    const position = id => { for (const [g, gruppe] of zustand.gruppen.entries()) { const p = gruppe.indexOf(id); if (p >= 0) return [g, p]; } return null; };
    // Ein besetzter Platz tauscht mit der Herkunft des Spielers; ohne Ziel kommt der Spieler zurück zu den Uneingeteilten.
    const platzieren = (id, ziel) => {
      const von = position(id), verdraengt = ziel ? zustand.gruppen[ziel[0]][ziel[1]] : null;
      if (von) zustand.gruppen[von[0]][von[1]] = verdraengt;
      if (ziel) zustand.gruppen[ziel[0]][ziel[1]] = id;
      gewaehlt = null; zaehlen();
    };
    const ablage = (element, ziel) => {
      element.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; element.classList.add('ziel'); });
      element.addEventListener('dragleave', event => { if (!element.contains(event.relatedTarget)) element.classList.remove('ziel'); });
      element.addEventListener('drop', event => {
        event.preventDefault(); element.classList.remove('ziel');
        const id = Number(event.dataTransfer.getData('text/plain'));
        if (anwesendIds().includes(id)) platzieren(id, ziel);
      });
      // Antippen als Alternative für Touchgeräte und Tastatur: erst Spieler, dann Platz wählen.
      element.addEventListener('click', () => { if (gewaehlt !== null) platzieren(gewaehlt, ziel); });
    };
    const chip = id => {
      // Kein <button>, weil Firefox Buttons nicht ziehen lässt.
      const button = el('span', namen.get(id), 'einteilung-chip'); button.draggable = true; button.tabIndex = 0;
      button.setAttribute('role', 'button'); button.setAttribute('aria-pressed', String(gewaehlt === id));
      button.classList.toggle('gewaehlt', gewaehlt === id);
      button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); } });
      button.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', String(id)); event.dataTransfer.effectAllowed = 'move'; });
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (gewaehlt !== null && gewaehlt !== id && position(id)) platzieren(gewaehlt, position(id));
        else { gewaehlt = gewaehlt === id ? null : id; zaehlen(); }
      });
      return button;
    };
    const zeichnen = () => {
      const anwesendJetzt = anwesendIds();
      zustand.gruppen = einteilungAnpassen(zustand.gruppen, anwesendJetzt);
      brett.hidden = !zustand.manuell; brett.replaceChildren(); gueltig = zustand.gruppen.length > 0;
      const platziert = new Set(zustand.gruppen.flat()), frei = anwesendJetzt.filter(id => !platziert.has(id));
      const pool = el('div', undefined, 'einteilung-pool'); ablage(pool, null);
      pool.append(el('p', frei.length ? 'Noch nicht eingeteilt – auf ein Brett ziehen oder antippen und dann den Platz wählen:' : 'Alle Anwesenden sind eingeteilt.', 'hint'));
      for (const id of frei) pool.append(chip(id));
      const grid = el('div', undefined, 'einteilung-gruppen');
      zustand.gruppen.forEach((gruppe, g) => {
        const dreier = gruppe.length === 3, card = el('article', undefined, 'einteilung-gruppe');
        card.append(el('h5', dreier ? `Dreiergruppe · Brett ${g + 1}` : `Brett ${g + 1}`));
        const plaetze = el('div', undefined, 'einteilung-plaetze');
        gruppe.forEach((id, p) => {
          const platz = el('div', undefined, 'einteilung-platz'); ablage(platz, [g, p]);
          if (dreier) platz.append(el('span', p === 0 ? 'spielt gegen beide' : `Gegner ${p}`, 'einteilung-rolle'));
          if (id !== null) platz.append(chip(id));
          else {
            const leer = el('span', 'frei', 'einteilung-leer'); leer.tabIndex = 0; leer.setAttribute('role', 'button');
            leer.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); leer.click(); } });
            platz.append(leer);
          }
          plaetze.append(platz);
        });
        card.append(plaetze);
        const paare = gruppe.slice(1).map(gegner => [gruppe[0], gegner]);
        if (gruppe.includes(null)) { gueltig = false; card.append(el('p', 'Noch unvollständig', 'muted')); }
        else {
          const gespielt = paare.filter(([a, b]) => !offenePaare.has(paarSchluessel(a, b)));
          if (gespielt.length) { gueltig = false; card.append(el('p', `Keine offene Partie mehr: ${gespielt.map(([a, b]) => `${namen.get(a)} – ${namen.get(b)}`).join(', ')}`, 'fehler')); }
          else {
            const partien = dreier ? 2 : offenePaare.get(paarSchluessel(...paare[0]));
            card.append(el('p', `${partien} ${partien === 1 ? 'offene Partie' : 'offene Partien'}`, 'erfolg'));
          }
        }
        grid.append(card);
      });
      brett.append(pool, grid, el('p', zustand.gruppen.some(gruppe => gruppe.length === 3)
        ? 'In der Dreiergruppe spielt die Person auf dem ersten Platz nacheinander je eine Partie gegen die beiden anderen. Weiß und Schwarz ergeben sich aus dem Spielplan.'
        : 'Weiß und Schwarz ergeben sich aus dem Spielplan.', 'hint'));
    };
    const anzahl = el('p', undefined, 'hint'), toolbar = el('div', undefined, 'toolbar');
    const alle = el('button', 'Alle auswählen', 'secondary small'), keine = el('button', 'Auswahl aufheben', 'secondary small');
    const los = el('button', aktiv ? 'Neu auslosen' : 'Paarungen auslosen'); los.type = 'submit';
    for (const button of [alle, keine]) button.type = 'button';
    const zaehlen = () => {
      const n = checkboxen.filter(input => input.checked).length;
      anzahl.textContent = `${n} Spieler anwesend${n >= 2 ? n % 2 ? ' · eine Dreiergruppe, übrige Spieler in Paaren' : ' · alle Spieler in Paaren' : ' · mindestens zwei auswählen'}`;
      zeichnen();
      const gesperrt = n < 2 || (zustand.manuell && !gueltig);
      los.textContent = zustand.manuell ? 'Paarungen übernehmen' : aktiv ? 'Neu auslosen' : 'Paarungen auslosen';
      los.dataset.gesperrt = String(gesperrt); los.disabled = busy() || gesperrt;
    };
    checkboxen.forEach(input => input.addEventListener('change', zaehlen));
    alle.addEventListener('click', () => { checkboxen.forEach(input => input.checked = true); zaehlen(); });
    keine.addEventListener('click', () => { checkboxen.forEach(input => input.checked = false); zaehlen(); });
    toolbar.append(alle, keine, los);
    form.append(datumLabel, auswahl, anzahl, modus, brett, el('p', 'Normale Paare spielen die noch offenen Partien gegeneinander. In der Dreiergruppe spielt die zuerst genannte Person nacheinander je eine Partie gegen die beiden anderen.', 'hint'), toolbar);
    zaehlen();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy()) return;
      const { manuell } = zustand;
      if (aktiv && !await bestaetigen(manuell
        ? { titel: 'Einteilung übernehmen?', text: 'Die bisherige Einteilung dieses Spieltags wird ersetzt.', bestaetigung: 'Übernehmen' }
        : { titel: 'Neu auslosen?', text: 'Die bisherige Einteilung dieses Spieltags wird ersetzt.', bestaetigung: 'Neu auslosen' })) return;
      setBusy(true);
      try {
        const result = await request(`auslosen&turnier=${turnier.id}`, { method: 'POST', body: JSON.stringify({ version: turnier.version, datum: datum.value, anwesend: anwesendIds(), freiePartien: false, paarungen: manuell ? zustand.gruppen : undefined }) });
        zustand.gruppen = null;
        aktualisieren(result.turnier); meldung(manuell ? 'Paarungen übernommen.' : 'Anwesende Spieler ausgelost.', 'erfolg');
      } catch (error) { meldung(error.message); }
      finally { setBusy(false); }
    });
    if (aktiv) {
      const details = el('details', undefined, 'auslosung-einrichtung management-only');
      details.open = auslosungOffen.get(letzter.id) ?? false;
      details.addEventListener('toggle', () => auslosungOffen.set(letzter.id, details.open));
      details.append(el('summary', 'Anwesenheit & Auslosung ändern'), form);
      section.append(details);
    } else section.append(form);
  }
  if (aktiv) {
    const [jahr, monat, tag] = letzter.datum.split('-');
    section.append(el('h4', `${tag}.${monat}.${jahr}${aktiv ? '' : ' · beendet'}`));
    const anwesend = new Set(letzter.anwesend);
    section.append(el('p', `Anwesend: ${letzter.anwesend.map(id => namen.get(id)).join(', ')}`, 'muted'));
    const abwesend = turnier.teilnehmer.filter(person => !anwesend.has(person.id));
    if (abwesend.length) section.append(el('p', `Nicht anwesend: ${abwesend.map(person => person.name).join(', ')}`, 'muted'));
    const grid = el('div', undefined, 'spieltag-gruppen'); let freieAnzahl = 0;
    letzter.gruppen.forEach((gruppe, index) => {
      const card = el('article', undefined, 'spieltag-gruppe');
      card.append(el('h4', `${gruppe.typ === 'dreier' ? 'Dreiergruppe' : 'Paar'} ${index + 1}: ${gruppe.spieler.map(id => namen.get(id)).join(' – ')}`));
      if (gruppe.typ === 'dreier') card.append(el('p', `${namen.get(gruppe.spieler[0])} spielt nacheinander je eine Partie gegen ${namen.get(gruppe.spieler[1])} und ${namen.get(gruppe.spieler[2])}.`, 'hint'));
      if (turnier.anzahlTische) card.append(el('p', `${letzter.gruppen.length > turnier.anzahlTische ? `Durchgang ${Math.floor(index / turnier.anzahlTische) + 1} · ` : ''}Brett ${index % turnier.anzahlTische + 1}`, 'muted'));
      for (const id of gruppe.spiele) {
        const spiel = spiele.get(id), partie = el('div', undefined, 'spieltag-partie');
        partie.append(el('p', paarungsText(turnier, spiel, namen), 'paarung'));
        if (bearbeiten && aktiv) partie.append(ergebnisForm(turnier, spiel, `Spieltag ${letzter.datum}`, namen));
        if (spiel.status === 'fertig') partie.append(el('p', `${schachErgebnisText(spiel)}${spiel.sieger === null ? ' · Remis' : ` · Sieger: ${namen.get(spiel.sieger)}`}`, 'erfolg ergebnis-info'));
        else if (!bearbeiten || !aktiv) partie.append(el('p', 'Ergebnis noch offen', 'muted'));
        card.append(partie);
      }
      for (const frei of gruppe.freiePaarungen) {
        freieAnzahl += frei.anzahl;
        card.append(el('p', `${namen.get(frei.a)} – ${namen.get(frei.b)}: ${frei.anzahl === 2 ? 'Hin- und Rückspiel' : 'eine Partie'} · freie Partie ohne Turnierwertung`, 'freie-partie'));
      }
      grid.append(card);
    });
    if (freieAnzahl) section.append(el('p', `${freieAnzahl} freie ${freieAnzahl === 1 ? 'Partie' : 'Partien'} ergänzt, damit alle Anwesenden spielen können. Diese Ergebnisse fließen nicht in die Turniertabelle ein.`, 'hint'));
    section.append(el('p', 'Der jeweils zuerst genannte Spieler hat Weiß.', 'hint'), grid);
    if (bearbeiten && aktiv) {
      const ende = el('button', 'Spieltag beenden', 'secondary management-only'); ende.type = 'button';
      ende.addEventListener('click', async () => {
        const offen = letzter.gruppen.flatMap(gruppe => gruppe.spiele).filter(id => spiele.get(id)?.status !== 'fertig').length;
        const text = offen
          ? `Noch ${offen === 1 ? 'ist 1 Partie' : `sind ${offen} Partien`} ohne Ergebnis. Sie können unter „Bisherige Spieltage“ nachgetragen werden, bis sie an einem späteren Spieltag neu ausgelost werden.`
          : 'Ergebnisse bleiben erhalten.';
        if (busy() || !await bestaetigen({ titel: 'Spieltag beenden?', text, bestaetigung: 'Spieltag beenden' })) return;
        setBusy(true);
        try { aktualisieren((await request(`spieltag-beenden&turnier=${turnier.id}`, { method: 'POST', body: JSON.stringify({ version: turnier.version }) })).turnier); meldung('Spieltag beendet.', 'erfolg'); }
        catch (error) { meldung(error.message); }
        finally { setBusy(false); }
      });
      const aktionen = el('div', undefined, 'toolbar management-only'); aktionen.append(ende);
      section.append(aktionen);
      if (!begonnen) {
        // Eine versehentliche oder zu frühe Auslosung lässt sich ohne Spuren in den bisherigen Spieltagen entfernen.
        const zurueck = el('button', 'Auslosung zurücknehmen', 'secondary management-only'); zurueck.type = 'button';
        zurueck.addEventListener('click', async () => {
          if (busy() || !await bestaetigen({ titel: 'Auslosung zurücknehmen?', text: `Der Spieltag vom ${datumText(letzter.datum)} wird mit allen Paarungen entfernt. Die Partien bleiben offen und können später neu ausgelost werden.`, bestaetigung: 'Zurücknehmen' })) return;
          setBusy(true);
          try { aktualisieren((await request(`auslosung-zuruecknehmen&turnier=${turnier.id}`, { method: 'POST', body: JSON.stringify({ version: turnier.version }) })).turnier); meldung('Auslosung zurückgenommen.', 'erfolg'); }
          catch (error) { meldung(error.message); }
          finally { setBusy(false); }
        });
        aktionen.append(zurueck);
      }
    }
  }
  return section;
};
