/* =========================================================================
   models.js — forma dei dati, creazione, validazione, normalizzazione
   Ogni record ha: id (UUID v4), createdAt, updatedAt e _rev (contatore di
   versione locale del singolo record).
   ========================================================================= */

import { normalizza } from './utils/text.js';

/** UUID v4. Usa crypto.randomUUID dove c'è (tutti i browser recenti),
 *  altrimenti ripiega su getRandomValues. */
export function uuid () {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0'));
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10).join('')}`;
}

export const ora = () => new Date().toISOString();

export const STATI_LIBRO = ['letto', 'in lettura', 'abbandonato', 'da rileggere'];

export const TIPI_COLLEGAMENTO = [
  { id: 'tema',          etichetta: 'Stesso tema',    colore: '#8A5A34' },
  { id: 'stile',         etichetta: 'Stile affine',   colore: '#4C6B5B' },
  { id: 'contrasto',     etichetta: 'In contrasto',   colore: '#9C3D3D' },
  { id: 'stesso autore', etichetta: 'Stesso autore',  colore: '#5A6B8A' },
  { id: 'continuazione', etichetta: 'Continuazione',  colore: '#7A5C8A' },
  { id: 'personale',     etichetta: 'Legame mio',     colore: '#B08320' }
];

export const TIPI_ELEMENTO = [
  { id: 'concetto',    etichetta: 'Concetto' },
  { id: 'personaggio', etichetta: 'Personaggio' },
  { id: 'snodo',       etichetta: 'Snodo narrativo' },
  { id: 'idea',        etichetta: 'Idea portante' }
];

/* --------------------------------------------------------------- LIBRO ---- */

export function nuovoLibro (parziale = {}) {
  const adesso = ora();
  const l = {
    id: parziale.id || uuid(),
    titolo: '',
    sottotitolo: '',
    autore: [],
    annoPubblicazione: null,
    annoLettura: null,
    editore: '',
    lingua: 'it',
    numeroPagine: null,
    isbn: '',
    copertinaUrl: '',
    copertinaBase64: '',
    generi: [],
    temi: [],
    valutazione: 0,               // 0–5, passi di 0,5
    stato: 'letto',
    trama: '',
    tramaDaCatalogo: false,       // marcata come "da catalogo — modifica pure"
    elementiChiave: [],           // [{id, testo, tipo}]
    impressionePersonale: '',
    srs: srsIniziale(),           // anche i libri hanno il loro ripasso (fase 2)
    origine: null,                // {fonte:'openlibrary'|'google'|'manuale', chiave}
    createdAt: adesso,
    updatedAt: adesso,
    _rev: 0,
    ...parziale
  };
  return normalizzaLibro(l);
}

/** Ripulisce e ricalcola i campi derivati (gli indici di ricerca).
 *  Va chiamata prima di ogni salvataggio. */
export function normalizzaLibro (l) {
  l.titolo = String(l.titolo || '').trim();
  l.sottotitolo = String(l.sottotitolo || '').trim();
  l.autore = pulisciLista(l.autore);
  l.generi = pulisciLista(l.generi);
  l.temi = pulisciLista(l.temi);
  l.editore = String(l.editore || '').trim();
  l.isbn = String(l.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  l.annoPubblicazione = intOnull(l.annoPubblicazione);
  l.annoLettura = intOnull(l.annoLettura);
  l.numeroPagine = intOnull(l.numeroPagine);
  l.valutazione = Math.max(0, Math.min(5, Math.round((Number(l.valutazione) || 0) * 2) / 2));
  if (!STATI_LIBRO.includes(l.stato)) l.stato = 'letto';
  l.trama = String(l.trama || '').slice(0, 800);
  l.impressionePersonale = String(l.impressionePersonale || '');
  l.elementiChiave = (l.elementiChiave || [])
    .map(e => (typeof e === 'string' ? { id: uuid(), testo: e, tipo: '' } : e))
    .filter(e => e && String(e.testo || '').trim())
    .map(e => ({ id: e.id || uuid(), testo: String(e.testo).trim(), tipo: e.tipo || '' }));
  l.srs = { ...srsIniziale(), ...(l.srs || {}) };
  // indici per la ricerca per autore/genere/tema
  l.autoriIdx = l.autore.map(normalizza).filter(Boolean);
  l.generiIdx = l.generi.map(normalizza).filter(Boolean);
  l.temiIdx = l.temi.map(normalizza).filter(Boolean);
  return l;
}

/* ------------------------------------------------------------ CITAZIONE ---- */

export function nuovaCitazione (parziale = {}) {
  const adesso = ora();
  const c = {
    id: parziale.id || uuid(),
    libroId: '',
    testo: '',
    pagina: null,
    capitolo: '',
    contesto: '',
    tag: [],
    preferita: false,
    srs: srsIniziale(),
    createdAt: adesso,
    updatedAt: adesso,
    _rev: 0,
    ...parziale
  };
  return normalizzaCitazione(c);
}

export function srsIniziale () {
  return { livello: 0, prossimaRevisione: null, successi: 0, errori: 0, ultimaRevisione: null };
}

export function normalizzaCitazione (c) {
  c.testo = String(c.testo || '').trim();
  c.capitolo = String(c.capitolo || '').trim();
  c.contesto = String(c.contesto || '').trim();
  c.pagina = intOnull(c.pagina);
  c.tag = pulisciLista(c.tag);
  c.preferita = !!c.preferita;
  c.srs = { ...srsIniziale(), ...(c.srs || {}) };
  c.tagIdx = c.tag.map(normalizza).filter(Boolean);
  return c;
}

/* --------------------------------------------------------- COLLEGAMENTO ---- */

export function nuovoCollegamento (parziale = {}) {
  const adesso = ora();
  const c = {
    id: parziale.id || uuid(),
    libroA_id: '',
    libroB_id: '',
    tipo: 'tema',
    nota: '',
    forza: 2,                 // 1 debole, 2 medio, 3 forte
    bidirezionale: true,
    createdAt: adesso,
    updatedAt: adesso,
    _rev: 0,
    ...parziale
  };
  c.nota = String(c.nota || '').trim();
  c.forza = Math.max(1, Math.min(3, parseInt(c.forza, 10) || 2));
  if (!TIPI_COLLEGAMENTO.some(t => t.id === c.tipo)) c.tipo = 'tema';
  return c;
}

/* ----------------------------------------------------------- validazione ---- */

/** Ritorna un array di messaggi in italiano; vuoto se il record va bene. */
export function validaLibro (l) {
  const err = [];
  if (!l.titolo || !l.titolo.trim()) err.push('Il titolo è obbligatorio.');
  if (l.titolo && l.titolo.length > 300) err.push('Il titolo è troppo lungo.');
  if (l.annoPubblicazione != null && (l.annoPubblicazione < -3000 || l.annoPubblicazione > 2200))
    err.push('Anno di pubblicazione non plausibile.');
  if (l.annoLettura != null && (l.annoLettura < 1900 || l.annoLettura > new Date().getFullYear() + 1))
    err.push('Anno di lettura non plausibile.');
  if (l.numeroPagine != null && (l.numeroPagine < 1 || l.numeroPagine > 20000))
    err.push('Numero di pagine non plausibile.');
  if (l.isbn && !/^(\d{9}[\dX]|\d{13})$/.test(l.isbn))
    err.push('L\'ISBN deve avere 10 o 13 cifre.');
  return err;
}

export function validaCitazione (c) {
  const err = [];
  if (!c.testo || c.testo.length < 2) err.push('La citazione non può essere vuota.');
  if (c.testo && c.testo.length > 5000) err.push('La citazione è troppo lunga (max 5000 caratteri).');
  if (!c.libroId) err.push('La citazione deve appartenere a un libro.');
  if (c.pagina != null && (c.pagina < 0 || c.pagina > 20000)) err.push('Numero di pagina non plausibile.');
  return err;
}

export function validaCollegamento (c, libriEsistenti) {
  const err = [];
  if (!c.libroA_id || !c.libroB_id) err.push('Servono due libri.');
  if (c.libroA_id === c.libroB_id) err.push('Non puoi collegare un libro a sé stesso.');
  if (libriEsistenti) {
    const ids = new Set(libriEsistenti.map(l => l.id));
    if (!ids.has(c.libroA_id) || !ids.has(c.libroB_id)) err.push('Uno dei due libri non esiste più.');
  }
  return err;
}

/* -------------------------------------------------------------- utilità ---- */

/** Marca un record come modificato: alza _rev e aggiorna updatedAt. */
export function tocca (record) {
  record.updatedAt = ora();
  record._rev = (record._rev || 0) + 1;
  return record;
}

function pulisciLista (v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,;]/);
  const visti = new Set();
  return arr
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .filter(x => {
      const k = normalizza(x);
      if (visti.has(k)) return false;
      visti.add(k);
      return true;
    })
    .slice(0, 40);
}

function intOnull (v) {
  if (v === '' || v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------------- errori ---- */

/** Errore che porta con sé l'elenco dei messaggi da mostrare nel form. */
export class ErroreValidazione extends Error {
  constructor (errori) {
    super(errori.join(' '));
    this.name = 'ErroreValidazione';
    this.errori = errori;
  }
}

/* ------------------------------------------------- migrazione dei backup ---- */

/** Porta un file di backup alla forma corrente. Oggi c'è un solo schema,
 *  ma la funzione esiste già così i backup di domani resteranno leggibili. */
export function migraBackup (backup) {
  if (!backup || typeof backup !== 'object') throw new Error('File non riconosciuto.');
  const v = backup.schemaVersion || 1;
  if (v > 1) throw new Error(`Il file è stato creato con una versione più recente dell'app (schema ${v}).`);
  const dati = backup.dati || {};
  // difese minime: campi derivati ricalcolati, record senza id scartati
  dati.libri = (dati.libri || []).filter(x => x && x.id).map(normalizzaLibro);
  dati.citazioni = (dati.citazioni || []).filter(x => x && x.id).map(normalizzaCitazione);
  dati.collegamenti = (dati.collegamenti || []).filter(x => x && x.id && x.libroA_id && x.libroB_id);
  return { ...backup, schemaVersion: 1, dati };
}
