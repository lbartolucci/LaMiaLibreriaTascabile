/* =========================================================================
   catalog.js — interrogazione dei cataloghi pubblici
   Fonte primaria: Open Library (nessuna chiave, CORS aperto, generoso).
   Fallback/arricchimento: Google Books (descrizioni migliori in italiano,
   ma rate limit aggressivo sulle chiamate anonime → mai come fonte primaria).
   Tutte le risposte finiscono in cache su IndexedDB per 7 giorni.
   ========================================================================= */

import { cacheLeggi, cacheScrivi, impostazioni } from './db.js';

const OL = 'https://openlibrary.org';
const OL_COVERS = 'https://covers.openlibrary.org';
const GB = 'https://www.googleapis.com/books/v1/volumes';

const TTL = 7 * 24 * 3600 * 1000;      // 7 giorni
const TIMEOUT = 12000;

export class ErroreRete extends Error {
  constructor (messaggio, causa) {
    super(messaggio);
    this.name = 'ErroreRete';
    this.causa = causa;
  }
}

/** Sei offline? Il valore è indicativo: navigator.onLine dice solo che
 *  esiste un'interfaccia di rete, non che internet funzioni davvero. */
export const offline = () => navigator.onLine === false;

/* -------------------------------------------------- fetch con riprova ---- */

async function prendiJson (url, { tentativi = 3, segnale, distanza = 0 } = {}) {
  if (offline()) throw new ErroreRete('Sei senza connessione: la ricerca nei cataloghi non è disponibile.');

  const inCache = await cacheLeggi(url).catch(() => null);
  if (inCache) return inCache;

  if (distanza) {
    const host = new URL(url).hostname;
    return inCoda(host, distanza, () => scarica(url, { tentativi, segnale }));
  }
  return scarica(url, { tentativi, segnale });
}

async function scarica (url, { tentativi = 3, segnale } = {}) {

  let ultimoErrore = null;
  for (let t = 0; t < tentativi; t++) {
    if (t > 0) await pausa(400 * Math.pow(3, t - 1) + Math.random() * 200);  // backoff esponenziale
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const suAnnullamento = () => ctrl.abort();
    if (segnale) segnale.addEventListener('abort', suAnnullamento, { once: true });
    try {
      const risposta = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (risposta.status === 429 || risposta.status === 503) {
        ultimoErrore = new ErroreRete('Il catalogo è momentaneamente sovraccarico. Riprova fra poco.');
        continue;                                    // vale la pena riprovare
      }
      if (!risposta.ok) throw new ErroreRete(`Il catalogo ha risposto con un errore (${risposta.status}).`);
      const dati = await risposta.json();
      cacheScrivi(url, dati, TTL).catch(() => {});   // se la cache fallisce, pazienza
      return dati;
    } catch (e) {
      if (segnale && segnale.aborted) throw e;       // annullato da noi: non insistere
      ultimoErrore = e.name === 'AbortError'
        ? new ErroreRete('Il catalogo non ha risposto in tempo.')
        : (e instanceof ErroreRete ? e : new ErroreRete('Non riesco a raggiungere il catalogo.', e));
    } finally {
      clearTimeout(timer);
      if (segnale) segnale.removeEventListener('abort', suAnnullamento);
    }
  }
  throw ultimoErrore || new ErroreRete('Ricerca non riuscita.');
}

const pausa = ms => new Promise(r => setTimeout(r, ms));

/* I cataloghi pubblici chiedono garbo: Open Library dichiara circa una
   richiesta al secondo per i client anonimi. Esplora ne fa una decina di
   fila, quindi le mettiamo in coda distanziandole invece di sparare tutto
   insieme e farci rispondere 429. */
const CODE = new Map();
function inCoda (host, distanza, lavoro) {
  const precedente = CODE.get(host) || Promise.resolve(0);
  const mio = precedente.then(async ultimo => {
    const attesa = ultimo ? Math.max(0, distanza - (Date.now() - ultimo)) : 0;
    if (attesa) await pausa(attesa);
    try { return await lavoro(); } finally { CODE.set(host, Promise.resolve(Date.now())); }
  });
  CODE.set(host, mio.then(() => Date.now(), () => Date.now()));
  return mio;
}

/* -------------------------------------------------------- normalizzazione */

/** Forma comune a cui riduciamo i risultati delle due fonti,
 *  così il resto dell'app non deve sapere da dove arrivano. */
function schedaVuota () {
  return {
    fonte: '', chiave: '', titolo: '', sottotitolo: '', autore: [], autoriChiavi: [],
    annoPubblicazione: null, editore: '', numeroPagine: null, isbn: '',
    copertinaUrl: '', generi: [], lingua: '', descrizione: '', edizioni: 0
  };
}

