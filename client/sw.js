// Hält die App-Dateien auf dem Gerät vor, damit die Oberfläche auch ohne Verbindung startet.
// Immer zuerst das Netz: Mit Verbindung gilt stets der aktuelle Stand, die Kopie dient nur als Ersatz.
// Turnierdaten (api.php) laufen nicht über diesen Zwischenspeicher, sondern über offline.js.
const CACHE = 'turnierverwaltung';
const DATEIEN = ['./', 'index.html', 'styles.css', 'app.js', 'offline.js', 'turnier-domain.js', 'schach-domain.js', 'schach-spieltag.js',
  'manifest.json', 'assets/reinickendorf-wappen.svg', 'assets/schach.svg', 'assets/tischtennis.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/api.php')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const seite = event.request.mode === 'navigate';
    try {
      const antwort = await fetch(event.request);
      // Alle Seitenaufrufe (z. B. ?turnier=3&beamer) liefern dieselbe index.html und teilen sich eine Kopie.
      const html = antwort.headers.get('Content-Type')?.startsWith('text/html');
      if (antwort.ok && (!seite || html)) await cache.put(seite ? './' : event.request, antwort.clone());
      return antwort;
    } catch (error) {
      // Versionsparameter wie app.js?v=67 spielen offline keine Rolle.
      const kopie = seite ? await cache.match('./') : await cache.match(event.request, { ignoreSearch: true });
      if (kopie) return kopie;
      throw error;
    }
  })());
});
