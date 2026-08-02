import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import {
  hydrateTrailingStop,
  isActiveTrailingStatus,
  type TrailingStop,
  type TrailingStopSnapshotEntry,
  type TrailingStopStatus,
} from "@/lib/portfolio/trailing/TrailingStop";
import {
  applyTrailingMarkUpdate,
  shouldTriggerTrailing,
} from "@/lib/portfolio/trailing/TrailingStopEvaluator";
import { loadTrailingStops, saveTrailingStops } from "@/lib/portfolio/trailing/trailingStorage";

export class TrailingStopRuntime {
  async list(walletId: string): Promise<TrailingStop[]> {
    const stops = await loadTrailingStops(walletId);
    return stops.map(hydrateTrailingStop).sort((a, b) => b.createdAt - a.createdAt);
  }

  async listActive(walletId: string): Promise<TrailingStop[]> {
    return (await this.list(walletId)).filter((stop) => isActiveTrailingStatus(stop.status));
  }

  async getById(walletId: string, stopId: string): Promise<TrailingStop | null> {
    return (await this.list(walletId)).find((stop) => stop.id === stopId) ?? null;
  }

  async persist(walletId: string, stop: TrailingStop): Promise<TrailingStop> {
    const stops = await loadTrailingStops(walletId);
    const index = stops.findIndex((entry) => entry.id === stop.id);
    const hydrated = hydrateTrailingStop(stop);
    if (index >= 0) {
      stops[index] = hydrated;
    } else {
      stops.push(hydrated);
    }
    await saveTrailingStops(walletId, stops);
    return hydrated;
  }

  async cancelActiveForPositionLeg(
    walletId: string,
    symbol: string,
    positionSide: PositionSide,
  ): Promise<TrailingStop[]> {
    const stops = await loadTrailingStops(walletId);
    const updated: TrailingStop[] = [];
    for (const stop of stops) {
      if (
        isActiveTrailingStatus(stop.status) &&
        stop.symbol === symbol &&
        stop.positionSide === positionSide
      ) {
        updated.push(await this.transition(walletId, stop.id, "CANCELLED"));
      }
    }
    return updated;
  }

  async transition(
    walletId: string,
    stopId: string,
    status: TrailingStopStatus,
    patch: Partial<TrailingStop> = {},
  ): Promise<TrailingStop> {
    const stops = await loadTrailingStops(walletId);
    const index = stops.findIndex((stop) => stop.id === stopId);
    if (index < 0) {
      throw new Error(`TrailingStopRuntime: stop not found: ${stopId}`);
    }
    const updated: TrailingStop = {
      ...stops[index]!,
      ...patch,
      status,
      updatedAt: Date.now(),
      ...(status === "TRIGGERED" && patch.triggeredAt == null
        ? { triggeredAt: Date.now() }
        : {}),
    };
    stops[index] = updated;
    await saveTrailingStops(walletId, stops);
    return updated;
  }

  /** Applies mark updates to all active trailing stops; returns stops that should trigger. */
  async evaluateMarkUpdates(
    walletId: string,
    markPrice: number,
  ): Promise<{ updated: TrailingStop[]; toTrigger: TrailingStop[] }> {
    const active = await this.listActive(walletId);
    const updated: TrailingStop[] = [];
    const toTrigger: TrailingStop[] = [];

    for (const stop of active) {
      let current = stop;
      const patch = applyTrailingMarkUpdate(current, markPrice);
      if (patch != null) {
        current = await this.persist(walletId, patch);
        updated.push(current);
      }
      if (shouldTriggerTrailing(current, markPrice)) {
        toTrigger.push(current);
      }
    }

    return { updated, toTrigger };
  }

  async restoreFromPersisted(
    walletId: string,
    stops: TrailingStop[] | undefined,
  ): Promise<void> {
    if (!stops || stops.length === 0) return;
    const existing = await loadTrailingStops(walletId);
    if (existing.length > 0) return;
    await saveTrailingStops(walletId, stops.map(hydrateTrailingStop));
  }
}

export function buildOpenTrailingStopSnapshots(
  stops: TrailingStop[],
): TrailingStopSnapshotEntry[] {
  return stops
    .filter((stop) => isActiveTrailingStatus(stop.status))
    .map((stop) => ({
      id: stop.id,
      symbol: stop.symbol,
      side: stop.positionSide,
      callbackRate: stop.callbackRate,
      activationPrice: stop.activationPrice,
      highestPrice: stop.highestPrice,
      lowestPrice: stop.lowestPrice,
      quantity: stop.quantity,
      status: stop.status,
    }));
}

export const trailingStopRuntime = new TrailingStopRuntime();
