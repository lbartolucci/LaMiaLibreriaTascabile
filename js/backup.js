/* =========================================================================
   backup.js — livello 1: il file, che funziona ovunque
   Export completo in un JSON versionato, import con anteprima delle
   differenze e tre modalità di fusione, più due export secondari (CSV dei
   libri, Markdown delle citazioni) per portarsi i dati altrove.

   Il livello 2 (sincronizzazione diretta con OneDrive) sta in onedrive.js ed
   è facoltativo: se non lo configuri, qui non cambia niente.
   ========================================================================= */

import * as db from './db.js';
import * as store from './store.js';
import { migraBackup } from './models.js';

const NOME_FILE = 'libreria';
export const GIORNI_PROMEMORIA = 7;

/* ============================================================== export === */

export function nomeFileDiOggi (estensione = 'json') {
  return `${NOME_FILE}-${new Date().toISOString().slice(0, 10)}.${estensione}`;
}

export async function costruisciBackup () {
  return db.esportaTutto();
}

export async function testoBackup () {
  return JSON.stringify(await costruisciBackup(), null, 2);
}

/** CSV dei libri. Separatore punto e virgola e BOM in testa: è la forma che
 *  Excel in italiano apre senza fare domande e senza rovinare gli accenti. */
export function csvLibri () {
  const colonne = [
    'titolo', 'sottotitolo', 'autore', 'annoPubblicazione', 'annoLettura', 'editore',
    'lingua', 'numeroPagine', 'isbn', 'generi', 'temi', 'valutazione', 'stato',
    'citazioni', 'collegamenti', 'trama', 'impressionePersonale'
  ];
  const campo = v => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const righe = [colonne.join(';')];
  store.stato.libri
    .slice().sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'))
    .forEach(l => {
      righe.push([
        l.titolo, l.sottotitolo, (l.autore || []).join(' | '),
        l.annoPubblicazione, l.annoLettura, l.editore, l.lingua, l.numeroPagine, l.isbn,
        (l.generi || []).join(' | '), (l.temi || []).join(' | '),
        String(l.valutazione || 0).replace('.', ','),      // virgola decimale
        l.stato, store.contaCitazioni(l.id), store.collegamentiDi(l.id).length,
        l.trama, l.impressionePersonale
      ].map(campo).join(';'));
    });
  return '﻿' + righe.join('\r\n');
}

/** Markdown di tutte le citazioni raggruppate per libro, pronto da incollare
 *  in un'app di note. */
export function markdownCitazioni () {
  const righe = ['# Le mie citazioni', '',
    `_Esportate il ${new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })} da «La mia libreria tascabile»._`, ''];

  const libri = store.stato.libri
    .slice()
    .filter(l => store.contaCitazioni(l.id))
    .sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));

  if (!libri.length) righe.push('_Nessuna citazione, per ora._');

  libri.forEach(l => {
    righe.push(`## ${l.titolo}`);
    const intestazione = [
      (l.autore || []).join(', '),
      l.annoPubblicazione ? String(l.annoPubblicazione) : '',
      l.editore
    ].filter(Boolean).join(' · ');
    if (intestazione) righe.push(`*${intestazione}*`);
    righe.push('');

    store.citazioniDi(l.id).forEach(c => {
      righe.push(`> ${c.testo.replace(/\n+/g, '\n> ')}`);
      const fonte = [
        c.capitolo, c.pagina != null ? `p. ${c.pagina}` : '',
        c.preferita ? '★ preferita' : ''
      ].filter(Boolean).join(' · ');
      if (fonte) righe.push(`> — ${fonte}`);
      righe.push('');
      if (c.contesto) righe.push(`**Perché l'ho segnata.** ${c.contesto}`, '');
      if (c.tag && c.tag.length) righe.push(c.tag.map(t => `\`${t}\``).join(' '), '');
    });

    if (l.impressionePersonale) righe.push(`**Cosa mi ha colpito.** ${l.impressionePersonale}`, '');
    righe.push('---', '');
  });

  return righe.join('\n');
}

