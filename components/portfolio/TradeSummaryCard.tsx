import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { formatUsd } from "@/lib/portfolio/accounts/format";
import type { PerpPositionPreview } from "@/lib/portfolio/futures/PerpPositionPreview";
import type { TradeEntrySummary } from "@/lib/portfolio/trade/tradeEntryCalculations";

type TradeMetaRowProps = {
  label: string;
  value: string;
};

export function TradeMetaRow({ label, value }: TradeMetaRowProps) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.value, { color: colors.foreground }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

type TradeMetaCardProps = {
  children: React.ReactNode;
};

/** Shared meta card chrome (Nueva Operación / TP·SL). */
export function TradeMetaCard({ children }: TradeMetaCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

type TradeSummaryCardProps = {
  summary: TradeEntrySummary;
  /** PERP domain preview — sole source when provided. */
  perpPreview?: PerpPositionPreview | null;
  /** PERP only — SPOT has no liquidation. */
  showLiquidation?: boolean;
  /** SPOT — no card chrome, vertical spacing only. */
  plain?: boolean;
};

function formatOrDash(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatUsd(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

export function TradeSummaryCard({
  summary,
  perpPreview,
  showLiquidation = true,
  plain = false,
}: TradeSummaryCardProps) {
  const isPerp = perpPreview != null;

  const rows = isPerp ? (
    <>
      <TradeMetaRow label="Position Value" value={formatOrDash(perpPreview.positionValue)} />
      <TradeMetaRow label="Margin Used" value={formatOrDash(perpPreview.entryMargin)} />
      <TradeMetaRow label="Position Margin Ratio" value={formatPercent(perpPreview.positionMarginRatio)} />
      <TradeMetaRow label="ROI" value={formatPercent(perpPreview.roi)} />
      {showLiquidation ? (
        <TradeMetaRow
          label="Estimated Liquidation"
          value={formatOrDash(perpPreview.liquidationPrice)}
        />
      ) : null}
      <TradeMetaRow
        label="Wallet Balance"
        value={formatOrDash(perpPreview.walletBalance)}
      />
      <TradeMetaRow label="Equity" value={formatOrDash(perpPreview.equity)} />
      <TradeMetaRow
        label="Available Balance"
        value={formatOrDash(perpPreview.availableBalance)}
      />
      <TradeMetaRow
        label="Locked Margin"
        value={formatOrDash(perpPreview.lockedFunds)}
      />
    </>
  ) : (
    <>
      <TradeMetaRow label="Position Value" value={formatOrDash(summary.positionValue)} />
      <TradeMetaRow
        label={showLiquidation ? "Margin Used" : "Cost"}
        value={formatOrDash(summary.marginUsed)}
      />
      <TradeMetaRow label="Remaining Balance" value={formatOrDash(summary.remainingBalance)} />
      {showLiquidation ? (
        <TradeMetaRow
          label="Estimated Liquidation"
          value={formatOrDash(summary.estimatedLiquidation)}
        />
      ) : null}
    </>
  );

  if (plain) {
    return <View style={styles.plain}>{rows}</View>;
  }

  return <TradeMetaCard>{rows}</TradeMetaCard>;
}

const styles = StyleSheet.create({
  plain: {
    gap: 12,
    paddingTop: 4,
  },
  card: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    alignSelf: "stretch",
    width: "100%",
    minHeight: 20,
    gap: 12,
  },
  label: {
    flex: 1,
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
  },
  value: {
    flexShrink: 0,
    maxWidth: "55%",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
});
