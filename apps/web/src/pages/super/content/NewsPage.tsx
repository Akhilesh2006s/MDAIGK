import { useEffect, useState, type FormEvent } from 'react';
import { PlusCircle, Star } from 'lucide-react';
import { NEWS_CATEGORIES } from '@mango/shared';
import { ApiError, api, errorMessage } from '../../../api/client';
import { useGet, useInvalidate, useMutate } from '../../../api/hooks';
import type { NewsArticle, Paginated } from '../../../api/types';
import { PageHeader, Toolbar } from '../../../components/Cards';
import { DataTable } from '../../../components/DataTable';
import { ClassLevelPicker, FormField, FormGrid, Toggle } from '../../../components/Form';
import { InlineAlert } from '../../../components/Feedback';
import { ConfirmDialog, Modal } from '../../../components/Modal';
import { Badge, StatusBadge } from '../../../components/Badge';
import { useToast } from '../../../components/Toast';
import { classLevels, dateTime } from '../../../lib/format';
import { useDebounced } from '../../../lib/useDebounced';
import { StatusSelect, compact, useQuizOptions } from './shared';

const catName = (c: string) => NEWS_CATEGORIES.find((x) => x.code === c)?.name ?? c;

/** <input type="datetime-local"> value in local time */
function localInput(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export default function NewsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<NewsArticle | 'new' | null>(null);
  const [archiving, setArchiving] = useState<NewsArticle | null>(null);
  const q = useDebounced(search.trim());
  useEffect(() => setPage(1), [q, category, status]);
  const list = useGet<Paginated<NewsArticle>>('/news', { q, category, status, page, pageSize: 20 });
  const publish = useMutate((id: string) => api.post(`/news/${id}/publish`), { invalidate: ['/news'], success: 'Article published' });
  const archive = useMutate((id: string) => api.post(`/news/${id}/archive`), { invalidate: ['/news'], success: 'Article archived', onSuccess: () => setArchiving(null) });
  const feature = useMutate((a: NewsArticle) => api.patch(`/news/${a._id}`, { featured: !a.featured }), { invalidate: ['/news'], success: 'Featured flag updated' });

  return (
    <>
      <PageHeader
        title="News"
        subtitle="Age-appropriate articles across eight categories, targeted by class."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            <PlusCircle size={16} aria-hidden /> New article
          </button>
        }
      />
      <Toolbar>
        <div className="field toolbar__grow">
          <label className="field__label" htmlFor="n-q">
            Search title
          </label>
          <input id="n-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="n-cat">
            Category
          </label>
          <select id="n-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {NEWS_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <StatusSelect id="n-status" value={status} onChange={setStatus} />
      </Toolbar>
      <DataTable
        caption="News articles"
        rows={list.data?.items}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        fetching={list.isFetching && !list.isLoading}
        rowKey={(a) => a._id}
        emptyTitle="No articles match"
        columns={[
          {
            key: 'title',
            header: 'Article',
            render: (a) => (
              <div>
                <strong>{a.title}</strong> {a.featured && <Badge tone="yellow"><Star size={11} aria-hidden /> Featured</Badge>}
                <div className="muted small">{a.summary}</div>
              </div>
            ),
          },
          { key: 'cat', header: 'Category', render: (a) => <Badge tone="outline">{catName(a.category)}</Badge> },
          { key: 'classes', header: 'Classes', render: (a) => classLevels(a.targetClasses), hideSm: true },
          { key: 'publish', header: 'Publish date', render: (a) => <span className="nowrap">{dateTime(a.publishAt)}</span>, hideSm: true },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (a) => (
              <div className="actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(a)}>
                  Edit
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => feature.mutate(a)} disabled={feature.isPending} aria-pressed={Boolean(a.featured)}>
                  {a.featured ? 'Unfeature' : 'Feature'}
                </button>
                {a.status !== 'published' && (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => publish.mutate(a._id)} disabled={publish.isPending}>
                    Publish
                  </button>
                )}
                {a.status !== 'archived' && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setArchiving(a)}>
                    Archive
                  </button>
                )}
              </div>
            ),
          },
        ]}
        pagination={list.data ? { page: list.data.page, totalPages: list.data.totalPages, total: list.data.total, pageSize: list.data.pageSize, onPage: setPage } : undefined}
      />
      <NewsModal article={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={Boolean(archiving)}
        title="Archive article?"
        message={`“${archiving?.title}” will be hidden from students immediately.`}
        confirmLabel="Archive"
        tone="danger"
        busy={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving._id)}
        onCancel={() => setArchiving(null)}
      />
    </>
  );
}

const blank = {
  category: 'NATIONAL',
  title: '',
  summary: '',
  body: '',
  imageUrl: '',
  sourceName: '',
  sourceUrl: '',
  targetClasses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as number[],
  featured: false,
  publishAt: '',
  archiveAt: '',
  quizId: '',
  status: 'draft',
};

