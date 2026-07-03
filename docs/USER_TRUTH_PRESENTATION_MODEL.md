# User Truth Presentation Model

**Version:** 1.0  
**Status:** Frozen — Final layer of Cartera architecture  
**Audience:** Backend engineers, API designers, client engineers, product  
**Scope:** How internal financial truth is normalized and exposed to users. Not visual design.

**Authority chain:**

```
DOMAIN_MODEL.md
FINANCIAL_BACKEND_ARCHITECTURE.md
CONSISTENCY_MODEL.md
ARCHITECTURE_FAILURE_SIMULATION.md
EXECUTION_TRUTH_MODEL.md          → who owns truth internally
USER_TRUTH_PRESENTATION_MODEL.md  → what the user is allowed to perceive (this document)
```

**Purpose:** The system may be eventual, degraded, stale, or reconciling internally. The user must **never** perceive contradictory financial facts without explicit labeling. This document defines the contract between `truth` metadata (API) and user-facing presentation.

---

## Table of Contents

1. [User Truth Layer](#1-user-truth-layer)
2. [Presentation States](#2-presentation-states)
3. [Truth Normalization Engine](#3-truth-normalization-engine)
4. [Conflict Collapse Rules](#4-conflict-collapse-rules)
5. [Time Display Policy](#5-time-display-policy)
6. [Wallet Presentation Consistency Rules](#6-wallet-presentation-consistency-rules)
7. [Portfolio Presentation Consistency Rules](#7-portfolio-presentation-consistency-rules)
8. [Broker State Presentation](#8-broker-state-presentation)
9. [User Experience Guarantee](#9-user-experience-guarantee)
10. [Final UX Contract](#10-final-ux-contract)

---

## 1. User Truth Layer

### 1.1 What Is User Truth

**User Truth** is the single, normalized financial narrative presented to the user for a given screen context at a given moment. It is a **deliberate projection** of System Truth — never a second source of truth.

```
UserTruth = Normalize(SystemTruth, PresentationContext)
```

| Property | Definition |
|---|---|
| **Singular** | One primary value per financial metric per screen context |
| **Labeled** | Every value carries a presentation state and temporal context |
| **Conservative** | When uncertain, show less — never invent |
| **Non-contradictory** | Two visible numbers for the same metric in the same context is forbidden |
| **Action-gated** | Trading permission derived from presentation state, not raw internals |

User Truth is **not** stored. It is computed at presentation boundary from API `truth` block + `data`.

### 1.2 User Truth vs System Truth

| Dimension | System Truth | User Truth |
|---|---|---|
| **Owner** | Tier 1 (ledger/holdings) | Presentation layer |
| **Layers visible** | All tiers simultaneously may disagree | One collapsed view |
| **Broker divergence** | Explicit (DEGRADED, reconciliation report) | Single state + optional reference panel |
| **Cache staleness** | TTL, `cachedAt` metadata | LIVE or STALE — user sees one |
| **Pending orders** | `S_pending` separate from `S_confirmed` | Shown as "pending", never added to balance |
| **Historical vs current** | Distinct query paths | Explicit mode switch or label |
| **Ambiguity** | Allowed internally (DEGRADED) | Collapsed to labeled state |

### 1.3 Transformation Rules

| Rule | Description |
|---|---|
| **T1 — Collapse** | Multiple internal sources for one metric → one User Truth value via [Conflict Collapse Rules](#4-conflict-collapse-rules) |
| **T2 — Label** | Every User Truth value includes `presentationState` + `displayAsOf` |
| **T3 — Suppress** | Internal-only artifacts (sequence numbers, externalRef, raw broker JSON) never shown |
| **T4 — Gate** | `allowTrading` derived from presentation state, not passed through blindly |
| **T5 — Defer** | If collapse impossible → UNKNOWN state; hide primary value |
| **T6 — Never merge pending into confirmed** | Open orders shown separately; never in balance/total |
| **T7 — Never show broker as primary** | Broker data is reference-only except during RECONCILING diagnostic view |

---

## 2. Presentation States

Five user-visible states. **Exactly one** applies per wallet per screen. Portfolio inherits worst state from members unless scoped to single wallet.

### 2.1 State Definitions

| State | Internal mapping | Primary value source |
|---|---|---|
| **LIVE** | `S_current`, fresh cache or live replay, `status=active` | Ledger/holdings replay |
| **STALE** | `S_current` correct but `cachedAt` > TTL or `portfolio.asOf` lag | Ledger/holdings (recomputed or cached with label) |
| **DEGRADED** | `wallet.status=DEGRADED`, reconciliation unresolved | Ledger (same numbers, reduced trust) |
| **RECONCILING** | Sync in progress, `inFlightSync=true` | Last confirmed + loading overlay |
| **UNKNOWN** | `CORRUPTED`, collapse failure, missing pricing | Hidden primary; error state |

### 2.2 LIVE

| Aspect | Rule |
|---|---|
| **Data shown** | Cash, positions, holdings, total value, unrealized PnL — all from live replay |
| **Data hidden** | Broker raw state, cache metadata, sequence numbers |
| **Warning** | None |
| **Trading** | **Allowed** (SIMULATED and BROKER_LINKED if broker reachable) |
| **Badge** | None or subtle "Live" only in debug mode |

**Entry condition:** `truth.state=current`, `truth.flags=[]`, `cachedAt=null OR age≤5s`, `wallet.status=active`.

### 2.3 STALE

| Aspect | Rule |
|---|---|
| **Data shown** | Same values as last known good; marked stale |
| **Data hidden** | Nothing suppressed — transparency via label |
| **Warning** | **Required:** "Datos de hace X segundos" or "Actualizando…" |
| **Trading** | **Allowed** — stale display does not block (internal truth is current on live path; stale is display-only). **Exception:** if stale because sync overdue >15min on BROKER_LINKED → escalate to DEGRADED |
| **Badge** | `STALE` amber indicator |

**Entry condition:** `cachedAt` age > 5s and ≤ 60s OR `portfolio.asOf` lag > 5s. Values still from ledger.

### 2.4 DEGRADED

| Aspect | Rule |
|---|---|
| **Data shown** | Ledger-based values (authoritative for display) |
| **Data hidden** | Broker values as primary (move to reference panel only) |
| **Warning** | **Required:** "Esta cuenta requiere atención. Sincronización pendiente." |
| **Trading** | **Blocked** for BROKER_LINKED. **Allowed** for SIMULATED (ledger is sole truth, no broker) |
| **Badge** | `DEGRADED` red/amber indicator |

**Entry condition:** `truth.state=degraded` OR `truth.flags` includes `DEGRADED`.

### 2.5 RECONCILING

| Aspect | Rule |
|---|---|
| **Data shown** | Last confirmed values (frozen display) |
| **Data hidden** | In-flight partial imports |
| **Warning** | **Required:** "Sincronizando con [broker]…" |
| **Trading** | **Blocked** until RECONCILING → LIVE or DEGRADED |
| **Badge** | Spinner + `RECONCILING` |

**Entry condition:** `inFlightSync=true` OR explicit `truth.flags` includes `RECONCILING`.

**Transition:** RECONCILING → LIVE (success) OR DEGRADED (unresolved) OR STALE (success with cache lag).

### 2.6 UNKNOWN

| Aspect | Rule |
|---|---|
| **Data shown** | Nothing numeric for affected wallet |
| **Data hidden** | All financial values for affected scope |
| **Warning** | **Required:** "No pudimos cargar esta cuenta. Intenta de nuevo o contacta soporte." |
| **Trading** | **Blocked** |
| **Badge** | `UNKNOWN` |

**Entry condition:** `truth.state=corrupted` OR collapse engine returns `CANNOT_COLLAPSE` OR all instruments UNPRICED.

### 2.7 State Priority (worst wins)

When multiple wallets visible (portfolio):

```
UNKNOWN > DEGRADED > RECONCILING > STALE > LIVE
```

Portfolio screen shows worst member state as banner; per-wallet lines show individual states.

### 2.8 Trading Permission Matrix

| Presentation state | SIMULATED wallet | BROKER_LINKED wallet |
|---|---|---|
| LIVE | ✓ Trade | ✓ Trade |
| STALE | ✓ Trade | ✓ Trade* |
| DEGRADED | ✓ Trade | ✗ Blocked |
| RECONCILING | ✓ Trade** | ✗ Blocked |
| UNKNOWN | ✗ Blocked | ✗ Blocked |

\* STALE + sync overdue >15min → treat as DEGRADED → blocked.  
\** RECONCILING on SIMULATED is rare; ledger local — allow unless explicit lock.

---

## 3. Truth Normalization Engine

### 3.1 Purpose

The **Truth Normalization Engine (TNE)** transforms heterogeneous internal state into a single `UserFacingState` object. Runs at API response assembly or client presentation boundary. Deterministic.

### 3.2 Input

```
TNEInput {
  // From EXECUTION_TRUTH_MODEL truth block
  truth: {
    domain: wallet | portfolio | snapshot
    state: current | historical | degraded | corrupted
    asOf: Instant
    asOfSequence: int64
    source: ledger_replay | holdings | snapshot | aggregate
    cachedAt: Instant | null
    flags: string[]
  }

  data: {
    // Financial values — Money typed
    cashBalance?: Money
    totalValue?: Money
    positions?: PositionView[]
    holdings?: HoldingView[]
    openOrders?: OrderView[]
    unrealizedPnL?: Money
    realizedPnL?: Money
  }

  // Context
  wallet: {
    walletId: string
    executionMode: SIMULATED | BROKER_LINKED
    status: active | DEGRADED | CORRUPTED | archived
    brokerName?: string
  }

  sync: {
    inFlight: boolean
    lastSyncAt: Instant | null
    lastSyncAge: Duration
  }

  brokerReference?: {          // optional, never primary
    positions?: PositionView[]
    balances?: Money[]
    fetchedAt: Instant
    divergesFromLedger: boolean
  }

  cache: {
    cachedAt: Instant | null
    age: Duration
  }

  presentationContext: {
    screen: wallet_detail | portfolio_overview | performance_chart | trade_sheet
    queryMode: live | historical
    historicalAsOf?: Instant
  }
}
```

### 3.3 Output

```
UserFacingState {
  presentationState: LIVE | STALE | DEGRADED | RECONCILING | UNKNOWN

  display: {
    cashBalance: Money | null
    totalValue: Money | null
    positions: PositionView[]
    holdings: HoldingView[]
    unrealizedPnL: Money | null
    // null = suppressed (UNKNOWN)
  }

  pending: {
    openOrders: OrderView[]     // always separate from display.*
  }

  temporal: {
    displayAsOf: Instant       // what "as of" label shows
    displayAsOfLabel: string   // human-readable
    eventTimeNote: string | null  // if late events affect performance context
  }

  permissions: {
    allowTrading: boolean
    allowDeposit: boolean
    allowWithdraw: boolean
  }

  warnings: Warning[]          // ordered by severity
  badges: Badge[]

  brokerReference?: {           // only if DEGRADED or user expands "details"
    label: "Valor reportado por [broker] (referencia)"
    values: ...
    fetchedAt: Instant
    disclaimer: "Puede diferir del registro interno"
  }

  collapseLog: CollapseAction[]  // debug/telemetry only, not shown to user
}
```

### 3.4 Normalization Algorithm

```
FUNCTION normalize(input: TNEInput) → UserFacingState:

  // Step 1: Determine presentation state
  state = derivePresentationState(input)
  // Uses §2 priority rules

  // Step 2: If UNKNOWN, return early with suppressed values
  IF state = UNKNOWN
  THEN RETURN suppressedState(warnings=[CORRUPTED_OR_UNAVAILABLE])

  // Step 3: Select primary value source (always ledger/holdings for display)
  primary = input.data  // already from ledger replay per API contract

  // Step 4: Collapse conflicts (should be no-op if API correct)
  collapsed = collapseConflicts(primary, input.brokerReference, input.cache)

  // Step 5: Apply presentation state overlays
  IF state = RECONCILING
  THEN frozen = lastConfirmedDisplay(walletId) OR collapsed  // no partial updates

  // Step 6: Separate pending from confirmed
  pending = input.data.openOrders
  display = collapsed WITHOUT pending order notional in totals

  // Step 7: Temporal labeling
  temporal = buildTemporalLabel(input.truth, input.cache, input.sync)

  // Step 8: Permissions
  permissions = derivePermissions(state, input.wallet.executionMode)

  // Step 9: Warnings and badges
  warnings = buildWarnings(state, input)
  badges = [state]

  // Step 10: Broker reference (conditional)
  brokerRef = IF state IN (DEGRADED, RECONCILING) AND input.brokerReference
              THEN wrapAsReference(input.brokerReference)
              ELSE null

  RETURN UserFacingState { ... }
```

---

## 4. Conflict Collapse Rules

When two internal values exist for the same metric, TNE collapses to one User Truth.

### 4.1 Collapse Priority Table

| Metrics in conflict | Primary shown | Secondary | User sees |
|---|---|---|---|
| Ledger cash vs cache cash | **Ledger** | Discard cache | Single cash value |
| Ledger cash vs broker cash | **Ledger** | Broker → reference panel | Single cash + optional "broker reports X" |
| Ledger position qty vs broker qty | **Ledger** | Broker → reference | Single qty |
| Live replay vs snapshot (current screen) | **Live replay** | Snapshot hidden | Current value only |
| Live replay vs snapshot (performance screen) | **Snapshot** | Live not shown | Historical chart only |
| Portfolio cache vs sum of live wallets | **Live sum** | Cache discarded | Recompute on read |
| Portfolio member LIVE + member STALE | **Per-line truth** | Portfolio banner STALE | Lines labeled individually |
| Open order notional vs balance | **Balance excludes pending** | Orders in pending section | No double count |
| Priced vs UNPRICED instrument | **Show priced** | UNPRICED line: "—" | Partial total + warning |
| Two timestamps (event vs system) | **displayAsOf = truth.asOf** | event time in tooltip only | One "as of" label |

### 4.2 When to Show "Pending Reconciliation"

```
IF presentationState = DEGRADED
   AND brokerReference.divergesFromLedger = true
THEN
  show warning: "Estamos verificando diferencias con [broker]"
  show primary: ledger values
  show expandable: broker reference values
  DO NOT show two values side-by-side without labels
```

### 4.3 When to Block Presentation (UNKNOWN)

```
IF truth.state = corrupted
OR wallet.status = CORRUPTED
OR collapse returns unresolvable conflict (ledger vs broker differ AND ledger integrity fails)
OR totalValue cannot be computed (all lines UNPRICED)
THEN presentationState = UNKNOWN
     suppress all numeric display
     block trading
```

### 4.4 When to Freeze Display (RECONCILING)

```
IF sync.inFlight = true
THEN
  freeze display at last UserFacingState before sync started
  overlay RECONCILING badge
  block trading (BROKER_LINKED)
  DO NOT update numbers until sync completes
```

### 4.5 Collapse Priority (absolute)

```
1. Ledger / Holdings (Tier 1)
2. Live replay (recomputed)
3. Cached read model (if fresh enough for STALE)
4. Snapshot (historical context only)
5. Broker (reference only, never primary)
6. Never: raw cache without truth metadata
```

---

## 5. Time Display Policy

### 5.1 Which Timestamp the User Sees

| Context | Display field | Label format |
|---|---|---|
| Wallet balance (live) | `truth.asOf` | "Al momento" if age < 5s; else "Hace X seg" |
| Portfolio total (live) | `portfolio.asOf` = max(member.asOf) | "Consolidado al [time]" |
| Performance chart | `snapshot.asOf` per point | Axis = snapshot dates |
| Trade execution | `entry.timestamp` (event time) | "Operación: [date time]" |
| Sync status | `sync.lastSyncAt` | "Última sync: hace X min" |
| Broker reference | `brokerReference.fetchedAt` | "Broker reportó: [time]" |

### 5.2 "As Of" Rules

```
RULE TD1: Every screen with financial totals shows exactly ONE primary "as of" label.
RULE TD2: Live screens: if asOf age > 5s, label becomes "Hace X segundos" (STALE).
RULE TD3: Portfolio: always show "Consolidado al [time]" — never imply real-time if member skew > 5s.
RULE TD4: Performance: always show "Rendimiento basado en capturas diarias" — never imply live.
RULE TD5: Historical mode: prefix "Histórico — " on all values.
```

### 5.3 Sync Delay Presentation

| `lastSyncAge` | User sees |
|---|---|
| < 5 min | No sync label (LIVE) |
| 5–15 min | "Última sync hace X min" (STALE, subtle) |
| 15–60 min | "Datos del broker pueden estar desactualizados" (STALE, prominent) |
| > 60 min OR unresolved recon | DEGRADED state |
| Sync in flight | RECONCILING spinner |

### 5.4 eventTime vs systemTime (User-Facing)

```
User sees:  eventTime  →  for trade history list ("when the trade happened")
User sees:  truth.asOf (system) → for "current balance as of"
User NEVER sees: sequence numbers, commit timestamps, broker internal IDs

IF eventTime << truth.asOf (late fill):
  trade list shows eventTime
  balance reflects truth.asOf (includes late fill)
  NO confusion: trade row may show "Importado recientemente" badge on that entry
```

---

## 6. Wallet Presentation Consistency Rules

### 6.1 What May Change Without Full Re-render

| Element | May update in place |
|---|---|
| Unrealized PnL | Yes (price tick) |
| Position market value | Yes (price tick) |
| Individual position line | Yes |
| Cash balance | **No** — requires confirmed ledger change |
| Total value | **No** — atomic update with cash/positions |
| Presentation state badge | **No** — state transition triggers full shell update |

### 6.2 What Requires Freeze

| Event | Freeze scope | Duration |
|---|---|---|
| RECONCILING starts | All wallet financial values | Until sync completes |
| Place order submitted | Balance + trade button | Until command ACK or reject |
| DEGRADED → LIVE transition | Full wallet card | Single atomic swap |

### 6.3 Loading State Triggers

| Trigger | Loading behavior |
|---|---|
| Initial wallet load | Skeleton → full UserFacingState (no partial numbers) |
| Refresh pull | Overlay on stale values (keep showing STALE labeled values) |
| Post-trade | Freeze → spinner on CTA → atomic new state |
| Sync start | RECONCILING freeze |

### 6.4 What Must Never Flicker

| Element | Rule |
|---|---|
| Cash balance | Atomic swap only — never animate digit-by-digit |
| Total value | Same |
| Presentation state badge | Debounce 300ms; no LIVE↔STALE oscillation faster than 5s |
| Position quantity | Never changes without user action or labeled sync |
| DEGRADED warning | Sticky until state clears — no flash |

### 6.5 Wallet Screen Invariants

```
W1: One wallet screen shows exactly one presentationState.
W2: Cash + positions + total must be from same truth.asOf (or labeled if STALE).
W3: Open orders section never adds to total above.
W4: SIMULATED wallet never shows broker reference panel.
W5: Trade button state follows permissions.allowTrading only.
```

---

## 7. Portfolio Presentation Consistency Rules

### 7.1 Stale Data Without Inconsistency

```
Strategy: "labeled staleness, not hidden staleness"

IF portfolio cache age > 5s:
  show cached allocation WITH banner "Hace X segundos"
  DO NOT show per-wallet LIVE and portfolio STALE totals simultaneously without labels

IF recomputing live:
  replace entire portfolio card atomically
  never show member A updated + member B old in same total without MIXED_FRESHNESS flag
```

### 7.2 Flicker Prevention

```
P1: Portfolio total updates atomically (full card swap).
P2: Donut chart / allocation bars: debounce 500ms on member updates.
P3: Do not animate allocation % changes — crossfade or instant replace.
P4: Performance chart: immutable data points — append only, never mutate past points.
```

### 7.3 Snapshots vs Live on Portfolio Screen

| Screen section | Data type | User label |
|---|---|---|
| Total wealth header | Live aggregate | "Patrimonio total" + as of |
| Allocation breakdown | Live aggregate | Same asOf as header |
| Performance 30D | Snapshot-based | "Basado en capturas diarias" |
| Performance chart | Snapshot series | Date axis; no intraday |
| Member wallet lines | Per-wallet live | Individual state badges |

**Never mix:** snapshot-based performance number adjacent to live total without section separator and distinct labels.

### 7.4 Portfolio Screen Invariants

```
P1: portfolio.asOf = max(member.asOf) — always displayed.
P2: If any member DEGRADED, portfolio banner warns; member line shows badge.
P3: If any member UNKNOWN, exclude from total; show "X cuentas no disponibles".
P4: Total = sum(available members) — never include UNKNOWN members silently.
P5: Performance section never gates on live total freshness.
```

---

## 8. Broker State Presentation

### 8.1 Visibility Rules

| Condition | Broker data visible? | How |
|---|---|---|
| SIMULATED wallet | **Never** | N/A |
| BROKER_LINKED + LIVE | **Hidden** by default | "Última sync hace X" only |
| BROKER_LINKED + STALE | **Hidden** | Sync age label |
| BROKER_LINKED + DEGRADED | **Reference panel only** | Expandable "Ver datos del broker" |
| BROKER_LINKED + RECONCILING | **Hidden** | Spinner only |
| User taps "Ver detalles de sync" | **Reference panel** | Side-by-side with disclaimer |

### 8.2 Reference-Only Contract

```
Broker values MUST be presented with:
  - Label: "Reportado por [Binance/BingX/...]"
  - Timestamp: brokerReference.fetchedAt
  - Disclaimer: "Este valor puede diferir de tu registro interno"
  - Visual rank: secondary (smaller, muted, below primary)
  - Never: green/red PnL based on broker alone
```

### 8.3 Conflict Mode

```
IF DEGRADED AND brokerReference.divergesFromLedger:
  presentationState = DEGRADED
  primary column: "Tu registro" (ledger)
  secondary column: "Broker reporta" (reference)
  difference column: "Diferencia" (computed, labeled approximate)
  CTA: "Sincronizar ahora" → triggers sync
  NEVER: average of ledger and broker
  NEVER: broker as primary with ledger in footnote
```

---

## 9. User Experience Guarantee

### 9.1 Can the User See Two Contradictory Truths?

**Structured answer:**

| Situation | Two values visible? | Contradictory? | Mitigation |
|---|---|---|---|
| Same metric, same screen, same time | **FORBIDDEN** | — | Collapse rules |
| Ledger vs broker (DEGRADED) | Two values possible | Yes, if unlabeled | **Primary/secondary hierarchy** + disclaimer |
| Live total vs performance chart | Two values | No — different metrics | Section labels |
| Current balance vs pending order | Two values | No — different semantics | Separate UI sections |
| Wallet LIVE + portfolio STALE | Two freshness levels | Perceived inconsistency | Portfolio `asOf` label + banner |
| Historical vs current mode | Two values | No — user chose mode | Mode switch |

**Guarantee:**

> The user will **never** see two **unlabeled** values for the **same metric** in the **same context** without understanding which is authoritative.

### 9.2 Cognitive Confusion Prevention

| Technique | Application |
|---|---|
| **One primary column** | Ledger always left/main |
| **Explicit state badges** | LIVE / STALE / DEGRADED / RECONCILING / UNKNOWN |
| **Temporal labels** | Every total has "as of" |
| **Section separation** | Live wealth ≠ historical performance |
| **Pending isolation** | Orders never in balance |
| **Conservative UNKNOWN** | Hide rather than guess |
| **No averaging** | Never (ledger + broker) / 2 |
| **Sticky warnings** | DEGRADED doesn't flash |

### 9.3 Visual Priority Hierarchy

```
1. Presentation state badge (most salient if not LIVE)
2. Primary financial value (large)
3. "As of" temporal label (medium)
4. Warnings (medium)
5. Broker reference (small, collapsed)
6. Debug/metadata (never visible to user)
```

---

## 10. Final UX Contract

### 10.1 Core Promises

```
PROMISE 1: The user never sees raw system inconsistency.
           Internal tier conflicts are collapsed before display.

PROMISE 2: Only normalized UserFacingState is exposed to screens.
           Screens do not read ledger, broker, or cache directly.

PROMISE 3: Every financial number has a presentation state and temporal label.

PROMISE 4: Trading is blocked when presentation state is UNKNOWN, DEGRADED (broker), or RECONCILING (broker).

PROMISE 5: Broker data is never primary. Ledger is always the user's number.

PROMISE 6: Pending is never confirmed. Open orders never inflate balance.

PROMISE 7: Performance is never live. Charts are snapshot-based and labeled.

PROMISE 8: UNKNOWN hides numbers. Never show wrong numbers.
```

### 10.2 IF/THEN Contract (Presentation Boundary)

| ID | Rule |
|---|---|
| **U1** | IF `truth.state=corrupted` → THEN `presentationState=UNKNOWN`; suppress all values. |
| **U2** | IF `truth.state=degraded` → THEN `presentationState=DEGRADED`; show ledger values; block broker trading. |
| **U3** | IF `sync.inFlight=true` → THEN `presentationState=RECONCILING`; freeze display; block broker trading. |
| **U4** | IF `cache.age > 5s` AND `cache.age ≤ 60s` → THEN `presentationState=STALE`; show values with age label. |
| **U5** | IF `cache.age > 60s` AND BROKER_LINKED → THEN escalate to DEGRADED per sync policy. |
| **U6** | IF none of U1–U5 → THEN `presentationState=LIVE`. |
| **U7** | IF `presentationState=UNKNOWN` → THEN `allowTrading=false`. |
| **U8** | IF `presentationState=DEGRADED` AND `executionMode=BROKER_LINKED` → THEN `allowTrading=false`. |
| **U9** | IF `presentationState=RECONCILING` AND `executionMode=BROKER_LINKED` → THEN `allowTrading=false`. |
| **U10** | IF `presentationState ∈ {LIVE, STALE}` AND `executionMode=SIMULATED` → THEN `allowTrading=true`. |
| **U11** | IF broker reference shown → THEN must include disclaimer + fetchedAt; never as primary. |
| **U12** | IF portfolio query → THEN set `displayAsOf=max(member.asOf)`; show MIXED_FRESHNESS if spread > 5s. |
| **U13** | IF performance query → THEN use snapshots only; label "capturas diarias"; never live PnL in same card. |
| **U14** | IF open orders exist → THEN show in `pending` section; exclude from `display.totalValue`. |
| **U15** | IF instrument UNPRICED → THEN show "—" for line; reduce total by unpriced portion; warn "Precio no disponible". |
| **U16** | IF state transition → THEN atomic full-card swap; no partial numeric updates. |
| **U17** | IF late-imported trade → THEN show in history with eventTime; balance at truth.asOf includes it; optional "importado recientemente" on row. |
| **U18** | IF member wallet UNKNOWN in portfolio → THEN exclude from total; show count of unavailable accounts. |

### 10.3 Layer Stack (Complete)

```
┌─────────────────────────────────────────────────────────────┐
│  USER TRUTH (this document)                                 │
│  UserFacingState — normalized, labeled, non-contradictory   │
├─────────────────────────────────────────────────────────────┤
│  EXECUTION TRUTH MODEL                                      │
│  truth block in API — system truth metadata                 │
├─────────────────────────────────────────────────────────────┤
│  CONSISTENCY + FAILURE + BACKEND + DOMAIN                   │
│  Internal tiers, engines, invariants                        │
└─────────────────────────────────────────────────────────────┘
```

### 10.4 Client Implementation Contract

```
1. Client MUST NOT compute financial totals from raw API fields without TNE.
2. Client MUST render from UserFacingState object only.
3. Client MUST show presentationState badge when not LIVE.
4. Client MUST respect permissions.allowTrading for CTA state.
5. Client MUST NOT cache UserFacingState beyond server truth.asOf without STALE label.
6. Client SHOULD call TNE on server; MAY replicate TNE logic identically on client for offline.
```

---

## Appendix A — UserFacingState JSON Schema (Illustrative)

```json
{
  "presentationState": "LIVE",
  "display": {
    "cashBalance": { "amount": "52475.00", "currency": "USDT" },
    "totalValue": { "amount": "99975.00", "currency": "USDT" },
    "unrealizedPnL": { "amount": "0.00", "currency": "USDT" }
  },
  "pending": {
    "openOrders": []
  },
  "temporal": {
    "displayAsOf": "2026-07-02T23:45:00Z",
    "displayAsOfLabel": "Al momento"
  },
  "permissions": {
    "allowTrading": true,
    "allowDeposit": true,
    "allowWithdraw": true
  },
  "warnings": [],
  "badges": []
}
```

---

## Appendix B — State Transition Diagram

```
                    ┌──────────┐
         ┌─────────│  LIVE    │◄────────┐
         │         └────┬─────┘         │
         │              │ cache age     │ sync OK
         │              ▼               │
         │         ┌──────────┐         │
         │         │  STALE   │─────────┤
         │         └────┬─────┘         │
         │              │ sync overdue  │
         │              ▼               │
  SIMULATED only       ┌──────────┐     │
  trading OK ◄─────────│ DEGRADED │─────┘
         │             └────┬─────┘
         │                  │ corrupt
         │                  ▼
         │             ┌──────────┐
         └─────────────│ UNKNOWN  │
                       └──────────┘

  RECONCILING ──(sync done)──► LIVE or DEGRADED
       ▲
       └── sync started from any state
```

---

## Appendix C — Document Cross-Reference

| Topic | Source | This document |
|---|---|---|
| `truth` API block | EXECUTION_TRUTH §Appendix B | TNE input |
| Presentation states | CONSISTENCY §3 | §2 mapped to user |
| DEGRADED behavior | FAILURE_SIM §6.4 | §2.4, §8 |
| SSOT collapse | EXECUTION_TRUTH §4 | §4 |
| Portfolio skew | CONSISTENCY §3.3 | §7, U12 |
| Trading block | CONSISTENCY §9 O1 | §2.8, U7–U10 |

---

*End of document — USER_TRUTH_PRESENTATION_MODEL v1.0*
