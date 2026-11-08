import * as SecureStore from 'expo-secure-store';

const KEY = 'session_token';

export const tokenStore = {
  save: (token: string) => SecureStore.setItemAsync(KEY, token),
  get: () => SecureStore.getItemAsync(KEY),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
