import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { CLASS_LEVELS, ENTITY_STATUS, ERROR_CODES, PLAN_STATUS, ROLES } from '@mango/shared';
import { withTransaction } from '../db/connect';
import { authenticate, requireRole, schoolParamAccess } from '../middleware/auth';
import {
  AssessmentAttempt,
  Certificate,
  ClassLevel,
  ClassSection,
  GameAttempt,
  Programme,
  ProgrammeEnrolment,
  School,
  SchoolClassAccess,
  SchoolMembership,
  SchoolProgrammeEntitlement,
  SchoolSubscription,
  StudentProfile,
  Subject,
  SubscriptionPlan,
  TeacherAssignment,
  User,
} from '../models';
import { assertLevelEnabled, enabledLevels, evaluateEntitlement, setClassAccess } from '../services/access';
import * as A from '../services/analytics';
import { audit, notify } from '../utils/audit';
import { dateRange } from '../utils/dates';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { ah, escapeRegex, objectId, oid, pageResult, paginationSchema, param, parse, sendCsv } from '../utils/http';
import { hashPassword } from './auth';

export const schoolsRouter = Router();
schoolsRouter.use(authenticate);

const SA = requireRole(ROLES.SUPER_ADMIN);
const scoped = [requireRole(ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN), schoolParamAccess('schoolId')];
const sid = (req: Request) => req.school!.schoolId;
const tempSecret = () => crypto.randomBytes(9).toString('base64url');
const tempPin = () => String(crypto.randomInt(100000, 999999));

const contactSchema = z.object({ name: z.string().max(120).optional(), email: z.string().email().optional().or(z.literal('')), phone: z.string().max(30).optional() });
const schoolBody = z.object({
  schoolCode: z.string().min(2).max(20).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and dashes only'),
  name: z.string().min(2).max(200),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  contactPerson: contactSchema.optional(),
  status: z.enum(ENTITY_STATUS).optional(),
  timezone: z.string().max(60).optional(),
  currentAcademicYear: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

async function schoolSummaries(schoolIds: Types.ObjectId[]) {
  const [students, teachers, access, subs] = await Promise.all([
    StudentProfile.aggregate([{ $match: { schoolId: { $in: schoolIds }, status: 'active' } }, { $group: { _id: '$schoolId', n: { $sum: 1 } } }]),
    SchoolMembership.aggregate([
      { $match: { schoolId: { $in: schoolIds }, role: ROLES.TEACHER, status: 'active' } },
      { $group: { _id: '$schoolId', n: { $sum: 1 } } },
    ]),
    SchoolClassAccess.find({ schoolId: { $in: schoolIds }, enabled: true }).select('schoolId levelNumber').lean(),
    SchoolSubscription.find({ schoolId: { $in: schoolIds } }).sort({ createdAt: -1 }).populate('planId', 'name').lean(),
  ]);
  const sMap = new Map(students.map((r) => [r._id.toString(), r.n]));
  const tMap = new Map(teachers.map((r) => [r._id.toString(), r.n]));
  const aMap = new Map<string, number[]>();
  access.forEach((a) => aMap.set(a.schoolId.toString(), [...(aMap.get(a.schoolId.toString()) ?? []), a.levelNumber].sort((x, y) => x - y)));
  const subMap = new Map<string, (typeof subs)[number]>();
  subs.forEach((s) => !subMap.has(s.schoolId.toString()) && subMap.set(s.schoolId.toString(), s));
  return (id: Types.ObjectId) => {
    const sub = subMap.get(id.toString());
    return {
      studentCount: sMap.get(id.toString()) ?? 0,
      teacherCount: tMap.get(id.toString()) ?? 0,
      enabledClasses: aMap.get(id.toString()) ?? [],
      plan: sub
        ? { name: (sub.planId as unknown as { name?: string })?.name ?? null, status: sub.status, startDate: sub.startDate, endDate: sub.endDate }
        : null,
    };
  };
}

// =================================================================== Super Admin: schools
schoolsRouter.get(
  '/',
  SA,
  ah(async (req, res) => {
    const q = parse(paginationSchema.extend({ q: z.string().max(100).optional(), status: z.enum(ENTITY_STATUS).optional(), region: z.string().optional() }), req.query);
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.region) filter.region = q.region;
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ name: rx }, { schoolCode: rx }, { city: rx }, { region: rx }];
    }
    const [items, total] = await Promise.all([
      School.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      School.countDocuments(filter),
    ]);
    const summary = await schoolSummaries(items.map((s) => s._id));
    res.json(pageResult(items.map((s) => ({ ...s, ...summary(s._id) })), total, q.page, q.pageSize));
  }),
);

schoolsRouter.post(
  '/',
  SA,
  ah(async (req, res) => {
    const body = parse(schoolBody.extend({ classLevels: z.array(z.number().int().min(1).max(10)).optional() }), req.body);
    const school = await withTransaction(async (session) => {
      const [s] = await School.create([{ ...body, schoolCode: body.schoolCode.toUpperCase() }], { session });
      await setClassAccess(s._id, body.classLevels ?? [], req.auth!.userId, session);
      await audit(req, { action: 'school.create', entityType: 'school', entityId: s._id, schoolId: s._id, summary: `Created school ${s.name}`, after: body }, session);
      return s;
    });
    res.status(201).json(school);
  }),
);

