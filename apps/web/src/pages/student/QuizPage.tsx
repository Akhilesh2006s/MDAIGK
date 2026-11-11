import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../api/client';
import { useGet, useInvalidate } from '../../api/hooks';
import type { AttemptBody, AttemptResult, PublicQuiz } from '../../api/portalTypes';
import { Card, PageHeader } from '../../components/Cards';
import { QueryState } from '../../components/Feedback';
import { QuizPlayer } from '../../components/QuizPlayer';

/** /student/quiz/:quizId?activityId=&back= — learning, news, programme and activity quizzes. */
export default function QuizPage() {
  const { quizId = '' } = useParams();
  const [params] = useSearchParams();
  const activityId = params.get('activityId') ?? undefined;
  const back = params.get('back');
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const quiz = useGet<PublicQuiz>(`/quizzes/${quizId}`, activityId ? { activityId } : undefined, { staleTime: Infinity, refetchOnWindowFocus: false, placeholderData: undefined });
  const backTo = back && back.startsWith('/student') ? back : activityId ? '/student/activities' : '/student/learn';

  return (
    <div className="student-page student-page--narrow">
      <PageHeader
        title={quiz.data?.title ?? 'Quiz'}
        subtitle={quiz.data ? `${quiz.data.questionCount} questions${quiz.data.timeLimitSec ? ` · suggested time ${Math.round(quiz.data.timeLimitSec / 60)} min` : ''}` : undefined}
        breadcrumb={
          <Link to={backTo}>
            <ArrowLeft size={14} aria-hidden /> Back
          </Link>
        }
      />
      <QueryState query={quiz} loadingLabel="Loading quiz…">
        {(q) => (
          <Card>
            {q.description && <p className="muted">{q.description}</p>}
            <QuizPlayer
              key={`${q.id}-${q.version}`}
              quiz={q}
              submit={(body: AttemptBody) => api.post<AttemptResult>(`/quizzes/${quizId}/attempts`, activityId ? { ...body, activityId } : body)}
              onSubmitted={() => void invalidate('/student', '/learning', '/programmes')}
              onReload={() => void quiz.refetch()}
              allowRetake={!activityId}
              doneAction={
                <button type="button" className="btn btn--primary" onClick={() => navigate(backTo)}>
                  Done
                </button>
              }
            />
          </Card>
        )}
      </QueryState>
    </div>
  );
}
