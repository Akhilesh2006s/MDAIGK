import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { ActivityType, ClassStudent, QuizListRow, TeacherActivity, TeacherClass } from '../../api/portalTypes';
import type { Paginated } from '../../api/types';
import { InlineAlert } from '../../components/Feedback';
import { FormField, FormGrid, mergeErrors } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { activitySection, fromLocalInput, refId, toLocalInput } from './shared';

export interface ActivityDraft {
  classSectionId: string;
  studentIds: string[];
  subjectId: string;
  type: ActivityType;
  title: string;
  instructions: string;
  quizId: string;
  worksheetRef: string;
  startAt: string; // datetime-local
  dueAt: string; // datetime-local
}

export function emptyDraft(sectionId = '', now = new Date()): ActivityDraft {
  const due = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  return { classSectionId: sectionId, studentIds: [], subjectId: '', type: 'quiz', title: '', instructions: '', quizId: '', worksheetRef: '', startAt: toLocalInput(now), dueAt: toLocalInput(due) };
}

export function draftFromActivity(a: TeacherActivity): ActivityDraft {
  return {
    classSectionId: refId(a.classSectionId),
    studentIds: (a.studentIds ?? []).map(String),
    subjectId: refId(a.subjectId),
    type: a.type,
    title: a.title,
    instructions: a.instructions ?? '',
    quizId: refId(a.quizId ?? null),
    worksheetRef: a.worksheetRef ?? '',
    startAt: toLocalInput(a.startAt),
    dueAt: toLocalInput(a.dueAt),
  };
}

/** Client-side checks that mirror the API rules. */
export function validateActivity(d: ActivityDraft, classes: TeacherClass[]): Record<string, string> {
  const e: Record<string, string> = {};
  const cls = classes.find((c) => c.sectionId === d.classSectionId);
  if (!d.classSectionId) e.classSectionId = 'Choose a class section';
  else if (!cls) e.classSectionId = 'You are not assigned to this section';
  if (!d.subjectId) e.subjectId = 'Choose a subject';
  else if (cls && !cls.subjects.some((s) => s._id === d.subjectId)) e.subjectId = 'You don’t teach this subject in this section';
  const t = d.title.trim();
  if (t.length < 2) e.title = 'Enter a title (at least 2 characters)';
  else if (t.length > 200) e.title = 'Keep the title under 200 characters';
  if (d.type === 'quiz' && !d.quizId) e.quizId = 'Choose a quiz';
  if (d.type === 'worksheet' && !d.worksheetRef.trim() && !d.instructions.trim()) e.worksheetRef = 'Add a worksheet reference or instructions';
  const s = fromLocalInput(d.startAt);
  const due = fromLocalInput(d.dueAt);
  if (!s) e.startAt = 'Choose a start date and time';
  if (!due) e.dueAt = 'Choose a due date and time';
  if (s && due && new Date(due) <= new Date(s)) e.dueAt = 'Due date must be after the start date';
  if (d.instructions.length > 4000) e.instructions = 'Keep instructions under 4000 characters';
  return e;
}

export function draftToBody(d: ActivityDraft) {
  return {
    classSectionId: d.classSectionId,
    studentIds: d.studentIds,
    subjectId: d.subjectId,
    type: d.type,
    title: d.title.trim(),
    ...(d.instructions.trim() ? { instructions: d.instructions.trim() } : {}),
    ...(d.type === 'quiz' && d.quizId ? { quizId: d.quizId } : {}),
    ...(d.worksheetRef.trim() ? { worksheetRef: d.worksheetRef.trim() } : {}),
    startAt: fromLocalInput(d.startAt)!,
    dueAt: fromLocalInput(d.dueAt)!,
  };
}

