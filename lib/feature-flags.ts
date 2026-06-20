/**
 * Local feature flags for gradual rollout.
 * Phase B: enable v2 only in development unless explicitly overridden.
 */
const isDevRuntime =
  typeof (globalThis as { __DEV__?: boolean }).__DEV__ === "boolean"
    ? (globalThis as { __DEV__?: boolean }).__DEV__
    : process.env.NODE_ENV !== "production";

export const MOBILE_STATE_V2_ENABLED =
  process.env.EXPO_PUBLIC_MOBILE_STATE_V2_ENABLED === "true" ||
  (isDevRuntime && process.env.EXPO_PUBLIC_MOBILE_STATE_V2_ENABLED !== "false");

export const MOBILE_STATE_V2_POLL_INTERVAL_MS = 4_500;

export const MOBILE_STATE_V2_DEFAULT_ASSET = "BTC";

export const MOBILE_STATE_V2_DEFAULT_MODE = "both" as const;
