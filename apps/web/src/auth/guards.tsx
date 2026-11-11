import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ROLES, type Role } from '@mango/shared';
import { useAuth } from './AuthContext';
import { Loading } from '../components/Feedback';

export function homePathFor(role: Role | string | undefined): string | null {
  if (role === ROLES.SUPER_ADMIN) return '/super';
  if (role === ROLES.SCHOOL_ADMIN) return '/school';
  if (role === ROLES.TEACHER) return '/teacher';
  if (role === ROLES.STUDENT) return '/student';
  return null;
}

/** Requires a signed-in user whose role is in `roles`; otherwise redirects to their own home or login. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { status, user, activeSchoolId } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label="Checking your session…" fullPage />;
  if (status === 'anonymous' || !user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!roles.includes(user.role)) {
    const home = homePathFor(user.role);
    return <Navigate to={home ?? '/unsupported'} replace />;
  }
  if ((user.role === ROLES.SCHOOL_ADMIN || user.role === ROLES.TEACHER) && !activeSchoolId) return <Navigate to="/unsupported" replace />;
  return <>{children}</>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label="Checking your session…" fullPage />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** `/` → role home. */
export function HomeRedirect() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Loading label="Checking your session…" fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(user.role) ?? '/unsupported'} replace />;
}
