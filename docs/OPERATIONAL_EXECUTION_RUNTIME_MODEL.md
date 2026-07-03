# Operational Execution Runtime Model

**Version:** 1.0  
**Status:** Frozen — Runtime operations contract  
**Audience:** Backend engineers, SRE, on-call, platform team  
**Scope:** Continuous operation under live markets: streaming, concurrency, latency pressure, infrastructure failure.

**Authority chain:** Implements and operationalizes all Cartera v1.0 architecture documents at runtime.

```
DOMAIN_MODEL.md
FINANCIAL_BACKEND_ARCHITECTURE.md
CONSISTENCY_MODEL.md
ARCHITECTURE_FAILURE_SIMULATION.md
EXECUTION_TRUTH_MODEL.md
USER_TRUTH_PRESENTATION_MODEL.md
EXCHANGE_BEHAVIOR_FIDELITY_MODEL.md
OPERATIONAL_EXECUTION_RUNTIME_MODEL.md  ← this document
```

**Central question:**

> ¿Puede este sistema operar continuamente bajo mercado real sin degradarse estructuralmente?

**Answer preview:** **Yes** for Tier 1 (ledger) invariants under defined load bounds. **Tier 4** (portfolio/cache) degrades gracefully. Structural corruption requires violation of ACID, lock discipline, or idempotency — all explicitly forbidden and detectable.

---

## Table of Contents

