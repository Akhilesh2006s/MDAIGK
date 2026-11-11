import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContextProvider, type AuthState } from '../../../auth/AuthContext';

const get = vi.fn();
vi.mock('../../../api/client', async (orig) => {
  const actual = await orig<typeof import('../../../api/client')>();
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a) } };
});

import ClassesPage from '../ClassesPage';
import ReportsPage from '../ReportsPage';

const SCHOOL = 'school1';
const auth: AuthState = {
  status: 'authenticated',
  user: { id: 'u1', name: 'Green Admin', role: 'SCHOOL_ADMIN', status: 'active', schools: [{ schoolId: SCHOOL, schoolName: 'Green Valley', schoolCode: 'GVS001', role: 'SCHOOL_ADMIN' }] },
  activeSchoolId: SCHOOL,
  adminSchools: [{ schoolId: SCHOOL, schoolName: 'Green Valley', schoolCode: 'GVS001', role: 'SCHOOL_ADMIN' }],
  login: vi.fn(),
  studentLogin: vi.fn(),
  logout: vi.fn(),
  setActiveSchoolId: vi.fn(),
  refreshUser: vi.fn(),
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthContextProvider value={auth}>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthContextProvider>
    </QueryClientProvider>,
  );
}

const access = Array.from({ length: 10 }, (_, i) => ({ levelNumber: i + 1, displayName: `Class ${i + 1}`, enabled: i < 5 }));

beforeEach(() => {
  get.mockReset();
});

describe('School Admin pages', () => {
  it('shows locked classes and an empty state for enabled classes without sections', async () => {
    get.mockImplementation((path: string) => {
      if (path.endsWith('/class-access')) return Promise.resolve(access);
      if (path.endsWith('/sections'))
        return Promise.resolve([
          { _id: 's1', levelNumber: 4, sectionName: 'A', academicYear: '2026-27', status: 'active', label: 'Class 4-A', locked: false, studentCount: 6, teachers: [] },
        ]);
      return Promise.reject(new Error('unexpected ' + path));
    });
    wrap(<ClassesPage />);
    expect(await screen.findByText('Class 4-A')).toBeInTheDocument();
    expect(screen.getAllByText('Locked — not in your plan')).toHaveLength(5);
    expect(screen.getAllByText('No sections yet')).toHaveLength(4);
    expect(screen.getByText(/5 of 10 class levels granted/)).toBeInTheDocument();
  });

  it('renders report rows with dashes for missing metrics and blocks an inverted date range', async () => {
    get.mockImplementation((path: string) => {
      if (path.includes('/reports/class'))
        return Promise.resolve({ type: 'class', period: { from: null, to: null }, rows: [{ class: 'Class 4-A', students: 6, averagePercent: null, sampleSize: 0 }] });
      if (path.endsWith('/class-access')) return Promise.resolve(access);
      return Promise.resolve([]);
    });
    wrap(<ReportsPage />);
    expect(await screen.findByText('Class 4-A')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), '2026-05-10');
    await user.type(screen.getByLabelText('To'), '2026-05-01');
    expect(await screen.findByText('Start date must be before end date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeDisabled();
  });
});
