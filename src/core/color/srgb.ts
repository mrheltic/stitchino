/** sRGB transfer functions. Channels are 0..1 unless the name says otherwise. */

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Linear value for each 8-bit sRGB code value. */
export const SRGB8_TO_LINEAR: Float32Array = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i / 255);
  return lut;
})();

/** Linear 0..1 to 8-bit sRGB, rounded and clamped. */
export function linearToSrgb8(c: number): number {
  return Math.round(linearToSrgb(c) * 255);
}

export type Rgb = readonly [r: number, g: number, b: number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex colour: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** WCAG relative luminance of an 8-bit sRGB colour (0..1). */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * SRGB8_TO_LINEAR[r] + 0.7152 * SRGB8_TO_LINEAR[g] + 0.0722 * SRGB8_TO_LINEAR[b];
}
