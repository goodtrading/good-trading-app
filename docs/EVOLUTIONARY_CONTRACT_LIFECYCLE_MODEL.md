# Evolutionary Contract Lifecycle Model

**Version:** 1.0  
**Status:** Frozen — Final architecture contract  
**Audience:** Architects, tech leads, backend engineers, release managers  
**Scope:** How Cartera evolves across versions without breaking financial integrity, temporal correctness, operational guarantees, or user truth.

**Authority chain:** Governs evolution of all Cartera v1.0 architecture documents.

```
DOMAIN_MODEL.md
FINANCIAL_BACKEND_ARCHITECTURE.md
CONSISTENCY_MODEL.md
ARCHITECTURE_FAILURE_SIMULATION.md
EXECUTION_TRUTH_MODEL.md
USER_TRUTH_PRESENTATION_MODEL.md
EXCHANGE_BEHAVIOR_FIDELITY_MODEL.md
OPERATIONAL_EXECUTION_RUNTIME_MODEL.md
EVOLUTIONARY_CONTRACT_LIFECYCLE_MODEL.md  ← this document (final)
```

**Central question:**

> ¿Cómo evoluciona este sistema sin romper su integridad financiera, temporal y operacional?

**Answer preview:** Evolution is **append-only at the ledger**, **versioned at the boundary**, and **replaceable at the engine layer**. Breaking changes require explicit major version bumps, migration protocols, and reconciliation gates. Historical correctness is preserved by immutability + compensating entries, never by mutation.

**After this document:** No more base architecture. Only controlled implementation and versioned financial system evolution.

---

## Table of Contents

