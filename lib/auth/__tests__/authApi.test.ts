import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthApiError,
  fetchAuthMe,
  loginWithCredentials,
  logoutRemote,
  parseLoginResponseBody,
  parseMeResponseBody,
} from "@/lib/auth/authApi";
import loginFixture from "./fixtures/loginResponse.real.sanitized.json";
import meFixture from "./fixtures/meResponse.real.sanitized.json";

vi.mock("@/lib/api/config", () => ({
  getApiBaseUrl: () => "https://api.example.com",
}));

function withRealToken<T extends { token?: string }>(body: T): T {
  return { ...body, token: "eyJhbGciOiJIUzI1NiJ9.test.signature" };
}

function withRealEmail<T extends { user: { email: string } }>(body: T): T {
  return {
    ...body,
    user: { ...body.user, email: "trader@example.com" },
  };
}

describe("authApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login 200 parses token from real web terminal shape (no role)", async () => {
    const body = withRealToken(withRealEmail(loginFixture));
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const session = await loginWithCredentials("trader@example.com", "secret");
    expect(session.token).toBe(body.token);
    expect(session.user.id).toBe(123);
    expect(session.user.email).toBe("trader@example.com");
    expect(session.user.emailVerified).toBe(true);
    expect(session.user.role).toBeUndefined();
    expect(session.access).toEqual({ allowed: true });
  });

  it("parseLoginResponseBody accepts flat envelope without status/data", () => {
    const body = withRealToken(withRealEmail(loginFixture));
    const parsed = parseLoginResponseBody(body);
    expect(parsed.token).toBe(body.token);
    expect(parsed.user.id).toBe(123);
  });

  it("login fails clearly when response has no token", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: 1, email: "a@b.com" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(loginWithCredentials("a@b.com", "x")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: "Unexpected login response shape",
    });
  });

  it("login HTML response fails as invalid content type", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<html><body>Not Found</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(loginWithCredentials("a@b.com", "x")).rejects.toMatchObject({
      code: "INVALID_CONTENT_TYPE",
    });
  });

  it("login 401 maps web error string to invalid credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(loginWithCredentials("a@b.com", "bad")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Invalid credentials",
    });
  });

  it("fetchAuthMe sends bearer header without logging token", async () => {
    const body = withRealEmail(meFixture);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const session = await fetchAuthMe("jwt-secret");
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe("https://api.example.com/api/auth/me");
    expect(headers.get("authorization")).toBe("Bearer jwt-secret");
    expect(session.user.id).toBe(123);
    expect(session.user.email).toBe("trader@example.com");
    expect(session.token).toBe("jwt-secret");
  });

  it("parseMeResponseBody accepts authenticated + access from web terminal", () => {
    const body = withRealEmail(meFixture);
    const parsed = parseMeResponseBody(body);
    expect(parsed.authenticated).toBe(true);
    expect(parsed.user).toBeDefined();
    expect(parsed.user?.id).toBe(123);
    expect(parsed.access).toEqual({ allowed: true });
  });

  it("fetchAuthMe 200 with authenticated false throws unauthorized", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ authenticated: false, user: null, access: null }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(fetchAuthMe("expired")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("fetchAuthMe 401 throws unauthorized", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );

    await expect(fetchAuthMe("expired")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("logoutRemote is best-effort", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await expect(logoutRemote("jwt")).resolves.toBeUndefined();
  });
});