schoolsRouter.patch(
  '/:schoolId',
  SA,
  ah(async (req, res) => {
    const body = parse(schoolBody.partial(), req.body);
    const before = await School.findById(oid(param(req, 'schoolId'))).lean();
    if (!before) throw notFound('School');
    const updated = await School.findByIdAndUpdate(before._id, { ...body, ...(body.schoolCode ? { schoolCode: body.schoolCode.toUpperCase() } : {}) }, { new: true, runValidators: true }).lean();
    await audit(req, {
      action: body.status && body.status !== before.status ? `school.${body.status === 'active' ? 'activate' : 'deactivate'}` : 'school.update',
      entityType: 'school',
      entityId: before._id,
      schoolId: before._id,
      before: { name: before.name, status: before.status },
      after: body,
    });
    res.json(updated);
  }),
);

// ------------------------------------------------------------------ class access (entitlement)
schoolsRouter.get(
  '/:schoolId/class-access',
  ...scoped,
  ah(async (req, res) => {
    const rows = await SchoolClassAccess.find({ schoolId: sid(req) }).lean();
    const map = new Map(rows.map((r) => [r.levelNumber, r]));
    res.json(CLASS_LEVELS.map((n) => ({ levelNumber: n, displayName: `Class ${n}`, enabled: map.get(n)?.enabled ?? false, grantedAt: map.get(n)?.grantedAt })));
  }),
);

schoolsRouter.put(
  '/:schoolId/class-access',
  SA,
  schoolParamAccess('schoolId'),
  ah(async (req, res) => {
    const { levels } = parse(z.object({ levels: z.array(z.number().int().min(1).max(10)).max(10) }), req.body);
    const before = await enabledLevels(sid(req));
    await withTransaction(async (session) => {
      await setClassAccess(sid(req), levels, req.auth!.userId, session);
      await audit(req, { action: 'school.class_access.update', entityType: 'school', entityId: sid(req), schoolId: sid(req), before, after: levels }, session);
    });
    res.json({ levels: await enabledLevels(sid(req)) });
  }),
);

// ------------------------------------------------------------------ programme entitlements
schoolsRouter.get(
  '/:schoolId/programme-entitlements',
  ...scoped,
  ah(async (req, res) => {
    const [programmes, ents] = await Promise.all([
      Programme.find().sort({ displayOrder: 1 }).lean(),
      SchoolProgrammeEntitlement.find({ schoolId: sid(req) }).lean(),
    ]);
    const map = new Map(ents.map((e) => [e.programmeId.toString(), e]));
    res.json(
      programmes.map((p) => {
        const e = map.get(p._id.toString());
        return {
          programmeId: p._id,
          code: p.code,
          name: p.name,
          premium: p.premium,
          enabled: e?.enabled ?? false,
          validFrom: e?.validFrom ?? null,
          validUntil: e?.validUntil ?? null,
          effective: evaluateEntitlement(e),
        };
      }),
    );
  }),
);

schoolsRouter.put(
  '/:schoolId/programme-entitlements',
  SA,
  schoolParamAccess('schoolId'),
  ah(async (req, res) => {
    const { entitlements } = parse(
      z.object({
        entitlements: z.array(
          z.object({ programmeId: objectId, enabled: z.boolean(), validFrom: z.coerce.date().nullable().optional(), validUntil: z.coerce.date().nullable().optional() }),
        ),
      }),
      req.body,
    );
    const ids = entitlements.map((e) => oid(e.programmeId));
    if ((await Programme.countDocuments({ _id: { $in: ids } })) !== ids.length) throw badRequest('Unknown programme id');
    for (const e of entitlements) {
      if (e.validFrom && e.validUntil && e.validFrom > e.validUntil) throw badRequest('validFrom must be before validUntil');
    }
    await withTransaction(async (session) => {
      await SchoolProgrammeEntitlement.bulkWrite(
        entitlements.map((e) => ({
          updateOne: {
            filter: { schoolId: sid(req), programmeId: oid(e.programmeId) },
            update: { $set: { enabled: e.enabled, validFrom: e.validFrom ?? null, validUntil: e.validUntil ?? null, updatedBy: req.auth!.userId } },
            upsert: true,
          },
        })),
        { session },
      );
      await audit(req, { action: 'school.programme_entitlements.update', entityType: 'school', entityId: sid(req), schoolId: sid(req), after: entitlements }, session);
    });
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------------ subscription
schoolsRouter.get(
  '/:schoolId/subscription',
  ...scoped,
  ah(async (req, res) => {
    const history = await SchoolSubscription.find({ schoolId: sid(req) }).sort({ createdAt: -1 }).limit(20).populate('planId').lean();
    res.json({ current: history[0] ?? null, history });
  }),
);

schoolsRouter.put(
  '/:schoolId/subscription',
  SA,
  schoolParamAccess('schoolId'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        planId: objectId,
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        status: z.enum(PLAN_STATUS).default('active'),
        /** apply the plan's class & programme access to the school's entitlement */
        applyEntitlements: z.boolean().default(true),
      }),
      req.body,
    );
    if (body.startDate >= body.endDate) throw badRequest('endDate must be after startDate');
    const plan = await SubscriptionPlan.findById(oid(body.planId)).lean();
    if (!plan) throw notFound('Plan');
    const sub = await withTransaction(async (session) => {
      await SchoolSubscription.updateMany({ schoolId: sid(req), status: 'active' }, { status: 'expired' }, { session });
      const [created] = await SchoolSubscription.create(
        [{ schoolId: sid(req), planId: plan._id, startDate: body.startDate, endDate: body.endDate, status: body.status, assignedBy: req.auth!.userId }],
        { session },
      );
      if (body.applyEntitlements && body.status === 'active') {
        await setClassAccess(sid(req), CLASS_LEVELS.filter((n) => n <= plan.maxClassLevel), req.auth!.userId, session);
        const programmes = await Programme.find().session(session ?? null).lean();
        await SchoolProgrammeEntitlement.bulkWrite(
          programmes.map((p) => ({
            updateOne: {
              filter: { schoolId: sid(req), programmeId: p._id },
              update: {
                $set: {
                  enabled: plan.programmeCodes.includes(p.code),
                  validFrom: body.startDate,
                  validUntil: body.endDate,
                  updatedBy: req.auth!.userId,
                },
              },
              upsert: true,
            },
          })),
          { session },
        );
      }
      await audit(req, { action: 'school.subscription.assign', entityType: 'school', entityId: sid(req), schoolId: sid(req), after: { plan: plan.name, ...body } }, session);
      return created;
    });
    res.status(201).json(sub);
  }),
);

