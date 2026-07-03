import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BottomSheetModal } from "@/components/BottomSheetModal";
import { useColors } from "@/hooks/useColors";
import { parsePositiveNumber } from "@/lib/portfolio/accounts/format";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";

type Props = {
  visible: boolean;
  onClose: () => void;
  onBuy: (quantity: number, price: number) => Promise<void>;
  onSell: (quantity: number, price: number) => Promise<void>;
  defaultPrice: number;
};

export function PaperTradeSheet({ visible, onClose, onBuy, onSell, defaultPrice }: Props) {
  const colors = useColors();
  const [quantity, setQuantity] = useState("0.01");
  const [price, setPrice] = useState(String(defaultPrice));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPrice(String(defaultPrice));
    }
  }, [visible, defaultPrice]);

  const resetFields = () => {
    setQuantity("0.01");
    setPrice(String(defaultPrice));
    setError(null);
  };

  const handleClose = () => {
    resetFields();
    onClose();
  };

  const execute = async (side: "buy" | "sell") => {
    const parsedQuantity = parsePositiveNumber(quantity);
    const parsedPrice = parsePositiveNumber(price);
    if (parsedQuantity == null || parsedPrice == null) {
      setError("Cantidad y precio deben ser mayores a cero");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (side === "buy") {
        await onBuy(parsedQuantity, parsedPrice);
      } else {
        await onSell(parsedQuantity, parsedPrice);
      }
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo ejecutar la operación");
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <View style={styles.actions}>
      <Pressable
        onPress={() => void execute("buy")}
        disabled={submitting}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: colors.success, opacity: pressed || submitting ? 0.8 : 1 },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.actionText}>Comprar</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => void execute("sell")}
        disabled={submitting}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: colors.primary, opacity: pressed || submitting ? 0.8 : 1 },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.actionText}>Vender</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <BottomSheetModal
      visible={visible}
      title="Nueva operación"
      onClose={handleClose}
      keyboardAware
      footer={footer}
    >
      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Activo</Text>
        <Text style={[styles.asset, { color: colors.foreground }]}>{PORTFOLIO_V1_SYMBOL} (Spot)</Text>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Cantidad</Text>
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
          ]}
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Precio entrada</Text>
        <TextInput
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
          ]}
        />

        {error ? <Text style={[styles.error, { color: colors.primary }]}>{error}</Text> : null}
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 8,
    paddingBottom: 4,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginTop: 4,
  },
  asset: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  error: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
