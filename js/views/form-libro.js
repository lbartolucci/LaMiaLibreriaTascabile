/* =========================================================================
   form-libro.js — inserimento e modifica di un libro
   Tre modi per aggiungere: ricerca nei cataloghi, ISBN, tutto a mano.
   Il form è unico: cambia solo da dove arrivano i campi precompilati.
   ========================================================================= */

import {
  foglio, avviso, el, qs, qsa, delega, leggiForm, campoTagHTML, collegaCampiTag,
  stelleHTML, collegaStelle, copertinaHTML, attesaHTML, vuotoHTML, conferma, vibra
} from '../ui.js';
import { esc, iniziali } from '../utils/text.js';
import * as store from '../store.js';
import { nuovoLibro, uuid, STATI_LIBRO, TIPI_ELEMENTO, ErroreValidazione } from '../models.js';
import * as catalogo from '../catalog.js';
import { vaiA } from '../router.js';
import { suggerisciCollegamenti } from '../collegamenti.js';
import { apriFormCitazione } from './form-citazione.js';
import { apriFormCollegamento } from './form-collegamento.js';

/* ===================================================== 1. scelta del modo */

export function apriAggiungiLibro () {
  const f = foglio({
    titolo: 'Aggiungi un libro',
    classe: 'foglio--alto',
    contenuto: `
      <div class="chips" role="tablist" aria-label="Come vuoi aggiungerlo">
        <button class="chip is-attivo" role="tab" data-modo="cerca" aria-selected="true">Cerca nei cataloghi</button>
        <button class="chip" role="tab" data-modo="isbn" aria-selected="false">ISBN</button>
        <button class="chip" role="tab" data-modo="manuale" aria-selected="false">A mano</button>
      </div>
      <div id="pannello-modo"></div>`
  });

  const pannello = qs('#pannello-modo', f.elemento);
  const disegna = modo => {
    qsa('.chip[data-modo]', f.elemento).forEach(c => {
      const attivo = c.dataset.modo === modo;
      c.classList.toggle('is-attivo', attivo);
      c.setAttribute('aria-selected', String(attivo));
    });
    if (modo === 'cerca') pannelloRicerca(pannello, f);
    else if (modo === 'isbn') pannelloIsbn(pannello, f);
    else { f.chiudi(); apriFormLibro(nuovoLibro(), { nuovo: true }); }
  };

  delega(f.elemento, 'click', '.chip[data-modo]', (_, b) => disegna(b.dataset.modo));
  disegna('cerca');
  return f;
}

/* ------------------------------------------------- ricerca nei cataloghi */

function pannelloRicerca (pannello, f) {
  pannello.innerHTML = `
    <div class="barra-ricerca">
      <input type="search" id="q-catalogo" placeholder="Titolo, autore…" autocomplete="off"
             enterkeyhint="search" aria-label="Cerca nei cataloghi">
    </div>
    <div id="esiti-catalogo" aria-live="polite">
      ${vuotoHTML({ icona: '⌕', titolo: 'Cerca il libro', testo: 'Scrivi il titolo o l\'autore: prendo i dati da Open Library e Google Books, poi li correggi come vuoi.' })}
    </div>`;

  const input = qs('#q-catalogo', pannello);
  const esiti = qs('#esiti-catalogo', pannello);
  let timer = null, controllo = null;

  const cerca = async () => {
    const q = input.value.trim();
    if (controllo) controllo.abort();
    if (q.length < 2) { esiti.innerHTML = ''; return; }
    controllo = new AbortController();
    esiti.innerHTML = attesaHTML('Cerco nei cataloghi…');
    try {
      const risultati = await catalogo.cercaLibri(q, { segnale: controllo.signal, limite: 20 });
      if (!risultati.length) {
        esiti.innerHTML = vuotoHTML({
          icona: '∅', titolo: 'Nessun risultato',
          testo: 'Prova con meno parole, oppure inseriscilo a mano: i cataloghi non hanno tutto.',
          azione: '<button class="btn btn--fantasma" data-az="manuale">Inseriscilo a mano</button>'
        });
        return;
      }
      esiti.innerHTML = risultati.map(schedaCatalogoHTML).join('');
      // colleghiamo i dati alle righe senza serializzarli nel DOM
      qsa('.risultato-catalogo', esiti).forEach((riga, i) => { riga._scheda = risultati[i]; });
    } catch (e) {
      esiti.innerHTML = vuotoHTML({
        icona: '⚠', titolo: 'Ricerca non riuscita',
        testo: e.message || 'Non riesco a raggiungere i cataloghi.',
        azione: '<button class="btn btn--fantasma" data-az="manuale">Inseriscilo a mano</button>'
      });
    }
  };

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(cerca, 450); });
  input.addEventListener('search', cerca);
  input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(timer); cerca(); } });

  delega(pannello, 'click', '[data-az="manuale"]', () => { f.chiudi(); apriFormLibro(nuovoLibro(), { nuovo: true }); });
  delega(pannello, 'click', '.risultato-catalogo', (_, riga) => {
    const scheda = riga._scheda;
    if (!scheda) return;
    f.chiudi();
    apriFormLibro(libroDaScheda(scheda), { nuovo: true, scheda });
  });
}

