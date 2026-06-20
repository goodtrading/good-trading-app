import type { z } from "zod";

import { formatZodPath, getV2PipelineFetchId } from "./v2SnapshotPipelineLog";

type PayloadRecord = Record<string, unknown>;

const CRITICAL_FIELD_EXPECTATIONS: Record<string, string> = {
  "asset.symbol": "string",
  "asset.spot": "object({ value: number|null, status: DataStatus })",
  "micro.localGammaFlip": "object({ value: number|null, status: DataStatus })",
  "micro.distanceToLocalFlip": "object(DistanceMetrics)",
  "micro.localRegime": "object({ value: string|null, status: DataStatus })",
  "micro.localTransitionZone": "object({ value: string|null, status: DataStatus })",
  "micro.nearbyMagnets": "array(Magnet)",
  "micro.nearbyPockets": "array(Pocket)",
  "micro.intradayRisk": "object({ value: string|null, status: DataStatus })",
  "micro.intradayBias": "object({ value: string|null, status: DataStatus })",
  "micro.baseIntradayScenario": "object(Scenario)",
  "micro.totalGex": "object({ value: number|null, status: DataStatus })",
  "macro.globalGammaFlip": "object({ value: number|null, status: DataStatus })",
  "macro.totalGex": "object({ value: number|null, status: DataStatus })",
  "macro.globalRegime": "object({ value: string|null, status: DataStatus })",
  "macro.callWall": "object({ value: number|null, status: DataStatus })",
  "macro.putWall": "object({ value: number|null, status: DataStatus })",
  "macro.dealerPivot": "object({ value: number|null, status: DataStatus })",
  "macro.dominantExpiry": "object(DominantExpiryBlock)",
  "macro.structuralMagnets": "array(Magnet)",
  "macro.shortGammaPockets": "array(Pocket)",
  "macro.structuralScenarios": "array(Scenario)",
  "macro.tailScenarios": "array(Scenario)",
};

const SPOTCHECK_PATHS = [
  "micro.localGammaFlip",
  "macro.globalGammaFlip",
  "macro.dealerPivot",
  "macro.dominantExpiry",
  "micro.nearbyPockets",
  "macro.shortGammaPockets",
  "relationship",
] as const;

function isDevRuntime(): boolean {
  return typeof __DEV__ === "undefined" ? process.env.NODE_ENV !== "production" : Boolean(__DEV__);
}

function devOnly(fn: () => void): void {
  if (isDevRuntime()) fn();
}

function asRecord(value: unknown): PayloadRecord | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as PayloadRecord;
}

function objectKeys(value: unknown): string[] | null {
  const record = asRecord(value);
  return record ? Object.keys(record) : null;
}

function getAtPath(value: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = value;
  for (const part of parts) {
    const record = asRecord(current);
    if (!record || !(part in record)) return undefined;
    current = record[part];
  }
  return current;
}

function summarizeReceived(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    return json.length > 160 ? `${json.slice(0, 157)}...` : json;
  }
  return String(value);
}

function existsAtPath(value: unknown, path: string): boolean {
  const parts = path.split(".");
  let current: unknown = value;
  for (const part of parts) {
    const record = asRecord(current);
    if (!record || !(part in record)) return false;
    current = record[part];
  }
  return true;
}

function formatZodExpected(issue: z.ZodIssue): string {
  if ("expected" in issue && issue.expected != null) {
    return String(issue.expected);
  }
  const path = formatZodPath(issue.path);
  return CRITICAL_FIELD_EXPECTATIONS[path] ?? issue.message;
}

function formatZodReceived(issue: z.ZodIssue, payload: unknown): string {
  if ("received" in issue && issue.received != null) {
    return String(issue.received);
  }
  return summarizeReceived(getAtPath(payload, formatZodPath(issue.path)));
}

export function logV2RawPayload(payload: unknown, fetchId: number | null = null): void {
  const root = asRecord(payload);
  devOnly(() => {
    console.log("[V2 RAW PAYLOAD]", {
      fetchId: fetchId ?? getV2PipelineFetchId(),
      "keys(root)": root ? Object.keys(root) : null,
      "keys(micro)": objectKeys(root?.micro),
      "keys(macro)": objectKeys(root?.macro),
      "keys(relationship)": objectKeys(root?.relationship),
    });
  });
}

export function logV2SchemaMismatch(
  issue: z.ZodIssue,
  payload: unknown,
  fetchId: number | null = null,
): void {
  const path = formatZodPath(issue.path);
  devOnly(() => {
    console.log("[V2 SCHEMA MISMATCH]", {
      fetchId: fetchId ?? getV2PipelineFetchId(),
      path,
      expected: formatZodExpected(issue),
      received: formatZodReceived(issue, payload),
      code: issue.code,
      message: issue.message,
    });
  });
}

export function logV2SchemaMismatchTable(
  payload: unknown,
  issues: z.ZodIssue[],
  fetchId: number | null = null,
): void {
  const resolvedFetchId = fetchId ?? getV2PipelineFetchId();

  devOnly(() => {
    console.log("[V2 SCHEMA TABLE] issueCount:", issues.length, "fetchId:", resolvedFetchId);
    for (const [field, expected] of Object.entries(CRITICAL_FIELD_EXPECTATIONS)) {
      const received = getAtPath(payload, field);
      const exists = existsAtPath(payload, field);
      console.log(
        `[V2 SCHEMA TABLE] ${field} | ${summarizeReceived(received)} | ${exists ? "SI" : "NO"} | expected: ${expected}`,
      );
    }

    console.log("[V2 SCHEMA SPOTCHECK] fetchId:", resolvedFetchId);
    for (const path of SPOTCHECK_PATHS) {
      const received = getAtPath(payload, path);
      const exists = existsAtPath(payload, path);
      console.log(
        `[V2 SCHEMA SPOTCHECK] ${path} | ${summarizeReceived(received)} | ${exists ? "SI" : "NO"}`,
      );
    }

    if (issues.length > 0) {
      const first = issues[0];
      console.log("[V2 SCHEMA SUMMARY]", {
        fetchId: resolvedFetchId,
        issueCount: issues.length,
        firstMismatchPath: formatZodPath(first.path),
        firstMismatchExpected: formatZodExpected(first),
        firstMismatchReceived: formatZodReceived(first, payload),
      });
    }
  });
}

export function auditCriticalSchemaPayload(
  payload: unknown,
  issues: z.ZodIssue[],
  fetchId: number | null = null,
): void {
  logV2RawPayload(payload, fetchId);
  for (const issue of issues) {
    logV2SchemaMismatch(issue, payload, fetchId);
  }
  logV2SchemaMismatchTable(payload, issues, fetchId);
}

export const __testOnlyCriticalFieldExpectations = CRITICAL_FIELD_EXPECTATIONS;
