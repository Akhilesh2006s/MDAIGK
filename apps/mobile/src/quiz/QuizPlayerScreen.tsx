import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { ApiError, endpoints, errorMessage, type PublicQuiz, type QuizResult } from '../api';
import { Badge, Body, Button, Card, EmptyState, ErrorState, InfoBanner, InlineError, Ionicons, Loading, Muted, ProgressBar, Row, Screen, SectionTitle } from '../components/ui';
import type { StudentStackScreen } from '../navigation/types';
import { colors, fontSizes, radii, spacing, TOUCH } from '../theme';

type Loaded = { quiz: PublicQuiz; level?: { id: string; level: number; title: string; passPercent: number } };

export default function QuizPlayerScreen({ route, navigation }: StudentStackScreen<'Quiz'>) {
  const params = route.params;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [blocked, setBlocked] = useState<{ title: string; message: string; reload?: boolean } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const attemptId = useRef(Crypto.randomUUID());
  const startedAt = useRef(Date.now());
  const done = useRef(false);
  const autoSubmitted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setBlocked(null);
    try {
      const data: Loaded =
        params.kind === 'certification' ? await endpoints.certAssessment(params.levelId) : { quiz: await endpoints.getQuiz(params.quizId, params.activityId) };
      attemptId.current = Crypto.randomUUID();
      startedAt.current = Date.now();
      done.current = false;
      autoSubmitted.current = false;
      setLoaded(data);
      setAnswers({});
      setIndex(0);
      setResult(null);
      setTimeLeft(data.quiz.timeLimitSec ?? null);
      navigation.setOptions({ title: data.level ? `Level ${data.level.level} assessment` : data.quiz.title });
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, [params, navigation]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    if (!loaded || submitting || done.current) return;
    setSubmitting(true);
    setSubmitError(null);
    const body = {
      clientAttemptId: attemptId.current,
      quizVersion: loaded.quiz.version,
      answers: loaded.quiz.questions.map((q) => ({ questionId: q.id, selectedIndex: answers[q.id] ?? -1 })),
      durationSec: Math.min(86400, Math.round((Date.now() - startedAt.current) / 1000)),
    };
    try {
      const r =
        params.kind === 'certification'
          ? await endpoints.submitCertAttempt(params.levelId, body)
          : await endpoints.submitQuiz(params.quizId, { ...body, activityId: params.activityId });
      done.current = true;
      setResult(r);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DUPLICATE_SUBMISSION') {
        done.current = true;
        setBlocked({ title: 'Already submitted', message: 'This attempt was already received — your score is saved. Check your progress to see it.' });
      } else if (e instanceof ApiError && e.code === 'QUIZ_VERSION_MISMATCH') {
        setBlocked({ title: 'This quiz was updated', message: 'Your teacher or the content team changed this quiz while you were answering. Please reload and try again.', reload: true });
      } else if (e instanceof ApiError && e.code === 'DAILY_LIMIT_REACHED') {
        done.current = true;
        setBlocked({ title: 'No attempts left today', message: e.message });
      } else {
        // network or other error: keep answers and the same clientAttemptId so a retry is safe
        setSubmitError(errorMessage(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [loaded, submitting, answers, params]);

  // optional time limit
  useEffect(() => {
    if (timeLeft === null || result || blocked) return;
    if (timeLeft <= 0) {
      // auto-submit once; on failure the student can retry manually
      if (!autoSubmitted.current) {
        autoSubmitted.current = true;
        void submit();
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => (s === null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, result, blocked, submit]);

  // confirm before leaving a quiz in progress
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (done.current || !loaded || Object.keys(answers).length === 0) return;
        e.preventDefault();
        Alert.alert('Leave this quiz?', 'Your answers will not be saved.', [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, loaded, answers],
  );

  if (loading) return <Loading label="Loading quiz…" />;
  if (loadError || !loaded) {
    const locked = loadError instanceof ApiError && [403, 404, 409, 429].includes(loadError.status);
    return (
      <Screen>
        {locked ? (
          <EmptyState icon="lock-closed-outline" title="Not available" message={errorMessage(loadError)} action={<Button title="Go back" onPress={() => navigation.goBack()} />} />
        ) : (
          <ErrorState error={loadError} onRetry={load} />
        )}
      </Screen>
    );
  }

  if (blocked) {
    return (
      <Screen>
        <EmptyState
          icon={blocked.reload ? 'refresh-circle-outline' : 'checkmark-done-circle-outline'}
          title={blocked.title}
          message={blocked.message}
          action={blocked.reload ? <Button title="Reload quiz" icon="refresh" onPress={load} /> : <Button title="Done" onPress={() => navigation.goBack()} />}
        />
      </Screen>
    );
  }

  if (result) return <ResultView result={result} loaded={loaded} onDone={() => navigation.goBack()} onCertificate={(id) => navigation.replace('CertificateDetail', { id })} />;

  const { quiz } = loaded;
  if (!quiz.questions.length) return <EmptyState icon="help-circle-outline" title="No questions yet" message="This quiz doesn’t have any questions." />;
  const q = quiz.questions[index];
  const answeredCount = Object.keys(answers).length;
  const isLast = index === quiz.questions.length - 1;

  function confirmSubmit() {
    const missing = quiz.questions.length - answeredCount;
    if (missing > 0) {
      Alert.alert('Submit now?', `You haven’t answered ${missing} question${missing > 1 ? 's' : ''}. Unanswered questions score zero.`, [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Submit', onPress: () => void submit() },
      ]);
    } else void submit();
  }

  return (
    <Screen>
      {loaded.level ? <InfoBanner tone="gold" icon="ribbon-outline" message={`${loaded.level.title}: score ${loaded.level.passPercent}% or more to earn your certificate.`} /> : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <Badge label={`Question ${index + 1} of ${quiz.questions.length}`} tone="yellow" />
        {timeLeft !== null ? (
          <Badge label={`${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`} tone={timeLeft < 30 ? 'danger' : 'info'} icon="timer-outline" />
        ) : (
          <Muted>{answeredCount} answered</Muted>
        )}
      </Row>
      <ProgressBar value={((index + 1) / quiz.questions.length) * 100} style={{ marginVertical: spacing.md }} />

      <Card>
        <Text style={styles.prompt}>{q.prompt}</Text>
        {q.marks !== 1 ? <Muted>{q.marks} marks</Muted> : null}
      </Card>

      {q.options.map((o, i) => {
        const selected = answers[q.id] === i;
        return (
          <Pressable
            key={i}
            onPress={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && { opacity: 0.75 }]}
          >
            <View style={[styles.letter, selected && styles.letterSelected]}>
              <Text style={[styles.letterText, selected && { color: colors.text }]}>{String.fromCharCode(65 + i)}</Text>
            </View>
            <Text style={styles.optionText}>{o}</Text>
          </Pressable>
        );
      })}

      <InlineError message={submitError} />
      <Row style={{ marginTop: spacing.sm }}>
        <Button title="Back" variant="secondary" icon="arrow-back" onPress={() => setIndex((i) => i - 1)} disabled={index === 0} style={{ flex: 1 }} />
        {isLast || submitError || timeLeft === 0 ? (
          <Button title={submitError ? 'Retry submit' : 'Submit'} variant="primary" icon="checkmark-done" onPress={confirmSubmit} loading={submitting} style={{ flex: 1 }} />
        ) : (
          <Button title="Next" variant="accent" icon="arrow-forward" onPress={() => setIndex((i) => i + 1)} style={{ flex: 1 }} />
        )}
      </Row>
    </Screen>
  );
}

function ResultView({ result, loaded, onDone, onCertificate }: { result: QuizResult; loaded: Loaded; onDone: () => void; onCertificate: (id: string) => void }) {
  const isCert = Boolean(loaded.level);
  const good = isCert ? Boolean(result.passed) : result.percent >= 60;
  return (
    <Screen>
      <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <Ionicons name={isCert ? (result.passed ? 'ribbon' : 'refresh-circle') : good ? 'star' : 'thumbs-up'} size={56} color={good ? colors.gold : colors.primary} />
        <Text style={styles.resultTitle}>{isCert ? (result.passed ? 'You passed!' : 'Not this time') : good ? 'Well done!' : 'Good effort!'}</Text>
        <Text style={styles.resultScore}>{Math.round(result.percent)}%</Text>
        <Muted>
          {result.score} of {result.maxScore} marks · {result.correctCount}/{result.questionCount} correct
        </Muted>
        {isCert && !result.passed ? <Muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>You need {result.passPercent ?? loaded.level?.passPercent}% to pass. Review the answers and try again later.</Muted> : null}
      </Card>
      {result.certificate ? (
        <Button title="View your certificate" variant="gold" icon="ribbon-outline" onPress={() => onCertificate(result.certificate!._id)} style={{ marginBottom: spacing.sm }} />
      ) : null}
      <Button title="Done" variant="accent" onPress={onDone} />

      {result.review?.length ? (
        <>
          <SectionTitle>Review your answers</SectionTitle>
          {result.review.map((r, i) => (
            <Card key={r.questionId}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={[styles.prompt, { flex: 1, fontSize: fontSizes.md }]}>
                  {i + 1}. {r.prompt}
                </Text>
                <Ionicons name={r.correct ? 'checkmark-circle' : 'close-circle'} size={24} color={r.correct ? colors.success : colors.danger} />
              </Row>
              {r.options.map((o, oi) => {
                const isCorrect = oi === r.correctIndex;
                const isPicked = oi === r.selectedIndex;
                return (
                  <Text key={oi} style={{ paddingVertical: 2, color: isCorrect ? colors.success : isPicked ? colors.danger : colors.text, fontWeight: isCorrect || isPicked ? '700' : '400' }}>
                    {isCorrect ? '✓ ' : isPicked ? '✗ ' : '• '}
                    {o}
                    {isPicked && !isCorrect ? '  (your answer)' : ''}
                  </Text>
                );
              })}
              {r.selectedIndex === -1 ? <Muted>Not answered</Muted> : null}
              {r.explanation ? <Body style={{ marginTop: spacing.sm, color: colors.textMuted }}>{r.explanation}</Body> : null}
            </Card>
          ))}
        </>
      ) : (
        <Muted style={{ marginTop: spacing.md, textAlign: 'center' }}>Answers for this quiz are not shown after submitting.</Muted>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  prompt: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.text, lineHeight: 26 },
  option: {
    minHeight: TOUCH + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  optionSelected: { borderColor: colors.forestGreen, backgroundColor: colors.lightGreen },
  letter: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.lightGreen, alignItems: 'center', justifyContent: 'center' },
  letterSelected: { backgroundColor: colors.mangoYellow },
  letterText: { fontWeight: '800', color: colors.forestGreen },
  optionText: { flex: 1, fontSize: fontSizes.md, color: colors.text },
  resultTitle: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.forestGreen, marginTop: spacing.sm },
  resultScore: { fontSize: 48, fontWeight: '900', color: colors.text },
});
