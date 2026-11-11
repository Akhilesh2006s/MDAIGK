import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { errorMessage } from '../api/client';

export function Loading({ label = 'Loading…', fullPage = false }: { label?: string; fullPage?: boolean }) {
  return (
    <div className={fullPage ? 'loading loading--page' : 'loading'} role="status" aria-live="polite">
      <Loader2 className="spin" size={20} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', message, action }: { title?: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <Inbox size={28} aria-hidden />
      <p className="empty__title">{title}</p>
      {message && <p className="empty__msg">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load this data' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={22} aria-hidden />
      <div>
        <p className="error-state__title">{title}</p>
        <p className="error-state__msg">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function InlineAlert({ tone = 'error', children }: { tone?: 'error' | 'info' | 'success' | 'warning'; children: ReactNode }) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** Renders loading / error / children for a react-query result. */
export function QueryState<T>({
  query,
  children,
  loadingLabel,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}) {
  if (query.isLoading) return <Loading label={loadingLabel} />;
  if (query.isError || query.data === undefined) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <>{children(query.data)}</>;
}
