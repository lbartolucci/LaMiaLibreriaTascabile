/* =========================================================================
   studio.js — la sezione Studio: configurazione, sessione, riepilogo, storico
   Il quiz è il motivo per cui questa libreria non è un catalogo: qui le
   citazioni tornano a farsi vedere finché non restano in testa.
   ========================================================================= */

import {
  qs, qsa, delega, avviso, conferma, vuotoHTML, copertinaHTML,
  plurale, dataBreve, vibra, el
} from '../ui.js';
import { esc, diffHTML } from '../utils/text.js';
import * as store from '../store.js';
import { vaiA } from '../router.js';
import { uuid } from '../models.js';
import { TIPI_DOMANDA, AMBITI, generaSessione, materiale, disponibilita } from '../quiz/generatore.js';
import { registraEsito, conteggioScadenze, INTERVALLI } from '../quiz/srs.js';

/* La sessione in corso vive in memoria: se ricarichi la pagina la perdi, ed è
   giusto così — un quiz interrotto e ripreso ore dopo non misura niente. */
let sessione = null;
let cronometro = null;

export default async function vistaStudio (parametri = {}) {
  if (parametri.sezione === 'storico') return vistaStorico();
  if (parametri.id) return vistaEsito(parametri.id, parametri.query || {});
  if (sessione) return vistaSessione();
  return vistaConfigurazione(parametri);
}

/* ==================================================== 1. configurazione === */

function impostazioniQuiz () {
  const salvate = store.stato.impostazioni.quiz || {};
  return {
    numero: 10, ambito: 'tutto', valore: '', tipi: null,
    modalita: 'rilassata', secondi: 30,
    ...salvate
  };
}

