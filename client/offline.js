// Ergebnisse, die ohne Verbindung eingetragen wurden, bleiben im localStorage, bis der Server sie angenommen hat.
const ERGEBNISSE_KEY = 'turnierverwaltung:offline-ergebnisse';
// Zuletzt bekannter Stand, damit die App auch ohne Verbindung startet.
const STAND_KEY = 'turnierverwaltung:stand';

const lesen = (key, standard) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? standard; } catch { return standard; }
};

export const offlineErgebnisse = () => {
  const liste = lesen(ERGEBNISSE_KEY, []);
  return Array.isArray(liste) ? liste : [];
};

// Wirft, wenn der Browser nichts speichern kann; das Ergebnis wäre sonst unbemerkt verloren.
export const ergebnisMerken = (turnierId, spielId, body) => {
  const liste = offlineErgebnisse().filter(eintrag => !(eintrag.turnier === turnierId && eintrag.spiel === spielId));
  liste.push({ turnier: turnierId, spiel: spielId, body });
  localStorage.setItem(ERGEBNISSE_KEY, JSON.stringify(liste));
};

export const ergebnisVergessen = (turnierId, spielId) => {
  const liste = offlineErgebnisse().filter(eintrag => !(eintrag.turnier === turnierId && eintrag.spiel === spielId));
  try { localStorage.setItem(ERGEBNISSE_KEY, JSON.stringify(liste)); } catch {}
};

export const istGemerkt = (turnierId, spielId) => offlineErgebnisse().some(eintrag => eintrag.turnier === turnierId && eintrag.spiel === spielId);

export const standMerken = stand => {
  try { localStorage.setItem(STAND_KEY, JSON.stringify(stand)); } catch {}
};

export const gemerkterStand = () => {
  const stand = lesen(STAND_KEY, null);
  return Array.isArray(stand?.turniere) ? stand : null;
};

// Wendet ein gemerktes Ergebnis so auf das Spiel an, wie es der Server speichern würde.
// K.-o.-Folgespiele berechnet erst der Server bei der Übertragung.
export const ergebnisAnwenden = (turnier, { spiel: spielId, body }) => ({
  ...turnier,
  runden: turnier.runden.map(runde => runde.map(spiel => {
    if (spiel.id !== spielId) return spiel;
    let punkteA = body.punkteA ?? null, punkteB = body.punkteB ?? null;
    const saetze = Array.isArray(body.saetze) ? body.saetze : [];
    if (saetze.length) {
      punkteA = saetze.filter(satz => satz.a > satz.b).length;
      punkteB = saetze.length - punkteA;
    } else if (Array.isArray(body.saetze)) {
      punkteA = punkteB = null;
    }
    const fertig = punkteA !== null && punkteB !== null;
    return {
      ...spiel, punkteA, punkteB, saetze,
      status: fertig ? 'fertig' : 'offen',
      sieger: !fertig || punkteA === punkteB ? null : punkteA > punkteB ? spiel.a : spiel.b,
    };
  })),
});

export const mitOfflineErgebnissen = (turniere, liste = offlineErgebnisse()) => turniere.map(turnier => liste
  .filter(eintrag => eintrag.turnier === turnier.id)
  .reduce(ergebnisAnwenden, turnier));
