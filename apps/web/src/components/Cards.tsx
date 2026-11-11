import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: string; subtitle?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <header className="card__header">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__sub">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'positive' | 'gold' | 'muted';
}) {
  return (
    <div className={`stat stat--${tone}`}>
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {Icon && <Icon size={18} aria-hidden className="stat__icon" />}
      </div>
      <div className="stat__value">{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

/** Chart container: title, reporting period, optional empty state. */
export function ChartCard({
  title,
  period,
  children,
  empty,
  emptyMessage = 'No data recorded for this period.',
  height = 260,
  footer,
}: {
  title: string;
  period: string;
  children: ReactNode;
  empty?: boolean;
  emptyMessage?: string;
  height?: number;
  footer?: ReactNode;
}) {
  return (
    <section className="card chart-card">
      <header className="card__header">
        <div>
          <h2 className="card__title">{title}</h2>
          <p className="card__sub">{period}</p>
        </div>
      </header>
      <div className="chart-card__body" style={{ height }}>
        {empty ? <div className="chart-empty">{emptyMessage}</div> : children}
      </div>
      {footer && <div className="chart-card__footer">{footer}</div>}
    </section>
  );
}

export function KeyValue({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} className="kv__row">
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}
