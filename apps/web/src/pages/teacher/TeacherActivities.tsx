import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, Lock, Pencil, Plus, Send } from 'lucide-react';
import { api } from '../../api/client';
import { useGet, useMutate } from '../../api/hooks';
import type { TeacherActivity } from '../../api/portalTypes';
import { Badge } from '../../components/Badge';
import { Card, PageHeader, Toolbar } from '../../components/Cards';
import { DataTable } from '../../components/DataTable';
import { ConfirmDialog } from '../../components/Modal';
import { DASH, dateTime } from '../../lib/format';
import { FilterField } from '../school/shared';
import { ActivityFormModal } from './ActivityForm';
import { STATUS_TONE, activitySection, activitySubject, classLabel, useTeacherClasses } from './shared';

export default function TeacherActivities() {
  const [params, setParams] = useSearchParams();
  const sectionId = params.get('sectionId') ?? '';
  const status = params.get('status') ?? '';
  const classes = useTeacherClasses();
  const q = useGet<TeacherActivity[]>('/teacher/activities', { sectionId: sectionId || undefined, status: status || undefined });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherActivity | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'publish' | 'close'; a: TeacherActivity } | null>(null);

  useEffect(() => {
    if (params.get('new') === '1' && classes.data) {
      setEditing(null);
      setFormOpen(true);
      const p = new URLSearchParams(params);
      p.delete('new');
      setParams(p, { replace: true });
    }
  }, [params, classes.data, setParams]);

  const action = useMutate((v: { kind: 'publish' | 'close'; id: string }) => api.post(`/teacher/activities/${v.id}/${v.kind}`), {
    invalidate: ['/teacher'],
    success: (_d) => (confirm?.kind === 'close' ? 'Activity closed' : 'Activity published — students can see it now'),
    onSuccess: () => setConfirm(null),
  });

  function setFilter(k: string, v: string) {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p);
  }

  return (
    <>
      <PageHeader
        title="Activities"
        subtitle="Assign quizzes, practice and worksheets to your classes."
        actions={
          <button
            type="button"
            className="btn btn--primary"
            disabled={!classes.data}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={16} aria-hidden /> New activity
          </button>
        }
      />
      <Card>
        <Toolbar>
          <FilterField label="Class">
            <select value={sectionId} onChange={(e) => setFilter('sectionId', e.target.value)}>
              <option value="">All my classes</option>
              {classes.data?.map((c) => (
                <option key={c.sectionId} value={c.sectionId}>
                  {c.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Any status</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </select>
          </FilterField>
        </Toolbar>
        <DataTable
          rows={q.data}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => void q.refetch()}
          fetching={q.isFetching}
          rowKey={(r) => r._id}
          emptyTitle="No activities yet"
          emptyMessage="Create an activity to assign work to a class."
          caption="Activities"
          columns={[
            {
              key: 'title',
              header: 'Activity',
              render: (a) => (
                <div>
                  <Link to={`/teacher/activities/${a._id}/results`}>
                    <strong>{a.title}</strong>
                  </Link>
                  <div className="muted small">
                    {a.type} · {activitySubject(a)?.name ?? DASH}
                    {a.studentIds?.length ? ` · ${a.studentIds.length} selected students` : ''}
                  </div>
                </div>
              ),
            },
            { key: 'class', header: 'Class', render: (a) => classLabel(activitySection(a)) },
            { key: 'due', header: 'Due', render: (a) => dateTime(a.dueAt), hideSm: true },
            { key: 'status', header: 'Status', render: (a) => <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge> },
            {
              key: 'done',
              header: 'Completed',
              align: 'right',
              render: (a) => (a.status === 'draft' ? DASH : `${a.completedCount ?? 0} / ${a.recipientCount ?? 0}`),
            },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              render: (a) => (
                <div className="actions">
                  {a.status !== 'closed' && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      aria-label={`Edit ${a.title}`}
                      title="Edit"
                      onClick={() => {
                        setEditing(a);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {a.status === 'draft' && (
                    <button type="button" className="btn btn--sm btn--primary" onClick={() => setConfirm({ kind: 'publish', a })}>
                      <Send size={14} aria-hidden /> Publish
                    </button>
                  )}
                  {a.status === 'published' && (
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirm({ kind: 'close', a })}>
                      <Lock size={14} aria-hidden /> Close
                    </button>
                  )}
                  {a.status !== 'draft' && (
                    <Link to={`/teacher/activities/${a._id}/results`} className="btn btn--sm btn--secondary">
                      <BarChart3 size={14} aria-hidden /> Results
                    </Link>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {classes.data && <ActivityFormModal open={formOpen} onClose={() => setFormOpen(false)} classes={classes.data} editing={editing} initialSection={sectionId || undefined} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'close' ? 'Close activity?' : 'Publish activity?'}
        message={
          confirm?.kind === 'close'
            ? `Students will no longer be able to submit “${confirm?.a.title}”. This can’t be undone.`
            : `“${confirm?.a.title}” will be visible to students from its start time and they’ll get a notification.`
        }
        confirmLabel={confirm?.kind === 'close' ? 'Close activity' : 'Publish'}
        tone={confirm?.kind === 'close' ? 'danger' : 'primary'}
        busy={action.isPending}
        onConfirm={() => confirm && action.mutate({ kind: confirm.kind, id: confirm.a._id })}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
