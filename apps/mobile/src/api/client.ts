import { ERROR_CODES, SCHOOL_HEADER, type AuthUser, type LoginResponse } from '@mango/shared';

/** Client-side error codes in addition to the API's ERROR_CODES. */
export const CLIENT_ERRORS = { NETWORK_ERROR: 'NETWORK_ERROR', SESSION_EXPIRED: 'SESSION_EXPIRED', BAD_RESPONSE: 'BAD_RESPONSE' } as const;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.code === CLIENT_ERRORS.NETWORK_ERROR;
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** Persistence for the session (expo-secure-store in the app, in-memory in tests). */
export interface TokenStorage {
  load(): Promise<Tokens | null>;
  save(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  storage: TokenStorage;
  fetchImpl?: typeof fetch;
  /** Called when refresh fails and the session must end. */
  onSessionExpired?: () => void;
  /** Called after a successful refresh with the user returned by the API. */
  onUserRefreshed?: (user: AuthUser) => void;
  timeoutMs?: number;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Send the bearer token (default true). */
  auth?: boolean;
  /** Internal: whether a TOKEN_EXPIRED response may trigger a refresh + retry. */
  retryOnExpired?: boolean;
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export class ApiClient {
  private tokens: Tokens | null = null;
  private schoolId: string | null = null;
  private refreshInFlight: Promise<boolean> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ApiClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  get baseUrl() {
    return this.opts.baseUrl;
  }

  async restore(): Promise<Tokens | null> {
    this.tokens = await this.opts.storage.load();
    return this.tokens;
  }

  async setTokens(tokens: Tokens | null) {
    this.tokens = tokens;
    if (tokens) await this.opts.storage.save(tokens);
    else await this.opts.storage.clear();
  }

  hasSession() {
    return Boolean(this.tokens);
  }

  getRefreshToken() {
    return this.tokens?.refreshToken ?? null;
  }

  setSchoolId(id: string | null) {
    this.schoolId = id;
  }

  getSchoolId() {
    return this.schoolId;
  }

  /** Headers for out-of-band requests such as file downloads. */
  authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.tokens) h.Authorization = `Bearer ${this.tokens.accessToken}`;
    if (this.schoolId) h[SCHOOL_HEADER] = this.schoolId;
    return h;
  }

  get<T>(path: string, query?: Query) {
    return this.request<T>('GET', path, { query });
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, { body: body ?? {} });
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, { body: body ?? {} });
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const { body, query, auth = true, retryOnExpired = true } = options;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) Object.assign(headers, this.authHeaders());

    let res: Response;
    try {
      res = await this.withTimeout(
        this.fetchImpl(`${this.opts.baseUrl}${path}${buildQuery(query)}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        }),
      );
    } catch {
      throw new ApiError(0, CLIENT_ERRORS.NETWORK_ERROR, 'Can’t reach Mango Dude right now. Check your internet connection and try again.');
    }

    if (res.status === 204) return undefined as T;
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      const err = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
      const code = err?.code ?? (res.status >= 500 ? ERROR_CODES.INTERNAL_ERROR : CLIENT_ERRORS.BAD_RESPONSE);
      if (res.status === 401 && code === ERROR_CODES.TOKEN_EXPIRED && auth && retryOnExpired && this.tokens) {
        const ok = await this.refresh();
        if (ok) return this.request<T>(method, path, { ...options, retryOnExpired: false });
        throw new ApiError(401, CLIENT_ERRORS.SESSION_EXPIRED, 'Your session has ended. Please sign in again.');
      }
      if (res.status === 401 && auth && this.tokens && code !== ERROR_CODES.INVALID_CREDENTIALS) {
        // Invalid/revoked access token that cannot be refreshed: end the session.
        await this.endSession();
      }
      throw new ApiError(res.status, code, err?.message ?? `Request failed (${res.status})`, err?.details);
    }
    return payload as T;
  }

  /**
   * Refresh the access token once. Concurrent callers share a single in-flight
   * request because the API rotates refresh tokens (reuse revokes the family).
   */
  refresh(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    const current = this.tokens;
    if (!current) return false;
    try {
      const res = await this.withTimeout(
        this.fetchImpl(`${this.opts.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        }),
      );
      if (!res.ok) {
        await this.endSession();
        return false;
      }
      const data = (await res.json()) as LoginResponse;
      await this.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      if (data.user) this.opts.onUserRefreshed?.(data.user);
      return true;
    } catch {
      // Network failure: keep the session so the user can retry when back online.
      throw new ApiError(0, CLIENT_ERRORS.NETWORK_ERROR, 'Can’t reach Mango Dude right now. Check your internet connection and try again.');
    }
  }

  private async endSession() {
    if (!this.tokens) return;
    await this.setTokens(null);
    this.opts.onSessionExpired?.();
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    const ms = this.opts.timeoutMs ?? 20000;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
