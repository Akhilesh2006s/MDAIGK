import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Award, PlusCircle } from 'lucide-react';
import { CERTIFICATION_LEVELS, CONTENT_STATUS } from '@mango/shared';
import { ApiError, api, errorMessage } from '../../../api/client';
import { useGet, useInvalidate } from '../../../api/hooks';
import type { CertificationLevel } from '../../../api/types';
import { PageHeader } from '../../../components/Cards';
import { DataTable } from '../../../components/DataTable';
import { ClassLevelPicker, FormField, FormGrid } from '../../../components/Form';
import { InlineAlert } from '../../../components/Feedback';
import { Modal } from '../../../components/Modal';
import { Badge, StatusBadge } from '../../../components/Badge';
import { useToast } from '../../../components/Toast';
import { classLevels, titleCase } from '../../../lib/format';
import { useQuizOptions } from './shared';

export default function CertificationPage() {
  const q = useGet<CertificationLevel[]>('/certifications/levels');
  const [editing, setEditing] = useState<CertificationLevel | 'new' | null>(null);
  const missing = useMemo(() => CERTIFICATION_LEVELS.filter((n) => !q.data?.some((l) => l.level === n)), [q.data]);
  return (
    <>
      <PageHeader
        title="Certification levels"
        subtitle="Ten progressive general-knowledge levels. Students must pass the assessment and any prerequisite level."
        actions={
          missing.length > 0 && q.data ? (
            <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
              <PlusCircle size={16} aria-hidden /> Add level
            </button>
          ) : undefined
        }
      />
      <DataTable
        caption="Certification levels"
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(l) => l._id}
        emptyTitle="No certification levels yet"
        emptyAction={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>
            Add level 1
          </button>
        }
        columns={[
          {
            key: 'level',
            header: 'Level',
            render: (l) => (
              <Badge tone="gold">
                <Award size={12} aria-hidden /> Level {l.level}
              </Badge>
            ),
            width: '100px',
          },
          { key: 'title', header: 'Title', render: (l) => (<div><strong>{l.title}</strong>{l.description && <div className="muted small">{l.description}</div>}</div>) },
          { key: 'prereq', header: 'Prerequisite', render: (l) => (l.prerequisiteLevel ? `Level ${l.prerequisiteLevel}` : 'None') },
          { key: 'pass', header: 'Pass mark', align: 'right', render: (l) => (l.passPercent !== undefined ? `${l.passPercent}%` : '—') },
          { key: 'attempts', header: 'Attempts / day', align: 'right', render: (l) => l.maxAttemptsPerDay ?? '—', hideSm: true },
          { key: 'quiz', header: 'Assessment quiz', render: (l) => l.quizId?.title ?? <span className="text-danger">Not set</span>, hideSm: true },
          { key: 'classes', header: 'Eligible classes', render: (l) => classLevels(l.eligibleClassLevels), hideSm: true },
          { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (l) => (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(l)}>
                Edit
              </button>
            ),
          },
        ]}
      />
      <LevelModal level={editing === 'new' ? null : editing} open={editing !== null} available={missing} onClose={() => setEditing(null)} />
    </>
  );
}

