import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { CLASS_LEVELS, ENTITY_STATUS, PROGRAMMES, ROLES } from '@mango/shared';
import { authenticate, requireRole } from '../middleware/auth';
import {
  AuditLog,
  ClassSection,
  Notification,
  PlatformSettings,
  ProgrammeEnrolment,
  RefreshToken,
  School,
  SchoolClassAccess,
  SchoolMembership,
  SchoolProgrammeEntitlement,
  SchoolSubscription,
  StudentProfile,
  SubscriptionPlan,
  User,
  Programme,
} from '../models';
import * as A from '../services/analytics';
import { audit } from '../utils/audit';
import { badRequest, notFound } from '../utils/errors';
import { ah, escapeRegex, objectId, oid, pageResult, paginationSchema, param, parse } from '../utils/http';
import { hashPassword } from './auth';

export const platformRouter = Router();
platformRouter.use(authenticate);
const SA = requireRole(ROLES.SUPER_ADMIN);

// ------------------------------------------------------------------ subscription plans
const planBody = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(500).optional(),
  maxClassLevel: z.number().int().min(1).max(10),
  programmeCodes: z.array(z.enum(PROGRAMMES.map((p) => p.code) as [string, ...string[]])).default([]),
  status: z.enum(['draft', 'active', 'archived']).default('active'),
});

platformRouter.get(
  '/plans',
  SA,
  ah(async (_req, res) => {
    const plans = await SubscriptionPlan.find().sort({ maxClassLevel: 1 }).lean();
    const usage = await SchoolSubscription.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$planId', n: { $sum: 1 } } }]);
    const u = new Map(usage.map((x) => [x._id.toString(), x.n]));
    res.json(plans.map((p) => ({ ...p, activeSchools: u.get(p._id.toString()) ?? 0 })));
  }),
);

platformRouter.post(
  '/plans',
  SA,
  ah(async (req, res) => {
    const body = parse(planBody, req.body);
    const plan = await SubscriptionPlan.create(body);
    await audit(req, { action: 'plan.create', entityType: 'subscription_plan', entityId: plan._id, after: body });
    res.status(201).json(plan);
  }),
);

platformRouter.patch(
  '/plans/:id',
  SA,
  ah(async (req, res) => {
    const body = parse(planBody.partial(), req.body);
    const plan = await SubscriptionPlan.findByIdAndUpdate(oid(param(req, 'id')), body, { new: true, runValidators: true }).lean();
    if (!plan) throw notFound('Plan');
    await audit(req, { action: 'plan.update', entityType: 'subscription_plan', entityId: plan._id, after: body });
    res.json(plan);
  }),
);

// ------------------------------------------------------------------ users (platform-wide)
platformRouter.get(
  '/users',
  SA,
  ah(async (req, res) => {
    const q = parse(
      paginationSchema.extend({ q: z.string().max(100).optional(), role: z.enum(Object.values(ROLES) as [string, ...string[]]).optional(), status: z.enum(ENTITY_STATUS).optional(), schoolId: objectId.optional() }),
      req.query,
    );
    const filter: Record<string, unknown> = {};
    if (q.role) filter.role = q.role;
    if (q.status) filter.status = q.status;
    if (q.q) filter.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { email: new RegExp(escapeRegex(q.q), 'i') }];
    if (q.schoolId) {
      const ms = await SchoolMembership.find({ schoolId: oid(q.schoolId) }).select('userId').lean();
      filter._id = { $in: ms.map((m) => m.userId) };
    }
    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      User.countDocuments(filter),
    ]);
    const ms = await SchoolMembership.find({ userId: { $in: items.map((i) => i._id) } }).populate('schoolId', 'name schoolCode').lean();
    res.json(
      pageResult(
        items.map((u) => ({
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          lastLoginAt: u.lastLoginAt,
          createdAt: (u as { createdAt?: Date }).createdAt,
          schools: ms.filter((m) => m.userId.toString() === u._id.toString()).map((m) => ({ school: m.schoolId, status: m.status })),
        })),
        total,
        q.page,
        q.pageSize,
      ),
    );
  }),
);

platformRouter.post(
  '/users',
  SA,
  ah(async (req, res) => {
    // Only Super Admin accounts are created here; school users are created inside a school.
    const body = parse(z.object({ name: z.string().min(2).max(120), email: z.string().email(), password: z.string().min(10).max(200) }), req.body);
    const user = await User.create({ name: body.name, email: body.email, role: ROLES.SUPER_ADMIN, passwordHash: await hashPassword(body.password) });
    await audit(req, { action: 'user.create_super_admin', entityType: 'user', entityId: user._id, summary: body.email });
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  }),
);

