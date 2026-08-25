/* =========================================================================
   db.js — persistenza su IndexedDB
   Perché IndexedDB e non localStorage: le citazioni e soprattutto le
   copertine in base64 superano facilmente i ~5 MB di quota di localStorage,
   che per giunta è sincrono e blocca l'interfaccia.
   ========================================================================= */

const NOME_DB = 'libreria-tascabile';
const VERSIONE_DB = 1;

/** Versione dello *schema logico* dei dati (finisce nei file di backup).
 *  Va alzata quando cambia la forma dei record, non quando cambia l'app. */
export const SCHEMA_VERSION = 1;

/** Tutti gli store vengono creati subito, anche quelli che serviranno alle
 *  fasi successive (quiz, desideri): così non serve una migrazione di
 *  IndexedDB più avanti, che sul telefono è la cosa più delicata da fare. */
const STORE = {
  libri: { keyPath: 'id', indici: [
    ['annoLettura', 'annoLettura'],
    ['stato', 'stato'],
    ['updatedAt', 'updatedAt'],
    ['autoriIdx', 'autoriIdx', { multiEntry: true }],
    ['generiIdx', 'generiIdx', { multiEntry: true }],
    ['temiIdx', 'temiIdx', { multiEntry: true }]
  ]},
  citazioni: { keyPath: 'id', indici: [
    ['libroId', 'libroId'],
    ['prossimaRevisione', 'srs.prossimaRevisione'],
    ['updatedAt', 'updatedAt'],
    ['tagIdx', 'tagIdx', { multiEntry: true }]
  ]},
  collegamenti: { keyPath: 'id', indici: [
    ['libroA_id', 'libroA_id'],
    ['libroB_id', 'libroB_id']
  ]},
  collegamentiCitazione: { keyPath: 'id', indici: [
    ['citazioneA_id', 'citazioneA_id'],
    ['citazioneB_id', 'citazioneB_id']
  ]},
  sessioni: { keyPath: 'id', indici: [['data', 'data']] },
  desideri: { keyPath: 'id', indici: [['aggiuntoIl', 'aggiuntoIl']] },
  scartati: { keyPath: 'id' },              // suggerimenti rifiutati in Esplora
  cache: { keyPath: 'chiave' },             // risposte delle API con scadenza
  meta: { keyPath: 'chiave' }               // impostazioni e contatori
};

let _db = null;

