/* =========================================================================
   router.js — instradamento sull'hash dell'URL
   L'hash (#/libro/xyz) è l'unica forma che funziona bene sia su GitHub Pages
   in una sottocartella sia in modalità "app installata", dove non c'è un
   server che possa riscrivere i percorsi.
   ========================================================================= */

const rotte = [];
let inCorso = null;

/** Registra una rotta: '/libro/:id' → handler({id}). */
export function registra (schema, gestore) {
  const nomi = [];
  const regex = new RegExp('^' + schema
    .replace(/\/:([A-Za-z0-9_]+)/g, (_, n) => { nomi.push(n); return '/([^/]+)'; })
    .replace(/\*/g, '.*') + '$');
  rotte.push({ regex, nomi, gestore, schema });
}

export function vaiA (percorso, { sostituisci = false } = {}) {
  const nuovo = '#' + (percorso.startsWith('/') ? percorso : '/' + percorso);
  if (location.hash === nuovo) { risolvi(); return; }
  if (sostituisci) history.replaceState(null, '', nuovo);
  else location.hash = nuovo;
}

export function indietro () {
  if (history.length > 1) history.back();
  else vaiA('/libreria');
}

export function percorsoCorrente () {
  const h = location.hash.replace(/^#/, '');
  return h || '/libreria';
}

/** Trova la rotta e la esegue. Le chiamate concorrenti vengono scartate:
 *  se l'utente naviga due volte in fretta, vince l'ultima. */
export async function risolvi () {
  const percorso = percorsoCorrente();
  const [base, queryStr] = percorso.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryStr || ''));

  for (const r of rotte) {
    const m = base.match(r.regex);
    if (!m) continue;
    const parametri = { query, percorso: base };
    r.nomi.forEach((n, i) => { parametri[n] = decodeURIComponent(m[i + 1]); });
    const mio = Symbol('navigazione');
    inCorso = mio;
    try {
      await r.gestore(parametri, () => inCorso === mio);
    } catch (e) {
      console.error('Errore nella rotta', base, e);
      throw e;
    }
    return;
  }
  // nessuna corrispondenza: torniamo alla libreria
  vaiA('/libreria', { sostituisci: true });
}

export function avvia () {
  window.addEventListener('hashchange', () => risolvi());
  if (!location.hash) history.replaceState(null, '', '#/libreria');
  return risolvi();
}
