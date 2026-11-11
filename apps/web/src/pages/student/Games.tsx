import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Gamepad2, PlayCircle, RotateCcw, Trophy } from 'lucide-react';
import { ERROR_CODES, SCHOOL_HEADER } from '@mango/shared';
import { ApiError, api, errorMessage } from '../../api/client';
import { useGet, useInvalidate } from '../../api/hooks';
import type { DailyUsage, GameConfig, StudentGame } from '../../api/portalTypes';
import { Card, PageHeader } from '../../components/Cards';
import { EmptyState, InlineAlert, Loading, QueryState } from '../../components/Feedback';
import Game2048 from '../../games/Game2048';
import GrammarFixes from '../../games/GrammarFixes';
import MathSprint from '../../games/MathSprint';
import SpellMaster from '../../games/SpellMaster';
import type { GameProps, GameResult } from '../../games/types';
import { timeOfDay } from './shared';

const GAME_UI: Record<string, (p: GameProps) => React.JSX.Element> = {
  SPELL_MASTER: SpellMaster,
  GRAMMAR_FIXES: GrammarFixes,
  GAME_2048: Game2048,
  G2048: Game2048,
  MATH_SPRINT: MathSprint,
};

export function gameComponentFor(code: string) {
  return GAME_UI[code] ?? (code.includes('2048') ? Game2048 : undefined);
}

export function resetText(resetsAt: string | undefined): string {
  if (!resetsAt) return 'tomorrow';
  const d = new Date(resetsAt);
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return `today at ${timeOfDay(d)}`;
  if (d.toDateString() === tomorrow.toDateString()) return d.getHours() === 0 && d.getMinutes() === 0 ? 'at midnight' : `tomorrow at ${timeOfDay(d)}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'long' })} at ${timeOfDay(d)}`;
}

export default function GamesPage() {
  const q = useGet<StudentGame[]>('/games');
  return (
    <div className="student-page">
      <PageHeader title="Games" subtitle="Learn while you play. Each game has a daily play limit so there’s time for everything else too." />
      <QueryState query={q} loadingLabel="Loading games…">
        {(games) =>
          games.length === 0 ? (
            <EmptyState title="No games available" message="Your school hasn’t switched on any games for your class yet." />
          ) : (
            <div className="game-grid">
              {games.map((g) => {
                const u = g.dailyUsage;
                const out = u.remaining <= 0;
                const playable = Boolean(gameComponentFor(g.code));
                return (
                  <article key={g._id} className={`game-card ${out ? 'is-out' : ''}`}>
                    <div className="game-card__icon">
                      <Gamepad2 size={26} aria-hidden />
                    </div>
                    <h2>{g.name}</h2>
                    {g.description && <p className="muted small">{g.description}</p>}
                    <dl className="game-card__stats">
                      <div>
                        <dt>Best score</dt>
                        <dd>{g.progress && g.progress.completedPlays > 0 ? (g.progress.bestScore ?? 0) : '—'}</dd>
                      </div>
                      <div>
                        <dt>Plays today</dt>
                        <dd>
                          {u.used} / {u.limit}
                        </dd>
                      </div>
                      <div>
                        <dt>Left today</dt>
                        <dd>{u.remaining}</dd>
                      </div>
                    </dl>
                    {out ? (
                      <p className="small game-card__limit">
                        <Clock size={14} aria-hidden /> All plays used. Resets {resetText(u.resetsAt)}.
                      </p>
                    ) : (
                      <p className="muted small">Resets {resetText(u.resetsAt)}</p>
                    )}
                    {playable ? (
                      out ? (
                        <span className="btn btn--secondary is-disabled" aria-disabled="true">
                          Come back later
                        </span>
                      ) : (
                        <Link to={`/student/games/${g._id}`} className="btn btn--mango">
                          <PlayCircle size={16} aria-hidden /> Play
                        </Link>
                      )
                    ) : (
                      <span className="muted small">This game is coming soon to the website.</span>
                    )}
                  </article>
                );
              })}
            </div>
          )
        }
      </QueryState>
    </div>
  );
}

type Phase = 'intro' | 'starting' | 'playing' | 'saving' | 'done' | 'limit' | 'error';
interface Active {
  attemptId: string;
  startedAt: number;
}

