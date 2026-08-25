/* =========================================================================
   store.js — stato dell'applicazione in memoria
   La libreria di una persona sta in RAM senza problemi (qualche centinaio di
   libri, qualche migliaio di citazioni): teniamo tutto in memoria per avere
   ricerca, filtri e grafo istantanei, e usiamo IndexedDB come deposito.
   Ogni modifica passa da qui, così l'interfaccia si aggiorna sempre.
   ========================================================================= */

import * as db from './db.js';
import {
  normalizzaLibro, normalizzaCitazione, tocca,
  validaLibro, validaCitazione, validaCollegamento, ErroreValidazione
} from './models.js';

export { ErroreValidazione };

export const stato = {
  libri: [],
  citazioni: [],
  collegamenti: [],
  desideri: [],
  scartati: [],
  sessioni: [],
  impostazioni: {},
  caricato: false
};

/* ------------------------------------------------------- bus degli eventi */

const ascoltatori = new Set();

/** Registra una funzione chiamata a ogni modifica dei dati.
 *  Ritorna la funzione per disiscriversi. */
export function osserva (fn) {
  ascoltatori.add(fn);
  return () => ascoltatori.delete(fn);
}

function annuncia (tipo, dettaglio) {
  ascoltatori.forEach(fn => {
    try { fn(tipo, dettaglio); } catch (e) { console.error('Ascoltatore in errore:', e); }
  });
}

/* ------------------------------------------------------------ caricamento */

export async function carica () {
  const [libri, citazioni, collegamenti, desideri, scartati, sessioni, imp] = await Promise.all([
    db.tutti('libri'), db.tutti('citazioni'), db.tutti('collegamenti'),
    db.tutti('desideri'), db.tutti('scartati'), db.tutti('sessioni'),
    db.impostazioni()
  ]);
  stato.libri = libri;
  stato.citazioni = citazioni;
  stato.collegamenti = collegamenti;
  stato.desideri = desideri;
  stato.scartati = scartati;
  stato.sessioni = sessioni;
  stato.impostazioni = imp;
  stato.caricato = true;
  annuncia('caricato');
  return stato;
}

/* ------------------------------------------------------------------ libri */

export function libro (id) { return stato.libri.find(l => l.id === id) || null; }

export async function salvaLibro (l) {
  normalizzaLibro(l);
  const errori = validaLibro(l);
  if (errori.length) throw new ErroreValidazione(errori);
  tocca(l);
  await db.scrivi('libri', l);
  const i = stato.libri.findIndex(x => x.id === l.id);
  if (i >= 0) stato.libri[i] = l; else stato.libri.push(l);
  await db.incrementaRevisione();
  annuncia('libro', l);
  return l;
}

export async function eliminaLibro (id) {
  await db.eliminaLibroCompleto(id);
  stato.libri = stato.libri.filter(l => l.id !== id);
  stato.citazioni = stato.citazioni.filter(c => c.libroId !== id);
  stato.collegamenti = stato.collegamenti.filter(c => c.libroA_id !== id && c.libroB_id !== id);
  annuncia('libro-eliminato', id);
}

/* -------------------------------------------------------------- citazioni */

export function citazione (id) { return stato.citazioni.find(c => c.id === id) || null; }

export function citazioniDi (libroId) {
  return stato.citazioni
    .filter(c => c.libroId === libroId)
    .sort((a, b) => (a.pagina ?? 1e9) - (b.pagina ?? 1e9) || a.createdAt.localeCompare(b.createdAt));
}

export async function salvaCitazione (c) {
  normalizzaCitazione(c);
  const errori = validaCitazione(c);
  if (errori.length) throw new ErroreValidazione(errori);
  tocca(c);
  await db.scrivi('citazioni', c);
  const i = stato.citazioni.findIndex(x => x.id === c.id);
  if (i >= 0) stato.citazioni[i] = c; else stato.citazioni.push(c);
  await db.incrementaRevisione();
  annuncia('citazione', c);
  return c;
}

export async function eliminaCitazione (id) {
  await db.cancella('citazioni', id);
  stato.citazioni = stato.citazioni.filter(c => c.id !== id);
  await db.incrementaRevisione();
  annuncia('citazione-eliminata', id);
}

/* ----------------------------------------------------------- collegamenti */

export function collegamentiDi (libroId) {
  return stato.collegamenti.filter(c => c.libroA_id === libroId || c.libroB_id === libroId);
}

/** Dato un collegamento e un libro, restituisce l'altro capo. */
export function altroCapo (collegamento, libroId) {
  const id = collegamento.libroA_id === libroId ? collegamento.libroB_id : collegamento.libroA_id;
  return libro(id);
}