1. [Live Execution Loop](#1-live-execution-loop)
2. [Concurrency Model](#2-concurrency-model)
3. [Backpressure Model](#3-backpressure-model)
4. [Circuit Breaker System](#4-circuit-breaker-system)
5. [Memory vs Persistence Boundaries](#5-memory-vs-persistence-boundaries)
6. [Real-Time Order Execution Flow](#6-real-time-order-execution-flow)
7. [Failure Under Load](#7-failure-under-load)
8. [State Priority During Execution](#8-state-priority-during-execution)
9. [Recovery Protocol](#9-recovery-protocol)
10. [Guarantees (Hard Limits)](#10-guarantees-hard-limits)

---

## 1. Live Execution Loop

### 1.1 Runtime Processes

Cartera runtime consists of **six perpetual loops** plus **one on-demand path**. Each loop has a scheduler, priority class, and failure isolation boundary.

```
┌─────────────────────────────────────────────────────────────────┐
│                    RUNTIME SCHEDULER (per tenant/node)            │
├─────────────────────────────────────────────────────────────────┤
│  P0 CRITICAL   │ Order Execution Loop    │ user-initiated       │
│  P0 CRITICAL   │ Ledger Append Loop      │ tied to P0 writes    │
│  P1 HIGH       │ Event Ingestion Loop    │ WS + webhooks        │
│  P1 HIGH       │ Reconciliation Loop     │ post-sync/post-trade │
│  P2 NORMAL     │ Broker Sync Loop        │ scheduled + triggered│
│  P3 BACKGROUND │ Portfolio Projection    │ on-read + async RM   │
│  P3 BACKGROUND │ Snapshot Capture Loop   │ scheduled            │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Loop Specifications

#### L1 — Event Ingestion Loop

| Attribute | Value |
|---|---|
| **Input** | WebSocket frames, webhook payloads, broker push |
| **Output** | Normalized `BrokerEvent` queue per `walletId` |
| **Priority** | P1 |
| **Schedule** | Continuous; event-driven |
| **Parallelism** | Parallel across wallets; serial enqueue per wallet |
| **Does** | Parse, validate schema, assign `externalRef`, dedup in-memory bloom (hint only), enqueue |
| **Does NOT** | Append ledger, mutate state, call portfolio |

#### L2 — Order Execution Loop

| Attribute | Value |
|---|---|
| **Input** | `PlaceOrderCommand`, `CancelOrderCommand` |
| **Output** | `Order`, `Fill`(s), ledger entries |
| **Priority** | P0 |
| **Schedule** | On-demand (user/API) |
| **Parallelism** | Parallel across wallets; **serial per wallet** |
| **Does** | Validate, lock wallet, broker call, append ledger atomically, emit events |
| **Does NOT** | Sync full history, recompute portfolio synchronously |

#### L3 — Broker Sync Loop

| Attribute | Value |
|---|---|
| **Input** | Schedule tick, manual trigger, post-connect |
| **Output** | Imported ledger entries, `lastSyncCursor`, reconciliation trigger |
| **Priority** | P2 (elevated to P1 if `lastSyncAge > threshold`) |
| **Schedule** | Default: every 60s per active BROKER_LINKED wallet; adaptive |
| **Parallelism** | Parallel across wallets; **serial per wallet** (mutex with L2) |
| **Does** | REST pagination, import fills/movements/accruals, advance cursor on commit |
| **Does NOT** | Overwrite ledger, block reads |

#### L4 — Ledger Append Loop

| Attribute | Value |
|---|---|
| **Input** | Committed writes from L2, L3 |
| **Output** | Durable `LedgerEntry`, `LedgerEntryAppended` event |
| **Priority** | P0 |
| **Schedule** | Synchronous within L2/L3 transaction |
| **Parallelism** | Serial per wallet (DB row lock on `ledger_head`) |
| **Does** | Assign sequence, enforce invariants, persist, emit |
| **Does NOT** | Batch across wallets in single transaction |

#### L5 — Reconciliation Loop

| Attribute | Value |
|---|---|
| **Input** | Post-sync broker state, ledger projection |
| **Output** | `ReconciliationReport`, wallet status update |
| **Priority** | P1 |
| **Schedule** | After every L3 completion; after burst L1 import |
| **Parallelism** | Parallel across wallets |
| **Does** | Compare, tolerance check, set DEGRADED/CLEAR, emit alerts |
| **Does NOT** | Modify ledger entries |

#### L6 — Portfolio Projection Loop

| Attribute | Value |
|---|---|
| **Input** | `LedgerEntryAppended`, `HoldingUpdated`, read queries |
| **Output** | `WalletSummaryRM`, `AccountSummary v1`, cache |
| **Priority** | P3 |
| **Schedule** | On-read (sync v1); async worker (v2); debounced 500ms |
| **Parallelism** | Fully parallel; no wallet lock |
| **Does** | Replay/invalidate cache, aggregate portfolio on query |
| **Does NOT** | Write Tier 1, block L2 |

#### L7 — Snapshot Capture Loop

| Attribute | Value |
|---|---|
| **Input** | Schedule (daily), post-sync success, on-demand |
| **Output** | `Snapshot` persisted |
| **Priority** | P3 |
| **Schedule** | Daily 00:00 UTC; post-sync optional |
| **Parallelism** | Parallel across wallets |
| **Does** | Valuation at head, persist observation |
| **Does NOT** | Block trading, mutate ledger |

### 1.3 Scheduler Priority Rules

```
RULE SCH1: P0 (order/ledger) always preempts P2/P3 for same wallet lock.
RULE SCH2: P1 ingestion queues depth; processed before next P2 sync batch for same wallet.
RULE SCH3: P3 never acquires wallet write lock.
RULE SCH4: Starvation cap: P3 portfolio sync max delay 30s even under P0 load.
RULE SCH5: Per-tenant fair scheduling: round-robin across wallets for P2/P3.
```

### 1.4 Typical Tick Timeline (Single Wallet, BROKER_LINKED)

```
T+0ms    WS: fill event → L1 enqueue
T+5ms    L1 dedup → queue
T+10ms   L3 not running; L2 idle → L1 consumer acquires lock
T+15ms   L4 append entry seq=N
T+20ms   L5 reconcile → OK
T+25ms   L6 invalidate cache (async)
T+60s    L3 scheduled sync starts
T+65s    L3 import 0 new (dedup) → L5 OK → LIVE
```

---

## 2. Concurrency Model

### 2.1 Parallel vs Serialized

| Operation | Cross-wallet | Per-wallet | Mechanism |
|---|---|---|---|
| Order execution | **Parallel** | **Serial** | `lock:wallet:{id}` |
| Ledger append | **Parallel** | **Serial** | Same lock |
| Broker sync | **Parallel** | **Serial** | Same lock |
| WS event ingest | **Parallel** | **Serial enqueue** | Per-wallet queue |
| Reconciliation | **Parallel** | **Serial** (reads head) | No write lock |
| Position replay | **Parallel** | **Parallel read** | Read-only |
| Portfolio aggregate | **Parallel** | **Parallel** | No lock |
| Snapshot capture | **Parallel** | **Brief read lock** | Read head under MVCC |
| Holding CRUD (inventory) | **Parallel** | **Per-holding CAS** | `holding.revision` |

### 2.2 Lock Hierarchy

```
Lock order (prevent deadlock):
  1. tenantId scope (optional cluster lock for migration)
  2. walletId ascending (if multi-wallet transaction)
  3. ledger_head row (FOR UPDATE)
  4. holding row (optimistic revision)

NEVER hold wallet lock across broker network call > 5s without heartbeat.
  → Use: submit order → release? NO — hold lock for atomicity (v1 mobile).
  → v2 cloud: outbox pattern; shorten lock to local reservation only.
```

**v1 (mobile single-process):** In-process mutex per `walletId`. Broker call under lock acceptable if < 10s timeout.

**v2 (cloud):** Distributed lock (Redis/DB advisory) per `walletId`; TTL 30s with renewal.

### 2.3 Real Race Conditions

#### Race A: Two orders same wallet

```
Thread-1: PlaceOrder BUY  → acquire lock(W1)
Thread-2: PlaceOrder SELL → block on lock(W1)
Thread-1: append seq 10, release
Thread-2: read head 10, validate, append seq 11 OR reject INSUFFICIENT

Result: serial. No lost update.
```

#### Race B: Sync vs order

```
Thread-1: Sync(W1)          → acquire lock(W1)
Thread-2: PlaceOrder(W1)    → block; timeout 10s → SYNC_IN_PROGRESS

OR (priority policy):

Thread-1: PlaceOrder(W1)    → acquire lock
Thread-2: Sync(W1)          → defer; retry in 5s

v1 policy: ORDER WINS (user-initiated P0).
```

#### Race C: WS fill + REST sync same fill

```
L1: WS enqueues fill externalRef=X
L3: REST batch includes fill X
Both: first to acquire lock appends; second dedups

Result: one entry.
```

#### Race D: Cache update vs ledger append

```
L4: append commits seq 15
L6: async cache update starts (stale read of seq 14 possible)

Mitigation:
  C1: invalidate cache BEFORE commit ACK to client
  L6: cache miss → replay from seq 15 head

Result: brief STALE possible; never wrong after invalidation.
```

---

## 3. Backpressure Model

### 3.1 Backpressure Signals

| Signal | Threshold | Severity |
|---|---|---|
| `broker_api_error_rate` | > 20% over 1 min | HIGH |
| `sync_queue_depth` | > 100 wallets pending | MEDIUM |
| `ingest_queue_depth(wallet)` | > 50 events | HIGH per wallet |
| `ledger_append_latency_p99` | > 500 ms | HIGH |
| `portfolio_recompute_lag` | > 30 s | LOW |
| `db_connection_pool_wait` | > 80% utilized | CRITICAL |

### 3.2 Broker API Collapse

```
IF broker_api_error_rate > 20%:
  1. Enable circuit breaker for broker (§4)
  2. Pause L3 sync for that broker (not per-wallet yet)
  3. L2 orders: SIMULATED unaffected; BROKER_LINKED → reject new orders (DEGRADED)
  4. L1 WS: buffer events in queue (max 1000); drop with alert if overflow
  5. Reads: continue from ledger (LIVE/DEGRADED)
  6. User: "Binance no disponible temporalmente"

RECOVERY: error_rate < 5% for 2 min → half-open → resume sync
```

### 3.3 Sync Backlog Growth

```
IF sync_queue_depth > 100:
  1. Increase sync interval temporarily (60s → 120s) for non-priority wallets
  2. Priority boost: wallets with lastSyncAge > 15 min first
  3. Do NOT skip sync entirely
  4. Portfolio: serve STALE with label
  5. Trading BROKER_LINKED: blocked only if individual wallet DEGRADED

IF sync_queue_depth > 1000:
  1. Global broker circuit breaker (pause new BROKER_LINKED orders)
  2. Alert ops
  3. Reads continue
```

### 3.4 Ledger Append Congestion

```
IF ledger_append_latency_p99 > 500ms:
  1. Throttle P3 snapshot capture
  2. Do NOT throttle P0 orders
  3. Batch ingest (L1) coalesce duplicate externalRef before lock
  4. Alert DB performance
  5. IF > 2s: reject new orders with SYSTEM_OVERLOADED (503)

Tier 1 integrity: NEVER batch append across wallets in one tx to "speed up"
```

### 3.5 Portfolio Recompute Lag

```
IF portfolio_recompute_lag > 30s:
  1. Serve cached allocation with STALE label (USER_TRUTH U4)
  2. Do NOT block trading
  3. Scale P3 workers (v2)
  4. Never write to Tier 1

Portfolio lag is display-only degradation.
```

### 3.6 Backpressure Summary Table

| Condition | Trading SIMULATED | Trading BROKER | Reads | Portfolio | Ledger |
|---|---|---|---|---|---|
| Broker API down | ✓ | ✗ | ✓ | STALE | ✓ |
| Sync backlog | ✓ | ✓* | ✓ | STALE | ✓ |
| Ledger slow | ✓** | ✓** | ✓ | STALE | ✓ |
| Ingest flood | ✓ | ✓ | ✓ | STALE | ✓ (queued) |

\* Individual wallet may be DEGRADED.  
\** Until SYSTEM_OVERLOADED threshold.

---

## 4. Circuit Breaker System

### 4.1 States

```
CLOSED    → normal operation
OPEN      → fail fast; no broker calls
HALF_OPEN → probe with single request
```

### 4.2 Broker-Level Breaker

| Parameter | Default |
|---|---|
| Failure threshold | 5 failures / 60s |
| Open duration | 120s |
| Half-open probes | 1 sync per 30s |
| Success to close | 3 consecutive successes |

```
Triggers OPEN:
  - error_rate > 20% (1 min)
  - rate_limit 429 sustained > 5 min
  - auth 401/403
  - IP ban 418

While OPEN:
  - L2 BROKER_LINKED: reject PlaceOrder
  - L3: paused
  - L1: queue only (bounded)
  - Existing ledger: readable
  - wallet.status: DEGRADED (broker unavailable)
```

### 4.3 Wallet-Level Breaker

| Trigger | Action |
|---|---|
| Reconciliation MANUAL_REVIEW unresolved > 24h | DEGRADED; orders blocked |
| CORRUPTED detected | UNKNOWN; all writes blocked |
| 3 consecutive sync failures | DEGRADED |
| Negative cash invariant violation | CORRUPTED |

```
Wallet breaker independent per wallet.
One wallet DEGRADED does not trip broker breaker for other wallets.
```

### 4.4 Global / Tenant-Level Breaker

```
Triggers GLOBAL_PAUSE (rare):
  - DB unavailable > 30s
  - ledger_append failure rate > 10%
  - security incident

While GLOBAL_PAUSE:
  - All writes rejected
  - Reads from last known cache/ledger (read-only mode)
  - Alert P0
```

### 4.5 Auto-Recovery Conditions

| From | To | Condition |
|---|---|---|
| OPEN | HALF_OPEN | open_duration elapsed |
| HALF_OPEN | CLOSED | 3 probe successes |
| HALF_OPEN | OPEN | probe fails |
| DEGRADED | active | reconciliation RESOLVED |
| CORRUPTED | active | manual ops + successful full replay audit |
| GLOBAL_PAUSE | normal | DB healthy + spot check 10 wallets |

### 4.6 Trading Auto-Pause Matrix

| Condition | SIMULATED | BROKER_LINKED |
|---|---|---|
| Broker breaker OPEN | ✓ trade | ✗ pause |
| Wallet DEGRADED | ✓ trade | ✗ pause |
| Wallet CORRUPTED | ✗ pause | ✗ pause |
| GLOBAL_PAUSE | ✗ pause | ✗ pause |
| RECONCILING | ✓ trade | ✗ pause |
| SYSTEM_OVERLOADED | ✗ pause | ✗ pause |

---

## 5. Memory vs Persistence Boundaries

### 5.1 Classification

| Artifact | RAM (ephemeral) | Persistent | Crash behavior |
|---|---|---|---|
| `LedgerEntry` | — | **Yes (SSOT)** | Survives |
| `Order` / `Fill` | — | **Yes** | Survives |
| `Holding` | — | **Yes** | Survives |
| `Wallet` metadata | — | **Yes** | Survives |
| `Connection` credentials | — | **Yes (encrypted)** | Survives |
| `Snapshot` | — | **Yes** | Survives |
| `Portfolio` definition | — | **Yes** | Survives |
| `ReconciliationReport` | — | **Yes** | Survives |
| Broker WS buffer | **Yes** | No | Lost; REST backfill |
| Ingest queue (unprocessed) | **Yes** | No** | Lost; sync recovers |
| Position projection | **Yes (cache)** | No | Rebuilt from ledger |
| Cash balance cache | **Yes** | No | Rebuilt from ledger |
| `WalletSummaryRM` | **Yes** | Optional | Rebuilt |
| Portfolio allocation cache | **Yes** | No | Rebuilt |
| In-flight order state | **Yes** | No*** | See §5.2 |
| Bloom dedup hint | **Yes** | No | Harmless; DB dedup authoritative |
| Market prices | **Yes** | No | Refetched |

\** v2: durable queue (outbox) for ingest — recommended cloud.  
\*** Order row persisted on ACK; in-flight before ACK may need broker query on recovery.

### 5.2 Crash Mid-Operation

| Crash point | Persistent state | Recovery action |
|---|---|---|
| Before broker submit | No order row | Client retry idempotent |
| After broker ACK, before DB commit | Unknown | Query broker `clientOrderId`; import or complete |
| After DB commit, before event emit | Entry exists | Event replay from outbox (v2) or cache invalidate on read |
| During sync mid-batch | Partial entries committed | Cursor not advanced; retry dedups |
| During reconciliation | Report may be missing | Re-run reconcile |
| During cache update | Stale cache | Miss → replay |
| During snapshot capture | Partial snapshot | Idempotent skip or complete |

### 5.3 Durability Contract

```
TIER 1 durability requirement:
  - RPO (recovery point objective): 0 for committed ledger entries (sync replication)
  - RTO (recovery time objective): < 60s for process restart
  - Uncommitted work: recoverable via broker query + idempotency

TIER 4:
  - RPO: unbounded (rebuild acceptable)
  - RTO: < 5s cache miss replay
```

---

## 6. Real-Time Order Execution Flow

### 6.1 State Machine (Complete)

```
[CMD_RECEIVED]
      │
      ▼
[VALIDATING] ──reject──► [REJECTED] (no ledger)
      │
      ▼
[LOCK_ACQUIRED]
      │
      ▼
[BROKER_SUBMITTING] ──timeout──► [BROKER_UNCERTAIN] ──query──► [FILLED|REJECTED|NEW]
      │
      ├──reject──► [REJECTED]
      │
      ▼
[BROKER_ACKED] (Order.status = NEW)
      │
      ▼
[AWAITING_FILLS] ──────────────────────────────┐
      │                                        │
      ├──partial fill──► [PARTIALLY_FILLED]    │
      │         │              │               │
      │         └────append fill──────────────┤
      │                                        │
      ├──full fill──► [FILLED]                 │
      │         │                              │
      │         └────append final fill─────────┤
      │                                        │
      └──cancel──► [CANCELLED]                 │
                │                              │
                └────append partial if any─────┘
                              │
                              ▼
                    [LEDGER_COMMITTED]
                              │
                              ▼
                    [CACHE_INVALIDATED]
                              │
                              ▼
                    [RECONCILE_QUEUED] (BROKER_LINKED)
                              │
                              ▼
                    [COMPLETE]
```

### 6.2 Intermediate States — User Truth Mapping

| Internal state | S_pending | S_confirmed | presentationState | allowTrading |
|---|---|---|---|---|
| CMD_RECEIVED | — | — | LIVE | ✓ |
| VALIDATING | — | — | LIVE | ✓ |
| BROKER_SUBMITTING | order | — | LIVE | ✓ (CTA loading) |
| BROKER_UNCERTAIN | order | — | LIVE | ✗ (same wallet) |
| BROKER_ACKED | order | — | LIVE | ✓ |
| PARTIALLY_FILLED | remainder | partial fills | LIVE | ✓ |
| LEDGER_COMMITTED | — | updated | LIVE | ✓ |
| RECONCILING (post) | — | updated | RECONCILING | ✗ broker |

### 6.3 Optimistic State Policy

```
v1: NO optimistic balance update.
     User sees pending order separately.
     Balance updates ONLY on LEDGER_COMMITTED.

Rationale: exchange fidelity — fills are uncertain until committed.
Avoids rollback UX on reject.
```

### 6.4 Partial Fill Streaming

```
Each fill event (WS or poll):
  1. Acquire lock(walletId)
  2. Dedup externalRef
  3. Append TradeExecution (single tx: fill row + ledger entry + order status)
  4. Invalidate cache
  5. Release lock
  6. Emit LedgerEntryAppended
  7. User: atomic display update per fill (may be 3 updates for 3 fills)

Debounce: none on balance (each fill is real money movement).
```

### 6.5 Finalization

```
Order FILLED:
  - sum(fills.quantity) == order.quantity
  - order.status = FILLED
  - queue L5 reconcile (BROKER_LINKED)

Order CANCELLED partial:
  - ledger has partial fills only
  - no rollback of committed fills
```

---

## 7. Failure Under Load

### 7.1 Scenario Matrix

| Scenario | Load | System behavior | Structural risk |
|---|---|---|---|
| **10k events/sec ingestion** (cluster) | Extreme | Per-wallet queues absorb; fair scheduling; ingest lag; ledger unaffected for processed events | Queue overflow → event loss → sync backfill required |
| **10k events/sec single wallet** | Impossible (exchange limit) | Per-wallet serial → backlog; RECONCILING; delay hours | Theoretical; exchange rate limits first |
| **Burst trading 100 orders/min/user** | High | Serial per wallet; each < 500ms; queue depth 100 | Lock timeout → 503 |
| **WebSocket flood** | High | L1 queue max 1000/wallet; drop oldest non-critical; REST backfill | Missed WS → sync recovers |
| **Duplicate event storm** | Medium | Dedup O(1) DB; bloom pre-filter; CPU bound | None if dedup holds |
| **Delayed reconciliation batch** | Medium | Wallets stay DEGRADED until processed; reads OK | Display lag; no money loss |
| **DB connection exhaustion** | Critical | GLOBAL_PAUSE; reject writes | Uncommitted orders → broker query recovery |

### 7.2 10k Events/Sec (Cluster-Wide)

```
Architecture assumption: 10k/sec across 10k wallets = 1/sec/wallet → trivial.
                       10k/sec to 10 wallets = 1000/sec/wallet → NOT SUPPORTED v1.

Policy:
  IF events/sec per wallet > 10:
    1. Coalesce by externalRef in L1
    2. Sample WS for non-critical balance updates
    3. Force REST sync as authoritative batch
    4. Alert

v1 mobile: single wallet focus — not 10k/sec target.
v2 cloud: horizontal ingest workers + durable queue.
```

### 7.3 Burst Trading

```
100 orders in 60s same wallet:
  Serial execution: 100 × 200ms = 20s minimum
  User: orders queue; CTA shows queue position
  Cash: validated at each head — no overdraft
  IF queue > 50: reject new with ORDER_QUEUE_FULL
```

### 7.4 WebSocket Flood

```
> 1000 events/sec WS (reconnect replay):
  1. Bloom dedup → 99% skip before lock
  2. Remaining serial append
  3. IF queue > 1000: drop frame; rely on L3 REST
  4. Never corrupt ledger
```

### 7.5 Duplicate Event Storm

```
10000 duplicate externalRef/sec:
  DB unique index → skip
  CPU: bloom filter reduces load
  No ledger growth
  User: no visible effect
```

### 7.6 Delayed Reconciliation Batch

```
1000 wallets reconcile pending:
  Process parallel (no wallet lock conflict for read-only compare)
  Write DEGRADED flags parallel
  User: gradual banner clearance as processed
  Max DEGRADED duration: until processed (SLA 15 min p99)
```

---

## 8. State Priority During Execution

### 8.1 Runtime Priority Stack

```
Priority (highest first):

1. LEDGER committed entries (Tier 1)
2. WALLET status gates (DEGRADED/CORRUPTED)
3. ORDER in-flight (PENDING — not truth, but blocks same-wallet)
4. BROKER import (becomes ledger on commit)
5. RECONCILIATION result (status gate only)
6. LIVE replay projection (position/cash)
7. CACHE (hint)
8. SNAPSHOT (historical)
9. PORTFOLIO aggregate (derived)
10. UI presentation (UserFacingState)
```

### 8.2 Active Conflict Resolution (Runtime)

| Conflict | Winner | Loser action |
|---|---|---|
| Ledger vs broker (write) | Ledger | Broker import appends only |
| Ledger vs cache | Ledger | Invalidate cache |
| Ledger vs snapshot | Ledger (live) | Snapshot for historical only |
| Order lock vs sync | Order (P0) | Sync retries |
| Reconciliation vs display | Ledger + status flag | USER_TRUTH shows DEGRADED |
| Portfolio vs wallet | Wallet | Portfolio recomputes |
| Pricing vs position | Position qty from ledger; price from feed | UNPRICED if no feed |

### 8.3 What User Sees During Active Execution

```
During BROKER_SUBMITTING:
  - pending order visible
  - balance unchanged
  - presentationState: LIVE

During PARTIALLY_FILLED:
  - balance updates per committed fill
  - pending shows remainder
  - presentationState: LIVE

During RECONCILING (post-trade):
  - balance frozen at last committed (USER_TRUTH)
  - presentationState: RECONCILING
  - trading BROKER_LINKED: blocked

During DEGRADED:
  - ledger values shown
  - trading blocked (broker)
  - broker reference expandable
```

---

## 9. Recovery Protocol

### 9.1 Cold Restart (Process Kill)

```
SEQUENCE:
  1. Process starts
  2. DB connectivity check
  3. Run ledger integrity scan (sample or full)
  4. Rebuild bloom dedup from recent externalRefs (optional)
  5. Clear all RAM caches (safe)
  6. Resume schedulers:
     - L3 sync all BROKER_LINKED wallets (staggered 1s apart)
     - L7 snapshot scheduler
  7. Do NOT replay portfolio RM — lazy on read
  8. Mark in-flight orders: query broker for UNCERTAIN states
  9. Serve reads from ledger replay (LIVE)

RTO target: < 60s to first read
RPO: 0 for committed entries (with sync replication)
```

### 9.2 Partial State Recovery

```
IF cache lost only:
  → no action; lazy rebuild

IF RM lost:
  → rebuild on read from ledger

IF ingest queue lost:
  → L3 full sync per wallet with lastSyncCursor

IF ledger partial corruption (gap):
  → wallet CORRUPTED
  → restore from backup OR broker full re-sync
  → manual ops sign-off
```

### 9.3 Ledger Replay Bootstrap

```
ON startup integrity check OR on-demand:
  FOR EACH wallet:
    replay entries [0..head] OR [checkpoint..head]
    ASSERT cash >= 0 (v1 long-only)
    ASSERT sequence continuous
    ASSERT position qty >= 0
    IF fail → CORRUPTED

ON pass:
  write PositionCheckpoint at head (optimization)
```

### 9.4 Broker Resync Strategy

```
STANDARD sync (every 60s):
  fetch since lastSyncCursor
  import deduped
  reconcile
  advance cursor

FULL resync (on DEGRADED, reconnect, manual):
  fetch from epoch or last known good date
  paginate all trades
  import deduped only
  reconcile
  IF pass → clear DEGRADED

EMERGENCY resync (CORRUPTED recovery):
  seal ledger OR new wallet
  import broker full history to new sealed stream
  ops migration
```

### 9.5 Snapshot Regeneration

```
Snapshots are disposable observations.

IF snapshot store lost:
  - live queries unaffected
  - performance charts empty until recapture
  - batch job: capture daily snapshots for historical range if ledger exists

IF regenerate from ledger:
  - replay ledger to each EOD head
  - capture snapshot per day
  - expensive; background P3 only
```

---

## 10. Guarantees (Hard Limits)

### 10.1 Maintained Under Load (NEVER break)

| ID | Guarantee | Load condition |
|---|---|---|
| G1 | No double append same `entry.id` | All load |
| G2 | No double append same `externalRef` per wallet | All load |
| G3 | No negative cash post-commit (v1 long-only) | Per-wallet serial |
| G4 | No ledger entry mutation/deletion | All load |
| G5 | No broker overwrite of ledger | All load |
| G6 | Per-wallet sequence monotonic no gaps post-commit | All load |
| G7 | Tenancy isolation (`tenantId` on all queries) | All load |
| G8 | Idempotent order retry (`clientOrderId`) | All load |
| G9 | Tier 1 RPO = 0 (with sync replication) | Infra dependent |

### 10.2 Degraded Under Load (bounded)

| ID | Guarantee | Degradation |
|---|---|---|
| D1 | Live read latency < 200ms | May exceed → STALE label |
| D2 | Portfolio freshness < 5s | May reach 60s STALE |
| D3 | Sync interval 60s | May stretch to 15 min |
| D4 | BROKER_LINKED trading always available | Paused if DEGRADED/breaker |
| D5 | WS event processing real-time | Queued; REST backfill |
| D6 | Performance chart current | Snapshot daily only |

### 10.3 Never Broken (Absolute)

```
N1: Committed money movements are not lost (G1-G2, G9).
N2: User cannot spend same cash twice (G3, per-wallet serial).
N3: Internal truth has exactly one mutation path (ledger append).
N4: Display lies without label are forbidden (USER_TRUTH contract).
N5: CORRUPTED wallet never accepts writes until cleared.
```

### 10.4 Load Bounds (v1 Design Capacity)

| Dimension | v1 target | Beyond bound |
|---|---|---|
| Wallets per user | 50 | STALE portfolio likely |
| Orders/sec per wallet | 2 | QUEUE_FULL |
| Events/sec per wallet | 10 | Force REST sync |
| Ledger entries per wallet | 1M | Checkpoint required |
| Concurrent users (mobile) | 1 device | N/A |
| Concurrent users (cloud v2) | 10k | Horizontal scale |

### 10.5 Final Operational Verdict

```
┌──────────────────────────────────────────────────────────────┐
│  ¿Operación continua sin degradación ESTRUCTURAL?            │
│                                                              │
│  SÍ — si:                                                    │
│    • ACID + per-wallet lock discipline enforced              │
│    • Idempotency keys on all write paths                     │
│    • Sync replication for DB                                 │
│    • Load within §10.4 bounds                                │
│                                                              │
│  DEGRADACIÓN ESPERADA (no estructural):                      │
│    • Latencia display (STALE)                                │
│    • Trading pause BROKER_LINKED under breaker               │
│    • Portfolio lag                                           │
│    • RECONCILING windows                                     │
│                                                              │
│  NO ES:                                                      │
│    • Matching engine de exchange                             │
│    • Sub-millisecond trading system                          │
│    • 10k orders/sec single wallet                            │
│                                                              │
│  CLASIFICACIÓN:                                              │
│    Arquitectónicamente correcto  → documentos 1-7 ✓          │
│    Operacionalmente real         → este documento ✓            │
│    Production-ready SPOT         → Phase 5 impl + chaos tests│
└──────────────────────────────────────────────────────────────┘
```

---

## Appendix A — Runtime Metrics (Mandatory Observability)

| Metric | Alert threshold | Action |
|---|---|---|
| `ledger_append_latency_p99` | > 500ms | DB investigate |
| `wallet_lock_wait_p99` | > 2s | Scale or throttle |
| `sync_queue_depth` | > 100 | Priority boost |
| `reconciliation_unresolved_count` | > 10 | Ops review |
| `broker_circuit_state` | OPEN | Page on-call |
| `ingest_queue_depth` | > 500 | Force REST |
| `corrupted_wallets` | > 0 | SEV-1 |
| `dedup_skip_rate` | > 50%/min | WS replay storm |
| `portfolio_stale_served_rate` | > 30% | Scale P3 |

---

## Appendix B — On-Call Decision Tree

```
Alert fires
│
├─ corrupted_wallets > 0 ?
│   └─ YES → SEV-1: halt writes wallet, ops runbook §9.2
│
├─ broker_circuit OPEN ?
│   └─ YES → SEV-2: expect DEGRADED users, monitor recovery
│
├─ ledger_append_latency high ?
│   └─ YES → DB scale, throttle snapshots only
│
├─ sync_queue_depth high ?
│   └─ YES → boost stale wallets, not SEV-1 unless > 1000
│
└─ portfolio_stale high ?
    └─ YES → informational unless user complaints
```

---

## Appendix C — Document Cross-Reference

| Topic | Source doc | This doc |
|---|---|---|
| Per-wallet lock | CONSISTENCY §4 | §2 |
| Backpressure | FIDELITY §5 | §3 |
| DEGRADED triggers | USER_TRUTH §2 | §4, §6 |
| Crash recovery | FAILURE_SIM §3 | §5.2, §9 |
| Order lifecycle | FIDELITY §3 | §6 |
| Truth priority | EXECUTION_TRUTH §8 | §8 |
| Load scenarios | FAILURE_SIM §7 | §7 |

---

*End of document — OPERATIONAL_EXECUTION_RUNTIME_MODEL v1.0*
