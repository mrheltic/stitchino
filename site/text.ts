/** Texts of the static pages. English first: it's the language most visitors search in. */
export type Lang = 'en' | 'it';

export const LANGS: Lang[] = ['en', 'it'];

/** Page folders, relative to the app. */
export const PATHS = {
  landing: { en: 'photo-to-cross-stitch-pattern/', it: 'it/schema-punto-croce-da-foto/' },
  patterns: { en: 'patterns/', it: 'it/schemi/' },
} as const;

type Pair = readonly [title: string, text: string];

export interface SiteText {
  language: string;
  openApp: string;
  freePatterns: string;
  guide: string;
  privacy: string;
  code: string;
  support: string;
  footerNote: string;
  landing: {
    title: string;
    description: string;
    h1: string;
    lead: string;
    heroAlt: string;
    howTitle: string;
    steps: Pair[];
    featuresTitle: string;
    features: Pair[];
    privacyTitle: string;
    privacyText: string;
    faqTitle: string;
    faq: Pair[];
    ctaTitle: string;
    ctaText: string;
  };
  patterns: {
    title: string;
    description: string;
    h1: string;
    lead: string;
    size: (w: number, h: number) => string;
    colours: (n: number) => string;
  };
  pattern: {
    title: (name: string) => string;
    description: (name: string, w: number, h: number, colours: number, brand: string) => string;
    kicker: string;
    original: string;
    stitched: string;
    size: string;
    finished: string;
    colours: string;
    stitches: string;
    download: string;
    a4: string;
    letter: string;
    patternKeeper: string;
    customize: string;
    customizeHint: string;
    threads: string;
    threadColumns: readonly [string, string, string];
    licence: string;
    supportText: string;
    supportLink: string;
    more: string;
  };
}

