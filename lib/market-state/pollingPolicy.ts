import { MOBILE_STATE_V2_POLL_INTERVAL_MS } from "@/lib/feature-flags";

export function shouldPollMarketState(isForeground: boolean, enabled: boolean): boolean {
  return enabled && isForeground;
}

export function computeNextPollDelayMs(
  now: number,
  retryAfterUntil: number,
  baseIntervalMs = MOBILE_STATE_V2_POLL_INTERVAL_MS,
): number {
  return Math.max(baseIntervalMs, Math.max(0, retryAfterUntil - now));
}

export function shouldRefreshOnForeground(wasForeground: boolean, isForeground: boolean): boolean {
  return !wasForeground && isForeground;
}
