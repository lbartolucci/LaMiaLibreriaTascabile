/* =========================================================================
   grafo.js — mappa dei libri e dei loro collegamenti
   Disegno su canvas con un force-layout scritto a mano (stile
   Fruchterman–Reingold): niente librerie esterne, così l'app resta leggera
   e funziona offline. Pensato per le dita: pizzica per lo zoom, trascina per
   spostarti, tocca un nodo per aprire il libro.
   ========================================================================= */

import { qs, delega, vuotoHTML, avviso, vibra } from '../ui.js';
import { esc, iniziali } from '../utils/text.js';
import * as store from '../store.js';
import { vaiA } from '../router.js';
import { TIPI_COLLEGAMENTO } from '../models.js';

let animazione = null;
let disiscrivi = null;

export default async function vistaGrafo (parametri) {
  const libri = store.stato.libri;
  const collegamenti = store.stato.collegamenti;

  if (libri.length < 2) {
    return {
      titolo: 'Grafo', indietro: true,
      html: vuotoHTML({
        icona: '◇', titolo: 'Il grafo ha bisogno di almeno due libri',
        testo: 'La mappa mostra i legami fra i tuoi libri: con un libro solo non c\'è niente da collegare.',
        azione: '<button class="btn btn--fantasma" data-az="libreria">Torna alla libreria</button>'
      }),
      dopo: radice => delega(radice, 'click', '[data-az="libreria"]', () => vaiA('/libreria'))
    };
  }

  return {
    titolo: 'Grafo',
    titoloTesto: 'Grafo',
    sottotitolo: `${libri.length} libri · ${collegamenti.length} legami`,
    indietro: true,
    html: `
      <div class="grafo-guscio">
        <canvas class="grafo-tela" id="tela" role="img"
                aria-label="Mappa dei collegamenti fra i libri. L'elenco testuale equivalente è nella scheda di ogni libro."></canvas>
        <div class="grafo-comandi">
          <button class="btn-icona" data-zoom="+" aria-label="Ingrandisci">+</button>
          <button class="btn-icona" data-zoom="-" aria-label="Rimpicciolisci">−</button>
          <button class="btn-icona" data-zoom="0" aria-label="Rimetti a fuoco tutto">⤢</button>
        </div>
        <div class="grafo-legenda">
          ${TIPI_COLLEGAMENTO.filter(t => collegamenti.some(c => c.tipo === t.id))
            .map(t => `<span><i style="background:${t.colore}"></i>${esc(t.etichetta)}</span>`).join('')
            || '<span>Nessun collegamento: i libri galleggiano isolati.</span>'}
        </div>
      </div>
      <p class="minuscolo" style="margin-top:10px">Trascina per spostarti, pizzica per lo zoom, tocca un libro per aprirlo. Lo spessore della linea è la forza del legame.</p>`,
    dopo: radice => avviaGrafo(radice, parametri.query && parametri.query.fuoco),
    pulisci: () => {
      if (animazione) cancelAnimationFrame(animazione);
      animazione = null;
      if (disiscrivi) { disiscrivi(); disiscrivi = null; }
    }
  };
}

/* ------------------------------------------------------------ simulazione */

