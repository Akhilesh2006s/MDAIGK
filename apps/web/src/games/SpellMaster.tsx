import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Flag, Lightbulb, XCircle } from 'lucide-react';
import { buildSpellLevels, hintFor, normalizeAnswer, scramble } from './logic/words';
import type { GameProps } from './types';
import { InlineAlert } from '../components/Feedback';

const PASS_RATIO = 0.6;

export default function SpellMaster({ config, onFinish, onProgress }: GameProps) {
  const levels = useMemo(() => buildSpellLevels(config.words ?? [], config.rounds ?? 5, 3), [config.words, config.rounds]);
  const [level, setLevel] = useState(0);
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; word: string } | null>(null);
  const [levelCorrect, setLevelCorrect] = useState(0);
  const [levelDone, setLevelDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const words = levels[level] ?? [];
  const word = words[round] ?? '';
  const letters = useMemo(() => (word ? scramble(word) : ''), [word]);

  useEffect(() => onProgress?.({ score, level: level + 1 }), [score, level, onProgress]);
  const shownAt = useRef(0);
  useEffect(() => {
    // Defer focus so the Enter key that submitted the answer can't also "click" Next.
    const t = setTimeout(() => (feedback ? nextRef.current?.focus() : inputRef.current?.focus()), 0);
    return () => clearTimeout(t);
  }, [feedback, round, level, levelDone]);

  if (!levels.length) return <InlineAlert tone="info">No words are configured for this game yet.</InlineAlert>;

  function check(e?: FormEvent) {
    e?.preventDefault();
    if (!word || feedback || !answer.trim()) return;
    const ok = normalizeAnswer(answer) === word;
    if (ok) {
      setScore((s) => s + (hintUsed ? 5 : 10) + level * 5);
      setLevelCorrect((c) => c + 1);
    }
    shownAt.current = Date.now();
    setFeedback({ ok, word });
  }

  function next() {
    if (Date.now() - shownAt.current < 300) return;
    setFeedback(null);
    setAnswer('');
    setHintUsed(false);
    if (round + 1 < words.length) setRound((r) => r + 1);
    else setLevelDone(true);
  }

  if (levelDone) {
    const passed = levelCorrect / words.length >= PASS_RATIO;
    const last = level + 1 >= levels.length;
    return (
      <div className="game-panel game-panel--center">
        <h2>{passed ? 'Level complete!' : 'Good try!'}</h2>
        <p className="muted">
          You spelled {levelCorrect} of {words.length} words correctly in level {level + 1}.
        </p>
        <p className="game-score">Score: {score}</p>
        <div className="row">
          {passed && !last && (
            <button
              type="button"
              className="btn btn--mango"
              onClick={() => {
                setLevel((l) => l + 1);
                setRound(0);
                setLevelCorrect(0);
                setLevelDone(false);
              }}
            >
              Start level {level + 2} <ArrowRight size={16} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className={`btn ${passed && !last ? 'btn--secondary' : 'btn--primary'}`}
            onClick={() =>
              onFinish({
                score,
                level: level + 1,
                outcome: passed || level > 0 ? 'completed' : 'failed',
                summary: last && passed ? 'You finished every level!' : `Reached level ${level + 1}`,
              })
            }
          >
            <Flag size={16} aria-hidden /> Finish game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-panel">
      <div className="game-hud">
        <span className="badge badge--yellow">
          Level {level + 1} of {levels.length}
        </span>
        <span className="game-score">Score {score}</span>
      </div>
      <div className="progress" aria-hidden>
        <div className="progress__bar" style={{ width: `${(round / Math.max(1, words.length)) * 100}%` }} />
      </div>
      <p className="muted small">
        Word {round + 1} of {words.length}
      </p>
      <div className="spell-card">
        <p className="muted">Unscramble the letters to spell the word</p>
        <div className="letter-tiles" aria-label={`Scrambled letters: ${letters.split('').join(' ')}`}>
          {letters.split('').map((ch, i) => (
            <span key={`${ch}-${i}`} className="letter-tile" aria-hidden>
              {ch}
            </span>
          ))}
        </div>
        {hintUsed && <p className="muted">Hint: {hintFor(word)}</p>}
      </div>
      <form onSubmit={check} className="stack">
        <label htmlFor="spell-answer" className="sr-only">
          Your spelling
        </label>
        <input
          id="spell-answer"
          ref={inputRef}
          className="game-input"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          placeholder="Type the word"
          readOnly={Boolean(feedback)}
        />
        {feedback ? (
          <>
            <InlineAlert tone={feedback.ok ? 'success' : 'error'}>
              {feedback.ok ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}{' '}
              {feedback.ok ? 'Correct! Well spelled.' : `Not quite — the word was “${feedback.word.toUpperCase()}”.`}
            </InlineAlert>
            <button ref={nextRef} type="button" className="btn btn--mango" onClick={next}>
              {round + 1 < words.length ? 'Next word' : 'See results'} <ArrowRight size={16} aria-hidden />
            </button>
          </>
        ) : (
          <div className="row">
            <button type="button" className="btn btn--secondary" onClick={() => setHintUsed(true)} disabled={hintUsed}>
              <Lightbulb size={16} aria-hidden /> Hint
            </button>
            <button type="submit" className="btn btn--mango" disabled={!answer.trim()}>
              Check
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
