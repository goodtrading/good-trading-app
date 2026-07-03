# Architecture Failure Simulation

**Version:** 1.0  
**Status:** Frozen — Companion to `DOMAIN_MODEL.md`, `FINANCIAL_BACKEND_ARCHITECTURE.md`, `CONSISTENCY_MODEL.md`  
**Audience:** Backend engineers, SRE, on-call, security reviewers  
**Scope:** Deterministic system behavior under catastrophic failure, corruption, and chaos.

**Purpose:** Define whether Cartera is an "app robusta" or a **fintech-grade system under failure**. This document is a behavioral contract: given failure X, the system MUST behave as specified.

**Verdict preview:** Cartera is designed **fintech-grade at Tier 1 (ledger/holdings)** with **bounded eventual inconsistency at Tier 4 (portfolio/cache)**. Money is preserved; display may lag.

---

## Table of Contents

1. [Catastrophic Failure Scenarios](#1-catastrophic-failure-scenarios)
2. [Expected System Behavior](#2-expected-system-behavior)
3. [Recovery Model](#3-recovery-model)
4. [Money Safety Guarantees](#4-money-safety-guarantees)
5. [Event Ordering Breakdown](#5-event-ordering-breakdown)
6. [Data Destruction Scenarios](#6-data-destruction-scenarios)
7. [Conflict Resolution Matrix](#7-conflict-resolution-matrix)
8. [System Survivability Score](#8-system-survivability-score)

---

## 1. Catastrophic Failure Scenarios

Each scenario is simulated against a single trading wallet `W1` (`executionMode=BROKER_LINKED`, Binance) unless noted. Inventory wallet `I1` used where relevant.

---

### 1.1 Ledger Corruption

#### SC-L1: Duplicate entry (same `id`)

| Component | Behavior |
|---|---|
| **Ledger** | `UNIQUE(entry.id)` rejects second write. Transaction rolls back. Head sequence unchanged. |
| **Wallet** | No state change. If order was in same transaction: order also rolls back. |
| **Portfolio** | Unaffected. |
| **ReconciliationService** | Not invoked. |
| **Broker adapter** | Fill may be re-fetched on retry; dedup by `externalRef` on retry. |
| **Snapshot engine** | Not triggered. |

**Money preserved?** **YES.** No double append.

---

#### SC-L2: Duplicate entry (same `externalRef`, different `id`)

| Component | Behavior |
|---|---|
| **Ledger** | `UNIQUE(walletId, externalRef)` rejects. Import skips (idempotent per B3). |
| **Wallet** | Unchanged. |
| **Portfolio** | Unaffected. |
| **ReconciliationService** | Runs at end of sync; state consistent with first import. |
| **Broker adapter** | Returns duplicate in sync batch; adapter layer dedupes before append. |
| **Snapshot engine** | Unaffected. |

**Money preserved?** **YES.**

---

#### SC-L3: Partial entry write (crash mid-transaction)

| Component | Behavior |
|---|---|
| **Ledger** | Transaction atomicity: either full entry + sequence bump commits, or nothing. No partial rows. |
| **Wallet** | Order/Fill also in transaction: if ledger fails, order stays `PENDING` or entire unit rolls back. |
| **Portfolio** | Unaffected. |
| **ReconciliationService** | Not run (sync incomplete). |
| **Broker adapter** | `lastSyncCursor` NOT advanced (same transaction). Retry re-processes batch. |
| **Snapshot engine** | Not triggered. |

**Money preserved?** **YES** (requires ACID transactions). **IF implementation lacks atomicity → CRITICAL BUG (P0).**

---

#### SC-L4: Broken sequence (gap or duplicate sequence)

| Component | Behavior |
|---|---|
| **Ledger** | `UNIQUE(walletId, sequence)` prevents duplicate. Gaps MUST NOT exist post-commit (L4). **Detection:** startup invariant scan `sequences = 1..N continuous`. |
| **Wallet** | If gap detected: `wallet.status = CORRUPTED`. All writes blocked. |
| **Portfolio** | Member wallet excluded from aggregation when `CORRUPTED`. |
| **ReconciliationService** | Not run until recovery. |
| **Broker adapter** | Sync blocked for corrupted wallet. |
| **Snapshot engine** | Capture blocked. |

**Money preserved?** **UNKNOWN until recovery.** Writes frozen. Reads allowed with `CORRUPTED` flag. **Replay from backup required.**

---

#### SC-L5: Partial persistence rollback (DB failover during commit)

| Component | Behavior |
|---|---|
| **Ledger** | Depends on DB: synchronous replication → no loss. async replication → possible lost commit. **Detection:** client retries idempotent append; if `entry.id` not found, re-append. If `entry.id` exists, return success. |
| **Wallet** | Same transaction as ledger; consistent with ledger outcome. |
| **Portfolio** | May serve stale RM until invalidation catches up. |
| **ReconciliationService** | May see transient desync; resolves on next sync. |
| **Broker adapter** | Idempotent retry safe. |
| **Snapshot engine** | May capture pre-rollback head if timing unfortunate; snapshot is observation only. |

**Money preserved?** **YES** with idempotent retry + sync replication. **AT RISK** with async replication without outbox pattern.

---

### 1.2 Broker Chaos

#### SC-B1: Binance returns duplicate fills in same sync batch

| Component | Behavior |
|---|---|
| **Ledger** | First fill appends. Second identical `externalRef` skipped (B3). |
| **Wallet** | Active. |
| **Portfolio** | Correct after cache invalidation / live query. |
| **ReconciliationService** | Passes (ledger matches broker after dedup). |
| **Broker adapter** | Passes batch to import layer; does not dedup itself. |
| **Snapshot engine** | Next capture reflects correct state. |

**Money preserved?** **YES.**

---

#### SC-B2: Binance sends late fill (trade 3 days ago, arrives now)

| Component | Behavior |
|---|---|
| **Ledger** | Append at `sequence = head+1`. `timestamp` = broker trade time. `sequence` = import order. |
| **Wallet** | Active. Position at head recalculated correctly. |
| **Portfolio** | Live allocation correct immediately. Performance (snapshot-based) for past period **unchanged** until new snapshot. |
| **ReconciliationService** | May flag discrepancy vs broker if broker already reflected fill in position poll; resolved when fill imported. |
| **Broker adapter** | Imports with original `brokerTimestamp`. |
| **Snapshot engine** | Past snapshots NOT updated (T3). New capture reflects late fill. |

**Money preserved?** **YES** at current head. **Historical performance may be temporarily wrong** (bounded until recapture).

---

#### SC-B3: Broker sync interrupts mid-write during user trade

| Component | Behavior |
|---|---|
| **Ledger** | Per-wallet lock: only one writer. **IF sync holds lock:** trade waits → timeout → `SYNC_IN_PROGRESS` (O5). **IF trade holds lock:** sync waits/retries. Never concurrent append. |
| **Wallet** | One operation completes atomically. |
| **Portfolio** | Unaffected on write path. |
| **ReconciliationService** | Runs only after complete sync. |
| **Broker adapter** | Sync aborts or completes fully; cursor advanced only on commit. |
| **Snapshot engine** | Not concurrent with incomplete write. |

**Money preserved?** **YES.**

---

#### SC-B4: Broker position ≠ ledger projection

| Component | Behavior |
|---|---|
| **Ledger** | NOT modified. SSOT for app logic. |
| **Wallet** | `status = DEGRADED`. New orders blocked (O1). |
| **Portfolio** | Serves allocation with `walletHealth: DEGRADED` flag on affected member. |
| **ReconciliationService** | `ReconciliationReport` with `resolution: MANUAL_REVIEW` or `AUTO_RESOLVE` if within tolerance. |
| **Broker adapter** | Re-fetches on next sync. |
| **Snapshot engine** | Capture allowed but tagged `preReconciliation: true` if DEGRADED. |

**Money preserved?** **YES** (ledger not overwritten). **Display may show broker or ledger value depending on query path** — live query uses ledger; user must see DEGRADED flag.

---

### 1.3 Concurrency Collapse

#### SC-C1: Two trades simultaneous on same wallet

| Component | Behavior |
|---|---|
| **Ledger** | Serial lock. Trade A commits `seq N`. Trade B reads head `N`, commits `seq N+1` or rejects `INSUFFICIENT_CASH`. |
| **Wallet** | Both cannot corrupt cash. |
| **Portfolio** | Eventually reflects both after reads. |
| **ReconciliationService** | N/A (SIMULATED or post-sync). |
| **Broker adapter** | Two orders to broker (if BROKER_LINKED): broker serializes; app serializes ledger append. |
| **Snapshot engine** | Unaffected. |

**Money preserved?** **YES.** No double spend.

---

#### SC-C2: Trade + reconciliation simultaneous

| Component | Behavior |
|---|---|
| **Ledger** | Mutex per wallet. Trade wins (priority). Reconciliation import waits. |
| **Wallet** | DEGRADED only if reconciliation completes with unresolved discrepancy. |
| **Portfolio** | Unaffected. |
| **ReconciliationService** | Deferred until lock available. |
| **Broker adapter** | Sync may complete fetch phase; import phase waits for lock. |
| **Snapshot engine** | Deferred if needs lock. |

**Money preserved?** **YES.**

---

#### SC-C3: Sync + archive wallet simultaneous

| Component | Behavior |
|---|---|
| **Ledger** | **IF archive wins first:** ledger sealed (L1). Sync append rejected. **IF sync wins first:** sync completes; archive seals ledger after. |
| **Wallet** | `archived` is terminal for writes. |
| **Portfolio** | Excludes archived wallet on next query. |
| **ReconciliationService** | Final reconciliation before seal (recommended: archive flow triggers final sync + reconcile). |
| **Broker adapter** | Connection revoked on archive. |
| **Snapshot engine** | Final snapshot capture optional before seal. |

**Money preserved?** **YES.** No entries after seal.

---

### 1.4 Snapshot Inconsistency

#### SC-S1: Snapshot taken during in-flight write

| Component | Behavior |
|---|---|
| **Ledger** | Snapshot capture acquires wallet lock OR reads `asOfSequence` atomically at commit boundary. **IF lock held:** capture waits. **IF read isolated snapshot:** `asOfSequence` = last committed sequence before capture started. |
| **Wallet** | Unaffected. |
| **Portfolio** | Performance uses snapshot with explicit `asOfSequence`; may be 1 sequence behind live. |
| **ReconciliationService** | Unaffected. |
| **Broker adapter** | Unaffected. |
| **Snapshot engine** | Snapshot is self-consistent at `asOfSequence`. Never includes partial entry. |

**Money preserved?** **YES.** Snapshot may be slightly stale vs live; labeled with `asOfSequence`.

---

#### SC-S2: Snapshot based on partial ledger (bug scenario)

| Component | Behavior |
|---|---|
| **Ledger** | **Violation of S1.** Detected by invariant: `snapshot.asOfSequence > ledger.head` → snapshot marked `INVALID`, excluded from performance. |
| **Wallet** | Unaffected. |
| **Portfolio** | Performance excludes invalid snapshots. |
| **ReconciliationService** | Unaffected. |
| **Broker adapter** | Unaffected. |
| **Snapshot engine** | Re-capture required. |

**Money preserved?** **YES** (live queries use ledger). **Snapshot discarded.**

---

#### SC-S3: Cached snapshot ID points to obsolete capture

| Component | Behavior |
|---|---|
| **Ledger** | Unaffected. |
| **Wallet** | Unaffected. |
| **Portfolio** | Performance query uses snapshot store by `(walletId, date)`, not cache pointer alone. Cache miss → DB. |
| **ReconciliationService** | Unaffected. |
| **Broker adapter** | Unaffected. |
| **Snapshot engine** | Immutable snapshots; cache holds ID only. TTL expiry forces refresh. |

**Money preserved?** **YES.** Worst case: stale performance label (S5).

---

### 1.5 Portfolio Divergence

#### SC-P1: Wallet correct, portfolio cache stale

| Component | Behavior |
|---|---|
| **Ledger** | Correct. |
| **Wallet** | Live query correct. |
| **Portfolio** | Cached allocation stale up to TTL (30s). **Live query** (cache miss) correct. Response includes `portfolio.asOf` and `cachedAt`. |
| **ReconciliationService** | Unaffected. |
| **Broker adapter** | Unaffected. |
| **Snapshot engine** | Unaffected. |

**Money preserved?** **YES.** Display lag only.

---

#### SC-P2: Portfolio cache with mixed versions (wallet A fresh, wallet B stale)

| Component | Behavior |
|---|---|
| **Ledger** | Each wallet independent. |
| **Wallet** | Each correct at own head. |
| **Portfolio** | **Anti-pattern:** per-member version keys required. **Required:** `portfolio.asOf = min(member.asOf)` or `max(member.asOf)` — document as `max`. Response flags `MIXED_FRESHNESS` if spread > 5s. |
| **ReconciliationService** | Unaffected. |
| **Broker adapter** | Unaffected. |
| **Snapshot engine** | Unaffected. |

**Money preserved?** **YES.** Portfolio sum may be momentarily inconsistent. **Not a money loss — a read skew.**

---

#### SC-P3: Portfolio shows value, wallet is DEGRADED

| Component | Behavior |
|---|---|
| **Ledger** | Correct but possibly diverged from broker. |
| **Wallet** | `DEGRADED`. Orders blocked. |
| **Portfolio** | **MUST** include `memberStatus: DEGRADED` on affected wallet line. Total value shown with warning. |
| **ReconciliationService** | Active; unresolved report exists. |
| **Broker adapter** | Next sync scheduled. |
| **Snapshot engine** | Optional capture with flag. |

**Money preserved?** **YES** (ledger intact). **User informed of uncertainty.**

---

## 2. Expected System Behavior — Summary Table

| Scenario | Ledger | Wallet | Portfolio | Reconciliation | Broker | Snapshot | Money safe? |
|---|---|---|---|---|---|---|---|
| SC-L1 dup id | Reject | No change | OK | — | Retry safe | — | **YES** |
| SC-L2 dup externalRef | Skip | OK | OK | OK | Dedup | — | **YES** |
| SC-L3 partial write | Atomic rollback | Rollback | OK | — | Cursor held | — | **YES*** |
| SC-L4 broken sequence | CORRUPTED | CORRUPTED | Exclude | Blocked | Blocked | Blocked | **FROZEN** |
| SC-L5 DB rollback | Idempotent retry | Consistent | Stale RM | Transient | Retry | Stale obs | **YES*** |
| SC-B1 dup fills | Dedup | OK | OK | OK | Pass-through | OK | **YES** |
| SC-B2 late fill | Append tail | OK | Live OK, perf lag | May flag | Import | No retro | **YES** |
| SC-B3 sync∩trade | Lock serial | OK | OK | Deferred | Wait | Wait | **YES** |
| SC-B4 broker≠ledger | Unchanged | DEGRADED | Flagged | MANUAL | Re-fetch | Flagged | **YES** |
| SC-C1 2 trades | Serial | OK | Eventual | — | Serial | — | **YES** |
| SC-C2 trade∩recon | Trade first | OK | OK | Deferred | Wait | Wait | **YES** |
| SC-C3 sync∩archive | Seal rules | archived | Exclude | Final | Revoke | Final? | **YES** |
| SC-S1 snap during write | Lock/isolation | OK | Slight lag | — | — | Consistent | **YES** |
| SC-S2 partial snap | — | OK | Exclude bad | — | — | INVALID | **YES** |
| SC-S3 stale snap cache | — | OK | TTL refresh | — | — | Re-fetch | **YES** |
| SC-P1 stale portfolio | OK | OK | TTL/live | — | — | — | **YES** |
| SC-P2 mixed cache | OK | OK | MIXED_FRESHNESS | — | — | — | **YES** |
| SC-P3 degraded member | OK | DEGRADED | Warning | Active | Sync | Flagged | **YES** |

\* Requires ACID + idempotency implementation.

---

## 3. Recovery Model

### 3.1 Corruption Detection

| Check | When | Action on fail |
|---|---|---|
| `sequence` continuity | Startup, daily batch | `wallet.status = CORRUPTED` |
| `cash_replay == cached_cash` | Post-append, hourly | `DEGRADED` + alert |
| `position_replay` sanity (qty ≥ 0 in v1 long-only) | Post-append | `DEGRADED` + alert |
| `snapshot.asOfSequence <= ledger.head` | On capture, daily | Mark snapshot `INVALID` |
| `externalRef` uniqueness | On append | Reject duplicate |
| Reconciliation unresolved > 24h | Scheduled | Escalate alert; keep DEGRADED |
| Checkpoint vs genesis replay | Weekly deep check | Rebuild checkpoint |

### 3.2 Recovery Procedures

| Failure class | Mode | Procedure | Rebuild scope |
|---|---|---|---|
| Cache lost | **Automatic** | Cold start; cache miss → replay from ledger | Cache only |
| Read model lost | **Automatic** | Rebuild RM from ledger/holdings per wallet | Tier 4 only |
| Checkpoint corrupt | **Automatic** | Delete checkpoint entries (derived); replay from genesis or prior checkpoint | Projection only |
| Sequence gap | **Manual** | Restore ledger from backup; or forensic insert with audit | Full wallet review |
| Partial ledger loss | **Manual** | Restore from backup OR broker full re-sync | Broker re-import + reconcile |
| Broker-only restore | **Manual** | `fullHistory=true` sync → import all fills → reconcile → NEVER delete local entries | Append missing |
| Snapshot store lost | **Automatic** | Performance unavailable until recapture; live queries OK | Re-capture schedule |
| Total DB loss | **Manual** | Restore backup; else broker re-sync per wallet | Last resort |

### 3.3 Truth Reconstruction Hierarchy

```
1. Ledger backup (if available)           → full recovery
2. Ledger partial + broker full re-sync   → append missing entries
3. Broker full re-sync only               → reconstruct ledger (loses manual CashMovements not on broker)
4. Snapshot restore                       → NOT valid for ledger reconstruction (observations only)
5. Portfolio RM rebuild                   → from wallet summaries only
```

**Never reconstruct ledger from snapshot or portfolio.**

### 3.4 Replay Types

| Type | When | Cost |
|---|---|---|
| **Partial replay** | Normal read; checkpoint → head | O(entries since checkpoint) |
| **Full replay** | Recovery, integrity audit | O(all entries) |
| **Full wallet rebuild** | CORRUPTED status | Restore backup or broker re-sync + seal until reconciled |

---

## 4. Money Safety Guarantees

### 4.1 Absolute Invariants (MUST NEVER break)

| ID | Invariant | Enforcement |
|---|---|---|
| A1 | **No double append** of same `entry.id` | DB unique + idempotent handler |
| A2 | **No double append** of same `(walletId, externalRef)` | DB unique partial index |
| A3 | **No double spend** of cash on concurrent orders | Per-wallet serial lock + cash check at head |
| A4 | **No ledger entry mutation** | Append-only schema; no UPDATE on entries |
| A5 | **No ledger entry deletion** | No DELETE policy; seal only |
| A6 | **No negative cash** after committed append (v1 long-only, no margin) | Pre-append validation |
| A7 | **No negative position qty** (v1 long-only) | Position engine invariant |
| A8 | **No broker overwrite of ledger** | B7; reconciliation never DELETE/UPDATE entries |
| A9 | **No portfolio mutation of wallet** | P10; architecture separation |
| A10 | **No cross-tenant data leak** | X2; all queries scoped |

**Violation of A1–A10 = P0 incident. Halt writes for affected wallet.**

### 4.2 Temporal Invariants (MAY break briefly; bounded)

| ID | Invariant | Max duration | Consumer impact |
|---|---|---|---|
| T1 | Portfolio value = sum of wallet values | 0–60s | Stale allocation display |
| T2 | Cache cash = replay cash | 0–30s | Stale balance if cache bug; live query correct |
| T3 | Broker view = ledger view | Until next successful sync | DEGRADED flag; orders blocked |
| T4 | Performance reflects all entries | Until next snapshot | Historical PnL lag |
| T5 | Unrealized PnL = position × market price | Market price TTL (5–60s) | Price staleness |
| T6 | WalletSummaryRM = live projection | 0–30s | Stale summary |

**Violation of T1–T6 = acceptable. Must be labeled in API response.**

### 4.3 Prohibited Silent Failures

| Failure | MUST NOT happen silently |
|---|---|
| Cash balance wrong on live query | Alert + DEGRADED |
| Lost ledger entry | CORRUPTED + halt |
| Duplicate trade in ledger | Prevented by constraint |
| Portfolio shown as exact without `asOf` | API must include timestamp |
| DEGRADED wallet allowing orders | O1 blocks |

---

## 5. Event Ordering Breakdown

### 5.1 Out-of-Order Events (Cross-Broker)

```
Wallet W_binance: seq 1,2,3 (BTC buys)
Wallet W_paper:    seq 1,2    (ETH buys)

Portfolio P1 contains both.

At query time T:
  value(P1) = value(W_binance at head) + value(W_paper at head)

No cross-wallet reordering. Each stream independent.
Portfolio does NOT impose global order.
```

**Late event on W_binance:** Appended at seq 4. Portfolio live query at T' > T includes it. No effect on W_paper.

### 5.2 Late Reconciliation Events

```
Day 1: Snapshot captured at seq 100
Day 4: Late fill imported → seq 101, timestamp = Day 2

Ledger: seq order = 100, 101. Replay at head correct.
Snapshot Day 1: unchanged (seq 100, no retroactive edit).
Performance window including Day 2: MAY BE WRONG until new snapshot captured.

Action: On late fill import → emit LateEntryImported → trigger optional snapshot recapture for affected dates (v1.1). v1: label performance MAY_BE_REVISED.
```

### 5.3 Re-Sync After 24h Outage

```
1. BrokerSyncEngine.run(fullHistory=true)
2. Paginate all fills since inception
3. Dedup by externalRef — existing entries skipped
4. Append only missing entries at seq head, head+1, ...
5. Import funding/dividends as CashAccrual/CorporateAction
6. Reconcile
7. IF unresolved → DEGRADED
8. Write PositionCheckpoint at head
9. Invalidate all caches for wallet
10. Portfolio correct on next live query

Ledger does NOT reorder existing entries.
Outage duration does not affect final head state correctness.
```

### 5.4 Ordering Authority

| Question | Answer |
|---|---|
| How does Ledger reorder? | **It does not.** Append only at tail. |
| How does Portfolio interpret? | Sums current head state per member at query time. |
| How does Snapshot invalidate? | **It does not.** New capture adds new observation. Old remains. |

---

## 6. Data Destruction Scenarios

### 6.1 Total Cache Loss

| Item | Lost? | Recovery |
|---|---|---|
| Cache keys | Yes | Automatic on miss |
| Money | **No** | Ledger intact |
| User impact | Slower reads for ~1 RT | |

**Rebuild:** None. Self-healing.

---

### 6.2 Partial Ledger Loss (entries 50–80 destroyed)

| Item | Lost? | Recovery |
|---|---|---|
| Entries 50–80 | **YES** | Restore from backup OR broker re-sync for that period |
| Entries 1–49, 81+ | No | Intact |
| Position at head | **WRONG** | Until gap filled |
| Money | **AT RISK** | Halt wallet CORRUPTED |

**Rebuild:** Manual. Broker re-import entries 50–80 with new sequences at tail **ONLY IF** original entries truly lost — creates timestamp/sequence skew. **Preferred:** restore from backup preserving original sequences.

---

### 6.3 Restore from Snapshot Only

| Item | Recoverable? |
|---|---|
| Ledger | **NO** — snapshot is observation, not event log |
| Cash at snapshot date | Approximate (observation only) |
| Current cash | **NO** |
| Trades | **NO** |

**Verdict:** Snapshot-only restore is **INSUFFICIENT** for wallet reconstruction. Use for performance history only.

---

### 6.4 Restore from Broker Only

| Item | Recoverable? |
|---|---|
| Trade history | **YES** (fills import) |
| Cash movements off-exchange | **NO** (deposits not on broker API may be lost) |
| Manual corrections | **NO** |
| Corporate actions | **PARTIAL** (if broker reports them) |
| Inventory holdings | **NO** (separate domain) |

**Rebuild procedure:**

```
1. Create new ledger OR clear corrupted ledger (manual decision)
2. fullHistory sync from broker
3. Import all fills as TradeExecution
4. Import accruals/funding
5. User re-enters manual CashMovements
6. Reconcile
7. Write checkpoint
8. Invalidate cache
```

---

### 6.5 Total Database Loss

| Domain | Recovery source | Data loss |
|---|---|---|
| Trading wallets (broker-linked) | Broker re-sync | Manual entries, off-platform movements |
| Trading wallets (simulated) | **TOTAL LOSS** unless backup | All simulated history |
| Inventory wallets | Backup only | **TOTAL LOSS** without backup |
| Portfolio definitions | Backup | Recreate manually |
| Snapshots | Backup | Re-capture if ledger recovered |
| Connections | Re-authenticate | User action required |

---

## 7. Conflict Resolution Matrix

| Conflict | Winner | Loser | Reason |
|---|---|---|---|
| Ledger vs broker position | **Ledger** (app logic) | Broker (display hint only) | B7; P19; audit trail |
| Ledger vs broker (unresolved) | **Neither** — DEGRADED | Trading | Manual resolution required |
| Ledger vs snapshot (current value) | **Ledger** | Snapshot | S4; snapshot is historical |
| Ledger vs snapshot (historical) | **Snapshot** (for that date) | Current replay at past date | Snapshot captured past observation; replay at past seq preferred if available |
| Ledger vs cache | **Ledger** | Cache | C2 |
| Ledger vs read model | **Ledger** | Read model | Tier 1 > Tier 4 |
| Wallet live vs portfolio cached | **Wallet live** | Portfolio cache | Tier 1/4; TTL bounded |
| Duplicate trade (same externalRef) | **First imported** | Second skipped | B3 |
| Duplicate trade (same id) | **First committed** | Second rejected | L2 |
| Late event vs current state | **Both coexist** | Neither wins | Late appended at tail; current head includes it |
| Late event vs past snapshot | **Snapshot frozen** | Late event not retrofitted | T3 |
| Trade vs sync (lock) | **Trade** (priority) | Sync waits | O5 |
| Archive vs sync | **Archive** (if started) | Sync blocked | L1 |
| Holding revision conflict | **First commit** | Second rejected CONFLICT | H1 |
| Compensating entry vs original | **Both preserved** | Neither deleted | L6; original + correction |
| Genesis replay vs checkpoint | **Genesis replay** (audit) | Checkpoint | Checkpoint is derived; genesis is proof |
| Manual CashMovement vs broker | **Both in ledger** | Neither | Different sources; reconcile cash total |

---

## 8. System Survivability Score

### 8.1 Component Scores (0–10)

| Component | Score | Rationale |
|---|---|---|
| **Ledger safety** | **9/10** | Append-only, idempotent, serial per wallet. −1 for dependency on ACID implementation and backup strategy. |
| **Wallet safety** | **9/10** | No financial state on entity; DEGRADED/CORRUPTED gates. −1 for CORRUPTED recovery complexity. |
| **Portfolio safety** | **7/10** | Never owns money; stale/mixed freshness possible 30–60s. Correct on live query. Not a money layer. |
| **Broker isolation** | **9/10** | Per-wallet streams; externalRef dedup; no cross-broker contamination. −1 for broker API unpredictability. |
| **Reconciliation robustness** | **8/10** | Explicit protocol; DEGRADED blocks orders. −2 for manual resolution path and tolerance tuning. |
| **Snapshot integrity** | **8/10** | Immutable; asOfSequence binding. −2 for no retroactive correction of performance. |
| **Cache/RM survivability** | **10/10** | Fully disposable; rebuild from ledger. |
| **Inventory (holdings) safety** | **8/10** | Optimistic concurrency; no broker sync. −2 for manual data loss risk without backup. |
| **Multi-device safety** | **8/10** | Per-wallet serial + holding CAS. −2 for portfolio read skew. |
| **Disaster recovery** | **6/10** | Broker re-sync saves broker-linked. Simulated wallets lost without backup. |

### 8.2 Overall Financial Correctness Under Chaos

| Metric | Score |
|---|---|
| **Money preservation (Tier 1)** | **9/10** |
| **Display correctness (Tier 4)** | **7/10** |
| **Recovery without data loss (broker-linked)** | **8/10** |
| **Recovery without data loss (simulated)** | **4/10** (backup dependent) |
| **Overall fintech-grade under failure** | **8/10** |

### 8.3 Classification

```
┌─────────────────────────────────────────────────────────────┐
│  VERDICT: FINTECH-GRADE (with documented bounds)            │
│                                                             │
│  ✓ Money safe at ledger layer under all simulated failures  │
│  ✓ No silent double spend                                   │
│  ✓ No broker overwrite                                      │
│  ✓ Deterministic recovery paths                             │
│  ✓ Bounded stale display (portfolio/cache)                  │
│                                                             │
│  ✗ Not bank-core grade (no distributed consensus跨 wallets) │
│  ✗ Simulated wallets vulnerable to total DB loss            │
│  ✗ Historical performance may lag after late events           │
│  ✗ Manual intervention required for CORRUPTED / MANUAL_REVIEW │
└─────────────────────────────────────────────────────────────┘
```

**Not "app robusta"** — apps tolerate stale UI.  
**Fintech-grade** — money layer has invariants, gates, and recovery contracts.

**To reach 9/10 overall:** synchronous replication, automated backup for simulated wallets, outbox pattern, late-entry snapshot recapture job, margin/short model (v1.1).

---

## Appendix A — Incident Response Playbook (Summary)

| Severity | Condition | Immediate action |
|---|---|---|
| **SEV-1** | Sequence gap, negative cash detected | Halt writes wallet; `CORRUPTED`; restore from backup |
| **SEV-2** | Reconciliation unresolved > 1h | `DEGRADED` persists; block orders; ops alert |
| **SEV-3** | Cache cluster down | Serve live queries; degraded latency |
| **SEV-4** | Portfolio cache stale | Auto TTL recovery; no action |
| **SEV-5** | Late fill imported | Optional snapshot recapture; label performance |

---

## Appendix B — Chaos Test Checklist

Mandatory integration chaos tests before production:

- [ ] Concurrent 100 orders same wallet → no negative cash
- [ ] Duplicate externalRef import 10x → single entry
- [ ] Kill process mid-transaction → no partial entry
- [ ] Sync + order race 1000x → no duplicate entries
- [ ] Broker returns 2x same fill → dedup
- [ ] Late fill after snapshot → head correct, snapshot unchanged
- [ ] Total cache flush → live queries correct
- [ ] Reconcile mismatch → DEGRADED + order blocked
- [ ] Archive during sync → sealed ledger, no post-seal entries
- [ ] Full replay from genesis == checkpoint replay at head

---

## Appendix C — Document Cross-Reference

| Topic | Consistency Model | This document |
|---|---|---|
| Behavior spec §9 | IF/THEN rules | Scenarios validate rules |
| Failure modes §8 | F1–F13 | Expanded scenarios SC-* |
| Recovery | §8.2 | §3 |
| SSOT | §1, §7 | §7 matrix |
| Money invariants | — | §4 |

---

*End of document — ARCHITECTURE_FAILURE_SIMULATION v1.0*
