import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { endpoints, type ProgressRange } from '../../api';
import { BarList } from '../../components/charts';
import { Async, Badge, Button, Card, Divider, IconCircle, ListRow, Muted, PremiumBadge, ProgressBar, Row, Screen, SectionTitle, Segmented, StatGrid, StatTile } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentTabScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';
import { fmtDate, fmtPercent } from '../../utils/format';

const RANGES: Array<{ value: ProgressRange; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All' },
];

export default function ProgressScreen({ navigation }: StudentTabScreen<'Progress'>) {
  const [range, setRange] = useState<ProgressRange>('30d');
  const state = useApi(() => endpoints.studentProgress(range), [range], { reloadOnFocus: true });

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Segmented options={RANGES} value={range} onChange={setRange} />
      <Async state={state}>
        {(p) => {
          const subjects = p.subjects.filter((s) => s.sampleSize > 0);
          return (
            <>
              <Card style={{ backgroundColor: colors.forestGreen, borderColor: colors.forestGreen }}>
                <Text style={{ color: colors.lightGreen }}>Overall score · {p.rangeLabel}</Text>
                <Text style={{ color: colors.white, fontSize: 40, fontWeight: '900' }}>{fmtPercent(p.overall.averagePercent)}</Text>
                <Text style={{ color: colors.lightGreen }}>{p.overall.sampleSize ? `From ${p.overall.sampleSize} quizzes and assessments` : 'No quizzes in this period yet'}</Text>
              </Card>

              <StatGrid>
                <StatTile icon="flame-outline" label="Learning streak" value={`${p.streak.current} day${p.streak.current === 1 ? '' : 's'}`} tone="yellow" sub={p.streak.activeToday ? 'Active today' : 'Learn today to keep it going'} />
                <StatTile icon="checkmark-done-outline" label="Activities done" value={p.overall.completedActivities} sub={p.activityCompletion.expected ? `of ${p.activityCompletion.expected} assigned` : undefined} />
                <StatTile icon="book-outline" label="Learning items" value={p.overall.learningItemsCompleted} tone="info" sub="completed" />
                <StatTile icon="ribbon-outline" label="Certification" value={p.certification.currentLevel ? `Level ${p.certification.currentLevel}` : '—'} tone="gold" sub={`${p.certification.certificates.length} certificates`} />
              </StatGrid>

              <SectionTitle>Subject performance</SectionTitle>
              <Card>{subjects.length ? <BarList rows={subjects.map((s) => ({ label: s.name, value: s.averagePercent, sub: `${s.sampleSize} attempts` }))} /> : <Muted>Take some quizzes to see your subject scores.</Muted>}</Card>

              <SectionTitle>Badges</SectionTitle>
              <Card>
                {p.badges.length === 0 ? (
                  <Muted>No badges yet — complete a quiz to earn your first one!</Muted>
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    {p.badges.map((b) => (
                      <Row key={b.code}>
                        <IconCircle icon="medal" bg={colors.goldBg} color={colors.gold} size={36} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '800', color: colors.text }}>{b.name}</Text>
                          <Muted>{b.description}</Muted>
                        </View>
                      </Row>
                    ))}
                  </View>
                )}
                {p.lockedBadges.length ? <Muted style={{ marginTop: spacing.md }}>{p.lockedBadges.length} more badges to discover.</Muted> : null}
              </Card>

              <SectionTitle action={<Button title="All" small variant="ghost" onPress={() => navigation.navigate('Programmes')} />}>Programmes</SectionTitle>
              <Card>
                {p.programmes.map((pr) => (
                  <View key={pr.id} style={{ marginBottom: spacing.md }}>
                    <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <Row style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: pr.locked ? colors.locked : colors.text }} numberOfLines={1}>
                          {pr.name}
                        </Text>
                        {pr.premium ? <PremiumBadge /> : null}
                      </Row>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{pr.locked ? 'Locked' : pr.enrolled ? `${Math.round(pr.progressPercent)}%` : 'Not started'}</Text>
                    </Row>
                    <ProgressBar value={pr.locked ? 0 : pr.progressPercent} color={pr.premium ? colors.gold : colors.primary} />
                  </View>
                ))}
              </Card>

              <SectionTitle action={<Button title="Certificates" small variant="ghost" onPress={() => navigation.navigate('Certificates')} />}>Assessment history</SectionTitle>
              <Card>
                {p.history.length === 0 ? (
                  <Muted>No assessments in this period.</Muted>
                ) : (
                  p.history.map((h, i) => (
                    <View key={h._id}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        title={h.quizId?.title ?? 'Quiz'}
                        subtitle={`${h.subjectId?.name ?? ''}${h.subjectId?.name ? ' · ' : ''}${h.context} · ${fmtDate(h.submittedAt)}`}
                        right={
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontWeight: '800', fontSize: fontSizes.md, color: h.percent >= 50 ? colors.primary : colors.danger }}>{fmtPercent(h.percent)}</Text>
                            <Muted style={{ fontSize: fontSizes.xs }}>
                              {h.score}/{h.maxScore}
                            </Muted>
                          </View>
                        }
                      />
                    </View>
                  ))
                )}
              </Card>
              <Badge label="Scores are calculated by your school’s Mango Dude server" tone="muted" />
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
