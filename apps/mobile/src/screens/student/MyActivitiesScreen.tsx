import React, { useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { endpoints, errorMessage, type StudentActivity } from '../../api';
import { Async, Badge, Body, Button, Card, InlineError, Muted, Row, Screen, Segmented, TextField } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentStackScreen } from '../../navigation/types';
import { colors, fontSizes, radii, spacing } from '../../theme';
import { fmtDate, fmtPercent } from '../../utils/format';

type Filter = 'pending' | 'completed' | 'all';

export default function MyActivitiesScreen({ navigation }: StudentStackScreen<'MyActivities'>) {
  const [filter, setFilter] = useState<Filter>('pending');
  const state = useApi(() => endpoints.studentActivities(filter), [filter], { reloadOnFocus: true });
  const [completing, setCompleting] = useState<StudentActivity | null>(null);

  function open(a: StudentActivity) {
    if (a.type === 'quiz') {
      if (!a.quizId) return;
      navigation.navigate('Quiz', { kind: 'quiz', quizId: a.quizId._id, activityId: a._id, title: a.title });
    } else {
      setCompleting(a);
    }
  }

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Segmented
        options={[
          { value: 'pending', label: 'To do' },
          { value: 'completed', label: 'Done' },
          { value: 'all', label: 'All' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <Async
        state={state}
        isEmpty={(d) => d.length === 0}
        empty={{
          icon: filter === 'pending' ? 'happy-outline' : 'clipboard-outline',
          title: filter === 'pending' ? 'All caught up!' : 'Nothing here yet',
          message: filter === 'pending' ? 'You have no pending activities. Explore learning or play a game.' : 'Activities from your teachers will appear here.',
        }}
      >
        {(items) =>
          items.map((a) => {
            const closed = a.status === 'closed';
            const canDo = !a.completed && !closed && (a.type !== 'quiz' || Boolean(a.quizId));
            return (
              <Card key={a._id}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={{ flex: 1, fontSize: fontSizes.md, fontWeight: '800', color: colors.text }}>{a.title}</Text>
                  <Badge
                    label={a.completed ? 'Done' : closed ? 'Closed' : a.overdue ? 'Overdue' : a.type}
                    tone={a.completed ? 'success' : closed ? 'muted' : a.overdue ? 'danger' : 'yellow'}
                  />
                </Row>
                <Muted>
                  {a.subjectId?.name ?? ''}
                  {a.teacherId?.name ? ` · ${a.teacherId.name}` : ''} · due {fmtDate(a.dueAt)}
                </Muted>
                {a.instructions ? <Body style={{ marginTop: spacing.sm }}>{a.instructions}</Body> : null}
                {a.worksheetRef ? <Muted style={{ marginTop: 4 }}>Worksheet: {a.worksheetRef}</Muted> : null}
                {a.result ? (
                  <Text style={{ marginTop: spacing.sm, fontWeight: '700', color: colors.primary }}>
                    Score: {a.result.score}/{a.result.maxScore} ({fmtPercent(a.result.percent)})
                  </Text>
                ) : null}
                {a.teacherFeedback ? (
                  <View style={{ backgroundColor: colors.lightGreen, borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm }}>
                    <Muted>Teacher feedback</Muted>
                    <Body>{a.teacherFeedback}</Body>
                  </View>
                ) : null}
                {canDo ? (
                  <Button
                    title={a.type === 'quiz' ? 'Start quiz' : 'Mark complete'}
                    variant="accent"
                    icon={a.type === 'quiz' ? 'play' : 'checkmark-circle-outline'}
                    onPress={() => open(a)}
                    style={{ marginTop: spacing.md }}
                  />
                ) : null}
              </Card>
            );
          })
        }
      </Async>
      <CompleteModal
        activity={completing}
        onClose={(saved) => {
          setCompleting(null);
          if (saved) void state.refresh();
        }}
      />
    </Screen>
  );
}

function CompleteModal({ activity, onClose }: { activity: StudentActivity | null; onClose: (saved: boolean) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!activity) return;
    setBusy(true);
    setError(null);
    try {
      await endpoints.completeActivity(activity._id, note.trim());
      setNote('');
      onClose(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={Boolean(activity)} transparent animationType="slide" onRequestClose={() => onClose(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.warmIvory, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg }}>
          <Text style={{ fontSize: fontSizes.lg, fontWeight: '800', color: colors.text }}>Finished “{activity?.title}”?</Text>
          <Muted style={{ marginBottom: spacing.md }}>Add a short note for your teacher (optional).</Muted>
          <TextField label="Note" value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="I completed questions 1–10…" />
          <InlineError message={error} />
          <Row>
            <Button title="Cancel" variant="secondary" onPress={() => onClose(false)} style={{ flex: 1 }} />
            <Button title="Mark complete" variant="accent" icon="checkmark" onPress={submit} loading={busy} style={{ flex: 1 }} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}