function schedaCatalogoHTML (s) {
  const giaPresente = store.stato.libri.some(l =>
    (s.isbn && l.isbn === s.isbn) ||
    (l.titolo.toLowerCase() === s.titolo.toLowerCase() &&
     (l.autore[0] || '').toLowerCase() === (s.autore[0] || '').toLowerCase()));
  const meta = [s.autore.slice(0, 2).join(', '), s.annoPubblicazione, s.editore].filter(Boolean).join(' · ');
  return `
    <button class="risultato-catalogo ${giaPresente ? 'is-gia-presente' : ''}" type="button">
      ${s.copertinaUrl
        ? `<div class="copertina"><img src="${esc(s.copertinaUrl)}" alt="" loading="lazy" onerror="this.closest('.copertina').classList.add('copertina--rotta')"><span class="copertina__ripiego">${esc(iniziali(s.titolo))}</span></div>`
        : `<div class="copertina copertina--vuota"><span class="copertina__ripiego">${esc(iniziali(s.titolo))}</span></div>`}
      <span class="risultato-catalogo__testo">
        <span class="risultato-catalogo__titolo">${esc(s.titolo)}</span>
        <span class="risultato-catalogo__meta">${esc(meta)}</span>
        <span class="risultato-catalogo__fonte">${s.fonte === 'google' ? 'Google Books' : 'Open Library'}${giaPresente ? ' · già in libreria' : ''}</span>
      </span>
    </button>`;
}

/* --------------------------------------------------------------- ISBN --- */

