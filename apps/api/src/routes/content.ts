import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { CONTENT_STATUS, LEARNING_ITEM_TYPES, NEWS_CATEGORIES, NEWS_CATEGORY_CODES, ROLES } from '@mango/shared';
import { authenticate, requireRole } from '../middleware/auth';
import { Activity, ActivityCompletion, LearningItem, LearningProgress, NewsArticle, Programme, Quiz, Subject } from '../models';
import { assertProgrammeAccess } from '../services/access';
import { answersSchema, publicQuiz, snapshotQuizVersion, submitAttempt } from '../services/quiz';
import { audit } from '../utils/audit';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { ah, escapeRegex, objectId, oid, pageResult, paginationSchema, param, parse } from '../utils/http';
import { isSA, isStudent, isTeacher, memberSchoolUnlessSA, studentCtx } from './helpers';

export const contentRouter = Router();
contentRouter.use(authenticate);

const SA = requireRole(ROLES.SUPER_ADMIN);
const levelsSchema = z.array(z.number().int().min(1).max(10)).min(1).max(10);

// =================================================================== subjects
contentRouter.get(
  '/subjects',
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    if (isSA(req)) return res.json(await Subject.find().sort({ displayOrder: 1 }).lean());
    const filter: Record<string, unknown> = { enabled: true };
    if (isStudent(req)) filter.classLevels = (await studentCtx(req)).levelNumber;
    res.json(await Subject.find(filter).sort({ displayOrder: 1 }).lean());
  }),
);

const subjectBody = z.object({
  code: z.string().min(2).max(10).regex(/^[A-Za-z_]+$/),
  name: z.string().min(2).max(60),
  description: z.string().max(500).optional(),
  icon: z.string().max(40).optional(),
  enabled: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  classLevels: levelsSchema.optional(),
});

contentRouter.post(
  '/subjects',
  SA,
  ah(async (req, res) => {
    const s = await Subject.create(parse(subjectBody, req.body));
    await audit(req, { action: 'subject.create', entityType: 'subject', entityId: s._id });
    res.status(201).json(s);
  }),
);

contentRouter.patch(
  '/subjects/:id',
  SA,
  ah(async (req, res) => {
    const body = parse(subjectBody.partial(), req.body);
    const s = await Subject.findByIdAndUpdate(oid(param(req, 'id')), body, { new: true, runValidators: true }).lean();
    if (!s) throw notFound('Subject');
    await audit(req, { action: 'subject.update', entityType: 'subject', entityId: s._id, after: body });
    res.json(s);
  }),
);

// =================================================================== quizzes
const questionInput = z.object({
  _id: objectId.optional(),
  prompt: z.string().min(1).max(1000),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  correctIndex: z.number().int().min(0).max(5),
  marks: z.number().min(0).max(100).default(1),
  explanation: z.string().max(1000).optional(),
});
const quizBody = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  context: z.enum(['learning', 'news', 'activity', 'certification', 'programme']),
  subjectId: objectId.optional(),
  classLevels: levelsSchema.optional(),
  timeLimitSec: z.number().int().min(10).max(7200).optional(),
  revealPolicy: z.enum(['after_submit', 'never']).optional(),
  status: z.enum(CONTENT_STATUS).optional(),
  questions: z.array(questionInput).min(1).max(100),
});

function checkQuestions(qs: z.infer<typeof questionInput>[]) {
  qs.forEach((q, i) => {
    if (q.correctIndex >= q.options.length) throw badRequest(`Question ${i + 1}: correctIndex out of range`);
  });
}