function NewsModal({ article, open, onClose }: { article: NewsArticle | null; open: boolean; onClose: () => void }) {
  const quizzes = useQuizOptions('news');
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    setF(
      article
        ? {
            category: article.category,
            title: article.title,
            summary: article.summary,
            body: article.body ?? '',
            imageUrl: article.imageUrl ?? '',
            sourceName: article.sourceName ?? '',
            sourceUrl: article.sourceUrl ?? '',
            targetClasses: article.targetClasses ?? [],
            featured: Boolean(article.featured),
            publishAt: localInput(article.publishAt),
            archiveAt: localInput(article.archiveAt),
            quizId: article.quizId ?? '',
            status: article.status,
          }
        : blank,
    );
    setErrors({});
    setFormError(null);
  }, [open, article]);

  const url = (s: string) => !s || /^https?:\/\/\S+$/.test(s);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (f.title.trim().length < 2) v.title = 'Title is required';
    if (f.summary.trim().length < 2) v.summary = 'Summary is required';
    if (!f.targetClasses.length) v.targetClasses = 'Select at least one class';
    if (!url(f.imageUrl)) v.imageUrl = 'Enter a full URL (https://…)';
    if (!url(f.sourceUrl)) v.sourceUrl = 'Enter a full URL (https://…)';
    if (f.publishAt && f.archiveAt && f.archiveAt <= f.publishAt) v.archiveAt = 'Archive date must be after the publish date';
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    const { status, publishAt, archiveAt, quizId, ...rest } = f;
    const body: Record<string, unknown> = {
      ...compact({ ...rest, title: f.title.trim(), summary: f.summary.trim() }),
      featured: f.featured,
      targetClasses: f.targetClasses,
      quizId: quizId || null,
      publishAt: publishAt ? new Date(publishAt).toISOString() : undefined,
      archiveAt: archiveAt ? new Date(archiveAt).toISOString() : null,
    };
    if (article) {
      Object.assign(body, { body: f.body, imageUrl: f.imageUrl, sourceName: f.sourceName, sourceUrl: f.sourceUrl });
      if (status === 'draft' || status === 'review') body.status = status;
    }
    setBusy(true);
    try {
      if (article) await api.patch(`/news/${article._id}`, body);
      else await api.post('/news', body);
      await invalidate('/news');
      toast.success(article ? 'Article saved' : 'Article created as draft');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const canSetStatus = article && (article.status === 'draft' || article.status === 'review');
  return (
    <Modal
      open={open}
      title={article ? 'Edit article' : 'New article'}
      onClose={onClose}
      size="lg"
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="news-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : article ? 'Save article' : 'Create draft'}
          </button>
        </>
      }
    >
      <form id="news-form" onSubmit={submit} noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <FormGrid>
          <FormField label="Category" error={errors.category} required>
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {NEWS_CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          {canSetStatus ? (
            <FormField label="Workflow status" hint="Use Publish / Archive on the list to go live or retire an article.">
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="draft">Draft</option>
                <option value="review">Review</option>
              </select>
            </FormField>
          ) : (
            <div />
          )}
        </FormGrid>
        <FormField label="Title" error={errors.title} required>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} />
        </FormField>
        <FormField label="Summary" error={errors.summary} required>
          <textarea rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={600} />
        </FormField>
        <FormField label="Body" error={errors.body}>
          <textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={20000} />
        </FormField>
        <ClassLevelPicker label="Target classes" value={f.targetClasses} onChange={(v) => setF({ ...f, targetClasses: v })} error={errors.targetClasses} />
        <FormGrid cols={3}>
          <FormField label="Publish date" error={errors.publishAt} hint="Leave empty to publish immediately when published.">
            <input type="datetime-local" value={f.publishAt} onChange={(e) => setF({ ...f, publishAt: e.target.value })} />
          </FormField>
          <FormField label="Archive date" error={errors.archiveAt} hint="Optional auto-hide date.">
            <input type="datetime-local" value={f.archiveAt} onChange={(e) => setF({ ...f, archiveAt: e.target.value })} />
          </FormField>
          <FormField label="Linked quiz" error={errors.quizId}>
            <select value={f.quizId} onChange={(e) => setF({ ...f, quizId: e.target.value })}>
              <option value="">None</option>
              {quizzes.data?.items.map((qz) => (
                <option key={qz._id} value={qz._id}>
                  {qz.title} ({qz.status})
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Image URL" error={errors.imageUrl}>
            <input type="url" value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} />
          </FormField>
          <FormField label="Source name" error={errors.sourceName}>
            <input value={f.sourceName} onChange={(e) => setF({ ...f, sourceName: e.target.value })} maxLength={120} />
          </FormField>
          <FormField label="Source URL" error={errors.sourceUrl}>
            <input type="url" value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} />
          </FormField>
        </FormGrid>
        <Toggle checked={f.featured} onChange={(v) => setF({ ...f, featured: v })} label="Featured article" />
      </form>
    </Modal>
  );
}
