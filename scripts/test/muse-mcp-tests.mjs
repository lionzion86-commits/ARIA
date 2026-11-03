/* ==================================================================
   THE MUSE CONNECTOR, PHASE 1 (#443 c.6578981079) -- ACCEPTANCE.

   Calls netlify/functions/mcp.js's handler in-process, with Netlify-
   shaped events, against the real search index and the real product
   page shards on disk. Only two things are pinned: the exchange rate
   (SUNAT is not reachable from here) and, where a check needs one, a
   fresh rate limiter. It also measures cold start (a fresh node
   process) and warm p50/p95 latency and prints them.

     node scripts/test/muse-mcp-tests.mjs        (npm run test:muse-mcp)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const { handler } = await import("../../netlify/functions/mcp.js");
const { createRateLimiter, LATEST_PROTOCOL_VERSION } = await import("../../netlify/functions/_mcp-protocol.js");
const T = await import("../../netlify/functions/_muse-tools.js");
const { loadSearch, cardOf } = await import("../../netlify/functions/_search-core.js");
const { LABELS } = await import("../../netlify/functions/search.js");
const { productIdFor } = await import("../../netlify/functions/_checkout-model.js");
const { isOffSaleRetailer } = await import("../lib/off-sale.js");
const { productId: indexProductId } = await import("../build-search-index.mjs");
const { liftPage } = await import("../build-pdp-slices.mjs");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const group = (name) => console.log("\n  " + name);

const FX = 3.38;
const logs = [];
const log = (e) => logs.push(e);
/* Every call but the rate-limit checks runs unlimited. */
async function post(body, { headers = {}, limiter = null, fx = FX, raw = false } = {}) {
  const r = await handler({
    httpMethod: "POST",
    headers: { host: "localhost", "content-type": "application/json", accept: "application/json, text/event-stream", "x-nf-client-connection-ip": "203.0.113.7", ...headers },
    body: raw ? body : JSON.stringify(body),
  }, {}, { fx, log, limiter });
  let json = null;
  try { json = r.body ? JSON.parse(r.body) : null; } catch { json = undefined; }
  return { status: r.statusCode, headers: r.headers, text: r.body, body: json };
}
let nextId = 1;
const rpc = (method, params, opts) => post({ jsonrpc: "2.0", id: nextId++, method, ...(params ? { params } : {}) }, opts);
const callTool = (name, args, opts) => rpc("tools/call", { name, arguments: args }, opts);
const out = (r) => r.body.result.structuredContent;

const SEARCH_DESC = "Search Aria's catalog of US-store products available for delivery to Peru. Returns products with USD and PEN prices, discount info, and images.";
const GET_DESC = "Get full details for one Aria product: description, all images, sizes, weight, freight estimate to Peru, and import-tax handling.";

/* ================================================================ */
group("the protocol");

await check("initialize: serverInfo aria-shop, tools capability, the client's version when we speak it", async () => {
  const r = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "muse-test", version: "1" } });
  assert.equal(r.status, 200);
  assert.equal(r.headers["Content-Type"], "application/json");
  const res = r.body.result;
  assert.equal(res.protocolVersion, "2025-06-18");
  assert.equal(res.serverInfo.name, "aria-shop");
  assert.match(res.serverInfo.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(res.capabilities, { tools: {} });
  const older = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "x", version: "1" } });
  assert.equal(older.body.result.protocolVersion, "2025-03-26");
  const unknown = await rpc("initialize", { protocolVersion: "1999-01-01", capabilities: {}, clientInfo: { name: "x", version: "1" } });
  assert.equal(unknown.body.result.protocolVersion, LATEST_PROTOCOL_VERSION, "an unknown version is answered with ours");
});

await check("notifications/initialized: 202, no body", async () => {
  const r = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(r.status, 202);
  assert.equal(r.text, "");
});

