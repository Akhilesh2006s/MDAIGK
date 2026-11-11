import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { endpoints, errorMessage } from '../../api';
import { Button, Card, InlineError, Ionicons, Muted, Screen } from '../../components/ui';
import Game2048 from '../../games/Game2048';
import GrammarFixes from '../../games/GrammarFixes';
import MathSprint from '../../games/MathSprint';
import SpellMaster from '../../games/SpellMaster';
import type { GameProps, GameResult } from '../../games/types';
import type { StudentStackScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';

const GAMES: Record<string, React.ComponentType<GameProps>> = {
  SPELL_MASTER: SpellMaster,
  GRAMMAR_FIXES: GrammarFixes,
  G2048: Game2048,
  MATH_SPRINT: MathSprint,
};

type Phase = 'playing' | 'saving' | 'saved' | 'saveError';

export default function GamePlayScreen({ route, navigation }: StudentStackScreen<'GamePlay'>) {
  const { code, attemptId, config, dailyUsage, name } = route.params;
  const Game = GAMES[code];
  const startedAt = useRef(Date.now());
  const progress = useRef({ score: 0, level: 1 });
  const finished = useRef(false);
  const [phase, setPhase] = useState<Phase>('playing');
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elapsed = () => Math.min(7200, Math.round((Date.now() - startedAt.current) / 1000));

  const save = useCallback(
    async (r: GameResult) => {
      setPhase('saving');
      setError(null);
      try {
        await endpoints.finishGame(attemptId, { score: Math.max(0, Math.round(r.score)), level: Math.max(1, r.level), durationSec: elapsed(), outcome: r.outcome });
        setPhase('saved');
      } catch (e) {
        setError(errorMessage(e));
        setPhase('saveError');
      }
    },
    [attemptId],
  );

  const onFinish = useCallback(
    (r: GameResult) => {
      if (finished.current) return;
      finished.current = true;
      setResult(r);
      void save(r);
    },
    [save],
  );

  const onProgress = useCallback((p: { score: number; level: number }) => {
    progress.current = p;
  }, []);

  // Leaving mid-game records the attempt as abandoned (it already counts toward today's limit).
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (finished.current) return;
        e.preventDefault();
        Alert.alert('Leave the game?', 'This attempt will still count towards today’s limit.', [
          { text: 'Keep playing', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => {
              finished.current = true;
              endpoints
                .finishGame(attemptId, { score: Math.max(0, Math.round(progress.current.score)), level: Math.max(1, progress.current.level), durationSec: elapsed(), outcome: 'abandoned' })
                .catch(() => undefined);
              navigation.dispatch(e.data.action);
            },
          },
        ]);
      }),
    [navigation, attemptId],
  );

  if (!Game) {
    return (
      <Screen>
        <InlineError message={`${name} isn’t available in this version of the app.`} />
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name={result.outcome === 'completed' ? 'trophy' : 'happy-outline'} size={56} color={result.outcome === 'completed' ? colors.gold : colors.primary} />
          <Text style={{ fontSize: fontSizes.xxl, fontWeight: '800', color: colors.forestGreen, marginTop: spacing.sm }}>
            {result.outcome === 'completed' ? 'Great game!' : 'Nice effort!'}
          </Text>
          <Text style={{ fontSize: 44, fontWeight: '900', color: colors.text }}>{result.score}</Text>
          <Muted>points · level {result.level}</Muted>
          {result.summary ? <Muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>{result.summary}</Muted> : null}
          {phase === 'saving' ? <Muted style={{ marginTop: spacing.md }}>Saving your score…</Muted> : null}
          {phase === 'saved' ? <Muted style={{ marginTop: spacing.md }}>Score saved.</Muted> : null}
        </Card>
        {phase === 'saveError' ? (
          <>
            <InlineError message={`Your score wasn’t saved: ${error}`} />
            <Button title="Try saving again" icon="refresh" onPress={() => save(result)} style={{ marginBottom: spacing.sm }} />
          </>
        ) : null}
        <Muted style={{ textAlign: 'center', marginBottom: spacing.md }}>
          Attempts today: {dailyUsage.used} of {dailyUsage.limit} used · {dailyUsage.remaining} left
        </Muted>
        <Button title="Back to games" variant="accent" icon="game-controller-outline" onPress={() => navigation.goBack()} disabled={phase === 'saving'} />
      </Screen>
    );
  }

  // 2048 uses swipe gestures, so it must not sit inside a vertical ScrollView.
  return (
    <Screen scroll={code !== 'G2048'}>
      <View>
        <Game config={config} onFinish={onFinish} onProgress={onProgress} />
      </View>
    </Screen>
  );
}
