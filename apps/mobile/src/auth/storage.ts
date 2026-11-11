import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '@mango/shared';
import type { TokenStorage, Tokens } from '../api/client';

const TOKENS_KEY = 'mango.tokens';
const USER_KEY = 'mango.user';
const SCHOOL_KEY = 'mango.schoolId';

async function getJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const secureTokenStorage: TokenStorage = {
  load: () => getJson<Tokens>(TOKENS_KEY),
  save: (t) => SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(t)),
  clear: () => SecureStore.deleteItemAsync(TOKENS_KEY),
};

export const sessionStore = {
  loadUser: () => getJson<AuthUser>(USER_KEY),
  saveUser: (u: AuthUser) => SecureStore.setItemAsync(USER_KEY, JSON.stringify(u)),
  loadSchoolId: async () => {
    try {
      return await SecureStore.getItemAsync(SCHOOL_KEY);
    } catch {
      return null;
    }
  },
  saveSchoolId: (id: string | null) => (id ? SecureStore.setItemAsync(SCHOOL_KEY, id) : SecureStore.deleteItemAsync(SCHOOL_KEY)),
  async clear() {
    await Promise.all([SecureStore.deleteItemAsync(USER_KEY), SecureStore.deleteItemAsync(SCHOOL_KEY)]);
  },
};
