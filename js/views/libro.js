/* =========================================================================
   libro.js — scheda di un libro
   Tutto quello che riguarda un titolo: dati, trama, elementi chiave,
   citazioni, collegamenti e i suggerimenti di collegamento.
   ========================================================================= */

import {
  qs, delega, copertinaHTML, stelleHTML, vuotoHTML, avviso, foglio, plurale, dataBreve
} from '../ui.js';
import { esc, evidenzia, terminiRicorrenti } from '../utils/text.js';
import * as store from '../store.js';
import { vaiA } from '../router.js';
import { TIPI_COLLEGAMENTO, TIPI_ELEMENTO } from '../models.js';
import { apriFormLibro, chiediEliminaLibro } from './form-libro.js';
import { apriFormCitazione, chiediEliminaCitazione } from './form-citazione.js';
import { apriFormCollegamento, chiediEliminaCollegamento } from './form-collegamento.js';
import { suggerisciCollegamenti } from '../collegamenti.js';

let disiscrivi = null;

export default async function vistaLibro (parametri) {
  const l = store.libro(parametri.id);
  if (!l) {
    return {
      titolo: 'Libro non trovato', indietro: true,
      html: vuotoHTML({
        icona: '∅', titolo: 'Questo libro non c\'è più',
        testo: 'Forse l\'hai eliminato, o il collegamento che hai seguito è vecchio.',
        azione: '<button class="btn btn--fantasma" data-az="torna">Torna alla libreria</button>'
      }),
      dopo: radice => delega(radice, 'click', '[data-az="torna"]', () => vaiA('/libreria'))
    };
  }

  return {
    titolo: esc(l.titolo.length > 26 ? l.titolo.slice(0, 25) + '…' : l.titolo),
    titoloTesto: l.titolo,
    sottotitolo: esc(l.autore.join(', ')),
    indietro: true,
    azioni: `<button class="btn-icona" id="btn-menu-libro" aria-label="Altre azioni">⋯</button>`,
    html: corpoHTML(l),
    dopo: radice => collega(radice, l.id),
    pulisci: () => { if (disiscrivi) { disiscrivi(); disiscrivi = null; } }
  };
}

/* --------------------------------------------------------------- corpo -- */

