/** Saves bytes as a file through a temporary link. */
export function downloadBytes(
  bytes: Uint8Array | Blob,
  filename: string,
  mime = 'application/octet-stream',
): void {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A file name from a title: keeps letters, digits, spaces and dashes. */
export function safeFileName(title: string, fallback = 'schema'): string {
  const name = title
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return name || fallback;
}

/** True when the system share sheet can take this file (phones and tablets, mostly). */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Opens the share sheet (e.g. to send a PDF to Pattern Keeper); false if sharing failed. */
export async function shareFile(file: File, title: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (e) {
    return (e as DOMException).name === 'AbortError';
  }
}
