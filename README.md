# PuntoCroce

Trasforma una foto in uno schema a punto croce, stampalo e segui il ricamo punto per punto.
Gratis, senza limiti e senza account: tutto funziona nel browser, anche offline, e le foto non
lasciano mai il dispositivo.

> Stato: in sviluppo. Il piano completo e le milestone sono descritti più sotto.

## Cosa fa (v1 in sviluppo)

- **Da foto a schema**: ritaglio e regolazioni, dimensione in punti o in cm, scelta del numero di colori,
  corrispondenza percettiva con i fili DMC e Anchor (CIEDE2000), dithering, pulizia dei punti isolati.
- **Editor completo**: punto intero, mezzo punto, quarti e tre quarti, punto scritto, nodini, testo,
  selezioni, sostituzione e fusione dei colori.
- **Dimensione reale**: misure finite e tela da comprare, anteprima ricamata realistica, stampa in scala 1:1.
- **PDF**: copertina, legenda con matasse stimate, pagine con griglia ogni 10; preset compatibile con
  Pattern Keeper.
- **Modalità ricamo**: su tablet o telefono segni i punti fatti, evidenzi un colore, vedi l'avanzamento.
- **Inventario fili** e **lettura dei PDF** di altri designer (uso personale).
- Interfaccia in **italiano** e **inglese**.

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

Struttura: `src/core` contiene la logica pura (colore, fili, conversione, misure, PDF), testabile senza
browser; `src/render` il disegno su canvas; `src/storage` IndexedDB; `src/ui` l'interfaccia React.

## English

PuntoCroce turns photos into cross-stitch patterns, prints them and tracks your stitching. It is a free,
open-source progressive web app: no account, no server, works offline, and your photos never leave your
device. The interface is available in Italian and English. See the commands above to build and test it.

## Licenza / Licence

Codice: [GNU GPL v3.0 o successiva](LICENSE). Font dei simboli: SIL Open Font License 1.1.
Componenti e dati di terze parti: vedi [THIRD_PARTY.md](THIRD_PARTY.md).

DMC e Anchor sono marchi dei rispettivi titolari. PuntoCroce usa solo i codici dei colori come
riferimento e non è affiliato ai produttori. I colori a schermo sono approssimazioni.
