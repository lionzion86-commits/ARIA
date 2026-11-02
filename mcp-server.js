#!/usr/bin/env node
/* ============================================================
   THE ARIA MUSE CONNECTOR, AS A PLAIN NODE PROCESS.

   The production endpoint is the Netlify function at
   https://ariashop.pe/mcp (netlify/functions/mcp.js; docs/muse-mcp.md).
   This runs the very same handler on a local port -- for trying the
   connector with an MCP client, or hosting it on a long-lived box. It
   reads the search index and the product pages' shards off disk.

     PORT=8080 node mcp-server.js     (npm run mcp)
     POST /mcp      the MCP endpoint
     GET  /healthz  liveness, for a platform health check
   ============================================================ */
import http from "node:http";
import { fileURLToPath } from "node:url";
import { handler } from "./netlify/functions/mcp.js";
import { loadSearch } from "./netlify/functions/_search-core.js";
import { LABELS } from "./netlify/functions/search.js";

/* The function's file reads are relative to the repo root. */
process.chdir(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const MAX_BODY_BYTES = 1_000_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error("TOO_LARGE")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const start = Date.now();
const ctx = loadSearch({ labels: LABELS });
console.log(JSON.stringify({ at: new Date().toISOString(), event: "boot_ready", ms: Date.now() - start, products: ctx.products.length }));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, products: ctx.products.length }));
  }
  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Not found. The MCP endpoint is POST /mcp." }));
  }
  let body = "";
  try { body = req.method === "POST" ? await readBody(req) : ""; }
  catch {
    res.writeHead(413, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request body too large (limit 1 MB)." } }));
  }
  const headers = { ...req.headers, "x-nf-client-connection-ip": req.socket.remoteAddress || "unknown" };
  const out = await handler({ httpMethod: req.method, headers, body });
  res.writeHead(out.statusCode, out.headers);
  res.end(out.body || "");
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ at: new Date().toISOString(), event: "listening", port: PORT }));
});
