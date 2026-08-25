/* =========================================================================
   esplora.js — suggerimenti di lettura e lista dei desideri
   Caroselli orizzontali, ognuno con la sua motivazione scritta in chiaro.
   Tre azioni per ogni card: lo voglio, l'ho già letto, non mi interessa.
   ========================================================================= */

import {
  qs, qsa, delega, avviso, vuotoHTML, attesaHTML, foglio, conferma,
  plurale, dataBreve, vibra, el
} from '../ui.js';
import { esc, iniziali } from '../utils/text.js';
import * as store from '../store.js';
import { vaiA } from '../router.js';
import { uuid } from '../models.js';
import * as sugg from '../suggerimenti.js';
import { offline } from '../catalog.js';
import { apriFormLibro, libroDaScheda } from './form-libro.js';

let controllo = null;      // per annullare le chiamate se lasci la sezione

export default async function vistaEsplora (parametri = {}) {
  if (parametri.sezione === 'desideri') return vistaDesideri();

  if (!store.stato.libri.length) {
    return {
      titolo: 'Esplora', titoloTesto: 'Esplora',
      html: vuotoHTML({
        icona: '◈', titolo: 'Prima serve una libreria',
        testo: 'I suggerimenti nascono da quello che hai letto: senza libri non ho da cosa partire.',
        azione: '<button class="btn btn--pieno" data-az="libreria">Aggiungi il primo libro</button>'
      }),
      dopo: radice => delega(radice, 'click', '[data-az="libreria"]', () => vaiA('/libreria'))
    };
  }

  return {
    titolo: 'Esplora',
    titoloTesto: 'Esplora',
    sottotitolo: 'a partire dalla tua libreria',
    azioni: `<button class="btn-icona" id="btn-desideri" aria-label="Lista dei desideri">
        <svg class="glifo" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4v-17Z"/></svg>
      </button>`,
    html: `
      ${store.stato.desideri.length ? `
        <button class="pannello scadenze" data-vai="/desideri" style="width:100%;text-align:left;cursor:pointer">
          <span>
            <strong>${plurale(store.stato.desideri.length, 'titolo', 'titoli')} nella lista dei desideri</strong>
            <span class="minuscolo" style="display:block;margin-top:2px">Tocca per vederli.</span>
          </span>
          <span class="riga-libro__coda">›</span>
        </button>` : ''}
      <div id="caroselli">${attesaHTML('Guardo cosa c\'è, partendo dai tuoi libri…')}</div>`,
    dopo: collega,
    pulisci: () => { if (controllo) { controllo.abort(); controllo = null; } }
  };
}

/* --------------------------------------------------------- i caroselli --- */

async function collega (radice) {
  const zona = qs('#caroselli', radice);
  const btnDesideri = qs('#btn-desideri', qs('#testa'));
  if (btnDesideri) btnDesideri.onclick = () => vaiA('/desideri');
  delega(radice, 'click', '[data-vai]', (_, b) => vaiA(b.dataset.vai));

  collegaAzioni(radice, zona);
  await disegnaCaroselli(zona);
}

async function disegnaCaroselli (zona, { forzaAggiornamento = false } = {}) {
  if (controllo) controllo.abort();
  controllo = new AbortController();

  // prima la cache: aprire Esplora dev'essere istantaneo
  if (!forzaAggiornamento) {
    const salvati = await sugg.caroselliInCache().catch(() => null);
    if (salvati && salvati.length) {
      mostra(zona, salvati, { daCache: true });
      return;
    }
  }

  if (offline()) {
    zona.innerHTML = vuotoHTML({
      icona: '⚠', titolo: 'Esplora ha bisogno della connessione',
      testo: 'È l\'unica sezione che parla con l\'esterno: i cataloghi stanno online. Tutto il resto dell\'app funziona lo stesso.',
      azione: '<button class="btn btn--fantasma" data-az="riprova">Riprova</button>'
    });
    return;
  }

  zona.innerHTML = attesaHTML('Guardo cosa c\'è, partendo dai tuoi libri…');
  const trovati = [];

  try {
    await sugg.costruisciCaroselli({
      segnale: controllo.signal,
      aggiornaProgressivo: carosello => {
        trovati.push(carosello);
        mostra(zona, trovati, { inCorso: true });
      }
    });
  } catch (e) {
    if (controllo.signal.aborted) return;
    console.warn(e);
  }

  if (!trovati.length) {
    zona.innerHTML = vuotoHTML({
      icona: '∅', titolo: 'Non sono riuscito a proporti niente',
      testo: 'I cataloghi non hanno risposto, oppure di quello che leggi non hanno abbastanza. Riprova fra un po\'.',
      azione: '<button class="btn btn--fantasma" data-az="riprova">Riprova</button>'
    });
    return;
  }

  mostra(zona, trovati, {});
  sugg.salvaCaroselli(trovati).catch(() => {});
}

