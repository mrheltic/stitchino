import type { ReactNode } from 'react';
import { Bullets, Faq, Glossary, Steps, Tip } from './blocks.tsx';

export interface GuideSection {
  id: string;
  title: string;
  body: ReactNode;
}

export interface GuideContent {
  intro: string;
  sections: GuideSection[];
}

const it: GuideContent = {
  intro:
    'Tutto quello che serve per passare da una foto a un ricamo finito, anche se non hai mai preso un ago in mano.',
  sections: [
    {
      id: 'app',
      title: 'Come funziona Stitchino',
      body: (
        <Steps
          items={[
            <>
              <b>Crea lo schema.</b> Scegli una foto con un soggetto chiaro, ritagliala, regola luce
              e colori, decidi quanti punti dev'essere larga e quanti colori usare. Ogni colore
              viene abbinato al filo DMC o Anchor più simile.
            </>,
            <>
              <b>Sistemalo.</b> Nell'editor correggi i punti, togli quelli isolati, cambi un filo
              con un altro, aggiungi testo, punto scritto e nodini.
            </>,
            <>
              <b>Guarda la dimensione reale.</b> Vedi come verrà ricamato, in cornice o nel telaio,
              quanta tela comprare e la lista delle matasse.
            </>,
            <>
              <b>Stampa o ricama dal tablet.</b> Scarica il PDF dello schema, anche nella versione
              per Pattern Keeper, oppure apri la modalità ricamo: segni i punti fatti e vedi quanto
              manca.
            </>,
          ]}
        />
      ),
    },
    {
      id: 'materials',
      title: 'Cosa serve',
      body: (
        <>
          <Bullets
            items={[
              <>
                <b>Tela.</b> Per iniziare la più comoda è l'Aida, una tela a quadretti con i fori
                ben visibili. Il «count» dice quanti quadretti ci sono in un pollice (2,54 cm): con
                14 il ricamo viene di misura media, con 11 più grande e facile da contare, con 16 o
                18 più piccolo e fine. Evenweave e lino si ricamano di solito su 2 fili: un 28 count
                su 2 fili equivale a un Aida 14.
              </>,
              <>
                <b>Filo.</b> Il cotone mouliné è fatto di 6 capi che si separano. Sull'Aida 14 se ne
                usano di solito 2 per le crocette e 1 per il punto scritto: Stitchino suggerisce i
                capi giusti per la tela che scegli.
              </>,
              <>
                <b>Ago.</b> Un ago da ricamo a punta arrotondata (tapestry), n. 24 o 26 per l'Aida
                14: passa nei fori senza bucare la tela.
              </>,
              <>
                <b>Telaio.</b> Tiene la tela tesa e rende i punti regolari. Per i lavori grandi si
                usa un telaio a rulli, oppure si sposta il telaio man mano.
              </>,
              <>
                <b>Forbicine</b> appuntite per tagliare i fili.
              </>,
            ]}
          />
          <Tip>
            Compra la tela con almeno 5–8 cm di margine per lato: serve per il telaio e per
            incorniciare. In «Dimensione reale» trovi la misura esatta da chiedere.
          </Tip>
        </>
      ),
    },
    {
      id: 'reading',
      title: 'Leggere lo schema',
      body: (
        <Bullets
          items={[
            'Ogni quadretto dello schema è una crocetta sulla tela. Il simbolo (e il colore) dice quale filo usare; la legenda abbina ogni simbolo al codice del filo.',
            'Le linee più spesse ogni 10 quadretti aiutano a contare, e i numeri sui bordi indicano righe e colonne.',
            'Le frecce sui bordi indicano il centro dello schema.',
            'Nel PDF le pagine si uniscono come un puzzle: la mappa delle pagine dice quale parte c’è su ogni foglio, e le righe ripetute in grigio aiutano a raccordarle.',
            'Mezzi punti, quarti e tre quarti sono disegnati più piccoli dentro il quadretto; il punto scritto è una linea, i nodini sono pallini.',
          ]}
        />
      ),
    },
    {
      id: 'stitching',
      title: 'Ricamare',
      body: (
        <>
          <Steps
            items={[
              <>
                <b>Trova il centro della tela:</b> piegala in quattro e segna l'incrocio con uno
                spillo o qualche punto di imbastitura. Partendo dal centro dello schema (le frecce),
                il disegno finisce in mezzo alla tela.
              </>,
              <>
                <b>Prepara il filo:</b> tagliane circa 50 cm, separa i capi uno alla volta e rimetti
                insieme quelli che servono. I fili troppo lunghi si annodano e si consumano.
              </>,
              <>
                <b>Niente nodi:</b> lascia sul retro una codina di 2–3 cm e fermala sotto i primi
                punti. Con 2 capi puoi usare il cappio: prendi un solo capo lungo il doppio, piegalo
                a metà, infila le due punte nell'ago e al primo punto passa l'ago nell'asola sul
                retro.
              </>,
              <>
                <b>La crocetta:</b> fai una mezza croce (/) e poi coprila con l'altra diagonale (\).
                Le diagonali di sopra devono andare tutte nello stesso verso, così il lavoro viene
                uniforme. In una fila dello stesso colore puoi fare prima tutte le mezze croci e poi
                tornare indietro.
              </>,
              <>
                <b>Per finire un filo</b> passalo sotto 3 o 4 punti sul retro e taglialo.
              </>,
              <>
                <b>Punto scritto e nodini</b> si fanno alla fine, sopra le crocette.
              </>,
              <>
                <b>Segna i punti fatti:</b> sulla carta con un evidenziatore, oppure con la modalità
                ricamo su tablet o telefono.
              </>,
            ]}
          />
          <Tip>
            Un errore? Sfila i punti sbagliati con la punta dell'ago, piano, senza tirare la tela. A
            lavoro finito puoi lavare il ricamo a mano in acqua tiepida con poco sapone delicato e
            stirarlo al rovescio su un asciugamano, così i punti non si schiacciano.
          </Tip>
        </>
      ),
    },
    {
      id: 'faq',
      title: 'Domande frequenti',
      body: (
        <Faq
          items={[
            [
              'I colori sullo schermo non sono uguali ai fili',
              'Ogni schermo mostra i colori in modo un po’ diverso, e i produttori non pubblicano valori ufficiali: Stitchino usa valori approssimati. Prima di comprare, se puoi, confronta con una cartella colori vera o con le matasse in negozio.',
            ],
            [
              'Quante matasse servono?',
              'Stitchino stima il filo di ogni colore in base alla tela e ai capi, con un margine di sicurezza. Resta una stima: per i colori più usati prendine una in più.',
            ],
            [
              'Funziona con Pattern Keeper?',
              'Sì: esporta il PDF scegliendo «Per Pattern Keeper» e aprilo nell’app, anche con «Condividi» dal telefono. Pattern Keeper legge solo i punti interi.',
            ],
            [
              'Posso ricamare schemi che ho comprato?',
              'Se il PDF è compatibile con Pattern Keeper, sì: importalo e ricamalo in modalità ricamo. Resta per il tuo uso personale, e Stitchino non lo esporta né lo condivide.',
            ],
            [
              'Dove sono salvati i miei progetti?',
              'Solo nel browser di questo dispositivo, niente viene caricato online. Ogni tanto scarica una copia di sicurezza dalle Impostazioni; su iPhone e iPad installa Stitchino nella schermata Home.',
            ],
            [
              'Quanto può essere grande uno schema?',
              'Fino a 1000 punti per lato partendo da una foto e 1500 nell’editor. Con gli schemi molto grandi il PDF richiede qualche secondo in più.',
            ],
            [
              'Funziona senza internet?',
              'Sì, dopo la prima visita. Puoi anche installarlo come app dal menu del browser.',
            ],
          ]}
        />
      ),
    },
    {
      id: 'glossary',
      title: 'Glossario',
      body: (
        <Glossary
          items={[
            ['Aida', 'Tela a quadretti con i fori evidenti, la più facile per iniziare.'],
            [
              'Count (ct)',
              'Quadretti o fili della tela per pollice (2,54 cm). Più è alto, più il ricamo viene piccolo.',
            ],
            ['Evenweave, lino', 'Tele a trama fine e regolare, ricamate di solito su 2 fili.'],
            ['Su 2 fili', 'Ogni crocetta copre 2 fili della tela in larghezza e 2 in altezza.'],
            ['Capo', 'Uno dei 6 fili sottili che formano il cotone mouliné.'],
            ['Matassa', 'La confezione di filo, di solito 8 metri.'],
            ['Filato misto', 'Due colori diversi infilati insieme nello stesso ago.'],
            ['Mezzo punto', 'Solo la prima diagonale della crocetta.'],
            ['Quarto, tre quarti', 'Crocette frazionate, per contorni più morbidi.'],
            ['Punto scritto', 'Linea di punti dritti per contorni e scritte (backstitch).'],
            ['Nodino francese', 'Piccolo nodo in rilievo per occhi e dettagli.'],
            [
              'Punti isolati',
              'Crocette singole di un colore in mezzo ad altri («confetti»): lente da ricamare.',
            ],
            [
              'Parcheggio',
              'Il filo di un colore resta fermo sul davanti, fuori dalla zona di lavoro, pronto per il punto successivo.',
            ],
            ['Telaio', 'Cerchio o cornice che tiene tesa la tela.'],
            ['Ago tapestry', 'Ago a punta arrotondata, per le tele da ricamo.'],
          ]}
        />
      ),
    },
  ],
};

