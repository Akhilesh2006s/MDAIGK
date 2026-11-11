import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PlayCircle } from 'lucide-react';
import { useGet } from '../../api/hooks';
import type { NewsCategory, NewsDetail, NewsRow } from '../../api/portalTypes';
import type { Paginated } from '../../api/types';
import { Card, PageHeader } from '../../components/Cards';
import { EmptyState, QueryState } from '../../components/Feedback';
import { Pagination } from '../../components/DataTable';
import { date } from '../../lib/format';

type Row = NewsRow & { publishAt?: string; quizId?: string | null; featured?: boolean };

export default function NewsPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const page = Number(params.get('page') ?? 1) || 1;
  const cats = useGet<NewsCategory[]>('/news/categories');
  const list = useGet<Paginated<Row>>('/news', { category: category || undefined, page, pageSize: 10 });
  const catName = (code: string) => cats.data?.find((c) => c.code === code)?.name ?? code;

  return (
    <div className="student-page">
      <PageHeader title="News & GK" subtitle="Short, age-appropriate stories from around the world — with quick quizzes." />
      <QueryState query={cats}>
        {(cs) => (
          <div className="chip-row" role="group" aria-label="News categories">
            <button type="button" className={`chip ${!category ? 'chip--active' : ''}`} aria-pressed={!category} onClick={() => setParams({})}>
              All
            </button>
            {cs.map((c) => (
              <button key={c.code} type="button" className={`chip ${category === c.code ? 'chip--active' : ''}`} aria-pressed={category === c.code} onClick={() => setParams({ category: c.code })}>
                {c.name} <span className="chip__count">{c.articleCount}</span>
              </button>
            ))}
          </div>
        )}
      </QueryState>
      <QueryState query={list} loadingLabel="Loading news…">
        {(res) =>
          res.items.length === 0 ? (
            <EmptyState title="No stories here yet" message="Check back soon for new articles." />
          ) : (
            <>
              <div className="news-grid">
                {res.items.map((n) => (
                  <Link key={n._id} to={`/student/news/${n._id}`} className="news-card">
                    <span className="news-card__cat">{catName(n.category)}</span>
                    <strong className="news-card__title">{n.title}</strong>
                    {n.summary && <span className="muted small">{n.summary}</span>}
                    <span className="muted small news-card__meta">
                      {date(n.publishAt ?? n.publishedAt)}
                      {n.quizId ? ' · has a quiz' : ''}
                    </span>
                  </Link>
                ))}
              </div>
              <Pagination page={res.page} totalPages={res.totalPages} total={res.total} pageSize={res.pageSize} onPage={(p) => setParams(category ? { category, page: String(p) } : { page: String(p) })} />
            </>
          )
        }
      </QueryState>
    </div>
  );
}

export function NewsArticlePage() {
  const { id = '' } = useParams();
  const q = useGet<NewsDetail & { publishAt?: string }>(`/news/${id}`, undefined, { placeholderData: undefined });
  const cats = useGet<NewsCategory[]>('/news/categories');
  return (
    <div className="student-page student-page--narrow">
      <QueryState query={q} loadingLabel="Loading article…">
        {(a) => (
          <>
            <PageHeader
              title={a.title}
              subtitle={`${cats.data?.find((c) => c.code === a.category)?.name ?? a.category} · ${date(a.publishAt ?? a.publishedAt)}`}
              breadcrumb={
                <Link to={`/student/news?category=${a.category}`}>
                  <ArrowLeft size={14} aria-hidden /> News & GK
                </Link>
              }
            />
            <Card>
              <article className="lesson">
                {a.imageUrl && <img src={a.imageUrl} alt="" className="lesson__img" />}
                {a.summary && <p className="lesson__lead">{a.summary}</p>}
                <div className="lesson__body">
                  {(a.body ?? '').split(/\n{2,}/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                {a.source && <p className="muted small">Source: {a.source}</p>}
              </article>
              {a.quiz && (
                <div className="lesson__footer">
                  <span className="muted">Test what you learned.</span>
                  <Link className="btn btn--mango" to={`/student/quiz/${a.quiz.id}?back=${encodeURIComponent(`/student/news/${id}`)}`}>
                    <PlayCircle size={16} aria-hidden /> Take the quiz ({a.quiz.questionCount} questions)
                  </Link>
                </div>
              )}
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}
