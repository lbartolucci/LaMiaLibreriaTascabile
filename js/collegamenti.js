/* =========================================================================
   collegamenti.js — suggerimenti automatici di collegamento fra libri
   Calcolo interamente locale (funziona offline): confronta autori, generi,
   temi/tag e il lessico delle citazioni. Niente viene creato in automatico:
   l'app propone, tu accetti o rifiuti.
   ========================================================================= */

import { stato, esisteCollegamento, citazioniDi } from './store.js';
import { jaccard, sovrapposizioneLessicale, paroleSignificative } from './utils/text.js';

/** Pesi delle diverse evidenze. Sommati danno il punteggio finale (0–1 circa). */
const PESI = {
  autore: 0.55,
  generi: 0.20,
  temi: 0.28,
  tagCitazioni: 0.22,
  lessicoCitazioni: 0.30
};

const SOGLIA = 0.16;

/** Restituisce i libri più affini a quello dato, con la spiegazione del perché.
 *  [{ libro, punteggio, motivi:[stringhe], tipoProposto }] */
export function suggerisciCollegamenti (libro, { max = 5, includiGiaCollegati = false } = {}) {
  if (!libro) return [];
  const mieCitazioni = citazioniDi(libro.id);
  const mioTestoCitazioni = mieCitazioni.map(c => c.testo).join(' ');
  const mieiTag = [...new Set(mieCitazioni.flatMap(c => c.tag || []))];

  const proposte = [];

  for (const altro of stato.libri) {
    if (altro.id === libro.id) continue;
    if (!includiGiaCollegati && esisteCollegamento(libro.id, altro.id)) continue;

    const motivi = [];
    let punteggio = 0;
    let tipoProposto = 'tema';

    // 1) stesso autore — l'indizio più forte e più affidabile
    const autoriComuni = (libro.autore || []).filter(a =>
      (altro.autore || []).some(b => b.toLowerCase() === a.toLowerCase()));
    if (autoriComuni.length) {
      punteggio += PESI.autore;
      motivi.push(`stesso autore: ${autoriComuni[0]}`);
      tipoProposto = 'stesso autore';
    }

    // 2) generi in comune
    const jGeneri = jaccard(libro.generi, altro.generi);
    if (jGeneri > 0) {
      punteggio += PESI.generi * jGeneri;
      const comuni = intersezione(libro.generi, altro.generi);
      if (comuni.length) motivi.push(`genere ${comuni.slice(0, 2).join(', ')}`);
    }

    // 3) temi in comune — contano più dei generi perché li scrivi tu
    const jTemi = jaccard(libro.temi, altro.temi);
    if (jTemi > 0) {
      punteggio += PESI.temi * jTemi;
      const comuni = intersezione(libro.temi, altro.temi);
      if (comuni.length) {
        motivi.push(`tema ${comuni.slice(0, 2).join(', ')}`);
        if (tipoProposto !== 'stesso autore') tipoProposto = 'tema';
      }
    }

    // 4) tag delle citazioni in comune
    const sueCitazioni = citazioniDi(altro.id);
    const suoiTag = [...new Set(sueCitazioni.flatMap(c => c.tag || []))];
    const jTag = jaccard(mieiTag, suoiTag);
    if (jTag > 0) {
      punteggio += PESI.tagCitazioni * jTag;
      const comuni = intersezione(mieiTag, suoiTag);
      if (comuni.length) motivi.push(`citazioni marcate «${comuni[0]}»`);
    }

    // 5) parole portanti condivise fra le citazioni
    const suoTestoCitazioni = sueCitazioni.map(c => c.testo).join(' ');
    if (mioTestoCitazioni && suoTestoCitazioni) {
      const sovr = sovrapposizioneLessicale(mioTestoCitazioni, suoTestoCitazioni);
      if (sovr > 0.08) {
        punteggio += PESI.lessicoCitazioni * sovr;
        const comuni = paroleComuni(mioTestoCitazioni, suoTestoCitazioni);
        if (comuni.length >= 2) motivi.push(`nelle citazioni ricorrono ${comuni.slice(0, 3).join(', ')}`);
      }
    }

    if (punteggio >= SOGLIA && motivi.length) {
      proposte.push({ libro: altro, punteggio: Math.min(1, punteggio), motivi, tipoProposto });
    }
  }

  return proposte.sort((a, b) => b.punteggio - a.punteggio).slice(0, max);
}

/** Termini che tornano in più citazioni della stessa raccolta: servono a far
 *  emergere i fili conduttori dentro un libro o dentro tutta la libreria. */
function paroleComuni (a, b) {
  const A = new Set(paroleSignificative(a, 5));
  const B = new Set(paroleSignificative(b, 5));
  const out = [];
  A.forEach(x => { if (B.has(x)) out.push(x); });
  return out;
}

function intersezione (a, b) {
  const B = new Set((b || []).map(x => x.toLowerCase()));
  return (a || []).filter(x => B.has(x.toLowerCase()));
}