await check("tools/list: exactly the two tools, with the exact descriptions", async () => {
  const r = await rpc("tools/list");
  const tools = r.body.result.tools;
  assert.deepEqual(tools.map((t) => t.name), ["search_products", "get_product"]);
  assert.equal(tools[0].description, SEARCH_DESC);
  assert.equal(tools[1].description, GET_DESC);
  assert.deepEqual(tools[0].inputSchema.required, ["query"]);
  assert.deepEqual(Object.keys(tools[0].inputSchema.properties), ["query", "category", "brand", "store", "max_price_usd", "on_sale_only", "limit"]);
  assert.equal(tools[0].inputSchema.properties.limit.maximum, 50);
  assert.equal(tools[0].inputSchema.properties.limit.default, 20);
  assert.deepEqual(tools[1].inputSchema.required, ["product_id"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
});

await check("ping answers {}", async () => {
  const r = await rpc("ping");
  assert.deepEqual(r.body.result, {});
});

await check("GET is 405 with Allow (no server-initiated stream); DELETE too; OPTIONS is the CORS preflight", async () => {
  for (const m of ["GET", "DELETE"]) {
    const r = await handler({ httpMethod: m, headers: {} }, {});
    assert.equal(r.statusCode, 405, m);
    assert.equal(r.headers.Allow, "POST, OPTIONS");
  }
  const o = await handler({ httpMethod: "OPTIONS", headers: { origin: "https://example.test" } }, {});
  assert.equal(o.statusCode, 204);
  assert.equal(o.headers["Access-Control-Allow-Origin"], "*");
  assert.match(o.headers["Access-Control-Allow-Methods"], /POST/);
  assert.match(o.headers["Access-Control-Allow-Headers"], /MCP-Protocol-Version/);
  assert.match(readFileSync("netlify/functions/_mcp-protocol.js", "utf8"), /TO LOCK DOWN/, "the CORS lock-down note is where the origin is set");
});

await check("malformed requests are HTTP 400 with a JSON-RPC error (bad JSON, not JSON-RPC, empty batch)", async () => {
  const a = await post("{not json", { raw: true });
  assert.equal(a.status, 400); assert.equal(a.body.error.code, -32700);
  const b = await post({ hello: "world" });
  assert.equal(b.status, 400); assert.equal(b.body.error.code, -32600);
  const c = await post({ jsonrpc: "2.0", id: 1 });
  assert.equal(c.status, 400); assert.equal(c.body.error.code, -32600);
  const d = await post([]);
  assert.equal(d.status, 400);
  const e = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { "mcp-protocol-version": "1999-01-01" } });
  assert.equal(e.status, 400); assert.match(e.body.error.message, /Unsupported MCP-Protocol-Version/);
});

await check("unknown method -32601, unknown tool -32602, both readable", async () => {
  const m = await rpc("resources/list");
  assert.equal(m.body.error.code, -32601); assert.match(m.body.error.message, /tools\/call/);
  const t = await callTool("add_to_cart", {});
  assert.equal(t.body.error.code, -32602); assert.match(t.body.error.message, /search_products, get_product/);
});

await check("a batch is answered entry by entry (notifications dropped)", async () => {
  const r = await post([{ jsonrpc: "2.0", id: "a", method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: "b", method: "tools/list" }]);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map((x) => x.id), ["a", "b"]);
});

await check("a client that accepts only SSE gets the answer as one SSE message", async () => {
  const r = await rpc("ping", null, { headers: { accept: "text/event-stream" } });
  assert.equal(r.headers["Content-Type"], "text/event-stream");
  assert.match(r.text, /^event: message\ndata: \{"jsonrpc":"2.0","id":\d+,"result":\{\}\}\n\n$/);
});

/* ================================================================ */
group("validation (every tool, readable, no stack trace)");

