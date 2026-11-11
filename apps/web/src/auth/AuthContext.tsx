import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ROLES, type AuthUser, type LoginResponse } from '@mango/shared';
import { api as defaultApi, type ApiClient } from '../api/client';

type Status = 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: Status;
  user: AuthUser | null;
  /** Active school for School Admins, Teachers and Students (null for Super Admin). */
  activeSchoolId: string | null;
  /** Schools where the user holds their own role (School Admin / Teacher / Student). */
  adminSchools: AuthUser['schools'];
  login(email: string, password: string): Promise<AuthUser>;
  studentLogin(schoolCode: string, studentCode: string, pin: string): Promise<AuthUser>;
  logout(): Promise<void>;
  setActiveSchoolId(id: string): void;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const SCHOOL_KEY = 'mango.activeSchoolId';

function readSchool(): string | null {
  try {
    return localStorage.getItem(SCHOOL_KEY);
  } catch {
    return null;
  }
}

const SCHOOL_ROLES: string[] = [ROLES.SCHOOL_ADMIN, ROLES.TEACHER, ROLES.STUDENT];

export function memberSchools(user: AuthUser | null): AuthUser['schools'] {
  if (!user || !SCHOOL_ROLES.includes(user.role)) return [];
  return user.schools.filter((s) => s.role === user.role);
}

function pickSchool(user: AuthUser | null, preferred: string | null): string | null {
  const mine = memberSchools(user);
  if (preferred && mine.some((s) => s.schoolId === preferred)) return preferred;
  return mine[0]?.schoolId ?? null;
}

export function AuthProvider({ children, client = defaultApi }: { children: ReactNode; client?: ApiClient }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (client.tokens.getAccess() || client.tokens.getRefresh() ? 'loading' : 'anonymous'));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeSchoolId, setActive] = useState<string | null>(null);

  const applyUser = useCallback(
    (u: AuthUser | null) => {
      setUser(u);
      const school = pickSchool(u, readSchool());
      setActive(school);
      client.setSchoolId(school);
      setStatus(u ? 'authenticated' : 'anonymous');
    },
    [client],
  );

  const clearSession = useCallback(() => {
    client.tokens.clear();
    client.setSchoolId(null);
    qc.clear();
    setUser(null);
    setActive(null);
    setStatus('anonymous');
  }, [client, qc]);

  useEffect(() => client.onSessionExpired(clearSession), [client, clearSession]);

  useEffect(() => {
    if (status !== 'loading') return;
    let cancelled = false;
    client
      .get<AuthUser>('/auth/me')
      .then((u) => !cancelled && applyUser(u))
      .catch(() => !cancelled && clearSession());
    return () => {
      cancelled = true;
    };
    // run once on boot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await client.request<LoginResponse>('POST', '/auth/login', { body: { email, password, client: 'web' }, anonymous: true });
      client.tokens.set(res);
      qc.clear();
      applyUser(res.user);
      return res.user;
    },
    [client, qc, applyUser],
  );

  const studentLogin = useCallback(
    async (schoolCode: string, studentCode: string, pin: string) => {
      const res = await client.request<LoginResponse>('POST', '/auth/student-login', { body: { schoolCode, studentCode, pin }, anonymous: true });
      client.tokens.set(res);
      qc.clear();
      applyUser(res.user);
      return res.user;
    },
    [client, qc, applyUser],
  );

  const logout = useCallback(async () => {
    const refreshToken = client.tokens.getRefresh();
    if (refreshToken) {
      try {
        await client.request('POST', '/auth/logout', { body: { refreshToken }, anonymous: true });
      } catch {
        /* best effort — tokens are cleared locally either way */
      }
    }
    clearSession();
  }, [client, clearSession]);

  const setActiveSchoolId = useCallback(
    (id: string) => {
      setActive(id);
      client.setSchoolId(id);
      try {
        localStorage.setItem(SCHOOL_KEY, id);
      } catch {
        /* ignore */
      }
      qc.clear();
    },
    [client, qc],
  );

  const refreshUser = useCallback(async () => {
    applyUser(await client.get<AuthUser>('/auth/me'));
  }, [client, applyUser]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      activeSchoolId,
      adminSchools: memberSchools(user),
      login,
      studentLogin,
      logout,
      setActiveSchoolId,
      refreshUser,
    }),
    [status, user, activeSchoolId, login, studentLogin, logout, setActiveSchoolId, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Test helper / escape hatch: provide a fixed auth state. */
export const AuthContextProvider = AuthContext.Provider;

/** The School Admin's active school id (throws in render if missing; guards prevent that). */
export function useSchoolId(): string {
  const { activeSchoolId } = useAuth();
  if (!activeSchoolId) throw new Error('No active school');
  return activeSchoolId;
}
