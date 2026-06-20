/**
 * Probes production auth endpoints without printing secrets.
 * Usage: node scripts/probe-auth-endpoints.mjs
 * Optional: GT_LOGIN_EMAIL / GT_LOGIN_PASSWORD for 200 capture (values never logged).
 */

const BASE = "https://goodtrading.up.railway.app";

function redact(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 20 && value.includes(".")) return "[REDACTED_JWT]";
    if (value.includes("@")) return "[REDACTED_EMAIL]";
    return value.length > 8 ? "[REDACTED]" : value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "token" || k === "accessToken" || k === "access_token") {
        out[k] = "[REDACTED_JWT]";
      } else if (k === "email" || k === "password") {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

function describeShape(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { topLevelKeys: [], dataKeys: null, tokenField: null, userKeys: null };
  }
  const topLevelKeys = Object.keys(body);
  const dataKeys = body.data && typeof body.data === "object" ? Object.keys(body.data) : null;
  const tokenField =
    ["token", "accessToken", "access_token"].find((k) => typeof body[k] === "string") ??
    (body.data && typeof body.data === "object"
      ? ["token", "accessToken", "access_token"].find((k) => typeof body.data[k] === "string")
      : null);
  const user = body.user ?? body.data?.user;
  const userKeys = user && typeof user === "object" ? Object.keys(user) : null;
  return { topLevelKeys, dataKeys, tokenField, userKeys };
}

async function probeLogin(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const contentType = res.headers.get("content-type");
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return {
    endpoint: "POST /api/auth/login",
    status: res.status,
    contentType,
    isHtml: text.trim().startsWith("<"),
    shape: describeShape(body),
    body: body ? redact(body) : text.slice(0, 120),
  };
}

async function probeMe(token) {
  const res = await fetch(`${BASE}/api/auth/me`, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const contentType = res.headers.get("content-type");
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return {
    endpoint: "GET /api/auth/me",
    status: res.status,
    contentType,
    isHtml: text.trim().startsWith("<"),
    shape: describeShape(body),
    body: body ? redact(body) : text.slice(0, 120),
  };
}

async function probeV2(token) {
  const url = `${BASE}/api/mobile/market-state/v2?asset=BTC&mode=both`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  return {
    endpoint: "GET /api/mobile/market-state/v2",
    status: res.status,
    contentType: res.headers.get("content-type"),
  };
}

const email = process.env.GT_LOGIN_EMAIL;
const password = process.env.GT_LOGIN_PASSWORD;

const invalidLogin = await probeLogin("probe-invalid@example.com", "not-a-real-password");
console.log(JSON.stringify({ invalidLogin }, null, 2));

const meNoAuth = await probeMe(null);
console.log(JSON.stringify({ meNoAuth }, null, 2));

const v2NoAuth = await probeV2(null);
console.log(JSON.stringify({ v2NoAuth }, null, 2));

if (email && password) {
  const validLogin = await probeLogin(email, password);
  console.log(JSON.stringify({ validLogin }, null, 2));
  if (validLogin.status === 200 && validLogin.shape.tokenField) {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = await loginRes.json();
    const token = loginBody.token ?? loginBody.accessToken ?? loginBody.access_token;
    if (token) {
      const meAuth = await probeMe(token);
      const v2Auth = await probeV2(token);
      console.log(JSON.stringify({ meAuth, v2Auth }, null, 2));
    }
  }
} else {
  console.log(
    JSON.stringify(
      {
        note: "Set GT_LOGIN_EMAIL and GT_LOGIN_PASSWORD to capture 200 login/me/v2 shapes (values never printed).",
      },
      null,
      2,
    ),
  );
}
