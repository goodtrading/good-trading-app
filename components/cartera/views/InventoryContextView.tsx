import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useInventoryContext } from "@/lib/cartera";

/**
 * DECLARATIVE WRITE bounded context renderer — manual holdings.
 * Scaffold: inventory persistence lands in a follow-up PR.
 */
export function InventoryContextView() {
  const colors = useColors();
  const { holdings } = useInventoryContext();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Inventario</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Activos declarados manualmente — sin ejecución ni ledger.
        </Text>
      </View>

      {holdings.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sin activos registrados</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            El inventario es independiente del trading. La carga y edición de holdings se habilitará en
            la siguiente fase de alineación con el contrato de dominio.
          </Text>
        </View>
      ) : (
        holdings.map((holding) => (
          <View
            key={holding.id}
            style={[styles.holdingRow, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Text style={[styles.holdingSymbol, { color: colors.foreground }]}>{holding.symbol}</Text>
            <Text style={[styles.holdingMeta, { color: colors.mutedForeground }]}>
              {holding.quantity} · costo ${holding.costBasisUsd.toFixed(2)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
    marginBottom: 12,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  emptyBody: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  holdingRow: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    gap: 4,
  },
  holdingSymbol: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  holdingMeta: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
