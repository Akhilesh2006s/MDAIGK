import { describe, expect, test } from 'vitest';
import { generateQuestion, normalizeOps, scoreFor } from '../logic/mathSprint';
import { buildSpellLevels, normalizeAnswer, scramble } from '../logic/words';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('Math Sprint generator', () => {
  test('normalizes API operation symbols', () => {
    expect(normalizeOps(['+', '-', '×'])).toEqual(['+', '-', '×']);
    expect(normalizeOps(['*', '/', 'x'])).toEqual(['×', '÷']);
    expect(normalizeOps([])).toEqual(['+', '-']);
    expect(normalizeOps(undefined)).toEqual(['+', '-']);
  });

  test('answers are correct, non-negative integers within bounds', () => {
    const rng = seeded(42);
    const ops = normalizeOps(['+', '-', '×', '÷']);
    for (let i = 0; i < 2000; i++) {
      const q = generateQuestion(ops, 20, rng);
      expect(Number.isInteger(q.answer)).toBe(true);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      const expected = q.op === '+' ? q.a + q.b : q.op === '-' ? q.a - q.b : q.op === '×' ? q.a * q.b : q.a / q.b;
      expect(q.answer).toBe(expected);
      if (q.op === '+' || q.op === '-') {
        expect(q.a).toBeLessThanOrEqual(20);
        expect(q.b).toBeLessThanOrEqual(20);
      } else if (q.op === '×') {
        expect(q.a).toBeLessThanOrEqual(12);
        expect(q.b).toBeLessThanOrEqual(12);
      }
      expect(q.text).toBe(`${q.a} ${q.op} ${q.b}`);
    }
  });

  test('streak scoring', () => {
    expect(scoreFor(1)).toBe(10);
    expect(scoreFor(2)).toBe(12);
    expect(scoreFor(50)).toBe(20);
  });
});

describe('Spell Master helpers', () => {
  test('scramble keeps letters and changes order', () => {
    const rng = seeded(7);
    for (const w of ['apple', 'garden', 'elephant', 'ab']) {
      const s = scramble(w, rng);
      expect(s).not.toBe(w.toUpperCase());
      expect(s.split('').sort().join('')).toBe(w.toUpperCase().split('').sort().join(''));
    }
    expect(scramble('aaa')).toBe('AAA');
  });

  test('levels get longer words', () => {
    const levels = buildSpellLevels(['apple', 'garden', 'elephant', 'beautiful', 'science', 'library', 'mountain', 'rainbow', 'computer', 'champion'], 5, 3, seeded(3));
    expect(levels.length).toBeGreaterThan(1);
    const maxLen = (ws: string[]) => Math.max(...ws.map((w) => w.length));
    const minLen = (ws: string[]) => Math.min(...ws.map((w) => w.length));
    expect(maxLen(levels[0])).toBeLessThanOrEqual(minLen(levels[levels.length - 1]));
    expect(levels.flat().length).toBe(new Set(levels.flat()).size);
  });

  test('normalizeAnswer', () => {
    expect(normalizeAnswer('  Apple ')).toBe('apple');
  });
});

describe('Grammar Fixes preparation', () => {
  test('shuffles options but keeps the correct answer index pointing at the same sentence', async () => {
    const { prepareSentences } = await import('../GrammarFixes');
    const src = [
      { wrong: 'She go to school.', options: ['She goes to school.', 'She going to school.', 'She gone to school.'], correctIndex: 0 },
      { wrong: 'They was here.', options: ['They is here.', 'They were here.'], correctIndex: 1 },
    ];
    for (let seed = 1; seed < 30; seed++) {
      const out = prepareSentences(src, seeded(seed));
      expect(out).toHaveLength(2);
      for (const item of out) {
        const original = src.find((s) => s.wrong === item.wrong)!;
        expect(item.options[item.correctIndex]).toBe(original.options[original.correctIndex]);
        expect([...item.options].sort()).toEqual([...original.options].sort());
      }
    }
  });

  test('hintFor describes the word without revealing it', async () => {
    const { hintFor } = await import('../logic/words');
    expect(hintFor('apple')).toContain('5 letters');
    expect(hintFor('apple')).not.toContain('apple');
  });
});