function mostra (zona, caroselli, { inCorso = false, daCache = false }) {
  // i caroselli da cui scarti spesso scendono in fondo
  const scarti = id => {
    const r = store.stato.scartati.find(s => s.id === 'scarti:' + id);
    return r ? (r.quanti || 0) : 0;
  };
  caroselli = caroselli.slice().sort((a, b) => scarti(a.id) - scarti(b.id));

  zona.innerHTML = caroselli.map(caroselloHTML).join('') +
    (inCorso ? attesaHTML('Cerco ancora…') : `
      <p class="minuscolo" style="margin-top:20px;display:flex;justify-content:space-between;align-items:center">
        <span>${daCache ? 'Proposte messe da parte poco fa.' : 'Proposte da Open Library e Google Books.'}</span>
        <button class="sezione__azione" data-az="aggiorna">aggiorna</button>
      </p>`);
  // i dati delle schede restano appesi ai nodi, non serializzati nel DOM
  const tutte = caroselli.flatMap(c => c.schede.map(s => ({ s, c })));
  qsa('.card-suggerita', zona).forEach((nodo, i) => {
    if (tutte[i]) { nodo._scheda = tutte[i].s; nodo._carosello = tutte[i].c.id; }
  });
}

function caroselloHTML (c) {
  return `
    <section class="carosello ${c.fuoriRotta ? 'carosello--fuori' : ''}">
      <div class="carosello__testa">
        <h2>${esc(c.titolo)}</h2>
        ${c.fuoriRotta ? '<span class="etichetta-fuori">fuori rotta</span>' : ''}
      </div>
      <p class="carosello__perche">${esc(c.motivazione)}</p>
      <div class="carosello__pista">
        ${c.schede.map(cardHTML).join('')}
      </div>
    </section>`;
}

function cardHTML (s) {
  const meta = [s.autore.slice(0, 2).join(', '), s.annoPubblicazione].filter(Boolean).join(' · ');
  const descrizione = (s.descrizione || '').replace(/\s+/g, ' ').trim();
  return `
    <article class="card-suggerita">
      <div class="card-suggerita__copertina">
        <span class="copertina__ripiego">${esc(iniziali(s.titolo))}</span>
        ${s.copertinaUrl ? `<img src="${esc(s.copertinaUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      </div>
      <h3 class="card-suggerita__titolo">${esc(s.titolo)}</h3>
      <p class="card-suggerita__meta">${esc(meta)}</p>
      ${descrizione ? `<p class="card-suggerita__descrizione">${esc(descrizione.slice(0, 150))}${descrizione.length > 150 ? '…' : ''}</p>` : ''}
      <p class="card-suggerita__perche">${esc(s.perche || '')}</p>
      <div class="card-suggerita__azioni">
        <button class="btn btn--piccolo btn--pieno" data-az="desidero">Lo voglio</button>
        <button class="btn btn--piccolo btn--fantasma" data-az="letto">L'ho letto</button>
        <button class="btn-icona" data-az="scarta" aria-label="Non mi interessa"
                style="width:34px;height:34px;min-width:34px">✕</button>
      </div>
    </article>`;
}

function collegaAzioni (radice, zona) {
  delega(radice, 'click', '[data-az="riprova"], [data-az="aggiorna"]', async () => {
    await sugg.dimenticaCaroselli();
    disegnaCaroselli(zona, { forzaAggiornamento: true });
  });

  delega(radice, 'click', '.card-suggerita [data-az]', async (ev, bottone) => {
    const card = bottone.closest('.card-suggerita');
    const s = card && card._scheda;
    if (!s) return;
    const az = bottone.dataset.az;

    if (az === 'desidero') {
      await store.salvaDesiderio({
        id: uuid(),
        titolo: s.titolo, sottotitolo: s.sottotitolo, autore: s.autore,
        annoPubblicazione: s.annoPubblicazione, editore: s.editore,
        isbn: s.isbn, copertinaUrl: s.copertinaUrl, generi: s.generi,
        descrizione: s.descrizione, fonte: s.fonte, chiave: s.chiave,
        motivo: s.perche, carosello: card._carosello,
        aggiuntoIl: new Date().toISOString()
      });
      vibra();
      avviso('Aggiunto alla lista dei desideri.', 'ok');
      sfilaCard(card);
    }

    if (az === 'letto') {
      const libro = libroDaScheda(s);
      libro.annoLettura = null;                 // non lo sappiamo: lo scrive lui
      await apriFormLibro(libro, { nuovo: true, scheda: s });
      sfilaCard(card);
    }

    if (az === 'scarta') {
      await store.scarta(sugg.chiaveScarto(s), { tipo: 'esplora', carosello: card._carosello, titolo: s.titolo });
      await pesaMenoIlMotivo(card._carosello);
      avviso('Non te lo riproporrò.');
      sfilaCard(card);
    }
  });
}

function sfilaCard (card) {
  const pista = card.parentElement;
  card.style.transition = 'opacity 200ms, transform 200ms';
  card.style.opacity = '0';
  card.style.transform = 'scale(.96)';
  setTimeout(() => {
    card.remove();
    if (pista && !pista.querySelector('.card-suggerita')) {
      const sezione = pista.closest('.carosello');
      if (sezione) sezione.remove();
    }
  }, 210);
}

/** «Non mi interessa» non toglie solo quel titolo: abbassa anche il peso di
 *  quel tipo di proposta, così un carosello che sbaglia mira sparisce. */
async function pesaMenoIlMotivo (caroselloId) {
  if (!caroselloId) return;
  const chiave = 'scarti:' + caroselloId;
  const attuale = store.stato.scartati.find(s => s.id === chiave);
  const quanti = (attuale && attuale.quanti ? attuale.quanti : 0) + 1;
  await store.scarta(chiave, { tipo: 'peso', quanti });
  if (quanti === 4) {
    avviso('Questo tipo di proposta non ti convince: lo terrò più in basso.', 'info', 4200);
  }
}

/* ================================================== lista dei desideri === */

function vistaDesideri () {
  const desideri = store.stato.desideri
    .slice().sort((a, b) => (b.aggiuntoIl || '').localeCompare(a.aggiuntoIl || ''));

  if (!desideri.length) {
    return {
      titolo: 'Desideri', titoloTesto: 'Lista dei desideri', indietro: true,
      html: vuotoHTML({
        icona: '❦', titolo: 'La lista è vuota',
        testo: 'Da Esplora, «Lo voglio» mette qui i titoli che ti hanno incuriosito. Quando li leggi, li promuovi a libri con un tocco.',
        azione: '<button class="btn btn--pieno" data-az="esplora">Vai a Esplora</button>'
      }),
      dopo: radice => delega(radice, 'click', '[data-az="esplora"]', () => vaiA('/esplora'))
    };
  }

  return {
    titolo: 'Desideri',
    titoloTesto: 'Lista dei desideri',
    sottotitolo: plurale(desideri.length, 'titolo', 'titoli'),
    indietro: true,
    html: `
      <div class="barra-ricerca">
        <input type="search" id="q-desideri" placeholder="Filtra la lista" autocomplete="off" aria-label="Filtra la lista dei desideri">
      </div>
      <div id="elenco-desideri">${elencoDesideriHTML(desideri)}</div>`,
    dopo: radice => collegaDesideri(radice, desideri)
  };
}

function elencoDesideriHTML (desideri) {
  if (!desideri.length) return '<p class="testo-guida">Nessun titolo con questo filtro.</p>';
  return desideri.map(d => `
    <article class="desiderio" data-desiderio="${d.id}">
      <div class="desiderio__copertina">
        <span class="copertina__ripiego">${esc(iniziali(d.titolo))}</span>
        ${d.copertinaUrl ? `<img src="${esc(d.copertinaUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      </div>
      <div class="desiderio__testo">
        <strong>${esc(d.titolo)}</strong>
        <span class="minuscolo">${esc([d.autore && d.autore.join(', '), d.annoPubblicazione].filter(Boolean).join(' · '))}</span>
        ${d.motivo ? `<span class="desiderio__motivo">${esc(d.motivo)}</span>` : ''}
        <span class="minuscolo">aggiunto il ${dataBreve(d.aggiuntoIl)}</span>
      </div>
      <div class="desiderio__azioni">
        <button class="btn btn--piccolo btn--pieno" data-az="promuovi">L'ho letto</button>
        <button class="btn-icona" data-az="togli" aria-label="Togli dalla lista" style="width:34px;height:34px;min-width:34px">✕</button>
      </div>
    </article>`).join('');
}

