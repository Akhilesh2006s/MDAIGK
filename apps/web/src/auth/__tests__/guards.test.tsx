import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { ROLES, type AuthUser } from '@mango/shared';
import { HomeRedirect, RequireRole, homePathFor } from '../guards';
import { renderWithState } from '../../test/utils';

const superAdmin: AuthUser = { id: '1', name: 'Owner', role: ROLES.SUPER_ADMIN, status: 'active', schools: [] };
const schoolAdmin: AuthUser = {
  id: '2',
  name: 'Green Admin',
  role: ROLES.SCHOOL_ADMIN,
  status: 'active',
  schools: [{ schoolId: 's1', schoolName: 'Green Valley', schoolCode: 'GVS001', role: ROLES.SCHOOL_ADMIN }],
};

const teacher: AuthUser = {
  id: '3',
  name: 'Priya',
  role: ROLES.TEACHER,
  status: 'active',
  schools: [{ schoolId: 's1', schoolName: 'Green Valley', schoolCode: 'GVS001', role: ROLES.TEACHER }],
};
const student: AuthUser = {
  id: '4',
  name: 'Myra',
  role: ROLES.STUDENT,
  status: 'active',
  schools: [{ schoolId: 's1', schoolName: 'Green Valley', schoolCode: 'GVS001', role: ROLES.STUDENT }],
};

const routes = (
  <Routes>
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/login" element={<p>Login page</p>} />
    <Route path="/unsupported" element={<p>Unsupported role</p>} />
    <Route
      path="/super"
      element={
        <RequireRole roles={[ROLES.SUPER_ADMIN]}>
          <p>Super area</p>
        </RequireRole>
      }
    />
    <Route
      path="/school"
      element={
        <RequireRole roles={[ROLES.SCHOOL_ADMIN]}>
          <p>School area</p>
        </RequireRole>
      }
    />
    <Route
      path="/teacher"
      element={
        <RequireRole roles={[ROLES.TEACHER]}>
          <p>Teacher area</p>
        </RequireRole>
      }
    />
    <Route
      path="/student"
      element={
        <RequireRole roles={[ROLES.STUDENT]}>
          <p>Student area</p>
        </RequireRole>
      }
    />
  </Routes>
);

describe('route guards', () => {
  it('sends anonymous users to login', () => {
    renderWithState(routes, { status: 'anonymous' }, '/super');
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('shows a loading state while the session is being checked', () => {
    renderWithState(routes, { status: 'loading' }, '/super');
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
  });

  it('lets a Super Admin into the super area', () => {
    renderWithState(routes, { status: 'authenticated', user: superAdmin }, '/super');
    expect(screen.getByText('Super area')).toBeInTheDocument();
  });

  it('redirects a School Admin away from Super Admin routes to their own dashboard', () => {
    renderWithState(routes, { status: 'authenticated', user: schoolAdmin, activeSchoolId: 's1' }, '/super');
    expect(screen.getByText('School area')).toBeInTheDocument();
  });

  it('redirects a Super Admin away from School Admin routes', () => {
    renderWithState(routes, { status: 'authenticated', user: superAdmin }, '/school');
    expect(screen.getByText('Super area')).toBeInTheDocument();
  });

  it('shows the unsupported page for an unknown role', () => {
    renderWithState(routes, { status: 'authenticated', user: { ...superAdmin, role: 'PARENT' as AuthUser['role'] } }, '/super');
    expect(screen.getByText('Unsupported role')).toBeInTheDocument();
  });

  it('homePathFor maps every role to its portal', () => {
    expect(homePathFor(ROLES.SUPER_ADMIN)).toBe('/super');
    expect(homePathFor(ROLES.SCHOOL_ADMIN)).toBe('/school');
    expect(homePathFor(ROLES.TEACHER)).toBe('/teacher');
    expect(homePathFor(ROLES.STUDENT)).toBe('/student');
    expect(homePathFor('PARENT')).toBeNull();
  });

  it('routes a teacher home to the teacher portal', () => {
    renderWithState(routes, { status: 'authenticated', user: teacher, activeSchoolId: 's1' }, '/');
    expect(screen.getByText('Teacher area')).toBeInTheDocument();
  });

  it('redirects a teacher away from School Admin routes', () => {
    renderWithState(routes, { status: 'authenticated', user: teacher, activeSchoolId: 's1' }, '/school');
    expect(screen.getByText('Teacher area')).toBeInTheDocument();
  });

  it('blocks a teacher without an active school', () => {
    renderWithState(routes, { status: 'authenticated', user: { ...teacher, schools: [] }, activeSchoolId: null }, '/teacher');
    expect(screen.getByText('Unsupported role')).toBeInTheDocument();
  });

  it('routes a student home to the student portal', () => {
    renderWithState(routes, { status: 'authenticated', user: student, activeSchoolId: 's1' }, '/');
    expect(screen.getByText('Student area')).toBeInTheDocument();
  });

  it('redirects a student away from teacher routes', () => {
    renderWithState(routes, { status: 'authenticated', user: student, activeSchoolId: 's1' }, '/teacher');
    expect(screen.getByText('Student area')).toBeInTheDocument();
  });

  it('blocks a School Admin without an active school', () => {
    renderWithState(routes, { status: 'authenticated', user: { ...schoolAdmin, schools: [] }, activeSchoolId: null }, '/school');
    expect(screen.getByText('Unsupported role')).toBeInTheDocument();
  });

  it('home redirects by role', () => {
    renderWithState(routes, { status: 'authenticated', user: schoolAdmin, activeSchoolId: 's1' }, '/');
    expect(screen.getByText('School area')).toBeInTheDocument();
  });
});
