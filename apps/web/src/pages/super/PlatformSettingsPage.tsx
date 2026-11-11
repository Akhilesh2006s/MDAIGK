import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, errorMessage } from '../../api/client';
import { useGet, useInvalidate } from '../../api/hooks';
import type { PlatformSettings } from '../../api/types';
import { Card, PageHeader } from '../../components/Cards';
import { InlineAlert, QueryState } from '../../components/Feedback';
import { EMAIL_RX, FormField, FormGrid, Toggle } from '../../components/Form';
import { useToast } from '../../components/Toast';
import { dateTime } from '../../lib/format';

export default function PlatformSettingsPage() {
  const q = useGet<PlatformSettings>('/settings');
  return (
    <>
      <PageHeader title="Platform settings" subtitle={q.data?.updatedAt ? `Last updated ${dateTime(q.data.updatedAt)}` : undefined} />
      <QueryState query={q}>{(s) => <SettingsForm settings={s} />}</QueryState>
    </>
  );
}

function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const [f, setF] = useState({
    platformName: settings.platformName ?? '',
    supportEmail: settings.supportEmail ?? '',
    defaultTimezone: settings.defaultTimezone ?? 'Asia/Kolkata',
    defaultAcademicYear: settings.defaultAcademicYear ?? '',
    studentPinMinLength: settings.studentPinMinLength ?? 4,
    maintenanceMode: settings.maintenanceMode ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();
  useEffect(() => setErrors({}), [settings]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (f.platformName.length > 60) v.platformName = 'Max 60 characters';
    if (f.supportEmail && !EMAIL_RX.test(f.supportEmail)) v.supportEmail = 'Enter a valid email';
    if (f.defaultAcademicYear && !/^\d{4}-\d{2}$/.test(f.defaultAcademicYear)) v.defaultAcademicYear = 'Use the format 2026-27';
    if (f.studentPinMinLength < 4 || f.studentPinMinLength > 8) v.studentPinMinLength = 'Between 4 and 8';
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...f };
      if (!f.supportEmail) delete body.supportEmail;
      if (!f.defaultAcademicYear) delete body.defaultAcademicYear;
      await api.patch('/settings', body);
      await invalidate('/settings');
      toast.success('Platform settings saved');
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="General">
      <form onSubmit={submit} noValidate style={{ maxWidth: 760 }}>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormGrid>
          <FormField label="Platform name" error={errors.platformName}>
            <input value={f.platformName} onChange={(e) => setF({ ...f, platformName: e.target.value })} maxLength={60} />
          </FormField>
          <FormField label="Support email" error={errors.supportEmail}>
            <input type="email" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} />
          </FormField>
          <FormField label="Default timezone" error={errors.defaultTimezone} hint="Used for new schools">
            <input value={f.defaultTimezone} onChange={(e) => setF({ ...f, defaultTimezone: e.target.value })} />
          </FormField>
          <FormField label="Default academic year" error={errors.defaultAcademicYear} hint="Format 2026-27">
            <input value={f.defaultAcademicYear} onChange={(e) => setF({ ...f, defaultAcademicYear: e.target.value })} />
          </FormField>
          <FormField label="Student PIN minimum length" error={errors.studentPinMinLength}>
            <input type="number" min={4} max={8} value={f.studentPinMinLength} onChange={(e) => setF({ ...f, studentPinMinLength: Number(e.target.value) })} />
          </FormField>
        </FormGrid>
        <Toggle checked={f.maintenanceMode} onChange={(v) => setF({ ...f, maintenanceMode: v })} label="Maintenance mode" />
        {f.maintenanceMode && (
          <InlineAlert tone="warning">
            Maintenance mode is stored as a platform flag; check with the API team which clients enforce it.
          </InlineAlert>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </Card>
  );
}
