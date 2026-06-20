export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/** @deprecated Use AuthStatus — kept for market-state v2 hooks */
export type AuthSessionStatus = AuthStatus;

export interface AuthUser {
  id: number;
  email: string;
  role?: string;
  emailVerified?: boolean;
  fullName?: string | null;
}

export type AuthAccess = Record<string, unknown>;

export interface AuthSession {
  token: string;
  user: AuthUser;
  access: AuthAccess;
  saasDisabled?: boolean;
}

export type LoginErrorCode =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_INACTIVE"
  | "EMAIL_NOT_VERIFIED"
  | "SERVER_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "INVALID_CONTENT_TYPE"
  | "NETWORK_ERROR";

export interface LoginResult {
  ok: boolean;
  requiresEmailVerification?: boolean;
  errorCode?: LoginErrorCode;
  message?: string;
}

export interface AppAuthContextValue {
  status: AuthStatus;
  /** Alias for existing market-state integrations */
  sessionStatus: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  access: AuthAccess | null;
  saasDisabled: boolean;
  loginError: string | null;
  hydrationError: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  getToken: () => Promise<string | null>;
  /** Alias for API client wiring */
  getBearerToken: () => Promise<string | null>;
}
