/* =========================================================================
   citazioni.js — vista trasversale di tutte le citazioni e dettaglio a
   schermo intero. È il cuore visivo dell'app: qui le citazioni devono avere
   l'aria di una pagina stampata.
   ========================================================================= */

import {
  qs, qsa, delega, vuotoHTML, avviso, foglio, copertinaHTML, plurale, vibra
} from '../ui.js';
import { esc, evidenzia, evidenziaQuery, normalizza, terminiRicorrenti } from '../utils/text.js';
import * as store from '../store.js';
import { vaiA, indietro } from '../router.js';
import { apriFormCitazione, chiediEliminaCitazione } from './form-citazione.js';

let disiscrivi = null;

const filtri = { testo: '', tag: '', libroId: '', soloPreferite: false, ordine: 'recenti' };
let semeCasuale = 1;

export default async function vistaCitazioni (parametri) {
  if (parametri.dettaglio) return vistaDettaglio(parametri.id);

  if (parametri.query && parametri.query.libro) filtri.libroId = parametri.query.libro;
  if (parametri.query && parametri.query.tag) filtri.tag = parametri.query.tag;

  return {
    titolo: 'Citazioni',
    titoloTesto: 'Citazioni',
    sottotitolo: plurale(store.stato.citazioni.length, 'citazione', 'citazioni'),
    indietro: true,
    html: elencoHTML(),
    dopo: collegaElenco,
    pulisci: () => { if (disiscrivi) { disiscrivi(); disiscrivi = null; } }
  };
}

/* ------------------------------------------------------------- elenco --- */

function citazioniFiltrate () {
  const q = normalizza(filtri.testo);
  let out = store.stato.citazioni.filter(c => {
    if (filtri.soloPreferite && !c.preferita) return false;
    if (filtri.libroId && c.libroId !== filtri.libroId) return false;
    if (filtri.tag && !c.tag.some(t => normalizza(t) === normalizza(filtri.tag))) return false;
    if (q) {
      const libro = store.libro(c.libroId);
      const mucchio = normalizza([c.testo, c.contesto, c.capitolo, c.tag.join(' '),
        libro ? libro.titolo : '', libro ? libro.autore.join(' ') : ''].join(' '));
      if (!mucchio.includes(q)) return false;
    }
    return true;
  });

  if (filtri.ordine === 'alfabetico') out.sort((a, b) => a.testo.localeCompare(b.testo, 'it'));
  else if (filtri.ordine === 'casuale') out = mescola(out, semeCasuale);
  else out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return out;
}

/** Mescolamento riproducibile: con lo stesso seme l'ordine non cambia,
 *  così un ridisegno non ti sposta le citazioni sotto il dito. */
