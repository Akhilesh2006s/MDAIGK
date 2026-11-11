import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { CONTENT_STATUS, ERROR_CODES, GAME_OUTCOMES, ROLES } from '@mango/shared';
import { authenticate, requireRole } from '../middleware/auth';
import {
  AssessmentAttempt,
  Certificate,
  CertificationLevel,
  Game,
  GameAttempt,
  Programme,
  ProgrammeEnrolment,
  Quiz,
  SchoolProgrammeEntitlement,
  StudentProfile,
} from '../models';
import { assertProgrammeAccess, evaluateEntitlement, programmeAccessMap, teacherSectionIds } from '../services/access';
import { assertCanAttempt, issueCertificateIfPassed, levelStatus, renderCertificatePdf, verificationUrl } from '../services/certificates';
import { dailyUsageFor, reserveGameAttempt } from '../services/games';
import { answersSchema, publicQuiz, submitAttempt } from '../services/quiz';
import { audit, notify } from '../utils/audit';
import { AppError, badRequest, forbidden, notFound } from '../utils/errors';
import { ah, objectId, oid, param, parse } from '../utils/http';
import { isSA, isStudent, memberSchoolUnlessSA, studentCtx } from './helpers';

export const engagementRouter = Router();
export const publicRouter = Router();

const SA = requireRole(ROLES.SUPER_ADMIN);
const STUDENT = requireRole(ROLES.STUDENT);
const levelsSchema = z.array(z.number().int().min(1).max(10)).min(1).max(10);

// =================================================================== games
engagementRouter.get(
  '/games',
  authenticate,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    if (isSA(req)) return res.json(await Game.find().sort({ code: 1 }).lean());
    if (!isStudent(req)) return res.json(await Game.find({ enabled: true }).select('-config').lean());
    const profile = await studentCtx(req);
    const games = await Game.find({ enabled: true, classLevels: profile.levelNumber }).lean();
    const usage = await dailyUsageFor(req.auth!.userId, games, req.school!.timezone);
    const best = await GameAttempt.aggregate([
      { $match: { studentId: req.auth!.userId, outcome: 'completed' } },
      { $group: { _id: '$gameId', bestScore: { $max: '$score' }, bestLevel: { $max: '$level' }, plays: { $sum: 1 } } },
    ]);
    const b = new Map(best.map((x) => [x._id.toString(), x]));
    res.json(
      games.map((g) => ({
        ...g,
        dailyUsage: usage.get(g._id.toString()),
        progress: { bestScore: b.get(g._id.toString())?.bestScore ?? 0, bestLevel: b.get(g._id.toString())?.bestLevel ?? 0, completedPlays: b.get(g._id.toString())?.plays ?? 0 },
      })),
    );
  }),
);

engagementRouter.get(
  '/games/daily-usage',
  authenticate,
  STUDENT,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const games = await Game.find({ enabled: true, classLevels: profile.levelNumber }).lean();
    const usage = await dailyUsageFor(req.auth!.userId, games, req.school!.timezone);
    res.json(games.map((g) => ({ gameId: g._id, code: g.code, name: g.name, ...usage.get(g._id.toString()) })));
  }),
);

engagementRouter.patch(
  '/games/:id',
  authenticate,
  SA,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(60).optional(),
        description: z.string().max(500).optional(),
        enabled: z.boolean().optional(),
        classLevels: levelsSchema.optional(),
        dailyLimit: z.number().int().min(1).max(20).optional(),
        config: z.record(z.unknown()).optional(),
      }),
      req.body,
    );
    const g = await Game.findByIdAndUpdate(oid(param(req, 'id')), body, { new: true, runValidators: true }).lean();
    if (!g) throw notFound('Game');
    await audit(req, { action: 'game.update', entityType: 'game', entityId: g._id, after: body });
    res.json(g);
  }),
);

// Start a game: atomically consumes one of today's attempts.
engagementRouter.post(
  '/games/:id/attempts',
  authenticate,
  STUDENT,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const game = await Game.findOne({ _id: oid(param(req, 'id')), enabled: true, classLevels: profile.levelNumber }).lean();
    if (!game) throw notFound('Game');
    const { attempt, usage } = await reserveGameAttempt({
      schoolId: req.school!.schoolId,
      studentId: req.auth!.userId,
      classSectionId: profile.classSectionId,
      gameId: game._id,
      dailyLimit: game.dailyLimit ?? 2,
      timezone: req.school!.timezone,
    });
    res.status(201).json({ attemptId: attempt._id, seq: attempt.seq, config: game.config ?? {}, dailyUsage: usage });
  }),
);

