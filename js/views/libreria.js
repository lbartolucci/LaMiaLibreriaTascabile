/* =========================================================================
   libreria.js — la vista principale: griglia o lista dei libri, filtri
   ========================================================================= */

import {
  qs, qsa, delega, el, copertinaHTML, stelleHTML, vuotoHTML, foglio, avviso, plurale
} from '../ui.js';
import { esc, normalizza } from '../utils/text.js';
import * as store from '../store.js';
import { vaiA } from '../router.js';
import { STATI_LIBRO } from '../models.js';
import { apriAggiungiLibro } from './form-libro.js';
import { conteggioScadenze } from '../quiz/srs.js';
import { serveIlPromemoria, giorniDallUltimoBackup } from '../backup.js';

/* I filtri restano quelli scelti finché l'app è aperta: se torni indietro
   dalla scheda di un libro ritrovi l'elenco come l'avevi lasciato. */
const filtri = {
  stato: '', autore: '', genere: '', tema: '', anno: '',
  valutazioneMin: 0, conCitazioni: false, senzaCollegamenti: false,
  ordine: 'recenti'
};

export default async function vistaLibreria (parametri) {
  const imp = store.stato.impostazioni;
  const nLibri = store.stato.libri.length;
  const nCitazioni = store.stato.citazioni.length;

  if (parametri.query && parametri.query.nuovo) {
    setTimeout(() => apriAggiungiLibro(), 120);   // scorciatoia dalla home screen
  }

  return {
    titolo: 'Libreria',
    titoloTesto: 'Libreria',
    sottotitolo: nLibri
      ? `${plurale(nLibri, 'libro', 'libri')} · ${plurale(nCitazioni, 'citazione', 'citazioni')}`
      : 'ancora vuota',
    azioni: `
      <button class="btn-icona" id="btn-cerca" aria-label="Cerca ovunque">
        <svg class="glifo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.4 15.4 4.1 4.1"/></svg>
      </button>
      <button class="btn-icona" id="btn-vista" aria-label="Cambia visualizzazione">${iconaVista(imp.vistaLibreria)}</button>`,
    html: corpoHTML(),
    dopo: collega,
    pulisci: () => { if (disiscrivi) { disiscrivi(); disiscrivi = null; } }
  };
}

let disiscrivi = null;

/** Il pulsante mostra la vista verso cui si passerà, non quella corrente. */
function iconaVista (attuale) {
  return attuale === 'griglia'
    ? '<svg class="glifo" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16"/></svg>'
    : '<svg class="glifo" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.4"/><rect x="13" y="4" width="7" height="7" rx="1.4"/><rect x="4" y="13" width="7" height="7" rx="1.4"/><rect x="13" y="13" width="7" height="7" rx="1.4"/></svg>';
}

/* --------------------------------------------------------------- corpo -- */

