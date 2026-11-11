import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '@mango/shared';
import { HomeRedirect, RequireAuth, RequireRole } from './auth/guards';
import { AppLayout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage, UnsupportedRolePage } from './pages/StatusPages';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
// Super Admin
import PlatformOverview from './pages/super/PlatformOverview';
import SchoolsPage from './pages/super/SchoolsPage';
import SchoolDetailPage from './pages/super/SchoolDetailPage';
import PlansPage from './pages/super/PlansPage';
import UsersPage from './pages/super/UsersPage';
import SearchPage from './pages/super/SearchPage';
import AuditLogPage from './pages/super/AuditLogPage';
import PlatformSettingsPage from './pages/super/PlatformSettingsPage';
import SubjectsPage from './pages/super/content/SubjectsPage';
import LearningItemsPage from './pages/super/content/LearningItemsPage';
import ContentNewsPage from './pages/super/content/NewsPage';
import QuizzesPage from './pages/super/content/QuizzesPage';
import ContentGamesPage from './pages/super/content/GamesPage';
import ContentProgrammesPage from './pages/super/content/ProgrammesPage';
import CertificationPage from './pages/super/content/CertificationPage';
// School Admin
import SchoolOverview from './pages/school/SchoolOverview';
import ClassesPage from './pages/school/ClassesPage';
import TeachersPage from './pages/school/TeachersPage';
import StudentsPage from './pages/school/StudentsPage';
import StudentDetailPage from './pages/school/StudentDetailPage';
import ReportsPage from './pages/school/ReportsPage';
import SchoolSettingsPage from './pages/school/SettingsPage';
// Teacher
import TeacherHome from './pages/teacher/TeacherHome';
import TeacherClasses, { ClassStudentsPage } from './pages/teacher/TeacherClasses';
import TeacherStudentProfile from './pages/teacher/TeacherStudentProfile';
import TeacherActivities from './pages/teacher/TeacherActivities';
import ActivityResults from './pages/teacher/ActivityResults';
import TeacherPerformance from './pages/teacher/TeacherPerformance';
import TeacherInsights from './pages/teacher/TeacherInsights';
import TeacherQuizzes from './pages/teacher/TeacherQuizzes';
// Student
import StudentHome from './pages/student/StudentHome';
import StudentActivities from './pages/student/StudentActivities';
import LearnPage, { LearningItemPage } from './pages/student/Learn';
import QuizPage from './pages/student/QuizPage';
import NewsPage, { NewsArticlePage } from './pages/student/News';
import GamesPage, { GamePlayPage } from './pages/student/Games';
import ProgrammesPage, { ProgrammeDetailPage } from './pages/student/Programmes';
import CertificatesPage, { AssessmentPage } from './pages/student/Certificates';
import ProgressPage from './pages/student/Progress';
import StudentProfilePage from './pages/student/StudentProfile';
import './pages/student/student.css';

const SA = [ROLES.SUPER_ADMIN];
const SCH = [ROLES.SCHOOL_ADMIN];
const TCH = [ROLES.TEACHER];
const STU = [ROLES.STUDENT];

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unsupported" element={<UnsupportedRolePage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route
        path="/super"
        element={
          <RequireRole roles={SA}>
            <AppLayout />
          </RequireRole>
        }
      >
        <Route index element={<PlatformOverview />} />
        <Route path="schools" element={<SchoolsPage />} />
        <Route path="schools/:schoolId" element={<SchoolDetailPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="settings" element={<PlatformSettingsPage />} />
        <Route path="content" element={<Navigate to="/super/content/subjects" replace />} />
        <Route path="content/subjects" element={<SubjectsPage />} />
        <Route path="content/learning" element={<LearningItemsPage />} />
        <Route path="content/news" element={<ContentNewsPage />} />
        <Route path="content/quizzes" element={<QuizzesPage />} />
        <Route path="content/games" element={<ContentGamesPage />} />
        <Route path="content/programmes" element={<ContentProgrammesPage />} />
        <Route path="content/certifications" element={<CertificationPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="/school"
        element={
          <RequireRole roles={SCH}>
            <AppLayout />
          </RequireRole>
        }
      >
        <Route index element={<SchoolOverview />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:studentId" element={<StudentDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SchoolSettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="/teacher"
        element={
          <RequireRole roles={TCH}>
            <AppLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="/teacher/home" replace />} />
        <Route path="home" element={<TeacherHome />} />
        <Route path="classes" element={<TeacherClasses />} />
        <Route path="classes/:sectionId/students" element={<ClassStudentsPage />} />
        <Route path="students/:id" element={<TeacherStudentProfile />} />
        <Route path="activities" element={<TeacherActivities />} />
        <Route path="activities/:id/results" element={<ActivityResults />} />
        <Route path="performance" element={<TeacherPerformance />} />
        <Route path="insights" element={<TeacherInsights />} />
        <Route path="quizzes" element={<TeacherQuizzes />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="/student"
        element={
          <RequireRole roles={STU}>
            <AppLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="/student/home" replace />} />
        <Route path="home" element={<StudentHome />} />
        <Route path="activities" element={<StudentActivities />} />
        <Route path="learn" element={<LearnPage />} />
        <Route path="learn/items/:id" element={<LearningItemPage />} />
        <Route path="quiz/:quizId" element={<QuizPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="news/:id" element={<NewsArticlePage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/:gameId" element={<GamePlayPage />} />
        <Route path="programmes" element={<ProgrammesPage />} />
        <Route path="programmes/:id" element={<ProgrammeDetailPage />} />
        <Route path="certificates" element={<CertificatesPage />} />
        <Route path="certificates/:levelId/assessment" element={<AssessmentPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="profile" element={<StudentProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