contentRouter.get(
  '/quizzes',
  requireRole(ROLES.SUPER_ADMIN, ROLES.TEACHER),
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const q = parse(
      paginationSchema.extend({
        context: z.string().optional(),
        subjectId: objectId.optional(),
        status: z.enum(CONTENT_STATUS).optional(),
        q: z.string().max(100).optional(),
        levelNumber: z.coerce.number().int().min(1).max(10).optional(),
      }),
      req.query,
    );
    const filter: Record<string, unknown> = {};
    if (q.context) filter.context = q.context;
    if (q.levelNumber) filter.classLevels = q.levelNumber;
    if (q.subjectId) filter.subjectId = oid(q.subjectId);
    if (q.q) filter.title = new RegExp(escapeRegex(q.q), 'i');
    if (isSA(req)) {
      if (q.status) filter.status = q.status;
    } else {
      // teachers: published platform quizzes for learning/activities, plus their own school quizzes
      filter.$or = [
        { status: 'published', context: { $in: ['learning', 'activity'] }, schoolId: null },
        { schoolId: req.school!.schoolId, createdBy: req.auth!.userId },
      ];
    }
    const [items, total] = await Promise.all([
      Quiz.find(filter).sort({ updatedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).populate('subjectId', 'name code').lean(),
      Quiz.countDocuments(filter),
    ]);
    res.json(pageResult(items.map((i) => ({ ...i, questionCount: i.questions.length, questions: isSA(req) ? i.questions : undefined })), total, q.page, q.pageSize));
  }),
);

contentRouter.post(
  '/quizzes',
  requireRole(ROLES.SUPER_ADMIN, ROLES.TEACHER),
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const body = parse(quizBody, req.body);
    checkQuestions(body.questions);
    const data: Record<string, unknown> = { ...body, createdBy: req.auth!.userId, version: 1 };
    if (isTeacher(req)) {
      // teacher-authored quizzes are activity quizzes owned by their school
      Object.assign(data, { context: 'activity', schoolId: req.school!.schoolId, status: 'published' });
    }
    if (body.subjectId) data.subjectId = oid(body.subjectId);
    const quiz = await Quiz.create(data);
    await snapshotQuizVersion(quiz._id);
    await audit(req, { action: 'quiz.create', entityType: 'quiz', entityId: quiz._id, schoolId: req.school?.schoolId });
    res.status(201).json(quiz);
  }),
);

async function loadEditableQuiz(req: Parameters<typeof isSA>[0]) {
  const quiz = await Quiz.findById(oid(param(req, 'id')));
  if (!quiz) throw notFound('Quiz');
  if (!isSA(req) && !(quiz.createdBy?.equals(req.auth!.userId) && quiz.schoolId?.equals(req.school!.schoolId))) throw forbidden();
  return quiz;
}

contentRouter.patch(
  '/quizzes/:id',
  requireRole(ROLES.SUPER_ADMIN, ROLES.TEACHER),
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const body = parse(quizBody.partial(), req.body);
    const quiz = await loadEditableQuiz(req);
    if (body.questions) {
      checkQuestions(body.questions);
      quiz.set('questions', body.questions);
      quiz.version = (quiz.version ?? 1) + 1; // new version; earlier attempts keep scoring against their snapshot
    }
    const { questions: _q, subjectId, context, ...rest } = body;
    quiz.set(rest);
    if (subjectId) quiz.subjectId = oid(subjectId);
    if (context && isSA(req)) quiz.context = context;
    await quiz.save();
    await snapshotQuizVersion(quiz._id);
    await audit(req, { action: body.status === 'published' ? 'quiz.publish' : 'quiz.update', entityType: 'quiz', entityId: quiz._id });
    res.json(quiz);
  }),
);

/**
 * Student quiz access rules by context. Returns the activity when the quiz is answered as an activity.
 * Certification quizzes are only reachable through /certifications.
 */
async function assertStudentQuizAccess(
  req: Parameters<typeof isSA>[0],
  quiz: { _id: Types.ObjectId; context: string; status?: string | null; classLevels?: number[] | null; schoolId?: Types.ObjectId | null },
  profile: { levelNumber: number; classSectionId: Types.ObjectId; userId: Types.ObjectId },
  activityId?: string,
) {
  if (activityId) {
    const activity = await Activity.findOne({ _id: oid(activityId), schoolId: req.school!.schoolId, quizId: quiz._id, status: 'published' }).lean();
    if (!activity || !activity.classSectionId.equals(profile.classSectionId)) throw notFound('Activity');
    if (activity.studentIds?.length && !activity.studentIds.some((s) => s.equals(profile.userId))) throw notFound('Activity');
    if (activity.startAt > new Date()) throw forbidden('This activity has not started yet');
    return activity;
  }
  if (quiz.context === 'certification') throw forbidden('Certification assessments are taken from the Certificates screen');
  if (quiz.context === 'activity') throw badRequest('activityId is required for activity quizzes');
  if (quiz.status !== 'published') throw notFound('Quiz');
  if (quiz.classLevels?.length && !quiz.classLevels.includes(profile.levelNumber)) throw notFound('Quiz');
  if (quiz.context === 'programme') {
    const programme = await Programme.findOne({ 'modules.items.quizId': quiz._id }).select('_id').lean();
    if (!programme) throw notFound('Quiz');
    await assertProgrammeAccess(req.school!.schoolId, programme._id, profile.levelNumber);
  }
  return null;
}

