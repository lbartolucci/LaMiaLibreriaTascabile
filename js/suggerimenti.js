/* =========================================================================
   suggerimenti.js — il motore della sezione Esplora
   Ogni carosello parte dalla tua libreria vera e porta con sé la sua
   motivazione: se non riesco a dirti *perché* ti propongo un titolo, quel
   titolo non lo propongo.

   Regole valide per tutti:
   · mai un libro che hai già, che hai già scartato o che è già nei desideri;
   · un carosello che fallisce non deve portarsi dietro gli altri;
   · le richieste ai cataloghi vanno centellinate (vedi la coda in catalog.js).
   ========================================================================= */

import { stato } from './store.js';
import { normalizza, paroleSignificative } from './utils/text.js';
import * as catalogo from './catalog.js';
import * as db from './db.js';

const TTL_CAROSELLI = 12 * 3600 * 1000;      // mezza giornata

/* Soggetti larghi da cui pescare il «fuori rotta»: volutamente lontani gli
   uni dagli altri, così ce n'è sempre qualcuno estraneo alla tua libreria. */
const SOGGETTI_LONTANI = [
  'astronomy', 'cooking', 'mountaineering', 'jazz', 'architecture', 'botany',
  'chess', 'sailing', 'archaeology', 'mathematics', 'birds', 'cartography',
  'medieval history', 'photography', 'geology', 'anthropology', 'typography'
];

/* ------------------------------------------------------------ esclusioni - */

/** Chiave con cui riconosciamo lo stesso libro fra cataloghi diversi. */
export function chiaveTitolo (titolo, autore) {
  const a = Array.isArray(autore) ? autore[0] : autore;
  return normalizza(titolo) + '|' + normalizza(a || '').split(' ').slice(-1)[0];
}

function insiemeEsclusi () {
  const fuori = new Set();
  stato.libri.forEach(l => {
    fuori.add(chiaveTitolo(l.titolo, l.autore));
    if (l.isbn) fuori.add('isbn:' + l.isbn);
    if (l.origine && l.origine.chiave) fuori.add('opera:' + l.origine.chiave);
  });
  stato.desideri.forEach(d => {
    fuori.add(chiaveTitolo(d.titolo, d.autore));
    if (d.isbn) fuori.add('isbn:' + d.isbn);
    if (d.chiave) fuori.add('opera:' + d.chiave);
  });
  stato.scartati.forEach(s => { if (s.id.startsWith('titolo:')) fuori.add(s.id.slice(7)); });
  return fuori;
}

function daTenere (scheda, fuori, visti) {
  const k = chiaveTitolo(scheda.titolo, scheda.autore);
  if (!scheda.titolo || scheda.titolo.length < 2) return false;
  if (fuori.has(k) || visti.has(k)) return false;
  if (scheda.isbn && fuori.has('isbn:' + scheda.isbn)) return false;
  if (scheda.chiave && fuori.has('opera:' + scheda.chiave)) return false;
  visti.add(k);
  return true;
}

export function chiaveScarto (scheda) {
  return 'titolo:' + chiaveTitolo(scheda.titolo, scheda.autore);
}

/* --------------------------------------------------------- materia prima - */

/** I soggetti su cui poggiano metà dei caroselli. Prendiamo prima i generi
 *  arrivati dai cataloghi (sono in inglese, e i cataloghi li capiscono) e poi
 *  i temi scritti da te, che valgono di più ma vanno cercati come stanno. */
export function soggettiDominanti (limite = 6) {
  const conteggio = new Map();
  const somma = (valore, peso) => {
    const k = String(valore).trim();
    if (k.length < 3) return;
    conteggio.set(k, (conteggio.get(k) || 0) + peso);
  };
  stato.libri.forEach(l => {
    (l.generi || []).forEach(g => somma(g, 1));
    (l.temi || []).forEach(t => somma(t, 1.6));       // i temi li hai scelti tu
  });
  stato.citazioni.forEach(c => (c.tag || []).forEach(t => somma(t, 1.2)));

  return [...conteggio.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([valore, peso]) => ({ valore, peso }));
}

/** Cerca un soggetto prima su Open Library, poi su Google Books: i temi
 *  italiani («memoria», «testimonianza») su OL spesso non esistono. */
