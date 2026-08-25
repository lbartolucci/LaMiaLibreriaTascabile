/* =========================================================================
   demo.js — cinque libri di prova
   Servono solo a farti vedere com'è l'app piena: citazioni, temi, tag e
   collegamenti realistici. Si caricano e si cancellano da Impostazioni.
   I record portano il marchio `demo: true`, così la pulizia è chirurgica e
   non tocca i tuoi libri veri.
   ========================================================================= */

import { nuovoLibro, nuovaCitazione, nuovoCollegamento } from './models.js';
import * as store from './store.js';

const LIBRI = [
  {
    chiave: 'levi',
    titolo: 'Se questo è un uomo',
    autore: ['Primo Levi'],
    annoPubblicazione: 1947, annoLettura: 2023, editore: 'Einaudi', numeroPagine: 214,
    generi: ['memorialistica', 'letteratura italiana'],
    temi: ['memoria', 'testimonianza', 'dignità'],
    valutazione: 5, stato: 'letto',
    trama: 'Il resoconto dei dieci mesi passati dall\'autore nel campo di Auschwitz-Monowitz, scritto con la precisione di un chimico e senza una parola di odio.',
    elementiChiave: [
      { testo: 'La discesa: il viaggio, la selezione, la perdita del nome', tipo: 'snodo' },
      { testo: 'Il sommerso e il salvato come categorie morali', tipo: 'concetto' },
      { testo: 'Il canto di Ulisse: la poesia come atto di resistenza', tipo: 'snodo' },
      { testo: 'Lorenzo, il muratore che porta la zuppa', tipo: 'personaggio' }
    ],
    impressionePersonale: 'Mi ha colpito la scelta del tono: nessuna invettiva, solo constatazione. La lucidità fa più male dell\'indignazione, e credo che Levi lo sapesse benissimo.',
    citazioni: [
      { testo: 'Considerate se questo è un uomo, che lavora nel fango, che non conosce pace.', pagina: 9, capitolo: 'Epigrafe',
        contesto: 'L\'esergo del libro. Non è una domanda retorica: è un ordine rivolto al lettore.',
        tag: ['dignità', 'memoria'], preferita: true },
      { testo: 'Si sa che le cose che sono state non si possono disfare.', pagina: 118,
        contesto: 'La frase più asciutta sul senso della memoria che abbia letto.', tag: ['memoria'] },
      { testo: 'Nulla è più vano che cercare di dimostrare che un uomo è un uomo.', pagina: 45,
        tag: ['dignità'], contesto: 'Sull\'assurdità di dover argomentare l\'ovvio.' }
    ]
  },
  {
    chiave: 'calvino',
    titolo: 'Le città invisibili',
    autore: ['Italo Calvino'],
    annoPubblicazione: 1972, annoLettura: 2024, editore: 'Einaudi', numeroPagine: 168,
    generi: ['narrativa', 'letteratura italiana'],
    temi: ['città', 'memoria', 'linguaggio'],
    valutazione: 4.5, stato: 'da rileggere',
    trama: 'Marco Polo descrive a Kublai Khan cinquantacinque città immaginarie. Poco a poco si capisce che sta sempre parlando della stessa città, e forse di sé stesso.',
    elementiChiave: [
      { testo: 'Ogni città è fatta della memoria di chi la guarda', tipo: 'idea' },
      { testo: 'La cornice: il dialogo fra Polo e il Khan', tipo: 'snodo' },
      { testo: 'Le città e i segni: leggere una città come un testo', tipo: 'concetto' }
    ],
    impressionePersonale: 'Un libro che si può aprire a caso. La struttura a incastro è un\'architettura, non un vezzo: le città si rispondono a distanza come stanze di una casa.',
    citazioni: [
      { testo: 'D\'una città non godi le sette o settantasette meraviglie, ma la risposta che dà a una tua domanda.', pagina: 44, capitolo: 'Le città e i desideri',
        contesto: 'La definizione di viaggio che porto con me da anni.', tag: ['città', 'desiderio'], preferita: true },
      { testo: 'L\'inferno dei viventi non è qualcosa che sarà: se ce n\'è uno, è quello che è già qui.', pagina: 164, capitolo: 'Ultimo capitolo',
        contesto: 'Il finale. La consolazione arriva subito dopo, ed è una consegna: cercare chi e cosa non è inferno, e dargli spazio.',
        tag: ['città', 'etica'], preferita: true },
      { testo: 'Le città come i sogni sono costruite di desideri e di paure.', pagina: 46,
        tag: ['città', 'desiderio'] }
    ]
  },
  {
    chiave: 'yourcenar',
    titolo: 'Memorie di Adriano',
    autore: ['Marguerite Yourcenar'],
    annoPubblicazione: 1951, annoLettura: 2024, editore: 'Einaudi', numeroPagine: 320,
    lingua: 'it',
    generi: ['romanzo storico'],
    temi: ['memoria', 'potere', 'morte'],
    valutazione: 5, stato: 'letto',
    trama: 'L\'imperatore Adriano, ormai malato, scrive al giovane Marco Aurelio una lunga lettera sulla propria vita: il potere, gli amori, la costruzione di un impero e l\'avvicinarsi della fine.',
    elementiChiave: [
      { testo: 'La lettera come forma del bilancio di una vita', tipo: 'concetto' },
      { testo: 'Antinoo e l\'invenzione del lutto', tipo: 'snodo' },
      { testo: 'Adriano: il potere esercitato come mestiere', tipo: 'personaggio' }
    ],
    impressionePersonale: 'Non è un romanzo storico, è un esercizio di voce. Yourcenar ci ha messo trent\'anni e si sente in ogni frase: nessuna è messa lì per caso.',
    citazioni: [
      { testo: 'Costruire significa collaborare con la terra.', pagina: 121,
        contesto: 'Adriano parla delle sue architetture, ma sta parlando di come si sta al mondo.',
        tag: ['potere', 'costruire'] },
      { testo: 'Cerchiamo di entrare nella morte a occhi aperti.', pagina: 316,
        contesto: 'L\'ultima riga. Da rileggere una volta all\'anno.', tag: ['morte'], preferita: true }
    ]
  },
  {
    chiave: 'sebald',
    titolo: 'Austerlitz',
    autore: ['W. G. Sebald'],
    annoPubblicazione: 2001, annoLettura: 2025, editore: 'Adelphi', numeroPagine: 316,
    lingua: 'it',
    generi: ['narrativa', 'letteratura tedesca'],
    temi: ['memoria', 'testimonianza', 'città'],
    valutazione: 4.5, stato: 'letto',
    trama: 'Jacques Austerlitz, storico dell\'architettura, ricostruisce a poco a poco la propria infanzia perduta: era stato mandato in Inghilterra da bambino con un Kindertransport.',
    elementiChiave: [
      { testo: 'Le fotografie inserite nel testo come prove incerte', tipo: 'concetto' },
      { testo: 'Le stazioni: architetture della partenza', tipo: 'idea' },
      { testo: 'Il ritrovamento del nome e della lingua materna', tipo: 'snodo' }
    ],
    impressionePersonale: 'La frase lunghissima di Sebald imita il modo in cui torna un ricordo: per associazioni, senza punti fermi. Dopo cento pagine ci si abitua e non si vorrebbe più smettere.',
    citazioni: [
      { testo: 'Mi sembra che il tempo non esista affatto, ma soltanto spazi incastrati l\'uno nell\'altro.', pagina: 197,
        contesto: 'La tesi del libro detta in una riga sola.', tag: ['memoria', 'tempo'], preferita: true },
      { testo: 'Non ho mai posseduto un orologio di alcun genere.', pagina: 143,
        contesto: 'Austerlitz si sottrae al tempo misurato: è coerente con tutto il resto.', tag: ['tempo'] }
    ]
  },
  {
    chiave: 'ginzburg',
    titolo: 'Lessico famigliare',
    autore: ['Natalia Ginzburg'],
    annoPubblicazione: 1963, annoLettura: 2022, editore: 'Einaudi', numeroPagine: 224,
    generi: ['memorialistica', 'letteratura italiana'],
    temi: ['famiglia', 'memoria', 'linguaggio'],
    valutazione: 4, stato: 'letto',
    trama: 'La storia di una famiglia torinese antifascista raccontata attraverso le frasi che vi si ripetevano: modi di dire, rimproveri, tormentoni che funzionano da collante.',
    elementiChiave: [
      { testo: 'Le frasi di famiglia come lingua privata', tipo: 'idea' },
      { testo: 'Il padre Giuseppe Levi e i suoi "sbrodeghezzi"', tipo: 'personaggio' },
      { testo: 'La guerra vista dal di dentro di una casa', tipo: 'snodo' }
    ],
    impressionePersonale: 'Mi ha fatto pensare a quante frasi ci sono in casa mia che nessuno capirebbe da fuori. La memoria familiare è fatta di formule, non di racconti.',
    citazioni: [
      { testo: 'Basta una di quelle frasi perché ci riconosciamo, noi fratelli, nel buio d\'una grotta.',
        pagina: 22, contesto: 'La definizione stessa di lessico famigliare: una lingua che vale come una parola d\'ordine.',
        tag: ['famiglia', 'linguaggio'], preferita: true },
      { testo: 'I luoghi, le persone e le parole della nostra infanzia hanno un potere che nulla eguaglia.',
        pagina: 30, tag: ['memoria', 'famiglia'] }
    ]
  }
];

