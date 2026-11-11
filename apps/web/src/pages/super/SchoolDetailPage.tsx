import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Pencil, Power } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CLASS_LEVELS, PLAN_STATUS } from '@mango/shared';
import { ApiError, api, errorMessage } from '../../api/client';
import { useGet, useInvalidate, useMutate } from '../../api/hooks';
import type {
  ClassAccessRow,
  Paginated,
  Plan,
  ProgrammeEntitlement,
  School,
  SchoolAdminRow,
  SchoolOverview,
  Section,
  StudentRow,
  Subscription,
  Teacher,
} from '../../api/types';
import { Card, ChartCard, KeyValue, PageHeader, StatCard, StatGrid, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { EmptyState, ErrorState, InlineAlert, Loading, QueryState } from '../../components/Feedback';
import { EMAIL_RX, FormField, FormGrid, Toggle } from '../../components/Form';
import { ConfirmDialog, Modal, SecretDialog } from '../../components/Modal';
import { Badge, LockedBadge, PremiumBadge, StatusBadge } from '../../components/Badge';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { CHART, axisProps, pctTick, tooltipProps } from '../../components/charts';
import { classLevels, date, dateTime, isoDay, num, pct } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { SchoolFormModal } from './SchoolForm';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'classes', label: 'Class access' },
  { id: 'programmes', label: 'Programmes' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'admins', label: 'Admins' },
  { id: 'sections', label: 'Sections' },
  { id: 'teachers', label: 'Teachers' },
  { id: 'students', label: 'Students' },
  { id: 'performance', label: 'Performance' },
];

export default function SchoolDetailPage() {
  const { schoolId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'profile';
  const school = useGet<School>(`/schools/${schoolId}`);

  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <Link to="/super/schools">Schools</Link> / {school.data?.schoolCode ?? '…'}
          </>
        }
        title={school.data?.name ?? 'School'}
        subtitle={
          school.data ? (
            <span className="row">
              <StatusBadge status={school.data.status} />
              <span>{[school.data.city, school.data.region].filter(Boolean).join(', ') || 'No location'}</span>
              <span>· Classes {classLevels(school.data.enabledClasses)}</span>
              <span>· {school.data.plan ? `${school.data.plan.name} plan` : 'No plan'}</span>
            </span>
          ) : undefined
        }
      />
      {school.isLoading && <Loading />}
      {school.isError && <ErrorState error={school.error} onRetry={() => school.refetch()} title="Could not load this school" />}
      {school.data && (
        <Tabs tabs={TABS} active={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} label="School sections">
          {tab === 'profile' && <ProfileTab school={school.data} />}
          {tab === 'classes' && <ClassAccessTab schoolId={schoolId} />}
          {tab === 'programmes' && <ProgrammesTab schoolId={schoolId} />}
          {tab === 'subscription' && <SubscriptionTab schoolId={schoolId} />}
          {tab === 'admins' && <AdminsTab schoolId={schoolId} />}
          {tab === 'sections' && <SectionsTab schoolId={schoolId} />}
          {tab === 'teachers' && <TeachersTab schoolId={schoolId} />}
          {tab === 'students' && <StudentsTab schoolId={schoolId} />}
          {tab === 'performance' && <PerformanceTab schoolId={schoolId} />}
        </Tabs>
      )}
    </>
  );
}

