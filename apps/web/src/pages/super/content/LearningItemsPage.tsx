import { useEffect, useState, type FormEvent } from 'react';
import { PlusCircle } from 'lucide-react';
import { CLASS_LEVELS, LEARNING_ITEM_TYPES } from '@mango/shared';
import { ApiError, api, errorMessage } from '../../../api/client';
import { useGet, useInvalidate, useMutate } from '../../../api/hooks';
import type { LearningItem, Paginated } from '../../../api/types';
import { PageHeader, Toolbar } from '../../../components/Cards';
import { DataTable } from '../../../components/DataTable';
import { ClassLevelPicker, FormField, FormGrid } from '../../../components/Form';
import { InlineAlert } from '../../../components/Feedback';
import { Modal } from '../../../components/Modal';
import { Badge, StatusBadge } from '../../../components/Badge';
import { useToast } from '../../../components/Toast';
import { classLevels, date, titleCase } from '../../../lib/format';
import { useDebounced } from '../../../lib/useDebounced';
import { StatusSelect, TRANSITIONS, compact, useQuizOptions, useSubjectsList } from './shared';

export default function LearningItemsPage() {
  const subjects = useSubjectsList();
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [status, setStatus] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LearningItem | 'new' | null>(null);
  const q = useDebounced(search.trim());
  useEffect(() => setPage(1), [q, subjectId, status, level]);
  const list = useGet<Paginated<LearningItem>>('/content/learning-items', { q, subjectId, status, levelNumber: level, page, pageSize: 20 });
  const move = useMutate(({ id, to }: { id: string; to: string }) => api.post(`/content/learning-items/${id}/status`, { status: to }), {
    invalidate: ['/content/learning-items'],
    success: (d) => `Moved to ${(d as LearningItem).status}`,
  });

  return (
    <>
      <PageHeader
        title="Learning items"
        subtitle="Author content and move it through moderation: draft → review → published → archived."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            <PlusCircle size={16} aria-hidden /> New item
          </button>
        }
      />
      <Toolbar>
        <div className="field toolbar__grow">
          <label className="field__label" htmlFor="li-q">
            Search title
          </label>
          <input id="li-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="li-subj">
            Subject
          </label>
          <select id="li-subj" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.data?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="li-level">
            Class
          </label>
          <select id="li-level" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">All classes</option>
            {CLASS_LEVELS.map((n) => (
              <option key={n} value={n}>
                Class {n}
              </option>
            ))}
          </select>
        </div>
        <StatusSelect id="li-status" value={status} onChange={setStatus} />
      </Toolbar>
      <DataTable
        caption="Learning items"
        rows={list.data?.items}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        fetching={list.isFetching && !list.isLoading}
        rowKey={(i) => i._id}
        emptyTitle="No learning items match"
        columns={[
          { key: 'title', header: 'Title', render: (i) => (<div><strong>{i.title}</strong>{i.description && <div className="muted small">{i.description}</div>}</div>) },
          { key: 'subject', header: 'Subject', render: (i) => i.subjectId?.name ?? '—' },
          { key: 'type', header: 'Type', render: (i) => <Badge tone="outline">{titleCase(i.type)}</Badge>, hideSm: true },
          { key: 'classes', header: 'Classes', render: (i) => classLevels(i.classLevels) },
          { key: 'version', header: 'Ver.', align: 'right', render: (i) => i.version ?? 1, hideSm: true },
          { key: 'updated', header: 'Updated', render: (i) => date(i.updatedAt), hideSm: true },
          { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (i) => (
              <div className="actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(i)}>
                  Edit
                </button>
                <label className="sr-only" htmlFor={`mv-${i._id}`}>
                  Move {i.title} to status
                </label>
                <select
                  id={`mv-${i._id}`}
                  className="input"
                  style={{ height: 30, width: 'auto' }}
                  value=""
                  disabled={move.isPending}
                  onChange={(e) => e.target.value && move.mutate({ id: i._id, to: e.target.value })}
                >
                  <option value="">Move…</option>
                  {TRANSITIONS[i.status]?.map((t) => (
                    <option key={t.to} value={t.to}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            ),
          },
        ]}
        pagination={list.data ? { page: list.data.page, totalPages: list.data.totalPages, total: list.data.total, pageSize: list.data.pageSize, onPage: setPage } : undefined}
      />
      <LearningItemModal item={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

const empty = {
  subjectId: '',
  classLevels: [] as number[],
  type: 'concept',
  title: '',
  description: '',
  body: '',
  instructions: '',
  audioUrl: '',
  imageUrl: '',
  estimatedMinutes: '' as number | '',
  quizId: '',
};

function LearningItemModal({ item, open, onClose }: { item: LearningItem | null; open: boolean; onClose: () => void }) {
  const subjects = useSubjectsList();
  const quizzes = useQuizOptions('learning');
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    setF(
      item
        ? {
            subjectId: item.subjectId?._id ?? '',
            classLevels: item.classLevels,
            type: item.type,
            title: item.title,
            description: item.description ?? '',
            body: item.body ?? '',
            instructions: item.instructions ?? '',
            audioUrl: item.audioUrl ?? '',
            imageUrl: item.imageUrl ?? '',
            estimatedMinutes: item.estimatedMinutes ?? '',
            quizId: item.quizId ?? '',
          }
        : empty,
    );
    setErrors({});
    setFormError(null);
  }, [open, item]);

  const url = (s: string) => !s || /^https?:\/\/\S+$/.test(s);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!f.subjectId) v.subjectId = 'Choose a subject';
    if (!f.classLevels.length) v.classLevels = 'Select at least one class';
    if (f.title.trim().length < 2) v.title = 'Title is required';
    if (!url(f.audioUrl)) v.audioUrl = 'Enter a full URL (https://…)';
    if (!url(f.imageUrl)) v.imageUrl = 'Enter a full URL (https://…)';
    if (f.estimatedMinutes !== '' && (f.estimatedMinutes < 1 || f.estimatedMinutes > 240)) v.estimatedMinutes = '1–240 minutes';
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    const body = { ...compact({ ...f, title: f.title.trim() }), quizId: f.quizId || null, classLevels: f.classLevels };
    if (item) {
      // allow clearing optional text fields on edit
      Object.assign(body, { description: f.description, body: f.body, instructions: f.instructions, audioUrl: f.audioUrl, imageUrl: f.imageUrl });
    }
    setBusy(true);
    try {
      if (item) await api.patch(`/content/learning-items/${item._id}`, body);
      else await api.post('/content/learning-items', body);
      await invalidate('/content/learning-items');
      toast.success(item ? 'Learning item saved (new version)' : 'Learning item created as draft');
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
      title={item ? 'Edit learning item' : 'New learning item'}
      onClose={onClose}
      size="lg"
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="li-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : item ? 'Save' : 'Create draft'}
          </button>
        </>
      }
    >
      <form id="li-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormField label="Title" error={errors.title} required>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} />
        </FormField>
        <FormGrid cols={3}>
          <FormField label="Subject" error={errors.subjectId} required>
            <select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
              <option value="">Select…</option>
              {subjects.data?.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Type" error={errors.type} required>
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {LEARNING_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Estimated minutes" error={errors.estimatedMinutes}>
            <input type="number" min={1} max={240} value={f.estimatedMinutes} onChange={(e) => setF({ ...f, estimatedMinutes: e.target.value ? Number(e.target.value) : '' })} />
          </FormField>
        </FormGrid>
        <ClassLevelPicker value={f.classLevels} onChange={(v) => setF({ ...f, classLevels: v })} error={errors.classLevels} />
        <FormField label="Short description" error={errors.description}>
          <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} />
        </FormField>
        <FormField label="Body" error={errors.body}>
          <textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={20000} />
        </FormField>
        <FormField label="Instructions" error={errors.instructions}>
          <textarea rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} maxLength={2000} />
        </FormField>
        <FormGrid cols={3}>
          <FormField label="Audio URL" error={errors.audioUrl}>
            <input type="url" value={f.audioUrl} onChange={(e) => setF({ ...f, audioUrl: e.target.value })} />
          </FormField>
          <FormField label="Image URL" error={errors.imageUrl}>
            <input type="url" value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} />
          </FormField>
          <FormField label="Linked quiz" error={errors.quizId}>
            <select value={f.quizId} onChange={(e) => setF({ ...f, quizId: e.target.value })}>
              <option value="">None</option>
              {quizzes.data?.items.map((qz) => (
                <option key={qz._id} value={qz._id}>
                  {qz.title} ({qz.status})
                </option>
              ))}
            </select>
          </FormField>
        </FormGrid>
        {item && <p className="muted small">Saving creates a new version; the moderation status is unchanged.</p>}
      </form>
    </Modal>
  );
}
