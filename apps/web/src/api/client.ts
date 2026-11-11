import { ERROR_CODES, SCHOOL_HEADER, type LoginResponse } from '@mango/shared';

/** Error thrown for any non-2xx API response (or network failure). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level messages from a zod VALIDATION_ERROR response, keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as Array<{ path?: string; message?: string }>) {
        if (d?.path && d.message && !out[d.path]) out[d.path] = d.message;
      }
    }
    return out;
  }
}

export interface TokenStorage {
  getAccess(): string | null;
  getRefresh(): string | null;
  set(tokens: { accessToken: string; refreshToken: string }): void;
  clear(): void;
}

const ACCESS_KEY = 'mango.accessToken';
const REFRESH_KEY = 'mango.refreshToken';

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const localTokenStorage: TokenStorage = {
  getAccess: () => safeStorage()?.getItem(ACCESS_KEY) ?? null,
  getRefresh: () => safeStorage()?.getItem(REFRESH_KEY) ?? null,
  set: ({ accessToken, refreshToken }) => {
    safeStorage()?.setItem(ACCESS_KEY, accessToken);
    safeStorage()?.setItem(REFRESH_KEY, refreshToken);
  },
  clear: () => {
    safeStorage()?.removeItem(ACCESS_KEY);
    safeStorage()?.removeItem(REFRESH_KEY);
  },
};

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Skip auth header + refresh logic (login, refresh, logout). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export interface ApiClientConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  storage?: TokenStorage;
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function toApiError(res: Response): Promise<ApiError> {
  let code: string = res.status === 401 ? ERROR_CODES.UNAUTHENTICATED : ERROR_CODES.INTERNAL_ERROR;
  let message = res.statusText || `Request failed (${res.status})`;
  let details: unknown;
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    if (data?.error) {
      code = data.error.code ?? code;
      message = data.error.message ?? message;
      details = data.error.details;
    }
  } catch {
    /* non-JSON body */
  }
  return new ApiError(res.status, code, message, details);
}

/**
 * Fetch wrapper: JSON in/out, bearer auth, `x-school-id`, and refresh-on-expiry.
 * When a request fails with 401 TOKEN_EXPIRED the client refreshes once (all
 * concurrent callers share one in-flight refresh), stores the rotated refresh
 * token, and retries. If the refresh fails, tokens are cleared and the
 * onSessionExpired listeners fire.
 */
export function createApiClient(config: ApiClientConfig = {}) {
  const baseUrl = config.baseUrl ?? '/api/v1';
  const doFetch: typeof fetch = config.fetchImpl ?? ((...args) => fetch(...args));
  const storage = config.storage ?? localTokenStorage;
  let schoolId: string | null = null;
  let refreshing: Promise<boolean> | null = null;
  const expiredListeners = new Set<() => void>();

  function headers(anonymous: boolean, hasBody: boolean): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (hasBody) h['Content-Type'] = 'application/json';
    if (!anonymous) {
      const t = storage.getAccess();
      if (t) h.Authorization = `Bearer ${t}`;
      if (schoolId) h[SCHOOL_HEADER] = schoolId;
    }
    return h;
  }

  function expireSession() {
    storage.clear();
    expiredListeners.forEach((l) => l());
  }

  function refresh(): Promise<boolean> {
    if (refreshing) return refreshing;
    const token = storage.getRefresh();
    if (!token) return Promise.resolve(false);
    refreshing = (async () => {
      try {
        const res = await doFetch(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken: token }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as LoginResponse;
        storage.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function send(method: string, path: string, opts: RequestOptions): Promise<Response> {
    const hasBody = opts.body !== undefined;
    try {
      return await doFetch(`${baseUrl}${path}${buildQuery(opts.query)}`, {
        method,
        headers: headers(Boolean(opts.anonymous), hasBody),
        body: hasBody ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
    }
  }

  /** Performs the request with one refresh+retry on TOKEN_EXPIRED; returns the raw Response when ok. */
  async function raw(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
    let res = await send(method, path, opts);
    if (res.status === 401 && !opts.anonymous) {
      const err = await toApiError(res.clone());
      if (err.code === ERROR_CODES.TOKEN_EXPIRED) {
        const ok = await refresh();
        if (!ok) {
          expireSession();
          throw new ApiError(401, ERROR_CODES.UNAUTHENTICATED, 'Your session has expired. Please sign in again.');
        }
        res = await send(method, path, opts);
      } else if (storage.getAccess()) {
        // invalid / revoked token or deactivated account
        expireSession();
      }
    }
    if (!res.ok) throw await toApiError(res);
    return res;
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await raw(method, path, opts);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    request,
    raw,
    refresh,
    get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
    /** Download a file (e.g. CSV export) with the auth header and save it via an object URL. */
    async download(path: string, query: Query | undefined, fallbackName: string) {
      const res = await raw('GET', path, { query });
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return name;
    },
    tokens: storage,
    setSchoolId(id: string | null) {
      schoolId = id;
    },
    getSchoolId: () => schoolId,
    onSessionExpired(listener: () => void) {
      expiredListeners.add(listener);
      return () => {
        expiredListeners.delete(listener);
      };
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient();

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