export function ActivityFormModal({
  open,
  onClose,
  classes,
  editing,
  initialSection,
}: {
  open: boolean;
  onClose: () => void;
  classes: TeacherClass[];
  editing: TeacherActivity | null;
  initialSection?: string;
}) {
  const usable = classes.filter((c) => !c.locked);
  const [d, setD] = useState<ActivityDraft>(() => emptyDraft(initialSection ?? usable[0]?.sectionId ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pickStudents, setPickStudents] = useState(false);
  const published = editing?.status === 'published';

  useEffect(() => {
    if (!open) return;
    const next = editing ? draftFromActivity(editing) : emptyDraft(initialSection ?? usable[0]?.sectionId ?? '');
    setD(next);
    setPickStudents(next.studentIds.length > 0);
    setErrors({});
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const cls = usable.find((c) => c.sectionId === d.classSectionId) ?? classes.find((c) => c.sectionId === d.classSectionId);
  const subjects = cls?.subjects ?? [];
  const level = cls?.levelNumber ?? (editing ? activitySection(editing)?.levelNumber : undefined);
  const students = useGet<ClassStudent[]>(open && d.classSectionId && pickStudents ? `/teacher/classes/${d.classSectionId}/students` : null);
  const quizzes = useGet<Paginated<QuizListRow>>(open && d.type === 'quiz' && d.subjectId && level ? '/quizzes' : null, {
    subjectId: d.subjectId,
    levelNumber: level,
    status: 'published',
    pageSize: 100,
  });
  const quizOptions = useMemo(() => (quizzes.data?.items ?? []).filter((q) => q.context !== 'certification'), [quizzes.data]);

  function set<K extends keyof ActivityDraft>(k: K, v: ActivityDraft[K]) {
    setErrors((e) => {
      if (!(k in e)) return e;
      const n = { ...e };
      delete n[k];
      return n;
    });
    setD((x) => {
      const next = { ...x, [k]: v };
      if (k === 'classSectionId') {
        next.studentIds = [];
        const c = usable.find((u) => u.sectionId === v);
        if (c && !c.subjects.some((s) => s._id === next.subjectId)) next.subjectId = '';
        next.quizId = '';
      }
      if (k === 'subjectId') next.quizId = '';
      return next;
    });
  }

  const save = useMutate(
    async (publish: boolean) => {
      const body = draftToBody(d);
      if (editing) {
        const patch: Record<string, unknown> = { ...body };
        if (published) {
          delete patch.classSectionId;
          delete patch.type;
          delete patch.quizId;
        }
        const r = await api.patch<TeacherActivity>(`/teacher/activities/${editing._id}`, patch);
        if (publish && editing.status === 'draft') return api.post<TeacherActivity>(`/teacher/activities/${editing._id}/publish`);
        return r;
      }
      return api.post<TeacherActivity>('/teacher/activities', { ...body, publish });
    },
    {
      invalidate: ['/teacher'],
      toastError: false,
      success: (r) => (r && (r as TeacherActivity).status === 'published' ? 'Activity published' : 'Activity saved'),
      onSuccess: onClose,
    },
  );

  function submit(publish: boolean) {
    setFormError(null);
    const v = validateActivity(d, classes);
    setErrors(v);
    if (Object.keys(v).length) return;
    save.mutate(publish, {
      onError: (e) => {
        if (e instanceof ApiError) {
          setErrors((x) => mergeErrors(x, e.fieldErrors));
          setFormError(e.message);
        } else setFormError('Could not save the activity.');
      },
    });
  }

  const toggleStudent = (id: string) => set('studentIds', d.studentIds.includes(id) ? d.studentIds.filter((x) => x !== id) : [...d.studentIds, id]);

  return (
    <Modal
      open={open}
      title={editing ? `Edit “${editing.title}”` : 'New activity'}
      onClose={onClose}
      size="lg"
      busy={save.isPending}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          {(!editing || editing.status === 'draft') && (
            <button type="button" className="btn btn--secondary" onClick={() => submit(false)} disabled={save.isPending}>
              Save draft
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => submit(!published)} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : published ? 'Save changes' : 'Publish'}
          </button>
        </>
      }
    >
      <div className="stack">
        {formError && <InlineAlert>{formError}</InlineAlert>}
        {published && <InlineAlert tone="info">This activity is published: section, type and quiz can no longer change.</InlineAlert>}
        {usable.length === 0 && <InlineAlert tone="warning">You have no unlocked class sections to assign work to.</InlineAlert>}
        <FormGrid>
          <FormField label="Class section" required error={errors.classSectionId}>
            <select value={d.classSectionId} onChange={(e) => set('classSectionId', e.target.value)} disabled={published}>
              <option value="">Choose…</option>
              {usable.map((c) => (
                <option key={c.sectionId} value={c.sectionId}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Subject" required error={errors.subjectId} hint={cls ? 'Only subjects you teach in this section' : undefined}>
            <select value={d.subjectId} onChange={(e) => set('subjectId', e.target.value)} disabled={!cls}>
              <option value="">Choose…</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
        </FormGrid>

        <fieldset className="field">
          <legend className="field__label">Who gets it</legend>
          <div className="seg" role="radiogroup" aria-label="Recipients">
            <button type="button" role="radio" aria-checked={!pickStudents} className={`seg__btn ${!pickStudents ? 'seg__btn--active' : ''}`} onClick={() => (setPickStudents(false), set('studentIds', []))}>
              Whole class
            </button>
            <button type="button" role="radio" aria-checked={pickStudents} className={`seg__btn ${pickStudents ? 'seg__btn--active' : ''}`} onClick={() => setPickStudents(true)} disabled={!d.classSectionId}>
              Selected students
            </button>
          </div>
          {pickStudents && (
            <div className="student-picker">
              {students.isLoading && <p className="muted small">Loading students…</p>}
              {students.isError && <p className="text-danger small">Could not load students.</p>}
              {students.data?.length === 0 && <p className="muted small">No students in this section.</p>}
              {students.data?.map((s) => (
                <label key={s.id} className={`chip ${d.studentIds.includes(s.id) ? 'chip--on' : ''}`}>
                  <input type="checkbox" checked={d.studentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                  {s.name} <span className="small">({s.studentCode})</span>
                </label>
              ))}
              {students.data && students.data.length > 0 && (
                <p className="muted small">{d.studentIds.length ? `${d.studentIds.length} selected` : 'None selected — the whole class will get it.'}</p>
              )}
            </div>
          )}
        </fieldset>

        <FormGrid>
          <FormField label="Type" required>
            <select value={d.type} onChange={(e) => set('type', e.target.value as ActivityType)} disabled={published}>
              <option value="quiz">Quiz</option>
              <option value="practice">Practice</option>
              <option value="worksheet">Worksheet</option>
            </select>
          </FormField>
          <FormField label="Title" required error={errors.title}>
            <input value={d.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Fractions practice" />
          </FormField>
        </FormGrid>

        {d.type === 'quiz' && (
          <FormField
            label="Quiz"
            required
            error={errors.quizId}
            hint={level ? `Published quizzes for Class ${level}${d.subjectId ? ' in this subject' : ''}, including your own` : 'Choose a section and subject first'}
          >
            <select value={d.quizId} onChange={(e) => set('quizId', e.target.value)} disabled={published || !d.subjectId}>
              <option value="">{quizzes.isLoading ? 'Loading quizzes…' : !d.subjectId ? 'Choose a subject first' : quizOptions.length ? 'Choose a quiz…' : 'No quizzes available'}</option>
              {quizOptions.map((q) => (
                <option key={q._id} value={q._id}>
                  {q.title} · {q.questionCount ?? '?'} questions{q.schoolId ? ' · mine' : ''}
                </option>
              ))}
              {editing && d.quizId && !quizOptions.some((q) => q._id === d.quizId) && typeof editing.quizId === 'object' && editing.quizId && <option value={d.quizId}>{editing.quizId.title}</option>}
            </select>
          </FormField>
        )}
        {quizzes.isError && d.type === 'quiz' && <InlineAlert>Could not load quizzes.</InlineAlert>}

        {d.type === 'worksheet' && (
          <FormField label="Worksheet reference" error={errors.worksheetRef} hint="e.g. textbook page, handout number or a link">
            <input value={d.worksheetRef} maxLength={1000} onChange={(e) => set('worksheetRef', e.target.value)} />
          </FormField>
        )}
        <FormField label="Instructions" error={errors.instructions} hint={`${d.instructions.length}/4000`}>
          <textarea rows={3} value={d.instructions} onChange={(e) => set('instructions', e.target.value)} />
        </FormField>
        <FormGrid>
          <FormField label="Starts" required error={errors.startAt}>
            <input type="datetime-local" value={d.startAt} onChange={(e) => set('startAt', e.target.value)} />
          </FormField>
          <FormField label="Due" required error={errors.dueAt}>
            <input type="datetime-local" value={d.dueAt} onChange={(e) => set('dueAt', e.target.value)} />
          </FormField>
        </FormGrid>
      </div>
    </Modal>
  );
}
