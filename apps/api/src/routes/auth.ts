import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { ERROR_CODES, MOBILE_ROLES, ROLES, WEB_ROLES, type AuthUser, type Role } from '@mango/shared';
import { env } from '../config/env';
import { authenticate, signAccessToken } from '../middleware/auth';
import { ClassSection, RefreshToken, School, SchoolMembership, StudentProfile, User } from '../models';
import { AppError, badRequest, unauthenticated } from '../utils/errors';
import { ah, parse } from '../utils/http';

export const authRouter = Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function buildAuthUser(userId: Types.ObjectId): Promise<AuthUser> {
  const user = await User.findById(userId).lean();
  if (!user) throw unauthenticated();
  const memberships = await SchoolMembership.find({ userId, status: 'active' }).lean();
  const schools = await School.find({ _id: { $in: memberships.map((m) => m.schoolId) }, status: 'active' }).lean();
  const schoolMap = new Map(schools.map((s) => [s._id.toString(), s]));
  const out: AuthUser = {
    id: user._id.toString(),
    name: user.name,
    email: user.email ?? undefined,
    role: user.role as Role,
    status: user.status as AuthUser['status'],
    schools: memberships
      .filter((m) => schoolMap.has(m.schoolId.toString()))
      .map((m) => {
        const s = schoolMap.get(m.schoolId.toString())!;
        return { schoolId: s._id.toString(), schoolName: s.name, schoolCode: s.schoolCode, role: m.role as Role };
      }),
  };
  if (user.role === ROLES.STUDENT) {
    const p = await StudentProfile.findOne({ userId, status: 'active' }).lean();
    if (p) {
      const sec = await ClassSection.findById(p.classSectionId).lean();
      out.student = {
        studentProfileId: p._id.toString(),
        studentCode: p.studentCode,
        classSectionId: p.classSectionId.toString(),
        levelNumber: p.levelNumber,
        sectionName: sec?.sectionName ?? '',
      };
    }
  }
  return out;
}

async function issueTokens(userId: Types.ObjectId, role: Role, family?: string, userAgent?: string) {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await RefreshToken.create({
    userId,
    tokenHash: sha256(refreshToken),
    family: family ?? crypto.randomUUID(),
    expiresAt: new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86400000),
    userAgent,
  });
  return { accessToken: signAccessToken(userId.toString(), role), refreshToken, expiresIn: env().ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * Phase 1 (client decision): all four roles use the web app; the React Native
 * app (Teacher/Student) follows later. Admins are still never allowed on mobile.
 * Set WEB_ADMIN_ONLY=true to restore the original "admins only on web" rule.
 */
function assertClientRole(role: Role, client: 'web' | 'mobile') {
  if (client === 'web' && process.env.WEB_ADMIN_ONLY === 'true' && !WEB_ROLES.includes(role)) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, 'Teachers and students use the Mango Dude mobile app');
  }
  if (client === 'mobile' && !MOBILE_ROLES.includes(role)) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, 'Administrators use the Mango Dude web dashboard');
  }
}

async function verifyPassword(user: { _id: Types.ObjectId; passwordHash?: string | null; lockedUntil?: Date | null; status?: string | null }, password: string) {
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Too many failed attempts. Try again later.');
  }
  const ok = await bcrypt.compare(password, user.passwordHash ?? '');
  if (!ok) {
    const updated = await User.findByIdAndUpdate(user._id, { $inc: { failedLoginCount: 1 } }, { new: true }).lean();
    if ((updated?.failedLoginCount ?? 0) >= MAX_FAILED) {
      await User.updateOne({ _id: user._id }, { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000), failedLoginCount: 0 });
    }
    throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials');
  }
  if (user.status !== 'active') throw new AppError(401, ERROR_CODES.ACCOUNT_INACTIVE, 'Account is inactive');
  await User.updateOne({ _id: user._id }, { failedLoginCount: 0, $unset: { lockedUntil: 1 }, lastLoginAt: new Date() });
}

// POST /auth/login — admins and teachers (email + password)
authRouter.post(
  '/login',
  ah(async (req, res) => {
    const body = parse(
      z.object({ email: z.string().email(), password: z.string().min(1).max(200), client: z.enum(['web', 'mobile']) }),
      req.body,
    );
    const user = await User.findOne({ email: body.email.toLowerCase() }).select('+passwordHash').lean();
    if (!user) {
      await bcrypt.compare(body.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv'); // timing
      throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials');
    }
    await verifyPassword(user, body.password);
    assertClientRole(user.role as Role, body.client);
    const tokens = await issueTokens(user._id, user.role as Role, undefined, req.header('user-agent'));
    res.json({ ...tokens, user: await buildAuthUser(user._id) });
  }),
);

// POST /auth/student-login — school code + school-issued student ID + PIN
authRouter.post(
  '/student-login',
  ah(async (req, res) => {
    const body = parse(
      z.object({ schoolCode: z.string().min(2).max(20), studentCode: z.string().min(1).max(30), pin: z.string().min(4).max(64) }),
      req.body,
    );
    const school = await School.findOne({ schoolCode: body.schoolCode.toUpperCase(), status: 'active' }).lean();
    const profile = school
      ? await StudentProfile.findOne({ schoolId: school._id, studentCode: body.studentCode.toUpperCase() }).lean()
      : null;
    const user = profile ? await User.findById(profile.userId).select('+passwordHash').lean() : null;
    if (!user || !profile) throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid school code, student ID or PIN');
    await verifyPassword(user, body.pin);
    if (profile.status !== 'active') throw new AppError(401, ERROR_CODES.ACCOUNT_INACTIVE, 'Student account is inactive');
    const tokens = await issueTokens(user._id, ROLES.STUDENT, undefined, req.header('user-agent'));
    res.json({ ...tokens, user: await buildAuthUser(user._id) });
  }),
);

// POST /auth/refresh — rotate refresh token; reuse of a rotated token revokes the whole family
authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(20).max(200) }), req.body);
    const hash = sha256(refreshToken);
    const stored = await RefreshToken.findOne({ tokenHash: hash }).lean();
    if (!stored) throw unauthenticated('Invalid refresh token');
    if (stored.revokedAt) {
      await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
      throw unauthenticated('Refresh token reuse detected — please sign in again');
    }
    if (stored.expiresAt < new Date()) throw unauthenticated('Refresh token expired');
    const user = await User.findById(stored.userId).lean();
    if (!user || user.status !== 'active') throw new AppError(401, ERROR_CODES.ACCOUNT_INACTIVE, 'Account is inactive');
    const tokens = await issueTokens(user._id, user.role as Role, stored.family, req.header('user-agent'));
    const claimed = await RefreshToken.updateOne(
      { _id: stored._id, revokedAt: null },
      { revokedAt: new Date(), replacedByHash: sha256(tokens.refreshToken) },
    );
    if (claimed.modifiedCount === 0) {
      // concurrent refresh with the same token — treat as reuse
      await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
      throw unauthenticated('Refresh token reuse detected — please sign in again');
    }
    res.json({ ...tokens, user: await buildAuthUser(user._id) });
  }),
);

// POST /auth/logout
authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(20).max(200) }), req.body);
    await RefreshToken.updateOne({ tokenHash: sha256(refreshToken) }, { revokedAt: new Date() });
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    res.json(await buildAuthUser(req.auth!.userId));
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  ah(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) }), req.body);
    const user = await User.findById(req.auth!.userId).select('+passwordHash').lean();
    if (!user || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect');
    await User.updateOne({ _id: user._id }, { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false });
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
    res.status(204).end();
  }),
);
