import type { Express } from 'express';
import { api, buildWorld, ok, setupApp, teardown, type World } from './helpers';

let app: Express;
let w: World;

beforeAll(async () => {
  app = await setupApp();
  w = await buildWorld(app);
});
afterAll(teardown);

describe('class locks', () => {
  it('locked classes appear locked to School Admin', async () => {
    const access = ok(await api(app, w.adminA).get(`/schools/${w.ids.schoolA}/class-access`));
    expect(access.filter((c: { enabled: boolean }) => c.enabled).map((c: { levelNumber: number }) => c.levelNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it('School Admin cannot create a section in a locked class (direct API call)', async () => {
    const r = await api(app, w.adminA).post(`/schools/${w.ids.schoolA}/sections`, { levelNumber: 6, sectionName: 'A' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CLASS_LOCKED');
  });

  it('revoking a class locks student and teacher access immediately', async () => {
    ok(await api(app, w.sa).put(`/schools/${w.ids.schoolA}/class-access`, { levels: [1, 2, 3, 5] }));
    const r = await api(app, w.studentA1).get('/learning/subjects');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CLASS_LOCKED');
    expect((await api(app, w.studentA1).get('/games')).body.error.code).toBe('CLASS_LOCKED');
    expect((await api(app, w.teacherA).get(`/teacher/classes/${w.ids.sectionA}/students`)).body.error.code).toBe('CLASS_LOCKED');
    // unaffected student in class 5
    expect((await api(app, w.studentA3).get('/learning/subjects')).status).toBe(200);
    ok(await api(app, w.sa).put(`/schools/${w.ids.schoolA}/class-access`, { levels: [1, 2, 3, 4, 5] }));
    expect((await api(app, w.studentA1).get('/learning/subjects')).status).toBe(200);
  });
});

describe('premium programme entitlements', () => {
  let programmes: Array<{ _id: string; code: string; premium: boolean }>;
  let ai: { _id: string };

  beforeAll(async () => {
    programmes = ok(await api(app, w.sa).get('/programmes'));
    ai = programmes.find((p) => p.code === 'AI_ACADEMY')!;
  });

  const setEnt = (enabled: boolean, validFrom?: string | null, validUntil?: string | null) =>
    api(app, w.sa).put(`/schools/${w.ids.schoolA}/programme-entitlements`, { entitlements: [{ programmeId: ai._id, enabled, validFrom, validUntil }] });

  it('separates the four premium academies from Young Scientist', async () => {
    const list = ok(await api(app, w.studentA1).get('/programmes'));
    expect(list.premiumAcademies.map((p: { code: string }) => p.code).sort()).toEqual(['AI_ACADEMY', 'CHESS_ACADEMY', 'HEALTH_ACADEMY', 'YOUNG_ENTREPRENEUR']);
    expect(list.otherProgrammes.map((p: { code: string }) => p.code)).toEqual(['YOUNG_SCIENTIST']);
  });

  it('disabled: locked state and no protected module content', async () => {
    ok(await setEnt(false));
    const list = ok(await api(app, w.studentA1).get('/programmes'));
    const card = list.premiumAcademies.find((p: { code: string }) => p.code === 'AI_ACADEMY');
    expect(card.locked).toBe(true);
    expect(card.modules).toBeUndefined();
    const r = await api(app, w.studentA1).get(`/programmes/${ai._id}`);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PROGRAMME_LOCKED');
    expect(r.body.modules).toBeUndefined();
    expect((await api(app, w.studentA1).post(`/programmes/${ai._id}/enrolments`)).status).toBe(403);
  });

  it('enabled: student can open, enrol and complete items', async () => {
    ok(await setEnt(true, new Date(Date.now() - 86400000).toISOString(), new Date(Date.now() + 86400000 * 30).toISOString()));
    const detail = ok(await api(app, w.studentA1).get(`/programmes/${ai._id}`));
    expect(detail.modules.length).toBeGreaterThan(0);
    ok(await api(app, w.studentA1).post(`/programmes/${ai._id}/enrolments`), 201);
    const lesson = detail.modules[0].items.find((i: { type: string }) => i.type === 'lesson');
    const e = ok(await api(app, w.studentA1).post(`/programmes/${ai._id}/items/${lesson._id}/complete`));
    expect(e.progressPct).toBeGreaterThan(0);
    const quizItem = detail.modules[0].items.find((i: { type: string }) => i.type === 'quiz');
    expect((await api(app, w.studentA1).post(`/programmes/${ai._id}/items/${quizItem._id}/complete`)).status).toBe(400);
  });

  it('expired: locked again with EXPIRED reason', async () => {
    ok(await setEnt(true, new Date(Date.now() - 86400000 * 60).toISOString(), new Date(Date.now() - 86400000).toISOString()));
    const list = ok(await api(app, w.studentA1).get('/programmes'));
    const card = list.premiumAcademies.find((p: { code: string }) => p.code === 'AI_ACADEMY');
    expect(card.locked).toBe(true);
    expect(card.lockReason).toBe('EXPIRED');
    const r = await api(app, w.studentA1).get(`/programmes/${ai._id}`);
    expect(r.body.error.code).toBe('PROGRAMME_LOCKED');
  });

  it('School Admin sees entitlement read-only', async () => {
    const ents = ok(await api(app, w.adminA).get(`/schools/${w.ids.schoolA}/programme-entitlements`));
    expect(ents.find((e: { code: string }) => e.code === 'AI_ACADEMY').effective.reason).toBe('EXPIRED');
  });
});

describe('plan assignment applies entitlements', () => {
  it('assigning the Premium plan grants classes 1–10 and all programmes', async () => {
    const plans = ok(await api(app, w.sa).get('/plans'));
    const premium = plans.find((p: { name: string }) => p.name === 'Premium');
    ok(
      await api(app, w.sa).put(`/schools/${w.ids.schoolA}/subscription`, {
        planId: premium._id,
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date(Date.now() + 86400000 * 365).toISOString(),
      }),
      201,
    );
    const access = ok(await api(app, w.adminA).get(`/schools/${w.ids.schoolA}/class-access`));
    expect(access.every((c: { enabled: boolean }) => c.enabled)).toBe(true);
    const list = ok(await api(app, w.studentA1).get('/programmes'));
    expect(list.premiumAcademies.every((p: { locked: boolean }) => !p.locked)).toBe(true);
    const logs = ok(await api(app, w.sa).get('/audit-logs?action=school.subscription'));
    expect(logs.total).toBeGreaterThan(0);
  });
});
