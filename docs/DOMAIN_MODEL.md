# Cartera — Domain Model

**Version:** 1.0  
**Status:** Frozen Contract — Candidate v1.0  
**Audience:** Engineers, architects, and technical leads  
**Scope:** Domain layer only. No UI, no framework, no infrastructure implementation.

---

## Document Purpose

This document defines the complete domain model for **Cartera**, the financial core of Market Insight. It is the authoritative reference for all backend development. No domain entity, engine, or relationship may be introduced without aligning with this specification.

If implementation and this document diverge, **this document wins** until formally amended.

**Amendment policy:** Changes require explicit version bump (v1.1+) and architectural review. P0 invariants defined herein are non-negotiable within v1.0.

---

## Table of Contents

1. [What Is Cartera?](#1-what-is-cartera)
2. [Entity Catalog](#2-entity-catalog)
3. [Bounded Contexts](#3-bounded-contexts)
4. [Relationships & Diagrams](#4-relationships--diagrams)
5. [Engines](#5-engines)
6. [Broker Layer](#6-broker-layer)
7. [Portfolio (Analytical System)](#7-portfolio-analytical-system)
8. [Wallet](#8-wallet)
9. [Inventario (Holdings)](#9-inventario-holdings)
10. [Architecture Principles](#10-architecture-principles)
11. [Evolution Roadmap](#11-evolution-roadmap)
12. [Future Proof](#12-future-proof)

---

## 1. What Is Cartera?

### Definition

**Cartera** is the unified financial domain of Market Insight. It is the system responsible for representing, recording, valuing, and analyzing a user's financial wealth across all sources: simulated execution, connected brokers, and manually tracked assets.

Cartera is not a screen. Cartera is not a tab. Cartera is the **domain module** that owns all financial state and business rules.

### Internal Structure

```
Cartera
├── Trading      — execution and financial ledger
├── Inventario   — manual wealth tracking
└── Portfolio    — analytical projections (read-only)
```

### Responsibility

Cartera **is responsible for**:

| Responsibility | Description |
|---|---|
| **Wallet management** | Creating and managing wallets of all types |
| **Ledger recording** | Immutable append-only financial events (Trading) |
| **Holding management** | Manual asset registry with cost basis (Inventario) |
| **Valuation** | Marking positions and holdings to market |
| **Broker integration** | Connecting to external execution venues via adapters |
| **Reconciliation** | Aligning broker-reported state with internal ledger |
| **Analytical projection** | Aggregating wallet data into portfolio views |
| **Performance measurement** | Computing returns over time from snapshots |
| **Financial integrity** | Enforcing invariants: ledger immutability, single source of truth, auditability, tenancy |

### Problems Cartera Solves

- **Where is my money?** — Unified view across simulated wallets, brokers, and manual holdings.
- **What did I trade?** — Immutable, auditable event history per trading wallet.
- **What do I own outside brokers?** — Manual inventory for real estate, bonds, private equity, physical gold, etc.
- **How is my wealth distributed?** — Analytical allocation across wallets and asset classes.
- **How am I performing?** — Time-weighted performance from equity snapshots.
- **How do I simulate?** — Simulated execution via in-memory broker adapter.

### Problems Cartera Does NOT Solve

| Out of Scope | Owned By |
|---|---|
| Market data ingestion (live prices, order books) | **Market Data** module (upstream) |
| Order routing optimization | **Trading Engine** delegates to broker; broker owns protocol execution |
| Tax reporting and compliance | Future **Tax** bounded context (downstream) |
| Payment processing (deposits/withdrawals to bank) | **Payments** bounded context |
| User authentication and authorization | **Identity** module (provides `UserId` / `TenantId`) |
| Charting and technical analysis | **Market Data** + presentation layer |
| Social features, copy trading | Product layer (not domain) |
| Notifications and alerts | **Notifications** module (reacts to domain events) |
| UI layout, navigation, theming | Presentation layer |

### Core Invariant

> Cartera owns financial truth. Nothing outside Cartera may create, modify, or delete financial state. External modules may **read** Cartera projections and **request** operations; Cartera decides.

### Tenancy Invariant (v1)

> Every persistent entity in Cartera carries `ownerId` and `tenantId`. No financial record exists without an owner. Identity module provides identifiers; Cartera enforces their presence.

---

## 2. Entity Catalog

### Naming Conventions

| Term | Role in Domain |
|---|---|
| **Wallet** | Canonical name for the aggregate root that holds financial value. The primary domain concept. |
| **TradingAccount** | Specialized wallet for execution and ledger (wallet type: `TRADING`). |
| **InventoryAccount** | Specialized wallet for manual holdings (wallet type: `INVENTORY`). |
| **Account** | Technical alias used in APIs and polymorphic references (`WalletRef`). Equivalent to Wallet in domain language. |
| **Portfolio** | Analytical definition that references wallets (not a container of assets). |
| **Paper** | **Forbidden as domain entity name.** Refers only to `PaperBroker`, an in-memory broker adapter. |
| **SIMULATED** | `executionMode` value on `TradingAccount`. Not a product, not a broker name. |

**Ubiquitous language rule:** In domain specifications and code, prefer **Wallet**. In analytical references, use **Account** only as a polymorphic pointer (`accountId` + `accountType`). Both terms refer to the same aggregate family; Wallet is canonical.

---

### 2.0 Shared Kernel

Types used across all bounded contexts.

#### TenantId / UserId

| Field | Value |
|---|---|
| **Purpose** | Ownership and isolation identifiers supplied by Identity module. |
| **Owner** | Identity module (upstream); Cartera enforces presence. |
| **Usage** | Required on every persistent entity from v1. |

#### WalletRef

| Field | Value |
|---|---|
| **Purpose** | Polymorphic reference to any wallet. Used by Portfolio, transfers, reconciliation. |
| **Data** | `accountId`, `accountType: TRADING \| INVENTORY` |
| **Owner** | Shared kernel |

---

### 2.1 Money (Value Object)

| Field | Value |
|---|---|
| **Purpose** | Typed monetary amount. Eliminates bare `number` for any financial quantity involving currency. |
| **Owner** | Shared kernel |
| **Lifecycle** | Immutable once created |
| **Data** | `amount: Decimal`, `currency: CurrencyCode` (ISO 4217 or crypto symbol) |
| **Operations** | `add(Money)`, `subtract(Money)`, `convert(FXRate) → Money`, `isZero()`, `isPositive()` |
| **Invariant** | Operations require same currency unless explicit `convert()` is applied. |
| **Used by** | All entities representing balances, prices, fees, valuations, cost basis, PnL |
| **Must NOT know** | Accounts, portfolios, UI |

> **v1 rule:** No financial field uses raw `number` without an associated currency context via `Money` or an explicit `currency` field on the parent entity.

---

### 2.2 Account (Abstract Wallet)

| Field | Value |
|---|---|
| **Purpose** | Abstract base for all wallets. Never instantiated directly. |
| **Owner** | Cartera (domain root) |
| **Lifecycle** | Defined by subtypes (`TradingAccount`, `InventoryAccount`) |
| **Created by** | Subtype-specific services |
| **Modified by** | Subtype-specific services (metadata only) |
| **Deleted by** | Wallet management service — soft-delete (`archived`); financial data preserved |
| **Data** | `id`, `ownerId`, `tenantId`, `name`, `baseCurrency`, `walletType`, `status`, `createdAt`, `archivedAt?` |
| **Must NOT know** | UI state, broker credentials, market prices, portfolio definitions, other wallets |

---

### 2.3 TradingAccount

| Field | Value |
|---|---|
| **Purpose** | Wallet for trade execution and financial ledger. One trading relationship (simulated or broker-linked). |
| **Owner** | Trading bounded context |
| **Lifecycle** | `created → active → suspended → archived` |
| **Created by** | `TradingWalletService.create()` |
| **Modified by** | `TradingWalletService` (metadata only). Ledger is append-only. |
| **Deleted by** | `TradingWalletService.archive()` — ledger sealed, preserved for audit |
| **Contains** | Reference to `Ledger`, `Connection` (if broker-linked) |
| **Data** | All Account fields + `executionMode: SIMULATED \| BROKER_LINKED`, `connectionId?`, `costBasisPolicy: FIFO \| LIFO \| AVERAGE` |
| **Knows** | Its own `Ledger`, its `Connection` (if any) |
| **Must NOT know** | Broker adapter implementation, holdings, portfolio definitions, market data internals |

**executionMode semantics:**

| Mode | Broker | SSOT for positions/cash | See |
|---|---|---|---|
| `SIMULATED` | `PaperBroker` (in-memory adapter) | Ledger replay | §6.4 |
| `BROKER_LINKED` | External broker adapter | Broker at sync boundary; ledger is audit trail | §6.4 |

> **Paper is not an executionMode.** Paper is the name of the in-memory broker adapter assigned automatically when `executionMode = SIMULATED`.

---

### 2.4 InventoryAccount

| Field | Value |
|---|---|
| **Purpose** | Wallet for manually tracked assets. No trade ledger. User declares ownership. |
| **Owner** | Inventario bounded context |
| **Lifecycle** | `created → active → archived` |
| **Created by** | `InventoryWalletService.create()` |
| **Modified by** | `InventoryWalletService` (metadata). Holdings via `InventoryService`. |
| **Deleted by** | `InventoryWalletService.archive()` — holdings preserved for audit |
| **Contains** | Collection of `Holding` entries |
| **Data** | All Account fields |
| **Knows** | Its `Holding[]`, valuation policy |
| **Must NOT know** | Trades, orders, brokers, positions, portfolio definitions, market data internals |

---

### 2.5 Portfolio

| Field | Value |
|---|---|
| **Purpose** | Analytical definition: a named lens through which one or more wallets are viewed, aggregated, and measured. |
| **Owner** | Portfolio bounded context |
| **Lifecycle** | `created → active → archived` |
| **Created by** | `PortfolioService.create()` or system defaults (e.g., "Total Wealth") |
| **Modified by** | `PortfolioService` (name, member wallets, benchmark) |
| **Deleted by** | `PortfolioService.archive()` |
| **Contains** | `PortfolioMember[]` (references only), optional `benchmarkId` |
| **Data** | `id`, `ownerId`, `tenantId`, `name`, `members: PortfolioMember[]`, `benchmarkId?`, `aggregationCurrency`, `createdAt` |
| **Knows** | Wallet IDs it references, benchmark definition |
| **Must NOT know** | Trades, holdings, positions, balances, prices. **Portfolio stores references, never copies.** |

**Invariants:**

1. `PortfolioMember` entries are unique per `(accountId, accountType)`.
2. Archived wallets are excluded from projections unless explicitly included.
3. Empty portfolios (zero members) are valid but return empty projections.

> **Critical:** Portfolio is NOT a product. Portfolio is a read-model configuration. It does not own assets.

---

### 2.6 PortfolioMember

| Field | Value |
|---|---|
| **Purpose** | Reference linking a Portfolio to a Wallet. |
| **Owner** | Portfolio bounded context |
| **Lifecycle** | Created/removed as portfolio membership changes |
| **Created by** | `PortfolioService.addMember()` |
| **Modified by** | `PortfolioService` |
| **Deleted by** | `PortfolioService.removeMember()` |
| **Contains** | `accountId`, `accountType: TRADING \| INVENTORY`, `weight?` (display-only target allocation) |
| **Knows** | Wallet ID and type only |
| **Must NOT know** | Wallet contents, balances, positions |

---

### 2.7 Ledger

| Field | Value |
|---|---|
| **Purpose** | Append-only stream of financial events for a trading wallet. The single source of truth for simulated accounts; the audit trail for broker-linked accounts. |
| **Owner** | Trading bounded context |
| **Lifecycle** | `initialized → active → sealed` (sealed = wallet archived) |
| **Created by** | `LedgerService.initialize()` when trading wallet is created |
| **Modified by** | `LedgerService.append()` only |
| **Deleted by** | **Nobody.** Ledger is permanent. Wallet archival seals it. |
| **Contains** | Ordered `LedgerEntry[]` (see §2.8) |
| **Data** | `walletId`, `ownerId`, `tenantId`, `initialCash: Money`, `entries[]`, `sealedAt?`, `checkpointSequence?` |
| **Knows** | Its entries |
| **Must NOT know** | Positions (derived), portfolio, UI, broker internals |

**Scalability design:** Entries are stored and retrieved by sequence range, not as a single embedded array. `PositionCheckpoint` entries (optional, persisted) enable O(1) replay from last checkpoint. Checkpoints are derived observations, not source of truth.

---

### 2.8 LedgerEntry (Abstract)

| Field | Value |
|---|---|
| **Purpose** | Immutable financial event within a ledger. Atomic unit of truth for all trading-wallet financial activity. |
| **Owner** | Trading bounded context (Ledger) |
| **Lifecycle** | `appended` (terminal — never modified, never deleted) |
| **Created by** | `LedgerService.append()` |
| **Modified by** | **Nobody.** |
| **Deleted by** | **Nobody.** |
| **Data** | `id`, `walletId`, `sequence`, `timestamp`, `entryType`, `correlationId?`, `externalRef?` (for broker dedup), `notes?` |
| **Must NOT know** | Position state, portfolio, PnL, UI |

**Entry types (discriminated union):**

| Type | Purpose | Affects |
|---|---|---|
| `TradeExecution` | Buy/sell execution | Position quantity, cash |
| `CashMovement` | Deposit, withdrawal, internal transfer, fee charge | Cash only |
| `CorporateAction` | Dividend, split, airdrop, merger, spinoff | Position quantity and/or cash |
| `CashAccrual` | Funding payment, interest, staking reward, rebate | Cash only |
| `PositionCheckpoint` | Snapshot of position state at sequence N | Replay optimization only (derived) |

---

### 2.9 TradeExecution

| Field | Value |
|---|---|
| **Purpose** | Record of a buy or sell execution. Replaces bare `Trade` as ledger entry. |
| **Owner** | Ledger (Trading) |
| **Lifecycle** | Immutable once appended |
| **Created by** | `LedgerService.append()` via broker fill, simulated execution, or compensating correction |
| **Data** | `instrumentId`, `side: BUY \| SELL`, `quantity`, `price: Money`, `fees: Money`, `fillId?`, `orderId?`, `brokerId?`, `correctsEntryId?` |
| **Cash invariant** | `BUY`: cash decreases by `quantity × price + fees`. `SELL`: cash increases by `quantity × price - fees`. |
| **Must NOT know** | Position state, portfolio, PnL |

> Compensating entries reference the original via `correctsEntryId`. Original entry is never mutated.

---

### 2.10 CashMovement

| Field | Value |
|---|---|
| **Purpose** | Value movement into, out of, or between wallets. Not a trade. |
| **Owner** | Ledger (Trading) |
| **Lifecycle** | Immutable once appended |
| **Created by** | `LedgerService.append()` via user action, broker sync, or internal transfer |
| **Data** | `movementType: DEPOSIT \| WITHDRAWAL \| INTERNAL_TRANSFER \| FEE_CHARGE`, `amount: Money`, `counterpartyWalletId?` |
| **Cash invariant** | Adjusts cash balance directly. Does not affect position quantity. |
| **Must NOT know** | Positions, portfolio |

> Replaces the former standalone `Transfer` entity. All cash movements live in the ledger.

---

### 2.11 CorporateAction

| Field | Value |
|---|---|
| **Purpose** | External event affecting holdings without user-initiated trade (dividend, split, airdrop, merger, spinoff). |
| **Owner** | Ledger (Trading) |
| **Lifecycle** | Immutable once appended |
| **Created by** | `LedgerService.append()` via broker sync or manual declaration |
| **Data** | `actionType: DIVIDEND \| SPLIT \| REVERSE_SPLIT \| AIRDROP \| MERGER \| SPINOFF`, `instrumentId`, `quantityDelta?`, `cashAmount?: Money`, `ratio?` (for splits), `exDate`, `brokerId?`, `externalRef?` |
| **Position invariant** | `SPLIT`: quantity adjusted by ratio; cost basis unchanged. `DIVIDEND`: cash credited via `cashAmount`. `AIRDROP`: quantity increased; cost basis zero or declared. |
| **Must NOT know** | Portfolio, UI |

---

### 2.12 CashAccrual

| Field | Value |
|---|---|
| **Purpose** | Periodic cash adjustment not tied to a trade or explicit deposit (funding rates, interest, staking rewards, rebates). |
| **Owner** | Ledger (Trading) |
| **Lifecycle** | Immutable once appended |
| **Created by** | `LedgerService.append()` via broker sync or scheduled accrual |
| **Data** | `accrualType: FUNDING \| INTEREST \| STAKING_REWARD \| REBATE`, `amount: Money`, `instrumentId?`, `periodStart`, `periodEnd`, `brokerId?`, `externalRef?` |
| **Cash invariant** | Adjusts cash balance. Does not affect position quantity (unless accompanied by separate CorporateAction). |
| **Must NOT know** | Portfolio, UI |

---

### 2.13 Position

| Field | Value |
|---|---|
| **Purpose** | Derived snapshot of open exposure for a trading wallet on a specific instrument. Never persisted as source of truth. |
| **Owner** | Trading bounded context (computed) |
| **Lifecycle** | Ephemeral — recomputed on every read or from checkpoint |
| **Created by** | `PositionProjector.project()` |
| **Modified by** | Recomputation only |
| **Data** | `walletId`, `instrumentId`, `quantity`, `avgEntryPrice: Money`, `costBasis: Money`, `marketPrice: Money`, `marketValue: Money`, `unrealizedPnL: Money`, `realizedPnL: Money` |
| **Knows** | Ledger entries that compose it (via replay), current market price |
| **Must NOT know** | Holdings, portfolio definitions, other wallets, UI |

**Replay rule:** Position Projector replays `TradeExecution`, `CorporateAction` (quantity-affecting), and `PositionCheckpoint` (as starting point). `CashMovement` and `CashAccrual` do not affect position quantity.

---

### 2.14 Holding

| Field | Value |
|---|---|
| **Purpose** | User-declared ownership of an asset in an inventory wallet. Atomic unit of Inventario. |
| **Owner** | Inventario bounded context |
| **Lifecycle** | `created → updated → disposed → archived` |
| **Created by** | `InventoryService.addHolding()` |
| **Modified by** | `InventoryService.updateHolding()` — revisions logged in audit trail |
| **Deleted by** | `InventoryService.disposeHolding()` (soft — marks disposed, preserves history) |
| **Data** | `id`, `walletId`, `ownerId`, `tenantId`, `instrumentId`, `quantity`, `costBasis: Money`, `acquiredAt`, `valuationMethod: MARKET \| MANUAL \| APPRAISAL`, `manualValue?: Money`, `notes?`, `disposedAt?` |
| **Must NOT know** | Trades, positions, brokers, portfolio definitions |

---

### 2.15 Order

| Field | Value |
|---|---|
| **Purpose** | Request for execution sent to a broker. May result in zero or more fills. |
| **Owner** | Trading bounded context |
| **Lifecycle** | `pending → partially_filled → filled \| cancelled \| rejected \| expired` |
| **Created by** | `TradingService.placeOrder()` |
| **Modified by** | Broker (status transitions via fills/cancellations) |
| **Deleted by** | **Nobody.** Terminal states preserved. |
| **Data** | `id`, `walletId`, `ownerId`, `tenantId`, `instrumentId`, `side`, `type: MARKET \| LIMIT \| STOP`, `quantity`, `limitPrice?: Money`, `status`, `brokerOrderId?`, `clientOrderId` (idempotency key), `createdAt`, `updatedAt` |
| **Must NOT know** | Position state, portfolio, PnL, UI |

---

### 2.16 Fill

| Field | Value |
|---|---|
| **Purpose** | Confirmation of partial or total execution of an order. Bridge between broker and ledger. |
| **Owner** | Trading bounded context |
| **Lifecycle** | `received` (terminal) |
| **Created by** | Broker adapter → `LedgerService.recordFill()` |
| **Modified by** | **Nobody.** |
| **Deleted by** | **Nobody.** |
| **Data** | `id`, `orderId`, `ledgerEntryId`, `quantity`, `price: Money`, `fees: Money`, `timestamp`, `brokerFillId?`, `externalRef?` (dedup key) |
| **Must NOT know** | Position, portfolio, UI |

---

### 2.17 Broker (Port)

| Field | Value |
|---|---|
| **Purpose** | Port defining the contract for trade execution and data synchronization with an external or simulated venue. |
| **Owner** | Broker Integration layer |
| **Lifecycle** | Stateless adapter |
| **Implemented by** | `PaperBroker`, `BinanceSpotBroker`, `BinanceFuturesBroker`, `BingXBroker`, `IBKRBroker` |
| **Contract** | `placeOrder()`, `cancelOrder()`, `getOpenOrders()`, `getFills(since?)`, `getBalances()`, `getPositions()`, `sync()` |
| **Must NOT know** | Business rules, UI, ledger internals, portfolio, other brokers |

> **PaperBroker** is the in-memory implementation used when `executionMode = SIMULATED`. It is a broker adapter, not a wallet type, not a product, not a domain entity.

---

### 2.18 Connection

| Field | Value |
|---|---|
| **Purpose** | Persistent link between a trading wallet and an external broker. Stores credentials and sync state. |
| **Owner** | Broker Integration layer |
| **Lifecycle** | `created → authenticated → active → degraded → revoked` |
| **Created by** | `ConnectionService.connect()` |
| **Modified by** | `ConnectionService` (refresh tokens, sync state) |
| **Deleted by** | `ConnectionService.revoke()` |
| **Data** | `id`, `ownerId`, `tenantId`, `brokerId`, `walletId`, `status`, `lastSyncAt`, `lastSyncError?`, `credentialsRef` (opaque) |
| **Must NOT know** | Trades, positions, portfolio, UI, business rules |

---

### 2.19 ReconciliationReport

| Field | Value |
|---|---|
| **Purpose** | Record of comparison between broker-reported state and ledger-projected state at a sync boundary. |
| **Owner** | Trading bounded context |
| **Lifecycle** | `generated` (immutable) |
| **Created by** | `ReconciliationService.reconcile()` after each broker sync |
| **Data** | `walletId`, `timestamp`, `discrepancies: ReconciliationDiscrepancy[]`, `resolution: ACCEPTED \| PENDING \| MANUAL_REVIEW` |
| **Must NOT know** | Portfolio, UI |

---

### 2.20 Snapshot

| Field | Value |
|---|---|
| **Purpose** | Immutable point-in-time observation of wallet value. Foundation for performance measurement. Not source of truth — historical record. |
| **Owner** | Account's bounded context (Trading or Inventario) |
| **Lifecycle** | `captured` (terminal — immutable) |
| **Created by** | `SnapshotService.capture()` |
| **Modified by** | **Nobody.** |
| **Deleted by** | Retention policy only (automated) |
| **Data** | `id`, `walletId`, `ownerId`, `tenantId`, `walletType`, `timestamp`, `totalValue: Money`, `cashBalance: Money`, `investedValue: Money`, `unrealizedPnL: Money`, `breakdown: SnapshotLine[]` |
| **Must NOT know** | Portfolio, UI, other wallets |

> Snapshots are **persisted observations**, not authoritative state. Current wallet value is always computed from source of truth (ledger replay or holdings). Snapshots exist for historical analysis and performance calculation only.

---

### 2.21 SnapshotLine

| Field | Value |
|---|---|
| **Purpose** | Individual asset line within a snapshot. |
| **Data** | `instrumentId`, `quantity`, `marketPrice: Money`, `marketValue: Money`, `costBasis: Money`, `unrealizedPnL: Money` |
| **Owner** | Snapshot (composition) |

---

### 2.22 AccountSummary (Published Language)

| Field | Value |
|---|---|
| **Purpose** | Read-only published contract between wallet contexts and Portfolio. The only data Portfolio may consume. |
| **Owner** | Published by Trading/Inventario; consumed by Portfolio |
| **Lifecycle** | Ephemeral — computed on every read |
| **Created by** | `TradingAccountProvider` or `InventoryAccountProvider` |
| **Data** | `walletId`, `walletType`, `asOf`, `totalValue: Money`, `cashBalance: Money`, `lines: AccountSummaryLine[]`, `currency` |
| **Versioning** | Contract version `v1`. Breaking changes require version bump. |
| **Must NOT know** | Portfolio, UI |

---

### 2.23 Performance

| Field | Value |
|---|---|
| **Purpose** | Computed measure of return over a time window. Never stored as source of truth. |
| **Owner** | Portfolio bounded context (computed) |
| **Lifecycle** | Ephemeral |
| **Created by** | `PerformanceEngine.calculate()` |
| **Data** | `portfolioId`, `window`, `returnPercent`, `returnAbsolute: Money`, `benchmarkReturnPercent?`, `alpha?`, `dataQuality: COMPLETE \| INSUFFICIENT_SNAPSHOTS` |
| **Must NOT know** | Individual trades, holdings, UI |

---

### 2.24 Pricing (Value Object)

| Field | Value |
|---|---|
| **Purpose** | Price at a point in time. |
| **Owner** | Market Data module (upstream) |
| **Data** | `instrumentId`, `price: Money`, `timestamp`, `source: REALTIME \| DELAYED \| MANUAL \| APPRAISAL` |
| **Must NOT know** | Accounts, portfolios |

---

### 2.25 Instrument

| Field | Value |
|---|---|
| **Purpose** | Definition of a tradable or trackable asset. |
| **Owner** | Market Data module |
| **Data** | `id`, `symbol`, `name`, `type: CRYPTO_SPOT \| CRYPTO_FUTURES \| EQUITY \| ETF \| BOND \| COMMODITY \| REAL_ESTATE \| CASH \| CUSTOM`, `currency`, `exchange?`, `isin?`, `metadata` |
| **Referenced by** | Ledger entries, Position, Holding, SnapshotLine |

---

### 2.26 Provider (Port)

| Field | Value |
|---|---|
| **Purpose** | Port for reading wallet state. Used by Portfolio to build projections. |
| **Contract** | `getAccountSummary(walletId) → AccountSummary`, `getSnapshot(walletId, asOf?) → Snapshot` |
| **Implemented by** | `TradingAccountProvider`, `InventoryAccountProvider` |
| **Must NOT know** | Portfolio definitions, UI |

---

### 2.27 Analytics (Namespace)

| Field | Value |
|---|---|
| **Purpose** | Namespace for computed read-only projections: `Allocation`, `Performance`, `RiskMetrics`, `Attribution`. Not an entity. |
| **Owner** | Portfolio bounded context |

---

### 2.28 Allocation

| Field | Value |
|---|---|
| **Purpose** | Computed wealth distribution by dimension. |
| **Data** | `portfolioId`, `dimension: ASSET \| SECTOR \| WALLET \| CURRENCY \| TYPE`, `slices[]`, `asOf`, `totalValue: Money` |
| **Lifecycle** | Ephemeral |

---

### 2.29 Valuation

| Field | Value |
|---|---|
| **Purpose** | Computed monetary value of a wallet at a point in time. |
| **Lifecycle** | Ephemeral (captured as Snapshot for history) |
| **Data** | `walletId`, `totalValue: Money`, `components: ValuationLine[]`, `asOf` |

---

## 3. Bounded Contexts

### Why Three Domains

Trading, Inventario, and Portfolio solve fundamentally different problems with different invariants, different sources of truth, and different mutation patterns.

### 3.1 Trading

**Question it answers:** *What financial events occurred, and what exposure do they create?*

| Belongs Here | Does NOT Belong Here |
|---|---|
| LedgerEntry (all types), Order, Fill | Holdings, manual valuations |
| Position (derived from ledger replay) | Portfolio definitions |
| TradingAccount lifecycle | Performance metrics |
| Broker execution and reconciliation | Asset allocation views |
| Cash balance from ledger replay | Inventory cost basis rules |
| CorporateAction, CashAccrual, CashMovement | Benchmark selection |

**Core invariants:**

1. Ledger entries are immutable and append-only.
2. Position is always derived from ledger replay — never stored as truth.
3. PnL is never stored — always computed from entries + market price.
4. One trading wallet maps to exactly one ledger.
5. Corrections are compensating entries referencing `correctsEntryId`, never mutations.
6. Every ledger entry has `ownerId`, `tenantId`, and monotonic `sequence`.

**Mutability pattern:** Append-only writes. Event-sourced.

---

### 3.2 Inventario

**Question it answers:** *What assets does the user own outside of trading, and what are they worth?*

| Belongs Here | Does NOT Belong Here |
|---|---|
| Holding, InventoryAccount | Ledger entries, orders, fills |
| Manual cost basis | Position (trade-derived) |
| Valuation methods (market, manual, appraisal) | Broker execution |
| Asset disposal tracking | Ledger invariants |
| Illiquid assets | Automated trade replay |

**Core invariants:**

1. Holdings are user-declared — no ledger required.
2. Cost basis is explicit, stored as `Money`.
3. Valuation method is per-holding.
4. Holdings can exist without market price (illiquid assets).
5. Disposal is soft — history preserved.
6. Every holding has `ownerId` and `tenantId`.

**Mutability pattern:** CRUD with audit trail. State-based.

---

### 3.3 Portfolio

**Question it answers:** *How is wealth distributed, and how is it performing?*

| Belongs Here | Does NOT Belong Here |
|---|---|
| Portfolio, PortfolioMember | Ledger entry creation |
| Allocation, Performance (computed) | Holding creation |
| Benchmark comparison | Broker execution |
| Snapshot consumption | Wallet lifecycle |
| Analytics projections | Individual holding valuation |

**Core invariants:**

1. Portfolio stores wallet references, never copies of financial data.
2. Portfolio never mutates wallets, ledger entries, or holdings.
3. All portfolio data is computed on demand or from snapshots.
4. Performance requires snapshot history — returns `INSUFFICIENT_SNAPSHOTS` otherwise (P13).
5. Portfolio members are unique per wallet.
6. Every portfolio has `ownerId`, `tenantId`, and `aggregationCurrency`.

**Mutability pattern:** Read-only projections. Definition changes only.

---

### Context Map

```
┌──────────────┐         ┌──────────────┐
│   Trading    │         │  Inventario  │
│              │         │              │
│ Ledger (SSOT)│         │ Holdings     │
│ Positions    │         │ (SSOT)       │
│ Orders/Fills │         │ Valuations   │
└──────┬───────┘         └──────┬───────┘
       │                        │
       │  AccountSummary v1     │  AccountSummary v1
       │  (published)           │  (published)
       │                        │
       └────────┬───────────────┘
                │
                ▼
       ┌────────────────┐
       │   Portfolio    │
       │  (read-only)   │
       └────────────────┘
                │
                ▼
       ┌────────────────┐
       │  Market Data   │  (upstream)
       └────────────────┘
```

**Integration patterns:**

| From → To | Pattern |
|---|---|
| Trading → Portfolio | Published language (`AccountSummary v1`) |
| Inventario → Portfolio | Published language (`AccountSummary v1`) |
| Market Data → Trading, Inventario | Conformist (read-only) |
| Broker → Trading | Anti-corruption layer |
| Portfolio → Trading, Inventario | **Forbidden** |

---

## 4. Relationships & Diagrams

### 4.1 Trading Domain

```
TradingAccount (Wallet)
    │
    ├── has one ──→ Ledger (1)
    │                   │
    │                   └── contains many ──→ LedgerEntry (N)  [append-only]
    │                         ├── TradeExecution
    │                         ├── CashMovement
    │                         ├── CorporateAction
    │                         ├── CashAccrual
    │                         └── PositionCheckpoint (derived)
    │
    ├── connected via ──→ Connection (0..1)
    │                         │
    │                         └── uses ──→ Broker (adapter)
    │
    ├── produces ──→ Order (N) ──→ Fill (N) ──→ LedgerEntry
    │
    ├── reconciles ──→ ReconciliationReport (N)
    │
    └── projects ──→ Position (N)  [derived, ephemeral]
                          │
                          └── valued with ──→ Pricing
```

### 4.2 Inventario Domain

```
InventoryAccount (Wallet)
    │
    ├── contains many ──→ Holding (N)
    │                         │
    │                         ├── references ──→ Instrument
    │                         └── valued via ──→ Valuation
    │
    └── captures ──→ Snapshot (N)  [immutable observation]
```

### 4.3 Portfolio Domain

```
Portfolio (1)
    │
    ├── contains many ──→ PortfolioMember (N) ──→ WalletRef
    │                         │
    │                    ┌────┴────┐
    │              TradingAccount  InventoryAccount
    │                    │              │
    │              AccountSummary  AccountSummary
    │              (via Provider)   (via Provider)
    │
    ├── projects ──→ Allocation (computed)
    │
    └── projects ──→ Performance (computed)
                          │
                          └── requires ──→ Snapshot series
```

### 4.4 Complete System Diagram

```
                    ┌─────────────────────┐
                    │     Market Data      │
                    │  Instrument, Pricing │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │   Trading   │     │  Inventario │     │   Broker    │
   │   Wallet    │     │   Wallet    │     │ Integration │
   │   Ledger    │     │   Holding   │     │ Connection  │
   │   Position  │     │             │     │ Broker Port │
   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
          │                   │                   │
          │    AccountSummary v1 (published)      │
          └───────────────────┼───────────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │       Portfolio         │
                 │  Definition (refs only) │
                 │  Allocation             │
                 │  Performance            │
                 └─────────────────────────┘
```

### 4.5 Cardinality Reference

| Relationship | Cardinality | Type |
|---|---|---|
| TradingAccount → Ledger | 1:1 | Composition |
| Ledger → LedgerEntry | 1:N | Composition (append-only, paginated) |
| Order → Fill | 1:N | Composition |
| Fill → LedgerEntry (TradeExecution) | 1:1 | Generation |
| TradingAccount → Connection | 1:0..1 | Association |
| TradingAccount → Position | 1:N | Derivation |
| InventoryAccount → Holding | 1:N | Composition |
| Portfolio → PortfolioMember | 1:N | Composition |
| PortfolioMember → Wallet | N:1 | Reference |
| Wallet → Snapshot | 1:N | Observation (persisted) |
| TradingAccount → ReconciliationReport | 1:N | Association |

---

## 5. Engines

Engines are **stateless domain services**. They compute; they do not own persistence. Persistence is delegated to repositories in the application/infrastructure layer.

### 5.1 Trading Engine

| | |
|---|---|
| **Does** | Validate orders, check buying power (via ledger replay), route to broker, record fills as ledger entries |
| **Never does** | Persist directly, compute portfolio, manage holdings, know UI |
| **Depends on** | `LedgerService`, `Broker` port, `Pricing` |

### 5.2 Ledger Engine

| | |
|---|---|
| **Does** | Append entries, enforce immutability, compute cash via replay, validate entry invariants, seal on archival |
| **Never does** | Modify/delete entries, compute positions, know portfolio |
| **Cash replay order** | `initialCash` → all entries chronologically by `sequence` |

### 5.3 Position Engine

| | |
|---|---|
| **Does** | Replay `TradeExecution` + `CorporateAction` entries (or from `PositionCheckpoint`), apply cost basis policy, compute PnL |
| **Never does** | Persist positions, know portfolio |
| **Scalability** | Supports checkpoint-based replay: replay from last `PositionCheckpoint` + subsequent entries only |

### 5.4 Inventory Engine

| | |
|---|---|
| **Does** | CRUD holdings, validate invariants, compute valuations, record disposals |
| **Never does** | Create ledger entries, know portfolio |

### 5.5 Valuation Engine

| | |
|---|---|
| **Does** | Compute wallet value: trading (positions + cash) or inventory (holdings per method) |
| **Never does** | Store as truth (Snapshot Service persists observations) |

### 5.6 Snapshot Service

| | |
|---|---|
| **Does** | Invoke Valuation Engine, persist immutable Snapshot, manage retention |
| **Note** | Classified as application service (persists), not pure domain engine |

### 5.7 Portfolio Engine

| | |
|---|---|
| **Does** | Resolve members, fetch `AccountSummary` via providers, aggregate allocation, orchestrate performance |
| **Never does** | Mutate wallets, ledger, holdings, or connections |

### 5.8 Performance Engine

| | |
|---|---|
| **Does** | Time-weighted return from snapshot series, benchmark comparison, alpha |
| **Never does** | Invent data; returns `INSUFFICIENT_SNAPSHOTS` when history is inadequate |

### 5.9 Pricing Engine

| | |
|---|---|
| **Does** | Resolve price from Market Data port, FX conversion via `Money.convert()` |
| **Never does** | Store prices, know accounts |

### 5.10 Reconciliation Service

| | |
|---|---|
| **Does** | Compare broker-reported positions/cash vs ledger-projected state; produce `ReconciliationReport` |
| **Never does** | Silently overwrite ledger; discrepancies require explicit resolution |

### Engine Dependency Graph

```
Market Data
      │
      ▼
Pricing Engine
      │
      ├──────────────────┐
      ▼                  ▼
Position Engine    Inventory Engine
      │                  │
      ▼                  ▼
Valuation Engine ←───────┘
      │
      ▼
Snapshot Service (persists observations)
      │
      ▼
Performance Engine
      │
      ▼
Portfolio Engine

Trading Engine → Ledger Engine → Position Engine
Reconciliation Service → Ledger Engine
Broker (adapter) → Trading Engine
```

---

## 6. Broker Layer

### 6.1 Design

All broker integrations implement the same `Broker` port. Domain logic does not branch on broker type.

```
Broker (port)
    ├── PaperBroker          (in-memory, SIMULATED mode)
    ├── BinanceSpotBroker
    ├── BinanceFuturesBroker
    ├── BingXBroker
    └── IBKRBroker
```

### 6.2 PaperBroker Semantics

| Concept | Definition |
|---|---|
| **What Paper is** | In-memory `Broker` adapter. Executes orders instantly. Returns fills. |
| **What Paper is NOT** | A wallet type. A product. A domain entity. An executionMode. |
| **When it is used** | Automatically when `TradingAccount.executionMode = SIMULATED`. |
| **SSOT** | Ledger is the sole source of truth. No external sync. No reconciliation. |

### 6.3 Anti-Corruption Layer

| Responsibility | Owner |
|---|---|
| Protocol translation | Broker adapter |
| Instrument symbol mapping | Broker adapter |
| Auth and rate limiting | Broker adapter |
| Business validation (buying power, risk) | Trading Engine |
| Ledger append | Ledger Engine |
| Position projection | Position Engine |
| Reconciliation | Reconciliation Service |

### 6.4 Single Source of Truth Policy

| executionMode | Position SSOT | Cash SSOT | Event History SSOT | Reconciliation |
|---|---|---|---|---|
| `SIMULATED` | Ledger replay | Ledger replay | Ledger | Not required |
| `BROKER_LINKED` | Ledger replay (projected) | Ledger replay (projected) | Ledger (imported entries) | **Required at every sync** |

**Broker-linked reconciliation flow:**

```
Broker.sync()
    → Import fills as TradeExecution entries (dedup by externalRef)
    → Import cash movements, corporate actions, accruals
    → ReconciliationService.compare(brokerState, ledgerProjection)
    → If discrepancy:
        → Generate ReconciliationReport
        → Resolution: auto-accept (within tolerance) | manual review | compensating entry
    → Never silently overwrite ledger entries
```

**Tolerance:** Configurable per broker. Default: exact match required for cash; quantity tolerance for positions (lot size rounding).

### 6.5 Connection Lifecycle

```
connect(brokerId, credentials)
    → authenticate
    → initial sync (import history as ledger entries)
    → reconcile
    → periodic sync + reconcile
    → revoke (seal connection; ledger preserved)
```

---

## 7. Portfolio (Analytical System)

### Definition

A **Portfolio** is a named, persistent **view configuration** over wallets. It is a lens, not a container.

### What Portfolio IS

- A saved query: "show me these wallets, aggregated this way."
- A reference graph: `PortfolioMember → WalletRef`.
- A consumer of `AccountSummary v1` and snapshots.
- A producer of analytical projections.

### What Portfolio is NOT

| Misconception | Reality |
|---|---|
| Portfolio stores assets | Portfolio stores wallet references only |
| Portfolio duplicates data | Portfolio reads via providers |
| Portfolio is a wallet | Portfolio holds no value |
| Portfolio computes positions | Portfolio consumes pre-computed summaries |
| Portfolio invents performance | Returns `INSUFFICIENT_SNAPSHOTS` if data is missing |

### System Portfolios

| Portfolio | Members | Behavior |
|---|---|---|
| **Total Wealth** | All active wallets for `ownerId` | Virtual — resolved at query time, not stored as static member list |
| User-defined | Explicit `PortfolioMember[]` | Stored references |

> **Total Wealth** is a query policy, not a stored portfolio with auto-mutating members. It resolves all active wallets for the owner at read time.

### Portfolio Never Writes

```
Portfolio ──reads──→ AccountSummary (via Provider)
Portfolio ──reads──→ Snapshot (via SnapshotStore)
Portfolio ──NEVER──→ Ledger, Holdings, Orders, Connections
```

---

## 8. Wallet

### Definition

**Wallet** is the canonical aggregate root of Cartera. It represents a single financial container that holds value.

`TradingAccount` and `InventoryAccount` are specialized wallet types. `Account` is a technical alias used in polymorphic references.

### Terminology Matrix

| Layer | Term | Meaning |
|---|---|---|
| Domain (canonical) | **Wallet** | Aggregate root |
| Domain (specialized) | `TradingAccount` | Wallet with ledger |
| Domain (specialized) | `InventoryAccount` | Wallet with holdings |
| Domain (polymorphic) | `Account` / `WalletRef` | Reference to any wallet |
| Product / UI | "Wallet" | What the user sees and manages |
| Infrastructure | `PaperBroker` | Adapter for simulated execution |
| Domain | `SIMULATED` | Execution mode, not a name |

### What Wallet Administers

- Its own ledger (trading) or holdings (inventory).
- Its own broker connection (if broker-linked).
- Its own snapshots.
- Its own `ownerId` and `tenantId`.

### What Wallet Never Does

- Analyze other wallets (Portfolio's job).
- Compute performance (Portfolio's job).
- Store other wallets' data.
- Execute orders for other wallets.

### Wallet vs Portfolio

```
Wallet (AR)     = holds value, owns financial events
Portfolio       = analyzes value, owns only references
```

---

## 9. Inventario (Holdings)

### Definition

**Inventario** tracks assets not managed through the trading ledger.

### Holding vs Position

| Dimension | Position (Trading) | Holding (Inventario) |
|---|---|---|
| Origin | Derived from ledger replay | User-declared |
| Mutability | Ephemeral | Mutable with audit trail |
| Cost basis | Computed (FIFO/LIFO/Avg) | Explicit `Money` |
| Requires ledger | Yes | No |
| Illiquid assets | No | Yes |
| Owner | Trading wallet | Inventory wallet |

### Cross-Domain Rule

> An instrument may be held in a trading wallet (as position) **or** tracked in an inventory wallet (as holding), **never both simultaneously** for the same `ownerId`. If a user trades BTC via broker and also holds BTC manually, these are separate wallets with separate semantics.

---

## 10. Architecture Principles

### P1 — Single Source of Truth

| Data | SSOT |
|---|---|
| Financial events (simulated) | Ledger entries |
| Financial events (broker-linked) | Ledger entries (imported); broker is SSOT at sync boundary |
| Holdings | InventoryAccount holdings |
| Wallet metadata | Wallet entity |
| Market prices | Market Data module |
| Portfolio definition | Portfolio entity (references only) |
| Positions | Derived from ledger replay |
| Performance | Derived from snapshots |
| Allocation | Derived from AccountSummary |

### P2 — Composition over Duplication

Portfolio composes `AccountSummary`. Never copies financial data.

### P3 — Portfolio Never Owns Assets

Portfolio stores `PortfolioMember` references only.

### P4 — Broker Never Owns Business Logic

Brokers translate protocols. Business validation belongs to Trading Engine.

### P5 — Engines Never Know UI

Engines are pure domain services. No screens, no navigation.

### P6 — UI Consumes Domain

Presentation calls application services. Application services call engines. Dependencies flow inward.

### P7 — No Entity Created for Presentation

Screens consume projections, not the reverse.

### P8 — Ledger Is Append-Only

Entries are never modified or deleted. Corrections use compensating entries with `correctsEntryId`.

### P9 — Derived State Is Not Authoritative; Observations Are Persisted

Positions, valuations, allocations, and performance are computed and never authoritative for mutation decisions. **Snapshots are immutable point-in-time observations** persisted for historical analysis and performance calculation. A snapshot does not replace the source of truth — it records what was observed at capture time. Current state is always computed from ledger or holdings.

### P10 — Bounded Contexts Do Not Call Each Other

Portfolio reads published `AccountSummary v1`. Never calls Trading or Inventario directly.

### P11 — Immutability by Default

Ledger entries, fills, and snapshots are immutable. Holdings are mutable with audit trail.

### P12 — Explicit Over Implicit

Cost basis, valuation method, execution mode, and currency are always explicit. No bare numbers.

### P13 — Fail Closed on Missing Data

Insufficient snapshots → `INSUFFICIENT_SNAPSHOTS`. Never invent metrics.

### P14 — Domain Language Is Ubiquitous

One meaning per term. See Naming Conventions (§2). "Paper" is never a domain entity name.

### P15 — Ports and Adapters

External dependencies accessed through ports. Domain never imports infrastructure.

### P16 — Idempotent Operations

Ledger append idempotent by `id`. Broker import idempotent by `externalRef`. Order placement idempotent by `clientOrderId`. Snapshot capture idempotent by `(walletId, timestamp)`.

### P17 — Audit Everything

Every mutation produces an audit record with `who`, `when`, `what`, `previousValue`.

### P18 — Time Is a First-Class Concept

Every financial value has a timestamp. Snapshots capture point-in-time. Performance measures intervals.

### P19 — Reconciliation Is Explicit

Broker-linked wallets must reconcile at every sync. Discrepancies produce `ReconciliationReport`. Ledger is never silently overwritten.

### P20 — Every Persistent Entity Has an Owner

All entities carry `ownerId` and `tenantId` from v1. No orphan financial records.

### P21 — Money Is Typed

No bare `number` for financial quantities. Use `Money` or explicit currency context.

---

## 11. Evolution Roadmap

### Phase 1 — Domain

| Deliverable | Description |
|---|---|
| Entity types | All §2 entities including `Money`, `LedgerEntry` union, tenancy fields |
| Engine interfaces | All §5 engines + Reconciliation Service |
| Port definitions | `Broker`, `Provider`, `MarketData`, repositories |
| Invariant tests | Ledger immutability, entry replay, cash invariants, holding valuation, tenancy |
| Published contract | `AccountSummary v1` |
| Legacy migration plan | Mapping from current `lib/portfolio/` |

**Exit criteria:** All types compile. Invariant tests pass. Zero UI dependencies. `Money` used throughout.

---

### Phase 2 — Engines

| Deliverable | Description |
|---|---|
| All engines | Trading, Ledger, Position (with checkpoint), Inventory, Valuation, Pricing, Performance, Portfolio, Reconciliation |
| PaperBroker | In-memory broker adapter |
| Full lifecycle | Simulated trading + inventory + portfolio projection in memory |

**Exit criteria:** Full simulated lifecycle works in memory.

---

### Phase 3 — Persistence

| Deliverable | Description |
|---|---|
| Repositories | Ledger (paginated entries), wallets, holdings, snapshots, connections, portfolios |
| Tenancy enforcement | All queries scoped by `tenantId` |
| Migration | Legacy AsyncStorage → new schema |

**Exit criteria:** Domain persists across restarts. Tenancy enforced.

---

### Phase 4 — Cloud Sync

| Deliverable | Description |
|---|---|
| Event-based sync | Ledger entries and holding revisions as sync units |
| Conflict resolution | Append-only for ledger; revision-based for holdings; LWW for wallet metadata only |
| Encryption | End-to-end for financial data |

**Exit criteria:** Consistent data across two devices for same `ownerId`.

---

### Phase 5 — Real Brokers

| Deliverable | Description |
|---|---|
| Broker adapters | Binance Spot, Binance Futures, BingX |
| Connection service | Auth, sync, reconciliation |
| Corporate action import | Dividends, splits, funding as ledger entries |
| Multi-instrument | Full instrument catalog |

**Exit criteria:** Broker-linked wallet with real sync, reconciliation, and accurate positions.

---

### Phase 6 — Advanced Portfolio

| Deliverable | Description |
|---|---|
| Custom portfolios | User-defined wallet selections |
| Benchmarks | BTC, S&P 500, custom |
| Performance attribution | Return decomposition |
| Historical charts | Equity curve from snapshots |

**Exit criteria:** 90-day real performance with benchmark.

---

### Phase 7 — Multi-User

| Deliverable | Description |
|---|---|
| Shared portfolios | Read-only sharing via `tenantId` |
| Household wallets | Multiple `ownerId` under one `tenantId` |
| Access control | Role-based permissions |

**Exit criteria:** Two users view shared portfolio with correct permissions.

---

### Phase 8 — Public API

| Deliverable | Description |
|---|---|
| REST API | AccountSummary, portfolio projections, snapshots |
| Webhooks | Entry appended, snapshot captured, holding updated |
| API keys | Scoped by `tenantId` with rate limiting |

**Exit criteria:** Third-party reads portfolio allocation via API.

---

## 12. Future Proof

### Architectural Foundations

1. **Event-sourced ledger** — append-only entries scale by pagination and checkpoints.
2. **Typed money** — multi-currency ready from v1.
3. **Tenancy from v1** — multi-user requires no migration.
4. **Reconciliation protocol** — broker integration is safe by design.
5. **Published contracts** — `AccountSummary v1` evolves independently of wallet internals.
6. **Separated domains** — Trading, Inventario, Portfolio evolve independently.

### Timeline Confidence

| Horizon | Confidence | Key enabler |
|---|---|---|
| 1 year | High | Phase 1–3 complete |
| 3 years | High | Broker adapters + sync (Phase 4–5) |
| 5 years | Medium-High | Multi-currency, tax lots via entry metadata |
| 10 years | Medium | Requires checkpoint archival, broker marketplace — but no domain rewrite |

### Known v1 Limitations (not P0 — deferred)

- Short selling and margin (Position model is long-biased v1).
- Multi-leg orders (options spreads).
- `Broker` port may need capability sub-interfaces for IBKR (P1).
- FX aggregation policy for multi-currency portfolios (P1).

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Wallet** | Aggregate root — financial container (canonical domain term) |
| **TradingAccount** | Wallet type for execution and ledger |
| **InventoryAccount** | Wallet type for manual holdings |
| **Account** | Technical alias / polymorphic reference to Wallet |
| **Cartera** | Unified financial domain module |
| **Ledger** | Append-only financial event stream |
| **LedgerEntry** | Immutable event within a ledger |
| **PaperBroker** | In-memory broker adapter (not a domain entity) |
| **SIMULATED** | Execution mode using PaperBroker |
| **Portfolio** | Analytical view configuration (not a container) |
| **Snapshot** | Immutable point-in-time observation (not SSOT) |
| **AccountSummary** | Published read contract between wallets and portfolio |
| **Money** | Typed monetary value object |
| **ReconciliationReport** | Broker vs ledger comparison record |

## Appendix B — Entity Quick Reference

```
PERSISTED (source of truth):
  TradingAccount, InventoryAccount, LedgerEntry*, Holding,
  Order, Fill, Ledger, Snapshot, Connection, Portfolio,
  ReconciliationReport

  * LedgerEntry subtypes: TradeExecution, CashMovement,
    CorporateAction, CashAccrual, PositionCheckpoint

DERIVED (computed, not authoritative):
  Position, Valuation, Allocation, Performance, AccountSummary

OBSERVATIONS (persisted, not authoritative):
  Snapshot, PositionCheckpoint

PORTS:
  Broker, Provider, MarketData, LedgerRepository,
  WalletRepository, HoldingRepository, SnapshotStore, ConnectionStore

VALUE OBJECTS:
  Money, Pricing, WalletRef, PortfolioMember, SnapshotLine,
  BrokerOrderParams, ReconciliationDiscrepancy

TENANCY (required on all persisted entities):
  ownerId, tenantId
```

---

*End of document — DOMAIN_MODEL v1.0 Frozen Contract Candidate.*
