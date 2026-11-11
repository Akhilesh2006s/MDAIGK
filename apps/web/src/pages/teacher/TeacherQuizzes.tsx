import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { QuizListRow } from '../../api/portalTypes';
import type { Paginated } from '../../api/types';
import { Card, PageHeader } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { InlineAlert } from '../../components/Feedback';
import { FormField, FormGrid } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../auth/AuthContext';
import { date } from '../../lib/format';
import { useTeacherClasses } from './shared';

interface QDraft {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
const blankQ = (): QDraft => ({ prompt: '', options: ['', ''], correctIndex: 0, explanation: '' });

export function validateTeacherQuiz(title: string, qs: QDraft[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (title.trim().length < 2) e.title = 'Enter a title (at least 2 characters)';
  if (!qs.length) e.questions = 'Add at least one question';
  qs.forEach((q, i) => {
    if (!q.prompt.trim()) e[`q${i}`] = `Question ${i + 1}: enter the question`;
    else if (q.options.length < 2 || q.options.some((o) => !o.trim())) e[`q${i}`] = `Question ${i + 1}: fill in every option (at least 2)`;
    else if (!q.options[q.correctIndex]?.trim()) e[`q${i}`] = `Question ${i + 1}: choose the correct option`;
  });
  return e;
}

/** Teachers author simple school-only activity quizzes (published immediately). */
export default function TeacherQuizzes() {
  const { user } = useAuth();
  const classes = useTeacherClasses();
  const q = useGet<Paginated<QuizListRow & { createdBy?: string; createdAt?: string }>>('/quizzes', { context: 'activity', pageSize: 100 });
  const mine = q.data?.items.filter((x) => x.schoolId && (!x.createdBy || x.createdBy === user?.id));
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [qs, setQs] = useState<QDraft[]>([blankQ()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const subjects = [...new Map((classes.data ?? []).flatMap((c) => c.subjects).map((s) => [s._id, s])).values()];
  const levels = [...new Set((classes.data ?? []).filter((c) => !c.locked).map((c) => c.levelNumber))].sort((a, b) => a - b);

  const create = useMutate(
    () =>
      api.post('/quizzes', {
        title: title.trim(),
        context: 'activity',
        ...(subjectId ? { subjectId } : {}),
        ...(levels.length ? { classLevels: levels } : {}),
        questions: qs.map((x) => ({ prompt: x.prompt.trim(), options: x.options.map((o) => o.trim()), correctIndex: x.correctIndex, marks: 1, ...(x.explanation.trim() ? { explanation: x.explanation.trim() } : {}) })),
      }),
    {
      invalidate: ['/quizzes'],
      toastError: false,
      success: 'Quiz created — you can now use it in an activity',
      onSuccess: () => setOpen(false),
    },
  );

  function openNew() {
    setTitle('');
    setSubjectId('');
    setQs([blankQ()]);
    setErrors({});
    setFormError(null);
    setOpen(true);
  }

  function submit() {
    const v = validateTeacherQuiz(title, qs);
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    create.mutate(undefined, { onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Could not create the quiz.') });
  }

  const upd = (i: number, patch: Partial<QDraft>) => setQs((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <>
      <PageHeader
        title="My quizzes"
        subtitle="Simple quizzes you write for your own classes. They are published straight away and can be attached to quiz activities."
        actions={
          <button type="button" className="btn btn--primary" onClick={openNew}>
            <Plus size={16} aria-hidden /> New quiz
          </button>
        }
      />
      <Card>
        <DataTable
          rows={mine}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => void q.refetch()}
          rowKey={(r) => r._id}
          emptyTitle="You haven’t written any quizzes yet"
          emptyMessage="Platform quizzes are always available in the activity quiz picker."
          columns={[
            { key: 'title', header: 'Title', render: (r) => <strong>{r.title}</strong> },
            { key: 'subject', header: 'Subject', render: (r) => (typeof r.subjectId === 'object' && r.subjectId ? r.subjectId.name : '—') },
            { key: 'n', header: 'Questions', align: 'right', render: (r) => r.questionCount ?? '—' },
            { key: 'created', header: 'Created', render: (r) => date(r.createdAt ?? null), hideSm: true },
          ]}
        />
      </Card>
      <Modal
        open={open}
        title="New activity quiz"
        size="lg"
        onClose={() => setOpen(false)}
        busy={create.isPending}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={submit} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create quiz'}
            </button>
          </>
        }
      >
        <div className="stack">
          {formError && <InlineAlert>{formError}</InlineAlert>}
          <FormGrid>
            <FormField label="Title" required error={errors.title}>
              <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField label="Subject" hint="Needed for it to appear in the activity quiz picker">
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">None</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>
          </FormGrid>
          {errors.questions && <InlineAlert>{errors.questions}</InlineAlert>}
          {qs.map((x, i) => (
            <fieldset key={i} className="question-card">
              <legend>
                Question {i + 1}
                {qs.length > 1 && (
                  <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove question ${i + 1}`} onClick={() => setQs((l) => l.filter((_, j) => j !== i))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </legend>
              {errors[`q${i}`] && <p className="field__error">{errors[`q${i}`]}</p>}
              <FormField label="Question" required>
                <input value={x.prompt} maxLength={1000} onChange={(e) => upd(i, { prompt: e.target.value })} />
              </FormField>
              <div className="stack--sm" role="radiogroup" aria-label={`Options for question ${i + 1}; select the correct one`}>
                {x.options.map((o, oi) => (
                  <div key={oi} className="option-row">
                    <input type="radio" name={`correct-${i}`} checked={x.correctIndex === oi} onChange={() => upd(i, { correctIndex: oi })} aria-label={`Option ${oi + 1} is correct`} />
                    <input
                      value={o}
                      maxLength={300}
                      placeholder={`Option ${oi + 1}`}
                      aria-label={`Option ${oi + 1}`}
                      onChange={(e) => upd(i, { options: x.options.map((v, k) => (k === oi ? e.target.value : v)) })}
                    />
                    {x.options.length > 2 && (
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        aria-label={`Remove option ${oi + 1}`}
                        onClick={() => upd(i, { options: x.options.filter((_, k) => k !== oi), correctIndex: x.correctIndex === oi ? 0 : x.correctIndex > oi ? x.correctIndex - 1 : x.correctIndex })}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {x.options.length < 6 && (
                  <button type="button" className="link-btn" onClick={() => upd(i, { options: [...x.options, ''] })}>
                    + Add option
                  </button>
                )}
              </div>
              <FormField label="Explanation (shown after submit)">
                <input value={x.explanation} maxLength={1000} onChange={(e) => upd(i, { explanation: e.target.value })} />
              </FormField>
            </fieldset>
          ))}
          {qs.length < 50 && (
            <button type="button" className="btn btn--secondary" onClick={() => setQs((l) => [...l, blankQ()])}>
              <Plus size={14} aria-hidden /> Add question
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