contentRouter.get(
  '/quizzes/:id',
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const quiz = await Quiz.findById(oid(param(req, 'id'))).populate('subjectId', 'name code').lean();
    if (!quiz) throw notFound('Quiz');
    if (isSA(req)) return res.json(quiz);
    if (isStudent(req)) {
      const profile = await studentCtx(req);
      await assertStudentQuizAccess(req, quiz, profile, typeof req.query.activityId === 'string' ? req.query.activityId : undefined);
      return res.json(publicQuiz(quiz as never));
    }
    // teachers / school admins: full quiz if platform-published or owned by their school
    if (quiz.schoolId && !quiz.schoolId.equals(req.school!.schoolId)) throw notFound('Quiz');
    res.json(quiz);
  }),
);

contentRouter.post(
  '/quizzes/:id/attempts',
  requireRole(ROLES.STUDENT),
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const body = parse(answersSchema.extend({ activityId: objectId.optional() }), req.body);
    const profile = await studentCtx(req);
    const quiz = await Quiz.findById(oid(param(req, 'id'))).lean();
    if (!quiz) throw notFound('Quiz');
    const activity = await assertStudentQuizAccess(req, quiz, profile, body.activityId);
    if (activity && new Date() > activity.dueAt && activity.status === 'closed') throw forbidden('This activity is closed');
    const result = await submitAttempt({
      schoolId: req.school!.schoolId,
      studentId: req.auth!.userId,
      classSectionId: profile.classSectionId,
      quizId: quiz._id,
      input: body,
      context: activity ? 'activity' : (quiz.context as 'learning' | 'news' | 'programme'),
      activityId: activity?._id,
    });
    if (activity) {
      await ActivityCompletion.updateOne(
        { activityId: activity._id, studentId: req.auth!.userId },
        { $setOnInsert: { schoolId: req.school!.schoolId, attemptId: result.attemptId, completedAt: new Date() } },
        { upsert: true },
      );
    }
    res.status(201).json(result);
  }),
);

// =================================================================== learning items (admin authoring)
const learningBody = z.object({
  subjectId: objectId,
  classLevels: levelsSchema,
  type: z.enum(LEARNING_ITEM_TYPES),
  title: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  body: z.string().max(20000).optional(),
  instructions: z.string().max(2000).optional(),
  audioUrl: z.string().url().optional().or(z.literal('')),
  imageUrl: z.string().url().optional().or(z.literal('')),
  estimatedMinutes: z.number().int().min(1).max(240).optional(),
  quizId: objectId.optional().nullable(),
});