async function perTema (tema, opzioni = {}) {
  let esiti = [];
  try {
    esiti = await catalogo.cercaPerSoggetto(tema, opzioni);
  } catch (_) { /* si prova comunque l'altra fonte */ }
  if (esiti.length >= 4) return esiti;
  try {
    const gb = await catalogo.cercaGoogle(`subject:"${tema}"`, { limite: 20, lingua: 'it', ...opzioni });
    esiti = esiti.concat(gb);
  } catch (_) {}
  return esiti;
}

/* ============================================================ i caroselli = */

/** Ogni voce: { id, titolo, motivazione, schede[], vuoto } */
export async function costruisciCaroselli ({ segnale, aggiornaProgressivo = null } = {}) {
  const fuori = insiemeEsclusi();
  const visti = new Set();

  const fabbriche = [
    () => altreOpereDeiTuoiAutori(fuori, visti, segnale),
    () => sulTemaCheTiStaACuore(fuori, visti, segnale),
    () => autoriAffini(fuori, visti, segnale),
    () => ilProssimoDopo(fuori, visti, segnale),
    () => ilPonte(fuori, visti, segnale),
    () => fuoriRotta(fuori, visti, segnale)
  ];

  const risultati = [];
  for (const fabbrica of fabbriche) {
    if (segnale && segnale.aborted) break;
    let carosello;
    try {
      carosello = await fabbrica();
    } catch (e) {
      carosello = null;
      console.warn('Carosello non riuscito:', e && e.message);
    }
    if (carosello && carosello.schede.length) {
      risultati.push(carosello);
      if (aggiornaProgressivo) aggiornaProgressivo(carosello, risultati.length);
    }
  }
  return risultati;
}

/* 1 — Altre opere dei tuoi autori ---------------------------------------- */

async function altreOpereDeiTuoiAutori (fuori, visti, segnale) {
  const conteggi = new Map();
  stato.libri.forEach(l => (l.autore || []).forEach(a => {
    const k = a.trim();
    if (k) conteggi.set(k, (conteggi.get(k) || 0) + 1);
  }));
  const preferiti = [...conteggi.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3);
  if (!preferiti.length) return null;

  const schede = [];
  for (const [nome, quanti] of preferiti) {
    if (segnale && segnale.aborted) break;
    let opere = [];
    try { opere = await catalogo.opereDiAutore(nome, { segnale }); } catch (_) { continue; }
    const mie = stato.libri.filter(l => l.autore.some(a => normalizza(a) === normalizza(nome)));
    const sue = opere
      .filter(s => s.autore.some(a => normalizza(a) === normalizza(nome)))
      .filter(s => daTenere(s, fuori, visti))
      .slice(0, 6);
    sue.forEach(s => schede.push({
      ...s,
      perche: quanti === 1
        ? `Hai letto «${mie[0] ? mie[0].titolo : nome}» di ${nome}: questo ti manca.`
        : `Hai letto ${quanti} libri di ${nome}. Questo no.`
    }));
  }
  if (!schede.length) return null;

  return {
    id: 'autori-tuoi',
    titolo: 'Altre opere dei tuoi autori',
    motivazione: 'Gli autori che compaiono più volte nella tua libreria, e i loro titoli che non hai.',
    schede: schede.slice(0, 12)
  };
}

/* 2 — Sul tema che ti sta a cuore ---------------------------------------- */

async function sulTemaCheTiStaACuore (fuori, visti, segnale) {
  const temi = soggettiDominanti(3);
  if (!temi.length) return null;

  const schede = [];
  for (const t of temi) {
    if (segnale && segnale.aborted) break;
    let esiti = [];
    try { esiti = await perTema(t.valore, { segnale }); } catch (_) { continue; }
    esiti.filter(s => daTenere(s, fuori, visti)).slice(0, 4).forEach(s => {
      schede.push({ ...s, perche: `Perché «${t.valore}» torna spesso fra i tuoi libri e le tue citazioni.` });
    });
  }
  if (!schede.length) return null;

  return {
    id: 'temi',
    titolo: 'Sul tema che ti sta a cuore',
    motivazione: `I tre temi che ricorrono di più da te: ${temi.map(t => t.valore).join(', ')}.`,
    schede: schede.slice(0, 12)
  };
}

/* 3 — Autori affini ------------------------------------------------------ */

