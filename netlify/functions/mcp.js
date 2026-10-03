/* ============================================================
   THE SAME CONNECTOR, BEHIND NETLIFY.

   Provided so https://ariashop.pe/mcp works on the deploy chain the
   site already uses, and so Danny can try it without standing anything
   new up. It is NOT the recommended host, and the reason is measured
   rather than assumed: building the catalogue costs ~11s and ~300MB
   because index.html's pricing runs over 139,000 records. A Lambda pays
   that on every cold start, against Netlify's 10s synchronous ceiling —
   so the first agent call after an idle period times out rather than
   answering slowly, and MCP clients treat a timeout as a dead server.

   Module scope survives between warm invocations, so `getApp()` is
   memoised here exactly as it is in mcp-server.js: a warm container is
   fast. The problem is the cold one, and an agent surface is idle most
   of the time by nature.

   mcp-server.js runs the identical handler as a long-lived process on
   Fly.io or Railway, pays the 11s once at boot, and serves every
   request warm. That is the recommendation; this file is the fallback.
   ============================================================ */
import { getApp } from "../../scripts/lib/mcp/app.mjs";
import { corsHeaders } from "../../scripts/lib/mcp/server.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: corsHeaders() });

  let parsed;
  if (req.method === "POST") {
    let raw = "";
    try { raw = await req.text(); } catch { raw = ""; }
    try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = "__PARSE_ERROR__"; }
  }

  const headers = {};
  for (const [k, v] of req.headers) headers[k.toLowerCase()] = v;

  const app = await getApp();
  const out = await app.handle({ method: req.method, headers, body: parsed });

  return new Response(
    out.body === null || out.body === undefined ? "" : JSON.stringify(out.body),
    { status: out.status, headers: out.headers },
  );
}

/* Served at /mcp as well as /.netlify/functions/mcp, so the public URL
   in Meta's connector registration is the clean one. */
export const config = { path: ["/mcp"] };
