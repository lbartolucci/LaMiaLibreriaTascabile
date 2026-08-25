/* =========================================================================
   ui.js — mattoncini dell'interfaccia
   Nessun framework: piccole funzioni per costruire DOM, fogli modali,
   avvisi, campi tag, stelline. Tutto accessibile da tastiera.
   ========================================================================= */

import { esc, iniziali } from './utils/text.js';

export const qs = (sel, radice = document) => radice.querySelector(sel);
export const qsa = (sel, radice = document) => [...radice.querySelectorAll(sel)];

/** Costruisce un elemento a partire da una stringa HTML. */
export function el (html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Delega di evento: un solo listener sul contenitore. */
export function delega (radice, evento, selettore, gestore) {
  radice.addEventListener(evento, ev => {
    const bersaglio = ev.target.closest(selettore);
    if (bersaglio && radice.contains(bersaglio)) gestore(ev, bersaglio);
  });
}

/** Feedback tattile dove il dispositivo lo supporta (Android; iOS lo ignora). */
export function vibra (ms = 12) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
}

/* ------------------------------------------------------------- avvisi ---- */

let contenitoreAvvisi = null;

export function avviso (messaggio, tipo = 'info', durata = 3200) {
  if (!contenitoreAvvisi) {
    contenitoreAvvisi = el('<div class="avvisi" role="status" aria-live="polite"></div>');
    document.body.appendChild(contenitoreAvvisi);
  }
  const nodo = el(`<div class="avviso avviso--${tipo}">${esc(messaggio)}</div>`);
  contenitoreAvvisi.appendChild(nodo);
  requestAnimationFrame(() => nodo.classList.add('is-visibile'));
  setTimeout(() => {
    nodo.classList.remove('is-visibile');
    setTimeout(() => nodo.remove(), 300);
  }, durata);
  return nodo;
}

/* -------------------------------------------------------- fogli modali ---- */

/* I fogli vivono in <body>, non dentro la vista: se si cambia schermata
   mentre uno è aperto resterebbe lì a coprire tutto. Li teniamo in registro
   e il router li chiude a ogni navigazione. */
const fogliAperti = new Set();

export function chiudiTuttiIFogli () {
  [...fogliAperti].forEach(chiudi => { try { chiudi(undefined); } catch (_) {} });
  fogliAperti.clear();
}

/** Apre un pannello che sale dal basso (bottom sheet).
 *  Ritorna { elemento, chiudi(), promessa } dove la promessa si risolve
 *  con il valore passato a chiudi(). */
export function foglio ({ titolo = '', contenuto = '', azioni = '', classe = '', chiudibile = true } = {}) {
  const precedenteFocus = document.activeElement;
  const sfondo = el(`
    <div class="foglio-sfondo" role="dialog" aria-modal="true" aria-label="${esc(titolo || 'Finestra')}">
      <div class="foglio ${classe}">
        <header class="foglio__testa">
          <div class="foglio__maniglia" aria-hidden="true"></div>
          <h2 class="foglio__titolo">${esc(titolo)}</h2>
          ${chiudibile ? '<button class="btn-icona foglio__chiudi" aria-label="Chiudi">✕</button>' : ''}
        </header>
        <div class="foglio__corpo">${contenuto}</div>
        ${azioni ? `<footer class="foglio__piede">${azioni}</footer>` : ''}
      </div>
    </div>`);
  document.body.appendChild(sfondo);
  document.body.classList.add('senza-scroll');
  requestAnimationFrame(() => sfondo.classList.add('is-aperto'));

  let risolvi;
  const promessa = new Promise(r => { risolvi = r; });
  fogliAperti.add(chiudi);

  function chiudi (valore) {
    fogliAperti.delete(chiudi);
    sfondo.classList.remove('is-aperto');
    document.body.classList.remove('senza-scroll');
    setTimeout(() => sfondo.remove(), 260);
    document.removeEventListener('keydown', suTasto);
    if (precedenteFocus && precedenteFocus.focus) precedenteFocus.focus();
    risolvi(valore);
  }

  function suTasto (ev) {
    if (ev.key === 'Escape' && chiudibile) { ev.preventDefault(); chiudi(undefined); }
    if (ev.key === 'Tab') trappolaFocus(ev, sfondo);
  }

  document.addEventListener('keydown', suTasto);
  if (chiudibile) {
    sfondo.addEventListener('click', ev => { if (ev.target === sfondo) chiudi(undefined); });
    const bottone = qs('.foglio__chiudi', sfondo);
    if (bottone) bottone.addEventListener('click', () => chiudi(undefined));
  }

  // porta il focus sul primo campo utile
  setTimeout(() => {
    const primo = qs('input, textarea, select, button:not(.foglio__chiudi)', sfondo);
    if (primo) primo.focus();
  }, 120);

  return { elemento: sfondo, foglio: qs('.foglio', sfondo), chiudi, promessa };
}

