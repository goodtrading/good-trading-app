import { customFetch, ApiError, setAuthTokenGetter, type AuthTokenGetter } from "@/lib/api-client/custom-fetch";
import {
  parseMobileMarketStateV2Snapshot,
  V2EnvelopeError,
  type MobileMarketStateV2Snapshot,
} from "@/lib/market-state/parseV2Snapshot";
import { V2DataValidationError } from "@/lib/market-state/v2DataSchema";
import {
  logV2Fetch,
  logV2Parse,
  peekV2Meta,
  setV2PipelineFetchId,
} from "@/lib/market-state/v2SnapshotPipelineLog";
import {
  MOBILE_V2_ERROR_CODES,
  type MobileMarketStateV2ErrorBody,
  type SupportedAsset,
  type SupportedMode,
} from "@/shared/mobileMarketStateV2.contract";

export type { MobileMarketStateV2Snapshot, SupportedMode, SupportedAsset };
export { parseMobileMarketStateV2Snapshot };

/** Client-side error codes: official API codes + transport-layer codes. */
export type MobileMarketStateV2ClientErrorCode =
  | (typeof MOBILE_V2_ERROR_CODES)[keyof typeof MOBILE_V2_ERROR_CODES]
  | "NETWORK_ERROR"
  | "ABORTED"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "VALIDATION_ERROR";

export type FetchMobileMarketStateV2Params = {
  asset?: SupportedAsset;
  mode?: SupportedMode;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchId?: number;
};

export type RateLimitInfo = {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
  retryAfterMs: number | null;
};

export class MobileMarketStateV2Error extends Error {
  readonly name = "MobileMarketStateV2Error";
  readonly code: MobileMarketStateV2ClientErrorCode;
  readonly status: number | null;
  readonly data: unknown;
  readonly rateLimit: RateLimitInfo;
  readonly retryAfterMs: number | null;
  readonly requestId: string | null;

