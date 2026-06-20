import * as SecureStore from "expo-secure-store";

export const AUTH_TOKEN_STORAGE_KEY = "gt_terminal_auth_token";

export async function getStoredAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setStoredAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, token);
}

export async function clearStoredAuthToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Best-effort clear.
  }
}