function vistaConfigurazione () {
  const cfg = impostazioniQuiz();
  const scadenze = conteggioScadenze();

  if (!store.stato.libri.length) {
    return {
      titolo: 'Studio', titoloTesto: 'Studio',
      html: vuotoHTML({
        icona: '✎', titolo: 'Prima servono dei libri',
        testo: 'Il quiz nasce dai tuoi dati: aggiungi un libro e almeno una citazione, e qui comparirà qualcosa da ripassare.',
        azione: '<button class="btn btn--pieno" data-az="libreria">Vai alla libreria</button>'
      }),
      dopo: radice => delega(radice, 'click', '[data-az="libreria"]', () => vaiA('/libreria'))
    };
  }

  const mat = materiale(cfg);
  const disp = disponibilita(mat);
  const attivabili = TIPI_DOMANDA.filter(t => disp.ok[t.id]);
  const tipiScelti = cfg.tipi && cfg.tipi.length
    ? cfg.tipi.filter(id => disp.ok[id])
    : attivabili.map(t => t.id);

  return {
    titolo: 'Studio',
    titoloTesto: 'Studio',
    sottotitolo: scadenze.totale
      ? `${plurale(scadenze.totale, 'elemento', 'elementi')} da ripassare`
      : 'quiz sulle tue citazioni',
    azioni: '<button class="btn-icona" id="btn-storico" aria-label="Storico delle sessioni">▤</button>',
    html: `
      ${scadenze.totale ? `
        <div class="pannello scadenze" role="status">
          <div>
            <strong>${plurale(scadenze.citazioni, 'citazione', 'citazioni')}${scadenze.libri ? ` e ${plurale(scadenze.libri, 'libro', 'libri')}` : ''} da ripassare oggi.</strong>
            <p class="minuscolo" style="margin:2px 0 0">Il ripasso funziona se lo fai il giorno in cui scade.</p>
          </div>
          <button class="btn btn--piccolo btn--pieno" data-az="ripassa">Ripassa</button>
        </div>` : ''}

      <div class="campo">
        <label for="q-numero">Quante domande</label>
        <div class="riga-slider">
          <input type="range" id="q-numero" min="5" max="30" step="1" value="${cfg.numero}">
          <output id="q-numero-out">${cfg.numero}</output>
        </div>
      </div>

      <div class="campo">
        <label for="q-ambito">Su cosa</label>
        <select id="q-ambito">
          ${AMBITI.map(a => `<option value="${a.id}" ${cfg.ambito === a.id ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="campo" id="campo-valore" ${['libro', 'autore', 'tag'].includes(cfg.ambito) ? '' : 'hidden'}>
        <label for="q-valore">Quale</label>
        <select id="q-valore">${opzioniValore(cfg.ambito, cfg.valore)}</select>
      </div>

      <div class="campo">
        <label>Modalità</label>
        <div class="chips" style="flex-wrap:wrap;overflow:visible">
          <button type="button" class="chip ${cfg.modalita === 'rilassata' ? 'is-attivo' : ''}" data-modalita="rilassata">Rilassata</button>
          <button type="button" class="chip ${cfg.modalita === 'tempo' ? 'is-attivo' : ''}" data-modalita="tempo">A tempo</button>
        </div>
        <div id="campo-secondi" ${cfg.modalita === 'tempo' ? '' : 'hidden'} style="margin-top:10px">
          <div class="riga-slider">
            <input type="range" id="q-secondi" min="10" max="120" step="5" value="${cfg.secondi}">
            <output id="q-secondi-out">${cfg.secondi} s</output>
          </div>
          <p class="campo__aiuto">Secondi per domanda. Scaduto il tempo, la domanda conta come sbagliata.</p>
        </div>
      </div>

      <section class="sezione">
        <div class="sezione__testa">
          <h2>Tipi di domanda</h2>
          <button class="sezione__azione" data-az="tutti-tipi">tutti</button>
        </div>
        <div id="elenco-tipi">${elencoTipiHTML(disp, tipiScelti)}</div>
      </section>

      <div id="avviso-generazione"></div>

      <button class="btn btn--largo btn--pieno" id="btn-comincia" style="margin-top:16px">Comincia</button>
      <button class="btn btn--largo btn--fantasma" id="btn-vai-storico" style="margin-top:8px">Storico delle sessioni</button>`,
    dopo: collegaConfigurazione
  };
}

function opzioniValore (ambito, valore) {
  if (ambito === 'libro') {
    return store.stato.libri
      .slice().sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'))
      .map(l => `<option value="${l.id}" ${valore === l.id ? 'selected' : ''}>${esc(l.titolo)}</option>`).join('');
  }
  if (ambito === 'autore') {
    return store.autori().map(a =>
      `<option value="${esc(a.nome)}" ${valore === a.nome ? 'selected' : ''}>${esc(a.nome)} (${a.libri.length})</option>`).join('');
  }
  if (ambito === 'tag') {
    return store.valoriDistinti('tag').map(t =>
      `<option value="${esc(t.valore)}" ${valore === t.valore ? 'selected' : ''}>${esc(t.valore)} (${t.n})</option>`).join('');
  }
  return '';
}

function elencoTipiHTML (disp, scelti) {
  return TIPI_DOMANDA.map(t => {
    const ok = disp.ok[t.id];
    const attivo = ok && scelti.includes(t.id);
    return `
      <label class="tipo-domanda ${ok ? '' : 'is-spento'}">
        <input type="checkbox" data-tipo="${t.id}" ${attivo ? 'checked' : ''} ${ok ? '' : 'disabled'}>
        <span class="tipo-domanda__testo">
          <strong>${esc(t.nome)}</strong>
          <span class="minuscolo">${ok ? esc(t.descrizione) : 'non disponibile: ' + esc(disp.motivi[t.id] || '')}</span>
        </span>
        <span class="tipo-domanda__famiglia">${t.famiglia === 'citazione' ? '❝' : '❦'}</span>
      </label>`;
  }).join('');
}

function collegaConfigurazione (radice) {
  const leggi = () => ({
    numero: Number(qs('#q-numero', radice).value),
    ambito: qs('#q-ambito', radice).value,
    valore: qs('#q-valore', radice) ? qs('#q-valore', radice).value : '',
    tipi: qsa('[data-tipo]:checked', radice).map(x => x.dataset.tipo),
    modalita: qs('.chip.is-attivo[data-modalita]', radice)?.dataset.modalita || 'rilassata',
    secondi: Number(qs('#q-secondi', radice).value)
  });

  const numero = qs('#q-numero', radice);
  numero.addEventListener('input', () => { qs('#q-numero-out', radice).textContent = numero.value; });
  const secondi = qs('#q-secondi', radice);
  secondi.addEventListener('input', () => { qs('#q-secondi-out', radice).textContent = secondi.value + ' s'; });

  const ambito = qs('#q-ambito', radice);
  ambito.addEventListener('change', () => {
    const conValore = ['libro', 'autore', 'tag'].includes(ambito.value);
    qs('#campo-valore', radice).hidden = !conValore;
    qs('#q-valore', radice).innerHTML = opzioniValore(ambito.value, '');
    aggiornaTipi();
  });
  const valore = qs('#q-valore', radice);
  if (valore) valore.addEventListener('change', aggiornaTipi);

  function aggiornaTipi () {
    const cfg = leggi();
    const disp = disponibilita(materiale(cfg));
    const restano = TIPI_DOMANDA.filter(t => disp.ok[t.id]).map(t => t.id);
    qs('#elenco-tipi', radice).innerHTML = elencoTipiHTML(disp, restano);
  }

  delega(radice, 'click', '[data-modalita]', (_, b) => {
    qsa('[data-modalita]', radice).forEach(x => x.classList.toggle('is-attivo', x === b));
    qs('#campo-secondi', radice).hidden = b.dataset.modalita !== 'tempo';
  });

  delega(radice, 'click', '[data-az="tutti-tipi"]', () => {
    const caselle = qsa('[data-tipo]:not([disabled])', radice);
    const tutteAccese = caselle.every(c => c.checked);
    caselle.forEach(c => { c.checked = !tutteAccese; });
  });

  delega(radice, 'click', '[data-az="ripassa"]', () => {
    qs('#q-ambito', radice).value = 'ripasso';
    qs('#campo-valore', radice).hidden = true;
    aggiornaTipi();
    avvia(leggi());
  });

  delega(radice, 'click', '[data-az="libreria"]', () => vaiA('/libreria'));
  delega(radice, 'click', '#btn-vai-storico', () => vaiA('/studio/storico'));
  const btnStorico = qs('#btn-storico', qs('#testa'));
  if (btnStorico) btnStorico.onclick = () => vaiA('/studio/storico');

  qs('#btn-comincia', radice).addEventListener('click', () => avvia(leggi()));
}

async function avvia (cfg) {
  if (!cfg.tipi.length) {
    avviso('Scegli almeno un tipo di domanda.', 'errore');
    return;
  }
  const { domande, avvisi } = generaSessione({
    numero: cfg.numero, ambito: cfg.ambito, valore: cfg.valore, tipiAttivi: cfg.tipi
  });

  if (!domande.length) {
    avviso(avvisi[0] || 'Non riesco a costruire questa sessione.', 'errore', 5000);
    return;
  }
  await store.salvaImpostazioni({ quiz: cfg });

  sessione = {
    id: uuid(),
    inizio: Date.now(),
    domande,
    indice: 0,
    risposte: [],
    modalita: cfg.modalita,
    secondi: cfg.secondi,
    ambito: cfg.ambito,
    valore: cfg.valore,
    avvisi,
    finita: false
  };
  if (avvisi.length) avviso(avvisi[0], 'info', 5200);
  vaiA('/studio');
}

/* ======================================================== 2. la sessione == */

function vistaSessione () {
  return {
    titolo: `Domanda ${sessione.indice + 1} di ${sessione.domande.length}`,
    titoloTesto: 'Quiz',
    azioni: '<button class="btn-icona" id="btn-esci" aria-label="Esci dal quiz">✕</button>',
    html: '<div id="palco"></div>',
    dopo: radice => {
      disegnaDomanda(qs('#palco', radice));
      const btnEsci = qs('#btn-esci', qs('#testa'));
      if (btnEsci) btnEsci.onclick = async () => {
        if (await conferma('La sessione in corso va persa: le risposte già date non contano.', {
          titolo: 'Uscire dal quiz?', ok: 'Esci', pericolo: true
        })) { fermaCronometro(); sessione = null; vaiA('/studio'); }
      };
    },
    pulisci: fermaCronometro
  };
}

function disegnaDomanda (palco) {
  fermaCronometro();
  const d = sessione.domande[sessione.indice];
  const avanzamento = (sessione.indice / sessione.domande.length) * 100;
  d._inizio = Date.now();

  palco.innerHTML = `
    <div class="avanzamento" role="progressbar" aria-valuemin="0" aria-valuemax="${sessione.domande.length}"
         aria-valuenow="${sessione.indice + 1}" aria-label="Avanzamento della sessione">
      <span style="width:${avanzamento}%"></span>
    </div>
    ${sessione.modalita === 'tempo' ? '<div class="timer" id="timer" aria-live="off"></div>' : ''}

    <p class="quiz-tipo">${esc(d.nomeTipo)}</p>
    <h2 class="quiz-consegna">${esc(d.consegna)}</h2>
    ${d.libroDaMostrare ? `
      <div class="quiz-libro">
        <div style="width:52px;flex:0 0 52px">${copertinaHTML(d.libroDaMostrare)}</div>
        <div><strong>${esc(d.libroDaMostrare.titolo)}</strong>
        ${d.libroDaMostrare.annoPubblicazione ? `<div class="minuscolo">${d.libroDaMostrare.annoPubblicazione}</div>` : ''}</div>
      </div>` : ''}
    ${d.testo ? `<p class="quiz-testo">${esc(d.testo)}</p>` : ''}
    ${d.aiuto ? `<p class="minuscolo">${esc(d.aiuto)}</p>` : ''}

    <div id="risposta">${corpoRisposta(d)}</div>
    <div id="esito" aria-live="polite"></div>
    <div id="azioni-domanda"></div>`;

  collegaRisposta(palco, d);
  if (sessione.modalita === 'tempo') avviaCronometro(palco, d);
}

function corpoRisposta (d) {
  if (d.formato === 'scelta') {
    return `<div class="opzioni">${d.opzioni.map(o => `
      <button class="opzione" data-scelta="${esc(o.id)}">
        <span class="opzione__testo">${esc(o.testo)}</span>
        ${o.sotto ? `<span class="opzione__sotto">${esc(o.sotto)}</span>` : ''}
      </button>`).join('')}</div>`;
  }
  if (d.formato === 'testo') {
    return `
      <input type="text" id="risposta-testo" autocomplete="off" autocapitalize="none"
             placeholder="Scrivi qui" enterkeyhint="done" aria-label="La tua risposta">
      <button class="btn btn--largo btn--pieno" id="btn-conferma" style="margin-top:10px">Controlla</button>`;
  }
  if (d.formato === 'aperta') {
    return `
      <textarea id="risposta-aperta" rows="4" placeholder="Quello che ti viene in mente" aria-label="La tua risposta"></textarea>
      <button class="btn btn--largo btn--pieno" id="btn-rivela" style="margin-top:10px">Mostra la risposta</button>`;
  }
  if (d.formato === 'abbinamento') {
    return `
      <div class="abbina">
        <div class="abbina__colonna" id="abbina-citazioni">
          <p class="abbina__titolo">Le citazioni</p>
          ${d.coppie.map(c => `
            <button class="abbina__carta" data-citazione="${c.citazioneId}">
              <span class="abbina__testo">«${esc(c.testo)}»</span>
              <span class="abbina__scelto"></span>
            </button>`).join('')}
        </div>
        <div class="abbina__colonna" id="abbina-libri">
          <p class="abbina__titolo">I libri</p>
          ${d.libri.map(l => `
            <button class="abbina__libro" data-libro="${l.id}">
              <strong>${esc(l.titolo)}</strong>${l.autore ? `<span class="minuscolo"> · ${esc(l.autore)}</span>` : ''}
            </button>`).join('')}
        </div>
      </div>
      <button class="btn btn--largo btn--pieno" id="btn-conferma-abbina" style="margin-top:12px" disabled>Controlla</button>`;
  }
  return '';
}

function collegaRisposta (palco, d) {
  if (d.formato === 'scelta') {
    delega(palco, 'click', '[data-scelta]', (_, b) => {
      if (palco.dataset.risposto) return;
      rispondi(palco, d, b.dataset.scelta);
    });
  }

  if (d.formato === 'testo') {
    const campo = qs('#risposta-testo', palco);
    setTimeout(() => campo.focus(), 150);
    const invia = () => { if (!palco.dataset.risposto) rispondi(palco, d, campo.value); };
    qs('#btn-conferma', palco).addEventListener('click', invia);
    campo.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); invia(); } });
  }

  if (d.formato === 'aperta') {
    const campo = qs('#risposta-aperta', palco);
    setTimeout(() => campo.focus(), 150);
    qs('#btn-rivela', palco).addEventListener('click', () => rivelaAperta(palco, d, campo.value));
  }

  if (d.formato === 'abbinamento') {
    const abbinamenti = {};
    let citazioneAttiva = null;
    const bottone = qs('#btn-conferma-abbina', palco);

    const ridisegna = () => {
      qsa('[data-citazione]', palco).forEach(c => {
        const id = c.dataset.citazione;
        const libroId = abbinamenti[id];
        const libro = libroId ? d.libri.find(l => l.id === libroId) : null;
        qs('.abbina__scelto', c).textContent = libro ? '→ ' + libro.titolo : '';
        c.classList.toggle('is-attiva', citazioneAttiva === id);
        c.classList.toggle('is-abbinata', !!libro);
      });
      qsa('[data-libro]', palco).forEach(l => {
        l.classList.toggle('is-usato', Object.values(abbinamenti).includes(l.dataset.libro));
      });
      bottone.disabled = Object.keys(abbinamenti).length < d.coppie.length;
    };

    delega(palco, 'click', '[data-citazione]', (_, b) => {
      if (palco.dataset.risposto) return;
      const id = b.dataset.citazione;
      if (citazioneAttiva === id) { citazioneAttiva = null; }
      else { citazioneAttiva = id; }
      if (abbinamenti[id]) delete abbinamenti[id];    // ri-toccando si scioglie
      ridisegna();
      if (citazioneAttiva) {
        qs('#abbina-libri', palco).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    delega(palco, 'click', '[data-libro]', (_, b) => {
      if (palco.dataset.risposto) return;
      if (!citazioneAttiva) { avviso('Prima tocca una citazione, poi il suo libro.'); return; }
      // un libro per volta: se era già assegnato altrove, si sposta
      Object.keys(abbinamenti).forEach(k => { if (abbinamenti[k] === b.dataset.libro) delete abbinamenti[k]; });
      abbinamenti[citazioneAttiva] = b.dataset.libro;
      citazioneAttiva = null;
      vibra(8);
      ridisegna();
    });

    bottone.addEventListener('click', () => rispondi(palco, d, abbinamenti));
    ridisegna();
  }
}

/* --------------------------------------------------------- il cronometro - */

function avviaCronometro (palco, d) {
  let restanti = sessione.secondi;
  const casella = qs('#timer', palco);
  const mostra = () => {
    casella.textContent = `${restanti}s`;
    casella.classList.toggle('is-urgente', restanti <= 5);
    casella.style.setProperty('--quota', (restanti / sessione.secondi) * 100 + '%');
  };
  mostra();
  cronometro = setInterval(() => {
    restanti--;
    if (restanti <= 0) {
      fermaCronometro();
      if (!palco.dataset.risposto) {
        if (d.formato === 'aperta') rivelaAperta(palco, d, valoreRisposta(palco, d), true);
        else rispondi(palco, d, valoreRisposta(palco, d), true);
      }
      return;
    }
    mostra();
  }, 1000);
}

function fermaCronometro () {
  if (cronometro) { clearInterval(cronometro); cronometro = null; }
}

function valoreRisposta (palco, d) {
  if (d.formato === 'testo') return (qs('#risposta-testo', palco) || {}).value || '';
  if (d.formato === 'aperta') return (qs('#risposta-aperta', palco) || {}).value || '';
  return null;
}

/* ------------------------------------------------------ dare una risposta */

async function rispondi (palco, d, risposta, scaduto = false) {
  fermaCronometro();
  palco.dataset.risposto = '1';
  const tempoMs = Date.now() - d._inizio;

  let risultato = scaduto && (risposta == null || risposta === '')
    ? { esito: 'sbagliato', dettaglio: 'tempo scaduto' }
    : d.verifica(risposta);

  // segno visivamente le opzioni
  if (d.formato === 'scelta') {
    qsa('[data-scelta]', palco).forEach(b => {
      const suo = b.dataset.scelta;
      if (suo === String(d.corretta)) b.classList.add('is-giusta');
      else if (suo === String(risposta)) b.classList.add('is-sbagliata');
      b.disabled = true;
    });
  }
  if (d.formato === 'abbinamento') {
    const perElemento = risultato.perElemento || [];
    qsa('[data-citazione]', palco).forEach(c => {
      const e = perElemento.find(x => x.id === c.dataset.citazione);
      c.classList.add(e && e.esito === 'corretto' ? 'is-giusta' : 'is-sbagliata');
      const attesa = d.coppie.find(x => x.citazioneId === c.dataset.citazione);
      const libro = d.libri.find(l => l.id === attesa.libroId);
      if (e && e.esito !== 'corretto' && libro) qs('.abbina__scelto', c).textContent = '→ ' + libro.titolo;
    });
    qs('#btn-conferma-abbina', palco).disabled = true;
  }
  if (d.formato === 'testo') {
    qs('#risposta-testo', palco).disabled = true;
    qs('#btn-conferma', palco).disabled = true;
  }

  mostraEsito(palco, d, risultato, risposta, scaduto);
  await registra(d, risultato, tempoMs);
  bottoneAvanti(palco);
}

/** Le domande aperte non hanno una risposta giusta calcolabile: si rivela
 *  quello che avevi scritto e sei tu a dire come è andata. */
function rivelaAperta (palco, d, risposta, scaduto = false) {
  fermaCronometro();
  palco.dataset.risposto = '1';
  const tempoMs = Date.now() - d._inizio;
  const campo = qs('#risposta-aperta', palco);
  if (campo) campo.disabled = true;
  const btn = qs('#btn-rivela', palco);
  if (btn) btn.remove();

  qs('#esito', palco).innerHTML = `
    ${scaduto ? '<p class="quiz-verdetto quiz-verdetto--sbagliato">Tempo scaduto</p>' : ''}
    ${d.rivelaHTML ? d.rivelaHTML(null, risposta) : ''}
    <div class="autovalutazione">
      <p class="minuscolo">Come è andata davvero?</p>
      <div class="autovalutazione__scelte">
        <button class="btn btn--piccolo" data-auto="corretto">Ricordavo</button>
        <button class="btn btn--piccolo" data-auto="parziale">A metà</button>
        <button class="btn btn--piccolo" data-auto="sbagliato">No</button>
      </div>
    </div>`;

  delega(qs('#esito', palco), 'click', '[data-auto]', async (_, b) => {
    qsa('[data-auto]', palco).forEach(x => { x.disabled = true; x.classList.toggle('btn--pieno', x === b); });
    const risultato = { esito: b.dataset.auto };
    await registra(d, risultato, tempoMs);
    vibra();
    bottoneAvanti(palco);
  });
}

function mostraEsito (palco, d, risultato, risposta, scaduto) {
  const parole = {
    corretto: 'Esatto', parziale: 'Quasi', sbagliato: scaduto ? 'Tempo scaduto' : 'Non ci siamo'
  };
  const casella = qs('#esito', palco);
  casella.innerHTML = `
    <p class="quiz-verdetto quiz-verdetto--${risultato.esito}">
      ${parole[risultato.esito]}${risultato.dettaglio ? ` <span class="minuscolo">(${esc(risultato.dettaglio)})</span>` : ''}
    </p>
    ${d.conDiff && risultato.esito !== 'corretto' ? `
      <div class="quiz-diff">
        <p class="minuscolo">La risposta era</p>
        <p>${diffHTML(risposta || '', d.soluzione)}</p>
        <p class="minuscolo diff-legenda">
          <span class="diff-ok">in tondo</span> quello che avevi azzeccato,
          <span class="diff-manca">sottolineato</span> quello che mancava,
          <span class="diff-troppo">barrato</span> quello di troppo.
        </p>
      </div>` : ''}
    ${d.rivelaHTML ? d.rivelaHTML(risultato.esito, risposta) : ''}`;
  vibra(risultato.esito === 'corretto' ? 10 : 24);
}

function bottoneAvanti (palco) {
  const zona = qs('#azioni-domanda', palco);
  const ultima = sessione.indice >= sessione.domande.length - 1;
  zona.innerHTML = `<button class="btn btn--largo btn--pieno" id="btn-avanti" style="margin-top:14px">
    ${ultima ? 'Vedi il riepilogo' : 'Avanti'}</button>`;
  const b = qs('#btn-avanti', zona);
  b.focus();
  b.addEventListener('click', () => {
    if (ultima) { concludi(); return; }
    sessione.indice++;
    delete palco.dataset.risposto;
    const testa = qs('#testa');
    const titolo = qs('#titolo-vista', testa);
    if (titolo) titolo.textContent = `Domanda ${sessione.indice + 1} di ${sessione.domande.length}`;
    disegnaDomanda(palco);
  });
}

/** Registra la risposta nella sessione e aggiorna il ripasso dilazionato. */
async function registra (d, risultato, tempoMs) {
  sessione.risposte.push({
    domandaTipo: d.tipo,
    entitaTipo: d.entitaTipo,
    entitaId: d.entitaId,
    etichetta: d.etichetta || d.consegna,
    consegna: d.consegna,
    esito: risultato.esito,
    tempoMs
  });

  // l'abbinamento tocca quattro citazioni: ognuna prende il suo esito
  if (risultato.perElemento) {
    for (const e of risultato.perElemento) await registraEsito(e.tipo, e.id, e.esito);
  } else {
    await registraEsito(d.entitaTipo, d.entitaId, risultato.esito);
  }
}

/* ====================================================== 3. il riepilogo === */

async function concludi () {
  fermaCronometro();
  const durata = Date.now() - sessione.inizio;
  const giuste = sessione.risposte.filter(r => r.esito === 'corretto').length;
  const record = {
    id: sessione.id,
    data: new Date().toISOString(),
    numeroDomande: sessione.risposte.length,
    punteggio: giuste,
    durata,
    ambito: sessione.ambito,
    risposte: sessione.risposte
  };
  await store.salvaSessione(record);
  // la sessione in memoria finisce qui: il riepilogo è una rotta vera,
  // così ricaricando la pagina (o tornandoci dopo) si rilegge dal database
  sessione = null;
  vaiA('/studio/esito/' + record.id + '?fresco=1');
}

function vistaEsito (id, query = {}) {
  const r = store.stato.sessioni.find(x => x.id === id);
  if (!r) {
    return {
      titolo: 'Sessione', indietro: true,
      html: vuotoHTML({ icona: '∅', titolo: 'Sessione non trovata', testo: 'Forse è stata cancellata con i dati.' })
    };
  }
  return corpoRiepilogo(r, query.fresco === '1');
}

function corpoRiepilogo (r, appenaFinita) {
  const percentuale = r.numeroDomande ? Math.round((r.punteggio / r.numeroDomande) * 100) : 0;
  const parziali = r.risposte.filter(x => x.esito === 'parziale').length;

  return {
    titolo: appenaFinita ? 'Fatto' : 'Sessione',
    titoloTesto: 'Riepilogo',
    sottotitolo: dataBreve(r.data),
    indietro: !appenaFinita,
    html: `
      <div class="riepilogo-testa">
        <div class="riepilogo-punteggio">
          <span class="riepilogo-numero">${r.punteggio}<span class="riepilogo-su">/${r.numeroDomande}</span></span>
          <span class="minuscolo">${percentuale}% · ${durataTesto(r.durata)}${parziali ? ` · ${parziali} a metà` : ''}</span>
        </div>
        <p class="testo-guida">${esc(commento(percentuale))}</p>
      </div>

      <section class="sezione">
        <div class="sezione__testa"><h2>Domanda per domanda</h2></div>
        <ol class="elenco-esiti">
          ${r.risposte.map((x, i) => `
            <li class="esito-riga esito-riga--${x.esito}">
              <span class="esito-riga__segno" aria-hidden="true">${({ corretto: '✓', parziale: '~', sbagliato: '✕' })[x.esito]}</span>
              <span class="esito-riga__testo">
                <span class="minuscolo">${i + 1}. ${esc(nomeTipo(x.domandaTipo))}</span>
                <span>${esc(x.etichetta || '')}</span>
              </span>
              ${x.entitaId ? `<button class="btn btn--piccolo btn--fantasma" data-apri="${x.entitaTipo}:${x.entitaId}">apri</button>` : ''}
            </li>`).join('')}
        </ol>
        <p class="minuscolo">Gli elementi sbagliati tornano domani; quelli giusti fra ${INTERVALLI.slice(1, 4).join(', ')} giorni e così via.</p>
      </section>

      <button class="btn btn--largo btn--pieno" id="btn-ancora" style="margin-top:8px">Un'altra sessione</button>
      <button class="btn btn--largo btn--fantasma" id="btn-fine" style="margin-top:8px">Torna alla libreria</button>`,
    dopo: radice => {
      delega(radice, 'click', '[data-apri]', (_, b) => {
        const [tipo, id] = b.dataset.apri.split(':');
        vaiA(tipo === 'citazione' ? '/citazione/' + id : '/libro/' + id);
      });
      qs('#btn-ancora', radice).addEventListener('click', () => vaiA('/studio'));
      qs('#btn-fine', radice).addEventListener('click', () => vaiA('/libreria'));
    }
  };
}

function commento (p) {
  if (p >= 90) return 'Le hai in testa. Il ripasso adesso si allontana nel tempo: rivedrai queste tra qualche settimana.';
  if (p >= 70) return 'Buona tenuta. Quelle sbagliate tornano domani, ed è lì che si guadagna davvero.';
  if (p >= 40) return 'Metà e metà: è il punto in cui il ripasso serve di più. Rivedile domani.';
  return 'Serata storta, o materiale ancora fresco. Non è un voto: è una lista di cose da rivedere presto.';
}

function nomeTipo (id) {
  return (TIPI_DOMANDA.find(t => t.id === id) || {}).nome || id;
}

/** Sotto il minuto i minuti arrotondati direbbero «0»: meglio i secondi. */
function tempoTotale (ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 90) return { numero: s, unita: s === 1 ? 'secondo' : 'secondi' };
  return { numero: Math.round(s / 60), unita: 'minuti' };
}

function durataTesto (ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} secondi`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(s % 60).padStart(2, '0')} s`;
}

/* ========================================================= 4. lo storico == */

function vistaStorico () {
  const sessioni = store.stato.sessioni
    .slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  if (!sessioni.length) {
    return {
      titolo: 'Storico', indietro: true,
      html: vuotoHTML({
        icona: '▤', titolo: 'Nessuna sessione, per ora',
        testo: 'Fai il primo quiz e qui comparirà l\'andamento nel tempo.',
        azione: '<button class="btn btn--pieno" data-az="studio">Vai allo Studio</button>'
      }),
      dopo: radice => delega(radice, 'click', '[data-az="studio"]', () => vaiA('/studio'))
    };
  }

  const totali = sessioni.reduce((acc, s) => {
    acc.domande += s.numeroDomande || 0;
    acc.giuste += s.punteggio || 0;
    acc.tempo += s.durata || 0;
    return acc;
  }, { domande: 0, giuste: 0, tempo: 0 });
  const mediaGenerale = totali.domande ? Math.round((totali.giuste / totali.domande) * 100) : 0;

  return {
    titolo: 'Storico',
    titoloTesto: 'Storico',
    sottotitolo: plurale(sessioni.length, 'sessione', 'sessioni'),
    indietro: true,
    html: `
      <div class="statistiche statistiche--tre">
        <div class="stat"><div class="stat__numero">${mediaGenerale}%</div><div class="stat__etichetta">risposte giuste</div></div>
        <div class="stat"><div class="stat__numero">${totali.domande}</div><div class="stat__etichetta">domande fatte</div></div>
        <div class="stat"><div class="stat__numero">${tempoTotale(totali.tempo).numero}</div><div class="stat__etichetta">${tempoTotale(totali.tempo).unita} di studio</div></div>
      </div>

      <section class="sezione">
        <div class="sezione__testa"><h2>Andamento</h2></div>
        ${graficoAndamento(sessioni.slice(0, 20).reverse())}
      </section>

      <section class="sezione">
        <div class="sezione__testa"><h2>Le sessioni</h2></div>
        <div class="lista-libri">
          ${sessioni.map(s => {
            const p = s.numeroDomande ? Math.round((s.punteggio / s.numeroDomande) * 100) : 0;
            return `<button class="riga-libro" data-sessione="${s.id}">
              <span class="riga-libro__testo">
                <span class="riga-libro__titolo">${s.punteggio} su ${s.numeroDomande} · ${p}%</span>
                <span class="riga-libro__sotto">${dataBreve(s.data)} · ${durataTesto(s.durata || 0)}</span>
              </span>
              <span class="riga-libro__coda">›</span>
            </button>`;
          }).join('')}
        </div>
      </section>`,
    dopo: radice => {
      delega(radice, 'click', '[data-sessione]', (_, b) => vaiA('/studio/esito/' + b.dataset.sessione));
      delega(radice, 'click', '[data-barra]', (_, b) => vaiA('/studio/esito/' + b.dataset.barra));
    }
  };
}

/** Grafico a barre dell'andamento: una serie sola, quindi niente legenda —
 *  il titolo della sezione dice già cos'è. Asse da 0 a 100 (le barre partono
 *  sempre da zero, o le proporzioni mentono), griglia discreta a 50 e 100,
 *  etichette solo sulla prima e sull'ultima sessione. */
function graficoAndamento (sessioni) {
  const L = 320, A = 140, base = A - 22, cima = 14;
  const gutter = 34;              // spazio a destra per le etichette della scala
  const utile = L - gutter;
  const n = sessioni.length;
  // con poche sessioni le barre non devono spargersi per tutta la larghezza:
  // il gruppo resta compatto e centrato
  const passo = Math.min(utile / Math.max(n, 1), 46);
  const larghezza = Math.max(6, Math.min(26, passo - 4));   // 4px di respiro fra le barre
  const margine = (utile - passo * n) / 2;

  const barre = sessioni.map((s, i) => {
    const p = s.numeroDomande ? (s.punteggio / s.numeroDomande) : 0;
    const h = Math.max(2, (base - cima) * p);
    const x = margine + i * passo + (passo - larghezza) / 2;
    const y = base - h;
    const perc = Math.round(p * 100);
    return `<g class="barra" data-barra="${s.id}" tabindex="0" role="listitem">
        <title>${dataBreve(s.data)}: ${s.punteggio} su ${s.numeroDomande} (${perc}%)</title>
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${larghezza.toFixed(1)}" height="${h.toFixed(1)}" rx="4"/>
      </g>`;
  }).join('');

  const etichette = [];
  if (n) {
    const primo = sessioni[0], ultimo = sessioni[n - 1];
    etichette.push(`<text class="asse" x="${margine.toFixed(1)}" y="${A - 4}" text-anchor="start">${dataBreve(primo.data)}</text>`);
    if (n > 1) etichette.push(`<text class="asse" x="${(margine + passo * n).toFixed(1)}" y="${A - 4}" text-anchor="end">${dataBreve(ultimo.data)}</text>`);
    const percUltimo = ultimo.numeroDomande ? Math.round((ultimo.punteggio / ultimo.numeroDomande) * 100) : 0;
    const xUltimo = margine + (n - 1) * passo + passo / 2;
    const cimaBarra = base - Math.max(2, (base - cima) * (percUltimo / 100));
    // se la barra arriva in alto l'etichetta va dentro, o si scontra con la scala
    const dentro = percUltimo >= 86;
    etichette.push(`<text class="valore ${dentro ? 'valore--dentro' : ''}" x="${xUltimo.toFixed(1)}" y="${(dentro ? cimaBarra + 12 : cimaBarra - 5).toFixed(1)}" text-anchor="middle">${percUltimo}%</text>`);
  }

  return `
    <figure class="gr-andamento">
      <svg viewBox="0 0 ${L} ${A}" role="list" aria-label="Percentuale di risposte giuste per sessione, dalla più vecchia alla più recente">
        <line class="griglia" x1="0" y1="${cima}" x2="${utile}" y2="${cima}"/>
        <line class="griglia" x1="0" y1="${(cima + base) / 2}" x2="${utile}" y2="${(cima + base) / 2}"/>
        <text class="asse" x="${L}" y="${cima + 3}" text-anchor="end">100%</text>
        <text class="asse" x="${L}" y="${(cima + base) / 2 + 3}" text-anchor="end">50%</text>
        <line class="asse-linea" x1="0" y1="${base}" x2="${utile}" y2="${base}"/>
        ${barre}
        ${etichette.join('')}
      </svg>
      <figcaption class="minuscolo">Percentuale di risposte giuste, ${n === 1 ? 'una sessione' : `ultime ${n} sessioni`}. Tocca una barra per aprire quella sessione.</figcaption>
    </figure>`;
}
