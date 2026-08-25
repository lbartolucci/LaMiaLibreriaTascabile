/* =========================================================================
   onedrive.js — livello 2 (facoltativo): sincronizzazione diretta
   L'app scrive un solo file dentro la SUA cartella su OneDrive, non vede
   nient'altro del tuo disco: il permesso richiesto è Files.ReadWrite.AppFolder,
   il più stretto che Microsoft offra.

   Perché non MSAL.js. Il prompt lo suggeriva, ma MSAL è una libreria da
   qualche centinaio di kilobyte da caricare da un CDN esterno: incompatibile
   con un'app che deve funzionare offline, senza build e senza dipendenze.
   Il flusso che ci serve è uno solo — authorization code + PKCE, uno scope —
   ed è standard OAuth 2.0: qui sotto sono un centinaio di righe, tutte
   leggibili. Se un giorno servisse il multi-account, MSAL avrebbe senso.

   ⚠ Questa parte non ho potuto collaudarla: richiede una registrazione su
   Azure e un account Microsoft veri. Il resto dell'app non dipende da qui.
   ========================================================================= */

import * as db from './db.js';
import { impostazioni } from './db.js';

const AUTORITA = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPI = 'Files.ReadWrite.AppFolder offline_access openid profile';
const NOME_REMOTO = 'libreria.json';

export class ErroreOneDrive extends Error {
  constructor (messaggio, dettaglio) { super(messaggio); this.name = 'ErroreOneDrive'; this.dettaglio = dettaglio; }
}
export class ConflittoRemoto extends Error {
  constructor (remoto) {
    super('Il file su OneDrive è cambiato dopo l\'ultima sincronizzazione.');
    this.name = 'ConflittoRemoto';
    this.remoto = remoto;
  }
}

/* --------------------------------------------------------- configurazione */

/** L'indirizzo a cui Microsoft rimanda dopo il consenso. Deve combaciare
 *  *esattamente* con quello registrato su Azure. Niente hash: la parte dopo
 *  il # non arriva mai al server e Azure non la accetta. */
export function indirizzoRitorno () {
  return location.origin + location.pathname;
}

export async function configurato () {
  return !!(await impostazioni()).clientIdOneDrive;
}

async function clientId () {
  const id = (await impostazioni()).clientIdOneDrive;
  if (!id) throw new ErroreOneDrive('Manca il Client ID: incollalo in Impostazioni.');
  return id;
}

/* --------------------------------------------------------------- gettoni */

async function gettoni () { return (await db.leggi('meta', 'oneDrive')) || null; }

async function salvaGettoni (valore) {
  await db.scrivi('meta', { chiave: 'oneDrive', ...valore });
}

export async function connesso () {
  const g = await gettoni();
  return !!(g && (g.refreshToken || (g.accessToken && g.scadenza > Date.now())));
}

export async function disconnetti () {
  await db.cancella('meta', 'oneDrive').catch(() => {});
}

/* ------------------------------------------------------------- PKCE ----- */

function casuale (lunghezza = 64) {
  const b = new Uint8Array(lunghezza);
  crypto.getRandomValues(b);
  return base64url(b);
}

function base64url (byte) {
  return btoa(String.fromCharCode(...byte)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sfida (verificatore) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificatore));
  return base64url(new Uint8Array(digest));
}

/* ------------------------------------------------------------ accesso --- */

/** Manda l'utente da Microsoft. Al ritorno la pagina si ricarica con
 *  ?code=… e completaAccesso() finisce il lavoro. */
export async function accedi () {
  const id = await clientId();
  const verificatore = casuale();
  const stato = casuale(16);
  sessionStorage.setItem('onedrive-verificatore', verificatore);
  sessionStorage.setItem('onedrive-stato', stato);
  sessionStorage.setItem('onedrive-ritorno', location.hash || '#/impostazioni');

  const url = new URL(`${AUTORITA}/authorize`);
  url.searchParams.set('client_id', id);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', indirizzoRitorno());
  url.searchParams.set('scope', SCOPI);
  url.searchParams.set('code_challenge', await sfida(verificatore));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', stato);
  url.searchParams.set('prompt', 'select_account');
  location.assign(url.toString());
}

/** Da chiamare all'avvio: se l'indirizzo porta un ?code=, lo scambia con i
 *  gettoni e ripulisce la barra degli indirizzi. Ritorna true se ha lavorato. */
