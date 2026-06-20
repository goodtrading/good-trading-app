import { getV2PipelineFetchId } from "./v2SnapshotPipelineLog";

type PayloadRecord = Record<string, unknown>;

const MICRO_NESTED_BLOCKS = [
  "context",
  "horizon",
  "gamma",
  "marketState",
  "bias",
  "risk",
  "scenarios",
  "optionsStructure",
  "quality",
] as const;

const MACRO_NESTED_BLOCKS = [...MICRO_NESTED_BLOCKS] as const;

const EXPECTED_FIELD_SEARCH: Record<string, string[]> = {
  "micro.localGammaFlip": [
    "localGammaFlip",
    "localFlip",
    "gammaFlip",
    "flip",
    "flipLevel",
    "flipPoint",
  ],
  "macro.globalGammaFlip": ["globalGammaFlip", "globalFlip", "gammaFlip", "flip", "flipLevel", "flipPoint"],
  "macro.callWall": ["callWall", "call_wall", "callwall"],
  "macro.putWall": ["putWall", "put_wall", "putwall"],
  "macro.dealerPivot": ["dealerPivot", "pivot", "dealer_pivot"],
  "macro.dominantExpiry": ["dominantExpiry", "dominant_expiry", "expiry", "expiration"],
  "micro.totalGex": ["totalGex", "total_gex", "gex", "netGamma", "net_gamma"],
  "macro.totalGex": ["totalGex", "total_gex", "gex", "netGamma", "net_gamma"],
  "micro.nearbyMagnets": ["nearbyMagnets", "magnets", "structuralMagnets", "magnet"],
  "macro.structuralMagnets": ["structuralMagnets", "magnets", "nearbyMagnets", "magnet"],
  "micro.nearbyPockets": ["nearbyPockets", "pockets", "shortGammaPockets", "pocket", "gammaPocket"],
  "macro.shortGammaPockets": ["shortGammaPockets", "pockets", "nearbyPockets", "pocket", "gammaPocket"],
  "micro.baseIntradayScenario": ["baseIntradayScenario", "intradayScenario", "scenario", "baseScenario"],
  "macro.structuralScenarios": ["structuralScenarios", "scenarios", "macroScenario"],
  "macro.tailScenarios": ["tailScenarios", "volScenario", "tail"],
  "micro.localRegime": ["localRegime", "regime", "gammaRegime", "marketRegime"],
  "macro.globalRegime": ["globalRegime", "regime", "gammaRegime", "marketRegime"],
};

function isDevRuntime(): boolean {
  return typeof __DEV__ === "undefined" ? process.env.NODE_ENV !== "production" : Boolean(__DEV__);
}

function devOnly(fn: () => void): void {
  if (isDevRuntime()) fn();
}

function asRecord(value: unknown): PayloadRecord | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as PayloadRecord;
}

function normalizeKey(key: string): string {
  return key.replace(/[_-]/g, "").toLowerCase();
}

function keyMatchesSearch(key: string, terms: string[]): boolean {
  const normalized = normalizeKey(key);
  return terms.some((term) => {
    const normalizedTerm = normalizeKey(term);
    return normalized === normalizedTerm || normalized.includes(normalizedTerm);
  });
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[max-depth]";
  if (Array.isArray(value)) {
    return value.slice(0, 3).map((item) => sanitizeValue(item, depth + 1));
  }
  const record = asRecord(value);
  if (!record) return String(value);
  const out: PayloadRecord = {};
  for (const [key, child] of Object.entries(record).slice(0, 20)) {
    out[key] = sanitizeValue(child, depth + 1);
  }
  if (Object.keys(record).length > 20) {
    out["..."] = `[+${Object.keys(record).length - 20} keys]`;
  }
  return out;
}

type PathHit = {
  path: string;
  key: string;
  sample: unknown;
};

function collectPathHits(
  value: unknown,
  terms: string[],
  currentPath = "",
  hits: PathHit[] = [],
  depth = 0,
): PathHit[] {
  if (depth > 8 || hits.length >= 12) return hits;

  const record = asRecord(value);
  if (record) {
    for (const [key, child] of Object.entries(record)) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      if (keyMatchesSearch(key, terms)) {
        hits.push({ path: nextPath, key, sample: sanitizeValue(child, depth + 1) });
      }
      collectPathHits(child, terms, nextPath, hits, depth + 1);
    }
    return hits;
  }

  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((item, index) => {
      collectPathHits(item, terms, `${currentPath}[${index}]`, hits, depth + 1);
    });
  }

  return hits;
}

function pickBestHit(scope: "micro" | "macro", expectedPath: string, hits: PathHit[]): string {
  if (hits.length === 0) return "NOT_FOUND";
  const scoped = hits.filter((hit) => hit.path.startsWith(`${scope}.`));
  const pool = scoped.length > 0 ? scoped : hits;
  const exact = pool.find((hit) => {
    const leaf = hit.path.split(".").pop() ?? hit.key;
    const terms = EXPECTED_FIELD_SEARCH[expectedPath] ?? [];
    return terms.some((term) => normalizeKey(leaf) === normalizeKey(term));
  });
  return (exact ?? pool[0]).path;
}

