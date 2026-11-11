import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { ApiError, endpoints, errorMessage, type ProgrammeItem } from '../../api';
import { Async, Badge, Body, Button, Card, EmptyState, Ionicons, InlineError, Muted, PremiumBadge, ProgressBar, Row, Screen, SectionTitle } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentStackScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';
import { lockReasonText } from '../../utils/format';

const ITEM_ICONS = { lesson: 'book-outline', activity: 'construct-outline', quiz: 'help-circle-outline', experiment: 'flask-outline' } as const;

export default function ProgrammeDetailScreen({ route, navigation }: StudentStackScreen<'ProgrammeDetail'>) {
  const { id } = route.params;
  const state = useApi(() => endpoints.programme(id), [id], { reloadOnFocus: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await state.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (state.error instanceof ApiError && state.error.code === 'PROGRAMME_LOCKED' && !state.data) {
    const reason = (state.error.details as { reason?: string } | undefined)?.reason;
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title="Programme locked" message={lockReasonText(reason)} action={<Button title="Back to programmes" onPress={() => navigation.goBack()} />} />
      </Screen>
    );
  }

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state}>
        {(p) => {
          const items = p.modules.flatMap((m) => m.items);
          const progress = p.enrolment?.progressPct ?? 0;
          const renderItem = (it: ProgrammeItem) => {
            const expanded = openItem === it._id;
            return (
              <View key={it._id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm }}>
                <Row>
                  <Ionicons name={it.completed ? 'checkmark-circle' : ITEM_ICONS[it.type] ?? 'ellipse-outline'} size={24} color={it.completed ? colors.success : colors.primary} />
                  <Text style={{ flex: 1, fontWeight: '700', color: colors.text }} onPress={() => setOpenItem(expanded ? null : it._id)}>
                    {it.title}
                  </Text>
                  {it.required === false ? <Badge label="Optional" tone="muted" /> : null}
                  <Button title={expanded ? 'Hide' : 'Open'} small variant="ghost" onPress={() => setOpenItem(expanded ? null : it._id)} />
                </Row>
                {expanded ? (
                  <View style={{ paddingLeft: 32, gap: spacing.sm }}>
                    {it.content ? <Body>{it.content}</Body> : <Muted>{it.type === 'quiz' ? 'Take the quiz, then mark this step complete.' : 'Complete this step, then mark it done.'}</Muted>}
                    {p.enrolment && it.quizId ? (
                      <Button
                        title="Take the quiz"
                        small
                        variant="accent"
                        icon="help-circle-outline"
                        onPress={() => navigation.navigate('Quiz', { kind: 'quiz', quizId: it.quizId!, title: it.title })}
                      />
                    ) : null}
                    {p.enrolment && !it.completed ? (
                      <Button title="Mark step complete" small icon="checkmark" onPress={() => run(it._id, () => endpoints.completeProgrammeItem(p._id, it._id))} loading={busy === it._id} />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          };
          return (
            <>
              <Card style={p.premium ? { borderColor: colors.gold } : undefined}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: fontSizes.xl, fontWeight: '800', color: colors.text, flex: 1 }}>{p.name}</Text>
                  {p.premium ? <PremiumBadge /> : null}
                </Row>
                {p.description ? <Muted style={{ marginTop: 4 }}>{p.description}</Muted> : null}
                {p.enrolment ? (
                  <View style={{ marginTop: spacing.md }}>
                    <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <Muted>
                        {items.filter((i) => i.completed).length} of {items.length} steps done
                      </Muted>
                      <Text style={{ fontWeight: '700' }}>{Math.round(progress)}%</Text>
                    </Row>
                    <ProgressBar value={progress} color={p.premium ? colors.gold : colors.primary} />
                    {p.enrolment.completedAt ? <Badge label="Programme completed!" tone="success" icon="trophy" /> : null}
                  </View>
                ) : (
                  <Button title="Enrol and start" variant={p.premium ? 'gold' : 'accent'} icon="rocket-outline" onPress={() => run('enrol', () => endpoints.enrol(p._id))} loading={busy === 'enrol'} style={{ marginTop: spacing.md }} />
                )}
              </Card>
              <InlineError message={error} />
              {p.modules.length === 0 ? <EmptyState icon="albums-outline" title="Modules coming soon" /> : null}
              {p.modules.map((m, mi) => (
                <View key={m._id}>
                  <SectionTitle>
                    Module {mi + 1}: {m.title}
                  </SectionTitle>
                  <Card>
                    {m.description ? <Muted style={{ marginBottom: spacing.sm }}>{m.description}</Muted> : null}
                    {m.items.length ? m.items.map(renderItem) : <Muted>No steps yet.</Muted>}
                  </Card>
                </View>
              ))}
              {!p.enrolment && p.modules.length ? <Muted style={{ textAlign: 'center' }}>Enrol to track your progress and mark steps complete.</Muted> : null}
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
