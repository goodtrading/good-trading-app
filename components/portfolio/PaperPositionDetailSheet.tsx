import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { BottomSheetModal } from "@/components/BottomSheetModal";
import { computePositionReturnPercent } from "@/components/portfolio/paperDisplay";
import { useColors } from "@/hooks/useColors";
import {
  displaySymbol,
  formatQuantity,
  formatSignedUsd,
  formatUsd,
  signedValueColor,
} from "@/lib/portfolio/accounts/format";
import type { Position, Trade } from "@/lib/portfolio/types";

type Props = {
  visible: boolean;
  position: Position | null;
  trades: Trade[];
  onClose: () => void;
  onConfirmDelete: (symbol: string) => Promise<void>;
};

function formatTradeSide(side: Trade["side"]): string {
  return side === "BUY" ? "Compra" : "Venta";
}

export function PaperPositionDetailSheet({
  visible,
  position,
  trades,
  onClose,
  onConfirmDelete,
}: Props) {
  const colors = useColors();
  const [step, setStep] = useState<"detail" | "confirm">("detail");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setStep("detail");
      setDeleting(false);
      setError(null);
    }
  }, [visible]);

  if (!position) return null;

  const symbolTrades = trades
    .filter((trade) => trade.symbol === position.symbol)
    .sort((left, right) => right.timestamp - left.timestamp);

  const returnPercent = computePositionReturnPercent(position);

  const handleClose = () => {
    setStep("detail");
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirmDelete(position.symbol);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la posición");
    } finally {
      setDeleting(false);
    }
  };

  const title =
    step === "confirm"
      ? "Eliminar posición"
      : `${displaySymbol(position.symbol)} · Detalle`;

  return (
    <BottomSheetModal visible={visible} title={title} onClose={handleClose}>
      {step === "confirm" ? (
        <>
          <Text style={[styles.confirmMessage, { color: colors.mutedForeground }]}>
            ¿Eliminar esta posición de Paper Trading?
          </Text>
          {error ? <Text style={[styles.error, { color: colors.primary }]}>{error}</Text> : null}
          <View style={styles.confirmActions}>
            <Pressable
              onPress={() => setStep("detail")}
              disabled={deleting}
              style={({ pressed }) => [
                styles.confirmButton,
                styles.cancelButton,
                { borderColor: colors.border, opacity: pressed || deleting ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleDelete()}
              disabled={deleting}
              style={({ pressed }) => [
                styles.confirmButton,
                { backgroundColor: colors.primary, opacity: pressed || deleting ? 0.8 : 1 },
              ]}
            >
              {deleting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.confirmText}>Eliminar</Text>
              )}
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={styles.metrics}>
            <Metric
              label="Cantidad"
              value={`${formatQuantity(position.quantity)} ${displaySymbol(position.symbol)}`}
            />
            <Metric label="Avg entry" value={formatUsd(position.avgEntry)} />
            <Metric label="Precio actual" value={formatUsd(position.marketPrice)} />
            <Metric
              label="Unrealized PnL"
              value={formatSignedUsd(position.unrealizedPnL)}
              valueColor={signedValueColor(position.unrealizedPnL, colors)}
            />
            <Metric
              label="Return"
              value={`${returnPercent > 0 ? "+" : ""}${returnPercent.toFixed(2)}%`}
              valueColor={signedValueColor(returnPercent, colors)}
            />
            <Metric
              label="Realized PnL"
              value={formatSignedUsd(position.realizedPnL)}
              valueColor={signedValueColor(position.realizedPnL, colors)}
            />
          </View>

          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Historial de trades
          </Text>

          {symbolTrades.length === 0 ? (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>Sin operaciones</Text>
          ) : (
            symbolTrades.map((trade) => (
              <View
                key={trade.id}
                style={[styles.tradeRow, { borderBottomColor: colors.border }]}
              >
                <View>
                  <Text style={[styles.tradeSide, { color: colors.foreground }]}>
                    {formatTradeSide(trade.side)}
                  </Text>
                  <Text style={[styles.tradeMeta, { color: colors.mutedForeground }]}>
                    {new Date(trade.timestamp).toLocaleString("es-ES")}
                  </Text>
                </View>
                <View style={styles.tradeRight}>
                  <Text style={[styles.tradeQty, { color: colors.foreground }]}>
                    {formatQuantity(trade.quantity)}
                  </Text>
                  <Text style={[styles.tradePrice, { color: colors.mutedForeground }]}>
                    @ {formatUsd(trade.price)}
                  </Text>
                </View>
              </View>
            ))
          )}

          <Pressable
            onPress={() => setStep("confirm")}
            style={({ pressed }) => [
              styles.deleteButton,
              { borderColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Eliminar posición"
          >
            <Text style={[styles.deleteText, { color: colors.primary }]}>Eliminar posición</Text>
          </Pressable>
        </>
      )}
    </BottomSheetModal>
  );
}

function Metric({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor ?? colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metrics: {
    gap: 8,
    marginBottom: 16,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  metricValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 8,
  },
  empty: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  tradeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tradeSide: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tradeMeta: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  tradeRight: {
    alignItems: "flex-end",
  },
  tradeQty: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tradePrice: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  deleteButton: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  confirmMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 16,
  },
  error: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
  },
  confirmButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
