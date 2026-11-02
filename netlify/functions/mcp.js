/* ============================================================
   https://ariashop.pe/mcp -- THE ARIA MUSE CONNECTOR, PHASE 1
   (#443 c.6578981079). See docs/muse-mcp.md.

   A Model Context Protocol server (streamable HTTP, stateless) so Meta's
   Muse agent can search Aria's catalogue: two public read tools,
   search_products and get_product. No carts, checkout, money or auth.

     netlify.toml   /mcp -> this function (a 200 rewrite), and the files
                    it reads (the search index, engine and dictionary,
                    the weight table) via included_files.
     _mcp-protocol.js   the transport: JSON-RPC, CORS, rate limit, logs.
     _muse-tools.js     the two tools, on the site's own search, product
                        page data and pricing.

   COLD START. The first request on an instance loads the search index
   (~2.5s locally, the same load /api/search pays) while the exchange
   rate is fetched beside it; every later request is warm. The product
   pages' shards are read from this deploy's own CDN (the 230MB of them
   would not fit in a function), one ~40KB file per product, cached.

   Replaces the earlier connector that rebuilt the whole catalogue from
   index.html at boot (~11s, ~300MB, ~243MB of bundled files against
   Lambda's 250MB ceiling); scripts/lib/mcp/ keeps that code for the
   price-index builder and its own tests.
   ============================================================ */
import { connectLambda } from "@netlify/blobs";
import { loadSearch } from "./_search-core.js";
import { LABELS, sellRate, within } from "./search.js";
import { handleMcp, createRateLimiter } from "./_mcp-protocol.js";
import { museTools, createShardReader, SITE } from "./_muse-tools.js";

export const SERVER_INFO = {
  name: "aria-shop",
  title: "Aria Shop",
  version: "1.0.0",
  instructions:
    "Aria (ariashop.pe) buys products from US stores for shoppers in Peru and delivers them. " +
    "Use search_products to find products (Spanish or English), then get_product for one product's description, " +
    "photos, sizes, weight, freight estimate to Peru and import-tax handling. price_usd is Aria's price for the product; " +
    "price_pen is the same in Peruvian soles at SUNAT's venta rate. International freight and any import tax are charged " +
    "at checkout on ariashop.pe. Link shoppers only to product_url (Aria's own product page).",
};

/* The exchange rate gets this long beside the index load; past it the
   answer leaves with price_pen null rather than late. */
const FX_BUDGET_MS = 2500;
/* Hosts whose own CDN serves this deploy's shards. Anything else (a
   forged Host header) reads the public site's. */
const OWN_HOST = /^(?:[a-z0-9-]+\.)*(?:ariashop\.pe|netlify\.app)$|^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/i;

const limiter = createRateLimiter({ limit: Number(process.env.MCP_RATE_LIMIT) || 60, windowMs: 60_000 });
const shardReaders = new Map();
function shardsFor(origin) {
  let r = shardReaders.get(origin);
  if (!r) { r = createShardReader({ origin }); shardReaders.set(origin, r); }
  return r;
}
export function originOf(event) {
  if (process.env.ARIA_SITE_ORIGIN) return process.env.ARIA_SITE_ORIGIN.replace(/\/+$/, "");
  const host = String((event.headers && (event.headers.host || event.headers.Host)) || "");
  return OWN_HOST.test(host) ? (host.startsWith("localhost") || host.startsWith("127.") ? "http://" : "https://") + host : SITE;
}

/**
 * The app the transport serves. `opts` lets tests and mcp-server.js
 * supply the rate, the clock, a logger, a limiter or the shard reader.
 */
export function createApp(opts = {}) {
  return {
    server: SERVER_INFO,
    limiter: opts.limiter === undefined ? limiter : opts.limiter,
    log: opts.log,
    now: opts.now,
    tools: museTools(async () => {
      const fxP = opts.fx !== undefined ? Promise.resolve(opts.fx) : within(sellRate(), FX_BUDGET_MS);
      const search = loadSearch({ labels: LABELS });
      const fx = await fxP;
      return { search, labels: LABELS, fx: Number(fx) > 0 ? Number(fx) : null, shards: opts.shards || shardsFor(opts.origin || SITE) };
    }),
  };
}

export async function handler(event, _context, opts = {}) {
  try { connectLambda(event); } catch { /* not on Netlify (tests, mcp-server.js): no stored rate */ }
  const body = event.body == null ? "" : event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    const out = await handleMcp(
      { method: event.httpMethod, headers: event.headers || {}, body },
      createApp({ origin: originOf(event), ...opts }),
    );
    return { statusCode: out.status, headers: out.headers, body: out.body };
  } catch (e) {
    /* The transport catches tool faults itself; this is the last net. */
    console.error(JSON.stringify({ at: new Date().toISOString(), svc: "mcp", event: "crash", error: String((e && e.stack) || e) }));
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error." } }),
    };
  }
}
