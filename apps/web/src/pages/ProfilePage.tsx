import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLES } from '@mango/shared';
import { ApiError, api, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, KeyValue, PageHeader } from '../components/Cards';
import { FormField } from '../components/Form';
import { InlineAlert } from '../components/Feedback';
import { useToast } from '../components/Toast';

export function ProfilePage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v: Record<string, string> = {};
    if (!current) v.currentPassword = 'Enter your current password';
    if (next.length < 8) v.newPassword = 'Use at least 8 characters';
    else if (next === current) v.newPassword = 'Choose a password different from the current one';
    if (confirm !== next) v.confirm = 'Passwords do not match';
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      toast.success('Password changed. Please sign in again with your new password.');
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  return (
    <>
      <PageHeader title="Profile" subtitle="Your account details and password" />
      <div className="grid-2">
        <Card title="Account">
          <KeyValue
            items={[
              ['Name', user.name],
              ['Email', user.email ?? '—'],
              ['Role', user.role === ROLES.SUPER_ADMIN ? 'Super Admin (platform owner)' : 'School Admin'],
              ['Status', user.status],
              ['Schools', user.schools.length ? user.schools.map((s) => `${s.schoolName} (${s.schoolCode})`).join(', ') : '—'],
            ]}
          />
        </Card>
        <Card title="Change password" subtitle="Changing your password signs out your other sessions.">
          <form onSubmit={submit} noValidate>
            {formError && <InlineAlert>{formError}</InlineAlert>}
            <FormField label="Current password" error={errors.currentPassword} required>
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </FormField>
            <FormField label="New password" error={errors.newPassword} hint="At least 8 characters." required>
              <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </FormField>
            <FormField label="Confirm new password" error={errors.confirm} required>
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </FormField>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
