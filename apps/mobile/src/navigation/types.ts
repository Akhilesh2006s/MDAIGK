import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { DailyUsage, GameConfig } from '../api/types';

// ------------------------------------------------------------------ teacher
export type TeacherTabParams = {
  Home: undefined;
  Classes: undefined;
  Activities: undefined;
  Insights: undefined;
  Profile: undefined;
};

export type TeacherStackParams = {
  TeacherTabs: NavigatorScreenParams<TeacherTabParams>;
  ClassStudents: { sectionId: string; label: string };
  StudentProfile: { studentId: string; name: string };
  ActivityForm: { sectionId?: string } | undefined;
  ActivityResults: { activityId: string; title: string };
  ChangePassword: undefined;
};

export type TeacherStackScreen<K extends keyof TeacherStackParams> = NativeStackScreenProps<TeacherStackParams, K>;
export type TeacherTabScreen<K extends keyof TeacherTabParams> = CompositeScreenProps<
  BottomTabScreenProps<TeacherTabParams, K>,
  NativeStackScreenProps<TeacherStackParams>
>;

// ------------------------------------------------------------------ student
export type StudentTabParams = {
  Home: undefined;
  Learn: { subjectId?: string } | undefined;
  Games: undefined;
  News: undefined;
  Progress: undefined;
};

export type QuizParams =
  | { kind: 'quiz'; quizId: string; activityId?: string; title?: string; learningItemId?: string }
  | { kind: 'certification'; levelId: string; title?: string };

export type StudentStackParams = {
  StudentTabs: NavigatorScreenParams<StudentTabParams>;
  MyActivities: undefined;
  LearningItem: { id: string; title?: string };
  Quiz: QuizParams;
  GamePlay: { gameId: string; code: string; name: string; attemptId: string; config: GameConfig; dailyUsage: DailyUsage };
  NewsArticle: { id: string; title?: string };
  Programmes: undefined;
  ProgrammeDetail: { id: string; name: string };
  Certificates: undefined;
  CertificateDetail: { id: string };
  Profile: undefined;
};

export type StudentStackScreen<K extends keyof StudentStackParams> = NativeStackScreenProps<StudentStackParams, K>;
export type StudentTabScreen<K extends keyof StudentTabParams> = CompositeScreenProps<
  BottomTabScreenProps<StudentTabParams, K>,
  NativeStackScreenProps<StudentStackParams>
>;