function trappolaFocus (ev, radice) {
  const focusabili = qsa('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', radice)
    .filter(n => n.offsetParent !== null);
  if (!focusabili.length) return;
  const primo = focusabili[0], ultimo = focusabili[focusabili.length - 1];
  if (ev.shiftKey && document.activeElement === primo) { ev.preventDefault(); ultimo.focus(); }
  else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primo.focus(); }
}

/** Conferma sì/no. Non usa window.confirm, che blocca tutto. */
export function conferma (messaggio, { titolo = 'Confermi?', ok = 'Sì', annulla = 'Annulla', pericolo = false } = {}) {
  const f = foglio({
    titolo,
    classe: 'foglio--corto',
    contenuto: `<p class="testo-guida">${esc(messaggio)}</p>`,
    azioni: `
      <button class="btn btn--fantasma" data-az="no">${esc(annulla)}</button>
      <button class="btn ${pericolo ? 'btn--pericolo' : 'btn--pieno'}" data-az="si">${esc(ok)}</button>`
  });
  delega(f.elemento, 'click', '[data-az]', (_, b) => f.chiudi(b.dataset.az === 'si'));
  return f.promessa.then(v => v === true);
}

/* -------------------------------------------------------------- stelle ---- */

/** Stelline con mezzi voti. In sola lettura restituisce HTML;
 *  se interattivo, va poi collegato con collegaStelle(). */
export function stelleHTML (valore, { interattivo = false, nome = 'valutazione' } = {}) {
  const v = Number(valore) || 0;
  let html = `<div class="stelle ${interattivo ? 'stelle--attive' : ''}" data-valore="${v}" ${interattivo ? `role="slider" tabindex="0" aria-label="Valutazione" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${v}"` : `aria-label="Valutazione ${v} su 5"`}>`;
  for (let i = 1; i <= 5; i++) {
    const pieno = v >= i, mezzo = !pieno && v >= i - 0.5;
    html += `<span class="stella ${pieno ? 'is-piena' : mezzo ? 'is-mezza' : ''}" data-i="${i}">★</span>`;
  }
  html += interattivo ? `<input type="hidden" name="${esc(nome)}" value="${v}">` : '';
  html += '</div>';
  return html;
}

export function collegaStelle (contenitore) {
  qsa('.stelle--attive', contenitore).forEach(gruppo => {
    const campo = qs('input[type=hidden]', gruppo);
    const applica = v => {
      gruppo.dataset.valore = v;
      gruppo.setAttribute('aria-valuenow', v);
      if (campo) campo.value = v;
      qsa('.stella', gruppo).forEach(s => {
        const i = Number(s.dataset.i);
        s.classList.toggle('is-piena', v >= i);
        s.classList.toggle('is-mezza', v < i && v >= i - 0.5);
      });
    };
    gruppo.addEventListener('click', ev => {
      const stella = ev.target.closest('.stella');
      if (!stella) return;
      const i = Number(stella.dataset.i);
      const r = stella.getBoundingClientRect();
      const metà = (ev.clientX - r.left) < r.width / 2;
      let v = metà ? i - 0.5 : i;
      if (Number(gruppo.dataset.valore) === v) v = 0;   // ri-tocco = azzera
      applica(v);
      vibra(8);
    });
    gruppo.addEventListener('keydown', ev => {
      const v = Number(gruppo.dataset.valore) || 0;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { ev.preventDefault(); applica(Math.min(5, v + 0.5)); }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { ev.preventDefault(); applica(Math.max(0, v - 0.5)); }
    });
  });
}

/* ------------------------------------------------------ campo con tag ---- */

/** Campo per liste di parole (autori, generi, temi, tag).
 *  I valori vivono in un input nascosto separato da virgole. */