export async function completaAccesso () {
  const q = new URLSearchParams(location.search);
  const codice = q.get('code');
  const errore = q.get('error');
  if (!codice && !errore) return false;

  const ritorno = sessionStorage.getItem('onedrive-ritorno') || '#/impostazioni';
  const pulisci = () => history.replaceState(null, '', location.pathname + ritorno);

  if (errore) {
    pulisci();
    throw new ErroreOneDrive(
      q.get('error_description') || 'Microsoft ha rifiutato l\'accesso.', errore);
  }
  if (q.get('state') !== sessionStorage.getItem('onedrive-stato')) {
    pulisci();
    throw new ErroreOneDrive('La risposta di Microsoft non corrisponde alla richiesta: accesso annullato per sicurezza.');
  }

  const verificatore = sessionStorage.getItem('onedrive-verificatore');
  sessionStorage.removeItem('onedrive-verificatore');
  sessionStorage.removeItem('onedrive-stato');

  try {
    await scambia({
      grant_type: 'authorization_code',
      code: codice,
      redirect_uri: indirizzoRitorno(),
      code_verifier: verificatore
    });
  } finally {
    pulisci();
  }
  return true;
}

async function scambia (parametri) {
  const id = await clientId();
  const corpo = new URLSearchParams({ client_id: id, scope: SCOPI, ...parametri });
  const risposta = await fetch(`${AUTORITA}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString()
  });
  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    throw new ErroreOneDrive(
      dati.error_description || 'Microsoft non ha rilasciato l\'autorizzazione.', dati.error);
  }
  const precedenti = (await gettoni()) || {};
  await salvaGettoni({
    ...precedenti,
    accessToken: dati.access_token,
    refreshToken: dati.refresh_token || precedenti.refreshToken,
    scadenza: Date.now() + (dati.expires_in || 3600) * 1000 - 60000
  });
  return dati;
}

async function gettoneValido () {
  const g = await gettoni();
  if (!g) throw new ErroreOneDrive('Non sei collegato a OneDrive.');
  if (g.accessToken && g.scadenza > Date.now()) return g.accessToken;
  if (!g.refreshToken) throw new ErroreOneDrive('L\'autorizzazione è scaduta: ricollega OneDrive.');
  const dati = await scambia({ grant_type: 'refresh_token', refresh_token: g.refreshToken });
  return dati.access_token;
}

/* -------------------------------------------------------------- Graph --- */

async function graph (percorso, opzioni = {}) {
  const gettone = await gettoneValido();
  const risposta = await fetch(GRAPH + percorso, {
    ...opzioni,
    headers: { Authorization: 'Bearer ' + gettone, ...(opzioni.headers || {}) }
  });
  if (risposta.status === 404) return null;
  if (!risposta.ok) {
    const testo = await risposta.text().catch(() => '');
    throw new ErroreOneDrive(`OneDrive ha risposto con un errore (${risposta.status}).`, testo.slice(0, 200));
  }
  return risposta;
}

export async function chiSono () {
  const r = await graph('/me');
  if (!r) return null;
  const d = await r.json();
  return { nome: d.displayName, email: d.userPrincipalName || d.mail };
}

/** Metadati del file remoto: null se non esiste ancora. */
export async function statoRemoto () {
  const r = await graph(`/me/drive/special/approot:/${NOME_REMOTO}`);
  if (!r) return null;
  const d = await r.json();
  return { modificatoIl: d.lastModifiedDateTime, dimensione: d.size, id: d.id };
}

export async function scarica () {
  const r = await graph(`/me/drive/special/approot:/${NOME_REMOTO}:/content`);
  if (!r) return null;
  return r.text();
}

/** Scrive il file. Se il remoto è cambiato dopo l'ultima sincronizzazione
 *  che conosciamo, non sovrascrive: solleva ConflittoRemoto e lascia
 *  decidere a te. */
export async function carica (testo, { forza = false } = {}) {
  const remoto = await statoRemoto();
  const g = (await gettoni()) || {};
  if (!forza && remoto && g.ultimoRemotoNoto && remoto.modificatoIl !== g.ultimoRemotoNoto) {
    throw new ConflittoRemoto(remoto);
  }
  const r = await graph(`/me/drive/special/approot:/${NOME_REMOTO}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: testo
  });
  const d = await r.json();
  await salvaGettoni({ ...(await gettoni()), ultimoRemotoNoto: d.lastModifiedDateTime });
  return { modificatoIl: d.lastModifiedDateTime, dimensione: d.size };
}

/** Dopo aver letto e fuso il remoto, registriamo la sua versione: serve al
 *  controllo del conflitto della volta dopo. */
export async function segnaRemotoLetto (modificatoIl) {
  await salvaGettoni({ ...(await gettoni()), ultimoRemotoNoto: modificatoIl });
}
