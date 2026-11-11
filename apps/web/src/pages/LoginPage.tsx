import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ERROR_CODES } from '@mango/shared';
import { ApiError, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../auth/guards';
import { FormField, EMAIL_RX } from '../components/Form';
import { InlineAlert } from '../components/Feedback';

export function validateLogin(email: string, password: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!email.trim()) errors.email = 'Enter your email address';
  else if (!EMAIL_RX.test(email.trim())) errors.email = 'Enter a valid email address';
  if (!password) errors.password = 'Enter your password';
  return errors;
}

export function validateStudentLogin(schoolCode: string, studentCode: string, pin: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!schoolCode.trim()) errors.schoolCode = 'Enter your school code';
  else if (schoolCode.trim().length < 2) errors.schoolCode = 'School code is too short';
  if (!studentCode.trim()) errors.studentCode = 'Enter your student ID';
  if (!pin) errors.pin = 'Enter your PIN';
  else if (pin.length < 4) errors.pin = 'Your PIN has at least 4 digits';
  return errors;
}

type Mode = 'staff' | 'student';

function loginErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === ERROR_CODES.FORBIDDEN) return e.message;
    if (e.code === ERROR_CODES.INVALID_CREDENTIALS) return e.message === 'Invalid credentials' ? 'Incorrect email or password.' : e.message;
    if (e.code === ERROR_CODES.VALIDATION_ERROR) return 'Please check the details you entered.';
    if (e.code === ERROR_CODES.ACCOUNT_INACTIVE) return 'This account is inactive. Contact your administrator.';
    if (e.code === ERROR_CODES.RATE_LIMITED) return 'Too many sign-in attempts. Please wait a few minutes and try again.';
  }
  return errorMessage(e);
}

export function LoginPage() {
  const { login, studentLogin, status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('staff');
  const [schoolCode, setSchoolCode] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated' && user) {
    return <Navigate to={homePathFor(user.role) ?? '/unsupported'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = mode === 'staff' ? validateLogin(email, password) : validateStudentLogin(schoolCode, studentCode, pin);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const u =
        mode === 'staff'
          ? await login(email.trim(), password)
          : await studentLogin(schoolCode.trim().toUpperCase(), studentCode.trim().toUpperCase(), pin);
      const from = (location.state as { from?: string } | null)?.from;
      const home = homePathFor(u.role);
      navigate(from && home && from.startsWith(home) ? from : (home ?? '/unsupported'), { replace: true });
    } catch (err) {
      setFormError(loginErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-hero" aria-hidden="false">
        <div className="brand">
          <span className="brand__mark" aria-hidden>
            M
          </span>
          <span className="brand__text">
            Mango Dude <small>AIGK</small>
          </span>
        </div>
        <div>
          <h1>
            Experiential learning, <span className="highlight">managed beautifully.</span>
          </h1>
          <p>One place for platform owners, school administrators, teachers and students: classes, activities, learning, quizzes, games, programmes and certification.</p>
        </div>
        <p className="small">Students: sign in with your school code, student ID and PIN from your teacher.</p>
      </section>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={onSubmit} noValidate aria-labelledby="login-title">
          <h2 id="login-title">Sign in</h2>
          <div className="seg" role="radiogroup" aria-label="Account type">
            {(
              [
                ['staff', 'Staff / Teacher'],
                ['student', 'Student'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={`seg__btn ${mode === m ? 'seg__btn--active' : ''}`}
                onClick={() => {
                  setMode(m);
                  setErrors({});
                  setFormError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="muted">{mode === 'staff' ? 'Super Admin, School Admin and Teacher accounts.' : 'Use the details your school gave you.'}</p>
          {formError && <InlineAlert>{formError}</InlineAlert>}
          {mode === 'staff' ? (
            <>
              <FormField label="Email" error={errors.email} required>
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
              <FormField label="Password" error={errors.password} required>
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </FormField>
            </>
          ) : (
            <>
              <FormField label="School code" error={errors.schoolCode} required hint="For example GVS001">
                <input autoComplete="organization" value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} style={{ textTransform: 'uppercase' }} />
              </FormField>
              <FormField label="Student ID" error={errors.studentCode} required>
                <input autoComplete="username" value={studentCode} onChange={(e) => setStudentCode(e.target.value)} style={{ textTransform: 'uppercase' }} />
              </FormField>
              <FormField label="PIN" error={errors.pin} required>
                <input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} />
              </FormField>
            </>
          )}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
