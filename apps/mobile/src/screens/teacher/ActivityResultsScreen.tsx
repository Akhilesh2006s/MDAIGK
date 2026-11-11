import React, { useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { endpoints, errorMessage, type ActivityResults } from '../../api';
import { Async, Badge, Body, Button, Card, Divider, InlineError, Muted, ProgressBar, Row, Screen, SectionTitle, Segmented, StatGrid, StatTile, TextField } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { TeacherStackScreen } from '../../navigation/types';
import { colors, fontSizes, radii, spacing } from '../../theme';
import { fmtDate, fmtDateTime, fmtPercent } from '../../utils/format';
import { sectionLabel, subjectName } from './ActivitiesScreen';

type StudentRow = ActivityResults['students'][number];

export default function ActivityResultsScreen({ route }: TeacherStackScreen<'ActivityResults'>) {
  const { activityId } = route.params;
  const state = useApi(() => endpoints.activityResults(activityId), [activityId]);
  const [tab, setTab] = useState<'students' | 'questions'>('students');
  const [reviewing, setReviewing] = useState<StudentRow | null>(null);

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state}>
        {(r) => {
          const a = r.activity;
          const isQuiz = a.type === 'quiz';
          return (
            <>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: fontSizes.lg, fontWeight: '800', color: colors.text, flex: 1 }}>{a.title}</Text>
                  <Badge label={a.status} tone={a.status === 'published' ? 'success' : a.status === 'closed' ? 'info' : 'muted'} />
                </Row>
                <Muted>
                  {sectionLabel(a)} · {subjectName(a)} · {a.type}
                </Muted>
                <Muted>
                  {fmtDate(a.startAt)} → due {fmtDate(a.dueAt)}
                </Muted>
                {a.instructions ? <Body style={{ marginTop: spacing.sm }}>{a.instructions}</Body> : null}
                {a.worksheetRef ? <Muted style={{ marginTop: spacing.xs }}>Worksheet: {a.worksheetRef}</Muted> : null}
              </Card>

              <StatGrid>
                <StatTile icon="checkmark-done-outline" label="Completion" value={fmtPercent(r.summary.completionPercent)} sub={`${r.summary.completed} of ${r.summary.recipients} students`} />
                {isQuiz ? (
                  <StatTile icon="stats-chart-outline" label="Average score" value={fmtPercent(r.summary.averagePercent)} tone="yellow" sub="First attempt per student" />
                ) : (
                  <StatTile
                    icon="document-text-outline"
                    label="To review"
                    value={r.students.filter((s) => s.completed && !s.reviewedAt).length}
                    tone="yellow"
                    sub="Submitted, not reviewed"
                  />
                )}
              </StatGrid>
              <ProgressBar value={r.summary.completionPercent ?? 0} style={{ marginBottom: spacing.md }} />

              {isQuiz ? (
                <Segmented
                  options={[
                    { value: 'students', label: 'Students' },
                    { value: 'questions', label: 'Incorrect answers' },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
              ) : null}

              {tab === 'students' || !isQuiz ? (
                <Card>
                  {r.students.length === 0 ? (
                    <Muted>No recipients.</Muted>
                  ) : (
                    r.students.map((s, i) => (
                      <View key={s.studentId} style={{ paddingVertical: spacing.sm }}>
                        {i > 0 ? <Divider /> : null}
                        <Row style={{ justifyContent: 'space-between' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700', color: colors.text }}>{s.name}</Text>
                            <Muted>
                              {s.studentCode}
                              {s.completedAt ? ` · ${fmtDateTime(s.completedAt)}` : ''}
                            </Muted>
                          </View>
                          {s.percent !== null ? (
                            <Text style={{ fontWeight: '800', color: s.percent < 50 ? colors.danger : colors.primary }}>
                              {s.score}/{s.maxScore} · {fmtPercent(s.percent)}
                            </Text>
                          ) : (
                            <Badge label={s.completed ? (s.reviewedAt ? 'Reviewed' : 'Submitted') : 'Pending'} tone={s.completed ? (s.reviewedAt ? 'success' : 'yellow') : 'muted'} />
                          )}
                        </Row>
                        {s.late ? <Badge label="Late" tone="danger" /> : null}
                        {s.note ? <Muted style={{ marginTop: 4 }}>Student note: {s.note}</Muted> : null}
                        {s.teacherFeedback ? <Muted style={{ marginTop: 4 }}>Your feedback: {s.teacherFeedback}</Muted> : null}
                        {!isQuiz && s.completed ? (
                          <Button
                            small
                            variant="secondary"
                            title={s.reviewedAt ? 'Update feedback' : 'Review'}
                            icon="chatbox-ellipses-outline"
                            onPress={() => setReviewing(s)}
                            style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
                          />
                        ) : null}
                      </View>
                    ))
                  )}
                </Card>
              ) : (
                <>
                  <SectionTitle>Most-missed questions</SectionTitle>
                  {r.questionReview.length === 0 ? (
                    <Muted>No quiz submissions yet.</Muted>
                  ) : (
                    r.questionReview.map((q, idx) => (
                      <Card key={q.questionId}>
                        <Muted>Question {idx + 1}</Muted>
                        <Body style={{ fontWeight: '700' }}>{q.prompt}</Body>
                        <Row style={{ marginVertical: spacing.sm }}>
                          <Badge label={`${q.wrongCount} of ${q.answered} answered incorrectly`} tone={q.wrongCount ? 'danger' : 'success'} />
                        </Row>
                        {q.options.map((o, i) => (
                          <Text key={i} style={{ color: i === q.correctIndex ? colors.success : colors.text, fontWeight: i === q.correctIndex ? '700' : '400', paddingVertical: 2 }}>
                            {i === q.correctIndex ? '✓ ' : '• '}
                            {o}
                          </Text>
                        ))}
                      </Card>
                    ))
                  )}
                </>
              )}
            </>
          );
        }}
      </Async>
      <ReviewModal
        activityId={activityId}
        student={reviewing}
        onClose={(saved) => {
          setReviewing(null);
          if (saved) void state.refresh();
        }}
      />
    </Screen>
  );
}

function ReviewModal({ activityId, student, onClose }: { activityId: string; student: StudentRow | null; onClose: (saved: boolean) => void }) {
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    setFeedback(student?.teacherFeedback ?? '');
    setError(null);
  }, [student]);

  async function submit() {
    if (!student) return;
    setBusy(true);
    setError(null);
    try {
      await endpoints.reviewSubmission(activityId, student.studentId, feedback.trim());
      onClose(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={Boolean(student)} transparent animationType="slide" onRequestClose={() => onClose(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.warmIvory, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg }}>
          <Text style={{ fontSize: fontSizes.lg, fontWeight: '800', color: colors.text }}>Review: {student?.name}</Text>
          <Muted>Submitted {fmtDateTime(student?.completedAt)}</Muted>
          {student?.note ? (
            <Card style={{ marginTop: spacing.md }}>
              <Muted>Student’s note</Muted>
              <Body>{student.note}</Body>
            </Card>
          ) : (
            <Muted style={{ marginVertical: spacing.md }}>The student didn’t add a note.</Muted>
          )}
          <TextField label="Feedback for the student" value={feedback} onChangeText={setFeedback} multiline maxLength={2000} placeholder="Well done! Next time…" />
          <InlineError message={error} />
          <Row>
            <Button title="Cancel" variant="secondary" onPress={() => onClose(false)} style={{ flex: 1 }} />
            <Button title="Mark reviewed" icon="checkmark" onPress={submit} loading={busy} style={{ flex: 1 }} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}
