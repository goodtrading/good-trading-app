# Financial Backend Architecture Spec

**Version:** 1.0  
**Status:** Frozen — Companion to `DOMAIN_MODEL.md` v1.0  
**Audience:** Backend engineers, architects, SRE  
**Scope:** Cartera module — backend layers, data flows, engines, integration. No UI.

**Authority chain:** `DOMAIN_MODEL.md` defines entities and invariants. This document defines how they are orchestrated, persisted, and served. On conflict, domain model wins.

---

## Table of Contents

1. [System Layers](#1-system-layers)
2. [End-to-End Data Flow](#2-end-to-end-data-flow)
3. [Single Source of Truth](#3-single-source-of-truth)
4. [Engine Boundaries](#4-engine-boundaries)
5. [Event Model](#5-event-model)
6. [Wallet vs Inventario vs Portfolio](#6-wallet-vs-inventario-vs-portfolio)
7. [Broker Integration Model](#7-broker-integration-model)
8. [Performance Model](#8-performance-model)
9. [Critical Risks](#9-critical-risks)

---

## 1. System Layers

Cartera backend is organized in six logical layers. Dependencies flow **inward only**: Infrastructure → Application → Domain. Read models and cache are **downstream projections**, never upstream inputs to mutation paths.

```
┌─────────────────────────────────────────────────────────────────┐
│  API / Command Bus / Query Bus          (delivery mechanism)    │
├─────────────────────────────────────────────────────────────────┤
│  READ MODELS + CACHE + SNAPSHOT STORE   (query side)            │
├─────────────────────────────────────────────────────────────────┤
│  APPLICATION LAYER                      (orchestration)         │
├─────────────────────────────────────────────────────────────────┤
│  DOMAIN LAYER                           (pure business logic)     │
├─────────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE LAYER                   (adapters, persistence)   │
└─────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   External Brokers              Market Data Module
   Identity Module               (upstream)
```

---

### 1.1 Domain Layer

**Purpose:** Pure financial business logic. Zero I/O. Zero framework. Zero persistence.

| Lives here | Does NOT live here |
|---|---|
| Value objects: `Money`, `Pricing`, `WalletRef`, `BrokerOrderParams` | Database drivers |
| Entities (in-memory representations): `LedgerEntry` subtypes, `Order`, `Fill`, `Holding`, `Portfolio`, `PortfolioMember` | HTTP clients |
| Aggregate invariants: `Ledger`, `TradingAccount`, `InventoryAccount` | Broker API calls |
| Domain services (engines): Trading, Ledger, Position, Inventory, Valuation, Performance, Reconciliation **logic** | Snapshot persistence |
| Domain events (types only): `LedgerEntryAppended`, `HoldingUpdated`, `OrderFilled` | Cache |
| Ports (interfaces): `Broker`, `Provider`, `MarketDataPort`, `LedgerRepository`, `WalletRepository`, `HoldingRepository`, `SnapshotStore`, `ConnectionStore`, `PortfolioRepository`, `UnitOfWork` | React, UI state |
| Domain errors: `InsufficientCash`, `InsufficientPosition`, `LedgerSealed`, `ReconciliationRequired` | Read model builders |

**Package structure (conceptual):**

```
domain/
├── shared/          Money, WalletRef, TenantId, UserId
├── trading/         Ledger, LedgerEntry*, Order, Fill, Position (type)
├── inventario/      Holding, InventoryAccount (invariants)
├── portfolio/       Portfolio, PortfolioMember, Allocation, Performance (types)
├── ports/           Broker, Provider, MarketDataPort, *Repository
└── services/        Engine pure functions / domain services
```

**Rule:** If it touches a network, disk, or clock (except injected `Clock` port), it is NOT domain.

---

### 1.2 Application Layer

**Purpose:** Orchestrate use cases. Transaction boundaries. Call engines + repositories. Publish domain events to projection handlers.

| Lives here | Does NOT live here |
|---|---|
| Command handlers: `PlaceOrder`, `AppendCashMovement`, `AddHolding`, `CreateWallet`, `ConnectBroker`, `SyncBroker`, `CaptureSnapshot`, `CreatePortfolio` | Position replay math |
| Query handlers: `GetWalletSummary`, `GetPortfolioAllocation`, `GetPerformance` | Broker protocol translation |
| Application services: `TradingAppService`, `InventoryAppService`, `PortfolioAppService`, `BrokerSyncAppService`, `SnapshotAppService` | SQL/AsyncStorage |
| DTOs (command/query): `PlaceOrderCommand`, `WalletSummaryQuery` | UI components |
| Unit of work coordination | Domain invariants |
| Event dispatch to projection workers | Direct ledger mutation bypassing Ledger Engine |
| Authorization gate: verify `ownerId`/`tenantId` on every command | |

**Package structure (conceptual):**

```
application/
├── commands/
├── queries/
├── handlers/
├── services/        App services composing engines + repos
└── events/          Domain event handlers (trigger projections)
```

**Rule:** Application coordinates; it does not compute PnL, replay ledger, or translate broker protocols.

---

### 1.3 Infrastructure Layer

**Purpose:** Implement ports. Talk to the outside world.

| Lives here | Does NOT live here |
|---|---|
| `PaperBroker`, `BinanceSpotBroker`, `BingXBroker`, `IBKRBroker` | Business validation |
| `SqlLedgerRepository`, `SqlWalletRepository`, etc. | Position projection |
| `EncryptedConnectionStore` | Portfolio aggregation logic |
| `MarketDataHttpAdapter` | Domain entities |
| `IdentityContextAdapter` (resolves tenant from JWT) | |
| `OutboxPublisher`, `EventBus` (Kafka/SQS/local) | |
| `Clock`, `IdGenerator` adapters | |
| Migration scripts | |

**Package structure (conceptual):**

```
infrastructure/
├── brokers/
├── persistence/
├── marketdata/
├── identity/
├── messaging/
└── config/
```

**Rule:** Infrastructure is replaceable. Domain must compile without it.

---

### 1.4 Read Models

**Purpose:** Optimized query-side projections. Denormalized. Disposable and rebuildable from source of truth.

| Read model | Built from | Used by |
|---|---|---|
| `WalletSummaryRM` | Ledger replay + Pricing / Holdings + Pricing | Wallet detail queries |
| `AccountSummary v1` | `WalletSummaryRM` (published contract to Portfolio) | Portfolio Engine |
| `PortfolioAllocationRM` | AccountSummary aggregation | Portfolio queries |
| `PortfolioPerformanceRM` | Snapshot series | Performance charts |
| `OpenOrdersRM` | Order table | Order list queries |
| `BrokerSyncStatusRM` | Connection + last ReconciliationReport | Sync health dashboard |
| `WalletListRM` | WalletRepository metadata | Wallet picker |

**Rules:**

1. Read models are **never** source of truth.
2. Read models are updated **eventually** via domain event handlers or synchronous post-commit projection (v1: synchronous acceptable for mobile single-user; cloud v2: async).
3. Read models may be **dropped and rebuilt** from ledger + holdings + snapshots.
4. Portfolio reads **only** `AccountSummary v1` — never ledger or holdings directly.

---

### 1.5 Cache Layer

**Purpose:** Latency reduction for hot paths. Invalidated on writes.

| Cache key pattern | Content | TTL | Invalidation trigger |
|---|---|---|---|
| `position:{walletId}:{instrumentId}` | Projected `Position` | Short (30s) or until write | `LedgerEntryAppended` |
| `cash:{walletId}` | Cash balance from replay | Short | `LedgerEntryAppended` |
| `price:{instrumentId}:{currency}` | `Pricing` VO | Market-driven (5–30s) | Market Data push |
| `wallet_summary:{walletId}` | `WalletSummaryRM` | Until write | Any wallet mutation |
| `portfolio_alloc:{portfolioId}` | `PortfolioAllocationRM` | Until member wallet changes | Wallet event or portfolio definition change |

**Rules:**

1. Cache miss → compute from source of truth (ledger/holdings), never from stale read model alone.
2. Cache is **not** a persistence tier.
3. On write: invalidate before responding, or use versioned cache keys (`walletId:v{sequence}`).

---

### 1.6 Snapshot System

**Purpose:** Immutable point-in-time observations for performance measurement and audit. **Not** source of truth for current balances.

| Component | Layer | Role |
|---|---|---|
| `Snapshot` entity | Domain (type) | Immutable observation record |
| `SnapshotAppService` | Application | Orchestrate capture |
| `ValuationEngine` | Domain | Compute value at `asOf` |
| `SnapshotStore` port | Domain | Interface |
| `SqlSnapshotStore` | Infrastructure | Persist snapshots |
| Snapshot scheduler | Application/Infrastructure | Periodic capture (daily, post-sync) |

**Capture triggers:**

| Trigger | When |
|---|---|
| Scheduled | Daily 00:00 UTC per wallet |
| Post-sync | After successful broker reconciliation |
| On-demand | User requests "capture now" |
| Post-large-move | Optional: threshold on equity change |

**Retention tiers:**

| Tier | Age | Storage |
|---|---|---|
| Hot | 0–90 days | Primary DB |
| Warm | 90 days–2 years | Compressed partition |
| Cold | 2+ years | Object storage / archive |

---

### 1.7 UI State

**Not part of Cartera backend.** Presentation layer owns selection state (active wallet, active portfolio, chart range). Backend exposes stateless queries and idempotent commands. Backend does not store UI preferences inside domain entities.

---

## 2. End-to-End Data Flow

### 2.1 Reference Flow: "User buys BTC in Paper (SIMULATED) Wallet"

**Preconditions:**

- `TradingAccount` exists: `walletId=W1`, `executionMode=SIMULATED`, `ownerId=U1`, `tenantId=T1`
- `Ledger` initialized: `initialCash=Money(100000, USDT)`
- `PaperBroker` adapter bound to W1
- Market price available: `BTC/USDT = 95000`

---

#### Step 0 — Ingress

```
INPUT (Command):
  PlaceOrderCommand {
    walletId: W1,
    ownerId: U1,
    tenantId: T1,
    instrumentId: BTC-USDT,
    side: BUY,
    type: MARKET,
    quantity: 0.5,
    clientOrderId: "cli_abc123"    // idempotency key
  }
```

**Entry point:** `PlaceOrderHandler` (Application)

---

#### Step 1 — Authorization & load

```
Application:
  1. Verify U1 owns W1 under T1
  2. Load TradingAccount aggregate metadata
  3. Load Ledger head (last sequence, initialCash)
  4. Resolve Broker → PaperBroker
  5. Fetch Pricing for BTC-USDT
```

---

#### Step 2 — Trading Engine (domain)

```
TradingEngine.placeOrder():
  INPUT:  account, orderParams, broker, pricing, ledgerHead, clock
  ACTIONS:
    - Validate quantity > 0
    - Validate instrument supported
    - LedgerEngine.computeCashBalance(ledgerHead) → Money(100000, USDT)
    - Required cash = 0.5 × 95000 + estimatedFees → Money(47525, USDT)
    - Assert sufficient cash
    - Create Order entity (status: PENDING)
  OUTPUT: Order (pending), validated
```

**Trading Engine does NOT persist.**

---

#### Step 3 — Broker execution (infrastructure adapter)

```
PaperBroker.placeOrder():
  INPUT:  orderParams
  ACTIONS:
    - Simulate instant fill at market price
  OUTPUT: Fill {
    quantity: 0.5,
    price: Money(95000, USDT),
    fees: Money(25, USDT),
    brokerFillId: null,
    externalRef: "paper_fill_xyz"
  }
```

---

#### Step 4 — Ledger Engine (domain) — append entries

```
LedgerEngine.appendTradeExecution():
  INPUT:  fill, order, walletId
  ACTIONS:
    - Build TradeExecution entry:
        sequence: 1,
        side: BUY,
        quantity: 0.5,
        price: Money(95000, USDT),
        fees: Money(25, USDT),
        fillId: F1,
        orderId: O1
    - Validate cash invariant: BUY debits 47500 + 25 fees
    - Assign monotonic sequence
  OUTPUT: LedgerEntry (TradeExecution), domain event LedgerEntryAppended
```

**No CashMovement entry** — trade execution handles cash delta atomically within `TradeExecution`.

```
Ledger state after:
  sequence 0: (initialCash = 100000 USDT)
  sequence 1: TradeExecution BUY 0.5 BTC @ 95000, fees 25
  projected cash: 100000 - 47500 - 25 = 52475 USDT
```

---

#### Step 5 — Persistence (application + infrastructure)

```
Application (Unit of Work):
  1. Persist Order (status: FILLED)
  2. Persist Fill
  3. LedgerRepository.append(entry) — atomic, idempotent by entry.id
  4. Commit transaction
  5. Dispatch LedgerEntryAppended event
```

---

#### Step 6 — Projections (post-commit)

```
Event handler: OnLedgerEntryAppended
  1. PositionEngine.project(walletId, fromCheckpoint)
     → Position { BTC: qty 0.5, avgEntry 95000, costBasis 47500 }
  2. Invalidate cache: position:W1:BTC, cash:W1, wallet_summary:W1
  3. Update WalletSummaryRM (read model)
  4. Publish AccountSummary v1 (for portfolio consumption)
```

**Snapshot is NOT updated synchronously on every trade** (too expensive). Snapshot scheduler captures on next daily run or explicit trigger.

---

#### Step 7 — Portfolio recalculation (on next read, not on write path)

```
Portfolio is NOT notified on write in v1.

On next GetPortfolioAllocation query:
  PortfolioAppService:
    1. Load Portfolio definition (members)
    2. For each member wallet → Provider.getAccountSummary(walletId)
    3. PortfolioEngine.aggregate(summaries) → Allocation
```

**Write path does not block on portfolio recomputation.**

---

#### Step 8 — Query response (what backend serves)

```
OUTPUT (Query): WalletSummaryQuery(W1)
  WalletSummaryRM {
    walletId: W1,
    totalValue: Money(99975, USDT),   // 52475 cash + 0.5×95000
    cashBalance: Money(52475, USDT),
    positions: [{ BTC, qty 0.5, unrealizedPnL: 0 }],
    asOf: timestamp,
    ledgerSequence: 1
  }
```

UI consumes this via API. **Backend does not render UI.**

---

#### Flow diagram

```
PlaceOrderCommand
       │
       ▼
┌──────────────────┐
│ PlaceOrderHandler│  Application
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
TradingEngine  PaperBroker (infra)
    │              │
    │         Fill │
    ▼              │
LedgerEngine ◄─────┘
    │
    ▼
LedgerRepository.append()     Infrastructure
    │
    ▼ (post-commit)
PositionEngine → Cache invalidation → WalletSummaryRM
    │
    ▼ (on next portfolio query)
PortfolioEngine ← AccountSummary v1
```

---

## 3. Single Source of Truth

### 3.1 SSOT Matrix

| Data | SSOT (SIMULATED) | SSOT (BROKER_LINKED) | Never SSOT |
|---|---|---|---|
| **Cash balance** | Ledger replay (`initialCash` + all entries) | Ledger replay (imported entries) | Cache, read models, broker balance alone |
| **Position quantity** | Ledger replay (`TradeExecution` + `CorporateAction`) | Ledger replay; broker compared at sync | Broker `getPositions()` alone, read models |
| **Position cost basis** | Ledger replay per `costBasisPolicy` | Ledger replay | Market price |
| **Unrealized PnL** | `Position` projection + current `Pricing` | Same | Snapshot, portfolio |
| **Realized PnL** | Ledger replay (cumulative on closed lots) | Same | Portfolio |
| **Holdings (inventory)** | `Holding` entity in InventoryAccount | N/A | Portfolio |
| **Holding value** | `Holding` + `Pricing` or manual value | N/A | Portfolio |
| **Portfolio total value** | Derived: sum of `AccountSummary v1` | Same | Stored field on Portfolio |
| **Portfolio allocation %** | Derived: `Allocation` projection | Same | Cached RM (unless labeled stale) |
| **Performance (TWR)** | Derived: `Snapshot` time series | Same | Real-time position |
| **Order state** | `Order` entity (Trading context) | Same + broker status | |
| **Market price** | Market Data module | Market Data module | Ledger, holdings |
| **Broker cash (external)** | N/A | Compared at sync; imported as `CashMovement` if delta unexplained | Not SSOT without reconciliation |

### 3.2 Authority Rules (non-negotiable)

```
RULE 1: Current wallet state = f(ledger entries) or f(holdings). Always computable from SSOT.
RULE 2: Snapshots record observations. They do not override SSOT.
RULE 3: Read models are caches. They do not override SSOT.
RULE 4: Broker-reported state is authoritative only at sync boundary for detection;
        ledger is authoritative for application logic after reconciliation resolves discrepancies.
RULE 5: Portfolio never stores financial values as truth.
```

### 3.3 Reconciliation SSOT (broker-linked only)

```
At sync time:
  brokerState = Broker.sync()
  ledgerState = PositionEngine.project() + LedgerEngine.computeCash()

  IF brokerState ≈ ledgerState (within tolerance):
    SSOT remains ledger (confirmed)
  ELSE:
    ReconciliationReport generated
    Resolution path:
      a) Import missing fills/movements (preferred)
      b) Append compensating CashMovement / CorporateAction with notes
      c) Flag MANUAL_REVIEW — ledger NOT silently overwritten
```

---

## 4. Engine Boundaries

### 4.1 Trading Engine

| | |
|---|---|
| **Responsibility** | Order validation, buying power check, orchestration of broker placement |
| **Input** | `TradingAccount`, `PlaceOrderParams`, `LedgerHead`, `Pricing`, `Broker` port, `Clock` |
| **Output** | `Order` (new/updated state), `PlaceOrderResult` (success/reject + reason) |
| **May call** | `LedgerEngine.computeCashBalance()`, `Broker.placeOrder()` |
| **Must NOT** | Append to ledger, persist, project positions, compute portfolio, translate broker protocol, know `tenantId` storage |

---

### 4.2 Ledger Engine

| | |
|---|---|
| **Responsibility** | Append-only entry creation, invariant enforcement, cash replay, seal on archive |
| **Input** | `LedgerHead`, `LedgerEntry` draft, `Clock` |
| **Output** | Validated `LedgerEntry` with assigned `sequence`, `CashBalance`, domain events |
| **May call** | Nothing external |
| **Must NOT** | Call broker, project positions, persist, know portfolio, modify existing entries, delete entries |

**Cash replay algorithm:**

```
cash = initialCash
for entry in entries ordered by sequence:
  match entry.type:
    TradeExecution BUY  → cash -= (qty × price + fees)
    TradeExecution SELL → cash += (qty × price - fees)
    CashMovement        → cash +=/- amount per type
    CashAccrual         → cash += amount
    CorporateAction     → cash += cashAmount (if any)
    PositionCheckpoint  → skip (no cash effect)
```

---

### 4.3 Position Engine

| | |
|---|---|
| **Responsibility** | Project open positions from ledger entries |
| **Input** | `LedgerEntry[]` (from checkpoint or genesis), `Pricing`, `costBasisPolicy` |
| **Output** | `Position[]`, `RealizedPnL` (per instrument), optional `PositionCheckpoint` draft |
| **May call** | Nothing external |
| **Must NOT** | Persist positions as truth, call broker, append ledger, know portfolio, use holdings data |

**Replay scope:**

```
entries = load from last PositionCheckpoint.sequence + 1 to head
state = checkpoint.state ?? empty
apply each TradeExecution and quantity-affecting CorporateAction
emit Position[] at head sequence
```

---

### 4.4 Inventory Engine

| | |
|---|---|
| **Responsibility** | Holding lifecycle, valuation per method, disposal |
| **Input** | `InventoryAccount`, `Holding` mutation commands, `Pricing` (if MARKET method) |
| **Output** | `Holding` (new/updated), `Valuation`, `HoldingRevision` event |
| **May call** | `Pricing` via port |
| **Must NOT** | Create ledger entries, project trading positions, know portfolio, call broker |

---

### 4.5 Valuation Engine

| | |
|---|---|
| **Responsibility** | Compute total wallet value at `asOf` |
| **Input** | `WalletType`, `Position[]` or `Holding[]`, `CashBalance`, `Pricing[]`, `asOf` |
| **Output** | `Valuation { totalValue: Money, lines: ValuationLine[] }` |
| **May call** | Nothing (pricing pre-fetched by application) |
| **Must NOT** | Persist, capture snapshot, aggregate portfolio, mutate wallets |

---

### 4.6 Snapshot Engine / SnapshotAppService

| | |
|---|---|
| **Responsibility** | Capture immutable point-in-time observation |
| **Input** | `walletId`, `Valuation`, `asOf` |
| **Output** | `Snapshot` entity |
| **Domain part** | Validate snapshot fields, enforce immutability |
| **Application part** | Call ValuationEngine, persist via SnapshotStore |
| **Must NOT** | Be used as current balance, replace ledger replay |

---

### 4.7 Portfolio Engine

| | |
|---|---|
| **Responsibility** | Aggregate wallet summaries into analytical projections |
| **Input** | `Portfolio`, `AccountSummary v1[]`, `Snapshot[][]` (for performance), `Benchmark?`, `FXRates?` |
| **Output** | `Allocation`, `Performance`, `Attribution` (types) |
| **May call** | `PerformanceEngine` |
| **Must NOT** | Read ledger, read holdings, mutate any wallet, call broker, store asset data |

---

### 4.8 Performance Engine

| | |
|---|---|
| **Responsibility** | Time-weighted return, alpha, drawdown from snapshot series |
| **Input** | `Snapshot[]` (time-ordered, per wallet), `aggregationCurrency`, `window`, `Benchmark?` |
| **Output** | `Performance { returnPercent, returnAbsolute, dataQuality }` |
| **May call** | Nothing |
| **Must NOT** | Invent snapshots, use current positions for historical return, mutate data |

**TWR requires:**

```
≥ 2 snapshots per wallet in window
snapshots aligned to aggregationCurrency (FX at snapshot timestamp)
cash-flow neutral or cash-flow adjusted (TWR formula)
if insufficient → dataQuality: INSUFFICIENT_SNAPSHOTS
```

---

### 4.9 Reconciliation Engine

| | |
|---|---|
| **Responsibility** | Compare broker state vs ledger projection; produce discrepancy report |
| **Input** | `BrokerSyncResult { positions, balances, fills, movements }`, `LedgerProjection`, `tolerancePolicy` |
| **Output** | `ReconciliationReport`, recommended `ResolutionAction[]` |
| **May call** | Nothing external |
| **Must NOT** | Silently append entries, skip report, mutate orders |

---

### 4.10 Broker Sync Engine (Application)

| | |
|---|---|
| **Responsibility** | Orchestrate full sync cycle for broker-linked wallets |
| **Input** | `Connection`, `walletId`, `Broker` port, `lastSyncCursor` |
| **Output** | Imported entries, `ReconciliationReport`, updated `lastSyncAt` |
| **Flow** | `Broker.sync()` → dedup imports → `LedgerEngine.append()` per entry → `ReconciliationEngine.compare()` → resolve |
| **Must NOT** | Replace ledger from broker positions in one shot, skip dedup, bypass reconciliation |

---

### Engine interaction matrix

|  | Trading | Ledger | Position | Inventory | Valuation | Snapshot | Portfolio | Performance | Reconciliation | BrokerSync |
|--|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Persists** | — | — | — | — | — | App | — | — | — | App |
| **Calls Broker** | ✓ | — | — | — | — | — | — | — | — | ✓ |
| **Reads Ledger** | head | all | range | — | — | — | — | — | proj | all new |
| **Writes Ledger** | — | ✓ | — | — | — | — | — | — | — | via Ledger |
| **Reads Holdings** | — | — | — | ✓ | ✓ | — | — | — | — | — |
| **Reads Snapshots** | — | — | — | — | — | ✓ | ✓ | ✓ | — | — |

---

## 5. Event Model

### 5.1 LedgerEntry Stream

Each `TradingAccount` has exactly one logical event stream: its `Ledger`.

```
Stream: ledger:{walletId}
Events: LedgerEntry (discriminated union)
Ordering: monotonic sequence (0 = genesis, 1..N = entries)
Genesis: initialCash (not an entry; metadata on Ledger aggregate)
```

**Entry envelope (all types):**

```
LedgerEntryEnvelope {
  id: EntryId              // UUID, globally unique
  walletId: WalletId
  tenantId: TenantId
  ownerId: UserId
  sequence: int64          // strictly monotonic per wallet, no gaps after commit
  timestamp: Instant       // event time (UTC)
  entryType: enum
  correlationId?: string   // links order→fill→entry
  externalRef?: string     // broker dedup key
  correctsEntryId?: EntryId
  payload: TradeExecution | CashMovement | CorporateAction | CashAccrual | PositionCheckpoint
}
```

### 5.2 Ordering Guarantees

| Guarantee | Scope | Implementation |
|---|---|---|
| **Per-wallet total order** | `sequence` strictly increasing | DB unique constraint `(walletId, sequence)` |
| **No gaps after commit** | Sequence assignment inside transaction | `nextSequence = MAX(sequence) + 1` with row lock |
| **Cross-wallet** | No ordering required | Independent streams |
| **Causal order** | Fill after Order, Entry after Fill | `correlationId` chain; application enforces |
| **Clock skew** | `timestamp` is advisory for display | `sequence` is canonical order |

### 5.3 Idempotency Rules

| Operation | Idempotency key | Behavior on duplicate |
|---|---|---|
| Ledger append | `entry.id` | Reject silently (return existing) |
| Broker fill import | `externalRef` (broker-scoped) | Skip import |
| Order placement | `clientOrderId` per wallet | Return existing order |
| Snapshot capture | `(walletId, captureDate)` | Replace or skip (configurable; default skip) |
| Cash movement command | `commandId` | Return existing entry |
| Holding update | `holdingId + revision` | Optimistic concurrency |

### 5.4 externalRef Handling

```
Format: "{brokerId}:{brokerNativeId}"
Examples:
  "binance:trade:12345678"
  "binance:funding:987654"
  "paper:fill:abc" (PaperBroker generates but SIMULATED has no sync dedup need)

On import:
  IF LedgerRepository.existsByExternalRef(walletId, externalRef):
    SKIP (already imported)
  ELSE:
    append entry
```

### 5.5 Reconciliation Flow

```
┌─────────────┐
│ Broker.sync │
└──────┬──────┘
       │ fills, movements, corporate actions, balances, positions
       ▼
┌──────────────────┐
│ Dedup + Import   │  append new LedgerEntries
└──────┬───────────┘
       ▼
┌──────────────────┐
│ LedgerProjection │  PositionEngine + LedgerEngine
└──────┬───────────┘
       ▼
┌──────────────────────┐
│ ReconciliationEngine │
│ compare(broker, ledger) │
└──────┬───────────────┘
       │
   ┌───┴───┐
   │       │
  OK    DISCREPANCY
   │       │
   │       ▼
   │  ReconciliationReport
   │       │
   │   ┌───┴───────────────┐
   │   │                   │
   │  AUTO_RESOLVE    MANUAL_REVIEW
   │  (import missing   (block wallet
   │   entries)          flag, alert)
   ▼
┌──────────────────┐
│ SnapshotAppService│  optional post-sync capture
└──────────────────┘
```

### 5.6 Domain Events (outbound from application)

| Event | Trigger | Consumers |
|---|---|---|
| `LedgerEntryAppended` | Entry committed | Position projection, cache invalidation, read model update |
| `HoldingUpdated` | Holding saved | Inventory read model, cache invalidation |
| `WalletArchived` | Wallet sealed | Portfolio member exclusion |
| `ReconciliationDiscrepancy` | Report with unresolved items | Alert service, wallet health flag |
| `SnapshotCaptured` | Snapshot persisted | Performance read model refresh |
| `BrokerSyncCompleted` | Sync cycle done | Connection status update |

Events are **at-least-once**. Consumers must be idempotent.

---

## 6. Wallet vs Inventario vs Portfolio

### 6.1 Comparison Matrix

| Dimension | Wallet (TradingAccount) | Wallet (InventoryAccount) | Portfolio |
|---|---|---|---|
| **What it is** | Aggregate root — execution container | Aggregate root — holdings container | Analytical lens — configuration |
| **Owns (SSOT)** | Ledger entries, Orders, Fills | Holdings | PortfolioMembers (refs only) |
| **Does NOT own** | Positions, PnL, portfolio | Valuations, portfolio | Any financial data |
| **Can mutate** | Via commands → ledger append, order placement | Via commands → holding CRUD | Via commands → member list, name, benchmark |
| **Derived** | Position, cash, unrealized PnL | Valuation, holding market value | Allocation, performance |
| **Persisted observations** | Snapshots | Snapshots | None (reads snapshots) |
| **Broker connection** | Yes (if BROKER_LINKED) | No | No |
| **executionMode** | SIMULATED \| BROKER_LINKED | N/A | N/A |

### 6.2 Mutation Permissions

```
TRADING WALLET may:
  ✓ Append LedgerEntry
  ✓ Place/cancel Order
  ✓ Connect/revoke Broker
  ✗ Modify Position directly
  ✗ Set PnL
  ✗ Modify Portfolio

INVENTORY WALLET may:
  ✓ Add/update/dispose Holding
  ✗ Create LedgerEntry
  ✗ Place Order
  ✗ Modify Portfolio

PORTFOLIO may:
  ✓ Add/remove PortfolioMember
  ✓ Set benchmark, aggregationCurrency
  ✗ Append LedgerEntry
  ✗ Modify Holding
  ✗ Set wallet balance
```

### 6.3 Derived Data Chain

```
Trading:
  LedgerEntry[] ──replay──► Position + Cash ──+ Pricing ──► Valuation ──► Snapshot
                                               └──► AccountSummary v1

Inventario:
  Holding[] ──+ Pricing/manual ──► Valuation ──► Snapshot
              └──► AccountSummary v1

Portfolio:
  AccountSummary v1[] ──aggregate──► Allocation
  Snapshot[][] ──TWR──► Performance
```

---

## 7. Broker Integration Model

### 7.1 Connection Architecture

```
User
  │
  ▼
ConnectBrokerCommand(brokerId, credentials)
  │
  ▼
ConnectionService
  ├── create Connection { walletId, brokerId, credentialsRef }
  ├── Broker.authenticate()
  ├── set TradingAccount.executionMode = BROKER_LINKED
  └── trigger initial BrokerSyncEngine.run()
```

**One Connection per TradingAccount (v1).** Multi-subaccount (Binance spot+futures) requires v1.1 `BrokerAccount` sub-entity — documented as known limitation.

### 7.2 Sync Cycle

```
BrokerSyncEngine.run(walletId):
  1. Load Connection, lastSyncCursor
  2. brokerResult = Broker.sync({ since: lastSyncCursor })
  3. FOR EACH fill IN brokerResult.fills:
       IF NOT exists(externalRef): LedgerEngine.append(TradeExecution)
  4. FOR EACH funding/interest/dividend IN brokerResult.accruals:
       IF NOT exists(externalRef): LedgerEngine.append(CashAccrual or CorporateAction)
  5. FOR EACH deposit/withdrawal IN brokerResult.movements:
       IF NOT exists(externalRef): LedgerEngine.append(CashMovement)
  6. ledgerProjection = project(walletId)
  7. report = ReconciliationEngine.compare(brokerResult, ledgerProjection)
  8. IF report.hasUnresolved: flag wallet DEGRADED
  9. Update lastSyncCursor, lastSyncAt
  10. Optionally: SnapshotAppService.capture(walletId)
```

### 7.3 Trade Deduplication

| Layer | Mechanism |
|---|---|
| **Import** | `externalRef` unique index per `(walletId, externalRef)` |
| **Order placement** | `clientOrderId` unique per `(walletId, clientOrderId)` |
| **Entry identity** | `entry.id` UUID unique globally |
| **Retry safety** | All append operations idempotent; safe to retry sync |

### 7.4 Position Sync vs Ledger Projection

```
NEVER: broker positions → overwrite ledger
ALWAYS: broker fills → ledger entries → projected positions ≈ broker positions

IF projected ≠ broker after import:
  1. Check for missing fills (partial sync)
  2. Check for corporate actions not imported
  3. Check for rounding tolerance
  4. Else: MANUAL_REVIEW
```

### 7.5 Broker Adapter Responsibilities

| Task | Adapter | Domain |
|---|---|---|
| REST/WebSocket protocol | ✓ | |
| Rate limiting, retry | ✓ | |
| Symbol mapping → instrumentId | ✓ | |
| Parse fill reports | ✓ | |
| Buying power validation | | ✓ |
| Ledger append | | ✓ (via app) |
| Position math | | ✓ |

---

## 8. Performance Model

### 8.1 PnL Calculation

**Unrealized PnL (per position):**

```
unrealizedPnL = (marketPrice - avgEntryPrice) × quantity
  where:
    avgEntryPrice = costBasis / quantity
    costBasis from ledger replay per costBasisPolicy (FIFO default)
    marketPrice from Pricing Engine (current)
```

**Realized PnL (per instrument, cumulative):**

```
On SELL TradeExecution:
  realizedPnL += (sellPrice - avgEntryOfClosedLot) × soldQuantity - fees
  (exact lot matching per costBasisPolicy)
```

**Unrealized PnL is NEVER stored.** Computed on read.

**Realized PnL is NEVER stored as truth.** Computed on replay. May be cached in `PositionCheckpoint` as derived observation.

### 8.2 Portfolio Value

```
portfolioValue = Σ convert(walletSummary.totalValue, aggregationCurrency)
  for each member in portfolio.members (active, non-archived):

walletSummary.totalValue =
  TRADING:   cashBalance + Σ(position.quantity × marketPrice)
  INVENTORY: Σ(holding.value per valuationMethod)
```

FX conversion uses rate at query `asOf` (not mixed timestamps).

### 8.3 Avoiding O(n) Replay

**Problem:** 1M entries → replay on every read is O(n).

**Strategy (mandatory at scale):**

```
┌─────────────────────────────────────────────────────────┐
│ PositionCheckpoint entry (in ledger stream)             │
│   sequence: 500000                                      │
│   payload: { positions: [...], cash: Money, realizedPnL }│
└─────────────────────────────────────────────────────────┘
         │
         ▼
Replay only entries 500001..head (typically < 1000)
```

**Checkpoint policy:**

| Trigger | Action |
|---|---|
| Every N entries (e.g. N=1000) | Auto-write `PositionCheckpoint` entry |
| Post broker sync | Write checkpoint after large import batch |
| Pre-snapshot capture | Write checkpoint before valuation |
| Manual | Admin/maintenance command |

**Checkpoint is a derived observation stored in the stream for optimization. SSOT remains the full stream. Checkpoint can be rebuilt by replay from genesis.**

### 8.4 Read Path Latency Budget

| Path | Target | Strategy |
|---|---|---|
| Get cash balance | < 10ms | Cache `cash:{walletId}` or checkpoint + delta |
| Get positions | < 20ms | Cache or checkpoint + delta |
| Get wallet summary | < 50ms | Read model `WalletSummaryRM` |
| Get portfolio allocation | < 100ms | Aggregate cached AccountSummaries |
| Get performance (90D) | < 200ms | Pre-aggregated `PortfolioPerformanceRM` from snapshots |
| Full ledger replay (genesis) | Background only | Migration, audit, checkpoint rebuild |

---

## 9. Critical Risks

### 9.1 Architectural Bugs (future)

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| A1 | Bypassing LedgerEngine for "quick fixes" | SSOT corruption | Single append path; code review gate; invariant tests |
| A2 | Portfolio stores cached value as field | Stale analytics | Portfolio entity has no balance fields; lint rule |
| A3 | Read model becomes de facto SSOT | Silent money bugs | Rebuild-from-ledger integration tests |
| A4 | Checkpoint treated as SSOT | Wrong positions after bug | Checkpoints tagged `derived=true`; rebuild path tested |
| A5 | Multiple append paths (sync + manual + trade) | Duplicate entries | Single `LedgerRepository.append()` with idempotency |

### 9.2 Money Inconsistencies

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| M1 | Bare `number` arithmetic | Rounding errors | `Money` VO enforced; no float |
| M2 | FX at wrong timestamp | Wrong portfolio value | FX rate tied to snapshot/query `asOf` |
| M3 | Fees excluded from cash replay | Cash ≠ expected | Cash invariant tests per entry type |
| M4 | Mixed currencies summed without conversion | Nonsense totals | `Money.add()` throws on currency mismatch |
| M5 | Dividend as TradeExecution SELL | Cost basis corruption | Use `CorporateAction` type |

### 9.3 Race Conditions

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Concurrent orders exhaust cash | Negative cash | Per-wallet serial queue or optimistic lock on `ledger.headSequence` |
| R2 | Concurrent sync + manual trade | Sequence conflict | Per-wallet mutex during sync; or serializable transaction |
| R3 | Cache stale after write | UI shows old balance | Invalidate before response; or versioned keys |
| R4 | Snapshot during active trading | Inconsistent snapshot | Snapshot captures `sequence` head; label `asOfSequence` |
| R5 | Two devices append same externalRef | Duplicate (if sync races) | `externalRef` unique constraint |

### 9.4 Trade Duplication

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| D1 | Sync retry without idempotency | Double entries | `externalRef` unique index |
| D2 | Partial fill imported twice | Overstated position | `brokerFillId` dedup |
| D3 | Manual entry + sync import same trade | Double | `externalRef` + manual entries use `externalRef: manual:{uuid}` |
| D4 | Compensating entry without `correctsEntryId` | Audit trail broken | Enforce on correction entries |

### 9.5 Broker vs Ledger Desync

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| S1 | Broker shows position, ledger empty (missed sync) | Wrong app state | Reconciliation flags DEGRADED; block new orders |
| S2 | Ledger ahead of broker (pending settlement) | False discrepancy | Tolerance policy; settlement lag config |
| S3 | Forced overwrite from broker | Audit trail destroyed | P19: never silent overwrite |
| S4 | Funding/accrual not imported | Cash drift | Import `CashAccrual` in sync cycle |
| S5 | Corporate action missed | Quantity drift | Periodic full reconciliation; corporate action poll |

### 9.6 Scale Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| SC1 | 1M entries, no checkpoint | Read timeout | Checkpoint policy (§8.3) |
| SC2 | Snapshot table unbounded | Storage cost | Retention tiers (§1.6) |
| SC3 | Portfolio aggregates 100 wallets synchronously | Query timeout | Parallel provider fetch + cached RM |
| SC4 | Multi-tenant query without index | Cross-tenant leak | All queries filter `tenantId`; DB composite indexes |

---

## Appendix A — Command / Query Catalog (v1)

### Commands (mutations)

| Command | Handler | Engines involved |
|---|---|---|
| `CreateTradingWallet` | `CreateTradingWalletHandler` | Ledger (init) |
| `CreateInventoryWallet` | `CreateInventoryWalletHandler` | — |
| `PlaceOrder` | `PlaceOrderHandler` | Trading, Ledger |
| `CancelOrder` | `CancelOrderHandler` | Trading |
| `RecordCashMovement` | `RecordCashMovementHandler` | Ledger |
| `AddHolding` | `AddHoldingHandler` | Inventory |
| `UpdateHolding` | `UpdateHoldingHandler` | Inventory |
| `DisposeHolding` | `DisposeHoldingHandler` | Inventory |
| `ConnectBroker` | `ConnectBrokerHandler` | BrokerSync |
| `SyncBroker` | `SyncBrokerHandler` | BrokerSync, Ledger, Reconciliation |
| `CaptureSnapshot` | `CaptureSnapshotHandler` | Valuation, Snapshot |
| `CreatePortfolio` | `CreatePortfolioHandler` | — |
| `ArchiveWallet` | `ArchiveWalletHandler` | Ledger (seal) |

### Queries (read-only)

| Query | Handler | Data source |
|---|---|---|
| `GetWalletSummary` | `GetWalletSummaryHandler` | WalletSummaryRM or live projection |
| `GetPositions` | `GetPositionsHandler` | PositionEngine + cache |
| `GetLedgerEntries` | `GetLedgerEntriesHandler` | LedgerRepository (paginated) |
| `GetHoldings` | `GetHoldingsHandler` | HoldingRepository |
| `GetPortfolioAllocation` | `GetPortfolioAllocationHandler` | PortfolioEngine + AccountSummary |
| `GetPortfolioPerformance` | `GetPortfolioPerformanceHandler` | PerformanceEngine + Snapshots |
| `GetOpenOrders` | `GetOpenOrdersHandler` | Order repository |
| `GetReconciliationReport` | `GetReconciliationReportHandler` | ReconciliationReport store |

---

## Appendix B — Persistence Schema (conceptual)

```
wallets
  id, tenant_id, owner_id, wallet_type, name, base_currency, status, execution_mode?, ...

ledger_entries
  id, wallet_id, tenant_id, sequence, entry_type, timestamp, payload_json,
  correlation_id, external_ref, corrects_entry_id
  UNIQUE(wallet_id, sequence)
  UNIQUE(wallet_id, external_ref) WHERE external_ref IS NOT NULL

orders
  id, wallet_id, tenant_id, ..., client_order_id, status
  UNIQUE(wallet_id, client_order_id)

fills
  id, order_id, ledger_entry_id, ...

holdings
  id, wallet_id, tenant_id, instrument_id, quantity, cost_basis_amount, cost_basis_currency, ...

snapshots
  id, wallet_id, tenant_id, timestamp, as_of_sequence, total_value_amount, total_value_currency, ...

portfolios
  id, tenant_id, owner_id, name, aggregation_currency, ...

portfolio_members
  portfolio_id, account_id, account_type, weight
  UNIQUE(portfolio_id, account_id, account_type)

connections
  id, wallet_id, tenant_id, broker_id, status, credentials_ref, last_sync_at, ...

reconciliation_reports
  id, wallet_id, timestamp, discrepancies_json, resolution
```

---

## Appendix C — Document Cross-Reference

| Topic | Domain Model § | This document § |
|---|---|---|
| Entities | §2 | §1, §6 |
| SSOT policy | §6.4 | §3, §7.4 |
| Engines | §5 | §4 |
| Ledger entries | §2.8–2.12 | §5 |
| Reconciliation | §2.19, §6.4 | §5.5, §7 |
| Checkpoints | §2.12 | §8.3 |
| Principles | §10 | §3, §9 |

---

*End of document — FINANCIAL BACKEND ARCHITECTURE SPEC v1.0*
