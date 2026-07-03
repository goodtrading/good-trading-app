# Consistency Model

**Version:** 1.0  
**Status:** Frozen — Companion to `DOMAIN_MODEL.md` v1.0 and `FINANCIAL_BACKEND_ARCHITECTURE.md` v1.0  
**Audience:** Backend engineers, SRE, on-call  
**Scope:** Temporal behavior, consistency guarantees, concurrency, invalidation, failure modes.

**Authority chain:** `DOMAIN_MODEL.md` (semantics) → `FINANCIAL_BACKEND_ARCHITECTURE.md` (orchestration) → this document (runtime behavior). On conflict, domain model wins.

**Purpose:** This document is the **behavioral contract** for Cartera under concurrency, time, and partial failure. Implementations must be deterministic with respect to these rules.

---

## Table of Contents

1. [Truth Tiers](#1-truth-tiers)
2. [Temporal Model](#2-temporal-model)
3. [Consistency Guarantees](#3-consistency-guarantees)
4. [Concurrency Model](#4-concurrency-model)
5. [Invalidation Rules](#5-invalidation-rules)
6. [Read Model Strategy](#6-read-model-strategy)
7. [Cross-Broker Consistency](#7-cross-broker-consistency)
8. [Failure Modes](#8-failure-modes)
9. [System Behavior Spec](#9-system-behavior-spec)

---

## 1. Truth Tiers

Cartera operates on five distinct truth tiers. **Lower tiers are authoritative for mutations; higher tiers are derived and may lag.**

```
Tier 0 ── Broker State (external, untrusted until imported)
Tier 1 ── Ledger Stream (authoritative event truth)
Tier 2 ── Wallet Aggregate Metadata (authoritative identity/config)
Tier 3 ── Snapshot (immutable materialized observation)
Tier 4 ── Portfolio / Read Models (derived, eventually consistent)
```

**Canonical read rule:** Current financial state is always computable from Tier 1 (or Tier 1 equivalent for inventory: Holdings). Tiers 3–4 are convenience, never authority.

---

### 1.1 Ledger (Event Truth) — Tier 1

| Attribute | Definition |
|---|---|
| **What it represents** | The complete, ordered, immutable history of financial events for a trading wallet. |
| **Granularity** | One append-only stream per `walletId`. Entries: `TradeExecution`, `CashMovement`, `CorporateAction`, `CashAccrual`, `PositionCheckpoint`. |
| **Freshness** | **Strongly consistent** at commit boundary. After `LedgerEntryAppended` ACK, entry is durable and visible to all subsequent reads on that wallet. |
| **Canonical order** | `sequence` (monotonic `int64`). Not `timestamp`. |
| **Invalidated by** | Nothing. Entries are never deleted or mutated. Wallet archival **seals** the stream (no new appends). |
| **Recalculated by** | Nothing. Ledger is not derived. |
| **Triggers recomputation of** | Position projection, cash balance, wallet summary RM, AccountSummary v1 (downstream). |
| **NEVER may** | Be overwritten by broker state, snapshot, read model, or portfolio. Be deleted. Be reordered. Skip sequence assignment. |

**Staleness:** Ledger is never stale. It is either sealed or growing.

---

### 1.2 Holdings (Inventory Truth) — Tier 1 (parallel stream)

| Attribute | Definition |
|---|---|
| **What it represents** | User-declared ownership in an inventory wallet. |
| **Granularity** | One `Holding` entity per instrument (or lot, v1.1+). |
| **Freshness** | **Strongly consistent** at commit boundary per holding row. |
| **Invalidated by** | Nothing (disposal is soft; history preserved). |
| **Recalculated by** | User commands only (`AddHolding`, `UpdateHolding`, `DisposeHolding`). |
| **Triggers recomputation of** | Inventory valuation, AccountSummary v1, portfolio allocation (downstream). |
| **NEVER may** | Be derived from ledger. Be overwritten by broker sync. |

---

### 1.3 Wallet (Stateful Aggregate) — Tier 2

| Attribute | Definition |
|---|---|
| **What it represents** | Identity, configuration, and lifecycle of a financial container. **Not** balances or positions. |
| **Contains** | `id`, `ownerId`, `tenantId`, `name`, `baseCurrency`, `executionMode`, `status`, `costBasisPolicy`, `connectionId?`. |
| **Freshness** | **Strongly consistent** for metadata mutations. |
| **Invalidated by** | Metadata updates, archival, connection status changes. |
| **Recalculated by** | Command handlers only. Financial state is NOT stored on wallet. |
| **NEVER may** | Store `cashBalance`, `totalValue`, `positions[]`, or `pnl` as authoritative fields. |

**Staleness:** Metadata is strongly consistent. Financial views of a wallet are Tier 4.

---

### 1.4 Snapshot (Materialized Observation) — Tier 3

| Attribute | Definition |
|---|---|
| **What it represents** | Immutable record of what the system **observed** a wallet to be worth at a specific `(walletId, asOf, asOfSequence)`. |
| **Freshness** | **Point-in-time frozen.** Becomes "older" as time passes; never auto-updated. |
| **Max staleness vs current** | Unbounded by design. A snapshot from yesterday is valid historical data, not current truth. |
| **Invalidated by** | Nothing. Snapshots are immutable. Retention policy may **delete** old snapshots; never mutate. |
| **Recalculated by** | New capture creates a **new** snapshot. Old snapshot remains. |
| **Used for** | Performance (TWR), charts, audit, regulatory record. |
| **NEVER may** | Override ledger. Serve as current balance. Be updated in place. |

**Staleness label:** Every snapshot carries `asOf` (timestamp) and `asOfSequence` (ledger head at capture). Consumers must display both.

---

### 1.5 Portfolio (Derived Read Model) — Tier 4

| Attribute | Definition |
|---|---|
| **What it represents** | Analytical projection over N wallets: allocation, performance, attribution. |
| **Definition SSOT** | `Portfolio` entity stores member references only (Tier 2 config). |
| **Computed state** | `Allocation`, `Performance` — always derived at query time or from cached RM. |
| **Freshness** | **Eventually consistent** with respect to wallet state. |
| **Typical lag** | 0ms (cache miss, live query) to 30s (cached RM) to hours (performance from daily snapshots). |
| **Invalidated by** | Any `LedgerEntryAppended` or `HoldingUpdated` on a member wallet; portfolio definition change. |
| **Recalculated by** | Query handler on read (v1) or async projection worker (v2 cloud). |
| **NEVER may** | Store asset balances as truth. Mutate wallets. Append ledger entries. |

---

### 1.6 Broker State (External Truth) — Tier 0

| Attribute | Definition |
|---|---|
| **What it represents** | Positions, balances, fills as reported by an external venue at query/sync time. |
| **Freshness** | Unknown. Depends on broker API latency and polling interval. |
| **Trust level** | **Untrusted** until imported into ledger and reconciled. |
| **Invalidated by** | Every broker sync produces new broker state (ephemeral). |
| **Recalculated by** | `Broker.sync()` on each sync cycle. |
| **Used for** | Import source (fills → ledger entries). Reconciliation comparison. |
| **NEVER may** | Directly overwrite ledger. Serve as in-app SSOT without reconciliation. Bypass dedup on import. |

**Broker state lifetime:** Exists only in memory during sync cycle. Not persisted as SSOT. Only imported entries persist.

---

### 1.7 Truth Tier Summary

| Tier | Artifact | Consistency | Stale? | Authority for mutations |
|---:|---|---|---|---|
| 0 | Broker state | Untrusted external | Always relative to ledger | None |
| 1 | Ledger / Holdings | Strong per commit | Never | **Yes — sole mutation SSOT** |
| 2 | Wallet metadata | Strong per commit | Never | Yes (config only) |
| 3 | Snapshot | Immutable frozen | By design (historical) | No |
| 4 | Portfolio / RM / Cache | Eventual | Yes (bounded by invalidation) | No |

---

## 2. Temporal Model

### 2.1 Time Domains

| Time type | Field | Source | Purpose |
|---|---|---|---|
| **Event time** | `LedgerEntry.timestamp` | Assigned at append (from `Clock` port or broker report) | Display, reporting, tax. **Not** canonical order. |
| **System time** | `committedAt` | Database/server clock at commit | Audit, latency measurement. **Not** canonical order. |
| **Broker time** | `brokerTimestamp` on imported entries | Broker API | Reconciliation, dedup window. Normalized to UTC. |
| **Canonical order** | `LedgerEntry.sequence` | Assigned atomically at append | **Authoritative** for replay, cash, positions. |
| **Observation time** | `Snapshot.asOf` | Capture moment | Performance windows. |
| **Query time** | `asOf` on read request | Client or server default = now | Marks derived state freshness. |

### 2.2 Conflict Resolution

```
IF eventTime_A < eventTime_B BUT sequence_A > sequence_B:
  → sequence wins. Always. Replay uses sequence order.

IF brokerTimestamp conflicts with system eventTime on import:
  → Store brokerTimestamp in entry metadata.
  → Assign sequence at import commit time (system order).
  → Never re-sequence existing entries.

IF two entries have identical brokerTimestamp:
  → Dedup by externalRef, not timestamp.
  → If externalRef differs, both append with distinct sequences.
```

**Rule:** `sequence` is the only ordering key for ledger replay. `timestamp` is informational.

### 2.3 Cross-Broker Event Ordering

```
Each wallet has ONE ledger stream. Cross-broker ordering does not exist at ledger level.

Portfolio aggregates wallets independently:
  wallet A (Binance) sequence 1..N
  wallet B (Paper)    sequence 1..M

Portfolio total value at query time T:
  = sum(walletValue(A, asOf=T) + walletValue(B, asOf=T))

No global cross-wallet sequence. Portfolio is snapshot of independent wallet states at query time.
```

### 2.4 Late Events

| Scenario | Behavior |
|---|---|
| **Late broker fill** (arrives days after trade) | Import with `brokerTimestamp` = original trade time. `sequence` = next available at import. Replay produces correct final state. Historical snapshots **are not retroactively updated**. |
| **Late corporate action** | Same. Append `CorporateAction`. Position projection at current head is correct. Past snapshots remain as-were. |
| **Out-of-order broker sync batch** | Entries sorted by broker sequence/cursor before import. Each deduped by `externalRef`. Final ledger order = import commit order. |

**Late event impact on performance:** TWR calculated from snapshots will not reflect late entries in past periods. A **recalculation job** (v1.1) may re-capture affected snapshots. v1: label performance `dataQuality: MAY_BE_REVISED` if `lastEntry.timestamp < snapshot.asOf`.

### 2.5 Historical Re-Sync

```
BrokerSyncEngine.run(fullHistory=true):
  1. Fetch all fills since account inception (paginated)
  2. FOR EACH fill: dedup by externalRef, append if missing
  3. DO NOT delete existing entries
  4. DO NOT re-sequence
  5. Reconcile at end
  6. Optionally: write PositionCheckpoint at head
  7. DO NOT mutate existing snapshots

Result: ledger grows with discovered entries. Projections at head reflect full history. Past snapshots unchanged.
```

---

## 3. Consistency Guarantees

### 3.1 Classification

| Class | Definition in Cartera |
|---|---|
| **Strongly consistent** | All readers see the same state immediately after commit ACK, scoped per aggregate (wallet). |
| **Eventually consistent** | Readers may see stale state for bounded (or unbounded without invalidation) time; converges after projection catches up. |
| **Best-effort** | May be stale without guaranteed convergence time; acceptable for non-financial-critical display. |

### 3.2 Per-Artifact Guarantees

| Artifact | Guarantee | Max staleness (nominal) | Convergence trigger |
|---|---|---|---|
| **Ledger entry (post-commit)** | Strong | 0 | Immediate |
| **Cash balance (live query)** | Strong* | 0 | `LedgerEntryAppended` |
| **Position state (live query)** | Strong* | 0 | `LedgerEntryAppended` |
| **Wallet metadata** | Strong | 0 | Immediate |
| **Holdings (inventory)** | Strong | 0 | `HoldingUpdated` |
| **WalletSummaryRM** | Eventual | 0–30s (cache TTL) | Invalidation on write |
| **AccountSummary v1** | Eventual | 0 on cache miss; ≤30s cached | Wallet event |
| **Portfolio allocation** | Eventual | 0 on live query; ≤30s cached | Member wallet event |
| **Portfolio total value** | Eventual | Same as allocation | Member wallet event + pricing |
| **Unrealized PnL** | Eventual w.r.t. price | Market price: 5–30s | Pricing feed + position |
| **Realized PnL** | Strong* (at sequence head) | 0 | `LedgerEntryAppended` |
| **Snapshot** | Frozen (not stale — historical) | N/A | New capture only |
| **Performance (TWR)** | Eventual / frozen | Until next snapshot capture | Snapshot capture |
| **Broker-reported balance** | Best-effort | Sync interval (1–15 min) | Next sync |
| **Chart data** | Frozen per snapshot | Until next snapshot | Snapshot capture |

\* **Strong at sequence head** = computed from ledger/holdings + current pricing at query time, with per-wallet serial write guarantee. Not linearizable across multiple wallets.

### 3.3 Cross-Wallet / Cross-Portfolio

```
Portfolio value = Σ wallet values at query time T.

This is NOT atomic across wallets.
Two wallets may reflect states from T and T+50ms respectively.
Label: portfolio.asOf = max(wallet.asOf for each member).
```

### 3.4 Consistency Diagram

```
WRITE PATH (strong per wallet):
  Command → Lock(walletId) → Append(entry) → Commit → ACK
                              │
                              ▼ (async or sync post-commit)
                    Invalidate cache → Update RM → (no portfolio write)

READ PATH (live, strong at head):
  Query → Cache miss? → Replay ledger from checkpoint → Pricing → Response

READ PATH (portfolio):
  Query → Load members → Fetch AccountSummary per member → Aggregate → Response
          (each member may be at slightly different asOf)
```

---

## 4. Concurrency Model

### 4.1 Serialization Scope

| Resource | Serialization | Mechanism |
|---|---|---|
| **Ledger stream per wallet** | Full serial | DB row lock on `ledger_head(walletId)` or per-wallet mutex |
| **Order placement per wallet** | Full serial | Same lock as ledger append |
| **Broker sync per wallet** | Full serial | Same lock; sync and trade are mutually exclusive |
| **Holdings per inventory wallet** | Per-holding optimistic | `holding.revision` CAS |
| **Portfolio definition** | Per-portfolio serial | Standard DB transaction |
| **Snapshots per wallet** | Serial with ledger | Capture reads head sequence under lock |
| **Cross-wallet** | None | Independent |

### 4.2 Lock Ordering (deadlock prevention)

```
Global order:
  1. walletId (ascending) if multiple wallets in one transaction
  2. ledger_head
  3. holding row

NEVER: lock portfolio then wallet. Always wallet first.
```

### 4.3 Concurrent Trades (same wallet)

```
Trade A and Trade B arrive simultaneously on wallet W1:

  Request A ──┐
              ├──► Per-wallet queue (serial)
  Request B ──┘

  1. A acquires lock(W1)
  2. A reads head sequence = 5, cash = X
  3. A validates, appends sequence 6, commits, releases lock
  4. B acquires lock(W1)
  5. B reads head sequence = 6, cash = X'
  6. B validates against X', appends sequence 7, commits

Result: Both succeed if individually valid. No lost updates. Order = commit order (not arrival order).
```

### 4.4 Broker Sync During Manual Trade

```
Sync S and Trade T on wallet W1:

  IF sync holds lock:
    T waits (or returns 409 SYNC_IN_PROGRESS, client retries)

  IF trade holds lock:
    S waits (sync is background; may defer)

  NEVER: sync and trade append concurrently.

  v1 policy: Commands (trade) take priority over background sync.
  Sync yields if lock not acquired within timeout (30s), retries later.
```

### 4.5 Multi-Device Same User

```
Device 1 places order on W1.
Device 2 places order on W1 simultaneously.

Same as §4.3: serial per wallet. Second device sees first device's entry.

Device 1 updates holding H1 (inventory).
Device 2 updates holding H1 simultaneously.

Optimistic concurrency:
  IF revision mismatch → reject with CONFLICT, client refreshes and retries.
```

### 4.6 Idempotency Under Concurrency

```
Duplicate PlaceOrderCommand (same clientOrderId):
  First: creates order, appends entry.
  Second (concurrent or retry): returns existing order + entry. No double append.

Duplicate sync import (same externalRef):
  First: appends entry.
  Second: skip silently.
```

---

## 5. Invalidation Rules

### 5.1 Event → Invalidation Matrix

| Domain event | Cache invalidated | Read model updated | Snapshot updated | Portfolio recalculated |
|---|---|---|---|---|
| `LedgerEntryAppended` | `cash:{w}`, `position:{w}:*`, `wallet_summary:{w}` | `WalletSummaryRM` (sync v1) | **No** | **No** (on write) |
| `HoldingUpdated` | `holding:{w}:*`, `wallet_summary:{w}` | `WalletSummaryRM` | **No** | **No** (on write) |
| `WalletArchived` | All keys for `{w}` | Remove from active lists | **No** | On next query (exclude member) |
| `SnapshotCaptured` | `performance:{portfolioId}:*` | `PortfolioPerformanceRM` | N/A (new snapshot) | On next performance query |
| `ReconciliationDiscrepancy` | `wallet_health:{w}` | `BrokerSyncStatusRM` | **No** | **No** |
| `PortfolioDefinitionChanged` | `portfolio_alloc:{p}`, `portfolio_perf:{p}` | Portfolio metadata | **No** | On next query |
| `PricingUpdated` (market) | `price:{instrument}:*` | **No** (unless stale threshold) | **No** | On next query if uncached |

### 5.2 What Triggers Recomputation

| Component | Trigger | Scope |
|---|---|---|
| **Position Engine** | `LedgerEntryAppended` | Affected wallet, from last checkpoint |
| **Cash replay** | `LedgerEntryAppended` | Affected wallet |
| **Inventory valuation** | `HoldingUpdated`, pricing change (on read) | Affected wallet |
| **WalletSummaryRM** | `LedgerEntryAppended`, `HoldingUpdated` | Affected wallet |
| **AccountSummary v1** | Same as WalletSummaryRM | Affected wallet |
| **Portfolio allocation** | Read query (pull) or cache miss after invalidation | Portfolio |
| **Performance** | Read query against snapshot store | Portfolio |

### 5.3 What Does NOT Trigger Recomputation

| Event | Why |
|---|---|
| `LedgerEntryAppended` | Does **not** trigger snapshot update (too expensive) |
| `LedgerEntryAppended` | Does **not** synchronously recalculate portfolio |
| `PricingUpdated` | Does **not** invalidate ledger or positions (positions recomputed on read with new price) |
| `SnapshotCaptured` | Does **not** mutate ledger or holdings |
| Portfolio query | Does **not** mutate any wallet |

### 5.4 Snapshot Staleness Policy

```
Snapshot is NOT "stale" — it is "historical."

Current value query:
  → MUST NOT use latest snapshot as answer.
  → MUST compute from ledger/holdings + pricing.

Performance query (30D):
  → Uses snapshots in window.
  → If latest snapshot older than 25h: dataQuality = STALE_SNAPSHOTS.
  → Still usable; label must be exposed to consumer.
```

---

## 6. Read Model Strategy

### 6.1 Strategy Matrix

| Read model | Strategy | Freshness | Rebuild cost |
|---|---|---|---|
| **Wallet summary** | Write-through on event (v1); cache-aside with invalidation | Near-strong (0–30s) | O(checkpoint→head) per miss |
| **AccountSummary v1** | Mapped from WalletSummaryRM | Same | Same |
| **Portfolio allocation** | **Recompute on read** + cache-aside (TTL 30s) | Eventual (≤30s) | O(members × wallet query) |
| **Portfolio performance** | **Snapshot-based** (not event-based) | Frozen to last snapshot | O(snapshots in window) |
| **Unrealized PnL** | **Live** (position + current price) | Price-dependent (5–30s) | O(positions) |
| **Realized PnL** | **Live** at sequence head | Strong per wallet | O(checkpoint→head) |
| **Chart data (equity curve)** | **Snapshot-based** | Frozen per capture point | O(snapshots) |
| **Open orders** | **Direct read** from Order store | Strong | O(1) |
| **Ledger history** | **Direct paginated read** from Ledger store | Strong | O(page size) |

### 6.2 Portfolio: Recompute vs Materialize

```
v1 (mobile, single-user):
  Allocation → RECOMPUTE ON READ, cache 30s
  Performance → SNAPSHOT-BASED, no live recompute

v2 (cloud, multi-user):
  Allocation → ASYNC MATERIALIZE on wallet event → PortfolioAllocationRM
  Performance → BATCH JOB after daily snapshot capture

Rule: Portfolio NEVER owns materialized asset data.
      Portfolio RMs are disposable projections.
```

### 6.3 PnL: Real-Time vs Delayed

| PnL type | Mode | Source |
|---|---|---|
| Unrealized | **Real-time on read** | Position (ledger replay) + Pricing (market) |
| Realized (session) | **Real-time on read** | Ledger replay |
| Realized (historical period) | **Delayed** (snapshot-based) | Snapshots + TWR |
| Portfolio total PnL | **Real-time on read** (allocation) | Sum of member unrealized + realized |

### 6.4 Chart Data

```
Equity curve:
  Source: Snapshot series (NOT raw ledger events)
  Rationale: Performance is defined on observations, not events.
  Granularity: Daily snapshot minimum.

  IF snapshot missing for date D:
    → Interpolate: no (v1). Gap in chart.
    → Label: INSUFFICIENT_SNAPSHOTS.

Intraday chart (v1.1+):
  → Optional: event-based from PositionCheckpoints
  → Not in v1 scope.
```

---

## 7. Cross-Broker Consistency

### 7.1 Broker Isolation

```
Each broker adapter is isolated:
  PaperBroker    → wallet W_paper
  BinanceBroker  → wallet W_binance
  BingXBroker    → wallet W_bingx

No shared ledger across brokers.
No shared externalRef namespace across brokers.

externalRef format: "{brokerId}:{nativeId}"
  "paper:fill:abc"
  "binance:trade:12345"
  "bingx:order:67890"

Cross-broker duplicate: IMPOSSIBLE by construction (different wallets, different refs).
```

### 7.2 Timestamp Unification

```
On import:
  1. Parse broker timestamp to UTC Instant
  2. Store as entry.timestamp (event time)
  3. Assign sequence at commit (system order)
  4. Store brokerId in entry metadata

Display:
  → Show event time (broker time) to user
  → Use sequence for all internal calculations

Portfolio aggregation:
  → Each wallet valued at query time T (system)
  → NOT at each wallet's last event time
  → portfolio.asOf = T (explicit)
```

### 7.3 Paper vs Real Broker Semantics

| Aspect | Paper (SIMULATED) | Binance / BingX (BROKER_LINKED) |
|---|---|---|
| SSOT | Ledger only | Ledger (post-reconciliation) |
| Broker state | Ephemeral (in-memory) | API-fetched each sync |
| Reconciliation | Not required | Required every sync |
| externalRef | Generated, no dedup needed | Broker-native ID, dedup required |
| Late fills | Impossible (instant) | Possible (import on sync) |
| Position divergence | Impossible by design | Possible until reconciled |

### 7.4 Divergence Resolution

```
IF wallet W is BROKER_LINKED AND reconciliation UNRESOLVED:
  → wallet.status = DEGRADED
  → New orders: REJECTED (ORDER_BLOCKED_RECONCILIATION)
  → Reads: allowed (with DEGRADED flag)
  → Sync: retried on schedule

IF divergence within tolerance (lot rounding, < $0.01 cash):
  → AUTO_ACCEPT
  → Log ReconciliationReport with resolution: ACCEPTED

IF divergence material:
  → MANUAL_REVIEW
  → Alert ops/user
  → Ledger NOT modified until resolution action
```

---

## 8. Failure Modes

### 8.1 Failure Catalog

| ID | Failure | Detection | System response | User-visible state |
|---|---|---|---|---|
| F1 | **Broker ↔ ledger desync** | ReconciliationEngine | `DEGRADED` flag, block orders | "Wallet needs attention" |
| F2 | **Duplicate trade import** | `externalRef` unique violation | Skip import (idempotent) | No visible effect |
| F3 | **Duplicate order submission** | `clientOrderId` unique | Return existing order | Original order shown |
| F4 | **Partial sync** (crash mid-import) | `lastSyncCursor` not advanced | Retry from cursor; dedup prevents doubles | Stale until sync completes |
| F5 | **Race: concurrent trades** | Per-wallet lock | Serial execution | Both succeed or second fails insufficient funds |
| F6 | **Race: sync + trade** | Lock contention | Trade priority; sync retries | Brief delay |
| F7 | **Stale portfolio** | `portfolio.asOf` lag | Serve with timestamp label | "As of 30s ago" |
| F8 | **Stale cache** | TTL expiry / missed invalidation | Cache miss → recompute | Correct on refresh |
| F9 | **Inconsistent cash** (bug) | Invariant test: cash != replay | Alert; block wallet | DEGRADED |
| F10 | **Wrong PnL post-reconciliation** | Checkpoint rebuild mismatch | Rebuild checkpoint from genesis | Correct after rebuild |
| F11 | **Late fill after snapshot** | `entry.timestamp < snapshot.asOf` | Snapshot not retroactively updated | Performance may revise on next capture |
| F12 | **Pricing unavailable** | PricingEngine timeout | Unrealized PnL = null; total value excludes or marks instrument UNPRICED | "Price unavailable" per line |
| F13 | **Multi-device holding conflict** | Revision CAS fail | 409 CONFLICT | "Refresh and retry" |

### 8.2 Recovery Procedures

| Failure | Recovery |
|---|---|
| F1 | Run full re-sync (`fullHistory=true`) → reconcile → resolve discrepancies |
| F4 | Restart sync from `lastSyncCursor` |
| F8 | Invalidate cache key; optional full RM rebuild from ledger |
| F9 | Seal wallet; replay from genesis; compare; alert if mismatch persists |
| F10 | Delete checkpoints (derived only); replay from genesis; write new checkpoint |
| F11 | Trigger on-demand snapshot capture; performance recalculates on next query |

---

## 9. System Behavior Spec

Deterministic contract. Format: **IF** condition → **THEN** mandatory behavior.

### 9.1 Ledger & Entries

| ID | Spec |
|---|---|
| L1 | IF `append(entry)` AND `wallet.status = archived` → THEN reject `LEDGER_SEALED`. |
| L2 | IF `append(entry)` AND `entry.id` already exists → THEN return existing entry (idempotent success). |
| L3 | IF `append(entry)` AND `entry.externalRef` already exists for wallet → THEN skip append (idempotent success). |
| L4 | IF append succeeds → THEN assign `sequence = max(sequence) + 1` atomically. No gaps. |
| L5 | IF append succeeds → THEN emit `LedgerEntryAppended` exactly once (at-least-once delivery; consumers idempotent). |
| L6 | IF `correctsEntryId` is set → THEN original entry MUST exist and MUST NOT itself be a correction. |
| L7 | IF replay reaches `PositionCheckpoint` → THEN reset accumulator to checkpoint state; continue from next sequence. |

### 9.2 Orders & Trades

| ID | Spec |
|---|---|
| O1 | IF `PlaceOrder` AND `wallet.status = DEGRADED` → THEN reject `ORDER_BLOCKED_RECONCILIATION`. |
| O2 | IF `PlaceOrder` AND insufficient cash at sequence head → THEN reject `INSUFFICIENT_CASH`. No partial append. |
| O3 | IF `PlaceOrder` AND `clientOrderId` exists → THEN return existing order + fill + entry. |
| O4 | IF broker returns fill → THEN append exactly one `TradeExecution` per fill inside same transaction as order status update. |
| O5 | IF `PlaceOrder` AND sync holds wallet lock → THEN wait up to `LOCK_TIMEOUT_MS` then reject `SYNC_IN_PROGRESS`. |

### 9.3 Broker Sync

| ID | Spec |
|---|---|
| B1 | IF sync starts → THEN acquire wallet lock before any import. |
| B2 | IF broker fill has unknown `externalRef` → THEN append `TradeExecution`. |
| B3 | IF broker fill has known `externalRef` → THEN skip (no error). |
| B4 | IF sync completes → THEN run `ReconciliationEngine.compare()`. |
| B5 | IF reconciliation UNRESOLVED → THEN set `wallet.status = DEGRADED`. |
| B6 | IF reconciliation RESOLVED → THEN set `wallet.status = active` (if was DEGRADED only for reconciliation). |
| B7 | IF broker positions differ from ledger projection → THEN NEVER overwrite ledger from positions. |
| B8 | IF sync crash before cursor advance → THEN next sync retries from same cursor; dedup prevents doubles. |

### 9.4 Snapshots

| ID | Spec |
|---|---|
| S1 | IF `captureSnapshot` → THEN record `asOfSequence` = current ledger head at capture moment. |
| S2 | IF snapshot exists for `(walletId, captureDate)` → THEN skip (idempotent, default). |
| S3 | IF snapshot captured → THEN emit `SnapshotCaptured`. |
| S4 | IF query asks for current balance → THEN MUST NOT return snapshot; compute live. |
| S5 | IF snapshot age > configured threshold → THEN label `STALE_SNAPSHOTS` on performance; do not reject query. |

### 9.5 Portfolio

| ID | Spec |
|---|---|
| P1 | IF member wallet event → THEN invalidate `portfolio_alloc:{id}` cache. Do NOT write to portfolio entity. |
| P2 | IF `GetPortfolioAllocation` → THEN fetch AccountSummary per member at query time T; set `portfolio.asOf = T`. |
| P3 | IF member wallet is archived → THEN exclude from default queries unless explicitly included. |
| P4 | IF `GetPortfolioPerformance` AND insufficient snapshots → THEN return `dataQuality: INSUFFICIENT_SNAPSHOTS`. Never invent data. |
| P5 | IF portfolio has zero members → THEN return empty allocation (zero value). Not an error. |

### 9.6 Cache

| ID | Spec |
|---|---|
| C1 | IF `LedgerEntryAppended` → THEN invalidate all cache keys for that `walletId` before commit ACK to client. |
| C2 | IF cache miss on wallet summary → THEN recompute from ledger/holdings (not from stale RM). |
| C3 | IF cache hit → THEN return cached value with `cachedAt` timestamp. |
| C4 | IF cached value age > TTL → THEN treat as miss. |

### 9.7 Holdings (Inventory)

| ID | Spec |
|---|---|
| H1 | IF `UpdateHolding` AND `revision` mismatch → THEN reject `CONFLICT`. |
| H2 | IF holding disposed → THEN exclude from valuation and AccountSummary. |
| H3 | IF same instrument in trading wallet AND inventory wallet for same owner → THEN allowed (separate wallets); portfolio sums both. |

### 9.8 Time & Ordering

| ID | Spec |
|---|---|
| T1 | IF conflict between `timestamp` and `sequence` ordering → THEN `sequence` wins. |
| T2 | IF late event imported → THEN append at next sequence; do NOT re-sequence existing entries. |
| T3 | IF late event predates latest snapshot → THEN snapshot is NOT retroactively updated. |

### 9.9 Tenancy

| ID | Spec |
|---|---|
| X1 | IF command `ownerId` ≠ wallet `ownerId` → THEN reject `FORBIDDEN`. |
| X2 | IF query without `tenantId` filter → THEN reject (no cross-tenant reads). |
| X3 | IF `externalRef` dedup → THEN scoped to `(walletId, externalRef)`, not global. |

---

## Appendix A — Staleness Budget Table

Maximum acceptable staleness for consumer-facing data (SLO):

| Data | Target staleness | Hard max | On exceed |
|---|---|---|---|
| Cash balance (live query) | 0s | 0s | N/A (always live) |
| Position (live query) | 0s | 0s | N/A |
| Wallet summary (cached) | 5s | 30s | Force cache miss |
| Portfolio allocation (cached) | 10s | 60s | Force recompute |
| Market price | 5s | 60s | Mark UNPRICED |
| Broker sync data | 1 min | 15 min | Show DEGRADED if reconciliation fails |
| Performance (TWR) | 24h | 48h | Label STALE_SNAPSHOTS |
| Chart (daily) | 24h | 48h | Gap in chart |

---

## Appendix B — Consistency Level by Operation

| Operation | Linearizable | Per-wallet serializable | Eventual |
|---|---|---|---|
| Append ledger entry | | ✓ | |
| Place order | | ✓ | |
| Broker sync | | ✓ | |
| Update holding (single) | | ✓ (optimistic) | |
| Get cash (live) | | ✓ | |
| Get position (live) | | ✓ | |
| Get wallet summary (cached) | | | ✓ |
| Get portfolio allocation | | | ✓ |
| Get performance | | | ✓ (frozen) |
| Get snapshot history | | ✓ (read) | |

---

## Appendix C — Document Cross-Reference

| Topic | Domain Model | Backend Architecture | This document |
|---|---|---|---|
| SSOT | §6.4, P1, P9 | §3 | §1, §3 |
| Ledger entries | §2.8–2.12 | §5 | §1.1, §2, §9.1 |
| Idempotency | P16 | §5.3 | §4.6, §9 |
| Reconciliation | §2.19, P19 | §7, §5.5 | §7.4, §8, §9.3 |
| Checkpoints | §2.8 | §8.3 | §1.1, §9.1-L7 |
| Snapshots | §2.20, P9 | §1.6 | §1.4, §5.4, §9.4 |
| Portfolio | §7 | §6 | §1.5, §6.2, §9.5 |
| Cache | — | §1.5 | §5, §6, §9.6 |

---

*End of document — CONSISTENCY_MODEL v1.0*
