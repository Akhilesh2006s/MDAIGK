import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Timer, Zap } from 'lucide-react';
import { generateQuestion, normalizeOps, scoreFor, type MathQuestion } from './logic/mathSprint';
import type { GameProps } from './types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

export default function MathSprint({ config, onFinish, onProgress }: GameProps) {
  const duration = Math.max(10, Math.min(600, config.durationSec ?? 60));
  const ops = useMemo(() => normalizeOps(config.operations), [config.operations]);
  const maxOperand = config.maxOperand ?? 20;
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(duration);
  const [q, setQ] = useState<MathQuestion>(() => generateQuestion(ops, maxOperand));
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const done = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef({ score, correct, answered });
  latest.current = { score, correct, answered };
  const level = 1 + Math.floor(correct / 5);

  useEffect(() => onProgress?.({ score, level }), [score, level, onProgress]);

  useEffect(() => {
    if (!started) return;
    inputRef.current?.focus();
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [started]);

  useEffect(() => {
    if (started && left === 0 && !done.current) {
      done.current = true;
      const r = latest.current;
      onFinish({ score: r.score, level: 1 + Math.floor(r.correct / 5), outcome: 'completed', summary: `${r.correct} correct out of ${r.answered} answered in ${duration}s` });
    }
  }, [left, started, onFinish, duration]);

  function submit(value: string) {
    if (!value || left === 0) return;
    const ok = Number(value) === q.answer;
    setAnswered((a) => a + 1);
    if (ok) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setScore((s) => s + scoreFor(nextStreak));
      setCorrect((c) => c + 1);
    } else {
      setStreak(0);
    }
    setFlash(ok ? 'ok' : 'bad');
    setTimeout(() => setFlash(null), 250);
    setInput('');
    setQ(generateQuestion(ops, maxOperand));
  }

  function type(next: string) {
    const clean = next.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 5);
    setInput(clean);
    // auto-submit once the typed answer has as many digits as the correct one
    if (clean.length >= String(q.answer).length) submit(clean);
  }

  function press(k: (typeof KEYS)[number]) {
    if (k === 'clear') return setInput('');
    if (k === 'back') return setInput((s) => s.slice(0, -1));
    type(input + k);
  }

  if (!started) {
    return (
      <div className="game-panel game-panel--center">
        <h2>Ready?</h2>
        <p className="muted">
          Answer as many sums as you can in {duration} seconds. Operations: {ops.join('  ')}. Answers submit automatically when you have typed enough digits.
        </p>
        <button type="button" className="btn btn--mango btn--lg" onClick={() => setStarted(true)} autoFocus>
          <Zap size={18} aria-hidden /> Start sprint
        </button>
      </div>
    );
  }

  return (
    <div className="game-panel">
      <div className="game-hud">
        <span className={`badge ${left <= 10 ? 'badge--red' : 'badge--yellow'}`} aria-live={left <= 10 ? 'polite' : 'off'}>
          <Timer size={14} aria-hidden /> {left}s left
        </span>
        <span className="game-score">Score {score}</span>
      </div>
      <div className="progress" aria-hidden>
        <div className={`progress__bar ${left <= 10 ? 'progress__bar--danger' : ''}`} style={{ width: `${(left / duration) * 100}%` }} />
      </div>
      <form
        className={`sprint-box ${flash ? `sprint-box--${flash}` : ''}`}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <label htmlFor="sprint-answer" className="sprint-q">
          {q.text} =
        </label>
        <input
          id="sprint-answer"
          ref={inputRef}
          className="sprint-input"
          inputMode="numeric"
          autoComplete="off"
          value={input}
          onChange={(e) => type(e.target.value)}
          aria-label={`Answer for ${q.text}`}
        />
      </form>
      <p className="muted small center">
        {correct} correct · {answered - correct} wrong {streak > 1 ? `· streak ×${streak}` : ''}
      </p>
      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" className={`keypad__key ${k === 'back' || k === 'clear' ? 'keypad__key--alt' : ''}`} onClick={() => press(k)} aria-label={k === 'back' ? 'Delete' : k === 'clear' ? 'Clear' : k}>
            {k === 'back' ? '⌫' : k === 'clear' ? 'C' : k}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn--mango" onClick={() => submit(input)} disabled={!input}>
        Submit answer
      </button>
    </div>
  );
}
