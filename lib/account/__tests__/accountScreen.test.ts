import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAccountScreenModel,
  isProPlanState,
  sanitizeDisplayValue,
} from "@/lib/account/accountScreenModel";
import { getUserDisplayName, getUserInitials } from "@/lib/account/formatUser";
import { formatTimezoneLabel } from "@/lib/account/preferences";
import { resolveSubscriptionView, shouldShowFullPaywall } from "@/lib/account/subscriptionView";
import {
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredAuthToken,
  getStoredAuthToken,
  setStoredAuthToken,
} from "@/lib/auth/authStorage";
import type { AuthUser } from "@/lib/auth/types";

const secureStore = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStore.delete(key);
  }),
}));

const freeUser: AuthUser = {
  id: 1,
  email: "free@example.com",
  emailVerified: true,
};

const proUser: AuthUser = {
  id: 2,
  email: "pro@example.com",
  fullName: "Ignacio Rabanal",
  emailVerified: true,
};

describe("account screen model", () => {
  beforeEach(() => {
    secureStore.clear();
  });

  it("1. usuario free muestra upgrade y paywall", () => {
    const model = buildAccountScreenModel({
      user: freeUser,
      access: { allowed: false },
      saasDisabled: false,
      isAuthenticated: true,
    });

    expect(model.subscription.planState).toBe("access_restricted");
    expect(model.showPaywallEntry).toBe(true);
    expect(model.showFullPaywallOnUpgrade).toBe(true);
    expect(isProPlanState(model.subscription.planState)).toBe(false);
  });

  it("2. usuario pro activo no muestra paywall principal", () => {
    const model = buildAccountScreenModel({
      user: proUser,
      access: { allowed: true },
      saasDisabled: false,
      isAuthenticated: true,
    });

    expect(model.subscription.planState).toBe("pro_active");
    expect(model.subscription.showUpgradeCta).toBe(false);
    expect(model.subscription.showManageCta).toBe(true);
    expect(model.showFullPaywallOnUpgrade).toBe(false);
    expect(shouldShowFullPaywall(model.subscription.planState)).toBe(false);
  });

  it("3. usuario vencido puede reactivar", () => {
    const subscription = resolveSubscriptionView({
      user: proUser,
      access: {
        allowed: false,
        status: "expired",
        expiresAt: "2026-01-15T00:00:00.000Z",
      },
      saasDisabled: false,
      isAuthenticated: true,
    });

    expect(subscription.planState).toBe("expired");
    expect(subscription.statusLabel).toBe("Vencido");
    expect(subscription.showReactivateCta).toBe(true);
    expect(subscription.accessUntilLabel).toBeTruthy();
  });

  it("4. nombre y email se derivan correctamente", () => {
    expect(getUserDisplayName(proUser)).toBe("Ignacio Rabanal");
    expect(getUserInitials(proUser)).toBe("IR");
    expect(getUserDisplayName({ id: 3, email: "farm850@gmail.com" })).toBe("farm850");
  });

  it("5. plan badge refleja estado pro activo", () => {
    const subscription = resolveSubscriptionView({
      user: proUser,
      access: { allowed: true },
      saasDisabled: false,
      isAuthenticated: true,
    });

    expect(subscription.planLabel).toBe("GoodTrading Pro");
    expect(subscription.statusLabel).toBe("Activo");
    expect(subscription.statusTone).toBe("success");
  });

  it("6. pro no debe abrir paywall completo", () => {
    const model = buildAccountScreenModel({
      user: proUser,
      access: { allowed: true },
      saasDisabled: false,
      isAuthenticated: true,
    });
    expect(model.showFullPaywallOnUpgrade).toBe(false);
  });

  it("7. free puede abrir paywall", () => {
    const model = buildAccountScreenModel({
      user: freeUser,
      access: { allowed: false },
      saasDisabled: false,
      isAuthenticated: true,
    });
    expect(model.showPaywallEntry).toBe(true);
    expect(model.showFullPaywallOnUpgrade).toBe(true);
  });

  it("8. logout limpia token almacenado", async () => {
    await setStoredAuthToken("session-token");
    expect(secureStore.get(AUTH_TOKEN_STORAGE_KEY)).toBe("session-token");
    await clearStoredAuthToken();
    expect(await getStoredAuthToken()).toBeNull();
  });

  it("9. loading state no autenticado", () => {
    const subscription = resolveSubscriptionView({
      user: null,
      access: null,
      saasDisabled: false,
      isAuthenticated: false,
    });
    expect(subscription.statusLabel).toBe("No autenticado");
    expect(subscription.showUpgradeCta).toBe(false);
  });

  it("10. error/offline mantiene helper de acceso restringido", () => {
    const subscription = resolveSubscriptionView({
      user: freeUser,
      access: { allowed: false },
      saasDisabled: false,
      isAuthenticated: true,
    });
    expect(subscription.helperText).toContain("no tiene acceso");
  });

  it("11. campos faltantes no muestran null", () => {
    expect(sanitizeDisplayValue(null)).toBeNull();
    expect(sanitizeDisplayValue(undefined)).toBeNull();
    expect(sanitizeDisplayValue("null")).toBeNull();
    expect(sanitizeDisplayValue("  trader@example.com ")).toBe("trader@example.com");
  });

  it("12. zona horaria se muestra con offset", () => {
    const label = formatTimezoneLabel("America/Argentina/Buenos_Aires");
    expect(label).toContain("America/Argentina/Buenos_Aires");
    expect(label).toMatch(/^UTC[+-]/);
  });

  it("13. información sensible no aparece en logs de helpers", () => {
    const spy = vi.spyOn(console, "log");
    getUserDisplayName(proUser);
    resolveSubscriptionView({
      user: proUser,
      access: { allowed: true },
      saasDisabled: false,
      isAuthenticated: true,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
