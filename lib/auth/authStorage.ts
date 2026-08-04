import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const AUTH_TOKEN_STORAGE_KEY = "gt_terminal_auth_token";

function isWebPlatform(): boolean {
  return Platform.OS === "web";
}

function readWebToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

function writeWebToken(token: string): void {
  if (typeof localStorage === "undefined") {
    throw new Error("localStorage is unavailable");
  }
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

function clearWebToken(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export async function getStoredAuthToken(): Promise<string | null> {
  try {
    if (isWebPlatform()) {
      return readWebToken();
    }
    return await SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setStoredAuthToken(token: string): Promise<void> {
  if (isWebPlatform()) {
    writeWebToken(token);
    return;
  }
  await SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, token);
}

export async function clearStoredAuthToken(): Promise<void> {
  try {
    if (isWebPlatform()) {
      clearWebToken();
      return;
    }
    await SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Best-effort clear.
  }
}
