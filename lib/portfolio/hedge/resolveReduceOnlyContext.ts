import type { PerpAccountPositionMode } from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import { inferPositionSideFromExecution } from "@/lib/portfolio/hedge/resolvePositionSide";
import type { Position, TradeSide } from "@/lib/portfolio/types";

export type ReduceOnlyQuantityMode = "SIGNED_NET" | "LEG_ABSOLUTE";

export function reduceOnlyQuantityMode(
  accountPositionMode: PerpAccountPositionMode,
): ReduceOnlyQuantityMode {
  return accountPositionMode === "HEDGE" ? "LEG_ABSOLUTE" : "SIGNED_NET";
}

/** Position quantity for reduce-only validation (signed net or absolute leg). */
export function resolveReduceOnlyPositionQuantity(
  positions: Position[],
  accountPositionMode: PerpAccountPositionMode,
  symbol: string,
  side: TradeSide,
): number {
  if (accountPositionMode === "HEDGE") {
    const leg = inferPositionSideFromExecution({ side, reduceOnly: true });
    const pos = positions.find((p) => p.symbol === symbol && p.side === leg);
    return pos?.quantity ?? 0;
  }
  const pos = positions.find((p) => p.symbol === symbol);
  return pos?.quantity ?? 0;
}

/** Resolves the hedge leg affected by an open or close execution. */
export function resolveTargetLegFromExecution(input: {
  direction: "LONG" | "SHORT";
  reduceOnly?: boolean;
}): "LONG" | "SHORT" {
  if (input.reduceOnly) {
    return input.direction === "LONG" ? "LONG" : "SHORT";
  }
  return input.direction;
}
