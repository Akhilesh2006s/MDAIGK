/** Helpers for Spell Master and Grammar Fixes (pure, testable). */
export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Scramble letters; guarantees a different order when the word has 2+ distinct letters. */
export function scramble(word: string, rng: Rng = Math.random): string {
  const letters = word.toUpperCase().split('');
  if (new Set(letters).size < 2) return letters.join('');
  for (let tries = 0; tries < 20; tries++) {
    const s = shuffle(letters, rng).join('');
    if (s !== word.toUpperCase()) return s;
  }
  return [...letters].reverse().join('');
}

/**
 * Split words into up to `levels` levels of increasing length, `perLevel` words each.
 * Short words come first so younger classes start easy.
 */
export function buildSpellLevels(words: string[], perLevel: number, levels = 3, rng: Rng = Math.random): string[][] {
  const clean = [...new Set(words.map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w)))];
  const sorted = shuffle(clean, rng).sort((a, b) => a.length - b.length);
  const out: string[][] = [];
  const size = Math.max(1, Math.min(perLevel, Math.ceil(sorted.length / levels)));
  for (let i = 0; i < levels && i * size < sorted.length; i++) out.push(shuffle(sorted.slice(i * size, (i + 1) * size), rng));
  return out;
}

export const normalizeAnswer = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');

export function hintFor(word: string): string {
  if (word.length <= 2) return `${word.length} letters`;
  return `Starts with “${word[0].toUpperCase()}”, ends with “${word[word.length - 1].toUpperCase()}” · ${word.length} letters`;
}
