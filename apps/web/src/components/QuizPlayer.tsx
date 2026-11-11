import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, XCircle } from 'lucide-react';
import { ERROR_CODES } from '@mango/shared';
import { ApiError, errorMessage } from '../api/client';
import type { AttemptBody, AttemptResult, PublicQuiz } from '../api/portalTypes';
import { InlineAlert } from './Feedback';

export function newAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Turns a submit error into a student-friendly message plus what the player should offer next. */
export function describeSubmitError(e: unknown): { message: string; kind: 'retry' | 'duplicate' | 'version' | 'rate' | 'other' } {
  if (e instanceof ApiError) {
    if (e.code === ERROR_CODES.DUPLICATE_SUBMISSION) return { kind: 'duplicate', message: 'This attempt was already submitted. Your score has been saved.' };
    if (e.code === ERROR_CODES.QUIZ_VERSION_MISMATCH) return { kind: 'version', message: 'This quiz was updated by your teacher while you were answering. Reload it to get the latest questions.' };
    if (e.status === 429) return { kind: 'rate', message: e.message || 'You have reached the attempt limit for now. Please try again later.' };
    if (e.status === 0) return { kind: 'retry', message: 'You seem to be offline. Your answers are kept — try submitting again.' };
    if (e.status >= 500) return { kind: 'retry', message: 'Something went wrong on our side. Your answers are kept — try submitting again.' };
  }
  return { kind: 'other', message: errorMessage(e) };
}

interface QuizPlayerProps {
  quiz: PublicQuiz;
  /** Sends the attempt; the player supplies clientAttemptId, quizVersion, duration and answers. */
  submit: (body: AttemptBody) => Promise<AttemptResult>;
  /** Called after a successful submit. */
  onSubmitted?: (result: AttemptResult) => void;
  /** Called when the quiz version changed on the server (parent refetches). */
  onReload?: () => void;
  /** Allow "Try again" after the result (new attempt id). */
  allowRetake?: boolean;
  resultExtra?: (result: AttemptResult) => ReactNode;
  doneAction?: ReactNode;
}

/**
 * One question at a time. The answer key never reaches the client before submit: the quiz comes from the
 * public endpoint (no correctIndex) and the review is only shown from the submit response.
 * `clientAttemptId` is generated once per attempt and reused on every retry of the same submit, so a
 * network failure followed by a retry can never create two attempts.
 */
