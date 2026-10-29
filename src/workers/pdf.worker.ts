import { expose, transfer } from 'comlink';
import type { Pattern } from '../core/model/pattern.ts';
import { chartPdf, type ChartPdfOptions } from '../core/pdf/export/chartPdf.ts';

const api = {
  async chart(pattern: Pattern, options: ChartPdfOptions): Promise<Uint8Array> {
    const bytes = await chartPdf(pattern, options);
    return transfer(bytes, [bytes.buffer]);
  },
};

export type PdfWorkerApi = typeof api;

expose(api);
