import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppState, type AppStateStatus } from "react-native";



import { useAuth } from "@/lib/auth";

import {

  MOBILE_STATE_V2_DEFAULT_ASSET,

  MOBILE_STATE_V2_DEFAULT_MODE,

} from "@/lib/feature-flags";

import { shouldPollV2MarketState } from "@/lib/market-state/fallbackPolicy";

import type { MarketScopeMode } from "@/lib/market-state/v2DataSchema";

import { computeNextPollDelayMs, shouldRefreshOnForeground } from "@/lib/market-state/pollingPolicy";

import {

  clearV2PipelineFetchId,

  logV2Fetch,

  logV2LastValidSnapshot,

  logV2Race,

  logV2SnapshotSetData,

  logV2State,

  setV2PipelineFetchId,

} from "@/lib/market-state/v2SnapshotPipelineLog";

import {

  fetchMobileMarketStateV2,

  isAuthRequiredError,

  isSubscriptionRequiredError,

  MobileMarketStateV2Error,

  type MobileMarketStateV2Snapshot,

} from "@/src/api/mobileMarketStateV2";

import { MOBILE_V2_ERROR_CODES } from "@/shared/mobileMarketStateV2.contract";



export type UseMobileMarketStateV2Options = {

  asset?: string;

  enabled?: boolean;

};



export type MobileMarketStateV2SnapshotDiagnostics = {

  requestId: string | null;

  snapshotId: string | null;

  generatedAt: string | null;

  servedAt: string | null;

  isNewSnapshot: boolean;

  httpStatus: number | null;

  latencyMs: number | null;

  lastSuccessfulFetchAt: string | null;

  errorCode: string | null;

};



const SERVER_ERROR_BACKOFF_MS = [2_000, 5_000, 10_000];



