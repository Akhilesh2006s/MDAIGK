import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Award, CheckCircle2, Download, Lock, PlayCircle } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { useGet } from '../../api/hooks';
import type { AttemptBody, AttemptResult, CertLevel, CertificateRow, PublicQuiz } from '../../api/portalTypes';
import { useAuth } from '../../auth/AuthContext';
import { Card, PageHeader } from '../../components/Cards';
import { EmptyState, QueryState } from '../../components/Feedback';
import { QuizPlayer } from '../../components/QuizPlayer';
import { useToast } from '../../components/Toast';
import { date } from '../../lib/format';
import { SectionTitle, lockText, pctOrDash } from './shared';

export function useCertificateDownload() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function download(id: string, number?: string) {
    setBusy(id);
    try {
      const name = await api.download(`/certificates/${id}/pdf`, undefined, `certificate-${number ?? id}.pdf`);
      toast.success(`Downloaded ${name}`);
    } catch (e) {
      toast.error(`Could not download the certificate: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }
  return { download, busy };
}

export default function CertificatesPage() {
  const { user } = useAuth();
  const levels = useGet<{ currentLevel: number; levels: CertLevel[] }>('/certifications/levels');
  const certs = useGet<CertificateRow[]>(user ? `/students/${user.id}/certificates` : null);
  const { download, busy } = useCertificateDownload();

  return (
    <div className="student-page">
      <PageHeader title="Certificates" subtitle="Pass each level’s assessment to earn a Mango Dude GK certificate. Levels unlock one after another." />
      <QueryState query={levels} loadingLabel="Loading levels…">
        {(d) => (
          <>
            <p className="muted">
              Current level: <strong>{d.currentLevel > 0 ? `Level ${d.currentLevel}` : 'not certified yet'}</strong>
            </p>
            {d.levels.length === 0 ? (
              <EmptyState title="No certification levels yet" />
            ) : (
              <ol className="cert-ladder">
                {d.levels.map((l) => {
                  const certified = l.state === 'certified' || Boolean(l.certificate);
                  return (
                    <li key={l.id} className={`cert-step cert-step--${certified ? 'certified' : l.state}`}>
                      <span className="cert-step__num" aria-hidden>
                        {certified ? <Award size={20} /> : l.state === 'locked' ? <Lock size={18} /> : l.level}
                      </span>
                      <div className="cert-step__body">
                        <h3>
                          Level {l.level}: {l.title}
                        </h3>
                        {l.description && <p className="muted small">{l.description}</p>}
                        <p className="small">
                          Pass mark {l.passPercent}% · best {pctOrDash(l.bestPercent)} · {l.attempts} attempt{l.attempts === 1 ? '' : 's'}
                        </p>
                        {l.state === 'locked' && !certified && (
                          <p className="small cert-step__lock">
                            <Lock size={12} aria-hidden /> {lockText(l.lockReason)}
                          </p>
                        )}
                      </div>
                      <div className="cert-step__action">
                        {certified && l.certificate ? (
                          <>
                            <span className="badge badge--gold">
                              <CheckCircle2 size={12} aria-hidden /> Certified {date(l.certificate.issuedAt)}
                            </span>
                            <button type="button" className="btn btn--secondary btn--sm" disabled={busy === l.certificate.id} onClick={() => void download(l.certificate!.id, l.certificate!.certificateNumber)}>
                              <Download size={14} aria-hidden /> {busy === l.certificate.id ? 'Downloading…' : 'PDF'}
                            </button>
                          </>
                        ) : l.state === 'available' ? (
                          <Link to={`/student/certificates/${l.id}/assessment`} className="btn btn--mango btn--sm">
                            <PlayCircle size={14} aria-hidden /> {l.attempts ? 'Try again' : 'Take assessment'}
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </QueryState>

      <SectionTitle>My certificates</SectionTitle>
      <QueryState query={certs}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState title="No certificates yet" message="Pass Level 1 to earn your first certificate." />
          ) : (
            <ul className="cert-list">
              {list.map((c) => (
                <li key={c._id}>
                  <Award size={22} aria-hidden className="text-gold" />
                  <div>
                    <strong>
                      Level {c.level}
                      {c.levelTitle ? `: ${c.levelTitle}` : ''}
                    </strong>
                    <span className="muted small">
                      No. {c.certificateNumber} · issued {date(c.issuedAt)}
                      {c.percent !== undefined ? ` · scored ${Math.round(c.percent)}%` : ''}
                    </span>
                  </div>
                  <button type="button" className="btn btn--secondary btn--sm" disabled={busy === c._id} onClick={() => void download(c._id, c.certificateNumber)}>
                    <Download size={14} aria-hidden /> {busy === c._id ? 'Downloading…' : 'Download PDF'}
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}

export function AssessmentPage() {
  const { levelId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useGet<{ level: { id: string; level: number; title: string; passPercent: number }; quiz: PublicQuiz }>(`/certifications/levels/${levelId}/assessment`, undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    placeholderData: undefined,
    retry: false,
  });
  const { download, busy } = useCertificateDownload();

  return (
    <div className="student-page student-page--narrow">
      <PageHeader
        title={q.data ? `Level ${q.data.level.level}: ${q.data.level.title}` : 'Certification assessment'}
        subtitle={q.data ? `${q.data.quiz.questionCount} questions · pass mark ${q.data.level.passPercent}%` : undefined}
        breadcrumb={
          <Link to="/student/certificates">
            <ArrowLeft size={14} aria-hidden /> Certificates
          </Link>
        }
      />
      <QueryState query={q} loadingLabel="Preparing your assessment…">
        {(d) => (
          <Card>
            <QuizPlayer
              key={`${d.quiz.id}-${d.quiz.version}`}
              quiz={d.quiz}
              allowRetake={false}
              submit={(body: AttemptBody) => api.post<AttemptResult>(`/certifications/levels/${levelId}/attempts`, body)}
              onSubmitted={() =>
                // Refresh levels and certificates, but not this assessment: refetching it after a pass returns
                // "You already hold this certificate" and would replace the result screen.
                void qc.invalidateQueries({
                  predicate: (query) => {
                    const k = query.queryKey[0];
                    return typeof k === 'string' && !k.endsWith('/assessment') && ['/certifications', '/students', '/student'].some((pre) => k.startsWith(pre));
                  },
                })
              }
              onReload={() => void q.refetch()}
              resultExtra={(r) => {
                const certId = r.certificate?._id ?? r.certificate?.id;
                return r.passed ? (
                  <div className="cert-earned">
                    <Award size={28} aria-hidden className="text-gold" />
                    <div>
                      <strong>Certificate earned!</strong>
                      {r.certificate?.certificateNumber && <p className="muted small">No. {r.certificate.certificateNumber}</p>}
                    </div>
                    {certId && (
                      <button type="button" className="btn btn--mango btn--sm" disabled={busy === certId} onClick={() => void download(certId, r.certificate?.certificateNumber)}>
                        <Download size={14} aria-hidden /> Download PDF
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="muted">You need {r.passPercent ?? d.level.passPercent}% to pass. Review the answers below and try again later.</p>
                );
              }}
              doneAction={
                <button type="button" className="btn btn--primary" onClick={() => navigate('/student/certificates')}>
                  Back to certificates
                </button>
              }
            />
          </Card>
        )}
      </QueryState>
    </div>
  );
}
