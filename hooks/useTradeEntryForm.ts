import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MarginMode } from "@/components/portfolio/TradeLeverageSelector";
import type { TradeOrderType } from "@/components/portfolio/TradeOrderTypeSelector";
import type { SpotTradeSide } from "@/components/portfolio/TradeSpotSideSelector";
import { useMarketPriceRef } from "@/hooks/useMarketTick";
import { parsePositiveNumber } from "@/lib/portfolio/accounts/format";
import type { TradingMode } from "@/lib/cartera/storage/tradingModePreference";
import type { PortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  buildPerpPositionPreview,
  perpPreviewToTradeEntrySummary,
  type PerpPositionPreview,
} from "@/lib/portfolio/futures/PerpPositionPreview";
import {
  maxPerpExecutableMargin,
} from "@/lib/portfolio/sizing/PositionSizing";
import {
  computeSpotEntrySummary,
  formatMarginInput,
  formatQuantityDisplay,
  marginFromPercent,
  percentFromMargin,
  quantityFromMargin,
  type TradeEntrySummary,
} from "@/lib/portfolio/trade/tradeEntryCalculations";
import {
  buildTradeExecutionRequest,
  type TradeDirection,
  type TradeExecutionRequest,
} from "@/lib/portfolio/trade/TradeExecutionRequest";
import {
  validateTradeEntry,
  type TradeEntryFieldErrors,
} from "@/lib/portfolio/trade/tradeEntryValidation";
import type { Trade } from "@/lib/portfolio/types";

type UseTradeEntryFormArgs = {
  visible: boolean;
  accountSnapshot: PortfolioAccountSnapshot | null;
  existingPerpTrades?: Trade[];
  initialLeverage: number;
  walletId: string | null;
  canTrade: boolean;
  tradingMode: TradingMode;
  /** Session service write path — never call PortfolioEngine from UI. */
  executeTrade: (request: TradeExecutionRequest) => Promise<void>;
  onSuccess: () => void;
};

