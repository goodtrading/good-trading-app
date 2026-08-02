import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { parsePositiveNumber } from "@/lib/portfolio/accounts/format";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import type { PositionMode } from "@/lib/portfolio/types";

/**
 * Experimental pro order entry (Exchange lab).
 * Candidate for future reuse inside Classic position-open flows.
 * Shares PortfolioEngineRuntime with Classic production UI.
 */
type OrderType = "MARKET" | "LIMIT";
type TradeIntent = "LONG" | "SHORT";

type OrderPanelProps = {
  engine: PortfolioEngine | null;
  marketPrice: number | null;
  positionMode: PositionMode;
  leverage: number;
  cashBalance: number;
  onLeverageChange: (leverage: number) => void;
};

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10];

export function OrderPanel({
  engine,
  marketPrice,
  positionMode,
  leverage,
  cashBalance,
  onLeverageChange,
}: OrderPanelProps) {
  const colors = useColors();
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [intent, setIntent] = useState<TradeIntent>("LONG");
  const [quantity, setQuantity] = useState("0.01");
  const [limitPrice, setLimitPrice] = useState(
    marketPrice != null ? String(marketPrice) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const effectivePrice =
    orderType === "LIMIT"
      ? parsePositiveNumber(limitPrice)
      : marketPrice != null && marketPrice > 0
        ? marketPrice
        : null;
  const qty = parsePositiveNumber(quantity);

  const notional = qty != null && effectivePrice != null ? qty * effectivePrice : null;
  const estimatedPnl =
    qty != null && effectivePrice != null && marketPrice != null
      ? intent === "LONG"
        ? qty * (marketPrice - effectivePrice)
        : qty * (effectivePrice - marketPrice)
      : null;

  const riskWarning = useMemo(() => {
    if (leverage >= 5) return `Leverage alto (${leverage}x) — riesgo elevado`;
    if (notional != null && cashBalance > 0 && notional > cashBalance * 0.8) {
      return "Notional alto respecto al cash disponible";
    }
    return null;
  }, [cashBalance, leverage, notional]);

  const submit = async () => {
    if (!engine || qty == null || effectivePrice == null) {
      setError("Cantidad y precio válidos requeridos");
      return;
    }
    setSubmitting(true);
    setError(null);
    setStatus(null);

    try {
      if (intent === "SHORT" && engine.getPositionMode() === "LONG_ONLY") {
        engine.setPositionMode("LONG_SHORT");
      }
      const side = intent === "LONG" ? "BUY" : "SELL";
      if (orderType === "MARKET") {
        if (side === "BUY") {
          await engine.buy(qty, effectivePrice, marketPrice ?? effectivePrice);
        } else {
          await engine.sell(qty, effectivePrice, marketPrice ?? effectivePrice);
        }
        setStatus(`${intent} MARKET ejecutado`);
      } else {
        await engine.placeLimitOrder(side, qty, effectivePrice);
        setStatus(`${intent} LIMIT abierta @ ${effectivePrice}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la orden");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Order Panel</Text>

      <View style={styles.segmentRow}>
        {(["MARKET", "LIMIT"] as const).map((type) => (
          <Pressable
            key={type}
            onPress={() => setOrderType(type)}
            style={[
              styles.segment,
              {
                backgroundColor: orderType === type ? colors.secondary : "transparent",
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: orderType === type ? colors.primary : colors.mutedForeground },
              ]}
            >
              {type}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.segmentRow}>
        <Pressable
          onPress={() => setIntent("LONG")}
          style={[
            styles.segment,
            {
              backgroundColor: intent === "LONG" ? colors.success : "transparent",
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              { color: intent === "LONG" ? "#ffffff" : colors.mutedForeground },
            ]}
          >
            LONG
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (engine && engine.getPositionMode() === "LONG_ONLY") {
              engine.setPositionMode("LONG_SHORT");
            }
            setIntent("SHORT");
          }}
          style={[
            styles.segment,
            {
              backgroundColor: intent === "SHORT" ? colors.primary : "transparent",
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              { color: intent === "SHORT" ? "#ffffff" : colors.mutedForeground },
            ]}
          >
            SHORT
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Leverage</Text>
      <View style={styles.leverageRow}>
        {LEVERAGE_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => onLeverageChange(option)}
            style={[
              styles.leverageChip,
              {
                borderColor: colors.border,
                backgroundColor: leverage === option ? colors.secondary : "transparent",
              },
            ]}
          >
            <Text
              style={[
                styles.leverageText,
                { color: leverage === option ? colors.primary : colors.mutedForeground },
              ]}
            >
              {option}x
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Quantity</Text>
      <TextInput
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      />

      {orderType === "LIMIT" ? (
        <>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Limit price</Text>
          <TextInput
            value={limitPrice}
            onChangeText={setLimitPrice}
            keyboardType="decimal-pad"
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
          />
        </>
      ) : null}

      <View style={styles.previewBox}>
        <Text style={[styles.previewLine, { color: colors.mutedForeground }]}>
          Notional: {notional != null ? notional.toFixed(2) : "—"}
        </Text>
        <Text style={[styles.previewLine, { color: colors.mutedForeground }]}>
          PnL est. (vs mark):{" "}
          {estimatedPnl != null
            ? `${estimatedPnl >= 0 ? "+" : ""}${estimatedPnl.toFixed(2)}`
            : "—"}
        </Text>
        {riskWarning ? (
          <Text style={[styles.warning, { color: colors.primary }]}>{riskWarning}</Text>
        ) : null}
      </View>

      {error ? <Text style={[styles.error, { color: colors.primary }]}>{error}</Text> : null}
      {status ? <Text style={[styles.status, { color: colors.success }]}>{status}</Text> : null}

      <Pressable
        onPress={() => void submit()}
        disabled={submitting || engine == null}
        style={({ pressed }) => [
          styles.submit,
          {
            backgroundColor: intent === "LONG" ? colors.success : colors.primary,
            opacity: pressed || submitting || engine == null ? 0.7 : 1,
          },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.submitText}>
            {intent} {orderType}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  segmentText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  leverageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  leverageChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  leverageText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  previewBox: {
    gap: 3,
    marginTop: 2,
  },
  previewLine: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  warning: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
  error: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  status: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  submit: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
});
