import { z } from "zod";

import { getApiBaseUrl } from "@/lib/api/config";

import {
  authUserSchema,
  loginResponseSchema,
  meResponseSchema,
  type ParsedLoginResponse,
  type ParsedMeResponse,
} from "./authSchemas";
import type { AuthAccess, AuthSession, AuthUser, LoginErrorCode } from "./types";

export class AuthApiError extends Error {
  readonly name = "AuthApiError";
  readonly code: LoginErrorCode | "UNAUTHORIZED" | "INVALID_RESPONSE" | "NETWORK_ERROR" | "INVALID_CONTENT_TYPE";
  readonly status: number | null;

  constructor(
    code: AuthApiError["code"],
    message: string,
    options: { status?: number | null; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.code = code;
    this.status = options.status ?? null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function assertJsonContentType(contentType: string | null): void {
  if (!contentType) return;
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  if (normalized !== "application/json" && !normalized.endsWith("+json")) {
    throw new AuthApiError("INVALID_CONTENT_TYPE", "Expected JSON response from auth endpoint");
  }
}

function mapLoginError(status: number, body: unknown): AuthApiError {
  const record = isRecord(body) ? body : {};
  const message =
    typeof record.message === "string"
      ? record.message
      : typeof record.error === "string"
        ? record.error
        : "Login failed";
  const codeField = typeof record.code === "string" ? record.code : "";

  if (status === 401) {
    return new AuthApiError("INVALID_CREDENTIALS", message, { status });
  }
  if (status === 403) {
    if (codeField.includes("EMAIL") || message.toLowerCase().includes("verif")) {
      return new AuthApiError("EMAIL_NOT_VERIFIED", message, { status });
    }
    return new AuthApiError("ACCOUNT_INACTIVE", message, { status });
  }
  if (status >= 500) {
    return new AuthApiError("SERVER_UNAVAILABLE", message, { status });
  }
  return new AuthApiError("INVALID_RESPONSE", message, { status });
}

async function authFetch(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<Response> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new AuthApiError("NETWORK_ERROR", "API base URL is not configured");
  }

  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.token) {
    headers.set("authorization", `Bearer ${init.token}`);
  }

  try {
    return await fetch(`${base}${path}`, { ...init, headers });
  } catch (error) {
    throw new AuthApiError(
      "NETWORK_ERROR",
      error instanceof Error ? error.message : "Network request failed",
      { cause: error },
    );
  }
}

export function parseLoginResponseBody(body: unknown): ParsedLoginResponse {
  const parsed = loginResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AuthApiError("INVALID_RESPONSE", "Unexpected login response shape");
  }
  return parsed.data;
}

export function parseMeResponseBody(body: unknown): ParsedMeResponse {
  const parsed = meResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AuthApiError("INVALID_RESPONSE", "Unexpected /api/auth/me payload");
  }
  return parsed.data;
}

function toAuthUser(user: z.infer<typeof authUserSchema>): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    fullName: user.fullName ?? undefined,
  };
}

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<AuthSession & { requiresEmailVerification: boolean }> {
  const res = await authFetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const contentType = res.headers.get("content-type");
  const rawText = await res.text();
  const body = parseJsonSafe(rawText);

  if (!res.ok) {
    if (body == null && rawText.trim().startsWith("<")) {
      throw new AuthApiError("INVALID_CONTENT_TYPE", "Auth endpoint returned HTML", {
        status: res.status,
      });
    }
    throw mapLoginError(res.status, body);
  }

  assertJsonContentType(contentType);
  const parsed = parseLoginResponseBody(body);

  return {
    token: parsed.token,
    user: toAuthUser(parsed.user),
    access: (parsed.access ?? {}) as AuthAccess,
    requiresEmailVerification: Boolean(parsed.requiresEmailVerification),
  };
}

export async function fetchAuthMe(token: string): Promise<AuthSession> {
  const res = await authFetch("/api/auth/me", {
    method: "GET",
    token,
  });

  const contentType = res.headers.get("content-type");
  const rawText = await res.text();
  const body = parseJsonSafe(rawText);

  if (res.status === 401) {
    throw new AuthApiError("UNAUTHORIZED", "Session expired or invalid", { status: 401 });
  }

  if (!res.ok) {
    if (body == null && rawText.trim().startsWith("<")) {
      throw new AuthApiError("INVALID_CONTENT_TYPE", "Auth endpoint returned HTML", {
        status: res.status,
      });
    }
    if (res.status >= 500) {
      throw new AuthApiError("SERVER_UNAVAILABLE", "Auth service unavailable", {
        status: res.status,
      });
    }
    throw new AuthApiError("INVALID_RESPONSE", "Unexpected /api/auth/me response", {
      status: res.status,
    });
  }

  assertJsonContentType(contentType);
  const parsed = parseMeResponseBody(body);

  if (parsed.authenticated === false || !parsed.user) {
    throw new AuthApiError("UNAUTHORIZED", "Session expired or invalid", { status: res.status });
  }

  return {
    token,
    user: toAuthUser(parsed.user),
    access: (parsed.access ?? {}) as AuthAccess,
    saasDisabled: parsed.saasDisabled ?? false,
  };
}

export async function logoutRemote(token: string): Promise<void> {
  try {
    await authFetch("/api/auth/logout", {
      method: "POST",
      token,
    });
  } catch {
    // Local logout must still complete.
  }
}

export function mapAuthApiErrorToLoginResult(error: unknown): {
  errorCode: LoginErrorCode;
  message: string;
} {
  if (error instanceof AuthApiError) {
    if (
      error.code === "INVALID_CREDENTIALS" ||
      error.code === "ACCOUNT_INACTIVE" ||
      error.code === "EMAIL_NOT_VERIFIED" ||
      error.code === "SERVER_UNAVAILABLE" ||
      error.code === "INVALID_RESPONSE" ||
      error.code === "INVALID_CONTENT_TYPE" ||
      error.code === "NETWORK_ERROR"
    ) {
      return { errorCode: error.code, message: error.message };
    }
  }
  return { errorCode: "NETWORK_ERROR", message: "No se pudo iniciar sesión" };
}