export const TEXT: Record<Lang, SiteText> = {
  en: {
    language: 'English',
    openApp: 'Open Stitchino',
    freePatterns: 'Free patterns',
    guide: 'Guide',
    privacy: 'Privacy',
    code: 'Code on GitHub',
    support: 'Support Stitchino',
    footerNote: 'Stitchino is free software (GPL-3.0). No ads, no account, no tracking.',
    landing: {
      title: 'Free photo to cross stitch pattern maker · Stitchino',
      description:
        'Turn any photo into a cross-stitch pattern for free: DMC or Anchor threads, a printable PDF with a Pattern Keeper preset, a real-size preview and a stitching mode. No ads, no account, works offline.',
      h1: 'Turn a photo into a cross-stitch pattern, free',
      lead: 'Pick a photo, choose how big you want it, and Stitchino draws the chart with real DMC or Anchor thread colours. Print it as a PDF, or keep it open on your tablet and mark stitches as you go. There are no ads and no account, and your photo never leaves your device.',
      heroAlt:
        'A drawing of a lighthouse at sunset, the cross-stitch chart Stitchino made from it, and a preview of the stitched result',
      howTitle: 'How it works',
      steps: [
        [
          'Choose a photo',
          'Crop it, tweak brightness and contrast, and remove the background with a click if you only want the subject.',
        ],
        [
          'Pick the size and the colours',
          'Set the size in stitches or centimetres. Stitchino suggests how many colours to use and shows three versions side by side.',
        ],
        [
          'Print it or stitch it',
          'Download the PDF, open it in Pattern Keeper, or mark your progress in Stitchino as you stitch.',
        ],
      ],
      featuresTitle: 'What you get',
      features: [
        [
          'Real thread colours',
          'DMC and Anchor, matched by how close they look, with the equivalent in the other brand.',
        ],
        [
          'A PDF ready to print',
          'Cover, key with skein counts, a grid every 10 stitches and a page map. One preset is made for Pattern Keeper.',
        ],
        [
          'Real-size preview',
          'See it stitched on Aida, evenweave or linen, framed or in a hoop, with the fabric to buy and a shopping list.',
        ],
        [
          'A full editor',
          'Half, quarter and three-quarter stitches, backstitch, French knots and text, and you can undo anything.',
        ],
        [
          'Stitching mode',
          'Tap or drag to mark stitches on a phone or tablet, and see your daily progress and a likely finish date.',
        ],
        ['Your thread stash', 'Keep a list of the skeins you own and make patterns that use them.'],
      ],
      privacyTitle: 'Your photos stay with you',
      privacyText:
        'Stitchino runs entirely in your browser. Photos and projects are saved on your device and nothing is uploaded. There are no accounts, cookies or trackers, and the code is open source.',
      faqTitle: 'Questions',
      faq: [
        [
          'Is it really free?',
          'Yes. There are no limits on size, colours or PDFs, and no ads. Stitchino is open source and runs on donations.',
        ],
        [
          'Do I need to install anything?',
          'No, it works in the browser on computers, tablets and phones. You can also install it from the browser as an app and use it offline.',
        ],
        [
          'Does it work with Pattern Keeper?',
          'When you export, choose the “For Pattern Keeper” PDF: it follows the format Pattern Keeper reads.',
        ],
        [
          'Which threads does it use?',
          'DMC or Anchor, with the closest match in the other brand. Colours on screen are approximations, so check them against a colour card.',
        ],
        [
          'Does it use AI?',
          "No. Stitchino doesn't generate pictures: it matches the colours of your own photo to real thread colours, one stitch at a time.",
        ],
      ],
      ctaTitle: 'Try it with your own photo',
      ctaText:
        "It takes a couple of minutes, and you can start from an example picture if you don't have one ready.",
    },
    patterns: {
      title: 'Free cross stitch patterns (PDF) · Stitchino',
      description:
        'Free cross-stitch patterns to download as PDF, made with Stitchino. Open any of them in Stitchino to change the size and the colours.',
      h1: 'Free cross stitch patterns',
      lead: 'Patterns made with Stitchino, free to download and stitch. Open one in Stitchino to change its size, colours or fabric.',
      size: (w, h) => `${w} × ${h} stitches`,
      colours: (n) => `${n} colours`,
    },
    pattern: {
      title: (name) => `${name} · free cross stitch pattern (PDF) · Stitchino`,
      description: (name, w, h, n, brand) =>
        `Free cross stitch pattern: ${name}, ${w} × ${h} stitches, ${n} ${brand} colours. Download the PDF or open it in Stitchino to change the size and colours.`,
      kicker: 'Free cross stitch pattern',
      original: 'Original picture',
      stitched: 'Stitched preview',
      size: 'Size',
      finished: 'Finished size on 14-count Aida',
      colours: 'Colours',
      stitches: 'Stitches',
      download: 'Download the PDF',
      a4: 'A4',
      letter: 'US Letter',
      patternKeeper: 'For Pattern Keeper',
      customize: 'Change the size or colours in Stitchino',
      customizeHint: 'Opens Stitchino with this picture, ready to convert again.',
      threads: 'Threads',
      threadColumns: ['Thread', 'Name', 'Stitches'],
      licence:
        "Free for personal use: stitch it, give it as a gift, share the link. Please don't sell the pattern.",
      supportText: 'Did you enjoy this pattern?',
      supportLink: 'Buy Stitchino a coffee',
      more: 'More free patterns',
    },
  },
  it: {
    language: 'Italiano',
    openApp: 'Apri Stitchino',
    freePatterns: 'Schemi gratuiti',
    guide: 'Guida',
    privacy: 'Privacy',
    code: 'Codice su GitHub',
    support: 'Sostieni Stitchino',
    footerNote:
      'Stitchino è software libero (GPL-3.0). Niente pubblicità, niente account, nessun tracciamento.',
    landing: {
      title: 'Schema punto croce da foto, gratis · Stitchino',
      description:
        'Trasforma una foto in uno schema a punto croce gratis: fili DMC o Anchor, PDF da stampare (anche per Pattern Keeper), anteprima a grandezza reale e modalità ricamo. Senza pubblicità, senza account, funziona offline.',
      h1: 'Trasforma una foto in uno schema a punto croce, gratis',
      lead: 'Scegli una foto, decidi quanto grande lo vuoi e Stitchino disegna lo schema con i colori veri dei fili DMC o Anchor. Lo stampi in PDF, oppure lo tieni aperto sul tablet e segni i punti mentre ricami. Niente pubblicità, niente account, e la foto non lascia mai il tuo dispositivo.',
      heroAlt:
        "Il disegno di un faro al tramonto, lo schema a punto croce creato da Stitchino e l'anteprima del risultato ricamato",
      howTitle: 'Come funziona',
      steps: [
        [
          'Scegli una foto',
          'Ritagliala, regola luminosità e contrasto e, se vuoi solo il soggetto, togli lo sfondo con un clic.',
        ],
        [
          'Scegli misura e colori',
          'Imposta la misura in punti o in centimetri. Stitchino ti suggerisce quanti colori usare e ti mostra tre versioni a confronto.',
        ],
        [
          'Stampa o ricama',
          'Scarica il PDF, aprilo in Pattern Keeper, oppure segna i punti fatti direttamente in Stitchino.',
        ],
      ],
      featuresTitle: 'Cosa ottieni',
      features: [
        [
          'I colori veri dei fili',
          "DMC e Anchor, scelti in base a quanto si somigliano a occhio, con l'equivalente nell'altra marca.",
        ],
        [
          'Un PDF pronto da stampare',
          "Copertina, legenda con le matasse, griglia ogni 10 punti e mappa delle pagine. C'è anche una versione per Pattern Keeper.",
        ],
        [
          'Anteprima a grandezza reale',
          'Lo vedi ricamato su Aida, Evenweave o lino, in cornice o nel telaio, con la tela da comprare e la lista della spesa.',
        ],
        [
          'Un editor completo',
          'Mezzi punti, quarti e tre quarti, punto scritto, nodini e testo, e puoi annullare qualsiasi cosa.',
        ],
        [
          'Modalità ricamo',
          'Tocca o trascina per segnare i punti dal telefono o dal tablet, e guarda i progressi di ogni giorno e quando probabilmente finirai.',
        ],
        ['I tuoi fili', "Tieni l'elenco delle matasse che hai e crea schemi che usano quelle."],
      ],
      privacyTitle: 'Le tue foto restano con te',
      privacyText:
        'Stitchino funziona tutto nel browser. Foto e progetti restano sul tuo dispositivo e non viene caricato niente. Non ci sono account, cookie o sistemi di tracciamento, e il codice è open source.',
      faqTitle: 'Domande',
      faq: [
        [
          'È davvero gratis?',
          'Sì. Nessun limite di misura, colori o PDF, e niente pubblicità. Stitchino è open source e vive di donazioni.',
        ],
        [
          'Devo installare qualcosa?',
          'No, funziona nel browser su computer, tablet e telefono. Se vuoi puoi anche installarlo come app dal browser e usarlo offline.',
        ],
        [
          'Funziona con Pattern Keeper?',
          'Quando esporti, scegli il PDF “Per Pattern Keeper”: segue il formato che Pattern Keeper legge.',
        ],
        [
          'Quali fili usa?',
          "DMC o Anchor, con l'equivalente più vicino nell'altra marca. I colori sullo schermo sono approssimazioni: controllali con la cartella colori.",
        ],
        [
          "Usa l'intelligenza artificiale?",
          'No. Stitchino non inventa immagini: abbina i colori della tua foto ai colori veri dei fili, punto per punto.',
        ],
      ],
      ctaTitle: 'Provalo con una tua foto',
      ctaText:
        'Ci vogliono un paio di minuti, e se non hai una foto pronta puoi partire da un esempio.',
    },
    patterns: {
      title: 'Schemi punto croce gratis (PDF) · Stitchino',
      description:
        'Schemi a punto croce gratuiti da scaricare in PDF, fatti con Stitchino. Aprili in Stitchino per cambiare misura e colori.',
      h1: 'Schemi a punto croce gratis',
      lead: 'Schemi fatti con Stitchino, gratis da scaricare e ricamare. Aprine uno in Stitchino per cambiarne misura, colori o tela.',
      size: (w, h) => `${w} × ${h} punti`,
      colours: (n) => `${n} colori`,
    },
    pattern: {
      title: (name) => `${name} · schema punto croce gratis (PDF) · Stitchino`,
      description: (name, w, h, n, brand) =>
        `Schema a punto croce gratuito: ${name}, ${w} × ${h} punti, ${n} colori ${brand}. Scarica il PDF o aprilo in Stitchino per cambiare misura e colori.`,
      kicker: 'Schema a punto croce gratuito',
      original: 'Immagine originale',
      stitched: 'Anteprima ricamata',
      size: 'Misura',
      finished: 'Misura finita su Aida 14',
      colours: 'Colori',
      stitches: 'Punti',
      download: 'Scarica il PDF',
      a4: 'A4',
      letter: 'US Letter',
      patternKeeper: 'Per Pattern Keeper',
      customize: 'Cambia misura o colori in Stitchino',
      customizeHint: 'Apre Stitchino con questa immagine, pronta da convertire di nuovo.',
      threads: 'Fili',
      threadColumns: ['Filo', 'Nome', 'Punti'],
      licence:
        'Gratis per uso personale: ricamalo, regalalo, condividi il link. Per favore non vendere lo schema.',
      supportText: 'Ti è piaciuto lo schema?',
      supportLink: 'Offri un caffè a Stitchino',
      more: 'Altri schemi gratuiti',
    },
  },
};