function pannelloIsbn (pannello, f) {
  const scansionePossibile = 'BarcodeDetector' in window;
  pannello.innerHTML = `
    <div class="campo">
      <label for="isbn-in">Codice ISBN</label>
      <input type="text" id="isbn-in" inputmode="numeric" autocomplete="off"
             placeholder="9788806219369" enterkeyhint="search">
      <p class="campo__aiuto">Le 10 o 13 cifre stampate sotto il codice a barre. I trattini puoi lasciarli.</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn--pieno" id="btn-isbn">Cerca</button>
      ${scansionePossibile ? '<button class="btn btn--fantasma" id="btn-scansiona">Inquadra il codice</button>' : ''}
    </div>
    ${!scansionePossibile ? '<p class="campo__aiuto" style="margin-top:10px">Su questo dispositivo la lettura del codice a barre dalla fotocamera non è disponibile (iPhone e Safari non la supportano): digita le cifre a mano.</p>' : ''}
    <div id="esito-isbn" aria-live="polite" style="margin-top:14px"></div>`;

  const input = qs('#isbn-in', pannello);
  const esito = qs('#esito-isbn', pannello);

  const cerca = async () => {
    const v = input.value.trim();
    if (!v) return;
    esito.innerHTML = attesaHTML('Cerco l\'edizione…');
    try {
      const scheda = await catalogo.perIsbn(v);
      esito.innerHTML = schedaCatalogoHTML(scheda);
      const riga = qs('.risultato-catalogo', esito);
      riga._scheda = scheda;
    } catch (e) {
      esito.innerHTML = vuotoHTML({
        icona: '∅', titolo: 'Non l\'ho trovato',
        testo: e.message || 'Nessun libro con questo ISBN.',
        azione: '<button class="btn btn--fantasma" data-az="manuale">Inseriscilo a mano</button>'
      });
    }
  };

  qs('#btn-isbn', pannello).addEventListener('click', cerca);
  input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); cerca(); } });
  delega(pannello, 'click', '.risultato-catalogo', (_, riga) => {
    if (!riga._scheda) return;
    f.chiudi();
    apriFormLibro(libroDaScheda(riga._scheda), { nuovo: true, scheda: riga._scheda });
  });
  delega(pannello, 'click', '[data-az="manuale"]', () => { f.chiudi(); apriFormLibro(nuovoLibro(), { nuovo: true }); });

  const btnScan = qs('#btn-scansiona', pannello);
  if (btnScan) btnScan.addEventListener('click', () => scansionaCodice(input, cerca));
}

/** Lettura del codice a barre con l'API BarcodeDetector.
 *  Dove non c'è (iOS/Safari) il pulsante non viene nemmeno mostrato. */
async function scansionaCodice (input, poi) {
  let flusso = null;
  const f = foglio({
    titolo: 'Inquadra il codice a barre',
    classe: 'foglio--corto',
    contenuto: '<video id="cam" playsinline muted style="width:100%;border-radius:12px;background:#000"></video><p class="campo__aiuto">Tieni il codice ben illuminato e a fuoco.</p>'
  });
  f.promessa.then(() => { if (flusso) flusso.getTracks().forEach(t => t.stop()); });

  try {
    const formatiDisponibili = await BarcodeDetector.getSupportedFormats();
    const formati = ['ean_13', 'ean_8'].filter(x => formatiDisponibili.includes(x));
    if (!formati.length) throw new Error('formato non supportato');
    const rilevatore = new BarcodeDetector({ formats: formati });
    flusso = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = qs('#cam', f.elemento);
    video.srcObject = flusso;
    await video.play();
    const cerca = async () => {
      if (!flusso) return;
      try {
        const codici = await rilevatore.detect(video);
        const ean = codici.find(c => /^97[89]\d{10}$/.test(c.rawValue));
        if (ean) {
          vibra(20);
          input.value = ean.rawValue;
          f.chiudi();
          poi();
          return;
        }
      } catch (_) {}
      requestAnimationFrame(cerca);
    };
    requestAnimationFrame(cerca);
  } catch (e) {
    f.chiudi();
    avviso('Non riesco ad accedere alla fotocamera. Digita l\'ISBN a mano.', 'errore');
  }
}

/* ---------------------------------------- dal catalogo al nostro modello */

export function libroDaScheda (s) {
  return nuovoLibro({
    titolo: s.titolo,
    sottotitolo: s.sottotitolo,
    autore: s.autore,
    annoPubblicazione: s.annoPubblicazione,
    editore: s.editore,
    numeroPagine: s.numeroPagine,
    isbn: s.isbn,
    copertinaUrl: s.copertinaUrl,
    generi: ripulisciGeneri(s.generi),
    lingua: s.lingua || 'it',
    annoLettura: new Date().getFullYear(),
    origine: { fonte: s.fonte, chiave: s.chiave }
  });
}

/** I soggetti di Open Library sono tantissimi e spesso rumorosi
 *  ("Accessible book", "Protected DAISY"): teniamo i più sensati. */