// ------------------------------------------------------------------ school administrators
schoolsRouter.get(
  '/:schoolId/admins',
  ...scoped,
  ah(async (req, res) => {
    const ms = await SchoolMembership.find({ schoolId: sid(req), role: ROLES.SCHOOL_ADMIN }).populate('userId', 'name email phone status lastLoginAt').lean();
    res.json(ms.map((m) => ({ membershipId: m._id, status: m.status, user: m.userId })));
  }),
);

schoolsRouter.post(
  '/:schoolId/admins',
  SA,
  schoolParamAccess('schoolId'),
  ah(async (req, res) => {
    const body = parse(z.object({ name: z.string().min(2).max(120), email: z.string().email(), phone: z.string().max(30).optional(), password: z.string().min(8).max(200).optional() }), req.body);
    let user = await User.findOne({ email: body.email.toLowerCase() }).lean();
    let temporaryPassword: string | undefined;
    if (user && user.role !== ROLES.SCHOOL_ADMIN) throw conflict('This email belongs to a user with a different role');
    if (!user) {
      temporaryPassword = body.password ? undefined : tempSecret();
      const created = await User.create({
        name: body.name,
        email: body.email,
        phone: body.phone,
        role: ROLES.SCHOOL_ADMIN,
        passwordHash: await hashPassword(body.password ?? temporaryPassword!),
        mustChangePassword: !body.password,
      });
      user = created.toObject();
    }
    await SchoolMembership.updateOne({ schoolId: sid(req), userId: user._id }, { $set: { role: ROLES.SCHOOL_ADMIN, status: 'active' } }, { upsert: true });
    await audit(req, { action: 'school.admin.assign', entityType: 'user', entityId: user._id, schoolId: sid(req), summary: `Assigned ${body.email} as school admin` });
    res.status(201).json({ user: { id: user._id, name: user.name, email: user.email }, temporaryPassword });
  }),
);

schoolsRouter.patch(
  '/:schoolId/admins/:userId',
  SA,
  schoolParamAccess('schoolId'),
  ah(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(ENTITY_STATUS) }), req.body);
    const r = await SchoolMembership.updateOne({ schoolId: sid(req), userId: oid(param(req, 'userId')), role: ROLES.SCHOOL_ADMIN }, { status });
    if (!r.matchedCount) throw notFound('School admin membership');
    await audit(req, { action: `school.admin.${status}`, entityType: 'user', entityId: oid(param(req, 'userId')), schoolId: sid(req) });
    res.json({ ok: true });
  }),
);

// =================================================================== shared (SA + School Admin)
schoolsRouter.get(
  '/:schoolId',
  ...scoped,
  ah(async (req, res) => {
    const school = await School.findById(sid(req)).lean();
    const summary = await schoolSummaries([sid(req)]);
    res.json({ ...school, ...summary(sid(req)) });
  }),
);