const BAD = [
  ["search_products", {}, /"query" is required/],
  ["search_products", { query: "" }, /"query" is required/],
  ["search_products", { query: 42 }, /"query" must be a string/],
  ["search_products", { query: "x".repeat(121) }, /at most 120/],
  ["search_products", { query: "jeans", limit: 0 }, /whole number from 1 to 50/],
  ["search_products", { query: "jeans", limit: 51 }, /whole number from 1 to 50/],
  ["search_products", { query: "jeans", limit: "5" }, /whole number from 1 to 50/],
  ["search_products", { query: "jeans", max_price_usd: -5 }, /greater than 0/],
  ["search_products", { query: "jeans", max_price_usd: "100" }, /must be a number/],
  ["search_products", { query: "jeans", on_sale_only: "yes" }, /true or false/],
  ["search_products", { query: "jeans", color: "red" }, /unknown argument "color"/],
  ["get_product", {}, /"product_id" is required/],
  ["get_product", { product_id: 123 }, /must be a string/],
  ["get_product", { product_id: "../../etc/passwd" }, /id from search_products/],
  ["get_product", { product_id: "abc", extra: 1 }, /unknown argument "extra"/],
];
await check("missing query -> JSON-RPC -32602 'Invalid arguments for search_products: \"query\" is required'", async () => {
  const r = await callTool("search_products", {});
  assert.equal(r.status, 200);
  assert.equal(r.body.error.code, -32602);
  assert.equal(r.body.error.message, 'Invalid arguments for search_products: "query" is required (a non-empty string).');
});
await check(`${BAD.length} bad inputs: each a -32602 naming what to send, none with a stack trace`, async () => {
  for (const [tool, args, rx] of BAD) {
    const r = await callTool(tool, args);
    assert.equal(r.body.error && r.body.error.code, -32602, `${tool} ${JSON.stringify(args)}`);
    assert.match(r.body.error.message, rx, `${tool} ${JSON.stringify(args)}`);
    assert.doesNotMatch(r.text, /\n\s+at |\.js:\d+/, "no stack trace");
  }
});
await check("arguments that are not an object are refused", async () => {
  const r = await rpc("tools/call", { name: "search_products", arguments: ["hudi"] });
  assert.equal(r.body.error.code, -32602);
});
await check("an unknown product id is tool output (isError), not a protocol fault", async () => {
  const r = await callTool("get_product", { product_id: "zzzzzzzzzz" });
  assert.equal(r.body.result.isError, true);
  assert.match(r.body.result.content[0].text, /No product with id "zzzzzzzzzz"/);
});

/* ================================================================ */
group("search_products: the site's own search");

let hudi;
await check('{"query":"hudi","on_sale_only":true} returns hoodies on sale', async () => {
  hudi = out(await callTool("search_products", { query: "hudi", on_sale_only: true }));
  assert.equal(hudi.count, 20, "a full page");
  for (const p of hudi.products) {
    assert.match(p.title, /hood|sudadera|poler/i, p.title);
    assert.ok(p.discount_pct >= 5 && p.discount_pct <= 70, `${p.title}: ${p.discount_pct}%`);
    assert.ok(p.original_price_usd > p.price_usd, p.title);
  }
});

let nike;
await check('{"query":"zapatillas nike","max_price_usd":100} returns Nike shoes with USD and PEN', async () => {
  nike = out(await callTool("search_products", { query: "zapatillas nike", max_price_usd: 100 }));
  assert.ok(nike.count >= 10, `only ${nike.count}`);
  assert.equal(nike.exchange_rate_pen_per_usd, FX);
  for (const p of nike.products) {
    assert.ok(p.price_usd > 0 && p.price_usd <= 100, `${p.title} $${p.price_usd}`);
    assert.equal(p.price_pen, Math.round(p.price_usd * FX * 100) / 100);
    assert.match(p.brand + " " + p.title, /nike|jordan/i, p.title);
  }
});

await check("accent-insensitive and typo-tolerant like the search bar (\"camísetas\" = \"camisetas\", \"zapatilas\")", async () => {
  const a = out(await callTool("search_products", { query: "camísetas", limit: 10 }));
  const b = out(await callTool("search_products", { query: "camisetas", limit: 10 }));
  assert.deepEqual(a.products.map((p) => p.id), b.products.map((p) => p.id));
  const c = out(await callTool("search_products", { query: "zapatilas", limit: 10 }));
  assert.ok(c.count === 10, "the typo still finds shoes");
});