const COLLEGAMENTI = [
  { a: 'levi', b: 'sebald', tipo: 'tema', forza: 3,
    nota: 'Due modi opposti di dire la stessa cosa: Levi testimonia con la cronaca, Sebald con la digressione. Insieme raccontano cosa fa il tempo alla memoria del trauma.' },
  { a: 'calvino', b: 'sebald', tipo: 'stile', forza: 2,
    nota: 'Entrambi costruiscono città come dispositivi della memoria. Calvino le inventa, Sebald le percorre davvero: il risultato assomiglia.' },
  { a: 'levi', b: 'ginzburg', tipo: 'personale', forza: 2,
    nota: 'Stessa Torino, stessa casa editrice, stessi anni. Letti uno dopo l\'altro sembrano due stanze dello stesso appartamento.' },
  { a: 'yourcenar', b: 'calvino', tipo: 'stile', forza: 2,
    nota: 'La prosa costruita come architettura. In tutti e due la frase è un edificio, non un flusso.' },
  { a: 'yourcenar', b: 'sebald', tipo: 'contrasto', forza: 1,
    nota: 'Adriano ricorda per lasciare un ordine; Austerlitz ricorda per non impazzire. Il ricordo come bilancio contro il ricordo come ferita.' }
];

export async function caricaDatiDimostrativi () {
  const perChiave = {};
  for (const def of LIBRI) {
    const { citazioni, chiave, ...campi } = def;
    const l = nuovoLibro({ ...campi, demo: true });
    await store.salvaLibro(l);
    perChiave[chiave] = l;
    for (const c of citazioni) {
      await store.salvaCitazione(nuovaCitazione({ ...c, libroId: l.id, demo: true }));
    }
  }
  for (const def of COLLEGAMENTI) {
    const a = perChiave[def.a], b = perChiave[def.b];
    if (!a || !b) continue;
    await store.salvaCollegamento(nuovoCollegamento({
      libroA_id: a.id, libroB_id: b.id, tipo: def.tipo, nota: def.nota, forza: def.forza, demo: true
    }));
  }
  return LIBRI.length;
}

export function contaDatiDimostrativi () {
  return store.stato.libri.filter(l => l.demo).length;
}

export async function togliDatiDimostrativi () {
  const demo = store.stato.libri.filter(l => l.demo);
  for (const l of demo) await store.eliminaLibro(l.id);
  return demo.length;
}
