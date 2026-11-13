import * as SecureStore from 'expo-secure-store';
const KEY = 'session_token';
const REFRESH = 'session_refresh';
export const tokenStore = {
  save: (token: string) => SecureStore.setItemAsync(KEY, token),
  get: () => SecureStore.getItemAsync(KEY),
  saveRefresh: (token: string) => SecureStore.setItemAsync(REFRESH, token),
  getRefresh: () => SecureStore.getItemAsync(REFRESH),
  clear: async () => { await Promise.all([SecureStore.deleteItemAsync(KEY), SecureStore.deleteItemAsync(REFRESH)]); },
};