const LINGUE = { ita: 'it', eng: 'en', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', por: 'pt', lat: 'la', gre: 'el', rus: 'ru' };

export function copertinaOpenLibrary (coverId, isbn, taglia = 'M') {
  if (coverId) return `${OL_COVERS}/b/id/${coverId}-${taglia}.jpg`;
  if (isbn) return `${OL_COVERS}/b/isbn/${isbn}-${taglia}.jpg?default=false`;
  return '';
}

function daOpenLibrary (doc) {
  const s = schedaVuota();
  s.fonte = 'openlibrary';
  s.chiave = doc.key || '';
  s.titolo = doc.title || '';
  s.sottotitolo = doc.subtitle || '';
  s.autore = doc.author_name || [];
  s.autoriChiavi = doc.author_key || [];
  s.annoPubblicazione = doc.first_publish_year || null;
  s.editore = (doc.publisher && doc.publisher[0]) || '';
  s.numeroPagine = doc.number_of_pages_median || null;
  s.isbn = (doc.isbn && doc.isbn.find(x => x.length === 13)) || (doc.isbn && doc.isbn[0]) || '';
  s.copertinaUrl = copertinaOpenLibrary(doc.cover_i, s.isbn);
  s.generi = (doc.subject || []).slice(0, 8);
  s.lingua = LINGUE[(doc.language || [])[0]] || (doc.language || [])[0] || '';
  s.descrizione = Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : (doc.first_sentence || '');
  s.edizioni = doc.edition_count || 0;
  return s;
}

function daGoogleBooks (item) {
  const v = item.volumeInfo || {};
  const s = schedaVuota();
  s.fonte = 'google';
  s.chiave = item.id || '';
  s.titolo = v.title || '';
  s.sottotitolo = v.subtitle || '';
  s.autore = v.authors || [];
  s.annoPubblicazione = v.publishedDate ? parseInt(String(v.publishedDate).slice(0, 4), 10) || null : null;
  s.editore = v.publisher || '';
  s.numeroPagine = v.pageCount || null;
  const ids = v.industryIdentifiers || [];
  const i13 = ids.find(x => x.type === 'ISBN_13');
  const i10 = ids.find(x => x.type === 'ISBN_10');
  s.isbn = (i13 && i13.identifier) || (i10 && i10.identifier) || '';
  // le miniature arrivano spesso in http e con il bordo arricciato: ripuliamo
  const img = (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || '';
  s.copertinaUrl = img ? img.replace(/^http:/, 'https:').replace(/&edge=curl/, '') : '';
  s.generi = v.categories || [];
  s.lingua = v.language || '';
  s.descrizione = v.description || '';
  return s;
}

/* ---------------------------------------------------------- ricerche ----- */

/** Ricerca libera per titolo/autore. Prima Open Library; se non trova nulla
 *  (o se la lingua richiesta è l'italiano e i risultati sono pochi),
 *  integra con Google Books. */
export async function cercaLibri (query, { limite = 20, segnale } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const campi = [
    'key', 'title', 'subtitle', 'author_name', 'author_key', 'first_publish_year',
    'publisher', 'number_of_pages_median', 'isbn', 'cover_i', 'subject', 'language',
    'edition_count', 'first_sentence'
  ].join(',');

  let risultati = [];
  let erroreOL = null;
  try {
    const dati = await prendiJson(
      `${OL}/search.json?q=${encodeURIComponent(q)}&limit=${limite}&fields=${campi}`,
      { segnale }
    );
    risultati = (dati.docs || []).map(daOpenLibrary).filter(s => s.titolo);
  } catch (e) { erroreOL = e; }

  if (risultati.length < 5) {
    try {
      const gb = await cercaGoogle(q, { limite, segnale });
      risultati = unisciSchede(risultati, gb);
    } catch (e) {
      if (!risultati.length) throw erroreOL || e;
    }
  }
  if (!risultati.length && erroreOL) throw erroreOL;
  return risultati.slice(0, limite);
}

export async function cercaGoogle (query, { limite = 20, segnale, lingua = '' } = {}) {
  const imp = await impostazioni();
  const chiave = imp.googleBooksApiKey ? `&key=${encodeURIComponent(imp.googleBooksApiKey)}` : '';
  const lang = lingua ? `&langRestrict=${encodeURIComponent(lingua)}` : '';
  const url = `${GB}?q=${encodeURIComponent(query)}&maxResults=${Math.min(40, limite)}&printType=books${lang}${chiave}`;
  const dati = await prendiJson(url, { segnale, tentativi: 2 });
  return (dati.items || []).map(daGoogleBooks).filter(s => s.titolo);
}

/** Unisce due elenchi evitando i doppioni (stesso ISBN, o stesso titolo+autore). */
function unisciSchede (a, b) {
  const chiaveConfronto = s => (s.isbn || `${s.titolo}|${(s.autore[0] || '')}`).toLowerCase().replace(/\s+/g, '');
  const viste = new Set(a.map(chiaveConfronto));
  const fusi = [...a];
  b.forEach(s => {
    const k = chiaveConfronto(s);
    if (viste.has(k)) {
      // arricchiamo la scheda già presente con ciò che le manca
      const esistente = fusi.find(x => chiaveConfronto(x) === k);
      if (esistente) {
        if (!esistente.descrizione && s.descrizione) esistente.descrizione = s.descrizione;
        if (!esistente.copertinaUrl && s.copertinaUrl) esistente.copertinaUrl = s.copertinaUrl;
        if (!esistente.numeroPagine && s.numeroPagine) esistente.numeroPagine = s.numeroPagine;
        if (!esistente.editore && s.editore) esistente.editore = s.editore;
      }
    } else { viste.add(k); fusi.push(s); }
  });
  return fusi;
}

/** Cerca un'edizione precisa dall'ISBN. */
export async function perIsbn (isbnGrezzo, { segnale } = {}) {
  const isbn = String(isbnGrezzo || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (!/^(\d{9}[\dX]|\d{13})$/.test(isbn)) {
    throw new ErroreRete('L\'ISBN deve avere 10 o 13 cifre.');
  }
  // 1) l'endpoint /api/books restituisce dati di edizione già normalizzati
  try {
    const dati = await prendiJson(
      `${OL}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { segnale, tentativi: 2 }
    );
    const v = dati[`ISBN:${isbn}`];
    if (v) {
      const s = schedaVuota();
      s.fonte = 'openlibrary';
      s.chiave = v.key || '';
      s.titolo = v.title || '';
      s.sottotitolo = v.subtitle || '';
      s.autore = (v.authors || []).map(a => a.name).filter(Boolean);
      s.annoPubblicazione = v.publish_date ? parseInt(String(v.publish_date).match(/\d{4}/)?.[0], 10) || null : null;
      s.editore = (v.publishers || []).map(p => p.name)[0] || '';
      s.numeroPagine = v.number_of_pages || null;
      s.isbn = isbn;
      s.copertinaUrl = (v.cover && (v.cover.medium || v.cover.large || v.cover.small)) || copertinaOpenLibrary(null, isbn);
      s.generi = (v.subjects || []).map(x => x.name).filter(Boolean).slice(0, 8);
      s.descrizione = (v.excerpts && v.excerpts[0] && v.excerpts[0].text) || '';
      return s;
    }
  } catch (_) { /* passiamo al piano B */ }

  // 2) piano B: Google Books, che spesso ha la descrizione in italiano
  const gb = await cercaGoogle(`isbn:${isbn}`, { limite: 1, segnale });
  if (gb.length) return gb[0];
  throw new ErroreRete('Nessun libro trovato con questo ISBN.');
}

/** Descrizione più ricca per un libro già scelto (usata per precompilare la trama). */
export async function descrizioneEstesa (scheda, { segnale } = {}) {
  if (scheda.descrizione && scheda.descrizione.length > 120) return scheda.descrizione;
  // Open Library: la descrizione sta sull'opera, non nei risultati di ricerca
  if (scheda.fonte === 'openlibrary' && scheda.chiave.startsWith('/works/')) {
    try {
      const opera = await prendiJson(`${OL}${scheda.chiave}.json`, { segnale, tentativi: 2 });
      const d = opera.description;
      const testo = typeof d === 'string' ? d : (d && d.value) || '';
      if (testo) return testo;
    } catch (_) {}
  }
  // altrimenti proviamo con Google Books partendo da titolo e autore
  try {
    const q = scheda.isbn ? `isbn:${scheda.isbn}`
      : `intitle:${scheda.titolo}${scheda.autore[0] ? ` inauthor:${scheda.autore[0]}` : ''}`;
    const gb = await cercaGoogle(q, { limite: 3, segnale });
    const conDescrizione = gb.find(x => x.descrizione && x.descrizione.length > 60);
    if (conDescrizione) return conDescrizione.descrizione;
  } catch (_) {}
  return scheda.descrizione || '';
}

/* ------------------------------------------- ricerche per la sezione Esplora */

/** Campi che chiediamo a Open Library nelle ricerche: senza `fields` la
 *  risposta è enorme e lenta. */
const CAMPI_RICERCA = [
  'key', 'title', 'subtitle', 'author_name', 'author_key', 'first_publish_year',
  'publisher', 'number_of_pages_median', 'isbn', 'cover_i', 'subject', 'language',
  'edition_count', 'first_sentence'
].join(',');

/** Le opere di un autore ordinate per numero di edizioni, che è il miglior
 *  indizio di rilevanza che Open Library ci dia gratis. */
export async function opereDiAutore (nome, { limite = 24, segnale, distanza = 900 } = {}) {
  const dati = await prendiJson(
    `${OL}/search.json?author=${encodeURIComponent(nome)}&limit=${limite}&fields=${CAMPI_RICERCA}`,
    { segnale, distanza, tentativi: 2 }
  );
  return (dati.docs || []).map(daOpenLibrary)
    .filter(s => s.titolo)
    .sort((a, b) => (b.edizioni || 0) - (a.edizioni || 0));
}

/** Ricerca per soggetto con il motore di ricerca (non l'endpoint /subjects):
 *  funziona anche con soggetti composti e restituisce il conteggio edizioni. */
export async function cercaPerSoggetto (soggetto, { limite = 20, segnale, distanza = 900 } = {}) {
  const dati = await prendiJson(
    `${OL}/search.json?q=${encodeURIComponent(`subject:"${soggetto}"`)}&limit=${limite}&sort=editions&fields=${CAMPI_RICERCA}`,
    { segnale, distanza, tentativi: 2 }
  );
  return (dati.docs || []).map(daOpenLibrary).filter(s => s.titolo);
}

export async function cercaAutori (nome, { limite = 10, segnale } = {}) {
  const dati = await prendiJson(`${OL}/search/authors.json?q=${encodeURIComponent(nome)}&limit=${limite}`, { segnale });
  return (dati.docs || []).map(d => ({
    chiave: d.key, nome: d.name, opere: d.work_count || 0,
    operaNota: d.top_work || '', soggetti: d.top_subjects || []
  }));
}

export async function opereAutore (chiaveAutore, { limite = 50, segnale } = {}) {
  const k = String(chiaveAutore).replace('/authors/', '');
  const dati = await prendiJson(`${OL}/authors/${encodeURIComponent(k)}/works.json?limit=${limite}`, { segnale });
  return (dati.entries || []).map(o => {
    const s = schedaVuota();
    s.fonte = 'openlibrary';
    s.chiave = o.key || '';
    s.titolo = o.title || '';
    s.copertinaUrl = (o.covers && o.covers[0] > 0) ? copertinaOpenLibrary(o.covers[0]) : '';
    s.generi = (o.subjects || []).slice(0, 6);
    const d = o.description;
    s.descrizione = typeof d === 'string' ? d : (d && d.value) || '';
    s.annoPubblicazione = o.first_publish_date ? parseInt(String(o.first_publish_date).match(/\d{4}/)?.[0], 10) || null : null;
    return s;
  }).filter(s => s.titolo);
}

export async function perSoggetto (soggetto, { limite = 20, segnale } = {}) {
  const k = String(soggetto).toLowerCase().trim().replace(/\s+/g, '_');
  const dati = await prendiJson(`${OL}/subjects/${encodeURIComponent(k)}.json?limit=${limite}`, { segnale });
  return (dati.works || []).map(o => {
    const s = schedaVuota();
    s.fonte = 'openlibrary';
    s.chiave = o.key || '';
    s.titolo = o.title || '';
    s.autore = (o.authors || []).map(a => a.name).filter(Boolean);
    s.autoriChiavi = (o.authors || []).map(a => (a.key || '').replace('/authors/', '')).filter(Boolean);
    s.annoPubblicazione = o.first_publish_year || null;
    s.copertinaUrl = o.cover_id ? copertinaOpenLibrary(o.cover_id) : '';
    s.generi = (o.subject || []).slice(0, 6);
    s.edizioni = o.edition_count || 0;
    return s;
  }).filter(s => s.titolo);
}

/* --------------------------------------------------------- copertine ----- */

/** Scarica una copertina e la converte in base64, così resta disponibile
 *  offline e finisce nel backup. Se fallisce, teniamo l'URL remoto. */
export async function copertinaInBase64 (url, { maxLato = 400 } = {}) {
  if (!url) return '';
  const risposta = await fetch(url, { mode: 'cors' });
  if (!risposta.ok) throw new ErroreRete('Copertina non scaricabile.');
  const blob = await risposta.blob();
  if (blob.size < 1000) throw new ErroreRete('Copertina non disponibile.');  // OL restituisce un pixel vuoto
  const bitmap = await createImageBitmap(blob);
  const scala = Math.min(1, maxLato / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scala), h = Math.round(bitmap.height * scala);
  const tela = document.createElement('canvas');
  tela.width = w; tela.height = h;
  tela.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close && bitmap.close();
  return tela.toDataURL('image/jpeg', 0.82);
}
