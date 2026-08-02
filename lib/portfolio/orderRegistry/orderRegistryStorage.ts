import AsyncStorage from "@react-native-async-storage/async-storage";

import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";

export function orderRegistryStorageKey(walletId: string): string {
  return `@goodtrading/portfolio/accounts/${walletId}/orders/v1`;
}

export async function loadOrders(walletId: string): Promise<OrderEntity[]> {
  const raw = await AsyncStorage.getItem(orderRegistryStorageKey(walletId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOrderEntityShape);
  } catch {
    return [];
  }
}

export async function saveOrders(walletId: string, orders: OrderEntity[]): Promise<void> {
  await AsyncStorage.setItem(orderRegistryStorageKey(walletId), JSON.stringify(orders));
}

function isOrderEntityShape(value: unknown): value is OrderEntity {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<OrderEntity>;
  return (
    typeof order.id === "string" &&
    typeof order.walletId === "string" &&
    typeof order.symbol === "string" &&
    typeof order.status === "string" &&
    typeof order.triggerPrice === "number" &&
    typeof order.quantity === "number"
  );
}