// Finish a game: record score / level / duration / outcome. Only once per attempt.
engagementRouter.patch(
  '/games/attempts/:attemptId',
  authenticate,
  STUDENT,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        score: z.number().int().min(0).max(1_000_000),
        level: z.number().int().min(1).max(1000).default(1),
        durationSec: z.number().int().min(0).max(7200),
        outcome: z.enum(GAME_OUTCOMES).refine((o) => o !== 'in_progress', 'Outcome must be final'),
      }),
      req.body,
    );
    const attempt = await GameAttempt.findOneAndUpdate(
      { _id: oid(param(req, 'attemptId')), studentId: req.auth!.userId, schoolId: req.school!.schoolId, outcome: 'in_progress' },
      { ...body, finishedAt: new Date() },
      { new: true },
    ).lean();
    if (!attempt) throw notFound('Active game attempt');
    res.json(attempt);
  }),
);

engagementRouter.get(
  '/games/:id/history',
  authenticate,
  STUDENT,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const rows = await GameAttempt.find({ studentId: req.auth!.userId, gameId: oid(param(req, 'id')) }).sort({ startedAt: -1 }).limit(30).lean();
    res.json(rows);
  }),
);

// =================================================================== programmes
const itemInput = z.object({
  _id: objectId.optional(),
  title: z.string().min(1).max(200),
  type: z.enum(['lesson', 'activity', 'quiz', 'experiment']).default('lesson'),
  content: z.string().max(20000).optional(),
  quizId: objectId.optional().nullable(),
  required: z.boolean().default(true),
});
const programmeBody = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Za-z_]+$/),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  premium: z.boolean().default(false),
  classLevels: levelsSchema.optional(),
  status: z.enum(CONTENT_STATUS).optional(),
  displayOrder: z.number().int().optional(),
  modules: z
    .array(z.object({ _id: objectId.optional(), title: z.string().min(1).max(200), description: z.string().max(1000).optional(), order: z.number().int().default(0), items: z.array(itemInput).max(100) }))
    .max(50)
    .optional(),
});

function requiredItemIds(p: { modules?: Array<{ items?: Array<{ _id: Types.ObjectId; required?: boolean | null }> }> }) {
  return (p.modules ?? []).flatMap((m) => (m.items ?? []).filter((i) => i.required !== false).map((i) => i._id.toString()));
}

engagementRouter.get(
  '/programmes',
  authenticate,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    if (isSA(req)) {
      const [programmes, ents, enrol] = await Promise.all([
        Programme.find().sort({ displayOrder: 1 }).lean(),
        SchoolProgrammeEntitlement.find({ enabled: true }).lean(),
        ProgrammeEnrolment.aggregate([{ $group: { _id: '$programmeId', n: { $sum: 1 } } }]),
      ]);
      const e = new Map(enrol.map((x) => [x._id.toString(), x.n]));
      return res.json(
        programmes.map((p) => ({
          ...p,
          enabledSchools: ents.filter((x) => x.programmeId.equals(p._id) && evaluateEntitlement(x).enabled).length,
          enrolments: e.get(p._id.toString()) ?? 0,
        })),
      );
    }
    const access = await programmeAccessMap(req.school!.schoolId);
    const programmes = await Programme.find({ status: 'published' }).sort({ displayOrder: 1 }).lean();
    let level: number | undefined;
    let enrolments = new Map<string, { progressPct?: number | null; completedAt?: Date | null }>();
    if (isStudent(req)) {
      level = (await studentCtx(req)).levelNumber;
      const rows = await ProgrammeEnrolment.find({ studentId: req.auth!.userId }).lean();
      enrolments = new Map(rows.map((r) => [r.programmeId.toString(), r]));
    }
    const shaped = programmes.map((p) => {
      let a = access.get(p._id.toString()) ?? { enabled: false, reason: 'NOT_ENABLED' as const };
      if (a.enabled && level && p.classLevels?.length && !p.classLevels.includes(level)) a = { enabled: false, reason: 'CLASS_NOT_ELIGIBLE' };
      const en = enrolments.get(p._id.toString());
      return {
        id: p._id,
        code: p.code,
        name: p.name,
        description: p.description,
        premium: p.premium,
        moduleCount: p.modules?.length ?? 0,
        locked: !a.enabled,
        lockReason: a.enabled ? null : a.reason,
        validUntil: a.validUntil ?? null,
        enrolment: en ? { progressPercent: en.progressPct ?? 0, completed: Boolean(en.completedAt) } : null,
        action: !a.enabled ? 'locked' : en ? 'continue' : 'explore',
      };
    });
    // Premium academies and the separate Young Scientist programme are returned in distinct groups.
    res.json({ premiumAcademies: shaped.filter((p) => p.premium), otherProgrammes: shaped.filter((p) => !p.premium) });
  }),
);