platformRouter.patch(
  '/users/:id',
  SA,
  ah(async (req, res) => {
    const body = parse(z.object({ name: z.string().min(2).max(120).optional(), status: z.enum(ENTITY_STATUS).optional() }), req.body);
    const id = oid(param(req, 'id'));
    if (id.equals(req.auth!.userId) && body.status === 'inactive') throw badRequest('You cannot deactivate your own account');
    const user = await User.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!user) throw notFound('User');
    if (body.status === 'inactive') await RefreshToken.updateMany({ userId: id, revokedAt: null }, { revokedAt: new Date() });
    await audit(req, { action: body.status ? `user.${body.status}` : 'user.update', entityType: 'user', entityId: id, after: body });
    res.json({ id: user._id, name: user.name, status: user.status });
  }),
);

platformRouter.post(
  '/users/:id/reset-password',
  SA,
  ah(async (req, res) => {
    const id = oid(param(req, 'id'));
    const user = await User.findById(id).lean();
    if (!user) throw notFound('User');
    const secret = user.role === ROLES.STUDENT ? String(crypto.randomInt(100000, 999999)) : crypto.randomBytes(9).toString('base64url');
    await User.updateOne({ _id: id }, { passwordHash: await hashPassword(secret), mustChangePassword: user.role !== ROLES.STUDENT, failedLoginCount: 0, $unset: { lockedUntil: 1 } });
    await RefreshToken.updateMany({ userId: id, revokedAt: null }, { revokedAt: new Date() });
    await audit(req, { action: 'user.reset_password', entityType: 'user', entityId: id });
    res.json({ temporaryPassword: secret });
  }),
);

// ------------------------------------------------------------------ platform-wide search
platformRouter.get(
  '/search',
  SA,
  ah(async (req, res) => {
    const { q } = parse(z.object({ q: z.string().min(1).max(100) }), req.query);
    const rx = new RegExp(escapeRegex(q), 'i');
    const [schools, users, students] = await Promise.all([
      School.find({ $or: [{ name: rx }, { schoolCode: rx }, { city: rx }] }).limit(10).select('name schoolCode city status').lean(),
      User.find({ $or: [{ name: rx }, { email: rx }] }).limit(10).select('name email role status').lean(),
      StudentProfile.find({ studentCode: rx }).limit(10).populate('userId', 'name').populate('schoolId', 'name').lean(),
    ]);
    const sectionMatch = /^(\d{1,2})\s*-?\s*([A-Za-z])$/.exec(q.trim());
    const sections = sectionMatch
      ? await ClassSection.find({ levelNumber: Number(sectionMatch[1]), sectionName: sectionMatch[2].toUpperCase() }).limit(10).populate('schoolId', 'name').lean()
      : [];
    res.json({ schools, users, students, sections });
  }),
);

// ------------------------------------------------------------------ audit log
platformRouter.get(
  '/audit-logs',
  SA,
  ah(async (req, res) => {
    const q = parse(paginationSchema.extend({ schoolId: objectId.optional(), action: z.string().max(100).optional(), entityType: z.string().max(60).optional() }), req.query);
    const filter: Record<string, unknown> = {};
    if (q.schoolId) filter.schoolId = oid(q.schoolId);
    if (q.action) filter.action = new RegExp('^' + escapeRegex(q.action));
    if (q.entityType) filter.entityType = q.entityType;
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).populate('actorId', 'name email').populate('schoolId', 'name').lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json(pageResult(items, total, q.page, q.pageSize));
  }),
);

// ------------------------------------------------------------------ platform settings
platformRouter.get(
  '/settings',
  SA,
  ah(async (_req, res) => {
    res.json(await PlatformSettings.findOneAndUpdate({ key: 'platform' }, {}, { upsert: true, new: true }).lean());
  }),
);

platformRouter.patch(
  '/settings',
  SA,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        platformName: z.string().max(60).optional(),
        supportEmail: z.string().email().optional(),
        defaultTimezone: z.string().max(60).optional(),
        defaultAcademicYear: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        studentPinMinLength: z.number().int().min(4).max(8).optional(),
        maintenanceMode: z.boolean().optional(),
      }),
      req.body,
    );
    const s = await PlatformSettings.findOneAndUpdate({ key: 'platform' }, body, { upsert: true, new: true }).lean();
    await audit(req, { action: 'platform.settings.update', entityType: 'platform_settings', after: body });
    res.json(s);
  }),
);