function ripulisciGeneri (generi) {
  const scarta = /accessible|daisy|protected|in library|overdrive|open library|large type|reading level|lending/i;
  return (generi || [])
    .filter(g => g && g.length < 40 && !scarta.test(g))
    .slice(0, 6);
}

/* ============================================== 2. il form vero e proprio */

export function apriFormLibro (libro, { nuovo = false, scheda = null } = {}) {
  const generiNoti = store.valoriDistinti('generi').map(x => x.valore);
  const temiNoti = store.valoriDistinti('temi').map(x => x.valore);

  const f = foglio({
    titolo: nuovo ? 'Nuovo libro' : 'Modifica libro',
    classe: 'foglio--alto',
    contenuto: `<form id="form-libro" novalidate>${formHTML(libro, { generiNoti, temiNoti, scheda })}</form>`,
    azioni: `
      <button class="btn btn--fantasma" type="button" data-az="annulla">Annulla</button>
      <button class="btn btn--pieno" type="submit" form="form-libro">Salva</button>`
  });

  const form = qs('#form-libro', f.elemento);
  collegaCampiTag(form);
  collegaStelle(form);
  collegaElementiChiave(form, libro.elementiChiave);
  collegaCopertina(form, libro);

  // "precompila la trama dal catalogo"
  const btnTrama = qs('#btn-trama-catalogo', form);
  if (btnTrama) {
    btnTrama.addEventListener('click', async () => {
      btnTrama.disabled = true;
      btnTrama.textContent = 'Cerco…';
      try {
        const testo = await catalogo.descrizioneEstesa(scheda || {
          fonte: libro.origine?.fonte, chiave: libro.origine?.chiave,
          titolo: libro.titolo, autore: libro.autore, isbn: libro.isbn, descrizione: ''
        });
        if (testo) {
          const pulito = testo.replace(/\s*\(\[source\]\[\d+\]\)/g, '').replace(/-{3,}[\s\S]*$/, '').trim();
          qs('[name=trama]', form).value = pulito.slice(0, 800);
          qs('[name=tramaDaCatalogo]', form).value = '1';
          qs('#nota-trama', form).hidden = false;
          avviso('Trama presa dal catalogo: correggila pure.', 'ok');
        } else avviso('Il catalogo non ha una descrizione per questo libro.');
      } catch (e) {
        avviso(e.message || 'Non riesco a recuperare la descrizione.', 'errore');
      } finally {
        btnTrama.disabled = false;
        btnTrama.textContent = 'Prendi la trama dal catalogo';
      }
    });
  }

  delega(f.elemento, 'click', '[data-az="annulla"]', () => f.chiudi());

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const bottone = qs('[type=submit]', f.elemento);
    bottone.disabled = true;
    try {
      const dati = leggiForm(form);
      Object.assign(libro, {
        titolo: dati.titolo,
        sottotitolo: dati.sottotitolo,
        autore: dati.autore,
        annoPubblicazione: dati.annoPubblicazione,
        annoLettura: dati.annoLettura,
        editore: dati.editore,
        lingua: dati.lingua,
        numeroPagine: dati.numeroPagine,
        isbn: dati.isbn,
        copertinaUrl: dati.copertinaUrl,
        generi: dati.generi,
        temi: dati.temi,
        valutazione: dati.valutazione,
        stato: dati.stato,
        trama: dati.trama,
        tramaDaCatalogo: dati.tramaDaCatalogo === '1',
        impressionePersonale: dati.impressionePersonale,
        elementiChiave: leggiElementiChiave(form)
      });

      // se c'è una copertina remota proviamo a metterla da parte per l'offline
      if (libro.copertinaUrl && !libro.copertinaBase64) {
        bottone.textContent = 'Salvo la copertina…';
        try {
          libro.copertinaBase64 = await catalogo.copertinaInBase64(libro.copertinaUrl);
        } catch (_) { /* resta l'URL remoto: nessun danno */ }
      }

      await store.salvaLibro(libro);
      f.chiudi(libro);
      avviso(nuovo ? 'Libro aggiunto.' : 'Modifiche salvate.', 'ok');
      vibra();
      if (nuovo) {
        vaiA('/libro/' + libro.id);
        setTimeout(() => invitoDopoSalvataggio(libro), 420);
      }
    } catch (e) {
      if (e instanceof ErroreValidazione) {
        mostraErrori(form, e.errori);
      } else {
        console.error(e);
        avviso('Non sono riuscito a salvare: ' + e.message, 'errore');
      }
    } finally {
      bottone.disabled = false;
      bottone.textContent = 'Salva';
    }
  });

  return f.promessa;
}