function corpoHTML () {
  const libri = applicaFiltri(store.stato.libri);
  const imp = store.stato.impostazioni;

  if (!store.stato.libri.length) {
    return `
      ${vuotoHTML({
        icona: '❦',
        titolo: 'La tua libreria è vuota',
        testo: 'Comincia dall\'ultimo libro che hai finito: cercalo per titolo e in trenta secondi è dentro, con copertina e dati. Poi aggiungi la citazione che ti è rimasta in testa.',
        azione: '<button class="btn btn--pieno" data-az="aggiungi">Aggiungi il primo libro</button>'
      })}
      <p class="minuscolo" style="text-align:center;margin-top:-14px">
        Vuoi vedere com'è quando è piena? In Impostazioni c'è il pulsante per caricare cinque libri di prova.
      </p>`;
  }

  const scadenze = conteggioScadenze();
  const giorniSenzaBackup = giorniDallUltimoBackup();

  return `
    ${serveIlPromemoria() ? `
      <button class="promemoria" data-vai="/impostazioni">
        <span>
          <strong>${giorniSenzaBackup === null ? 'Non hai mai fatto un backup' : `Ultimo backup ${plurale(giorniSenzaBackup, 'giorno fa', 'giorni fa')}`}</strong>
          <span class="minuscolo" style="display:block;margin-top:2px">Un file, trenta secondi: è l'unica cosa che sta fra te e la perdita di tutto.</span>
        </span>
        <span class="riga-libro__coda">›</span>
      </button>` : ''}

    ${scadenze.totale ? `
      <button class="pannello scadenze" data-vai="/studio" style="width:100%;text-align:left;cursor:pointer">
        <span>
          <strong>${plurale(scadenze.citazioni, 'citazione', 'citazioni')}${scadenze.libri ? ` e ${plurale(scadenze.libri, 'libro', 'libri')}` : ''} da ripassare oggi</strong>
          <span class="minuscolo" style="display:block;margin-top:2px">Tocca per fare il ripasso.</span>
        </span>
        <span class="riga-libro__coda">›</span>
      </button>` : ''}

    <div class="chips" id="scorciatoie">
      <button class="chip" data-vai="/citazioni">❝ Citazioni <span class="chip__n">${store.stato.citazioni.length}</span></button>
      <button class="chip" data-vai="/grafo">◇ Grafo <span class="chip__n">${store.stato.collegamenti.length}</span></button>
      <button class="chip" data-vai="/statistiche">▤ Statistiche</button>
    </div>

    <div class="chips" id="filtri-rapidi" role="group" aria-label="Filtra per stato">
      <button class="chip ${!filtri.stato ? 'is-attivo' : ''}" data-stato="">Tutti</button>
      ${STATI_LIBRO.map(s => {
        const n = store.stato.libri.filter(l => l.stato === s).length;
        return n ? `<button class="chip ${filtri.stato === s ? 'is-attivo' : ''}" data-stato="${s}">${s[0].toUpperCase() + s.slice(1)} <span class="chip__n">${n}</span></button>` : '';
      }).join('')}
      <button class="chip" id="btn-filtri">⚙ Filtri${contaFiltriAttivi() ? ` <span class="chip__n">${contaFiltriAttivi()}</span>` : ''}</button>
    </div>

    ${contaFiltriAttivi() ? `<p class="minuscolo" style="display:flex;justify-content:space-between;align-items:center">
        <span>${plurale(libri.length, 'libro', 'libri')} su ${store.stato.libri.length}</span>
        <button class="sezione__azione" data-az="azzera-filtri">azzera i filtri</button>
      </p>` : ''}

    <div id="elenco">
      ${libri.length ? (imp.vistaLibreria === 'griglia' ? grigliaHTML(libri) : listaHTML(libri))
        : vuotoHTML({ icona: '⌕', titolo: 'Nessun libro con questi filtri', testo: 'Prova ad allentarli: magari cercavi un tema che non hai ancora usato.', azione: '<button class="btn btn--fantasma" data-az="azzera-filtri">Azzera i filtri</button>' })}
    </div>

    <button class="fab" id="fab-aggiungi" aria-label="Aggiungi un libro">+</button>`;
}

function grigliaHTML (libri) {
  return `<div class="griglia-libri">${libri.map(l => {
    const n = store.contaCitazioni(l.id);
    return `<button class="card-libro" data-libro="${l.id}">
      ${copertinaHTML(l)}
      <span class="card-libro__titolo">${esc(l.titolo)}</span>
      <span class="card-libro__autore">${esc(l.autore.join(', '))}</span>
      <span class="card-libro__meta">
        ${l.valutazione ? stelleHTML(l.valutazione) : ''}
        ${n ? `<span class="conta-citazioni">❝ ${n}</span>` : ''}
      </span>
    </button>`;
  }).join('')}</div>`;
}

function listaHTML (libri) {
  return `<div class="lista-libri">${libri.map(l => {
    const n = store.contaCitazioni(l.id);
    const c = store.collegamentiDi(l.id).length;
    return `<button class="riga-libro" data-libro="${l.id}">
      <div style="width:42px;flex:0 0 42px">${copertinaHTML(l)}</div>
      <span class="riga-libro__testo">
        <span class="riga-libro__titolo">${esc(l.titolo)}</span>
        <span class="riga-libro__sotto">${esc(l.autore.join(', '))}${l.annoLettura ? ` · letto nel ${l.annoLettura}` : ''}</span>
      </span>
      <span class="riga-libro__coda">
        ${l.valutazione ? stelleHTML(l.valutazione) + '<br>' : ''}
        ${n ? `<span class="conta-citazioni">❝ ${n}</span>` : ''}${c ? ` ◇ ${c}` : ''}
      </span>
    </button>`;
  }).join('')}</div>`;
}