// School Admin may edit only profile / local preferences — never entitlement, code, status or timezone.
schoolsRouter.patch(
  '/:schoolId/settings',
  ...scoped,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        address: z.string().max(500).optional(),
        contactPerson: contactSchema.optional(),
        settings: z.object({ displayName: z.string().max(200).optional(), logoUrl: z.string().url().optional().or(z.literal('')), allowStudentLeaderboard: z.boolean().optional() }).optional(),
      }),
      req.body,
    );
    const $set: Record<string, unknown> = {};
    if (body.address !== undefined) $set.address = body.address;
    if (body.contactPerson) Object.entries(body.contactPerson).forEach(([k, v]) => ($set[`contactPerson.${k}`] = v));
    if (body.settings) Object.entries(body.settings).forEach(([k, v]) => ($set[`settings.${k}`] = v));
    const updated = await School.findByIdAndUpdate(sid(req), { $set }, { new: true }).lean();
    await audit(req, { action: 'school.settings.update', entityType: 'school', entityId: sid(req), schoolId: sid(req), after: body });
    res.json(updated);
  }),
);

// ------------------------------------------------------------------ sections
schoolsRouter.get(
  '/:schoolId/sections',
  ...scoped,
  ah(async (req, res) => {
    const q = parse(z.object({ academicYear: z.string().optional(), levelNumber: z.coerce.number().int().min(1).max(10).optional() }), req.query);
    const filter: Record<string, unknown> = { schoolId: sid(req), academicYear: q.academicYear ?? req.school!.academicYear };
    if (q.levelNumber) filter.levelNumber = q.levelNumber;
    const [sections, levels] = await Promise.all([ClassSection.find(filter).sort({ levelNumber: 1, sectionName: 1 }).lean(), enabledLevels(sid(req))]);
    const ids = sections.map((s) => s._id);
    const [counts, assignments] = await Promise.all([
      StudentProfile.aggregate([{ $match: { classSectionId: { $in: ids }, status: 'active' } }, { $group: { _id: '$classSectionId', n: { $sum: 1 } } }]),
      TeacherAssignment.find({ classSectionId: { $in: ids } }).populate('teacherId', 'name').populate('subjectIds', 'name code').lean(),
    ]);
    const cMap = new Map(counts.map((c) => [c._id.toString(), c.n]));
    res.json(
      sections.map((s) => ({
        ...s,
        label: `Class ${s.levelNumber}-${s.sectionName}`,
        locked: !levels.includes(s.levelNumber),
        studentCount: cMap.get(s._id.toString()) ?? 0,
        teachers: assignments
          .filter((a) => a.classSectionId.toString() === s._id.toString())
          .map((a) => ({ teacher: a.teacherId, subjects: a.subjectIds })),
      })),
    );
  }),
);

schoolsRouter.post(
  '/:schoolId/sections',
  ...scoped,
  ah(async (req, res) => {
    const body = parse(
      z.object({ levelNumber: z.number().int().min(1).max(10), sectionName: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/), academicYear: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
      req.body,
    );
    await assertLevelEnabled(sid(req), body.levelNumber);
    const level = await ClassLevel.findOne({ levelNumber: body.levelNumber }).lean();
    if (!level) throw notFound('Class level');
    const section = await ClassSection.create({
      schoolId: sid(req),
      classLevelId: level._id,
      levelNumber: body.levelNumber,
      sectionName: body.sectionName.toUpperCase(),
      academicYear: body.academicYear ?? req.school!.academicYear,
    });
    await audit(req, { action: 'section.create', entityType: 'class_section', entityId: section._id, schoolId: sid(req), summary: `Class ${body.levelNumber}-${section.sectionName}` });
    res.status(201).json(section);
  }),
);

schoolsRouter.patch(
  '/:schoolId/sections/:sectionId',
  ...scoped,
  ah(async (req, res) => {
    const body = parse(z.object({ sectionName: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/).optional(), status: z.enum(ENTITY_STATUS).optional() }), req.body);
    const section = await ClassSection.findOne({ _id: oid(param(req, 'sectionId')), schoolId: sid(req) });
    if (!section) throw notFound('Class section');
    if (body.status === 'inactive' && (await StudentProfile.exists({ classSectionId: section._id, status: 'active' }))) {
      throw conflict('Move or deactivate the students in this section first');
    }
    if (body.sectionName) section.sectionName = body.sectionName.toUpperCase();
    if (body.status) section.status = body.status;
    await section.save();
    await audit(req, { action: 'section.update', entityType: 'class_section', entityId: section._id, schoolId: sid(req), after: body });
    res.json(section);
  }),
);

// ------------------------------------------------------------------ teachers
async function validateAssignments(schoolId: Types.ObjectId, assignments: Array<{ classSectionId: string; subjectIds: string[] }>) {
  const levels = await enabledLevels(schoolId);
  for (const a of assignments) {
    const section = await ClassSection.findOne({ _id: oid(a.classSectionId), schoolId, status: 'active' }).lean();
    if (!section) throw badRequest(`Section ${a.classSectionId} does not belong to this school`);
    if (!levels.includes(section.levelNumber)) throw new AppError(403, ERROR_CODES.CLASS_LOCKED, `Class ${section.levelNumber} is locked for this school`);
    const subjects = await Subject.countDocuments({ _id: { $in: a.subjectIds.map(oid) }, enabled: true });
    if (subjects !== a.subjectIds.length) throw badRequest('Unknown or disabled subject');
  }
}
const assignmentsSchema = z.array(z.object({ classSectionId: objectId, subjectIds: z.array(objectId).min(1).max(10) })).max(50);