  constructor(
    code: MobileMarketStateV2ClientErrorCode,
    message: string,
    options: {
      status?: number | null;
      data?: unknown;
      rateLimit?: Partial<RateLimitInfo>;
      retryAfterMs?: number | null;
      requestId?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.code = code;
    this.status = options.status ?? null;
    this.data = options.data ?? null;
    this.rateLimit = {
      limit: options.rateLimit?.limit ?? null,
      remaining: options.rateLimit?.remaining ?? null,
      reset: options.rateLimit?.reset ?? null,
      retryAfterMs: options.rateLimit?.retryAfterMs ?? options.retryAfterMs ?? null,
    };
    this.retryAfterMs = options.retryAfterMs ?? this.rateLimit.retryAfterMs;
    this.requestId = options.requestId ?? null;
  }
}

export function getMobileMarketStateV2Url(
  asset: SupportedAsset = "BTC",
  mode: SupportedMode = "both",
): string {
  const params = new URLSearchParams({ asset, mode });
  return `/api/mobile/market-state/v2?${params.toString()}`;
}

function parseRetryAfterMs(headers: Headers, bodyRetryAfterSec?: number): number | null {
  if (typeof bodyRetryAfterSec === "number" && Number.isFinite(bodyRetryAfterSec)) {
    return Math.max(0, bodyRetryAfterSec * 1000);
  }

  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const parseHeaderInt = (key: string) => {
    const raw = headers.get(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  return {
    limit: parseHeaderInt("x-ratelimit-limit"),
    remaining: parseHeaderInt("x-ratelimit-remaining"),
    reset: parseHeaderInt("x-ratelimit-reset"),
    retryAfterMs: parseRetryAfterMs(headers),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseOfficialErrorBody(data: unknown): MobileMarketStateV2ErrorBody | null {
  if (!isRecord(data) || data.status !== "error" || !isRecord(data.error)) return null;
  if (typeof data.error.code !== "string" || typeof data.error.message !== "string") return null;
  return data as unknown as MobileMarketStateV2ErrorBody;
}

function parseLegacyErrorBody(data: unknown): { code: string; message: string } | null {
  if (!isRecord(data)) return null;
  const code = typeof data.code === "string" ? data.code : typeof data.error === "string" ? data.error : null;
  const message = typeof data.message === "string" ? data.message : "Request failed";
  if (!code) return null;
  return { code, message };
}

function mapOfficialErrorCode(code: string, status: number): MobileMarketStateV2ClientErrorCode {
  const known = Object.values(MOBILE_V2_ERROR_CODES) as string[];
  if (known.includes(code)) {
    return code as MobileMarketStateV2ClientErrorCode;
  }

  if (status === 401) return MOBILE_V2_ERROR_CODES.AUTH_REQUIRED;
  if (status === 403) return MOBILE_V2_ERROR_CODES.PLAN_REQUIRED;
  if (status === 429) return MOBILE_V2_ERROR_CODES.MOBILE_RATE_LIMITED;
  if (status >= 500) return MOBILE_V2_ERROR_CODES.MARKET_STATE_UNAVAILABLE;

  return "INVALID_RESPONSE";
}

function isAuthErrorCode(code: string): boolean {
  return (
    code === MOBILE_V2_ERROR_CODES.AUTH_REQUIRED ||
    code === "UNAUTHORIZED" ||
    code === "INVALID_TOKEN"
  );
}

function isPlanErrorCode(code: string): boolean {
  return (
    code === MOBILE_V2_ERROR_CODES.PLAN_REQUIRED ||
    code === MOBILE_V2_ERROR_CODES.PLAN_EXPIRED ||
    code === MOBILE_V2_ERROR_CODES.ACCOUNT_INACTIVE ||
    code === MOBILE_V2_ERROR_CODES.TERMINAL_ACCESS_DENIED ||
    code === "FORBIDDEN" ||
    code === "PLAN_REQUIRED"
  );
}

export function mapApiError(error: ApiError): MobileMarketStateV2Error {
  const rateLimit = parseRateLimitHeaders(error.headers);
  const official = parseOfficialErrorBody(error.data);
  const legacy = parseLegacyErrorBody(error.data);

  const rawCode = official?.error.code ?? legacy?.code ?? "";
  const message = official?.error.message ?? legacy?.message ?? error.message;
  const requestId = official?.meta.requestId ?? null;
  const retryAfterMs = parseRetryAfterMs(
    error.headers,
    official?.error.retryAfterSec,
  );

  if (error.status === 400) {
    const code = mapOfficialErrorCode(rawCode, error.status);
    return new MobileMarketStateV2Error(code, message, {
      status: error.status,
      data: error.data,
      rateLimit,
      requestId,
    });
  }

  if (error.status === 401 || isAuthErrorCode(rawCode)) {
    return new MobileMarketStateV2Error(MOBILE_V2_ERROR_CODES.AUTH_REQUIRED, message, {
      status: error.status,
      data: error.data,
      rateLimit,
      requestId,
    });
  }

  if (error.status === 403 || isPlanErrorCode(rawCode)) {
    const code = mapOfficialErrorCode(rawCode, error.status);
    return new MobileMarketStateV2Error(code, message, {
      status: error.status,
      data: error.data,
      rateLimit,
      requestId,
    });
  }

  if (error.status === 429 || rawCode === MOBILE_V2_ERROR_CODES.MOBILE_RATE_LIMITED) {
    return new MobileMarketStateV2Error(MOBILE_V2_ERROR_CODES.MOBILE_RATE_LIMITED, message, {
      status: error.status,
      data: error.data,
      rateLimit,
      retryAfterMs,
      requestId,
    });
  }

  if (error.status >= 500) {
    return new MobileMarketStateV2Error(MOBILE_V2_ERROR_CODES.MARKET_STATE_UNAVAILABLE, message, {
      status: error.status,
      data: error.data,
      rateLimit,
      requestId,
    });
  }

  return new MobileMarketStateV2Error(mapOfficialErrorCode(rawCode, error.status), message, {
    status: error.status,
    data: error.data,
    rateLimit,
    requestId,
  });
}

async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit & { unwrapSuccessEnvelope?: boolean },
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  try {
    return await customFetch<T>(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
  }
}

export async function fetchMobileMarketStateV2(
  params: FetchMobileMarketStateV2Params = {},
): Promise<MobileMarketStateV2Snapshot> {
  const asset = params.asset ?? "BTC";
  const mode = params.mode ?? "both";
  const timeoutMs = params.timeoutMs ?? 15_000;
  const fetchId = params.fetchId ?? null;
  const url = getMobileMarketStateV2Url(asset, mode);
  const startedAt = Date.now();

  setV2PipelineFetchId(fetchId);

  logV2Fetch({
    fetchId,
    phase: "start",
    status: null,
    latency: null,
    requestId: null,
    snapshotId: null,
    url,
  });

  try {
    const payload = await fetchWithTimeout<unknown>(
      url,
      {
        method: "GET",
        headers: { accept: "application/json" },
        unwrapSuccessEnvelope: false,
      },
      timeoutMs,
      params.signal,
    );

    const latency = Date.now() - startedAt;
    const peek = peekV2Meta(payload);

    logV2Fetch({
      fetchId,
      phase: "complete",
      status: 200,
      latency,
      requestId: peek.requestId,
      snapshotId: peek.snapshotId,
      url,
    });

    try {
      return parseMobileMarketStateV2Snapshot(payload, fetchId);
    } catch (parseError) {
      if (parseError instanceof V2EnvelopeError) {
        logV2Parse({
          fetchId,
          success: false,
          error: parseError.message,
          errorCode: parseError.code,
        });
        throw new MobileMarketStateV2Error(parseError.code as MobileMarketStateV2ClientErrorCode, parseError.message, {
          data: parseError.body,
          requestId: peek.requestId,
        });
      }

      if (parseError instanceof V2DataValidationError) {
        throw new MobileMarketStateV2Error("VALIDATION_ERROR", parseError.message, {
          data: parseError.issues,
          requestId: peek.requestId,
        });
      }

      throw parseError;
    }
  } catch (error) {
    const latency = Date.now() - startedAt;

    if (error instanceof V2EnvelopeError) {
      logV2Fetch({
        fetchId,
        phase: "error",
        status: null,
        latency,
        requestId: null,
        snapshotId: null,
        url,
        errorCode: error.code,
        reason: error.message,
      });
      throw new MobileMarketStateV2Error(error.code as MobileMarketStateV2ClientErrorCode, error.message, {
        data: error.body,
      });
    }

    if (error instanceof V2DataValidationError) {
      logV2Fetch({
        fetchId,
        phase: "error",
        status: 200,
        latency,
        requestId: null,
        snapshotId: null,
        url,
        errorCode: "VALIDATION_ERROR",
        reason: error.message,
      });
      throw new MobileMarketStateV2Error("VALIDATION_ERROR", error.message, {
        data: error.issues,
      });
    }

    if (error instanceof MobileMarketStateV2Error) {
      logV2Fetch({
        fetchId,
        phase: "error",
        status: error.status,
        latency,
        requestId: error.requestId,
        snapshotId: null,
        url,
        errorCode: error.code,
        reason: error.message,
      });
      throw error;
    }

    if (error instanceof ApiError) {
      const mapped = mapApiError(error);
      logV2Fetch({
        fetchId,
        phase: "error",
        status: mapped.status,
        latency,
        requestId: mapped.requestId,
        snapshotId: null,
        url,
        errorCode: mapped.code,
        reason: mapped.message,
      });
      throw mapped;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      logV2Fetch({
        fetchId,
        phase: "skipped",
        status: null,
        latency,
        requestId: null,
        snapshotId: null,
        url,
        errorCode: "ABORTED",
        reason: "Request aborted",
      });
      throw new MobileMarketStateV2Error("ABORTED", "Request aborted", { cause: error });
    }

    if (error instanceof Error && error.name === "AbortError") {
      logV2Fetch({
        fetchId,
        phase: "skipped",
        status: null,
        latency,
        requestId: null,
        snapshotId: null,
        url,
        errorCode: "ABORTED",
        reason: "Request aborted",
      });
      throw new MobileMarketStateV2Error("ABORTED", "Request aborted", { cause: error });
    }

    logV2Fetch({
      fetchId,
      phase: "error",
      status: null,
      latency,
      requestId: null,
      snapshotId: null,
      url,
      errorCode: "NETWORK_ERROR",
      reason: error instanceof Error ? error.message : "Network request failed",
    });
    throw new MobileMarketStateV2Error(
      "NETWORK_ERROR",
      error instanceof Error ? error.message : "Network request failed",
      { cause: error },
    );
  }
}

/** Re-export for app bootstrap — same getter used by Orval client. */
export function configureMobileMarketStateV2Auth(getter: AuthTokenGetter | null): void {
  setAuthTokenGetter(getter);
}

export function isAuthRequiredError(code: MobileMarketStateV2ClientErrorCode): boolean {
  return code === MOBILE_V2_ERROR_CODES.AUTH_REQUIRED;
}

export function isSubscriptionRequiredError(code: MobileMarketStateV2ClientErrorCode): boolean {
  return (
    code === MOBILE_V2_ERROR_CODES.PLAN_REQUIRED ||
    code === MOBILE_V2_ERROR_CODES.PLAN_EXPIRED ||
    code === MOBILE_V2_ERROR_CODES.ACCOUNT_INACTIVE ||
    code === MOBILE_V2_ERROR_CODES.TERMINAL_ACCESS_DENIED
  );
}

export function shouldStopV2PollingOnError(code: MobileMarketStateV2ClientErrorCode): boolean {
  return isAuthRequiredError(code) || isSubscriptionRequiredError(code);
}
