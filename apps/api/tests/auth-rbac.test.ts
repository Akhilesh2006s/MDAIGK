import type { Express } from 'express';
import { api, buildWorld, login, ok, SA, setupApp, teardown, type World } from './helpers';

let app: Express;
let w: World;

beforeAll(async () => {
  app = await setupApp();
  w = await buildWorld(app);
});
afterAll(teardown);

describe('authentication', () => {
  it('rejects bad credentials with INVALID_CREDENTIALS', async () => {
    const r = await api(app).post('/auth/login', { email: SA.email, password: 'wrong', client: 'web' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('keeps admins off mobile; teachers may use web (phase 1) and mobile', async () => {
    expect((await api(app).post('/auth/login', { ...SA, client: 'mobile' })).status).toBe(403);
    expect((await api(app).post('/auth/login', { email: 'teacher@a.test', password: 'TeachPass123', client: 'web' })).status).toBe(200);
    expect((await api(app).post('/auth/login', { email: 'teacher@a.test', password: 'TeachPass123', client: 'mobile' })).status).toBe(200);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const first = ok(await api(app).post('/auth/login', { ...SA, client: 'web' }));
    const second = ok(await api(app).post('/auth/refresh', { refreshToken: first.refreshToken }));
    expect(second.refreshToken).not.toBe(first.refreshToken);
    // reusing the old token is detected and kills the newer one too
    expect((await api(app).post('/auth/refresh', { refreshToken: first.refreshToken })).status).toBe(401);
    expect((await api(app).post('/auth/refresh', { refreshToken: second.refreshToken })).status).toBe(401);
  });

  it('blocks deactivated accounts immediately', async () => {
    const t = await login(app, 'admin@b.test', 'AdminPass123', 'web');
    const users = ok(await api(app, w.sa).get('/users?q=admin@b.test')).items;
    ok(await api(app, w.sa).patch(`/users/${users[0].id}`, { status: 'inactive' }));
    const r = await api(app, t).get('/auth/me');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('ACCOUNT_INACTIVE');
    ok(await api(app, w.sa).patch(`/users/${users[0].id}`, { status: 'active' }));
  });

  it('requires a token for protected routes', async () => {
    expect((await api(app).get('/schools')).status).toBe(401);
    expect((await api(app, 'garbage').get('/schools')).status).toBe(401);
  });
});

describe('role-based access (all four roles + denied cases)', () => {
  it('only Super Admin manages the platform', async () => {
    expect((await api(app, w.sa).get('/schools')).status).toBe(200);
    for (const t of [w.adminA, w.teacherA, w.studentA1]) {
      expect((await api(app, t).get('/schools')).status).toBe(403);
      expect((await api(app, t).get('/analytics/platform')).status).toBe(403);
      expect((await api(app, t).post('/plans', { name: 'X', maxClassLevel: 5 })).status).toBe(403);
    }
  });

  it('School Admin cannot change entitlements of their own school', async () => {
    const r = await api(app, w.adminA).put(`/schools/${w.ids.schoolA}/class-access`, { levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    expect(r.status).toBe(403);
    const pe = await api(app, w.adminA).put(`/schools/${w.ids.schoolA}/programme-entitlements`, { entitlements: [] });
    expect(pe.status).toBe(403);
    // but can read them
    expect((await api(app, w.adminA).get(`/schools/${w.ids.schoolA}/class-access`)).status).toBe(200);
  });

  it('teachers and students cannot use school-admin routes', async () => {
    expect((await api(app, w.teacherA).get(`/schools/${w.ids.schoolA}/students`)).status).toBe(403);
    expect((await api(app, w.studentA1).get(`/schools/${w.ids.schoolA}/students`)).status).toBe(403);
  });

  it('students cannot use teacher routes and teachers cannot use student routes', async () => {
    expect((await api(app, w.studentA1).get('/teacher/home')).status).toBe(403);
    expect((await api(app, w.teacherA).get('/student/home')).status).toBe(403);
    expect((await api(app, w.adminA).get('/teacher/home')).status).toBe(403);
  });

  it('teacher sees only assigned classes and their students', async () => {
    const classes = ok(await api(app, w.teacherA).get('/teacher/classes'));
    expect(classes.map((c: { sectionId: string }) => c.sectionId)).toEqual([w.ids.sectionA]);
    expect((await api(app, w.teacherA).get(`/teacher/classes/${w.ids.sectionA}/students`)).status).toBe(200);
    expect((await api(app, w.teacherA).get(`/teacher/classes/${w.ids.sectionA2}/students`)).status).toBe(403);
    expect((await api(app, w.teacherA).get(`/teacher/students/${w.ids.s1}`)).status).toBe(200);
    expect((await api(app, w.teacherA).get(`/teacher/students/${w.ids.s3}`)).status).toBe(403); // other section
  });

  it("students can only read their own certificates", async () => {
    expect((await api(app, w.studentA1).get(`/students/${w.ids.s1}/certificates`)).status).toBe(200);
    expect((await api(app, w.studentA1).get(`/students/${w.ids.s2}/certificates`)).status).toBe(403);
  });
});

describe('tenant isolation', () => {
  it('School Admin A cannot read School B records', async () => {
    expect((await api(app, w.adminA).get(`/schools/${w.ids.schoolB}`)).status).toBe(403);
    expect((await api(app, w.adminA).get(`/schools/${w.ids.schoolB}/students`)).status).toBe(403);
    expect((await api(app, w.adminA).get(`/schools/${w.ids.schoolB}/teachers`)).status).toBe(403);
    expect((await api(app, w.adminA).get(`/schools/${w.ids.schoolB}/overview`)).status).toBe(403);
    expect((await api(app, w.adminA).get(`/analytics/school/${w.ids.schoolB}`)).status).toBe(403);
  });

  it('School Admin A cannot reach a School B student through its own school id', async () => {
    expect((await api(app, w.adminA).get(`/schools/${w.ids.schoolA}/students/${w.ids.sb}`)).status).toBe(404);
    expect((await api(app, w.adminA).patch(`/schools/${w.ids.schoolA}/students/${w.ids.sb}`, { status: 'inactive' })).status).toBe(404);
    expect((await api(app, w.adminA).get(`/students/${w.ids.sb}/certificates`)).status).toBe(404);
  });

  it('School Admin A cannot enrol a student into a School B section', async () => {
    const r = await api(app, w.adminA).post(`/schools/${w.ids.schoolA}/students`, { name: 'X', studentCode: 'X1', classSectionId: w.ids.sectionB, pin: '1111' });
    expect(r.status).toBe(400);
  });

  it('list endpoints only return own-school rows', async () => {
    const list = ok(await api(app, w.adminA).get(`/schools/${w.ids.schoolA}/students`));
    expect(list.items.map((s: { studentCode: string }) => s.studentCode).sort()).toEqual(['A401', 'A402', 'A501']);
  });
});
