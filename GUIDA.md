# La mia libreria tascabile — v1.3, tutte e quattro le fasi

App personale per i libri letti e le citazioni che ti hanno colpito.
PWA offline-first, HTML + CSS + JavaScript puro: **nessun build, nessun npm, nessun backend**.

---

## Cosa c'è dentro

**Libreria**

- inserimento in tre modi: ricerca nei cataloghi (Open Library + Google Books), ISBN (con lettura del codice a barre dove il dispositivo la supporta), a mano;
- scheda libro con trama, elementi chiave riordinabili e tipizzati, impressione personale, valutazione a mezze stelle, stato;
- citazioni per libro e vista trasversale con ricerca full-text, filtri per tag/libro/preferite, ordinamento recenti / A–Z / a caso;
- **dettatura vocale** sul testo della citazione e sulla nota di contesto, sia creandola sia modificandola dopo (vedi sotto);
- dettaglio citazione a schermo intero, copia, condivisione (testo o immagine generata), salvataggio come PNG;
- evidenziazione automatica dei termini che ricorrono in più citazioni;
- collegamenti fra libri con tipo, nota e forza, più i suggerimenti automatici calcolati in locale (autore, generi, temi, tag e lessico delle citazioni);
- **grafo** navigabile su canvas, force-layout scritto a mano: pinch-to-zoom, pan, trascinamento dei nodi, tocco per aprire;
- ricerca globale raggruppata per tipo, statistiche, libri isolati;
- tema chiaro/scuro, dati dimostrativi, export/import JSON.

**Studio** (fase 2)

