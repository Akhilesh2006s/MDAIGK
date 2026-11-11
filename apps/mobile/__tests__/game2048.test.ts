import { addRandomTile, canMove, emptyBoard, levelFor, move, slideRow } from '../src/games/logic/game2048';

describe('2048 logic', () => {
  test('slideRow merges pairs once and shifts left', () => {
    expect(slideRow([2, 2, 2, 2])).toEqual({ row: [4, 4, 0, 0], gained: 8 });
    expect(slideRow([2, 0, 2, 4])).toEqual({ row: [4, 4, 0, 0], gained: 4 });
    expect(slideRow([4, 4, 8, 0])).toEqual({ row: [8, 8, 0, 0], gained: 8 });
    expect(slideRow([2, 4, 8, 16])).toEqual({ row: [2, 4, 8, 16], gained: 0 });
    expect(slideRow([0, 0, 0, 2])).toEqual({ row: [2, 0, 0, 0], gained: 0 });
  });

  test('move handles all four directions', () => {
    const b = [
      [2, 0, 0, 2],
      [0, 4, 0, 4],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
    ];
    expect(move(b, 'left').board[0]).toEqual([4, 0, 0, 0]);
    expect(move(b, 'right').board[1]).toEqual([0, 0, 0, 8]);
    const up = move(b, 'up');
    expect(up.board.map((r) => r[0])).toEqual([4, 0, 0, 0]);
    expect(up.gained).toBe(4);
    const down = move(b, 'down');
    expect(down.board.map((r) => r[3])).toEqual([0, 0, 2, 4]);
  });

  test('move reports moved=false when nothing changes', () => {
    const b = [
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(move(b, 'left').moved).toBe(false);
    expect(move(b, 'right').moved).toBe(true);
  });

  test('canMove detects stuck boards', () => {
    const stuck = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    expect(canMove(stuck)).toBe(false);
    const mergeable = stuck.map((r) => [...r]);
    mergeable[0][1] = 2;
    expect(canMove(mergeable)).toBe(true);
  });

  test('addRandomTile fills exactly one empty cell', () => {
    const b = addRandomTile(emptyBoard(4), () => 0);
    expect(b.flat().filter((v) => v !== 0)).toEqual([2]);
    expect(levelFor(b)).toBe(1);
  });
});
