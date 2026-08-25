/* =========================================================================
   dettatura.js — input vocale sui campi di testo (Web Speech API)
   Serve a ricopiare a voce un passaggio invece di digitarlo sul telefono.

   Due avvertenze che l'app dice anche all'utente:
   · il riconoscimento NON avviene sul telefono: l'audio passa dai server del
     browser (Apple su Safari, Google su Chrome), quindi serve la connessione;
   · dove l'API non c'è il pulsante non compare affatto — resta comunque il
     microfono della tastiera di sistema, che fa un lavoro simile.
   ========================================================================= */

import { qs, qsa, avviso, vibra } from './ui.js';
import { esc } from './utils/text.js';

const Riconoscimento = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

export const dettaturaSupportata = () => !!Riconoscimento;

/** Dal codice lingua del libro al tag che vuole il riconoscitore. */
export function tagLingua (codice) {
  return ({
    it: 'it-IT', en: 'en-US', fr: 'fr-FR', de: 'de-DE',
    es: 'es-ES', pt: 'pt-PT', la: 'it-IT'          // il latino non è riconosciuto: si detta all'italiana
  })[codice] || 'it-IT';
}

const NOMI_LINGUA = {
  'it-IT': 'italiano', 'en-US': 'inglese', 'fr-FR': 'francese',
  'de-DE': 'tedesco', 'es-ES': 'spagnolo', 'pt-PT': 'portoghese'
};

/* ------------------------------------------------- punteggiatura dettata */

/* L'ordine conta: "punto e virgola" va sostituito prima di "punto". */
const PUNTEGGIATURA = [
  [/\bpunto e virgola\b/gi, ';'],
  [/\bdue punti\b/gi, ':'],
  [/\bpunto interrogativo\b/gi, '?'],
  [/\bpunto di domanda\b/gi, '?'],
  [/\bpunto esclamativo\b/gi, '!'],
  [/\bpunti di sospensione\b/gi, '…'],
  [/\b(?:aperte |aperte le |apri )?virgolette (?:aperte|basse)\b/gi, '«'],
  [/\b(?:aperte|apri) (?:le )?virgolette\b/gi, '«'],
  [/\b(?:chiuse|chiudi) (?:le )?virgolette\b/gi, '»'],
  [/\bvirgolette chiuse\b/gi, '»'],
  [/\b(?:aperta|apri) (?:la )?parentesi\b/gi, '('],
  [/\b(?:chiusa|chiudi) (?:la )?parentesi\b/gi, ')'],
  [/\bparentesi aperta\b/gi, '('],
  [/\bparentesi chiusa\b/gi, ')'],
  [/\b(?:vai )?a capo\b/gi, '\n'],
  [/\bnuova riga\b/gi, '\n'],
  [/\blineetta\b/gi, '—'],
  [/\bvirgola\b/gi, ','],
  [/\bpunto\b/gi, '.']
];

/** Trasforma le parole di punteggiatura dettate nei segni corrispondenti e
 *  rimette a posto spazi e maiuscole. Si può disattivare: se la citazione
 *  contiene davvero la parola «punto», la conversione la rovinerebbe. */
export function applicaPunteggiatura (testo) {
  let t = ' ' + String(testo) + ' ';
  PUNTEGGIATURA.forEach(([re, segno]) => { t = t.replace(re, segno); });
  return sistemaSpazi(t);
}

function sistemaSpazi (t) {
  return t
    .replace(/\s+([,.;:!?…»)])/g, '$1')       // niente spazio prima del segno
    .replace(/([«(])\s+/g, '$1')              // né dopo un'apertura
    .replace(/([,.;:!?…])(?=[^\s\d])/g, '$1 ')// uno spazio dopo, se manca
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/([.!?…]\s+|^\s*)([a-zà-ÿ])/g, (_, pre, lettera) => pre + lettera.toUpperCase())
    .trim();
}

/* ------------------------------------------------------------- markup --- */

/** Barra da mettere sotto un campo di testo.
 *  `per` è l'id del campo, `lingua` il tag iniziale. */
export function barraDettaturaHTML ({ per, lingua = 'it-IT', punteggiatura = true, etichetta = 'Detta' }) {
  if (!dettaturaSupportata()) return '';
  const altraLingua = lingua !== 'it-IT' ? 'it-IT' : '';
  return `
    <div class="dettatura" data-dettatura="${esc(per)}" data-lingua="${esc(lingua)}"
         ${altraLingua ? `data-altra-lingua="${esc(altraLingua)}"` : ''}>
      <button type="button" class="btn btn--piccolo btn--fantasma dettatura__via" aria-pressed="false">
        <svg class="glifo" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3"/>
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>
        </svg>
        <span class="dettatura__etichetta">${esc(etichetta)}</span>
      </button>
      ${altraLingua ? `<button type="button" class="chip dettatura__lingua">${esc(NOMI_LINGUA[lingua] || lingua)}</button>` : ''}
      <button type="button" class="chip dettatura__segni" aria-pressed="${punteggiatura}"
              title="Converte «virgola», «punto», «a capo» nei segni corrispondenti">
        punteggiatura
      </button>
      <span class="dettatura__stato" role="status" aria-live="polite"></span>
    </div>
    <p class="dettatura__anteprima" hidden></p>`;
}