// ------------------------------------------------------------------ platform analytics
platformRouter.get(
  '/analytics/platform',
  SA,
  ah(async (_req, res) => {
    const now = new Date();
    const premiumIds = (await Programme.find({ premium: true }).select('_id').lean()).map((p) => p._id);
    const [schools, activeSchools, students, teachers, enabledClasses, premiumSchools, growthSchools, growthStudents, growthTeachers, subjects, programmes, activity, perf, recent] =
      await Promise.all([
        School.countDocuments(),
        School.countDocuments({ status: 'active' }),
        StudentProfile.countDocuments({ status: 'active' }),
        SchoolMembership.countDocuments({ role: ROLES.TEACHER, status: 'active' }),
        SchoolClassAccess.countDocuments({ enabled: true }),
        SchoolProgrammeEntitlement.distinct('schoolId', {
          programmeId: { $in: premiumIds },
          enabled: true,
          $and: [{ $or: [{ validUntil: null }, { validUntil: { $gte: now } }] }, { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] }],
        }),
        A.monthlyCounts(School as never, {}),
        A.monthlyCounts(StudentProfile as never, {}),
        A.monthlyCounts(SchoolMembership as never, { role: ROLES.TEACHER }),
        A.bySubject({}),
        A.programmeParticipation({}),
        A.dailyActivity({}),
        A.performance({}),
        School.find().sort({ createdAt: -1 }).limit(8).lean(),
      ]);
    const studentCounts = await StudentProfile.aggregate([
      { $match: { schoolId: { $in: recent.map((s) => s._id) }, status: 'active' } },
      { $group: { _id: '$schoolId', n: { $sum: 1 } } },
    ]);
    const subs = await SchoolSubscription.find({ schoolId: { $in: recent.map((s) => s._id) } }).sort({ createdAt: -1 }).populate('planId', 'name').lean();
    const sc = new Map(studentCounts.map((s) => [s._id.toString(), s.n]));
    const enrolments = await ProgrammeEnrolment.countDocuments();
    res.json({
      period: { label: 'All time (growth: last 12 months, activity: last 30 days)', generatedAt: now },
      totals: {
        schools,
        activeSchools,
        students,
        teachers,
        enabledClasses,
        premiumSchools: premiumSchools.length,
        programmeEnrolments: enrolments,
        averagePerformancePercent: perf.averagePercent,
        performanceSampleSize: perf.sampleSize,
        classLevelsAvailable: CLASS_LEVELS.length,
      },
      growth: { schools: growthSchools, students: growthStudents, teachers: growthTeachers },
      subjects,
      programmes,
      activity,
      recentSchools: recent.map((s) => {
        const sub = subs.find((x) => x.schoolId.toString() === s._id.toString());
        return {
          id: s._id,
          name: s.name,
          schoolCode: s.schoolCode,
          location: [s.city, s.region].filter(Boolean).join(', '),
          students: sc.get(s._id.toString()) ?? 0,
          plan: (sub?.planId as unknown as { name?: string })?.name ?? null,
          planStatus: sub?.status ?? null,
          status: s.status,
        };
      }),
    });
  }),
);

// ------------------------------------------------------------------ notifications (all roles)
platformRouter.get(
  '/notifications',
  ah(async (req, res) => {
    const q = parse(paginationSchema.extend({ unread: z.coerce.boolean().optional() }), req.query);
    const filter: Record<string, unknown> = { userId: req.auth!.userId };
    if (q.unread) filter.readAt = null;
    const [items, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.auth!.userId, readAt: null }),
    ]);
    res.json({ ...pageResult(items, total, q.page, q.pageSize), unread });
  }),
);

platformRouter.patch(
  '/notifications/:id/read',
  ah(async (req, res) => {
    const r = await Notification.updateOne({ _id: oid(param(req, 'id')), userId: req.auth!.userId }, { readAt: new Date() });
    if (!r.matchedCount) throw notFound('Notification');
    res.json({ ok: true });
  }),
);

platformRouter.post(
  '/notifications/read-all',
  ah(async (req, res) => {
    await Notification.updateMany({ userId: req.auth!.userId, readAt: null }, { readAt: new Date() });
    res.json({ ok: true });
  }),
);