engagementRouter.get(
  '/programmes/:id',
  authenticate,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const id = oid(param(req, 'id'));
    if (isSA(req)) {
      const p = await Programme.findById(id).lean();
      if (!p) throw notFound('Programme');
      return res.json(p);
    }
    const level = isStudent(req) ? (await studentCtx(req)).levelNumber : undefined;
    // Protected module content is only returned when the school entitlement is valid.
    const programme = await assertProgrammeAccess(req.school!.schoolId, id, level);
    let enrolment = null;
    if (isStudent(req)) enrolment = await ProgrammeEnrolment.findOne({ studentId: req.auth!.userId, programmeId: id }).lean();
    const done = new Set((enrolment?.completedItemIds ?? []).map((x) => x.toString()));
    res.json({
      ...programme,
      modules: (programme.modules ?? [])
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((m) => ({ ...m, items: (m.items ?? []).map((i) => ({ ...i, completed: done.has(i._id.toString()) })) })),
      enrolment,
    });
  }),
);

engagementRouter.post(
  '/programmes',
  authenticate,
  SA,
  ah(async (req, res) => {
    const body = parse(programmeBody, req.body);
    const p = await Programme.create(body);
    await audit(req, { action: 'programme.create', entityType: 'programme', entityId: p._id });
    res.status(201).json(p);
  }),
);

engagementRouter.patch(
  '/programmes/:id',
  authenticate,
  SA,
  ah(async (req, res) => {
    const body = parse(programmeBody.partial(), req.body);
    const p = await Programme.findById(oid(param(req, 'id')));
    if (!p) throw notFound('Programme');
    p.set(body);
    await p.save();
    await audit(req, { action: 'programme.update', entityType: 'programme', entityId: p._id });
    res.json(p);
  }),
);

engagementRouter.post(
  '/programmes/:id/enrolments',
  authenticate,
  STUDENT,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const programme = await assertProgrammeAccess(req.school!.schoolId, oid(param(req, 'id')), profile.levelNumber);
    const e = await ProgrammeEnrolment.findOneAndUpdate(
      { studentId: req.auth!.userId, programmeId: programme._id },
      { $setOnInsert: { schoolId: req.school!.schoolId, startedAt: new Date(), progressPct: 0 }, $set: { lastActivityAt: new Date() } },
      { upsert: true, new: true },
    ).lean();
    res.status(201).json(e);
  }),
);

engagementRouter.post(
  '/programmes/:id/items/:itemId/complete',
  authenticate,
  STUDENT,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const programme = await assertProgrammeAccess(req.school!.schoolId, oid(param(req, 'id')), profile.levelNumber);
    const itemId = oid(param(req, 'itemId'));
    const item = (programme.modules ?? []).flatMap((m) => m.items ?? []).find((i) => i._id.equals(itemId));
    if (!item) throw notFound('Programme item');
    if (item.quizId && !(await AssessmentAttempt.exists({ studentId: req.auth!.userId, quizId: item.quizId }))) {
      throw badRequest('Complete the quiz for this item first');
    }
    const enrolment = await ProgrammeEnrolment.findOneAndUpdate(
      { studentId: req.auth!.userId, programmeId: programme._id },
      { $addToSet: { completedItemIds: itemId }, $set: { lastActivityAt: new Date() }, $setOnInsert: { schoolId: req.school!.schoolId, startedAt: new Date() } },
      { upsert: true, new: true },
    );
    const required = requiredItemIds(programme as never);
    const done = new Set(enrolment.completedItemIds.map((x) => x.toString()));
    const completedRequired = required.filter((r) => done.has(r)).length;
    enrolment.progressPct = required.length ? Math.round((completedRequired / required.length) * 1000) / 10 : 100;
    if (enrolment.progressPct >= 100 && !enrolment.completedAt) enrolment.completedAt = new Date();
    await enrolment.save();
    res.json(enrolment);
  }),
);