export function useTradeEntryForm({
  visible,
  accountSnapshot,
  existingPerpTrades = [],
  initialLeverage,
  walletId,
  canTrade,
  tradingMode,
  executeTrade,
  onSuccess,
}: UseTradeEntryFormArgs) {
  const [previewDirection, setPreviewDirection] = useState<TradeDirection>("LONG");
  const [orderType, setOrderType] = useState<TradeOrderType>("MARKET");
  const [marginMode, setMarginMode] = useState<MarginMode>("CROSS");
  const [leverage, setLeverage] = useState(initialLeverage);
  const [margin, setMargin] = useState("");
  const [balancePercent, setBalancePercent] = useState(0);
  const [limitPrice, setLimitPrice] = useState("");
  const [tpSlEnabled, setTpSlEnabled] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [reduceOnlyEnabled, setReduceOnlyEnabled] = useState(false);
  const [postOnlyEnabled, setPostOnlyEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /** Live mark via tick store ref — no parent re-renders on tick. */
  const marketPriceRef = useMarketPriceRef(PORTFOLIO_V1_SYMBOL);
  /** Tracks open transition only — price ticks must not reset form. */
  const wasVisibleRef = useRef(false);
  /** Mark at open — used for field quantity display so ticks don't rebuild inputs. */
  const openMarkPriceRef = useRef(marketPriceRef.current ?? 0);

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      return;
    }

    // Reset only when the modal opens (false → true), never on price updates.
    if (wasVisibleRef.current) return;
    wasVisibleRef.current = true;

    const openPrice = marketPriceRef.current ?? 0;
    openMarkPriceRef.current = openPrice;
    const isSpot = tradingMode === "SPOT";

    setPreviewDirection("LONG");
    setOrderType("MARKET");
    setMarginMode("CROSS");
    setLeverage(
      isSpot ? 1 : initialLeverage > 0 ? Math.min(initialLeverage, 125) : 1,
    );
    setMargin("");
    setBalancePercent(0);
    setLimitPrice(openPrice > 0 ? String(openPrice) : "");
    setTpSlEnabled(false);
    setTakeProfitPrice("");
    setStopLossPrice("");
    setReduceOnlyEnabled(false);
    setPostOnlyEnabled(false);
    setSubmitError(null);
  }, [visible, initialLeverage, tradingMode]);

  const effectiveLeverage = tradingMode === "SPOT" ? 1 : leverage;
  const effectiveMarginMode: MarginMode =
    tradingMode === "SPOT" ? "CROSS" : marginMode;

  const marginValue = parsePositiveNumber(margin);
  const liveMark = marketPriceRef.current ?? 0;
  /** Live entry for summary / validation / execute. */
  const entryPrice =
    orderType === "MARKET"
      ? liveMark > 0
        ? liveMark
        : null
      : parsePositiveNumber(limitPrice);

  /** Stable display qty for form fields (MARKET uses open mark, not live ticks). */
  const fieldDisplayPrice =
    orderType === "MARKET"
      ? openMarkPriceRef.current > 0
        ? openMarkPriceRef.current
        : null
      : parsePositiveNumber(limitPrice);

  const isSpotSell = tradingMode === "SPOT" && previewDirection === "SHORT";
  const spotSide: SpotTradeSide = previewDirection === "LONG" ? "OPEN" : "CLOSE";

  const cashBalance = useMemo(() => {
    if (!accountSnapshot) return null;
    if (isSpotSell) return null;
    return tradingMode === "SPOT"
      ? accountSnapshot.sizing.spotUsdtAvailable
      : accountSnapshot.sizing.perpAvailable;
  }, [accountSnapshot, isSpotSell, tradingMode]);

  const inventoryBalance = useMemo(() => {
    if (!isSpotSell || !accountSnapshot) return null;
    const qty = accountSnapshot.sizing.spotPositionQuantity(PORTFOLIO_V1_SYMBOL);
    return qty > 0 ? qty : null;
  }, [accountSnapshot, isSpotSell]);

  const spotSellMaxQuantity = useMemo(() => {
    if (!isSpotSell || !accountSnapshot) return null;
    return accountSnapshot.sizing.maxSpotSellQuantity(PORTFOLIO_V1_SYMBOL);
  }, [accountSnapshot, isSpotSell]);

  const sizingBalance = useMemo(() => {
    if (!isSpotSell) return cashBalance;
    const maxQty = spotSellMaxQuantity;
    if (
      maxQty == null ||
      maxQty <= 0 ||
      fieldDisplayPrice == null ||
      fieldDisplayPrice <= 0
    ) {
      return null;
    }
    return maxQty * fieldDisplayPrice;
  }, [cashBalance, fieldDisplayPrice, isSpotSell, spotSellMaxQuantity]);

  const derivedQuantity = useMemo(() => {
    if (marginValue == null || fieldDisplayPrice == null) return null;
    return quantityFromMargin({
      margin: marginValue,
      leverage: effectiveLeverage,
      price: fieldDisplayPrice,
    });
  }, [fieldDisplayPrice, effectiveLeverage, marginValue]);

  const perpPreview: PerpPositionPreview | null = useMemo(() => {
    if (tradingMode !== "PERP") return null;
    return buildPerpPositionPreview({
      direction: previewDirection,
      margin: marginValue,
      entryPrice,
      markPrice: liveMark > 0 ? liveMark : 0,
      leverage: effectiveLeverage,
      marginMode: effectiveMarginMode,
      accountSnapshot,
      existingTrades: existingPerpTrades,
      orderType,
      postOnlyEnabled,
    });
  }, [
    accountSnapshot,
    effectiveLeverage,
    effectiveMarginMode,
    entryPrice,
    existingPerpTrades,
    liveMark,
    marginValue,
    orderType,
    postOnlyEnabled,
    previewDirection,
    tradingMode,
  ]);

  const summary: TradeEntrySummary = useMemo(() => {
    if (tradingMode === "PERP") {
      return perpPreviewToTradeEntrySummary(perpPreview);
    }
    return computeSpotEntrySummary({
      margin: marginValue,
      entryPrice,
      cashBalance,
      derivedQuantity,
    });
  }, [
    cashBalance,
    derivedQuantity,
    entryPrice,
    marginValue,
    perpPreview,
    tradingMode,
  ]);

  const validation = useMemo(
    () =>
      validateTradeEntry({
        margin: marginValue,
        entryPrice,
        orderType,
        leverage: effectiveLeverage,
        marketPrice: liveMark > 0 ? liveMark : 0,
        cashBalance,
        tradingMode,
        inventoryBalance,
        derivedQuantity,
      }),
    [
      marginValue,
      entryPrice,
      orderType,
      effectiveLeverage,
      cashBalance,
      tradingMode,
      inventoryBalance,
      derivedQuantity,
    ],
  );

  const fieldErrors: TradeEntryFieldErrors = validation.errors;

  const applyBalancePercent = useCallback(
    (percent: number) => {
      const clamped = Math.min(100, Math.max(0, percent));
      setBalancePercent(clamped);
      const reference = isSpotSell ? sizingBalance : cashBalance;
      if (reference == null || reference < 0) {
        setMargin("");
        return;
      }
      const nextMargin = marginFromPercent(clamped, reference);
      setMargin(nextMargin != null ? formatMarginInput(nextMargin) : "");
    },
    [cashBalance, isSpotSell, sizingBalance],
  );

  const handleMarginChange = useCallback(
    (value: string) => {
      setMargin(value);
      const parsed = parsePositiveNumber(value);
      const reference = isSpotSell ? sizingBalance : cashBalance;
      if (parsed == null || reference == null || reference <= 0) {
        setBalancePercent(0);
        return;
      }
      setBalancePercent(percentFromMargin(parsed, reference));
    },
    [cashBalance, isSpotSell, sizingBalance],
  );

  const applyMax = useCallback(() => {
    if (isSpotSell) {
      const maxQty = spotSellMaxQuantity;
      if (
        maxQty == null ||
        maxQty <= 0 ||
        fieldDisplayPrice == null ||
        fieldDisplayPrice <= 0
      ) {
        setMargin("");
        setBalancePercent(0);
        return;
      }
      const maxNotional = maxQty * fieldDisplayPrice;
      setMargin(formatMarginInput(maxNotional));
      setBalancePercent(100);
      return;
    }

    const price = fieldDisplayPrice ?? marketPriceRef.current ?? 0;
    const maxMargin = accountSnapshot
      ? accountSnapshot.sizing.maxPerpMargin(price, effectiveLeverage)
      : maxPerpExecutableMargin({
          availableBalance: 0,
          price,
          leverage: effectiveLeverage,
          symbol: PORTFOLIO_V1_SYMBOL,
        });
    if (maxMargin <= 0) {
      setMargin("");
      setBalancePercent(0);
      return;
    }
    setMargin(formatMarginInput(maxMargin));
    setBalancePercent(
      cashBalance != null && cashBalance > 0
        ? percentFromMargin(maxMargin, cashBalance)
        : 100,
    );
  }, [
    accountSnapshot,
    cashBalance,
    effectiveLeverage,
    fieldDisplayPrice,
    isSpotSell,
    spotSellMaxQuantity,
  ]);

  const setSpotSide = useCallback((side: SpotTradeSide) => {
    setPreviewDirection(side === "OPEN" ? "LONG" : "SHORT");
    setMargin("");
    setBalancePercent(0);
    setSubmitError(null);
  }, []);

  const handleLeverageChange = useCallback((nextLeverage: number) => {
    setLeverage(nextLeverage);
  }, []);

  const execute = useCallback(
    async (direction: TradeDirection) => {
      setPreviewDirection(direction);
      setSubmitError(null);

      const livePrice = marketPriceRef.current;
      if (livePrice == null || livePrice <= 0) {
        setSubmitError("Precio de mercado no disponible");
        return;
      }
      const activeMargin = parsePositiveNumber(margin);
      const activePrice =
        orderType === "MARKET"
          ? livePrice > 0
            ? livePrice
            : null
          : parsePositiveNumber(limitPrice);

      const lev = tradingMode === "SPOT" ? 1 : leverage;
      const mode: MarginMode = tradingMode === "SPOT" ? "CROSS" : marginMode;

      const activeQty =
        activeMargin != null && activePrice != null
          ? quantityFromMargin({
              margin: activeMargin,
              leverage: lev,
              price: activePrice,
            })
          : null;

      const check = validateTradeEntry({
        margin: activeMargin,
        entryPrice: activePrice,
        orderType,
        leverage: lev,
        marketPrice: livePrice,
        cashBalance,
        tradingMode,
        inventoryBalance,
        derivedQuantity: activeQty,
      });

      const sideAllowed =
        direction === "LONG" ? check.canExecuteLong : check.canExecuteShort;

      if (!sideAllowed || activeQty == null || activePrice == null || activeMargin == null) {
        setSubmitError(
          check.errors.margin ??
            check.errors.price ??
            check.errors.leverage ??
            check.errors.marketPrice ??
            "Revisa los campos del formulario",
        );
        return;
      }

      if (!canTrade) {
        setSubmitError("Motor de trading no disponible");
        return;
      }

      const tpPrice = parsePositiveNumber(takeProfitPrice);
      const slPrice = parsePositiveNumber(stopLossPrice);

      if (tpSlEnabled && tpPrice == null && slPrice == null) {
        setSubmitError("Indica Take Profit y/o Stop Loss");
        return;
      }

      const request = buildTradeExecutionRequest({
        domain: tradingMode,
        walletId,
        direction,
        orderType,
        marginMode: mode,
        leverage: lev,
        quantity: activeQty,
        margin: activeMargin,
        price: activePrice,
        marketPrice: livePrice > 0 ? livePrice : activePrice,
        tpSlEnabled,
        reduceOnlyEnabled,
        postOnlyEnabled: orderType === "LIMIT" ? postOnlyEnabled : false,
        takeProfitPrice: tpSlEnabled ? tpPrice : null,
        stopLossPrice: tpSlEnabled ? slPrice : null,
      });

      setSubmitting(true);
      try {
        await executeTrade(request);
        onSuccess();
      } catch (err: unknown) {
        setSubmitError(err instanceof Error ? err.message : "No se pudo ejecutar la operación");
      } finally {
        setSubmitting(false);
      }
    },
    [
      canTrade,
      cashBalance,
      executeTrade,
      leverage,
      limitPrice,
      margin,
      marginMode,
      onSuccess,
      orderType,
      postOnlyEnabled,
      reduceOnlyEnabled,
      stopLossPrice,
      takeProfitPrice,
      tpSlEnabled,
      tradingMode,
      walletId,
      inventoryBalance,
    ],
  );

  const canExecuteCurrentSide =
    (previewDirection === "LONG" ? validation.canExecuteLong : validation.canExecuteShort) &&
    canTrade;

  return {
    orderType,
    setOrderType,
    spotSide,
    setSpotSide,
    marginMode: effectiveMarginMode,
    setMarginMode,
    leverage: effectiveLeverage,
    setLeverage: handleLeverageChange,
    margin,
    handleMarginChange,
    balancePercent,
    applyBalancePercent,
    applyMax,
    quantityDisplay: formatQuantityDisplay(derivedQuantity),
    limitPrice,
    setLimitPrice,
    tpSlEnabled,
    setTpSlEnabled,
    takeProfitPrice,
    setTakeProfitPrice,
    stopLossPrice,
    setStopLossPrice,
    reduceOnlyEnabled,
    setReduceOnlyEnabled,
    postOnlyEnabled,
    setPostOnlyEnabled,
    summary,
    perpPreview,
    fieldErrors,
    canExecuteLong: validation.canExecuteLong && canTrade,
    canExecuteShort: validation.canExecuteShort && canTrade,
    canExecuteCurrentSide,
    submitting,
    submitError,
    execute,
    executeCurrentSide: () => execute(previewDirection),
  };
}