/* ---------------------------------------------------------- comportamento */

/** Collega tutte le barre di dettatura dentro `radice`.
 *  Ritorna una funzione da chiamare alla chiusura per liberare il microfono. */
export function collegaDettatura (radice, { punteggiatura = true, suCambioSegni = null } = {}) {
  if (!dettaturaSupportata()) return () => {};

  const sessioni = qsa('[data-dettatura]', radice).map(barra => sessione(barra, { punteggiatura, suCambioSegni }));
  return () => sessioni.forEach(s => s.ferma());
}

function sessione (barra, opzioni) {
  const campo = document.getElementById(barra.dataset.dettatura);
  const bottone = qs('.dettatura__via', barra);
  const etichetta = qs('.dettatura__etichetta', barra);
  const stato = qs('.dettatura__stato', barra);
  const anteprima = barra.nextElementSibling &&
    barra.nextElementSibling.classList.contains('dettatura__anteprima')
    ? barra.nextElementSibling : null;
  const bottoneLingua = qs('.dettatura__lingua', barra);
  const bottoneSegni = qs('.dettatura__segni', barra);

  let riconoscitore = null;
  let attivo = false;            // l'utente vuole dettare
  let fermatoDaNoi = false;      // per distinguere lo stop volontario
  let riavviiAVuoto = 0;         // salvagente contro i cicli di riavvio
  let lingua = barra.dataset.lingua || 'it-IT';
  let segni = !!opzioni.punteggiatura;

  /* --- stato della trascrizione (correzione duplicazione) ------------------
     La Web Speech API consegna a ogni evento onresult l'INTERA lista dei
     risultati (cumulativa). Rileggere solo l'ultimo (o accodare a ogni evento)
     fa crescere il testo parola per parola. Invece teniamo il testo che c'era
     nel campo PRIMA della dettatura (prefissoBase/suffissoBase, attorno al
     cursore) e a ogni evento ricostruiamo l'intero segmento dettato da zero:
       confermato     = frasi finali portate avanti tra i riavvii del motore
       finaleSessione = frasi finali della sessione CORRENTE (ricalcolate)
       parzialeTesto  = testo provvisorio (SOSTITUISCE, non si somma mai)
     Il campo è sempre = base + elaborato(dettato): idempotente, quindi eventi
     ripetuti non possono duplicare nulla. */
  let prefissoBase = '', suffissoBase = '';
  let confermato = '', finaleSessione = '', parzialeTesto = '';

  aggiornaSegni();

  function aggiornaSegni () {
    if (bottoneSegni) {
      bottoneSegni.setAttribute('aria-pressed', String(segni));
      bottoneSegni.classList.toggle('is-attivo', segni);
    }
  }

  function scriviStato (testo, tipo = '') {
    stato.textContent = testo;
    stato.className = 'dettatura__stato' + (tipo ? ' dettatura__stato--' + tipo : '');
  }

  function mostraAnteprima (testo) {
    if (!anteprima) return;
    anteprima.textContent = testo;
    anteprima.hidden = !testo;
  }

  /* Ricostruisce il campo da base + trascrizione dettata. Idempotente:
     ricalcolando tutto a ogni evento, gli eventi ripetuti non duplicano. */
  function applicaAlCampo (includiParziale) {
    if (!campo) return;
    const grezzo = [confermato, finaleSessione, includiParziale ? parzialeTesto : '']
      .map(s => s.trim()).filter(Boolean).join(' ');
    const elaborato = grezzo ? (segni ? applicaPunteggiatura(grezzo) : sistemaSpazi(grezzo)) : '';
    let t = elaborato;
    if (t) {
      // maiuscola se siamo a inizio campo o dopo un punto fermo
      if (!prefissoBase.trim() || /[.!?…]\s*$/.test(prefissoBase) || /\n\s*$/.test(prefissoBase)) {
        t = t.replace(/^([a-zà-ÿ])/, c => c.toUpperCase());
      }
      // spazio di raccordo, tranne davanti a un segno di chiusura
      if (prefissoBase && !/[\s(«]$/.test(prefissoBase) && !/^[,.;:!?…»)]/.test(t)) t = ' ' + t;
    }
    campo.value = prefissoBase + t + suffissoBase;
    const posizione = (prefissoBase + t).length;
    try { campo.setSelectionRange(posizione, posizione); } catch (_) {}
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function crea () {
    const r = new Riconoscimento();
    r.lang = lingua;
    r.continuous = true;          // non si ferma alla prima pausa
    r.interimResults = true;      // così si vede scrivere mentre parli
    r.maxAlternatives = 1;

    r.onstart = () => {
      scriviStato('ti ascolto…', 'attivo');
      barra.classList.add('is-in-ascolto');
      bottone.setAttribute('aria-pressed', 'true');
      bottone.classList.add('btn--pieno');
      bottone.classList.remove('btn--fantasma');
      etichetta.textContent = 'Ferma';
    };

    r.onresult = ev => {
      // Ricalcola finali e parziale dall'INTERA lista corrente a ogni evento:
      // così le stranezze di resultIndex/isFinal fra motori non duplicano.
      let f = '', p = '';
      for (let i = 0; i < ev.results.length; i++) {
        const pezzo = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) f += pezzo + ' ';
        else p += pezzo;
      }
      if (f.trim()) riavviiAVuoto = 0;
      finaleSessione = f.trim();
      parzialeTesto = p.trim();
      applicaAlCampo(true);
      mostraAnteprima(parzialeTesto);
    };

    r.onerror = ev => {
      const codice = ev.error;
      if (codice === 'aborted') return;
      if (codice === 'no-speech') { scriviStato('non ho sentito niente…'); return; }
      attivo = false;
      const messaggi = {
        'not-allowed': 'Il microfono è bloccato: consenti l\'accesso al sito nelle impostazioni del browser.',
        'service-not-allowed': 'Il browser non concede il riconoscimento vocale a questa pagina.',
        'audio-capture': 'Non trovo un microfono su questo dispositivo.',
        network: 'La dettatura ha bisogno della connessione: il riconoscimento avviene sui server del browser.',
        'language-not-supported': `Il riconoscimento non conosce questa lingua (${lingua}).`
      };
      avviso(messaggi[codice] || 'La dettatura si è interrotta. Riprova.', 'errore', 5000);
      spegni();
    };

    r.onend = () => {
      // Consolida i finali di questa sessione PRIMA di un eventuale riavvio del
      // motore, così la nuova sessione riparte da una lista vuota senza perdite.
      if (finaleSessione) { confermato = (confermato ? confermato + ' ' : '') + finaleSessione; finaleSessione = ''; }
      parzialeTesto = '';
      // Chrome chiude da solo dopo qualche secondo di silenzio: se l'utente
      // sta ancora dettando lo facciamo ripartire, ma non all'infinito.
      if (attivo && !fermatoDaNoi) {
        if (++riavviiAVuoto > 6) {
          avviso('Ho smesso di ascoltare: non arrivava più audio.', 'info');
          applicaAlCampo(false);
          spegni();
          return;
        }
        try { r.start(); return; } catch (_) { /* già avviato: lascia stare */ }
      }
      applicaAlCampo(false);   // toglie il parziale rimasto, tiene il confermato
      spegni();
    };

    return r;
  }

  function spegni () {
    attivo = false;
    barra.classList.remove('is-in-ascolto');
    bottone.setAttribute('aria-pressed', 'false');
    bottone.classList.remove('btn--pieno');
    bottone.classList.add('btn--fantasma');
    etichetta.textContent = 'Detta';
    scriviStato('');
    mostraAnteprima('');
  }

  function avvia () {
    if (attivo) return;
    if (navigator.onLine === false) {
      avviso('La dettatura ha bisogno della connessione: il riconoscimento non avviene sul telefono.', 'errore', 5000);
      return;
    }
    // Cattura ORA il testo attorno al cursore: la dettatura si inserisce qui e
    // il campo viene ricostruito da questa base, mai dalla trascrizione vecchia.
    const inizio = campo.selectionStart ?? campo.value.length;
    const fine = campo.selectionEnd ?? campo.value.length;
    prefissoBase = campo.value.slice(0, inizio);
    suffissoBase = campo.value.slice(fine);
    confermato = ''; finaleSessione = ''; parzialeTesto = '';
    attivo = true;
    fermatoDaNoi = false;
    riavviiAVuoto = 0;
    riconoscitore = crea();
    try {
      riconoscitore.start();
      vibra(10);
      campo.focus();
    } catch (e) {
      attivo = false;
      avviso('Non riesco ad avviare la dettatura su questo browser.', 'errore');
    }
  }

  function ferma () {
    if (!riconoscitore) { spegni(); return; }
    fermatoDaNoi = true;
    attivo = false;
    try { riconoscitore.stop(); } catch (_) {}
    try { riconoscitore.abort(); } catch (_) {}
    riconoscitore = null;
    applicaAlCampo(false);   // fissa il testo senza parziale, anche se onend non scatta
    spegni();
    vibra(6);
  }

  bottone.addEventListener('click', () => (attivo ? ferma() : avvia()));

  if (bottoneLingua) {
    const altra = barra.dataset.altraLingua;
    bottoneLingua.addEventListener('click', () => {
      const eraAttivo = attivo;
      if (attivo) ferma();
      lingua = lingua === altra ? (barra.dataset.lingua || 'it-IT') : altra;
      bottoneLingua.textContent = NOMI_LINGUA[lingua] || lingua;
      if (eraAttivo) avvia();
    });
  }

  if (bottoneSegni) {
    bottoneSegni.addEventListener('click', () => {
      segni = !segni;
      aggiornaSegni();
      if (opzioni.suCambioSegni) opzioni.suCambioSegni(segni);
      avviso(segni
        ? 'Dirò «virgola», «punto», «a capo» e li scriverò come segni.'
        : 'Punteggiatura dettata disattivata: le parole restano parole.');
    });
  }

  return { ferma };
}
