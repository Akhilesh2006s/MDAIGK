import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { endpoints, type InsightStudent } from '../../api';
import { BarList, LineChart } from '../../components/charts';
import { Async, Card, Chip, ChipRow, Divider, InfoBanner, ListRow, Muted, Screen, SectionTitle, Segmented, StatGrid, StatTile } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { TeacherTabScreen } from '../../navigation/types';
import { colors } from '../../theme';
import { fmtPercent } from '../../utils/format';

export default function InsightsScreen(props: TeacherTabScreen<'Insights'>) {
  const [view, setView] = useState<'performance' | 'insights'>('performance');
  const [sectionId, setSectionId] = useState<string | undefined>();
  const classes = useApi(endpoints.teacherClasses);
  const enabled = (classes.data ?? []).filter((c) => !c.locked);

  return (
    <Screen>
      <Segmented
        options={[
          { value: 'performance', label: 'Performance' },
          { value: 'insights', label: 'Student insights' },
        ]}
        value={view}
        onChange={setView}
      />
      <ChipRow>
        <Chip label="All classes" selected={!sectionId} onPress={() => setSectionId(undefined)} />
        {enabled.map((c) => (
          <Chip key={c.sectionId} label={c.label} selected={sectionId === c.sectionId} onPress={() => setSectionId(c.sectionId)} />
        ))}
      </ChipRow>
      {view === 'performance' ? <PerformanceView sectionId={sectionId} /> : <StudentInsights sectionId={sectionId} navigate={props.navigation.navigate} />}
    </Screen>
  );
}

function PerformanceView({ sectionId }: { sectionId?: string }) {
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const subjects = useApi(endpoints.teacherSubjects);
  const state = useApi(() => endpoints.teacherPerformance({ sectionId, subjectId }), [sectionId, subjectId]);
  return (
    <>
      <ChipRow>
        <Chip label="All subjects" selected={!subjectId} onPress={() => setSubjectId(undefined)} />
        {(subjects.data ?? []).map((s) => (
          <Chip key={s._id} label={s.name} selected={subjectId === s._id} onPress={() => setSubjectId(s._id)} />
        ))}
      </ChipRow>
      <Async state={state}>
        {(p) => (
          <>
            <StatGrid>
              <StatTile icon="stats-chart-outline" label="Average score" value={fmtPercent(p.summary.averagePercent)} sub={`${p.summary.sampleSize} quiz attempts`} />
              <StatTile icon="checkmark-circle-outline" label="Quiz accuracy" value={fmtPercent(p.summary.quizAccuracyPercent)} tone="yellow" sub="Marks scored / available" />
              <StatTile
                icon="clipboard-outline"
                label="Activity completion"
                value={fmtPercent(p.activityCompletion.ratePercent)}
                tone="info"
                sub={`${p.activityCompletion.completed} of ${p.activityCompletion.expected}`}
              />
            </StatGrid>
            <SectionTitle>By subject</SectionTitle>
            <Card>
              {p.subjects.length === 0 ? (
                <Muted>No subject data yet.</Muted>
              ) : (
                <BarList rows={p.subjects.map((s) => ({ label: s.name, value: s.averagePercent, sub: `${s.sampleSize} attempts` }))} />
              )}
            </Card>
            <SectionTitle>Weekly trend</SectionTitle>
            <Card>
              {p.trend.length === 0 ? (
                <Muted>No attempts in this period.</Muted>
              ) : (
                <>
                  <LineChart points={p.trend.map((t) => ({ label: t.week.replace(/^\d{4}-/, ''), value: t.averagePercent }))} />
                  <Muted>Average score per ISO week ({p.trend.reduce((s, t) => s + t.attempts, 0)} attempts)</Muted>
                </>
              )}
            </Card>
          </>
        )}
      </Async>
    </>
  );
}

function StudentInsights({ sectionId, navigate }: { sectionId?: string; navigate: TeacherTabScreen<'Insights'>['navigation']['navigate'] }) {
  const state = useApi(() => endpoints.teacherInsights(sectionId), [sectionId]);
  const row = (s: InsightStudent, i: number) => (
    <View key={s.studentId}>
      {i > 0 ? <Divider /> : null}
      <ListRow
        title={s.name}
        subtitle={`Class ${s.class} · ${s.attempts} attempts`}
        right={<Text style={{ fontWeight: '800', color: s.averagePercent !== null && s.averagePercent < 50 ? colors.danger : colors.primary }}>{fmtPercent(s.averagePercent)}</Text>}
        onPress={() => navigate('StudentProfile', { studentId: s.studentId, name: s.name })}
      />
    </View>
  );
  return (
    <Async state={state}>
      {(d) => (
        <>
          <InfoBanner message={`${d.window}. ${d.rule}`} />
          <SectionTitle>Top performers</SectionTitle>
          <Card>{d.topPerformers.length ? d.topPerformers.map(row) : <Muted>No quiz attempts in this window yet.</Muted>}</Card>
          <SectionTitle>Students needing support</SectionTitle>
          <Card>{d.needsSupport.length ? d.needsSupport.map(row) : <Muted>Great news — nobody matches the support rule right now.</Muted>}</Card>
        </>
      )}
    </Async>
  );
}