await check("search prices are the cards' prices (cardOf), every product has an image, no retailer links", async () => {
  const ctx = loadSearch({ labels: LABELS });
  const byId = new Map(ctx.products.map((p) => [p.id, p]));
  for (const p of [...hudi.products, ...nike.products]) {
    const card = cardOf(byId.get(p.id), FX, LABELS);
    assert.equal(p.price_usd, card.usd, p.title);
    assert.match(p.image_url, /^https?:\/\//);
    assert.ok(p.product_url.startsWith("https://ariashop.pe/producto.html?producto="), p.product_url);
  }
});

await check("filters: store (key or name), brand, limit, category", async () => {
  const s = out(await callTool("search_products", { query: "sneakers", store: "Foot Locker", limit: 5 }));
  assert.ok(s.count > 0 && s.products.every((p) => p.store === "footlocker"));
  const s2 = out(await callTool("search_products", { query: "sneakers", store: "footlocker", limit: 5 }));
  assert.deepEqual(s2.products.map((p) => p.id), s.products.map((p) => p.id));
  const b = out(await callTool("search_products", { query: "zapatillas", brand: "adidas", limit: 7 }));
  assert.equal(b.count, 7);
  assert.ok(b.products.every((p) => /^adidas\b/i.test(p.brand)), b.products.map((p) => p.brand).join(","));
  const c = out(await callTool("search_products", { query: "nike", category: "zapatillas", limit: 10 }));
  assert.ok(c.count > 0);
  assert.ok(c.products.every((p) => /shoe|sneaker|zapat|boot|slide|sandal|cleat|trainer|runner|dunk|air|max|force|jordan|low|high|mid|react|pegasus|vomero/i.test(p.title)), c.products.map((p) => p.title).join(" | "));
});

await check("off-sale stores never appear; asking for one says so", async () => {
  const r = out(await callTool("search_products", { query: "zapatillas", store: "target" }));
  assert.equal(r.count, 0);
  assert.match(r.note, /no longer sells from "target"/);
  for (const p of [...hudi.products, ...nike.products]) assert.ok(!isOffSaleRetailer(p.store), p.store);
});

let gatedRow = null;
await check("the shade gate: makeup with no shade list is left out of search (and said so)", async () => {
  const ctx = loadSearch({ labels: LABELS });
  const shards = T.createShardReader();
  const r = out(await callTool("search_products", { query: "labial", limit: 30 }));
  assert.ok(r.count > 0);
  for (const p of r.products) {
    const rec = await T.recordForRow(shards, ctx.products.find((x) => x.id === p.id));
    assert.ok(!T.shadeGated(rec), `gated product offered: ${p.title}`);
  }
  /* A gated product the index carries, for the get_product check below. */
  for (const p of ctx.products) {
    if (!T.mayBeShadeGated(p)) continue;
    const rec = await T.recordForRow(shards, p);
    if (rec && T.shadeGated(rec)) { gatedRow = p; break; }
  }
  assert.ok(gatedRow, "the catalogue has a gated product to test with");
  /* "delineador": the site's own search finds gated eyeliners among its
     first 30; the connector offers none of them and says so. */
  const { equivalentQuery } = await import("../../netlify/functions/_search-core.js");
  let siteGated = 0;
  for (const p of equivalentQuery(ctx, "delineador").hits.slice(0, 30)) {
    const rec = await T.recordForRow(shards, p);
    if (rec && T.shadeGated(rec)) siteGated++;
  }
  assert.ok(siteGated > 0, "the site search finds gated products for this query");
  const g = out(await callTool("search_products", { query: "delineador", limit: 30 }));
  for (const p of g.products) {
    const rec = await T.recordForRow(shards, ctx.products.find((x) => x.id === p.id));
    assert.ok(!T.shadeGated(rec), `gated product offered: ${p.title}`);
  }
  assert.match(g.note || "", /makeup product\(s\) were left out/);
});

await check("no exchange rate: price_pen is null and the answer says why (never a guessed rate)", async () => {
  const r = out(await callTool("search_products", { query: "hudi", limit: 3 }, { fx: null }));
  assert.ok(r.products.every((p) => p.price_pen === null));
  assert.equal(r.exchange_rate_pen_per_usd, null);
  assert.match(r.note, /price_pen is null/);
});

/* ================================================================ */
group("get_product: the product page's own data");

let detail;
await check("full detail for a real id: images, sizes, weight, freight estimate, description", async () => {
  /* A sized product with a gallery and a description. */
  const ctx = loadSearch({ labels: LABELS });
  const shards = T.createShardReader();
  const cand = out(await callTool("search_products", { query: "polera hombre", limit: 50 })).products;
  let id = null;
  for (const p of cand) {
    const rec = await T.recordForRow(shards, ctx.products.find((x) => x.id === p.id));
    if (rec && rec.sizes && rec.sizes.length > 1 && rec.images && rec.images.length > 1 && rec.description && rec.weightKg) { id = p.id; break; }
  }
  assert.ok(id, "found a sized product with a gallery");
  detail = out(await callTool("get_product", { product_id: id }));
  for (const k of ["id", "title", "brand", "store", "price_usd", "price_pen", "images", "description", "sizes", "weight_kg", "freight_estimate_usd", "dutiable_usd"]) {
    assert.ok(k in detail, `missing ${k}`);
  }
  assert.ok(detail.images.length > 1 && detail.images.every((u) => /^https?:\/\//.test(u)));
  assert.ok(detail.sizes.length > 1);
  assert.ok(detail.weight_kg > 0);
  assert.equal(detail.freight_estimate_usd, Math.round(detail.weight_kg * 13 * 100) / 100);
  assert.equal(detail.price_pen, Math.round(detail.price_usd * FX * 100) / 100);
  assert.ok(typeof detail.description === "string" && detail.description.length > 10);
  assert.ok((detail.description.match(/[.!?](\s|$)/g) || []).length <= 2, "1-2 sentences");
  assert.equal(detail.buyable, true);
  assert.ok(detail.product_url.startsWith("https://ariashop.pe/producto.html?"));
});

await check("get_product agrees with search_products on price, and with checkout's price index", async () => {
  const prices = JSON.parse(readFileSync("price-index.json", "utf8")).prices;
  let agree = 0, n = 0;
  for (const p of [...hudi.products, ...nike.products].slice(0, 30)) {
    const d = out(await callTool("get_product", { product_id: p.id }));
    assert.equal(d.price_usd, p.price_usd, `${p.title}: search $${p.price_usd}, product $${d.price_usd}`);
    const known = prices[productIdFor(p.store, p.title)];
    if (known) { n++; if (known.some((x, i) => (i === 0 || i === 2) && Math.abs(x - d.price_usd) < 0.011)) agree++; }
  }
  assert.ok(n >= 20 && agree / n >= 0.9, `${agree}/${n} match checkout's price index`);
});

await check("a gated product: buyable false with the reason", async () => {
  const d = out(await callTool("get_product", { product_id: gatedRow.id }));
  assert.equal(d.buyable, false);
  assert.match(d.not_buyable_reason, /Shade list pending/);
});

await check("sold out (Vuelve pronto, Danny's Q3): still listed in search, availability vuelve_pronto, buyable false with the reason", async () => {
  const { isVuelvePronto } = await import("../lib/vuelve-pronto.js");
  const r = out(await callTool("search_products", { query: "Vans Skate Slip-on Shoes Navy", store: "ccs", limit: 20 }));
  const sold = r.products.find((p) => p.title === "Vans Skate Slip-on Shoes - Navy");
  assert.ok(sold, "the sold-out shoe was hidden from search: " + r.products.map((p) => p.title).join(" | "));
  assert.equal(sold.availability, "vuelve_pronto");
  assert.equal(sold.buyable, false);
  for (const p of r.products) {
    const so = isVuelvePronto({ retailer: p.store, title: p.title });
    assert.equal(p.availability === "vuelve_pronto", so, p.title);
    if (!so) assert.ok(!("buyable" in p) && !("availability" in p), "an in-stock row carries no availability: " + p.title);
  }
  const d = out(await callTool("get_product", { product_id: sold.id }));
  assert.equal(d.buyable, false);
  assert.equal(d.availability, "vuelve_pronto");
  assert.match(d.not_buyable_reason, /^Vuelve pronto/);
  assert.ok(d.product_url.startsWith("https://ariashop.pe/producto.html?"), "still links to its page on Aria");
  const def = (await rpc("tools/list")).body.result.tools.find((t) => t.name === "search_products");
  assert.deepEqual(def.outputSchema.properties.products.items.properties.availability.enum, ["vuelve_pronto"]);
});

await check("no wholesale cost: Aria Perfumes (pre-priced) shows the shopper price, never a dutiable base", async () => {
  const ctx = loadSearch({ labels: LABELS });
  const perfume = ctx.products.find((p) => p.retailer === "ariaperfumes" && p.price > 60);
  assert.ok(perfume);
  const d = out(await callTool("get_product", { product_id: perfume.id }));
  assert.equal(d.price_usd, Math.round(perfume.price * 100) / 100, "the catalogue price is already Aria's price");
  assert.equal(d.dutiable_usd, null);
  assert.ok(d.import_tax_estimate_usd === 0 || d.import_tax_estimate_usd === null);
  assert.doesNotMatch(JSON.stringify(d), new RegExp(String(Math.round(perfume.price / 1.18 * 100) / 100).replace(".", "\\.")));
});

await check("never a retailer link: no output string carries the store's product URL", async () => {
  const ctx = loadSearch({ labels: LABELS });
  const shards = T.createShardReader();
  for (const p of nike.products.slice(0, 10)) {
    const rec = await T.recordForRow(shards, ctx.products.find((x) => x.id === p.id));
    const d = out(await callTool("get_product", { product_id: p.id }));
    if (rec && rec.url) assert.ok(!JSON.stringify(d).includes(rec.url), `${p.title} leaks ${rec.url}`);
    for (const [k, v] of Object.entries(d)) if (typeof v === "string" && /^https?:/.test(v)) assert.ok(v.startsWith("https://ariashop.pe/"), `${k}: ${v}`);
  }
});

/* ================================================================ */
group("one id, one product page");

await check("the shard hash and the search id are the site's own (producto.html, build-search-index)", () => {
  const P = liftPage(ROOT);
  for (const k of ["hoodie", "nike air max 90", "labial rojo", "café ñandú"]) assert.equal(T.pdpShard(k), P.pdpShard(k));
  for (const [r, u, t] of [["walmart", "https://www.walmart.com/ip/1", "X"], ["kohls", "", "Nike Court Vision"]]) assert.equal(T.productId(r, u, t), indexProductId(r, u, t));
});

await check("search ids resolve to the record producto.html shows (400 random rows)", async () => {
  const ctx = loadSearch({ labels: LABELS });
  const P = liftPage(ROOT);
  const shards = T.createShardReader();
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  let found = 0, exact = 0, samePage = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const p = ctx.products[Math.floor(rnd() * ctx.products.length)];
    if (p.finalPrice) continue;
    n++;
    const rec = await T.recordForRow(shards, p);
    if (!rec) continue;
    found++;
    if (T.productId(rec.retailer, rec.url, rec.name) === p.id) exact++;
    /* The page, opened with the product_url's tienda (and v), picks this record. */
    const cands = await shards.records(p.title);
    const own = cands.filter((c) => c.retailer === p.retailer);
    const pick = P.pickRecord(own.length === 1 && !own[0].src ? own : cands, (P.STORE_FILES[p.retailer] || []).concat(P.CATALOG_FILES), rec.v);
    if (pick === rec) samePage++;
  }
  assert.ok(found / n >= 0.97, `${found}/${n} rows have a product page record`);
  assert.ok(exact / found >= 0.9, `${exact}/${found} are the very listing`);
  assert.ok(samePage / found >= 0.97, `${samePage}/${found} are the record producto.html shows`);
});

await check("sizes are producto.html's truthfulSizes (same sizes, 2000 records)", async () => {
  const P = liftPage(ROOT);
  let n = 0;
  for (let s = 0; s < 4096 && n < 2000; s += 7) {
    const d = JSON.parse(readFileSync(`assets/pdp/p/${s.toString(16).padStart(3, "0")}.json`, "utf8"));
    for (const list of Object.values(d)) for (const rec of list) {
      if (!rec.sizes) continue;
      n++;
      assert.deepEqual([...T.truthfulSizes(rec.sizes)].sort(), [...P.truthfulSizes(rec.sizes)].sort(), JSON.stringify(rec.sizes));
    }
  }
  assert.ok(n >= 1000);
});

await check("shards come off disk, else from the deploy's own CDN (same URL producto.html fetches)", async () => {
  const urls = [];
  const fetchImpl = async (u) => { urls.push(u); const s = u.match(/p\/([0-9a-f]{3})\.json$/)[1]; return { ok: true, json: async () => JSON.parse(readFileSync(`assets/pdp/p/${s}.json`, "utf8")) }; };
  const cdn = T.createShardReader({ origin: "https://deploy-preview-9--aria.netlify.app", fetchImpl, read: () => { throw new Error("not bundled"); } });
  const disk = T.createShardReader();
  const title = detail.title;
  assert.deepEqual(await cdn.records(title), await disk.records(title));
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/deploy-preview-9--aria\.netlify\.app\/assets\/pdp\/p\/[0-9a-f]{3}\.json$/);
  await cdn.records(title);
  assert.equal(urls.length, 1, "cached");
  const { originOf } = await import("../../netlify/functions/mcp.js");
  assert.equal(originOf({ headers: { host: "ariashop.pe" } }), "https://ariashop.pe");
  assert.equal(originOf({ headers: { host: "deploy-preview-9--aria.netlify.app" } }), "https://deploy-preview-9--aria.netlify.app");
  assert.equal(originOf({ headers: { host: "evil.example" } }), "https://ariashop.pe", "a forged Host reads the public site");
});

await check("a CDN that fails: get_product says try again (no fault), search offers no unchecked makeup", async () => {
  const down = { records: async () => { throw new Error("HTTP 503"); } };
  const call = (args, name) => handler({ httpMethod: "POST", headers: { host: "localhost" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }, {}, { fx: FX, log, limiter: null, shards: down });
  const g = JSON.parse((await call({ product_id: detail.id }, "get_product")).body);
  assert.equal(g.result.isError, true);
  assert.match(g.result.content[0].text, /could not be loaded just now/);
  const s = JSON.parse((await call({ query: "delineador", limit: 20 }, "search_products")).body).result.structuredContent;
  const ctx = loadSearch({ labels: LABELS });
  for (const p of s.products) assert.ok(!T.mayBeShadeGated(ctx.products.find((x) => x.id === p.id)), p.title);
  const h = JSON.parse((await call({ query: "hudi", limit: 5 }, "search_products")).body).result.structuredContent;
  assert.equal(h.count, 5, "a search with no makeup in it does not need the shards");
});

/* ================================================================ */
group("limits and logs");

await check("61 rapid calls from one client: the 61st is 429 with Retry-After", async () => {
  const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
  const statuses = [];
  let last;
  for (let i = 0; i < 61; i++) {
    last = await callTool("search_products", { query: "hudi", limit: 1 }, { limiter });
    statuses.push(last.status);
  }
  assert.ok(statuses.slice(0, 60).every((s) => s === 200));
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers["Retry-After"]) >= 1 && Number(last.headers["Retry-After"]) <= 60);
  assert.match(last.body.error.message, /Rate limit exceeded: 60 requests per minute/);
  /* Another client is not affected; a forged X-Forwarded-For is not another client. */
  const other = await rpc("ping", null, { limiter, headers: { "x-nf-client-connection-ip": "198.51.100.9" } });
  assert.equal(other.status, 200);
  const forged = await rpc("ping", null, { limiter, headers: { "x-forwarded-for": "10.9.9.9" } });
  assert.equal(forged.status, 429);
});

