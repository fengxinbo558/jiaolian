import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { handleFormApi } from "./form-api.mjs";

const root = resolve(process.env.FORM_DIST_DIR || "dist");
const port = Number(process.env.PORT || 8000);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function requestBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100_000) {
        reject(new Error("body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendApiResponse(response, result, headOnly = false) {
  response.writeHead(result.status, result.headers);
  response.end(headOnly ? undefined : result.body);
}

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
  const candidate = resolve(join(root, relative));
  return candidate.startsWith(`${root}/`) || candidate === root ? candidate : null;
}

async function serveFile(request, response, filePath, info) {
  const type = mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": type,
    "Cache-Control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
  };
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${info.size}` });
      response.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= info.size) {
      response.writeHead(416, { "Content-Range": `bytes */${info.size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      ...headers,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${info.size}`,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, "Content-Length": info.size });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}

async function fileInfo(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const rawBody = request.method === "GET" || request.method === "HEAD" ? "" : await requestBody(request);
      const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
      const result = await handleFormApi({
        method: request.method || "GET",
        pathname: url.pathname,
        headers: request.headers,
        rawBody,
        secure: forwardedProto === "https" || process.env.NODE_ENV === "production",
      });
      sendApiResponse(response, result, request.method === "HEAD");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    const candidate = safePath(url.pathname === "/" ? "index.html" : url.pathname);
    const candidateInfo = candidate ? await fileInfo(candidate) : null;
    if (candidateInfo) {
      await serveFile(request, response, candidate, candidateInfo);
      return;
    }
    const indexPath = join(root, "index.html");
    const indexInfo = await fileInfo(indexPath);
    if (!indexInfo) throw new Error("dist/index.html not found; run npm run build first");
    await serveFile(request, response, indexPath, indexInfo);
  } catch (error) {
    console.error(`[FORM_SERVER_ERROR] ${error instanceof Error ? error.message : "unknown error"}`);
    if (!response.headersSent) response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "服务暂时不可用" }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[FORM_SERVER] listening on 0.0.0.0:${port}`);
});
