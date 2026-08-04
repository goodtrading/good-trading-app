/**
 * End-to-end auth persistence contract for web vs native.
 * Validates login persist → hydrate → logout without touching network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeStore = new Map<string, string>();
const webStore = new Map<string, string>();
const platformState = { OS: "web" as string };

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return platformState.OS;
    },
  },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => {
    if (platformState.OS === "web") {
      throw new Error("SecureStore is not available on web");
    }
    return nativeStore.get(key) ?? null;
  }),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (platformState.OS === "web") {
      throw new Error("SecureStore is not available on web");
    }
    nativeStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    if (platformState.OS === "web") {
      throw new Error("SecureStore is not available on web");
    }
    nativeStore.delete(key);
  }),
}));

import {
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredAuthToken,
  getStoredAuthToken,
  setStoredAuthToken,
} from "@/lib/auth/authStorage";

describe("auth persistence web contract", () => {
  beforeEach(() => {
    nativeStore.clear();
    webStore.clear();
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

  it("web login persist + reload hydrate + logout", async () => {
    platformState.OS = "web";

    // Login persistence
    await setStoredAuthToken("jwt-session");
    expect(webStore.get(AUTH_TOKEN_STORAGE_KEY)).toBe("jwt-session");

    // Reload hydrate
    expect(await getStoredAuthToken()).toBe("jwt-session");

    // Logout
    await clearStoredAuthToken();
    expect(await getStoredAuthToken()).toBeNull();
    expect(webStore.has(AUTH_TOKEN_STORAGE_KEY)).toBe(false);
  });

  it("native still uses SecureStore and ignores localStorage", async () => {
    platformState.OS = "ios";
    await setStoredAuthToken("jwt-native");
    expect(nativeStore.get(AUTH_TOKEN_STORAGE_KEY)).toBe("jwt-native");
    expect(webStore.has(AUTH_TOKEN_STORAGE_KEY)).toBe(false);
    expect(await getStoredAuthToken()).toBe("jwt-native");
    await clearStoredAuthToken();
    expect(await getStoredAuthToken()).toBeNull();
  });

  it("legacy SecureStore-only path would break web login persist", async () => {
    platformState.OS = "web";
    // Prove the old failure mode: SecureStore throws on web
    const SecureStore = await import("expo-secure-store");
    await expect(SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, "x")).rejects.toThrow(
      /not available on web/i,
    );
    // Abstraction must still succeed
    await expect(setStoredAuthToken("x")).resolves.toBeUndefined();
  });
});
