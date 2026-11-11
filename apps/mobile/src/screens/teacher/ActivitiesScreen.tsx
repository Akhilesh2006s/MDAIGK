import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { endpoints, errorMessage, type ActivityStatus, type TeacherActivity } from '../../api';
import { Async, Badge, Button, Card, Chip, ChipRow, Muted, ProgressBar, Row, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { TeacherTabScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';
import { fmtDate } from '../../utils/format';

const FILTERS: Array<{ value: ActivityStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
];

export function sectionLabel(a: TeacherActivity) {
  return typeof a.classSectionId === 'object' ? `Class ${a.classSectionId.levelNumber}-${a.classSectionId.sectionName}` : '';
}
export function subjectName(a: TeacherActivity) {
  return typeof a.subjectId === 'object' ? a.subjectId.name : '';
}

const STATUS_TONE = { draft: 'muted', published: 'success', closed: 'info' } as const;

export default function ActivitiesScreen({ navigation }: TeacherTabScreen<'Activities'>) {
  const [filter, setFilter] = useState<ActivityStatus | 'all'>('all');
  const state = useApi(() => endpoints.teacherActivities(filter === 'all' ? undefined : filter), [filter], { reloadOnFocus: true });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(a: TeacherActivity, action: 'publish' | 'close') {
    const run = async () => {
      setBusyId(a._id);
      try {
        if (action === 'publish') await endpoints.publishActivity(a._id);
        else await endpoints.closeActivity(a._id);
        await state.refresh();
      } catch (e) {
        Alert.alert(action === 'publish' ? 'Could not publish' : 'Could not close', errorMessage(e));
      } finally {
        setBusyId(null);
      }
    };
    Alert.alert(
      action === 'publish' ? 'Publish activity?' : 'Close activity?',
      action === 'publish' ? 'Students will be notified and can start it from the start date.' : 'Students will no longer be able to submit.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: action === 'publish' ? 'Publish' : 'Close', onPress: run, style: action === 'close' ? 'destructive' : 'default' },
      ],
    );
  }

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Button title="Create activity" icon="add-circle-outline" onPress={() => navigation.navigate('ActivityForm')} style={{ marginBottom: spacing.md }} />
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </ChipRow>
      <Async
        state={state}
        isEmpty={(d) => d.length === 0}
        empty={{ icon: 'clipboard-outline', title: filter === 'all' ? 'No activities yet' : `No ${filter} activities`, message: 'Assign a quiz, practice task or worksheet to a class.' }}
      >
        {(items) =>
          items.map((a) => {
            const rate = a.recipientCount ? ((a.completedCount ?? 0) / a.recipientCount) * 100 : 0;
            return (
              <Card key={a._id} onPress={() => navigation.navigate('ActivityResults', { activityId: a._id, title: a.title })} accessibilityLabel={`Results for ${a.title}`}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={{ flex: 1, fontSize: fontSizes.md, fontWeight: '800', color: colors.text }}>{a.title}</Text>
                  <Badge label={a.status} tone={STATUS_TONE[a.status]} />
                </Row>
                <Muted>
                  {sectionLabel(a)} · {subjectName(a)} · {a.type}
                </Muted>
                <Muted>
                  {fmtDate(a.startAt)} → due {fmtDate(a.dueAt)}
                </Muted>
                {a.status !== 'draft' ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <Muted>
                      {a.completedCount ?? 0} of {a.recipientCount ?? 0} completed
                    </Muted>
                    <ProgressBar value={rate} style={{ marginTop: 4 }} />
                  </View>
                ) : null}
                <Row style={{ marginTop: spacing.md }}>
                  {a.status === 'draft' ? <Button small title="Publish" icon="paper-plane-outline" onPress={() => act(a, 'publish')} loading={busyId === a._id} /> : null}
                  {a.status === 'published' ? <Button small variant="danger" title="Close" icon="lock-closed-outline" onPress={() => act(a, 'close')} loading={busyId === a._id} /> : null}
                  <Button small variant="secondary" title="Results" icon="bar-chart-outline" onPress={() => navigation.navigate('ActivityResults', { activityId: a._id, title: a.title })} />
                </Row>
              </Card>
            );
          })
        }
      </Async>
    </Screen>
  );
}