/* ------------------------------------------------------------- filtri --- */

function applicaFiltri (libri) {
  let out = libri.filter(l => {
    if (filtri.stato && l.stato !== filtri.stato) return false;
    if (filtri.autore && !l.autore.some(a => normalizza(a) === normalizza(filtri.autore))) return false;
    if (filtri.genere && !l.generi.some(g => normalizza(g) === normalizza(filtri.genere))) return false;
    if (filtri.tema && !l.temi.some(t => normalizza(t) === normalizza(filtri.tema))) return false;
    if (filtri.anno && String(l.annoLettura || '') !== String(filtri.anno)) return false;
    if (filtri.valutazioneMin && (l.valutazione || 0) < filtri.valutazioneMin) return false;
    if (filtri.conCitazioni && !store.contaCitazioni(l.id)) return false;
    if (filtri.senzaCollegamenti && store.collegamentiDi(l.id).length) return false;
    return true;
  });

  const perTitolo = (a, b) => a.titolo.localeCompare(b.titolo, 'it');
  const ordinamenti = {
    recenti: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
    titolo: perTitolo,
    autore: (a, b) => (a.autore[0] || 'ω').localeCompare(b.autore[0] || 'ω', 'it') || perTitolo(a, b),
    valutazione: (a, b) => (b.valutazione || 0) - (a.valutazione || 0) || perTitolo(a, b),
    anno: (a, b) => (b.annoLettura || 0) - (a.annoLettura || 0) || perTitolo(a, b),
    citazioni: (a, b) => store.contaCitazioni(b.id) - store.contaCitazioni(a.id) || perTitolo(a, b)
  };
  return out.sort(ordinamenti[filtri.ordine] || ordinamenti.recenti);
}

function contaFiltriAttivi () {
  let n = 0;
  if (filtri.autore) n++;
  if (filtri.genere) n++;
  if (filtri.tema) n++;
  if (filtri.anno) n++;
  if (filtri.valutazioneMin) n++;
  if (filtri.conCitazioni) n++;
  if (filtri.senzaCollegamenti) n++;
  return n;
}

