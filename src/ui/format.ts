import type { Units } from './state/settings.ts';

export function formatInt(n: number, lng?: string): string {
  return new Intl.NumberFormat(lng).format(Math.round(n));
}

export function formatDecimal(n: number, digits: number, lng?: string): string {
  return new Intl.NumberFormat(lng, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Length for display: centimetres with one decimal, or inches with one decimal. */
export function formatLength(mm: number, units: Units, lng?: string): string {
  return units === 'imperial'
    ? `${formatDecimal(mm / 25.4, 1, lng)} in`
    : `${formatDecimal(mm / 10, 1, lng)} cm`;
}

export function formatSize(widthMm: number, heightMm: number, units: Units, lng?: string): string {
  const unit = units === 'imperial' ? 'in' : 'cm';
  const conv = (mm: number) => formatDecimal(units === 'imperial' ? mm / 25.4 : mm / 10, 1, lng);
  return `${conv(widthMm)} × ${conv(heightMm)} ${unit}`;
}

export function threadLabel(brand: string, code: string): string {
  return `${brand} ${code}`;
}
