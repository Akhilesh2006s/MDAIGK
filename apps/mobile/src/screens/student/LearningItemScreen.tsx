import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { endpoints, errorMessage } from '../../api';
import { Async, Badge, Body, Button, Card, InfoBanner, InlineError, Muted, ProgressBar, Row, Screen, SectionTitle } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentStackScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';

export default function LearningItemScreen({ route, navigation }: StudentStackScreen<'LearningItem'>) {
  const { id } = route.params;
  const state = useApi(() => endpoints.learningItem(id), [id], { reloadOnFocus: true });
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.data) navigation.setOptions({ title: state.data.subjectId?.name ?? 'Learning' });
  }, [state.data, navigation]);

  async function saveProgress(pct: number) {
    setBusy(pct);
    setError(null);
    try {
      await endpoints.learningProgress(id, pct === 100 ? { completed: true } : { progressPct: pct });
      await state.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state}>
        {(item) => {
          const completed = item.progress?.status === 'completed';
          const pct = item.progress?.progressPct ?? 0;
          return (
            <>
              <Text style={{ fontSize: fontSizes.xxl, fontWeight: '800', color: colors.text }}>{item.title}</Text>
              <Row style={{ flexWrap: 'wrap', marginVertical: spacing.sm }}>
                <Badge label={item.type} tone="green" />
                <Badge label={`Class ${item.classLevels.length > 1 ? `${Math.min(...item.classLevels)}–${Math.max(...item.classLevels)}` : item.classLevels[0]}`} tone="muted" />
                {item.estimatedMinutes ? <Badge label={`${item.estimatedMinutes} min`} tone="info" icon="time-outline" /> : null}
                {completed ? <Badge label="Completed" tone="success" icon="checkmark" /> : null}
              </Row>
              {!completed ? <ProgressBar value={pct} style={{ marginBottom: spacing.md }} /> : null}

              {item.instructions ? <InfoBanner icon="bulb-outline" tone="yellow" message={item.instructions} /> : null}
              {item.description ? <Muted style={{ marginBottom: spacing.sm }}>{item.description}</Muted> : null}

              {item.audioUrl ? <AudioCard url={item.audioUrl} /> : null}

              <Card>
                {item.body ? <Body style={{ lineHeight: 26, fontSize: 17 }}>{item.body}</Body> : <Muted>This item has no written explanation.</Muted>}
              </Card>

              {item.quiz ? (
                <>
                  <SectionTitle>Check your understanding</SectionTitle>
                  <Card>
                    <Text style={{ fontWeight: '800', color: colors.text }}>{item.quiz.title}</Text>
                    <Muted>{item.quiz.questionCount} questions</Muted>
                    <Button
                      title="Take the quiz"
                      variant="accent"
                      icon="help-circle-outline"
                      onPress={() => navigation.navigate('Quiz', { kind: 'quiz', quizId: item.quiz!.id, title: item.quiz!.title, learningItemId: item._id })}
                      style={{ marginTop: spacing.md }}
                    />
                  </Card>
                </>
              ) : null}

              <InlineError message={error} />
              {completed ? (
                <InfoBanner tone="success" icon="checkmark-circle" message="You’ve completed this item. Great job!" />
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {pct < 50 ? <Button title="Save progress (halfway)" variant="secondary" icon="bookmark-outline" onPress={() => saveProgress(50)} loading={busy === 50} disabled={busy !== null} /> : null}
                  <Button title="Mark as complete" icon="checkmark-done" onPress={() => saveProgress(100)} loading={busy === 100} disabled={busy !== null} />
                </View>
              )}
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

function AudioCard({ url }: { url: string }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const [failed, setFailed] = useState(false);

  const toggle = () => {
    try {
      if (status.playing) player.pause();
      else {
        if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) void player.seekTo(0);
        player.play();
      }
    } catch {
      setFailed(true);
    }
  };

  return (
    <Card style={{ backgroundColor: colors.lightGreen }}>
      <Text style={{ fontWeight: '800', color: colors.text }}>Listen</Text>
      {status.duration > 0 ? <ProgressBar value={(status.currentTime / status.duration) * 100} style={{ marginVertical: spacing.sm }} /> : null}
      <Row>
        <Button title={status.playing ? 'Pause' : 'Play audio'} icon={status.playing ? 'pause' : 'play'} onPress={toggle} small style={{ flex: 1 }} />
        <Button title="Open link" variant="secondary" icon="open-outline" small onPress={() => Linking.openURL(url)} style={{ flex: 1 }} />
      </Row>
      {failed ? <Muted>Audio couldn’t play here — try “Open link”.</Muted> : null}
    </Card>
  );
}
