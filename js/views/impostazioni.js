/* =========================================================================
   impostazioni.js — aspetto, dati, backup, sincronizzazione, dati di prova
   ========================================================================= */

import { qs, qsa, delega, avviso, conferma, foglio, dataBreve, plurale, el } from '../ui.js';
import { esc } from '../utils/text.js';
import * as store from '../store.js';
import * as db from '../db.js';
import * as sync from '../sync.js';
import { applicaTema } from '../main.js';
import { caricaDatiDimostrativi, togliDatiDimostrativi, contaDatiDimostrativi } from '../demo.js';
import { vaiA } from '../router.js';
import * as backup from '../backup.js';
import { dimenticaCaroselli } from '../suggerimenti.js';

export default async function vistaImpostazioni () {
  const imp = store.stato.impostazioni;
  const spazio = await stimaSpazio();
  const collegato = await backup.fileCollegato().catch(() => null);
  const giorni = backup.giorniDallUltimoBackup();
  const oneDrive = await statoOneDrive();

  return {
    titolo: 'Impostazioni',
    titoloTesto: 'Impostazioni',
    html: `
      <section class="sezione" style="margin-top:8px">
        <div class="sezione__testa"><h2>Aspetto</h2></div>
        <div class="campo">
          <label for="sel-tema">Tema</label>
          <select id="sel-tema">
            <option value="auto" ${imp.tema === 'auto' ? 'selected' : ''}>Come il sistema</option>
            <option value="chiaro" ${imp.tema === 'chiaro' ? 'selected' : ''}>Sempre chiaro</option>
            <option value="scuro" ${imp.tema === 'scuro' ? 'selected' : ''}>Sempre scuro</option>
          </select>
        </div>
      </section>

      <section class="sezione">
        <div class="sezione__testa"><h2>Sincronizzazione cloud <span id="sync-badge" style="font-size:12px;font-weight:600;opacity:.7">off</span></h2></div>
        <p class="testo-guida">Facoltativa. Accedi con lo stesso account su più dispositivi per tenere allineati libri, citazioni e collegamenti. I dati restano anche in locale: la sync è additiva e funziona offline. Il merge è per record, l'ultima modifica vince — niente sovrascritture in blocco. Configurala seguendo <b>SUPABASE_SETUP.md</b>.</p>
        <div id="sync-body-lm"></div>
      </section>

      <section class="sezione">
        <div class="sezione__testa"><h2>I tuoi dati</h2></div>
        <div class="pannello">
          <div class="riga-dato"><dt>Libri</dt><dd>${store.stato.libri.length}</dd></div>
          <div class="riga-dato"><dt>Citazioni</dt><dd>${store.stato.citazioni.length}</dd></div>
          <div class="riga-dato"><dt>Collegamenti</dt><dd>${store.stato.collegamenti.length}</dd></div>
          <div class="riga-dato"><dt>Sessioni di studio</dt><dd>${store.stato.sessioni.length}</dd></div>
          <div class="riga-dato"><dt>Spazio occupato</dt><dd>${spazio}</dd></div>
          <div class="riga-dato"><dt>Ultimo backup</dt>
            <dd class="${backup.serveIlPromemoria() ? 'dato-allarme' : ''}">${
              giorni === null ? 'mai' : giorni === 0 ? 'oggi' : `${plurale(giorni, 'giorno fa', 'giorni fa')}`
            }</dd></div>
        </div>
      </section>

      <section class="sezione">
        <div class="sezione__testa"><h2>Backup su file</h2></div>
        <p class="testo-guida">Un solo file con tutto: libri, citazioni, collegamenti, sessioni, desideri e copertine. È la rete di sicurezza che funziona ovunque, anche senza configurare niente.</p>

        ${collegato ? `
          <div class="pannello pannello--piatto" style="display:flex;gap:10px;align-items:center;justify-content:space-between">
            <div>
              <strong>${esc(collegato.nome)}</strong>
              <div class="minuscolo">File collegato: salvi con un tocco, senza scegliere di nuovo il percorso.</div>
            </div>
            <button class="btn-icona" id="btn-scollega" aria-label="Scollega il file">✕</button>
          </div>
          <button class="btn btn--largo btn--pieno" id="btn-salva-collegato" style="margin-bottom:8px">Salva su «${esc(collegato.nome)}»</button>
        ` : ''}

        <button class="btn btn--largo ${collegato ? '' : 'btn--pieno'}" id="btn-export" style="margin-bottom:8px">Esporta un file JSON</button>
        ${!collegato && backup.fileCollegabile() ? `
          <button class="btn btn--largo btn--fantasma" id="btn-collega" style="margin-bottom:8px">Collega un file (una volta sola)</button>
          <p class="campo__aiuto">Scegli un file dentro la cartella di OneDrive sincronizzata sul computer: da lì in poi basta un tocco per riscriverlo.</p>` : ''}
        <button class="btn btn--largo" id="btn-import" style="margin-bottom:8px">Importa da un file</button>
        <input type="file" id="file-import" accept="application/json,.json" hidden>

        <div class="chips" style="flex-wrap:wrap;overflow:visible;margin-top:6px">
          <button class="chip" id="btn-csv">CSV dei libri</button>
          <button class="chip" id="btn-md">Markdown delle citazioni</button>
        </div>
      </section>

      <section class="sezione">
        <div class="sezione__testa"><h2>Sincronizzazione con OneDrive</h2></div>
        <p class="testo-guida">Facoltativa. L'app scrive un unico file dentro una cartella tutta sua su OneDrive: non vede nient'altro del tuo disco. Senza questa parte l'app funziona esattamente come prima.</p>

        <div class="campo">
          <label for="in-client-id">Client ID dell'applicazione Azure</label>
          <input type="text" id="in-client-id" value="${esc(imp.clientIdOneDrive)}"
                 placeholder="00000000-0000-0000-0000-000000000000" autocomplete="off" spellcheck="false">
          <p class="campo__aiuto">Le istruzioni per ottenerlo sono in <strong>AZURE.md</strong>, accanto ai file dell'app. Ci vogliono cinque minuti e si fa una volta sola.</p>
        </div>

        ${imp.clientIdOneDrive ? `
          <div class="pannello pannello--piatto">
            <div class="riga-dato"><dt>Stato</dt><dd>${oneDrive.connesso ? 'collegato' : 'non collegato'}</dd></div>
            ${oneDrive.account ? `<div class="riga-dato"><dt>Account</dt><dd>${esc(oneDrive.account)}</dd></div>` : ''}
            ${oneDrive.remoto ? `<div class="riga-dato"><dt>File remoto</dt><dd>${dataBreve(oneDrive.remoto.modificatoIl)}</dd></div>` : ''}
          </div>
          ${oneDrive.connesso ? `
            <button class="btn btn--largo btn--pieno" id="btn-od-carica" style="margin-bottom:8px">Manda su OneDrive</button>
            <button class="btn btn--largo" id="btn-od-scarica" style="margin-bottom:8px">Prendi da OneDrive</button>
            <button class="btn btn--largo btn--fantasma" id="btn-od-esci">Scollega l'account</button>
          ` : `<button class="btn btn--largo btn--pieno" id="btn-od-accedi">Collega OneDrive</button>`}
        ` : ''}
        <p class="campo__aiuto">Nota onesta: questa parte non ho potuto provarla, perché richiede una registrazione su Azure e un account Microsoft veri. Se qualcosa non torna, dimmelo e la sistemo.</p>
      </section>

      <section class="sezione">
        <div class="sezione__testa"><h2>Dati dimostrativi</h2></div>
        <p class="testo-guida">Cinque libri veri con citazioni, temi e collegamenti, per vedere subito com'è l'app piena. Non toccano i tuoi.</p>
        ${contaDatiDimostrativi()
          ? '<button class="btn btn--largo btn--fantasma" id="btn-demo-via">Togli i dati dimostrativi</button>'
          : '<button class="btn btn--largo btn--fantasma" id="btn-demo">Carica i dati dimostrativi</button>'}
      </section>

      <section class="sezione">
        <div class="sezione__testa"><h2>Cataloghi</h2></div>
        <div class="campo">
          <label for="in-chiave-google">Chiave API di Google Books (facoltativa)</label>
          <input type="text" id="in-chiave-google" value="${esc(imp.googleBooksApiKey)}" placeholder="lasciala vuota se non serve" autocomplete="off">
          <p class="campo__aiuto">Serve solo se la ricerca comincia a rispondere «troppe richieste». Open Library resta la fonte principale e non chiede chiavi.</p>
        </div>
        <button class="btn btn--largo btn--fantasma" id="btn-svuota-cache" style="margin-bottom:8px">Svuota la cache dei cataloghi</button>
        <button class="btn btn--largo btn--fantasma" id="btn-riprendi-scartati">Ripesca i suggerimenti scartati</button>
      </section>

      <section class="sezione">
        <div class="sezione__testa"><h2>Zona pericolosa</h2></div>
        <button class="btn btn--largo btn--pericolo" id="btn-azzera">Cancella tutti i dati</button>
      </section>

      <section class="sezione">
        <div class="sezione__testa"><h2>L'app</h2></div>
        <div class="pannello pannello--piatto">
          <div class="riga-dato"><dt>Versione</dt><dd>1.3 · fasi 1-4</dd></div>
          <div class="riga-dato"><dt>Modalità</dt><dd>${matchMedia('(display-mode: standalone)').matches ? 'installata' : 'nel browser'}</dd></div>
          <div class="riga-dato"><dt>Connessione</dt><dd>${navigator.onLine ? 'in linea' : 'offline'}</dd></div>
        </div>
        <p class="campo__aiuto">Libreria, citazioni dettabili a voce, collegamenti e grafo; Studio con dodici tipi di domanda e ripasso dilazionato; Esplora con i suggerimenti; backup su file e su OneDrive.</p>
      </section>`,
    dopo: collega
  };
}

