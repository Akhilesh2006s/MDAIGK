import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PlusCircle } from 'lucide-react';
import { useGet } from '../../api/hooks';
import type { Paginated, School } from '../../api/types';
import { PageHeader, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { Badge, PremiumBadge, StatusBadge } from '../../components/Badge';
import { classLevels, date, num } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { SchoolFormModal } from './SchoolForm';

export default function SchoolsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(params.get('new') === '1');
  const q = useDebounced(search.trim(), 300);

  useEffect(() => setPage(1), [q, status]);
  useEffect(() => {
    if (params.get('new') === '1') {
      setAdding(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const list = useGet<Paginated<School>>('/schools', { q, status, page, pageSize: 20 });

  return (
    <>
      <PageHeader
        title="Schools"
        subtitle={list.data ? `${num(list.data.total)} schools` : 'Manage schools, entitlements and subscriptions'}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <PlusCircle size={16} aria-hidden /> Add school
          </button>
        }
      />
      <Toolbar>
        <div className="field toolbar__grow">
          <label className="field__label" htmlFor="school-q">
            Search
          </label>
          <input id="school-q" type="search" placeholder="Name, code, city or region" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="school-status">
            Status
          </label>
          <select id="school-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Toolbar>
      <DataTable
        caption="Schools"
        rows={list.data?.items}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        fetching={list.isFetching && !list.isLoading}
        rowKey={(s) => s._id}
        emptyTitle={q || status ? 'No schools match these filters' : 'No schools yet'}
        emptyMessage={q || status ? 'Try a different search or status.' : 'Add the first school to get started.'}
        columns={[
          {
            key: 'name',
            header: 'School',
            render: (s) => (
              <div>
                <Link to={`/super/schools/${s._id}`}>
                  <strong>{s.name}</strong>
                </Link>
                <div className="muted small mono">{s.schoolCode}</div>
              </div>
            ),
          },
          { key: 'location', header: 'Location', render: (s) => [s.city, s.region].filter(Boolean).join(', ') || '—', hideSm: true },
          { key: 'students', header: 'Students', align: 'right', render: (s) => num(s.studentCount) },
          { key: 'teachers', header: 'Teachers', align: 'right', render: (s) => num(s.teacherCount), hideSm: true },
          { key: 'classes', header: 'Classes', render: (s) => (s.enabledClasses.length ? classLevels(s.enabledClasses) : <span className="muted">None granted</span>) },
          {
            key: 'plan',
            header: 'Plan',
            render: (s) =>
              s.plan ? (
                <div className="stack stack--sm" style={{ gap: 2 }}>
                  <span>{s.plan.name === 'Premium' ? <PremiumBadge /> : <Badge tone="outline">{s.plan.name ?? '—'}</Badge>}</span>
                  <span className="muted small">
                    {s.plan.status} · until {date(s.plan.endDate)}
                  </span>
                </div>
              ) : (
                <span className="muted">No plan</span>
              ),
          },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (s) => (
              <Link className="btn btn--ghost btn--sm" to={`/super/schools/${s._id}`}>
                Manage
              </Link>
            ),
          },
        ]}
        pagination={list.data ? { page: list.data.page, totalPages: list.data.totalPages, total: list.data.total, pageSize: list.data.pageSize, onPage: setPage } : undefined}
      />
      <SchoolFormModal open={adding} onClose={() => setAdding(false)} onSaved={(s) => navigate(`/super/schools/${s._id}`)} />
    </>
  );
}
