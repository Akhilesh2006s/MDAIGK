/** Math Sprint question generator (pure, testable). */
export type Op = '+' | '-' | '×' | '÷';
export type Rng = () => number;

export interface MathQuestion {
  a: number;
  b: number;
  op: Op;
  text: string;
  answer: number;
}

/** Accept the API's operation symbols and common ASCII variants. */
export function normalizeOps(ops?: string[]): Op[] {
  const map: Record<string, Op> = { '+': '+', '-': '-', '−': '-', '×': '×', x: '×', '*': '×', '÷': '÷', '/': '÷' };
  const out = [...new Set((ops ?? []).map((o) => map[o.trim()]).filter((o): o is Op => Boolean(o)))];
  return out.length ? out : ['+', '-'];
}

const randInt = (min: number, max: number, rng: Rng) => min + Math.floor(rng() * (max - min + 1));

/**
 * Answers are always non-negative integers: subtraction never goes below zero and
 * division is generated from a product so it is exact. Multiplication/division
 * operands are capped at 12 to keep it mental arithmetic.
 */
export function generateQuestion(ops: Op[], maxOperand = 20, rng: Rng = Math.random): MathQuestion {
  const max = Math.max(2, Math.floor(maxOperand));
  const op = ops[Math.floor(rng() * ops.length)] ?? '+';
  let a: number;
  let b: number;
  let answer: number;
  switch (op) {
    case '+':
      a = randInt(1, max, rng);
      b = randInt(1, max, rng);
      answer = a + b;
      break;
    case '-':
      a = randInt(1, max, rng);
      b = randInt(0, a, rng);
      answer = a - b;
      break;
    case '×': {
      const m = Math.min(max, 12);
      a = randInt(1, m, rng);
      b = randInt(1, m, rng);
      answer = a * b;
      break;
    }
    case '÷': {
      const m = Math.min(max, 12);
      b = randInt(1, m, rng);
      answer = randInt(1, m, rng);
      a = b * answer;
      break;
    }
  }
  return { a, b, op, text: `${a} ${op} ${b}`, answer };
}

/** Score: 10 per correct answer, with a streak bonus of +2 per consecutive correct answer beyond the first (max +10). */
export function scoreFor(correctStreak: number): number {
  return 10 + Math.min(10, Math.max(0, correctStreak - 1) * 2);
}
