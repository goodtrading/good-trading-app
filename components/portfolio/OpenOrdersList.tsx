import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { formatQuantity, formatUsd } from "@/lib/portfolio/accounts/format";
import {
  orderBadgeKind,
  type OrderBadgeKind,
  type OrderEntity,
} from "@/lib/portfolio/orderRegistry/OrderEntity";

type OpenOrdersListProps = {
  orders: OrderEntity[];
  onCancel: (orderId: string) => void;
};

const BADGE_COLORS: Record<OrderBadgeKind, string> = {
  LIMIT: "#3B82F6",
  STOP: "#F59E0B",
  "STOP LIMIT": "#F97316",
  TP: "#22C55E",
  "TP LIMIT": "#14B8A6",
  SL: "#EF4444",
};

/**
 * Pending orders from OrderRegistryEngine.
 */
export const OpenOrdersList = memo(function OpenOrdersList({
  orders,
  onCancel,
}: OpenOrdersListProps) {
  const colors = useColors();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.foreground }]}>Órdenes pendientes</Text>
      {orders.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          Sin órdenes pendientes
        </Text>
      ) : (
        orders.map((order) => {
          const badge = orderBadgeKind(order.orderType);
          const badgeColor = BADGE_COLORS[badge];

          return (
            <View
              key={order.id}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.meta}>
                <View style={styles.headerRow}>
                  <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                  {order.ocoGroupId ? (
                    <View style={[styles.badge, { backgroundColor: "#6366F1" }]}>
                      <Text style={styles.badgeText}>OCO</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.symbol, { color: colors.foreground }]}>
                    {order.symbol} · {order.side}
                  </Text>
                </View>
                <Text style={[styles.detail, { color: colors.mutedForeground }]}>
                  Precio {formatUsd(order.triggerPrice)} · Qty{" "}
                  {formatQuantity(order.quantity, 4)}
                </Text>
                <Text style={[styles.status, { color: colors.mutedForeground }]}>
                  {order.status} · {new Date(order.createdAt).toLocaleString("es-ES")}
                </Text>
              </View>
              <Pressable
                onPress={() => onCancel(order.id)}
                style={({ pressed }) => [
                  styles.cancelButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.secondary,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancelar orden"
              >
                <Text style={[styles.cancelText, { color: colors.primary }]}>Cancelar</Text>
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  empty: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  row: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  meta: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  symbol: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    flexShrink: 1,
  },
  detail: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  status: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  cancelButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
