/**
 * Spot-only AsyncStorage keys.
 * Must never collide with PERP keys (`trades/v1`, `orders/v1`).
 */

export function spotBalancesStorageKey(walletId: string): string {
  return `@goodtrading/portfolio/accounts/${walletId}/spot/balances/v1`;
}

export function spotTradesStorageKey(walletId: string): string {
  return `@goodtrading/portfolio/accounts/${walletId}/spot/trades/v1`;
}

export function spotOrdersStorageKey(walletId: string): string {
  return `@goodtrading/portfolio/accounts/${walletId}/spot/orders/v1`;
}

export function spotLedgerMetaStorageKey(walletId: string): string {
  return `@goodtrading/portfolio/accounts/${walletId}/spot/meta/v1`;
}

export function spotPositionsStorageKey(walletId: string): string {
  return `@goodtrading/portfolio/accounts/${walletId}/spot/positions/v1`;
}
