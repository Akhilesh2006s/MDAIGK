import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ROLES, type AuthUser, type LoginResponse } from '@mango/shared';
import { api, onSessionExpired, onUserRefreshed } from '../api/instance';
import * as endpoints from '../api/endpoints';
import { sessionStore } from './storage';

export type AuthStatus = 'loading' | 'signedOut' | 'needsSchool' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  schoolId: string | null;
  /** Set when the session ended on its own (expired / revoked), shown on the login screen. */
  notice: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (resp: LoginResponse) => Promise<void>;
  selectSchool: (schoolId: string) => Promise<void>;
  /** Teachers with several schools can switch. */
  switchSchool: () => void;
  signOut: (notice?: string) => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
  isTeacher: boolean;
  isStudent: boolean;
  activeSchool: AuthUser['schools'][number] | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function pickSchool(user: AuthUser, preferred: string | null): string | null {
  if (preferred && user.schools.some((s) => s.schoolId === preferred)) return preferred;
  if (user.schools.length === 1) return user.schools[0].schoolId;
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, schoolId: null, notice: null });

  const finish = useCallback(async (user: AuthUser, preferredSchool: string | null) => {
    const schoolId = pickSchool(user, preferredSchool);
    api.setSchoolId(schoolId);
    await sessionStore.saveUser(user);
    await sessionStore.saveSchoolId(schoolId);
    setState({ status: schoolId ? 'signedIn' : 'needsSchool', user, schoolId, notice: null });
  }, []);

  // Restore a saved session on launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tokens, user, schoolId] = await Promise.all([api.restore(), sessionStore.loadUser(), sessionStore.loadSchoolId()]);
      if (cancelled) return;
      if (tokens && user) {
        await finish(user, schoolId);
      } else {
        await api.setTokens(null);
        setState({ status: 'signedOut', user: null, schoolId: null, notice: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [finish]);

  // Session ended by the API (refresh failed / token revoked).
  useEffect(
    () =>
      onSessionExpired(() => {
        api.setSchoolId(null);
        void sessionStore.clear();
        setState({ status: 'signedOut', user: null, schoolId: null, notice: 'Your session has ended. Please sign in again.' });
      }),
    [],
  );

  useEffect(
    () =>
      onUserRefreshed((u) => {
        void sessionStore.saveUser(u);
        setState((s) => (s.user ? { ...s, user: u } : s));
      }),
    [],
  );

  const signIn = useCallback(
    async (resp: LoginResponse) => {
      await api.setTokens({ accessToken: resp.accessToken, refreshToken: resp.refreshToken });
      const preferred = await sessionStore.loadSchoolId();
      await finish(resp.user, resp.user.schools.length > 1 ? null : preferred);
    },
    [finish],
  );

  const selectSchool = useCallback(async (schoolId: string) => {
    api.setSchoolId(schoolId);
    await sessionStore.saveSchoolId(schoolId);
    setState((s) => ({ ...s, schoolId, status: 'signedIn' }));
  }, []);

  const switchSchool = useCallback(() => {
    setState((s) => ({ ...s, status: 'needsSchool' }));
  }, []);

  const signOut = useCallback(async (notice?: string) => {
    const refreshToken = api.getRefreshToken();
    if (refreshToken) {
      try {
        await endpoints.logout(refreshToken);
      } catch {
        // offline or already revoked: the local session is cleared regardless
      }
    }
    await api.setTokens(null);
    api.setSchoolId(null);
    await sessionStore.clear();
    setState({ status: 'signedOut', user: null, schoolId: null, notice: notice ?? null });
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setState((s) => {
      if (!s.user) return s;
      const user = { ...s.user, ...patch };
      void sessionStore.saveUser(user);
      return { ...s, user };
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn,
      selectSchool,
      switchSchool,
      signOut,
      updateUser,
      isTeacher: state.user?.role === ROLES.TEACHER,
      isStudent: state.user?.role === ROLES.STUDENT,
      activeSchool: state.user?.schools.find((s) => s.schoolId === state.schoolId) ?? null,
    }),
    [state, signIn, selectSchool, switchSchool, signOut, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
