import { useEffect, useState } from 'react';
import { ROLES } from '@mango/shared';
import { api } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { Paginated, PlatformUser } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { ConfirmDialog, SecretDialog } from '../../components/Modal';
import { Badge, StatusBadge } from '../../components/Badge';
import { dateTime, num, titleCase } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';

type Pending = { kind: 'status' | 'reset'; user: PlatformUser } | null;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending>(null);
  const [secret, setSecret] = useState<{ value: string; who: string; label: string } | null>(null);
  const q = useDebounced(search.trim());
  useEffect(() => setPage(1), [q, role, status]);
  const list = useGet<Paginated<PlatformUser>>('/users', { q, role, status, page, pageSize: 25 });

  const toggle = useMutate((u: PlatformUser) => api.patch(`/users/${u.id}`, { status: u.status === 'active' ? 'inactive' : 'active' }), {
    invalidate: ['/users'],
    success: 'User status updated',
    onSuccess: () => setPending(null),
  });
  const reset = useMutate((u: PlatformUser) => api.post<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`), {
    invalidate: ['/users'],
    onSuccess: (res) => {
      const u = pending!.user;
      setSecret({ value: res.temporaryPassword, who: `${u.name}${u.email ? ` (${u.email})` : ''}`, label: u.role === ROLES.STUDENT ? 'PIN' : 'Temporary password' });
      setPending(null);
    },
  });

  return (
    <>
      <PageHeader title="Users" subtitle={list.data ? `${num(list.data.total)} users match` : 'Search users across all schools'} />
      <Toolbar>
        <div className="field toolbar__grow">
          <label className="field__label" htmlFor="u-q">
            Search
          </label>
          <input id="u-q" type="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="u-role">
            Role
          </label>
          <select id="u-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {Object.values(ROLES).map((r) => (
              <option key={r} value={r}>
                {titleCase(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="u-status">
            Status
          </label>
          <select id="u-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Toolbar>
      <DataTable
        caption="Users"
        rows={list.data?.items}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        fetching={list.isFetching && !list.isLoading}
        rowKey={(u) => u.id}
        emptyTitle="No users match these filters"
        columns={[
          { key: 'name', header: 'Name', render: (u) => (<div><strong>{u.name}</strong><div className="muted small">{u.email ?? 'No email (student)'}</div></div>) },
          { key: 'role', header: 'Role', render: (u) => <Badge tone={u.role === ROLES.SUPER_ADMIN ? 'gold' : u.role === ROLES.SCHOOL_ADMIN ? 'green' : 'outline'}>{titleCase(u.role)}</Badge> },
          {
            key: 'schools',
            header: 'Schools',
            render: (u) => (u.schools.length ? u.schools.map((s) => s.school?.schoolCode ?? '—').join(', ') : <span className="muted">—</span>),
            hideSm: true,
          },
          { key: 'login', header: 'Last sign-in', render: (u) => dateTime(u.lastLoginAt), hideSm: true },
          { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (u) =>
              u.id === me?.id ? (
                <span className="muted small">You</span>
              ) : (
                <div className="actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPending({ kind: 'reset', user: u })}>
                    {u.role === ROLES.STUDENT ? 'Reset PIN' : 'Reset password'}
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPending({ kind: 'status', user: u })}>
                    {u.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              ),
          },
        ]}
        pagination={list.data ? { page: list.data.page, totalPages: list.data.totalPages, total: list.data.total, pageSize: list.data.pageSize, onPage: setPage } : undefined}
      />
      <ConfirmDialog
        open={pending?.kind === 'status'}
        title={pending?.user.status === 'active' ? 'Deactivate user?' : 'Activate user?'}
        message={
          pending?.user.status === 'active'
            ? `${pending.user.name} will be signed out everywhere and can no longer sign in.`
            : `${pending?.user.name} will be able to sign in again.`
        }
        confirmLabel={pending?.user.status === 'active' ? 'Deactivate' : 'Activate'}
        tone={pending?.user.status === 'active' ? 'danger' : 'primary'}
        busy={toggle.isPending}
        onConfirm={() => pending && toggle.mutate(pending.user)}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'reset'}
        title={pending?.user.role === ROLES.STUDENT ? 'Reset PIN?' : 'Reset password?'}
        message={`A new one-time ${pending?.user.role === ROLES.STUDENT ? 'PIN' : 'temporary password'} will be generated for ${pending?.user.name}. Their current sessions will be signed out.`}
        confirmLabel="Reset"
        tone="danger"
        busy={reset.isPending}
        onConfirm={() => pending && reset.mutate(pending.user)}
        onCancel={() => setPending(null)}
      />
      <SecretDialog secret={secret?.value} label={secret?.label ?? 'Temporary password'} subject={secret?.who} onClose={() => setSecret(null)} />
    </>
  );
}
