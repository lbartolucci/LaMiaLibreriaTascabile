/* =========================================================================
   form-collegamento.js — creare o modificare un collegamento fra due libri
   ========================================================================= */

import {
  foglio, avviso, qs, qsa, delega, copertinaHTML, conferma, vibra, vuotoHTML
} from '../ui.js';
import { esc, normalizza } from '../utils/text.js';
import * as store from '../store.js';
import { nuovoCollegamento, TIPI_COLLEGAMENTO, ErroreValidazione } from '../models.js';

export function apriFormCollegamento ({ libroA_id, libroB_id = '', tipo = 'tema', nota = '', collegamento = null } = {}) {
  const c = collegamento
    ? { ...collegamento }
    : nuovoCollegamento({ libroA_id, libroB_id, tipo, nota });

  const libroA = store.libro(c.libroA_id);
  if (!libroA) { avviso('Libro non trovato.', 'errore'); return Promise.resolve(); }

  const f = foglio({
    titolo: collegamento ? 'Modifica collegamento' : 'Collega a un altro libro',
    classe: 'foglio--alto',
    contenuto: `
      <div class="pannello pannello--piatto" style="display:flex;gap:12px;align-items:center">
        <div style="width:34px;flex:0 0 34px">${copertinaHTML(libroA)}</div>
        <div><strong>${esc(libroA.titolo)}</strong><div class="minuscolo">si collega a…</div></div>
      </div>
      <div id="scelta-libro"></div>
      <div id="dettagli-collegamento" hidden>
        <div class="campo">
          <label>Che tipo di legame</label>
          <div class="chips" id="tipi-collegamento" style="flex-wrap:wrap;overflow:visible">
            ${TIPI_COLLEGAMENTO.map(t =>
              `<button type="button" class="chip ${t.id === c.tipo ? 'is-attivo' : ''}" data-tipo="${t.id}">${t.etichetta}</button>`
            ).join('')}
          </div>
        </div>
        <div class="campo">
          <label for="col-nota">Perché li colleghi</label>
          <textarea id="col-nota" rows="3" placeholder="La tua nota. È questa che il quiz ti mostrerà quando indovini.">${esc(c.nota)}</textarea>
        </div>
        <div class="campo">
          <label for="col-forza">Quanto è forte il legame</label>
          <input type="range" id="col-forza" min="1" max="3" step="1" value="${c.forza}" style="width:100%">
          <div class="minuscolo" id="etichetta-forza"></div>
        </div>
      </div>`,
    azioni: `
      <button class="btn btn--fantasma" data-az="annulla">Annulla</button>
      <button class="btn btn--pieno" data-az="salva" disabled>Collega</button>`
  });

  const scelta = qs('#scelta-libro', f.elemento);
  const dettagli = qs('#dettagli-collegamento', f.elemento);
  const btnSalva = qs('[data-az="salva"]', f.elemento);
  const etichettaForza = qs('#etichetta-forza', f.elemento);
  const inputForza = qs('#col-forza', f.elemento);

  const nomiForza = { 1: 'Legame leggero', 2: 'Legame netto', 3: 'Legame forte' };
  const aggiornaForza = () => {
    c.forza = Number(inputForza.value);
    etichettaForza.textContent = nomiForza[c.forza];
  };
  inputForza.addEventListener('input', aggiornaForza);
  aggiornaForza();

  function disegnaScelta () {
    const candidati = store.stato.libri.filter(l => l.id !== c.libroA_id);
    if (!candidati.length) {
      scelta.innerHTML = vuotoHTML({
        icona: '❦', titolo: 'Serve almeno un altro libro',
        testo: 'I collegamenti nascono fra due libri: aggiungine un secondo e torna qui.'
      });
      return;
    }
    scelta.innerHTML = `
      <div class="barra-ricerca" style="margin-top:12px">
        <input type="search" id="q-libri" placeholder="Cerca fra i tuoi libri" autocomplete="off" aria-label="Cerca fra i tuoi libri">
      </div>
      <div id="elenco-libri" class="lista-libri"></div>`;
    // niente contenitore a scorrimento annidato: sul telefono due scroll
    // sovrapposti sono sempre una lotta con il dito

    const elenco = qs('#elenco-libri', scelta);
    const filtra = (q = '') => {
      const nq = normalizza(q);
      const visibili = candidati.filter(l =>
        !nq || normalizza(l.titolo).includes(nq) || l.autore.some(a => normalizza(a).includes(nq)));
      if (!visibili.length) { elenco.innerHTML = '<p class="testo-guida" style="padding:12px 2px">Nessun libro con questo nome.</p>'; return; }
      elenco.innerHTML = visibili.map(l => {
        const gia = store.esisteCollegamento(c.libroA_id, l.id);
        const stesso = gia && (!collegamento || gia.id !== c.id);
        return `<button type="button" class="riga-libro ${l.id === c.libroB_id ? 'is-scelto' : ''}"
                        data-libro="${l.id}" ${stesso ? 'disabled style="opacity:.4"' : ''}>
          <div style="width:42px;flex:0 0 42px">${copertinaHTML(l)}</div>
          <span class="riga-libro__testo">
            <span class="riga-libro__titolo">${esc(l.titolo)}</span>
            <span class="riga-libro__sotto">${esc(l.autore.join(', '))}${stesso ? ' · già collegato' : ''}</span>
          </span>
          <span class="riga-libro__coda">${l.id === c.libroB_id ? '✓' : ''}</span>
        </button>`;
      }).join('');
    };
    filtra();
    qs('#q-libri', scelta).addEventListener('input', ev => filtra(ev.target.value));
    delega(elenco, 'click', '.riga-libro', (_, b) => {
      c.libroB_id = b.dataset.libro;
      dettagli.hidden = false;
      btnSalva.disabled = false;
      filtra(qs('#q-libri', scelta).value);
      dettagli.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  disegnaScelta();
  if (c.libroB_id) { dettagli.hidden = false; btnSalva.disabled = false; }

  delega(f.elemento, 'click', '[data-tipo]', (_, b) => {
    c.tipo = b.dataset.tipo;
    qsa('[data-tipo]', f.elemento).forEach(x => x.classList.toggle('is-attivo', x === b));
  });

  delega(f.elemento, 'click', '[data-az="annulla"]', () => f.chiudi());
  delega(f.elemento, 'click', '[data-az="salva"]', async () => {
    c.nota = qs('#col-nota', f.elemento).value.trim();
    try {
      await store.salvaCollegamento(c);
      f.chiudi(c);
      vibra();
      avviso('Collegamento creato.', 'ok');
    } catch (e) {
      avviso(e instanceof ErroreValidazione ? e.errori.join(' ') : 'Non riesco a salvare il collegamento.', 'errore');
    }
  });

  return f.promessa;
}

export async function chiediEliminaCollegamento (collegamento) {
  const ok = await conferma('Il collegamento sparirà da entrambe le schede e dal grafo.', {
    titolo: 'Togliere il collegamento?', ok: 'Togli', pericolo: true
  });
  if (!ok) return false;
  await store.eliminaCollegamento(collegamento.id);
  avviso('Collegamento rimosso.');
  return true;
}
