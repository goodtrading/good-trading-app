/**
 * @deprecated Import from `@/lib/portfolio/sizing/PositionSizing` instead.
 */
export {
  maxOrderMarginFromAvailable,
  maxPerpExecutableMargin,
  roundMoneyDown,
} from "@/lib/portfolio/sizing/PositionSizing";

import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { maxPerpExecutableMargin } from "@/lib/portfolio/sizing/PositionSizing";

/** @deprecated Use maxPerpExecutableMargin with symbol. */
export function maxExecutableMarginFromAvailable(args: {
  availableBalance: number;
  price: number;
  leverage: number;
}): number {
  return maxPerpExecutableMargin({
    ...args,
    symbol: PORTFOLIO_V1_SYMBOL,
  });
}
