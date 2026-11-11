import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { ActivityType } from '@mango/shared';
import { endpoints, errorMessage, type ActivityInput } from '../../api';
import { addDays, DateStepper, endOfDay, startOfDay } from '../../components/DateStepper';
import { Async, Button, Card, Chip, ChipRow, InlineError, Ionicons, ListRow, Loading, Muted, Row, Screen, SectionTitle, Segmented, TextField } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { TeacherStackScreen } from '../../navigation/types';
import { colors, spacing } from '../../theme';

const TYPES: Array<{ value: ActivityType; label: string }> = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'practice', label: 'Practice' },
  { value: 'worksheet', label: 'Worksheet' },
];

export default function ActivityFormScreen({ route, navigation }: TeacherStackScreen<'ActivityForm'>) {
  const classes = useApi(endpoints.teacherClasses);
  const available = useMemo(() => (classes.data ?? []).filter((c) => !c.locked), [classes.data]);

  const [sectionId, setSectionId] = useState<string | undefined>(route.params?.sectionId);
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [type, setType] = useState<ActivityType>('quiz');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [worksheetRef, setWorksheetRef] = useState('');
  const [quizId, setQuizId] = useState<string | undefined>();
  const [allStudents, setAllStudents] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [startAt, setStartAt] = useState(() => startOfDay(new Date()));
  const [dueAt, setDueAt] = useState(() => endOfDay(addDays(new Date(), 7)));
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const section = available.find((c) => c.sectionId === sectionId);

  // default to the first class
  useEffect(() => {
    if (!sectionId && available.length) setSectionId(available[0].sectionId);
  }, [available, sectionId]);

  // subjects follow the selected class section
  useEffect(() => {
    if (!section) return;
    if (!subjectId || !section.subjects.some((s) => s._id === subjectId)) setSubjectId(section.subjects[0]?._id);
    setSelected([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, section?.subjects.length]);

  const students = useApi(() => (sectionId ? endpoints.sectionStudents(sectionId) : Promise.resolve([])), [sectionId]);
  const quizzes = useApi(
    () => (type === 'quiz' && subjectId ? endpoints.teacherQuizzes(subjectId, section?.levelNumber) : Promise.resolve(null)),
    [type, subjectId, section?.levelNumber],
  );

  useEffect(() => setQuizId(undefined), [subjectId]);

  function validate(): string | null {
    if (!sectionId) return 'Choose a class section.';
    if (!subjectId) return 'Choose a subject.';
    if (title.trim().length < 2) return 'Give the activity a title (at least 2 characters).';
    if (type === 'quiz' && !quizId) return 'Pick a quiz for this activity.';
    if (type === 'worksheet' && !worksheetRef.trim() && !instructions.trim()) return 'A worksheet needs a reference or instructions.';
    if (!allStudents && selected.length === 0) return 'Select at least one student, or assign to the whole class.';
    if (dueAt <= startAt) return 'Due date must be after the start date.';
    return null;
  }

  async function save(publish: boolean) {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSaving(publish ? 'publish' : 'draft');
    const body: ActivityInput = {
      classSectionId: sectionId!,
      subjectId: subjectId!,
      studentIds: allStudents ? [] : selected,
      type,
      title: title.trim(),
      instructions: instructions.trim() || undefined,
      quizId: type === 'quiz' ? quizId : undefined,
      worksheetRef: type === 'worksheet' ? worksheetRef.trim() || undefined : undefined,
      startAt: startAt.toISOString(),
      dueAt: dueAt.toISOString(),
      publish,
    };
    try {
      await endpoints.createActivity(body);
      Alert.alert(publish ? 'Activity published' : 'Draft saved', publish ? 'Your students have been notified.' : 'You can publish it from the Activities tab.');
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Screen>
      <Async state={classes} isEmpty={() => available.length === 0} empty={{ icon: 'school-outline', title: 'No classes to assign', message: 'You need at least one assigned, enabled class.' }}>
        {() => (
          <>
            <SectionTitle>Class section</SectionTitle>
            <ChipRow>
              {available.map((c) => (
                <Chip key={c.sectionId} label={c.label} selected={c.sectionId === sectionId} onPress={() => setSectionId(c.sectionId)} />
              ))}
            </ChipRow>

            <SectionTitle>Subject</SectionTitle>
            {section && section.subjects.length === 0 ? <Muted>You have no subjects assigned for this class.</Muted> : null}
            <ChipRow>
              {(section?.subjects ?? []).map((s) => (
                <Chip key={s._id} label={s.name} selected={s._id === subjectId} onPress={() => setSubjectId(s._id)} />
              ))}
            </ChipRow>

            <SectionTitle>Type</SectionTitle>
            <Segmented options={TYPES} value={type} onChange={setType} />

            <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Fractions practice" maxLength={200} />
            <TextField label="Instructions (optional)" value={instructions} onChangeText={setInstructions} multiline maxLength={4000} placeholder="What should students do?" />
            {type === 'worksheet' ? (
              <TextField label="Worksheet reference" value={worksheetRef} onChangeText={setWorksheetRef} placeholder="e.g. Workbook p. 42, Q1–10 or a link" maxLength={1000} />
            ) : null}

            {type === 'quiz' ? (
              <>
                <SectionTitle>Quiz</SectionTitle>
                <Card>
                  {quizzes.loading ? (
                    <Loading label="Loading quizzes…" />
                  ) : quizzes.error ? (
                    <InlineError message={errorMessage(quizzes.error)} />
                  ) : !quizzes.data || quizzes.data.items.length === 0 ? (
                    <Muted>No quizzes are available for this subject yet.</Muted>
                  ) : (
                    quizzes.data.items.map((q) => (
                      <ListRow
                        key={q._id}
                        title={q.title}
                        subtitle={`${q.questionCount} questions · ${q.schoolId ? 'Your quiz' : q.context === 'learning' ? 'Learning quiz' : 'Activity quiz'}`}
                        left={<Ionicons name={quizId === q._id ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.primary} />}
                        onPress={() => setQuizId(q._id)}
                        chevron={false}
                      />
                    ))
                  )}
                </Card>
              </>
            ) : null}

            <SectionTitle>Students</SectionTitle>
            <Segmented
              options={[
                { value: 'all', label: 'Whole class' },
                { value: 'some', label: 'Selected students' },
              ]}
              value={allStudents ? 'all' : 'some'}
              onChange={(v) => setAllStudents(v === 'all')}
            />
            {!allStudents ? (
              <Card>
                {students.loading ? (
                  <Loading />
                ) : students.error ? (
                  <InlineError message={errorMessage(students.error)} />
                ) : (students.data ?? []).length === 0 ? (
                  <Muted>No students in this class.</Muted>
                ) : (
                  (students.data ?? []).map((s) => {
                    const on = selected.includes(s.id);
                    return (
                      <ListRow
                        key={s.id}
                        title={s.name}
                        subtitle={s.studentCode}
                        chevron={false}
                        left={<Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />}
                        onPress={() => setSelected((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                      />
                    );
                  })
                )}
                <Muted>{selected.length} selected</Muted>
              </Card>
            ) : null}

            <SectionTitle>Dates</SectionTitle>
            <DateStepper
              label="Start date"
              value={startAt}
              min={new Date()}
              onChange={(d) => {
                const s = startOfDay(d);
                setStartAt(s);
                if (dueAt <= s) setDueAt(endOfDay(d));
              }}
            />
            <DateStepper label="Due date (end of day)" value={dueAt} min={startAt} onChange={(d) => setDueAt(endOfDay(d))} />

            <InlineError message={error} />
            <View style={{ gap: spacing.sm }}>
              <Button title="Publish now" icon="paper-plane-outline" onPress={() => save(true)} loading={saving === 'publish'} disabled={saving !== null} />
              <Button title="Save as draft" variant="secondary" icon="save-outline" onPress={() => save(false)} loading={saving === 'draft'} disabled={saving !== null} />
            </View>
            <Row style={{ marginTop: spacing.md }}>
              <Ionicons name="notifications-outline" size={16} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, flex: 1 }}>Publishing notifies the selected students.</Text>
            </Row>
          </>
        )}
      </Async>
    </Screen>
  );
}
