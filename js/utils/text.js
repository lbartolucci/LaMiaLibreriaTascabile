/* =========================================================================
   text.js — utilità testuali condivise
   Normalizzazione, tokenizzazione, stop-words IT/EN, similarità.
   Tutto locale: nessuna chiamata di rete, nessuna libreria esterna.
   ========================================================================= */

/** Stop-words italiane + inglesi: parole troppo comuni per essere significative.
 *  Servono sia ai suggerimenti di collegamento sia alle cloze del quiz
 *  (non ha senso oscurare "della" in una citazione). */
export const STOPWORDS = new Set([
  // italiano — articoli, preposizioni, congiunzioni, ausiliari
  'il','lo','la','i','gli','le','un','uno','una','del','dello','della','dei','degli','delle',
  'al','allo','alla','ai','agli','alle','dal','dallo','dalla','dai','dagli','dalle',
  'nel','nello','nella','nei','negli','nelle','sul','sullo','sulla','sui','sugli','sulle',
  'col','coi','di','a','da','in','con','su','per','tra','fra','e','ed','o','od','ma','se',
  'che','chi','cui','non','ne','ci','vi','si','mi','ti','li','lui','lei','loro','noi','voi',
  'io','tu','egli','ella','esso','essa','essi','esse','questo','questa','questi','queste',
  'quello','quella','quelli','quelle','come','dove','quando','perche','perché','anche',
  'ancora','già','gia','più','piu','meno','molto','poco','tanto','tutto','tutti','tutte','tutta',
  'essere','sono','sei','siamo','siete','era','erano','sia','stato','stata','stati','state',
  'avere','ho','hai','ha','abbiamo','avete','hanno','aveva','avevano','avuto',
  'fare','fa','fanno','può','puo','possono','deve','devono','solo','sempre','mai','ogni',
  'cosa','cose','uomo','modo','senza','sotto','sopra','dopo','prima','oltre','quasi','così','cosi',
  // inglese
  'the','a','an','of','to','in','on','at','by','for','with','from','as','is','are','was','were',
  'be','been','being','and','or','but','if','that','this','these','those','it','its','he','she',
  'they','we','you','i','his','her','their','our','your','my','me','him','them','us',
  'not','no','nor','so','than','then','there','here','when','where','what','which','who','whom',
  'how','why','all','any','both','each','more','most','other','some','such','only','own','same',
  'too','very','can','will','just','do','does','did','have','has','had','would','should','could',
  'about','into','over','under','after','before','again','once','out','up','down','off'
]);

