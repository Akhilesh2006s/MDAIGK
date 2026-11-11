/** Pure 2048 logic (no React) so it can be unit tested. 0 = empty cell. */
export type Board = number[][];
export type Direction = 'left' | 'right' | 'up' | 'down';
export type Rng = () => number;

export function emptyBoard(size = 4): Board {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
}

/** Slide and merge one row towards index 0. Each tile merges at most once per move. */
export function slideRow(row: number[]): { row: number[]; gained: number } {
  const tiles = row.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < row.length) out.push(0);
  return { row: out, gained };
}

function transpose(b: Board): Board {
  return b[0].map((_, c) => b.map((r) => r[c]));
}
const reverseRows = (b: Board): Board => b.map((r) => [...r].reverse());

export function move(board: Board, dir: Direction): { board: Board; moved: boolean; gained: number } {
  let work = board.map((r) => [...r]);
  if (dir === 'up' || dir === 'down') work = transpose(work);
  if (dir === 'right' || dir === 'down') work = reverseRows(work);
  let gained = 0;
  work = work.map((r) => {
    const s = slideRow(r);
    gained += s.gained;
    return s.row;
  });
  if (dir === 'right' || dir === 'down') work = reverseRows(work);
  if (dir === 'up' || dir === 'down') work = transpose(work);
  const moved = work.some((r, i) => r.some((v, j) => v !== board[i][j]));
  return { board: work, moved, gained };
}

export function emptyCells(board: Board): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  board.forEach((r, i) => r.forEach((v, j) => v === 0 && cells.push([i, j])));
  return cells;
}

/** Place a 2 (90%) or 4 (10%) on a random empty cell. Returns the same board if full. */
export function addRandomTile(board: Board, rng: Rng = Math.random): Board {
  const cells = emptyCells(board);
  if (!cells.length) return board;
  const [i, j] = cells[Math.floor(rng() * cells.length)];
  const next = board.map((r) => [...r]);
  next[i][j] = rng() < 0.9 ? 2 : 4;
  return next;
}

export function newGame(size = 4, rng: Rng = Math.random): Board {
  return addRandomTile(addRandomTile(emptyBoard(size), rng), rng);
}

export function canMove(board: Board): boolean {
  if (emptyCells(board).length) return true;
  const n = board.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (j + 1 < n && board[i][j] === board[i][j + 1]) return true;
      if (i + 1 < n && board[i][j] === board[i + 1][j]) return true;
    }
  }
  return false;
}

export const maxTile = (board: Board) => Math.max(...board.flat());

/** Level shown/stored for a 2048 game: log2 of the largest tile (2 → 1, 2048 → 11). */
export const levelFor = (board: Board) => Math.max(1, Math.round(Math.log2(Math.max(2, maxTile(board)))));