// ------------------------------------------------------------------ profile
function ProfileTab({ school }: { school: School }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const next = school.status === 'active' ? 'inactive' : 'active';
  const toggle = useMutate(() => api.patch(`/schools/${school._id}`, { status: next }), {
    invalidate: ['/schools', '/analytics/platform'],
    success: next === 'active' ? 'School activated' : 'School deactivated',
    onSuccess: () => setConfirm(false),
  });
  return (
    <div className="grid-2">
      <Card
        title="School profile"
        actions={
          <>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditing(true)}>
              <Pencil size={14} aria-hidden /> Edit
            </button>
            <button type="button" className={`btn btn--sm ${school.status === 'active' ? 'btn--ghost' : 'btn--primary'}`} onClick={() => setConfirm(true)}>
              <Power size={14} aria-hidden /> {school.status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
          </>
        }
      >
        <KeyValue
          items={[
            ['School code', <span className="mono">{school.schoolCode}</span>],
            ['Name', school.name],
            ['Status', <StatusBadge status={school.status} />],
            ['Address', school.address || '—'],
            ['City / region', [school.city, school.region].filter(Boolean).join(', ') || '—'],
            ['Contact person', [school.contactPerson?.name, school.contactPerson?.email, school.contactPerson?.phone].filter(Boolean).join(' · ') || '—'],
            ['Timezone', school.timezone || '—'],
            ['Academic year', school.currentAcademicYear || '—'],
            ['Created', date(school.createdAt)],
          ]}
        />
      </Card>
      <Card title="At a glance" subtitle="Current counts">
        <StatGrid>
          <StatCard label="Students" value={num(school.studentCount)} hint="Active" />
          <StatCard label="Teachers" value={num(school.teacherCount)} hint="Active" />
          <StatCard label="Classes granted" value={num(school.enabledClasses.length)} hint={classLevels(school.enabledClasses)} tone="positive" />
        </StatGrid>
        <KeyValue
          items={[
            ['Plan', school.plan ? `${school.plan.name} (${school.plan.status})` : 'No plan assigned'],
            ['Plan validity', school.plan ? `${date(school.plan.startDate)} – ${date(school.plan.endDate)}` : '—'],
            ['Display name', school.settings?.displayName || '—'],
            ['Student leaderboard', school.settings?.allowStudentLeaderboard ? 'Allowed' : 'Off'],
          ]}
        />
      </Card>
      <SchoolFormModal open={editing} school={school} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={confirm}
        title={school.status === 'active' ? 'Deactivate school?' : 'Activate school?'}
        message={
          school.status === 'active'
            ? `Users of ${school.name} will no longer be able to use the platform until it is reactivated. Data is kept.`
            : `${school.name} will be able to use the platform again.`
        }
        confirmLabel={school.status === 'active' ? 'Deactivate' : 'Activate'}
        tone={school.status === 'active' ? 'danger' : 'primary'}
        busy={toggle.isPending}
        onConfirm={() => toggle.mutate(undefined)}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

// ------------------------------------------------------------------ class access
function ClassAccessTab({ schoolId }: { schoolId: string }) {
  const q = useGet<ClassAccessRow[]>(`/schools/${schoolId}/class-access`);
  const [levels, setLevels] = useState<number[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const current = useMemo(() => q.data?.filter((r) => r.enabled).map((r) => r.levelNumber) ?? [], [q.data]);
  useEffect(() => {
    if (q.data) setLevels(current);
  }, [q.data, current]);
  const save = useMutate(() => api.put(`/schools/${schoolId}/class-access`, { levels }), {
    invalidate: [`/schools`, '/analytics/platform'],
    success: 'Class access updated',
    onSuccess: () => setConfirm(false),
  });
  const removed = current.filter((n) => !levels?.includes(n));
  const dirty = levels !== null && (removed.length > 0 || levels.some((n) => !current.includes(n)));

  return (
    <Card
      title="Class access (Classes 1–10)"
      subtitle="Only granted classes can have sections, students and teacher assignments. Locked classes are hidden from students."
      actions={
        <>
          <button type="button" className="btn btn--ghost btn--sm" disabled={!dirty || save.isPending} onClick={() => setLevels(current)}>
            Reset
          </button>
          <button type="button" className="btn btn--primary btn--sm" disabled={!dirty || save.isPending} onClick={() => (removed.length ? setConfirm(true) : save.mutate(undefined))}>
            {save.isPending ? 'Saving…' : 'Save class access'}
          </button>
        </>
      }
    >
      <QueryState query={q}>
        {(rows) => (
          <div className="level-grid" role="group" aria-label="Granted classes">
            {CLASS_LEVELS.map((n) => {
              const on = levels?.includes(n) ?? false;
              const row = rows.find((r) => r.levelNumber === n);
              return (
                <div key={n} className={`level-tile ${on ? 'level-tile--on' : 'level-tile--locked'}`}>
                  <span className="level-tile__name">Class {n}</span>
                  <Toggle
                    checked={on}
                    label={on ? 'Granted' : 'Locked'}
                    onChange={(v) => setLevels((prev) => (v ? [...(prev ?? []), n].sort((a, b) => a - b) : (prev ?? []).filter((x) => x !== n)))}
                  />
                  <span className="muted small">{row?.enabled && row.grantedAt ? `Since ${date(row.grantedAt)}` : on ? 'Unsaved' : 'Not granted'}</span>
                </div>
              );
            })}
          </div>
        )}
      </QueryState>
      <ConfirmDialog
        open={confirm}
        title="Remove class access?"
        message={`Classes ${removed.join(', ')} will be locked. Students in those classes lose access to learning content until access is granted again.`}
        confirmLabel="Lock classes"
        tone="danger"
        busy={save.isPending}
        onConfirm={() => save.mutate(undefined)}
        onCancel={() => setConfirm(false)}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ programme entitlements
interface EntDraft {
  programmeId: string;
  enabled: boolean;
  validFrom: string;
  validUntil: string;
}

const REASONS: Record<string, string> = {
  NOT_ENABLED: 'Not enabled',
  NOT_STARTED: 'Starts later',
  EXPIRED: 'Expired',
};

function ProgrammesTab({ schoolId }: { schoolId: string }) {
  const q = useGet<ProgrammeEntitlement[]>(`/schools/${schoolId}/programme-entitlements`);
  const [draft, setDraft] = useState<Record<string, EntDraft>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) {
      setDraft(Object.fromEntries(q.data.map((p) => [p.programmeId, { programmeId: p.programmeId, enabled: p.enabled, validFrom: isoDay(p.validFrom), validUntil: isoDay(p.validUntil) }])));
    }
  }, [q.data]);
  const save = useMutate(
    () =>
      api.put(`/schools/${schoolId}/programme-entitlements`, {
        entitlements: Object.values(draft).map((d) => ({ programmeId: d.programmeId, enabled: d.enabled, validFrom: d.validFrom || null, validUntil: d.validUntil || null })),
      }),
    { invalidate: [`/schools/${schoolId}`, '/analytics/platform'], success: 'Programme entitlements saved', toastError: false, onSuccess: () => setError(null) },
  );

  function submit() {
    const bad = Object.values(draft).find((d) => d.validFrom && d.validUntil && d.validFrom > d.validUntil);
    if (bad) {
      setError('“Valid from” must be on or before “Valid until” for every programme.');
      return;
    }
    setError(null);
    save.mutate(undefined, { onError: (e) => setError(errorMessage(e)) });
  }

  const row = (p: ProgrammeEntitlement) => {
    const d = draft[p.programmeId];
    if (!d) return null;
    const upd = (patch: Partial<EntDraft>) => setDraft((all) => ({ ...all, [p.programmeId]: { ...d, ...patch } }));
    const invalid = Boolean(d.validFrom && d.validUntil && d.validFrom > d.validUntil);
    return (
      <div key={p.programmeId} className="programme-row">
        <div>
          <strong>{p.name}</strong> {p.premium && <PremiumBadge />}
          <div className="muted small">
            Currently:{' '}
            {p.effective.enabled ? <Badge tone="green">Active</Badge> : <Badge tone="grey">{REASONS[p.effective.reason ?? ''] ?? p.effective.reason ?? 'Inactive'}</Badge>}
          </div>
        </div>
        <Toggle checked={d.enabled} onChange={(v) => upd({ enabled: v })} label={d.enabled ? 'Enabled' : 'Disabled'} />
        <FormField label="Valid from">
          <input type="date" value={d.validFrom} onChange={(e) => upd({ validFrom: e.target.value })} />
        </FormField>
        <FormField label="Valid until" error={invalid ? 'Must be after start' : undefined}>
          <input type="date" value={d.validUntil} min={d.validFrom || undefined} onChange={(e) => upd({ validUntil: e.target.value })} />
        </FormField>
        <span className="muted small">{d.validFrom || d.validUntil ? '' : 'No limit'}</span>
      </div>
    );
  };

  return (
    <Card
      title="Programme entitlements"
      subtitle="Enable programmes for this school with optional validity dates. Leave dates empty for no limit."
      actions={
        <button type="button" className="btn btn--primary btn--sm" onClick={submit} disabled={save.isPending || !q.data}>
          {save.isPending ? 'Saving…' : 'Save entitlements'}
        </button>
      }
    >
      {error && <InlineAlert>{error}</InlineAlert>}
      <QueryState query={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No programmes defined" message="Create programmes under Content → Programmes first." />
          ) : (
            <div className="stack">
              <div>
                <p className="form-section-title">Premium academies</p>
                <div className="premium-frame">{rows.filter((p) => p.premium).map(row)}</div>
              </div>
              <div>
                <p className="form-section-title">Other programmes</p>
                <div>{rows.filter((p) => !p.premium).map(row)}</div>
                {rows.every((p) => p.premium) && <p className="muted">None.</p>}
              </div>
            </div>
          )
        }
      </QueryState>
    </Card>
  );
}

// ------------------------------------------------------------------ subscription
function SubscriptionTab({ schoolId }: { schoolId: string }) {
  const sub = useGet<{ current: Subscription | null; history: Subscription[] }>(`/schools/${schoolId}/subscription`);
  const plans = useGet<Plan[]>('/plans');
  const today = new Date();
  const inAYear = new Date(today.getTime() + 365 * 86400000);
  const [form, setForm] = useState({ planId: '', startDate: isoDay(today), endDate: isoDay(inAYear), status: 'active', applyEntitlements: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutate(
    () =>
      api.put(`/schools/${schoolId}/subscription`, {
        ...form,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
      }),
    {
      invalidate: [`/schools`, '/analytics/platform', '/plans'],
      success: form.applyEntitlements ? 'Plan assigned and entitlements applied' : 'Plan assigned',
      toastError: false,
    },
  );
  const selected = plans.data?.find((p) => p._id === form.planId);

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v: Record<string, string> = {};
    if (!form.planId) v.planId = 'Choose a plan';
    if (!form.startDate) v.startDate = 'Start date is required';
    if (!form.endDate) v.endDate = 'End date is required';
    else if (form.startDate && form.endDate <= form.startDate) v.endDate = 'End date must be after the start date';
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
    <div className="grid-2">
      <Card title="Current subscription">
        <QueryState query={sub}>
          {(d) =>
            d.current ? (
              <KeyValue
                items={[
                  ['Plan', d.current.planId?.name === 'Premium' ? <PremiumBadge label="Premium" /> : (d.current.planId?.name ?? '—')],
                  ['Status', <StatusBadge status={d.current.status} />],
                  ['Valid', `${date(d.current.startDate)} – ${date(d.current.endDate)}`],
                  ['Max class level', d.current.planId ? `Class ${d.current.planId.maxClassLevel}` : '—'],
                  ['Programmes', d.current.planId?.programmeCodes.join(', ') || '—'],
                ]}
              />
            ) : (
              <EmptyState title="No subscription" message="Assign a plan using the form." />
            )
          }
        </QueryState>
        {sub.data && sub.data.history.length > 1 && (
          <>
            <p className="form-section-title" style={{ marginTop: 16 }}>
              History
            </p>
            <DataTable
              rows={sub.data.history}
              rowKey={(s) => s._id}
              columns={[
                { key: 'plan', header: 'Plan', render: (s) => s.planId?.name ?? '—' },
                { key: 'period', header: 'Period', render: (s) => `${date(s.startDate)} – ${date(s.endDate)}` },
                { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
                { key: 'created', header: 'Assigned', render: (s) => date(s.createdAt), hideSm: true },
              ]}
            />
          </>
        )}
      </Card>
      <Card title="Assign plan" subtitle="Assigning a plan expires the current active subscription.">
        {plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
        ) : (
          <form onSubmit={submit} noValidate>
            {formError && <InlineAlert>{formError}</InlineAlert>}
            <FormField label="Plan" error={errors.planId} required>
              <select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} disabled={plans.isLoading}>
                <option value="">{plans.isLoading ? 'Loading plans…' : 'Select a plan'}</option>
                {plans.data
                  ?.filter((p) => p.status !== 'archived')
                  .map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} — Classes 1–{p.maxClassLevel}
                      {p.status !== 'active' ? ` (${p.status})` : ''}
                    </option>
                  ))}
              </select>
            </FormField>
            {selected && (
              <p className="muted small">
                Includes Classes 1–{selected.maxClassLevel}; programmes: {selected.programmeCodes.join(', ') || 'none'}.
              </p>
            )}
            <FormGrid>
              <FormField label="Start date" error={errors.startDate} required>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </FormField>
              <FormField label="End date" error={errors.endDate} required>
                <input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </FormField>
            </FormGrid>
            <FormField label="Status" error={errors.status}>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {PLAN_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>
            <Toggle
              checked={form.applyEntitlements}
              onChange={(v) => setForm({ ...form, applyEntitlements: v })}
              label="Apply plan entitlements (replace class access and programme entitlements with the plan's)"
            />
            {form.applyEntitlements && form.status !== 'active' && <p className="muted small">Entitlements are only applied when the status is Active.</p>}
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={save.isPending}>
                {save.isPending ? 'Assigning…' : 'Assign plan'}
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ admins
function AdminsTab({ schoolId }: { schoolId: string }) {
  const q = useGet<SchoolAdminRow[]>(`/schools/${schoolId}/admins`);
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<{ value: string; who: string } | null>(null);
  const [toggle, setToggle] = useState<SchoolAdminRow | null>(null);
  const setStatus = useMutate(
    (r: SchoolAdminRow) => api.patch(`/schools/${schoolId}/admins/${r.user!._id}`, { status: r.status === 'active' ? 'inactive' : 'active' }),
    { invalidate: [`/schools/${schoolId}/admins`], success: 'Admin access updated', onSuccess: () => setToggle(null) },
  );
  return (
    <Card
      title="School administrators"
      actions={
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen(true)}>
          Assign admin
        </button>
      }
    >
      <DataTable
        caption="School administrators"
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(r) => r.membershipId}
        emptyTitle="No school admins"
        emptyMessage="Assign an administrator so the school can manage its classes, teachers and students."
        columns={[
          { key: 'name', header: 'Name', render: (r) => <strong>{r.user?.name ?? '—'}</strong> },
          { key: 'email', header: 'Email', render: (r) => r.user?.email ?? '—' },
          { key: 'phone', header: 'Phone', render: (r) => r.user?.phone || '—', hideSm: true },
          { key: 'login', header: 'Last sign-in', render: (r) => dateTime(r.user?.lastLoginAt), hideSm: true },
          { key: 'status', header: 'Membership', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (r) =>
              r.user ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setToggle(r)}>
                  {r.status === 'active' ? 'Remove access' : 'Restore access'}
                </button>
              ) : null,
          },
        ]}
      />
      <AssignAdminModal open={open} schoolId={schoolId} onClose={() => setOpen(false)} onSecret={(value, who) => setSecret({ value, who })} />
      <SecretDialog secret={secret?.value} label="Temporary password" subject={secret?.who} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={Boolean(toggle)}
        title={toggle?.status === 'active' ? 'Remove admin access?' : 'Restore admin access?'}
        message={`${toggle?.user?.name ?? 'This user'} will ${toggle?.status === 'active' ? 'no longer' : 'again'} be able to administer this school.`}
        tone={toggle?.status === 'active' ? 'danger' : 'primary'}
        confirmLabel={toggle?.status === 'active' ? 'Remove access' : 'Restore access'}
        busy={setStatus.isPending}
        onConfirm={() => toggle && setStatus.mutate(toggle)}
        onCancel={() => setToggle(null)}
      />
    </Card>
  );
}

