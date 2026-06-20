/**
 * Capture a real v2 snapshot from production and write a sanitized fixture.
 *
 * Usage (never commit tokens):
 *   MOBILE_V2_TEST_BEARER=<goodtrading-jwt> node scripts/capture-v2-snapshot.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = process.env.API_BASE_URL ?? "https://goodtrading.up.railway.app";
const TOKEN = process.env.MOBILE_V2_TEST_BEARER?.trim();
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../lib/market-state/__tests__/fixtures/mobileMarketStateV2.real.sanitized.json",
);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function redactString(value, keyHint = "") {
  if (typeof value !== "string") return value;
  let next = value.replace(JWT_RE, "[REDACTED_JWT]");
  next = next.replace(EMAIL_RE, "[REDACTED_EMAIL]");

  const lowerKey = keyHint.toLowerCase();
  if (
    lowerKey.includes("userid") ||
    lowerKey.includes("user_id") ||
    lowerKey.includes("session")
  ) {
    return "[REDACTED_ID]";
  }

  return next;
}

function sanitizeNode(node, keyHint = "") {
  if (Array.isArray(node)) {
    return node.map((item, index) => sanitizeNode(item, `${keyHint}[${index}]`));
  }

  if (node != null && typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key.toLowerCase().includes("authorization") || key.toLowerCase().includes("cookie")) {
        continue;
      }
      out[key] = sanitizeNode(value, key);
    }
    return out;
  }

  if (typeof node === "string") {
    return redactString(node, keyHint);
  }

  return node;
}

function sanitizePayload(body) {
  if (!body || body.status !== "success") return body;

  const sanitized = sanitizeNode({
    status: body.status,
    data: body.data,
    meta: {
      requestId: body.meta?.requestId ?? "req-sanitized",
      snapshotId: body.meta?.snapshotId ?? "snap-sanitized",
      generatedAt: body.meta?.generatedAt ?? new Date().toISOString(),
      servedAt: body.meta?.servedAt ?? new Date().toISOString(),
    },
  });

  return sanitized;
}

async function main() {
  const url = `${API_BASE}/api/mobile/market-state/v2?asset=BTC&mode=both`;
  const started = Date.now();
  const headers = { accept: "application/json" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

  const res = await fetch(url, { headers });
  const latencyMs = Date.now() - started;
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }

  console.log(
    JSON.stringify(
      {
        status: res.status,
        latencyMs,
        requestId: json?.meta?.requestId ?? null,
        snapshotId: json?.meta?.snapshotId ?? null,
        generatedAt: json?.meta?.generatedAt ?? null,
        servedAt: json?.meta?.servedAt ?? null,
        errorCode: json?.error?.code ?? json?.code ?? null,
      },
      null,
      2,
    ),
  );

  if (res.status !== 200 || json?.status !== "success") {
    process.exitCode = 1;
    return;
  }

  const sanitized = sanitizePayload(json);
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  console.log(`Wrote sanitized fixture: ${OUT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
