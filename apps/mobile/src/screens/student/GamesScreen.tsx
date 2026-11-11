import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { endpoints, errorMessage, ApiError, type GameSummary } from '../../api';
import { Async, Badge, Button, Card, IconCircle, InfoBanner, Muted, ProgressBar, Row, Screen, type IconName } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentTabScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';
import { timeUntil } from '../../utils/format';

const ICONS: Record<string, IconName> = {
  SPELL_MASTER: 'text-outline',
  GRAMMAR_FIXES: 'create-outline',
  G2048: 'grid-outline',
  MATH_SPRINT: 'calculator-outline',
};

export default function GamesScreen({ navigation }: StudentTabScreen<'Games'>) {
  const state = useApi(endpoints.games, [], { reloadOnFocus: true });
  const [starting, setStarting] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState<{ gameId: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(g: GameSummary) {
    setStarting(g._id);
    setError(null);
    setLimitMsg(null);
    try {
      const s = await endpoints.startGame(g._id);
      navigation.navigate('GamePlay', { gameId: g._id, code: g.code, name: g.name, attemptId: s.attemptId, config: s.config, dailyUsage: s.dailyUsage });
      void state.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DAILY_LIMIT_REACHED') {
        const resetsAt = (e.details as { resetsAt?: string } | undefined)?.resetsAt;
        setLimitMsg({
          gameId: g._id,
          text: `You’ve used all of today’s ${g.name} attempts. Come back ${resetsAt ? `${timeUntil(resetsAt)} (resets at ${new Date(resetsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })})` : 'tomorrow'} — try another game or some learning meanwhile!`,
        });
        void state.refresh();
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setStarting(null);
    }
  }

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      {error ? <InfoBanner tone="danger" icon="alert-circle-outline" message={error} /> : null}
      <Async state={state} isEmpty={(d) => d.length === 0} empty={{ icon: 'game-controller-outline', title: 'No games right now', message: 'Games for your class will appear here.' }}>
        {(games) => (
          <>
            {games[0]?.dailyUsage ? <Muted style={{ marginBottom: spacing.md }}>Each game can be played a limited number of times per day. Attempts reset {timeUntil(games[0].dailyUsage.resetsAt)}.</Muted> : null}
            {games.map((g) => {
              const u = g.dailyUsage;
              const none = u ? u.remaining <= 0 : false;
              return (
                <Card key={g._id}>
                  <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
                    <IconCircle icon={ICONS[g.code] ?? 'game-controller-outline'} bg="#FFF4CC" color={colors.forestGreen} size={52} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSizes.lg, fontWeight: '800', color: colors.text }}>{g.name}</Text>
                      <Muted>{g.description}</Muted>
                    </View>
                  </Row>
                  <Row style={{ marginTop: spacing.md, flexWrap: 'wrap' }}>
                    <Badge label={`Best ${g.progress.bestScore}`} tone="gold" icon="trophy" />
                    {g.progress.bestLevel ? <Badge label={`Level ${g.progress.bestLevel}`} tone="green" /> : null}
                    <Badge label={`${g.progress.completedPlays} plays`} tone="muted" />
                  </Row>
                  {u ? (
                    <View style={{ marginTop: spacing.md }}>
                      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <Muted>
                          Today: {u.used} of {u.limit} used
                        </Muted>
                        <Text style={{ fontWeight: '700', color: none ? colors.danger : colors.primary }}>{u.remaining} left</Text>
                      </Row>
                      <ProgressBar value={(u.used / Math.max(1, u.limit)) * 100} color={none ? colors.locked : colors.mangoYellow} />
                      {none ? <Muted style={{ marginTop: 4 }}>Resets {timeUntil(u.resetsAt)}</Muted> : null}
                    </View>
                  ) : null}
                  {limitMsg?.gameId === g._id ? (
                    <View style={{ marginTop: spacing.md }}>
                      <InfoBanner tone="yellow" icon="time-outline" message={limitMsg.text} />
                    </View>
                  ) : null}
                  <Button
                    title={none ? 'Come back tomorrow' : 'Play'}
                    variant="accent"
                    icon={none ? 'time-outline' : 'play'}
                    onPress={() => start(g)}
                    loading={starting === g._id}
                    disabled={none || (starting !== null && starting !== g._id)}
                    style={{ marginTop: spacing.md }}
                  />
                </Card>
              );
            })}
          </>
        )}
      </Async>
    </Screen>
  );
}
