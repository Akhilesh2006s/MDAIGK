import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, PlusCircle, Trash2 } from 'lucide-react';
import { CONTENT_STATUS } from '@mango/shared';
import { ApiError, api, errorMessage } from '../../../api/client';
import { useGet, useInvalidate } from '../../../api/hooks';
import type { Programme, ProgrammeItem, ProgrammeModule } from '../../../api/types';
import { Card, PageHeader } from '../../../components/Cards';
import { DataTable, type Column } from '../../../components/DataTable';
import { ClassLevelPicker, FormField, FormGrid } from '../../../components/Form';
import { InlineAlert, QueryState } from '../../../components/Feedback';
import { Modal } from '../../../components/Modal';
import { PremiumBadge, StatusBadge } from '../../../components/Badge';
import { useToast } from '../../../components/Toast';
import { classLevels, num, titleCase } from '../../../lib/format';
import { useQuizOptions } from './shared';

const ITEM_TYPES: ProgrammeItem['type'][] = ['lesson', 'activity', 'quiz', 'experiment'];

export default function ProgrammesPage() {
  const q = useGet<Programme[]>('/programmes');
  const [editing, setEditing] = useState<Programme | null>(null);
  const columns: Column<Programme>[] = [
    { key: 'name', header: 'Programme', render: (p) => (<div><strong>{p.name}</strong> {p.premium && <PremiumBadge />}<div className="muted small">{p.description}</div></div>) },
    { key: 'classes', header: 'Classes', render: (p) => classLevels(p.classLevels), hideSm: true },
    { key: 'modules', header: 'Modules / items', align: 'right', render: (p) => `${p.modules.length} / ${p.modules.reduce((s, m) => s + m.items.length, 0)}` },
    { key: 'schools', header: 'Schools enabled', align: 'right', render: (p) => num(p.enabledSchools) },
    { key: 'enrol', header: 'Enrolments', align: 'right', render: (p) => num(p.enrolments), hideSm: true },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (p) => (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(p)}>
          Edit modules
        </button>
      ),
    },
  ];
  return (
    <>
      <PageHeader title="Programmes" subtitle="Premium academies and the separate Young Scientist programme. Counts are all time." />
      <QueryState query={q}>
        {(rows) => (
          <div className="stack">
            <Card title={<span className="row">Premium academies <PremiumBadge label="Premium" /></span>}>
              <DataTable rows={rows.filter((p) => p.premium)} rowKey={(p) => p._id} columns={columns} emptyTitle="No premium academies" />
            </Card>
            <Card title="Other programmes" subtitle="Young Scientist is managed separately from the premium academies.">
              <DataTable rows={rows.filter((p) => !p.premium)} rowKey={(p) => p._id} columns={columns} emptyTitle="No other programmes" />
            </Card>
          </div>
        )}
      </QueryState>
      <ProgrammeModal programme={editing} onClose={() => setEditing(null)} />
    </>
  );
}

const newItem = (): ProgrammeItem => ({ title: '', type: 'lesson', content: '', quizId: null, required: true });

