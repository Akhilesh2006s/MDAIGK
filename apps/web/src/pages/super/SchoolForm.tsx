import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, errorMessage } from '../../api/client';
import { useInvalidate } from '../../api/hooks';
import type { School } from '../../api/types';
import { ClassLevelPicker, EMAIL_RX, FormField, FormGrid } from '../../components/Form';
import { InlineAlert } from '../../components/Feedback';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';

interface FormState {
  schoolCode: string;
  name: string;
  address: string;
  city: string;
  region: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  timezone: string;
  currentAcademicYear: string;
  status: 'active' | 'inactive';
  classLevels: number[];
}

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Kathmandu', 'Asia/Dhaka', 'Europe/London', 'UTC'];

function initial(s?: School | null): FormState {
  return {
    schoolCode: s?.schoolCode ?? '',
    name: s?.name ?? '',
    address: s?.address ?? '',
    city: s?.city ?? '',
    region: s?.region ?? '',
    contactName: s?.contactPerson?.name ?? '',
    contactEmail: s?.contactPerson?.email ?? '',
    contactPhone: s?.contactPerson?.phone ?? '',
    timezone: s?.timezone ?? 'Asia/Kolkata',
    currentAcademicYear: s?.currentAcademicYear ?? '2026-27',
    status: s?.status ?? 'active',
    classLevels: [],
  };
}

export function validateSchool(f: FormState, isNew: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (isNew || f.schoolCode) {
    if (!f.schoolCode.trim()) e.schoolCode = 'School code is required';
    else if (!/^[A-Za-z0-9-]{2,20}$/.test(f.schoolCode.trim())) e.schoolCode = '2–20 letters, digits or dashes';
  }
  if (f.name.trim().length < 2) e.name = 'School name is required';
  if (f.contactEmail && !EMAIL_RX.test(f.contactEmail)) e['contactPerson.email'] = 'Enter a valid email';
  if (f.currentAcademicYear && !/^\d{4}-\d{2}$/.test(f.currentAcademicYear)) e.currentAcademicYear = 'Use the format 2026-27';
  return e;
}

/** Add / edit school (Super Admin). */
export function SchoolFormModal({ open, school, onClose, onSaved }: { open: boolean; school?: School | null; onClose: () => void; onSaved?: (s: School) => void }) {
  const isNew = !school;
  const [f, setF] = useState<FormState>(() => initial(school));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setF(initial(school));
      setErrors({});
      setFormError(null);
    }
  }, [open, school]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validateSchool(f, isNew);
    setErrors(v);
    if (Object.keys(v).length) return;
    const body: Record<string, unknown> = {
      schoolCode: f.schoolCode.trim().toUpperCase(),
      name: f.name.trim(),
      address: f.address,
      city: f.city,
      region: f.region,
      contactPerson: { name: f.contactName, email: f.contactEmail, phone: f.contactPhone },
      timezone: f.timezone,
      currentAcademicYear: f.currentAcademicYear || undefined,
      status: f.status,
    };
    if (isNew) body.classLevels = f.classLevels;
    setBusy(true);
    try {
      const saved = isNew ? await api.post<School>('/schools', body) : await api.patch<School>(`/schools/${school!._id}`, body);
      await invalidate('/schools', '/analytics/platform');
      toast.success(isNew ? `School "${saved.name}" created` : 'School profile saved');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      setFormError(err instanceof ApiError && err.code === 'CONFLICT' ? 'A school with this code already exists.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={isNew ? 'Add school' : `Edit ${school?.name}`}
      onClose={onClose}
      size="lg"
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="school-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create school' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="school-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <p className="form-section-title">School</p>
        <FormGrid cols={3}>
          <FormField label="School code" error={errors.schoolCode} hint="Used by students to sign in, e.g. GVS001" required>
            <input value={f.schoolCode} onChange={(e) => set('schoolCode', e.target.value.toUpperCase())} maxLength={20} />
          </FormField>
          <FormField label="School name" error={errors.name} required className="span-2">
            <input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
          </FormField>
          <FormField label="Status" error={errors.status}>
            <select value={f.status} onChange={(e) => set('status', e.target.value as FormState['status'])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormField>
          <FormField label="Timezone" error={errors.timezone}>
            <select value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {[...new Set([f.timezone, ...TIMEZONES])].map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Academic year" error={errors.currentAcademicYear} hint="Format 2026-27">
            <input value={f.currentAcademicYear} onChange={(e) => set('currentAcademicYear', e.target.value)} placeholder="2026-27" />
          </FormField>
        </FormGrid>
        <p className="form-section-title">Location</p>
        <FormGrid cols={3}>
          <FormField label="Address" error={errors.address}>
            <input value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={500} />
          </FormField>
          <FormField label="City" error={errors.city}>
            <input value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={100} />
          </FormField>
          <FormField label="Region / State" error={errors.region}>
            <input value={f.region} onChange={(e) => set('region', e.target.value)} maxLength={100} />
          </FormField>
        </FormGrid>
        <p className="form-section-title">Contact person</p>
        <FormGrid cols={3}>
          <FormField label="Name" error={errors['contactPerson.name']}>
            <input value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
          </FormField>
          <FormField label="Email" error={errors['contactPerson.email']}>
            <input type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
          </FormField>
          <FormField label="Phone" error={errors['contactPerson.phone']}>
            <input type="tel" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} maxLength={30} />
          </FormField>
        </FormGrid>
        {isNew && (
          <>
            <p className="form-section-title">Initial class access</p>
            <ClassLevelPicker label="Granted classes (can be changed later or applied from a plan)" value={f.classLevels} onChange={(v) => set('classLevels', v)} />
          </>
        )}
      </form>
    </Modal>
  );
}
