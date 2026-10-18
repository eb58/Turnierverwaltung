export const istSchach = turnier => turnier.sportart === 'schach';

export const schachPunkte = punkte => String(punkte).replace('.5', '½').replace(/^0½$/, '½');

export const schachErgebnisText = spiel => spiel.altErgebnis
  ? `${schachPunkte(spiel.altErgebnis.punkteA)}:${schachPunkte(spiel.altErgebnis.punkteB)} gesamt (Hin- und Rückspiel)`
  : `${schachPunkte(spiel.punkteA)}:${schachPunkte(spiel.punkteB)}`;

// Offene Partien eines beendeten Spieltags können neu ausgelost werden; maßgeblich ist der letzte Spieltag mit der Partie.
export const schachLetzterSpieltag = turnier => {
  const letzter = new Map();
  for (const tag of turnier.spieltage ?? []) for (const gruppe of tag.gruppen) for (const id of gruppe.spiele) letzter.set(id, tag);
  return letzter;
};

export const schachNachtragbar = (turnier, tag, letzter = schachLetzterSpieltag(turnier)) => {
  const spiele = new Map(turnier.runden.flat().map(spiel => [spiel.id, spiel]));
  return (tag.gruppen ?? []).flatMap(gruppe => gruppe.spiele).filter(id => letzter.get(id) === tag && spiele.get(id)?.status !== 'fertig');
};

export const schachKreuztabelle = turnier => {
  const nachId = new Map(turnier.teilnehmer.map(person => [person.id, new Map()]));
  turnier.runden.forEach((runde, index) => runde.forEach(spiel => {
    for (const [id, gegner, farbe, punkte] of [[spiel.a, spiel.b, 'Weiß', spiel.punkteA], [spiel.b, spiel.a, 'Schwarz', spiel.punkteB]]) {
      const feld = { runde: index + 1, farbe, punkte: spiel.status === 'fertig' ? punkte : null };
      const bisher = nachId.get(id).get(gegner);
      nachId.get(id).set(gegner, bisher ? { partien: [...(bisher.partien ?? [bisher]), feld] } : feld);
    }
  }));
  for (const e of turnier.altErgebnisse ?? []) {
    nachId.get(e.a).set(e.b, { gesamt: e.punkteA });
    nachId.get(e.b).set(e.a, { gesamt: e.punkteB });
  }
  return turnier.teilnehmer.map(person => ({ ...person, felder: turnier.teilnehmer.map(gegner => person.id === gegner.id ? null : nachId.get(person.id).get(gegner.id)) }));
};

export const schachTabelle = turnier => {
  const zeilen = new Map(turnier.teilnehmer.map(teilnehmer => [teilnehmer.id, {
    ...teilnehmer, spiele: 0, siege: 0, remis: 0, niederlagen: 0, punkte: 0, direkt: 0,
  }]));
  const fertige = turnier.runden.flat().filter(spiel => spiel.status === 'fertig' && !spiel.altErgebnis);
  for (const spiel of fertige) {
    const a = zeilen.get(spiel.a), b = zeilen.get(spiel.b);
    a.spiele++; b.spiele++;
    a.punkte += spiel.punkteA; b.punkte += spiel.punkteB;
    if (spiel.punkteA === spiel.punkteB) { a.remis++; b.remis++; }
    else {
      const [sieger, verlierer] = spiel.punkteA > spiel.punkteB ? [a, b] : [b, a];
      sieger.siege++; verlierer.niederlagen++;
    }
  }
  for (const e of turnier.altErgebnisse ?? []) {
    const a = zeilen.get(e.a), b = zeilen.get(e.b);
    a.spiele += 2; b.spiele += 2; a.punkte += e.punkteA; b.punkte += e.punkteB;
    a.historisch = true; b.historisch = true;
    if (e.punkteA === 1 && !e.keineDoppelRemis) {
      a.wertungUnbekannt = true; b.wertungUnbekannt = true;
    } else {
      // Bei 1:1 ist die Bilanz nur mit der Bestätigung "keine zwei Remis" eindeutig.
      for (const [zeile, punkte] of [[a, e.punkteA], [b, e.punkteB]]) {
        const remis = Number(!Number.isInteger(punkte));
        const siege = Math.floor(punkte);
        zeile.siege += siege; zeile.remis += remis; zeile.niederlagen += 2 - siege - remis;
      }
    }
  }
  const gruppen = new Map();
  for (const zeile of zeilen.values()) {
    if (!gruppen.has(zeile.punkte)) gruppen.set(zeile.punkte, []);
    gruppen.get(zeile.punkte).push(zeile);
  }
  for (const gruppe of gruppen.values()) {
    const ids = new Set(gruppe.map(zeile => zeile.id));
    const direkte = fertige.filter(spiel => ids.has(spiel.a) && ids.has(spiel.b));
    const alte = (turnier.altErgebnisse ?? []).filter(e => ids.has(e.a) && ids.has(e.b));
    if (direkte.length + alte.length * 2 !== gruppe.length * (gruppe.length - 1) / 2 * (turnier.durchgaenge ?? 1)) continue;
    for (const e of alte) { zeilen.get(e.a).direkt += e.punkteA; zeilen.get(e.b).direkt += e.punkteB; }
    for (const spiel of direkte) {
      zeilen.get(spiel.a).direkt += spiel.punkteA;
      zeilen.get(spiel.b).direkt += spiel.punkteB;
    }
  }
  const wertung = (a, b) => b.punkte - a.punkte || b.direkt - a.direkt;
  const sortiert = [...zeilen.values()].sort((a, b) => wertung(a, b) || a.name.localeCompare(b.name, 'de') || a.id - b.id);
  let rang = 0;
  return sortiert.map((zeile, index) => {
    if (!sortiert[index - 1] || wertung(zeile, sortiert[index - 1]) !== 0) rang = index + 1;
    return { ...zeile, rang };
  });
};
