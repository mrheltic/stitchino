import { wrap, type Remote } from 'comlink';
import type { ConvertWorkerApi } from './convert.worker.ts';

export interface ConvertWorker {
  api: Remote<ConvertWorkerApi>;
  terminate: () => void;
}

export function createConvertWorker(): ConvertWorker {
  const worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
  return { api: wrap<ConvertWorkerApi>(worker), terminate: () => worker.terminate() };
}
