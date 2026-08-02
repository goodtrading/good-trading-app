import React, { memo, useCallback, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CenteredDialogModal } from "@/components/CenteredDialogModal";
import { LiveMarkPriceHeader } from "@/components/portfolio/LiveMarkPriceHeader";
import { TradeActionButtons } from "@/components/portfolio/TradeActionButtons";
import { TradeSpotSideSelector } from "@/components/portfolio/TradeSpotSideSelector";
import { TradeSpotSubmitButton } from "@/components/portfolio/TradeSpotSubmitButton";
import {
  TradeLeverageSelector,
  type MarginMode,
} from "@/components/portfolio/TradeLeverageSelector";
import { TradeMarginInput } from "@/components/portfolio/TradeMarginInput";
import {
  TradeOrderTypeSelector,
  type TradeOrderType,
} from "@/components/portfolio/TradeOrderTypeSelector";
import { TradePriceInput } from "@/components/portfolio/TradePriceInput";
import { TradeRiskOptions } from "@/components/portfolio/TradeRiskOptions";
import { TradeSummaryCard } from "@/components/portfolio/TradeSummaryCard";
import { useColors } from "@/hooks/useColors";
import { getMarketPrice } from "@/hooks/useMarketTick";
import { useTradeEntryForm } from "@/hooks/useTradeEntryForm";
import { useTradingMode } from "@/lib/cartera/context/TradingModeContext";
import type { PortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { formatMoney, formatQuantity } from "@/lib/portfolio/accounts/format";
import type { PerpPositionPreview } from "@/lib/portfolio/futures/PerpPositionPreview";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import type { TradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";
import type { Trade } from "@/lib/portfolio/types";

type TradeEntryModalProps = {
  visible: boolean;
  onClose: () => void;
  leverage?: number;
  accountSnapshot: PortfolioAccountSnapshot | null;
  existingPerpTrades?: Trade[];
  walletId: string | null;
  canTrade: boolean;
  executeTrade: (request: TradeExecutionRequest) => Promise<void>;
  onExecuted?: () => void;
};

type TradeEntryFieldsProps = {
  mode: "SPOT" | "PERP";
  allowsLeverage: boolean;
  allowsMarginMode: boolean;
  marginMode: MarginMode;
  leverage: number;
  onMarginModeChange: (mode: MarginMode) => void;
  onLeverageChange: (leverage: number) => void;
  orderType: TradeOrderType;
  onOrderTypeChange: (type: TradeOrderType) => void;
  limitPrice: string;
  onLimitPriceChange: (value: string) => void;
  /** Stable nudge base for LIMIT — not live mark ticks. */
  limitNudgePrice: number;
  margin: string;
  onMarginChange: (value: string) => void;
  balancePercent: number;
  onBalancePercentChange: (percent: number) => void;
  availableBalanceLabel: string;
  quantityDisplay: string;
  errorLeverage?: string;
  errorPrice?: string;
  errorMargin?: string;
  tpSlEnabled: boolean;
  reduceOnlyEnabled: boolean;
  postOnlyEnabled: boolean;
  takeProfitPrice: string;
  stopLossPrice: string;
  onTpSlChange: (enabled: boolean) => void;
  onReduceOnlyChange: (enabled: boolean) => void;
  onPostOnlyChange: (enabled: boolean) => void;
  onTakeProfitPriceChange: (value: string) => void;
  onStopLossPriceChange: (value: string) => void;
  spotSide?: "OPEN" | "CLOSE";
  onSpotSideChange?: (side: "OPEN" | "CLOSE") => void;
  onMaxPress?: () => void;
};

/**
 * Form controls isolated from live mark ticks — only re-renders when field state changes.
 */
const TradeEntryFields = memo(function TradeEntryFields({
  mode,
  allowsLeverage,
  allowsMarginMode,
  marginMode,
  leverage,
  onMarginModeChange,
  onLeverageChange,
  orderType,
  onOrderTypeChange,
  limitPrice,
  onLimitPriceChange,
  limitNudgePrice,
  margin,
  onMarginChange,
  balancePercent,
  onBalancePercentChange,
  availableBalanceLabel,
  quantityDisplay,
  errorLeverage,
  errorPrice,
  errorMargin,
  tpSlEnabled,
  reduceOnlyEnabled,
  postOnlyEnabled,
  takeProfitPrice,
  stopLossPrice,
  onTpSlChange,
  onReduceOnlyChange,
  onPostOnlyChange,
  onTakeProfitPriceChange,
  onStopLossPriceChange,
  spotSide,
  onSpotSideChange,
  onMaxPress,
}: TradeEntryFieldsProps) {
  const colors = useColors();

  return (
    <View style={styles.fields}>
      {mode === "SPOT" && spotSide != null && onSpotSideChange ? (
        <TradeSpotSideSelector value={spotSide} onChange={onSpotSideChange} />
      ) : null}

      {allowsLeverage || allowsMarginMode ? (
        <>
          <TradeLeverageSelector
            marginMode={marginMode}
            leverage={leverage}
            onMarginModeChange={onMarginModeChange}
            onLeverageChange={onLeverageChange}
          />
          {errorLeverage ? (
            <Text style={[styles.fieldError, { color: colors.primary }]}>{errorLeverage}</Text>
          ) : null}
        </>
      ) : null}

      <TradeOrderTypeSelector value={orderType} onChange={onOrderTypeChange} />

      <TradePriceInput
        orderType={orderType}
        marketPrice={limitNudgePrice}
        limitPrice={limitPrice}
        onLimitPriceChange={onLimitPriceChange}
        error={errorPrice}
      />

      <TradeMarginInput
        margin={margin}
        onMarginChange={onMarginChange}
        balancePercent={balancePercent}
        onBalancePercentChange={onBalancePercentChange}
        availableBalanceLabel={availableBalanceLabel}
        quantityDisplay={quantityDisplay}
        error={errorMargin}
        onMaxPress={onMaxPress}
      />

      {mode === "PERP" ? (
        <TradeRiskOptions
          tpSlEnabled={tpSlEnabled}
          reduceOnlyEnabled={reduceOnlyEnabled}
          postOnlyEnabled={postOnlyEnabled}
          takeProfitPrice={takeProfitPrice}
          stopLossPrice={stopLossPrice}
          onTpSlChange={onTpSlChange}
          onReduceOnlyChange={onReduceOnlyChange}
          onPostOnlyChange={onPostOnlyChange}
          onTakeProfitPriceChange={onTakeProfitPriceChange}
          onStopLossPriceChange={onStopLossPriceChange}
          showReduceOnly
          showPostOnly={orderType === "LIMIT"}
        />
      ) : null}
    </View>
  );
});

const LiveTradeSummary = memo(function LiveTradeSummary({
  perpPreview,
  summary,
  showLiquidation,
  plain,
}: {
  perpPreview: PerpPositionPreview | null;
  summary: import("@/lib/portfolio/trade/tradeEntryCalculations").TradeEntrySummary;
  showLiquidation: boolean;
  plain?: boolean;
}) {
  return (
    <TradeSummaryCard
      summary={summary}
      perpPreview={perpPreview}
      showLiquidation={showLiquidation}
      plain={plain}
    />
  );
});

const TradeEntryFooter = memo(function TradeEntryFooter({
  submitError,
  canTrade,
  submitting,
  canExecuteLong,
  canExecuteShort,
  onLongPress,
  onShortPress,
}: {
  submitError: string | null;
  canTrade: boolean;
  submitting: boolean;
  canExecuteLong: boolean;
  canExecuteShort: boolean;
  onLongPress: () => void;
  onShortPress: () => void;
}) {
  const colors = useColors();

  return (
    <View style={styles.footer}>
      {submitError ? (
        <Text style={[styles.fieldError, { color: colors.primary }]}>{submitError}</Text>
      ) : null}

      {!canTrade ? (
        <Text style={[styles.fieldError, { color: colors.primary }]}>
          Motor de trading no disponible
        </Text>
      ) : null}

      <TradeActionButtons
        submitting={submitting}
        disabledLong={!canExecuteLong}
        disabledShort={!canExecuteShort}
        onLongPress={onLongPress}
        onShortPress={onShortPress}
      />
    </View>
  );
});

/**
 * Trade entry modal — form fields are isolated from live price ticks.
 * Only LiveMarkPriceHeader + summary update on mark changes.
 */
export function TradeEntryModal({
  visible,
  onClose,
  leverage: leverageProp = 1,
  accountSnapshot,
  existingPerpTrades = [],
  walletId,
  canTrade,
  executeTrade,
  onExecuted,
}: TradeEntryModalProps) {
  const colors = useColors();
  const { mode, rules } = useTradingMode();
  const isSpot = mode === "SPOT";
  const spotPositionQty = accountSnapshot?.sizing.spotPositionQuantity(PORTFOLIO_V1_SYMBOL) ?? 0;
  const spotUsdtAvailable = accountSnapshot?.sizing.spotUsdtAvailable ?? null;
  const perpAvailable = accountSnapshot?.sizing.perpAvailable ?? null;

  /** Nudge base for LIMIT — captured at open from tick store, not parent props. */
  const limitNudgePriceRef = useRef(getMarketPrice(PORTFOLIO_V1_SYMBOL) ?? 0);
  const wasVisibleRef = useRef(false);
  if (visible && !wasVisibleRef.current) {
    limitNudgePriceRef.current = getMarketPrice(PORTFOLIO_V1_SYMBOL) ?? 0;
  }
  wasVisibleRef.current = visible;

  const handleSuccess = useCallback(() => {
    onExecuted?.();
    onClose();
  }, [onClose, onExecuted]);

  const form = useTradeEntryForm({
    visible,
    accountSnapshot,
    existingPerpTrades,
    initialLeverage: rules.allowsLeverage ? leverageProp : 1,
    walletId,
    canTrade,
    tradingMode: mode,
    executeTrade,
    onSuccess: handleSuccess,
  });

  const availableBalanceLabel = isSpot
    ? form.spotSide === "CLOSE"
      ? spotPositionQty > 0
        ? `Disponible: ${formatQuantity(spotPositionQty, 6)} BTC`
        : "Disponible: —"
      : spotUsdtAvailable != null
        ? `Balance disponible: ${formatMoney(spotUsdtAvailable)} USDT`
        : "Balance disponible: —"
    : perpAvailable != null
      ? `Balance disponible: ${formatMoney(perpAvailable)} USDT`
      : "Balance disponible: —";

  const priceError = form.fieldErrors.price ?? form.fieldErrors.marketPrice;

  return (
    <CenteredDialogModal
      visible={visible}
      onClose={onClose}
      headerContent={<LiveMarkPriceHeader symbol={PORTFOLIO_V1_SYMBOL} />}
      scrollEnabled={!isSpot}
      contentStyle={styles.content}
    >
      <View style={styles.body}>
        <TradeEntryFields
          mode={mode}
          allowsLeverage={rules.allowsLeverage}
          allowsMarginMode={rules.allowsMarginMode}
          marginMode={form.marginMode}
          leverage={form.leverage}
          onMarginModeChange={form.setMarginMode}
          onLeverageChange={form.setLeverage}
          orderType={form.orderType}
          onOrderTypeChange={form.setOrderType}
          limitPrice={form.limitPrice}
          onLimitPriceChange={form.setLimitPrice}
          limitNudgePrice={limitNudgePriceRef.current}
          margin={form.margin}
          onMarginChange={form.handleMarginChange}
          balancePercent={form.balancePercent}
          onBalancePercentChange={form.applyBalancePercent}
          availableBalanceLabel={availableBalanceLabel}
          quantityDisplay={form.quantityDisplay}
          errorLeverage={form.fieldErrors.leverage}
          errorPrice={priceError}
          errorMargin={form.fieldErrors.margin}
          tpSlEnabled={form.tpSlEnabled}
          reduceOnlyEnabled={form.reduceOnlyEnabled}
          postOnlyEnabled={form.postOnlyEnabled}
          takeProfitPrice={form.takeProfitPrice}
          stopLossPrice={form.stopLossPrice}
          onTpSlChange={form.setTpSlEnabled}
          onReduceOnlyChange={form.setReduceOnlyEnabled}
          onPostOnlyChange={form.setPostOnlyEnabled}
          onTakeProfitPriceChange={form.setTakeProfitPrice}
          onStopLossPriceChange={form.setStopLossPrice}
          spotSide={isSpot ? form.spotSide : undefined}
          onSpotSideChange={isSpot ? form.setSpotSide : undefined}
          onMaxPress={form.applyMax}
        />

        <LiveTradeSummary
          perpPreview={form.perpPreview}
          summary={form.summary}
          showLiquidation={rules.allowsLiquidationUi}
          plain={isSpot}
        />

        {isSpot ? (
          <View style={styles.footer}>
            {form.submitError ? (
              <Text style={[styles.fieldError, { color: colors.primary }]}>
                {form.submitError}
              </Text>
            ) : null}
            {!canTrade ? (
              <Text style={[styles.fieldError, { color: colors.primary }]}>
                Motor de trading no disponible
              </Text>
            ) : null}
            <TradeSpotSubmitButton
              side={form.spotSide}
              submitting={form.submitting}
              disabled={!form.canExecuteCurrentSide}
              onPress={() => void form.executeCurrentSide()}
            />
          </View>
        ) : (
          <TradeEntryFooter
            submitError={form.submitError}
            canTrade={canTrade}
            submitting={form.submitting}
            canExecuteLong={form.canExecuteLong}
            canExecuteShort={form.canExecuteShort}
            onLongPress={() => void form.execute("LONG")}
            onShortPress={() => void form.execute("SHORT")}
          />
        )}
      </View>
    </CenteredDialogModal>
  );
}

const styles = StyleSheet.create({
  content: {
    maxHeight: "100%",
  },
  body: {
    gap: 14,
    paddingBottom: 4,
  },
  fields: {
    gap: 14,
  },
  footer: {
    gap: 14,
  },
  fieldError: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: -6,
  },
});
