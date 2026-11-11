import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { endpoints, type LearningItemSummary } from '../../api';
import { Async, Badge, Card, Chip, ChipRow, IconCircle, Muted, ProgressBar, Row, Screen, SectionTitle, Segmented } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentTabScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';
import { subjectIcon } from './StudentHomeScreen';

export default function LearnScreen({ navigation, route }: StudentTabScreen<'Learn'>) {
  const [view, setView] = useState<'mine' | 'all'>('all');
  const [subjectId, setSubjectId] = useState<string | undefined>(route.params?.subjectId);
  const subjects = useApi(endpoints.learningSubjects, [], { reloadOnFocus: true });
  const cont = useApi(endpoints.continueLearning, [], { reloadOnFocus: true });
  const items = useApi(() => endpoints.learningItems(view, subjectId), [view, subjectId], { reloadOnFocus: true });

  // Home → subject card passes a subject
  useEffect(() => {
    if (route.params?.subjectId) setSubjectId(route.params.subjectId);
  }, [route.params?.subjectId]);

  const refresh = () => {
    void subjects.refresh();
    void cont.refresh();
    return items.refresh();
  };
  const open = (i: LearningItemSummary) => navigation.navigate('LearningItem', { id: i._id, title: i.title });

  return (
    <Screen refreshing={items.refreshing} onRefresh={refresh}>
      {cont.data && cont.data.length > 0 ? (
        <>
          <SectionTitle>Continue learning</SectionTitle>
          {cont.data.slice(0, 2).map((i) => (
            <Card key={i._id} onPress={() => open(i)} accessibilityLabel={`Continue ${i.title}`} style={{ backgroundColor: '#FFF8DC' }}>
              <Row>
                <IconCircle icon={subjectIcon(i.subjectId?.icon)} bg={colors.white} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: colors.text }}>{i.title}</Text>
                  <ProgressBar value={i.progress?.progressPct ?? 0} color={colors.mangoYellow} style={{ marginTop: 6 }} />
                </View>
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      <Segmented
        options={[
          { value: 'all', label: 'All Learning' },
          { value: 'mine', label: 'My Subjects' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'mine' ? <Muted style={{ marginBottom: spacing.sm }}>Items you’ve already started or completed.</Muted> : null}

      <ChipRow>
        <Chip label="All subjects" selected={!subjectId} onPress={() => setSubjectId(undefined)} />
        {(subjects.data ?? []).map((s) => (
          <Chip key={s._id} label={`${s.name} · ${s.progressPercent}%`} selected={subjectId === s._id} onPress={() => setSubjectId(s._id)} />
        ))}
      </ChipRow>

      <Async
        state={items}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: 'library-outline',
          title: view === 'mine' ? 'Nothing started yet' : 'No learning items here',
          message: view === 'mine' ? 'Open something from All Learning to start.' : 'Try another subject.',
        }}
      >
        {(d) =>
          d.items.map((i) => (
            <Card key={i._id} onPress={() => open(i)} accessibilityLabel={i.title}>
              <Row style={{ alignItems: 'flex-start' }} gap={spacing.md}>
                <IconCircle icon={subjectIcon(i.subjectId?.icon)} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSizes.md, fontWeight: '800', color: colors.text }}>{i.title}</Text>
                  {i.description ? <Muted numberOfLines={2}>{i.description}</Muted> : null}
                  <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
                    <Badge label={i.subjectId?.name ?? ''} tone="green" />
                    <Badge label={i.type} tone="muted" />
                    {i.estimatedMinutes ? <Badge label={`${i.estimatedMinutes} min`} tone="info" icon="time-outline" /> : null}
                    {i.quizId ? <Badge label="Quiz" tone="yellow" icon="help-circle" /> : null}
                    {i.progress?.status === 'completed' ? <Badge label="Completed" tone="success" icon="checkmark" /> : null}
                  </Row>
                  {i.progress && i.progress.status !== 'completed' ? <ProgressBar value={i.progress.progressPct} style={{ marginTop: spacing.sm }} /> : null}
                </View>
              </Row>
            </Card>
          ))
        }
      </Async>
    </Screen>
  );
}
