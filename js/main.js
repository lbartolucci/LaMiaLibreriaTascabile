/* =========================================================================
   main.js — avvio dell'applicazione
   Carica i dati, applica il tema, registra le rotte e il service worker.
   ========================================================================= */

import * as router from './router.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { qs, qsa, avviso, el, chiudiTuttiIFogli } from './ui.js';

let contenitore = qs('#vista');
const testa = qs('#testa');

/** Sostituisce il contenitore della vista con uno nuovo e vuoto.
 *  Serve a buttare via insieme al vecchio nodo tutti i listener che le viste
 *  vi avevano agganciato per delega: senza questo, visitando due volte la
 *  stessa scheda gli eventi si sdoppierebbero (e si aprirebbero due fogli). */
function rinnovaContenitore () {
  const nuovo = document.createElement('main');
  nuovo.id = 'vista';
  nuovo.tabIndex = -1;
  contenitore.replaceWith(nuovo);
  contenitore = nuovo;
  return nuovo;
}

/* ------------------------------------------------------------- tema ----- */

export function applicaTema (tema) {
  const radice = document.documentElement;
  if (tema === 'chiaro' || tema === 'scuro') radice.setAttribute('data-tema', tema);
  else radice.setAttribute('data-tema', 'auto');
  // la barra di stato di iOS segue theme-color: la teniamo allineata
  const scuroAttivo = tema === 'scuro' ||
    (tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  qsa('meta[name="theme-color"]').forEach(m => m.remove());
  document.head.appendChild(el(
    `<meta name="theme-color" content="${scuroAttivo ? '#15120E' : '#FAF6EF'}">`
  ));
}

/* -------------------------------------------------- disegno delle viste - */

let ripulisciVistaCorrente = null;

/** Disegna una vista. Ogni modulo-vista esporta una funzione che restituisce
 *  { titolo, sottotitolo, html, azioni, dopo(radice), pulisci() }. */
async function mostra (caricaModulo, parametri, ancoraValida) {
  chiudiTuttiIFogli();          // nessun foglio deve sopravvivere al cambio di schermata
  rinnovaContenitore();
  contenitore.innerHTML = '<div class="attesa"><span class="attesa__ruota"></span>Un momento…</div>';
  let modulo;
  try {
    modulo = await caricaModulo();
  } catch (e) {
    console.error(e);
    contenitore.innerHTML = `<div class="vuoto"><div class="vuoto__icona">⚠</div>
      <h3>Non riesco a caricare questa sezione</h3>
      <p>Se sei senza rete e non hai ancora aperto l'app almeno una volta online, questa parte potrebbe non essere stata salvata sul telefono.</p></div>`;
    return;
  }
  if (ancoraValida && !ancoraValida()) return;    // l'utente ha già navigato altrove

  if (ripulisciVistaCorrente) { try { ripulisciVistaCorrente(); } catch (_) {} ripulisciVistaCorrente = null; }

  const vista = await modulo.default(parametri);
  if (ancoraValida && !ancoraValida()) return;

  // intestazione
  testa.innerHTML = `
    ${vista.indietro ? `<button class="btn-icona" id="btn-indietro" aria-label="Torna indietro">‹</button>` : ''}
    <h1 id="titolo-vista">${vista.titolo}${vista.sottotitolo ? `<span class="sottotesta">${vista.sottotitolo}</span>` : ''}</h1>
    ${vista.azioni || ''}`;
  document.title = `${(vista.titoloPagina || vista.titoloTesto || 'Libreria')} · La mia libreria tascabile`;
  const btnIndietro = qs('#btn-indietro', testa);
  if (btnIndietro) btnIndietro.addEventListener('click', () => router.indietro());

  contenitore.innerHTML = vista.html;
  contenitore.scrollTop = 0;
  window.scrollTo(0, 0);

  if (vista.dopo) await vista.dopo(contenitore);
  ripulisciVistaCorrente = vista.pulisci || null;

  aggiornaTab();
}

function aggiornaTab () {
  const percorso = router.percorsoCorrente();
  const mappa = [
    ['libreria', ['/libreria', '/libro', '/citazioni', '/citazione', '/grafo', '/cerca', '/statistiche']],
    ['studio', ['/studio']],
    ['esplora', ['/esplora', '/desideri']],
    ['impostazioni', ['/impostazioni']]
  ];
  const attiva = mappa.find(([, prefissi]) => prefissi.some(p => percorso.startsWith(p)));
  qsa('.tabbar a').forEach(a => {
    if (attiva && a.dataset.tab === attiva[0]) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/* ------------------------------------------------------------- rotte ---- */

const V = {
  libreria:     () => import('./views/libreria.js'),
  libro:        () => import('./views/libro.js'),
  citazioni:    () => import('./views/citazioni.js'),
  grafo:        () => import('./views/grafo.js'),
  cerca:        () => import('./views/cerca.js'),
  statistiche:  () => import('./views/statistiche.js'),
  impostazioni: () => import('./views/impostazioni.js'),
  studio:       () => import('./views/studio.js'),
  esplora:      () => import('./views/esplora.js')
};

router.registra('/libreria',      (p, ok) => mostra(V.libreria, p, ok));
router.registra('/libro/:id',     (p, ok) => mostra(V.libro, p, ok));
router.registra('/citazioni',     (p, ok) => mostra(V.citazioni, p, ok));
router.registra('/citazione/:id', (p, ok) => mostra(V.citazioni, { ...p, dettaglio: true }, ok));
router.registra('/grafo',         (p, ok) => mostra(V.grafo, p, ok));
router.registra('/cerca',         (p, ok) => mostra(V.cerca, p, ok));
router.registra('/statistiche',   (p, ok) => mostra(V.statistiche, p, ok));
router.registra('/impostazioni',  (p, ok) => mostra(V.impostazioni, p, ok));
router.registra('/studio',           (p, ok) => mostra(V.studio, p, ok));
router.registra('/studio/storico',   (p, ok) => mostra(V.studio, { ...p, sezione: 'storico' }, ok));
router.registra('/studio/esito/:id', (p, ok) => mostra(V.studio, p, ok));
router.registra('/esplora',  (p, ok) => mostra(V.esplora, p, ok));
router.registra('/desideri', (p, ok) => mostra(V.esplora, { ...p, sezione: 'desideri' }, ok));

/* --------------------------------------------------------------- avvio -- */

async function avvia () {
  await ritornoDaOneDrive();

  try {
    await store.carica();
  } catch (e) {
    console.error(e);
    contenitore.innerHTML = `<div class="vuoto"><div class="vuoto__icona">⚠</div>
      <h3>Non riesco ad aprire il database</h3>
      <p>Se stai navigando in incognito, il browser blocca la memoria locale e l'app non può salvare nulla. Prova in una scheda normale.</p></div>`;
    return;
  }

  applicaTema(store.stato.impostazioni.tema);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.stato.impostazioni.tema === 'auto') applicaTema('auto');
  });

  // ombra sotto l'intestazione quando la pagina scorre
  const suScroll = () => testa.classList.toggle('is-staccata', window.scrollY > 4);
  window.addEventListener('scroll', suScroll, { passive: true });
  suScroll();

  await router.avvia();
  registraServiceWorker();

  // sincronizzazione cloud opzionale (Supabase): inerte finché non configurata
  try { await sync.loadPersisted(); sync.initAutoSync(); }
  catch (e) { console.warn('Sync non inizializzato:', e); }
}

/** Se l'indirizzo porta un ?code= veniamo dal consenso Microsoft: chiudiamo
 *  il giro prima di disegnare qualsiasi cosa. Il modulo si carica solo in
 *  quel caso, così chi non usa OneDrive non se lo trova nemmeno in memoria. */
async function ritornoDaOneDrive () {
  if (!/[?&](code|error)=/.test(location.search)) return;
  try {
    const onedrive = await import('./onedrive.js');
    const fatto = await onedrive.completaAccesso();
    if (fatto) avviso('OneDrive collegato.', 'ok', 4000);
  } catch (e) {
    console.warn(e);
    avviso(e.message || 'Collegamento a OneDrive non riuscito.', 'errore', 6000);
  }
}

function registraServiceWorker () {
  if (!('serviceWorker' in navigator)) return;
  // il service worker richiede https (o localhost): sotto file:// non parte
  if (location.protocol === 'file:') {
    console.info('Aperta da file://: il service worker e l\'installazione non sono disponibili.');
    return;
  }
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nuovo = reg.installing;
      if (!nuovo) return;
      nuovo.addEventListener('statechange', () => {
        if (nuovo.state === 'installed' && navigator.serviceWorker.controller) {
          const a = avviso('Nuova versione pronta. Tocca per ricaricare.', 'info', 8000);
          a.style.pointerEvents = 'auto';
          a.style.cursor = 'pointer';
          a.addEventListener('click', () => { nuovo.postMessage('aggiorna-subito'); location.reload(); });
        }
      });
    });
  }).catch(e => console.warn('Service worker non registrato:', e));
}

// se i dati cambiano da un'altra parte dell'app, le viste che lo vogliono
// si riabbonano da sole; qui teniamo solo la tab bar allineata
store.osserva(() => aggiornaTab());

avvia();
