import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGet } from '../../api/hooks';
import type { AuditEntry, Paginated } from '../../api/types';
import { PageHeader, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { Modal } from '../../components/Modal';
import { dateTime } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';

const ENTITY_TYPES = ['school', 'user', 'subscription_plan', 'class_section', 'subject', 'learning_item', 'news_article', 'quiz', 'game', 'programme', 'certification_level', 'platform_settings'];

export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const a = useDebounced(action.trim());
  useEffect(() => setPage(1), [a, entityType]);
  const q = useGet<Paginated<AuditEntry>>('/audit-logs', { action: a, entityType, page, pageSize: 25 });

  return (
    <>
      <PageHeader title="Audit log" subtitle="History of privileged actions (newest first)" />
      <Toolbar>
        <div className="field toolbar__grow">
          <label className="field__label" htmlFor="a-action">
            Action starts with
          </label>
          <input id="a-action" placeholder="e.g. school. or user.reset" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="a-type">
            Entity type
          </label>
          <select id="a-type" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">All</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </Toolbar>
      <DataTable
        caption="Audit log"
        rows={q.data?.items}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        fetching={q.isFetching && !q.isLoading}
        rowKey={(e) => e._id}
        emptyTitle="No audit entries"
        emptyMessage={a || entityType ? 'No entries match these filters.' : 'Privileged actions (school changes, plan assignments, password resets…) will appear here.'}
        columns={[
          { key: 'when', header: 'When', render: (e) => <span className="nowrap">{dateTime(e.createdAt)}</span> },
          { key: 'actor', header: 'Actor', render: (e) => (e.actorId ? (<div>{e.actorId.name}<div className="muted small">{e.actorId.email}</div></div>) : '—') },
          { key: 'action', header: 'Action', render: (e) => <Badge tone="outline">{e.action}</Badge> },
          { key: 'entity', header: 'Entity', render: (e) => e.entityType ?? '—', hideSm: true },
          { key: 'school', header: 'School', render: (e) => (e.schoolId ? <Link to={`/super/schools/${e.schoolId._id}`}>{e.schoolId.name}</Link> : '—'), hideSm: true },
          { key: 'summary', header: 'Summary', render: (e) => e.summary ?? '—' },
          {
            key: 'detail',
            header: <span className="sr-only">Details</span>,
            align: 'right',
            render: (e) =>
              e.before || e.after ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDetail(e)}>
                  Details
                </button>
              ) : null,
          },
        ]}
        pagination={q.data ? { page: q.data.page, totalPages: q.data.totalPages, total: q.data.total, pageSize: q.data.pageSize, onPage: setPage } : undefined}
      />
      <Modal open={Boolean(detail)} title={detail?.action ?? ''} onClose={() => setDetail(null)} size="lg">
        {detail && (
          <div className="grid-2">
            <div>
              <p className="form-section-title">Before</p>
              <pre className="mono small" style={{ whiteSpace: 'pre-wrap', background: 'var(--ivory)', padding: 12, borderRadius: 6 }}>
                {detail.before ? JSON.stringify(detail.before, null, 2) : '—'}
              </pre>
            </div>
            <div>
              <p className="form-section-title">After</p>
              <pre className="mono small" style={{ whiteSpace: 'pre-wrap', background: 'var(--ivory)', padding: 12, borderRadius: 6 }}>
                {detail.after ? JSON.stringify(detail.after, null, 2) : '—'}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
