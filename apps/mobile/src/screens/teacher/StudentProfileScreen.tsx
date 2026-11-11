import React from 'react';
import { Text, View } from 'react-native';
import { endpoints } from '../../api';
import { BarList } from '../../components/charts';
import { Async, Badge, Card, Divider, ListRow, Muted, ProgressBar, Row, Screen, SectionTitle, StatGrid, StatTile } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { TeacherStackScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';
import { avatarEmoji, fmtDate, fmtDateTime, fmtPercent } from '../../utils/format';

export default function StudentProfileScreen({ route }: TeacherStackScreen<'StudentProfile'>) {
  const { studentId } = route.params;
  const state = useApi(() => endpoints.teacherStudent(studentId), [studentId]);

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state}>
        {(d) => {
          const withData = d.subjects.filter((s) => s.sampleSize > 0);
          return (
            <>
              <Card>
                <Row gap={spacing.md}>
                  <Text style={{ fontSize: 40 }}>{avatarEmoji(d.profile.avatar)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSizes.xl, fontWeight: '800', color: colors.text }}>{d.profile.userId?.name}</Text>
                    <Muted>
                      {d.profile.studentCode} · Class {d.profile.levelNumber}
                    </Muted>
                    <Muted>Last sign-in: {fmtDateTime(d.profile.userId?.lastLoginAt)}</Muted>
                  </View>
                </Row>
              </Card>

              <StatGrid>
                <StatTile icon="stats-chart-outline" label="Average score" value={fmtPercent(d.performance.averagePercent)} sub={`${d.performance.sampleSize} attempts`} />
                <StatTile
                  icon="checkmark-done-outline"
                  label="Activities done"
                  value={d.activityCompletion.ratePercent === null ? '—' : fmtPercent(d.activityCompletion.ratePercent)}
                  sub={`${d.activityCompletion.completed} of ${d.activityCompletion.expected}`}
                  tone="yellow"
                />
              </StatGrid>

              <SectionTitle>Subject scores</SectionTitle>
              <Card>
                {withData.length === 0 ? (
                  <Muted>No quiz attempts yet.</Muted>
                ) : (
                  <BarList rows={withData.map((s) => ({ label: s.name, value: s.averagePercent, sub: `${s.sampleSize} attempts` }))} />
                )}
              </Card>

              <SectionTitle>Recent attempts</SectionTitle>
              <Card>
                {d.recentAttempts.length === 0 ? (
                  <Muted>No attempts yet.</Muted>
                ) : (
                  d.recentAttempts.map((a, i) => (
                    <View key={a._id}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        title={a.quizId?.title ?? 'Quiz'}
                        subtitle={`${a.subjectId?.name ?? a.context} · ${fmtDate(a.submittedAt)} · ${a.score}/${a.maxScore}`}
                        right={<Text style={{ fontWeight: '800', color: a.percent < 50 ? colors.danger : colors.primary }}>{fmtPercent(a.percent)}</Text>}
                      />
                    </View>
                  ))
                )}
              </Card>

              <SectionTitle>Learning history</SectionTitle>
              <Card>
                {d.learningHistory.length === 0 ? (
                  <Muted>No learning items opened yet.</Muted>
                ) : (
                  d.learningHistory.map((l, i) => (
                    <View key={l._id} style={{ paddingVertical: spacing.xs }}>
                      {i > 0 ? <Divider /> : null}
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={{ flex: 1, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                          {l.learningItemId?.title ?? 'Learning item'}
                        </Text>
                        <Badge label={l.status === 'completed' ? 'Completed' : `${l.progressPct ?? 0}%`} tone={l.status === 'completed' ? 'success' : 'yellow'} />
                      </Row>
                      <Muted>
                        {l.subjectId?.name ?? ''} · {l.learningItemId?.type ?? ''} · {fmtDate(l.lastOpenedAt)}
                      </Muted>
                    </View>
                  ))
                )}
              </Card>

              <SectionTitle>Certificates</SectionTitle>
              <Card>
                {d.certificates.length === 0 ? (
                  <Muted>No certificates earned yet.</Muted>
                ) : (
                  <Row style={{ flexWrap: 'wrap' }}>
                    {d.certificates.map((c) => (
                      <Badge key={c._id} label={`Level ${c.level}${c.levelTitle ? ` · ${c.levelTitle}` : ''}`} tone="gold" icon="ribbon" />
                    ))}
                  </Row>
                )}
              </Card>

              <SectionTitle>Programme progress</SectionTitle>
              <Card>
                {d.programmes.length === 0 ? (
                  <Muted>Not enrolled in any programme.</Muted>
                ) : (
                  d.programmes.map((p) => (
                    <View key={p._id} style={{ marginBottom: spacing.md }}>
                      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontWeight: '600', color: colors.text, flex: 1 }}>{p.programmeId?.name ?? 'Programme'}</Text>
                        <Text style={{ fontWeight: '700', color: colors.text }}>{Math.round(p.progressPct ?? 0)}%</Text>
                      </Row>
                      <ProgressBar value={p.progressPct ?? 0} color={p.programmeId?.premium ? colors.gold : colors.primary} />
                    </View>
                  ))
                )}
              </Card>
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