async function autoriAffini (fuori, visti, segnale) {
  const temi = soggettiDominanti(2);
  if (!temi.length) return null;
  const mieiAutori = new Set(stato.libri.flatMap(l => l.autore.map(a => normalizza(a))));

  const perAutore = new Map();
  for (const t of temi) {
    if (segnale && segnale.aborted) break;
    let esiti = [];
    try { esiti = await perTema(t.valore, { segnale }); } catch (_) { continue; }
    esiti.forEach(s => {
      const nome = s.autore[0];
      if (!nome || mieiAutori.has(normalizza(nome))) return;
      if (!perAutore.has(nome)) perAutore.set(nome, { nome, tema: t.valore, opere: [] });
      perAutore.get(nome).opere.push(s);
    });
  }

  // un autore che compare con più opere sul tuo tema è più affine di uno solo
  const classifica = [...perAutore.values()]
    .sort((a, b) => b.opere.length - a.opere.length)
    .slice(0, 8);

  const schede = [];
  classifica.forEach(a => {
    const migliore = a.opere.sort((x, y) => (y.edizioni || 0) - (x.edizioni || 0))
      .find(s => daTenere(s, fuori, visti));
    if (!migliore) return;
    schede.push({
      ...migliore,
      perche: a.opere.length > 1
        ? `${a.nome} torna spesso fra i libri di «${a.tema}», e non l'hai mai letto.`
        : `Un autore nuovo su «${a.tema}», il tema che leggi di più.`
    });
  });
  if (!schede.length) return null;

  return {
    id: 'autori-affini',
    titolo: 'Autori affini',
    motivazione: 'Nomi che ricorrono nei tuoi stessi soggetti e che in libreria non hai.',
    schede: schede.slice(0, 10)
  };
}

/* 4 — Il prossimo dopo [libro] ------------------------------------------- */

async function ilProssimoDopo (fuori, visti, segnale) {
  const candidati = stato.libri
    .filter(l => l.valutazione >= 4 && (l.generi.length || l.temi.length))
    .sort((a, b) => b.valutazione - a.valutazione);
  const libro = candidati[0] || stato.libri.find(l => l.generi.length || l.temi.length);
  if (!libro) return null;

  const soggetto = libro.generi[0] || libro.temi[0];
  let esiti = [];
  try { esiti = await perTema(soggetto, { segnale }); } catch (_) { return null; }

  // stesso soggetto, e più il periodo è vicino più la proposta è pertinente
  const anno = libro.annoPubblicazione;
  const schede = esiti
    .filter(s => daTenere(s, fuori, visti))
    .map(s => ({
      s,
      vicinanza: anno && s.annoPubblicazione ? Math.abs(s.annoPubblicazione - anno) : 999
    }))
    .sort((a, b) => a.vicinanza - b.vicinanza)
    .slice(0, 8)
    .map(({ s, vicinanza }) => ({
      ...s,
      perche: vicinanza < 30 && anno
        ? `Come «${libro.titolo}»: stesso soggetto e più o meno gli stessi anni.`
        : `Stesso soggetto di «${libro.titolo}», che hai messo ${libro.valutazione} stelle.`
    }));
  if (!schede.length) return null;

  return {
    id: 'prossimo',
    titolo: `Il prossimo dopo «${libro.titolo}»`,
    motivazione: `È uno dei libri che hai valutato meglio: questi gli somigliano per soggetto e per epoca.`,
    schede
  };
}

/* 5 — Il ponte ------------------------------------------------------------ */

/** Il suggerimento più interessante: un titolo che sta a cavallo fra due
 *  libri che TU hai già collegato. Cerchiamo sui soggetti dell'uno e
 *  dell'altro e teniamo i titoli che compaiono in tutti e due i mucchi. */
