import type { ChartLabels } from '../../core/pdf/export/chartPdf.ts';

type T = (key: string, options?: Record<string, unknown>) => string;

/** Localised strings for the chart PDF. */
export function chartLabels(t: T, locale: string): ChartLabels {
  return {
    locale,
    untitled: t('wizard.create.untitled'),
    coverSubtitle: t('pdf.coverSubtitle'),
    by: (author) => t('pdf.by', { author }),
    page: (n, total) => t('pdf.page', { n, total }),
    region: (x0, x1, y0, y1) => t('pdf.region', { x0, x1, y0, y1 }),
    credit: t('pdf.credit'),
    info: {
      size: t('pdf.info.size'),
      stitchesValue: (w, h) => t('pdf.info.stitchesValue', { w, h }),
      colors: t('pdf.info.colors'),
      stitches: t('pdf.info.stitches'),
      fabric: t('pdf.info.fabric'),
      finished: t('pdf.info.finished'),
      otherFabrics: t('pdf.info.otherFabrics'),
      toBuy: t('pdf.info.toBuy'),
      strandsNeedle: (strands, needle) => t('wizard.size.strandsValue', { count: strands, needle }),
      strandsNeedleLabel: t('wizard.size.strands'),
    },
    key: {
      title: t('pdf.key.title'),
      symbol: t('pdf.key.symbol'),
      thread: t('pdf.key.thread'),
      name: t('pdf.key.name'),
      equivalent: t('pdf.key.equivalent'),
      strands: t('pdf.key.strands'),
      stitches: t('pdf.key.stitches'),
      skeins: (fabric) => t('pdf.key.skeins', { fabric }),
      backstitch: t('pdf.key.backstitch'),
      length: t('pdf.key.length'),
      knots: t('pdf.key.knots'),
      count: t('pdf.key.count'),
      partialNote: t('pdf.key.partialNote'),
    },
    pageMap: t('pdf.pageMap'),
    fabricName: (kind, count, over) =>
      `${t(`fabric.kinds.${kind}`)} ${count} ct${over === 2 ? ` (${t('pdf.overTwo')})` : ''}`,
  };
}
