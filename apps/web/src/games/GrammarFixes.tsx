import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Flag, XCircle } from 'lucide-react';
import { shuffle } from './logic/words';
import type { GameProps } from './types';
import { InlineAlert } from '../components/Feedback';

/** Shuffle sentence order and option order, remapping the correct index. */
export function prepareSentences(sentences: Array<{ wrong: string; options: string[]; correctIndex: number }>, rng: () => number = Math.random) {
  return shuffle(sentences, rng).map((s) => {
    const order = shuffle(
      s.options.map((_, i) => i),
      rng,
    );
    return { wrong: s.wrong, options: order.map((i) => s.options[i]), correctIndex: order.indexOf(s.correctIndex) };
  });
}

export default function GrammarFixes({ config, onFinish, onProgress }: GameProps) {
  const items = useMemo(() => prepareSentences(config.sentences ?? []), [config.sentences]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => onProgress?.({ score, level: 1 }), [score, onProgress]);
  const shownAt = useRef(0);
  useEffect(() => {
    if (picked === null) return;
    const t = setTimeout(() => nextRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [picked]);

  if (!items.length) return <InlineAlert tone="info">No sentences are configured for this game yet.</InlineAlert>;

  const item = items[index];
  const answered = picked !== null;
  const isLast = index + 1 >= items.length;

  function pick(i: number) {
    if (answered) return;
    shownAt.current = Date.now();
    setPicked(i);
    if (i === item.correctIndex) {
      setScore((s) => s + 10);
      setCorrect((c) => c + 1);
    }
  }

  function next() {
    if (Date.now() - shownAt.current < 300) return;
    if (isLast) {
      const ratio = correct / items.length;
      onFinish({ score, level: 1, outcome: ratio >= 0.5 ? 'completed' : 'failed', summary: `${correct} of ${items.length} sentences fixed` });
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }

  return (
    <div className="game-panel">
      <div className="game-hud">
        <span className="badge badge--yellow">
          Sentence {index + 1} of {items.length}
        </span>
        <span className="game-score">Score {score}</span>
      </div>
      <div className="progress" aria-hidden>
        <div className="progress__bar" style={{ width: `${(index / items.length) * 100}%` }} />
      </div>
      <div className="spell-card">
        <p className="muted">This sentence has a mistake:</p>
        <p className="grammar-wrong">{item.wrong}</p>
        <p className="muted">Choose the corrected sentence.</p>
      </div>
      <div className="stack" role="group" aria-label="Choose the corrected sentence">
        {item.options.map((o, i) => {
          const isCorrect = i === item.correctIndex;
          const isPicked = i === picked;
          const cls = !answered ? '' : isCorrect ? 'is-correct' : isPicked ? 'is-wrong' : '';
          return (
            <button key={`${index}-${i}`} type="button" className={`choice-btn ${cls}`} aria-pressed={isPicked} disabled={answered} onClick={() => pick(i)}>
              <span>{o}</span>
              {answered && isCorrect && <CheckCircle2 size={20} aria-label="Correct answer" />}
              {answered && isPicked && !isCorrect && <XCircle size={20} aria-label="Your answer, incorrect" />}
            </button>
          );
        })}
      </div>
      {answered && (
        <button ref={nextRef} type="button" className="btn btn--mango" onClick={next}>
          {isLast ? (
            <>
              <Flag size={16} aria-hidden /> Finish
            </>
          ) : (
            <>
              Next sentence <ArrowRight size={16} aria-hidden />
            </>
          )}
        </button>
      )}
    </div>
  );
}
