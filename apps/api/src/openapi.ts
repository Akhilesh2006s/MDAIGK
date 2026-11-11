/**
 * OpenAPI 3.1 contract for the Mango Dude API (served at /api/docs and /api/openapi.json).
 * Request bodies are validated with zod in the route files; the schemas below mirror them.
 */
type Op = {
  summary: string;
  roles: string;
  body?: string;
  query?: Array<[string, string]>;
  public?: boolean;
};

const ERR = { $ref: '#/components/responses/Error' };

const routes: Record<string, Record<string, Op>> = {
  // ---------------------------------------------------------------- auth
  '/auth/login': { post: { summary: 'Admin / teacher login (email + password). `client` must match the role: web = admins, mobile = teacher.', roles: 'public', body: 'Login', public: true } },
  '/auth/student-login': { post: { summary: 'Student login with school code, school-issued student ID and PIN', roles: 'public', body: 'StudentLogin', public: true } },
  '/auth/refresh': { post: { summary: 'Rotate refresh token (reuse revokes the token family)', roles: 'public', body: 'Refresh', public: true } },
  '/auth/logout': { post: { summary: 'Revoke a refresh token', roles: 'public', body: 'Refresh', public: true } },
  '/auth/me': { get: { summary: 'Current user, memberships and student context', roles: 'all' } },
  '/auth/change-password': { post: { summary: 'Change password (revokes other sessions)', roles: 'all', body: 'ChangePassword' } },
  // ---------------------------------------------------------------- schools
  '/schools': {
    get: { summary: 'List/search schools', roles: 'SUPER_ADMIN', query: [['q', 'string'], ['status', 'string'], ['region', 'string'], ['page', 'integer'], ['pageSize', 'integer']] },
    post: { summary: 'Create school (optionally grant classes)', roles: 'SUPER_ADMIN', body: 'School' },
  },
  '/schools/{schoolId}': {
    get: { summary: 'School profile with counts, enabled classes and plan', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
    patch: { summary: 'Edit school profile / activate / deactivate', roles: 'SUPER_ADMIN', body: 'School' },
  },
  '/schools/{schoolId}/settings': { patch: { summary: 'Local preferences (School Admin cannot change entitlements)', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)', body: 'SchoolSettings' } },
  '/schools/{schoolId}/class-access': {
    get: { summary: 'Class 1–10 entitlement (read-only for School Admin)', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
    put: { summary: 'Grant exactly these class levels', roles: 'SUPER_ADMIN', body: 'ClassAccess' },
  },
  '/schools/{schoolId}/programme-entitlements': {
    get: { summary: 'Programme entitlements with effective state', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
    put: { summary: 'Enable/disable programmes with validity', roles: 'SUPER_ADMIN', body: 'ProgrammeEntitlements' },
  },
  '/schools/{schoolId}/subscription': {
    get: { summary: 'Current subscription and history', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
    put: { summary: 'Assign plan (optionally applies plan class/programme access)', roles: 'SUPER_ADMIN', body: 'Subscription' },
  },
  '/schools/{schoolId}/admins': {
    get: { summary: 'School administrators', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
    post: { summary: 'Assign / create school administrator', roles: 'SUPER_ADMIN', body: 'Person' },
  },
  '/schools/{schoolId}/sections': {
    get: { summary: 'Sections for the academic year (locked flag for non-entitled classes)', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
    post: { summary: 'Create section under an enabled class', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)', body: 'Section' },
  },
  '/schools/{schoolId}/sections/{sectionId}': { patch: { summary: 'Rename / deactivate section', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)', body: 'Section' } },
  '/schools/{schoolId}/teachers': {
    get: { summary: 'Teachers with assignments', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
    post: { summary: 'Add teacher (returns a one-time temporary password if none supplied)', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)', body: 'Teacher' },
  },
  '/schools/{schoolId}/teachers/{teacherId}': { patch: { summary: 'Edit teacher / deactivate membership', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' } },
  '/schools/{schoolId}/teachers/{teacherId}/assignments': { put: { summary: 'Replace class/subject assignments', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)', body: 'Assignments' } },
  '/schools/{schoolId}/students': {
    get: { summary: 'Students (paginated, filter by section/class/status/search)', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
    post: { summary: 'Add student (returns one-time PIN if none supplied)', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)', body: 'Student' },
  },
  '/schools/{schoolId}/students/{studentId}': {
    get: { summary: 'Student profile and performance', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
    patch: { summary: 'Edit student / move section / change status', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' },
  },
  '/schools/{schoolId}/students/{studentId}/reset-pin': { post: { summary: 'Reset student PIN', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' } },
  '/schools/{schoolId}/overview': { get: { summary: 'School dashboard metrics', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)', query: [['from', 'date'], ['to', 'date'], ['levelNumber', 'integer'], ['sectionId', 'string'], ['subjectId', 'string']] } },
  '/schools/{schoolId}/reports/{type}': {
    get: { summary: 'Reports: class | subject | games | certificates | programmes | students. `format=csv` for CSV export.', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)', query: [['format', 'string'], ['from', 'date'], ['to', 'date']] },
  },
  // ---------------------------------------------------------------- platform
  '/plans': { get: { summary: 'Subscription plans', roles: 'SUPER_ADMIN' }, post: { summary: 'Create plan', roles: 'SUPER_ADMIN', body: 'Plan' } },
  '/plans/{id}': { patch: { summary: 'Update plan', roles: 'SUPER_ADMIN', body: 'Plan' } },
  '/users': { get: { summary: 'Platform-wide user search', roles: 'SUPER_ADMIN' }, post: { summary: 'Create Super Admin', roles: 'SUPER_ADMIN' } },
  '/users/{id}': { patch: { summary: 'Activate / deactivate user', roles: 'SUPER_ADMIN' } },
  '/users/{id}/reset-password': { post: { summary: 'Reset password / PIN', roles: 'SUPER_ADMIN' } },
  '/search': { get: { summary: 'Search schools, users, student IDs and class sections', roles: 'SUPER_ADMIN', query: [['q', 'string']] } },
  '/audit-logs': { get: { summary: 'Privileged-action history', roles: 'SUPER_ADMIN' } },
  '/settings': { get: { summary: 'Platform settings', roles: 'SUPER_ADMIN' }, patch: { summary: 'Update platform settings', roles: 'SUPER_ADMIN' } },
  '/analytics/platform': { get: { summary: 'Platform overview, growth, subjects, programmes, activity', roles: 'SUPER_ADMIN' } },
  '/analytics/school/{schoolId}': { get: { summary: 'School analytics', roles: 'SUPER_ADMIN, SCHOOL_ADMIN (own)' } },
  '/analytics/class/{sectionId}': { get: { summary: 'Class analytics', roles: 'SUPER_ADMIN, SCHOOL_ADMIN, TEACHER (assigned)' } },
  '/analytics/student/{studentId}': { get: { summary: 'Student analytics', roles: 'SUPER_ADMIN, SCHOOL_ADMIN, TEACHER (assigned)' } },
  '/notifications': { get: { summary: 'My notifications', roles: 'all' } },
  '/notifications/{id}/read': { patch: { summary: 'Mark read', roles: 'all' } },
  '/notifications/read-all': { post: { summary: 'Mark all read', roles: 'all' } },
  // ---------------------------------------------------------------- content
  '/subjects': { get: { summary: 'Subjects (students: those for their class)', roles: 'all' }, post: { summary: 'Create subject', roles: 'SUPER_ADMIN' } },
  '/subjects/{id}': { patch: { summary: 'Enable/disable subject, class applicability', roles: 'SUPER_ADMIN' } },
  '/content/learning-items': { get: { summary: 'All learning items (any status)', roles: 'SUPER_ADMIN' }, post: { summary: 'Create learning item (draft)', roles: 'SUPER_ADMIN', body: 'LearningItem' } },
  '/content/learning-items/{id}': { patch: { summary: 'Edit learning item (bumps version)', roles: 'SUPER_ADMIN' } },
  '/content/learning-items/{id}/status': { post: { summary: 'Moderation: draft → review → published → archived', roles: 'SUPER_ADMIN' } },
  '/learning/subjects': { get: { summary: 'My subjects with progress', roles: 'STUDENT' } },
  '/learning/items': { get: { summary: 'Published items for my class (`view=mine|all`)', roles: 'STUDENT, TEACHER' } },
  '/learning/continue': { get: { summary: 'Unfinished items to resume', roles: 'STUDENT' } },
  '/learning/items/{id}': { get: { summary: 'Learning item detail (records lastOpened)', roles: 'STUDENT, TEACHER' } },
  '/learning/items/{id}/progress': { post: { summary: 'Save progress / complete', roles: 'STUDENT' } },
  '/news/categories': { get: { summary: 'Eight categories with visible article counts', roles: 'all' } },
  '/news': { get: { summary: 'Articles (students: published & targeted to their class)', roles: 'all' }, post: { summary: 'Create article (draft)', roles: 'SUPER_ADMIN', body: 'News' } },
  '/news/{id}': { get: { summary: 'Article detail', roles: 'all' }, patch: { summary: 'Edit article', roles: 'SUPER_ADMIN' } },
  '/news/{id}/publish': { post: { summary: 'Publish article', roles: 'SUPER_ADMIN' } },
  '/news/{id}/archive': { post: { summary: 'Archive article', roles: 'SUPER_ADMIN' } },
  '/quizzes': { get: { summary: 'Quiz catalogue', roles: 'SUPER_ADMIN, TEACHER' }, post: { summary: 'Create quiz (teachers: activity quizzes for their school)', roles: 'SUPER_ADMIN, TEACHER', body: 'Quiz' } },
  '/quizzes/{id}': { get: { summary: 'Quiz (students never receive answer keys)', roles: 'all' }, patch: { summary: 'Edit quiz (question changes create a new version)', roles: 'SUPER_ADMIN, TEACHER (own)' } },
  '/quizzes/{id}/attempts': { post: { summary: 'Submit answers; scored on the server against the version attempted. Duplicate clientAttemptId → 409.', roles: 'STUDENT', body: 'QuizAttempt' } },
  // ---------------------------------------------------------------- games, programmes, certificates
  '/games': { get: { summary: 'Games (students: with daily used/remaining and reset time)', roles: 'all' } },
  '/games/daily-usage': { get: { summary: 'Today’s usage per game', roles: 'STUDENT' } },
  '/games/{id}': { patch: { summary: 'Configure availability, classes, daily limit', roles: 'SUPER_ADMIN' } },
  '/games/{id}/attempts': { post: { summary: 'Start game — atomically consumes one daily attempt (429 DAILY_LIMIT_REACHED at limit)', roles: 'STUDENT' } },
  '/games/attempts/{attemptId}': { patch: { summary: 'Finish game with score, level, duration, outcome', roles: 'STUDENT', body: 'GameResult' } },
  '/games/{id}/history': { get: { summary: 'My recent attempts', roles: 'STUDENT' } },
  '/programmes': { get: { summary: 'Programmes (students: premium academies vs other programmes, lock state)', roles: 'all' }, post: { summary: 'Create programme', roles: 'SUPER_ADMIN' } },
  '/programmes/{id}': { get: { summary: 'Programme modules (403 PROGRAMME_LOCKED if not entitled)', roles: 'all' }, patch: { summary: 'Edit programme & modules', roles: 'SUPER_ADMIN' } },
  '/programmes/{id}/enrolments': { post: { summary: 'Enrol in programme', roles: 'STUDENT' } },
  '/programmes/{id}/items/{itemId}/complete': { post: { summary: 'Complete a programme item', roles: 'STUDENT' } },
  '/certifications/levels': { get: { summary: 'Levels 1–10 (students: certified / available / locked)', roles: 'all' }, post: { summary: 'Create level', roles: 'SUPER_ADMIN' } },
  '/certifications/levels/{id}': { patch: { summary: 'Edit level rules', roles: 'SUPER_ADMIN' } },
  '/certifications/levels/{id}/assessment': { get: { summary: 'Assessment for an available level', roles: 'STUDENT' } },
  '/certifications/levels/{id}/attempts': { post: { summary: 'Submit assessment; issues certificate once if passed', roles: 'STUDENT', body: 'QuizAttempt' } },
  '/students/{studentId}/certificates': { get: { summary: 'Certificates for a permitted student', roles: 'all (scoped)' } },
  '/certificates/{id}': { get: { summary: 'Certificate detail', roles: 'all (scoped)' } },
  '/certificates/{id}/pdf': { get: { summary: 'Download certificate PDF', roles: 'all (scoped)' } },
  '/public/certificates/verify/{code}': { get: { summary: 'Public verification (minimal details only)', roles: 'public', public: true } },
  // ---------------------------------------------------------------- teacher
  '/teacher/home': { get: { summary: 'Greeting, class cards, pending reviews', roles: 'TEACHER' } },
  '/teacher/classes': { get: { summary: 'Assigned classes & subjects', roles: 'TEACHER' } },
  '/teacher/classes/{sectionId}/students': { get: { summary: 'Students in an assigned class', roles: 'TEACHER' } },
  '/teacher/students/{studentId}': { get: { summary: 'Student profile, subject scores, learning history', roles: 'TEACHER' } },
  '/teacher/subjects': { get: { summary: 'Subjects I teach', roles: 'TEACHER' } },
  '/teacher/activities': { get: { summary: 'My activities', roles: 'TEACHER' }, post: { summary: 'Create quiz / practice / worksheet activity', roles: 'TEACHER', body: 'Activity' } },
  '/teacher/activities/{id}': { get: { summary: 'Activity', roles: 'TEACHER' }, patch: { summary: 'Edit activity', roles: 'TEACHER' } },
  '/teacher/activities/{id}/publish': { post: { summary: 'Publish and notify students', roles: 'TEACHER' } },
  '/teacher/activities/{id}/close': { post: { summary: 'Close activity', roles: 'TEACHER' } },
  '/teacher/activities/{id}/results': { get: { summary: 'Completion, scores and incorrect-answer review', roles: 'TEACHER' } },
  '/teacher/activities/{id}/completions/{studentId}/review': { post: { summary: 'Review a submission', roles: 'TEACHER' } },
  '/teacher/performance': { get: { summary: 'Class/subject performance and weekly trend', roles: 'TEACHER' } },
  '/teacher/insights': { get: { summary: 'Top performers & students needing support', roles: 'TEACHER' } },
  // ---------------------------------------------------------------- student
  '/student/home': { get: { summary: 'Home: profile, daily progress, streak, subjects, continue learning', roles: 'STUDENT' } },
  '/student/activities': { get: { summary: 'Assigned activities', roles: 'STUDENT' } },
  '/student/activities/{id}/complete': { post: { summary: 'Mark practice/worksheet complete', roles: 'STUDENT' } },
  '/student/progress': { get: { summary: 'Progress, subjects, history, programmes, certificates, badges', roles: 'STUDENT', query: [['range', '7d|30d|90d|all']] } },
  '/student/profile': { get: { summary: 'My profile', roles: 'STUDENT' }, patch: { summary: 'Update display name / avatar', roles: 'STUDENT' } },
};

const S = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
const str = { type: 'string' };
const int = { type: 'integer' };
const id = { type: 'string', description: 'ObjectId' };
const levels = { type: 'array', items: { type: 'integer', minimum: 1, maximum: 10 } };

const schemas = {
  Error: S({ error: S({ code: str, message: str, details: {} }, ['code', 'message']) }, ['error']),
  Login: S({ email: str, password: str, client: { type: 'string', enum: ['web', 'mobile'] } }, ['email', 'password', 'client']),
  StudentLogin: S({ schoolCode: str, studentCode: str, pin: str }, ['schoolCode', 'studentCode', 'pin']),
  Refresh: S({ refreshToken: str }, ['refreshToken']),
  ChangePassword: S({ currentPassword: str, newPassword: str }, ['currentPassword', 'newPassword']),
  School: S({ schoolCode: str, name: str, address: str, city: str, region: str, contactPerson: S({ name: str, email: str, phone: str }), status: str, timezone: str, currentAcademicYear: str, classLevels: levels }, ['schoolCode', 'name']),
  SchoolSettings: S({ address: str, contactPerson: S({ name: str, email: str, phone: str }), settings: S({ displayName: str, logoUrl: str, allowStudentLeaderboard: { type: 'boolean' } }) }),
  ClassAccess: S({ levels }, ['levels']),
  ProgrammeEntitlements: S({ entitlements: { type: 'array', items: S({ programmeId: id, enabled: { type: 'boolean' }, validFrom: str, validUntil: str }, ['programmeId', 'enabled']) } }),
  Subscription: S({ planId: id, startDate: str, endDate: str, status: str, applyEntitlements: { type: 'boolean' } }, ['planId', 'startDate', 'endDate']),
  Plan: S({ name: str, description: str, maxClassLevel: int, programmeCodes: { type: 'array', items: str }, status: str }, ['name', 'maxClassLevel']),
  Person: S({ name: str, email: str, phone: str, password: str }, ['name', 'email']),
  Section: S({ levelNumber: int, sectionName: str, academicYear: str }, ['levelNumber', 'sectionName']),
  Assignments: S({ assignments: { type: 'array', items: S({ classSectionId: id, subjectIds: { type: 'array', items: id } }) } }),
  Teacher: S({ name: str, email: str, phone: str, password: str, assignments: { $ref: '#/components/schemas/Assignments/properties/assignments' } }, ['name', 'email']),
  Student: S({ name: str, displayName: str, studentCode: str, classSectionId: id, pin: str }, ['name', 'studentCode', 'classSectionId']),
  LearningItem: S({ subjectId: id, classLevels: levels, type: str, title: str, description: str, body: str, instructions: str, audioUrl: str, quizId: id }, ['subjectId', 'classLevels', 'type', 'title']),
  News: S({ category: str, title: str, summary: str, body: str, targetClasses: levels, featured: { type: 'boolean' }, publishAt: str, archiveAt: str, quizId: id }, ['category', 'title', 'summary']),
  Quiz: S({ title: str, context: str, subjectId: id, classLevels: levels, questions: { type: 'array', items: S({ prompt: str, options: { type: 'array', items: str }, correctIndex: int, marks: { type: 'number' }, explanation: str }) } }, ['title', 'context', 'questions']),
  QuizAttempt: S({ clientAttemptId: str, quizVersion: int, durationSec: int, activityId: id, answers: { type: 'array', items: S({ questionId: id, selectedIndex: int }) } }, ['clientAttemptId', 'quizVersion', 'answers']),
  GameResult: S({ score: int, level: int, durationSec: int, outcome: { type: 'string', enum: ['completed', 'failed', 'abandoned'] } }, ['score', 'durationSec', 'outcome']),
  Activity: S({ classSectionId: id, studentIds: { type: 'array', items: id }, subjectId: id, type: { type: 'string', enum: ['quiz', 'practice', 'worksheet'] }, title: str, instructions: str, quizId: id, worksheetRef: str, startAt: str, dueAt: str, publish: { type: 'boolean' } }, ['classSectionId', 'subjectId', 'type', 'title', 'startAt', 'dueAt']),
};

const paths: Record<string, Record<string, unknown>> = {};
for (const [path, ops] of Object.entries(routes)) {
  paths[`/api/v1${path}`] = {};
  for (const [method, op] of Object.entries(ops)) {
    const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: str }));
    (op.query ?? []).forEach(([name, type]) => params.push({ name, in: 'query', required: false, schema: { type: type === 'integer' ? 'integer' : 'string' } as never }));
    paths[`/api/v1${path}`][method] = {
      tags: [path.split('/')[1]],
      summary: op.summary,
      description: `Roles: ${op.roles}`,
      security: op.public ? [] : [{ bearerAuth: [] }],
      parameters: params.length ? params : undefined,
      requestBody: op.body ? { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${op.body}` } } } } : undefined,
      responses: { 200: { description: 'OK' }, 400: ERR, 401: ERR, 403: ERR, 404: ERR, 409: ERR },
    };
  }
}

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Mango Dude AIGK API',
    version: '1.0.0',
    description:
      'REST API for the Mango Dude platform. All list endpoints return `{ items, page, pageSize, total, totalPages }`. ' +
      'Errors return `{ error: { code, message, details? } }`. Users with several school memberships send `x-school-id`.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas,
    responses: { Error: { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
  },
  paths,
};
