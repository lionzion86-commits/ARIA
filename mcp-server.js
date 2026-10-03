#!/usr/bin/env node
/* ============================================================
   THE ARIA MUSE CONNECTOR, AS A LONG-LIVED PROCESS.

   This is the recommended way to run it: Fly.io, Railway, or anything
   that keeps a process alive. The catalogue is built once at boot
   (~11s, ~300MB) and every request after that is served from memory in
   tens of milliseconds. See netlify/functions/mcp.js for the same
   server behind Netlify, and the PR body for why that host is a poor
   fit for this particular workload.

     PORT=8080 node mcp-server.js
     POST /mcp      the MCP endpoint
     GET  /healthz  liveness + catalogue size, for the platform
   ============================================================ */
import http from "node:http";
import { getApp } from "./scripts/lib/mcp/app.mjs";
import { corsHeaders } from "./scripts/lib/mcp/server.mjs";

const PORT = Number(process.env.PORT) || 8080;
const MAX_BODY_BYTES = 1_000_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      /* A read-only search API has no reason to accept a megabyte, and
         an unbounded read is how a public endpoint is knocked over. */
      if (size > MAX_BODY_BYTES) { reject(new Error("TOO_LARGE")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const start = Date.now();
console.log(JSON.stringify({ at: new Date().toISOString(), event: "boot_start" }));
const app = await getApp();
console.log(JSON.stringify({
  at: new Date().toISOString(), event: "boot_ready",
  ms: Date.now() - start, products: app.stats.kept, files: app.stats.files,
  heap_mb: Math.round(process.memoryUsage().heapUsed / 1048576),
}));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const send = (status, headers, body) => {
    res.writeHead(status, headers || {});
    res.end(body === null || body === undefined ? "" : (typeof body === "string" ? body : JSON.stringify(body)));
  };

  if (url.pathname === "/healthz") {
    return send(200, { "Content-Type": "application/json" }, {
      ok: true, products: app.stats.kept, bootedAt: app.stats.bootedAt,
    });
  }
  if (url.pathname !== "/mcp" && url.pathname !== "/") {
    return send(404, { "Content-Type": "application/json" }, { error: "Not found. The MCP endpoint is POST /mcp." });
  }
  if (req.method === "OPTIONS") return send(204, corsHeaders(), null);

  let parsed;
  if (req.method === "POST") {
    let raw;
    try { raw = await readBody(req); }
    catch (e) {
      if (e.message === "TOO_LARGE") {
        return send(413, { ...corsHeaders(), "Content-Type": "application/json" },
          { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request body too large (limit 1 MB)." } });
      }
      throw e;
    }
    try { parsed = raw ? JSON.parse(raw) : null; }
    catch { parsed = "__PARSE_ERROR__"; }
  }

  const out = await app.handle({ method: req.method, headers: req.headers, body: parsed });
  send(out.status, out.headers, out.body);
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ at: new Date().toISOString(), event: "listening", port: PORT }));
});