await check("a batch is charged per entry", async () => {
  const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
  const ok = await post(Array.from({ length: 5 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" })), { limiter });
  assert.equal(ok.status, 200);
  const no = await rpc("ping", null, { limiter });
  assert.equal(no.status, 429);
});

await check("each tool call is logged: tool, inputs, latency, status -- and no raw IP", async () => {
  logs.length = 0;
  await callTool("search_products", { query: "hudi", limit: 2 });
  await callTool("search_products", {});
  const calls = logs.filter((e) => e.event === "tool_call");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.status), ["ok", "invalid_params"]);
  for (const c of calls) {
    assert.equal(c.tool, "search_products");
    assert.ok(typeof c.ms === "number");
    assert.ok("args" in c);
    assert.ok(/^[0-9a-f]{12}$/.test(c.client));
  }
  assert.ok(!JSON.stringify(logs).includes("203.0.113.7"), "the IP is hashed");
});

/* ================================================================ */
group("latency (local; a real Netlify cold start cannot be measured here)");

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
await check("cold start: the first call in a fresh node process", () => {
  const script = `
    process.chdir(${JSON.stringify(ROOT)});
    const t0 = performance.now();
    const { handler } = await import(${JSON.stringify(ROOT + "netlify/functions/mcp.js")});
    const call = (b) => handler({ httpMethod: "POST", headers: { host: "localhost" }, body: JSON.stringify(b) }, {}, { fx: 3.38, log: () => {}, limiter: null });
    const a = performance.now();
    const r1 = await call({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_products", arguments: { query: "zapatillas nike", max_price_usd: 100 } } });
    const b = performance.now();
    const id = JSON.parse(JSON.parse(r1.body).result.content[0].text).products[0].id;
    const r2 = await call({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_product", arguments: { product_id: id } } });
    const c = performance.now();
    console.log(JSON.stringify({ processToFirstAnswer: Math.round(b), importMs: Math.round(a - t0), firstSearchMs: Math.round(b - a), firstGetMs: Math.round(c - b), rss: Math.round(process.memoryUsage().rss / 1e6), ok: r1.statusCode === 200 && r2.statusCode === 200 }));`;
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const p = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", cwd: ROOT });
    const line = (p.stdout || "").trim().split("\n").pop();
    const r = JSON.parse(line);
    assert.ok(r.ok, p.stderr);
    runs.push(r);
  }
  const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
  console.log(`         cold (median of 3): first answer ${med("processToFirstAnswer")}ms after process start ` +
    `(module import ${med("importMs")}ms, first search ${med("firstSearchMs")}ms, then first get_product ${med("firstGetMs")}ms); RSS ${med("rss")}MB`);
  assert.ok(med("processToFirstAnswer") < 8000, "well inside Netlify's 10s synchronous limit");
});

