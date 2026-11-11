import { useEffect, useState, type FormEvent } from 'react';
import { PlusCircle } from 'lucide-react';
import { ApiError, api, errorMessage } from '../../../api/client';
import { useGet, useInvalidate, useMutate } from '../../../api/hooks';
import type { Subject } from '../../../api/types';
import { PageHeader } from '../../../components/Cards';
import { DataTable } from '../../../components/DataTable';
import { ClassLevelPicker, FormField, FormGrid, Toggle } from '../../../components/Form';
import { InlineAlert } from '../../../components/Feedback';
import { Modal } from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import { classLevels } from '../../../lib/format';

export default function SubjectsPage() {
  const q = useGet<Subject[]>('/subjects');
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);
  const toggle = useMutate((s: Subject) => api.patch(`/subjects/${s._id}`, { enabled: !s.enabled }), {
    invalidate: ['/subjects'],
    success: 'Subject updated',
  });
  return (
    <>
      <PageHeader
        title="Subjects"
        subtitle="Enable or disable subjects platform-wide and choose which classes each subject applies to."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            <PlusCircle size={16} aria-hidden /> Add subject
          </button>
        }
      />
      <DataTable
        caption="Subjects"
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(s) => s._id}
        rowClassName={(s) => (s.enabled ? undefined : 'row--muted')}
        emptyTitle="No subjects"
        columns={[
          { key: 'code', header: 'Code', render: (s) => <span className="mono">{s.code}</span>, width: '90px' },
          { key: 'name', header: 'Subject', render: (s) => (<div><strong>{s.name}</strong>{s.description && <div className="muted small">{s.description}</div>}</div>) },
          { key: 'classes', header: 'Classes', render: (s) => classLevels(s.classLevels) },
          { key: 'order', header: 'Order', align: 'right', render: (s) => s.displayOrder ?? '—', hideSm: true },
          {
            key: 'enabled',
            header: 'Enabled',
            render: (s) => <Toggle checked={s.enabled} disabled={toggle.isPending} onChange={() => toggle.mutate(s)} label={s.enabled ? 'On' : 'Off'} />,
          },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (s) => (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(s)}>
                Edit
              </button>
            ),
          },
        ]}
      />
      <SubjectModal subject={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

function SubjectModal({ subject, open, onClose }: { subject: Subject | null; open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ code: '', name: '', description: '', displayOrder: 0, classLevels: [] as number[], enabled: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    setF(
      subject
        ? { code: subject.code, name: subject.name, description: subject.description ?? '', displayOrder: subject.displayOrder ?? 0, classLevels: subject.classLevels, enabled: subject.enabled }
        : { code: '', name: '', description: '', displayOrder: 0, classLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], enabled: true },
    );
    setErrors({});
    setFormError(null);
  }, [open, subject]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!/^[A-Za-z_]{2,10}$/.test(f.code)) v.code = '2–10 letters or underscores';
    if (f.name.trim().length < 2) v.name = 'Name is required';
    if (!f.classLevels.length) v.classLevels = 'Select at least one class';
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const body = { ...f, code: f.code.toUpperCase(), name: f.name.trim() };
      if (subject) await api.patch(`/subjects/${subject._id}`, body);
      else await api.post('/subjects', body);
      await invalidate('/subjects');
      toast.success(subject ? 'Subject saved' : 'Subject created');
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
      title={subject ? `Edit ${subject.name}` : 'Add subject'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="subject-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save subject'}
          </button>
        </>
      }
    >
      <form id="subject-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormGrid cols={3}>
          <FormField label="Code" error={errors.code} required>
            <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={10} />
          </FormField>
          <FormField label="Name" error={errors.name} required>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} />
          </FormField>
          <FormField label="Display order" error={errors.displayOrder}>
            <input type="number" value={f.displayOrder} onChange={(e) => setF({ ...f, displayOrder: Number(e.target.value) })} />
          </FormField>
        </FormGrid>
        <FormField label="Description" error={errors.description}>
          <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} />
        </FormField>
        <ClassLevelPicker label="Applies to classes" value={f.classLevels} onChange={(v) => setF({ ...f, classLevels: v })} error={errors.classLevels} />
        <Toggle checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="Enabled" />
      </form>
    </Modal>
  );
}