function corpoHTML (l) {
  const citazioni = store.citazioniDi(l.id);
  const collegamenti = store.collegamentiDi(l.id);
  const suggeriti = suggerisciCollegamenti(l, { max: 4 })
    .filter(s => !store.eScartato(store.chiaveCoppia(l.id, s.libro.id)));

  // termini che tornano in più citazioni di questo libro: i fili conduttori
  const ricorrenti = terminiRicorrenti(citazioni.map(c => c.testo), { minDocumenti: 2, max: 12 })
    .map(t => t.termine);

  const meta = [
    l.annoPubblicazione ? `${l.annoPubblicazione}` : '',
    l.editore, l.numeroPagine ? `${l.numeroPagine} pagine` : '',
    l.annoLettura ? `letto nel ${l.annoLettura}` : ''
  ].filter(Boolean).join(' · ');

  return `
    <div class="libro-testa">
      <div style="width:108px;flex:0 0 108px">${copertinaHTML(l)}</div>
      <div class="libro-testa__info">
        <h2 class="libro-testa__titolo">${esc(l.titolo)}</h2>
        ${l.sottotitolo ? `<p class="libro-testa__sottotitolo">${esc(l.sottotitolo)}</p>` : ''}
        <p class="libro-testa__autore">${esc(l.autore.join(', ')) || '<span class="minuscolo">autore non indicato</span>'}</p>
        <div class="libro-testa__riga">
          ${l.valutazione ? stelleHTML(l.valutazione) : ''}
          <span class="badge-stato" data-stato="${esc(l.stato)}">${esc(l.stato)}</span>
        </div>
      </div>
    </div>

    ${meta ? `<p class="minuscolo" style="margin-top:-8px">${esc(meta)}</p>` : ''}

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 6px">
      <button class="btn btn--pieno btn--piccolo" data-az="nuova-citazione">❝ Aggiungi citazione</button>
      <button class="btn btn--piccolo" data-az="nuovo-collegamento">◇ Collega</button>
      <button class="btn btn--fantasma btn--piccolo" data-az="modifica">Modifica</button>
    </div>

    ${(l.generi.length || l.temi.length) ? `
      <div class="chips" style="margin-top:10px;flex-wrap:wrap;overflow:visible">
        ${l.temi.map(t => `<span class="chip is-attivo">${esc(t)}</span>`).join('')}
        ${l.generi.map(g => `<span class="chip">${esc(g)}</span>`).join('')}
      </div>` : ''}

    ${l.trama ? `
      <section class="sezione">
        <div class="sezione__testa"><h2>Trama</h2></div>
        <div class="pannello">
          <p style="margin:0;font-family:var(--serif);line-height:1.6">${esc(l.trama)}</p>
          ${l.tramaDaCatalogo ? '<p class="minuscolo" style="margin:8px 0 0">Testo preso dal catalogo — modificalo quando vuoi.</p>' : ''}
        </div>
      </section>` : ''}

    ${l.elementiChiave.length ? `
      <section class="sezione">
        <div class="sezione__testa"><h2>Elementi chiave</h2></div>
        <ul class="elementi-chiave">
          ${l.elementiChiave.map(e => `
            <li class="elemento-chiave">
              <span class="elemento-chiave__testo">${esc(e.testo)}
                ${e.tipo ? `<span class="elemento-chiave__tipo">${esc((TIPI_ELEMENTO.find(t => t.id === e.tipo) || {}).etichetta || e.tipo)}</span>` : ''}
              </span>
            </li>`).join('')}
        </ul>
      </section>` : ''}

    ${l.impressionePersonale ? `
      <section class="sezione">
        <div class="sezione__testa"><h2>Cosa mi ha colpito</h2></div>
        <div class="pannello" style="border-left:3px solid var(--accento)">
          <p style="margin:0;line-height:1.6">${esc(l.impressionePersonale)}</p>
        </div>
      </section>` : ''}

    <section class="sezione">
      <div class="sezione__testa">
        <h2>Citazioni <span class="minuscolo">${citazioni.length || ''}</span></h2>
        ${citazioni.length ? '<button class="sezione__azione" data-az="nuova-citazione">aggiungi</button>' : ''}
      </div>
      ${citazioni.length
        ? citazioni.map(c => citazioneHTML(c, ricorrenti)).join('')
        : vuotoHTML({
            icona: '❝', titolo: 'Nessuna citazione',
            testo: 'È qui che questa libreria diventa utile: aggiungi il passaggio che ti è rimasto addosso, anche uno solo.',
            azione: '<button class="btn btn--pieno" data-az="nuova-citazione">Aggiungi la prima</button>'
          })}
      ${ricorrenti.length >= 2 ? `<p class="minuscolo">Fra queste citazioni tornano: ${ricorrenti.slice(0, 6).map(t => `<mark class="term">${esc(t)}</mark>`).join(', ')}.</p>` : ''}
    </section>

    <section class="sezione">
      <div class="sezione__testa">
        <h2>Collegamenti <span class="minuscolo">${collegamenti.length || ''}</span></h2>
        ${collegamenti.length ? '<button class="sezione__azione" data-az="nuovo-collegamento">aggiungi</button>' : ''}
      </div>
      ${collegamenti.length
        ? collegamenti.map(c => collegamentoHTML(c, l.id)).join('')
        : `<p class="testo-guida">Nessun collegamento. Un libro isolato è un libro che dimenticherai: legalo a qualcosa che hai già letto.</p>`}
    </section>

    ${suggeriti.length ? `
      <section class="sezione">
        <div class="sezione__testa"><h2>Forse va con…</h2></div>
        <p class="minuscolo" style="margin-top:-6px">Proposte calcolate sui tuoi dati. Accetta o scarta: non creo nulla da solo.</p>
        ${suggeriti.map((s, i) => `
          <div class="suggerimento" data-sugg="${i}">
            <div style="width:34px;flex:0 0 34px">${copertinaHTML(s.libro)}</div>
            <div class="suggerimento__testo">
              <strong>${esc(s.libro.titolo)}</strong>
              <div class="suggerimento__perche">${esc(s.motivi.join(' · '))}</div>
            </div>
            <div class="suggerimento__azioni">
              <button class="btn btn--piccolo" data-accetta="${i}">Collega</button>
              <button class="btn-icona" data-rifiuta="${i}" aria-label="Non mi interessa" style="width:34px;height:34px;min-width:34px">✕</button>
            </div>
          </div>`).join('')}
      </section>` : ''}

    <p class="minuscolo" style="margin-top:28px">Aggiunto il ${dataBreve(l.createdAt)}${l.updatedAt !== l.createdAt ? ` · modificato il ${dataBreve(l.updatedAt)}` : ''}</p>`;
}

