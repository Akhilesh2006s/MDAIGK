import type { AuthUser } from '@mango/shared';
import { API_BASE_URL, API_PREFIX } from '../config';
import { secureTokenStorage } from '../auth/storage';
import { ApiClient } from './client';

type Listener = () => void;
const expiredListeners = new Set<Listener>();
const userListeners = new Set<(u: AuthUser) => void>();

/** Single app-wide API client. */
export const api = new ApiClient({
  baseUrl: `${API_BASE_URL}${API_PREFIX}`,
  storage: secureTokenStorage,
  onSessionExpired: () => expiredListeners.forEach((l) => l()),
  onUserRefreshed: (u) => userListeners.forEach((l) => l(u)),
});

export function onSessionExpired(l: Listener) {
  expiredListeners.add(l);
  return () => {
    expiredListeners.delete(l);
  };
}

export function onUserRefreshed(l: (u: AuthUser) => void) {
  userListeners.add(l);
  return () => {
    userListeners.delete(l);
  };
}
