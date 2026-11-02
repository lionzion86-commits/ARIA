/* ============================================================
   MCP OVER STREAMABLE HTTP -- THE TRANSPORT (#443 c.6578981079,
   "ARIA MUSE CONNECTOR, PHASE 1").

   The Model Context Protocol's streamable HTTP binding, for a server
   that never starts a conversation of its own: every request is one
   JSON-RPC 2.0 POST and every answer leaves in the same response. So:

     POST    a JSON-RPC request, notification or batch. Answered with
             application/json -- or, when the client's Accept names
             text/event-stream and NOT application/json, the same answer
             as one SSE "message" event, then the stream closes.
     OPTIONS CORS preflight, 204.
     GET     405 + Allow: there is no server-initiated stream to open.
     DELETE  405 + Allow: the server is stateless, there is no session
             to end (no Mcp-Session-Id is ever issued).

   HTTP STATUS. A body that is not JSON, or not a JSON-RPC request,
   gets 400 with a JSON-RPC error. A well-formed call the server cannot
   honour (unknown method, unknown tool, bad tool arguments) is answered
   200 with a JSON-RPC error object carrying a readable message: the MCP
   clients read the JSON-RPC body of a 2xx and surface its message to the
   model, which is how an agent learns to fix its call. Nothing ever
   carries a stack trace -- internal faults are logged here and answered
   "Internal error".

   HOST-AGNOSTIC. handleMcp() takes { method, headers, body (raw text) }
   and returns { status, headers, body (text) }. netlify/functions/mcp.js
   wraps it for Netlify; mcp-server.js for a plain Node process. The
   tools are passed in -- this file knows nothing about Aria's catalogue.

   A plain .js (no .mjs import, no import.meta): Netlify's bundler
   compiles functions to CommonJS (scripts/test/function-esm-tests.mjs).
   ============================================================ */
import { createHash } from "node:crypto";

/* Newest first. The first is what an unknown or missing version gets. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

/* A read-only search API has no reason to accept a megabyte. */
export const MAX_BODY_BYTES = 1_000_000;
/* A batch is a convenience, not a bypass: each entry is charged to the
   rate limit, and one POST may carry at most this many. */
export const MAX_BATCH = 20;

/* CORS: OPEN FOR PHASE 1.
   TO LOCK DOWN: replace "*" with Meta's agent origins once Meta
   publishes them (and echo the request's Origin when it is on that
   list, adding "Vary: Origin"). The connector holds no cookies and no
   credentials, so the wildcard leaks nothing today; narrowing it is
   hygiene for a public read surface, not a fix. */
export const CORS_ALLOW_ORIGIN = "*";

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining",
    "Access-Control-Max-Age": "86400",
  };
}

/* ---------- rate limiting ---------- */

/**
 * Fixed-window limiter, per client, IN MEMORY. 60 requests a minute is
 * fair use for one agent. PHASE 1 LIMITATION: each warm Netlify
 * instance keeps its own window, so a client spread over N instances
 * can make up to N x 60 a minute; a cold start forgets the window. A
 * shared counter (Netlify Blobs) is the Phase 2 fix if abuse shows up.
 * Retry-After is the seconds left in the window.
 */
export function createRateLimiter({ limit = 60, windowMs = 60_000, now = () => Date.now(), maxClients = 10_000 } = {}) {
  const buckets = new Map();
  return {
    limit,
    take(clientId) {
      const t = now();
      let b = buckets.get(clientId);
      if (!b || t >= b.resetAt) {
        if (buckets.size >= maxClients) {
          for (const [k, v] of buckets) if (t >= v.resetAt) buckets.delete(k);
          if (buckets.size >= maxClients) buckets.clear();
        }
        b = { count: 0, resetAt: t + windowMs };
        buckets.set(clientId, b);
      }
      b.count++;
      return {
        ok: b.count <= limit,
        limit,
        remaining: Math.max(0, limit - b.count),
        retryAfter: Math.max(1, Math.ceil((b.resetAt - t) / 1000)),
      };
    },
  };
}

const header = (headers, name) => {
  if (!headers) return "";
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v !== undefined) return String(v);
  const want = name.toLowerCase();
  for (const k of Object.keys(headers)) if (k.toLowerCase() === want) return String(headers[k]);
  return "";
};

/**
 * The caller's IP. Netlify's own x-nf-client-connection-ip first: a
 * client can write any X-Forwarded-For it likes, and a limiter keyed on
 * a header the caller controls limits nobody.
 */
export function clientIp(headers) {
  const nf = header(headers, "x-nf-client-connection-ip").trim();
  if (nf) return nf;
  const fwd = header(headers, "x-forwarded-for").split(",")[0].trim();
  return fwd || header(headers, "x-real-ip").trim() || "unknown";
}

