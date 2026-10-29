import { wrap, type Remote } from 'comlink';
import type { PdfWorkerApi } from './pdf.worker.ts';

/** A short-lived worker per export keeps memory low between exports. */
export async function withPdfWorker<T>(fn: (api: Remote<PdfWorkerApi>) => Promise<T>): Promise<T> {
  const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await fn(wrap<PdfWorkerApi>(worker));
  } finally {
    worker.terminate();
  }
}
