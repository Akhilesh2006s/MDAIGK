import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { endpoints } from '../../api';
import { Async, Badge, Button, Card, EmptyState, IconCircle, ListRow, Muted, ProgressBar, Row, Screen, SectionTitle, StatGrid, StatTile } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { TeacherTabScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';
import { fmtDate, fmtPercent, greeting } from '../../utils/format';

export default function TeacherHomeScreen({ navigation }: TeacherTabScreen<'Home'>) {
  const state = useApi(endpoints.teacherHome, [], { reloadOnFocus: true });
  const labelFor = (sectionId: string) => state.data?.classes.find((c) => c.sectionId === sectionId)?.label ?? '';

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state} loadingLabel="Loading your classes…">
        {(home) => (
          <>
            <View style={styles.hero}>
              <Text style={styles.hello}>
                {greeting()}, {home.teacher.name.split(' ')[0]}
              </Text>
              <Text style={styles.school}>{home.teacher.schoolName}</Text>
            </View>

            <StatGrid>
              <StatTile icon="people-outline" label="Students" value={home.totals.students} sub={`${home.totals.classes} classes`} />
              <StatTile
                icon="document-text-outline"
                label="Pending reviews"
                value={home.totals.pendingReviews}
                tone={home.totals.pendingReviews ? 'yellow' : 'green'}
                sub="Practice & worksheets"
              />
            </StatGrid>

            <SectionTitle>My classes</SectionTitle>
            {home.classes.length === 0 ? (
              <EmptyState icon="school-outline" title="No classes assigned" message="Your school administrator hasn’t assigned any classes to you yet." />
            ) : (
              home.classes.map((c) => (
                <Card key={c.sectionId} onPress={() => navigation.navigate('ClassStudents', { sectionId: c.sectionId, label: c.label })} accessibilityLabel={`Open ${c.label}`}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={styles.classLabel}>{c.label}</Text>
                    <Badge label={`${c.studentCount} students`} tone="green" icon="people" />
                  </Row>
                  <Muted>{c.subjects.map((s) => s.name).join(' · ') || 'No subjects'}</Muted>
                  <View style={{ marginTop: spacing.md }}>
                    <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <Muted>Class average</Muted>
                      <Text style={styles.avg}>{fmtPercent(c.averagePercent)}</Text>
                    </Row>
                    <ProgressBar value={c.averagePercent} />
                    <Muted style={{ marginTop: 4 }}>{c.sampleSize ? `Based on ${c.sampleSize} quiz attempts` : 'No quiz attempts yet'}</Muted>
                  </View>
                </Card>
              ))
            )}

            <SectionTitle action={<Button title="New" small variant="ghost" icon="add" onPress={() => navigation.navigate('ActivityForm')} />}>Upcoming due</SectionTitle>
            <Card>
              {home.upcoming.length === 0 ? (
                <Muted>No published activities are due. Assign one to your class.</Muted>
              ) : (
                home.upcoming.map((a) => (
                  <ListRow
                    key={a._id}
                    title={a.title}
                    subtitle={`${labelFor(a.classSectionId)} · ${a.type} · due ${fmtDate(a.dueAt)}`}
                    left={<IconCircle icon={a.type === 'quiz' ? 'help-circle-outline' : a.type === 'worksheet' ? 'document-outline' : 'create-outline'} size={36} />}
                    onPress={() => navigation.navigate('ActivityResults', { activityId: a._id, title: a.title })}
                  />
                ))
              )}
            </Card>
            <Button title="Assign an activity" icon="add-circle-outline" onPress={() => navigation.navigate('ActivityForm')} />
          </>
        )}
      </Async>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.forestGreen, borderRadius: 16, padding: spacing.lg, marginBottom: spacing.md },
  hello: { color: colors.white, fontSize: fontSizes.xl, fontWeight: '800' },
  school: { color: colors.lightGreen, fontSize: fontSizes.md, marginTop: 4 },
  classLabel: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.text },
  avg: { fontSize: fontSizes.md, fontWeight: '700', color: colors.primary },
});