async function ilPonte (fuori, visti, segnale) {
  const legami = stato.collegamenti
    .map(c => ({ c, a: stato.libri.find(l => l.id === c.libroA_id), b: stato.libri.find(l => l.id === c.libroB_id) }))
    .filter(x => x.a && x.b && (x.a.generi.length || x.a.temi.length) && (x.b.generi.length || x.b.temi.length))
    .sort((x, y) => (y.c.forza || 0) - (x.c.forza || 0));
  if (!legami.length) return null;

  for (const { c, a, b } of legami.slice(0, 3)) {
    if (segnale && segnale.aborted) break;
    const soggettoA = a.generi[0] || a.temi[0];
    const soggettoB = b.generi[0] || b.temi[0];
    if (!soggettoA || !soggettoB || normalizza(soggettoA) === normalizza(soggettoB)) continue;

    let mucchioA = [], mucchioB = [];
    try {
      mucchioA = await perTema(soggettoA, { segnale });
      mucchioB = await perTema(soggettoB, { segnale });
    } catch (_) { continue; }

    const indiceB = new Map(mucchioB.map(s => [chiaveTitolo(s.titolo, s.autore), s]));
    const comuni = mucchioA
      .map(s => ({ s, gemello: indiceB.get(chiaveTitolo(s.titolo, s.autore)) }))
      .filter(x => x.gemello)
      .map(x => x.s)
      .filter(s => daTenere(s, fuori, visti));

    // se l'intersezione è vuota, ripieghiamo su chi condivide soggetti con entrambi
    let schede = comuni;
    if (!schede.length) {
      const soggettiA = new Set([...a.generi, ...a.temi].map(normalizza));
      const soggettiB = new Set([...b.generi, ...b.temi].map(normalizza));
      schede = [...mucchioA, ...mucchioB]
        .filter(s => daTenere(s, fuori, visti))
        .map(s => {
          const suoi = (s.generi || []).map(normalizza);
          const toccaA = suoi.some(g => soggettiA.has(g));
          const toccaB = suoi.some(g => soggettiB.has(g));
          return { s, punti: (toccaA ? 1 : 0) + (toccaB ? 1 : 0) };
        })
        .filter(x => x.punti === 2)
        .map(x => x.s);
    }
    if (!schede.length) continue;

    return {
      id: 'ponte',
      titolo: 'Il ponte',
      motivazione: `Avevi collegato «${a.titolo}» e «${b.titolo}»${c.nota ? ` — «${c.nota}»` : ''}. Questi titoli stanno in mezzo: parlano di ${soggettoA} come il primo e di ${soggettoB} come il secondo.`,
      schede: schede.slice(0, 6).map(s => ({
        ...s,
        perche: `Sta fra «${a.titolo}» e «${b.titolo}»: tocca ${soggettoA} e ${soggettoB}.`
      }))
    };
  }
  return null;
}

/* 6 — Fuori rotta --------------------------------------------------------- */

async function fuoriRotta (fuori, visti, segnale) {
  const miei = new Set(soggettiDominanti(12).flatMap(t => paroleSignificative(t.valore, 4)));
  const estranei = SOGGETTI_LONTANI.filter(s =>
    !paroleSignificative(s, 4).some(p => miei.has(p)));
  if (!estranei.length) return null;

  // uno diverso ogni giorno, ma stabile dentro la giornata
  const semeGiorno = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const soggetto = estranei[semeGiorno % estranei.length];

  let esiti = [];
  try { esiti = await catalogo.cercaPerSoggetto(soggetto, { limite: 12, segnale }); } catch (_) { return null; }
  const scelto = esiti.filter(s => daTenere(s, fuori, visti))[semeGiorno % Math.max(1, Math.min(5, esiti.length))]
    || esiti.filter(s => daTenere(s, fuori, visti))[0];
  if (!scelto) return null;

  return {
    id: 'fuori-rotta',
    titolo: 'Fuori rotta',
    motivazione: 'Uno solo, e volutamente lontano da tutto quello che leggi: serve a non chiudersi nella propria bolla.',
    fuoriRotta: true,
    schede: [{ ...scelto, perche: `Niente a che vedere con la tua libreria: è di ${soggetto}. Appunto.` }]
  };
}

/* ================================================================== cache = */

/** I caroselli restano buoni mezza giornata, o finché non cambia la libreria:
 *  aprire Esplora non deve significare dieci chiamate ogni volta. */
export async function caroselliInCache () {
  const rec = await db.leggi('meta', 'esplora');
  if (!rec || !rec.valore) return null;
  const { salvatoIl, revisione, caroselli } = rec.valore;
  if (Date.now() - salvatoIl > TTL_CAROSELLI) return null;
  if (revisione !== await db.revisione()) return null;
  return caroselli;
}

export async function salvaCaroselli (caroselli) {
  await db.scrivi('meta', {
    chiave: 'esplora',
    valore: { salvatoIl: Date.now(), revisione: await db.revisione(), caroselli }
  });
}

export async function dimenticaCaroselli () {
  await db.cancella('meta', 'esplora').catch(() => {});
}
