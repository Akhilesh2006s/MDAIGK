import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';

/**
 * Each test file gets its own database on the shared in-memory replica set,
 * the reference data from the seed, and a small two-school "world" built
 * through the real HTTP API.
 */
export async function setupApp(): Promise<Express> {
  const base = process.env.TEST_MONGO_BASE_URI!;
  const dbName = `t_${crypto.randomBytes(4).toString('hex')}`;
  const url = new URL(base);
  url.pathname = `/${dbName}`;
  process.env.MONGO_URI = url.toString();
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
  process.env.DEFAULT_TIMEZONE = 'Asia/Kolkata';
  const { connectDb } = await import('../src/db/connect');
  const { syncIndexes } = await import('../src/db/indexes');
  const { seedReference } = await import('../src/scripts/seed');
  const { createApp } = await import('../src/app');
  await connectDb(process.env.MONGO_URI);
  await syncIndexes();
  await seedReference();
  return createApp();
}

export async function teardown() {
  await mongoose.connection.db?.dropDatabase();
  await mongoose.disconnect();
}

export const SA = { email: 'admin@mangodude.in', password: 'MangoAdmin@2026' };

export function api(app: Express, token?: string) {
  const wrap = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  return {
    get: (p: string) => wrap(request(app).get(`/api/v1${p}`)),
    post: (p: string, body?: object) => wrap(request(app).post(`/api/v1${p}`)).send(body ?? {}),
    put: (p: string, body?: object) => wrap(request(app).put(`/api/v1${p}`)).send(body ?? {}),
    patch: (p: string, body?: object) => wrap(request(app).patch(`/api/v1${p}`)).send(body ?? {}),
  };
}

export async function login(app: Express, email: string, password: string, client: 'web' | 'mobile') {
  const r = await api(app).post('/auth/login', { email, password, client });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

export async function studentLogin(app: Express, schoolCode: string, studentCode: string, pin: string) {
  const r = await api(app).post('/auth/student-login', { schoolCode, studentCode, pin });
  if (r.status !== 200) throw new Error(`student login failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

export function ok(r: request.Response, status = 200) {
  if (r.status !== status) throw new Error(`Expected ${status}, got ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Two schools: A has Classes 1–5, B has Classes 1–10. Each has an admin, a section, a teacher, students. */
export async function buildWorld(app: Express) {
  const sa = await login(app, SA.email, SA.password, 'web');
  const A = api(app, sa);
  const schoolA = ok(await A.post('/schools', { schoolCode: 'SCHA', name: 'School A', classLevels: [1, 2, 3, 4, 5] }), 201);
  const schoolB = ok(await A.post('/schools', { schoolCode: 'SCHB', name: 'School B', classLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }), 201);
  ok(await A.post(`/schools/${schoolA._id}/admins`, { name: 'Admin A', email: 'admin@a.test', password: 'AdminPass123' }), 201);
  ok(await A.post(`/schools/${schoolB._id}/admins`, { name: 'Admin B', email: 'admin@b.test', password: 'AdminPass123' }), 201);
  const adminA = await login(app, 'admin@a.test', 'AdminPass123', 'web');
  const adminB = await login(app, 'admin@b.test', 'AdminPass123', 'web');

  const subjects = ok(await A.get('/subjects')) as Array<{ _id: string; code: string }>;
  const eng = subjects.find((s) => s.code === 'ENG')!._id;
  const math = subjects.find((s) => s.code === 'MATH')!._id;

  const aApi = api(app, adminA);
  const sectionA = ok(await aApi.post(`/schools/${schoolA._id}/sections`, { levelNumber: 4, sectionName: 'A' }), 201);
  const sectionA2 = ok(await aApi.post(`/schools/${schoolA._id}/sections`, { levelNumber: 5, sectionName: 'A' }), 201);
  ok(await aApi.post(`/schools/${schoolA._id}/teachers`, { name: 'Teacher A', email: 'teacher@a.test', password: 'TeachPass123', assignments: [{ classSectionId: sectionA._id, subjectIds: [eng, math] }] }), 201);
  const s1 = ok(await aApi.post(`/schools/${schoolA._id}/students`, { name: 'Asha Rao', studentCode: 'A401', classSectionId: sectionA._id, pin: '4321' }), 201);
  const s2 = ok(await aApi.post(`/schools/${schoolA._id}/students`, { name: 'Ben Kumar', studentCode: 'A402', classSectionId: sectionA._id, pin: '4321' }), 201);
  const s3 = ok(await aApi.post(`/schools/${schoolA._id}/students`, { name: 'Chitra N', studentCode: 'A501', classSectionId: sectionA2._id, pin: '4321' }), 201);

  const bApi = api(app, adminB);
  const sectionB = ok(await bApi.post(`/schools/${schoolB._id}/sections`, { levelNumber: 8, sectionName: 'A' }), 201);
  const sb = ok(await bApi.post(`/schools/${schoolB._id}/students`, { name: 'Dev B', studentCode: 'B801', classSectionId: sectionB._id, pin: '4321' }), 201);

  return {
    sa,
    adminA,
    adminB,
    teacherA: await login(app, 'teacher@a.test', 'TeachPass123', 'mobile'),
    studentA1: await studentLogin(app, 'SCHA', 'A401', '4321'),
    studentA2: await studentLogin(app, 'SCHA', 'A402', '4321'),
    studentA3: await studentLogin(app, 'SCHA', 'A501', '4321'),
    studentB: await studentLogin(app, 'SCHB', 'B801', '4321'),
    ids: { schoolA: schoolA._id, schoolB: schoolB._id, sectionA: sectionA._id, sectionA2: sectionA2._id, sectionB: sectionB._id, s1: s1.id, s2: s2.id, s3: s3.id, sb: sb.id, eng, math },
  };
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

export const attemptId = () => crypto.randomUUID();