function mescola (arr, seme) {
  const a = [...arr];
  let s = seme;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function elencoHTML () {
  if (!store.stato.citazioni.length) {
    return vuotoHTML({
      icona: '❝',
      titolo: 'Nessuna citazione, per ora',
      testo: 'Le citazioni sono il motivo per cui esiste quest\'app. Apri un libro della tua libreria e aggiungi il primo passaggio che ti aveva colpito.',
      azione: '<button class="btn btn--pieno" data-az="libreria">Vai alla libreria</button>'
    });
  }

  const citazioni = citazioniFiltrate();
  const tag = store.valoriDistinti('tag').slice(0, 20);
  // termini che ricorrono in più citazioni: li evidenziamo per far vedere i
  // fili che attraversano libri diversi
  const ricorrenti = terminiRicorrenti(store.stato.citazioni.map(c => c.testo), { minDocumenti: 3, max: 18 })
    .map(t => t.termine);

  return `
    <div class="barra-ricerca">
      <input type="search" id="q-citazioni" placeholder="Cerca fra le citazioni"
             value="${esc(filtri.testo)}" autocomplete="off" aria-label="Cerca fra le citazioni">
    </div>

    <div class="chips" role="group" aria-label="Filtri">
      <button class="chip ${filtri.soloPreferite ? 'is-attivo' : ''}" data-az="preferite">♥ Preferite</button>
      <button class="chip" id="btn-ordine">↕ ${({ recenti: 'Recenti', alfabetico: 'A–Z', casuale: 'A caso' })[filtri.ordine]}</button>
      ${filtri.libroId ? `<button class="chip is-attivo" data-az="via-libro">${esc((store.libro(filtri.libroId) || {}).titolo || '')} ✕</button>` : ''}
      ${tag.map(t => `<button class="chip ${normalizza(filtri.tag) === normalizza(t.valore) ? 'is-attivo' : ''}" data-tag="${esc(t.valore)}">${esc(t.valore)} <span class="chip__n">${t.n}</span></button>`).join('')}
    </div>

    <p class="minuscolo">${plurale(citazioni.length, 'citazione', 'citazioni')}${filtri.testo ? ` per «${esc(filtri.testo)}»` : ''}</p>

    <div id="elenco-citazioni">
      ${citazioni.length ? citazioni.map(c => cardHTML(c, ricorrenti, filtri.testo)).join('')
        : vuotoHTML({ icona: '⌕', titolo: 'Nessuna citazione trovata', testo: 'Prova con un\'altra parola o togli i filtri.' })}
    </div>`;
}

function cardHTML (c, ricorrenti, query) {
  const libro = store.libro(c.libroId);
  const testo = query
    ? evidenziaQuery(c.testo, query)
    : evidenzia(c.testo, ricorrenti);
  return `
    <button class="citazione-card ${c.preferita ? 'citazione-card--preferita' : ''}" data-citazione="${c.id}">
      <p class="citazione-card__testo">${testo}</p>
      <span class="citazione-card__fonte">
        ${c.preferita ? '<span class="cuore">♥</span>' : ''}
        <span>${esc(libro ? libro.titolo : 'libro rimosso')}</span>
        ${libro && libro.autore.length ? `<span>· ${esc(libro.autore[0])}</span>` : ''}
        ${c.pagina != null ? `<span>· p. ${c.pagina}</span>` : ''}
      </span>
      ${c.tag.length ? `<span class="citazione-card__tags">${c.tag.map(t => `<span class="etichetta-tag">${esc(t)}</span>`).join('')}</span>` : ''}
    </button>`;
}

function collegaElenco (radice) {
  const ridisegna = () => {
    const attivo = document.activeElement;
    const eraRicerca = attivo && attivo.id === 'q-citazioni';
    const posizione = eraRicerca ? attivo.selectionStart : null;
    radice.innerHTML = elencoHTML();
    if (eraRicerca) {
      const nuovo = qs('#q-citazioni', radice);
      if (nuovo) { nuovo.focus(); try { nuovo.setSelectionRange(posizione, posizione); } catch (_) {} }
    }
  };

  if (disiscrivi) disiscrivi();
  disiscrivi = store.osserva(tipo => {
    if (['citazione', 'citazione-eliminata', 'libro', 'libro-eliminato'].includes(tipo)) ridisegna();
  });

  let timer = null;
  delega(radice, 'input', '#q-citazioni', ev => {
    filtri.testo = ev.target.value;
    clearTimeout(timer);
    timer = setTimeout(ridisegna, 220);
  });

  delega(radice, 'click', '[data-citazione]', (_, b) => vaiA('/citazione/' + b.dataset.citazione));
  delega(radice, 'click', '[data-az="preferite"]', () => { filtri.soloPreferite = !filtri.soloPreferite; ridisegna(); });
  delega(radice, 'click', '[data-az="via-libro"]', () => { filtri.libroId = ''; ridisegna(); });
  delega(radice, 'click', '[data-az="libreria"]', () => vaiA('/libreria'));
  delega(radice, 'click', '[data-tag]', (_, b) => {
    filtri.tag = normalizza(filtri.tag) === normalizza(b.dataset.tag) ? '' : b.dataset.tag;
    ridisegna();
  });
  delega(radice, 'click', '#btn-ordine', () => {
    const giro = { recenti: 'alfabetico', alfabetico: 'casuale', casuale: 'recenti' };
    filtri.ordine = giro[filtri.ordine];
    if (filtri.ordine === 'casuale') semeCasuale = Math.floor(Math.random() * 1e9) + 1;
    ridisegna();
  });
}

/* ----------------------------------------------------------- dettaglio -- */

function vistaDettaglio (id) {
  const c = store.citazione(id);
  if (!c) {
    return {
      titolo: 'Citazione', indietro: true,
      html: vuotoHTML({ icona: '∅', titolo: 'Citazione non trovata', testo: 'Probabilmente è stata eliminata.' })
    };
  }
  const libro = store.libro(c.libroId);
  const vicine = store.citazioniDi(c.libroId);
  const indice = vicine.findIndex(x => x.id === c.id);

  return {
    titolo: '',
    titoloTesto: libro ? libro.titolo : 'Citazione',
    indietro: true,
    azioni: `
      <button class="btn-icona" id="btn-preferita" aria-label="${c.preferita ? 'Togli dai preferiti' : 'Segna come preferita'}"
              aria-pressed="${c.preferita}">${c.preferita ? '♥' : '♡'}</button>
      <button class="btn-icona" id="btn-menu-cit" aria-label="Altre azioni">⋯</button>`,
    html: `
      <article class="citazione-piena">
        <div class="citazione-piena__virgolette" aria-hidden="true">“</div>
        <p class="citazione-piena__testo">${esc(c.testo)}</p>
        <div class="citazione-piena__meta">
          ${libro ? `<div class="citazione-piena__libro">${esc(libro.titolo)}</div>` : ''}
          ${libro && libro.autore.length ? `<div>${esc(libro.autore.join(', '))}</div>` : ''}
          <div class="minuscolo">${[c.capitolo, c.pagina != null ? `p. ${c.pagina}` : ''].filter(Boolean).join(' · ')}</div>
          ${c.tag.length ? `<div class="citazione-card__tags" style="margin-top:8px">${c.tag.map(t => `<span class="etichetta-tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
        ${c.contesto ? `<div class="citazione-piena__contesto"><strong>Perché l'ho segnata.</strong> ${esc(c.contesto)}</div>` : ''}
        <div class="citazione-piena__azioni">
          <button class="btn btn--piccolo btn--fantasma" data-az="copia">Copia</button>
          <button class="btn btn--piccolo btn--fantasma" data-az="condividi">Condividi</button>
          ${libro ? `<button class="btn btn--piccolo btn--fantasma" data-az="libro">Apri il libro</button>` : ''}
        </div>
        ${vicine.length > 1 ? `
          <nav style="display:flex;justify-content:space-between;gap:10px;margin-top:24px">
            <button class="btn btn--piccolo btn--fantasma" data-vai-cit="${indice > 0 ? vicine[indice - 1].id : ''}" ${indice <= 0 ? 'disabled' : ''}>‹ precedente</button>
            <span class="minuscolo" style="align-self:center">${indice + 1} di ${vicine.length}</span>
            <button class="btn btn--piccolo btn--fantasma" data-vai-cit="${indice < vicine.length - 1 ? vicine[indice + 1].id : ''}" ${indice >= vicine.length - 1 ? 'disabled' : ''}>successiva ›</button>
          </nav>` : ''}
      </article>`,
    dopo: radice => collegaDettaglio(radice, c.id)
  };
}

function collegaDettaglio (radice, id) {
  const c = () => store.citazione(id);

  delega(radice, 'click', '[data-az="copia"]', async () => {
    const cit = c();
    const libro = store.libro(cit.libroId);
    await copiaNegliAppunti(testoCondivisibile(cit, libro));
  });
  delega(radice, 'click', '[data-az="condividi"]', () => {
    const cit = c();
    condividiCitazione(cit, store.libro(cit.libroId));
  });
  delega(radice, 'click', '[data-az="libro"]', () => vaiA('/libro/' + c().libroId));
  delega(radice, 'click', '[data-vai-cit]', (_, b) => { if (b.dataset.vaiCit) vaiA('/citazione/' + b.dataset.vaiCit); });

  const testa = qs('#testa');
  const btnPref = qs('#btn-preferita', testa);
  if (btnPref) btnPref.onclick = async () => {
    const cit = { ...c() };
    cit.preferita = !cit.preferita;
    await store.salvaCitazione(cit);
    btnPref.textContent = cit.preferita ? '♥' : '♡';
    btnPref.setAttribute('aria-pressed', String(cit.preferita));
    vibra();
    avviso(cit.preferita ? 'Aggiunta alle preferite.' : 'Tolta dalle preferite.');
  };

  const btnMenu = qs('#btn-menu-cit', testa);
  if (btnMenu) btnMenu.onclick = () => {
    const cit = c();
    const f = foglio({
      titolo: 'Citazione',
      classe: 'foglio--corto',
      contenuto: `
        <button class="btn btn--largo btn--fantasma" data-az="modifica" style="margin-bottom:8px">Modifica</button>
        <button class="btn btn--largo btn--fantasma" data-az="copia" style="margin-bottom:8px">Copia il testo</button>
        <button class="btn btn--largo btn--fantasma" data-az="immagine" style="margin-bottom:16px">Salva come immagine</button>
        <button class="btn btn--largo btn--pericolo" data-az="elimina">Elimina</button>`
    });
    delega(f.elemento, 'click', '[data-az]', async (_, b) => {
      const az = b.dataset.az;
      f.chiudi();
      if (az === 'modifica') {
        await apriFormCitazione({ libroId: cit.libroId, citazione: cit });
        vaiA('/citazione/' + cit.id);      // stesso percorso: ridisegna la scheda
      }
      if (az === 'copia') await copiaNegliAppunti(testoCondivisibile(cit, store.libro(cit.libroId)));
      if (az === 'immagine') await scaricaImmagine(cit, store.libro(cit.libroId));
      if (az === 'elimina') { if (await chiediEliminaCitazione(cit)) indietro(); }
    });
  };
}

/* --------------------------------------------------- copia e condivisione */

function testoCondivisibile (c, libro) {
  const fonte = [libro ? libro.titolo : '', libro && libro.autore.length ? libro.autore.join(', ') : '',
    c.pagina != null ? `p. ${c.pagina}` : ''].filter(Boolean).join(', ');
  return `«${c.testo}»${fonte ? `\n— ${fonte}` : ''}`;
}

async function copiaNegliAppunti (testo) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(testo);
    } else {
      // ripiego per i contesti non sicuri (http semplice)
      const ta = document.createElement('textarea');
      ta.value = testo;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    vibra();
    avviso('Copiata negli appunti.', 'ok');
  } catch (e) {
    avviso('Non riesco a copiare: selezionala a mano.', 'errore');
  }
}

async function condividiCitazione (c, libro) {
  const testo = testoCondivisibile(c, libro);
  // prima proviamo a condividere l'immagine, che è la cosa bella da mandare
  try {
    const blob = await immagineCitazione(c, libro);
    const file = new File([blob], 'citazione.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: testo });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;      // l'utente ha annullato
  }
  try {
    if (navigator.share) { await navigator.share({ text: testo, title: libro ? libro.titolo : 'Citazione' }); return; }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  await copiaNegliAppunti(testo);
}

async function scaricaImmagine (c, libro) {
  try {
    const blob = await immagineCitazione(c, libro);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `citazione-${(libro ? libro.titolo : 'libro').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    avviso('Immagine salvata.', 'ok');
  } catch (e) {
    avviso('Non riesco a creare l\'immagine.', 'errore');
  }
}

/** Disegna la citazione su una tela come fosse una pagina: sfondo carta,
 *  testo con grazie, firma in basso. */
function immagineCitazione (c, libro) {
  const L = 1080, A = 1080;
  const tela = document.createElement('canvas');
  tela.width = L; tela.height = A;
  const g = tela.getContext('2d');

  const scuro = document.documentElement.getAttribute('data-tema') === 'scuro' ||
    (document.documentElement.getAttribute('data-tema') !== 'chiaro' &&
     matchMedia('(prefers-color-scheme: dark)').matches);
  const sfondo = scuro ? '#15120E' : '#FAF6EF';
  const inchiostro = scuro ? '#EDE4D5' : '#2A2622';
  const accento = scuro ? '#D3946A' : '#9A5B3D';

  g.fillStyle = sfondo; g.fillRect(0, 0, L, A);
  g.strokeStyle = accento; g.globalAlpha = .5; g.lineWidth = 6;
  g.beginPath(); g.moveTo(88, 150); g.lineTo(88, A - 220); g.stroke();
  g.globalAlpha = 1;

  const margine = 130;
  const larghezza = L - margine - 90;
  let dimensione = 54;
  let righe = [];
  const serif = '"Iowan Old Style", Palatino, Georgia, serif';
  do {
    g.font = `${dimensione}px ${serif}`;
    righe = spezzaTesto(g, c.testo, larghezza);
    if (righe.length * dimensione * 1.42 <= A - 420) break;
    dimensione -= 3;
  } while (dimensione > 22);

  g.fillStyle = inchiostro;
  g.textBaseline = 'top';
  let y = Math.max(150, (A - 200 - righe.length * dimensione * 1.42) / 2);
  righe.forEach(r => { g.fillText(r, margine, y); y += dimensione * 1.42; });

  g.font = '30px -apple-system, "Segoe UI", Roboto, sans-serif';
  g.fillStyle = accento;
  const fonte = [libro ? libro.titolo : '', libro && libro.autore.length ? libro.autore[0] : ''].filter(Boolean).join(' · ');
  g.fillText(fonte.slice(0, 60), margine, A - 150);

  return new Promise((ok, ko) =>
    tela.toBlob(b => (b ? ok(b) : ko(new Error('canvas vuota'))), 'image/png'));
}

function spezzaTesto (g, testo, larghezza) {
  const parole = String(testo).split(/\s+/);
  const righe = [];
  let corrente = '';
  parole.forEach(p => {
    const prova = corrente ? corrente + ' ' + p : p;
    if (g.measureText(prova).width > larghezza && corrente) { righe.push(corrente); corrente = p; }
    else corrente = prova;
  });
  if (corrente) righe.push(corrente);
  return righe.slice(0, 22);
}
