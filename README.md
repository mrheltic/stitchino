# Stitchino

**Le tue foto, punto dopo punto.** Stitchino trasforma una foto in uno schema a punto croce, lo
stampa e ti accompagna mentre ricami. È gratis, senza limiti e senza account: tutto funziona nel
browser, anche offline, e le foto non lasciano mai il dispositivo.

> Stato: beta (0.9). Mancano le prove sul campo con chi ricama: vedi «Da verificare» più sotto.

## Cosa fa

- **Da foto a schema**: ritaglio e regolazioni, sfondo da non ricamare, dimensione in punti o in cm,
  numero di colori consigliato, abbinamento percettivo ai fili DMC e Anchor (CIEDE2000), dithering,
  pulizia dei punti isolati, varianti a confronto. Può usare solo i fili che hai, o preferirli.
- **Editor completo**: punto intero, mezzo punto, quarti e tre quarti, punto scritto, nodini, testo,
  selezioni, simmetrie, sostituzione e fusione dei colori, annulla e ripeti, salvataggio automatico.
- **Dimensione reale**: anteprima ricamata, in cornice e nel telaio, misure, tela da comprare, lista
  della spesa (con quello che hai già), stampa in scala 1:1 con righello di controllo.
- **PDF ed esportazioni**: PDF con copertina, legenda e matasse stimate, pagine con griglia ogni 10
  e mappa; preset compatibile con Pattern Keeper; PNG; OXS in lettura e scrittura; file di progetto.
- **Modalità ricamo** per tablet e telefono: segni i punti con un tocco, un trascinamento, un
  rettangolo o un'area; colore attivo, prossimo punto da fare, parcheggi, avanzamento giornaliero e
  data di fine stimata, schermo sempre acceso.
- **I miei fili**: inventario con import/export CSV.
- **PDF di altri designer**: lettura dei PDF con simboli testuali (quelli per Pattern Keeper), con
  schermata di verifica; restano per uso personale.
- **Guida** per chi inizia e glossario; copia di sicurezza completa; italiano e inglese; tema scuro.

## Pubblicare il sito (GitHub Pages)

Il sito è statico: basta un hosting di file. Il workflow `.github/workflows/ci.yml` controlla il
codice a ogni push e, sul ramo `main`, pubblica la build su GitHub Pages. Costo: zero.

1. Crea su GitHub un repository **pubblico**, per esempio `stitchino`.
2. Collega e carica il progetto:
   ```sh
   git remote add origin https://github.com/<utente>/stitchino.git
   git push -u origin main
   ```
3. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Al termine del workflow il sito è su `https://<utente>.github.io/stitchino/`.

Le pagine usano percorsi relativi e il routing con `#`, quindi funzionano anche in una
sottocartella, senza configurazioni del server.

**Dominio proprio (facoltativo).** Compra un dominio (per esempio `stitchino.app` o `stitchino.it`,
circa 10–20 € l'anno), poi in **Settings → Pages → Custom domain** inseriscilo e crea dal registrar i
record DNS indicati da GitHub (`CNAME` verso `<utente>.github.io` per un sottodominio, oppure i
record `A`/`AAAA` per il dominio principale). Attiva **Enforce HTTPS**.

## Donazioni

L'app non ha pubblicità né tracciamento. L'unica richiesta di sostegno è la pagina «Sostieni
Stitchino» (link a piè di pagina) e una riga di ringraziamento dopo un'esportazione, dalla terza in
poi, al massimo ogni quattro mesi e disattivabile per sempre.

1. Crea gli account che vuoi: [Ko-fi](https://ko-fi.com) (donazioni singole),
   [GitHub Sponsors](https://github.com/sponsors) (mensili) e/o [Liberapay](https://liberapay.com)
   (ricorrenti, senza commissioni della piattaforma).
2. Inserisci i link in `src/core/brand.ts` (`LINKS`): finché un link è vuoto l'app non lo mostra.
3. Togli il commento alle righe giuste in `.github/FUNDING.yml` per il pulsante «Sponsor» del
   repository.

## Sviluppo

Requisiti: Node.js 22 o successivo.

```sh
npm install
npm run dev          # server di sviluppo
npm test             # test unitari (Vitest)
npm run e2e          # test end-to-end (Playwright; in locale usa Chrome installato)
npm run lint && npm run typecheck
npm run build        # build di produzione in dist/
```

Dati generati (da rifare solo quando cambiano le sorgenti):

```sh
npm run build:threads   # src/core/threads/data/*.json dai cataloghi KXStitch
npm run build:font      # public/fonts/pc-symbols.ttf (serve Python 3 con fontTools)
```

Struttura: `src/core` contiene la logica pura (colore, fili, conversione, misure, PDF, avanzamento),
testabile senza browser; `src/render` il disegno su canvas; `src/storage` IndexedDB; `src/ui`
l'interfaccia React. Nome e link del progetto sono in `src/core/brand.ts`. «PuntoCroce» era il nome
di lavoro: resta nei nomi interni dell'archivio, così i dati salvati restano leggibili.

## Da verificare con chi ricama

- PDF in preset Pattern Keeper aperto nell'app su Android: simboli evidenziabili, legenda
  riconosciuta, conteggi uguali.
- Stima delle matasse (circa 1.650 punti per matassa su Aida 14 con 2 capi): da tarare con un
  campione ricamato.
- Lettura di PDF comprati da designer diversi (WinStitch, PCStitch, Pic2Pat…): i PDF di prova vanno
  in `test-corpus/`, che è escluso dal repository.
- Stampa 1:1: il righello di controllo deve misurare 5 cm.

## English

Stitchino turns photos into cross-stitch patterns, prints them and tracks your stitching. It is a
free, open-source progressive web app: no account, no server, works offline, and your photos never
leave your device. It reads Pattern Keeper-style PDFs for personal stitching, keeps a thread stash,
and the interface is available in Italian and English. See the sections above to build, test and
deploy it to GitHub Pages.

## Licenza / Licence

Codice: [GNU GPL v3.0 o successiva](LICENSE). Font dei simboli: SIL Open Font License 1.1.
Componenti e dati di terze parti: vedi [THIRD_PARTY.md](THIRD_PARTY.md).

DMC e Anchor sono marchi dei rispettivi titolari. Stitchino usa solo i codici dei colori come
riferimento e non è affiliato ai produttori. I colori a schermo sono approssimazioni.
