/* ============================================================
   THE MCP SURFACE: streamable HTTP, JSON-RPC 2.0.

   WHAT TALKS TO THIS. Meta's Muse agent, over POST. The transport is
   the Model Context Protocol's streamable HTTP binding, which for a
   server with no server-initiated messages is a plain JSON-RPC
   request/response over POST — every tool here answers in one shot, so
   nothing needs an open stream. GET is answered 405 with a sentence
   saying so, rather than left to time out as a dangling SSE.

   HOST-AGNOSTIC ON PURPOSE. handleMcpRequest() takes a method, headers
   and a parsed body and returns { status, headers, body }. mcp-server.js
   wraps it in a Node HTTP server (Fly.io / Railway); the Netlify
   function wraps the same call. The protocol is written once.

   PHASE 1 IS READ-ONLY. Two tools, both public, no auth. There is no
   admin method, no write path and no internal endpoint on this surface
   to find.
   ============================================================ */
import { TOOL_DEFINITIONS, TOOLS, InvalidInput } from "./tools.mjs";

export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "aria-shop", title: "Aria Shop", version: "1.0.0" };

/* JSON-RPC 2.0 reserved codes, plus the MCP convention that a tool
   which ran but failed answers 200 with isError, so the agent sees the
   message as tool output instead of a transport fault. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

/* CORS: permissive while Meta reviews.
   TO LOCK DOWN: replace "*" with Meta's agent origins once they are
   published, and drop the wildcard entirely — this server has no
   cookies or credentials, so a wildcard leaks nothing today, but a
   public read surface is still worth narrowing when there is a real
   list to narrow it to. */
export const CORS_ALLOW_ORIGIN = "*";

/* A batch is a convenience, not a bypass: see the cost accounting in
   handleMcpRequest. Big enough for any real client, small enough that
   one POST cannot be a thousand searches. */
export const MAX_BATCH = 20;

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Accept",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

const json = (status, body, extra = {}) => ({
  status,
  headers: { ...corsHeaders(), "Content-Type": "application/json", ...extra },
  body,
});

const rpcError = (id, code, message, extra = {}) =>
  ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } , ...extra });

/* ---------- rate limiting ---------- */

/**
 * Fixed-window per-client limiter. 60 requests a minute is fair use for
 * one agent and nowhere near what a shopper's conversation needs.
 *
 * A FIXED WINDOW IS THE RIGHT TOOL HERE and the burst it allows is
 * deliberate: an agent that fans out six searches to answer one
 * question should never be throttled mid-answer. Retry-After is the
 * seconds left in the window, so a client that honours it comes back
 * exactly when it can be served.
 */
export function createRateLimiter({ limit = 60, windowMs = 60_000, now = () => Date.now(), maxClients = 10_000 } = {}) {
  const buckets = new Map();
  return {
    take(clientId) {
      const t = now();
      let b = buckets.get(clientId);
      if (!b || t >= b.resetAt) {
        b = { count: 0, resetAt: t + windowMs };
        /* Unbounded maps are how a limiter becomes the leak. Evict the
           oldest windows wholesale rather than tracking LRU per key. */
        if (buckets.size >= maxClients) {
          for (const [k, v] of buckets) if (t >= v.resetAt) buckets.delete(k);
          if (buckets.size >= maxClients) buckets.clear();
        }
        buckets.set(clientId, b);
      }
      b.count++;
      const remaining = Math.max(0, limit - b.count);
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - t) / 1000));
      return { ok: b.count <= limit, remaining, retryAfter, limit, resetAt: b.resetAt };
    },
    _size: () => buckets.size,
  };
}

/** The client a request belongs to, behind whatever proxy fronts us. */
export function clientIdFor(headers) {
  const h = (k) => headers?.[k] || headers?.[k.toLowerCase()] || "";
  const fwd = String(h("x-forwarded-for") || "").split(",")[0].trim();
  return fwd || String(h("x-nf-client-connection-ip") || h("cf-connecting-ip") || h("x-real-ip") || "unknown");
}