/* The log tells callers apart without saying who they are. */
export function hashClient(ip) {
  return createHash("sha256").update("aria-mcp:" + String(ip)).digest("hex").slice(0, 12);
}

/* One JSON line per event, through console (Netlify's function log). */
export function defaultLogger(entry) {
  console.log(JSON.stringify({ at: new Date().toISOString(), svc: "mcp", ...entry }));
}

/* ---------- errors ---------- */

/** A tool's arguments are wrong: answered as JSON-RPC -32602 with this message. */
export class InvalidParams extends Error {
  constructor(message, data) { super(message); this.name = "InvalidParams"; this.data = data; }
}
/** The tool ran and has a plain answer that is not a result ("no such product"). */
export class ToolError extends Error {
  constructor(message) { super(message); this.name = "ToolError"; }
}

const rpcError = (id, code, message, data) =>
  ({ jsonrpc: "2.0", id: id === undefined ? null : id, error: data === undefined ? { code, message } : { code, message, data } });

/* ---------- the handler ---------- */

/**
 * @param {{method:string, headers:object, body:string|null}} req
 * @param {{server:{name:string,version:string,title?:string,instructions?:string},
 *          tools:Array<{definition:object, run:(args:object)=>Promise<object>}>,
 *          limiter?:object, log?:Function, now?:Function}} app
 * @returns {Promise<{status:number, headers:object, body:string}>}
 */
