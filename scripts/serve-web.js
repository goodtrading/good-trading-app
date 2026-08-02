/**
 * Production static server for Expo web export (Railway).
 * Serves dist/ with SPA fallback for Expo Router client routes.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DIST = path.resolve(__dirname, "..", "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function sendFile(res, filePath, status = 200) {
  const stream = fs.createReadStream(filePath);
  res.writeHead(status, {
    "Content-Type": contentType(filePath),
    "Cache-Control": filePath.endsWith(".html")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });
  stream.pipe(res);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal Server Error");
  });
}

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(DIST, safe);

  if (!candidate.startsWith(DIST)) {
    return null;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    const indexInDir = path.join(candidate, "index.html");
    if (fs.existsSync(indexInDir)) return indexInDir;
  }

  const withHtml = `${candidate}.html`;
  if (fs.existsSync(withHtml) && fs.statSync(withHtml).isFile()) {
    return withHtml;
  }

  return null;
}

if (!fs.existsSync(DIST)) {
  console.error(`[serve-web] Missing dist/ at ${DIST}. Run pnpm build first.`);
  process.exit(1);
}

const indexHtml = path.join(DIST, "index.html");
if (!fs.existsSync(indexHtml)) {
  console.error("[serve-web] Missing dist/index.html. Expo export may have failed.");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  try {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const resolved = resolvePath(reqUrl.pathname);

    if (resolved) {
      sendFile(res, resolved);
      return;
    }

    // SPA / Expo Router client fallback
    sendFile(res, indexHtml);
  } catch (error) {
    console.error("[serve-web]", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[serve-web] Serving ${DIST} on http://${HOST}:${PORT}`);
});
