/** Biographies may contain up to 350 words. This is a maximum, not a target. */
export const BIO_MAX_WORDS = 350;

export const BIO_TOO_LONG_CODE = 'BIO_TOO_LONG';

/** Counts whitespace-separated words. Used identically in the UI and the API. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export type BiographyCheck =
  | { ok: true; words: number }
  | { ok: false; words: number; over: number; message: string };

export function checkBiography(text: string): BiographyCheck {
  const words = countWords(text);
  if (words <= BIO_MAX_WORDS) return { ok: true, words };
  const over = words - BIO_MAX_WORDS;
  return {
    ok: false,
    words,
    over,
    message: `Your biography is ${words} words. Remove ${over} word${over === 1 ? '' : 's'} to save. Your text has not been changed.`,
  };
}
