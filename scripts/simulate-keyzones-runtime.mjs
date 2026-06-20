/**
 * Simulates Home key-zones runtime branches without React.
 * Usage: node scripts/simulate-keyzones-runtime.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(relativePath) {
  const full = path.join(root, relativePath).replace(/\\/g, "/");
  return import(full);
}

function legacyZonesFromRaw(raw) {
  const formatUsdPrice = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };
  const callWall = raw?.levels?.callWall ?? null;
  const putWall = raw?.levels?.putWall ?? null;
  return [
    { label: "CALL WALL", price: callWall ? formatUsdPrice(callWall) : "—", type: "resistance", distance: "—" },
    { label: "PUT WALL", price: putWall ? formatUsdPrice(putWall) : "—", type: "support", distance: "—" },
  ];
}

function printAudit(title, audit) {
  console.log(`\n=== ${title} ===`);
  console.log(`source: ${audit.source}`);
  console.log(`hasSnapshot: ${audit.hasSnapshot}`);
  console.log(`hasData: ${audit.hasData}`);
  console.log(`hasMicro: ${audit.hasMicro}`);
  console.log(`hasMacro: ${audit.hasMacro}`);
  console.log(`shouldUseV2: ${audit.shouldUseV2}`);
  console.log(`stableBranch: ${audit.stableBranch}`);
  console.log(`zoneCount: ${audit.zoneCount}`);
  console.log(`labels: ${JSON.stringify(audit.labels)}`);
}

async function main() {
  const { parseMobileMarketStateV2Snapshot } = await loadModule(
    "./lib/market-state/parseV2Snapshot.ts",
  );
  const { selectKeyZonesForScope } = await loadModule("./lib/market-state/keyZoneSelectors.ts");
  const { resolveMarketStateSource } = await loadModule("./lib/market-state/fallbackPolicy.ts");
  const { buildKeyZonesRuntimeAudit } = await loadModule("./lib/market-state/keyZonesRuntimeAudit.ts");

  const fixture = JSON.parse(
    readFileSync(
      path.join(root, "lib/market-state/__tests__/fixtures/mobileMarketStateV2.real.sanitized.json"),
      "utf8",
    ),
  );
  const snapshot = parseMobileMarketStateV2Snapshot(fixture);
  const legacyRaw = {
    levels: { callWall: snapshot.data.macro.callWall.value, putWall: snapshot.data.macro.putWall.value },
  };
  const legacyZones = legacyZonesFromRaw(legacyRaw);

  const source = resolveMarketStateSource({
    v2FeatureEnabled: true,
    sessionStatus: "authenticated",
    v2Data: snapshot,
    v2IsLoading: false,
    v2ErrorCode: null,
    legacyEnabled: true,
  });

  const scenarios = [
    {
      name: "A) no snapshot",
      marketStateSource: "legacy",
      hasSnapshot: false,
      data: null,
      micro: null,
      macro: null,
      mode: "Macro",
    },
    {
      name: "C) snapshot but gate false via missing macro",
      marketStateSource: source,
      hasSnapshot: true,
      data: snapshot,
      micro: snapshot.data.micro,
      macro: null,
      mode: "Macro",
    },
    {
      name: "D) legacy branch with snapshot present but gate off",
      marketStateSource: "legacy",
      hasSnapshot: true,
      data: snapshot,
      micro: snapshot.data.micro,
      macro: snapshot.data.macro,
      mode: "Macro",
      forceGateOff: true,
    },
    {
      name: "EXPECTED v2 Macro",
      marketStateSource: source,
      hasSnapshot: true,
      data: snapshot,
      micro: snapshot.data.micro,
      macro: snapshot.data.macro,
      mode: "Macro",
    },
    {
      name: "EXPECTED v2 Micro",
      marketStateSource: source,
      hasSnapshot: true,
      data: snapshot,
      micro: snapshot.data.micro,
      macro: snapshot.data.macro,
      mode: "Micro",
    },
  ];

  for (const scenario of scenarios) {
    const hasData = Boolean(scenario.data);
    const hasMicro = Boolean(scenario.micro);
    const hasMacro = Boolean(scenario.macro);
    const shouldUseV2 = scenario.forceGateOff ? false : hasData && hasMicro && hasMacro;
    const zones = shouldUseV2
      ? selectKeyZonesForScope({
          mode: scenario.mode,
          micro: scenario.micro,
          macro: scenario.macro,
          spot: snapshot.data.asset.spot.value,
        })
      : legacyZones;
    const audit = buildKeyZonesRuntimeAudit({
      marketStateSource: scenario.marketStateSource,
      hasSnapshot: scenario.hasSnapshot,
      hasData,
      hasMicro,
      hasMacro,
      shouldUseV2,
      stableBranch: shouldUseV2 ? "v2-selector" : "legacy-fallback",
      zones,
      mode: scenario.mode,
    });
    printAudit(scenario.name, audit);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
