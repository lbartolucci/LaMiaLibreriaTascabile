/* =========================================================================
   generatore.js — costruisce le domande del quiz dai dati veri
   Nessuna domanda è scritta a mano: tutto nasce dai tuoi libri, dalle tue
   citazioni, dalle tue note e dai tuoi collegamenti. Se il materiale non
   basta per un certo tipo, quel tipo semplicemente non esce — e la
   schermata di avvio te lo dice prima, invece di generare domande vuote.
   ========================================================================= */

import { stato, libro as trovaLibro, collegamentiDi } from '../store.js';
import {
  normalizza, parole, paroleSignificative, STOPWORDS, esc, rispostaAccettabile
} from '../utils/text.js';
import { priorita, estraiPesati, inScadenza } from './srs.js';
import { TIPI_ELEMENTO } from '../models.js';

/* ============================================================ i dodici tipi */

export const TIPI_DOMANDA = [
  // --- sulle citazioni: sono queste che devono pesare di più
  { id: 'cloze',        famiglia: 'citazione', peso: 4, nome: 'Completa la citazione',
    descrizione: 'Una parte della citazione è oscurata: la scrivi tu.' },
  { id: 'quale-libro',  famiglia: 'citazione', peso: 2, nome: 'Di quale libro è?',
    descrizione: 'Scelta fra quattro titoli della tua libreria.' },
  { id: 'quale-autore', famiglia: 'citazione', peso: 2, nome: 'Chi l\'ha scritta?',
    descrizione: 'Scelta fra quattro autori.' },
  { id: 'apertura',     famiglia: 'citazione', peso: 2, nome: 'Come comincia, come finisce',
    descrizione: 'Vedi metà citazione e ricostruisci l\'altra estremità.' },
  { id: 'contesto',     famiglia: 'citazione', peso: 2, nome: 'Perché l\'avevi segnata',
    descrizione: 'Prova a ricordare la tua nota, poi ti autovaluti.' },
  { id: 'abbinamento',  famiglia: 'citazione', peso: 1, nome: 'Abbinamento',
    descrizione: 'Quattro citazioni da riportare ai loro quattro libri.' },

  // --- sui libri
  { id: 'autore-libro', famiglia: 'libro', peso: 2, nome: 'Chi è l\'autore?',
    descrizione: 'Scelta fra quattro autori.' },
  { id: 'trama',        famiglia: 'libro', peso: 2, nome: 'A quale libro appartiene questa trama?',
    descrizione: 'La trama con i nomi propri coperti.' },
  { id: 'colpito',      famiglia: 'libro', peso: 2, nome: 'Cosa ti aveva colpito',
    descrizione: 'Domanda aperta sulla tua impressione, con autovalutazione.' },
  { id: 'collegamento', famiglia: 'libro', peso: 2, nome: 'Con quale libro si collega?',
    descrizione: 'Fra quattro libri, quello che avevi collegato davvero.' },
  { id: 'elementi',     famiglia: 'libro', peso: 2, nome: 'Elementi chiave',
    descrizione: 'Elenchi a memoria due o tre elementi, poi ti autovaluti.' },
  { id: 'metadati',     famiglia: 'libro', peso: 1, nome: 'Anno, genere, dettagli',
    descrizione: 'Domande secche sui dati del libro, come intermezzo.' }
];

export const AMBITI = [
  { id: 'tutto',      nome: 'Tutta la libreria' },
  { id: 'libro',      nome: 'Un libro' },
  { id: 'autore',     nome: 'Un autore' },
  { id: 'tag',        nome: 'Un tag' },
  { id: 'preferite',  nome: 'Solo le citazioni preferite' },
  { id: 'ripasso',    nome: 'Solo quello che scade oggi' }
];

/* ================================================================= materia */

/** Riduce libreria e citazioni all'ambito scelto. */
export function materiale ({ ambito = 'tutto', valore = '' } = {}) {
  let libri = stato.libri.slice();
  let citazioni = stato.citazioni.slice();

  if (ambito === 'libro') {
    libri = libri.filter(l => l.id === valore);
    citazioni = citazioni.filter(c => c.libroId === valore);
  } else if (ambito === 'autore') {
    const n = normalizza(valore);
    libri = libri.filter(l => l.autore.some(a => normalizza(a) === n));
    const ids = new Set(libri.map(l => l.id));
    citazioni = citazioni.filter(c => ids.has(c.libroId));
  } else if (ambito === 'tag') {
    const n = normalizza(valore);
    citazioni = citazioni.filter(c => c.tag.some(t => normalizza(t) === n));
    const ids = new Set(citazioni.map(c => c.libroId));
    libri = libri.filter(l => ids.has(l.id));
  } else if (ambito === 'preferite') {
    citazioni = citazioni.filter(c => c.preferita);
    const ids = new Set(citazioni.map(c => c.libroId));
    libri = libri.filter(l => ids.has(l.id));
  } else if (ambito === 'ripasso') {
    citazioni = citazioni.filter(c => inScadenza(c));
    libri = libri.filter(l => inScadenza(l));
  }

  return { libri, citazioni };
}