schoolsRouter.get(
  '/:schoolId/teachers',
  ...scoped,
  ah(async (req, res) => {
    const q = parse(z.object({ q: z.string().max(100).optional(), status: z.enum(ENTITY_STATUS).optional() }), req.query);
    const memberships = await SchoolMembership.find({ schoolId: sid(req), role: ROLES.TEACHER, ...(q.status ? { status: q.status } : {}) }).lean();
    const userFilter: Record<string, unknown> = { _id: { $in: memberships.map((m) => m.userId) } };
    if (q.q) userFilter.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { email: new RegExp(escapeRegex(q.q), 'i') }];
    const users = await User.find(userFilter).sort({ name: 1 }).lean();
    const assignments = await TeacherAssignment.find({ schoolId: sid(req), teacherId: { $in: users.map((u) => u._id) } })
      .populate('classSectionId', 'levelNumber sectionName')
      .populate('subjectIds', 'name code')
      .lean();
    const mMap = new Map(memberships.map((m) => [m.userId.toString(), m]));
    res.json(
      users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        membershipStatus: mMap.get(u._id.toString())?.status,
        lastLoginAt: u.lastLoginAt,
        assignments: assignments.filter((a) => a.teacherId.toString() === u._id.toString()).map((a) => ({ section: a.classSectionId, subjects: a.subjectIds })),
      })),
    );
  }),
);

schoolsRouter.post(
  '/:schoolId/teachers',
  ...scoped,
  ah(async (req, res) => {
    const body = parse(
      z.object({ name: z.string().min(2).max(120), email: z.string().email(), phone: z.string().max(30).optional(), password: z.string().min(8).max(200).optional(), assignments: assignmentsSchema.default([]) }),
      req.body,
    );
    await validateAssignments(sid(req), body.assignments);
    let user = await User.findOne({ email: body.email.toLowerCase() }).lean();
    if (user && user.role !== ROLES.TEACHER) throw conflict('This email belongs to a user with a different role');
    let temporaryPassword: string | undefined;
    const result = await withTransaction(async (session) => {
      if (!user) {
        temporaryPassword = body.password ? undefined : tempSecret();
        const [created] = await User.create(
          [{ name: body.name, email: body.email, phone: body.phone, role: ROLES.TEACHER, passwordHash: await hashPassword(body.password ?? temporaryPassword!), mustChangePassword: !body.password }],
          { session },
        );
        user = created.toObject();
      }
      await SchoolMembership.updateOne({ schoolId: sid(req), userId: user._id }, { $set: { role: ROLES.TEACHER, status: 'active' } }, { upsert: true, session });
      for (const a of body.assignments) {
        await TeacherAssignment.updateOne(
          { teacherId: user._id, classSectionId: oid(a.classSectionId) },
          { $set: { schoolId: sid(req), subjectIds: a.subjectIds.map(oid) } },
          { upsert: true, session },
        );
      }
      await audit(req, { action: 'teacher.create', entityType: 'user', entityId: user._id, schoolId: sid(req), summary: body.email }, session);
      return user;
    });
    res.status(201).json({ id: result._id, name: result.name, email: result.email, temporaryPassword });
  }),
);

async function assertSchoolMember(schoolId: Types.ObjectId, userId: Types.ObjectId, role: string) {
  const m = await SchoolMembership.findOne({ schoolId, userId, role }).lean();
  if (!m) throw notFound(role === ROLES.TEACHER ? 'Teacher' : 'Student');
  return m;
}

schoolsRouter.patch(
  '/:schoolId/teachers/:teacherId',
  ...scoped,
  ah(async (req, res) => {
    const teacherId = oid(param(req, 'teacherId'));
    await assertSchoolMember(sid(req), teacherId, ROLES.TEACHER);
    const body = parse(z.object({ name: z.string().min(2).max(120).optional(), phone: z.string().max(30).optional(), status: z.enum(ENTITY_STATUS).optional() }), req.body);
    if (body.name || body.phone !== undefined) await User.updateOne({ _id: teacherId }, { ...(body.name ? { name: body.name } : {}), ...(body.phone !== undefined ? { phone: body.phone } : {}) });
    if (body.status) await SchoolMembership.updateOne({ schoolId: sid(req), userId: teacherId }, { status: body.status });
    await audit(req, { action: body.status ? `teacher.${body.status}` : 'teacher.update', entityType: 'user', entityId: teacherId, schoolId: sid(req), after: body });
    res.json({ ok: true });
  }),
);

