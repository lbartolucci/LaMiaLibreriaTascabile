/* =========================================================================
   sw.js — service worker
   Strategia:
   · guscio dell'app (HTML, CSS, JS, icone) → cache-first con aggiornamento
     silenzioso in sottofondo: l'app parte istantanea anche senza rete;
   · copertine dei cataloghi → cache-first, così restano visibili offline;
   · chiamate alle API dei cataloghi → mai gestite qui: se ne occupa
     catalog.js con la sua cache su IndexedDB (che ha una scadenza vera).
   ========================================================================= */

const VERSIONE = 'v1.4.2';   // sync: stato riletto e per account, freno sulle cancellazioni di massa
const CACHE_GUSCIO = `guscio-${VERSIONE}`;
const CACHE_IMMAGINI = 'immagini-v1';

/* Percorsi relativi: l'app deve funzionare anche in una sottocartella
   (per esempio https://utente.github.io/libreria/). */
const GUSCIO = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/router.js',
  './js/db.js',
  './js/store.js',
  './js/models.js',
  './js/ui.js',
  './js/sync.js',
  './js/catalog.js',
  './js/collegamenti.js',
  './js/dettatura.js',
  './js/quiz/srs.js',
  './js/quiz/generatore.js',
  './js/suggerimenti.js',
  './js/backup.js',
  './js/onedrive.js',
  './js/demo.js',
  './js/utils/text.js',
  './js/views/libreria.js',
  './js/views/libro.js',
  './js/views/citazioni.js',
  './js/views/grafo.js',
  './js/views/cerca.js',
  './js/views/statistiche.js',
  './js/views/impostazioni.js',
  './js/views/studio.js',
  './js/views/esplora.js',
  './js/views/form-libro.js',
  './js/views/form-citazione.js',
  './js/views/form-collegamento.js',
  './icons/icona-192.png',
  './icons/icona-512.png',
  './icons/icona-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE_GUSCIO);
    // addAll fallisce tutto se un solo file manca: aggiungiamo uno per uno
    await Promise.all(GUSCIO.map(u => cache.add(u).catch(e => console.warn('Non memorizzato:', u, e))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(nomi
      .filter(n => n.startsWith('guscio-') && n !== CACHE_GUSCIO)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', ev => {
  if (ev.data === 'aggiorna-subito') self.skipWaiting();
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // copertine: cache-first, restano disponibili offline
  if (/covers\.openlibrary\.org|books\.google\.com|googleusercontent\.com/.test(url.hostname)) {
    ev.respondWith(cacheImmagini(req));
    return;
  }

  // chiamate ai cataloghi: sempre dalla rete (la cache è in IndexedDB)
  if (/openlibrary\.org|googleapis\.com/.test(url.hostname)) return;

  // stessa origine: guscio dell'app
  if (url.origin === self.location.origin) {
    ev.respondWith(guscioPrima(req));
  }
});

async function guscioPrima (req) {
  const cache = await caches.open(CACHE_GUSCIO);
  const salvata = await cache.match(req, { ignoreSearch: true });
  const dallaRete = fetch(req).then(risposta => {
    if (risposta && risposta.ok && risposta.type === 'basic') cache.put(req, risposta.clone());
    return risposta;
  }).catch(() => null);

  if (salvata) { dallaRete.catch(() => {}); return salvata; }   // aggiornamento silenzioso

  const risposta = await dallaRete;
  if (risposta) return risposta;

  // navigazione offline verso un percorso sconosciuto → serviamo l'index
  if (req.mode === 'navigate') {
    const index = await cache.match('./index.html');
    if (index) return index;
  }
  return new Response('Contenuto non disponibile offline.', {
    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

async function cacheImmagini (req) {
  const cache = await caches.open(CACHE_IMMAGINI);
  const salvata = await cache.match(req);
  if (salvata) return salvata;
  try {
    const risposta = await fetch(req);
    if (risposta && (risposta.ok || risposta.type === 'opaque')) cache.put(req, risposta.clone());
    return risposta;
  } catch (_) {
    return new Response('', { status: 504 });
  }
}