/** Quali tipi si possono davvero costruire con questo materiale, e perché no.
 *  I distrattori pescano SEMPRE da tutta la libreria, anche quando l'ambito
 *  è ristretto: un quiz su un libro solo avrebbe alternative ridicole. */
export function disponibilita (mat) {
  const tuttiILibri = stato.libri;
  const autoriDistinti = new Set(tuttiILibri.flatMap(l => l.autore.map(a => normalizza(a)))).size;
  const abbastanzaLibri = tuttiILibri.length >= 4;

  const libriConCitazioni = new Set(stato.citazioni.map(c => c.libroId));
  const motivi = {};
  const ok = {};

  const segna = (id, condizione, motivo) => { ok[id] = condizione; if (!condizione) motivi[id] = motivo; };

  segna('cloze', mat.citazioni.some(c => parole(c.testo).length >= 6),
    'servono citazioni di almeno sei parole');
  segna('quale-libro', abbastanzaLibri && mat.citazioni.length > 0,
    abbastanzaLibri ? 'servono citazioni' : 'servono almeno quattro libri per avere alternative credibili');
  segna('quale-autore', autoriDistinti >= 4 && mat.citazioni.length > 0,
    autoriDistinti >= 4 ? 'servono citazioni' : 'servono almeno quattro autori diversi');
  segna('apertura', mat.citazioni.some(c => parole(c.testo).length >= 8),
    'servono citazioni di almeno otto parole');
  segna('contesto', mat.citazioni.some(c => (c.contesto || '').trim().length >= 10),
    'nessuna citazione ha una nota «perché l\'ho segnata»');
  segna('abbinamento', [...libriConCitazioni].length >= 4 && mat.citazioni.length >= 4,
    'servono almeno quattro libri con almeno una citazione ciascuno');

  segna('autore-libro', autoriDistinti >= 4 && mat.libri.some(l => l.autore.length),
    autoriDistinti >= 4 ? 'i libri dell\'ambito non hanno autore' : 'servono almeno quattro autori diversi');
  segna('trama', abbastanzaLibri && mat.libri.some(l => (l.trama || '').length >= 40),
    abbastanzaLibri ? 'nessun libro ha una trama scritta' : 'servono almeno quattro libri');
  segna('colpito', mat.libri.some(l => (l.impressionePersonale || '').trim().length >= 10),
    'nessun libro ha il campo «cosa mi ha colpito»');
  const collegabile = mat.libri.some(l => {
    const legami = collegamentiDi(l.id);
    if (!legami.length) return false;
    const ids = new Set(legami.flatMap(c => [c.libroA_id, c.libroB_id]));
    return tuttiILibri.filter(x => x.id !== l.id && !ids.has(x.id)).length >= 2;
  });
  segna('collegamento', abbastanzaLibri && collegabile,
    !abbastanzaLibri ? 'servono almeno quattro libri'
      : mat.libri.some(l => collegamentiDi(l.id).length)
        ? 'i libri collegati non hanno abbastanza alternative non collegate'
        : 'nessun libro dell\'ambito ha collegamenti');
  segna('elementi', mat.libri.some(l => (l.elementiChiave || []).length >= 2),
    'servono libri con almeno due elementi chiave');
  segna('metadati', abbastanzaLibri && mat.libri.some(l => l.annoPubblicazione || l.generi.length || l.editore),
    abbastanzaLibri ? 'i libri dell\'ambito non hanno dati da chiedere' : 'servono almeno quattro libri');

  return { ok, motivi, abbastanzaLibri, autoriDistinti };
}

/* ============================================================== generazione */

/**
 * Costruisce la sessione.
 * @returns {{domande: Array, avvisi: string[], richieste: number}}
 */
