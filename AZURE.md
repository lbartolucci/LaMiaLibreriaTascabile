# Collegare l'app a OneDrive

Serve solo se vuoi la **sincronizzazione diretta** (livello 2). Senza, l'app funziona uguale e il backup su file resta la tua rete di sicurezza.

Si fa una volta sola, dura cinque minuti, ed è gratis: l'app che registri è tua e resta tua.

---

## Cosa stai per fare

Microsoft non lascia che un programma qualsiasi scriva sul tuo OneDrive. Per farlo devi *registrare* l'applicazione presso Microsoft, che ti restituisce un codice identificativo — il **Client ID**. Quel codice lo incolli nelle Impostazioni dell'app e basta: non è una password, non è un segreto, e da solo non dà accesso a niente. L'autorizzazione vera la dai tu con il tuo account, quando l'app te la chiede.

Il permesso che l'app chiede si chiama **Files.ReadWrite.AppFolder**, ed è il più stretto che Microsoft offra per OneDrive: crea una cartella dedicata all'app e vede soltanto quella. Il resto del tuo OneDrive — documenti, foto, tutto — resta invisibile.

---

## Prima di cominciare

Ti serve **l'indirizzo esatto** a cui gira l'app. Se hai seguito la guida principale è qualcosa come:

```
https://TUONOME.github.io/libreria/index.html
```

Aprila nel browser, guarda la barra degli indirizzi e **copia tutto quello che viene prima del `#`**. Quella è la stringa da usare sotto, e deve combaciare carattere per carattere: se registri `.../libreria/` e l'app gira su `.../libreria/index.html`, Microsoft rifiuta l'accesso senza pietà.

> In Impostazioni → Sincronizzazione con OneDrive, l'app ti mostra da sola l'indirizzo che userà. Se c'è, fidati di quello.

---

## Passo per passo

1. Vai su **[portal.azure.com](https://portal.azure.com)** e accedi con lo stesso account Microsoft del tuo OneDrive.

2. Nella barra di ricerca in alto scrivi **Microsoft Entra ID** e aprilo. (È il servizio che una volta si chiamava Azure Active Directory: se trovi quel nome, è lo stesso posto.)

3. Nel menu di sinistra: **Gestisci → Registrazioni app**, poi in alto **+ Nuova registrazione**.

4. Compila così:

   - **Nome**: `La mia libreria tascabile` — è solo un'etichetta per te, la vedrai nella schermata di consenso.
   - **Tipi di account supportati**: scegli **«Account in qualsiasi directory organizzativa e account Microsoft personali»**. È la voce che comprende gli account personali `@outlook.com` / `@live.it` / `@hotmail.it`. Se scegli una delle altre, l'accesso fallirà con un messaggio poco chiaro.
   - **URI di reindirizzamento**: dal menu a tendina scegli **Applicazione a pagina singola (SPA)** — non «Web», non «App per dispositivi mobili». Nel campo accanto incolla l'indirizzo dell'app, per esempio `https://TUONOME.github.io/libreria/index.html`.

5. Premi **Registra**.

6. Nella pagina che si apre (**Panoramica**) trovi **ID applicazione (client)**: è una stringa tipo `3f7c1a92-...`. **Copiala.**

7. Torna sull'app → **Impostazioni → Sincronizzazione con OneDrive**, incolla il Client ID nel campo e tocca fuori dal campo per salvarlo.

8. Compare il pulsante **Collega OneDrive**: toccalo. Vieni mandato da Microsoft, accedi, e ti viene chiesto se acconsenti a far usare all'app la sua cartella. Accetta: torni sull'app già collegato.

---

## Se vuoi usarla anche in locale

Durante le prove l'app gira su `http://localhost:8000`. Microsoft accetta `localhost` in HTTP come eccezione, ma l'indirizzo va aggiunto:

**Registrazioni app → la tua app → Autenticazione → Aggiungi URI** (sotto la piattaforma SPA), e metti `http://localhost:8000/index.html`.

Puoi tenerne registrati quanti vuoi: uno per l'indirizzo pubblico, uno per il locale.

---

## Come si usa, una volta collegato

In Impostazioni compaiono due pulsanti:

- **Manda su OneDrive** — scrive il file `libreria.json` nella cartella dell'app.
- **Prendi da OneDrive** — lo rilegge e ti mostra **l'anteprima delle differenze** prima di toccare qualsiasi cosa, con le stesse tre modalità dell'import da file.

La scrittura **non è mai cieca**: prima di sovrascrivere, l'app controlla se il file remoto è cambiato dopo l'ultima sincronizzazione che conosce. Se è cambiato — tipicamente perché hai usato l'app su un altro dispositivo — si ferma e ti chiede cosa fare: prendere il remoto e unire, sovrascrivere con quello che hai lì, o lasciar perdere.

---

## Problemi tipici

| Messaggio | Cosa vuol dire |
|---|---|
| `AADSTS50011: The redirect URI ... does not match` | L'indirizzo registrato non combacia. Controlla `/index.html` finale, `http` contro `https`, la sottocartella, la barra finale. |
| `AADSTS700016: Application not found` | Il Client ID è sbagliato o incollato a metà. Ricopialo dalla Panoramica. |
| `AADSTS9000102` o l'accesso non parte | Hai registrato la piattaforma come «Web» invece che «SPA». Vai in Autenticazione, togli quella e riaggiungila come applicazione a pagina singola. |
| Non compaiono gli account personali | Al passo 4 hai scelto il tipo di account sbagliato. Si cambia in **Autenticazione → Tipi di account supportati**. |
| «L'autorizzazione è scaduta» | Normale dopo un lungo periodo di inattività: tocca di nuovo **Collega OneDrive**. |

---

## Se cambi idea

**Impostazioni → Scollega l'account** cancella i gettoni dal telefono. Per revocare il permesso dal lato Microsoft: [account.microsoft.com/privacy/app-access](https://account.microsoft.com/privacy/app-access). Per cancellare del tutto la registrazione: Azure → Registrazioni app → la tua app → **Elimina**.

---

## Una nota sui gettoni

I gettoni di accesso vengono conservati nel database locale dell'app, dentro il tuo browser, come fa qualunque applicazione web di questo tipo. Non escono da lì e non passano da nessun server mio — non esiste un server mio: l'app parla direttamente con Microsoft. Se il telefono è tuo e protetto, è a posto; se è un dispositivo condiviso, meglio lasciar perdere il livello 2 e usare il backup su file.