schoolsRouter.put(
  '/:schoolId/teachers/:teacherId/assignments',
  ...scoped,
  ah(async (req, res) => {
    const teacherId = oid(param(req, 'teacherId'));
    await assertSchoolMember(sid(req), teacherId, ROLES.TEACHER);
    const { assignments } = parse(z.object({ assignments: assignmentsSchema }), req.body);
    await validateAssignments(sid(req), assignments);
    await withTransaction(async (session) => {
      await TeacherAssignment.deleteMany({ schoolId: sid(req), teacherId }, { session });
      if (assignments.length) {
        await TeacherAssignment.insertMany(
          assignments.map((a) => ({ schoolId: sid(req), teacherId, classSectionId: oid(a.classSectionId), subjectIds: a.subjectIds.map(oid) })),
          { session },
        );
      }
      await audit(req, { action: 'teacher.assignments.update', entityType: 'user', entityId: teacherId, schoolId: sid(req), after: assignments }, session);
    });
    await notify([teacherId], { title: 'Your class assignments were updated', schoolId: sid(req), type: 'assignment' });
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------------ students
schoolsRouter.get(
  '/:schoolId/students',
  ...scoped,
  ah(async (req, res) => {
    const q = parse(
      paginationSchema.extend({
        q: z.string().max(100).optional(),
        sectionId: objectId.optional(),
        levelNumber: z.coerce.number().int().min(1).max(10).optional(),
        status: z.enum(ENTITY_STATUS).optional(),
      }),
      req.query,
    );
    const filter: Record<string, unknown> = { schoolId: sid(req) };
    if (q.sectionId) filter.classSectionId = oid(q.sectionId);
    if (q.levelNumber) filter.levelNumber = q.levelNumber;
    if (q.status) filter.status = q.status;
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      const users = await User.find({ role: ROLES.STUDENT, name: rx }).select('_id').limit(500).lean();
      filter.$or = [{ studentCode: rx }, { userId: { $in: users.map((u) => u._id) } }];
    }
    const [items, total] = await Promise.all([
      StudentProfile.find(filter)
        .sort({ levelNumber: 1, studentCode: 1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .populate('userId', 'name lastLoginAt')
        .populate('classSectionId', 'levelNumber sectionName')
        .lean(),
      StudentProfile.countDocuments(filter),
    ]);
    const perf = await AssessmentAttempt.aggregate([
      { $match: { studentId: { $in: items.map((i) => (i.userId as unknown as { _id: Types.ObjectId })._id) } } },
      { $group: { _id: '$studentId', avg: { $avg: '$percent' }, n: { $sum: 1 } } },
    ]);
    const pMap = new Map(perf.map((p) => [p._id.toString(), p]));
    res.json(
      pageResult(
        items.map((i) => {
          const u = i.userId as unknown as { _id: Types.ObjectId; name: string; lastLoginAt?: Date };
          const p = pMap.get(u._id.toString());
          return {
            id: u._id,
            profileId: i._id,
            name: u.name,
            displayName: i.displayName,
            studentCode: i.studentCode,
            levelNumber: i.levelNumber,
            section: i.classSectionId,
            status: i.status,
            lastLoginAt: u.lastLoginAt,
            averagePercent: p ? Math.round(p.avg * 10) / 10 : null,
            attempts: p?.n ?? 0,
          };
        }),
        total,
        q.page,
        q.pageSize,
      ),
    );
  }),
);

async function sectionInSchool(schoolId: Types.ObjectId, sectionId: string) {
  const section = await ClassSection.findOne({ _id: oid(sectionId), schoolId, status: 'active' }).lean();
  if (!section) throw badRequest('Class section does not belong to this school');
  await assertLevelEnabled(schoolId, section.levelNumber);
  return section;
}

schoolsRouter.post(
  '/:schoolId/students',
  ...scoped,
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(120),
        displayName: z.string().max(60).optional(),
        studentCode: z.string().min(1).max(30).regex(/^[A-Za-z0-9-]+$/),
        classSectionId: objectId,
        pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits').optional(),
      }),
      req.body,
    );
    const section = await sectionInSchool(sid(req), body.classSectionId);
    const pin = body.pin ?? tempPin();
    const created = await withTransaction(async (session) => {
      const [user] = await User.create([{ name: body.name, role: ROLES.STUDENT, passwordHash: await hashPassword(pin) }], { session });
      await SchoolMembership.create([{ schoolId: sid(req), userId: user._id, role: ROLES.STUDENT }], { session });
      const [profile] = await StudentProfile.create(
        [{ schoolId: sid(req), userId: user._id, studentCode: body.studentCode.toUpperCase(), classSectionId: section._id, levelNumber: section.levelNumber, displayName: body.displayName }],
        { session },
      );
      await audit(req, { action: 'student.create', entityType: 'user', entityId: user._id, schoolId: sid(req), summary: profile.studentCode }, session);
      return { user, profile };
    });
    res.status(201).json({ id: created.user._id, studentCode: created.profile.studentCode, name: body.name, pin: body.pin ? undefined : pin });
  }),
);

schoolsRouter.get(
  '/:schoolId/students/:studentId',
  ...scoped,
  ah(async (req, res) => {
    const studentId = oid(param(req, 'studentId'));
    const profile = await StudentProfile.findOne({ schoolId: sid(req), userId: studentId }).populate('classSectionId', 'levelNumber sectionName').lean();
    if (!profile) throw notFound('Student');
    const user = await User.findById(studentId).select('name status lastLoginAt createdAt').lean();
    const match = { studentId, schoolId: sid(req) };
    const [perf, subjects, certificates, programmes, completion, recent] = await Promise.all([
      A.performance(match),
      A.bySubject(match),
      Certificate.find({ studentId, schoolId: sid(req) }).sort({ level: 1 }).lean(),
      ProgrammeEnrolment.find({ studentId }).populate('programmeId', 'name code premium').lean(),
      A.activityCompletion({ schoolId: sid(req), classSectionId: profile.classSectionId }, studentId),
      AssessmentAttempt.find(match).sort({ submittedAt: -1 }).limit(20).populate('quizId', 'title').lean(),
    ]);
    res.json({ profile, user, performance: perf, subjects, certificates, programmes, activityCompletion: completion, recentAttempts: recent.map(({ answers: _a, ...r }) => r) });
  }),
);

