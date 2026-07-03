# Execution Truth Model

**Version:** 1.0  
**Status:** Frozen — Authority contract for Cartera runtime  
**Audience:** Backend engineers, architects, on-call, API designers  
**Scope:** Who owns truth at every instant. Resolves all authority ambiguity.

**Authority chain:**

```
DOMAIN_MODEL.md              → what exists
FINANCIAL_BACKEND_ARCHITECTURE.md  → how it orchestrates
CONSISTENCY_MODEL.md           → temporal behavior
ARCHITECTURE_FAILURE_SIMULATION.md → failure behavior
EXECUTION_TRUTH_MODEL.md       → who is right, when (this document)
```

**Purpose:** If two components disagree at runtime, this document decides the winner. No interpretation. No heuristics.

---

## Table of Contents

1. [Execution Truth Definition](#1-execution-truth-definition)
2. [Truth Ownership Matrix](#2-truth-ownership-matrix)
3. [Event Priority Hierarchy](#3-event-priority-hierarchy)
4. [Conflict Resolution Engine](#4-conflict-resolution-engine)
5. [Real-Time State Model](#5-real-time-state-model)
6. [Failure Injection Behavior](#6-failure-injection-behavior)
7. [Final System Guarantee](#7-final-system-guarantee)
8. [Wallet vs Portfolio Truth Boundary](#8-wallet-vs-portfolio-truth-boundary)

---

## 1. Execution Truth Definition

### 1.1 What Is "Truth at T"

**Truth at T** is the unique, authoritative financial state of a wallet (or portfolio projection over wallets) that the system is permitted to use for **mutations** and **live balance queries** at wall-clock instant `T`.

Formally:

```
TruthAt(T, walletId) = f(
  LedgerEntries[0..headSequence],   // trading wallets
  Holdings[active],                  // inventory wallets
  Pricing[instruments, T]          // market data (external, read-only)
)
```

For portfolio:

```
TruthAt(T, portfolioId) = aggregate(
  TruthAt(T, memberWalletId) for each member
)
```

**Truth at T is NOT:**

- A snapshot (unless query explicitly requests historical `asOf`)
- A cache entry
- A broker API response
- A portfolio read model
- A user intent that has not committed to Tier 1

### 1.2 Truth Layers (Authority Participation)

| Layer | Tier | Participates in truth? | Role |
|---:|---|---|---|
| **Ledger entries** | 1 | **YES — SSOT for trading wallets** | Authoritative event history |
| **Holdings** | 1 | **YES — SSOT for inventory wallets** | Authoritative ownership |
| **Wallet metadata** | 2 | Partial (config only) | `executionMode`, `status`, `costBasisPolicy` gate behavior |
| **Market pricing** | 0 (external) | Input only | Marks positions/holdings to market; not owned by Cartera |
| **Broker state** | 0 (external) | **NO** — import source only | Untrusted until committed as ledger entry |
| **Order / Fill** | 1.5 (pre-ledger) | Transitional | Authoritative for order lifecycle; fill becomes truth only after ledger commit |
| **Snapshot** | 3 | **NO** for current truth | Historical observation only |
| **Portfolio definition** | 2 | Partial (membership only) | Which wallets to aggregate; not their values |
| **AccountSummary / RM / Cache** | 4 | **NO** | Projections; must be derivable from Tier 1 |

### 1.3 Layers That NEVER Have Authority

These layers **MUST NEVER** override Tier 1, **MUST NEVER** be used as mutation input, **MUST NEVER** be shown as exact current balance without recomputation from Tier 1:

| Layer | Why excluded |
|---|---|
| Broker `getPositions()` / `getBalances()` | External, unvalidated, may lag or diverge |
| Snapshot | Frozen past observation |
| Portfolio allocation cache | Derived, may be stale |
| WalletSummaryRM | Derived cache |
| Position checkpoint (alone) | Derived optimization artifact within stream |
| User UI state | Not domain |
| Pricing (alone) | Does not define ownership — only marks it |

### 1.4 Runtime Active Conflict Resolution

When two sources disagree **during active runtime** (not post-mortem):

```
RESOLVE(active_conflict):
  1. IF conflict involves mutation authority
       → Tier 1 wins. Always.
  2. IF broker state vs ledger projection (BROKER_LINKED)
       → Ledger wins for app logic.
       → Broker wins for detection only (triggers reconciliation).
       → Wallet → DEGRADED until resolved.
  3. IF cache vs ledger replay
       → Ledger wins. Invalidate cache.
  4. IF snapshot vs live query
       → Ledger wins for current. Snapshot wins only for historical `asOf` queries.
  5. IF portfolio vs wallet
       → Wallet wins. Portfolio recomputes.
  6. IF two uncommitted intents (orders)
       → Per-wallet serial lock. First commit wins. Second validates against new head.
  7. IF committed ledger vs anything
       → Ledger wins. No exceptions.
```

**No hidden heuristics.** If not covered here, default: **Tier 1 wins; halt mutations if ambiguous (DEGRADED/CORRUPTED).**

---

## 2. Truth Ownership Matrix

| State | Truth Owner | What is authoritative | Override policy | Who may mutate |
|---|---|---|---|---|
| **Order placed** | Trading context (`Order` entity) | `Order.status = PENDING`, `clientOrderId` | None until fill or cancel | Trading Engine via broker |
| **Order executed (broker)** | Broker adapter (ephemeral) | Broker fill report | None — not yet domain truth | Broker protocol only |
| **Trade pending sync** | Broker (Tier 0) | Broker fill exists externally, not in ledger | **Cannot override ledger.** Awaiting import. | BrokerSync Engine (import only) |
| **Trade confirmed broker** | Broker (Tier 0) | Broker acknowledges fill in their system | Import as ledger entry; dedup by `externalRef` | BrokerSync → LedgerEngine.append |
| **Trade confirmed ledger** | **Ledger (Tier 1)** | `LedgerEntry` at `sequence N` committed | **Immutable. Nothing overrides.** | Nobody |
| **Cash movement pending** | User intent / broker report | Uncommitted | Append to ledger to become truth | LedgerEngine.append |
| **Cash confirmed ledger** | **Ledger (Tier 1)** | `CashMovement` entry | Immutable | Nobody |
| **Position (current)** | **Derived from Ledger (Tier 1)** | `PositionEngine.project(head)` | Recomputed on every live query or cache miss | Nobody (derived) |
| **Holding (inventory)** | **Holding entity (Tier 1)** | `Holding` row + revision | CRUD with audit; not overridden by broker | Inventory Engine |
| **Wallet metadata** | **Wallet aggregate (Tier 2)** | name, status, executionMode | Metadata commands only | Wallet services |
| **Snapshot captured** | **Snapshot (Tier 3)** | Value at `(asOf, asOfSequence)` | Immutable; does not override ledger | Nobody |
| **Portfolio definition** | **Portfolio (Tier 2)** | Member refs, benchmark, aggregationCurrency | Portfolio commands only | Portfolio Service |
| **Portfolio value (live)** | **Derived (Tier 4)** | `Σ AccountSummary v1` at query time T | Recomputed; never stored as truth | Nobody |
| **Portfolio value (cached)** | **None (non-authoritative)** | Cache entry | TTL expiry → recompute from wallets | Nobody |
| **Reconciliation pending** | **Ledger (Tier 1)** for app; **Broker (Tier 0)** for comparison | Ledger projection vs broker snapshot | Ledger not overwritten; DEGRADED until resolved | Reconciliation Service (report only) |
| **System degraded** | **Ledger (Tier 1)** | Same as confirmed ledger | Orders blocked; reads allowed with flag | Nobody until resolution |
| **System corrupted** | **Unknown until recovery** | Last known good backup or forensic replay | All writes halted | Ops manual recovery |

---

## 3. Event Priority Hierarchy

Absolute priority (highest first). Higher priority **wins** on conflict. Same priority: **per-wallet `sequence` order**.

```
Priority 1 ── Committed LedgerEntry          (immutable truth)
Priority 2 ── Committed Holding mutation    (inventory truth)
Priority 3 ── Wallet status gate            (DEGRADED/CORRUPTED blocks P4–P6)
Priority 4 ── Committed Fill + Order        (transitional; becomes P1 on append)
Priority 5 ── Broker sync import            (becomes P1 only after append commit)
Priority 6 ── Local order intent (uncommitted)
Priority 7 ── Snapshot capture              (observation; never overrides P1)
Priority 8 ── Read model / cache update     (downstream; never upstream)
Priority 9 ── Portfolio aggregation         (downstream; never upstream)
```

### 3.1 Explicit IF/THEN Rules

| Rule | Condition | Resolution |
|---|---|---|
| **E1** | IF `LedgerEntry` committed AND broker reports different position | THEN ledger wins; reconciliation required; wallet DEGRADED |
| **E2** | IF `LedgerEntry` committed AND cache shows different cash | THEN ledger wins; invalidate cache |
| **E3** | IF broker fill arrives AND `externalRef` already in ledger | THEN skip import (idempotent); broker fill is duplicate, not truth |
| **E4** | IF broker fill arrives AND no matching `externalRef` | THEN append at `head+1`; fill becomes truth at commit |
| **E5** | IF local order committed to broker AND ledger append not yet done | THEN order is P4; truth incomplete until append (transaction must be atomic) |
| **E6** | IF local order AND sync import race for same wallet | THEN per-wallet lock: first commit wins; second sees updated head |
| **E7** | IF snapshot captured at `seq 100` AND entry appended at `seq 101` | THEN snapshot truth = state at 100; live truth = state at 101; both valid in their domains |
| **E8** | IF late broker fill (eventTime = T-3d) appended at `seq N` now | THEN truth at head includes fill; snapshot at T-3d does NOT retroactively update |
| **E9** | IF portfolio cache computed at T1 AND wallet updated at T2 | THEN portfolio cache invalid; wallet truth at T2 wins |
| **E10** | IF `wallet.status = CORRUPTED` | THEN no new truth may be created; last committed ledger entries remain truth but writes halted |
| **E11** | IF `wallet.status = DEGRADED` | THEN ledger remains truth; mutations (orders) blocked; reads use ledger |
| **E12** | IF compensating entry with `correctsEntryId` | THEN both entries in ledger; net effect computed by replay; neither deleted |

---

## 4. Conflict Resolution Engine

### 4.1 Definition

The **Conflict Resolution Engine (CRE)** is a deterministic pure function. It does not persist. It does not call brokers. It produces a **resolution directive**.

```
CRE.resolve(input) → ResolutionDirective
```

### 4.2 Input

```
ConflictInput {
  walletId: WalletId
  executionMode: SIMULATED | BROKER_LINKED
  walletStatus: active | DEGRADED | CORRUPTED | archived

  ledgerHead: {
    sequence: int64
    cash: Money
    positions: Position[]
  }

  brokerState?: {          // present only for BROKER_LINKED
    positions: ExternalPosition[]
    balances: Money[]
    pendingFills: Fill[]
    fetchedAt: Instant
  }

  pendingEvents: {
    uncommittedOrders: Order[]
    inFlightSync: boolean
    uncommittedCacheWrites: boolean  // should always be false in correct impl
  }

  conflictType:
    | BROKER_LEDGER_MISMATCH
    | DUPLICATE_EXTERNAL_REF
    | DUPLICATE_ENTRY_ID
    | CACHE_LEDGER_MISMATCH
    | SNAPSHOT_SEQUENCE_INVALID
    | CONCURRENT_WRITE
    | LATE_EVENT
    | NONE
}
```

### 4.3 Output

```
ResolutionDirective {
  truthOwner: LEDGER | HOLDING | BROKER_IMPORT_PENDING | HALT
  walletStatusChange: none | DEGRADED | CORRUPTED
  actions: Action[]   // ordered, deterministic
  allowOrders: boolean
  allowReads: boolean
  userVisibleFlag: none | DEGRADED | CORRUPTED | MIXED_FRESHNESS
  message: string     // machine-readable code
}

Action :=
  | APPEND_ENTRY(entry)
  | SKIP_IMPORT(externalRef)
  | REJECT_WRITE(reason)
  | INVALIDATE_CACHE(walletId)
  | INVALIDATE_PORTFOLIO_CACHE(portfolioIds)
  | EMIT_RECONCILIATION_REPORT(report)
  | BLOCK_UNTIL_MANUAL_REVIEW
  | REBUILD_CHECKPOINT
  | NO_OP
```

### 4.4 Deterministic Algorithm

```
FUNCTION resolve(input: ConflictInput) → ResolutionDirective:

  // Gate 0: Corrupted — halt everything
  IF input.walletStatus = CORRUPTED
    OR input.conflictType = SNAPSHOT_SEQUENCE_INVALID
    OR ledger sequence integrity check fails
  THEN RETURN {
    truthOwner: HALT,
    walletStatusChange: CORRUPTED,
    actions: [REJECT_WRITE(CORRUPTED), BLOCK_UNTIL_MANUAL_REVIEW],
    allowOrders: false,
    allowReads: true,  // with CORRUPTED flag
    userVisibleFlag: CORRUPTED,
    message: "WALLET_CORRUPTED"
  }

  // Gate 1: Duplicate import — skip, ledger unchanged
  IF input.conflictType = DUPLICATE_EXTERNAL_REF
  THEN RETURN {
    truthOwner: LEDGER,
    walletStatusChange: none,
    actions: [SKIP_IMPORT(...), NO_OP],
    allowOrders: true,
    allowReads: true,
    userVisibleFlag: none,
    message: "IMPORT_DEDUPED"
  }

  IF input.conflictType = DUPLICATE_ENTRY_ID
  THEN RETURN {
    truthOwner: LEDGER,
    walletStatusChange: none,
    actions: [NO_OP],  // idempotent success
    allowOrders: true,
    allowReads: true,
    message: "ENTRY_ALREADY_EXISTS"
  }

  // Gate 2: Cache mismatch — ledger wins
  IF input.conflictType = CACHE_LEDGER_MISMATCH
  THEN RETURN {
    truthOwner: LEDGER,
    walletStatusChange: none,
    actions: [INVALIDATE_CACHE(walletId), NO_OP],
    allowOrders: true,
    allowReads: true,
    message: "CACHE_INVALIDATED"
  }

  // Gate 3: Broker-linked reconciliation
  IF input.executionMode = BROKER_LINKED
    AND input.conflictType = BROKER_LEDGER_MISMATCH
  THEN
    discrepancy = compare(input.ledgerHead, input.brokerState)

    IF discrepancy.withinTolerance
    THEN RETURN {
      truthOwner: LEDGER,
      walletStatusChange: active,  // clear DEGRADED if was reconciliation-only
      actions: [EMIT_RECONCILIATION_REPORT(ACCEPTED)],
      allowOrders: true,
      allowReads: true,
      message: "RECONCILIATION_ACCEPTED"
    }

    IF discrepancy.hasImportableFills
    THEN RETURN {
      truthOwner: BROKER_IMPORT_PENDING,
      walletStatusChange: none,
      actions: [
        APPEND_ENTRY(for each missing fill, deduped),
        EMIT_RECONCILIATION_REPORT(PENDING),
        REBUILD_CHECKPOINT
      ],
      allowOrders: false,  // until re-compare passes
      allowReads: true,
      message: "RECONCILIATION_IMPORTING"
    }

    ELSE RETURN {
      truthOwner: LEDGER,  // ledger NOT overwritten
      walletStatusChange: DEGRADED,
      actions: [
        EMIT_RECONCILIATION_REPORT(MANUAL_REVIEW),
        BLOCK_UNTIL_MANUAL_REVIEW,
        INVALIDATE_CACHE(walletId)
      ],
      allowOrders: false,
      allowReads: true,
      userVisibleFlag: DEGRADED,
      message: "RECONCILIATION_MANUAL_REVIEW"
    }

  // Gate 4: SIMULATED — broker state irrelevant
  IF input.executionMode = SIMULATED
  THEN RETURN {
    truthOwner: LEDGER,
    walletStatusChange: none,
    actions: [NO_OP],
    allowOrders: true,
    allowReads: true,
    message: "SIMULATED_LEDGER_SOLE_TRUTH"
  }

  // Gate 5: Late event — append at tail
  IF input.conflictType = LATE_EVENT
  THEN RETURN {
    truthOwner: LEDGER,
    walletStatusChange: none,
    actions: [APPEND_ENTRY(lateEntry), INVALIDATE_CACHE(walletId), REBUILD_CHECKPOINT],
    allowOrders: true,
    allowReads: true,
    message: "LATE_EVENT_APPENDED"
  }

  // Gate 6: Concurrent write — already serialized by lock; no CRE action
  IF input.conflictType = CONCURRENT_WRITE
  THEN RETURN {
    truthOwner: LEDGER,
    walletStatusChange: none,
    actions: [NO_OP],
    allowOrders: true,
    allowReads: true,
    message: "SERIALIZED_BY_LOCK"
  }

  // Default: ledger is truth
  RETURN {
    truthOwner: LEDGER,
    walletStatusChange: none,
    actions: [NO_OP],
    allowOrders: input.walletStatus ≠ DEGRADED,
    allowReads: true,
    message: "LEDGER_TRUTH"
  }
```

**No probabilistic logic. No "usually". No broker overwrite branch.**

---

## 5. Real-Time State Model

### 5.1 State Definitions

| State | Symbol | Definition | Truth source | Mutations allowed |
|---|---|---|---|---|
| **Current state** | `S_current` | Financial reality at ledger/holding head **right now** | Tier 1 replay + Pricing(now) | Append to Tier 1 |
| **Confirmed state** | `S_confirmed` | Last committed Tier 1 entry set through `sequence = head` | Tier 1 | Same as current (synonymous after commit) |
| **Pending state** | `S_pending` | Uncommitted intents: open orders, in-flight sync imports, uncommitted user commands | Not truth — **projected** from partial data | Not authoritative |
| **Degraded state** | `S_degraded` | `S_confirmed` is truth but **trust in completeness** vs broker is broken | Tier 1 (with DEGRADED flag) | Reads yes; orders no |
| **Corrupted state** | `S_corrupted` | Tier 1 integrity violated | Unknown until recovery | Reads flagged; writes no |
| **Historical state** | `S_hist(asOf)` | Observation at past instant | Snapshot at `asOf` OR ledger replay to `asOfSequence` | None |

**Key distinction:**

```
S_current = S_confirmed        (always, after commit completes)
S_pending ≠ truth              (until commit promotes to S_confirmed)
S_degraded.truth = S_confirmed (same numbers; different trust gate)
```

### 5.2 How Wallet Reads Each State

| Query type | State read | API behavior |
|---|---|---|
| `GetWalletSummary(live)` | `S_current` | Replay ledger/holdings + pricing. **Never cache-only without TTL check.** |
| `GetPositions(live)` | `S_current` | PositionEngine from checkpoint→head |
| `GetCash(live)` | `S_current` | LedgerEngine replay |
| `GetOpenOrders` | `S_pending` + `S_confirmed` | Orders not yet filled = pending; filled = confirmed in ledger |
| `GetWalletSummary(degraded)` | `S_degraded` | Same values as `S_current` + `status: DEGRADED` + `reconciliationReportId` |
| `GetSnapshot(asOf)` | `S_hist(asOf)` | From snapshot store; NOT current |

### 5.3 How Portfolio Reads Each State

| Query type | State read | API behavior |
|---|---|---|
| `GetPortfolioAllocation(live)` | `aggregate(S_current per member)` | Fetch AccountSummary v1 per member at T. Set `portfolio.asOf = T`. |
| `GetPortfolioAllocation(cached)` | Stale aggregate | Serve with `cachedAt` + `MIXED_FRESHNESS` if member timestamps diverge > 5s |
| `GetPortfolioPerformance(window)` | `S_hist` via snapshots | Snapshot-based TWR. NOT `S_current`. |
| Member DEGRADED | `S_degraded` for that member | Include `memberStatus: DEGRADED` in line item |

**Portfolio NEVER reads `S_pending` for value calculation.**

---

## 6. Failure Injection Behavior

Mapped from `ARCHITECTURE_FAILURE_SIMULATION.md`. Truth ownership under failure.

### 6.1 Broker Down

| Aspect | Behavior |
|---|---|
| **Truth owner** | Ledger (last committed head) |
| **New broker fills** | Not importable. `S_pending` grows externally. |
| **Wallet status** | `DEGRADED` after sync timeout threshold (default 15 min) |
| **Orders (BROKER_LINKED)** | Blocked when DEGRADED (cannot confirm with broker) |
| **Orders (SIMULATED)** | Unaffected (PaperBroker local) |
| **Portfolio** | Shows last known `S_confirmed` with `brokerSync: STALE` flag |
| **Recovery** | Broker up → sync → import → reconcile → clear DEGRADED |

### 6.2 Ledger Inconsistent (sequence gap)

| Aspect | Behavior |
|---|---|
| **Truth owner** | HALT — no authoritative current state |
| **Wallet status** | `CORRUPTED` |
| **Orders** | Blocked |
| **Reads** | Allowed with `CORRUPTED` flag; values may be wrong |
| **Portfolio** | Exclude member from aggregation |
| **Recovery** | Restore backup or forensic repair; full replay validation |

### 6.3 Duplicate Sync Import

| Aspect | Behavior |
|---|---|
| **Truth owner** | Ledger (unchanged after first import) |
| **CRE directive** | `IMPORT_DEDUPED` |
| **Wallet status** | Unchanged |
| **Money** | Preserved |
| **Portfolio** | Unchanged after cache TTL |

### 6.4 Reconciliation Fails (unresolved)

| Aspect | Behavior |
|---|---|
| **Truth owner** | Ledger (NOT broker) |
| **Wallet status** | `DEGRADED` |
| **Orders** | Blocked |
| **Reads** | Ledger-based with `DEGRADED` warning |
| **Portfolio** | Aggregates with per-member warning |
| **User sees** | Correct ledger values + "wallet needs attention" |
| **Recovery** | Manual review or auto-import missing entries |

### 6.5 Cache Total Loss

| Aspect | Behavior |
|---|---|
| **Truth owner** | Ledger (unchanged) |
| **Impact** | Slower reads; `S_current` recomputed on miss |
| **Portfolio** | Recomputed on next query |

### 6.6 Partial Ledger Loss

| Aspect | Behavior |
|---|---|
| **Truth owner** | HALT |
| **Wallet status** | `CORRUPTED` |
| **Recovery** | Backup restore or broker full re-sync (broker-linked only) |

---

## 7. Final System Guarantee

### 7.1 Consistency Classification

| Scope | Guarantee | Type |
|---|---|---|
| **Single wallet, post-commit read** | `S_current` reflects all entries through `head` | **Strong** (per-wallet serializable) |
| **Single wallet, concurrent writes** | Serialized; no lost updates | **Strong** (per-wallet) |
| **Ledger entry durability** | After ACK, entry in Tier 1 permanently | **Strong** (with ACID + sync replication) |
| **Cross-wallet portfolio aggregate** | Members may differ by milliseconds at T | **Eventual** (bounded skew) |
| **Portfolio cache** | May lag wallet by TTL | **Eventual** (≤60s hard max) |
| **Broker-linked vs ledger** | Converges on successful sync + reconcile | **Eventual** (sync interval bounded) |
| **Performance / snapshots** | Frozen at capture; converges on new capture | **Eventual** (≤48h for TWR label) |
| **Market pricing** | Depends on feed | **Eventual** (5–60s) |

**Answer:** Cartera is **strongly consistent per wallet at Tier 1** and **eventually consistent at Tier 4 (portfolio/cache/display)**.

### 7.2 Can Two Truths Exist Simultaneously?

**YES — by design, in distinct domains:**

| Truth A | Truth B | Coexist? | Conflict? |
|---|---|---|---|
| `S_current` (ledger head) | `S_hist` (snapshot yesterday) | Yes | No — different query contexts |
| `S_current` (wallet W1) | `S_current` (wallet W2) | Yes | No — independent streams |
| `S_current` (ledger) | Broker position (external) | Yes, BROKER_LINKED | **Yes** → DEGRADED until resolved |
| `S_current` (ledger) | Cache entry | Yes | **Yes** → cache invalidated; ledger wins |
| `S_current` (live query) | Portfolio cache | Yes | **Yes** → bounded display skew; live wins |
| `S_confirmed` | `S_pending` (open order) | Yes | No — pending is explicitly not truth |

**NO — within the same domain for mutations:**

- Two different cash balances for same wallet at same `sequence` head → **impossible** if invariants hold.
- Ledger and broker both authoritative for writes → **impossible** — only ledger accepts writes.

### 7.3 Source of Truth Final

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   FINAL SOURCE OF TRUTH = TIER 1                            │
│                                                             │
│   Trading wallet:  LedgerEntry stream (append-only)         │
│   Inventory wallet: Holding entities                        │
│                                                             │
│   Everything else is derived, observed, or external.        │
│                                                             │
│   Broker is truth-discovery, not truth-storage.             │
│   Portfolio is truth-aggregation, not truth-creation.       │
│   Snapshot is truth-observation, not truth-authority.       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**At any instant T, for any wallet:**

> The truth is `replay(LedgerEntries[0..head])` or `active(Holdings)`, marked to market with `Pricing(T)`.

**There is exactly one answer for mutations. There may be multiple answers for display (live vs cached vs historical) — each labeled.**

---

## 8. Wallet vs Portfolio Truth Boundary

### 8.1 Wallet Truth Domain

```
Domain: single wallet W
Truth:  Tier 1 (ledger or holdings) + Pricing for valuation
Scope:  cash, positions, holdings, order state, wallet status
Writes: append ledger / CRUD holdings / place orders
Reads:  S_current (live), S_hist (snapshot), S_degraded, S_corrupted
```

**Wallet owns:** financial events and inventory declarations.  
**Wallet does NOT own:** portfolio allocation, cross-wallet performance, benchmarks.

### 8.2 Portfolio Truth Domain

```
Domain: portfolio P = {W1, W2, ... Wn}
Truth:  DERIVED — aggregate of Wallet truths at query time T
Scope:  allocation %, total value, performance (snapshot-based)
Writes: member list, name, benchmark only
Reads:  aggregate(S_current per member), NEVER writes back
```

**Portfolio owns:** configuration of which wallets to analyze.  
**Portfolio does NOT own:** any financial event, balance, or position.

### 8.3 Can They Diverge?

**YES.** By design.

| Divergence type | Cause | Max duration | Which wins on conflict |
|---|---|---|---|
| Portfolio cache vs wallet live | Cache TTL | 60s | Wallet |
| Portfolio `asOf` vs wallet now | Query timing | Unbounded (labeled) | Wallet (for live) |
| Portfolio sum vs manual sum of wallets | Mixed cache versions | 60s | Wallet live recomputation |
| Portfolio performance vs wallet PnL | Snapshot vs live | Until next snapshot | Different domains (no conflict) |
| Portfolio includes DEGRADED member | Reconciliation | Until resolved | Wallet status propagates as flag |

### 8.4 Maximum Divergence Contract

| Metric | Max divergence | Enforcement |
|---|---|---|
| Portfolio total value vs sum of live wallet queries | **60 seconds** (cache TTL) | Hard TTL + `portfolio.asOf` label |
| Portfolio member vs wallet live | **5 seconds** before `MIXED_FRESHNESS` flag | Per-member `asOf` in AccountSummary |
| Portfolio vs wallet on same live query | **0** — must match | Live query bypasses portfolio cache |
| Performance vs current wallet value | **Unbounded** — different metrics | UI must not equate them |

### 8.5 Truth Boundary Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  WALLET TRUTH DOMAIN (Tier 1)                                │
│                                                              │
│  Ledger ──► S_current ──► AccountSummary v1 (published)     │
│                              │                               │
│                              │ read-only boundary            │
│                              ▼                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  PORTFOLIO TRUTH DOMAIN (Tier 4 derived)               │  │
│  │                                                        │  │
│  │  AccountSummary[] ──► Allocation, Performance          │  │
│  │                                                        │  │
│  │  NO write path back to wallet                          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

         Broker (Tier 0) ──import──► Ledger
              │                         │
              └── compare only ──► Reconciliation
                                   (never overwrites)
```

---

## Appendix A — Truth Decision Tree (Runtime)

```
Incoming event E for wallet W
│
├─ Is W CORRUPTED?
│   └─ YES → REJECT all writes. Read with flag. STOP.
│
├─ Is E a committed LedgerEntry?
│   └─ YES → E is truth. Invalidate cache. Project position. STOP.
│
├─ Is E a broker fill import?
│   ├─ externalRef exists? → SKIP (dedup). STOP.
│   └─ else → append → becomes truth. Reconcile. STOP.
│
├─ Is E an uncommitted order?
│   └─ Validate against S_current head. Queue behind lock. STOP.
│
├─ Is E a cache update?
│   └─ NEVER accept as truth. Recompute from ledger. STOP.
│
├─ Is E a portfolio aggregation?
│   └─ Read AccountSummary only. Never write wallet. STOP.
│
└─ Unknown → DEGRADED + alert. Do not mutate.
```

---

## Appendix B — API Response Truth Labels (Mandatory)

Every financial API response MUST include:

```json
{
  "truth": {
    "domain": "wallet | portfolio | snapshot",
    "state": "current | historical | degraded | corrupted",
    "asOf": "ISO-8601",
    "asOfSequence": 12345,
    "source": "ledger_replay | holdings | snapshot | aggregate",
    "cachedAt": "ISO-8601 | null",
    "flags": ["DEGRADED", "MIXED_FRESHNESS", "STALE_SNAPSHOTS", "UNPRICED"]
  },
  "data": { }
}
```

**No response without `truth` block for financial values.**

---

## Appendix C — Document Cross-Reference

| Topic | Source document | This document |
|---|---|---|
| Truth tiers | CONSISTENCY §1 | §1, §7 |
| SSOT matrix | BACKEND §3 | §7.3 |
| Conflict matrix | FAILURE_SIM §7 | §4, §8 |
| Behavior spec IF/THEN | CONSISTENCY §9 | §3.1 |
| CRE algorithm | — | §4 (new) |
| State definitions | CONSISTENCY §5 | §5 |
| Wallet/Portfolio boundary | DOMAIN §7-8 | §8 |

---

## Appendix D — Glossary

| Term | Meaning |
|---|---|
| **Truth at T** | Authoritative financial state for mutations and live reads |
| **S_current** | Truth at ledger/holding head now |
| **S_confirmed** | Synonym for S_current post-commit |
| **S_pending** | Uncommitted; not truth |
| **S_degraded** | S_confirmed with broken broker trust |
| **S_corrupted** | Integrity failure; halt |
| **CRE** | Conflict Resolution Engine |
| **Tier 1** | Ledger + Holdings — final truth |
| **Tier 0** | External (broker, market) — input only |

---

*End of document — EXECUTION_TRUTH_MODEL v1.0*
