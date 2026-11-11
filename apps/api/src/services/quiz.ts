import type { Types } from 'mongoose';
import { z } from 'zod';
import { ERROR_CODES } from '@mango/shared';
import { AssessmentAttempt, Quiz, QuizVersion } from '../models';
import { AppError, badRequest, notFound } from '../utils/errors';

export const answersSchema = z.object({
  clientAttemptId: z.string().min(8).max(64),
  quizVersion: z.number().int().min(1),
  durationSec: z.number().int().min(0).max(86400).optional(),
  answers: z
    .array(z.object({ questionId: z.string(), selectedIndex: z.number().int().min(-1).max(10) }))
    .max(200),
});
export type AnswersInput = z.infer<typeof answersSchema>;

interface QuestionLike {
  _id: Types.ObjectId;
  prompt: string;
  options: string[];
  correctIndex: number;
  marks?: number | null;
  explanation?: string | null;
}

/** Student-safe view: answer keys and explanations are never sent before submission. */
export function publicQuiz(quiz: {
  _id: Types.ObjectId;
  title: string;
  description?: string | null;
  version?: number | null;
  timeLimitSec?: number | null;
  context: string;
  questions: QuestionLike[];
}) {
  return {
    id: quiz._id,
    title: quiz.title,
    description: quiz.description,
    version: quiz.version ?? 1,
    timeLimitSec: quiz.timeLimitSec,
    context: quiz.context,
    questionCount: quiz.questions.length,
    totalMarks: quiz.questions.reduce((s, q) => s + (q.marks ?? 1), 0),
    questions: quiz.questions.map((q) => ({ id: q._id, prompt: q.prompt, options: q.options, marks: q.marks ?? 1 })),
  };
}

/** Snapshot the current questions as an immutable version (called on create and on every content change). */
export async function snapshotQuizVersion(quizId: Types.ObjectId) {
  const quiz = await Quiz.findById(quizId).lean();
  if (!quiz) return;
  await QuizVersion.updateOne(
    { quizId, version: quiz.version },
    { $setOnInsert: { quizId, version: quiz.version, questions: quiz.questions } },
    { upsert: true },
  );
}

/** Score against the exact version attempted. */
export async function scoreAgainstVersion(quizId: Types.ObjectId, version: number, answers: AnswersInput['answers']) {
  const snap = await QuizVersion.findOne({ quizId, version }).lean();
  if (!snap) throw new AppError(409, ERROR_CODES.QUIZ_VERSION_MISMATCH, 'This quiz version is no longer available — reload the quiz');
  const questions = snap.questions as unknown as QuestionLike[];
  const byId = new Map(questions.map((q) => [q._id.toString(), q]));
  const seen = new Set<string>();
  for (const a of answers) {
    if (!byId.has(a.questionId)) throw badRequest(`Unknown question ${a.questionId}`);
    if (seen.has(a.questionId)) throw badRequest(`Question ${a.questionId} answered twice`);
    seen.add(a.questionId);
    const q = byId.get(a.questionId)!;
    if (a.selectedIndex >= q.options.length) throw badRequest(`Invalid option for question ${a.questionId}`);
  }
  const answerMap = new Map(answers.map((a) => [a.questionId, a.selectedIndex]));
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  const graded = questions.map((q) => {
    const marks = q.marks ?? 1;
    maxScore += marks;
    const sel = answerMap.has(q._id.toString()) ? answerMap.get(q._id.toString())! : -1;
    const correct = sel === q.correctIndex;
    if (correct) {
      score += marks;
      correctCount++;
    }
    return { questionId: q._id, selectedIndex: sel, correct, marksAwarded: correct ? marks : 0 };
  });
  return {
    graded,
    questions,
    score,
    maxScore,
    correctCount,
    questionCount: questions.length,
    percent: maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0,
  };
}

export async function submitAttempt(params: {
  schoolId: Types.ObjectId;
  studentId: Types.ObjectId;
  classSectionId?: Types.ObjectId;
  quizId: Types.ObjectId;
  input: AnswersInput;
  context: 'learning' | 'news' | 'activity' | 'certification' | 'programme';
  activityId?: Types.ObjectId;
  certificationLevelId?: Types.ObjectId;
}) {
  const { schoolId, studentId, quizId, input } = params;
  const quiz = await Quiz.findById(quizId).lean();
  if (!quiz) throw notFound('Quiz');

  const existing = await AssessmentAttempt.findOne({ studentId, clientAttemptId: input.clientAttemptId }).lean();
  if (existing) throw new AppError(409, ERROR_CODES.DUPLICATE_SUBMISSION, 'This attempt was already submitted', { attemptId: existing._id });

  const result = await scoreAgainstVersion(quizId, input.quizVersion, input.answers);
  let attempt;
  try {
    attempt = await AssessmentAttempt.create({
      schoolId,
      studentId,
      quizId,
      quizVersion: input.quizVersion,
      context: params.context,
      subjectId: quiz.subjectId,
      activityId: params.activityId,
      certificationLevelId: params.certificationLevelId,
      classSectionId: params.classSectionId,
      clientAttemptId: input.clientAttemptId,
      answers: result.graded,
      score: result.score,
      maxScore: result.maxScore,
      correctCount: result.correctCount,
      questionCount: result.questionCount,
      percent: result.percent,
      durationSec: input.durationSec,
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new AppError(409, ERROR_CODES.DUPLICATE_SUBMISSION, 'This attempt was already submitted');
    throw e;
  }

  const reveal = quiz.revealPolicy !== 'never';
  return {
    attemptId: attempt._id,
    score: result.score,
    maxScore: result.maxScore,
    percent: result.percent,
    correctCount: result.correctCount,
    questionCount: result.questionCount,
    review: reveal
      ? result.questions.map((q, i) => ({
          questionId: q._id,
          prompt: q.prompt,
          options: q.options,
          selectedIndex: result.graded[i].selectedIndex,
          correctIndex: q.correctIndex,
          correct: result.graded[i].correct,
          explanation: q.explanation,
        }))
      : undefined,
  };
}