export function QuizPlayer({ quiz, submit, onSubmitted, onReload, allowRetake = true, resultExtra, doneAction }: QuizPlayerProps) {
  const [attemptId, setAttemptId] = useState(newAttemptId);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof describeSubmitError> | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const startedAt = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  const questions = quiz.questions ?? [];
  const q = questions[index];
  const answeredCount = questions.filter((x) => answers[x.id] !== undefined).length;

  useEffect(() => {
    headingRef.current?.focus();
  }, [index, result]);

  if (!questions.length) return <InlineAlert tone="info">This quiz has no questions yet.</InlineAlert>;

  async function doSubmit() {
    setBusy(true);
    setError(null);
    try {
      const body: AttemptBody = {
        clientAttemptId: attemptId,
        quizVersion: quiz.version,
        durationSec: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
        answers: questions.map((x) => ({ questionId: x.id, selectedIndex: answers[x.id] ?? -1 })),
      };
      const r = await submit(body);
      setResult(r);
      setConfirming(false);
      onSubmitted?.(r);
    } catch (e) {
      setError(describeSubmitError(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setAttemptId(newAttemptId());
    setAnswers({});
    setIndex(0);
    setResult(null);
    setError(null);
    startedAt.current = Date.now();
  }

  if (result) {
    return (
      <div className="quiz-player" aria-live="polite">
        <div className="quiz-result">
          <h2 ref={headingRef} tabIndex={-1}>
            {result.passed === undefined ? 'Quiz submitted' : result.passed ? 'You passed!' : 'Not passed this time'}
          </h2>
          <p className="quiz-result__score">
            <strong>{Math.round(result.percent)}%</strong>
            <span>
              {result.score} / {result.maxScore} marks · {result.correctCount} of {result.questionCount} correct
            </span>
          </p>
          {resultExtra?.(result)}
          <div className="row">
            {allowRetake && (
              <button type="button" className="btn btn--secondary" onClick={restart}>
                <RotateCcw size={16} aria-hidden /> Try again
              </button>
            )}
            {doneAction}
          </div>
        </div>
        {result.review?.length ? (
          <ol className="quiz-review">
            {result.review.map((r, i) => (
              <li key={r.questionId} className={`quiz-review__item ${r.correct ? 'is-correct' : 'is-wrong'}`}>
                <p className="quiz-review__prompt">
                  {r.correct ? <CheckCircle2 size={18} aria-label="Correct" /> : <XCircle size={18} aria-label="Incorrect" />} {i + 1}. {r.prompt}
                </p>
                <ul className="quiz-review__options">
                  {r.options.map((o, oi) => (
                    <li key={oi} className={oi === r.correctIndex ? 'opt-correct' : oi === r.selectedIndex ? 'opt-wrong' : ''}>
                      {o}
                      {oi === r.correctIndex && <span className="sr-only"> (correct answer)</span>}
                      {oi === r.selectedIndex && <em> — your answer</em>}
                    </li>
                  ))}
                </ul>
                {r.selectedIndex < 0 && <p className="muted small">Not answered.</p>}
                {r.explanation && <p className="muted small">{r.explanation}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">The answers for this quiz are not shown.</p>
        )}
      </div>
    );
  }

  const last = index === questions.length - 1;
  return (
    <div className="quiz-player">
      <div className="quiz-progress">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span className="muted">{answeredCount} answered</span>
      </div>
      <div className="progress" aria-hidden>
        <div className="progress__bar" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>
      <fieldset className="quiz-question" disabled={busy}>
        <legend>
          <h2 ref={headingRef} tabIndex={-1} className="quiz-question__prompt">
            {q.prompt}
          </h2>
        </legend>
        <div className="quiz-options" role="radiogroup" aria-label={`Answer for question ${index + 1}`}>
          {q.options.map((o, oi) => (
            <label key={oi} className={`quiz-option ${answers[q.id] === oi ? 'is-selected' : ''}`}>
              <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === oi} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} />
              <span className="quiz-option__key" aria-hidden>
                {String.fromCharCode(65 + oi)}
              </span>
              <span>{o}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <InlineAlert tone={error.kind === 'duplicate' ? 'info' : 'error'}>
          {error.message}
          {error.kind === 'version' && onReload && (
            <>
              {' '}
              <button type="button" className="btn btn--sm btn--secondary" onClick={onReload}>
                Reload quiz
              </button>
            </>
          )}
        </InlineAlert>
      )}
      {confirming && answeredCount < questions.length && (
        <InlineAlert tone="warning">
          You have {questions.length - answeredCount} unanswered question{questions.length - answeredCount === 1 ? '' : 's'}. Submit anyway?
        </InlineAlert>
      )}
      <div className="quiz-nav">
        <button type="button" className="btn btn--ghost" disabled={index === 0 || busy} onClick={() => setIndex((i) => i - 1)}>
          <ChevronLeft size={16} aria-hidden /> Previous
        </button>
        {!last ? (
          <button type="button" className="btn btn--primary" onClick={() => setIndex((i) => i + 1)}>
            Next <ChevronRight size={16} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--mango"
            disabled={busy || error?.kind === 'duplicate' || error?.kind === 'version'}
            onClick={() => {
              if (answeredCount < questions.length && !confirming) setConfirming(true);
              else void doSubmit();
            }}
          >
            {busy ? 'Submitting…' : error?.kind === 'retry' ? 'Try submitting again' : confirming ? 'Submit anyway' : 'Submit quiz'}
          </button>
        )}
      </div>
    </div>
  );
}
