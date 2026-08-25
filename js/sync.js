/* =========================================================================
   sync.js — sincronizzazione cloud opzionale con Supabase (local-first,
   senza build).

   Scelte (documentate in SUPABASE_SETUP.md):
   · Niente bundler / niente import da CDN: parliamo con Supabase via le sue
     API REST/Auth con fetch, così l'app resta senza dipendenze e offline-first
     (il service worker continua a mettere in cache gli stessi file statici).
   · Auth: email + password (la più semplice e robusta per una PWA statica —
     nessun redirect da gestire). La sessione (access + refresh token) è
     salvata in locale e rinnovata da sola.
   · Modello dati: un'unica tabella `records(user_id, app, collection,
     record_id, data jsonb, updated_at, deleted)` con row-level security che
     isola ogni utente. SQL in SUPABASE_SETUP.md.
   · Merge: LOCAL-FIRST, per record, LAST-WRITE-WINS su `updated_at`. Mai una
     sovrascrittura in blocco. Le cancellazioni si propagano come tombstone
     (soft-delete). Modifiche/eliminazioni locali sono rilevate confrontando
     con uno snapshot dell'ultimo stato riconciliato, così non serve agganciare
     ogni punto di cancellazione.

   La anon key incollata dall'utente è PUBBLICA e si può salvare sul dispositivo
   senza rischi: con la RLS è inutile senza un utente autenticato, e ogni riga è
   legata ad auth.uid(). Qui non si usano mai chiavi segrete.
   ========================================================================= */

import * as db from './db.js';
import * as store from './store.js';

const APP = 'libreria-tascabile';
const COLLECTIONS = ['libri', 'citazioni', 'collegamenti', 'collegamentiCitazione', 'sessioni', 'desideri', 'scartati'];
// Cursore iniziale di pull: strettamente SOTTO ogni timestamp (il pull usa gt.).
const EPOCH = '1970-01-01T00:00:00.000Z';
// Sentinella stabile per i record senza timestamp usabile (record vecchi o
// importati da JSON). È 1 ms dopo EPOCH, così questi record vengono comunque
// caricati E restituiti dal pull gt.EPOCH di un altro dispositivo. Essendo
// stabile (non now()), non viene ri-pushata a ogni sync.
const MIN_TS = '1970-01-01T00:00:00.001Z';

/* adattatori al db locale (nomi italiani) */
const dbAll = s => db.tutti(s);
const dbGet = (s, id) => db.leggi(s, id);
const dbPut = (s, r) => db.scrivi(s, r);
const dbDel = (s, id) => db.cancella(s, id);

/* ------------------------------------------------------- stato persistente */

let config = { url: '', anonKey: '' };
let session = null;
let syncState = { cursor: EPOCH, snapshot: {}, tombstones: {} };

export async function loadPersisted () {
  config = (await metaGet('sync.config')) || config;
  session = (await metaGet('sync.session')) || null;
  syncState = (await metaGet('sync.state')) || syncState;
  syncState.snapshot = syncState.snapshot || {};
  syncState.tombstones = syncState.tombstones || {};
  return { config, session, syncState };
}
const metaGet = async k => { const r = await dbGet('meta', k); return r ? r.valore : null; };
const metaPut = (k, v) => dbPut('meta', { chiave: k, valore: v });
const saveConfig = () => metaPut('sync.config', config);
const saveSession = () => metaPut('sync.session', session);
const saveState = () => metaPut('sync.state', syncState);

/* --------------------------------------------------------------- status - */

const listeners = new Set();
const status = { state: 'idle', lastSync: null, error: '', email: '' };
export function onStatus (fn) { listeners.add(fn); fn(status); return () => listeners.delete(fn); }
function setStatus (patch) { Object.assign(status, patch); listeners.forEach(fn => { try { fn(status); } catch (_) {} }); }

export function getConfig () { return { ...config }; }
export function isConfigured () { return !!(config.url && config.anonKey); }
export function currentUser () { return session && session.user ? session.user : null; }

export async function setConfig ({ url, anonKey }) {
  config = { url: (url || '').trim().replace(/\/$/, ''), anonKey: (anonKey || '').trim() };
  await saveConfig();
  setStatus({ state: isConfigured() ? (currentUser() ? 'idle' : 'logged-out') : 'not-configured', error: '' });
}

/* ------------------------------------------------------- HTTP primitives - */