export function useMobileMarketStateV2(options: UseMobileMarketStateV2Options = {}) {

  const asset = options.asset ?? MOBILE_STATE_V2_DEFAULT_ASSET;

  const featureEnabled = options.enabled ?? true;

  const { sessionStatus, refreshSession } = useAuth();



  const pollingAllowed = featureEnabled && shouldPollV2MarketState(true, sessionStatus);

  const authLoading = sessionStatus === "loading";

  const requiresAuth = featureEnabled && sessionStatus === "unauthenticated";



  const [data, setData] = useState<MobileMarketStateV2Snapshot | null>(null);

  const [selectedMode, setSelectedMode] = useState<MarketScopeMode>("macro");

  const [isLoading, setIsLoading] = useState(pollingAllowed);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [hasSnapshot, setHasSnapshot] = useState(false);

  const [error, setError] = useState<MobileMarketStateV2Error | null>(null);

  const [diagnostics, setDiagnostics] = useState<MobileMarketStateV2SnapshotDiagnostics>({

    requestId: null,

    snapshotId: null,

    generatedAt: null,

    servedAt: null,

    isNewSnapshot: false,

    httpStatus: null,

    latencyMs: null,

    lastSuccessfulFetchAt: null,

    errorCode: null,

  });



  const abortRef = useRef<AbortController | null>(null);

  const controllerFetchIdRef = useRef<number | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const retryAfterUntilRef = useRef(0);

  const serverErrorStreakRef = useRef(0);

  const isForegroundRef = useRef(AppState.currentState === "active");

  const lastSnapshotIdRef = useRef<string | null>(null);

  const hasLoadedRef = useRef(false);

  const fetchGenerationRef = useRef(0);

  const pollingStoppedRef = useRef(false);

  const unauthorizedHandledRef = useRef(false);

  const runFetchRef = useRef<(args?: { manual?: boolean }) => Promise<void>>(async () => {});

  const lastValidSnapshotRef = useRef<MobileMarketStateV2Snapshot | null>(null);

  const lastCommittedFetchIdRef = useRef<number | null>(null);

  const v2StateSignatureRef = useRef("");



  const emitV2State = useCallback(

    (fetchId: number | null, trigger: string) => {

      const snapshot = lastValidSnapshotRef.current ?? data;

      logV2State({

        fetchId,

        hasSnapshot,

        hasData: Boolean(data),

        hasMicro: Boolean(data?.data.micro),

        hasMacro: Boolean(data?.data.macro),

        snapshotId: snapshot?.meta.snapshotId ?? null,

        requestId: snapshot?.meta.requestId ?? null,

        trigger,

      });

    },

    [data, hasSnapshot],

  );



  const commitValidSnapshot = useCallback(

    (snapshot: MobileMarketStateV2Snapshot, fetchId: number): boolean => {

      if (fetchId !== fetchGenerationRef.current) {

        logV2Race({

          event: "commitValidSnapshot.skippedStale",

          fetchId,

          activeFetchId: fetchGenerationRef.current,

          isStale: true,

          reason: "fetch superseded before commitValidSnapshot",

        });

        return false;

      }



      lastValidSnapshotRef.current = snapshot;

      lastCommittedFetchIdRef.current = fetchId;



      logV2LastValidSnapshot({

        fetchId,

        snapshotId: snapshot.meta.snapshotId,

        requestId: snapshot.meta.requestId,

      });



      setData(snapshot);



      logV2SnapshotSetData({

        fetchId,

        snapshotId: snapshot.meta.snapshotId,

        requestId: snapshot.meta.requestId,

      });



      setHasSnapshot(true);

      emitV2State(fetchId, "commitValidSnapshot");

      return true;

    },

    [emitV2State],

  );



  const clearPollTimer = useCallback(() => {

    if (pollTimerRef.current) {

      clearTimeout(pollTimerRef.current);

      pollTimerRef.current = null;

    }

  }, []);



  const cancelInFlight = useCallback((reason: string) => {

    const controller = abortRef.current;

    const abortedFetchId = controllerFetchIdRef.current;



    if (controller) {

      logV2Race({

        event: "cancelInFlight",

        fetchId: abortedFetchId,

        activeFetchId: fetchGenerationRef.current,

        abortedFetchId: abortedFetchId ?? undefined,

        reason,

      });

      logV2Race({

        event: "abortController.abort",

        fetchId: abortedFetchId,

        activeFetchId: fetchGenerationRef.current,

        abortedFetchId: abortedFetchId ?? undefined,

        reason,

      });

      controller.abort();

    }



    abortRef.current = null;

    controllerFetchIdRef.current = null;

  }, []);



  const scheduleNextPoll = useCallback(

    (delayMs: number) => {

      clearPollTimer();

      if (!pollingAllowed || !isForegroundRef.current || pollingStoppedRef.current) return;



      pollTimerRef.current = setTimeout(() => {

        void runFetchRef.current({ manual: false });

      }, delayMs);

    },

    [clearPollTimer, pollingAllowed],

  );



  const runFetch = useCallback(

    async ({ manual = false }: { manual?: boolean } = {}) => {

      if (!pollingAllowed) {

        logV2Fetch({

          fetchId: null,

          phase: "skipped",

          status: null,

          latency: null,

          requestId: null,

          snapshotId: null,

          reason: `runFetch blocked: pollingAllowed=false (sessionStatus=${sessionStatus})`,

        });

        return;

      }



      const now = Date.now();

      if (!manual && now < retryAfterUntilRef.current) {

        logV2Fetch({

          fetchId: null,

          phase: "skipped",

          status: null,

          latency: null,

          requestId: null,

          snapshotId: null,

          reason: `runFetch backoff until ${new Date(retryAfterUntilRef.current).toISOString()}`,

        });

        scheduleNextPoll(retryAfterUntilRef.current - now);

        return;

      }



      cancelInFlight("runFetch starting new poll");

      const controller = new AbortController();

      const fetchId = ++fetchGenerationRef.current;

      abortRef.current = controller;

      controllerFetchIdRef.current = fetchId;

      setV2PipelineFetchId(fetchId);



      logV2Race({

        event: "runFetch.start",

        fetchId,

        activeFetchId: fetchGenerationRef.current,

        reason: manual ? "manual" : "poll",

      });



      if (!hasLoadedRef.current) setIsLoading(true);

      else setIsRefreshing(true);



      const startedAt = Date.now();

      let stopPollingAfterFetch = false;



      try {

        const next = await fetchMobileMarketStateV2({

          asset: asset as "BTC",

          mode: MOBILE_STATE_V2_DEFAULT_MODE,

          signal: controller.signal,

          fetchId,

        });



        if (controller.signal.aborted || fetchId !== fetchGenerationRef.current) {

          logV2Race({

            event: "runFetch.abortedAfterResolve",

            fetchId,

            activeFetchId: fetchGenerationRef.current,

            isStale: fetchId !== fetchGenerationRef.current,

            reason: controller.signal.aborted

              ? "controller.signal.aborted after resolve"

              : "fetchId !== activeFetchId after resolve",

          });

          return;

        }



        const previousSnapshotId = lastSnapshotIdRef.current;

        const isNewSnapshot = previousSnapshotId != null && previousSnapshotId !== next.meta.snapshotId;

        lastSnapshotIdRef.current = next.meta.snapshotId;



        const committed = commitValidSnapshot(next, fetchId);

        if (!committed) return;



        setError(null);

        setDiagnostics({

          requestId: next.meta.requestId,

          snapshotId: next.meta.snapshotId,

          generatedAt: next.meta.generatedAt,

          servedAt: next.meta.servedAt,

          isNewSnapshot,

          httpStatus: 200,

          latencyMs: Date.now() - startedAt,

          lastSuccessfulFetchAt: new Date().toISOString(),

          errorCode: null,

        });



        serverErrorStreakRef.current = 0;

        retryAfterUntilRef.current = 0;

        pollingStoppedRef.current = false;

        unauthorizedHandledRef.current = false;

        hasLoadedRef.current = true;

      } catch (caught) {

        if (caught instanceof MobileMarketStateV2Error && caught.code === "ABORTED") {

          logV2Race({

            event: "runFetch.caughtAborted",

            fetchId,

            activeFetchId: fetchGenerationRef.current,

            isStale: fetchId !== fetchGenerationRef.current,

            reason: caught.message,

          });

          return;

        }



        const mapped =

          caught instanceof MobileMarketStateV2Error

            ? caught

            : new MobileMarketStateV2Error(

                "NETWORK_ERROR",

                caught instanceof Error ? caught.message : "Unknown error",

                { cause: caught },

              );



        setError(mapped);

        setDiagnostics((prev) => ({

          ...prev,

          httpStatus: mapped.status,

          latencyMs: Date.now() - startedAt,

          errorCode: mapped.code,

          requestId: mapped.requestId ?? prev.requestId,

        }));



        if (mapped.code === "VALIDATION_ERROR") {

          emitV2State(fetchId, "validation_error_kept_previous_snapshot");

          return;

        }



        if (isAuthRequiredError(mapped.code)) {

          stopPollingAfterFetch = true;

          pollingStoppedRef.current = true;

          if (!unauthorizedHandledRef.current) {

            unauthorizedHandledRef.current = true;

            const sessionValid = await refreshSession();

            if (sessionValid) {

              try {

                const retry = await fetchMobileMarketStateV2({

                  asset: asset as "BTC",

                  mode: MOBILE_STATE_V2_DEFAULT_MODE,

                  signal: controller.signal,

                  fetchId,

                });

                if (!controller.signal.aborted && fetchId === fetchGenerationRef.current) {

                  const committed = commitValidSnapshot(retry, fetchId);

                  if (committed) {

                    setError(null);

                    pollingStoppedRef.current = false;

                    unauthorizedHandledRef.current = false;

                    hasLoadedRef.current = true;

                  }

                  return;

                }

              } catch {

                // Session was valid but market-state still failed.

              }

            }

          }

        }



        if (isSubscriptionRequiredError(mapped.code)) {

          stopPollingAfterFetch = true;

          pollingStoppedRef.current = true;

        }



        if (mapped.code === MOBILE_V2_ERROR_CODES.MOBILE_RATE_LIMITED && mapped.retryAfterMs != null) {

          retryAfterUntilRef.current = Date.now() + mapped.retryAfterMs;

        }



        if (mapped.code === MOBILE_V2_ERROR_CODES.MARKET_STATE_UNAVAILABLE) {

          const backoff =

            SERVER_ERROR_BACKOFF_MS[

              Math.min(serverErrorStreakRef.current, SERVER_ERROR_BACKOFF_MS.length - 1)

            ];

          serverErrorStreakRef.current += 1;

          retryAfterUntilRef.current = Date.now() + backoff;

        }



        emitV2State(fetchId, `fetch_error:${mapped.code}`);

      } finally {

        const isStale = fetchId !== fetchGenerationRef.current;



        logV2Race({

          event: "runFetch.finally",

          fetchId,

          activeFetchId: fetchGenerationRef.current,

          isStale,

          reason: isStale ? "stale finally from superseded fetch" : "current fetch finally",

        });



        clearV2PipelineFetchId(fetchId);



        if (abortRef.current === controller) {

          abortRef.current = null;

          controllerFetchIdRef.current = null;

        }



        if (!isStale) {

          setIsLoading(false);

          setIsRefreshing(false);

        }



        if (

          !isStale &&

          pollingAllowed &&

          isForegroundRef.current &&

          !pollingStoppedRef.current &&

          !stopPollingAfterFetch

        ) {

          const waitMs = computeNextPollDelayMs(Date.now(), retryAfterUntilRef.current);

          scheduleNextPoll(waitMs);

        }

      }

    },

    [

      asset,

      cancelInFlight,

      commitValidSnapshot,

      emitV2State,

      pollingAllowed,

      refreshSession,

      scheduleNextPoll,

      sessionStatus,

    ],

  );



  runFetchRef.current = runFetch;



  const refresh = useCallback(async () => {

    if (!pollingAllowed) return;

    pollingStoppedRef.current = false;

    await runFetch({ manual: true });

  }, [pollingAllowed, runFetch]);



  useEffect(() => {

    if (!pollingAllowed) {

      clearPollTimer();

      cancelInFlight("pollingAllowed=false effect cleanup");

      setIsLoading(authLoading && featureEnabled);

      setIsRefreshing(false);

      if (sessionStatus === "unauthenticated") {

        setError(null);

      }

      emitV2State(lastCommittedFetchIdRef.current, "polling_disabled");

      return;

    }



    pollingStoppedRef.current = false;

    unauthorizedHandledRef.current = false;

    void runFetchRef.current({ manual: true });



    const onAppStateChange = (nextState: AppStateStatus) => {

      const wasForeground = isForegroundRef.current;

      const isForeground = nextState === "active";

      isForegroundRef.current = isForeground;



      if (shouldRefreshOnForeground(wasForeground, isForeground)) {

        if (!pollingStoppedRef.current) {

          void runFetchRef.current({ manual: true });

        }

        return;

      }



      if (wasForeground && !isForeground) {

        clearPollTimer();

        cancelInFlight("app backgrounded");

      }

    };



    const subscription = AppState.addEventListener("change", onAppStateChange);



    return () => {

      subscription.remove();

      clearPollTimer();

      cancelInFlight("hook effect unmount");

    };

  }, [

    authLoading,

    cancelInFlight,

    clearPollTimer,

    emitV2State,

    featureEnabled,

    pollingAllowed,

    sessionStatus,

  ]);



  const micro = data?.data.micro ?? null;

  const macro = data?.data.macro ?? null;

  const relationship = data?.data.relationship ?? null;

  const alerts = data?.data.alerts ?? [];

  const metadata = data?.data.metadata ?? null;

  const activeContext = selectedMode === "micro" ? micro : macro;

  const spot = data?.data.asset.spot ?? null;



  useEffect(() => {

    const signature = [

      hasSnapshot,

      Boolean(data),

      Boolean(micro),

      Boolean(macro),

      data?.meta.snapshotId ?? null,

      data?.meta.requestId ?? null,

      error?.code ?? null,

      pollingAllowed,

      lastCommittedFetchIdRef.current,

    ].join("|");

    if (signature === v2StateSignatureRef.current) return;

    v2StateSignatureRef.current = signature;

    emitV2State(lastCommittedFetchIdRef.current, "hook_state_change");

  }, [data, emitV2State, error, hasSnapshot, macro, micro, pollingAllowed]);



  const accessDenied = error != null && isSubscriptionRequiredError(error.code);

  const unauthorized = error != null && isAuthRequiredError(error.code);



  return useMemo(

    () => ({

      data,

      micro,

      macro,

      relationship,

      alerts,

      metadata,

      spot,

      activeContext,

      selectedMode,

      setSelectedMode,

      isLoading: authLoading ? false : isLoading && !hasSnapshot,

      isRefreshing,

      hasSnapshot,

      error,

      refresh,

      diagnostics,

      sessionStatus,

      authLoading,

      requiresAuth,

      unauthorized,

      accessDenied,

      subscriptionRequired: accessDenied,

    }),

    [

      data,

      micro,

      macro,

      relationship,

      alerts,

      metadata,

      spot,

      activeContext,

      selectedMode,

      authLoading,

      hasSnapshot,

      isLoading,

      isRefreshing,

      error,

      refresh,

      diagnostics,

      sessionStatus,

      requiresAuth,

      unauthorized,

      accessDenied,

    ],

  );

}