contentRouter.get(
  '/content/learning-items',
  SA,
  ah(async (req, res) => {
    const q = parse(
      paginationSchema.extend({ subjectId: objectId.optional(), status: z.enum(CONTENT_STATUS).optional(), levelNumber: z.coerce.number().int().optional(), q: z.string().max(100).optional() }),
      req.query,
    );
    const filter: Record<string, unknown> = {};
    if (q.subjectId) filter.subjectId = oid(q.subjectId);
    if (q.status) filter.status = q.status;
    if (q.levelNumber) filter.classLevels = q.levelNumber;
    if (q.q) filter.title = new RegExp(escapeRegex(q.q), 'i');
    const [items, total] = await Promise.all([
      LearningItem.find(filter).sort({ updatedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).populate('subjectId', 'name code').lean(),
      LearningItem.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q.page, q.pageSize));
  }),
);

contentRouter.post(
  '/content/learning-items',
  SA,
  ah(async (req, res) => {
    const body = parse(learningBody, req.body);
    const item = await LearningItem.create({ ...body, subjectId: oid(body.subjectId), quizId: body.quizId ? oid(body.quizId) : undefined, createdBy: req.auth!.userId, status: 'draft' });
    await audit(req, { action: 'learning_item.create', entityType: 'learning_item', entityId: item._id });
    res.status(201).json(item);
  }),
);

contentRouter.patch(
  '/content/learning-items/:id',
  SA,
  ah(async (req, res) => {
    const body = parse(learningBody.partial(), req.body);
    const item = await LearningItem.findById(oid(param(req, 'id')));
    if (!item) throw notFound('Learning item');
    item.set({ ...body, ...(body.subjectId ? { subjectId: oid(body.subjectId) } : {}), ...(body.quizId !== undefined ? { quizId: body.quizId ? oid(body.quizId) : null } : {}) });
    item.version = (item.version ?? 1) + 1;
    await item.save();
    await audit(req, { action: 'learning_item.update', entityType: 'learning_item', entityId: item._id });
    res.json(item);
  }),
);

/** Moderation workflow: draft → review → published → archived (published may go back to draft). */
const TRANSITIONS: Record<string, string[]> = {
  draft: ['review', 'published', 'archived'],
  review: ['draft', 'published', 'archived'],
  published: ['draft', 'archived'],
  archived: ['draft'],
};

contentRouter.post(
  '/content/learning-items/:id/status',
  SA,
  ah(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(CONTENT_STATUS) }), req.body);
    const item = await LearningItem.findById(oid(param(req, 'id')));
    if (!item) throw notFound('Learning item');
    if (!TRANSITIONS[item.status!]?.includes(status)) throw badRequest(`Cannot move from ${item.status} to ${status}`);
    item.status = status;
    if (status === 'published') item.publishedAt = new Date();
    await item.save();
    await audit(req, { action: `learning_item.${status}`, entityType: 'learning_item', entityId: item._id });
    res.json(item);
  }),
);

// =================================================================== learning (student / teacher browsing)
contentRouter.get(
  '/learning/subjects',
  requireRole(ROLES.STUDENT),
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const subjects = await Subject.find({ enabled: true, classLevels: profile.levelNumber }).sort({ displayOrder: 1 }).lean();
    const [totals, done] = await Promise.all([
      LearningItem.aggregate([{ $match: { status: 'published', classLevels: profile.levelNumber } }, { $group: { _id: '$subjectId', n: { $sum: 1 } } }]),
      LearningProgress.aggregate([{ $match: { studentId: req.auth!.userId, status: 'completed' } }, { $group: { _id: '$subjectId', n: { $sum: 1 } } }]),
    ]);
    const t = new Map(totals.map((x) => [x._id.toString(), x.n]));
    const d = new Map(done.map((x) => [x._id.toString(), x.n]));
    res.json(
      subjects.map((s) => {
        const total = t.get(s._id.toString()) ?? 0;
        const completed = Math.min(d.get(s._id.toString()) ?? 0, total);
        return { ...s, totalItems: total, completedItems: completed, progressPercent: total ? Math.round((completed / total) * 100) : 0 };
      }),
    );
  }),
);

contentRouter.get(
  '/learning/items',
  requireRole(ROLES.STUDENT, ROLES.TEACHER),
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const q = parse(
      paginationSchema.extend({ subjectId: objectId.optional(), type: z.enum(LEARNING_ITEM_TYPES).optional(), levelNumber: z.coerce.number().int().min(1).max(10).optional(), view: z.enum(['all', 'mine']).default('all') }),
      req.query,
    );
    const filter: Record<string, unknown> = { status: 'published' };
    let level = q.levelNumber;
    if (isStudent(req)) level = (await studentCtx(req)).levelNumber;
    if (level) filter.classLevels = level;
    if (q.subjectId) filter.subjectId = oid(q.subjectId);
    if (q.type) filter.type = q.type;
    if (isStudent(req) && q.view === 'mine') {
      const mine = await LearningProgress.find({ studentId: req.auth!.userId }).select('learningItemId').lean();
      filter._id = { $in: mine.map((m) => m.learningItemId) };
    }
    const [items, total] = await Promise.all([
      LearningItem.find(filter).select('-body').sort({ publishedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).populate('subjectId', 'name code icon').lean(),
      LearningItem.countDocuments(filter),
    ]);
    let progress = new Map<string, { status: string; progressPct: number }>();
    if (isStudent(req)) {
      const rows = await LearningProgress.find({ studentId: req.auth!.userId, learningItemId: { $in: items.map((i) => i._id) } }).lean();
      progress = new Map(rows.map((r) => [r.learningItemId.toString(), { status: r.status!, progressPct: r.progressPct ?? 0 }]));
    }
    res.json(pageResult(items.map((i) => ({ ...i, progress: progress.get(i._id.toString()) ?? null })), total, q.page, q.pageSize));
  }),
);