const en: GuideContent = {
  intro:
    "Everything you need to go from a photo to a finished piece, even if you've never held a needle.",
  sections: [
    {
      id: 'app',
      title: 'How Stitchino works',
      body: (
        <Steps
          items={[
            <>
              <b>Make the pattern.</b> Pick a photo with a clear subject, crop it, adjust light and
              colours, and choose how many stitches wide it should be and how many colours to use.
              Each colour is matched to the closest DMC or Anchor thread.
            </>,
            <>
              <b>Tidy it up.</b> In the editor you fix stitches, clean up isolated ones, swap a
              thread for another, and add text, backstitch and knots.
            </>,
            <>
              <b>See the real size.</b> Preview it stitched, framed or in a hoop, and see how much
              fabric to buy and how many skeins.
            </>,
            <>
              <b>Print it or stitch from a tablet.</b> Download the PDF chart, also in a Pattern
              Keeper version, or open stitching mode: mark what you've done and see what's left.
            </>,
          ]}
        />
      ),
    },
    {
      id: 'materials',
      title: 'What you need',
      body: (
        <>
          <Bullets
            items={[
              <>
                <b>Fabric.</b> Aida is the easiest to start with: a square-weave fabric with clear
                holes. The “count” is how many squares fit in an inch: 14-count gives a medium size,
                11 is bigger and easier to count, 16 or 18 smaller and finer. Evenweave and linen
                are usually stitched over 2 threads: 28-count over 2 matches 14-count Aida.
              </>,
              <>
                <b>Thread.</b> Stranded cotton has 6 strands you separate. On 14-count Aida you
                usually stitch crosses with 2 strands and backstitch with 1; Stitchino suggests the
                strands for the fabric you choose.
              </>,
              <>
                <b>Needle.</b> A blunt tapestry needle, size 24 or 26 for 14-count Aida: it goes
                through the holes without piercing the fabric.
              </>,
              <>
                <b>Hoop.</b> Keeps the fabric taut so stitches come out even. For big pieces use a
                scroll frame, or move the hoop as you go.
              </>,
              <>
                <b>Small sharp scissors</b> for cutting thread.
              </>,
            ]}
          />
          <Tip>
            Buy fabric with at least 5–8 cm (2–3 in) to spare on each side, for the hoop and for
            framing. “Real size” gives you the exact size to ask for.
          </Tip>
        </>
      ),
    },
    {
      id: 'reading',
      title: 'Reading the chart',
      body: (
        <Bullets
          items={[
            'Each square of the chart is one cross stitch on the fabric. The symbol (and colour) tells you which thread to use; the key matches each symbol to a thread number.',
            'Heavier lines every 10 squares help you count, and the numbers on the edges give rows and columns.',
            'The arrows on the edges point to the centre of the chart.',
            'PDF pages fit together like a puzzle: the page map shows which part is on each sheet, and rows repeated in grey help you join them.',
            'Half, quarter and three-quarter stitches are drawn smaller inside the square; backstitch is a line, French knots are dots.',
          ]}
        />
      ),
    },
    {
      id: 'stitching',
      title: 'Stitching',
      body: (
        <>
          <Steps
            items={[
              <>
                <b>Find the centre of the fabric:</b> fold it in four and mark the crossing with a
                pin or a few tacking stitches. Start from the centre of the chart (the arrows) and
                the design ends up in the middle of the fabric.
              </>,
              <>
                <b>Prepare the thread:</b> cut about 50 cm (20 in), separate the strands one at a
                time and put back together as many as you need. Longer threads tangle and wear.
              </>,
              <>
                <b>No knots:</b> leave a 2–3 cm tail at the back and catch it under your first
                stitches. With 2 strands you can use a loop start: take one strand twice as long,
                fold it, thread both ends, and on the first stitch pass the needle through the loop
                at the back.
              </>,
              <>
                <b>The cross:</b> make a half stitch (/) and cover it with the other diagonal (\).
                All top legs should go the same way, so the work looks even. In a row of one colour
                you can do all the half stitches first and come back.
              </>,
              <>
                <b>To end a thread,</b> run it under 3 or 4 stitches at the back and cut.
              </>,
              <>
                <b>Backstitch and knots</b> come last, on top of the crosses.
              </>,
              <>
                <b>Mark what you've done:</b> on paper with a highlighter, or in stitching mode on a
                tablet or phone.
              </>,
            ]}
          />
          <Tip>
            A mistake? Unpick the stitches gently with the tip of the needle, without pulling the
            fabric. When you finish, you can hand-wash the piece in lukewarm water with a little
            mild soap and iron it face down on a towel, so the stitches stay raised.
          </Tip>
        </>
      ),
    },
    {
      id: 'faq',
      title: 'Questions',
      body: (
        <Faq
          items={[
            [
              "The colours on screen don't match the threads",
              "Every screen shows colours a little differently, and makers don't publish official values: Stitchino uses approximations. Before buying, compare with a real colour card or the skeins in a shop if you can.",
            ],
            [
              'How many skeins do I need?',
              'Stitchino estimates the thread for each colour from the fabric and strands, with a safety margin. It is still an estimate: get one extra for the colours you use most.',
            ],
            [
              'Does it work with Pattern Keeper?',
              'Yes: export the PDF choosing “For Pattern Keeper” and open it in the app, or send it with “Share” from your phone. Pattern Keeper reads full stitches only.',
            ],
            [
              'Can I stitch patterns I bought?',
              "If the PDF works with Pattern Keeper, yes: import it and stitch it in stitching mode. It stays for your personal use, and Stitchino won't export or share it.",
            ],
            [
              'Where are my projects saved?',
              'Only in this browser on this device; nothing is uploaded. Download a backup from Settings now and then, and on iPhone or iPad add Stitchino to the Home Screen.',
            ],
            [
              'How big can a pattern be?',
              'Up to 1000 stitches per side from a photo and 1500 in the editor. Very big patterns take a few more seconds to make a PDF.',
            ],
            [
              'Does it work offline?',
              "Yes, after the first visit. You can also install it as an app from the browser's menu.",
            ],
          ]}
        />
      ),
    },
    {
      id: 'glossary',
      title: 'Glossary',
      body: (
        <Glossary
          items={[
            ['Aida', 'Square-weave fabric with clear holes, the easiest to start with.'],
            [
              'Count (ct)',
              'Squares or fabric threads per inch. The higher, the smaller the piece.',
            ],
            ['Evenweave, linen', 'Fine, even-weave fabrics, usually stitched over 2 threads.'],
            ['Over 2', 'Each cross covers 2 fabric threads across and 2 down.'],
            ['Strand', 'One of the 6 fine threads that make up stranded cotton.'],
            ['Skein', 'A pack of thread, usually 8 metres (8.7 yards).'],
            ['Blend', 'Two different colours threaded together in the same needle.'],
            ['Half stitch', 'Just the first diagonal of the cross.'],
            ['Quarter, three-quarter', 'Fractional stitches, for smoother outlines.'],
            ['Backstitch', 'A line of straight stitches for outlines and lettering.'],
            ['French knot', 'A small raised knot for eyes and details.'],
            ['Confetti', 'Single stitches of one colour among others: slow to stitch.'],
            [
              'Parking',
              'Leaving a colour’s thread on the front, outside the area you are working, ready for its next stitch.',
            ],
            ['Hoop', 'A ring or frame that keeps the fabric taut.'],
            ['Tapestry needle', 'A needle with a blunt tip, for embroidery fabrics.'],
          ]}
        />
      ),
    },
  ],
};

export function guideContent(lng: string | undefined): GuideContent {
  return lng === 'it' ? it : en;
}
