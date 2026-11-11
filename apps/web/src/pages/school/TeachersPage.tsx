import { useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import { ApiError, api, errorMessage } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { Section, Subject, Teacher } from '../../api/types';
import { useSchoolId } from '../../auth/AuthContext';
import { PageHeader, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { ConfirmDialog, Modal, SecretDialog } from '../../components/Modal';
import { EMAIL_RX, FormField, FormGrid } from '../../components/Form';
import { EmptyState, InlineAlert, Loading } from '../../components/Feedback';
import { Badge, StatusBadge } from '../../components/Badge';
import { useToast } from '../../components/Toast';
import { dateTime } from '../../lib/format';
import { FilterField, sectionLabel, useSections, useSubjects } from './shared';

/** sectionId → subjectIds */
type AssignmentMap = Record<string, string[]>;

const toPayload = (m: AssignmentMap) =>
  Object.entries(m)
    .filter(([, subs]) => subs.length > 0)
    .map(([classSectionId, subjectIds]) => ({ classSectionId, subjectIds }));

function fromTeacher(t: Teacher): AssignmentMap {
  const m: AssignmentMap = {};
  t.assignments.forEach((a) => {
    if (a.section) m[a.section._id] = a.subjects.map((s) => s._id);
  });
  return m;
}

/** Multi-select matrix: each assignable section × enabled subjects. */
function AssignmentEditor({ value, onChange, sections, subjects }: { value: AssignmentMap; onChange: (m: AssignmentMap) => void; sections: Section[]; subjects: Subject[] }) {
  const usable = sections.filter((s) => s.status === 'active' && !s.locked);
  const enabledSubjects = subjects.filter((s) => s.enabled);
  if (!usable.length) return <EmptyState title="No sections available" message="Create sections under your enabled classes first." />;
  const toggle = (sectionId: string, subjectId: string) => {
    const cur = value[sectionId] ?? [];
    onChange({ ...value, [sectionId]: cur.includes(subjectId) ? cur.filter((x) => x !== subjectId) : [...cur, subjectId] });
  };
  return (
    <div className="stack stack--sm">
      {usable.map((sec) => {
        const applicable = enabledSubjects.filter((s) => !s.classLevels?.length || s.classLevels.includes(sec.levelNumber));
        const chosen = value[sec._id] ?? [];
        return (
          <fieldset key={sec._id} className="field chips-field" style={{ marginBottom: 4 }}>
            <legend className="field__label">
              {sec.label} {chosen.length > 0 && <Badge tone="green">{chosen.length} subject(s)</Badge>}
            </legend>
            <div className="chips">
              {applicable.map((sub) => (
                <label key={sub._id} className={`chip ${chosen.includes(sub._id) ? 'chip--on' : ''}`}>
                  <input type="checkbox" checked={chosen.includes(sub._id)} onChange={() => toggle(sec._id, sub._id)} />
                  <span>{sub.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function TeacherForm({ schoolId, teacher, onClose, onCreated }: { schoolId: string; teacher?: Teacher; onClose: () => void; onCreated: (name: string, pw?: string) => void }) {
  const toast = useToast();
  const sections = useSections();
  const subjects = useSubjects();
  const [name, setName] = useState(teacher?.name ?? '');
  const [email, setEmail] = useState(teacher?.email ?? '');
  const [phone, setPhone] = useState(teacher?.phone ?? '');
  const [assign, setAssign] = useState<AssignmentMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutate(
    () =>
      teacher
        ? api.patch(`/schools/${schoolId}/teachers/${teacher.id}`, { name: name.trim(), phone: phone.trim() })
        : api.post<{ temporaryPassword?: string }>(`/schools/${schoolId}/teachers`, {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || undefined,
            assignments: toPayload(assign),
          }),
    { invalidate: [`/schools/${schoolId}`], toastError: false },
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v: Record<string, string> = {};
    if (name.trim().length < 2) v.name = 'Enter the teacher’s full name';
    if (!teacher && !EMAIL_RX.test(email.trim())) v.email = 'Enter a valid email address';
    if (phone.length > 30) v.phone = 'Phone number is too long';
    setErrors(v);
    if (Object.keys(v).length) return;
    try {
      const res = (await save.mutateAsync(undefined)) as { temporaryPassword?: string } | undefined;
      if (teacher) {
        toast.success('Teacher updated');
        onClose();
      } else {
        toast.success(res?.temporaryPassword ? 'Teacher added' : 'Existing teacher account added to your school');
        onCreated(name.trim(), res?.temporaryPassword);
      }
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      setFormError(errorMessage(err));
    }
  }
  return (
    <Modal
      open
      title={teacher ? `Edit ${teacher.name}` : 'Add teacher'}
      onClose={onClose}
      size={teacher ? 'sm' : 'lg'}
      busy={save.isPending}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" form="teacher-form" className="btn btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : teacher ? 'Save changes' : 'Add teacher'}
          </button>
        </>
      }
    >
      <form id="teacher-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormGrid cols={teacher ? 1 : 3}>
          <FormField label="Full name" error={errors.name} required>
            <input value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
          </FormField>
          {!teacher && (
            <FormField label="Email" error={errors.email} hint="Used to sign in to the mobile app." required>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
          )}
          <FormField label="Phone" error={errors.phone}>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
        </FormGrid>
        {!teacher && (
          <>
            <p className="form-section-title">Class & subject assignments (optional)</p>
            {sections.isLoading || subjects.isLoading ? (
              <Loading />
            ) : (
              <AssignmentEditor value={assign} onChange={setAssign} sections={sections.data ?? []} subjects={subjects.data ?? []} />
            )}
            <p className="field__hint" style={{ marginTop: 8 }}>
              A one-time temporary password is generated and shown after saving.
            </p>
          </>
        )}
      </form>
    </Modal>
  );
}

function AssignmentsDialog({ schoolId, teacher, onClose }: { schoolId: string; teacher: Teacher; onClose: () => void }) {
  const sections = useSections();
  const subjects = useSubjects();
  const [value, setValue] = useState<AssignmentMap>(() => fromTeacher(teacher));
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutate(() => api.put(`/schools/${schoolId}/teachers/${teacher.id}/assignments`, { assignments: toPayload(value) }), {
    invalidate: [`/schools/${schoolId}`],
    success: 'Assignments saved — the teacher has been notified',
    toastError: false,
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      title={`Assign classes & subjects — ${teacher.name}`}
      onClose={onClose}
      size="lg"
      busy={save.isPending}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={save.isPending}
            onClick={() => {
              setFormError(null);
              save.mutate(undefined, { onError: (e) => setFormError(errorMessage(e)) });
            }}
          >
            {save.isPending ? 'Saving…' : 'Save assignments'}
          </button>
        </>
      }
    >
      {formError && <InlineAlert>{formError}</InlineAlert>}
      <p className="muted">Select the subjects this teacher teaches in each section. Sections with no subjects selected are unassigned. Locked classes are not listed.</p>
      {sections.isLoading || subjects.isLoading ? (
        <Loading />
      ) : (
        <AssignmentEditor value={value} onChange={setValue} sections={sections.data ?? []} subjects={subjects.data ?? []} />
      )}
    </Modal>
  );
}

export default function TeachersPage() {
  const schoolId = useSchoolId();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useGet<Teacher[]>(`/schools/${schoolId}/teachers`, { q: search.trim() || undefined, status: status || undefined });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [assigning, setAssigning] = useState<Teacher | null>(null);
  const [toggling, setToggling] = useState<Teacher | null>(null);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const toggle = useMutate(
    (t: Teacher) => api.patch(`/schools/${schoolId}/teachers/${t.id}`, { status: t.membershipStatus === 'active' ? 'inactive' : 'active' }),
    { invalidate: [`/schools/${schoolId}`], success: 'Teacher status updated', onSuccess: () => setToggling(null) },
  );

  return (
    <>
      <PageHeader
        title="Teachers"
        subtitle={q.data ? `${q.data.length} teacher(s)` : undefined}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden /> Add teacher
          </button>
        }
      />
      <Toolbar>
        <FilterField label="Search">
          <span className="row" style={{ flexWrap: 'nowrap' }}>
            <Search size={16} aria-hidden className="muted" />
            <input type="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
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
        caption="Teachers"
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        fetching={q.isFetching}
        rowKey={(t) => t.id}
        emptyTitle={search || status ? 'No teachers match your filters' : 'No teachers yet'}
        emptyMessage={search || status ? 'Try a different search or status.' : 'Add your first teacher to start assigning classes.'}
        rowClassName={(t) => (t.membershipStatus === 'active' ? undefined : 'row--muted')}
        columns={[
          { key: 'name', header: 'Teacher', render: (t) => (<div><strong>{t.name}</strong><div className="muted small">{t.email}</div></div>) },
          { key: 'phone', header: 'Phone', render: (t) => t.phone || '—', hideSm: true },
          {
            key: 'assignments',
            header: 'Classes & subjects',
            render: (t) =>
              t.assignments.length ? (
                <div className="tag-list">
                  {t.assignments.map((a, i) => (
                    <Badge key={i} tone="green" title={a.subjects.map((s) => s.name).join(', ')}>
                      {sectionLabel(a.section).replace('Class ', '')}: {a.subjects.map((s) => s.code).join(', ')}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="muted">Not assigned</span>
              ),
          },
          { key: 'login', header: 'Last sign-in', render: (t) => dateTime(t.lastLoginAt), hideSm: true },
          { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.membershipStatus} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (t) => (
              <div className="actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAssigning(t)} disabled={t.membershipStatus !== 'active'}>
                  Assign
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(t)}>
                  Edit
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setToggling(t)}>
                  {t.membershipStatus === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ),
          },
        ]}
      />
      {adding && (
        <TeacherForm
          schoolId={schoolId}
          onClose={() => setAdding(false)}
          onCreated={(name, pw) => {
            setAdding(false);
            if (pw) setSecret({ name, value: pw });
          }}
        />
      )}
      {editing && <TeacherForm schoolId={schoolId} teacher={editing} onClose={() => setEditing(null)} onCreated={() => setEditing(null)} />}
      {assigning && <AssignmentsDialog schoolId={schoolId} teacher={assigning} onClose={() => setAssigning(null)} />}
      <ConfirmDialog
        open={Boolean(toggling)}
        title={toggling?.membershipStatus === 'active' ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        message={
          toggling?.membershipStatus === 'active'
            ? 'The teacher will lose access to this school’s classes in the mobile app. Their records are kept.'
            : 'The teacher will regain access to their assigned classes.'
        }
        confirmLabel={toggling?.membershipStatus === 'active' ? 'Deactivate' : 'Activate'}
        tone={toggling?.membershipStatus === 'active' ? 'danger' : 'primary'}
        busy={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling)}
        onCancel={() => setToggling(null)}
      />
      <SecretDialog secret={secret?.value} label="Temporary password" subject={secret?.name} onClose={() => setSecret(null)} />
    </>
  );
}