function citazioneHTML (c, ricorrenti) {
  const meta = [
    c.pagina != null ? `p. ${c.pagina}` : '',
    c.capitolo ? esc(c.capitolo) : ''
  ].filter(Boolean).join(' · ');
  return `
    <button class="citazione-card ${c.preferita ? 'citazione-card--preferita' : ''}" data-citazione="${c.id}">
      <p class="citazione-card__testo">${evidenzia(c.testo, ricorrenti)}</p>
      <span class="citazione-card__fonte">
        ${c.preferita ? '<span class="cuore">♥</span>' : ''}
        ${meta ? `<span>${meta}</span>` : ''}
        ${c.contesto ? '<span>· con nota</span>' : ''}
      </span>
      ${c.tag.length ? `<span class="citazione-card__tags">${c.tag.map(t => `<span class="etichetta-tag">${esc(t)}</span>`).join('')}</span>` : ''}
    </button>`;
}

function collegamentoHTML (c, libroId) {
  const altro = store.altroCapo(c, libroId);
  if (!altro) return '';
  const tipo = TIPI_COLLEGAMENTO.find(t => t.id === c.tipo) || TIPI_COLLEGAMENTO[0];
  return `
    <button class="collegamento-riga" data-collegamento="${c.id}">
      <div style="width:34px;flex:0 0 34px">${copertinaHTML(altro)}</div>
      <span class="collegamento-riga__testo">
        <span class="collegamento-riga__titolo">${esc(altro.titolo)}</span>
        <span class="collegamento-riga__riga">
          <span class="collegamento-tipo" style="color:${tipo.colore}">${esc(tipo.etichetta)}</span>
          <span class="forza-punti">${[1, 2, 3].map(i => `<i class="${i <= c.forza ? 'is-piena' : ''}"></i>`).join('')}</span>
        </span>
        ${c.nota ? `<span class="collegamento-nota">${esc(c.nota)}</span>` : ''}
      </span>
      <span class="riga-libro__coda">›</span>
    </button>`;
}

/* ----------------------------------------------------------- interazioni */

function collega (radice, libroId) {
  const ridisegna = () => {
    const l = store.libro(libroId);
    if (!l) { vaiA('/libreria'); return; }
    radice.innerHTML = corpoHTML(l);
  };

  if (disiscrivi) disiscrivi();
  disiscrivi = store.osserva(tipo => {
    if (tipo === 'libro-eliminato') return;      // ci pensa chi ha eliminato
    if (['libro', 'citazione', 'citazione-eliminata', 'collegamento',
         'collegamento-eliminato', 'scartato'].includes(tipo)) ridisegna();
  });

  delega(radice, 'click', '[data-az="nuova-citazione"]', () => apriFormCitazione({ libroId }));
  delega(radice, 'click', '[data-az="nuovo-collegamento"]', () => apriFormCollegamento({ libroA_id: libroId }));
  delega(radice, 'click', '[data-az="modifica"]', () => {
    const l = store.libro(libroId);
    if (l) apriFormLibro({ ...l }, { nuovo: false }).then(salvato => { if (salvato) ridisegna(); });
  });

  delega(radice, 'click', '[data-citazione]', (_, b) => vaiA('/citazione/' + b.dataset.citazione));

  delega(radice, 'click', '[data-collegamento]', (_, b) => {
    const c = store.stato.collegamenti.find(x => x.id === b.dataset.collegamento);
    if (c) menuCollegamento(c, libroId);
  });

  delega(radice, 'click', '[data-accetta]', (_, b) => {
    const l = store.libro(libroId);
    const s = suggerisciCollegamenti(l, { max: 4 })
      .filter(x => !store.eScartato(store.chiaveCoppia(libroId, x.libro.id)))[Number(b.dataset.accetta)];
    if (s) apriFormCollegamento({
      libroA_id: libroId, libroB_id: s.libro.id, tipo: s.tipoProposto, nota: s.motivi.join('; ')
    });
  });

  delega(radice, 'click', '[data-rifiuta]', async (_, b) => {
    const l = store.libro(libroId);
    const s = suggerisciCollegamenti(l, { max: 4 })
      .filter(x => !store.eScartato(store.chiaveCoppia(libroId, x.libro.id)))[Number(b.dataset.rifiuta)];
    if (s) {
      await store.scarta(store.chiaveCoppia(libroId, s.libro.id), { tipo: 'collegamento' });
      avviso('Non te lo riproporrò.');
    }
  });

  // menu dell'intestazione
  const btnMenu = qs('#btn-menu-libro', qs('#testa'));
  if (btnMenu) btnMenu.onclick = () => menuLibro(libroId);
}

