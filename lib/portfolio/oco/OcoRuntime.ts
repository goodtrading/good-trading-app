import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import {
  hydrateOcoGroup,
  isActiveOcoStatus,
  type OcoGroup,
  type OcoGroupSnapshotEntry,
  type OcoGroupStatus,
} from "@/lib/portfolio/oco/OcoGroup";
import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import { loadOcoGroups, saveOcoGroups } from "@/lib/portfolio/oco/ocoStorage";

export class OcoRuntime {
  async list(walletId: string): Promise<OcoGroup[]> {
    const groups = await loadOcoGroups(walletId);
    return groups.map(hydrateOcoGroup).sort((a, b) => b.createdAt - a.createdAt);
  }

  async listActive(walletId: string): Promise<OcoGroup[]> {
    const groups = await this.list(walletId);
    return groups.filter((group) => isActiveOcoStatus(group.status));
  }

  async getById(walletId: string, groupId: string): Promise<OcoGroup | null> {
    const groups = await this.list(walletId);
    return groups.find((group) => group.id === groupId) ?? null;
  }

  async findByOrderId(walletId: string, orderId: string): Promise<OcoGroup | null> {
    const groups = await this.list(walletId);
    return (
      groups.find(
        (group) =>
          group.takeProfitOrderId === orderId || group.stopLossOrderId === orderId,
      ) ?? null
    );
  }

  async persist(walletId: string, group: OcoGroup): Promise<OcoGroup> {
    const groups = await loadOcoGroups(walletId);
    const index = groups.findIndex((entry) => entry.id === group.id);
    const hydrated = hydrateOcoGroup(group);
    if (index >= 0) {
      groups[index] = hydrated;
    } else {
      groups.push(hydrated);
    }
    await saveOcoGroups(walletId, groups);
    return hydrated;
  }

  async cancelActiveForPositionLeg(
    walletId: string,
    symbol: string,
    positionSide: PositionSide,
  ): Promise<OcoGroup[]> {
    const groups = await loadOcoGroups(walletId);
    const updated: OcoGroup[] = [];
    for (const group of groups) {
      if (
        isActiveOcoStatus(group.status) &&
        group.symbol === symbol &&
        group.positionSide === positionSide
      ) {
        updated.push(
          await this.transition(walletId, group.id, "CANCELLED"),
        );
      }
    }
    return updated;
  }

  async transition(
    walletId: string,
    groupId: string,
    status: OcoGroupStatus,
  ): Promise<OcoGroup> {
    const groups = await loadOcoGroups(walletId);
    const index = groups.findIndex((group) => group.id === groupId);
    if (index < 0) {
      throw new Error(`OcoRuntime: group not found: ${groupId}`);
    }
    const updated: OcoGroup = {
      ...groups[index]!,
      status,
      updatedAt: Date.now(),
    };
    groups[index] = updated;
    await saveOcoGroups(walletId, groups);
    return updated;
  }

  /** Hydrates persisted groups from ledger snapshot (legacy compatibility). */
  async restoreFromPersisted(
    walletId: string,
    groups: OcoGroup[] | undefined,
  ): Promise<void> {
    if (!groups || groups.length === 0) return;
    const existing = await loadOcoGroups(walletId);
    if (existing.length > 0) return;
    await saveOcoGroups(walletId, groups.map(hydrateOcoGroup));
  }

  /** Mirrors active groups into portfolio persisted state. */
  async exportForPersistedState(walletId: string): Promise<OcoGroup[]> {
    return this.list(walletId);
  }
}

export function buildOpenOcoGroupSnapshots(
  groups: OcoGroup[],
  orders: OrderEntity[],
): OcoGroupSnapshotEntry[] {
  const orderById = new Map(orders.map((order) => [order.id, order]));

  return groups
    .filter((group) => isActiveOcoStatus(group.status))
    .map((group) => {
      const tp = orderById.get(group.takeProfitOrderId) ?? null;
      const sl = orderById.get(group.stopLossOrderId) ?? null;
      return {
        id: group.id,
        symbol: group.symbol,
        side: group.positionSide,
        status: group.status,
        takeProfit: tp
          ? {
              orderId: tp.id,
              triggerPrice: tp.triggerPrice,
              quantity: tp.quantity,
              orderStatus: tp.status,
            }
          : null,
        stopLoss: sl
          ? {
              orderId: sl.id,
              triggerPrice: sl.triggerPrice,
              quantity: sl.quantity,
              orderStatus: sl.status,
            }
          : null,
      };
    });
}

export const ocoRuntime = new OcoRuntime();