export function generaSessione ({
  numero = 10, ambito = 'tutto', valore = '', tipiAttivi = null, casuale = Math.random
} = {}) {
  const mat = materiale({ ambito, valore });
  const disp = disponibilita(mat);
  const avvisi = [];

  let tipi = TIPI_DOMANDA.filter(t => disp.ok[t.id]);
  if (tipiAttivi && tipiAttivi.length) tipi = tipi.filter(t => tipiAttivi.includes(t.id));

  if (!tipi.length) {
    return { domande: [], avvisi: ['Con questo materiale non riesco a costruire nessuna domanda.'], richieste: numero };
  }
  if (!disp.abbastanzaLibri) {
    avvisi.push('Hai meno di quattro libri: le domande a scelta multipla restano spente finché non ce ne sono almeno quattro, perché senza tre alternative credibili non sarebbero una prova di memoria.');
  }

  const usate = { citazione: new Set(), libro: new Set() };
  const domande = [];
  let tentativiAVuoto = 0;

  /* Le citazioni devono pesare almeno il 60%: costruisco una scaletta di
     famiglie e poi, per ogni posto, scelgo il tipo dentro quella famiglia. */
  const conCitazioni = tipi.filter(t => t.famiglia === 'citazione');
  const conLibri = tipi.filter(t => t.famiglia === 'libro');
  const scaletta = piano(numero, conCitazioni.length > 0, conLibri.length > 0, casuale);

  for (const famiglia of scaletta) {
    if (domande.length >= numero) break;
    const candidati = (famiglia === 'citazione' ? conCitazioni : conLibri);
    const domanda = provaTipi(candidati, mat, usate, casuale)
      // se la famiglia prevista non produce niente, ripiego sull'altra
      || provaTipi(famiglia === 'citazione' ? conLibri : conCitazioni, mat, usate, casuale);
    if (domanda) { domande.push(domanda); tentativiAVuoto = 0; }
    else if (++tentativiAVuoto > 3) break;      // materiale esaurito
  }

  if (domande.length < numero) {
    avvisi.push(domande.length
      ? `Il materiale bastava per ${domande.length} domande invece di ${numero}: ogni elemento esce una volta sola per sessione.`
      : 'Non c\'è abbastanza materiale per una sessione.');
  }

  return { domande, avvisi, richieste: numero };
}

/** Alterna le famiglie tenendo le citazioni sopra il 60%. */
function piano (numero, ciSonoCitazioni, ciSonoLibri, casuale) {
  if (!ciSonoLibri) return new Array(numero).fill('citazione');
  if (!ciSonoCitazioni) return new Array(numero).fill('libro');
  const quanteCitazioni = Math.max(1, Math.round(numero * 0.65));
  const lista = [
    ...new Array(quanteCitazioni).fill('citazione'),
    ...new Array(Math.max(0, numero - quanteCitazioni)).fill('libro')
  ];
  // mescolo, ma la prima domanda è sempre su una citazione: è il cuore dell'app
  const coda = mescola(lista.slice(1), casuale);
  return ['citazione', ...coda];
}

