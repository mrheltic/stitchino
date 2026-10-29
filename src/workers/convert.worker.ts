import { expose, transfer } from 'comlink';
import {
  ConvertSession,
  type Adjustments,
  type ConvertOutput,
  type ConvertParams,
  type RasterImage,
} from '../core/convert/index.ts';

let session: ConvertSession | undefined;

function current(): ConvertSession {
  if (!session) throw new Error('No image loaded');
  return session;
}

const api = {
  load(image: RasterImage): void {
    session = new ConvertSession(image);
  },
  setMask(mask: Uint8Array | null): void {
    current().setMask(mask ?? undefined);
  },
  convert(params: ConvertParams): ConvertOutput {
    const out = current().run(params);
    return transfer(out, [out.cells.buffer]);
  },
  variants(params: ConvertParams, maxColors: number[]): ConvertOutput[] {
    const outs = current().variants(params, maxColors);
    return transfer(
      outs,
      outs.map((o) => o.cells.buffer),
    );
  },
  adjusted(adjustments: Adjustments): RasterImage {
    const img = current().adjustedImage(adjustments);
    const data = new Uint8ClampedArray(img.data);
    return transfer({ width: img.width, height: img.height, data }, [data.buffer]);
  },
};

export type ConvertWorkerApi = typeof api;

expose(api);
