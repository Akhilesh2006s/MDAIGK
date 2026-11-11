import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ApiError, api, errorMessage } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { ClassAccessRow, Paginated, Section, StudentRow } from '../../api/types';
import { useSchoolId } from '../../auth/AuthContext';
import { PageHeader, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { ConfirmDialog, Modal, SecretDialog } from '../../components/Modal';
import { FormField, FormGrid } from '../../components/Form';
import { InlineAlert } from '../../components/Feedback';
import { StatusBadge } from '../../components/Badge';
import { useToast } from '../../components/Toast';
import { dateTime, num, pct } from '../../lib/format';
import { FilterField, sectionLabel, useSections } from './shared';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const usableSections = (sections: Section[] | undefined) => (sections ?? []).filter((s) => s.status === 'active' && !s.locked);

function SectionSelect({ sections, value, onChange, placeholder = 'Select a section' }: { sections: Section[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {sections.map((s) => (
        <option key={s._id} value={s._id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

function AddStudentDialog({ schoolId, sections, onClose, onCreated }: { schoolId: string; sections: Section[]; onClose: () => void; onCreated: (name: string, code: string, pin?: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', displayName: '', studentCode: '', classSectionId: '', pin: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = useMutate(
    () =>
      api.post<{ studentCode: string; pin?: string }>(`/schools/${schoolId}/students`, {
        name: form.name.trim(),
        displayName: form.displayName.trim() || undefined,
        studentCode: form.studentCode.trim(),
        classSectionId: form.classSectionId,
        pin: form.pin || undefined,
      }),
    { invalidate: [`/schools/${schoolId}`], toastError: false },
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v: Record<string, string> = {};
    if (form.name.trim().length < 2) v.name = 'Enter the student’s full name';
    if (!/^[A-Za-z0-9-]{1,30}$/.test(form.studentCode.trim())) v.studentCode = 'Use letters, digits and dashes (e.g. GVS407A)';
    if (!form.classSectionId) v.classSectionId = 'Choose a section';
    if (form.pin && !/^\d{4,8}$/.test(form.pin)) v.pin = 'PIN must be 4–8 digits';
    setErrors(v);
    if (Object.keys(v).length) return;
    try {
      const res = await save.mutateAsync(undefined);
      toast.success(`Student ${res.studentCode} added`);
      onCreated(form.name.trim(), res.studentCode, res.pin);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      setFormError(err instanceof ApiError && err.code === 'CONFLICT' ? 'This student ID is already used in your school.' : errorMessage(err));
    }
  }
  return (
    <Modal
      open
      title="Add student"
      onClose={onClose}
      busy={save.isPending}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" form="student-form" className="btn btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Add student'}
          </button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        {!sections.length && <InlineAlert tone="warning">Create a section under an enabled class before adding students.</InlineAlert>}
        <FormGrid>
          <FormField label="Full name" error={errors.name} required>
            <input value={form.name} onChange={set('name')} data-autofocus />
          </FormField>
          <FormField label="Display name" error={errors.displayName} hint="Shown in the app (optional).">
            <input value={form.displayName} maxLength={60} onChange={set('displayName')} />
          </FormField>
          <FormField label="Student ID" error={errors.studentCode} hint="School-issued ID used to sign in." required>
            <input value={form.studentCode} onChange={set('studentCode')} style={{ textTransform: 'uppercase' }} />
          </FormField>
          <FormField label="Section" error={errors.classSectionId} required>
            <SectionSelect sections={sections} value={form.classSectionId} onChange={(v) => setForm((f) => ({ ...f, classSectionId: v }))} />
          </FormField>
          <FormField label="PIN" error={errors.pin} hint="Leave blank to generate a one-time PIN.">
            <input inputMode="numeric" autoComplete="off" value={form.pin} maxLength={8} onChange={set('pin')} />
          </FormField>
        </FormGrid>
      </form>
    </Modal>
  );
}

function EditStudentDialog({ schoolId, student, sections, mode, onClose }: { schoolId: string; student: StudentRow; sections: Section[]; mode: 'edit' | 'move'; onClose: () => void }) {
  const [name, setName] = useState(student.name);
  const [displayName, setDisplayName] = useState(student.displayName ?? '');
  const [sectionId, setSectionId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutate(
    () =>
      api.patch(
        `/schools/${schoolId}/students/${student.id}`,
        mode === 'move' ? { classSectionId: sectionId } : { name: name.trim(), displayName: displayName.trim() },
      ),
    { invalidate: [`/schools/${schoolId}`], toastError: false, success: mode === 'move' ? 'Student moved' : 'Student updated', onSuccess: onClose },
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v: Record<string, string> = {};
    if (mode === 'edit' && name.trim().length < 2) v.name = 'Enter the student’s full name';
    if (mode === 'move' && !sectionId) v.classSectionId = 'Choose the new section';
    if (mode === 'move' && sectionId === student.section?._id) v.classSectionId = 'The student is already in this section';
    setErrors(v);
    if (Object.keys(v).length) return;
    save.mutate(undefined, {
      onError: (err) => {
        if (err instanceof ApiError) setErrors(err.fieldErrors);
        setFormError(errorMessage(err));
      },
    });
  }
  return (
    <Modal
      open
      size="sm"
      title={mode === 'move' ? `Move ${student.name}` : `Edit ${student.name}`}
      onClose={onClose}
      busy={save.isPending}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" form="edit-student" className="btn btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : mode === 'move' ? 'Move student' : 'Save'}
          </button>
        </>
      }
    >
      <form id="edit-student" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        {mode === 'edit' ? (
          <>
            <FormField label="Full name" error={errors.name} required>
              <input value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
            </FormField>
            <FormField label="Display name" error={errors.displayName}>
              <input value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
            </FormField>
          </>
        ) : (
          <>
            <p className="muted">
              Currently in <strong>{sectionLabel(student.section)}</strong>. Student ID {student.studentCode} stays the same.
            </p>
            <FormField label="New section" error={errors.classSectionId} required>
              <SectionSelect sections={sections} value={sectionId} onChange={setSectionId} />
            </FormField>
          </>
        )}
      </form>
    </Modal>
  );
}

export default function StudentsPage() {
  const schoolId = useSchoolId();
  const sections = useSections();
  const access = useGet<ClassAccessRow[]>(`/schools/${schoolId}/class-access`);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState('active');
  const debounced = useDebounced(search.trim());
  useEffect(() => setPage(1), [debounced, level, sectionId, status]);
  const q = useGet<Paginated<StudentRow>>(`/schools/${schoolId}/students`, {
    page,
    pageSize: 20,
    q: debounced || undefined,
    levelNumber: level || undefined,
    sectionId: sectionId || undefined,
    status: status || undefined,
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ s: StudentRow; mode: 'edit' | 'move' } | null>(null);
  const [toggling, setToggling] = useState<StudentRow | null>(null);
  const [resetting, setResetting] = useState<StudentRow | null>(null);
  const [secret, setSecret] = useState<{ subject: string; value: string } | null>(null);
  const toggle = useMutate((s: StudentRow) => api.patch(`/schools/${schoolId}/students/${s.id}`, { status: s.status === 'active' ? 'inactive' : 'active' }), {
    invalidate: [`/schools/${schoolId}`],
    success: 'Student status updated',
    onSuccess: () => setToggling(null),
  });
  const reset = useMutate((s: StudentRow) => api.post<{ pin: string }>(`/schools/${schoolId}/students/${s.id}/reset-pin`), {
    onSuccess: (r) => {
      if (resetting) setSecret({ subject: `${resetting.name} (${resetting.studentCode})`, value: r.pin });
      setResetting(null);
    },
  });

  const allSections = sections.data ?? [];
  const usable = usableSections(allSections);
  const enabledLevels = (access.data ?? []).filter((a) => a.enabled).map((a) => a.levelNumber);
  const filterSections = allSections.filter((s) => !level || s.levelNumber === Number(level));
  const filtered = Boolean(debounced || level || sectionId || status !== 'active');

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={q.data ? `${num(q.data.total)} student(s) match` : undefined}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden /> Add student
          </button>
        }
      />
      <Toolbar>
        <div className="toolbar__grow">
          <FilterField label="Search">
            <input type="search" placeholder="Name or student ID" value={search} onChange={(e) => setSearch(e.target.value)} />
          </FilterField>
        </div>
        <FilterField label="Class">
          <select value={level} onChange={(e) => (setLevel(e.target.value), setSectionId(''))}>
            <option value="">All classes</option>
            {enabledLevels.map((n) => (
              <option key={n} value={n}>
                Class {n}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Section">
          <SectionSelect sections={filterSections} value={sectionId} onChange={setSectionId} placeholder="All sections" />
        </FilterField>
        <FilterField label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </FilterField>
      </Toolbar>
      <DataTable
        caption="Students"
        rows={q.data?.items}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        fetching={q.isFetching}
        rowKey={(s) => s.id}
        emptyTitle={filtered ? 'No students match your filters' : 'No students yet'}
        emptyMessage={filtered ? 'Try clearing the search or filters.' : 'Add students to a section to get started.'}
        rowClassName={(s) => (s.status === 'active' ? undefined : 'row--muted')}
        columns={[
          { key: 'code', header: 'Student ID', render: (s) => <span className="mono">{s.studentCode}</span> },
          {
            key: 'name',
            header: 'Name',
            render: (s) => (
              <Link to={`/school/students/${s.id}`}>
                <strong>{s.name}</strong>
                {s.displayName && s.displayName !== s.name && <span className="muted"> ({s.displayName})</span>}
              </Link>
            ),
          },
          { key: 'section', header: 'Class', render: (s) => sectionLabel(s.section) },
          { key: 'avg', header: 'Avg score', align: 'right', render: (s) => (<span title={`${s.attempts} attempts (all time)`}>{pct(s.averagePercent)} <span className="muted small">n={s.attempts}</span></span>) },
          { key: 'login', header: 'Last sign-in', render: (s) => dateTime(s.lastLoginAt), hideSm: true },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (s) => (
              <div className="actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing({ s, mode: 'edit' })}>
                  Edit
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing({ s, mode: 'move' })} disabled={s.status !== 'active'}>
                  Move
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setResetting(s)}>
                  Reset PIN
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setToggling(s)}>
                  {s.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ),
          },
        ]}
        pagination={q.data ? { page: q.data.page, totalPages: q.data.totalPages, total: q.data.total, pageSize: q.data.pageSize, onPage: setPage } : undefined}
      />
      <p className="muted small" style={{ marginTop: 8 }}>
        Average score: mean quiz/assessment percentage across all of a student’s attempts (all time); n = number of attempts.
      </p>
      {adding && (
        <AddStudentDialog
          schoolId={schoolId}
          sections={usable}
          onClose={() => setAdding(false)}
          onCreated={(name, code, pin) => {
            setAdding(false);
            if (pin) setSecret({ subject: `${name} (${code})`, value: pin });
          }}
        />
      )}
      {editing && <EditStudentDialog schoolId={schoolId} student={editing.s} mode={editing.mode} sections={usable} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(toggling)}
        title={toggling?.status === 'active' ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        message={toggling?.status === 'active' ? 'The student will no longer be able to sign in. Their records are kept.' : 'The student will be able to sign in again.'}
        confirmLabel={toggling?.status === 'active' ? 'Deactivate' : 'Activate'}
        tone={toggling?.status === 'active' ? 'danger' : 'primary'}
        busy={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling)}
        onCancel={() => setToggling(null)}
      />
      <ConfirmDialog
        open={Boolean(resetting)}
        title={`Reset PIN for ${resetting?.name}?`}
        message="A new one-time PIN will be generated. The old PIN stops working immediately."
        confirmLabel="Reset PIN"
        busy={reset.isPending}
        onConfirm={() => resetting && reset.mutate(resetting)}
        onCancel={() => setResetting(null)}
      />
      <SecretDialog secret={secret?.value} label="PIN" subject={secret?.subject} onClose={() => setSecret(null)} />
    </>
  );
}

export { EditStudentDialog, usableSections };
