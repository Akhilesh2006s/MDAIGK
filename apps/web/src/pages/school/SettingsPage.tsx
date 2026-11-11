import { useEffect, useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { ApiError, api, errorMessage } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { ClassAccessRow, ProgrammeEntitlement, School, Subscription } from '../../api/types';
import { useSchoolId } from '../../auth/AuthContext';
import { Card, KeyValue, PageHeader } from '../../components/Cards';
import { EMAIL_RX, FormField, FormGrid, Toggle } from '../../components/Form';
import { EmptyState, InlineAlert, QueryState } from '../../components/Feedback';
import { Badge, LockedBadge, PremiumBadge, StatusBadge } from '../../components/Badge';
import { classLevels, date } from '../../lib/format';

function ProfileForm({ school }: { school: School }) {
  const schoolId = school._id;
  const init = () => ({
    displayName: school.settings?.displayName ?? '',
    logoUrl: school.settings?.logoUrl ?? '',
    allowStudentLeaderboard: Boolean(school.settings?.allowStudentLeaderboard),
    address: school.address ?? '',
    contactName: school.contactPerson?.name ?? '',
    contactEmail: school.contactPerson?.email ?? '',
    contactPhone: school.contactPerson?.phone ?? '',
  });
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [school]); // eslint-disable-line react-hooks/exhaustive-deps
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutate(
    () =>
      api.patch(`/schools/${schoolId}/settings`, {
        address: f.address.trim(),
        contactPerson: { name: f.contactName.trim(), email: f.contactEmail.trim(), phone: f.contactPhone.trim() },
        settings: { displayName: f.displayName.trim(), logoUrl: f.logoUrl.trim(), allowStudentLeaderboard: f.allowStudentLeaderboard },
      }),
    { invalidate: [`/schools/${schoolId}`], success: 'School settings saved', toastError: false },
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v: Record<string, string> = {};
    if (f.contactEmail.trim() && !EMAIL_RX.test(f.contactEmail.trim())) v['contactPerson.email'] = 'Enter a valid email address';
    if (f.logoUrl.trim() && !/^https?:\/\/\S+$/.test(f.logoUrl.trim())) v['settings.logoUrl'] = 'Enter a full URL starting with http:// or https://';
    if (f.address.length > 500) v.address = 'Address is too long (max 500 characters)';
    if (f.displayName.length > 200) v['settings.displayName'] = 'Display name is too long';
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
    <Card title="School profile & preferences" subtitle="Name, code, status and timezone are managed by the platform owner.">
      <form onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormGrid>
          <FormField label="Display name" error={errors['settings.displayName']} hint={`Shown in the apps instead of “${school.name}” (optional).`}>
            <input value={f.displayName} onChange={set('displayName')} />
          </FormField>
          <FormField label="Logo URL" error={errors['settings.logoUrl']}>
            <input type="url" value={f.logoUrl} placeholder="https://…" onChange={set('logoUrl')} />
          </FormField>
          <FormField label="Address" error={errors.address} className="span-all">
            <textarea value={f.address} rows={2} onChange={set('address')} />
          </FormField>
        </FormGrid>
        <p className="form-section-title">Contact person</p>
        <FormGrid cols={3}>
          <FormField label="Name" error={errors['contactPerson.name']}>
            <input value={f.contactName} onChange={set('contactName')} />
          </FormField>
          <FormField label="Email" error={errors['contactPerson.email']}>
            <input type="email" value={f.contactEmail} onChange={set('contactEmail')} />
          </FormField>
          <FormField label="Phone" error={errors['contactPerson.phone']}>
            <input type="tel" value={f.contactPhone} onChange={set('contactPhone')} />
          </FormField>
        </FormGrid>
        <p className="form-section-title">Preferences</p>
        <Toggle checked={f.allowStudentLeaderboard} onChange={(v) => setF((x) => ({ ...x, allowStudentLeaderboard: v }))} label="Show a class leaderboard to students" />
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => (setF(init()), setErrors({}), setFormError(null))} disabled={save.isPending}>
            Discard changes
          </button>
          <button type="submit" className="btn btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function ProgrammeList({ items }: { items: ProgrammeEntitlement[] }) {
  return (
    <ul className="list-plain">
      {items.map((p) => (
        <li key={p.programmeId}>
          <span className="row">
            {p.name} {p.premium && <PremiumBadge />}
          </span>
          <span className="row nowrap">
            {p.effective.enabled ? (
              <Badge tone="green">Enabled</Badge>
            ) : (
              <LockedBadge label={p.enabled ? (p.effective.reason === 'EXPIRED' ? 'Expired' : 'Not yet valid') : 'Not enabled'} />
            )}
            {p.enabled && <span className="muted small">{p.validUntil ? `until ${date(p.validUntil)}` : 'no end date'}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function SchoolSettingsPage() {
  const schoolId = useSchoolId();
  const school = useGet<School>(`/schools/${schoolId}`);
  const sub = useGet<{ current: Subscription | null; history: Subscription[] }>(`/schools/${schoolId}/subscription`);
  const access = useGet<ClassAccessRow[]>(`/schools/${schoolId}/class-access`);
  const progs = useGet<ProgrammeEntitlement[]>(`/schools/${schoolId}/programme-entitlements`);

  return (
    <>
      <PageHeader title="Settings" subtitle="School profile and local preferences. Subscription and entitlements are read-only." />
      <div className="stack">
        <QueryState query={school} loadingLabel="Loading school profile…">
          {(s) => (
            <div className="grid-2-1">
              <ProfileForm school={s} />
              <Card title="School record" subtitle="Managed by the platform owner">
                <KeyValue
                  items={[
                    ['Name', s.name],
                    ['School code', <span className="mono">{s.schoolCode}</span>],
                    ['Status', <StatusBadge status={s.status} />],
                    ['City / region', [s.city, s.region].filter(Boolean).join(', ') || '—'],
                    ['Timezone', s.timezone ?? '—'],
                    ['Academic year', s.currentAcademicYear ?? '—'],
                  ]}
                />
              </Card>
            </div>
          )}
        </QueryState>

        <div className="grid-3">
          <Card title={<span className="row"><Lock size={14} aria-hidden /> Subscription</span>} subtitle="Read-only">
            <QueryState query={sub}>
              {(d) =>
                d.current ? (
                  <KeyValue
                    items={[
                      ['Plan', <strong>{d.current.planId?.name ?? '—'}</strong>],
                      ['Status', <StatusBadge status={d.current.status} />],
                      ['Valid from', date(d.current.startDate)],
                      ['Valid until', date(d.current.endDate)],
                      ['Includes classes', d.current.planId ? `1–${d.current.planId.maxClassLevel}` : '—'],
                    ]}
                  />
                ) : (
                  <EmptyState title="No subscription" message="Contact the platform owner to assign a plan." />
                )
              }
            </QueryState>
          </Card>
          <Card title={<span className="row"><Lock size={14} aria-hidden /> Class access</span>} subtitle="Read-only · granted by the platform owner">
            <QueryState query={access}>
              {(rows) => {
                const on = rows.filter((r) => r.enabled).map((r) => r.levelNumber);
                return (
                  <>
                    <p>
                      <strong>{on.length} of 10</strong> classes enabled{on.length ? ` (Classes ${classLevels(on)})` : ''}.
                    </p>
                    <div className="tag-list">
                      {rows.map((r) => (r.enabled ? <Badge key={r.levelNumber} tone="green">{r.displayName}</Badge> : <LockedBadge key={r.levelNumber} label={r.displayName} />))}
                    </div>
                  </>
                );
              }}
            </QueryState>
          </Card>
          <Card title={<span className="row"><Lock size={14} aria-hidden /> Programmes</span>} subtitle="Read-only · entitlements and validity">
            <QueryState query={progs}>
              {(rows) => (
                <div className="stack stack--sm">
                  <div className="premium-frame">
                    <p className="form-section-title" style={{ color: 'var(--gold-text)' }}>Premium academies</p>
                    <ProgrammeList items={rows.filter((p) => p.premium)} />
                  </div>
                  <div>
                    <p className="form-section-title">Other programmes</p>
                    <ProgrammeList items={rows.filter((p) => !p.premium)} />
                  </div>
                </div>
              )}
            </QueryState>
          </Card>
        </div>
      </div>
    </>
  );
}
