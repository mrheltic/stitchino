import {
  GlobalWorkerOptions,
  PasswordResponses,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { pageTextFromPdfJs, type PageText } from '../../core/pdf/import/analyze.ts';

// The legacy build also runs on older iPads; PDF.js parses in its own worker.
GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfPasswordError extends Error {
  readonly incorrect: boolean;
  constructor(incorrect: boolean) {
    super(incorrect ? 'Incorrect PDF password' : 'PDF needs a password');
    this.name = 'PdfPasswordError';
    this.incorrect = incorrect;
  }
}

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  pages: PageText[];
  title?: string;
  /** Frees the document and PDF.js's worker. */
  close: () => Promise<void>;
}

/** Opens a PDF and extracts the text of every page, reporting progress page by page. */
export async function readPdf(
  bytes: Uint8Array,
  password: string | undefined,
  onProgress: (done: number, total: number) => void,
): Promise<LoadedPdf> {
  let doc: PDFDocumentProxy;
  // A copy, since PDF.js hands the buffer over to its worker. No forms or scripts are run.
  const task = getDocument({ data: bytes.slice(), password, enableXfa: false });
  try {
    doc = await task.promise;
  } catch (e) {
    void task.destroy();
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException')
      throw new PdfPasswordError(err.code === PasswordResponses.INCORRECT_PASSWORD);
    throw e;
  }
  const pages: PageText[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [x0, y0, x1, y1] = page.view;
    const content = await page.getTextContent();
    pages.push(pageTextFromPdfJs(content.items, x1 - x0, y1 - y0));
    page.cleanup();
    onProgress(i, doc.numPages);
  }
  const meta = await doc.getMetadata().catch(() => null);
  const title = (meta?.info as { Title?: unknown } | undefined)?.Title;
  return {
    doc,
    pages,
    title: typeof title === 'string' && title.trim() ? title.trim() : undefined,
    close: () => task.destroy(),
  };
}

/** A page drawn into a canvas `width` CSS pixels wide; returns PDF units → pixels scale. */
export async function renderPage(
  doc: PDFDocumentProxy,
  index: number,
  canvas: HTMLCanvasElement,
  width: number,
): Promise<number> {
  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const dpr = window.devicePixelRatio || 1;
  const scale = width / base.width;
  const viewport = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${(viewport.height / dpr).toFixed(1)}px`;
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return scale;
}