async function statoOneDrive () {
  const imp = store.stato.impostazioni;
  if (!imp.clientIdOneDrive) return { connesso: false };
  try {
    const od = await import('../onedrive.js');
    const connesso = await od.connesso();
    if (!connesso) return { connesso: false };
    const [account, remoto] = await Promise.all([
      od.chiSono().catch(() => null),
      od.statoRemoto().catch(() => null)
    ]);
    return { connesso, account: account ? (account.email || account.nome) : '', remoto };
  } catch (_) {
    return { connesso: false };
  }
}

/* ------------------------------------------------------------ azioni ---- */

let lmSyncUnsub = null;

function collegaSync (radice) {
  const body = qs('#sync-body-lm', radice);
  const badge = qs('#sync-badge', radice);
  if (!body) return;
  const ETICHETTA = { idle: 'pronto', syncing: 'sincronizzo…', synced: 'sincronizzato', offline: 'offline', error: 'errore', 'logged-out': 'non connesso', 'not-configured': 'da configurare' };

  function render () {
    const cfg = sync.getConfig();
    const user = sync.currentUser();
    if (!sync.isConfigured()) {
      body.innerHTML = `
        <div class="campo"><label for="sy-url">Project URL di Supabase</label><input type="url" id="sy-url" placeholder="https://xxxx.supabase.co" value="${esc(cfg.url)}"></div>
        <div class="campo"><label for="sy-key">anon public key <span style="font-weight:400;opacity:.7">(pubblica — si può salvare, protetta dalla RLS)</span></label><input type="text" id="sy-key" placeholder="eyJ… (anon public)" value="${esc(cfg.anonKey)}"></div>
        <button class="btn btn--largo btn--pieno" id="sy-save-cfg">Salva connessione</button>`;
    } else if (!user) {
      body.innerHTML = `
        <p class="campo__aiuto">Connesso a <b>${esc(cfg.url)}</b>. <button class="btn btn--fantasma" id="sy-edit-cfg" style="padding:2px 8px">cambia</button></p>
        <div class="campo"><label for="sy-email">Email</label><input type="text" id="sy-email" placeholder="tu@esempio.it" autocomplete="username"></div>
        <div class="campo"><label for="sy-pass">Password</label><input type="password" id="sy-pass" placeholder="••••••••" autocomplete="current-password"></div>
        <button class="btn btn--largo btn--pieno" id="sy-login" style="margin-bottom:8px">Accedi</button>
        <button class="btn btn--largo btn--fantasma" id="sy-signup">Crea account</button>`;
    } else {
      body.innerHTML = `
        <p class="campo__aiuto">Accesso come <b>${esc(user.email || 'utente')}</b>.</p>
        <button class="btn btn--largo btn--pieno" id="sy-now" style="margin-bottom:8px">Sincronizza ora</button>
        <button class="btn btn--largo btn--fantasma" id="sy-logout">Esci</button>`;
    }
    wire();
  }

  function wire () {
    const el = id => qs('#' + id, body);
    const on = (id, fn) => { const n = el(id); if (n) n.addEventListener('click', fn); };
    on('sy-save-cfg', async () => { await sync.setConfig({ url: el('sy-url').value, anonKey: el('sy-key').value }); avviso('Connessione salvata.', 'ok'); render(); });
    on('sy-edit-cfg', async () => { await sync.setConfig({ url: '', anonKey: '' }); render(); });
    const auth = async (kind, btnId) => {
      const email = el('sy-email').value.trim(); const pass = el('sy-pass').value;
      if (!email || !pass) { avviso('Inserisci email e password.', 'errore'); return; }
      const b = el(btnId); b.disabled = true;
      try { if (kind === 'signup') await sync.signUp(email, pass); else await sync.signIn(email, pass); avviso('Accesso eseguito. Sincronizzo…', 'ok'); render(); await sync.syncNow(); }
      catch (e) { avviso(e.message || 'Accesso non riuscito.', 'errore', 6000); if (b) b.disabled = false; }
    };
    on('sy-login', () => auth('login', 'sy-login'));
    on('sy-signup', () => auth('signup', 'sy-signup'));
    on('sy-now', async () => {
      const r = await sync.syncNow();
      if (r.ok) avviso(`Sincronizzato. ${r.pushed || 0} inviati${r.pulledChanged ? ', modifiche scaricate' : ''}.`, 'ok');
      else if (r.reason === 'offline') avviso('Offline — sincronizzerò appena torna la rete.', 'info');
      else if (r.error) avviso('Errore sync: ' + r.error, 'errore', 6000);
    });
    on('sy-logout', async () => { await sync.signOut(); render(); avviso('Uscito.'); });
  }

  if (lmSyncUnsub) { try { lmSyncUnsub(); } catch (_) {} }
  lmSyncUnsub = sync.onStatus(st => {
    if (badge) { badge.textContent = ETICHETTA[st.state] || st.state; badge.style.opacity = st.state === 'synced' ? '1' : '.7'; }
    const now = qs('#sy-now', body);
    if (now) now.textContent = st.state === 'syncing' ? 'Sincronizzo…' : (st.lastSync ? 'Sincronizza ora · ' + new Date(st.lastSync).toLocaleTimeString() : 'Sincronizza ora');
  });
  render();
}

