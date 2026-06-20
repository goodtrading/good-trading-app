import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { setAuthTokenGetter } from "@/lib/api-client/custom-fetch";
import { configureMobileMarketStateV2Auth } from "@/src/api/mobileMarketStateV2";

import {
  AuthApiError,
  fetchAuthMe,
  loginWithCredentials,
  logoutRemote,
  mapAuthApiErrorToLoginResult,
} from "./authApi";
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from "./authStorage";
import type {
  AppAuthContextValue,
  AuthAccess,
  AuthSession,
  AuthStatus,
  AuthUser,
  LoginResult,
} from "./types";

const AuthContext = createContext<AppAuthContextValue | null>(null);

function wireTokenGetter(getter: () => Promise<string | null>): void {
  setAuthTokenGetter(getter);
  configureMobileMarketStateV2Auth(getter);
}

function clearTokenGetter(): void {
  setAuthTokenGetter(null);
  configureMobileMarketStateV2Auth(null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [access, setAccess] = useState<AuthAccess | null>(null);
  const [saasDisabled, setSaasDisabled] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  const hydratingRef = useRef(false);

  const applySession = useCallback((session: AuthSession | null) => {
    if (!session) {
      tokenRef.current = null;
      setUser(null);
      setAccess(null);
      setSaasDisabled(false);
      setStatus("unauthenticated");
      clearTokenGetter();
      return;
    }

    tokenRef.current = session.token;
    setUser(session.user);
    setAccess(session.access);
    setSaasDisabled(Boolean(session.saasDisabled));
    setStatus("authenticated");
    wireTokenGetter(async () => tokenRef.current);
  }, []);

  const getToken = useCallback(async () => tokenRef.current, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const token = tokenRef.current ?? (await getStoredAuthToken());
    if (!token) {
      applySession(null);
      await clearStoredAuthToken();
      return false;
    }

    try {
      const session = await fetchAuthMe(token);
      tokenRef.current = session.token;
      await setStoredAuthToken(session.token);
      setUser(session.user);
      setAccess(session.access);
      setSaasDisabled(Boolean(session.saasDisabled));
      setStatus("authenticated");
      wireTokenGetter(async () => tokenRef.current);
      setHydrationError(null);
      return true;
    } catch (error) {
      if (error instanceof AuthApiError && error.code === "UNAUTHORIZED") {
        await clearStoredAuthToken();
        applySession(null);
        return false;
      }
      return Boolean(tokenRef.current);
    }
  }, [applySession]);

  const hydrate = useCallback(async () => {
    if (hydratingRef.current) return;
    hydratingRef.current = true;
    setStatus("loading");
    setHydrationError(null);

    try {
      const stored = await getStoredAuthToken();
      if (!stored) {
        applySession(null);
        return;
      }

      tokenRef.current = stored;
      try {
        const session = await fetchAuthMe(stored);
        await setStoredAuthToken(session.token);
        applySession(session);
      } catch (error) {
        if (error instanceof AuthApiError && error.code === "UNAUTHORIZED") {
          await clearStoredAuthToken();
          applySession(null);
          return;
        }

        // Transient network/server error — keep token for retry.
        tokenRef.current = stored;
        wireTokenGetter(async () => tokenRef.current);
        setStatus("unauthenticated");
        setHydrationError(
          error instanceof Error ? error.message : "No se pudo validar la sesión",
        );
      }
    } finally {
      hydratingRef.current = false;
    }
  }, [applySession]);

  useEffect(() => {
    void hydrate();
    return () => clearTokenGetter();
  }, [hydrate]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      setLoginError(null);
      try {
        const result = await loginWithCredentials(email.trim(), password);
        await setStoredAuthToken(result.token);
        applySession({
          token: result.token,
          user: result.user,
          access: result.access,
        });

        if (result.requiresEmailVerification) {
          return {
            ok: true,
            requiresEmailVerification: true,
            message: "Verificá tu email para continuar.",
          };
        }

        return { ok: true };
      } catch (error) {
        const mapped = mapAuthApiErrorToLoginResult(error);
        setLoginError(mapped.message);
        return {
          ok: false,
          errorCode: mapped.errorCode,
          message: mapped.message,
        };
      }
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const token = tokenRef.current;
    if (token) {
      await logoutRemote(token);
    }
    await clearStoredAuthToken();
    applySession(null);
    setLoginError(null);
    setHydrationError(null);
  }, [applySession]);

  const value = useMemo<AppAuthContextValue>(
    () => ({
      status,
      sessionStatus: status,
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      user,
      access,
      saasDisabled,
      loginError,
      hydrationError,
      login,
      logout,
      refreshSession,
      getToken,
      getBearerToken: getToken,
    }),
    [
      access,
      saasDisabled,
      getToken,
      hydrationError,
      login,
      loginError,
      logout,
      refreshSession,
      status,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AppAuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
