/** How to handle reduce-only orders that exceed the open position size. */
export type ReduceOnlyPolicyMode = "REJECT" | "CLAMP";

export type ReduceOnlyPolicy = {
  mode: ReduceOnlyPolicyMode;
};

/** Binance-style default: clamp to max reducible quantity, never flip direction. */
export const DEFAULT_REDUCE_ONLY_POLICY: ReduceOnlyPolicy = {
  mode: "CLAMP",
};
