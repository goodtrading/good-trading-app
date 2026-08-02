import { SpotLedger } from "@/lib/portfolio/spot/SpotLedger";
import { spotOrderRegistry } from "@/lib/portfolio/spot/orders/SpotOrderRegistry";
import { spotPositionRuntime } from "@/lib/portfolio/spot/SpotPositionRuntime";
import {
  isEffectivelyZero,
  normalizeQuantity,
} from "@/lib/portfolio/sizing/PositionSizing";
import {
  createSpotBalance,
  type SpotBalance,
  type SpotLedgerState,
  type SpotTrade,
} from "@/lib/portfolio/spot/types";

const DEFAULT_QUOTE_ASSET = "USDT";

export class SpotInsufficientBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotInsufficientBalanceError";
  }
}

export class SpotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotValidationError";
  }
}

export type SpotMarketOrderInput = {
  /** Base asset to buy/sell (e.g. "BTC"). */
  baseAsset: string;
  /** Quote asset (default "USDT"). */
  quoteAsset?: string;
  /** Base quantity (must be > 0). */
  quantity: number;
  /** Fill price in quote per base (must be > 0). */
  price: number;
};

export type SpotExecutionResult = {
  trade: SpotTrade;
  state: SpotLedgerState;
};

/**
 * Spot MARKET execution — asset ownership only.
 * Operates exclusively on SpotLedger. No positions, margin, shorts, or PERP stack.
 */
export class SpotExecutionService {
  constructor(private readonly ledger: SpotLedger) {}

  /**
   * BUY MARKET: spend quote (USDT), receive base asset.
   * Never opens a position or short.
   */
  async buyMarket(input: SpotMarketOrderInput): Promise<SpotExecutionResult> {
    const { baseAsset, quoteAsset, quantity, price } = normalizeInput(input);
    assertPositiveQuantity(quantity);
    assertPositivePrice(price);
    assertDistinctAssets(baseAsset, quoteAsset);

    const state = await this.requireLoadedState();
    const quoteCost = quantity * price;
    const balances = cloneBalances(state.balances);

    const quoteBal = getOrCreateBalance(balances, quoteAsset);
    if (quoteBal.free < quoteCost) {
      throw new SpotInsufficientBalanceError(
        `Insufficient ${quoteAsset}: need ${quoteCost}, free ${quoteBal.free}`,
      );
    }

    quoteBal.free -= quoteCost;
    quoteBal.total = quoteBal.free + quoteBal.locked;

    const baseBal = getOrCreateBalance(balances, baseAsset);
    baseBal.free += quantity;
    baseBal.total = baseBal.free + baseBal.locked;

    const trade = createSpotTrade({
      walletId: this.ledger.getWalletId(),
      baseAsset,
      quoteAsset,
      side: "BUY",
      quantity,
      price,
      quoteQuantity: quoteCost,
    });

    const trades = [...state.trades, trade];
    const next = await this.ledger.commitExecution(balances, trades);
    await spotPositionRuntime.applyTrade(this.ledger.getWalletId(), trade);
    return { trade, state: next };
  }

  /**
   * SELL MARKET: spend base asset, receive quote (USDT).
   * Only sells free balance — never opens a SHORT position.
   */
  async sellMarket(input: SpotMarketOrderInput): Promise<SpotExecutionResult> {
    const { baseAsset, quoteAsset, quantity: rawQuantity, price } = normalizeInput(input);
    const symbol = `${baseAsset}${quoteAsset}`;
    const quantity = normalizeQuantity(symbol, rawQuantity);
    assertPositiveQuantity(quantity);
    assertPositivePrice(price);
    assertDistinctAssets(baseAsset, quoteAsset);

    let state = await this.requireLoadedState();
    const quoteProceeds = quantity * price;
    let balances = cloneBalances(state.balances);

    await this.ensureSellableBase(baseAsset, quantity);

    state = await this.requireLoadedState();
    balances = cloneBalances(state.balances);
    const baseBal = findBalance(balances, baseAsset);

    if (!baseBal || baseBal.free < quantity) {
      const free = baseBal?.free ?? 0;
      const locked = baseBal?.locked ?? 0;
      const total = free + locked;
      throw new SpotInsufficientBalanceError(
        `Insufficient ${baseAsset}: need ${quantity}, free ${free}, total ${total}`,
      );
    }

    baseBal.free -= quantity;
    baseBal.total = baseBal.free + baseBal.locked;

    const quoteBal = getOrCreateBalance(balances, quoteAsset);
    quoteBal.free += quoteProceeds;
    quoteBal.total = quoteBal.free + quoteBal.locked;

    const trade = createSpotTrade({
      walletId: this.ledger.getWalletId(),
      baseAsset,
      quoteAsset,
      side: "SELL",
      quantity,
      price,
      quoteQuantity: quoteProceeds,
    });

    const trades = [...state.trades, trade];
    const next = await this.ledger.commitExecution(
      pruneZeroBalances(balances),
      trades,
    );
    await spotPositionRuntime.applyTrade(this.ledger.getWalletId(), trade);
    return { trade, state: next };
  }