function mostraErrori (form, errori) {
  let box = qs('#errori-form', form);
  if (!box) {
    box = el('<div id="errori-form" class="pannello" role="alert" style="border-color:var(--rosso);background:var(--rosso-tenue)"></div>');
    form.prepend(box);
  }
  box.innerHTML = `<strong style="color:var(--rosso)">Controlla questi punti</strong>
    <ul style="margin:6px 0 0;padding-left:18px">${errori.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function formHTML (l, { generiNoti, temiNoti, scheda }) {
  const anno = new Date().getFullYear();
  return `
    <div class="campo">
      <label for="f-titolo">Titolo *</label>
      <input type="text" id="f-titolo" name="titolo" value="${esc(l.titolo)}" required autocapitalize="words">
    </div>
    <div class="campo">
      <label for="f-sottotitolo">Sottotitolo</label>
      <input type="text" id="f-sottotitolo" name="sottotitolo" value="${esc(l.sottotitolo)}">
    </div>

    ${campoTagHTML({ nome: 'autore', etichetta: 'Autore', valori: l.autore, aiuto: 'Uno per riga: scrivi e premi Invio.' })}

    <div class="riga-campi">
      <div class="campo">
        <label for="f-annoPub">Anno di pubblicazione</label>
        <input type="number" id="f-annoPub" name="annoPubblicazione" inputmode="numeric" value="${l.annoPubblicazione ?? ''}" min="-3000" max="${anno + 1}">
      </div>
      <div class="campo">
        <label for="f-annoLett">Anno di lettura</label>
        <input type="number" id="f-annoLett" name="annoLettura" inputmode="numeric" value="${l.annoLettura ?? ''}" min="1900" max="${anno + 1}">
      </div>
    </div>

    <div class="riga-campi">
      <div class="campo">
        <label for="f-editore">Editore</label>
        <input type="text" id="f-editore" name="editore" value="${esc(l.editore)}">
      </div>
      <div class="campo">
        <label for="f-lingua">Lingua</label>
        <select id="f-lingua" name="lingua">
          ${['it', 'en', 'fr', 'de', 'es', 'la', 'altro'].map(c =>
            `<option value="${c}" ${l.lingua === c ? 'selected' : ''}>${({ it: 'Italiano', en: 'Inglese', fr: 'Francese', de: 'Tedesco', es: 'Spagnolo', la: 'Latino', altro: 'Altro' })[c]}</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <div class="riga-campi">
      <div class="campo">
        <label for="f-pagine">Pagine</label>
        <input type="number" id="f-pagine" name="numeroPagine" inputmode="numeric" value="${l.numeroPagine ?? ''}" min="1" max="20000">
      </div>
      <div class="campo">
        <label for="f-isbn">ISBN</label>
        <input type="text" id="f-isbn" name="isbn" inputmode="numeric" value="${esc(l.isbn)}">
      </div>
    </div>

    <div class="campo">
      <label for="f-stato">Stato</label>
      <select id="f-stato" name="stato">
        ${STATI_LIBRO.map(s => `<option value="${s}" ${l.stato === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
      </select>
    </div>

    <div class="campo">
      <label>Valutazione</label>
      ${stelleHTML(l.valutazione, { interattivo: true, nome: 'valutazione' })}
      <p class="campo__aiuto">Tocca a sinistra o a destra della stella per il mezzo voto. Ritocca la stessa stella per azzerare.</p>
    </div>

    ${campoTagHTML({ nome: 'generi', etichetta: 'Generi', valori: l.generi, suggerimenti: generiNoti })}
    ${campoTagHTML({ nome: 'temi', etichetta: 'Temi', valori: l.temi, suggerimenti: temiNoti, aiuto: 'I temi sono tuoi: è da qui che nascono i collegamenti fra libri.' })}

    <div class="campo">
      <label for="f-copertina">Copertina (indirizzo dell'immagine)</label>
      <input type="url" id="f-copertina" name="copertinaUrl" value="${esc(l.copertinaUrl)}" placeholder="https://…">
      <div id="anteprima-copertina" style="margin-top:10px;display:flex;gap:12px;align-items:flex-start">
        <div style="width:70px;flex:0 0 70px">${copertinaHTML(l)}</div>
        <div style="flex:1">
          <p class="campo__aiuto" style="margin-top:0">${l.copertinaBase64 ? 'Copertina salvata sul telefono: si vede anche offline.' : 'Verrà scaricata e conservata sul telefono al salvataggio, così la vedi anche offline.'}</p>
          <button type="button" class="btn btn--piccolo btn--fantasma" id="btn-copertina-file">Scegli un'immagine</button>
          ${l.copertinaBase64 ? '<button type="button" class="btn btn--piccolo btn--fantasma" id="btn-copertina-via">Togli</button>' : ''}
          <input type="file" id="file-copertina" accept="image/*" hidden>
        </div>
      </div>
    </div>

    <hr style="border:none;border-top:1px solid var(--bordo);margin:22px 0">

    <div class="campo">
      <label for="f-trama">Trama in breve</label>
      <textarea id="f-trama" name="trama" maxlength="800" placeholder="Di cosa parla, in poche righe.">${esc(l.trama)}</textarea>
      <input type="hidden" name="tramaDaCatalogo" value="${l.tramaDaCatalogo ? '1' : ''}">
      <p class="campo__aiuto" id="nota-trama" ${l.tramaDaCatalogo ? '' : 'hidden'}>Testo preso dal catalogo — modifica pure.</p>
      ${(scheda || l.origine) ? '<button type="button" class="btn btn--piccolo btn--fantasma" id="btn-trama-catalogo" style="margin-top:8px">Prendi la trama dal catalogo</button>' : ''}
    </div>

    <div class="campo">
      <label>Elementi chiave</label>
      <p class="campo__aiuto" style="margin:0 0 8px">Concetti, personaggi, snodi, idee portanti. Trascina la maniglia per riordinarli.</p>
      <ul class="elementi-chiave" id="lista-elementi"></ul>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input type="text" id="nuovo-elemento" placeholder="Aggiungi un elemento" style="flex:1">
        <select id="tipo-elemento" style="width:auto;flex:0 0 auto">
          <option value="">Tipo</option>
          ${TIPI_ELEMENTO.map(t => `<option value="${t.id}">${t.etichetta}</option>`).join('')}
        </select>
        <button type="button" class="btn btn--piccolo" id="btn-aggiungi-elemento">Aggiungi</button>
      </div>
    </div>

    <div class="campo">
      <label for="f-impressione">Cosa mi ha colpito</label>
      <textarea id="f-impressione" name="impressionePersonale" placeholder="L'impressione che ti ha lasciato: è materiale per il quiz, tienila distinta dalla trama.">${esc(l.impressionePersonale)}</textarea>
    </div>`;
}

/* ------------------------------------------------- elementi chiave (UI) */

function collegaElementiChiave (form, elementiIniziali) {
  const lista = qs('#lista-elementi', form);
  let elementi = (elementiIniziali || []).map(e => ({ ...e }));

  const disegna = () => {
    if (!elementi.length) {
      lista.innerHTML = '<li class="campo__aiuto" style="list-style:none;padding:6px 2px">Nessun elemento, per ora.</li>';
      return;
    }
    lista.innerHTML = elementi.map((e, i) => `
      <li class="elemento-chiave" draggable="true" data-i="${i}">
        <span class="elemento-chiave__presa" aria-hidden="true">⠿</span>
        <span class="elemento-chiave__testo">${esc(e.testo)}
          ${e.tipo ? `<span class="elemento-chiave__tipo">${esc((TIPI_ELEMENTO.find(t => t.id === e.tipo) || {}).etichetta || e.tipo)}</span>` : ''}
        </span>
        <button type="button" class="btn-icona" data-su="${i}" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''} style="width:32px;height:32px;min-width:32px">↑</button>
        <button type="button" class="btn-icona" data-giu="${i}" aria-label="Sposta giù" ${i === elementi.length - 1 ? 'disabled' : ''} style="width:32px;height:32px;min-width:32px">↓</button>
        <button type="button" class="btn-icona" data-via="${i}" aria-label="Elimina" style="width:32px;height:32px;min-width:32px">✕</button>
      </li>`).join('');
  };

  const aggiungi = () => {
    const campo = qs('#nuovo-elemento', form);
    const tipo = qs('#tipo-elemento', form);
    const testo = campo.value.trim();
    if (!testo) return;
    elementi.push({ id: uuid(), testo, tipo: tipo.value });
    campo.value = '';
    disegna();
    campo.focus();
  };

  qs('#btn-aggiungi-elemento', form).addEventListener('click', aggiungi);
  qs('#nuovo-elemento', form).addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); aggiungi(); }
  });

  lista.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-via],button[data-su],button[data-giu]');
    if (!b) return;
    if (b.dataset.via != null) elementi.splice(Number(b.dataset.via), 1);
    if (b.dataset.su != null) { const i = Number(b.dataset.su); [elementi[i - 1], elementi[i]] = [elementi[i], elementi[i - 1]]; }
    if (b.dataset.giu != null) { const i = Number(b.dataset.giu); [elementi[i + 1], elementi[i]] = [elementi[i], elementi[i + 1]]; }
    disegna();
  });

  // trascinamento con il mouse (desktop). Su telefono restano le frecce,
  // che sono anche l'alternativa accessibile da tastiera.
  let daIndice = null;
  lista.addEventListener('dragstart', ev => {
    const li = ev.target.closest('.elemento-chiave');
    if (!li) return;
    daIndice = Number(li.dataset.i);
    li.classList.add('is-trascinato');
    ev.dataTransfer.effectAllowed = 'move';
  });
  lista.addEventListener('dragover', ev => {
    ev.preventDefault();
    const li = ev.target.closest('.elemento-chiave');
    qsa('.elemento-chiave', lista).forEach(x => x.classList.remove('is-sopra'));
    if (li) li.classList.add('is-sopra');
  });
  lista.addEventListener('drop', ev => {
    ev.preventDefault();
    const li = ev.target.closest('.elemento-chiave');
    if (li && daIndice != null) {
      const a = Number(li.dataset.i);
      const [mosso] = elementi.splice(daIndice, 1);
      elementi.splice(a, 0, mosso);
    }
    daIndice = null;
    disegna();
  });
  lista.addEventListener('dragend', () => { daIndice = null; disegna(); });

  form._elementiChiave = () => elementi;
  disegna();
}

function leggiElementiChiave (form) {
  return form._elementiChiave ? form._elementiChiave() : [];
}

/* ----------------------------------------------------- copertina locale */

function collegaCopertina (form, libro) {
  const btn = qs('#btn-copertina-file', form);
  const file = qs('#file-copertina', form);
  const btnVia = qs('#btn-copertina-via', form);
  const anteprima = qs('#anteprima-copertina', form);
  if (!btn || !file) return;

  btn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      libro.copertinaBase64 = await ridimensionaInBase64(f);
      libro.copertinaUrl = '';
      qs('[name=copertinaUrl]', form).value = '';
      qs('.copertina', anteprima).outerHTML = copertinaHTML(libro);
      avviso('Copertina scelta.', 'ok');
    } catch (e) {
      avviso('Non riesco a leggere quell\'immagine.', 'errore');
    }
  });
  if (btnVia) btnVia.addEventListener('click', () => {
    libro.copertinaBase64 = '';
    qs('.copertina', anteprima).outerHTML = copertinaHTML(libro);
  });
}

/** Ridimensiona un'immagine scelta dal telefono: le foto da 4 MB non hanno
 *  senso in un database che vogliamo poter esportare in un JSON. */
async function ridimensionaInBase64 (file, maxLato = 500) {
  const bitmap = await createImageBitmap(file);
  const scala = Math.min(1, maxLato / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scala), h = Math.round(bitmap.height * scala);
  const tela = document.createElement('canvas');
  tela.width = w; tela.height = h;
  tela.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close && bitmap.close();
  return tela.toDataURL('image/jpeg', 0.82);
}

/* ============================== 3. invito contestuale dopo il salvataggio */

/** Subito dopo aver aggiunto un libro, l'app propone i due gesti che rendono
 *  utile la libreria: la prima citazione e il primo collegamento. */
export function invitoDopoSalvataggio (libro) {
  const suggeriti = suggerisciCollegamenti(libro, { max: 3 });
  const f = foglio({
    titolo: 'Bene: e adesso?',
    classe: 'foglio--corto',
    contenuto: `
      <p class="testo-guida">«${esc(libro.titolo)}» è in libreria. Due gesti che valgono più di tutto il resto:</p>
      <button class="btn btn--pieno btn--largo" data-az="citazione" style="margin-bottom:10px">Aggiungi la prima citazione</button>
      <button class="btn btn--largo" data-az="collega">Collegalo a un libro che hai già letto</button>
      ${suggeriti.length ? `
        <div class="sezione">
          <div class="sezione__testa"><h2>Forse va con…</h2></div>
          ${suggeriti.map((s, i) => `
            <div class="suggerimento">
              <div style="width:34px;flex:0 0 34px">${copertinaHTML(s.libro)}</div>
              <div class="suggerimento__testo">
                <strong>${esc(s.libro.titolo)}</strong>
                <div class="suggerimento__perche">${esc(s.motivi.join(' · '))}</div>
              </div>
              <div class="suggerimento__azioni">
                <button class="btn btn--piccolo" data-accetta="${i}">Collega</button>
              </div>
            </div>`).join('')}
        </div>` : ''}`
  });

  delega(f.elemento, 'click', '[data-az="citazione"]', () => {
    f.chiudi();
    apriFormCitazione({ libroId: libro.id });
  });
  delega(f.elemento, 'click', '[data-az="collega"]', () => {
    f.chiudi();
    apriFormCollegamento({ libroA_id: libro.id });
  });
  delega(f.elemento, 'click', '[data-accetta]', (_, b) => {
    const s = suggeriti[Number(b.dataset.accetta)];
    f.chiudi();
    apriFormCollegamento({
      libroA_id: libro.id, libroB_id: s.libro.id,
      tipo: s.tipoProposto, nota: s.motivi.join('; ')
    });
  });
}

/* ------------------------------------------------------- eliminazione --- */

export async function chiediEliminaLibro (libro) {
  const n = store.contaCitazioni(libro.id);
  const ok = await conferma(
    `Elimino «${libro.titolo}»${n ? ` insieme alle sue ${n === 1 ? 'citazione' : n + ' citazioni'}` : ''} e ai suoi collegamenti. Non si torna indietro.`,
    { titolo: 'Eliminare il libro?', ok: 'Elimina', pericolo: true }
  );
  if (!ok) return false;
  await store.eliminaLibro(libro.id);
  avviso('Libro eliminato.');
  return true;
}
