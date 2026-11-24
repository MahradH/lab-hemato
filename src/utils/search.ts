/** Normalize Persian/Arabic text and Latin case for forgiving search matching. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\p{M}/gu, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/ۀ/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEnglishName(value: string): boolean {
  return /^[\x20-\x7E]*$/.test(value);
}
