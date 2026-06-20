import {
  MOBILE_V2_SCHEMA_VERSION,
  type MobileMarketStateV2ErrorBody,
  type MobileMarketStateV2SuccessMeta,
} from "@/shared/mobileMarketStateV2.contract";

import {
  mobileMarketStateV2DataSchema,
  parseMobileMarketStateV2DataWithWarnings,
  V2DataValidationError,
  type MobileMarketStateV2Data,
} from "./v2DataSchema";
import { logV2Parse } from "./v2SnapshotPipelineLog";

export type MobileMarketStateV2Snapshot = {
  meta: MobileMarketStateV2SuccessMeta;
  data: MobileMarketStateV2Data;
  schemaVersion: typeof MOBILE_V2_SCHEMA_VERSION;
  validationWarnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isErrorBody(payload: unknown): payload is MobileMarketStateV2ErrorBody {
  return (
    isRecord(payload) &&
    payload.status === "error" &&
    isRecord(payload.error) &&
    typeof payload.error.code === "string"
  );
}

function isSuccessBody(payload: unknown): payload is {
  status: "success";
  data: unknown;
  meta: MobileMarketStateV2SuccessMeta;
} {
  return (
    isRecord(payload) &&
    payload.status === "success" &&
    "data" in payload &&
    isRecord(payload.meta) &&
    typeof payload.meta.requestId === "string" &&
    typeof payload.meta.snapshotId === "string" &&
    typeof payload.meta.generatedAt === "string" &&
    typeof payload.meta.servedAt === "string"
  );
}

export function parseMobileMarketStateV2Snapshot(
  payload: unknown,
  fetchId: number | null = null,
): MobileMarketStateV2Snapshot {
  try {
    if (isErrorBody(payload)) {
      logV2Parse({
        fetchId,
        success: false,
        error: payload.error.message,
        errorCode: payload.error.code,
      });
      throw new V2EnvelopeError(payload.error.code, payload.error.message, payload);
    }

    if (!isSuccessBody(payload)) {
      logV2Parse({
        fetchId,
        success: false,
        error: "Unexpected mobile market-state v2 response shape",
        errorCode: "INVALID_RESPONSE",
      });
      throw new V2EnvelopeError("INVALID_RESPONSE", "Unexpected mobile market-state v2 response shape");
    }

    const parsed = parseMobileMarketStateV2DataWithWarnings(payload.data, fetchId);

    logV2Parse({ fetchId, success: true });

    return {
      meta: payload.meta,
      data: parsed.data,
      schemaVersion: MOBILE_V2_SCHEMA_VERSION,
      validationWarnings: parsed.warnings,
    };
  } catch (error) {
    if (error instanceof V2EnvelopeError || error instanceof V2DataValidationError) {
      throw error;
    }
    logV2Parse({
      fetchId,
      success: false,
      error: error instanceof Error ? error.message : "Unknown parse error",
    });
    throw error;
  }
}

export class V2EnvelopeError extends Error {
  readonly name = "V2EnvelopeError";
  readonly code: string;
  readonly body: unknown;

  constructor(code: string, message: string, body?: unknown) {
    super(message);
    this.code = code;
    this.body = body ?? null;
  }
}

/** @deprecated Use parseMobileMarketStateV2Snapshot — kept for test migration */
export function parseMobileMarketStateV2(payload: unknown): MobileMarketStateV2Snapshot {
  return parseMobileMarketStateV2Snapshot(payload);
}

export { mobileMarketStateV2DataSchema, V2DataValidationError };
