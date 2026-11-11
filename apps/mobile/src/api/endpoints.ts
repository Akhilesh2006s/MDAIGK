import type { LoginResponse } from '@mango/shared';
import { api } from './instance';
import type * as T from './types';

const e = encodeURIComponent;

// ------------------------------------------------------------------ auth
export const teacherLogin = (email: string, password: string) =>
  api.request<LoginResponse>('POST', '/auth/login', { body: { email: email.trim(), password, client: 'mobile' }, auth: false });
export const studentLogin = (schoolCode: string, studentCode: string, pin: string) =>
  api.request<LoginResponse>('POST', '/auth/student-login', {
    body: { schoolCode: schoolCode.trim().toUpperCase(), studentCode: studentCode.trim().toUpperCase(), pin },
    auth: false,
  });
export const logout = (refreshToken: string) => api.request<void>('POST', '/auth/logout', { body: { refreshToken }, auth: false });
export const changePassword = (currentPassword: string, newPassword: string) => api.post<void>('/auth/change-password', { currentPassword, newPassword });

// ------------------------------------------------------------------ teacher
export const teacherHome = () => api.get<T.TeacherHome>('/teacher/home');
export const teacherClasses = () => api.get<T.TeacherClass[]>('/teacher/classes');
export const sectionStudents = (sectionId: string, q?: string) => api.get<T.ClassStudentRow[]>(`/teacher/classes/${e(sectionId)}/students`, { q });
export const teacherStudent = (studentId: string) => api.get<T.TeacherStudentDetail>(`/teacher/students/${e(studentId)}`);
export const teacherActivities = (status?: T.ActivityStatus) => api.get<T.TeacherActivity[]>('/teacher/activities', { status });
export const createActivity = (body: T.ActivityInput) => api.post<T.TeacherActivity>('/teacher/activities', body);
export const publishActivity = (id: string) => api.post<T.TeacherActivity>(`/teacher/activities/${e(id)}/publish`);
export const closeActivity = (id: string) => api.post<T.TeacherActivity>(`/teacher/activities/${e(id)}/close`);
export const activityResults = (id: string) => api.get<T.ActivityResults>(`/teacher/activities/${e(id)}/results`);
export const reviewSubmission = (activityId: string, studentId: string, feedback: string) =>
  api.post<unknown>(`/teacher/activities/${e(activityId)}/completions/${e(studentId)}/review`, { feedback });
export const teacherPerformance = (q: { sectionId?: string; subjectId?: string }) => api.get<T.TeacherPerformance>('/teacher/performance', q);
export const teacherInsights = (sectionId?: string) => api.get<T.TeacherInsights>('/teacher/insights', { sectionId });
export const teacherSubjects = () => api.get<T.Subject[]>('/teacher/subjects');
export const teacherQuizzes = (subjectId?: string, levelNumber?: number) =>
  api.get<T.Paginated<T.QuizListItem>>('/quizzes', { subjectId, levelNumber, pageSize: 100 });

// ------------------------------------------------------------------ student
export const studentHome = () => api.get<T.StudentHome>('/student/home');
export const studentActivities = (status: 'pending' | 'completed' | 'all' = 'all') => api.get<T.StudentActivity[]>('/student/activities', { status });
export const completeActivity = (id: string, note?: string) => api.post<unknown>(`/student/activities/${e(id)}/complete`, { note: note || undefined });
export const studentProgress = (range: T.ProgressRange) => api.get<T.StudentProgress>('/student/progress', { range });
export const studentProfile = () => api.get<T.StudentProfile>('/student/profile');
export const updateStudentProfile = (body: { displayName?: string; avatar?: string }) => api.patch<{ ok: true }>('/student/profile', body);

export const learningSubjects = () => api.get<T.LearningSubject[]>('/learning/subjects');
export const learningItems = (view: 'mine' | 'all', subjectId?: string) =>
  api.get<T.Paginated<T.LearningItemSummary>>('/learning/items', { view, subjectId, pageSize: 100 });
export const continueLearning = () => api.get<T.LearningItemSummary[]>('/learning/continue');
export const learningItem = (id: string) => api.get<T.LearningItemDetail>(`/learning/items/${e(id)}`);
export const learningProgress = (id: string, body: { progressPct?: number; completed?: boolean }) => api.post<unknown>(`/learning/items/${e(id)}/progress`, body);

export const getQuiz = (id: string, activityId?: string) => api.get<T.PublicQuiz>(`/quizzes/${e(id)}`, { activityId });
export const submitQuiz = (id: string, body: T.QuizSubmission) => api.post<T.QuizResult>(`/quizzes/${e(id)}/attempts`, body);

export const games = () => api.get<T.GameSummary[]>('/games');
export const startGame = (id: string) => api.post<T.GameStart>(`/games/${e(id)}/attempts`);
export const finishGame = (attemptId: string, body: { score: number; level: number; durationSec: number; outcome: T.GameOutcome }) =>
  api.patch<unknown>(`/games/attempts/${e(attemptId)}`, body);

export const newsCategories = () => api.get<T.NewsCategoryRow[]>('/news/categories');
export const news = (category?: string) => api.get<T.Paginated<T.NewsArticle>>('/news', { category, pageSize: 50 });
export const newsArticle = (id: string) => api.get<T.NewsArticleDetail>(`/news/${e(id)}`);

export const programmes = () => api.get<T.ProgrammesResponse>('/programmes');
export const programme = (id: string) => api.get<T.ProgrammeDetail>(`/programmes/${e(id)}`);
export const enrol = (id: string) => api.post<unknown>(`/programmes/${e(id)}/enrolments`);
export const completeProgrammeItem = (id: string, itemId: string) => api.post<unknown>(`/programmes/${e(id)}/items/${e(itemId)}/complete`);

export const certificationLevels = () => api.get<T.CertificationLevels>('/certifications/levels');
export const certAssessment = (levelId: string) => api.get<T.CertAssessment>(`/certifications/levels/${e(levelId)}/assessment`);
export const submitCertAttempt = (levelId: string, body: Omit<T.QuizSubmission, 'activityId'>) =>
  api.post<T.QuizResult>(`/certifications/levels/${e(levelId)}/attempts`, body);
export const certificate = (id: string) => api.get<T.Certificate>(`/certificates/${e(id)}`);
export const certificatePdfUrl = (id: string) => `${api.baseUrl}/certificates/${e(id)}/pdf`;
