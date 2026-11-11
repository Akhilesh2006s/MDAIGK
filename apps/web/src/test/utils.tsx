import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { createApiClient, type TokenStorage } from '../api/client';
import { AuthContextProvider, AuthProvider, type AuthState } from '../auth/AuthContext';
import { ToastProvider } from '../components/Toast';

export function memoryStorage(initial: { access?: string; refresh?: string } = {}): TokenStorage & { access: string | null; refresh: string | null } {
  const s = {
    access: initial.access ?? null,
    refresh: initial.refresh ?? null,
    getAccess: () => s.access,
    getRefresh: () => s.refresh,
    set: (t: { accessToken: string; refreshToken: string }) => {
      s.access = t.accessToken;
      s.refresh = t.refreshToken;
    },
    clear: () => {
      s.access = null;
      s.refresh = null;
    },
  };
  return s;
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/** Renders with real AuthProvider backed by a mocked fetch. */
export function renderWithAuth(ui: ReactElement, opts: { fetchImpl: typeof fetch; route?: string; storage?: TokenStorage }) {
  const client = createApiClient({ fetchImpl: opts.fetchImpl, storage: opts.storage ?? memoryStorage() });
  const qc = newQueryClient();
  return {
    client,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[opts.route ?? '/']}>
          <ToastProvider>
            <AuthProvider client={client}>{ui}</AuthProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

/** Renders with a fixed auth state (no network). */
export function renderWithState(ui: ReactNode, state: Partial<AuthState>, route = '/') {
  const value: AuthState = {
    status: 'anonymous',
    user: null,
    activeSchoolId: null,
    adminSchools: [],
    login: vi.fn(),
    studentLogin: vi.fn(),
    logout: vi.fn(async () => {}),
    setActiveSchoolId: vi.fn(),
    refreshUser: vi.fn(async () => {}),
    ...state,
  };
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <AuthContextProvider value={value}>{ui}</AuthContextProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
