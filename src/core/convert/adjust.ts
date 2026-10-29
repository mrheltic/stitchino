import { cloneRaster, type RasterImage } from './raster.ts';

export interface Adjustments {
  /** -1..1 */
  brightness: number;
  /** -1..1 */
  contrast: number;
  /** -1..1 (-1 = greyscale) */
  saturation: number;
  /** 0.5..2, 1 = unchanged; above 1 lightens midtones. */
  gamma: number;
  /** 0..1 */
  sharpen: number;
  /** 0..1, edge-preserving smoothing that reduces confetti from photo noise. */
  denoise: number;
}

export const NO_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  gamma: 1,
  sharpen: 0,
  denoise: 0,
};

export function isNeutral(a: Adjustments): boolean {
  return (
    a.brightness === 0 &&
    a.contrast === 0 &&
    a.saturation === 0 &&
    a.gamma === 1 &&
    a.sharpen === 0 &&
    a.denoise === 0
  );
}

/** Returns a new raster with the adjustments applied (alpha untouched). */
export function applyAdjustments(src: RasterImage, a: Adjustments): RasterImage {
  let img = cloneRaster(src);
  if (isNeutral(a)) return img;
  if (a.denoise > 0) img = bilateral(img, a.denoise);
  toneAndColour(img, a);
  if (a.sharpen > 0) img = unsharp(img, a.sharpen * 1.5);
  return img;
}

function toneAndColour(img: RasterImage, a: Adjustments): void {
  const lut = new Uint8ClampedArray(256);
  const contrast = a.contrast >= 0 ? 1 + 2 * a.contrast : 1 + a.contrast;
  const invGamma = 1 / a.gamma;
  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    v = Math.pow(v, invGamma);
    v = (v - 0.5) * contrast + 0.5 + a.brightness * 0.4;
    lut[i] = Math.round(v * 255);
  }
  const sat = 1 + a.saturation;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]];
    let g = lut[d[i + 1]];
    let b = lut[d[i + 2]];
    if (sat !== 1) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * sat;
      g = lum + (g - lum) * sat;
      b = lum + (b - lum) * sat;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

/** Bilateral filter (radius 2): smooths noise, keeps edges. */
function bilateral(src: RasterImage, strength: number): RasterImage {
  const { width: w, height: h, data: s } = src;
  const out = cloneRaster(src);
  const o = out.data;
  const radius = 2;
  const sigmaSpace2 = 2 * 1.5 * 1.5;
  const sigmaColour = 8 + 40 * strength;
  const sigmaColour2 = 2 * sigmaColour * sigmaColour;
  const spatial: number[] = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      spatial.push(Math.exp(-(dx * dx + dy * dy) / sigmaSpace2));
  const colourLut = new Float64Array(3 * 255 * 255 + 1);
  for (let i = 0; i < colourLut.length; i++) colourLut[i] = Math.exp(-i / sigmaColour2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = (y * w + x) * 4;
      const r0 = s[c];
      const g0 = s[c + 1];
      const b0 = s[c + 2];
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sw = 0;
      let k = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++, k++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const n = (yy * w + xx) * 4;
          const dr = s[n] - r0;
          const dg = s[n + 1] - g0;
          const db = s[n + 2] - b0;
          const wgt = spatial[k] * colourLut[dr * dr + dg * dg + db * db];
          sr += s[n] * wgt;
          sg += s[n + 1] * wgt;
          sb += s[n + 2] * wgt;
          sw += wgt;
        }
      }
      o[c] = sr / sw;
      o[c + 1] = sg / sw;
      o[c + 2] = sb / sw;
    }
  }
  return out;
}

function unsharp(src: RasterImage, amount: number): RasterImage {
  const { width: w, height: h, data: s } = src;
  const out = cloneRaster(src);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            sum += s[(yy * w + xx) * 4 + ch];
          }
        }
        o[c + ch] = s[c + ch] + amount * (s[c + ch] - sum / 9);
      }
    }
  }
  return out;
}