/* --------------------------------------------------- consegna di un file - */

/** Su telefono conviene passare dal foglio di condivisione (così puoi
 *  mandarlo direttamente a OneDrive), altrove si scarica. */
export async function consegna (contenuto, nome, tipo) {
  const blob = new Blob([contenuto], { type: tipo });
  const file = new File([blob], nome, { type: tipo });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nome });
      return 'condiviso';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'annullato';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'scaricato';
}

/* ------------------------------- file collegato (File System Access API) - */

export const fileCollegabile = () => typeof window.showSaveFilePicker === 'function';

/** Chiede una volta sola quale file usare — tipicamente dentro la cartella
 *  di OneDrive sincronizzata sul computer — e se lo ricorda. */
export async function collegaFile () {
  if (!fileCollegabile()) throw new Error('Questo browser non permette di collegare un file.');
  const handle = await window.showSaveFilePicker({
    suggestedName: nomeFileDiOggi(),
    types: [{ description: 'Backup della libreria', accept: { 'application/json': ['.json'] } }]
  });
  await db.scrivi('meta', { chiave: 'fileBackup', valore: handle, nome: handle.name });
  return handle.name;
}

export async function fileCollegato () {
  const rec = await db.leggi('meta', 'fileBackup');
  return rec ? { handle: rec.valore, nome: rec.nome } : null;
}

export async function scollegaFile () {
  await db.cancella('meta', 'fileBackup').catch(() => {});
}

/** Salva sul file collegato senza chiedere niente. */
export async function salvaSulFileCollegato () {
  const collegato = await fileCollegato();
  if (!collegato) throw new Error('Nessun file collegato.');
  const permesso = await collegato.handle.queryPermission({ mode: 'readwrite' });
  if (permesso !== 'granted') {
    const chiesto = await collegato.handle.requestPermission({ mode: 'readwrite' });
    if (chiesto !== 'granted') throw new Error('Il browser non mi lascia più scrivere su quel file: ricollegalo.');
  }
  const flusso = await collegato.handle.createWritable();
  await flusso.write(await testoBackup());
  await flusso.close();
  await segnaBackupFatto();
  return collegato.nome;
}

/* ============================================================== import === */

export function leggiBackup (testo) {
  let grezzo;
  try { grezzo = JSON.parse(testo); }
  catch (_) { throw new Error('Questo file non è un JSON valido.'); }
  if (!grezzo || !grezzo.dati || !grezzo.schemaVersion) {
    throw new Error('Questo file non sembra un backup della libreria.');
  }
  return migraBackup(grezzo);
}

const GRUPPI = ['libri', 'citazioni', 'collegamenti', 'collegamentiCitazione', 'sessioni', 'desideri', 'scartati'];

const ETICHETTE = {
  libri: 'libri', citazioni: 'citazioni', collegamenti: 'collegamenti',
  collegamentiCitazione: 'collegamenti fra citazioni', sessioni: 'sessioni di studio',
  desideri: 'desideri', scartati: 'scarti'
};

/** L'anteprima delle differenze: cosa entrerebbe, cosa cambierebbe, cosa
 *  resterebbe fuori. Da mostrare PRIMA di toccare qualsiasi cosa. */
