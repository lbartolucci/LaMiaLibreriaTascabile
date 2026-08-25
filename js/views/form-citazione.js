/* =========================================================================
   form-citazione.js — aggiunta e modifica di una citazione
   ========================================================================= */

import {
  foglio, avviso, qs, delega, leggiForm, campoTagHTML, collegaCampiTag, conferma, vibra, el
} from '../ui.js';
import { esc } from '../utils/text.js';
import * as store from '../store.js';
import { nuovaCitazione, ErroreValidazione } from '../models.js';
import { barraDettaturaHTML, collegaDettatura, dettaturaSupportata, tagLingua } from '../dettatura.js';

export function apriFormCitazione ({ libroId, citazione = null } = {}) {
  const c = citazione ? { ...citazione } : nuovaCitazione({ libroId });
  const nuovo = !citazione;
  const libro = store.libro(c.libroId);
  const tagNoti = store.valoriDistinti('tag').map(x => x.valore);
  // si detta nella lingua del libro: una citazione inglese va riconosciuta in inglese
  const lingua = tagLingua(libro && libro.lingua);
  const segniAttivi = store.stato.impostazioni.dettaturaPunteggiatura !== false;

  const f = foglio({
    titolo: nuovo ? 'Nuova citazione' : 'Modifica citazione',
    classe: 'foglio--alto',
    contenuto: `<form id="form-citazione" novalidate>
      ${libro ? `<p class="minuscolo" style="margin:-4px 0 12px">da «${esc(libro.titolo)}»</p>` : ''}
      <div class="campo">
        <label for="c-testo">La citazione *</label>
        <textarea id="c-testo" name="testo" required rows="6"
          style="font-family:var(--serif);font-size:1.05rem;line-height:1.6"
          placeholder="Ricopia il passaggio così com'è, oppure leggilo a voce.">${esc(c.testo)}</textarea>
        ${barraDettaturaHTML({ per: 'c-testo', lingua, punteggiatura: segniAttivi, etichetta: 'Detta la citazione' })}
        ${dettaturaSupportata()
          ? '<p class="campo__aiuto">Il testo entra dove sta il cursore. Il riconoscimento non avviene sul telefono: l\'audio passa dai server del browser, quindi serve la connessione.</p>'
          : ''}
      </div>
      <div class="riga-campi">
        <div class="campo">
          <label for="c-pagina">Pagina</label>
          <input type="number" id="c-pagina" name="pagina" inputmode="numeric" value="${c.pagina ?? ''}" min="0">
        </div>
        <div class="campo">
          <label for="c-capitolo">Capitolo</label>
          <input type="text" id="c-capitolo" name="capitolo" value="${esc(c.capitolo)}">
        </div>
      </div>
      <div class="campo">
        <label for="c-contesto">Perché l'ho segnata</label>
        <textarea id="c-contesto" name="contesto" rows="3"
          placeholder="Che cosa ti ha fermato qui. Il quiz te lo richiederà.">${esc(c.contesto)}</textarea>
        ${barraDettaturaHTML({ per: 'c-contesto', lingua: 'it-IT', punteggiatura: segniAttivi, etichetta: 'Detta la nota' })}
      </div>
      ${campoTagHTML({ nome: 'tag', etichetta: 'Tag', valori: c.tag, suggerimenti: tagNoti, aiuto: 'Servono a ritrovare le citazioni e a far emergere i temi trasversali.' })}
      <div class="interruttore pannello pannello--piatto">
        <label for="c-preferita">Citazione preferita</label>
        <input type="checkbox" id="c-preferita" name="preferita" ${c.preferita ? 'checked' : ''}>
      </div>
      <p class="campo__aiuto">Le preferite escono più spesso nel quiz.</p>
    </form>`,
    azioni: `
      <button class="btn btn--fantasma" type="button" data-az="annulla">Annulla</button>
      <button class="btn btn--pieno" type="submit" form="form-citazione">Salva</button>`
  });

  const form = qs('#form-citazione', f.elemento);
  collegaCampiTag(form);

  // il microfono va rilasciato quando il foglio si chiude, in qualunque modo
  const fermaDettatura = collegaDettatura(f.elemento, {
    punteggiatura: segniAttivi,
    suCambioSegni: v => store.salvaImpostazioni({ dettaturaPunteggiatura: v })
  });
  f.promessa.then(() => fermaDettatura());

  delega(f.elemento, 'click', '[data-az="annulla"]', () => f.chiudi());

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const dati = leggiForm(form);
    Object.assign(c, {
      testo: dati.testo,
      pagina: dati.pagina,
      capitolo: dati.capitolo,
      contesto: dati.contesto,
      tag: dati.tag,
      preferita: !!dati.preferita
    });
    try {
      await store.salvaCitazione(c);
      f.chiudi(c);
      vibra();
      avviso(nuovo ? 'Citazione salvata.' : 'Modifiche salvate.', 'ok');
    } catch (e) {
      if (e instanceof ErroreValidazione) {
        let box = qs('#errori-cit', form);
        if (!box) {
          box = el('<div id="errori-cit" class="pannello" role="alert" style="border-color:var(--rosso);background:var(--rosso-tenue)"></div>');
          form.prepend(box);
        }
        box.innerHTML = `<ul style="margin:0;padding-left:18px">${e.errori.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
      } else {
        avviso('Non sono riuscito a salvare: ' + e.message, 'errore');
      }
    }
  });

  return f.promessa;
}

export async function chiediEliminaCitazione (citazione) {
  const ok = await conferma('La citazione verrà eliminata insieme al suo storico di ripasso.', {
    titolo: 'Eliminare la citazione?', ok: 'Elimina', pericolo: true
  });
  if (!ok) return false;
  await store.eliminaCitazione(citazione.id);
  avviso('Citazione eliminata.');
  return true;
}
