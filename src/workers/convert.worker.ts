import { expose, transfer } from 'comlink';
import {
  ConvertSession,
  type Adjustments,
  type ConvertOutput,
  type ConvertParams,
  type RasterImage,
  findSubject,
} from '../core/convert/index.ts';

let session: ConvertSession | undefined;
let picture: RasterImage | undefined;

function current(): ConvertSession {
  if (!session) throw new Error('No image loaded');
  return session;
}

const api = {
  load(image: RasterImage): void {
    session = new ConvertSession(image);
    picture = image;
  },
  /** Background mask (1 = background) found around the subject of the loaded picture. */
  subject(): Uint8Array {
    if (!picture) throw new Error('No image loaded');
    const mask = findSubject(picture);
    return transfer(mask, [mask.buffer]);
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
