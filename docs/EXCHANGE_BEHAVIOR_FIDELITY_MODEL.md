# Exchange Behavior Fidelity Model

**Version:** 1.0  
**Status:** Frozen — Real-market validation layer  
**Audience:** Backend engineers, broker integration team, SRE, architects  
**Scope:** How real exchanges behave vs how Cartera is designed to absorb that behavior.

**Authority chain:** Builds on all Cartera v1.0 contracts. Does not override them. Identifies gaps for v1.1+.

```
DOMAIN_MODEL.md
FINANCIAL_BACKEND_ARCHITECTURE.md
CONSISTENCY_MODEL.md
ARCHITECTURE_FAILURE_SIMULATION.md
EXECUTION_TRUTH_MODEL.md
USER_TRUTH_PRESENTATION_MODEL.md
EXCHANGE_BEHAVIOR_FIDELITY_MODEL.md  ← this document
```

**Central question:**

> ¿Este sistema se comporta correctamente cuando se conecta a mercados reales — no cuando todo funciona idealmente?

**Answer preview:** Cartera is **architecturally compatible** with real exchanges for **spot ledger + reconciliation**. It is **not yet fidelity-complete** for futures, margin, liquidations, or IBKR-class instruments without v1.1 extensions.

---

## Table of Contents

1. [Real Exchange Behavior Model](#1-real-exchange-behavior-model)
2. [Event Timing Reality](#2-event-timing-reality)
3. [Partial Fill Model](#3-partial-fill-model)
4. [Broker Discrepancy Model](#4-broker-discrepancy-model)
5. [API Failure Model](#5-api-failure-model)
6. [Real-Time vs Ledger Gap](#6-real-time-vs-ledger-gap)
7. [Market Edge Cases](#7-market-edge-cases)
8. [System Stress Alignment](#8-system-stress-alignment)
9. [Fidelity Score](#9-fidelity-score)
10. [Gap Analysis](#10-gap-analysis)

---

## 1. Real Exchange Behavior Model

### 1.1 Exchange Profiles (Observed Production Ranges)

| Behavior | Binance Spot | Binance Futures | BingX | IBKR |
|---|---|---|---|---|
| **REST latency (p50)** | 80–200 ms | 100–250 ms | 150–400 ms | 200–800 ms |
| **REST latency (p99)** | 500 ms–2 s | 1–5 s | 2–10 s | 5–30 s |
| **WebSocket latency** | 10–100 ms | 10–150 ms | 50–300 ms | 100–500 ms (TWS) |
| **Partial fills** | Common (large orders) | Very common | Common | Very common |
| **Order reject reasons** | MIN_NOTIONAL, LOT_SIZE, INSUFFICIENT_BALANCE, PRICE_FILTER | + MARGIN, REDUCE_ONLY, POSITION_SIDE | Similar to Binance | Buying power, halts, TIF |
| **Fill confirmation path** | WS `executionReport` + REST fallback | WS + REST `userTrades` | REST-heavy | Flex queries, delayed |
| **Duplicate events** | WS reconnect replay | Same | Same | Same |
| **Missing events** | Rare; REST backfill required | Funding events easy to miss | Moderate | Common without polling |
| **Position model** | Wallet balances (asset-based) | Net position + margin | Mixed spot/perp | Multi-leg, multi-currency |
| **Funding / interest** | N/A (spot) | Every 8h | Perpetual funding | Interest, dividends |
| **Corporate actions** | Rare (airdrops, delist) | Liquidations, ADL | Liquidations | Dividends, splits, mergers |
| **Rate limits** | 1200 weight/min (tiered) | Stricter | Variable | Pacing violations |
| **Clock skew** | Server time ±1s typical | Same | Same | Significant on batch |

### 1.2 Binance Spot — Behavioral Contract (External)

```
ORDER_SUBMIT → ACK (NEW) → [PARTIAL_FILL]* → FILLED | CANCELED | REJECTED
FILL_EVENT   → may arrive before REST order ACK on fast markets
BALANCE      → updated per fill, not per order ACK
TRADE_HISTORY→ available via /myTrades with tradeId (dedup key)
DEPOSITS     → on-chain confirmation delay (minutes to hours)
WITHDRAWALS  → fee deducted; may appear as separate balance movement
```

**Cartera mapping:** `TradeExecution` per fill (not per order). `externalRef = binance:trade:{tradeId}`. `CashMovement` for deposits/withdrawals.

### 1.3 Binance Futures — Behavioral Contract (External)

```
ORDER_SUBMIT → ACK → PARTIAL_FILL* → FILLED
POSITION     → net qty per symbol; side LONG/SHORT
MARGIN       → isolated or cross; not simple cash
FUNDING      → periodic CashAccrual (every 8h)
LIQUIDATION  → forced reduce; may produce multiple events
MARK_PRICE   → differs from last trade price
ADL          → counterparty liquidation events
```

**Cartera v1 gap:** No `positionSide`, no margin entity, no `CashAccrual` for funding in production path yet (modeled in DOMAIN_MODEL, not fully wired). **Fidelity: partial.**

### 1.4 BingX — Behavioral Contract (External)

```
Similar to Binance with:
  - Higher latency variance
  - Less reliable WebSocket
  - Mixed spot + perp under one API key
  - Copy-trading events (foreign to Cartera v1)
```

**Cartera mapping:** Same adapter pattern as Binance. Expect more REST polling, longer RECONCILING windows.

### 1.5 IBKR — Extreme Case

```
Multi-asset: equities, options, futures, forex, bonds
Execution:   partial fills over hours; combo orders
Settlement:  T+1/T+2; position ≠ cash timing
Corporate:   dividends, splits, spinoffs (CorporateAction required)
Reporting:   flex queries batch; not real-time
Options:     multi-leg; single order → multiple underlyings
```

**Cartera v1 gap:** Single `Broker` port insufficient. Requires capability sub-interfaces. **Fidelity: low for v1.**

### 1.6 API Inconsistency Patterns (All Exchanges)

| Pattern | Frequency | Example |
|---|---|---|
| WS ahead of REST | Common | Fill in stream before order visible in REST |
| REST ahead of WS | Common after reconnect | Historical trades missing from WS buffer |
| Duplicate tradeId | Rare | Reconnect replay |
| Balance ≠ sum(trades) | Frequent | Fees in different asset, unrealized PnL on futures |
| Position qty rounding | Always | stepSize rounding vs internal precision |
| Timestamp ms vs s | Occasional | Parser must normalize |
| Status enum drift | Version upgrades | `PARTIALLY_FILLED` vs `PARTIAL_FILLED` |

---

## 2. Event Timing Reality

### 2.1 Real Ordering (Not Ideal)

```
Ideal model:  order → fill → ledger append (instant, ordered)
Real model:   order ACK ─┬─ fill₁ (WS, T+50ms)
                         ├─ fill₂ (WS, T+200ms)   [partial]
                         ├─ REST poll sees fill₁ (T+500ms)
                         └─ fill₃ (WS, T+2s)      [late fragment]

Ledger sequence: assigned at IMPORT COMMIT time, not broker event time.
Broker event time: stored in entry.timestamp (informational).
```

**Rule (from EXECUTION_TRUTH):** `sequence` wins over `timestamp`. Late fills append at tail.

### 2.2 Late Fill Distribution (Production-Observed)

| Delay | Cause | Frequency |
|---|---|---|
| < 1 s | Normal WS | 95% |
| 1–60 s | WS lag, REST poll gap | 4% |
| 1–60 min | Reconnect, API outage | 0.9% |
| Hours–days | Full history re-sync, missed pagination | 0.1% |

**Cartera behavior:**

```
IF late fill imported:
  append at head sequence (now)
  entry.timestamp = broker trade time
  S_current at head = correct
  past snapshots = unchanged
  performance historical window = MAY_BE_REVISED (USER_TRUTH U17)
```

### 2.3 Duplicate Webhook / WS Events

```
Exchange sends: fill_id=12345 twice (reconnect)

Cartera:
  first:  append TradeExecution, externalRef=binance:trade:12345
  second: SKIP (B3, L3)
  money:  preserved
```

### 2.4 Missing Events

```
Exchange fails to deliver fill (WS gap)

Detection:
  - reconciliation: broker position ≠ ledger position
  - scheduled REST backfill: /myTrades since lastSyncCursor

Recovery:
  - import missing fills
  - IF still missing: DEGRADED + MANUAL_REVIEW
```

### 2.5 Out-of-Order Fills Cross Symbol

```
Fill BTC before ETH arrival order irrelevant:
  each instrument replays independently within same wallet ledger
  sequence is global per wallet (not per symbol)

Position projection:
  replays all entries; instrument filter applied in PositionEngine
  out-of-order cross-symbol: no corruption (entries commutative per symbol)
```

**Non-commutative case:** Same symbol sells before buy in sequence but buy eventTime earlier → **sequence order matters**, not eventTime. Correct by design.

---

## 3. Partial Fill Model

### 3.1 Fill Fragmentation

```
User order: BUY 1.0 BTC @ MARKET

Exchange execution:
  fill₁: 0.3 BTC @ 95000.00  fee 0.0003 BTC
  fill₂: 0.5 BTC @ 95001.50  fee 0.0005 BTC
  fill₃: 0.2 BTC @ 95002.00  fee 0.0002 BTC

Cartera ledger:
  3 × TradeExecution entries
  1 × Order entity (status transitions PARTIALLY_FILLED → FILLED)
  3 × Fill entities
  cash debited incrementally per fill
```

### 3.2 Domain Mapping

| Exchange concept | Cartera entity |
|---|---|
| Order | `Order` |
| Each execution | `Fill` + `TradeExecution` ledger entry |
| Order state machine | `Order.status` |
| Cumulative qty | Sum of fills; validated against order qty |
| Remaining qty | `order.quantity - sum(fills.quantity)` |

### 3.3 Price Drift Per Fill

```
Each TradeExecution carries its own price: Money
Position avgEntry = weighted average across fills (FIFO policy)
Unrealized PnL = mark-to-market on net qty

NOT: single price for whole order (unless LIMIT fully filled at limit)
```

### 3.4 Real Order Lifecycle State Machine

```
                    ┌──────────┐
                    │ PENDING  │  (submitted to broker, no ACK)
                    └────┬─────┘
                         │ broker ACK
                         ▼
                    ┌──────────┐
         ┌─────────│   NEW    │─────────┐
         │         └────┬─────┘         │
         │              │               │
    reject/cancel   partial fill    full fill
         │              │               │
         ▼              ▼               ▼
    ┌─────────┐  ┌──────────────┐  ┌─────────┐
    │REJECTED │  │PARTIALLY_    │  │ FILLED  │
    │CANCELLED│  │FILLED        │  └─────────┘
    └─────────┘  └──────┬───────┘
                        │ more fills
                        ▼
                   ┌─────────┐
                   │ FILLED  │
                   └─────────┘
```

**Cartera rules:**

```
R1: Ledger entry created ONLY on fill, never on order ACK.
R2: PENDING/NEW orders do NOT affect cash or position (S_pending).
R3: PARTIALLY_FILLED: cash/position reflect confirmed fills only.
R4: CANCELLED with partial: ledger has partial fills; order terminal.
R5: REJECTED: no ledger entries; no cash movement.
```

### 3.5 Partial Fill + User Truth

```
USER_TRUTH:
  display.cash     = ledger confirmed only
  pending.openOrders = includes order with filledQty / remainingQty
  presentationState = LIVE during partial (fills confirmed)
  NEVER: show full order notional as spent until filled
```

---

## 4. Broker Discrepancy Model

### 4.1 Discrepancy Taxonomy

| Type | Example | Severity |
|---|---|---|
| **D1 — Rounding** | Broker qty 0.09999999 vs ledger 0.1 | Low (tolerance) |
| **D2 — Fee asset** | Fee charged in BNB, not USDT | Medium (CashAccrual) |
| **D3 — Timing** | Broker balance updated; fill not yet imported | Medium (transient) |
| **D4 — Missing fill** | Position diff = one trade | High |
| **D5 — Missing funding** | Cash diff on futures | High |
| **D6 — Phantom broker position** | Broker shows position; no fills | Critical |
| **D7 — Stale WS** | WS position old; REST differs | Medium |

### 4.2 Tolerance Policy

```
DEFAULT_TOLERANCE = {
  cash: Money(0.01, USDT),           // absolute
  quantity: stepSize for instrument,   // per symbol
  percentValue: 0.01%                // optional secondary
}

IF discrepancy within tolerance:
  resolution = ACCEPTED
  wallet.status = active

IF discrepancy outside tolerance AND importable:
  import missing entries
  re-reconcile

ELSE:
  resolution = MANUAL_REVIEW
  wallet.status = DEGRADED
```

### 4.3 Resolution Rules (Deterministic)

| Discrepancy | Resolution | Ledger modified? |
|---|---|---|
| D1 rounding | AUTO_ACCEPT | No |
| D2 fee in alt asset | Import `CashAccrual` or `TradeExecution` with fee field | Append |
| D3 timing (sync in flight) | WAIT; re-reconcile after sync | No |
| D4 missing fill | Import from REST `myTrades` | Append |
| D5 missing funding | Import `CashAccrual` | Append |
| D6 phantom position | MANUAL_REVIEW; never overwrite ledger | No |
| D7 stale WS | Force REST sync; discard WS snapshot | Append if new fills |

**Absolute rule:** Broker position NEVER overwrites ledger. Only append missing events.

### 4.4 Delayed Sync Reconciliation Timeline

```
T+0s:   user trades on Binance externally (outside app)
T+30s:  app sync scheduled
T+31s:  RECONCILING (freeze display)
T+35s:  import 3 fills
T+36s:  reconcile → OK → LIVE
        OR reconcile → FAIL → DEGRADED

Max acceptable RECONCILING display: 30s (p99 target)
Hard timeout: 120s → DEGRADED if incomplete
```

### 4.5 Stale WebSocket State

```
WS shows: BTC position 0.5
REST shows: BTC position 0.7

Policy:
  1. WS is hint only, never SSOT
  2. On reconcile: REST wins for detection
  3. Ledger wins for app truth after import
  4. Import delta 0.2 BTC via missing fills
  5. Invalidate WS cache
```

---

## 5. API Failure Model

### 5.1 Failure Scenarios and System Behavior

| Failure | Exchange behavior | Cartera behavior | User presentation |
|---|---|---|---|
| **Rate limit 429** | Request rejected, `Retry-After` | Exponential backoff; extend RECONCILING; no ledger change | "Sincronizando…" |
| **WS disconnect** | Gap in events | REST backfill on reconnect; dedup imports | STALE → RECONCILING |
| **API timeout mid-order** | Unknown if order placed | **Idempotent:** query `clientOrderId` / `brokerOrderId` before retry; never double-submit | "Verificando orden…" |
| **Timeout after fill** | Fill may exist | Poll fills by `clientOrderId`; import if found | LIVE after confirm |
| **Inconsistent retry** | Duplicate order if no idempotency | `clientOrderId` unique per wallet; broker idempotency key | No duplicate UI |
| **Partial HTTP response** | Truncated JSON | Retry; no cursor advance | RECONCILING continues |
| **Auth expiry** | 401 | Connection → DEGRADED; block trading | "Reconectar cuenta" |
| **Maintenance mode** | 503 | Sync fails; DEGRADED after threshold | Warning banner |
| **IP ban** | 418 (Binance) | Halt sync; alert ops | DEGRADED |

### 5.2 Mid-Trade Timeout State Machine

```
PlaceOrder sent
    │
    ├─ ACK received → normal path
    │
    ├─ Timeout (no ACK)
    │     → query OrderStatus(clientOrderId)
    │         ├─ FILLED → import fills → LIVE
    │         ├─ NEW/PARTIAL → track order; poll
    │         ├─ NOT_FOUND → safe to retry (same clientOrderId)
    │         └─ UNKNOWN → DEGRADED; block new orders until resolved
    │
    └─ Error response → REJECTED; no ledger entry
```

### 5.3 Rate Limit Strategy

```
ON 429:
  1. Do NOT append ledger
  2. Do NOT advance sync cursor
  3. Backoff: min(Retry-After, exponential cap 60s)
  4. Retry same batch
  5. IF rate limit persists > 15 min → DEGRADED
```

---

## 6. Real-Time vs Ledger Gap

### 6.1 Truth Phases During Execution

| Phase | Name | Truth owner | User sees |
|---|---|---|---|
| **T0** | Intent | None (command in flight) | Loading on CTA |
| **T1** | Broker ACK | Broker (ephemeral) | "Orden enviada" |
| **T2** | First fill | Ledger (on commit) | Updated balance (atomic) |
| **T3** | Partial | Ledger (cumulative fills) | Partial fill indicator |
| **T4** | Complete | Ledger (all fills) | LIVE |
| **T5** | Reconciled | Ledger confirmed vs broker | LIVE or DEGRADED |

### 6.2 Definitions

```
"Truth while executing" = S_pending (order submitted, no confirmed fills)
                        → User Truth: pending section only; balance unchanged

"Truth after confirmation" = S_confirmed (each fill committed to ledger)
                        → User Truth: display.* updated atomically per fill batch
```

### 6.3 Acceptable Delay Budgets

| Transition | Acceptable delay (p99) | Degrade threshold |
|---|---|---|
| Order submit → ACK | 2 s | 10 s → show warning |
| ACK → first fill | 5 s (market) | 30 s → "orden pendiente" |
| Fill → ledger commit | 500 ms (internal) | 5 s → internal alert |
| Trade → sync visibility (BROKER_LINKED) | 60 s | 15 min → DEGRADED |
| WS tick → display price update | 5 s | 60 s → STALE price label |

### 6.4 UI Degradation Triggers (from USER_TRUTH)

```
IF sync.inFlight > 30s           → RECONCILING
IF lastSyncAge > 15 min          → DEGRADED (BROKER_LINKED)
IF order unresolved > 60s        → warning on pending order
IF reconciliation unresolved     → DEGRADED
IF CORRUPTED                     → UNKNOWN
```

---

## 7. Market Edge Cases

### 7.1 Edge Case Catalog

| Case | Exchange behavior | Cartera v1 behavior | Gap |
|---|---|---|---|
| **Flash crash** | Fills at extreme prices | Records actual fill prices; unrealized PnL swings | OK |
| **Zero liquidity** | Order rests unfilled or partial | Order stays PARTIALLY_FILLED; ledger = fills only | OK |
| **Spread explosion** | Market order slippage | Each fill at actual price | OK |
| **Halted market** | Order rejected | REJECTED; no ledger | OK |
| **Negative funding** | Periodic debit | `CashAccrual` negative | Modeled; import path required |
| **Liquidation cascade** | Forced closes, ADL | Multiple `TradeExecution` + possible `CorporateAction` | **Partial** — no margin model |
| **Delisting** | Asset frozen | `CorporateAction` or manual | Modeled |
| **Airdrop** | Free asset credit | `CorporateAction` AIRDROP | Modeled |
| **Stablecoin depeg** | Mark price anomaly | Pricing marks holdings; user sees UNPRICED or stale | OK with flags |
| **INSUFFICIENT_MARGIN** | Order rejected pre-trade | Trading Engine rejects; broker also rejects | **Gap** on futures margin calc |
| **Self-trade prevention** | Cancel/reject | REJECTED | OK |
| **MIN_NOTIONAL** | Reject | REJECTED before broker if validated; else broker reject | OK |

### 7.2 Flash Crash — End-to-End

```
Market: BTC drops 20% in 60s
User: holds 1 BTC; MARKET SELL submitted

Exchange: fill at 76000 (slippage)
Ledger:   TradeExecution SELL @ 76000
Position: 0 BTC
Cash:     credited

User Truth: atomic update; LIVE
Portfolio: next query reflects new total
Snapshot: next daily capture records crash exposure

No special casing required. System records facts.
```

### 7.3 Liquidation (Futures) — Gap

```
Exchange: position force-closed; multiple events; insurance fund

Cartera v1:
  CAN import as TradeExecution + CashAccrual
  CANNOT model margin requirement pre-liquidation
  CANNOT predict liquidation risk

Required v1.1: Exposure entity with margin, mark price, liquidation price
```

---

## 8. System Stress Alignment

### 8.1 CONSISTENCY_MODEL vs Real Exchanges

| Consistency rule | Real exchange aligns? | Stress result |
|---|---|---|
| Per-wallet serial order | Yes (single account stream) | **PASS** |
| sequence > timestamp | Yes (imports commit out of event order) | **PASS** |
| Broker SSOT at sync boundary only | Yes (exchanges are eventually consistent) | **PASS** |
| Portfolio eventual ≤60s | Yes (users expect near-real-time) | **PASS** with labeling |
| Snapshot not retroactive | Yes (exchanges don't revise statements) | **PASS** |
| Strong cross-wallet portfolio | No (exchanges don't guarantee) | **PASS** — labeled `portfolio.asOf` |

### 8.2 EXECUTION_TRUTH vs Broker Reality

| Truth rule | Broker reality | Alignment |
|---|---|---|
| Ledger final SSOT | Exchanges have their own ledger; diverge | **ALIGNED** via reconciliation |
| Broker never overwrites | Exchanges expect reconciliation not blind trust | **ALIGNED** |
| S_pending ≠ truth | Exchange has pending orders too | **ALIGNED** |
| Late events at tail | Exchanges deliver late | **ALIGNED** |
| Fill = ledger unit | Exchanges bill per execution | **ALIGNED** |
| Futures margin truth | Exchange has complex margin | **MISALIGNED** v1 |

### 8.3 USER_TRUTH vs Latency Reality

| UX rule | Latency reality | Alignment |
|---|---|---|
| RECONCILING freeze 30s | Sync may take 5–120s | **TIGHT** — may need 120s hard cap |
| STALE at 5s | WS prices faster; REST slower | **ALIGNED** for balances |
| Broker reference hidden in LIVE | Correct — user doesn't need broker view | **ALIGNED** |
| DEGRADED blocks trading | Correct when reconciliation fails | **ALIGNED** |
| Never show unlabeled dual truth | Exchanges always have dual view internally | **ALIGNED** via collapse |

### 8.4 Detected Cross-Document Divergences

| ID | Divergence | Risk | Resolution |
|---|---|---|---|
| X1 | DOMAIN allows futures; Position is long-only v1 | Liquidation wrong | v1.1 Exposure model |
| X2 | USER_TRUTH RECONCILING freeze vs 120s sync | UX stuck | Extend freeze max; show progress |
| X3 | CONSISTENCY 15min DEGRADED vs Binance WS-only users | False DEGRADED | Configurable per broker |
| X4 | IBKR in broker table; port insufficient | False confidence | Mark IBKR Phase 5+ only |
| X5 | Fee in non-base asset | Cash drift | Import fee as separate CashAccrual |
| X6 | Performance MAY_BE_REVISED not in USER_TRUTH screens | User confusion on late fills | Add U17 to performance section |

---

## 9. Fidelity Score

Scoring: **10 = production-identical behavior**, **0 = broken on contact with real exchange**.

| Module | Score | Justification |
|---|---|---|
| **Ledger** | **9/10** | Append-only, per-fill entries, dedup, late events — matches exchange trade history model. −1: fee-in-alt-asset edge cases need hardening. |
| **Execution** | **7/10** | Order/fill lifecycle correct for spot. −3: no mid-trade broker query standard; futures margin missing. |
| **Portfolio** | **8/10** | Correctly eventual; doesn't fight exchange real-time. −2: no intraday performance for active traders. |
| **Broker abstraction** | **6/10** | Single port works for Binance/BingX spot. −4: futures, IBKR, multi-subaccount not covered. |
| **Reconciliation** | **8/10** | DEGRADED + no overwrite is exchange-grade. −2: tolerance tuning per broker; funding import immature. |
| **UX truth layer** | **8/10** | Collapse rules match latency reality. −2: RECONCILING duration vs slow sync; performance late-fill labeling. |
| **Partial fills** | **9/10** | Fill-per-ledger-entry is exchange-faithful. −1: cancel-replace not modeled. |
| **Event timing** | **9/10** | sequence-at-import is industry standard. −1: no backdated sequence for forensic import. |
| **API failure handling** | **7/10** | Idempotency + cursor + dedup specified. −3: not all paths implemented until Phase 5. |
| **Market edge (futures)** | **4/10** | Spot OK; futures liquidation/funding/ADL immature. |

### Overall Fidelity

```
┌────────────────────────────────────────────────────────────┐
│  BINANCE SPOT / BINGX SPOT:     8/10 — production-viable   │
│  BINANCE FUTURES:               5/10 — requires v1.1     │
│  IBKR:                          3/10 — Phase 5+ scope     │
│  OVERALL SYSTEM:                7.5/10                   │
│                                                            │
│  Verdict: Architecture survives real exchanges for SPOT.   │
│  Does NOT yet "function identically" to futures/IBKR.      │
└────────────────────────────────────────────────────────────┘
```

### Does It Work Like a Real Exchange?

| Question | Answer |
|---|---|
| Same ledger semantics as exchange trade history? | **Yes** (per-fill, immutable) |
| Same order lifecycle? | **Mostly** (missing replace, OCO) |
| Same real-time feel? | **No** — Cartera is sync + reconcile, not colocated matching engine |
| Same margin/liquidation? | **No** v1 |
| Same reconciliation burden? | **Yes** — explicitly modeled (exchanges require this) |
| Same user trust model? | **Better** — single labeled truth vs exchange UI chaos |

**Cartera is not an exchange.** It is a **portfolio system that ingests exchange behavior**. Fidelity means **correct absorption**, not **identical operation**.

---

## 10. Gap Analysis

### 10.1 System Parts That Don't Exist on Real Exchanges

| Cartera concept | Exchange equivalent | Notes |
|---|---|---|
| `Portfolio` analytical lens | Portfolio trackers (Blockfolio, etc.) | Exchanges don't aggregate cross-venue |
| `InventoryAccount` / holdings | Not on exchange | Off-platform assets |
| `PositionCheckpoint` | Internal optimization | Exchange has own position cache |
| `ReconciliationReport` | Internal ops tool | Exchange IS the source — no reconcile |
| `UserFacingState` / presentation collapse | Exchange shows raw states | Exchange UIs often confusing |
| `SIMULATED` / PaperBroker | Exchange testnet | Testnet is separate environment |
| Multi-wallet per user | Single exchange account | Cartera aggregates many |

### 10.2 Exchange Parts NOT Modeled in v1

| Exchange feature | Risk if ignored | Priority |
|---|---|---|
| Margin / leverage | Wrong buying power; no liquidation warning | P0 for futures |
| Position side (LONG/SHORT) | Inverted position | P0 for futures |
| Funding rate (8h) | Cash drift | P1 futures |
| Liquidation / ADL events | Missing trades | P1 futures |
| Order replace / amend | Duplicate orders on retry | P1 |
| OCO / bracket orders | Unsupported order types | P2 |
| Sub-accounts (Binance) | Wrong wallet mapping | P1 |
| Earn / staking locks | Balance unavailable | P2 |
| Withdrawal pending state | Cash appears wrong | P1 |
| Tax lots / wash sales | Wrong cost basis | P2 |
| Options multi-leg | Cannot import | P3 IBKR |
| Settlement lag (T+2) | Cash ≠ position timing | P2 IBKR |
| Copy trading (BingX) | Foreign trades appear | P2 |

### 10.3 Production Risks Not Fully Covered by v1 Docs

| Risk | Likelihood | Impact | Mitigation status |
|---|---|---|---|
| User trades on exchange mobile app; app unaware until sync | High | Medium | Sync interval + DEGRADED |
| Fee deducted in BNB not modeled | High | Low cash drift | CashAccrual — needs import |
| Pagination miss on full history sync | Medium | High position error | fullHistory + cursor |
| clientOrderId collision across devices | Low | High duplicate | unique per wallet |
| WS reconnect storm duplicates | Medium | Low | externalRef dedup ✓ |
| Flash crash + pending market order | Low | High slippage display | OK (records fact) |
| Exchange maintenance during order | Medium | Medium | timeout state machine ✓ |
| Regulatory delist stranding asset | Low | Medium | CorporateAction |
| User expects instant portfolio update | High | Low cognitive | USER_TRUTH labeling ✓ |
| Futures liquidation not understood by user | Medium | High trust | **GAP** — needs v1.1 UX |

### 10.4 v1.1 Fidelity Roadmap (Documentation Only)

| Item | Closes gap |
|---|---|
| `Exposure` entity (side, margin, mark) | Futures fidelity |
| `BrokerCapabilities` sub-port | IBKR, futures |
| Fee-in-alt-asset import spec | Cash drift |
| Withdrawal pending `CashMovement` state | Balance accuracy |
| Order amend/replace lifecycle | Order fidelity |
| Sub-account → wallet mapping | Binance multi-product |
| Performance late-fill recapture job | X6 divergence |
| Configurable sync/DEGRADED thresholds per broker | X3 divergence |

---

## Appendix A — Simulated Day: Binance Spot User

```
08:00  Scheduled sync → 0 new fills → LIVE
09:15  User MARKET BUY 0.5 BTC via app
       T+0.1s  order ACK
       T+0.3s  fill₁ 0.2 BTC → ledger seq 45 → display atomic update → LIVE
       T+0.5s  fill₂ 0.3 BTC → ledger seq 46 → display update → LIVE
10:00  User trades on Binance mobile (outside app) SELL 0.1 BTC
10:30  Scheduled sync → import fill → seq 47 → reconcile OK → LIVE
12:00  WS disconnect → REST backfill → no new fills → STALE 2min → LIVE
14:00  Deposit 1000 USDT on-chain
14:45  Sync detects deposit → CashMovement DEPOSIT → seq 48 → LIVE
18:00  Daily snapshot capture → asOfSequence 48
23:00  Portfolio performance query → snapshot-based → "capturas diarias"

Failures absorbed: partial fill, external trade, WS gap, deposit delay
User never sees: contradictory balance, unlabeled broker value
```

---

## Appendix B — Simulated Failure: Sync During Volatility

```
16:00  Market volatile; user places MARKET BUY
16:00  Sync starts (scheduled)
       → lock acquired by sync (if trade-first: trade wins per CONCURRENCY)
16:00  Trade completes → seq 50
16:01  Sync imports 2 external fills → seq 51, 52
16:02  Reconcile: rounding diff 0.00001 BTC → AUTO_ACCEPT
16:02  LIVE

Alternative:
16:00  Sync holds lock
16:00  Trade waits → SYNC_IN_PROGRESS at 10s
16:01  Sync completes
16:01  Trade proceeds → LIVE

Money: preserved in both paths
```

---

## Appendix C — Document Cross-Reference

| Topic | Primary doc | This doc section |
|---|---|---|
| Broker SSOT | EXECUTION_TRUTH §6.4 | §4, §6 |
| Partial fills | DOMAIN §2.9–2.11 | §3 |
| Reconciliation | FAILURE_SIM §6.4 | §4 |
| Presentation freeze | USER_TRUTH §6 | §6.4 |
| Idempotency | CONSISTENCY §5.3 | §2.3, §5 |
| Futures gap | DOMAIN §12 limitations | §1.3, §7.3, §10 |

---

## Appendix D — Fidelity Test Scenarios (Pre-Production)

Mandatory before BROKER_LINKED production:

- [ ] Partial fill 3 fragments → 3 ledger entries, 1 order FILLED
- [ ] Duplicate WS fill event → 1 entry
- [ ] Late fill 24h → append tail; head correct
- [ ] External trade on mobile → sync imports
- [ ] WS disconnect + REST backfill → no missing fills
- [ ] Rate limit 429 → backoff, no cursor advance
- [ ] Order timeout → query before retry
- [ ] Fee in BNB → cash correct via accrual
- [ ] Reconcile rounding → AUTO_ACCEPT
- [ ] Reconcile material → DEGRADED, orders blocked
- [ ] Deposit on-chain delay → CashMovement on detection
- [ ] Flash crash fill → extreme price recorded correctly

---

*End of document — EXCHANGE_BEHAVIOR_FIDELITY_MODEL v1.0*