1. [Versioning Model](#1-versioning-model)
2. [Contract Stability Tiers](#2-contract-stability-tiers)
3. [Migration Rules](#3-migration-rules)
4. [Engine Evolution Model](#4-engine-evolution-model)
5. [Broker Evolution Model](#5-broker-evolution-model)
6. [Event Schema Evolution](#6-event-schema-evolution)
7. [Snapshot Evolution](#7-snapshot-evolution)
8. [UX Compatibility Layer](#8-ux-compatibility-layer)
9. [Zero-Downtime Evolution Strategy](#9-zero-downtime-evolution-strategy)
10. [Hard Rules (Non-Negotiable)](#10-hard-rules-non-negotiable)

---

## 1. Versioning Model

### 1.1 Version Semantics

Cartera uses **semantic contract versioning** independent of application release tags.

```
MAJOR.MINOR.PATCH

MAJOR  — breaking contract change; migration required
MINOR  — additive evolution; backward compatible
PATCH  — clarification, bug fix in spec; no behavioral change
```

| Label | Meaning | Example |
|---|---|---|
| **v1.0 contract** | Frozen baseline stack (9 documents). P0 invariants locked. | Current state |
| **v1.1 evolution** | Additive extensions within v1 invariants. New entry types, engines, brokers. | Futures `Exposure`, tax lots |
| **v2.0 contract** | Breaking change to ledger semantics, tenancy model, or truth hierarchy. | Short selling as native position model |

**Rule V1:** Application `package.json` version and contract version are **decoupled**. A `v2.3.1` app may implement `contract v1.0`.

**Rule V2:** Every API response includes `contractVersion` in `truth` block.

### 1.2 What Constitutes v1.0 Contract

The v1.0 contract is the **frozen intersection** of all nine architecture documents:

| Contract surface | v1.0 freeze point |
|---|---|
| Ledger append-only semantics | Immutable |
| `sequence` as canonical order | Immutable |
| `LedgerEntry` union (5 types) | Frozen set; extensible via MINOR |
| `Money` value object | Immutable |
| Tenancy (`ownerId`, `tenantId`) | Immutable |
| Truth tiers 0–4 | Immutable hierarchy |
| Per-wallet serial write lock | Immutable |
| `AccountSummary v1` published language | Frozen; v2 additive |
| UserTruth presentation states (5) | Frozen set; mapping extensible |
| Broker adapter port shape | Extensible via capability flags |
| Position long-only replay | v1 behavior frozen; v1.1 extends |

### 1.3 Breaking vs Non-Breaking Change

#### Non-Breaking (MINOR — v1.1, v1.2, …)

| Change type | Condition |
|---|---|
| New `LedgerEntry` subtype | Old replay ignores or handles via default |
| New broker adapter | Isolated; no ledger schema change |
| New engine implementation | Same input/output contract |
| New optional field on entry | Absent = default behavior |
| New presentation state label | Old clients map to nearest equivalent |
| New `AccountSummary v2` | v1 endpoint remains |
| Performance optimization | Replay output identical |
| New instrument type | Position engine handles or skips |

#### Breaking (MAJOR — v2.0+)

| Change type | Why breaking |
|---|---|
| Ledger entry mutation allowed | Violates immutability invariant |
| `sequence` replaced by timestamp ordering | Violates temporal model |
| Remove or rename committed entry fields | Replay incompatibility |
| Change sign convention on `TradeExecution` | Historical PnL wrong |
| Merge Trading + Inventario SSOT | Truth tier violation |
| Remove `tenantId` scoping | Security/tenancy break |
| Change `Money` precision rules retroactively | Historical amounts wrong |
| Overwrite ledger from broker | SSOT violation |
| Remove compensating entry pattern | Correction model break |

### 1.4 Engine Versioning

Each engine carries an independent **implementation version** and a **contract version**.

```
EngineDescriptor {
  name:           "PositionEngine"
  contractVersion: "1.0" | "1.1"
  implementationId: "position-engine-fifo-v2"
  replayCompatibleWith: ["1.0", "1.1"]
}
```

| Engine | Contract version (v1.0) | Replaceable? | Versioning rule |
|---|---|---|---|
| Trading Engine | 1.0 | Yes | Output: `Order` + commands to Ledger |
| Ledger Engine | 1.0 | Yes | Output: committed `LedgerEntry` |
| Position Engine | 1.0 | Yes | Input: entry stream; output: `Position[]` |
| Reconciliation Service | 1.0 | Yes | Output: `ReconciliationReport` |
| Valuation Engine | 1.0 | Yes | Input: positions + prices |
| Portfolio Engine | 1.0 | Yes | Input: `AccountSummary v1` |
| Performance Engine | 1.0 | Yes | Input: snapshots |
| Truth Normalization Engine | 1.0 | Yes | Input: system truth; output: UserTruth |
| Broker adapters | per-broker | Yes | Isolated behind `Broker` port |

**Rule E1:** Engine replacement MUST pass **replay equivalence test** before promotion.

**Rule E2:** Engine contract MINOR bump allowed only if replay output is identical for all v1.0 entry types under v1.0 policies.

---

## 2. Contract Stability Tiers

### 2.1 Stability Matrix

| Tier | Artifact | Stability | Evolution mechanism |
|---|---|---|---|
| **T0 — Immutable Core** | Ledger append semantics, `sequence`, immutability, compensating entries | **Frozen forever** | MAJOR only (v2+) |
| **T1 — Core Ledger** | Committed `LedgerEntry` records, `externalRef` dedup | **Immutable across versions** | Append new entries; never mutate |
| **T2 — Events** | `LedgerEntryAppended`, `HoldingUpdated`, domain events | **Append-only evolvable** | New event types additive |
| **T3 — Engines** | Position, Trading, Ledger, Portfolio, TNE | **Replaceable** | Shadow + replay test |
| **T4 — Brokers** | Binance, BingX, Paper, IBKR adapters | **Plug-in** | New adapter = new module |
| **T5 — Published API** | `AccountSummary`, `truth` block, UserTruth | **Backward compatible mapping** | Versioned endpoints |
| **T6 — Read Models** | Cache, RM, snapshots | **Disposable** | Regenerate freely |
| **T7 — UI** | Screens, components | **Independent** | Adapts to API version |

### 2.2 Stability Guarantees by Tier

```
┌─────────────────────────────────────────────────────────────┐
│  T0 Immutable Core                                          │
│  ─────────────────────────────────────────────────────────  │
│  NEVER: mutate ledger, skip sequence, broker overwrite      │
├─────────────────────────────────────────────────────────────┤
│  T1 Core Ledger (committed records)                         │
│  ─────────────────────────────────────────────────────────  │

│  NEVER: UPDATE/DELETE on entries                            │
│  ALWAYS: new types via append; old entries unchanged        │
├─────────────────────────────────────────────────────────────┤
│  T2 Events                                                  │
│  ─────────────────────────────────────────────────────────  │
│  ADD: new event types                                       │
│  NEVER: change payload semantics of emitted v1 events       │
├─────────────────────────────────────────────────────────────┤
│  T3 Engines                                                 │
│  ─────────────────────────────────────────────────────────  │
│  REPLACE: implementation with replay equivalence            │
│  NEVER: change output for same input without version bump   │
├─────────────────────────────────────────────────────────────┤
│  T4 Brokers                                                 │
│  ─────────────────────────────────────────────────────────  │
│  ADD: new adapter without touching ledger                   │
│  NEVER: adapter writes directly to ledger (bypass import)   │
├─────────────────────────────────────────────────────────────┤
│  T5 UX Truth / Published API                                │
│  ─────────────────────────────────────────────────────────  │
│  MAP: old fields to new semantics                           │
│  NEVER: remove v1 endpoint before deprecation window        │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Cross-Document Stability Map

| Document | Most stable element | Most evolvable element |
|---|---|---|
| DOMAIN_MODEL | Ledger invariants (P1–P21) | Entity catalog (new subtypes) |
| FINANCIAL_BACKEND | Layer boundaries | Engine wiring |
| CONSISTENCY_MODEL | Truth tiers, sequence order | Invalidation timing |
| FAILURE_SIMULATION | Money safety rules (A1–A7) | Recovery automation |
| EXECUTION_TRUTH | Priority stack | CRE conflict rules (additive) |
| USER_TRUTH | U1–U18 guarantees | New presentation labels |
| EXCHANGE_FIDELITY | Import dedup model | Broker-specific mappings |
| OPERATIONAL_RUNTIME | Per-wallet lock, G1–G9 | Load bounds, thresholds |
| **This document** | T0 hard rules | Migration playbooks |

---

## 3. Migration Rules

### 3.1 Ledger Migration (No Global Reprocess)

**Principle:** The ledger stream is never bulk-rewritten. Migration is **forward-only**.

#### Pattern M1 — Additive Entry Type

```
1. Deploy code that understands new entry type (e.g., MarginAdjustment v1.1)
2. Old entries unchanged
3. Position Engine v1.1 replays: old types via v1.0 path, new types via v1.1 path
4. No migration script on historical data
```

#### Pattern M2 — Policy Change (Cost Basis)

```
Cost basis policy is wallet metadata (Tier 2), NOT retroactive ledger mutation.

1. User selects new policy (e.g., FIFO → AVG) on wallet
2. effectiveFromSequence = current head + 1
3. Append PositionCheckpoint at head with policy tag
4. Replay uses: checkpoint policy for entries after checkpoint
5. Historical entries before checkpoint: original policy frozen in entry metadata OR recomputed only for display (labeled RECALCULATED)

NEVER rewrite TradeExecution entries to change cost basis.
```

#### Pattern M3 — Compensating Correction

```
Error discovered in entry seq=N:
1. Append compensating entry at seq=N+1 with correctsEntryId=N
2. Original entry remains
3. Replay applies both
4. Audit trail preserved
```

#### Pattern M4 — Schema Field Addition

```
New optional field `taxLotId?` on TradeExecution:
1. Old entries: field absent → default null
2. New entries: field populated
3. No backfill required
4. Position Engine: null = aggregate lot (v1.0 behavior)
```

#### Pattern M5 — Wallet Type Evolution

```
SIMULATED → BROKER_LINKED conversion:
1. Seal is NOT required
2. Append Connection metadata to wallet (Tier 2)
3. Run initial broker full sync → import as new entries (dedup)
4. Reconcile
5. Ledger history preserved intact
```

### 3.2 Snapshot Migration

| Scenario | Rule |
|---|---|
| New snapshot format field | Add optional; old snapshots valid |
| Snapshot schema MAJOR | New `snapshotSchemaVersion`; old readable via adapter |
| Snapshot store migration | Background regen from ledger; old deleted after verify |
| Valuation method change | New snapshots use new method; old immutable |
| Currency display change | `aggregationCurrency` on snapshot; no rewrite |

```
Regeneration rule:
  IF snapshotSchemaVersion < current:
    ON read: serve old format OR lazy-upgrade on read
    ON background job: regen from ledger at snapshot.asOfSequence
    NEVER: mutate snapshot in place
```

### 3.3 Cost Basis Policy Migration

| From | To | Mechanism |
|---|---|---|
| FIFO | AVG | Checkpoint + forward-only replay |
| AVG | FIFO | Checkpoint + forward-only; pre-checkpoint display may show RECALCULATED label |
| v1 aggregate | v1.1 tax lots | New entries carry `taxLotId`; old entries replay as single lot |

**Invariant:** Committed `TradeExecution.quantity` and `price` never change. Only aggregation logic changes at checkpoint boundary.

### 3.4 New Event Type Introduction

```
CHECKLIST for new LedgerEntry subtype:
  □ Domain model amendment (MINOR)
  □ Position Engine handler (or explicit no-op with doc)
  □ Cash engine handler
  □ Broker import mapping (if applicable)
  □ Reconciliation tolerance rules
  □ UserTruth mapping
  □ Replay equivalence test for existing entries
  □ Schema registry entry with effectiveVersion
```

### 3.5 Entity Deprecation

| Entity | Deprecation pattern |
|---|---|
| Domain entity (e.g., legacy `PaperWallet`) | Mark `deprecatedAsOf`; stop new creates; existing read-only; migrate to `Wallet + PaperBroker` |
| API field | `deprecated: true` in schema; remove after 2 MINOR versions |
| Engine implementation | Run shadow until equivalence proven; then decommission |
| Broker adapter version | Old adapter read-only; new adapter for new connections; dual-run during transition |
| Presentation state | Map to successor; never remove without client min-version check |

**Rule D1:** Deprecated entities are **sealed**, not deleted, until audit retention expires.

---

## 4. Engine Evolution Model

### 4.1 Position Engine Replacement

```
GOAL: Replace Position Engine without breaking replay.

PROTOCOL:
  1. Implement PositionEngine v1.1 (e.g., tax lot support)
  2. Run shadow replay: all wallets, entries [0..head]
  3. Compare output:
       v1.0 expected: Position[] per v1.0 rules
       v1.1 output:    Position[] per v1.1 rules
  4. FOR entries before policy checkpoint:
       v1.1 MUST produce identical qty and cash to v1.0
  5. FOR entries after checkpoint:
       v1.1 may differ (new policy) — user consented
  6. Promote v1.1 as default for new replays
  7. v1.0 engine retained for audit dispute resolution (read-only)
```

### 4.2 Trading Engine Versioning

| Version | Capability | Compatibility |
|---|---|---|
| TE 1.0 | Spot long-only orders | Baseline |
| TE 1.1 | Futures orders, margin check | Adds validation; same order model |
| TE 2.0 | Multi-leg, options | MAJOR — new Order types |

```
Trading Engine evolution rules:
  - Order schema: additive fields only in MINOR
  - Validation rules may tighten (reject new cases) — NOT breaking for committed history
  - Validation rules may NOT loosen retroactively on past orders
  - Broker submission mapping versioned per adapter
```

### 4.3 Dual Engine Transition

```
Phase A — Shadow:
  Primary:   Engine_v1 (serves production)
  Secondary: Engine_v1.1 (shadow replay, metrics only)

Phase B — Canary:
  Primary:   Engine_v1.1 for 5% wallets (by hash)
  Fallback:  Engine_v1 on mismatch alert

Phase C — Promote:
  Primary:   Engine_v1.1 (all wallets)
  Retained:  Engine_v1 (read-only audit, 90 days)

Phase D — Decommission:
  Remove Engine_v1 code after retention window
```

### 4.4 Fallback Strategies

| Failure | Fallback |
|---|---|
| Position Engine v1.1 replay error | Fall back to v1.0; wallet DEGRADED; alert |
| Trading Engine validation crash | Reject order; no partial state |
| Portfolio Engine timeout | Serve STALE cache with label |
| TNE collapse failure | presentationState: UNKNOWN |
| Reconciliation engine mismatch | DEGRADED; ledger unchanged |

**Rule F1:** Fallback NEVER writes to Tier 1. Read-only degradation only.

---

## 5. Broker Evolution Model

### 5.1 Adding New Brokers (Zero Downtime)

```
1. Implement BrokerAdapter in isolation (T4 plug-in)
2. Register in broker registry with capability manifest
3. Deploy adapter code (no ledger migration)
4. New Connection uses new adapter
5. Existing connections unaffected
6. Integration tests: import, dedup, reconcile, order lifecycle
7. Gradual rollout: internal → beta users → GA
```

### 5.2 Broker API Change (Same Broker)

```
Example: Binance REST v3 → v4

1. Implement BinanceAdapterV4 alongside V3
2. Capability manifest: supported API versions
3. Per-connection metadata: adapterVersion
4. New connections → V4
5. Existing connections: migrate on reconnect
   a. Final V3 sync (cursor preserved)
   b. Switch adapterVersion
   c. V4 sync from cursor (dedup prevents duplicates)
6. Reconcile post-switch
7. Deprecate V3 after all connections migrated
```

**Invariant:** Ledger entries are broker-agnostic. Adapter change never mutates existing entries.

### 5.3 Adapter Version Coexistence

```
Connection {
  brokerId: "binance"
  adapterVersion: "3.2.1" | "4.0.0"
  adapterCapabilities: ["SPOT", "FUTURES", "WS_FILLS"]
}

Runtime:
  BrokerRegistry.resolve(brokerId, adapterVersion) → Adapter instance

  Multiple versions MAY run simultaneously.
  Each version MUST produce identical LedgerEntry semantics for same broker event.
```

### 5.4 Gradual Rollout Model

| Stage | % connections | Gate |
|---|---|---|
| Internal | 0% (dev only) | Unit + integration tests |
| Alpha | 1% | Manual reconciliation review |
| Beta | 10% | Auto-reconcile pass rate > 99% |
| GA | 100% | 7 days beta without SEV-1 |

**Rollback:** Per-connection `adapterVersion` pin revert. No ledger rollback.

---

## 6. Event Schema Evolution

### 6.1 LedgerEntry Type Extension

```
v1.0 union:
  TradeExecution | CashMovement | CorporateAction | CashAccrual | PositionCheckpoint

v1.1 addition (example):
  | MarginAdjustment | FundingPayment | ExposureSnapshot

Rules:
  R1: New types are new union members — never retype existing
  R2: Each type has schemaVersion: 1
  R3: Persistence stores type discriminator + JSON payload
  R4: Unknown type in old code → skip with alert (forward compat for rollback)
```

### 6.2 Backward Compatibility

| Direction | Behavior |
|---|---|
| **Old code, new entry** | Skip unknown type in replay; log `UNKNOWN_ENTRY_TYPE`; position may be INCOMPLETE — wallet DEGRADED |
| **New code, old entry** | Full replay; all v1.0 types handled |
| **Rollback deployment** | New entry types already committed → old code degrades wallet, does NOT crash |

### 6.3 Unknown Event Handling

```
ON replay encounter unknown entry type:
  IF entry.schemaVersion > runtime.maxSchemaVersion:
    1. Skip entry in position/cash replay
    2. Preserve entry in ledger (immutable)
    3. Set wallet.status = DEGRADED
    4. Set truth.dataQuality = INCOMPLETE
    5. UserTruth: presentationState = DEGRADED
    6. Alert: SCHEMA_MISMATCH

  NEVER: delete entry, coerce to TradeExecution, or ignore silently
```

### 6.4 Schema Versioning Registry

```
SchemaRegistry {
  entryType: "TradeExecution"
  versions: [
    { version: 1, fields: [...], effectiveFrom: "2026-01-01" },
    { version: 2, fields: [...+, taxLotId?], effectiveFrom: "2027-01-01" }
  ]
  migration: "additive-only"
}

Deserialization:
  Read version from payload
  Apply defaults for missing fields
  Validate required fields for that version
```

### 6.5 Domain Event Evolution (T2)

| Event | v1.0 | Evolution rule |
|---|---|---|
| `LedgerEntryAppended` | `{ walletId, entryId, sequence, type }` | Add optional fields |
| `HoldingUpdated` | `{ holdingId, revision }` | Add optional fields |
| `WalletStatusChanged` | `{ walletId, status, reason }` | Add optional fields |
| `ReconciliationCompleted` | `{ walletId, result }` | Add optional fields |
| New events | — | Additive; old consumers ignore |

---

## 7. Snapshot Evolution

### 7.1 Snapshot Format Versioning

```
Snapshot {
  id
  walletId
  asOf: timestamp
  asOfSequence: int64        // ledger head at capture
  snapshotSchemaVersion: 1   // format version
  lines: SnapshotLine[]
  totalValue: Money
  metadata: { captureEngine, policyVersion }
}
```

| Version | Changes | Read compatibility |
|---|---|---|
| v1 | Baseline fields | — |
| v1.1 | Add `exposureLines[]` for futures | v1 readers ignore unknown |
| v2 | Restructure lines (MAJOR) | v1 via adapter layer |

### 7.2 Replay Compatibility

```
Snapshot capture:
  1. Replay ledger to asOfSequence using current Position Engine contract
  2. Value with current Valuation Engine
  3. Persist with snapshotSchemaVersion = current

Historical snapshot read:
  - Use snapshot as-is (immutable observation)
  - Do NOT re-replay to "update" old snapshot
  - IF user requests "recalculate": new snapshot with new version, labeled RECAPTURED
```

### 7.3 Regeneration Rules

| Trigger | Action |
|---|---|
| Schema version bump | Background regen optional; not blocking |
| Engine bug fix affecting valuation | Regen affected date range; tag `revisedReason` |
| User request | On-demand regen for date range |
| Snapshot store corruption | Regen from ledger; ledger is source |
| Late entry imported (CONSISTENCY §2) | v1: label MAY_BE_REVISED; v1.1: auto-regen job |

### 7.4 Deprecation Strategy

```
snapshotSchemaVersion N deprecated:
  1. Announce in release notes
  2. Read adapter maintained for 2 MAJOR app versions
  3. Background migration job converts N → N+1
  4. After migration complete + retention: archive N readers
  5. Old snapshot blobs may be deleted after regen verified

NEVER delete snapshots without regen verification against ledger.
```

---

## 8. UX Compatibility Layer

### 8.1 UserTruth Backward Compatibility

```
Client declares: Accept-Truth-Contract: 1.0

Server response:
  truth: {
    contractVersion: "1.1",
    presentationState: "LIVE" | "DEGRADED" | ... (v1.0 set)
    dataQuality: "COMPLETE" | ... (v1.0 set)
    newFieldV1_1?: ...  // ignored by v1.0 clients
  }

Mapping rule:
  v1.1 presentationState not in v1.0 set → map to DEGRADED
  v1.1 dataQuality not in v1.0 set → map to INCOMPLETE
```

### 8.2 Backend Change → UI Safety

| Backend change | UI impact | Mitigation |
|---|---|---|
| New presentation state | Unknown badge | Client fallback map |
| New `AccountSummary` field | Ignored by old UI | Optional fields only |
| Stricter trading gate | Button disabled | `truth.allowTrading` authoritative |
| New wallet status | Unknown status | Map to DEGRADED + generic message |
| API endpoint version bump | Old endpoint maintained | `/v1/` stable minimum 12 months |
| TNE collapse rule change | Display value change | `asOf` + `dataQuality` label |

### 8.3 UX Contract Evolution Rules

```
From USER_TRUTH U1–U18:

IMMUTABLE (never break):
  U1  — No contradictory values same context
  U2  — DEGRADED/CORRUPTED shows label
  U3  — No trading during RECONCILING (broker)
  U4  — STALE shows label
  U5  — Conservative collapse
  U6  — allowTrading from truth block
  U7  — No silent broker override of ledger display

EVOLVABLE (additive):
  New presentation states (with fallback map)
  New dataQuality values (with fallback map)
  Richer broker expandable detail
  New truth metadata fields

BREAKING (requires MAJOR):
  Remove presentationState enum value
  Change allowTrading semantics
  Remove truth block entirely
```

### 8.4 Client Version Matrix

| Client | Server | Behavior |
|---|---|---|
| v1.0 | v1.0 | Full contract |
| v1.0 | v1.1 | Server maps; client ignores new fields |
| v1.1 | v1.0 | Client uses v1.1 fields if present; graceful absence |
| v1.0 | v2.0 | Server maintains `/v1/` adapter; deprecation window |

---

## 9. Zero-Downtime Evolution Strategy

### 9.1 Dual-Write Windows

```
USE CASE: Migrating cache key scheme or RM format

1. Deploy code that WRITES both old and new format
2. READ prefers new, fallback old
3. Monitor mismatch rate
4. Backfill old → new in background
5. Deploy code that WRITES new only
6. Deploy code that READS new only
7. Remove old format after TTL

NEVER dual-write Tier 1 ledger. Ledger has single write path always.
```

### 9.2 Shadow Execution

```
USE CASE: New engine, new broker adapter, new reconciliation logic

1. Production path: current implementation (serves user)
2. Shadow path: new implementation (async, no user impact)
3. Compare outputs:
     position qty, cash, reconcile result
4. Metrics: shadow_mismatch_rate
5. IF mismatch_rate < 0.01% for 7 days → promote
6. IF mismatch → block promotion, investigate

Shadow NEVER appends to ledger.
```

### 9.3 Reconciliation During Migration

```
During any migration affecting financial semantics:

1. Pre-migration: full reconcile all active wallets
2. Migration: forward-only (no ledger rewrite)
3. Post-migration: full reconcile within 15 min
4. Gate: IF unresolved > 0 → rollback deployment (not ledger)
5. Monitor: reconciliation_unresolved_count

Migration is ROLLED BACK at deployment level, never at ledger level.
```

### 9.4 Rollback Strategy

| Layer | Rollback mechanism | Data impact |
|---|---|---|
| Application deployment | Revert binary/release | None on Tier 1 |
| Engine version | Pin to previous implementation | None on Tier 1 |
| Broker adapter | Per-connection version pin | None on Tier 1 |
| Schema MINOR | Forward compat built-in | New entries may degrade in old code |
| Schema MAJOR | **No rollback** without migration | Requires v2 migration plan |
| Cache/RM | Flush cache | Rebuild from ledger |
| Snapshot format | Read adapter | None on ledger |

```
ROLLBACK GOLDEN RULE:
  Tier 1 ledger is append-only and never rolled back.
  Rollback is always "deploy old code that reads current ledger."
  IF new entry types exist → old code degrades gracefully (§6.3).
```

### 9.5 Migration Timeline Template

```
T-14d  Spec amendment (MINOR) merged
T-7d   Shadow execution begins
T-3d   Canary 5%
T-0    GA deploy
T+15m  Post-migration reconcile all wallets
T+24h  Review mismatch metrics
T+7d   Decommission shadow
T+90d  Decommission old engine (if applicable)
```

---

## 10. Hard Rules (Non-Negotiable)

### 10.1 What Never Changes (Any Version)

| ID | Rule | Violation consequence |
|---|---|---|
| H1 | Ledger entries are immutable after commit | Financial audit failure |
| H2 | `sequence` is canonical order; monotonic per wallet | Temporal corruption |
| H3 | Corrections via compensating entries only | Audit trail destruction |
| H4 | Broker never overwrites ledger | SSOT violation |
| H5 | `externalRef` dedup per wallet | Double-count money |
| H6 | Per-wallet serial write for Tier 1 | Race corruption |
| H7 | `tenantId` on all financial reads/writes | Security breach |
| H8 | `Money` typed; no bare float for storage | Precision loss |
| H9 | UserTruth never contradicts without label | Trust violation |
| H10 | Portfolio never mutates Tier 1 | Boundary violation |

### 10.2 What Requires Major Version Bump

| Change | Why MAJOR |
|---|---|
| Allow ledger UPDATE/DELETE | H1 |
| Timestamp replaces sequence as order | H2 |
| Remove compensating entry pattern | H3 |
| Merge wallet types into single SSOT | Truth tier redesign |
| Change TradeExecution sign convention | Historical PnL invalid |
| Remove tenancy fields | H7 |
| Change decimal precision retroactively | H8 |
| Remove `truth` block from API | H9 |
| Portfolio writes to ledger | H10 |

### 10.3 What Breaks Ledger Invariants

```
FORBIDDEN OPERATIONS (never in any version without v2 redesign):

  UPDATE ledger_entries SET ...
  DELETE FROM ledger_entries WHERE ...
  TRUNCATE ledger_entries
  Reorder sequence numbers
  Import broker state as overwrite
  Replay that skips entries selectively
  Negative sequence or gaps after commit
  Two entries with same id
  Two entries with same externalRef per wallet
```

### 10.4 What Invalidates Historical Correctness

| Action | Impact | Recovery |
|---|---|---|
| Mutate committed entry | All replay from that point wrong | **Irrecoverable** — restore backup |
| Change qty/price on TradeExecution | PnL history wrong | **Irrecoverable** — compensating only for future |
| Delete entries | Audit gap | **Irrecoverable** — broker resync to new wallet |
| Reorder sequences | Position timeline wrong | **Irrecoverable** |
| Retroactive currency conversion rate change | Snapshot values wrong | Regen snapshots with label |
| Cost basis policy without checkpoint | Ambiguous replay | Force checkpoint + DEGRADED until resolved |
| Engine change without replay test | Silent position drift | Shadow mismatch → block |

### 10.5 Evolution Approval Matrix

| Change scope | Approver | Required artifacts |
|---|---|---|
| PATCH (docs/clarification) | Tech lead | PR |
| MINOR (additive feature) | Architect | Spec amendment + replay test |
| Engine replacement | Architect + QA | Shadow report 7 days |
| New broker adapter | Architect | Integration test suite + reconcile report |
| New LedgerEntry type | Architect | §3.4 checklist complete |
| MAJOR (v2.0) | Architecture review board | Migration plan + rollback + audit |
| H1–H10 violation | **Rejected** | — |

---

## Final Verdict

```
┌──────────────────────────────────────────────────────────────────┐
│  ¿Cómo evoluciona sin romper integridad financiera, temporal     │
│  y operacional?                                                  │
│                                                                  │
│  MECANISMO:                                                      │
│    • Ledger: append-only forever; evolution via new entries      │
│    • Engines: replaceable with replay equivalence proof          │
│    • Brokers: plug-in adapters; ledger stays agnostic            │
│    • API/UX: versioned boundaries; backward-compatible mapping     │
│    • Migration: forward-only; checkpoint boundaries; shadow test   │
│    • Rollback: deploy-level only; ledger never rewound            │
│                                                                  │
│  GARANTÍA:                                                       │
│    Historical committed money movements are permanent truth.     │
│    Evolution adds capability; it does not rewrite history.       │
│                                                                  │
│  CLASIFICACIÓN DEL SISTEMA COMPLETO:                             │
│                                                                  │
│    ✓ Arquitectónicamente correcto     (docs 1–7)                 │
│    ✓ Operacionalmente real            (doc 8)                      │
│    ✓ Evolutivamente viable            (doc 9 — this document)      │
│                                                                  │
│  PRÓXIMO PASO:                                                   │
│    → Implementación controlada por fases (DOMAIN §11)            │
│    → Evolución versionada del sistema financiero                 │
│    → No más arquitectura base                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Appendix A — Version History of Architecture Stack

| Document | Version | Status |
|---|---|---|
| DOMAIN_MODEL.md | 1.0 | Frozen |
| FINANCIAL_BACKEND_ARCHITECTURE.md | 1.0 | Frozen |
| CONSISTENCY_MODEL.md | 1.0 | Frozen |
| ARCHITECTURE_FAILURE_SIMULATION.md | 1.0 | Frozen |
| EXECUTION_TRUTH_MODEL.md | 1.0 | Frozen |
| USER_TRUTH_PRESENTATION_MODEL.md | 1.0 | Frozen |
| EXCHANGE_BEHAVIOR_FIDELITY_MODEL.md | 1.0 | Frozen |
| OPERATIONAL_EXECUTION_RUNTIME_MODEL.md | 1.0 | Frozen |
| EVOLUTIONARY_CONTRACT_LIFECYCLE_MODEL.md | 1.0 | Frozen |

**Stack status:** Architecture base **COMPLETE**. Amendments require explicit version bump per §1.

---

## Appendix B — v1.1 Evolution Candidates (Pre-Approved MINOR Scope)

| Candidate | Source doc | Migration pattern |
|---|---|---|
| Futures `Exposure` entity | FIDELITY §10.4 | M1 additive entry + engine |
| Tax lot tracking | DOMAIN §12 | M4 field + M2 checkpoint |
| `BrokerAccount` sub-entity | DOMAIN §12 | M5 wallet metadata |
| Late-entry snapshot regen | FAILURE_SIM §3 | §7.3 regen job |
| IBKR adapter | FIDELITY §6 | §5.1 new broker |
| Short selling position model | DOMAIN §12 | **v2.0 candidate** — MAJOR |
| Multi-currency portfolio FX policy | CONSISTENCY §7 | MINOR policy + checkpoint |

---

## Appendix C — Document Cross-Reference

| Topic | Source doc | This doc |
|---|---|---|
| P0 invariants | DOMAIN §10 | §10.1 H1–H10 |
| Amendment policy | DOMAIN intro | §1.1 |
| Truth tiers | CONSISTENCY §1 | §2.1 |
| Compensating entries | DOMAIN §2.8 | §3.1 M3 |
| Engine catalog | DOMAIN §5 | §1.4, §4 |
| Broker port | DOMAIN §6 | §5 |
| Presentation contract | USER_TRUTH §10 | §8 |
| Zero-downtime runtime | OPERATIONAL §9 | §9 |
| Replay bootstrap | OPERATIONAL §9.3 | §4.1 |
| Fidelity gaps → v1.1 | FIDELITY §10.4 | Appendix B |

---

*End of document — EVOLUTIONARY_CONTRACT_LIFECYCLE_MODEL v1.0*  
*End of Cartera architecture base.*