function provaTipi (tipi, mat, usate, casuale) {
  const ordinati = mescolaPesati(tipi, casuale);
  for (const tipo of ordinati) {
    // tre tentativi: se l'elemento estratto non soddisfa i vincoli secondari
    // (distrattori insufficienti, testo troppo corto…) se ne prova un altro
    for (let t = 0; t < 3; t++) {
      const d = COSTRUTTORI[tipo.id](mat, usate, casuale);
      if (d) {
        d.tipo = tipo.id;
        d.nomeTipo = tipo.nome;
        return d;
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------- costruttori */

const COSTRUTTORI = {

  /* 1 — Completa la citazione ------------------------------------------- */
  cloze (mat, usate, casuale) {
    const c = scegliCitazione(mat, usate, casuale, x => parole(x.testo).length >= 6);
    if (!c) return null;
    const buco = ritagliaBuco(c.testo, casuale);
    if (!buco) return null;
    usate.citazione.add(c.id);
    const libro = trovaLibro(c.libroId);
    return {
      entitaTipo: 'citazione', entitaId: c.id,
      formato: 'testo',
      consegna: 'Che cosa manca?',
      testo: buco.conBuco,
      aiuto: `${buco.quante === 1 ? 'Manca una parola' : `Mancano ${buco.quante} parole`}${libro ? ` · ${libro.titolo}` : ''}`,
      attesa: buco.mancante,
      etichetta: accorcia(c.testo, 64),
      verifica: risposta => ({
        esito: rispostaAccettabile(risposta, buco.mancante) ? 'corretto' : 'sbagliato'
      }),
      soluzione: buco.mancante,
      conDiff: true,
      rivelaHTML: () => `<p class="quiz-soluzione">${esc(c.testo)}</p>`
    };
  },

  /* 2 — Di quale libro è questa citazione? ------------------------------- */
  'quale-libro' (mat, usate, casuale) {
    const c = scegliCitazione(mat, usate, casuale);
    if (!c) return null;
    const giusto = trovaLibro(c.libroId);
    if (!giusto) return null;
    const distrattori = libriSimili(giusto, 3, casuale);
    if (distrattori.length < 3) return null;
    usate.citazione.add(c.id);
    return {
      entitaTipo: 'citazione', entitaId: c.id,
      formato: 'scelta',
      consegna: 'Di quale libro è questa citazione?',
      testo: `«${c.testo}»`,
      opzioni: mescola([giusto, ...distrattori], casuale).map(l => ({ id: l.id, testo: l.titolo, sotto: l.autore.join(', ') })),
      corretta: giusto.id,
      etichetta: `${accorcia(c.testo, 44)} → ${giusto.titolo}`,
      verifica: r => ({ esito: r === giusto.id ? 'corretto' : 'sbagliato' })
    };
  },

  /* 3 — Chi ha scritto questa citazione? --------------------------------- */
  'quale-autore' (mat, usate, casuale) {
    const c = scegliCitazione(mat, usate, casuale, x => {
      const l = trovaLibro(x.libroId);
      return l && l.autore.length;
    });
    if (!c) return null;
    const libro = trovaLibro(c.libroId);
    const giusto = libro.autore[0];
    const altri = autoriDiversiDa(giusto, 3, casuale);
    if (altri.length < 3) return null;
    usate.citazione.add(c.id);
    return {
      entitaTipo: 'citazione', entitaId: c.id,
      formato: 'scelta',
      consegna: 'Chi ha scritto questa citazione?',
      testo: `«${c.testo}»`,
      opzioni: mescola([giusto, ...altri], casuale).map(a => ({ id: a, testo: a })),
      corretta: giusto,
      etichetta: `${accorcia(c.testo, 44)} → ${giusto}`,
      verifica: r => ({ esito: r === giusto ? 'corretto' : 'sbagliato' }),
      rivelaHTML: () => `<p class="minuscolo">da «${esc(libro.titolo)}»</p>`
    };
  },

  /* 4 — Prima riga / ultima riga ----------------------------------------- */
  apertura (mat, usate, casuale) {
    const c = scegliCitazione(mat, usate, casuale, x => parole(x.testo).length >= 8);
    if (!c) return null;
    const p = c.testo.trim().split(/\s+/);
    const quante = Math.min(4, Math.max(3, Math.floor(p.length / 5)));
    const chiediInizio = casuale() < 0.5;
    usate.citazione.add(c.id);

    const attesa = chiediInizio ? p.slice(0, quante).join(' ') : p.slice(-quante).join(' ');
    const mostrata = chiediInizio
      ? '…' + p.slice(quante).join(' ')
      : p.slice(0, p.length - quante).join(' ') + '…';

    return {
      entitaTipo: 'citazione', entitaId: c.id,
      formato: 'testo',
      consegna: chiediInizio ? `Con quali parole comincia? (le prime ${quante})` : `E come finisce? (le ultime ${quante})`,
      testo: mostrata,
      attesa,
      etichetta: accorcia(c.testo, 64),
      verifica: risposta => ({ esito: rispostaAccettabile(risposta, attesa, 0.25) ? 'corretto' : 'sbagliato' }),
      soluzione: attesa,
      conDiff: true,
      rivelaHTML: () => `<p class="quiz-soluzione">${esc(c.testo)}</p>`
    };
  },

  /* 5 — Riconosci il contesto -------------------------------------------- */
  contesto (mat, usate, casuale) {
    const c = scegliCitazione(mat, usate, casuale, x => (x.contesto || '').trim().length >= 10);
    if (!c) return null;
    usate.citazione.add(c.id);
    return {
      entitaTipo: 'citazione', entitaId: c.id,
      formato: 'aperta',
      consegna: 'Perché avevi segnato questa citazione?',
      testo: `«${c.testo}»`,
      aiuto: 'Rispondi come ti viene, poi confronti con quello che avevi scritto.',
      atteso: c.contesto,
      etichetta: accorcia(c.testo, 64),
      rivelaHTML: () => `<div class="quiz-rivelazione">
          <h4>Avevi scritto</h4>
          <p>${esc(c.contesto)}</p>
        </div>`
    };
  },

  /* 6 — Abbinamento ------------------------------------------------------ */
  abbinamento (mat, usate, casuale) {
    // quattro libri diversi, ciascuno con una citazione non ancora usata
    const perLibro = new Map();
    mat.citazioni.forEach(c => {
      if (usate.citazione.has(c.id)) return;
      if (!perLibro.has(c.libroId)) perLibro.set(c.libroId, []);
      perLibro.get(c.libroId).push(c);
    });
    const libriUtili = [...perLibro.keys()].filter(id => trovaLibro(id));
    if (libriUtili.length < 4) return null;

    const scelti = mescola(libriUtili, casuale).slice(0, 4);
    const coppie = scelti.map(id => {
      const lista = perLibro.get(id);
      const c = estraiPesati(lista, 1, x => priorita(x), casuale)[0] || lista[0];
      usate.citazione.add(c.id);
      return { citazione: c, libro: trovaLibro(id) };
    });

    return {
      entitaTipo: 'citazione', entitaId: coppie[0].citazione.id,
      entitaMultiple: coppie.map(x => ({ tipo: 'citazione', id: x.citazione.id })),
      formato: 'abbinamento',
      consegna: 'Riporta ogni citazione al suo libro',
      aiuto: 'Tocca una citazione e poi il libro a cui appartiene.',
      coppie: coppie.map(x => ({
        citazioneId: x.citazione.id,
        testo: accorcia(x.citazione.testo, 130),
        libroId: x.libro.id
      })),
      libri: mescola(coppie.map(x => ({ id: x.libro.id, titolo: x.libro.titolo, autore: x.libro.autore.join(', ') })), casuale),
      etichetta: coppie.map(x => x.libro.titolo).join(' · '),
      verifica: risposta => {
        // risposta: { citazioneId: libroId }
        const esiti = coppie.map(x => ({
          id: x.citazione.id,
          corretto: risposta && risposta[x.citazione.id] === x.libro.id
        }));
        const giuste = esiti.filter(e => e.corretto).length;
        return {
          esito: giuste === coppie.length ? 'corretto' : giuste === 0 ? 'sbagliato' : 'parziale',
          dettaglio: `${giuste} su ${coppie.length}`,
          perElemento: esiti.map(e => ({ tipo: 'citazione', id: e.id, esito: e.corretto ? 'corretto' : 'sbagliato' }))
        };
      }
    };
  },

  /* 7 — Chi è l'autore di questo libro? ---------------------------------- */
  'autore-libro' (mat, usate, casuale) {
    const l = scegliLibro(mat, usate, casuale, x => x.autore.length);
    if (!l) return null;
    const giusto = l.autore[0];
    const altri = autoriDiversiDa(giusto, 3, casuale);
    if (altri.length < 3) return null;
    usate.libro.add(l.id);
    return {
      entitaTipo: 'libro', entitaId: l.id,
      formato: 'scelta',
      consegna: 'Chi ha scritto questo libro?',
      testo: l.titolo,
      libroDaMostrare: l,
      opzioni: mescola([giusto, ...altri], casuale).map(a => ({ id: a, testo: a })),
      corretta: giusto,
      etichetta: `${l.titolo} → ${giusto}`,
      verifica: r => ({ esito: r === giusto ? 'corretto' : 'sbagliato' })
    };
  },

  /* 8 — A quale libro appartiene questa trama? --------------------------- */
  trama (mat, usate, casuale) {
    const l = scegliLibro(mat, usate, casuale, x => (x.trama || '').length >= 40);
    if (!l) return null;
    const distrattori = libriSimili(l, 3, casuale);
    if (distrattori.length < 3) return null;
    usate.libro.add(l.id);
    return {
      entitaTipo: 'libro', entitaId: l.id,
      formato: 'scelta',
      consegna: 'A quale libro appartiene questa trama?',
      testo: coprNomiPropri(l.trama, l),
      aiuto: 'I nomi propri sono coperti.',
      opzioni: mescola([l, ...distrattori], casuale).map(x => ({ id: x.id, testo: x.titolo, sotto: x.autore.join(', ') })),
      corretta: l.id,
      etichetta: l.titolo,
      verifica: r => ({ esito: r === l.id ? 'corretto' : 'sbagliato' })
    };
  },

  /* 9 — Cosa ti ha colpito di questo libro? ------------------------------ */
  colpito (mat, usate, casuale) {
    const l = scegliLibro(mat, usate, casuale, x => (x.impressionePersonale || '').trim().length >= 10);
    if (!l) return null;
    usate.libro.add(l.id);
    return {
      entitaTipo: 'libro', entitaId: l.id,
      formato: 'aperta',
      consegna: `Cosa ti aveva colpito di «${l.titolo}»?`,
      libroDaMostrare: l,
      aiuto: 'Scrivi quello che ti viene in mente, poi confronti.',
      atteso: l.impressionePersonale,
      etichetta: l.titolo,
      rivelaHTML: () => `<div class="quiz-rivelazione">
          <h4>Avevi scritto</h4>
          <p>${esc(l.impressionePersonale)}</p>
        </div>`
    };
  },

  /* 10 — Con quale libro si collega? ------------------------------------- */
  collegamento (mat, usate, casuale) {
    const candidati = mat.libri.filter(l => !usate.libro.has(l.id) && collegamentiDi(l.id).length);
    if (!candidati.length) return null;
    const l = estraiPesati(candidati, 1, priorita, casuale)[0];
    const legami = collegamentiDi(l.id);
    const legame = legami[Math.floor(casuale() * legami.length)];
    const altroId = legame.libroA_id === l.id ? legame.libroB_id : legame.libroA_id;
    const altro = trovaLibro(altroId);
    if (!altro) return null;

    const collegatiIds = new Set(legami.flatMap(c => [c.libroA_id, c.libroB_id]));
    const estranei = stato.libri.filter(x => x.id !== l.id && !collegatiIds.has(x.id));
    // in una libreria piccola e molto intrecciata i libri «estranei» sono
    // pochi: meglio tre alternative vere che nessuna domanda
    if (estranei.length < 2) return null;
    const quanti = Math.min(3, estranei.length);
    usate.libro.add(l.id);

    return {
      entitaTipo: 'libro', entitaId: l.id,
      formato: 'scelta',
      consegna: `A quale libro avevi collegato «${l.titolo}»?`,
      libroDaMostrare: l,
      opzioni: mescola([altro, ...mescola(estranei, casuale).slice(0, quanti)], casuale)
        .map(x => ({ id: x.id, testo: x.titolo, sotto: x.autore.join(', ') })),
      corretta: altro.id,
      etichetta: `${l.titolo} ◇ ${altro.titolo}`,
      verifica: r => ({ esito: r === altro.id ? 'corretto' : 'sbagliato' }),
      rivelaHTML: esito => esito === 'corretto' && legame.nota
        ? `<div class="quiz-rivelazione"><h4>La tua nota su questo legame</h4><p>${esc(legame.nota)}</p></div>`
        : (legame.nota ? `<div class="quiz-rivelazione"><h4>Era «${esc(altro.titolo)}». La tua nota diceva</h4><p>${esc(legame.nota)}</p></div>` : '')
    };
  },

  /* 11 — Elementi chiave -------------------------------------------------- */
  elementi (mat, usate, casuale) {
    const l = scegliLibro(mat, usate, casuale, x => (x.elementiChiave || []).length >= 2);
    if (!l) return null;
    usate.libro.add(l.id);
    const quanti = Math.min(3, l.elementiChiave.length);
    return {
      entitaTipo: 'libro', entitaId: l.id,
      formato: 'aperta',
      consegna: `Elenca a memoria ${quanti === 2 ? 'due' : 'tre'} elementi chiave di «${l.titolo}»`,
      libroDaMostrare: l,
      aiuto: 'Uno per riga, come ti vengono.',
      atteso: l.elementiChiave.map(e => e.testo).join('\n'),
      elementiAttesi: l.elementiChiave,
      etichetta: l.titolo,
      rivelaHTML: (esito, risposta) => `<div class="quiz-rivelazione">
          <h4>Gli elementi che avevi scritto</h4>
          <ul class="quiz-elenco">${l.elementiChiave.map(e => {
            const toccato = elementoToccato(e.testo, risposta);
            const tipo = (TIPI_ELEMENTO.find(t => t.id === e.tipo) || {}).etichetta;
            return `<li class="${toccato ? 'is-toccato' : ''}">${esc(e.testo)}${tipo ? ` <span class="minuscolo">— ${esc(tipo)}</span>` : ''}</li>`;
          }).join('')}</ul>
          <p class="minuscolo">In evidenza quelli che sembrano comparire nella tua risposta: è solo un confronto di parole, il giudizio è tuo.</p>
        </div>`
    };
  },

  /* 12 — Anno, genere, dettaglio ----------------------------------------- */
  metadati (mat, usate, casuale) {
    const l = scegliLibro(mat, usate, casuale, x => x.annoPubblicazione || x.generi.length || x.editore);
    if (!l) return null;

    const possibili = [];
    if (l.annoPubblicazione) possibili.push('anno');
    if (l.generi.length) possibili.push('genere');
    if (l.editore) possibili.push('editore');
    const quale = possibili[Math.floor(casuale() * possibili.length)];

    let corretta, opzioni, consegna;
    if (quale === 'anno') {
      const anno = l.annoPubblicazione;
      const alternative = new Set();
      let tentativi = 0;
      while (alternative.size < 3 && tentativi++ < 40) {
        const delta = Math.floor(casuale() * 24) - 12;
        const a = anno + (delta === 0 ? 5 : delta);
        if (a !== anno && a > 0) alternative.add(a);
      }
      if (alternative.size < 3) return null;
      corretta = String(anno);
      opzioni = mescola([anno, ...alternative], casuale).map(a => ({ id: String(a), testo: String(a) }));
      consegna = `In che anno è stato pubblicato «${l.titolo}»?`;
    } else if (quale === 'genere') {
      const mio = l.generi[0];
      const altri = [...new Set(stato.libri.flatMap(x => x.generi))]
        .filter(g => normalizza(g) !== normalizza(mio));
      if (altri.length < 3) return null;
      corretta = mio;
      opzioni = mescola([mio, ...mescola(altri, casuale).slice(0, 3)], casuale).map(g => ({ id: g, testo: g }));
      consegna = `Con che genere avevi schedato «${l.titolo}»?`;
    } else {
      const mio = l.editore;
      const altri = [...new Set(stato.libri.map(x => x.editore).filter(Boolean))]
        .filter(e => normalizza(e) !== normalizza(mio));
      if (altri.length < 3) return null;
      corretta = mio;
      opzioni = mescola([mio, ...mescola(altri, casuale).slice(0, 3)], casuale).map(e => ({ id: e, testo: e }));
      consegna = `Chi ha pubblicato «${l.titolo}»?`;
    }

    usate.libro.add(l.id);
    return {
      entitaTipo: 'libro', entitaId: l.id,
      formato: 'scelta',
      consegna,
      libroDaMostrare: l,
      opzioni,
      corretta,
      etichetta: `${l.titolo}: ${corretta}`,
      verifica: r => ({ esito: r === corretta ? 'corretto' : 'sbagliato' })
    };
  }
};

/* ================================================================ supporti */

function scegliCitazione (mat, usate, casuale, filtro = () => true) {
  const candidati = mat.citazioni.filter(c => !usate.citazione.has(c.id) && filtro(c));
  if (!candidati.length) return null;
  return estraiPesati(candidati, 1, priorita, casuale)[0];
}

function scegliLibro (mat, usate, casuale, filtro = () => true) {
  const candidati = mat.libri.filter(l => !usate.libro.has(l.id) && filtro(l));
  if (!candidati.length) return null;
  return estraiPesati(candidati, 1, l => priorita(l, { preferisciPreferite: false }), casuale)[0];
}

/** Distrattori credibili: prima i libri che condividono autore o genere,
 *  poi gli altri. Un'alternativa a caso si riconosce subito e non insegna
 *  niente. */
function libriSimili (libro, quanti, casuale) {
  const altri = stato.libri.filter(l => l.id !== libro.id);
  const punteggio = l => {
    let p = 0;
    if (l.autore.some(a => libro.autore.some(b => normalizza(a) === normalizza(b)))) p += 3;
    if (l.generi.some(g => libro.generi.some(h => normalizza(g) === normalizza(h)))) p += 2;
    if (l.temi.some(t => libro.temi.some(u => normalizza(t) === normalizza(u)))) p += 1;
    if (l.annoPubblicazione && libro.annoPubblicazione &&
        Math.abs(l.annoPubblicazione - libro.annoPubblicazione) < 30) p += 1;
    return p;
  };
  const ordinati = altri
    .map(l => ({ l, p: punteggio(l), r: casuale() }))
    .sort((a, b) => b.p - a.p || a.r - b.r)
    .map(x => x.l);
  // prendo dai primi, ma non sempre gli stessi tre
  const bacino = ordinati.slice(0, Math.max(quanti, Math.min(ordinati.length, quanti + 3)));
  return mescola(bacino, casuale).slice(0, quanti);
}

function autoriDiversiDa (autore, quanti, casuale) {
  const n = normalizza(autore);
  const tutti = [...new Set(stato.libri.flatMap(l => l.autore))].filter(a => normalizza(a) !== n);
  return mescola(tutti, casuale).slice(0, quanti);
}

/** Ritaglia dalla citazione una sequenza di 2–5 parole portanti da oscurare.
 *  Evita articoli e preposizioni: oscurare «della» non prova niente. */
export function ritagliaBuco (testo, casuale = Math.random) {
  const pezzi = String(testo).trim().split(/\s+/);
  if (pezzi.length < 6) return null;

  const portante = p => {
    const n = normalizza(p);
    return n.length >= 4 && !STOPWORDS.has(n) && !/^\d+$/.test(n);
  };

  // non tocco la primissima parola (serve un appiglio per cominciare a
  // leggere) e lascio sempre spazio ad almeno due parole nel buco
  const inizi = [];
  for (let i = 1; i <= pezzi.length - 2; i++) if (portante(pezzi[i])) inizi.push(i);
  if (!inizi.length) return null;

  const inizio = inizi[Math.floor(casuale() * inizi.length)];
  const massimo = Math.min(5, pezzi.length - inizio);
  let quante = Math.max(2, Math.min(massimo, 2 + Math.floor(casuale() * 4)));
  // la sequenza deve restare per metà fatta di parole portanti
  while (quante > 2) {
    const seq = pezzi.slice(inizio, inizio + quante);
    if (seq.filter(portante).length >= Math.ceil(seq.length / 2)) break;
    quante--;
  }

  const mancante = pezzi.slice(inizio, inizio + quante).join(' ');
  const conBuco = [
    ...pezzi.slice(0, inizio),
    '⟨' + '_'.repeat(Math.min(14, Math.max(5, Math.round(mancante.length * 0.6)))) + '⟩',
    ...pezzi.slice(inizio + quante)
  ].join(' ');

  return { conBuco, mancante, quante };
}

/** Copre i nomi propri di una trama: quelli che compaiono nel titolo o negli
 *  autori, i personaggi elencati fra gli elementi chiave, e in generale le
 *  parole maiuscole che non aprono una frase. */
export function coprNomiPropri (trama, libro) {
  const daCoprire = new Set();
  const aggiungi = s => paroleSignificative(s, 3).forEach(p => daCoprire.add(p));
  aggiungi(libro.titolo);
  aggiungi(libro.sottotitolo);
  (libro.autore || []).forEach(aggiungi);
  (libro.elementiChiave || [])
    .filter(e => e.tipo === 'personaggio')
    .forEach(e => aggiungi(e.testo));

  const pezzi = String(trama).split(/(\s+)/);
  let inizioFrase = true;
  return pezzi.map(pezzo => {
    if (/^\s+$/.test(pezzo)) return pezzo;
    const nudo = normalizza(pezzo);
    const maiuscola = /^[A-ZÀ-Þ]/.test(pezzo);
    const daNascondere = daCoprire.has(nudo) ||
      (maiuscola && !inizioFrase && nudo.length > 2 && !STOPWORDS.has(nudo));
    inizioFrase = /[.!?:»]$/.test(pezzo);
    return daNascondere ? '⟨…⟩' : pezzo;
  }).join('');
}

/** Un elemento chiave «sembra toccato» se almeno una delle sue parole
 *  portanti compare nella risposta. Solo un aiuto all'autovalutazione. */
function elementoToccato (elemento, risposta) {
  const attese = paroleSignificative(elemento, 4);
  if (!attese.length) return false;
  const date = new Set(paroleSignificative(risposta || '', 4));
  return attese.some(p => date.has(p));
}

function accorcia (testo, max) {
  const t = String(testo).trim();
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

export function mescola (arr, casuale = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(casuale() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Mescola i tipi tenendo conto del loro peso: i tipi «pesanti» escono
 *  in cima più spesso, ma nessuno è escluso a priori. */
function mescolaPesati (tipi, casuale) {
  return tipi
    .map(t => ({ t, chiave: casuale() / Math.max(0.2, t.peso) }))
    .sort((a, b) => a.chiave - b.chiave)
    .map(x => x.t);
}
