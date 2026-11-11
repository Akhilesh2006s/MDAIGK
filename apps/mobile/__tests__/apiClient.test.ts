import { ApiClient, ApiError, buildQuery, type TokenStorage, type Tokens } from '../src/api/client';

function memoryStorage(initial: Tokens | null): TokenStorage & { value: Tokens | null } {
  const s = {
    value: initial,
    load: async () => s.value,
    save: async (t: Tokens) => {
      s.value = t;
    },
    clear: async () => {
      s.value = null;
    },
  };
  return s;
}

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const expired = () => json(401, { error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } });

describe('ApiClient', () => {
  test('buildQuery skips empty values', () => {
    expect(buildQuery({ a: 1, b: undefined, c: '', d: 'x y' })).toBe('?a=1&d=x%20y');
    expect(buildQuery({})).toBe('');
  });

  test('attaches bearer + school header', async () => {
    const fetchImpl = jest.fn(async () => json(200, { ok: true }));
    const client = new ApiClient({ baseUrl: 'http://api', storage: memoryStorage({ accessToken: 'A', refreshToken: 'R'.repeat(30) }), fetchImpl });
    await client.restore();
    client.setSchoolId('school1');
    await client.get('/x', { q: 'a' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/x?q=a');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer A');
    expect((init.headers as Record<string, string>)['x-school-id']).toBe('school1');
  });

  test('refreshes once on TOKEN_EXPIRED and retries with the new token; concurrent requests share one refresh', async () => {
    const storage = memoryStorage({ accessToken: 'old', refreshToken: 'r'.repeat(40) });
    let refreshCalls = 0;
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 5));
        return json(200, { accessToken: 'new', refreshToken: 'n'.repeat(40), expiresIn: 900, user: { id: 'u' } });
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new' ? json(200, { url }) : expired();
    });
    const onUserRefreshed = jest.fn();
    const client = new ApiClient({ baseUrl: 'http://api', storage, fetchImpl: fetchImpl as unknown as typeof fetch, onUserRefreshed });
    await client.restore();
    const [a, b] = await Promise.all([client.get<{ url: string }>('/a'), client.get<{ url: string }>('/b')]);
    expect(a.url).toBe('http://api/a');
    expect(b.url).toBe('http://api/b');
    expect(refreshCalls).toBe(1);
    expect(storage.value).toEqual({ accessToken: 'new', refreshToken: 'n'.repeat(40) });
    expect(onUserRefreshed).toHaveBeenCalledWith({ id: 'u' });
  });

  test('ends the session when refresh fails', async () => {
    const storage = memoryStorage({ accessToken: 'old', refreshToken: 'r'.repeat(40) });
    const fetchImpl = jest.fn(async (url: string) =>
      url.endsWith('/auth/refresh') ? json(401, { error: { code: 'UNAUTHENTICATED', message: 'reuse' } }) : expired(),
    );
    const onSessionExpired = jest.fn();
    const client = new ApiClient({ baseUrl: 'http://api', storage, fetchImpl: fetchImpl as unknown as typeof fetch, onSessionExpired });
    await client.restore();
    await expect(client.get('/a')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(storage.value).toBeNull();
    expect(client.hasSession()).toBe(false);
  });

  test('does not loop: a second TOKEN_EXPIRED after refresh is surfaced', async () => {
    const storage = memoryStorage({ accessToken: 'old', refreshToken: 'r'.repeat(40) });
    let refreshCalls = 0;
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        return json(200, { accessToken: 'new', refreshToken: 'n'.repeat(40), expiresIn: 900 });
      }
      return expired();
    });
    const client = new ApiClient({ baseUrl: 'http://api', storage, fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.restore();
    await expect(client.get('/a')).rejects.toBeInstanceOf(ApiError);
    expect(refreshCalls).toBe(1);
  });

  test('maps API errors and network failures', async () => {
    const client = new ApiClient({
      baseUrl: 'http://api',
      storage: memoryStorage(null),
      fetchImpl: (async () => json(429, { error: { code: 'DAILY_LIMIT_REACHED', message: 'Limit', details: { resetsAt: 'x' } } })) as unknown as typeof fetch,
    });
    await expect(client.post('/games/1/attempts')).rejects.toMatchObject({ status: 429, code: 'DAILY_LIMIT_REACHED', details: { resetsAt: 'x' } });

    const offline = new ApiClient({
      baseUrl: 'http://api',
      storage: memoryStorage(null),
      fetchImpl: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });
    await expect(offline.get('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});