export function esisteCollegamento (a, b) {
  return stato.collegamenti.find(c =>
    (c.libroA_id === a && c.libroB_id === b) || (c.libroA_id === b && c.libroB_id === a)
  ) || null;
}

export async function salvaCollegamento (c) {
  const errori = validaCollegamento(c, stato.libri);
  if (errori.length) throw new ErroreValidazione(errori);
  const doppione = esisteCollegamento(c.libroA_id, c.libroB_id);
  if (doppione && doppione.id !== c.id) {
    throw new ErroreValidazione(['Questi due libri sono già collegati.']);
  }
  tocca(c);
  await db.scrivi('collegamenti', c);
  const i = stato.collegamenti.findIndex(x => x.id === c.id);
  if (i >= 0) stato.collegamenti[i] = c; else stato.collegamenti.push(c);
  await db.incrementaRevisione();
  annuncia('collegamento', c);
  return c;
}

export async function eliminaCollegamento (id) {
  await db.cancella('collegamenti', id);
  stato.collegamenti = stato.collegamenti.filter(c => c.id !== id);
  await db.incrementaRevisione();
  annuncia('collegamento-eliminato', id);
}

/* ------------------------------------------------------------ impostazioni */

export async function salvaImpostazioni (parziali) {
  stato.impostazioni = await db.salvaImpostazioni(parziali);
  annuncia('impostazioni', stato.impostazioni);
  return stato.impostazioni;
}

/* ------------------------------------------------------------- desideri */

export async function salvaDesiderio (d) {
  await db.scrivi('desideri', d);
  const i = stato.desideri.findIndex(x => x.id === d.id);
  if (i >= 0) stato.desideri[i] = d; else stato.desideri.push(d);
  annuncia('desiderio', d);
  return d;
}

export async function eliminaDesiderio (id) {
  await db.cancella('desideri', id);
  stato.desideri = stato.desideri.filter(d => d.id !== id);
  annuncia('desiderio-eliminato', id);
}

/* ------------------------------------------------------------- scartati */

/** Suggerimenti rifiutati: non vanno riproposti.
 *  La chiave dei collegamenti è la coppia ordinata, così vale nei due sensi. */
export function chiaveCoppia (a, b) { return 'coppia:' + [a, b].sort().join('|'); }

export function eScartato (chiave) {
  return stato.scartati.some(s => s.id === chiave);
}

export async function scarta (chiave, dettaglio = {}) {
  const rec = { id: chiave, ...dettaglio, scartatoIl: new Date().toISOString() };
  await db.scrivi('scartati', rec);
  if (!eScartato(chiave)) stato.scartati.push(rec);
  annuncia('scartato', rec);
}

export async function riprendiScartati () {
  await db.svuota('scartati');
  stato.scartati = [];
  annuncia('scartato', null);
}

/* -------------------------------------------------------------- sessioni */

export async function salvaSessione (s) {
  await db.scrivi('sessioni', s);
  const i = stato.sessioni.findIndex(x => x.id === s.id);
  if (i >= 0) stato.sessioni[i] = s; else stato.sessioni.push(s);
  annuncia('sessione', s);
  return s;
}

/* --------------------------------------------------------------- derivati */

/** Elenco autori ricavato dai libri: {nome, libri[], conteggio}. */
export function autori () {
  const mappa = new Map();
  stato.libri.forEach(l => {
    (l.autore || []).forEach(nome => {
      const chiave = nome.toLowerCase();
      if (!mappa.has(chiave)) mappa.set(chiave, { nome, libri: [] });
      mappa.get(chiave).libri.push(l);
    });
  });
  return [...mappa.values()].sort((a, b) => b.libri.length - a.libri.length || a.nome.localeCompare(b.nome));
}

/** Tutti i valori distinti di un campo lista (generi, temi, tag). */
export function valoriDistinti (campo) {
  const fonte = campo === 'tag' ? stato.citazioni : stato.libri;
  const mappa = new Map();
  fonte.forEach(r => (r[campo] || []).forEach(v => {
    const k = v.toLowerCase();
    mappa.set(k, { valore: mappa.has(k) ? mappa.get(k).valore : v, n: (mappa.get(k)?.n || 0) + 1 });
  }));
  return [...mappa.values()].sort((a, b) => b.n - a.n || a.valore.localeCompare(b.valore));
}

export function contaCitazioni (libroId) {
  return stato.citazioni.reduce((n, c) => n + (c.libroId === libroId ? 1 : 0), 0);
}

