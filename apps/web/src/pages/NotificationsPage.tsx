import { useState } from 'react';
import { api } from '../api/client';
import { useGet, useMutate } from '../api/hooks';
import type { Notification, Paginated } from '../api/types';
import { PageHeader, Toolbar } from '../components/Cards';
import { DataTable } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { dateTime } from '../lib/format';

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const q = useGet<Paginated<Notification> & { unread: number }>('/notifications', { page, pageSize: 20, unread: unreadOnly || undefined });
  const markOne = useMutate((id: string) => api.patch(`/notifications/${id}/read`), { invalidate: ['/notifications'] });
  const markAll = useMutate(() => api.post('/notifications/read-all'), { invalidate: ['/notifications'], success: 'All notifications marked as read' });

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={q.data ? `${q.data.unread} unread` : undefined}
        actions={
          <button type="button" className="btn btn--secondary" onClick={() => markAll.mutate(undefined)} disabled={markAll.isPending || !q.data?.unread}>
            Mark all as read
          </button>
        }
      />
      <Toolbar>
        <label className="row">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => (setUnreadOnly(e.target.checked), setPage(1))} /> Unread only
        </label>
      </Toolbar>
      <DataTable
        caption="Notifications"
        rows={q.data?.items}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        fetching={q.isFetching}
        rowKey={(n) => n._id}
        emptyTitle="No notifications"
        emptyMessage="You're all caught up."
        columns={[
          { key: 'title', header: 'Notification', render: (n) => (<div><strong>{n.title}</strong>{n.body && <div className="muted">{n.body}</div>}</div>) },
          { key: 'type', header: 'Type', render: (n) => (n.type ? <Badge tone="outline">{n.type}</Badge> : '—'), hideSm: true },
          { key: 'createdAt', header: 'Received', render: (n) => dateTime(n.createdAt) },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (n) =>
              n.readAt ? (
                <span className="muted small">Read</span>
              ) : (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => markOne.mutate(n._id)}>
                  Mark read
                </button>
              ),
          },
        ]}
        pagination={q.data ? { page: q.data.page, totalPages: q.data.totalPages, total: q.data.total, pageSize: q.data.pageSize, onPage: setPage } : undefined}
      />
    </>
  );
}