contentRouter.get(
  '/learning/continue',
  requireRole(ROLES.STUDENT),
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const rows = await LearningProgress.find({ studentId: req.auth!.userId, status: 'in_progress' }).sort({ lastOpenedAt: -1 }).limit(10).lean();
    const items = await LearningItem.find({ _id: { $in: rows.map((r) => r.learningItemId) }, status: 'published', classLevels: profile.levelNumber })
      .select('-body')
      .populate('subjectId', 'name code icon')
      .lean();
    const map = new Map(items.map((i) => [i._id.toString(), i]));
    res.json(rows.filter((r) => map.has(r.learningItemId.toString())).map((r) => ({ ...map.get(r.learningItemId.toString()), progress: { status: r.status, progressPct: r.progressPct } })));
  }),
);

contentRouter.get(
  '/learning/items/:id',
  requireRole(ROLES.STUDENT, ROLES.TEACHER),
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const item = await LearningItem.findOne({ _id: oid(param(req, 'id')), status: 'published' }).populate('subjectId', 'name code icon').lean();
    if (!item) throw notFound('Learning item');
    let progress = null;
    if (isStudent(req)) {
      const profile = await studentCtx(req);
      if (!item.classLevels.includes(profile.levelNumber)) throw notFound('Learning item');
      progress = await LearningProgress.findOneAndUpdate(
        { studentId: req.auth!.userId, learningItemId: item._id },
        {
          $set: { lastOpenedAt: new Date() },
          $setOnInsert: { schoolId: req.school!.schoolId, subjectId: (item.subjectId as unknown as { _id: Types.ObjectId })._id, status: 'in_progress', progressPct: 0 },
        },
        { upsert: true, new: true },
      ).lean();
    }
    const quiz = item.quizId ? await Quiz.findById(item.quizId).select('title questions version status').lean() : null;
    res.json({
      ...item,
      progress,
      quiz: quiz && quiz.status === 'published' ? { id: quiz._id, title: quiz.title, questionCount: quiz.questions.length, version: quiz.version } : null,
    });
  }),
);

contentRouter.post(
  '/learning/items/:id/progress',
  requireRole(ROLES.STUDENT),
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const body = parse(z.object({ progressPct: z.number().min(0).max(100).optional(), completed: z.boolean().optional() }), req.body);
    const profile = await studentCtx(req);
    const item = await LearningItem.findOne({ _id: oid(param(req, 'id')), status: 'published', classLevels: profile.levelNumber }).lean();
    if (!item) throw notFound('Learning item');
    const completed = body.completed || body.progressPct === 100;
    const existing = await LearningProgress.findOne({ studentId: req.auth!.userId, learningItemId: item._id }).lean();
    const $set: Record<string, unknown> = { lastOpenedAt: new Date() };
    if (completed) Object.assign($set, { status: 'completed', progressPct: 100, completedAt: existing?.completedAt ?? new Date() });
    else if (body.progressPct !== undefined && existing?.status !== 'completed') $set.progressPct = Math.max(body.progressPct, existing?.progressPct ?? 0);
    const p = await LearningProgress.findOneAndUpdate(
      { studentId: req.auth!.userId, learningItemId: item._id },
      { $set, $setOnInsert: { schoolId: req.school!.schoolId, subjectId: item.subjectId, ...(completed ? {} : { status: 'in_progress' }) } },
      { upsert: true, new: true },
    ).lean();
    res.json(p);
  }),
);

// =================================================================== news
const newsBody = z.object({
  category: z.enum(NEWS_CATEGORY_CODES as [string, ...string[]]),
  title: z.string().min(2).max(200),
  summary: z.string().min(2).max(600),
  body: z.string().max(20000).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  sourceName: z.string().max(120).optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  targetClasses: levelsSchema.optional(),
  featured: z.boolean().optional(),
  publishAt: z.coerce.date().optional(),
  archiveAt: z.coerce.date().nullable().optional(),
  quizId: objectId.optional().nullable(),
});