export async function handleMcp(req, app) {
  const method = String(req.method || "POST").toUpperCase();
  const headers = req.headers || {};
  const log = app.log || defaultLogger;
  const now = app.now || (() => Date.now());
  const started = now();
  const client = hashClient(clientIp(headers));
  const base = corsHeaders();

  const send = (status, payload, extra = {}) => ({
    status,
    headers: { ...base, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
    body: payload === null ? "" : JSON.stringify(payload),
  });

  if (method === "OPTIONS") return { status: 204, headers: base, body: "" };
  if (method !== "POST") {
    return send(405, rpcError(null, INVALID_REQUEST,
      "This MCP endpoint takes JSON-RPC 2.0 over POST. It opens no server-initiated stream (GET) and keeps no session (DELETE)."),
    { Allow: "POST, OPTIONS" });
  }

  /* The protocol version header, when sent, must be one we speak. */
  const pv = header(headers, "mcp-protocol-version").trim();
  if (pv && !SUPPORTED_PROTOCOL_VERSIONS.includes(pv)) {
    return send(400, rpcError(null, INVALID_REQUEST,
      `Unsupported MCP-Protocol-Version "${pv}". Supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.`));
  }

  const raw = req.body == null ? "" : String(req.body);
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return send(413, rpcError(null, INVALID_REQUEST, `Request body is larger than ${MAX_BODY_BYTES} bytes.`));
  }
  let body;
  try { body = JSON.parse(raw); } catch {
    log({ event: "bad_request", client, reason: "parse_error" });
    return send(400, rpcError(null, PARSE_ERROR, "Request body is not valid JSON. Send one JSON-RPC 2.0 object (or a batch array)."));
  }

  const isBatch = Array.isArray(body);
  const messages = isBatch ? body : [body];
  if (isBatch && !messages.length) return send(400, rpcError(null, INVALID_REQUEST, "A JSON-RPC batch must not be empty."));
  if (messages.length > MAX_BATCH) {
    return send(400, rpcError(null, INVALID_REQUEST, `A JSON-RPC batch may carry at most ${MAX_BATCH} messages (got ${messages.length}).`));
  }

  /* Rate limit: every message in the request is charged. */
  let gate = null;
  if (app.limiter) {
    for (let i = 0; i < messages.length; i++) {
      gate = app.limiter.take(clientIp(headers));
      if (!gate.ok) break;
    }
    if (gate && !gate.ok) {
      log({ event: "rate_limited", client, retry_after_s: gate.retryAfter, messages: messages.length });
      const id = !isBatch && body && typeof body === "object" ? body.id : null;
      return send(429, rpcError(id, INTERNAL_ERROR,
        `Rate limit exceeded: ${gate.limit} requests per minute per client. Retry in ${gate.retryAfter}s.`), {
        "Retry-After": String(gate.retryAfter),
        "X-RateLimit-Limit": String(gate.limit),
        "X-RateLimit-Remaining": "0",
      });
    }
  }
  const rl = gate ? { "X-RateLimit-Limit": String(gate.limit), "X-RateLimit-Remaining": String(gate.remaining) } : {};

  /* A lone request that is not even JSON-RPC is a malformed request: 400. */
  if (!isBatch) {
    const bad = envelopeError(body);
    if (bad) {
      log({ event: "bad_request", client, reason: bad.error.message });
      return send(400, bad, rl);
    }
  }

  const out = [];
  for (const msg of messages) {
    const r = await handleOne(msg, app, { log, now, client });
    if (r) out.push(r);
  }
  log({ event: "http", client, messages: messages.length, ms: now() - started });
  if (!out.length) return { status: 202, headers: { ...base, ...rl }, body: "" };
  const payload = isBatch ? out : out[0];

  /* SSE only for a client that cannot take JSON. */
  const accept = header(headers, "accept").toLowerCase();
  if (accept.includes("text/event-stream") && !accept.includes("application/json") && !accept.includes("*/*")) {
    return {
      status: 200,
      headers: { ...base, ...rl, "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
      body: `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
    };
  }
  return send(200, payload, rl);
}

/* The JSON-RPC envelope's own faults, or null. */
function envelopeError(msg) {
  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
    return rpcError(null, INVALID_REQUEST, "A JSON-RPC message must be an object.");
  }
  const id = msg.id;
  if (msg.jsonrpc !== "2.0") return rpcError(validId(id) ? id : null, INVALID_REQUEST, `"jsonrpc" must be "2.0".`);
  if (id !== undefined && !validId(id)) return rpcError(null, INVALID_REQUEST, '"id" must be a string or a number.');
  /* A response from the client (to a server request we never make). */
  if (msg.method === undefined && ("result" in msg || "error" in msg)) return null;
  if (typeof msg.method !== "string" || !msg.method) return rpcError(validId(id) ? id : null, INVALID_REQUEST, '"method" is required and must be a string.');
  if (msg.params !== undefined && (msg.params === null || typeof msg.params !== "object")) {
    return rpcError(validId(id) ? id : null, INVALID_REQUEST, '"params", when present, must be an object.');
  }
  return null;
}
const validId = (id) => typeof id === "string" || (typeof id === "number" && Number.isFinite(id));

async function handleOne(msg, app, { log, now, client }) {
  const bad = envelopeError(msg);
  if (bad) return bad;
  /* A client's response, or a notification: handled, never answered. */
  if (msg.method === undefined) return null;
  const isNotification = msg.id === undefined;
  const id = msg.id;
  const params = msg.params || {};
  const reply = (result) => (isNotification ? null : { jsonrpc: "2.0", id, result });
  const fail = (code, message, data) => (isNotification ? null : rpcError(id, code, message, data));

  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return reply({
        /* Negotiation: the client's version when we speak it, else our
           latest -- the client then decides whether it can go on. */
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : LATEST_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: app.server.name, version: app.server.version, ...(app.server.title ? { title: app.server.title } : {}) },
        ...(app.server.instructions ? { instructions: app.server.instructions } : {}),
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
    case "notifications/progress":
      return null;
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: app.tools.map((t) => t.definition) });
    case "tools/call": {
      const name = params.name;
      const tool = typeof name === "string" ? app.tools.find((t) => t.definition.name === name) : null;
      if (!tool) {
        return fail(INVALID_PARAMS, `Unknown tool ${JSON.stringify(name ?? null)}. This server offers: ${app.tools.map((t) => t.definition.name).join(", ")}.`);
      }
      const args = params.arguments === undefined ? {} : params.arguments;
      const t0 = now();
      try {
        const result = await tool.run(args);
        log({ event: "tool_call", tool: name, args: argsForLog(args), status: "ok", ms: now() - t0, results: countOf(result), client });
        return reply({
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
          isError: false,
        });
      } catch (err) {
        const kind = err && err.name === "InvalidParams" ? "invalid_params" : err && err.name === "ToolError" ? "tool_error" : "internal_error";
        log({ event: "tool_call", tool: name, args: argsForLog(args), status: kind, ms: now() - t0, client,
          error: kind === "internal_error" ? String((err && err.stack) || err) : err.message });
        if (kind === "invalid_params") return fail(INVALID_PARAMS, `Invalid arguments for ${name}: ${err.message}`, err.data);
        /* The tool ran: its answer is tool output the model can read. */
        if (kind === "tool_error") return reply({ content: [{ type: "text", text: err.message }], isError: true });
        return fail(INTERNAL_ERROR, "Internal error. The request was valid; try again shortly.");
      }
    }
    default:
      return fail(METHOD_NOT_FOUND, `Unknown method "${msg.method}". This server supports: initialize, ping, tools/list, tools/call.`);
  }
}

/* The inputs as sent, but never a log line the size of the body limit. */
const LOG_ARGS_MAX = 600;
function argsForLog(args) {
  let text;
  try { text = JSON.stringify(args); } catch { return "[unserialisable]"; }
  if (text === undefined) return null;
  return text.length <= LOG_ARGS_MAX ? args : text.slice(0, LOG_ARGS_MAX) + "...[truncated]";
}

function countOf(result) {
  if (result && Array.isArray(result.products)) return result.products.length;
  return result ? 1 : 0;
}