/** Best-effort "abandoned" report that survives page unload (keepalive fetch with the auth header). */
function sendAbandon(attemptId: string, live: { score: number; level: number }, startedAt: number) {
  const body = JSON.stringify({ score: Math.max(0, Math.round(live.score)), level: Math.max(1, Math.round(live.level)), durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)), outcome: 'abandoned' });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = api.tokens.getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;
  const school = api.getSchoolId();
  if (school) headers[SCHOOL_HEADER] = school;
  try {
    void fetch(`/api/v1/games/attempts/${attemptId}`, { method: 'PATCH', headers, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

export function GamePlayPage() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const games = useGet<StudentGame[]>('/games', undefined, { refetchOnWindowFocus: false });
  const game = games.data?.find((g) => g._id === gameId);
  const [phase, setPhase] = useState<Phase>('intro');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [usage, setUsage] = useState<DailyUsage | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const active = useRef<Active | null>(null);
  const live = useRef({ score: 0, level: 1 });

  // Leaving mid-game (tab close/reload or in-app navigation) reports the attempt as abandoned.
  useEffect(() => {
    const onUnload = () => {
      if (active.current) sendAbandon(active.current.attemptId, live.current, active.current.startedAt);
    };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      if (active.current) {
        const a = active.current;
        active.current = null;
        sendAbandon(a.attemptId, live.current, a.startedAt);
        void invalidate('/games');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setPhase('starting');
    setError(null);
    try {
      const r = await api.post<{ attemptId: string; seq: number; config: GameConfig; dailyUsage: DailyUsage }>(`/games/${gameId}/attempts`);
      active.current = { attemptId: r.attemptId, startedAt: Date.now() };
      live.current = { score: 0, level: 1 };
      setConfig(r.config ?? game?.config ?? {});
      setUsage(r.dailyUsage);
      setResult(null);
      setRound((x) => x + 1);
      setPhase('playing');
    } catch (e) {
      if (e instanceof ApiError && (e.code === ERROR_CODES.DAILY_LIMIT_REACHED || e.status === 429)) {
        const d = (e.details ?? {}) as Partial<DailyUsage>;
        setUsage({ limit: d.limit ?? game?.dailyUsage.limit ?? 0, used: d.used ?? d.limit ?? 0, remaining: 0, resetsAt: d.resetsAt ?? game?.dailyUsage.resetsAt ?? '' });
        setPhase('limit');
      } else {
        setError(errorMessage(e));
        setPhase('error');
      }
      void invalidate('/games');
    }
  }

  const onProgress = useCallback((p: { score: number; level: number }) => {
    live.current = p;
  }, []);

  const onFinish = useCallback(
    async (r: GameResult) => {
      const a = active.current;
      if (!a) return;
      active.current = null;
      setResult(r);
      setPhase('saving');
      try {
        await api.patch(`/games/attempts/${a.attemptId}`, {
          score: Math.max(0, Math.round(r.score)),
          level: Math.max(1, Math.round(r.level)),
          durationSec: Math.max(0, Math.round((Date.now() - a.startedAt) / 1000)),
          outcome: r.outcome,
        });
        setError(null);
      } catch (e) {
        setError(`Your score could not be saved: ${errorMessage(e)}`);
      }
      setPhase('done');
      void invalidate('/games', '/student');
    },
    [invalidate],
  );

  if (games.isLoading) return <Loading label="Loading game…" />;
  if (games.isError) return <QueryState query={games}>{() => null}</QueryState>;
  if (!game) return <EmptyState title="Game not found" action={<Link to="/student/games">Back to games</Link>} />;
  const Game = gameComponentFor(game.code);
  const remaining = usage?.remaining ?? game.dailyUsage.remaining;

  return (
    <div className="student-page student-page--narrow">
      <PageHeader
        title={game.name}
        subtitle={game.description}
        breadcrumb={
          <Link to="/student/games">
            <ArrowLeft size={14} aria-hidden /> Games
          </Link>
        }
      />
      <Card>
        {!Game ? (
          <InlineAlert tone="info">This game is not available on the website yet.</InlineAlert>
        ) : phase === 'playing' && config ? (
          <Game key={round} config={config} onFinish={(r) => void onFinish(r)} onProgress={onProgress} />
        ) : phase === 'saving' ? (
          <Loading label="Saving your score…" />
        ) : phase === 'done' && result ? (
          <div className="game-panel game-panel--center" aria-live="polite">
            <Trophy size={40} aria-hidden className="text-gold" />
            <h2>{result.outcome === 'completed' ? 'Great game!' : 'Nice try!'}</h2>
            <p className="game-score">Score {result.score}</p>
            {result.summary && <p className="muted">{result.summary}</p>}
            {error ? <InlineAlert>{error}</InlineAlert> : <p className="small text-success">Score saved.</p>}
            <p className="muted small">
              {remaining > 0 ? `${remaining} play${remaining === 1 ? '' : 's'} left today.` : `That was your last play today. Resets ${resetText(usage?.resetsAt)}.`}
            </p>
            <div className="row">
              {remaining > 0 && (
                <button type="button" className="btn btn--mango" onClick={() => void start()}>
                  <RotateCcw size={16} aria-hidden /> Play again
                </button>
              )}
              <button type="button" className="btn btn--secondary" onClick={() => navigate('/student/games')}>
                All games
              </button>
            </div>
          </div>
        ) : phase === 'limit' || (phase === 'intro' && remaining <= 0) ? (
          <div className="game-panel game-panel--center" role="status">
            <Clock size={36} aria-hidden className="text-mango" />
            <h2>That’s all for today!</h2>
            <p className="muted">
              You’ve used all {usage?.limit ?? game.dailyUsage.limit} plays of {game.name} for today. New plays unlock {resetText(usage?.resetsAt)}.
            </p>
            <Link to="/student/learn" className="btn btn--primary">
              Explore lessons meanwhile
            </Link>
          </div>
        ) : (
          <div className="game-panel game-panel--center">
            <Gamepad2 size={36} aria-hidden className="text-mango" />
            <p>
              Plays left today: <strong>{remaining}</strong> of {game.dailyUsage.limit}
            </p>
            {game.progress && game.progress.completedPlays > 0 && <p className="muted small">Your best score: {game.progress.bestScore}</p>}
            {phase === 'error' && error && <InlineAlert>{error}</InlineAlert>}
            <p className="muted small">If you leave in the middle, the play still counts for today.</p>
            <button type="button" className="btn btn--mango btn--lg" onClick={() => void start()} disabled={phase === 'starting'}>
              <PlayCircle size={18} aria-hidden /> {phase === 'starting' ? 'Starting…' : 'Start game'}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