/** Toglie accenti e diacritici mantenendo le lettere. */
export function senzaAccenti (s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normalizzazione forte: minuscole, senza accenti, senza punteggiatura,
 *  spazi compattati. È la forma usata per confronti e ricerche. */
export function normalizza (s) {
  return senzaAccenti(String(s || ''))
    .toLowerCase()
    .replace(/[’'`´]/g, "'")            // apostrofi tipografici → apostrofo semplice
    .replace(/[^a-z0-9'\s]/g, ' ')      // via la punteggiatura
    .replace(/\s+/g, ' ')
    .trim();
}

/** Spezza in parole normalizzate. */
export function parole (s) {
  const n = normalizza(s);
  return n ? n.split(' ').filter(Boolean) : [];
}

/** Parole "portanti": niente stop-words, niente parole cortissime, niente numeri puri. */
export function paroleSignificative (s, minLen = 4) {
  return parole(s).filter(p =>
    p.length >= minLen && !STOPWORDS.has(p) && !/^\d+$/.test(p)
  );
}

/** Indice di Jaccard fra due insiemi di stringhe (0 = disgiunti, 1 = identici). */
export function jaccard (a, b) {
  const A = new Set((a || []).map(x => normalizza(x)).filter(Boolean));
  const B = new Set((b || []).map(x => normalizza(x)).filter(Boolean));
  if (!A.size && !B.size) return 0;
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}

/** Sovrapposizione lessicale fra due testi lunghi: quota di parole portanti
 *  in comune rispetto al vocabolario più piccolo (coefficiente di Szymkiewicz). */
export function sovrapposizioneLessicale (testoA, testoB) {
  const A = new Set(paroleSignificative(testoA));
  const B = new Set(paroleSignificative(testoB));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return inter / Math.min(A.size, B.size);
}

/** Distanza di Levenshtein con due sole righe di lavoro (memoria O(min)). */
export function levenshtein (a, b) {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length > b.length) { const t = a; a = b; b = t; }
  let prec = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) prec[i] = i;
  for (let j = 1; j <= b.length; j++) {
    let corr = [j];
    for (let i = 1; i <= a.length; i++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      corr[i] = Math.min(corr[i - 1] + 1, prec[i] + 1, prec[i - 1] + costo);
    }
    prec = corr;
  }
  return prec[a.length];
}

/** Confronto tollerante usato dalle cloze: normalizza e accetta piccoli errori
 *  di battitura (distanza ≤ 20% della lunghezza attesa, minimo 1 carattere). */
export function rispostaAccettabile (data, attesa, tolleranza = 0.2) {
  const d = normalizza(data);
  const a = normalizza(attesa);
  if (!a) return false;
  if (d === a) return true;
  const soglia = Math.max(1, Math.floor(a.length * tolleranza));
  return levenshtein(d, a) <= soglia;
}

/** Estrae i termini più frequenti da un elenco di testi.
 *  Ritorna [{termine, occorrenze, documenti}] ordinato per rilevanza. */
export function terminiRicorrenti (testi, { minDocumenti = 2, max = 40 } = {}) {
  const conteggio = new Map();
  const documenti = new Map();
  (testi || []).forEach((t, idx) => {
    const viste = new Set();
    paroleSignificative(t, 5).forEach(p => {
      conteggio.set(p, (conteggio.get(p) || 0) + 1);
      if (!viste.has(p)) {
        viste.add(p);
        documenti.set(p, (documenti.get(p) || 0) + 1);
      }
    });
  });
  return [...conteggio.entries()]
    .map(([termine, occorrenze]) => ({ termine, occorrenze, documenti: documenti.get(termine) || 0 }))
    .filter(x => x.documenti >= minDocumenti)
    .sort((a, b) => b.documenti - a.documenti || b.occorrenze - a.occorrenze)
    .slice(0, max);
}

/** Escape HTML: da usare SEMPRE prima di iniettare testo dell'utente. */
export function esc (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Evidenzia in un testo (già passato da esc) le occorrenze dei termini dati.
 *  Confronta sulla forma normalizzata, così "Città" trova "citta". */
export function evidenzia (testo, termini) {
  const set = new Set((termini || []).map(t => normalizza(t)).filter(Boolean));
  if (!set.size) return esc(testo);
  // spezza mantenendo i separatori, così la punteggiatura non si perde
  return String(testo || '').split(/(\s+)/).map(pezzo => {
    if (/^\s+$/.test(pezzo)) return pezzo;
    const nudo = normalizza(pezzo);
    return set.has(nudo)
      ? `<mark class="term">${esc(pezzo)}</mark>`
      : esc(pezzo);
  }).join('');
}

/** Evidenzia una query di ricerca dentro un testo (sottostringa, non parola intera). */
export function evidenziaQuery (testo, query) {
  const q = normalizza(query);
  if (!q || q.length < 2) return esc(testo);
  const orig = String(testo || '');
  const norm = senzaAccenti(orig).toLowerCase();
  const idx = norm.indexOf(q);
  if (idx < 0) return esc(orig);
  return esc(orig.slice(0, idx)) +
         '<mark>' + esc(orig.slice(idx, idx + q.length)) + '</mark>' +
         esc(orig.slice(idx + q.length));
}

/** Ritaglia un estratto attorno alla prima occorrenza della query. */
export function estratto (testo, query, raggio = 60) {
  const orig = String(testo || '');
  const norm = senzaAccenti(orig).toLowerCase();
  const q = normalizza(query);
  const idx = q ? norm.indexOf(q) : -1;
  if (idx < 0) return orig.length > raggio * 2 ? orig.slice(0, raggio * 2) + '…' : orig;
  const da = Math.max(0, idx - raggio);
  const a = Math.min(orig.length, idx + q.length + raggio);
  return (da > 0 ? '…' : '') + orig.slice(da, a) + (a < orig.length ? '…' : '');
}

/* ------------------------------------------------- confronto di risposte -- */

/** Allineamento parola per parola fra la risposta data e quella attesa,
 *  con la sottosequenza comune più lunga. Serve al quiz per mostrare
 *  *dove* hai sbagliato, non solo che hai sbagliato.
 *  Ritorna [{tipo:'uguale'|'mancante'|'in-più', parola}] . */
export function diffParole (data, attesa) {
  const A = String(data || '').split(/\s+/).filter(Boolean);
  const B = String(attesa || '').split(/\s+/).filter(Boolean);
  const uguali = (a, b) => normalizza(a) === normalizza(b);

  // tabella della sottosequenza comune più lunga
  const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      L[i][j] = uguali(A[i], B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }

  const out = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (uguali(A[i], B[j])) { out.push({ tipo: 'uguale', parola: B[j] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ tipo: 'in-più', parola: A[i] }); i++; }
    else { out.push({ tipo: 'mancante', parola: B[j] }); j++; }
  }
  while (i < A.length) out.push({ tipo: 'in-più', parola: A[i++] });
  while (j < B.length) out.push({ tipo: 'mancante', parola: B[j++] });
  return out;
}

/** Il diff sopra, reso in HTML. */
export function diffHTML (data, attesa) {
  return diffParole(data, attesa).map(p => {
    if (p.tipo === 'uguale') return `<span class="diff-ok">${esc(p.parola)}</span>`;
    if (p.tipo === 'mancante') return `<span class="diff-manca">${esc(p.parola)}</span>`;
    return `<span class="diff-troppo">${esc(p.parola)}</span>`;
  }).join(' ');
}

/** Quanta parte delle parole portanti attese compare nella risposta.
 *  Usata solo come *suggerimento* nelle domande che ti autovaluti. */
export function coperturaLessicale (risposta, atteso) {
  const attese = new Set(paroleSignificative(atteso, 4));
  if (!attese.size) return 0;
  const date = new Set(paroleSignificative(risposta, 4));
  let trovate = 0;
  attese.forEach(p => { if (date.has(p)) trovate++; });
  return trovate / attese.size;
}

/** Iniziali di un titolo, per il segnaposto quando manca la copertina. */
export function iniziali (titolo) {
  const tutte = parole(titolo);
  // preferiamo le parole portanti, ma un titolo fatto solo di parole comuni
  // («Se questo è un uomo») deve comunque avere le sue iniziali
  const portanti = tutte.filter(x => !STOPWORDS.has(x));
  const p = portanti.length ? portanti : tutte;
  if (!p.length) return '·';
  return p.slice(0, 2).map(x => x[0].toUpperCase()).join('');
}
