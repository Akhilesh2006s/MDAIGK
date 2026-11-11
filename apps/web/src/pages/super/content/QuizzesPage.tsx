import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, PlusCircle, Trash2 } from 'lucide-react';
import { CONTENT_STATUS } from '@mango/shared';
import { ApiError, api, errorMessage } from '../../../api/client';
import { useGet, useInvalidate } from '../../../api/hooks';
import type { Paginated, Quiz, QuizQuestion } from '../../../api/types';
import { PageHeader, Toolbar } from '../../../components/Cards';
import { DataTable } from '../../../components/DataTable';
import { ClassLevelPicker, FormField, FormGrid } from '../../../components/Form';
import { InlineAlert } from '../../../components/Feedback';
import { Modal } from '../../../components/Modal';
import { Badge, StatusBadge } from '../../../components/Badge';
import { useToast } from '../../../components/Toast';
import { classLevels, date, titleCase } from '../../../lib/format';
import { useDebounced } from '../../../lib/useDebounced';
import { StatusSelect, useSubjectsList } from './shared';

const CONTEXTS = ['learning', 'news', 'activity', 'certification', 'programme'] as const;

export default function QuizzesPage() {
  const [search, setSearch] = useState('');
  const [context, setContext] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Quiz | 'new' | null>(null);
  const q = useDebounced(search.trim());
  useEffect(() => setPage(1), [q, context, status]);
  const list = useGet<Paginated<Quiz>>('/quizzes', { q, context, status, page, pageSize: 20 });

  return (
    <>
      <PageHeader
        title="Quizzes"
        subtitle="Question banks for learning items, news, programmes and certification. Editing questions creates a new version; past attempts keep their original scoring."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            <PlusCircle size={16} aria-hidden /> New quiz
          </button>
        }
      />
      <Toolbar>
        <div className="field toolbar__grow">
          <label className="field__label" htmlFor="qz-q">
            Search title
          </label>
          <input id="qz-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="qz-ctx">
            Used for
          </label>
          <select id="qz-ctx" value={context} onChange={(e) => setContext(e.target.value)}>
            <option value="">All contexts</option>
            {CONTEXTS.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </select>
        </div>
        <StatusSelect id="qz-status" value={status} onChange={setStatus} />
      </Toolbar>
      <DataTable
        caption="Quizzes"
        rows={list.data?.items}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        fetching={list.isFetching && !list.isLoading}
        rowKey={(x) => x._id}
        emptyTitle="No quizzes match"
        columns={[
          { key: 'title', header: 'Quiz', render: (x) => <strong>{x.title}</strong> },
          { key: 'ctx', header: 'Context', render: (x) => <Badge tone="outline">{titleCase(x.context)}</Badge> },
          { key: 'subject', header: 'Subject', render: (x) => x.subjectId?.name ?? '—', hideSm: true },
          { key: 'classes', header: 'Classes', render: (x) => classLevels(x.classLevels), hideSm: true },
          { key: 'qs', header: 'Questions', align: 'right', render: (x) => x.questionCount ?? x.questions?.length ?? '—' },
          { key: 'ver', header: 'Ver.', align: 'right', render: (x) => x.version ?? 1, hideSm: true },
          { key: 'updated', header: 'Updated', render: (x) => date(x.updatedAt), hideSm: true },
          { key: 'status', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (x) => (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(x)}>
                Edit
              </button>
            ),
          },
        ]}
        pagination={list.data ? { page: list.data.page, totalPages: list.data.totalPages, total: list.data.total, pageSize: list.data.pageSize, onPage: setPage } : undefined}
      />
      <QuizModal quiz={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

const newQuestion = (): QuizQuestion => ({ prompt: '', options: ['', ''], correctIndex: 0, marks: 1, explanation: '' });

/** Validates the question builder; keys are `questions.<i>.<field>`. Exported for tests. */
export function validateQuestions(questions: QuizQuestion[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (!questions.length) e.questions = 'Add at least one question';
  questions.forEach((q, i) => {
    if (!q.prompt.trim()) e[`questions.${i}.prompt`] = 'Question prompt is required';
    if (q.options.length < 2 || q.options.length > 6) e[`questions.${i}.options`] = 'Between 2 and 6 options';
    else if (q.options.some((o) => !o.trim())) e[`questions.${i}.options`] = 'Options cannot be empty';
    if (q.correctIndex < 0 || q.correctIndex >= q.options.length) e[`questions.${i}.correctIndex`] = 'Choose the correct option';
    if (!(q.marks >= 0 && q.marks <= 100)) e[`questions.${i}.marks`] = '0–100';
  });
  return e;
}

function QuizModal({ quiz, open, onClose }: { quiz: Quiz | null; open: boolean; onClose: () => void }) {
  const subjects = useSubjectsList();
  const [f, setF] = useState({
    title: '',
    description: '',
    context: 'learning' as Quiz['context'],
    subjectId: '',
    classLevels: [] as number[],
    timeLimitSec: '' as number | '',
    revealPolicy: 'after_submit' as NonNullable<Quiz['revealPolicy']>,
    status: 'draft' as Quiz['status'],
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([newQuestion()]);
  const [questionsDirty, setQuestionsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setF(
      quiz
        ? {
            title: quiz.title,
            description: quiz.description ?? '',
            context: quiz.context,
            subjectId: quiz.subjectId?._id ?? '',
            classLevels: quiz.classLevels ?? [],
            timeLimitSec: quiz.timeLimitSec ?? '',
            revealPolicy: quiz.revealPolicy ?? 'after_submit',
            status: quiz.status,
          }
        : { title: '', description: '', context: 'learning', subjectId: '', classLevels: [], timeLimitSec: '', revealPolicy: 'after_submit', status: 'draft' },
    );
    setQuestions(quiz?.questions?.length ? quiz.questions.map((q) => ({ ...q, explanation: q.explanation ?? '' })) : [newQuestion()]);
    setQuestionsDirty(false);
    setErrors({});
    setFormError(null);
  }, [open, quiz]);

  const updQ = (i: number, patch: Partial<QuizQuestion>) => {
    setQuestionsDirty(true);
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  };
  const moveQ = (i: number, d: -1 | 1) => {
    setQuestionsDirty(true);
    setQuestions((qs) => {
      const next = [...qs];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x);
      return next;
    });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = validateQuestions(questions);
    if (f.title.trim().length < 2) v.title = 'Title is required';
    if (f.timeLimitSec !== '' && (f.timeLimitSec < 10 || f.timeLimitSec > 7200)) v.timeLimitSec = '10–7200 seconds';
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) {
      setFormError('Please fix the highlighted fields.');
      return;
    }
    const body: Record<string, unknown> = {
      title: f.title.trim(),
      description: f.description || undefined,
      context: f.context,
      revealPolicy: f.revealPolicy,
      status: f.status,
      ...(f.subjectId ? { subjectId: f.subjectId } : {}),
      ...(f.classLevels.length ? { classLevels: f.classLevels } : {}),
      ...(f.timeLimitSec !== '' ? { timeLimitSec: f.timeLimitSec } : {}),
    };
    if (!quiz || questionsDirty) {
      body.questions = questions.map((q) => ({ ...(q._id ? { _id: q._id } : {}), prompt: q.prompt.trim(), options: q.options.map((o) => o.trim()), correctIndex: q.correctIndex, marks: q.marks, ...(q.explanation?.trim() ? { explanation: q.explanation.trim() } : {}) }));
    }
    setBusy(true);
    try {
      if (quiz) await api.patch(`/quizzes/${quiz._id}`, body);
      else await api.post('/quizzes', body);
      await invalidate('/quizzes');
      toast.success(quiz ? (questionsDirty ? 'Quiz saved as a new version' : 'Quiz saved') : 'Quiz created');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={quiz ? `Edit quiz (v${quiz.version ?? 1})` : 'New quiz'}
      onClose={onClose}
      size="lg"
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="quiz-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save quiz'}
          </button>
        </>
      }
    >
      <form id="quiz-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormGrid cols={3}>
          <FormField label="Title" error={errors.title} required className="span-2">
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} />
          </FormField>
          <FormField label="Status" error={errors.status}>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Quiz['status'] })}>
              {CONTENT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Used for" error={errors.context} required>
            <select value={f.context} onChange={(e) => setF({ ...f, context: e.target.value as Quiz['context'] })}>
              {CONTEXTS.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Subject" error={errors.subjectId}>
            <select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
              <option value="">None</option>
              {subjects.data?.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Time limit (seconds)" error={errors.timeLimitSec}>
            <input type="number" min={10} max={7200} value={f.timeLimitSec} onChange={(e) => setF({ ...f, timeLimitSec: e.target.value ? Number(e.target.value) : '' })} />
          </FormField>
          <FormField label="Show answers" error={errors.revealPolicy}>
            <select value={f.revealPolicy} onChange={(e) => setF({ ...f, revealPolicy: e.target.value as NonNullable<Quiz['revealPolicy']> })}>
              <option value="after_submit">After submit</option>
              <option value="never">Never</option>
            </select>
          </FormField>
        </FormGrid>
        <FormField label="Description" error={errors.description}>
          <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} />
        </FormField>
        <ClassLevelPicker label="Class levels (leave empty for all)" value={f.classLevels} onChange={(v) => setF({ ...f, classLevels: v })} />

        <div className="row row--between" style={{ margin: '8px 0' }}>
          <p className="form-section-title" style={{ margin: 0 }}>
            Questions ({questions.length})
          </p>
          {quiz && questionsDirty && <Badge tone="yellow">Will create version {(quiz.version ?? 1) + 1}</Badge>}
        </div>
        {errors.questions && <p className="field__error">{errors.questions}</p>}
        {questions.map((q, i) => (
          <fieldset key={q._id ?? `n${i}`} className="question-card">
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="question-card__head">
              <strong>Question {i + 1}</strong>
              <div className="row">
                <button type="button" className="icon-btn icon-btn--sm" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => moveQ(i, -1)}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="icon-btn icon-btn--sm" aria-label={`Move question ${i + 1} down`} disabled={i === questions.length - 1} onClick={() => moveQ(i, 1)}>
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label={`Remove question ${i + 1}`}
                  disabled={questions.length === 1}
                  onClick={() => {
                    setQuestionsDirty(true);
                    setQuestions((qs) => qs.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <FormField label="Prompt" error={errors[`questions.${i}.prompt`]} required>
              <textarea rows={2} value={q.prompt} onChange={(e) => updQ(i, { prompt: e.target.value })} maxLength={1000} />
            </FormField>
            <div role="radiogroup" aria-label={`Options for question ${i + 1} (select the correct answer)`}>
              <p className="field__label" style={{ margin: '0 0 6px' }}>
                Options <span className="muted small">(select the correct answer)</span>
              </p>
              {q.options.map((o, oi) => (
                <div key={oi} className="option-row">
                  <input
                    type="radio"
                    name={`correct-${i}`}
                    checked={q.correctIndex === oi}
                    onChange={() => updQ(i, { correctIndex: oi })}
                    aria-label={`Option ${oi + 1} is correct`}
                  />
                  <input
                    className="input"
                    aria-label={`Question ${i + 1} option ${oi + 1}`}
                    value={o}
                    maxLength={300}
                    onChange={(e) => updQ(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })}
                  />
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    aria-label={`Remove option ${oi + 1}`}
                    disabled={q.options.length <= 2}
                    onClick={() =>
                      updQ(i, {
                        options: q.options.filter((_, k) => k !== oi),
                        correctIndex: q.correctIndex === oi ? 0 : q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex,
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {(errors[`questions.${i}.options`] || errors[`questions.${i}.correctIndex`]) && (
                <p className="field__error">{errors[`questions.${i}.options`] ?? errors[`questions.${i}.correctIndex`]}</p>
              )}
              <button type="button" className="link-btn small" disabled={q.options.length >= 6} onClick={() => updQ(i, { options: [...q.options, ''] })}>
                + Add option {q.options.length >= 6 ? '(max 6)' : ''}
              </button>
            </div>
            <FormGrid cols={3}>
              <FormField label="Marks" error={errors[`questions.${i}.marks`]}>
                <input type="number" min={0} max={100} value={q.marks} onChange={(e) => updQ(i, { marks: Number(e.target.value) })} />
              </FormField>
              <FormField label="Explanation (shown after submit)" className="span-2">
                <input value={q.explanation ?? ''} onChange={(e) => updQ(i, { explanation: e.target.value })} maxLength={1000} />
              </FormField>
            </FormGrid>
          </fieldset>
        ))}
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={questions.length >= 100}
          onClick={() => {
            setQuestionsDirty(true);
            setQuestions((qs) => [...qs, newQuestion()]);
          }}
        >
          <PlusCircle size={14} aria-hidden /> Add question
        </button>
      </form>
    </Modal>
  );
}
