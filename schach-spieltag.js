import { schachErgebnisText } from './schach-domain.js?v=5';

export const renderSchachSpieltag = (turnier, hilfe) => {
  const { el, bearbeiten, busy, setBusy, request, aktualisieren, meldung, bestaetigen, ergebnisForm, paarungsText } = hilfe;
  const letzter = turnier.spieltage?.at(-1), aktiv = letzter?.status === 'aktiv';
  if (!bearbeiten && !letzter) return null;
  const section = el('section', undefined, 'spieltag');
  section.setAttribute('aria-label', 'Anwesenheit und Auslosung');
  section.append(el('h3', aktiv ? 'Aktueller Spieltag' : 'Spieltag auslosen'));
  const namen = new Map(turnier.teilnehmer.map(person => [person.id, person.name]));
  const spiele = new Map(turnier.runden.flat().map(spiel => [spiel.id, spiel]));
  const begonnen = aktiv && letzter.gruppen.some(gruppe => gruppe.spiele.some(id => spiele.get(id)?.status === 'fertig'));
  if (bearbeiten) {
    const form = el('form', undefined, 'auslosung-form management-only');
    const heute = new Date();
    const datumLabel = el('label', 'Datum des Spieltags'), datum = el('input');
    datum.type = 'date'; datum.name = 'datum'; datum.required = true;
    datum.value = aktiv ? letzter.datum : `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(heute.getDate()).padStart(2, '0')}`;
    datum.disabled = begonnen; datum.dataset.gesperrt = String(begonnen); datumLabel.append(datum);
    const auswahl = el('fieldset', undefined, 'anwesenheit'); auswahl.append(el('legend', 'Wer ist heute anwesend?'));
    const checkboxen = [];
    for (const person of turnier.teilnehmer) {
      const label = el('label'), input = el('input'); input.type = 'checkbox'; input.name = 'anwesend'; input.value = person.id;
      input.checked = aktiv && letzter.anwesend.includes(person.id); input.disabled = begonnen; input.dataset.gesperrt = String(begonnen);
      label.append(input, document.createTextNode(person.name)); auswahl.append(label); checkboxen.push(input);
    }
    const freiLabel = el('label', undefined, 'checkbox-label'), frei = el('input');
    frei.type = 'checkbox'; frei.name = 'freiePartien'; frei.checked = aktiv ? letzter.freiePartien : true;
    frei.disabled = begonnen; frei.dataset.gesperrt = String(begonnen);
    freiLabel.append(frei, document.createTextNode('Bei Bedarf freie Partien ergänzen (ohne Turnierwertung)'));
    const anzahl = el('p', undefined, 'hint'), toolbar = el('div', undefined, 'toolbar');
    const alle = el('button', 'Alle auswählen', 'secondary small'), keine = el('button', 'Auswahl aufheben', 'secondary small');
    const los = el('button', aktiv ? 'Neu auslosen' : 'Anwesende auslosen'); los.type = 'submit';
    for (const button of [alle, keine]) { button.type = 'button'; button.dataset.gesperrt = String(begonnen); button.disabled = begonnen; }
    const zaehlen = () => {
      const n = checkboxen.filter(input => input.checked).length;
      anzahl.textContent = `${n} Spieler anwesend${n >= 2 ? n % 2 ? ' · eine Dreiergruppe, übrige Spieler in Paaren' : ' · alle Spieler in Paaren' : ' · mindestens zwei auswählen'}`;
      los.dataset.gesperrt = String(begonnen || n < 2); los.disabled = busy() || begonnen || n < 2;
    };
    checkboxen.forEach(input => input.addEventListener('change', zaehlen));
    alle.addEventListener('click', () => { checkboxen.forEach(input => input.checked = true); zaehlen(); });
    keine.addEventListener('click', () => { checkboxen.forEach(input => input.checked = false); zaehlen(); });
    toolbar.append(alle, keine, los);
    form.append(datumLabel, auswahl, anzahl, freiLabel, el('p', 'Normale Paare spielen die noch offenen Partien gegeneinander. In der Dreiergruppe spielt die zuerst genannte Person nacheinander je eine Partie gegen die beiden anderen.', 'hint'), toolbar);
    if (begonnen) form.append(el('p', 'Ergebnisse wurden bereits erfasst. Für eine neue Auslosung zuerst diesen Spieltag beenden.', 'hint'));
    zaehlen();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy() || begonnen) return;
      if (aktiv && !await bestaetigen({ titel: 'Neu auslosen?', text: 'Die bisherige Einteilung dieses Spieltags wird ersetzt.', bestaetigung: 'Neu auslosen' })) return;
      setBusy(true);
      try {
        const result = await request(`auslosen&turnier=${turnier.id}`, { method: 'POST', body: JSON.stringify({ version: turnier.version, datum: datum.value, anwesend: checkboxen.filter(input => input.checked).map(input => Number(input.value)), freiePartien: frei.checked }) });
        aktualisieren(result.turnier); meldung('Anwesende Spieler ausgelost.', 'erfolg');
      } catch (error) { meldung(error.message); }
      finally { setBusy(false); }
    });
    section.append(form);
  }
  if (letzter) {
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
    section.append(grid);
    if (bearbeiten && aktiv) {
      const ende = el('button', 'Spieltag beenden', 'secondary management-only'); ende.type = 'button';
      ende.addEventListener('click', async () => {
        if (busy() || !await bestaetigen({ titel: 'Spieltag beenden?', text: 'Ergebnisse bleiben erhalten. Offene Partien stehen an späteren Spieltagen wieder zur Verfügung.', bestaetigung: 'Spieltag beenden' })) return;
        setBusy(true);
        try { aktualisieren((await request(`spieltag-beenden&turnier=${turnier.id}`, { method: 'POST', body: JSON.stringify({ version: turnier.version }) })).turnier); meldung('Spieltag beendet.', 'erfolg'); }
        catch (error) { meldung(error.message); }
        finally { setBusy(false); }
      });
      section.append(ende);
    }
  }
  return section;
};