function collegaDesideri (radice, desideri) {
  const elenco = qs('#elenco-desideri', radice);
  const filtro = qs('#q-desideri', radice);

  filtro.addEventListener('input', () => {
    const q = filtro.value.toLowerCase().trim();
    const visibili = q
      ? desideri.filter(d => (d.titolo + ' ' + (d.autore || []).join(' ')).toLowerCase().includes(q))
      : desideri;
    elenco.innerHTML = elencoDesideriHTML(visibili);
  });

  delega(radice, 'click', '[data-az="esplora"]', () => vaiA('/esplora'));

  delega(radice, 'click', '.desiderio [data-az]', async (_, b) => {
    const card = b.closest('.desiderio');
    const d = store.stato.desideri.find(x => x.id === card.dataset.desiderio);
    if (!d) return;

    if (b.dataset.az === 'promuovi') {
      const libro = libroDaScheda({
        titolo: d.titolo, sottotitolo: d.sottotitolo || '', autore: d.autore || [],
        annoPubblicazione: d.annoPubblicazione, editore: d.editore || '',
        numeroPagine: null, isbn: d.isbn || '', copertinaUrl: d.copertinaUrl || '',
        generi: d.generi || [], lingua: '', fonte: d.fonte, chiave: d.chiave
      });
      const salvato = await apriFormLibro(libro, { nuovo: true });
      if (salvato) {
        await store.eliminaDesiderio(d.id);
        avviso('Promosso a libro letto.', 'ok');
      }
    }

    if (b.dataset.az === 'togli') {
      const ok = await conferma(`«${d.titolo}» esce dalla lista dei desideri.`, { titolo: 'Toglierlo?', ok: 'Togli' });
      if (!ok) return;
      await store.eliminaDesiderio(d.id);
      card.remove();
      if (!qs('.desiderio', elenco)) vaiA('/desideri');
    }
  });
}
