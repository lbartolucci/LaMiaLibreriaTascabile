/* =========================================================================
   srs.js — ripasso dilazionato (SM-2 semplificato)
   Un elemento sale di livello ogni volta che lo ricordi e torna a zero
   quando lo sbagli. Gli intervalli sono fissi: niente fattori di facilità
   da tarare, che su una libreria personale non avrebbero abbastanza dati.
   ========================================================================= */

import * as db from '../db.js';
import { stato } from '../store.js';
import { srsIniziale } from '../models.js';

/** Giorni di attesa per ciascun livello. Livello 0 = da rivedere domani. */
export const INTERVALLI = [1, 3, 7, 16, 35, 90];

export const oggiISO = () => new Date().toISOString().slice(0, 10);

function fraGiorni (n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lo stato di ripasso di un record, anche se il record è più vecchio
 *  dell'introduzione del campo. */
export function srsDi (entita) {
  return { ...srsIniziale(), ...((entita && entita.srs) || {}) };
}

/** Calcola il nuovo stato di ripasso dopo una risposta.
 *  Non scrive niente: la scrittura la fa registraEsito(). */
export function prossimoStato (srs, esito) {
  const s = { ...srsIniziale(), ...srs };
  const adesso = new Date().toISOString();

  if (esito === 'corretto') {
    s.livello = Math.min(s.livello + 1, INTERVALLI.length - 1);
    s.successi = (s.successi || 0) + 1;
  } else if (esito === 'parziale') {
    // mezzo ricordo: non sale, ma nemmeno riparte da capo
    s.livello = Math.max(0, s.livello - 1);
  } else {
    s.livello = 0;                       // sbagliato: si ricomincia
    s.errori = (s.errori || 0) + 1;
  }

  s.ultimaRevisione = adesso;
  s.ultimoEsito = esito;
  s.prossimaRevisione = fraGiorni(INTERVALLI[s.livello]);
  return s;
}

/** Scrive il nuovo stato di ripasso sull'elemento.
 *
 *  Nota importante: NON tocchiamo `updatedAt`. Quel campo vuol dire «quando
 *  ho modificato questo libro», ed è quello che ordina la libreria: se lo
 *  aggiornassimo a ogni risposta, dopo un quiz la libreria si riordinerebbe
 *  tutta. Usiamo invece `srsAggiornatoIl`, che la sincronizzazione della
 *  fase 4 potrà confrontare per conto suo. */
export async function registraEsito (entitaTipo, id, esito) {
  const collezione = entitaTipo === 'citazione' ? stato.citazioni : stato.libri;
  const record = collezione.find(x => x.id === id);
  if (!record) return null;

  record.srs = prossimoStato(record.srs, esito);
  record.srsAggiornatoIl = new Date().toISOString();
  record._rev = (record._rev || 0) + 1;

  await db.scrivi(entitaTipo === 'citazione' ? 'citazioni' : 'libri', record);
  return record.srs;
}

/** È in scadenza? Solo gli elementi già visti almeno una volta:
 *  quelli mai studiati non sono «da ripassare», sono ancora da imparare. */
export function inScadenza (entita, giorno = oggiISO()) {
  const s = srsDi(entita);
  return !!s.prossimaRevisione && s.prossimaRevisione <= giorno;
}

export function maiStudiato (entita) {
  return !srsDi(entita).ultimaRevisione;
}

/** Quanti elementi aspettano un ripasso oggi. */
export function conteggioScadenze () {
  const citazioni = stato.citazioni.filter(c => inScadenza(c)).length;
  const libri = stato.libri.filter(l => inScadenza(l)).length;
  return { citazioni, libri, totale: citazioni + libri };
}

/** Priorità di un elemento nella scelta delle domande.
 *  Più alto = più probabile che esca. L'ordine dei bonus segue la scaletta
 *  chiesta: preferite, in scadenza, sbagliate di recente, mai testate. */
export function priorita (entita, { preferisciPreferite = true } = {}) {
  const s = srsDi(entita);
  let p = 1;

  if (preferisciPreferite && entita.preferita) p += 2.5;
  if (inScadenza(entita)) p += 3;
  if ((s.errori || 0) > (s.successi || 0)) p += 2;
  if (maiStudiato(entita)) p += 1.5;

  // se l'hai già visto oggi, che aspetti il suo turno
  if (s.ultimaRevisione && s.ultimaRevisione.slice(0, 10) === oggiISO()) p *= 0.25;

  return p;
}

/** Estrazione pesata senza rimpiazzo. `casuale` è iniettabile per i collaudi. */
export function estraiPesati (elementi, quanti, peso, casuale = Math.random) {
  const rimasti = elementi.map(e => ({ e, p: Math.max(0.0001, peso(e)) }));
  const scelti = [];
  while (scelti.length < quanti && rimasti.length) {
    const totale = rimasti.reduce((s, x) => s + x.p, 0);
    let soglia = casuale() * totale;
    let i = 0;
    while (i < rimasti.length - 1 && (soglia -= rimasti[i].p) > 0) i++;
    scelti.push(rimasti[i].e);
    rimasti.splice(i, 1);
  }
  return scelti;
}
