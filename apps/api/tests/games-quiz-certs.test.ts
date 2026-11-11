import type { Express } from 'express';
import { api, attemptId, buildWorld, ok, setupApp, teardown, type World } from './helpers';

let app: Express;
let w: World;

beforeAll(async () => {
  app = await setupApp();
  w = await buildWorld(app);
});
afterAll(teardown);

describe('games daily limit', () => {
  it('normal + boundary: 2 accepted, the 3rd is rejected with reset time', async () => {
    const games = ok(await api(app, w.studentA1).get('/games'));
    const g = games.find((x: { code: string }) => x.code === 'MATH_SPRINT');
    expect(g.dailyUsage).toMatchObject({ limit: 2, used: 0, remaining: 2 });
    const a1 = ok(await api(app, w.studentA1).post(`/games/${g._id}/attempts`), 201);
    expect(a1.dailyUsage.remaining).toBe(1);
    ok(await api(app, w.studentA1).patch(`/games/attempts/${a1.attemptId}`, { score: 120, level: 2, durationSec: 60, outcome: 'completed' }));
    // finishing twice is not allowed
    expect((await api(app, w.studentA1).patch(`/games/attempts/${a1.attemptId}`, { score: 999, level: 2, durationSec: 60, outcome: 'completed' })).status).toBe(404);
    const a2 = ok(await api(app, w.studentA1).post(`/games/${g._id}/attempts`), 201);
    expect(a2.dailyUsage.remaining).toBe(0);
    const third = await api(app, w.studentA1).post(`/games/${g._id}/attempts`);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('DAILY_LIMIT_REACHED');
    expect(new Date(third.body.error.details.resetsAt).getTime()).toBeGreaterThan(Date.now());
    // other students are unaffected
    expect((await api(app, w.studentA2).post(`/games/${g._id}/attempts`)).status).toBe(201);
  });

  it('concurrent: 6 parallel starts accept exactly 2', async () => {
    const games = ok(await api(app, w.studentA3).get('/games'));
    const g = games.find((x: { code: string }) => x.code === 'SPELL_MASTER');
    const results = await Promise.all(Array.from({ length: 6 }, () => api(app, w.studentA3).post(`/games/${g._id}/attempts`)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 429)).toHaveLength(4);
    const usage = ok(await api(app, w.studentA3).get('/games/daily-usage'));
    expect(usage.find((u: { code: string }) => u.code === 'SPELL_MASTER')).toMatchObject({ used: 2, remaining: 0 });
  });
});

