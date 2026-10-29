import { describe, expect, it } from 'vitest';
import { standaloneT } from '../../src/i18n/standalone.ts';
import { chartLabels } from '../../src/ui/export/labels.ts';

describe('PDF labels built inside the worker', () => {
  it('translates, interpolates and nests the app name', async () => {
    const it_ = chartLabels(await standaloneT('it'), 'it');
    expect(it_.page(2, 5)).toBe('Pagina 2 di 5');
    expect(it_.credit).toBe('Creato con Stitchino, software libero per il punto croce');
    expect(it_.info.strandsNeedle(1, '24')).toBe('1 filo, ago n. 24');
    expect(it_.info.strandsNeedle(2, '24')).toBe('2 fili, ago n. 24');
    const en = chartLabels(await standaloneT('en'), 'en');
    expect(en.key.title).toBe('Key');
    expect(en.fabricName('evenweave', 28, 2)).toContain('28 ct');
  });
});