function collega (radice) {
  collegaSync(radice);
  qs('#sel-tema', radice).addEventListener('change', async ev => {
    await store.salvaImpostazioni({ tema: ev.target.value });
    applicaTema(ev.target.value);
  });

  const chiave = qs('#in-chiave-google', radice);
  chiave.addEventListener('change', async () => {
    await store.salvaImpostazioni({ googleBooksApiKey: chiave.value.trim() });
    avviso('Chiave salvata.', 'ok');
  });

  const clientId = qs('#in-client-id', radice);
  if (clientId) clientId.addEventListener('change', async () => {
    await store.salvaImpostazioni({ clientIdOneDrive: clientId.value.trim() });
    avviso('Client ID salvato.', 'ok');
    vaiA('/impostazioni');
  });

  qs('#btn-svuota-cache', radice).addEventListener('click', async () => {
    await db.cacheSvuota();
    await dimenticaCaroselli();
    avviso('Cache svuotata.', 'ok');
  });

  qs('#btn-riprendi-scartati', radice).addEventListener('click', async () => {
    const ok = await conferma('I titoli che avevi scartato in Esplora torneranno a comparire, e i collegamenti rifiutati pure.', {
      titolo: 'Ripescare gli scarti?', ok: 'Ripesca'
    });
    if (!ok) return;
    await store.riprendiScartati();
    await dimenticaCaroselli();
    avviso('Scarti dimenticati.', 'ok');
  });

  /* ------------------------------------------------------------- backup - */

  qs('#btn-export', radice).addEventListener('click', async () => {
    try {
      const esito = await backup.consegna(await backup.testoBackup(), backup.nomeFileDiOggi(), 'application/json');
      if (esito !== 'annullato') {
        await backup.segnaBackupFatto();
        avviso('Backup esportato.', 'ok');
        vaiA('/impostazioni');
      }
    } catch (e) { avviso('Export non riuscito: ' + e.message, 'errore'); }
  });

  const btnCollega = qs('#btn-collega', radice);
  if (btnCollega) btnCollega.addEventListener('click', async () => {
    try {
      const nome = await backup.collegaFile();
      await backup.salvaSulFileCollegato();
      avviso(`Collegato a ${nome} e salvato.`, 'ok');
      vaiA('/impostazioni');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      avviso(e.message || 'Non riesco a collegare il file.', 'errore');
    }
  });

  const btnSalvaCollegato = qs('#btn-salva-collegato', radice);
  if (btnSalvaCollegato) btnSalvaCollegato.addEventListener('click', async () => {
    btnSalvaCollegato.disabled = true;
    try {
      const nome = await backup.salvaSulFileCollegato();
      avviso(`Salvato su ${nome}.`, 'ok');
      vaiA('/impostazioni');
    } catch (e) {
      avviso(e.message || 'Salvataggio non riuscito.', 'errore', 5000);
    } finally { btnSalvaCollegato.disabled = false; }
  });

  const btnScollega = qs('#btn-scollega', radice);
  if (btnScollega) btnScollega.addEventListener('click', async () => {
    await backup.scollegaFile();
    avviso('File scollegato.');
    vaiA('/impostazioni');
  });

  const fileInput = qs('#file-import', radice);
  qs('#btn-import', radice).addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (f) apriAnteprimaImport(await f.text());
  });

  qs('#btn-csv', radice).addEventListener('click', async () => {
    await backup.consegna(backup.csvLibri(), backup.nomeFileDiOggi('csv'), 'text/csv;charset=utf-8');
  });
  qs('#btn-md', radice).addEventListener('click', async () => {
    await backup.consegna(backup.markdownCitazioni(), `citazioni-${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown;charset=utf-8');
  });

  /* ---------------------------------------------------------- OneDrive -- */

  const odAccedi = qs('#btn-od-accedi', radice);
  if (odAccedi) odAccedi.addEventListener('click', async () => {
    try {
      const od = await import('../onedrive.js');
      await od.accedi();
    } catch (e) { avviso(e.message || 'Non riesco ad avviare l\'accesso.', 'errore', 5000); }
  });

  const odEsci = qs('#btn-od-esci', radice);
  if (odEsci) odEsci.addEventListener('click', async () => {
    const od = await import('../onedrive.js');
    await od.disconnetti();
    avviso('Account scollegato.');
    vaiA('/impostazioni');
  });

  const odCarica = qs('#btn-od-carica', radice);
  if (odCarica) odCarica.addEventListener('click', () => mandaSuOneDrive(odCarica));

  const odScarica = qs('#btn-od-scarica', radice);
  if (odScarica) odScarica.addEventListener('click', () => prendiDaOneDrive(odScarica));

  /* -------------------------------------------------- dati dimostrativi - */

  const btnDemo = qs('#btn-demo', radice);
  if (btnDemo) btnDemo.addEventListener('click', async () => {
    btnDemo.disabled = true;
    btnDemo.textContent = 'Carico…';
    try {
      const n = await caricaDatiDimostrativi();
      await dimenticaCaroselli();
      avviso(`Caricati ${n} libri di prova.`, 'ok');
      vaiA('/libreria');
    } catch (e) {
      avviso('Non sono riuscito a caricarli: ' + e.message, 'errore');
      btnDemo.disabled = false;
      btnDemo.textContent = 'Carica i dati dimostrativi';
    }
  });

  const btnDemoVia = qs('#btn-demo-via', radice);
  if (btnDemoVia) btnDemoVia.addEventListener('click', async () => {
    const ok = await conferma('Tolgo i cinque libri di prova con le loro citazioni. I tuoi libri restano dove sono.', {
      titolo: 'Togliere i dati di prova?', ok: 'Togli'
    });
    if (!ok) return;
    const n = await togliDatiDimostrativi();
    await dimenticaCaroselli();
    avviso(`Tolti ${n} libri di prova.`);
    vaiA('/impostazioni');
  });

  qs('#btn-azzera', radice).addEventListener('click', async () => {
    const ok = await conferma(
      'Cancello libri, citazioni, collegamenti, sessioni di studio e desideri. Se non hai un file di backup, non si torna indietro.',
      { titolo: 'Cancellare tutto?', ok: 'Cancella tutto', pericolo: true });
    if (!ok) return;
    const ancora = await conferma('Ultima conferma: davvero tutto?', { titolo: 'Sicuro?', ok: 'Sì, cancella', pericolo: true });
    if (!ancora) return;
    await db.azzeraDati();
    await store.carica();
    avviso('Dati cancellati.');
    vaiA('/libreria');
  });
}

/* ================================================= anteprima dell'import = */

export async function apriAnteprimaImport (testo) {
  let dati, confronto;
  try {
    dati = backup.leggiBackup(testo);
    confronto = await backup.confronta(dati);
  } catch (e) {
    avviso(e.message || 'Questo file non è leggibile.', 'errore', 5000);
    return;
  }

  const t = confronto.totali;
  const f = foglio({
    titolo: 'Cosa cambierebbe',
    classe: 'foglio--alto',
    contenuto: `
      <p class="minuscolo">File del ${dataBreve(dati.esportatoIl)} · schema ${dati.schemaVersion}</p>

      <div class="statistiche statistiche--tre" style="margin-bottom:14px">
        <div class="stat"><div class="stat__numero">${t.nuovi}</div><div class="stat__etichetta">nuovi</div></div>
        <div class="stat"><div class="stat__numero">${t.aggiornati}</div><div class="stat__etichetta">più recenti</div></div>
        <div class="stat"><div class="stat__numero">${t.soloLocali}</div><div class="stat__etichetta">solo qui</div></div>
      </div>

      <table class="tabella-diff">
        <thead><tr><th>Gruppo</th><th>Nuovi</th><th>Aggiorna</th><th>Solo qui</th></tr></thead>
        <tbody>
          ${confronto.gruppi.map(g => `
            <tr>
              <td>${esc(g.etichetta)}</td>
              <td>${g.nuovi || '–'}</td>
              <td>${g.aggiornati || '–'}</td>
              <td>${g.soloLocali || '–'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${t.piuVecchi ? `<p class="campo__aiuto">${plurale(t.piuVecchi, 'record del file è più vecchio', 'record del file sono più vecchi')} di quelli che hai qui: con la prima modalità non li tocco.</p>` : ''}

      <h3 style="margin-top:18px">Come procedo</h3>
      <div id="modalita-import">
        ${backup.MODALITA.map((m, i) => `
          <label class="tipo-domanda">
            <input type="radio" name="modo" value="${m.id}" ${i === 0 ? 'checked' : ''}>
            <span class="tipo-domanda__testo">
              <strong>${esc(m.nome)}</strong>
              <span class="minuscolo">${esc(m.spiegazione)}</span>
            </span>
          </label>`).join('')}
      </div>`,
    azioni: `
      <button class="btn btn--fantasma" data-az="annulla">Annulla</button>
      <button class="btn btn--pieno" data-az="applica">Applica</button>`
  });

  delega(f.elemento, 'click', '[data-az="annulla"]', () => f.chiudi());
  delega(f.elemento, 'click', '[data-az="applica"]', async () => {
    const modo = (qs('input[name=modo]:checked', f.elemento) || {}).value || 'recenti';
    if (modo === 'sostituisci') {
      const ok = await conferma('I dati attuali vengono cancellati e sostituiti da quelli del file.', {
        titolo: 'Sostituire tutto?', ok: 'Sostituisci', pericolo: true
      });
      if (!ok) return;
    }
    try {
      const scritti = await backup.applica(dati, modo);
      const totale = Object.values(scritti).reduce((s, n) => s + n, 0);
      f.chiudi();
      await dimenticaCaroselli();
      avviso(`Import completato: ${plurale(totale, 'record scritto', 'record scritti')}.`, 'ok', 4500);
      vaiA('/libreria');
    } catch (e) {
      avviso('Import non riuscito: ' + e.message, 'errore', 5000);
    }
  });
}

/* ================================================== operazioni OneDrive == */

async function mandaSuOneDrive (bottone) {
  bottone.disabled = true;
  const testoOriginale = bottone.textContent;
  bottone.textContent = 'Mando…';
  try {
    const od = await import('../onedrive.js');
    const testo = await backup.testoBackup();
    try {
      await od.carica(testo);
    } catch (e) {
      if (e.name !== 'ConflittoRemoto') throw e;
      const scelta = await chiediSulConflitto(e.remoto);
      if (scelta === 'annulla') return;
      if (scelta === 'unisci') { await prendiDaOneDrive(bottone, { poiRimanda: true }); return; }
      await od.carica(testo, { forza: true });
    }
    await backup.segnaBackupFatto();
    avviso('Mandato su OneDrive.', 'ok');
    vaiA('/impostazioni');
  } catch (e) {
    avviso(e.message || 'Non riesco a scrivere su OneDrive.', 'errore', 6000);
  } finally {
    bottone.disabled = false;
    bottone.textContent = testoOriginale;
  }
}

async function prendiDaOneDrive (bottone, { poiRimanda = false } = {}) {
  bottone.disabled = true;
  try {
    const od = await import('../onedrive.js');
    const remoto = await od.statoRemoto();
    if (!remoto) { avviso('Su OneDrive non c\'è ancora nessun file: manda prima questo.', 'info', 5000); return; }
    const testo = await od.scarica();
    if (!testo) { avviso('Il file remoto è vuoto.', 'errore'); return; }
    await od.segnaRemotoLetto(remoto.modificatoIl);
    if (poiRimanda) {
      const dati = backup.leggiBackup(testo);
      await backup.applica(dati, 'recenti');
      await od.carica(await backup.testoBackup(), { forza: true });
      avviso('Unito e rimandato su OneDrive.', 'ok');
      vaiA('/libreria');
      return;
    }
    await apriAnteprimaImport(testo);
  } catch (e) {
    avviso(e.message || 'Non riesco a leggere da OneDrive.', 'errore', 6000);
  } finally {
    bottone.disabled = false;
  }
}

function chiediSulConflitto (remoto) {
  const f = foglio({
    titolo: 'Il file su OneDrive è cambiato',
    classe: 'foglio--corto',
    contenuto: `
      <p class="testo-guida">Qualcuno — probabilmente un altro tuo dispositivo — ha scritto quel file dopo l'ultima volta che l'abbiamo sincronizzato${remoto ? ` (${dataBreve(remoto.modificatoIl)})` : ''}. Non lo sovrascrivo senza chiedertelo.</p>
      <button class="btn btn--largo btn--pieno" data-scelta="unisci" style="margin-bottom:8px">Prendi quello remoto e unisci</button>
      <button class="btn btn--largo btn--pericolo" data-scelta="sovrascrivi" style="margin-bottom:8px">Sovrascrivi con quello che ho qui</button>
      <button class="btn btn--largo btn--fantasma" data-scelta="annulla">Lascia stare</button>`
  });
  delega(f.elemento, 'click', '[data-scelta]', (_, b) => f.chiudi(b.dataset.scelta));
  return f.promessa.then(v => v || 'annulla');
}

/* ------------------------------------------------------------- utilità -- */

async function stimaSpazio () {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage } = await navigator.storage.estimate();
      if (usage != null) {
        return usage > 1048576 ? `${(usage / 1048576).toFixed(1)} MB` : `${Math.round(usage / 1024)} kB`;
      }
    }
  } catch (_) {}
  return 'non disponibile';
}