function avviaGrafo (radice, idFuoco) {
  const tela = qs('#tela', radice);
  const g = tela.getContext('2d');

  let nodi = [], archi = [];
  const camera = { x: 0, y: 0, scala: 1 };
  let temperatura = 1;
  let nodoSelezionato = idFuoco || null;

  function costruisci () {
    const raggioIniziale = 40 + store.stato.libri.length * 8;
    const vecchi = new Map(nodi.map(n => [n.id, n]));
    nodi = store.stato.libri.map((l, i) => {
      const vecchio = vecchi.get(l.id);
      const angolo = (i / store.stato.libri.length) * Math.PI * 2;
      return vecchio ? Object.assign(vecchio, { libro: l }) : {
        id: l.id, libro: l,
        x: Math.cos(angolo) * raggioIniziale + (Math.random() - .5) * 20,
        y: Math.sin(angolo) * raggioIniziale + (Math.random() - .5) * 20,
        vx: 0, vy: 0, grado: 0
      };
    });
    const perId = new Map(nodi.map(n => [n.id, n]));
    archi = store.stato.collegamenti
      .map(c => ({ a: perId.get(c.libroA_id), b: perId.get(c.libroB_id), dati: c }))
      .filter(a => a.a && a.b);
    nodi.forEach(n => { n.grado = 0; });
    archi.forEach(a => { a.a.grado++; a.b.grado++; });
    temperatura = 1;
  }

  /* Un passo di simulazione. Con qualche centinaio di libri il confronto
     di tutte le coppie costa poco e ci risparmia un quadtree. */
  function passo () {
    const K = 78;                      // distanza d'equilibrio
    const n = nodi.length;

    for (let i = 0; i < n; i++) {
      const a = nodi[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodi[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = (Math.random() - .5); dy = (Math.random() - .5); d2 = 0.01; }
        const d = Math.sqrt(d2);
        const rep = (K * K) / d;                       // repulsione fra tutti
        const fx = (dx / d) * rep, fy = (dy / d) * rep;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }

    archi.forEach(({ a, b, dati }) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const att = (d * d) / K * (0.5 + dati.forza * 0.25);   // legami più forti, più corti
      const fx = (dx / d) * att, fy = (dy / d) * att;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });

    // gravità verso il centro: tiene insieme anche i libri isolati
    nodi.forEach(nd => { nd.vx -= nd.x * 0.9; nd.vy -= nd.y * 0.9; });

    const passoMax = 12 * temperatura;
    nodi.forEach(nd => {
      if (nd.bloccato) { nd.vx = nd.vy = 0; return; }
      const v = Math.hypot(nd.vx, nd.vy) || 1;
      nd.x += (nd.vx / v) * Math.min(v * 0.008, passoMax);
      nd.y += (nd.vy / v) * Math.min(v * 0.008, passoMax);
      nd.vx *= 0.02; nd.vy *= 0.02;
    });

    temperatura *= 0.985;
  }

  /* ------------------------------------------------------------ disegno - */

  function ridimensiona () {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const r = tela.getBoundingClientRect();
    tela.width = Math.max(1, Math.round(r.width * dpr));
    tela.height = Math.max(1, Math.round(r.height * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    tela._css = { w: r.width, h: r.height };
  }

  function stile (nome) {
    return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  }

  function disegna () {
    const { w, h } = tela._css;
    const colInchiostro = stile('--inchiostro') || '#2A2622';
    const colTenue = stile('--inchiostro-3') || '#9A9083';
    const colSuperficie = stile('--superficie') || '#FFF';
    const colAccento = stile('--accento') || '#9A5B3D';
    const colBordo = stile('--bordo-forte') || '#CCC';

    g.clearRect(0, 0, w, h);

    g.save();
    g.translate(w / 2 + camera.x, h / 2 + camera.y);
    g.scale(camera.scala, camera.scala);

    // archi
    archi.forEach(({ a, b, dati }) => {
      const tipo = TIPI_COLLEGAMENTO.find(t => t.id === dati.tipo) || TIPI_COLLEGAMENTO[0];
      const acceso = !nodoSelezionato || a.id === nodoSelezionato || b.id === nodoSelezionato;
      g.globalAlpha = acceso ? 0.85 : 0.16;
      g.strokeStyle = tipo.colore;
      g.lineWidth = (0.9 + dati.forza * 0.9) / camera.scala;   // spessore costante sullo schermo
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    });
    g.globalAlpha = 1;

    // nodi
    nodi.forEach(nd => {
      const r = 13 + Math.min(10, nd.grado * 2);
      const acceso = !nodoSelezionato || nd.id === nodoSelezionato ||
        archi.some(a => (a.a.id === nd.id && a.b.id === nodoSelezionato) ||
                        (a.b.id === nd.id && a.a.id === nodoSelezionato));
      g.globalAlpha = acceso ? 1 : 0.28;

      g.beginPath();
      g.arc(nd.x, nd.y, r, 0, Math.PI * 2);
      g.fillStyle = nd.id === nodoSelezionato ? colAccento : colSuperficie;
      g.fill();
      g.lineWidth = (nd.grado ? 2 : 1) / camera.scala;
      g.strokeStyle = nd.id === nodoSelezionato ? colAccento : (nd.grado ? colAccento : colBordo);
      g.stroke();

      g.fillStyle = nd.id === nodoSelezionato ? '#FFF9F2' : colInchiostro;
      g.font = `600 ${Math.round(r * 0.82)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(iniziali(nd.libro.titolo), nd.x, nd.y + 1);

      // il titolo compare solo quando c'è spazio per leggerlo
      if (camera.scala > 0.62) {
        g.font = `${(11 / camera.scala).toFixed(1)}px "Iowan Old Style", Palatino, Georgia, serif`;
        g.fillStyle = colTenue;
        const t = nd.libro.titolo.length > 22 ? nd.libro.titolo.slice(0, 21) + '…' : nd.libro.titolo;
        // alone del colore della carta: così l'etichetta resta leggibile
        // anche quando passa sopra un arco
        g.lineJoin = 'round';
        g.lineWidth = 3.4 / camera.scala;
        g.strokeStyle = stile('--carta') || '#FAF6EF';
        g.strokeText(t, nd.x, nd.y + r + 11);
        g.fillStyle = colTenue;
        g.fillText(t, nd.x, nd.y + r + 11);
      }
    });
    g.globalAlpha = 1;
    g.restore();
  }

  function ciclo () {
    if (temperatura > 0.02) passo();
    disegna();
    animazione = requestAnimationFrame(ciclo);
  }

  /* ------------------------------------------------------- interazioni -- */

  const puntatori = new Map();
  let distanzaIniziale = 0, scalaIniziale = 1;
  let trascinando = false, mosso = 0, nodoTrascinato = null;
  let ultimo = { x: 0, y: 0 };

  const schermoAMondo = (cx, cy) => {
    const r = tela.getBoundingClientRect();
    return {
      x: (cx - r.left - r.width / 2 - camera.x) / camera.scala,
      y: (cy - r.top - r.height / 2 - camera.y) / camera.scala
    };
  };

  const nodoIn = (cx, cy) => {
    const p = schermoAMondo(cx, cy);
    let migliore = null, minDist = Infinity;
    nodi.forEach(nd => {
      const r = 13 + Math.min(10, nd.grado * 2);
      const d = Math.hypot(nd.x - p.x, nd.y - p.y);
      if (d < r + 6 && d < minDist) { migliore = nd; minDist = d; }
    });
    return migliore;
  };

  tela.addEventListener('pointerdown', ev => {
    tela.setPointerCapture(ev.pointerId);
    puntatori.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (puntatori.size === 2) {
      const [a, b] = [...puntatori.values()];
      distanzaIniziale = Math.hypot(a.x - b.x, a.y - b.y);
      scalaIniziale = camera.scala;
      nodoTrascinato = null;
    } else {
      trascinando = true; mosso = 0;
      ultimo = { x: ev.clientX, y: ev.clientY };
      nodoTrascinato = nodoIn(ev.clientX, ev.clientY);
      if (nodoTrascinato) nodoTrascinato.bloccato = true;
    }
  });

  tela.addEventListener('pointermove', ev => {
    if (!puntatori.has(ev.pointerId)) return;
    puntatori.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (puntatori.size === 2) {
      const [a, b] = [...puntatori.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (distanzaIniziale > 0) {
        camera.scala = Math.max(0.25, Math.min(3.5, scalaIniziale * (d / distanzaIniziale)));
      }
      return;
    }
    if (!trascinando) return;
    const dx = ev.clientX - ultimo.x, dy = ev.clientY - ultimo.y;
    mosso += Math.abs(dx) + Math.abs(dy);
    ultimo = { x: ev.clientX, y: ev.clientY };
    if (nodoTrascinato) {
      nodoTrascinato.x += dx / camera.scala;
      nodoTrascinato.y += dy / camera.scala;
      temperatura = Math.max(temperatura, 0.25);
    } else {
      camera.x += dx; camera.y += dy;
    }
  });

  const finePuntatore = ev => {
    const era = puntatori.get(ev.pointerId);
    puntatori.delete(ev.pointerId);
    if (puntatori.size < 2) distanzaIniziale = 0;
    if (nodoTrascinato) { nodoTrascinato.bloccato = false; nodoTrascinato = null; }
    if (trascinando && mosso < 8 && era) {
      const nd = nodoIn(era.x, era.y);
      if (nd) {
        if (nodoSelezionato === nd.id) vaiA('/libro/' + nd.id);
        else { nodoSelezionato = nd.id; vibra(8); mostraEtichetta(nd); }
      } else nodoSelezionato = null;
    }
    trascinando = false;
  };
  tela.addEventListener('pointerup', finePuntatore);
  tela.addEventListener('pointercancel', finePuntatore);

  tela.addEventListener('wheel', ev => {
    ev.preventDefault();
    const fattore = Math.exp(-ev.deltaY * 0.0016);
    camera.scala = Math.max(0.25, Math.min(3.5, camera.scala * fattore));
  }, { passive: false });

  function mostraEtichetta (nd) {
    const n = store.collegamentiDi(nd.id).length;
    avviso(`${nd.libro.titolo} — ${n ? `${n} ${n === 1 ? 'legame' : 'legami'}` : 'nessun legame'}. Tocca di nuovo per aprirlo.`, 'info', 2600);
  }

  function inquadraTutto () {
    if (!nodi.length) return;
    const xs = nodi.map(n => n.x), ys = nodi.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const { w, h } = tela._css;
    const larghezza = Math.max(120, maxX - minX + 120);
    const altezza = Math.max(120, maxY - minY + 120);
    camera.scala = Math.max(0.25, Math.min(2, Math.min(w / larghezza, h / altezza)));
    camera.x = -((minX + maxX) / 2) * camera.scala;
    camera.y = -((minY + maxY) / 2) * camera.scala;
  }

  delega(radice, 'click', '[data-zoom]', (_, b) => {
    if (b.dataset.zoom === '+') camera.scala = Math.min(3.5, camera.scala * 1.3);
    else if (b.dataset.zoom === '-') camera.scala = Math.max(0.25, camera.scala / 1.3);
    else { nodoSelezionato = null; inquadraTutto(); }
  });

  /* ------------------------------------------------------------- avvio -- */

  costruisci();
  ridimensiona();
  // qualche giro a vuoto perché all'apertura la mappa sia già distesa
  for (let i = 0; i < 260; i++) passo();
  inquadraTutto();
  if (idFuoco) {
    const nd = nodi.find(n => n.id === idFuoco);
    if (nd) {
      nodoSelezionato = idFuoco;
      camera.scala = 1.1;
      camera.x = -nd.x * camera.scala;
      camera.y = -nd.y * camera.scala;
    }
  }
  ciclo();

  const suResize = () => { ridimensiona(); };
  window.addEventListener('resize', suResize);

  if (disiscrivi) disiscrivi();
  const smettiOsservare = store.osserva(tipo => {
    if (['libro', 'libro-eliminato', 'collegamento', 'collegamento-eliminato'].includes(tipo)) {
      costruisci();
      for (let i = 0; i < 120; i++) passo();
    }
  });
  disiscrivi = () => { smettiOsservare(); window.removeEventListener('resize', suResize); };
}
