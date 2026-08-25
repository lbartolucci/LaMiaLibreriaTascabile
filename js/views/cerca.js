/* =========================================================================
   cerca.js — ricerca globale
   Cerca contemporaneamente in titoli, autori, citazioni, trame e note,
   e raggruppa i risultati per tipo.
   ========================================================================= */

import { qs, delega, copertinaHTML, vuotoHTML, plurale } from '../ui.js';
import { esc, normalizza, evidenziaQuery, estratto } from '../utils/text.js';
import * as store from '../store.js';
import { vaiA } from '../router.js';

let ultimaQuery = '';

export default async function vistaCerca (parametri) {
  if (parametri.query && parametri.query.q) ultimaQuery = parametri.query.q;
  return {
    titolo: 'Cerca',
    titoloTesto: 'Cerca',
    indietro: true,
    html: `
      <div class="barra-ricerca">
        <input type="search" id="q-globale" placeholder="Titoli, autori, citazioni, note…"
               value="${esc(ultimaQuery)}" autocomplete="off" enterkeyhint="search" aria-label="Cerca ovunque">
      </div>
      <div id="risultati" aria-live="polite">${risultatiHTML(ultimaQuery)}</div>`,
    dopo: collega
  };
}

function risultatiHTML (q) {
  const nq = normalizza(q);
  if (nq.length < 2) {
    return `<p class="testo-guida">Scrivi almeno due lettere. Cerco nei titoli, negli autori, nelle citazioni, nelle trame, negli elementi chiave, nelle tue note e nei tag.</p>`;
  }

  const libri = store.stato.libri.filter(l =>
    normalizza([l.titolo, l.sottotitolo, l.autore.join(' '), l.editore,
      l.generi.join(' '), l.temi.join(' ')].join(' ')).includes(nq));

  const citazioni = store.stato.citazioni.filter(c =>
    normalizza([c.testo, c.contesto, c.capitolo, c.tag.join(' ')].join(' ')).includes(nq));

  const trame = store.stato.libri.filter(l =>
    !libri.includes(l) && normalizza([l.trama, l.impressionePersonale,
      (l.elementiChiave || []).map(e => e.testo).join(' ')].join(' ')).includes(nq));

  const collegamenti = store.stato.collegamenti.filter(c => normalizza(c.nota || '').includes(nq));

  const totale = libri.length + citazioni.length + trame.length + collegamenti.length;
  if (!totale) {
    return vuotoHTML({
      icona: '⌕', titolo: 'Nessun risultato',
      testo: `Niente per «${q}». Prova con una parola più corta: la ricerca ignora accenti e maiuscole ma non fa magie.`
    });
  }

  let html = `<p class="minuscolo">${plurale(totale, 'risultato', 'risultati')}</p>`;

  if (libri.length) {
    html += `<section class="gruppo-risultati"><h3>Libri (${libri.length})</h3>
      <div class="lista-libri">${libri.map(l => `
        <button class="riga-libro" data-libro="${l.id}">
          <div style="width:42px;flex:0 0 42px">${copertinaHTML(l)}</div>
          <span class="riga-libro__testo">
            <span class="riga-libro__titolo">${evidenziaQuery(l.titolo, q)}</span>
            <span class="riga-libro__sotto">${evidenziaQuery(l.autore.join(', '), q)}</span>
          </span>
        </button>`).join('')}</div></section>`;
  }

  if (citazioni.length) {
    html += `<section class="gruppo-risultati"><h3>Citazioni (${citazioni.length})</h3>
      ${citazioni.slice(0, 40).map(c => {
        const libro = store.libro(c.libroId);
        const dove = normalizza(c.testo).includes(nq) ? c.testo : (c.contesto || c.testo);
        return `<button class="citazione-card" data-citazione="${c.id}">
          <p class="citazione-card__testo">${evidenziaQuery(estratto(dove, q, 90), q)}</p>
          <span class="citazione-card__fonte"><span>${esc(libro ? libro.titolo : '')}</span>
          ${c.pagina != null ? `<span>· p. ${c.pagina}</span>` : ''}</span>
        </button>`;
      }).join('')}
      ${citazioni.length > 40 ? '<p class="minuscolo">Mostrate le prime 40.</p>' : ''}</section>`;
  }

  if (trame.length) {
    html += `<section class="gruppo-risultati"><h3>Nelle trame e nelle note (${trame.length})</h3>
      <div class="lista-libri">${trame.map(l => {
        const fonte = normalizza(l.trama).includes(nq) ? l.trama
          : normalizza(l.impressionePersonale).includes(nq) ? l.impressionePersonale
          : (l.elementiChiave.find(e => normalizza(e.testo).includes(nq)) || {}).testo || '';
        return `<button class="riga-libro" data-libro="${l.id}">
          <div style="width:42px;flex:0 0 42px">${copertinaHTML(l)}</div>
          <span class="riga-libro__testo">
            <span class="riga-libro__titolo">${esc(l.titolo)}</span>
            <span class="riga-libro__sotto">${evidenziaQuery(estratto(fonte, q, 60), q)}</span>
          </span>
        </button>`;
      }).join('')}</div></section>`;
  }

  if (collegamenti.length) {
    html += `<section class="gruppo-risultati"><h3>Note dei collegamenti (${collegamenti.length})</h3>
      <div class="lista-libri">${collegamenti.map(c => {
        const a = store.libro(c.libroA_id), b = store.libro(c.libroB_id);
        if (!a || !b) return '';
        return `<button class="riga-libro" data-libro="${a.id}">
          <span class="riga-libro__testo">
            <span class="riga-libro__titolo">${esc(a.titolo)} ◇ ${esc(b.titolo)}</span>
            <span class="riga-libro__sotto">${evidenziaQuery(c.nota, q)}</span>
          </span>
        </button>`;
      }).join('')}</div></section>`;
  }

  return html;
}

function collega (radice) {
  const input = qs('#q-globale', radice);
  const risultati = qs('#risultati', radice);
  let timer = null;

  input.addEventListener('input', () => {
    ultimaQuery = input.value;
    clearTimeout(timer);
    timer = setTimeout(() => { risultati.innerHTML = risultatiHTML(ultimaQuery); }, 200);
  });
  setTimeout(() => input.focus(), 200);

  delega(radice, 'click', '[data-libro]', (_, b) => vaiA('/libro/' + b.dataset.libro));
  delega(radice, 'click', '[data-citazione]', (_, b) => vaiA('/citazione/' + b.dataset.citazione));
}