async function http (path, { method = 'GET', body = null, auth = false, prefer = '', headers = {} } = {}) {
  if (!isConfigured()) throw new Error('La sincronizzazione non è configurata.');
  const h = { apikey: config.anonKey, 'Content-Type': 'application/json', ...headers };
  if (auth) { if (!session) throw new Error('Non hai effettuato l\'accesso.'); h.Authorization = 'Bearer ' + session.access_token; }
  if (prefer) h.Prefer = prefer;
  const res = await fetch(config.url + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error || data.hint)) || ('HTTP ' + res.status);
    const err = new Error(msg); err.status = res.status; err.data = data; throw err;
  }
  return data;
}

function adoptSession (d) {
  if (!d || !d.access_token) return false;
  const expiresAt = d.expires_at ? d.expires_at : Math.floor(Date.now() / 1000) + (d.expires_in || 3600);
  session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: expiresAt, user: d.user ? { id: d.user.id, email: d.user.email } : (session && session.user) };
  return true;
}

/* --------------------------------------------------------------- auth --- */

export async function signUp (email, password) {
  const d = await http('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (!adoptSession(d)) {
    throw new Error('Account creato, ma il progetto richiede la conferma via email. Conferma dalla mail e poi accedi — oppure disattiva "Confirm email" in Supabase → Authentication → Providers → Email.');
  }
  await saveSession(); setStatus({ state: 'idle', email: session.user.email, error: '' });
  return session.user;
}

export async function signIn (email, password) {
  const d = await http('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  if (!adoptSession(d)) throw new Error('Accesso non riuscito.');
  await saveSession(); setStatus({ state: 'idle', email: session.user.email, error: '' });
  return session.user;
}

export async function signOut () {
  try { if (session) await http('/auth/v1/logout', { method: 'POST', auth: true }); } catch (_) {}
  session = null; await saveSession();
  setStatus({ state: 'logged-out', email: '' });
}

async function ensureSession () {
  if (!session) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - now > 60) return session;
  try {
    const d = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
    if (adoptSession(d)) { await saveSession(); return session; }
  } catch (e) { /* fallthrough */ }
  session = null; await saveSession();
  setStatus({ state: 'logged-out', email: '' });
  return null;
}

/* ------------------------------------------------------- record adapter - */

function isoOf (rec) {
  const v = rec && (rec.updatedAt || rec.createdAt || rec.aggiuntoIl || rec.scartatoIl || rec.data || rec.at);
  const n = v ? Date.parse(v) : 0;
  return (Number.isFinite(n) && n > 0) ? new Date(n).toISOString() : MIN_TS;
}
const tsMs = rec => Date.parse(isoOf(rec));
function hasTs (rec) { const v = rec && (rec.updatedAt || rec.createdAt || rec.aggiuntoIl || rec.scartatoIl || rec.data || rec.at); return !!(v && Date.parse(v) > 0); }

/** Assegna un `updatedAt` reale (persistito) a ogni record locale privo di un
 *  timestamp usabile. Copre i record vecchi e i dati importati da JSON: senza,
 *  un record senza timestamp sembrerebbe "nel passato" e non arriverebbe agli
 *  altri dispositivi col pull incrementale (updated_at > cursor). Gira una volta
 *  per record; poi ha un timestamp reale e viene saltato. Trattare il momento
 *  del primo sync come "adesso" fa anche vincere i dati appena importati. */
async function normalizeTimestamps () {
  for (const c of COLLECTIONS) {
    const rows = await dbAll(c);
    for (const rec of rows) {
      if (rec && rec.id != null && !hasTs(rec)) { rec.updatedAt = new Date().toISOString(); await dbPut(c, rec); }
    }
  }
}

const snap = c => (syncState.snapshot[c] = syncState.snapshot[c] || {});
const tomb = c => (syncState.tombstones[c] = syncState.tombstones[c] || {});

/* --------------------------------------------------------------- engine - */

let running = false, pending = false;