function logNestedBlock(scope: "micro" | "macro", block: string, value: unknown, fetchId: number | null): void {
  const keys = asRecord(value) ? Object.keys(value as PayloadRecord) : Array.isArray(value) ? ["[array]"] : null;
  devOnly(() => {
    console.log(`[V2 PRODUCTION STRUCTURE] ${scope}.${block} keys:`, keys);
    console.log(`[V2 PRODUCTION SAMPLE] ${scope}.${block}:`, sanitizeValue(value));
  });
  void fetchId;
}

function buildTreeLines(scope: "micro" | "macro", payload: PayloadRecord, fetchId: number | null): string[] {
  const scopeValue = asRecord(payload[scope]);
  if (!scopeValue) return [`${scope}: null`];

  const lines: string[] = [`${scope}:`];
  for (const block of scope === "micro" ? MICRO_NESTED_BLOCKS : MACRO_NESTED_BLOCKS) {
    const blockValue = scopeValue[block];
    const keys = objectKeys(blockValue);
    const type = Array.isArray(blockValue) ? `array(${blockValue.length})` : typeof blockValue;
    lines.push(`  ${block}: ${type}${keys ? ` keys=${JSON.stringify(keys)}` : ""}`);
    if (asRecord(blockValue)) {
      for (const nestedKey of keys ?? []) {
        const nestedValue = (blockValue as PayloadRecord)[nestedKey];
        const nestedType = Array.isArray(nestedValue)
          ? `array(${nestedValue.length})`
          : typeof nestedValue;
        lines.push(`    ${block}.${nestedKey}: ${nestedType}`);
      }
    }
  }
  void fetchId;
  return lines;
}

function objectKeys(value: unknown): string[] | null {
  const record = asRecord(value);
  return record ? Object.keys(record) : null;
}

function resolveContractVerdict(payload: PayloadRecord): "A" | "B" | "C" | "B+C" {
  const microKeys = objectKeys(payload.micro) ?? [];
  const hasFlatMicro = "localGammaFlip" in (asRecord(payload.micro) ?? {});
  const hasNestedMicro = microKeys.includes("gamma") && microKeys.includes("optionsStructure");

  if (hasFlatMicro) return "C";
  if (hasNestedMicro) return "B+C";
  if (microKeys.length > 0) return "A";
  return "A";
}

export function auditProductionPayloadStructure(payload: unknown, fetchId: number | null = null): void {
  const root = asRecord(payload);
  if (!root) return;

  const resolvedFetchId = fetchId ?? getV2PipelineFetchId();

  devOnly(() => {
    console.log("[V2 PRODUCTION TREE] fetchId:", resolvedFetchId, "begin");
    for (const line of buildTreeLines("micro", root, resolvedFetchId)) {
      console.log(`[V2 PRODUCTION TREE] ${line}`);
    }
    for (const line of buildTreeLines("macro", root, resolvedFetchId)) {
      console.log(`[V2 PRODUCTION TREE] ${line}`);
    }
    console.log("[V2 PRODUCTION TREE] fetchId:", resolvedFetchId, "end");
  });

  for (const scope of ["micro", "macro"] as const) {
    const scopeValue = asRecord(root[scope]);
    if (!scopeValue) continue;
    for (const block of scope === "micro" ? MICRO_NESTED_BLOCKS : MACRO_NESTED_BLOCKS) {
      logNestedBlock(scope, block, scopeValue[block], resolvedFetchId);
    }
  }

  devOnly(() => {
    console.log("[V2 FIELD MAP TABLE] fetchId:", resolvedFetchId);
    for (const [expectedPath, terms] of Object.entries(EXPECTED_FIELD_SEARCH)) {
      const scope = expectedPath.startsWith("micro.") ? "micro" : "macro";
      const hits = collectPathHits(root, terms);
      const bestPath = pickBestHit(scope, expectedPath, hits);
      const bestHit = hits.find((hit) => hit.path === bestPath);
      console.log(
        `[V2 FIELD MAP TABLE] ${expectedPath} | ${bestPath} | ${bestHit ? JSON.stringify(bestHit.sample) : "NOT_FOUND"}`,
      );
      if (hits.length > 1) {
        console.log(
          `[V2 FIELD MAP HITS] ${expectedPath}:`,
          hits.map((hit) => hit.path),
        );
      }
    }

    const verdict = resolveContractVerdict(root);
    console.log("[V2 CONTRACT VERDICT]", {
      fetchId: resolvedFetchId,
      verdict,
      meaning:
        verdict === "A"
          ? "contrato desactualizado"
          : verdict === "B"
            ? "serializer backend distinto"
            : verdict === "C"
              ? "schema cliente incorrecto"
              : "serializer backend distinto + schema cliente incorrecto (contratos distintos)",
      microTopLevelKeys: objectKeys(root.micro),
      macroTopLevelKeys: objectKeys(root.macro),
    });
  });
}

export const __testOnlyExpectedFieldSearch = EXPECTED_FIELD_SEARCH;