schoolsRouter.patch(
  '/:schoolId/students/:studentId',
  ...scoped,
  ah(async (req, res) => {
    const studentId = oid(param(req, 'studentId'));
    const body = parse(
      z.object({ name: z.string().min(2).max(120).optional(), displayName: z.string().max(60).optional(), classSectionId: objectId.optional(), status: z.enum(ENTITY_STATUS).optional() }),
      req.body,
    );
    const profile = await StudentProfile.findOne({ schoolId: sid(req), userId: studentId });
    if (!profile) throw notFound('Student');
    if (body.classSectionId) {
      const section = await sectionInSchool(sid(req), body.classSectionId);
      profile.classSectionId = section._id;
      profile.levelNumber = section.levelNumber;
    }
    if (body.displayName !== undefined) profile.displayName = body.displayName;
    if (body.status) profile.status = body.status;
    await profile.save();
    if (body.name) await User.updateOne({ _id: studentId }, { name: body.name });
    if (body.status) await SchoolMembership.updateOne({ schoolId: sid(req), userId: studentId }, { status: body.status });
    await audit(req, { action: body.status ? `student.${body.status}` : 'student.update', entityType: 'user', entityId: studentId, schoolId: sid(req), after: body });
    res.json({ ok: true });
  }),
);

schoolsRouter.post(
  '/:schoolId/students/:studentId/reset-pin',
  ...scoped,
  ah(async (req, res) => {
    const studentId = oid(param(req, 'studentId'));
    if (!(await StudentProfile.exists({ schoolId: sid(req), userId: studentId }))) throw notFound('Student');
    const pin = tempPin();
    await User.updateOne({ _id: studentId }, { passwordHash: await hashPassword(pin), failedLoginCount: 0, $unset: { lockedUntil: 1 } });
    await audit(req, { action: 'student.reset_pin', entityType: 'user', entityId: studentId, schoolId: sid(req) });
    res.json({ pin });
  }),
);

// ------------------------------------------------------------------ overview & reports
function reportFilters(req: Request) {
  const q = parse(
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      levelNumber: z.coerce.number().int().min(1).max(10).optional(),
      sectionId: objectId.optional(),
      subjectId: objectId.optional(),
      programmeId: objectId.optional(),
    }),
    req.query,
  );
  const range = dateRange(q.from, q.to);
  return { q, range };
}

async function sectionIdsFor(schoolId: Types.ObjectId, levelNumber?: number, sectionId?: string) {
  if (sectionId) return [oid(sectionId)];
  if (!levelNumber) return undefined;
  const s = await ClassSection.find({ schoolId, levelNumber }).select('_id').lean();
  return s.map((x) => x._id);
}

schoolsRouter.get(
  '/:schoolId/overview',
  ...scoped,
  ah(async (req, res) => {
    const { q, range } = reportFilters(req);
    const schoolId = sid(req);
    const sections = await sectionIdsFor(schoolId, q.levelNumber, q.sectionId);
    const attemptMatch: Record<string, unknown> = { schoolId };
    if (range) attemptMatch.submittedAt = range;
    if (sections) attemptMatch.classSectionId = { $in: sections };
    if (q.subjectId) attemptMatch.subjectId = oid(q.subjectId);
    const [students, teachers, activeSections, levels, perf, certs, programmes, completion, games, subjects, classes, recentCerts] = await Promise.all([
      StudentProfile.countDocuments({ schoolId, status: 'active', ...(sections ? { classSectionId: { $in: sections } } : {}) }),
      SchoolMembership.countDocuments({ schoolId, role: ROLES.TEACHER, status: 'active' }),
      ClassSection.countDocuments({ schoolId, status: 'active', academicYear: req.school!.academicYear }),
      enabledLevels(schoolId),
      A.performance(attemptMatch),
      A.certificatesIssued({ schoolId, ...(range ? { issuedAt: range } : {}) }),
      A.programmeParticipation({ schoolId }),
      A.activityCompletion({ schoolId, ...(sections ? { classSectionId: { $in: sections } } : {}) }),
      A.gameStats({ schoolId, ...(range ? { startedAt: range } : {}) }),
      A.bySubject(attemptMatch),
      A.bySection(attemptMatch, schoolId),
      Certificate.find({ schoolId }).sort({ issuedAt: -1 }).limit(5).lean(),
    ]);
    res.json({
      period: { from: q.from ?? null, to: q.to ?? null, label: q.from || q.to ? 'Selected range' : 'All time' },
      counts: { students, teachers, activeSections, enabledClasses: levels, certificatesIssued: certs },
      performance: perf,
      activityCompletion: completion,
      games: { attempts: games.attempts, completionPercent: games.completionPercent },
      programmes,
      subjects,
      classes,
      recentCertificates: recentCerts,
    });
  }),
);