function apriFiltri (ridisegna) {
  const autori = store.autori();
  const generi = store.valoriDistinti('generi');
  const temi = store.valoriDistinti('temi');
  const anni = [...new Set(store.stato.libri.map(l => l.annoLettura).filter(Boolean))].sort((a, b) => b - a);

  const f = foglio({
    titolo: 'Filtri e ordinamento',
    contenuto: `
      <div class="campo">
        <label for="fl-ordine">Ordina per</label>
        <select id="fl-ordine">
          ${[['recenti', 'Aggiunti di recente'], ['titolo', 'Titolo'], ['autore', 'Autore'],
             ['valutazione', 'Valutazione'], ['anno', 'Anno di lettura'], ['citazioni', 'Numero di citazioni']]
            .map(([v, t]) => `<option value="${v}" ${filtri.ordine === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label for="fl-autore">Autore</label>
        <select id="fl-autore"><option value="">Tutti</option>
          ${autori.map(a => `<option value="${esc(a.nome)}" ${filtri.autore === a.nome ? 'selected' : ''}>${esc(a.nome)} (${a.libri.length})</option>`).join('')}
        </select>
      </div>
      <div class="riga-campi">
        <div class="campo">
          <label for="fl-genere">Genere</label>
          <select id="fl-genere"><option value="">Tutti</option>
            ${generi.map(g => `<option value="${esc(g.valore)}" ${filtri.genere === g.valore ? 'selected' : ''}>${esc(g.valore)} (${g.n})</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="fl-tema">Tema</label>
          <select id="fl-tema"><option value="">Tutti</option>
            ${temi.map(t => `<option value="${esc(t.valore)}" ${filtri.tema === t.valore ? 'selected' : ''}>${esc(t.valore)} (${t.n})</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="riga-campi">
        <div class="campo">
          <label for="fl-anno">Anno di lettura</label>
          <select id="fl-anno"><option value="">Tutti</option>
            ${anni.map(a => `<option value="${a}" ${String(filtri.anno) === String(a) ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="fl-voto">Almeno</label>
          <select id="fl-voto">
            ${[0, 2, 3, 3.5, 4, 4.5, 5].map(v => `<option value="${v}" ${filtri.valutazioneMin === v ? 'selected' : ''}>${v ? v + ' stelle' : 'qualsiasi voto'}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="interruttore pannello pannello--piatto">
        <label for="fl-citazioni">Solo libri con citazioni</label>
        <input type="checkbox" id="fl-citazioni" ${filtri.conCitazioni ? 'checked' : ''}>
      </div>
      <div class="interruttore pannello pannello--piatto">
        <label for="fl-orfani">Solo libri senza collegamenti</label>
        <input type="checkbox" id="fl-orfani" ${filtri.senzaCollegamenti ? 'checked' : ''}>
      </div>`,
    azioni: `
      <button class="btn btn--fantasma" data-az="azzera">Azzera</button>
      <button class="btn btn--pieno" data-az="applica">Applica</button>`
  });

  delega(f.elemento, 'click', '[data-az="azzera"]', () => {
    Object.assign(filtri, { stato: '', autore: '', genere: '', tema: '', anno: '', valutazioneMin: 0, conCitazioni: false, senzaCollegamenti: false, ordine: 'recenti' });
    f.chiudi(); ridisegna();
  });
  delega(f.elemento, 'click', '[data-az="applica"]', () => {
    filtri.ordine = qs('#fl-ordine', f.elemento).value;
    filtri.autore = qs('#fl-autore', f.elemento).value;
    filtri.genere = qs('#fl-genere', f.elemento).value;
    filtri.tema = qs('#fl-tema', f.elemento).value;
    filtri.anno = qs('#fl-anno', f.elemento).value;
    filtri.valutazioneMin = Number(qs('#fl-voto', f.elemento).value);
    filtri.conCitazioni = qs('#fl-citazioni', f.elemento).checked;
    filtri.senzaCollegamenti = qs('#fl-orfani', f.elemento).checked;
    f.chiudi(); ridisegna();
  });
}

/* ----------------------------------------------------------- interazioni */

function collega (radice) {
  // La delega degli eventi sta sul contenitore, che sopravvive ai ridisegni:
  // va agganciata una volta sola, altrimenti a ogni ridisegno si duplicherebbe.
  const ridisegna = () => {
    radice.innerHTML = corpoHTML();
    const sotto = qs('.sottotesta', qs('#testa'));
    if (sotto) {
      sotto.textContent = store.stato.libri.length
        ? `${plurale(store.stato.libri.length, 'libro', 'libri')} · ${plurale(store.stato.citazioni.length, 'citazione', 'citazioni')}`
        : 'ancora vuota';
    }
  };

  // se i dati cambiano (per esempio dopo aver aggiunto un libro da un foglio)
  // l'elenco si aggiorna da solo
  if (disiscrivi) disiscrivi();
  disiscrivi = store.osserva(tipo => {
    if (['libro', 'libro-eliminato', 'citazione', 'citazione-eliminata',
         'collegamento', 'collegamento-eliminato', 'caricato'].includes(tipo)) ridisegna();
  });

  delega(radice, 'click', '[data-libro]', (_, b) => vaiA('/libro/' + b.dataset.libro));
  delega(radice, 'click', '[data-vai]', (_, b) => vaiA(b.dataset.vai));
  delega(radice, 'click', '[data-stato]', (_, b) => { filtri.stato = b.dataset.stato; ridisegna(); });
  delega(radice, 'click', '[data-az="azzera-filtri"]', () => {
    Object.assign(filtri, { stato: '', autore: '', genere: '', tema: '', anno: '', valutazioneMin: 0, conCitazioni: false, senzaCollegamenti: false });
    ridisegna();
  });
  delega(radice, 'click', '#btn-filtri', () => apriFiltri(ridisegna));
  delega(radice, 'click', '[data-az="aggiungi"], #fab-aggiungi', () => apriAggiungiLibro());

  // pulsanti dell'intestazione
  const testa = qs('#testa');
  const btnCerca = qs('#btn-cerca', testa);
  if (btnCerca) btnCerca.onclick = () => vaiA('/cerca');
  const btnVista = qs('#btn-vista', testa);
  if (btnVista) btnVista.onclick = async () => {
    const nuova = store.stato.impostazioni.vistaLibreria === 'griglia' ? 'lista' : 'griglia';
    await store.salvaImpostazioni({ vistaLibreria: nuova });
    btnVista.innerHTML = iconaVista(nuova);
    ridisegna();
  };
}
