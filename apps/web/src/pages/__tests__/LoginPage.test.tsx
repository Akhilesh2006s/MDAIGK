import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { LoginPage, validateLogin, validateStudentLogin } from '../LoginPage';
import { jsonResponse, memoryStorage, renderWithAuth } from '../../test/utils';

function setup(fetchImpl: typeof fetch) {
  const storage = memoryStorage();
  const utils = renderWithAuth(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/super" element={<p>Super home</p>} />
      <Route path="/school" element={<p>School home</p>} />
      <Route path="/teacher" element={<p>Teacher home</p>} />
      <Route path="/student" element={<p>Student home</p>} />
    </Routes>,
    { fetchImpl, route: '/login', storage },
  );
  return { ...utils, storage };
}

describe('LoginPage', () => {
  it('validates required fields and email format before calling the API', async () => {
    const fetchImpl = vi.fn();
    setup(fetchImpl as unknown as typeof fetch);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Email/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('signs a teacher in on the web and routes them to the teacher portal', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        accessToken: 'acc',
        refreshToken: 'ref',
        expiresIn: 900,
        user: { id: 't1', name: 'Priya', role: 'TEACHER', status: 'active', schools: [{ schoolId: 's1', schoolName: 'GVS', schoolCode: 'GVS001', role: 'TEACHER' }] },
      }),
    );
    const { client } = setup(fetchImpl as unknown as typeof fetch);
    const user = userEvent.setup();
    expect(screen.queryByText(/mobile app/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Email/), 'priya@gvs.edu.in');
    await user.type(screen.getByLabelText(/Password/), 'Teacher@2026');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText('Teacher home')).toBeInTheDocument());
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/auth/login');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'priya@gvs.edu.in', password: 'Teacher@2026', client: 'web' });
    expect(client.getSchoolId()).toBe('s1');
  });

  it('shows the API message when an account is forbidden', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Web sign-in is disabled for this account' } }));
    setup(fetchImpl as unknown as typeof fetch);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Email/), 'x@y.co');
    await user.type(screen.getByLabelText(/Password/), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Web sign-in is disabled for this account');
  });

  describe('student sign-in', () => {
    it('switches to the student form and validates school code, student ID and PIN', async () => {
      const fetchImpl = vi.fn();
      setup(fetchImpl as unknown as typeof fetch);
      const user = userEvent.setup();
      await user.click(screen.getByRole('radio', { name: 'Student' }));
      expect(screen.getByRole('radio', { name: 'Student' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(screen.getByText('Enter your school code')).toBeInTheDocument();
      expect(screen.getByText('Enter your student ID')).toBeInTheDocument();
      expect(screen.getByText('Enter your PIN')).toBeInTheDocument();
      await user.type(screen.getByLabelText(/PIN/), '12');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(screen.getByText('Your PIN has at least 4 digits')).toBeInTheDocument();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('posts to /auth/student-login and routes the student to the student portal', async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, {
          accessToken: 'acc',
          refreshToken: 'ref',
          expiresIn: 900,
          user: { id: 'st1', name: 'Myra', role: 'STUDENT', status: 'active', schools: [{ schoolId: 's1', schoolName: 'GVS', schoolCode: 'GVS001', role: 'STUDENT' }] },
        }),
      );
      const { storage } = setup(fetchImpl as unknown as typeof fetch);
      const user = userEvent.setup();
      await user.click(screen.getByRole('radio', { name: 'Student' }));
      await user.type(screen.getByLabelText(/School code/), 'gvs001');
      await user.type(screen.getByLabelText(/Student ID/), 'gvs401a');
      await user.type(screen.getByLabelText(/PIN/), '1234');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => expect(screen.getByText('Student home')).toBeInTheDocument());
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain('/auth/student-login');
      expect(JSON.parse(String(init.body))).toEqual({ schoolCode: 'GVS001', studentCode: 'GVS401A', pin: '1234' });
      expect(new Headers(init.headers).get('Authorization')).toBeNull();
      expect(storage.access).toBe('acc');
    });

    it('shows the API message for a wrong PIN', async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid school code, student ID or PIN' } }));
      setup(fetchImpl as unknown as typeof fetch);
      const user = userEvent.setup();
      await user.click(screen.getByRole('radio', { name: 'Student' }));
      await user.type(screen.getByLabelText(/School code/), 'GVS001');
      await user.type(screen.getByLabelText(/Student ID/), 'GVS401A');
      await user.type(screen.getByLabelText(/PIN/), '9999');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByText('Invalid school code, student ID or PIN')).toBeInTheDocument();
    });
  });

  it('shows a friendly message for invalid credentials', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } }));
    setup(fetchImpl as unknown as typeof fetch);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Email/), 'admin@mangodude.in');
    await user.type(screen.getByLabelText(/Password/), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('stores tokens and routes a School Admin to the school dashboard', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        accessToken: 'acc',
        refreshToken: 'ref',
        expiresIn: 900,
        user: { id: 'u1', name: 'Green Admin', role: 'SCHOOL_ADMIN', status: 'active', schools: [{ schoolId: 's1', schoolName: 'GVS', schoolCode: 'GVS001', role: 'SCHOOL_ADMIN' }] },
      }),
    );
    const { storage, client } = setup(fetchImpl as unknown as typeof fetch);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Email/), 'admin@gvs.edu.in');
    await user.type(screen.getByLabelText(/Password/), 'SchoolAdmin@2026');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText('School home')).toBeInTheDocument());
    expect(storage.access).toBe('acc');
    expect(storage.refresh).toBe('ref');
    expect(client.getSchoolId()).toBe('s1');
  });

  it('validateLogin is pure', () => {
    expect(validateLogin('a@b.co', 'x')).toEqual({});
    expect(Object.keys(validateLogin('', ''))).toEqual(['email', 'password']);
    expect(validateStudentLogin('GVS001', 'GVS401A', '1234')).toEqual({});
    expect(Object.keys(validateStudentLogin('', '', ''))).toEqual(['schoolCode', 'studentCode', 'pin']);
  });
});
