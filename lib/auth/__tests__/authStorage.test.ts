import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const webStore = new Map<string, string>();

const platformState = { OS: "ios" as string };

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return platformState.OS;
    },
  },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

import {
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredAuthToken,
  getStoredAuthToken,
  setStoredAuthToken,
} from "@/lib/auth/authStorage";

describe("authStorage", () => {
  beforeEach(() => {
    store.clear();
    webStore.clear();
    platformState.OS = "ios";
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => webStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        webStore.set(key, value);
      },
      removeItem: (key: string) => {
        webStore.delete(key);
      },
    });
  });

  it("stores token in SecureStore on native", async () => {
    platformState.OS = "ios";
    await setStoredAuthToken("jwt-1");
    expect(await getStoredAuthToken()).toBe("jwt-1");
    expect(store.get(AUTH_TOKEN_STORAGE_KEY)).toBe("jwt-1");
    expect(webStore.has(AUTH_TOKEN_STORAGE_KEY)).toBe(false);
  });

  it("stores token in localStorage on web", async () => {
    platformState.OS = "web";
    await setStoredAuthToken("jwt-web");
    expect(await getStoredAuthToken()).toBe("jwt-web");
    expect(webStore.get(AUTH_TOKEN_STORAGE_KEY)).toBe("jwt-web");
    expect(store.has(AUTH_TOKEN_STORAGE_KEY)).toBe(false);
  });

  it("logout clears token on native", async () => {
    platformState.OS = "android";
    await setStoredAuthToken("jwt-1");
    await clearStoredAuthToken();
    expect(await getStoredAuthToken()).toBeNull();
    expect(store.has(AUTH_TOKEN_STORAGE_KEY)).toBe(false);
  });

  it("logout clears token on web", async () => {
    platformState.OS = "web";
    await setStoredAuthToken("jwt-web");
    await clearStoredAuthToken();
    expect(await getStoredAuthToken()).toBeNull();
    expect(webStore.has(AUTH_TOKEN_STORAGE_KEY)).toBe(false);
  });
});