export function campoTagHTML ({ nome, etichetta, valori = [], suggerimenti = [], aiuto = '' }) {
  const idLista = `sugg-${nome}-${Math.random().toString(36).slice(2, 7)}`;
  return `
    <div class="campo campo-tag" data-campo-tag="${esc(nome)}">
      <label for="in-${esc(nome)}">${esc(etichetta)}</label>
      <div class="tag-pillole" data-pillole></div>
      <input id="in-${esc(nome)}" class="tag-input" type="text" list="${idLista}"
             placeholder="scrivi e premi Invio" autocomplete="off">
      <datalist id="${idLista}">
        ${suggerimenti.slice(0, 200).map(s => `<option value="${esc(s)}"></option>`).join('')}
      </datalist>
      <input type="hidden" name="${esc(nome)}" value="${esc(valori.join('|'))}">
      ${aiuto ? `<p class="campo__aiuto">${esc(aiuto)}</p>` : ''}
    </div>`;
}

export function collegaCampiTag (contenitore) {
  qsa('[data-campo-tag]', contenitore).forEach(campo => {
    const nascosto = qs('input[type=hidden]', campo);
    const input = qs('.tag-input', campo);
    const pillole = qs('[data-pillole]', campo);

    const leggi = () => (nascosto.value ? nascosto.value.split('|').filter(Boolean) : []);
    const scrivi = v => { nascosto.value = v.join('|'); disegna(); };
    const disegna = () => {
      pillole.innerHTML = leggi().map((v, i) =>
        `<span class="pillola">${esc(v)}<button type="button" class="pillola__x" data-i="${i}" aria-label="Togli ${esc(v)}">✕</button></span>`
      ).join('');
    };

    const aggiungi = testo => {
      const parti = String(testo).split(/[,;|]/).map(s => s.trim()).filter(Boolean);
      if (!parti.length) return;
      const v = leggi();
      parti.forEach(p => { if (!v.some(x => x.toLowerCase() === p.toLowerCase())) v.push(p); });
      scrivi(v);
      input.value = '';
    };

    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); aggiungi(input.value); }
      if (ev.key === 'Backspace' && !input.value) { const v = leggi(); v.pop(); scrivi(v); }
    });
    input.addEventListener('blur', () => aggiungi(input.value));
    input.addEventListener('change', () => aggiungi(input.value));   // scelta dal datalist
    pillole.addEventListener('click', ev => {
      const b = ev.target.closest('.pillola__x');
      if (!b) return;
      const v = leggi(); v.splice(Number(b.dataset.i), 1); scrivi(v);
    });
    disegna();
  });
}

/** Legge un form e restituisce un oggetto con le liste già spacchettate. */
export function leggiForm (form) {
  const dati = {};
  new FormData(form).forEach((v, k) => {
    if (k in dati) {
      dati[k] = Array.isArray(dati[k]) ? [...dati[k], v] : [dati[k], v];
    } else dati[k] = v;
  });
  // i campi tag usano il separatore |
  qsa('[data-campo-tag]', form).forEach(c => {
    const nome = c.dataset.campoTag;
    dati[nome] = (dati[nome] || '').split('|').filter(Boolean);
  });
  return dati;
}

/* ---------------------------------------------------------- copertine ---- */

/** Copertina del libro, con segnaposto tipografico se manca l'immagine. */
export function copertinaHTML (libro, { classe = '' } = {}) {
  const src = libro.copertinaBase64 || libro.copertinaUrl;
  if (src) {
    return `<div class="copertina ${classe}">
      <img src="${esc(src)}" alt="Copertina di ${esc(libro.titolo)}" loading="lazy"
           onerror="this.closest('.copertina').classList.add('copertina--rotta')">
      <span class="copertina__ripiego">${esc(iniziali(libro.titolo))}</span>
    </div>`;
  }
  return `<div class="copertina copertina--vuota ${classe}" aria-hidden="true">
    <span class="copertina__ripiego">${esc(iniziali(libro.titolo))}</span>
  </div>`;
}

/* ------------------------------------------------------------- formati ---- */

export function dataBreve (iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function plurale (n, singolare, plurale_) {
  return `${n} ${n === 1 ? singolare : plurale_}`;
}

/** Stato vuoto scritto bene: titolo, spiegazione, azione. */
export function vuotoHTML ({ icona = '📖', titolo, testo, azione = '' }) {
  return `<div class="vuoto">
    <div class="vuoto__icona" aria-hidden="true">${icona}</div>
    <h3>${esc(titolo)}</h3>
    <p>${esc(testo)}</p>
    ${azione}
  </div>`;
}

/** Spinner discreto per le attese di rete. */
export function attesaHTML (testo = 'Un momento…') {
  return `<div class="attesa"><span class="attesa__ruota" aria-hidden="true"></span>${esc(testo)}</div>`;
}
