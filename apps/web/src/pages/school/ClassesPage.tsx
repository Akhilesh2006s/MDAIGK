import { useState, type FormEvent } from 'react';
import { Lock, Plus } from 'lucide-react';
import { ApiError, api, errorMessage } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { ClassAccessRow, Section } from '../../api/types';
import { useSchoolId } from '../../auth/AuthContext';
import { Card, PageHeader } from '../../components/Cards';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { FormField } from '../../components/Form';
import { EmptyState, ErrorState, InlineAlert, Loading } from '../../components/Feedback';
import { LockedBadge, StatusBadge } from '../../components/Badge';
import { useToast } from '../../components/Toast';
import { useSections } from './shared';
import './school.css';

const SECTION_RX = /^[A-Za-z0-9]{1,10}$/;

function SectionForm({ schoolId, levels, section, defaultLevel, onClose }: { schoolId: string; levels: number[]; section?: Section; defaultLevel?: number; onClose: () => void }) {
  const toast = useToast();
  const [level, setLevel] = useState<number>(section?.levelNumber ?? defaultLevel ?? levels[0] ?? 1);
  const [name, setName] = useState(section?.sectionName ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutate(
    () =>
      section
        ? api.patch(`/schools/${schoolId}/sections/${section._id}`, { sectionName: name.trim() })
        : api.post(`/schools/${schoolId}/sections`, { levelNumber: level, sectionName: name.trim() }),
    { invalidate: [`/schools/${schoolId}`], toastError: false },
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v: Record<string, string> = {};
    if (!SECTION_RX.test(name.trim())) v.sectionName = 'Use 1–10 letters or digits (e.g. A, B, Rose)';
    if (!section && !levels.includes(level)) v.levelNumber = 'This class is locked for your school';
    setErrors(v);
    if (Object.keys(v).length) return;
    try {
      await save.mutateAsync(undefined);
      toast.success(section ? 'Section renamed' : `Section Class ${level}-${name.trim().toUpperCase()} created`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      setFormError(err instanceof ApiError && err.code === 'CONFLICT' ? 'A section with this name already exists for this class.' : errorMessage(err));
    }
  }
  return (
    <Modal
      open
      title={section ? `Rename ${section.label}` : 'Create section'}
      onClose={onClose}
      size="sm"
      busy={save.isPending}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" form="section-form" className="btn btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : section ? 'Save' : 'Create section'}
          </button>
        </>
      }
    >
      <form id="section-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        {!section && (
          <FormField label="Class" error={errors.levelNumber} hint="Only classes granted to your school can have sections." required>
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {levels.map((n) => (
                <option key={n} value={n}>
                  Class {n}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField label="Section name" error={errors.sectionName} hint="Letters or digits, saved in upper case." required>
          <input value={name} maxLength={10} onChange={(e) => setName(e.target.value)} data-autofocus />
        </FormField>
      </form>
    </Modal>
  );
}

export default function ClassesPage() {
  const schoolId = useSchoolId();
  const access = useGet<ClassAccessRow[]>(`/schools/${schoolId}/class-access`);
  const sections = useSections();
  const [creating, setCreating] = useState<{ level?: number } | null>(null);
  const [renaming, setRenaming] = useState<Section | null>(null);
  const [toggling, setToggling] = useState<Section | null>(null);
  const toggle = useMutate((s: Section) => api.patch(`/schools/${schoolId}/sections/${s._id}`, { status: s.status === 'active' ? 'inactive' : 'active' }), {
    invalidate: [`/schools/${schoolId}`],
    success: 'Section updated',
    onSuccess: () => setToggling(null),
  });

  if (access.isLoading || sections.isLoading) return <Loading label="Loading classes…" />;
  if (access.isError || sections.isError || !access.data || !sections.data)
    return <ErrorState error={access.error ?? sections.error} onRetry={() => (access.refetch(), sections.refetch())} />;

  const enabled = access.data.filter((a) => a.enabled).map((a) => a.levelNumber);
  const academicYear = sections.data[0]?.academicYear;

  return (
    <>
      <PageHeader
        title="Classes & sections"
        subtitle={`${enabled.length} of 10 class levels granted to your school${academicYear ? ` · Academic year ${academicYear}` : ''}. Class access is managed by the platform owner.`}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setCreating({})} disabled={!enabled.length}>
            <Plus size={16} aria-hidden /> Create section
          </button>
        }
      />
      {!enabled.length && <InlineAlert tone="warning">No classes are granted to your school yet. Contact the platform owner to enable class access.</InlineAlert>}
      <div className="stack">
        {access.data.map((row) => {
          const list = sections.data.filter((s) => s.levelNumber === row.levelNumber);
          const students = list.reduce((s, x) => s + (x.status === 'active' ? x.studentCount : 0), 0);
          if (!row.enabled) {
            return (
              <Card
                key={row.levelNumber}
                className="card--locked"
                title={
                  <span className="row">
                    <Lock size={16} aria-hidden /> {row.displayName} <LockedBadge label="Locked — not in your plan" />
                  </span>
                }
              >
                <p className="muted" style={{ margin: 0 }}>
                  This class is not granted to your school. Sections cannot be created{list.length ? ` and ${list.length} existing section(s) are unavailable to students` : ''}.
                </p>
              </Card>
            );
          }
          return (
            <Card
              key={row.levelNumber}
              title={row.displayName}
              subtitle={`${list.filter((s) => s.status === 'active').length} active section(s) · ${students} active student(s)`}
              actions={
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setCreating({ level: row.levelNumber })}>
                  <Plus size={14} aria-hidden /> Add section
                </button>
              }
            >
              {list.length === 0 ? (
                <EmptyState title="No sections yet" message={`Create a section (e.g. ${row.levelNumber}-A) to add students to Class ${row.levelNumber}.`} />
              ) : (
                <div className="table-wrap">
                  <div className="table-scroll">
                    <table className="table">
                      <caption className="sr-only">Sections of {row.displayName}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Section</th>
                          <th scope="col">Students</th>
                          <th scope="col" className="hide-sm">Teachers & subjects</th>
                          <th scope="col">Status</th>
                          <th scope="col" style={{ textAlign: 'right' }}>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((s) => (
                          <tr key={s._id} className={s.status === 'active' ? undefined : 'row--muted'}>
                            <td>
                              <strong>{s.label}</strong>
                            </td>
                            <td>{s.studentCount}</td>
                            <td className="hide-sm">
                              {s.teachers.length ? (
                                <ul className="list-plain small">
                                  {s.teachers.map((t, i) => (
                                    <li key={i} style={{ padding: '2px 0', border: 0 }}>
                                      {t.teacher?.name ?? '—'}: <span className="muted">{t.subjects.map((x) => x.name).join(', ')}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="muted">No teachers assigned</span>
                              )}
                            </td>
                            <td>
                              <StatusBadge status={s.status} />
                            </td>
                            <td>
                              <div className="actions">
                                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRenaming(s)}>
                                  Rename
                                </button>
                                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setToggling(s)}>
                                  {s.status === 'active' ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {creating && <SectionForm schoolId={schoolId} levels={enabled} defaultLevel={creating.level} onClose={() => setCreating(null)} />}
      {renaming && <SectionForm schoolId={schoolId} levels={enabled} section={renaming} onClose={() => setRenaming(null)} />}
      <ConfirmDialog
        open={Boolean(toggling)}
        title={toggling?.status === 'active' ? `Deactivate ${toggling?.label}?` : `Activate ${toggling?.label}?`}
        message={
          toggling?.status === 'active'
            ? 'Students must be moved out of this section (or deactivated) first. Inactive sections cannot receive new students.'
            : 'The section will be available again for students and teacher assignments.'
        }
        confirmLabel={toggling?.status === 'active' ? 'Deactivate' : 'Activate'}
        tone={toggling?.status === 'active' ? 'danger' : 'primary'}
        busy={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling)}
        onCancel={() => setToggling(null)}
      />
    </>
  );
}