- dodici tipi di domanda, tutti generati a runtime dai tuoi dati: sei sulle citazioni (cloze, di quale libro, chi l'ha scritta, come comincia/come finisce, la nota di contesto, abbinamento) e sei sui libri (autore, trama con i nomi coperti, cosa ti ha colpito, con quale libro si collega, elementi chiave, metadati);
- le citazioni pesano circa il 65% delle domande, come da progetto;
- ambito a scelta: tutta la libreria, un libro, un autore, un tag, solo le preferite, solo quello che scade oggi;
- modalità rilassata o a tempo, con i secondi per domanda regolabili;
- ripasso dilazionato SM-2 semplificato (1, 3, 7, 16, 35, 90 giorni), badge in libreria, storico con grafico dell'andamento.

**Esplora** (fase 3)

- sei caroselli, ognuno con la sua motivazione scritta in chiaro: altre opere dei tuoi autori, sul tema che ti sta a cuore, autori affini, il prossimo dopo un libro che hai amato, **il ponte** fra due libri che avevi collegato, e un **fuori rotta** al giorno;
- tre azioni per proposta: lo voglio, l'ho già letto (apre il form precompilato), non mi interessa;
- lista dei desideri persistente, con filtro e promozione a libro letto;
- niente che tu abbia già, che tu abbia già scartato o che sia già nei desideri.

**Backup e sincronizzazione** (fase 4)

- export completo in un JSON versionato, con le copertine dentro;
- import con **anteprima delle differenze** e tre modalità: tieni il più recente, nel dubbio tieni i miei, sostituisci tutto;
- su desktop puoi **collegare un file una volta sola** (per esempio dentro la cartella OneDrive sincronizzata) e da lì salvare con un tocco;
- promemoria in Libreria se non fai un backup da più di sette giorni;
- export secondari: CSV dei libri e Markdown delle citazioni raggruppate per libro;
- sincronizzazione diretta con OneDrive, facoltativa (istruzioni in **AZURE.md**).

---

## Come provarla subito sul computer

Il browser blocca i moduli JavaScript aperti da `file://`: serve un server locale, anche banale.

**Con Python** (già installato su quasi tutti i sistemi), dentro la cartella dell'app:

```
python -m http.server 8000
```

poi apri `http://localhost:8000`.

**Con Node:**

```
npx serve .
```

Su `localhost` funziona tutto, service worker compreso.

---

## Metterla online su GitHub Pages (per installarla sul telefono)

Per installare una PWA sulla home screen serve un indirizzo **https**: da file locale non si può.

1. Crea un account su [github.com](https://github.com) se non ne hai uno.
2. Clicca **New repository**: nome per esempio `libreria`, visibilità **Public**, senza README. → *Create repository*.
3. Nella pagina del repository vuoto clicca **uploading an existing file**.
4. Trascina dentro **il contenuto** della cartella dell'app — cioè `index.html`, `manifest.webmanifest`, `sw.js` e le cartelle `css`, `js`, `icons` — **non la cartella che li contiene**. GitHub accetta il trascinamento di cartelle intere.
5. In fondo clicca **Commit changes**.
6. Vai su **Settings → Pages**. Sotto *Build and deployment*, Source: **Deploy from a branch**, Branch: **main**, cartella **/ (root)**. → *Save*.
7. Dopo un minuto la pagina mostrerà l'indirizzo: `https://TUONOME.github.io/libreria/`.

Per aggiornare l'app in futuro: stessa procedura, oppure `git push` se preferisci la riga di comando.

> Nota: l'app usa percorsi relativi apposta, quindi funziona anche in una sottocartella come `/libreria/`. Se la sposti alla radice del dominio continua a funzionare.

---

## Installarla sul telefono

**iPhone / iPad (Safari — deve essere Safari, Chrome su iOS non installa PWA)**

1. Apri l'indirizzo `https://…` in Safari.
2. Tocca il pulsante **Condividi** (il quadrato con la freccia).
3. Scorri e tocca **Aggiungi a schermata Home**.
4. Conferma. L'icona compare fra le app e si apre a tutto schermo, senza barra del browser.

**Android (Chrome)**

1. Apri l'indirizzo.
2. Menu **⋮** → **Installa app** (oppure compare da solo un banner "Aggiungi a schermata Home").
3. Conferma.

Dopo la prima apertura online l'app resta disponibile **offline**: libreria, citazioni, collegamenti e grafo funzionano senza rete. Solo la ricerca nei cataloghi ha bisogno di connessione, e quando manca lo dice con parole chiare.

---

## Dettare le citazioni a voce

Sotto il campo della citazione c'è **Detta la citazione**; sotto la nota personale, **Detta la nota**. Compaiono in tutti e due i casi che ti servivano: quando crei una citazione nuova e quando ne riapri una già salvata per modificarla (menu **⋯ → Modifica**).

Come si comporta:

- il testo entra **dove sta il cursore**, così puoi dettare un pezzo, correggere a mano e riprendere;
- se ricominci dopo un punto fermo, la maiuscola te la mette lui;
- non si ferma alla prima pausa: continua finché non tocchi **Ferma** (Chrome chiude la sessione dopo qualche secondo di silenzio, e l'app la fa ripartire da sola);
- mentre parli vedi la trascrizione provvisoria in corsivo sotto il campo: entra nel testo solo quando il riconoscitore la dà per definitiva.

**La punteggiatura.** Il pulsante `punteggiatura` (acceso di default) converte le parole dette nei segni: *virgola, punto, punto e virgola, due punti, punto interrogativo, punto esclamativo, puntini di sospensione, aperte/chiuse virgolette, aperta/chiusa parentesi, lineetta, a capo*.

C'è un caso in cui va spento, ed è per questo che è un interruttore e non un comportamento fisso: se la citazione contiene davvero la parola «punto» — *«Il punto è che…»* — con la conversione accesa te la trasforma in un segno. Spegnilo per quella citazione e riaccendilo dopo; la scelta resta memorizzata.

**La lingua.** Il riconoscimento parte nella lingua del libro: un libro segnato come inglese si detta in inglese. Quando la lingua del libro non è l'italiano compare accanto al microfono un pulsantino per passare da una all'altra — utile se il libro è inglese ma la tua nota di contesto la vuoi dettare in italiano.

**Due limiti da conoscere.**

Il riconoscimento **non avviene sul telefono**: l'audio passa dai server di Apple (Safari) o Google (Chrome), quindi qui la connessione serve — è l'unica parte dell'app, insieme alla ricerca nei cataloghi, che non funziona offline. L'app te lo dice invece di restare muta.

Su iPhone la Web Speech API esiste da iOS 14.5, ma dentro una PWA installata sulla schermata Home ha avuto in passato qualche capriccio. Se il pulsante non dovesse rispondere lì, hai comunque **il microfono della tastiera di sistema**, che fa esattamente lo stesso lavoro: tocca il campo, poi l'icona del microfono sulla tastiera. Dove l'API manca del tutto il pulsante non compare affatto, invece di restare lì morto.

---

## Come funziona lo Studio

**La scelta degli elementi non è casuale.** A ogni domanda l'app pesca fra i tuoi elementi dando la precedenza, in quest'ordine, a: le citazioni che hai segnato come preferite, quelle in scadenza secondo il ripasso, quelle che avevi sbagliato più volte di quante le avessi azzeccate, e quelle mai testate. Ciò che hai già visto oggi viene fortemente penalizzato. Dentro una sessione nessun elemento esce due volte.

**Il ripasso dilazionato.** Ogni risposta aggiorna il livello dell'elemento: giusta lo fa salire (1 → 3 → 7 → 16 → 35 → 90 giorni), sbagliata lo riporta a zero (rivedi domani), «a metà» lo fa scendere di un gradino invece di azzerarlo. In Libreria compare una fascia con quante citazioni scadono oggi, e da lì parte direttamente un ripasso mirato.

Una nota tecnica che conta: aggiornare il ripasso **non** tocca il campo «modificato il» dei libri. Se lo facesse, dopo ogni quiz la tua libreria si riordinerebbe tutta quando è ordinata per «aggiunti di recente».

**Le domande aperte non hanno un correttore automatico.** Per «perché l'avevi segnata», «cosa ti ha colpito» ed «elementi chiave» l'app rivela quello che avevi scritto e sei tu a dire com'è andata: *ricordavo / a metà / no*. Nessuna AI giudica le tue risposte. Il confronto automatico del testo esiste solo dove ha senso — le cloze e il «come comincia / come finisce» — con tolleranza agli errori di battitura (accetta fino al 20-25% di differenza) e un diff che ti mostra parola per parola cosa avevi azzeccato, cosa mancava e cosa era di troppo. Nel diff la differenza non è solo di colore: le parole mancanti sono sottolineate, quelle di troppo barrate.

**Quando il materiale non basta.** Ogni tipo di domanda dichiara da solo se si può costruire, e se non si può la schermata di avvio lo spiega invece di lasciarti generare domande vuote: «servono almeno quattro libri per avere alternative credibili», «nessuna citazione ha una nota», e così via. Con meno di quattro libri le domande a scelta multipla restano spente. Se chiedi dieci domande e il materiale ne regge cinque, l'app te lo dice e ne fa cinque.

**Una scelta che ho preso da solo, dimmi se ti convince.** Il prompt chiedeva l'abbinamento «per trascinamento». Sul telefono trascinare fra due colonne con il pollice, mentre la pagina scorre, è una lotta — lo stesso motivo per cui in fase 1 gli elementi chiave si riordinano con le frecce. L'ho fatto **a tocchi**: tocchi una citazione, poi il libro. Più veloce, funziona a una mano e resta usabile da tastiera. Se lo preferisci trascinabile su desktop lo aggiungo.

---

## Esplora: come nascono i suggerimenti

Nessun carosello esiste se non riesco a dirti *perché* ti sto proponendo quel titolo. La motivazione sta sotto il titolo della sezione, e ogni card ha la sua riga («Hai letto 3 libri di X. Questo no.»).

**Il ponte** è quello a cui tengo di più, ed è il motivo per cui i collegamenti che crei in Libreria non servono solo al grafo. Prende due libri che *tu* hai collegato, cerca sui soggetti dell'uno e su quelli dell'altro, e tiene i titoli che compaiono in tutti e due i mucchi. Se l'intersezione è vuota ripiega su chi condivide almeno un soggetto con ciascuno dei due. È il suggerimento meno ovvio e quello che nessun algoritmo di libreria commerciale ti darebbe, perché nasce da un legame che hai fatto tu.

**Fuori rotta** pesca da un elenco di soggetti larghi (astronomia, alpinismo, jazz, cartografia…) scartando quelli che sfiorano la tua libreria: uno solo, etichettato, e cambia ogni giorno.

**Un limite dichiarato.** I cataloghi ragionano in inglese: i soggetti di Open Library sono `memoir`, `holocaust`, `italian literature`. I tuoi temi sono in italiano. Per ogni tema provo prima Open Library e poi Google Books con `langRestrict=it`, che con l'italiano se la cava meglio; ma se un tuo tema è molto personale («dignità») è possibile che non produca granché. In quel caso quel carosello semplicemente non compare, invece di riempirsi di robaccia.

**Sulle buone maniere.** Open Library dichiara circa una richiesta al secondo per i client anonimi, ed Esplora ne fa una decina. Le ho messe in coda distanziandole: la prima apertura prende qualche secondo, e i caroselli compaiono uno alla volta man mano che arrivano. Il risultato resta valido mezza giornata, o finché non cambi la libreria: riaprire Esplora dopo è istantaneo. In Impostazioni c'è «Svuota la cache dei cataloghi» se vuoi forzare tutto da capo.

---

## Backup: la parte che conta davvero

I dati stanno **solo** nel browser del telefono. Se cancelli i dati del sito o disinstalli l'app, se ne vanno con lei. Per questo la Libreria ti mette una fascia gialla in cima quando non fai un backup da più di una settimana.

### Livello 1 — il file (funziona ovunque, senza configurare niente)

**Esporta un file JSON** produce `libreria-AAAA-MM-GG.json` con tutto: libri, citazioni, collegamenti, sessioni di studio, desideri, scarti e copertine. Sul telefono passa dal foglio di condivisione, quindi puoi mandarlo direttamente a OneDrive; sul computer si scarica.

**Importa da un file** non applica niente al buio: ti mostra prima **cosa cambierebbe** — quanti record nuovi, quanti più recenti del file, quanti esistono solo qui, gruppo per gruppo — e poi ti fa scegliere fra tre modalità:

| Modalità | Quando serve |
|---|---|
| **Tieni il più recente** | Lo stesso libro vive su due dispositivi. Per ogni record vince quello modificato più tardi. |
| **Nel dubbio tengo i miei** | Vuoi solo recuperare quello che ti manca senza rischiare di perdere modifiche locali. |
| **Sostituisci tutto** | Stai ripristinando su un dispositivo vuoto. Cancella e rimette. |

**Il file collegato** (solo su desktop, dove il browser supporta la File System Access API): scegli una volta il file dentro la cartella OneDrive sincronizzata sul computer, e da lì in poi «Salva su libreria.json» lo riscrive con un tocco, senza ripassare dal selettore. È il modo più veloce di tenere un backup vero senza pensarci.

**Export secondari**: CSV dei libri (separatore `;` e BOM, così Excel in italiano lo apre senza rovinare gli accenti) e Markdown delle citazioni raggruppate per libro, con le note di contesto — pronto da incollare in un'app di note.

### Livello 2 — OneDrive diretto (facoltativo)

Le istruzioni passo-passo per la registrazione su Azure sono in **AZURE.md**, accanto a questo file. Cinque minuti, una volta sola, gratis. L'app chiede il permesso `Files.ReadWrite.AppFolder`: crea una cartella tutta sua su OneDrive e vede soltanto quella.

La scrittura non è mai cieca: prima di sovrascrivere il file remoto l'app controlla se è cambiato dopo l'ultima sincronizzazione che conosce, e se lo è si ferma e ti chiede cosa fare — prendere il remoto e unire, sovrascrivere, o lasciar perdere.

**Due cose da sapere, dette prima.** La prima: **non ho scritto MSAL.js**, che il prompt suggeriva. MSAL è una libreria da qualche centinaio di kilobyte da caricare da un CDN esterno, e questo contraddice le altre due regole che ci siamo dati — offline-first e zero dipendenze. Il flusso che serve qui è uno solo (authorization code + PKCE, un permesso), è standard OAuth 2.0, e sono un centinaio di righe leggibili in `js/onedrive.js`. La seconda: **questa parte non ho potuto provarla**, perché richiede una registrazione Azure e un account Microsoft veri. Il codice è scritto con cura e gli errori sono gestiti a parole, ma il primo collaudo vero lo fai tu. Tutto il resto dell'app non dipende in alcun modo da qui.

---

## Dove finiscono i dati

Tutto in **IndexedDB**, dentro il browser del telefono. Nessun server, nessun account, nessuna telemetria.

Due conseguenze da tenere a mente:

- se cancelli i dati del sito o disinstalli l'app, i dati se ne vanno con lei;
- iOS cancella i dati dei siti web non usati per **7 giorni** — ma **non** quelli delle PWA aggiunte alla schermata Home. Motivo in più per installarla davvero invece di tenerla come segnalibro.

Vedi la sezione sul backup qui sopra: è la parte dell'app che conviene imparare per prima.

---

## Cose che ho verificato

Quattro collaudi automatici percorrono l'app in un browser vero (Chromium, viewport iPhone), per un totale di **120 controlli**. Il primo, 30 punti sulla fase 1: inserimento manuale, citazioni, collegamenti, grafo disegnato davvero, ricerca, statistiche, persistenza dopo il reload, tema scuro, export → cancellazione → import identico, degrado con un solo libro, apertura offline. Il secondo, 14 punti sulla dettatura, con un finto riconoscitore vocale iniettato nella pagina. Il terzo, 38 punti sulla fase 2: che tutti e dodici i tipi si generino davvero, che una sessione da dieci faccia esattamente dieci domande senza ripetere elementi, che le citazioni restino sopra il 60%, che tutti e quattro i formati di risposta funzionino, il cronometro, il riepilogo, la matematica del ripasso, il badge, lo storico, il degrado con un libro solo e con la libreria vuota. Il quarto, 38 punti sulle fasi 3 e 4, con i cataloghi simulati: i sei caroselli, le esclusioni, le tre azioni, la lista dei desideri, la promozione a libro letto, le richieste distanziate, l'anteprima dell'import, le tre modalità di fusione una per una, CSV e Markdown, e il comportamento offline.

Tutti passano, con **console pulita**.

**Cosa resta non verificato, e va detto.** Dall'ambiente in cui ho lavorato non raggiungo né i cataloghi né Microsoft, e non ho un microfono. Quindi: le chiamate reali a Open Library e Google Books le ho provate solo con un finto catalogo che imita le loro risposte; la dettatura con un finto riconoscitore; la sincronizzazione OneDrive per niente. Il codice è scritto in difesa — campi mancanti, risposte vuote, 429 con backoff esponenziale, timeout, cache — ma i primi tre collaudi veri li fai tu: **cerca un libro per titolo, detta una citazione, e se ti interessa registra l'app su Azure**.

---

## Limiti noti, detti prima

| Cosa | Situazione |
|---|---|
| Lettura del codice a barre | Funziona su Android/Chrome (`BarcodeDetector`). Su iPhone l'API non esiste: il pulsante non compare e resta l'inserimento a mano delle cifre. |
| Vibrazione al tocco | Android sì, iOS ignora `navigator.vibrate`. Nessun danno. |
| Condivisione dell'immagine della citazione | Dove c'è la Web Share API con file (iOS e Android moderni) apre il foglio di condivisione; altrove ripiega sul testo o sulla copia negli appunti. |
| Copertine da Google Books | Alcune non si lasciano convertire in base64 per via del CORS: in quel caso resta l'URL remoto e la copertina non si vede offline. Da Open Library funziona. |
| Dettatura vocale | Ha bisogno della connessione (il riconoscimento sta sui server del browser). Su iPhone dentro la PWA installata può fare i capricci: in quel caso resta il microfono della tastiera. |
| Trascinamento degli elementi chiave | Con il mouse c'è il drag & drop; sul telefono si usano le frecce ↑↓ accanto a ogni elemento (che sono anche l'alternativa accessibile da tastiera). |
| Copertine dei libri dimostrativi | Volutamente assenti: i cinque libri di prova devono funzionare anche offline, quindi mostrano il segnaposto tipografico. |

---

## Com'è fatto il codice

```
index.html              guscio, tab bar, meta per iOS
manifest.webmanifest    installazione, icone, scorciatoie
sw.js                   service worker: guscio cache-first, copertine in cache
css/app.css             tutta la grafica; la palette sta nelle variabili di :root
js/
  main.js               avvio, rotte, tema, service worker
  router.js             instradamento sull'hash (#/libro/xyz)
  db.js                 IndexedDB: store, indici, cache delle API, export
  store.js              stato in memoria + bus degli eventi
  models.js             entità, validazione, normalizzazione, migrazione
  catalog.js            Open Library + Google Books, riprove e cache
  collegamenti.js       suggerimenti automatici (Jaccard + lessico)
  demo.js               i cinque libri di prova
  dettatura.js          input vocale: Web Speech API, punteggiatura, errori
  suggerimenti.js       i sei caroselli di Esplora, esclusioni, cache
  backup.js             export/import, anteprima differenze, CSV, Markdown
  onedrive.js           OAuth PKCE + Microsoft Graph (facoltativo)
  quiz/
    srs.js              ripasso dilazionato, priorità, estrazione pesata
    generatore.js       i dodici tipi di domanda, distrattori, cloze
  ui.js                 fogli modali, avvisi, campi tag, stelline
  utils/text.js         normalizzazione, stop-words IT/EN, Levenshtein
  views/                una vista per schermata
icons/                  icone PNG generate
```

Per cambiare l'aspetto tocca solo `:root` in `css/app.css`: colori, raggi, spaziature e caratteri stanno tutti lì.

---

## I criteri di accettazione, uno per uno

| | |
|---|---|
| Si installa su iOS e Android e si apre a tutto schermo | ✅ manifest, service worker, icone, `display: standalone` |
| Offline: libreria e quiz continuano, Esplora spiega | ✅ collaudato togliendo la rete |
| Inserimento cercando per titolo e completamente a mano | ✅ tre modi, più l'ISBN |
| Più citazioni per libro, ritrovabili nella vista trasversale | ✅ con ricerca full-text e filtri |
| Collegare due libri e vederlo in entrambe le schede e nel grafo | ✅ |
| Un quiz da N domande genera esattamente N domande, senza ripetizioni | ✅ e se il materiale non basta lo dice |
| Tutti e 12 i tipi di domanda implementati e verificabili | ✅ provati uno per uno nel collaudo |
| Con 1 solo libro l'app non si rompe | ✅ sette tipi si spengono spiegando il perché |
| Esplora produce suggerimenti reali e non ripropone libri già in libreria | ⚠️ logica collaudata con cataloghi simulati; i server veri li provi tu |
| Export → cancellazione → import ricostruisce lo stato identico | ✅ nelle tre modalità |
| Nessun errore in console | ✅ i quattro collaudi falliscono se ne compare uno |
| Ricaricando non perdo nulla | ✅ |

---

## Prossimo passo

L'app è completa rispetto al progetto iniziale. Le cose che mi aspetto tornino indietro dall'uso vero:

1. **Esplora con i cataloghi veri** — è l'unica parte la cui qualità dipende da dati che non ho potuto vedere. Se un carosello propone robaccia, dimmi quale e con che tema, e cambio la strategia di ricerca per quel caso.
2. **OneDrive** — se decidi di configurarlo, il primo tentativo dirà se ho indovinato i dettagli della registrazione Azure.
3. Le **cloze** e gli **intervalli del ripasso**, che restano le due tarature più opinabili.