function LevelModal({ level, open, available, onClose }: { level: CertificationLevel | null; open: boolean; available: number[]; onClose: () => void }) {
  const quizzes = useQuizOptions('certification');
  const [f, setF] = useState({
    level: 1,
    title: '',
    description: '',
    prerequisiteLevel: '' as number | '',
    passPercent: 60,
    maxAttemptsPerDay: 3,
    quizId: '',
    eligibleClassLevels: [] as number[],
    status: 'draft' as CertificationLevel['status'],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    setF(
      level
        ? {
            level: level.level,
            title: level.title,
            description: level.description ?? '',
            prerequisiteLevel: level.prerequisiteLevel ?? '',
            passPercent: level.passPercent ?? 60,
            maxAttemptsPerDay: level.maxAttemptsPerDay ?? 3,
            quizId: level.quizId?._id ?? '',
            eligibleClassLevels: level.eligibleClassLevels ?? [],
            status: level.status,
          }
        : {
            level: available[0] ?? 1,
            title: '',
            description: '',
            prerequisiteLevel: available[0] && available[0] > 1 ? available[0] - 1 : '',
            passPercent: 60,
            maxAttemptsPerDay: 3,
            quizId: '',
            eligibleClassLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            status: 'draft',
          },
    );
    setErrors({});
    setFormError(null);
  }, [open, level, available]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (f.title.trim().length < 2) v.title = 'Title is required';
    if (!(f.passPercent >= 1 && f.passPercent <= 100)) v.passPercent = '1–100';
    if (!(f.maxAttemptsPerDay >= 1 && f.maxAttemptsPerDay <= 20)) v.maxAttemptsPerDay = '1–20';
    if (f.prerequisiteLevel !== '' && f.prerequisiteLevel >= f.level) v.prerequisiteLevel = 'Prerequisite must be a lower level';
    if (f.status === 'published' && !f.quizId) v.quizId = 'A published level needs an assessment quiz';
    if (!f.eligibleClassLevels.length) v.eligibleClassLevels = 'Select at least one class';
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    const body = {
      ...f,
      title: f.title.trim(),
      prerequisiteLevel: f.prerequisiteLevel === '' ? null : f.prerequisiteLevel,
      quizId: f.quizId || null,
    };
    setBusy(true);
    try {
      if (level) await api.patch(`/certifications/levels/${level._id}`, body);
      else await api.post('/certifications/levels', body);
      await invalidate('/certifications');
      toast.success(level ? `Level ${f.level} saved` : `Level ${f.level} created`);
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
      title={level ? `Edit level ${level.level}` : 'Add certification level'}
      onClose={onClose}
      busy={busy}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="level-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save level'}
          </button>
        </>
      }
    >
      <form id="level-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormGrid cols={3}>
          <FormField label="Level" error={errors.level} required>
            <select value={f.level} disabled={Boolean(level)} onChange={(e) => setF({ ...f, level: Number(e.target.value) })}>
              {(level ? [level.level] : available).map((n) => (
                <option key={n} value={n}>
                  Level {n}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Title" error={errors.title} required className="span-2">
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} />
          </FormField>
        </FormGrid>
        <FormField label="Description" error={errors.description}>
          <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} />
        </FormField>
        <FormGrid cols={3}>
          <FormField label="Prerequisite level" error={errors.prerequisiteLevel}>
            <select value={f.prerequisiteLevel} onChange={(e) => setF({ ...f, prerequisiteLevel: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">None</option>
              {CERTIFICATION_LEVELS.filter((n) => n < f.level).map((n) => (
                <option key={n} value={n}>
                  Level {n}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Pass mark (%)" error={errors.passPercent} required>
            <input type="number" min={1} max={100} value={f.passPercent} onChange={(e) => setF({ ...f, passPercent: Number(e.target.value) })} />
          </FormField>
          <FormField label="Max attempts per day" error={errors.maxAttemptsPerDay}>
            <input type="number" min={1} max={20} value={f.maxAttemptsPerDay} onChange={(e) => setF({ ...f, maxAttemptsPerDay: Number(e.target.value) })} />
          </FormField>
          <FormField label="Assessment quiz" error={errors.quizId} className="span-2" hint="Quizzes with context “Certification”.">
            <select value={f.quizId} onChange={(e) => setF({ ...f, quizId: e.target.value })}>
              <option value="">{quizzes.isLoading ? 'Loading…' : 'None'}</option>
              {quizzes.data?.items.map((qz) => (
                <option key={qz._id} value={qz._id}>
                  {qz.title} ({qz.status})
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Status">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CertificationLevel['status'] })}>
              {CONTENT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </FormField>
        </FormGrid>
        <ClassLevelPicker label="Eligible classes" value={f.eligibleClassLevels} onChange={(v) => setF({ ...f, eligibleClassLevels: v })} error={errors.eligibleClassLevels} />
      </form>
    </Modal>
  );
}