export async function syncNow ({ silent = false } = {}) {
  if (!isConfigured()) { setStatus({ state: 'not-configured' }); return { ok: false, reason: 'not-configured' }; }
  if (navigator.onLine === false) { setStatus({ state: 'offline' }); return { ok: false, reason: 'offline' }; }
  const s = await ensureSession();
  if (!s) { setStatus({ state: 'logged-out' }); return { ok: false, reason: 'logged-out' }; }
  if (running) { pending = true; return { ok: false, reason: 'busy' }; }
  running = true;
  setStatus({ state: 'syncing', error: '' });
  let changedLocal = false;
  try {
    // 0. garantisci un timestamp reale a ogni record locale
    await normalizeTimestamps();

    // 1. PULL
    let cursor = syncState.cursor || EPOCH;
    let guard = 0;
    while (guard++ < 50) {
      const rows = await http(`/rest/v1/records?app=eq.${APP}&updated_at=gt.${encodeURIComponent(cursor)}&order=updated_at.asc&limit=1000`, { auth: true });
      if (!rows || !rows.length) break;
      for (const r of rows) { if (await mergeRemote(r)) changedLocal = true; }
      cursor = rows[rows.length - 1].updated_at;
      syncState.cursor = cursor;
      if (rows.length < 1000) break;
    }

    // 2. local changes + deletes → upserts
    const upserts = [];
    const now = new Date().toISOString();
    for (const c of COLLECTIONS) {
      const rows = await dbAll(c);
      const present = new Set();
      for (const rec of rows) {
        const id = rec.id; if (id == null) continue; present.add(id);
        const iso = isoOf(rec);
        const known = snap(c)[id];
        if (known == null || Date.parse(known) !== Date.parse(iso)) upserts.push(rowFor(c, id, rec, iso, false));
      }
      for (const id of Object.keys(snap(c))) {
        if (present.has(id)) continue;
        if (tomb(c)[id]) continue;
        upserts.push(rowFor(c, id, {}, now, true));
        tomb(c)[id] = now; delete snap(c)[id];
      }
    }

    // 3. PUSH
    if (upserts.length) {
      await http(`/rest/v1/records?on_conflict=user_id,app,collection,record_id`, {
        method: 'POST', auth: true, prefer: 'resolution=merge-duplicates,return=minimal', body: upserts
      });
      for (const u of upserts) {
        if (u.deleted) { tomb(u.collection)[u.record_id] = u.updated_at; delete snap(u.collection)[u.record_id]; }
        else snap(u.collection)[u.record_id] = u.updated_at;
      }
    }

    await saveState();
    if (changedLocal) await store.carica();
    setStatus({ state: 'synced', lastSync: Date.now(), error: '', email: session.user.email });
    return { ok: true, pulledChanged: changedLocal, pushed: upserts.length };
  } catch (e) {
    console.error('Sync error', e);
    setStatus({ state: 'error', error: e.message || String(e) });
    return { ok: false, reason: 'error', error: e.message };
  } finally {
    running = false;
    if (pending) { pending = false; setTimeout(() => syncNow({ silent: true }), 300); }
  }
}

function rowFor (collection, record_id, data, updated_at, deleted) {
  return { user_id: session.user.id, app: APP, collection, record_id, data, updated_at, deleted };
}

async function mergeRemote (r) {
  const c = r.collection, id = r.record_id, rMs = Date.parse(r.updated_at);
  if (!COLLECTIONS.includes(c)) return false;
  const local = await dbGet(c, id);
  const localMs = local ? tsMs(local) : (tomb(c)[id] ? Date.parse(tomb(c)[id]) : null);
  if (r.deleted) {
    if (localMs == null || rMs >= localMs) {
      if (local) await dbDel(c, id);
      tomb(c)[id] = r.updated_at; delete snap(c)[id];
      return !!local;
    }
  } else {
    if (!local || rMs >= localMs) {
      await dbPut(c, r.data);
      snap(c)[id] = r.updated_at; delete tomb(c)[id];
      return true;
    }
  }
  return false;
}

/* ---------------------------------------------------------- auto-sync --- */

let debounce = null;
export function scheduleAutoSync (delay = 1500) {
  if (!isConfigured() || !currentUser()) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => { syncNow({ silent: true }); }, delay);
}

let wired = false;
export function initAutoSync () {
  if (wired) return; wired = true;
  window.addEventListener('online', () => { setStatus({ state: 'idle' }); scheduleAutoSync(400); });
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  store.osserva((type) => {
    if (typeof type === 'string' && /libro|citazione|collegamento|sessione|desiderio|scartato/.test(type)) scheduleAutoSync();
  });
  if (isConfigured() && currentUser()) { setStatus({ email: currentUser().email }); scheduleAutoSync(1200); }
  else if (isConfigured()) setStatus({ state: 'logged-out' });
  else setStatus({ state: 'not-configured' });
}
