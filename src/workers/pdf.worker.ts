import { expose, transfer } from 'comlink';
import type { Pattern } from '../core/model/pattern.ts';
import { chartPdf, type ChartPdfOptions } from '../core/pdf/export/chartPdf.ts';
import { standaloneT } from '../i18n/standalone.ts';
import { chartLabels } from '../ui/export/labels.ts';

/** Chart options without the labels, which hold functions and can't cross into a worker. */
export type ChartPdfJob = Omit<ChartPdfOptions, 'labels'> & { language: string };

const api = {
  async chart(pattern: Pattern, job: ChartPdfJob): Promise<Uint8Array> {
    const { language, ...options } = job;
    const labels = chartLabels(await standaloneT(language), language);
    const bytes = await chartPdf(pattern, { ...options, labels });
    return transfer(bytes, [bytes.buffer]);
  },
};

export type PdfWorkerApi = typeof api;

expose(api);
