import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Badge, Button, IconButton, InfoBanner, Muted, Row } from '../components/ui';
import { colors, fontSizes, radii, spacing } from '../theme';
import { addRandomTile, canMove, levelFor, maxTile, move, newGame, type Board, type Direction } from './logic/game2048';
import type { GameProps } from './types';

const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  0: { bg: '#E9E4D0', fg: colors.text },
  2: { bg: '#F7F3E3', fg: colors.text },
  4: { bg: '#F1EBCB', fg: colors.text },
  8: { bg: '#FFE08A', fg: colors.text },
  16: { bg: '#FFD154', fg: colors.text },
  32: { bg: '#FFC928', fg: colors.text },
  64: { bg: '#F4A62A', fg: colors.white },
  128: { bg: '#A9D3A9', fg: colors.forestGreen },
  256: { bg: '#6FB57F', fg: colors.white },
  512: { bg: '#3D8B5A', fg: colors.white },
  1024: { bg: '#1F6E45', fg: colors.white },
  2048: { bg: '#D9A520', fg: colors.white },
};
const tileColor = (v: number) => TILE_COLORS[v] ?? { bg: colors.forestGreenDark, fg: colors.white };

export default function Game2048({ config, onFinish, onProgress }: GameProps) {
  const size = Math.min(6, Math.max(3, config.size ?? 4));
  const target = config.target ?? 2048;
  const [board, setBoard] = useState<Board>(() => newGame(size));
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const [keepPlaying, setKeepPlaying] = useState(false);
  const { width } = useWindowDimensions();
  const boardPx = Math.min(width - spacing.lg * 2, 420);
  const gap = 8;
  const cell = (boardPx - gap * (size + 1)) / size;

  const stuck = !canMove(board);
  const stateRef = useRef({ board, score, won, stuck, keepPlaying });
  stateRef.current = { board, score, won, stuck, keepPlaying };

  useEffect(() => onProgress?.({ score, level: levelFor(board) }), [score, board, onProgress]);

  function doMove(dir: Direction) {
    const s = stateRef.current;
    if (s.stuck || (s.won && !s.keepPlaying)) return;
    const r = move(s.board, dir);
    if (!r.moved) return;
    const next = addRandomTile(r.board);
    setBoard(next);
    setScore((x) => x + r.gained);
    if (!s.won && maxTile(next) >= target) setWon(true);
  }
  const moveRef = useRef(doMove);
  moveRef.current = doMove;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          const { dx, dy } = g;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          if (Math.abs(dx) > Math.abs(dy)) moveRef.current(dx > 0 ? 'right' : 'left');
          else moveRef.current(dy > 0 ? 'down' : 'up');
        },
      }),
    [],
  );

  const finish = (outcome: 'completed' | 'failed') =>
    onFinish({ score, level: levelFor(board), outcome, summary: `Biggest tile: ${maxTile(board)}` });

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Badge label={`Target ${target}`} tone="yellow" />
        <Text style={styles.score}>Score {score}</Text>
      </Row>
      <Muted style={{ marginBottom: spacing.sm }}>Swipe on the board (or use the arrows) to slide tiles. Equal tiles merge.</Muted>

      <View
        {...pan.panHandlers}
        style={[styles.board, { width: boardPx, height: boardPx, padding: gap / 2 }]}
        accessibilityLabel={`2048 board. Score ${score}. Biggest tile ${maxTile(board)}.`}
      >
        {board.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row' }}>
            {row.map((v, j) => {
              const c = tileColor(v);
              return (
                <View key={j} style={[styles.tile, { width: cell, height: cell, margin: gap / 2, backgroundColor: c.bg }]}>
                  {v ? <Text style={[styles.tileText, { color: c.fg, fontSize: v >= 1024 ? cell * 0.28 : v >= 128 ? cell * 0.34 : cell * 0.4 }]}>{v}</Text> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.pad}>
        <IconButton icon="arrow-up-circle" label="Move up" onPress={() => doMove('up')} />
        <Row gap={spacing.xl}>
          <IconButton icon="arrow-back-circle" label="Move left" onPress={() => doMove('left')} />
          <IconButton icon="arrow-down-circle" label="Move down" onPress={() => doMove('down')} />
          <IconButton icon="arrow-forward-circle" label="Move right" onPress={() => doMove('right')} />
        </Row>
      </View>

      {won && !keepPlaying ? (
        <>
          <InfoBanner tone="success" icon="trophy" message={`You reached ${target}! Amazing.`} />
          <Row>
            <Button title="Keep playing" variant="secondary" onPress={() => setKeepPlaying(true)} style={{ flex: 1 }} />
            <Button title="Finish" variant="accent" icon="flag-outline" onPress={() => finish('completed')} style={{ flex: 1 }} />
          </Row>
        </>
      ) : stuck ? (
        <>
          <InfoBanner tone={won ? 'success' : 'danger'} icon="grid-outline" message="No more moves left." />
          <Button title="See results" variant="accent" icon="flag-outline" onPress={() => finish(won ? 'completed' : 'failed')} />
        </>
      ) : (
        <Button title="End game & save score" variant="secondary" icon="flag-outline" onPress={() => finish('completed')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  score: { fontSize: fontSizes.md, fontWeight: '800', color: colors.forestGreen },
  board: { backgroundColor: '#CFC8AE', borderRadius: radii.lg, alignSelf: 'center' },
  tile: { borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontWeight: '900' },
  pad: { alignItems: 'center', marginVertical: spacing.md },
});