describe('quizzes', () => {
  let quiz: { _id: string; questions: Array<{ _id: string; correctIndex: number; options: string[] }> };
  beforeAll(async () => {
    quiz = ok(
      await api(app, w.sa).post('/quizzes', {
        title: 'Test quiz',
        context: 'learning',
        status: 'published',
        classLevels: [4, 5],
        subjectId: w.ids.math,
        questions: [
          { prompt: '1+1', options: ['1', '2', '3'], correctIndex: 1, marks: 1 },
          { prompt: '2+2', options: ['4', '5'], correctIndex: 0, marks: 2 },
          { prompt: '3+3', options: ['5', '6', '7'], correctIndex: 1, marks: 1 },
        ],
      }),
      201,
    );
  });

  it('never exposes answer keys to students', async () => {
    const q = ok(await api(app, w.studentA1).get(`/quizzes/${quiz._id}`));
    expect(JSON.stringify(q)).not.toContain('correctIndex');
    expect(JSON.stringify(q)).not.toContain('explanation');
    expect(q.version).toBe(1);
  });

  it('scores on the server (marks-weighted)', async () => {
    const r = ok(
      await api(app, w.studentA1).post(`/quizzes/${quiz._id}/attempts`, {
        clientAttemptId: attemptId(),
        quizVersion: 1,
        answers: [
          { questionId: quiz.questions[0]._id, selectedIndex: 1 },
          { questionId: quiz.questions[1]._id, selectedIndex: 1 },
          { questionId: quiz.questions[2]._id, selectedIndex: 1 },
        ],
      }),
      201,
    );
    expect(r).toMatchObject({ score: 2, maxScore: 4, percent: 50, correctCount: 2, questionCount: 3 });
    expect(r.review[1].correctIndex).toBe(0); // revealed after submit
  });

  it('rejects duplicate submissions', async () => {
    const id = attemptId();
    const body = { clientAttemptId: id, quizVersion: 1, answers: [{ questionId: quiz.questions[0]._id, selectedIndex: 1 }] };
    ok(await api(app, w.studentA2).post(`/quizzes/${quiz._id}/attempts`, body), 201);
    const dup = await api(app, w.studentA2).post(`/quizzes/${quiz._id}/attempts`, body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_SUBMISSION');
  });

  it('rejects invalid answers', async () => {
    const bad = (answers: object[]) => api(app, w.studentA1).post(`/quizzes/${quiz._id}/attempts`, { clientAttemptId: attemptId(), quizVersion: 1, answers });
    expect((await bad([{ questionId: '64b000000000000000000000', selectedIndex: 0 }])).status).toBe(400);
    expect((await bad([{ questionId: quiz.questions[0]._id, selectedIndex: 9 }])).status).toBe(400);
    expect((await bad([{ questionId: quiz.questions[0]._id, selectedIndex: 1 }, { questionId: quiz.questions[0]._id, selectedIndex: 1 }])).status).toBe(400);
  });

  it('scores against the version attempted after the quiz changes', async () => {
    // student loads v1
    const v1 = ok(await api(app, w.studentA1).get(`/quizzes/${quiz._id}`));
    // admin edits: question 1 correct answer changes
    const edited = ok(
      await api(app, w.sa).patch(`/quizzes/${quiz._id}`, {
        questions: quiz.questions.map((q, i) => ({ ...q, prompt: `Q${i}`, options: q.options, correctIndex: i === 0 ? 0 : q.correctIndex })),
      }),
    );
    expect(edited.version).toBe(2);
    // submit against v1 with the v1-correct answer → still correct
    const r = ok(
      await api(app, w.studentA1).post(`/quizzes/${quiz._id}/attempts`, {
        clientAttemptId: attemptId(),
        quizVersion: v1.version,
        answers: [{ questionId: quiz.questions[0]._id, selectedIndex: 1 }],
      }),
      201,
    );
    expect(r.score).toBe(1);
    // unknown version → mismatch error
    const m = await api(app, w.studentA1).post(`/quizzes/${quiz._id}/attempts`, { clientAttemptId: attemptId(), quizVersion: 7, answers: [] });
    expect(m.body.error.code).toBe('QUIZ_VERSION_MISMATCH');
  });

  it('class 8 students in another school cannot load a class 4–5 quiz', async () => {
    expect((await api(app, w.studentB).get(`/quizzes/${quiz._id}`)).status).toBe(404);
  });
});

describe('certification', () => {
  async function takeLevel(token: string, levelId: string, mode: 'pass' | 'fail') {
    const a = await api(app, token).get(`/certifications/levels/${levelId}/assessment`);
    if (a.status !== 200) return a;
    // look up answer keys as Super Admin to build a deterministic answer sheet
    const full = ok(await api(app, w.sa).get(`/quizzes/${a.body.quiz.id}`));
    const answers = full.questions.map((q: { _id: string; correctIndex: number; options: string[] }) => ({
      questionId: q._id,
      selectedIndex: mode === 'pass' ? q.correctIndex : (q.correctIndex + 1) % q.options.length,
    }));
    return api(app, token).post(`/certifications/levels/${levelId}/attempts`, { clientAttemptId: attemptId(), quizVersion: a.body.quiz.version, answers });
  }

  it('enforces prerequisites, pass/fail, single award, PDF and public verification', async () => {
    const { levels } = ok(await api(app, w.studentA2).get('/certifications/levels'));
    const l1 = levels.find((l: { level: number }) => l.level === 1);
    const l2 = levels.find((l: { level: number }) => l.level === 2);
    expect(l1.state).toBe('available');
    expect(l2).toMatchObject({ state: 'locked', lockReason: 'PREREQUISITE_NOT_MET' });
    expect((await api(app, w.studentA2).get(`/certifications/levels/${l2.id}/assessment`)).status).toBe(403);

    const fail = ok(await takeLevel(w.studentA2, l1.id, 'fail'), 201);
    expect(fail.passed).toBe(false);
    expect(fail.certificate).toBeNull();

    const pass = ok(await takeLevel(w.studentA2, l1.id, 'pass'), 201);
    expect(pass.passed).toBe(true);
    expect(pass.certificate.certificateNumber).toMatch(/^MD-\d{4}-\d{6}$/);

    const again = await takeLevel(w.studentA2, l1.id, 'pass');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CERTIFIED');

    const certs = ok(await api(app, w.studentA2).get(`/students/${w.ids.s2}/certificates`));
    expect(certs).toHaveLength(1);

    const pdf = await api(app, w.studentA2).get(`/certificates/${certs[0]._id}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    // teacher (assigned) and school admin can view; other school's admin cannot
    expect((await api(app, w.teacherA).get(`/certificates/${certs[0]._id}`)).status).toBe(200);
    expect((await api(app, w.adminA).get(`/certificates/${certs[0]._id}`)).status).toBe(200);
    expect((await api(app, w.adminB).get(`/certificates/${certs[0]._id}`)).status).toBe(404);

    const v = ok(await api(app).get(`/public/certificates/verify/${certs[0].verificationCode}`));
    expect(v).toMatchObject({ valid: true, level: 1, studentName: 'Ben K.' });
    expect(v.studentId).toBeUndefined();
    expect(v.percent).toBeUndefined();

    const after = ok(await api(app, w.studentA2).get('/certifications/levels'));
    expect(after.currentLevel).toBe(1);
    expect(after.levels.find((l: { level: number }) => l.level === 2).state).toBe('available');
  });
});