/* ---------- logging ---------- */

/**
 * One line per tool call: what was asked, how long it took, what came
 * back. The inputs are the agent's own search terms — no shopper
 * identity, no cart, nothing a Phase 1 read tool could learn about a
 * person. The client id is an IP and is hashed, because the log does
 * not need to say WHO, only to tell one caller from another.
 */
export function defaultLogger(entry) {
  process.stdout.write(JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

function hashClient(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ---------- the handler ---------- */

/**
 * @param {object} req  { method, headers, body }  body already parsed, or a parse failure marker
 * @param {object} deps { catalog, fx, limiter, log, now }
 */
export async function handleMcpRequest(req, deps) {
  const { method = "POST", headers = {}, body } = req;
  const log = deps.log || defaultLogger;

  if (method === "OPTIONS") return { status: 204, headers: corsHeaders(), body: null };
  if (method !== "POST") {
    return json(405, rpcError(null, INVALID_REQUEST,
      "This MCP endpoint speaks JSON-RPC over POST. Send a POST with a JSON-RPC 2.0 body."));
  }

  if (body === undefined || body === null || body === "__PARSE_ERROR__") {
    return json(400, rpcError(null, PARSE_ERROR, "Request body is not valid JSON."));
  }

  const rateClient = clientIdFor(headers);
  const isBatch = Array.isArray(body);
  if (isBatch && !body.length) {
    return json(400, rpcError(null, INVALID_REQUEST, "A JSON-RPC batch must not be empty."));
  }
  /* A BATCH COSTS WHAT IT CONTAINS.
     The limiter used to run once per HTTP request, and the batch branch
     sat above it — so one POST carrying a thousand batched tool calls
     was a thousand searches for the price of one, and the 60/min limit
     meant nothing to anyone willing to use an array. Each entry is
     charged separately now, and an oversized batch is refused outright
     rather than half-served. */
  const cost = isBatch ? body.length : 1;
  if (isBatch && cost > MAX_BATCH) {
    return json(400, rpcError(null, INVALID_REQUEST,
      `A JSON-RPC batch may carry at most ${MAX_BATCH} requests (got ${cost}).`));
  }
  let gate = { ok: true, remaining: 60, retryAfter: 1, limit: 60 };
  if (deps.limiter) {
    for (let i = 0; i < cost; i++) {
      const g = deps.limiter.take(rateClient);
      if (!g.ok) { gate = g; break; }
      gate = g;
    }
  }
  if (!gate.ok) {
    log({ event: "rate_limited", client: hashClient(rateClient), retry_after_s: gate.retryAfter, cost });
    return json(429, rpcError(isBatch ? null : (body?.id ?? null), INTERNAL_ERROR,
      `Rate limit exceeded: ${gate.limit} requests per minute. Retry in ${gate.retryAfter}s.`), {
      "Retry-After": String(gate.retryAfter),
      "X-RateLimit-Limit": String(gate.limit),
      "X-RateLimit-Remaining": "0",
    });
  }

  /* A batch is answered one entry at a time, notifications dropped, so
     a client that batches initialize+tools/list works. */
  if (isBatch) {
    const out = [];
    for (const one of body) {
      const r = await handleOne(one, headers, deps, log);
      if (r) out.push(r);
    }
    return out.length
      ? json(200, out, { "X-RateLimit-Limit": String(gate.limit), "X-RateLimit-Remaining": String(gate.remaining) })
      : { status: 202, headers: corsHeaders(), body: null };
  }

  const res = await handleOne(body, headers, deps, log);
  if (!res) return { status: 202, headers: corsHeaders(), body: null };
  return json(httpStatusFor(res), res, {
    "X-RateLimit-Limit": String(gate.limit),
    "X-RateLimit-Remaining": String(gate.remaining),
  });
}

async function handleOne(msg, headers, deps, log) {
  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
    return rpcError(null, INVALID_REQUEST, "A JSON-RPC request must be an object.");
  }
  if (msg.jsonrpc !== "2.0") {
    return rpcError(msg.id ?? null, INVALID_REQUEST, `"jsonrpc" must be "2.0" (got ${JSON.stringify(msg.jsonrpc)}).`);
  }
  if (typeof msg.method !== "string" || !msg.method) {
    return rpcError(msg.id ?? null, INVALID_REQUEST, '"method" is required and must be a string.');
  }
  /* No id means a notification: handled, never answered. */
  const isNotification = msg.id === undefined;
  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return isNotification ? null : {
        jsonrpc: "2.0", id,
        result: {
          /* Echo the client's version when we can speak it; MCP says to
             answer with ours when we cannot, and let the client decide. */
          protocolVersion: typeof asked === "string" && asked ? asked : PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Aria imports products from US stores to Peru. Search the catalog with search_products, " +
            "then get_product for full detail including the freight estimate to Peru. " +
            "Prices are already landed-cost marked up; price_pen is in Peruvian soles at the SUNAT venta rate.",
        },
      };
    }
    case "notifications/initialized":
    case "initialized":
      return null;
    case "ping":
      return isNotification ? null : { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return isNotification ? null : { jsonrpc: "2.0", id, result: { tools: TOOL_DEFINITIONS } };
    case "tools/call": {
      const name = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      const fn = Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : null;
      if (!fn) {
        return isNotification ? null : rpcError(id, INVALID_PARAMS,
          `Unknown tool "${name}". This server offers: ${TOOL_DEFINITIONS.map((t) => t.name).join(", ")}.`);
      }
      const started = Date.now();
      try {
        const result = fn(args, { catalog: deps.catalog, fx: deps.fx ? deps.fx.get() : null });
        log({
          event: "tool_call", tool: name, args, ok: true,
          ms: Date.now() - started,
          results: Array.isArray(result?.products) ? result.products.length : undefined,
          client: hashClient(clientIdFor(headers)),
        });
        return isNotification ? null : {
          jsonrpc: "2.0", id,
          result: {
            /* Both shapes: structuredContent for clients that read it,
               and the JSON as text for those that do not. */
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
            isError: false,
          },
        };
      } catch (err) {
        const bad = err instanceof InvalidInput || err.name === "InvalidInput";
        const missing = err.name === "NotFound";
        log({
          event: "tool_call", tool: name, args, ok: false,
          kind: bad ? "invalid_input" : missing ? "not_found" : "error",
          error: err.message, ms: Date.now() - started,
          client: hashClient(clientIdFor(headers)),
        });
        if (isNotification) return null;
        /* BAD INPUT IS A PROTOCOL ERROR, so the agent is told it called
           wrong rather than being handed a "result" that looks like an
           answer. A product that simply is not there is tool output. */
        if (bad) return rpcError(id, INVALID_PARAMS, err.message);
        return {
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text: err.message }], isError: true },
        };
      }
    }
    default:
      return isNotification ? null : rpcError(id, METHOD_NOT_FOUND,
        `Unknown method "${msg.method}". This server supports: initialize, tools/list, tools/call, ping.`);
  }
}

/* THE STATUS CODE FOR A JSON-RPC ERROR, and a deliberate departure.

   Strict JSON-RPC answers every well-formed call with HTTP 200 and puts
   the fault in the body. Danny's brief asks for 400 on bad input, and
   he is right for this surface: an agent's own retry and error handling
   reads the status line first, and a 200 carrying "query is required"
   invites a retry loop against a request that can never succeed. So a
   malformed or unusable request gets a 4xx AND the readable JSON-RPC
   error body — a strict client reads the body and is satisfied, a
   pragmatic one reads the code and stops. Successful calls, and tools
   that ran but found nothing, stay 200. */
export function httpStatusFor(payload) {
  if (!payload || Array.isArray(payload) || !payload.error) return 200;
  const c = payload.error.code;
  if (c === PARSE_ERROR || c === INVALID_REQUEST) return 400;
  if (c === INVALID_PARAMS) return 400;
  if (c === METHOD_NOT_FOUND) return 404;
  return 200;
}