await check("warm: p50 / p95 per tool", async () => {
  const QUERIES = ["vestido", "jeans mujer", "audifonos", "perfume hombre", "mochila", "polo", "zapatillas adidas", "reloj",
    "lego", "crema facial", "casaca", "short de baño", "botas", "gorra", "iphone", "bikini", "sandalias", "camisa", "medias", "lentes de sol"];
  const tSearch = [], tCached = [], tGet = [];
  const ids = [];
  for (const q of QUERIES) {
    const t = performance.now();
    const r = out(await callTool("search_products", { query: q, limit: 20 }));
    tSearch.push(performance.now() - t);
    ids.push(...r.products.slice(0, 3).map((p) => p.id));
    const t2 = performance.now();
    await callTool("search_products", { query: q, limit: 20, on_sale_only: true });
    tCached.push(performance.now() - t2);
  }
  for (const id of ids.slice(0, 50)) {
    const t = performance.now();
    await callTool("get_product", { product_id: id });
    tGet.push(performance.now() - t);
  }
  const f = (xs) => `p50 ${Math.round(pct(xs, 50))}ms / p95 ${Math.round(pct(xs, 95))}ms (n=${xs.length})`;
  console.log(`         warm search_products, new query:      ${f(tSearch)}`);
  console.log(`         warm search_products, repeat + filter: ${f(tCached)}`);
  console.log(`         warm get_product (shards on disk):     ${f(tGet)}`);
  assert.ok(pct(tSearch, 95) < 3000 && pct(tGet, 95) < 1000);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
