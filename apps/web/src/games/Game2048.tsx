import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Flag } from 'lucide-react';
import { addRandomTile, canMove, levelFor, maxTile, move, newGame, type Board, type Direction } from './logic/game2048';
import type { GameProps } from './types';
import { InlineAlert } from '../components/Feedback';

const KEY_DIR: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  a: 'left',
  d: 'right',
  w: 'up',
  s: 'down',
};

export default function Game2048({ config, onFinish, onProgress }: GameProps) {
  const size = Math.min(6, Math.max(3, config.size ?? 4));
  const target = config.target ?? 2048;
  const [board, setBoard] = useState<Board>(() => newGame(size));
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const [keepPlaying, setKeepPlaying] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const stuck = !canMove(board);
  const paused = stuck || (won && !keepPlaying);

  useEffect(() => onProgress?.({ score, level: levelFor(board) }), [score, board, onProgress]);
  useEffect(() => boardRef.current?.focus(), []);

  function doMove(dir: Direction) {
    if (paused) return;
    const r = move(board, dir);
    if (!r.moved) return;
    const next = addRandomTile(r.board);
    setBoard(next);
    setScore((x) => x + r.gained);
    if (!won && maxTile(next) >= target) setWon(true);
  }

  function onKey(e: KeyboardEvent) {
    const dir = KEY_DIR[e.key];
    if (dir) {
      e.preventDefault();
      doMove(dir);
    }
  }

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
    else doMove(dy > 0 ? 'down' : 'up');
  }

  const finish = (outcome: 'completed' | 'failed') => onFinish({ score, level: levelFor(board), outcome, summary: `Biggest tile: ${maxTile(board)}` });

  return (
    <div className="game-panel">
      <div className="game-hud">
        <span className="badge badge--yellow">Target {target}</span>
        <span className="game-score" aria-live="polite">
          Score {score}
        </span>
      </div>
      <p className="muted small">Use the arrow keys, swipe on the board, or the buttons below. Equal tiles merge.</p>
      <div
        ref={boardRef}
        className="board-2048"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
        tabIndex={0}
        role="application"
        aria-label={`2048 board. Score ${score}. Biggest tile ${maxTile(board)}. Use arrow keys to move.`}
        onKeyDown={onKey}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {board.flatMap((row, i) =>
          row.map((v, j) => (
            <div key={`${i}-${j}`} className={`tile-2048 tile-2048--${v > 2048 ? 'big' : v}`}>
              {v || ''}
            </div>
          )),
        )}
      </div>
      <div className="dpad" aria-label="Move tiles">
        <button type="button" className="icon-btn dpad__up" aria-label="Move up" onClick={() => doMove('up')} disabled={paused}>
          <ArrowUp size={22} />
        </button>
        <button type="button" className="icon-btn dpad__left" aria-label="Move left" onClick={() => doMove('left')} disabled={paused}>
          <ArrowLeft size={22} />
        </button>
        <button type="button" className="icon-btn dpad__down" aria-label="Move down" onClick={() => doMove('down')} disabled={paused}>
          <ArrowDown size={22} />
        </button>
        <button type="button" className="icon-btn dpad__right" aria-label="Move right" onClick={() => doMove('right')} disabled={paused}>
          <ArrowRight size={22} />
        </button>
      </div>
      {won && !keepPlaying ? (
        <>
          <InlineAlert tone="success">You reached {target}! Amazing.</InlineAlert>
          <div className="row">
            <button type="button" className="btn btn--secondary" onClick={() => setKeepPlaying(true)}>
              Keep playing
            </button>
            <button type="button" className="btn btn--mango" onClick={() => finish('completed')}>
              <Flag size={16} aria-hidden /> Finish
            </button>
          </div>
        </>
      ) : stuck ? (
        <>
          <InlineAlert tone={won ? 'success' : 'warning'}>No more moves left.</InlineAlert>
          <button type="button" className="btn btn--mango" onClick={() => finish(won ? 'completed' : 'failed')}>
            <Flag size={16} aria-hidden /> See results
          </button>
        </>
      ) : (
        <button type="button" className="btn btn--secondary" onClick={() => finish('completed')}>
          <Flag size={16} aria-hidden /> End game &amp; save score
        </button>
      )}
    </div>
  );
}
