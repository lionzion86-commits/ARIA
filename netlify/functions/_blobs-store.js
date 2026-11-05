// THE SHOP'S BLOBS STORES, STRONG ONLY WHERE STRONG WORKS (#443 c.6668071617;
// root cause found in #681). Underscore: not an endpoint.
//
// A store opened with getStore({ name, consistency: "strong" }) sends EVERY
// operation -- writes included -- to the Blobs context's uncachedEdgeURL
// (@netlify/blobs getFinalRequest). A Lambda-compat function (export
// handler + connectLambda(event)) never gets that URL, so every call threw
// BlobsConsistencyError. strongStore() asks for strong only when the
// context really has the URL (Functions v2, where Netlify supplies it);
// anywhere else it opens the store with the default (eventual) consistency
// and warns once, instead of failing every call.
//
// v2() turns a Lambda-shaped handler into a Functions v2 default export
// (Request in, Response out) so the HTTP functions get the full context and
// therefore real strong consistency, while tests keep calling it with a
// Lambda-style event.
import { getStore, connectLambda } from "@netlify/blobs";

export function blobsContext() {
  const raw = globalThis.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT;
  if (typeof raw !== "string" || !raw) return {};
  try { return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) || {}; } catch { return {}; }
}

let warned = false;
/** A store with strong consistency when the context supports it, else eventual (one warning per process). */
export function strongStore(name) {
  if (blobsContext().uncachedEdgeURL) return getStore({ name, consistency: "strong" });
  if (!warned) { warned = true; console.warn("[blobs] context has no uncachedEdgeURL: using eventual consistency"); }
  return getStore({ name });
}
export function __resetWarning() { warned = false; }

/** connectLambda only for a real Lambda event (a v2 call has no event.blobs and needs none). */
export function connectIfLambda(event) {
  if (event && event.blobs) { try { connectLambda(event); } catch { /* already wired */ } }
}

const isRequest = (a) => Boolean(a && typeof a.url === "string" && a.headers && typeof a.headers.get === "function");

/**
 * One handler, both shapes. Netlify calls the default export with
 * (Request, context): it becomes a Lambda-style event (lower-cased headers,
 * the client IP from context.ip, the body as UTF-8 text, query parameters,
 * path) and the { statusCode, headers, body, isBase64Encoded } answer goes
 * back as a Response. Any other call (tests, local tools) passes straight
 * through with all its arguments.
 */
export function v2(lambda) {
  return async function dual(a, ...rest) {
    if (!isRequest(a)) return lambda(a, ...rest);
    const req = a, context = rest[0];
    const u = new URL(req.url);
    const headers = {};
    req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    if (!headers.host) headers.host = u.host;
    if (context && context.ip && !headers["x-nf-client-connection-ip"]) headers["x-nf-client-connection-ip"] = String(context.ip);
    const body = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
    const queryStringParameters = Object.fromEntries(u.searchParams);
    const r = (await lambda({ httpMethod: req.method, headers, body, isBase64Encoded: false, queryStringParameters, path: u.pathname, rawUrl: req.url })) || {};
    const status = r.statusCode || 200;
    const payload = status === 204 || status === 304 || r.body == null || r.body === "" ? null
      : r.isBase64Encoded ? Buffer.from(r.body, "base64") : r.body;
    return new Response(payload, { status, headers: r.headers || {} });
  };
}
