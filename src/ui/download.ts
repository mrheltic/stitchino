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