  private async ensureSellableBase(baseAsset: string, quantity: number): Promise<void> {
    const walletId = this.ledger.getWalletId();
    let state = await this.requireLoadedState();
    let baseBal = findBalance(state.balances, baseAsset);

    if (baseBal && baseBal.free >= quantity) {
      return;
    }

    await spotOrderRegistry.cancelTpSlForAsset(walletId, baseAsset);
    await spotOrderRegistry.cancelOpenSellsForAsset(walletId, baseAsset);

    state = await this.requireLoadedState();
    baseBal = findBalance(state.balances, baseAsset);
    const total = (baseBal?.free ?? 0) + (baseBal?.locked ?? 0);
    if (total < quantity) {
      return;
    }

    if (baseBal && baseBal.free < quantity && baseBal.locked > 0) {
      await spotOrderRegistry.cancelOpenSellsForAsset(walletId, baseAsset);
    }
  }

  private async requireLoadedState(): Promise<SpotLedgerState> {
    const state = this.ledger.getState() ?? (await this.ledger.load());
    if (!state) {
      throw new SpotValidationError(
        `SpotExecutionService: no SpotLedger for ${this.ledger.getWalletId()}`,
      );
    }
    return state;
  }
}

function normalizeInput(input: SpotMarketOrderInput): {
  baseAsset: string;
  quoteAsset: string;
  quantity: number;
  price: number;
} {
  return {
    baseAsset: input.baseAsset.trim().toUpperCase(),
    quoteAsset: (input.quoteAsset ?? DEFAULT_QUOTE_ASSET).trim().toUpperCase(),
    quantity: input.quantity,
    price: input.price,
  };
}

function assertPositiveQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new SpotValidationError("Quantity must be greater than zero");
  }
}

function assertPositivePrice(price: number): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw new SpotValidationError("Price must be greater than zero");
  }
}

function assertDistinctAssets(baseAsset: string, quoteAsset: string): void {
  if (baseAsset === quoteAsset) {
    throw new SpotValidationError("baseAsset and quoteAsset must differ");
  }
}

function cloneBalances(balances: SpotBalance[]): SpotBalance[] {
  return balances.map((b) => createSpotBalance(b.asset, b.free, b.locked));
}

function findBalance(
  balances: SpotBalance[],
  asset: string,
): SpotBalance | undefined {
  return balances.find((b) => b.asset === asset);
}

function getOrCreateBalance(balances: SpotBalance[], asset: string): SpotBalance {
  const existing = findBalance(balances, asset);
  if (existing) return existing;
  const created = createSpotBalance(asset, 0, 0);
  balances.push(created);
  return created;
}

/** Drop zero free+locked rows except always keep USDT if present with zero (optional). */
function pruneZeroBalances(balances: SpotBalance[]): SpotBalance[] {
  return balances.filter((b) => b.free !== 0 || b.locked !== 0);
}

function createSpotTrade(args: {
  walletId: string;
  baseAsset: string;
  quoteAsset: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  quoteQuantity: number;
}): SpotTrade {
  return {
    id: createSpotTradeId(),
    domain: "SPOT",
    walletId: args.walletId,
    baseAsset: args.baseAsset,
    quoteAsset: args.quoteAsset,
    side: args.side,
    quantity: args.quantity,
    price: args.price,
    quoteQuantity: args.quoteQuantity,
    timestamp: Date.now(),
  };
}

function createSpotTradeId(): string {
  return `spot_trade_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createSpotExecutionService(ledger: SpotLedger): SpotExecutionService {
  return new SpotExecutionService(ledger);
}
