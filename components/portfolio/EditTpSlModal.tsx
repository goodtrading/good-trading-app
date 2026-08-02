import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { CenteredDialogModal } from "@/components/CenteredDialogModal";
import { LiveMarkPriceHeader } from "@/components/portfolio/LiveMarkPriceHeader";
import { TradeRiskOptions } from "@/components/portfolio/TradeRiskOptions";
import {
  TradeMetaCard,
  TradeMetaRow,
} from "@/components/portfolio/TradeSummaryCard";
import { useColors } from "@/hooks/useColors";
import { formatQuantity, formatUsd, parsePositiveNumber } from "@/lib/portfolio/accounts/format";
import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import type { PositionCardViewModel } from "@/components/portfolio/positionCardModel";

type EditTpSlModalProps = {
  visible: boolean;
  view: PositionCardViewModel | null;
  linkedOrders: OrderEntity[];
  onClose: () => void;
  onSave: (
    takeProfitPrice: number | null,
    stopLossPrice: number | null,
  ) => Promise<void>;
};

/**
 * Edit / remove TP and SL for an open position.
 * Persists only through OrderRegistryEngine (caller).
 */
export function EditTpSlModal({
  visible,
  view,
  linkedOrders,
  onClose,
  onSave,
}: EditTpSlModalProps) {
  const colors = useColors();
  const [tpSlEnabled, setTpSlEnabled] = useState(true);
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [reduceOnlyEnabled, setReduceOnlyEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openSymbolRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !view) {
      openSymbolRef.current = null;
      return;
    }
    if (openSymbolRef.current === view.symbol) return;
    openSymbolRef.current = view.symbol;

    const tp = linkedOrders.find(
      (order) =>
        order.orderType === "TAKE_PROFIT_MARKET" ||
        order.orderType === "TAKE_PROFIT_LIMIT",
    );
    const sl = linkedOrders.find(
      (order) =>
        order.orderType === "STOP_MARKET" || order.orderType === "STOP_LIMIT",
    );

    setTakeProfitPrice(tp != null ? String(tp.triggerPrice) : "");
    setStopLossPrice(sl != null ? String(sl.triggerPrice) : "");
    setTpSlEnabled(true);
    setReduceOnlyEnabled(true);
    setError(null);
  }, [visible, view, linkedOrders]);

  const handleSave = async () => {
    setError(null);

    if (!tpSlEnabled) {
      setSubmitting(true);
      try {
        await onSave(null, null);
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar TP/SL");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const tp = parsePositiveNumber(takeProfitPrice);
    const sl = parsePositiveNumber(stopLossPrice);

    if (tp == null && sl == null) {
      setError("Indica Take Profit y/o Stop Loss, o desactiva TP/SL para eliminarlos");
      return;
    }

    setSubmitting(true);
    try {
      await onSave(tp, sl);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar TP/SL");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CenteredDialogModal
      visible={visible && view != null}
      title="TP / SL"
      onClose={onClose}
    >
      {view ? (
        <View style={styles.body}>
          <View style={[styles.section, styles.headerSection, { borderBottomColor: colors.border }]}>
            <LiveMarkPriceHeader
              symbol={view.symbol}
              badges={[
                { label: view.domain === "SPOT" ? "Spot" : "Perp", tone: "neutral" },
                {
                  label: view.sideIsLong ? "Comprar" : "Vender",
                  tone: view.sideIsLong ? "buy" : "sell",
                },
              ]}
              entryPrice={view.avgEntry}
              entryPriceLabel="Precio de Entrada"
              referencePriceLabel="Precio de referencia"
            />
          </View>

          <View style={styles.section}>
            <TradeRiskOptions
              tpSlEnabled={tpSlEnabled}
              reduceOnlyEnabled={reduceOnlyEnabled}
              postOnlyEnabled={false}
              takeProfitPrice={takeProfitPrice}
              stopLossPrice={stopLossPrice}
              onTpSlChange={setTpSlEnabled}
              onReduceOnlyChange={setReduceOnlyEnabled}
              onPostOnlyChange={() => {}}
              onTakeProfitPriceChange={setTakeProfitPrice}
              onStopLossPriceChange={setStopLossPrice}
              showReduceOnly={false}
            />
          </View>

          <View
            style={[
              styles.section,
              styles.orderBlock,
              { borderColor: colors.border, backgroundColor: colors.secondary },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              Order settings
            </Text>
            <View style={styles.orderTypeRow}>
              <View
                style={[
                  styles.orderTypeChip,
                  { borderColor: colors.border, backgroundColor: colors.background },
                ]}
              >
                <Text style={[styles.orderTypeText, { color: colors.primary }]}>Market</Text>
              </View>
            </View>
            <View style={styles.orderQtyRow}>
              <Text style={[styles.orderQtyLabel, { color: colors.mutedForeground }]}>
                Cantidad
              </Text>
              <Text style={[styles.orderQtyValue, { color: colors.foreground }]}>
                {formatQuantity(view.quantity, 8)}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <TradeMetaCard>
              <TradeMetaRow label="Cantidad" value={formatQuantity(view.quantity, 8)} />
              <TradeMetaRow
                label="PnL estimado"
                value={formatUsd(view.unrealizedPnL)}
              />
            </TradeMetaCard>
          </View>

          {error ? (
            <Text style={[styles.error, { color: colors.primary }]}>{error}</Text>
          ) : null}

          <View style={styles.footer}>
            <Pressable
              onPress={() => void handleSave()}
              disabled={submitting}
              style={({ pressed }) => [
                styles.confirm,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || submitting ? 0.8 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.confirmText}>Confirmar</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </CenteredDialogModal>
  );
}

const styles = StyleSheet.create({
  body: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 16,
    paddingBottom: 4,
  },
  section: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
  },
  headerSection: {
    paddingBottom: 14,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  orderBlock: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  orderTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
  },
  orderTypeChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  orderTypeText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
  },
  orderQtyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    alignSelf: "stretch",
    width: "100%",
    minHeight: 20,
    gap: 12,
  },
  orderQtyLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
  },
  orderQtyValue: {
    flexShrink: 0,
    maxWidth: "55%",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  error: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
  },
  footer: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    paddingTop: 4,
  },
  confirm: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
  },
});
