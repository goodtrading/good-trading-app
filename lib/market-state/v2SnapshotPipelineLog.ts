export type V2FetchId = number | null;

type V2FetchLog = {
  fetchId: V2FetchId;
  phase: "start" | "complete" | "error" | "skipped";
  status: number | null;
  latency: number | null;
  requestId: string | null;
  snapshotId: string | null;
  reason?: string;
  errorCode?: string;
  url?: string;
};

type V2ParseLog = {
  fetchId: V2FetchId;
  success: boolean;
  error?: string;
  errorCode?: string;
};

type V2ValidationLog = {
  fetchId: V2FetchId;
  success: boolean;
  path: string | null;
  message: string | null;
  issueCount?: number;
};

type V2SnapshotCommitLog = {
  fetchId: V2FetchId;
  snapshotId: string | null;
  requestId: string | null;
};

type V2LastValidSnapshotLog = {
  fetchId: V2FetchId;
  snapshotId: string | null;
  requestId: string | null;
};

type V2StateLog = {
  fetchId: V2FetchId;
  hasSnapshot: boolean;
  hasData: boolean;
  hasMicro: boolean;
  hasMacro: boolean;
  snapshotId: string | null;
  requestId: string | null;
  trigger?: string;
};

type V2RaceLog = {
  event:
    | "cancelInFlight"
    | "abortController.abort"
    | "runFetch.start"
    | "runFetch.finally"
    | "runFetch.abortedAfterResolve"
    | "runFetch.caughtAborted"
    | "commitValidSnapshot.skippedStale";
  fetchId: V2FetchId;
  activeFetchId: V2FetchId;
  abortedFetchId?: V2FetchId;
  isStale?: boolean;
  reason?: string;
};

let pipelineFetchId: V2FetchId = null;

export function setV2PipelineFetchId(fetchId: V2FetchId): void {
  pipelineFetchId = fetchId;
}

export function getV2PipelineFetchId(): V2FetchId {
  return pipelineFetchId;
}

export function clearV2PipelineFetchId(fetchId: V2FetchId): void {
  if (pipelineFetchId === fetchId) {
    pipelineFetchId = null;
  }
}

function isDevRuntime(): boolean {
  return typeof __DEV__ === "undefined" ? process.env.NODE_ENV !== "production" : Boolean(__DEV__);
}

function devOnly(fn: () => void): void {
  if (isDevRuntime()) fn();
}

export function logV2Fetch(entry: V2FetchLog): void {
  devOnly(() => {
    console.log("[V2 FETCH]", {
      fetchId: entry.fetchId,
      status: entry.status,
      latency: entry.latency,
      requestId: entry.requestId,
      snapshotId: entry.snapshotId,
      ...(entry.phase ? { phase: entry.phase } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
      ...(entry.url ? { url: entry.url } : {}),
    });
  });
}

export function logV2Parse(entry: V2ParseLog): void {
  devOnly(() => {
    console.log(
      "[V2 PARSE]",
      entry.success ? "success" : "fail",
      {
        fetchId: entry.fetchId ?? getV2PipelineFetchId(),
        ...(entry.error ? { error: entry.error } : {}),
        ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
      },
    );
  });
}

export function logV2Validation(entry: V2ValidationLog): void {
  devOnly(() => {
    console.log(
      "[V2 VALIDATION]",
      entry.success ? "success" : "fail",
      {
        fetchId: entry.fetchId ?? getV2PipelineFetchId(),
        path: entry.path,
        message: entry.message,
        ...(entry.issueCount != null ? { issueCount: entry.issueCount } : {}),
      },
    );
  });
}

export function logV2SnapshotSetData(entry: V2SnapshotCommitLog): void {
  devOnly(() => {
    console.log("[V2 SNAPSHOT]", {
      fetchId: entry.fetchId,
      setDataCalled: true,
      snapshotId: entry.snapshotId,
      requestId: entry.requestId,
    });
  });
}

export function logV2LastValidSnapshot(entry: V2LastValidSnapshotLog): void {
  devOnly(() => {
    console.log("[V2 LAST VALID SNAPSHOT]", {
      fetchId: entry.fetchId,
      snapshotId: entry.snapshotId,
      requestId: entry.requestId,
    });
  });
}

export function logV2State(entry: V2StateLog): void {
  devOnly(() => {
    console.log("[V2 STATE]", {
      fetchId: entry.fetchId,
      hasSnapshot: entry.hasSnapshot,
      hasData: entry.hasData,
      hasMicro: entry.hasMicro,
      hasMacro: entry.hasMacro,
      snapshotId: entry.snapshotId,
      requestId: entry.requestId,
      ...(entry.trigger ? { trigger: entry.trigger } : {}),
    });
  });
}

export function logV2Race(entry: V2RaceLog): void {
  devOnly(() => {
    console.log("[V2 RACE]", {
      event: entry.event,
      fetchId: entry.fetchId,
      activeFetchId: entry.activeFetchId,
      ...(entry.abortedFetchId != null ? { abortedFetchId: entry.abortedFetchId } : {}),
      ...(entry.isStale != null ? { isStale: entry.isStale } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
    });
  });
}

export function peekV2Meta(payload: unknown): {
  requestId: string | null;
  snapshotId: string | null;
} {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return { requestId: null, snapshotId: null };
  }
  const meta = (payload as { meta?: { requestId?: unknown; snapshotId?: unknown } }).meta;
  return {
    requestId: typeof meta?.requestId === "string" ? meta.requestId : null,
    snapshotId: typeof meta?.snapshotId === "string" ? meta.snapshotId : null,
  };
}

export function formatZodPath(path: (string | number)[]): string {
  return path.length > 0 ? path.join(".") : "(root)";
}
