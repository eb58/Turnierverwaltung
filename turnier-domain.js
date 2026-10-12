export const turnierFortschritt = turnier => {
  const spiele = turnier.runden.flat().filter(spiel => spiel.status !== 'freilos');
  return { fertig: spiele.filter(spiel => spiel.status === 'fertig').length, gesamt: spiele.length };
};

export const turnierTabelle = turnier => {
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

export const turnierPlatzierungen = turnier => {
  const fortschritt = turnierFortschritt(turnier);
  if (!fortschritt.gesamt || fortschritt.fertig !== fortschritt.gesamt) return [];
  if (turnier.modus === 'jeder-gegen-jeden') {
    return turnierTabelle(turnier).filter(zeile => zeile.rang <= 3).map(zeile => ({ ...zeile, platz: zeile.rang }));
  }
  const nachId = new Map(turnier.teilnehmer.map(teilnehmer => [teilnehmer.id, teilnehmer]));
  const finale = turnier.runden.at(-1)?.[0];
  if (!finale?.sieger) return [];
  const verlierer = spiel => spiel.sieger === spiel.a ? spiel.b : spiel.a;
  const platzierungen = [
    { ...nachId.get(finale.sieger), platz: 1 },
    { ...nachId.get(verlierer(finale)), platz: 2 },
  ];
  for (const halbfinale of turnier.runden.at(-2) ?? []) {
    const paar = nachId.get(verlierer(halbfinale));
    if (paar) platzierungen.push({ ...paar, platz: 3 });
  }
  return platzierungen;
};
