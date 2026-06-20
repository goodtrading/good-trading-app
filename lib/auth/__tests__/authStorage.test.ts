import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredAuthToken,
  getStoredAuthToken,
  setStoredAuthToken,
} from "@/lib/auth/authStorage";

const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

describe("authStorage", () => {
  beforeEach(() => {
    store.clear();
  });

  it("4. token is stored in SecureStore", async () => {
    await setStoredAuthToken("jwt-1");
    expect(await getStoredAuthToken()).toBe("jwt-1");
    expect(store.get(AUTH_TOKEN_STORAGE_KEY)).toBe("jwt-1");
  });

  it("9. logout clears token", async () => {
    await setStoredAuthToken("jwt-1");
    await clearStoredAuthToken();
    expect(await getStoredAuthToken()).toBeNull();
  });
});
