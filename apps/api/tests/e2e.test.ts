import type { Express } from 'express';
import { api, attemptId, login, ok, SA, setupApp, studentLogin, teardown } from './helpers';

let app: Express;
beforeAll(async () => {
  app = await setupApp();
});
afterAll(teardown);

/**
 * Spec §24 end-to-end flow:
 * Super Admin creates school and grants Classes 1–5 → School Admin adds teachers/students →
 * Teacher assigns quiz → Student completes quiz → dashboards reflect performance.
 */
it('full flow from school creation to dashboards', async () => {
  const sa = api(app, await login(app, SA.email, SA.password, 'web'));

  // 1. Super Admin creates school, grants Classes 1–5, assigns admin
  const school = ok(await sa.post('/schools', { schoolCode: 'E2E1', name: 'E2E School', city: 'Chennai', region: 'Tamil Nadu' }), 201);
  ok(await sa.put(`/schools/${school._id}/class-access`, { levels: [1, 2, 3, 4, 5] }));
  const adminRes = ok(await sa.post(`/schools/${school._id}/admins`, { name: 'E2E Admin', email: 'e2e-admin@x.test' }), 201);
  expect(adminRes.temporaryPassword).toBeTruthy();
  const admin = api(app, await login(app, 'e2e-admin@x.test', adminRes.temporaryPassword, 'web'));

  // 2. School Admin creates a section, a teacher and students
  const subjects = ok(await admin.get('/subjects'));
  const sci = subjects.find((s: { code: string }) => s.code === 'SCI');
  const section = ok(await admin.post(`/schools/${school._id}/sections`, { levelNumber: 3, sectionName: 'b' }), 201);
  expect(section.sectionName).toBe('B');
  const teacherRes = ok(await admin.post(`/schools/${school._id}/teachers`, { name: 'Tara T', email: 'tara@x.test', assignments: [{ classSectionId: section._id, subjectIds: [sci._id] }] }), 201);
  const s1 = ok(await admin.post(`/schools/${school._id}/students`, { name: 'Kiran One', studentCode: 'k-1', classSectionId: section._id }), 201);
  expect(s1.pin).toMatch(/^\d{6}$/);
  ok(await admin.post(`/schools/${school._id}/students`, { name: 'Kiran Two', studentCode: 'K-2', classSectionId: section._id, pin: '2468' }), 201);

  // 3. Teacher assigns a quiz to the class
  const teacher = api(app, await login(app, 'tara@x.test', teacherRes.temporaryPassword, 'mobile'));
  const home = ok(await teacher.get('/teacher/home'));
  expect(home.classes[0]).toMatchObject({ label: 'Class 3-B', studentCount: 2 });
  const quiz = ok(
    await teacher.post('/quizzes', {
      title: 'Plants check',
      context: 'activity',
      subjectId: sci._id,
      questions: [
        { prompt: 'Plants need?', options: ['Sunlight', 'Plastic'], correctIndex: 0 },
        { prompt: 'Leaves are usually?', options: ['Blue', 'Green'], correctIndex: 1 },
      ],
    }),
    201,
  );
  // teacher cannot assign a subject they do not teach
  const wrongSubject = subjects.find((s: { code: string }) => s.code === 'ENG');
  expect(
    (await teacher.post('/teacher/activities', { classSectionId: section._id, subjectId: wrongSubject._id, type: 'quiz', title: 'Wrong subject', quizId: quiz._id, startAt: new Date().toISOString(), dueAt: new Date(Date.now() + 86400000).toISOString() })).status,
  ).toBe(403);
  const activity = ok(
    await teacher.post('/teacher/activities', {
      classSectionId: section._id,
      subjectId: sci._id,
      type: 'quiz',
      title: 'Plants quiz',
      quizId: quiz._id,
      startAt: new Date(Date.now() - 60000).toISOString(),
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      publish: true,
    }),
    201,
  );

  // 4. Student sees and completes it
  const student = api(app, await studentLogin(app, 'E2E1', 'K-1', s1.pin));
  const notifications = ok(await student.get('/notifications'));
  expect(notifications.unread).toBe(1);
  const pending = ok(await student.get('/student/activities?status=pending'));
  expect(pending).toHaveLength(1);
  const q = ok(await student.get(`/quizzes/${quiz._id}?activityId=${activity._id}`));
  expect(q.questions[0].correctIndex).toBeUndefined();
  const result = ok(
    await student.post(`/quizzes/${quiz._id}/attempts`, {
      clientAttemptId: attemptId(),
      quizVersion: q.version,
      activityId: activity._id,
      answers: [
        { questionId: q.questions[0].id, selectedIndex: 0 },
        { questionId: q.questions[1].id, selectedIndex: 0 },
      ],
    }),
    201,
  );
  expect(result.percent).toBe(50);
  expect(ok(await student.get('/student/activities?status=completed'))).toHaveLength(1);
  const progress = ok(await student.get('/student/progress?range=7d'));
  expect(progress.overall).toMatchObject({ averagePercent: 50, sampleSize: 1, completedActivities: 1 });
  expect(progress.badges.map((b: { code: string }) => b.code)).toContain('FIRST_QUIZ');

  // 5. Dashboards reflect it
  const results = ok(await teacher.get(`/teacher/activities/${activity._id}/results`));
  expect(results.summary).toMatchObject({ recipients: 2, completed: 1, completionPercent: 50, averagePercent: 50 });
  expect(results.questionReview[0].wrongCount).toBe(1);

  const perf = ok(await teacher.get('/teacher/performance'));
  expect(perf.summary).toMatchObject({ averagePercent: 50, sampleSize: 1 });

  const overview = ok(await admin.get(`/schools/${school._id}/overview`));
  expect(overview.counts).toMatchObject({ students: 2, teachers: 1, enabledClasses: [1, 2, 3, 4, 5] });
  expect(overview.performance).toMatchObject({ averagePercent: 50, quizAccuracyPercent: 50, sampleSize: 1 });
  expect(overview.activityCompletion).toMatchObject({ expected: 2, completed: 1, ratePercent: 50 });

  const csv = await admin.get(`/schools/${school._id}/reports/students?format=csv`);
  expect(csv.headers['content-type']).toContain('text/csv');
  expect(csv.text.split('\n')[0]).toContain('studentCode');
  expect(csv.text).toContain('K-1');

  const platform = ok(await sa.get('/analytics/platform'));
  expect(platform.totals).toMatchObject({ schools: 1, students: 2, teachers: 1 });
  expect(platform.recentSchools[0]).toMatchObject({ name: 'E2E School', students: 2 });
});
