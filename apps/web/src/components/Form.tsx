import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { CLASS_LEVELS } from '@mango/shared';
import { Lock } from 'lucide-react';

/** Label + control + hint + error, wired with aria-describedby / aria-invalid. */
export function FormField({
  label,
  error,
  hint,
  children,
  required,
  className,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactElement;
  required?: boolean;
  className?: string;
}) {
  const id = useId();
  const controlId = (children.props as { id?: string }).id ?? `f-${id}`;
  const describedBy = [hint ? `${controlId}-hint` : null, error ? `${controlId}-err` : null].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: controlId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className ?? ''}`}>
      <label htmlFor={controlId} className="field__label">
        {label}
        {required && (
          <span className="field__req" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {hint && (
        <p id={`${controlId}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${controlId}-err`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Checkbox chips for Classes 1–10. `locked` levels render disabled with a lock icon. */
export function ClassLevelPicker({
  value,
  onChange,
  locked = [],
  label = 'Class levels',
  error,
  levels = CLASS_LEVELS as readonly number[],
  disabled,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  locked?: number[];
  label?: string;
  error?: string;
  levels?: readonly number[];
  disabled?: boolean;
}) {
  const id = useId();
  const toggle = (n: number) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => a - b));
  return (
    <fieldset className={`field chips-field ${error ? 'field--error' : ''}`} aria-describedby={error ? `${id}-err` : undefined} disabled={disabled}>
      <legend className="field__label">{label}</legend>
      <div className="chips">
        {levels.map((n) => {
          const isLocked = locked.includes(n);
          return (
            <label key={n} className={`chip ${value.includes(n) ? 'chip--on' : ''} ${isLocked ? 'chip--locked' : ''}`}>
              <input type="checkbox" checked={value.includes(n)} disabled={isLocked} onChange={() => toggle(n)} />
              {isLocked && <Lock size={11} aria-hidden />}
              <span>Class {n}</span>
            </label>
          );
        })}
      </div>
      {!disabled && (
        <div className="chips-actions">
          <button type="button" className="link-btn" onClick={() => onChange(levels.filter((n) => !locked.includes(n)))}>
            Select all
          </button>
          <button type="button" className="link-btn" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
      )}
      {error && (
        <p id={`${id}-err`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={`form-grid form-grid--${cols}`}>{children}</div>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`toggle ${disabled ? 'toggle--disabled' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden>
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__label">{label}</span>
    </label>
  );
}

/** Client errors take precedence over API (zod) field errors. */
export function mergeErrors(local: Record<string, string>, api: Record<string, string>): Record<string, string> {
  return { ...api, ...local };
}

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