const REPORT_TYPES = ['class', 'subject', 'games', 'certificates', 'programmes', 'students'] as const;

schoolsRouter.get(
  '/:schoolId/reports/:type',
  ...scoped,
  ah(async (req, res) => {
    const type = param(req, 'type') as (typeof REPORT_TYPES)[number];
    if (!REPORT_TYPES.includes(type)) throw notFound('Report');
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const { q, range } = reportFilters(req);
    const schoolId = sid(req);
    const sections = await sectionIdsFor(schoolId, q.levelNumber, q.sectionId);
    const attemptMatch: Record<string, unknown> = { schoolId };
    if (range) attemptMatch.submittedAt = range;
    if (sections) attemptMatch.classSectionId = { $in: sections };
    if (q.subjectId) attemptMatch.subjectId = oid(q.subjectId);

    let rows: Array<Record<string, unknown>> = [];
    if (type === 'class') {
      rows = (await A.bySection(attemptMatch, schoolId)).map((r) => ({ class: r.label, students: r.students, averagePercent: r.averagePercent, sampleSize: r.sampleSize }));
    } else if (type === 'subject') {
      rows = (await A.bySubject(attemptMatch)).map((r) => ({ subject: r.name, averagePercent: r.averagePercent, quizAccuracyPercent: r.quizAccuracyPercent, sampleSize: r.sampleSize }));
    } else if (type === 'games') {
      const g = await A.gameStats({ schoolId, ...(range ? { startedAt: range } : {}), ...(sections ? { classSectionId: { $in: sections } } : {}) });
      rows = g.perGame.map((r) => ({ game: r.name, attempts: r.attempts, completed: r.completed, completionPercent: r.completionPercent, averageScore: r.averageScore }));
    } else if (type === 'certificates') {
      const certs = await Certificate.find({ schoolId, ...(range ? { issuedAt: range } : {}) }).sort({ issuedAt: -1 }).limit(5000).lean();
      rows = certs.map((c) => ({ certificateNumber: c.certificateNumber, student: c.studentDisplayName, level: c.level, title: c.levelTitle, percent: c.percent, issuedAt: c.issuedAt?.toISOString().slice(0, 10) }));
    } else if (type === 'programmes') {
      rows = (await A.programmeParticipation({ schoolId, ...(q.programmeId ? { programmeId: oid(q.programmeId) } : {}) })).map((r) => ({
        programme: r.name,
        premium: r.premium ? 'yes' : 'no',
        enrolled: r.enrolled,
        completed: r.completed,
        averageProgressPercent: r.averageProgressPercent,
      }));
    } else if (type === 'students') {
      const profiles = await StudentProfile.find({ schoolId, status: 'active', ...(sections ? { classSectionId: { $in: sections } } : {}) })
        .populate('userId', 'name')
        .populate('classSectionId', 'levelNumber sectionName')
        .limit(5000)
        .lean();
      const perf = await AssessmentAttempt.aggregate([
        { $match: { ...attemptMatch, studentId: { $in: profiles.map((p) => (p.userId as unknown as { _id: Types.ObjectId })._id) } } },
        { $group: { _id: '$studentId', avg: { $avg: '$percent' }, n: { $sum: 1 }, score: { $sum: '$score' }, max: { $sum: '$maxScore' } } },
      ]);
      const games = await GameAttempt.aggregate([{ $match: { schoolId, ...(range ? { startedAt: range } : {}) } }, { $group: { _id: '$studentId', n: { $sum: 1 } } }]);
      const certs = await Certificate.aggregate([{ $match: { schoolId } }, { $group: { _id: '$studentId', n: { $sum: 1 } } }]);
      const pm = new Map(perf.map((p) => [p._id.toString(), p]));
      const gm = new Map(games.map((p) => [p._id.toString(), p.n]));
      const cm = new Map(certs.map((p) => [p._id.toString(), p.n]));
      rows = profiles.map((p) => {
        const u = p.userId as unknown as { _id: Types.ObjectId; name: string };
        const s = p.classSectionId as unknown as { levelNumber: number; sectionName: string };
        const r = pm.get(u._id.toString());
        return {
          studentCode: p.studentCode,
          name: u.name,
          class: `${s.levelNumber}-${s.sectionName}`,
          quizAttempts: r?.n ?? 0,
          averagePercent: r ? Math.round(r.avg * 10) / 10 : null,
          quizAccuracyPercent: r && r.max ? Math.round((r.score / r.max) * 1000) / 10 : null,
          gameAttempts: gm.get(u._id.toString()) ?? 0,
          certificates: cm.get(u._id.toString()) ?? 0,
        };
      });
    }
    if (format === 'csv') return sendCsv(res, `${type}-report.csv`, rows);
    res.json({ type, period: { from: q.from ?? null, to: q.to ?? null }, rows });
  }),
);