function ProgrammeModal({ programme, onClose }: { programme: Programme | null; onClose: () => void }) {
  const quizzes = useQuizOptions('programme');
  const [f, setF] = useState({ name: '', description: '', classLevels: [] as number[], status: 'draft' as Programme['status'], displayOrder: 0 });
  const [modules, setModules] = useState<ProgrammeModule[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();
  useEffect(() => {
    if (!programme) return;
    setF({ name: programme.name, description: programme.description ?? '', classLevels: programme.classLevels ?? [], status: programme.status, displayOrder: programme.displayOrder ?? 0 });
    setModules([...programme.modules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((m) => ({ ...m, items: m.items.map((i) => ({ ...i })) })));
    setErrors({});
    setFormError(null);
  }, [programme]);

  const updM = (mi: number, patch: Partial<ProgrammeModule>) => setModules((ms) => ms.map((m, j) => (j === mi ? { ...m, ...patch } : m)));
  const updI = (mi: number, ii: number, patch: Partial<ProgrammeItem>) =>
    setModules((ms) => ms.map((m, j) => (j === mi ? { ...m, items: m.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) } : m)));
  const moveM = (mi: number, d: -1 | 1) =>
    setModules((ms) => {
      const n = [...ms];
      const [x] = n.splice(mi, 1);
      n.splice(mi + d, 0, x);
      return n;
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!programme) return;
    const v: Record<string, string> = {};
    if (f.name.trim().length < 2) v.name = 'Name is required';
    modules.forEach((m, mi) => {
      if (!m.title.trim()) v[`modules.${mi}.title`] = 'Module title is required';
      m.items.forEach((it, ii) => {
        if (!it.title.trim()) v[`modules.${mi}.items.${ii}.title`] = 'Item title is required';
      });
    });
    setErrors(v);
    setFormError(Object.keys(v).length ? 'Please fix the highlighted fields.' : null);
    if (Object.keys(v).length) return;
    const body = {
      name: f.name.trim(),
      description: f.description,
      status: f.status,
      displayOrder: f.displayOrder,
      ...(f.classLevels.length ? { classLevels: f.classLevels } : {}),
      modules: modules.map((m, mi) => ({
        ...(m._id ? { _id: m._id } : {}),
        title: m.title.trim(),
        ...(m.description ? { description: m.description } : {}),
        order: mi + 1,
        items: m.items.map((it) => ({
          ...(it._id ? { _id: it._id } : {}),
          title: it.title.trim(),
          type: it.type,
          ...(it.content ? { content: it.content } : {}),
          quizId: it.quizId || null,
          required: it.required,
        })),
      })),
    };
    setBusy(true);
    try {
      await api.patch(`/programmes/${programme._id}`, body);
      await invalidate('/programmes');
      toast.success('Programme saved');
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
      open={Boolean(programme)}
      title={`Edit ${programme?.name ?? 'programme'}`}
      onClose={onClose}
      size="lg"
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="prog-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save programme'}
          </button>
        </>
      }
    >
      <form id="prog-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <p className="muted small">
          Code <span className="mono">{programme?.code}</span> · {programme?.premium ? 'Premium academy' : 'Standard programme'}. Existing module/item ids are kept so student progress is preserved.
        </p>
        <FormGrid cols={3}>
          <FormField label="Name" error={errors.name} required className="span-2">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} />
          </FormField>
          <FormField label="Status">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Programme['status'] })}>
              {CONTENT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </FormField>
        </FormGrid>
        <FormField label="Description">
          <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} />
        </FormField>
        <ClassLevelPicker label="Eligible classes (empty = all)" value={f.classLevels} onChange={(v) => setF({ ...f, classLevels: v })} />

        <p className="form-section-title">Modules ({modules.length})</p>
        {modules.map((m, mi) => (
          <fieldset key={m._id ?? `m${mi}`} className="module-card">
            <legend className="sr-only">Module {mi + 1}</legend>
            <div className="row row--between" style={{ marginBottom: 6 }}>
              <strong>Module {mi + 1}</strong>
              <div className="row">
                <button type="button" className="icon-btn icon-btn--sm" aria-label={`Move module ${mi + 1} up`} disabled={mi === 0} onClick={() => moveM(mi, -1)}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="icon-btn icon-btn--sm" aria-label={`Move module ${mi + 1} down`} disabled={mi === modules.length - 1} onClick={() => moveM(mi, 1)}>
                  <ArrowDown size={14} />
                </button>
                <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove module ${mi + 1}`} onClick={() => setModules((ms) => ms.filter((_, j) => j !== mi))}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <FormGrid>
              <FormField label="Module title" error={errors[`modules.${mi}.title`]} required>
                <input value={m.title} onChange={(e) => updM(mi, { title: e.target.value })} maxLength={200} />
              </FormField>
              <FormField label="Module description">
                <input value={m.description ?? ''} onChange={(e) => updM(mi, { description: e.target.value })} maxLength={1000} />
              </FormField>
            </FormGrid>
            <p className="field__label">Items</p>
            {m.items.map((it, ii) => (
              <div key={it._id ?? `i${ii}`}>
                <div className="item-row">
                  <input aria-label={`Module ${mi + 1} item ${ii + 1} title`} placeholder="Item title" value={it.title} onChange={(e) => updI(mi, ii, { title: e.target.value })} maxLength={200} aria-invalid={Boolean(errors[`modules.${mi}.items.${ii}.title`])} />
                  <select aria-label={`Module ${mi + 1} item ${ii + 1} type`} value={it.type} onChange={(e) => updI(mi, ii, { type: e.target.value as ProgrammeItem['type'] })}>
                    {ITEM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {titleCase(t)}
                      </option>
                    ))}
                  </select>
                  {it.type === 'quiz' ? (
                    <select aria-label={`Module ${mi + 1} item ${ii + 1} quiz`} value={it.quizId ?? ''} onChange={(e) => updI(mi, ii, { quizId: e.target.value || null })}>
                      <option value="">Choose quiz…</option>
                      {quizzes.data?.items.map((qz) => (
                        <option key={qz._id} value={qz._id}>
                          {qz.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input aria-label={`Module ${mi + 1} item ${ii + 1} content`} placeholder="Content / instructions" value={it.content ?? ''} onChange={(e) => updI(mi, ii, { content: e.target.value })} />
                  )}
                  <label className="row small nowrap">
                    <input type="checkbox" checked={it.required} onChange={(e) => updI(mi, ii, { required: e.target.checked })} /> Required
                  </label>
                  <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove item ${ii + 1} from module ${mi + 1}`} onClick={() => updM(mi, { items: m.items.filter((_, k) => k !== ii) })}>
                    <Trash2 size={13} />
                  </button>
                </div>
                {errors[`modules.${mi}.items.${ii}.title`] && <p className="field__error">{errors[`modules.${mi}.items.${ii}.title`]}</p>}
              </div>
            ))}
            <button type="button" className="link-btn small" onClick={() => updM(mi, { items: [...m.items, newItem()] })}>
              + Add item
            </button>
          </fieldset>
        ))}
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setModules((ms) => [...ms, { title: '', description: '', order: ms.length + 1, items: [newItem()] }])}>
          <PlusCircle size={14} aria-hidden /> Add module
        </button>
      </form>
    </Modal>
  );
}