// =================================================================== certification levels
const certLevelBody = z.object({
  level: z.number().int().min(1).max(10),
  title: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  eligibleClassLevels: levelsSchema.optional(),
  prerequisiteLevel: z.number().int().min(1).max(10).nullable().optional(),
  quizId: objectId.nullable().optional(),
  passPercent: z.number().min(1).max(100).optional(),
  maxAttemptsPerDay: z.number().int().min(1).max(20).optional(),
  status: z.enum(CONTENT_STATUS).optional(),
});

engagementRouter.get(
  '/certifications/levels',
  authenticate,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    if (!isStudent(req)) return res.json(await CertificationLevel.find(isSA(req) ? {} : { status: 'published' }).sort({ level: 1 }).populate('quizId', 'title version').lean());
    const profile = await studentCtx(req);
    const [levels, certs] = await Promise.all([
      CertificationLevel.find({ status: 'published' }).sort({ level: 1 }).lean(),
      Certificate.find({ studentId: req.auth!.userId }).lean(),
    ]);
    const certified = new Set(certs.map((c) => c.level));
    const best = await AssessmentAttempt.aggregate([
      { $match: { studentId: req.auth!.userId, context: 'certification' } },
      { $group: { _id: '$certificationLevelId', best: { $max: '$percent' }, attempts: { $sum: 1 } } },
    ]);
    const bm = new Map(best.map((b) => [b._id?.toString(), b]));
    const shaped = levels.map((l) => {
      const st = levelStatus(l, profile.levelNumber, certified);
      const cert = certs.find((c) => c.level === l.level);
      return {
        id: l._id,
        level: l.level,
        title: l.title,
        description: l.description,
        passPercent: l.passPercent,
        prerequisiteLevel: l.prerequisiteLevel,
        state: st.state,
        lockReason: st.reason ?? null,
        bestPercent: bm.get(l._id.toString())?.best ?? null,
        attempts: bm.get(l._id.toString())?.attempts ?? 0,
        certificate: cert ? { id: cert._id, certificateNumber: cert.certificateNumber, issuedAt: cert.issuedAt } : null,
      };
    });
    const current = shaped.filter((s) => s.state === 'certified').reduce((m, s) => Math.max(m, s.level), 0);
    res.json({ currentLevel: current, levels: shaped });
  }),
);

engagementRouter.post(
  '/certifications/levels',
  authenticate,
  SA,
  ah(async (req, res) => {
    const body = parse(certLevelBody, req.body);
    const l = await CertificationLevel.create({ ...body, quizId: body.quizId ? oid(body.quizId) : undefined });
    await audit(req, { action: 'certification_level.create', entityType: 'certification_level', entityId: l._id });
    res.status(201).json(l);
  }),
);

engagementRouter.patch(
  '/certifications/levels/:id',
  authenticate,
  SA,
  ah(async (req, res) => {
    const body = parse(certLevelBody.partial(), req.body);
    const l = await CertificationLevel.findByIdAndUpdate(
      oid(param(req, 'id')),
      { ...body, ...(body.quizId !== undefined ? { quizId: body.quizId ? oid(body.quizId) : null } : {}) },
      { new: true, runValidators: true },
    ).lean();
    if (!l) throw notFound('Certification level');
    await audit(req, { action: 'certification_level.update', entityType: 'certification_level', entityId: l._id, after: body });
    res.json(l);
  }),
);

