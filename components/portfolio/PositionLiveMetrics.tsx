import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  computeLivePositionMetrics,
  type PositionCardViewModel,
} from "@/components/portfolio/positionCardModel";
import { useColors } from "@/hooks/useColors";
import { useMarketTick } from "@/hooks/useMarketTick";
import {
  formatQuantity,
  formatSignedUsd,
  formatUsd,
  signedValueColor,
} from "@/lib/portfolio/accounts/format";

type PositionLiveMetricsProps = {
  view: PositionCardViewModel;
};

function MetricCell({
  label,
  value,
  labelColor,
  valueColor,
}: {
  label: string;
  value: string;
  labelColor: string;
  valueColor: string;
}) {
  return (
    <View style={styles.metricCell}>
      <Text style={[styles.metricLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Live mark/PnL subscriber — sole tick-sensitive region of OpenPositionCard.
 */
export const PositionLiveMetrics = memo(function PositionLiveMetrics({
  view,
}: PositionLiveMetricsProps) {
  const colors = useColors();
  const isPerp = view.domain === "PERP";
  const { price: tickMark } = useMarketTick(view.symbol);
  const live = isPerp
      ? computeLivePositionMetrics(view, tickMark ?? 0)
      : {
          markPrice: view.markPrice,
          positionValue: view.positionValue,
          unrealizedPnL: view.unrealizedPnL,
          pnlPercent: view.pnlPercent,
        };
  const pnlColor = signedValueColor(live.unrealizedPnL, colors);

  return (
    <>
      <View style={styles.pnlRow}>
        <View style={styles.pnlBlock}>
          <Text style={[styles.pnlLabel, { color: colors.mutedForeground }]}>PNL (USDT)</Text>
          <Text style={[styles.pnlValue, { color: pnlColor }]} numberOfLines={1}>
            {formatSignedUsd(live.unrealizedPnL)}
          </Text>
        </View>
        <View style={styles.roiBlock}>
          <Text style={[styles.pnlLabel, { color: colors.mutedForeground }]}>
            {isPerp ? "ROI" : "PnL %"}
          </Text>
          <Text style={[styles.roiValue, { color: pnlColor }]} numberOfLines={1}>
            {live.pnlPercent > 0 ? "+" : ""}
            {live.pnlPercent.toFixed(2)}%
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.metricsRow}>
        <MetricCell
          label="Cantidad"
          value={`${formatQuantity(view.quantity, 4)} ${view.quantityAsset}`}
          labelColor={colors.mutedForeground}
          valueColor={colors.foreground}
        />
        <MetricCell
          label={isPerp ? "Valor posición" : "Valor"}
          value={live.positionValue > 0 ? formatUsd(live.positionValue) : "—"}
          labelColor={colors.mutedForeground}
          valueColor={colors.foreground}
        />
        {isPerp ? (
          <MetricCell
            label="Ratio margen"
            value={`${(live.positionMarginRatio ?? view.positionMarginRatio ?? view.marginRatio ?? 0).toFixed(1)}%`}
            labelColor={colors.mutedForeground}
            valueColor={colors.foreground}
          />
        ) : (
          <MetricCell
            label="Valor actual"
            value={live.positionValue > 0 ? formatUsd(live.positionValue) : "—"}
            labelColor={colors.mutedForeground}
            valueColor={colors.foreground}
          />
        )}
      </View>

      <View style={styles.metricsRow}>
        <MetricCell
          label={isPerp ? "Entrada" : "Precio promedio"}
          value={view.avgEntry > 0 ? formatUsd(view.avgEntry) : "—"}
          labelColor={colors.mutedForeground}
          valueColor={colors.foreground}
        />
        <MetricCell
          label={isPerp ? "Precio" : "Precio actual"}
          value={live.markPrice > 0 ? formatUsd(live.markPrice) : "—"}
          labelColor={colors.mutedForeground}
          valueColor={colors.foreground}
        />
        {isPerp ? (
          <MetricCell
            label="Liquidación"
            value={
              (live.liquidationPrice ?? view.liquidationPrice) != null
                ? formatUsd(live.liquidationPrice ?? view.liquidationPrice!)
                : "—"
            }
            labelColor={colors.mutedForeground}
            valueColor={colors.foreground}
          />
        ) : (
          <MetricCell
            label="Coste"
            value={
              view.avgEntry > 0
                ? formatUsd(view.avgEntry * view.quantity)
                : "—"
            }
            labelColor={colors.mutedForeground}
            valueColor={colors.foreground}
          />
        )}
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  pnlRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  pnlBlock: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  roiBlock: {
    alignItems: "flex-end",
    gap: 6,
  },
  pnlLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  pnlValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  roiValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.7,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCell: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
