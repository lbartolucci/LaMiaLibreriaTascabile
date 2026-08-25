/* =========================================================================
   statistiche.js — qualche numero sulla libreria, senza esagerare
   ========================================================================= */

import { delega, vuotoHTML, copertinaHTML, plurale } from '../ui.js';
import { esc, terminiRicorrenti } from '../utils/text.js';
import * as store from '../store.js';
import { vaiA } from '../router.js';

export default async function vistaStatistiche () {
  const libri = store.stato.libri;
  const citazioni = store.stato.citazioni;

  if (!libri.length) {
    return {
      titolo: 'Statistiche', indietro: true,
      html: vuotoHTML({ icona: '▤', titolo: 'Ancora niente da contare', testo: 'Aggiungi qualche libro e qui comparirà il ritratto della tua libreria.' })
    };
  }

  const autori = store.autori();
  const temi = store.valoriDistinti('temi');
  const orfani = libri.filter(l => !store.collegamentiDi(l.id).length);
  const senzaCitazioni = libri.filter(l => !store.contaCitazioni(l.id));
  const perAnno = raggruppa(libri, l => l.annoLettura || 'senza anno');
  const perLibro = libri.map(l => ({ l, n: store.contaCitazioni(l.id) })).sort((a, b) => b.n - a.n);
  const ricorrenti = terminiRicorrenti(citazioni.map(c => c.testo), { minDocumenti: 3, max: 12 });
  const votoMedio = libri.filter(l => l.valutazione).reduce((s, l, _, arr) => s + l.valutazione / arr.length, 0);

  return {
    titolo: 'Statistiche',
    titoloTesto: 'Statistiche',
    indietro: true,
    html: `
      <div class="statistiche">
        <div class="stat"><div class="stat__numero">${libri.length}</div><div class="stat__etichetta">libri</div></div>
        <div class="stat"><div class="stat__numero">${citazioni.length}</div><div class="stat__etichetta">citazioni</div></div>
        <div class="stat"><div class="stat__numero">${store.stato.collegamenti.length}</div><div class="stat__etichetta">collegamenti</div></div>
        <div class="stat"><div class="stat__numero">${votoMedio ? votoMedio.toFixed(1) : '–'}</div><div class="stat__etichetta">voto medio</div></div>
      </div>

      ${Object.keys(perAnno).length > 1 ? `
        <section class="sezione">
          <div class="sezione__testa"><h2>Libri per anno di lettura</h2></div>
          ${barreHTML(perAnno)}
        </section>` : ''}

      <section class="sezione">
        <div class="sezione__testa"><h2>Autori più letti</h2></div>
        ${autori.slice(0, 6).map(a => `
          <div class="riga-dato"><dt>${esc(a.nome)}</dt><dd>${plurale(a.libri.length, 'libro', 'libri')}</dd></div>`).join('')}
      </section>

      ${temi.length ? `
        <section class="sezione">
          <div class="sezione__testa"><h2>Temi ricorrenti</h2></div>
          <div class="chips" style="flex-wrap:wrap;overflow:visible">
            ${temi.slice(0, 14).map(t => `<span class="chip">${esc(t.valore)} <span class="chip__n">${t.n}</span></span>`).join('')}
          </div>
        </section>` : ''}

      ${ricorrenti.length ? `
        <section class="sezione">
          <div class="sezione__testa"><h2>Parole che tornano nelle citazioni</h2></div>
          <p class="testo-guida">Compaiono in almeno tre citazioni diverse: spesso sono i fili che attraversano tutta la libreria.</p>
          <div class="chips" style="flex-wrap:wrap;overflow:visible">
            ${ricorrenti.map(t => `<span class="chip">${esc(t.termine)} <span class="chip__n">${t.documenti}</span></span>`).join('')}
          </div>
        </section>` : ''}

      ${perLibro[0] && perLibro[0].n ? `
        <section class="sezione">
          <div class="sezione__testa"><h2>Libri più citati</h2></div>
          <div class="lista-libri">
            ${perLibro.filter(x => x.n).slice(0, 5).map(x => `
              <button class="riga-libro" data-libro="${x.l.id}">
                <div style="width:42px;flex:0 0 42px">${copertinaHTML(x.l)}</div>
                <span class="riga-libro__testo"><span class="riga-libro__titolo">${esc(x.l.titolo)}</span>
                <span class="riga-libro__sotto">${esc(x.l.autore.join(', '))}</span></span>
                <span class="riga-libro__coda">❝${x.n}</span>
              </button>`).join('')}
          </div>
        </section>` : ''}

      ${orfani.length ? `
        <section class="sezione">
          <div class="sezione__testa"><h2>Libri isolati</h2></div>
          <p class="testo-guida">${plurale(orfani.length, 'libro non è collegato', 'libri non sono collegati')} a nessun altro. Sono quelli che rischi di dimenticare.</p>
          <div class="lista-libri">
            ${orfani.slice(0, 8).map(l => `
              <button class="riga-libro" data-libro="${l.id}">
                <div style="width:42px;flex:0 0 42px">${copertinaHTML(l)}</div>
                <span class="riga-libro__testo"><span class="riga-libro__titolo">${esc(l.titolo)}</span>
                <span class="riga-libro__sotto">${esc(l.autore.join(', '))}</span></span>
              </button>`).join('')}
          </div>
        </section>` : ''}

      ${senzaCitazioni.length ? `
        <p class="minuscolo" style="margin-top:24px">${plurale(senzaCitazioni.length, 'libro è', 'libri sono')} senza nemmeno una citazione.</p>` : ''}`,
    dopo: radice => delega(radice, 'click', '[data-libro]', (_, b) => vaiA('/libro/' + b.dataset.libro))
  };
}

function raggruppa (arr, chiave) {
  const out = {};
  arr.forEach(x => { const k = chiave(x); out[k] = (out[k] || 0) + 1; });
  return out;
}

function barreHTML (mappa) {
  const voci = Object.entries(mappa).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  const max = Math.max(...voci.map(v => v[1]));
  return `<div class="barre">${voci.map(([k, n]) => `
    <div class="barra-riga">
      <span>${esc(k)}</span>
      <span class="barra-riga__traccia"><span class="barra-riga__pieno" style="width:${Math.round(n / max * 100)}%"></span></span>
      <span class="barra-riga__n">${n}</span>
    </div>`).join('')}</div>`;
}