function visibleNewsFilter(level?: number) {
  const now = new Date();
  const f: Record<string, unknown> = { status: 'published', publishAt: { $lte: now }, $or: [{ archiveAt: null }, { archiveAt: { $gt: now } }] };
  if (level) f.targetClasses = level;
  return f;
}

contentRouter.get(
  '/news/categories',
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const level = isStudent(req) ? (await studentCtx(req)).levelNumber : undefined;
    const counts = await NewsArticle.aggregate([{ $match: visibleNewsFilter(level) }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
    const m = new Map(counts.map((c) => [c._id, c.n]));
    res.json(NEWS_CATEGORIES.map((c) => ({ ...c, articleCount: m.get(c.code) ?? 0 })));
  }),
);

contentRouter.get(
  '/news',
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const q = parse(
      paginationSchema.extend({ category: z.enum(NEWS_CATEGORY_CODES as [string, ...string[]]).optional(), status: z.enum(CONTENT_STATUS).optional(), featured: z.coerce.boolean().optional(), q: z.string().max(100).optional() }),
      req.query,
    );
    let filter: Record<string, unknown>;
    if (isSA(req)) {
      filter = q.status ? { status: q.status } : {};
    } else {
      filter = visibleNewsFilter(isStudent(req) ? (await studentCtx(req)).levelNumber : undefined);
    }
    if (q.category) filter.category = q.category;
    if (q.featured) filter.featured = true;
    if (q.q) filter.title = new RegExp(escapeRegex(q.q), 'i');
    const [items, total] = await Promise.all([
      NewsArticle.find(filter).select(isSA(req) ? '' : '-body').sort({ featured: -1, publishAt: -1, createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      NewsArticle.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q.page, q.pageSize));
  }),
);

contentRouter.get(
  '/news/:id',
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const id = oid(param(req, 'id'));
    const filter: Record<string, unknown> = isSA(req) ? { _id: id } : { _id: id, ...visibleNewsFilter(isStudent(req) ? (await studentCtx(req)).levelNumber : undefined) };
    const article = await NewsArticle.findOne(filter).lean();
    if (!article) throw notFound('Article');
    const quiz = article.quizId ? await Quiz.findById(article.quizId).select('title questions version status').lean() : null;
    res.json({ ...article, quiz: quiz && quiz.status === 'published' ? { id: quiz._id, title: quiz.title, questionCount: quiz.questions.length, version: quiz.version } : null });
  }),
);

contentRouter.post(
  '/news',
  SA,
  ah(async (req, res) => {
    const body = parse(newsBody, req.body);
    const a = await NewsArticle.create({ ...body, quizId: body.quizId ? oid(body.quizId) : undefined, createdBy: req.auth!.userId, status: 'draft' });
    await audit(req, { action: 'news.create', entityType: 'news_article', entityId: a._id });
    res.status(201).json(a);
  }),
);

contentRouter.patch(
  '/news/:id',
  SA,
  ah(async (req, res) => {
    const body = parse(newsBody.partial().extend({ status: z.enum(['draft', 'review']).optional() }), req.body);
    const a = await NewsArticle.findByIdAndUpdate(
      oid(param(req, 'id')),
      { ...body, ...(body.quizId !== undefined ? { quizId: body.quizId ? oid(body.quizId) : null } : {}) },
      { new: true, runValidators: true },
    ).lean();
    if (!a) throw notFound('Article');
    await audit(req, { action: 'news.update', entityType: 'news_article', entityId: a._id });
    res.json(a);
  }),
);

contentRouter.post(
  '/news/:id/publish',
  SA,
  ah(async (req, res) => {
    const a = await NewsArticle.findById(oid(param(req, 'id')));
    if (!a) throw notFound('Article');
    a.status = 'published';
    if (!a.publishAt) a.publishAt = new Date();
    await a.save();
    await audit(req, { action: 'news.publish', entityType: 'news_article', entityId: a._id, summary: a.title });
    res.json(a);
  }),
);

contentRouter.post(
  '/news/:id/archive',
  SA,
  ah(async (req, res) => {
    const a = await NewsArticle.findByIdAndUpdate(oid(param(req, 'id')), { status: 'archived', archiveAt: new Date() }, { new: true }).lean();
    if (!a) throw notFound('Article');
    await audit(req, { action: 'news.archive', entityType: 'news_article', entityId: a._id });
    res.json(a);
  }),
);
