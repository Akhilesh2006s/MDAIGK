import { describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery, createApiClient } from '../client';
import { jsonResponse, memoryStorage } from '../../test/utils';

const expired = () => jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } });

function authHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

describe('api client', () => {
  it('attaches bearer token and x-school-id, builds query strings', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const client = createApiClient({ fetchImpl, storage: memoryStorage({ access: 'A1', refresh: 'R1' }) });
    client.setSchoolId('school-1');
    await client.get('/schools/x/students', { q: 'ab', page: 2, empty: '', none: undefined });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/schools/x/students?q=ab&page=2');
    expect(authHeader(init)).toBe('Bearer A1');
    expect((init.headers as Record<string, string>)['x-school-id']).toBe('school-1');
  });

  it('refreshes once on TOKEN_EXPIRED, stores the rotated refresh token and retries', async () => {
    const storage = memoryStorage({ access: 'old', refresh: 'R1' });
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'R1' });
        return jsonResponse(200, { accessToken: 'new', refreshToken: 'R2', expiresIn: 900, user: {} });
      }
      return authHeader(init) === 'Bearer new' ? jsonResponse(200, { items: [1] }) : expired();
    });
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch, storage });
    await expect(client.get('/plans')).resolves.toEqual({ items: [1] });
    expect(storage.access).toBe('new');
    expect(storage.refresh).toBe('R2');
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('shares a single in-flight refresh between concurrent requests', async () => {
    const storage = memoryStorage({ access: 'old', refresh: 'R1' });
    let refreshCalls = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return jsonResponse(200, { accessToken: 'new', refreshToken: 'R2', expiresIn: 900, user: {} });
      }
      return authHeader(init) === 'Bearer new' ? jsonResponse(200, { url }) : expired();
    });
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch, storage });
    const results = await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    expect(results).toHaveLength(3);
    expect(refreshCalls).toBe(1);
  });

  it('logs out (clears tokens, notifies listeners) when the refresh fails', async () => {
    const storage = memoryStorage({ access: 'old', refresh: 'R1' });
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/auth/refresh') ? jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Refresh token reuse detected' } }) : expired(),
    );
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch, storage });
    const onExpired = vi.fn();
    client.onSessionExpired(onExpired);
    await expect(client.get('/plans')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(storage.access).toBeNull();
    expect(storage.refresh).toBeNull();
  });

  it('does not refresh for other errors and exposes code, message and field errors', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ path: 'name', message: 'Too short' }] } }),
    );
    const client = createApiClient({ fetchImpl, storage: memoryStorage({ access: 'A', refresh: 'R' }) });
    const err = await client.post('/plans', { name: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION_ERROR');
    expect((err as ApiError).fieldErrors).toEqual({ name: 'Too short' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps network failures to a friendly ApiError', async () => {
    const client = createApiClient({ fetchImpl: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))), storage: memoryStorage() });
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('buildQuery skips empty values', () => {
    expect(buildQuery({ a: 1, b: '', c: null, d: false })).toBe('?a=1&d=false');
    expect(buildQuery({})).toBe('');
  });
});