/** Apre (e se serve crea) il database. Idempotente. */
export function apri () {
  if (_db) return Promise.resolve(_db);
  return new Promise((risolvi, rifiuta) => {
    if (!('indexedDB' in globalThis)) {
      rifiuta(new Error('Questo browser non supporta IndexedDB.'));
      return;
    }
    const req = indexedDB.open(NOME_DB, VERSIONE_DB);
    req.onupgradeneeded = ev => {
      const db = req.result;
      for (const [nome, def] of Object.entries(STORE)) {
        const store = db.objectStoreNames.contains(nome)
          ? req.transaction.objectStore(nome)
          : db.createObjectStore(nome, { keyPath: def.keyPath });
        for (const [nomeIdx, percorso, opz] of (def.indici || [])) {
          if (!store.indexNames.contains(nomeIdx)) store.createIndex(nomeIdx, percorso, opz || {});
        }
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      risolvi(_db);
    };
    req.onerror = () => rifiuta(req.error || new Error('Impossibile aprire il database.'));
    req.onblocked = () => rifiuta(new Error('Database bloccato da un\'altra scheda aperta.'));
  });
}

/* ---------------------------------------------------------------- primitive */

function tx (stores, modo = 'readonly') {
  return apri().then(db => db.transaction(stores, modo));
}

function attesa (req) {
  return new Promise((ok, ko) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}

export async function tutti (nomeStore) {
  const t = await tx(nomeStore);
  return attesa(t.objectStore(nomeStore).getAll());
}

export async function leggi (nomeStore, id) {
  const t = await tx(nomeStore);
  return attesa(t.objectStore(nomeStore).get(id));
}

export async function perIndice (nomeStore, indice, valore) {
  const t = await tx(nomeStore);
  return attesa(t.objectStore(nomeStore).index(indice).getAll(valore));
}

export async function scrivi (nomeStore, record) {
  const t = await tx(nomeStore, 'readwrite');
  const r = await attesa(t.objectStore(nomeStore).put(record));
  await fine(t);
  return r;
}

export async function scriviMolti (nomeStore, records) {
  if (!records.length) return;
  const t = await tx(nomeStore, 'readwrite');
  const s = t.objectStore(nomeStore);
  records.forEach(r => s.put(r));
  await fine(t);
}

export async function cancella (nomeStore, id) {
  const t = await tx(nomeStore, 'readwrite');
  await attesa(t.objectStore(nomeStore).delete(id));
  await fine(t);
}

export async function svuota (nomeStore) {
  const t = await tx(nomeStore, 'readwrite');
  await attesa(t.objectStore(nomeStore).clear());
  await fine(t);
}

function fine (transazione) {
  return new Promise((ok, ko) => {
    transazione.oncomplete = () => ok();
    transazione.onerror = () => ko(transazione.error);
    transazione.onabort = () => ko(transazione.error || new Error('Transazione annullata'));
  });
}

/** Elenco degli store gestiti (serve a export/import e allo svuotamento). */
export const NOMI_STORE = Object.keys(STORE);

/* ------------------------------------------------------- meta e impostazioni */

const IMPOSTAZIONI_DEFAULT = {
  tema: 'auto',                 // 'auto' | 'chiaro' | 'scuro'
  vistaLibreria: 'griglia',     // 'griglia' | 'lista'
  googleBooksApiKey: '',        // opzionale, per alzare il rate limit
  ultimoBackup: null,
  clientIdOneDrive: '',
  suggerimentiCollegamento: true,
  dettaturaPunteggiatura: true,  // «virgola», «punto», «a capo» diventano segni
  quiz: null                     // ultima configurazione dello Studio
};

export async function impostazioni () {
  const rec = await leggi('meta', 'impostazioni');
  return { ...IMPOSTAZIONI_DEFAULT, ...(rec ? rec.valore : {}) };
}

export async function salvaImpostazioni (parziali) {
  const attuali = await impostazioni();
  const nuove = { ...attuali, ...parziali };
  await scrivi('meta', { chiave: 'impostazioni', valore: nuove });
  return nuove;
}

/** Contatore globale di revisione del database: aumenta a ogni scrittura
 *  significativa. Serve al backup per capire se qualcosa è cambiato. */
export async function incrementaRevisione () {
  const rec = await leggi('meta', 'revisione');
  const n = (rec && rec.valore ? rec.valore : 0) + 1;
  await scrivi('meta', { chiave: 'revisione', valore: n });
  return n;
}

export async function revisione () {
  const rec = await leggi('meta', 'revisione');
  return rec ? rec.valore : 0;
}

/* --------------------------------------------------------- cache delle API */

/** Legge dalla cache se non è scaduta, altrimenti null. */
export async function cacheLeggi (chiave) {
  const rec = await leggi('cache', chiave);
  if (!rec) return null;
  if (rec.scadenza && rec.scadenza < Date.now()) {
    cancella('cache', chiave).catch(() => {});
    return null;
  }
  return rec.valore;
}

export async function cacheScrivi (chiave, valore, ttlMs = 7 * 24 * 3600 * 1000) {
  await scrivi('cache', { chiave, valore, scadenza: Date.now() + ttlMs, salvatoIl: Date.now() });
}

export async function cacheSvuota () { await svuota('cache'); }

/* --------------------------------------------------- operazioni di dominio */

/** Cancella un libro e tutto ciò che vi è appeso: citazioni e collegamenti.
 *  Fatto in un'unica transazione, così o va tutto o non va niente. */
export async function eliminaLibroCompleto (libroId) {
  const db = await apri();
  const t = db.transaction(['libri', 'citazioni', 'collegamenti', 'collegamentiCitazione'], 'readwrite');
  const citazioni = await attesa(t.objectStore('citazioni').index('libroId').getAll(libroId));
  const idCitazioni = new Set(citazioni.map(c => c.id));

  citazioni.forEach(c => t.objectStore('citazioni').delete(c.id));

  const colStore = t.objectStore('collegamenti');
  const [a, b] = await Promise.all([
    attesa(colStore.index('libroA_id').getAll(libroId)),
    attesa(colStore.index('libroB_id').getAll(libroId))
  ]);
  [...a, ...b].forEach(c => colStore.delete(c.id));

  // collegamenti fra citazioni che coinvolgono le citazioni appena rimosse
  const ccStore = t.objectStore('collegamentiCitazione');
  const tutteCc = await attesa(ccStore.getAll());
  tutteCc.forEach(cc => {
    if (idCitazioni.has(cc.citazioneA_id) || idCitazioni.has(cc.citazioneB_id)) ccStore.delete(cc.id);
  });

  t.objectStore('libri').delete(libroId);
  await fine(t);
  await incrementaRevisione();
}

/** Tutti i collegamenti che toccano un libro, in un colpo solo. */
export async function collegamentiDi (libroId) {
  const [a, b] = await Promise.all([
    perIndice('collegamenti', 'libroA_id', libroId),
    perIndice('collegamenti', 'libroB_id', libroId)
  ]);
  const visti = new Set();
  return [...a, ...b].filter(c => (visti.has(c.id) ? false : visti.add(c.id)));
}

export function citazioniDi (libroId) {
  return perIndice('citazioni', 'libroId', libroId);
}

/** Snapshot completo del database, pronto per essere serializzato in JSON. */
export async function esportaTutto () {
  const dati = {};
  for (const nome of NOMI_STORE) {
    if (nome === 'cache') continue;           // la cache non va nel backup
    dati[nome] = await tutti(nome);
  }
  return {
    app: 'La mia libreria tascabile',
    schemaVersion: SCHEMA_VERSION,
    esportatoIl: new Date().toISOString(),
    revisione: await revisione(),
    dati
  };
}

/** Svuota tutti gli store tranne le impostazioni. */
export async function azzeraDati ({ tieniImpostazioni = true } = {}) {
  const imp = tieniImpostazioni ? await impostazioni() : null;
  for (const nome of NOMI_STORE) await svuota(nome);
  if (imp) await scrivi('meta', { chiave: 'impostazioni', valore: imp });
  await incrementaRevisione();
}