export async function confronta (backup) {
  const esito = { gruppi: [], totali: { nuovi: 0, aggiornati: 0, piuVecchi: 0, identici: 0, soloLocali: 0 } };

  for (const gruppo of GRUPPI) {
    const inArrivo = backup.dati[gruppo] || [];
    const locali = await db.tutti(gruppo);
    const perId = new Map(locali.map(r => [r.id, r]));
    const idInArrivo = new Set(inArrivo.map(r => r.id));

    const conto = { nuovi: 0, aggiornati: 0, piuVecchi: 0, identici: 0, soloLocali: 0, esempiNuovi: [] };

    inArrivo.forEach(r => {
      const mio = perId.get(r.id);
      if (!mio) {
        conto.nuovi++;
        if (conto.esempiNuovi.length < 3 && r.titolo) conto.esempiNuovi.push(r.titolo);
        else if (conto.esempiNuovi.length < 3 && r.testo) conto.esempiNuovi.push(r.testo.slice(0, 40) + '…');
        return;
      }
      const suo = r.updatedAt || '';
      const nostro = mio.updatedAt || '';
      if (suo > nostro) conto.aggiornati++;
      else if (suo < nostro) conto.piuVecchi++;
      else conto.identici++;
    });
    conto.soloLocali = locali.filter(r => !idInArrivo.has(r.id)).length;

    if (inArrivo.length || conto.soloLocali) {
      esito.gruppi.push({ gruppo, etichetta: ETICHETTE[gruppo] || gruppo, ...conto, inArrivo: inArrivo.length, locali: locali.length });
    }
    Object.keys(esito.totali).forEach(k => { esito.totali[k] += conto[k]; });
  }
  return esito;
}

export const MODALITA = [
  {
    id: 'recenti',
    nome: 'Unisci, tenendo il più recente',
    spiegazione: 'Per ogni record vince la versione modificata più di recente. È quella giusta quando lo stesso libro vive su due dispositivi.'
  },
  {
    id: 'locale',
    nome: 'Unisci, ma nel dubbio tengo i miei',
    spiegazione: 'Entrano solo i record che qui non esistono. Su tutto il resto vince quello che hai sul telefono.'
  },
  {
    id: 'sostituisci',
    nome: 'Sostituisci tutto',
    spiegazione: 'Cancella quello che c\'è e mette il contenuto del file. Da usare quando stai ripristinando un backup su un dispositivo vuoto.'
  }
];

/** Applica il backup. Ritorna quanti record ha scritto, per gruppo. */
export async function applica (backup, modo) {
  if (!MODALITA.some(m => m.id === modo)) throw new Error('Modalità sconosciuta.');
  const scritti = {};

  if (modo === 'sostituisci') await db.azzeraDati({ tieniImpostazioni: true });

  for (const gruppo of GRUPPI) {
    const inArrivo = backup.dati[gruppo] || [];
    if (!inArrivo.length) continue;

    let daScrivere = inArrivo;
    if (modo !== 'sostituisci') {
      const locali = new Map((await db.tutti(gruppo)).map(r => [r.id, r]));
      daScrivere = inArrivo.filter(r => {
        const mio = locali.get(r.id);
        if (!mio) return true;                                  // sempre i nuovi
        if (modo === 'locale') return false;                    // nel dubbio i miei
        return (r.updatedAt || '') > (mio.updatedAt || '');     // il più recente
      });
    }
    await db.scriviMolti(gruppo, daScrivere);
    scritti[gruppo] = daScrivere.length;
  }

  // le impostazioni del file non sovrascrivono le tue, tranne quelle che
  // descrivono i dati e non il dispositivo
  await db.incrementaRevisione();
  await store.carica();
  return scritti;
}

/* ========================================================== promemoria === */

export async function segnaBackupFatto () {
  await store.salvaImpostazioni({ ultimoBackup: new Date().toISOString() });
}

/** Da quanti giorni non fai un backup. null se non ne hai mai fatto uno. */
export function giorniDallUltimoBackup () {
  const ultimo = store.stato.impostazioni.ultimoBackup;
  if (!ultimo) return null;
  return Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000);
}

/** Va mostrato il promemoria? Solo se hai qualcosa da perdere. */
export function serveIlPromemoria () {
  if (!store.stato.libri.length) return false;
  const giorni = giorniDallUltimoBackup();
  return giorni === null || giorni >= GIORNI_PROMEMORIA;
}