function AssignAdminModal({ open, schoolId, onClose, onSecret }: { open: boolean; schoolId: string; onClose: () => void; onSecret: (s: string, who: string) => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();
  useEffect(() => {
    if (open) {
      setF({ name: '', email: '', phone: '' });
      setErrors({});
      setFormError(null);
    }
  }, [open]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (f.name.trim().length < 2) v.name = 'Name is required';
    if (!EMAIL_RX.test(f.email.trim())) v.email = 'Enter a valid email';
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const res = await api.post<{ user: { name: string; email: string }; temporaryPassword?: string }>(`/schools/${schoolId}/admins`, {
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone || undefined,
      });
      await invalidate(`/schools/${schoolId}/admins`);
      toast.success(res.temporaryPassword ? `Admin account created for ${res.user.email}` : `${res.user.email} assigned as school admin`);
      onClose();
      if (res.temporaryPassword) onSecret(res.temporaryPassword, `${res.user.name} (${res.user.email})`);
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
      title="Assign school admin"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="admin-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Assigning…' : 'Assign admin'}
          </button>
        </>
      }
    >
      <form id="admin-form" onSubmit={submit} noValidate>
        <p className="muted">If the email belongs to an existing School Admin, they are added to this school. Otherwise a new account is created with a one-time temporary password.</p>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormField label="Full name" error={errors.name} required>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </FormField>
        <FormGrid>
          <FormField label="Email" error={errors.email} required>
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </FormField>
          <FormField label="Phone" error={errors.phone}>
            <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </FormField>
        </FormGrid>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ read views
function SectionsTab({ schoolId }: { schoolId: string }) {
  const q = useGet<Section[]>(`/schools/${schoolId}/sections`);
  return (
    <Card title="Class sections" subtitle="Current academic year · read-only (the school admin manages sections)">
      <DataTable
        caption="Class sections"
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(s) => s._id}
        rowClassName={(s) => (s.locked ? 'row--locked' : s.status !== 'active' ? 'row--muted' : undefined)}
        emptyTitle="No sections yet"
        columns={[
          { key: 'label', header: 'Section', render: (s) => <strong>{s.label}</strong> },
          { key: 'year', header: 'Year', render: (s) => s.academicYear, hideSm: true },
          { key: 'students', header: 'Students', align: 'right', render: (s) => num(s.studentCount) },
          {
            key: 'teachers',
            header: 'Teachers & subjects',
            render: (s) =>
              s.teachers.length ? (
                <div className="tag-list">
                  {s.teachers.map((t, i) => (
                    <Badge key={i} tone="outline">
                      {t.teacher?.name ?? '—'}: {t.subjects.map((x) => x.code).join(', ')}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="muted">Unassigned</span>
              ),
          },
          { key: 'status', header: 'Status', render: (s) => (s.locked ? <LockedBadge label="Class locked" /> : <StatusBadge status={s.status} />) },
        ]}
      />
    </Card>
  );
}

function TeachersTab({ schoolId }: { schoolId: string }) {
  const [search, setSearch] = useState('');
  const qd = useDebounced(search.trim());
  const q = useGet<Teacher[]>(`/schools/${schoolId}/teachers`, { q: qd });
  return (
    <Card title="Teachers" subtitle="Read-only view">
      <Toolbar>
        <div className="field toolbar__grow">
          <label className="field__label" htmlFor="t-q">
            Search
          </label>
          <input id="t-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" />
        </div>
      </Toolbar>
      <DataTable
        caption="Teachers"
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        fetching={q.isFetching}
        rowKey={(t) => t.id}
        emptyTitle={qd ? 'No teachers match' : 'No teachers yet'}
        columns={[
          { key: 'name', header: 'Name', render: (t) => <strong>{t.name}</strong> },
          { key: 'email', header: 'Email', render: (t) => t.email ?? '—' },
          {
            key: 'assign',
            header: 'Assignments',
            render: (t) =>
              t.assignments.length ? (
                <div className="tag-list">
                  {t.assignments.map((a, i) => (
                    <Badge key={i} tone="outline">
                      {a.section ? `${a.section.levelNumber}-${a.section.sectionName}` : '—'}: {a.subjects.map((s) => s.code).join(', ')}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="muted">None</span>
              ),
          },
          { key: 'login', header: 'Last sign-in', render: (t) => dateTime(t.lastLoginAt), hideSm: true },
          { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.membershipStatus} /> },
        ]}
      />
    </Card>
  );
}

function StudentsTab({ schoolId }: { schoolId: string }) {
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const qd = useDebounced(search.trim());
  useEffect(() => setPage(1), [qd, level]);
  const q = useGet<Paginated<StudentRow>>(`/schools/${schoolId}/students`, { q: qd, levelNumber: level, page, pageSize: 20 });
  return (
    <Card title="Students" subtitle="Read-only view · average performance is across all scored attempts (all time)">
      <Toolbar>
        <div className="field toolbar__grow">
          <label className="field__label" htmlFor="s-q">
            Search
          </label>
          <input id="s-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or student ID" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="s-level">
            Class
          </label>
          <select id="s-level" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">All classes</option>
            {CLASS_LEVELS.map((n) => (
              <option key={n} value={n}>
                Class {n}
              </option>
            ))}
          </select>
        </div>
      </Toolbar>
      <DataTable
        caption="Students"
        rows={q.data?.items}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        fetching={q.isFetching}
        rowKey={(s) => s.id}
        emptyTitle="No students found"
        columns={[
          { key: 'code', header: 'Student ID', render: (s) => <span className="mono">{s.studentCode}</span> },
          { key: 'name', header: 'Name', render: (s) => <strong>{s.name}</strong> },
          { key: 'class', header: 'Class', render: (s) => (s.section ? `${s.section.levelNumber}-${s.section.sectionName}` : `Class ${s.levelNumber}`) },
          { key: 'perf', header: 'Avg performance', align: 'right', render: (s) => (s.attempts ? `${pct(s.averagePercent)} (n=${s.attempts})` : '—') },
          { key: 'login', header: 'Last sign-in', render: (s) => dateTime(s.lastLoginAt), hideSm: true },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
        ]}
        pagination={q.data ? { page: q.data.page, totalPages: q.data.totalPages, total: q.data.total, pageSize: q.data.pageSize, onPage: setPage } : undefined}
      />
    </Card>
  );
}

function PerformanceTab({ schoolId }: { schoolId: string }) {
  const q = useGet<SchoolOverview>(`/schools/${schoolId}/overview`);
  return (
    <QueryState query={q}>
      {(d) => (
        <div className="stack">
          <p className="period-banner">Period: {d.period.label}</p>
          <StatGrid>
            <StatCard label="Students" value={num(d.counts.students)} hint="Active" />
            <StatCard label="Teachers" value={num(d.counts.teachers)} hint="Active" />
            <StatCard label="Active sections" value={num(d.counts.activeSections)} hint="Current academic year" />
            <StatCard label="Enabled classes" value={classLevels(d.counts.enabledClasses)} hint={`${d.counts.enabledClasses.length} of 10`} />
            <StatCard
              label="Avg performance"
              value={pct(d.performance.averagePercent)}
              hint={d.performance.sampleSize ? `${d.period.label} · n = ${num(d.performance.sampleSize)}` : 'No scored attempts'}
              tone="positive"
            />
            <StatCard label="Certificates" value={num(d.counts.certificatesIssued)} hint={d.period.label} tone="gold" />
            <StatCard
              label="Activity completion"
              value={pct(d.activityCompletion.ratePercent)}
              hint={d.activityCompletion.expected ? `${num(d.activityCompletion.completed)} of ${num(d.activityCompletion.expected)} assigned` : 'No activities assigned'}
            />
            <StatCard label="Game completion" value={pct(d.games.completionPercent)} hint={`${num(d.games.attempts)} attempts · ${d.period.label}`} />
          </StatGrid>
          <div className="grid-2">
            <ChartCard title="Class-wise performance" period={`${d.period.label} · average attempt score`} empty={d.classes.every((c) => c.averagePercent === null)}>
              <ResponsiveContainer>
                <BarChart data={d.classes} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} tickFormatter={(v: string) => v.replace('Class ', '')} />
                  <YAxis domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
                  <Tooltip {...tooltipProps} formatter={(v: number, _n, item) => [`${v ?? '—'}% (n=${(item.payload as { sampleSize: number }).sampleSize})`, 'Average']} />
                  <Bar dataKey="averagePercent" fill={CHART.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Subject-wise performance" period={`${d.period.label} · average attempt score`} empty={d.subjects.every((s) => s.averagePercent === null)}>
              <ResponsiveContainer>
                <BarChart data={d.subjects} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="code" {...axisProps} />
                  <YAxis domain={[0, 100]} tickFormatter={pctTick} {...axisProps} />
                  <Tooltip {...tooltipProps} formatter={(v: number, _n, item) => [`${v ?? '—'}% (n=${(item.payload as { sampleSize: number }).sampleSize})`, 'Average']} />
                  <Bar dataKey="averagePercent" fill={CHART.gold} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <Card title="Programme participation" subtitle="All time">
            <DataTable
              rows={d.programmes}
              rowKey={(p) => p.programmeId}
              columns={[
                { key: 'name', header: 'Programme', render: (p) => (<span className="row"><strong>{p.name}</strong>{p.premium && <PremiumBadge />}</span>) },
                { key: 'enrolled', header: 'Enrolled', align: 'right', render: (p) => num(p.enrolled) },
                { key: 'completed', header: 'Completed', align: 'right', render: (p) => num(p.completed) },
                { key: 'progress', header: 'Avg progress', align: 'right', render: (p) => pct(p.averageProgressPercent) },
              ]}
            />
          </Card>
        </div>
      )}
    </QueryState>
  );
}