function menuLibro (libroId) {
  const l = store.libro(libroId);
  if (!l) return;
  const f = foglio({
    titolo: l.titolo,
    classe: 'foglio--corto',
    contenuto: `
      <button class="btn btn--largo btn--fantasma" data-az="modifica" style="margin-bottom:8px">Modifica i dati</button>
      <button class="btn btn--largo btn--fantasma" data-az="citazione" style="margin-bottom:8px">Aggiungi una citazione</button>
      <button class="btn btn--largo btn--fantasma" data-az="collega" style="margin-bottom:8px">Collega a un altro libro</button>
      <button class="btn btn--largo btn--fantasma" data-az="grafo" style="margin-bottom:16px">Vedilo nel grafo</button>
      <button class="btn btn--largo btn--pericolo" data-az="elimina">Elimina il libro</button>`
  });
  delega(f.elemento, 'click', '[data-az]', async (_, b) => {
    const az = b.dataset.az;
    f.chiudi();
    if (az === 'modifica') apriFormLibro({ ...l }, { nuovo: false });
    if (az === 'citazione') apriFormCitazione({ libroId });
    if (az === 'collega') apriFormCollegamento({ libroA_id: libroId });
    if (az === 'grafo') vaiA('/grafo?fuoco=' + libroId);
    if (az === 'elimina') { if (await chiediEliminaLibro(l)) vaiA('/libreria'); }
  });
}

function menuCollegamento (c, libroId) {
  const altro = store.altroCapo(c, libroId);
  const tipo = TIPI_COLLEGAMENTO.find(t => t.id === c.tipo) || TIPI_COLLEGAMENTO[0];
  const f = foglio({
    titolo: altro ? altro.titolo : 'Collegamento',
    classe: 'foglio--corto',
    contenuto: `
      <p class="minuscolo" style="color:${tipo.colore}">${esc(tipo.etichetta)}</p>
      ${c.nota ? `<p class="testo-guida" style="font-style:italic">«${esc(c.nota)}»</p>` : '<p class="testo-guida">Nessuna nota su questo legame.</p>'}
      <button class="btn btn--largo btn--pieno" data-az="apri" style="margin-bottom:8px">Apri «${esc(altro ? altro.titolo : '')}»</button>
      <button class="btn btn--largo btn--fantasma" data-az="modifica" style="margin-bottom:8px">Modifica il collegamento</button>
      <button class="btn btn--largo btn--pericolo" data-az="togli">Togli il collegamento</button>`
  });
  delega(f.elemento, 'click', '[data-az]', async (_, b) => {
    const az = b.dataset.az;
    f.chiudi();
    if (az === 'apri' && altro) vaiA('/libro/' + altro.id);
    if (az === 'modifica') apriFormCollegamento({ libroA_id: c.libroA_id, collegamento: c });
    if (az === 'togli') await chiediEliminaCollegamento(c);
  });
}