engagementRouter.get(
  '/certifications/levels/:id/assessment',
  authenticate,
  STUDENT,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const profile = await studentCtx(req);
    const level = await CertificationLevel.findOne({ _id: oid(param(req, 'id')), status: 'published' }).lean();
    if (!level) throw notFound('Certification level');
    await assertCanAttempt(level, profile, req.school!.timezone);
    const quiz = await Quiz.findById(level.quizId).lean();
    if (!quiz) throw notFound('Assessment');
    res.json({ level: { id: level._id, level: level.level, title: level.title, passPercent: level.passPercent }, quiz: publicQuiz(quiz as never) });
  }),
);

engagementRouter.post(
  '/certifications/levels/:id/attempts',
  authenticate,
  STUDENT,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const body = parse(answersSchema, req.body);
    const profile = await studentCtx(req);
    const level = await CertificationLevel.findOne({ _id: oid(param(req, 'id')), status: 'published' }).lean();
    if (!level || !level.quizId) throw notFound('Certification level');
    await assertCanAttempt(level, profile, req.school!.timezone);
    const result = await submitAttempt({
      schoolId: req.school!.schoolId,
      studentId: req.auth!.userId,
      classSectionId: profile.classSectionId,
      quizId: level.quizId,
      input: body,
      context: 'certification',
      certificationLevelId: level._id,
    });
    const issued = await issueCertificateIfPassed({ level, attempt: { attemptId: result.attemptId, percent: result.percent }, studentId: req.auth!.userId, schoolId: req.school!.schoolId });
    if (issued.certificate) {
      await notify([req.auth!.userId], { title: `Certificate earned: Level ${level.level}`, body: level.title, type: 'certificate', schoolId: req.school!.schoolId });
    }
    res.status(201).json({ ...result, passPercent: level.passPercent, passed: issued.passed, certificate: issued.certificate });
  }),
);

// =================================================================== certificates
/** Who may read a student's certificates: self, SA, own-school admin, assigned teacher. */
async function assertCanViewStudent(req: Request, studentId: Types.ObjectId) {
  if (isSA(req)) return;
  if (isStudent(req)) {
    if (!studentId.equals(req.auth!.userId)) throw forbidden();
    return;
  }
  const profile = await StudentProfile.findOne({ userId: studentId, schoolId: req.school!.schoolId }).lean();
  if (!profile) throw notFound('Student');
  if (req.auth!.role === ROLES.SCHOOL_ADMIN) return;
  const sections = await teacherSectionIds(req.auth!.userId, req.school!.schoolId);
  if (!sections.some((s) => s.equals(profile.classSectionId))) throw forbidden('This student is not in your assigned classes');
}

engagementRouter.get(
  '/students/:studentId/certificates',
  authenticate,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const studentId = oid(param(req, 'studentId'));
    await assertCanViewStudent(req, studentId);
    res.json(await Certificate.find({ studentId }).sort({ level: 1 }).lean());
  }),
);

engagementRouter.get(
  '/certificates/:id',
  authenticate,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const cert = await Certificate.findById(oid(param(req, 'id'))).lean();
    if (!cert) throw notFound('Certificate');
    await assertCanViewStudent(req, cert.studentId);
    res.json({ ...cert, verificationUrl: verificationUrl(cert.verificationCode) });
  }),
);

engagementRouter.get(
  '/certificates/:id/pdf',
  authenticate,
  memberSchoolUnlessSA,
  ah(async (req, res) => {
    const cert = await Certificate.findById(oid(param(req, 'id'))).lean();
    if (!cert) throw notFound('Certificate');
    await assertCanViewStudent(req, cert.studentId);
    const pdf = await renderCertificatePdf(cert);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cert.certificateNumber}.pdf"`);
    res.send(pdf);
  }),
);

// Public verification: reveals only minimal details.
publicRouter.get(
  '/certificates/verify/:code',
  ah(async (req, res) => {
    const code = param(req, 'code');
    if (!/^[A-F0-9]{6,32}$/i.test(code)) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Certificate not found');
    const cert = await Certificate.findOne({ verificationCode: code.toUpperCase() }).lean();
    if (!cert) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Certificate not found');
    const parts = cert.studentDisplayName.trim().split(/\s+/);
    const name = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
    res.json({ valid: true, certificateNumber: cert.certificateNumber, studentName: name, level: cert.level, levelTitle: cert.levelTitle, schoolName: cert.schoolName, issuedAt: cert.issuedAt });
  }),
);
