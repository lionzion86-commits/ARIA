/* ============================================================
   THE MUSE CONNECTOR, TESTED.

   RUN:  node scripts/test/mcp-tests.mjs

   WHY THIS IS NOT A GROUP INSIDE run-tests.mjs. It should be, and it
   should move there the day that suite loads again. As of 2026-10-03
   run-tests.mjs cannot even be imported on main: it imports
   netlify/functions/_combo-validate.js, which is not in the tree, and
   behind that scripts/lib/retailers.js has four unbalanced braces.
   Both were reported on 2026-09-28 and are still open. Parking these
   checks inside a file that throws on load would mean shipping a
   connector nobody can test, so they live here and run today.

   WHAT IS ACTUALLY EXERCISED. The real slices out of the real
   index.html, the real catalogue off disk, and the real JSON-RPC
   handler. The only things stubbed are the clock (for the rate
   limiter) and the exchange rate (SUNAT is unreachable from CI).
   ============================================================ */
import { strict as assert } from "node:assert";
import { loadPageEngine } from "../lib/mcp/page-slices.mjs";
import { buildCatalog, productIdFor } from "../lib/mcp/catalog.mjs";
import { pricePen, discountPct, freightForWeight, createFxCache, FX_SOURCES } from "../lib/mcp/pricing.mjs";
import { TOOL_DEFINITIONS, searchProducts, getProduct, InvalidInput } from "../lib/mcp/tools.mjs";
import { handleMcpRequest, createRateLimiter, httpStatusFor, clientIdFor } from "../lib/mcp/server.mjs";

let passed = 0;
const failures = [];
const groups = [];
function group(name) { groups.push(name); console.log(`\n  ${name}`); }
async function check(name, fn) {
  try { await fn(); passed++; console.log(`    ok   ${name}`); }
  catch (err) { failures.push(`${name}\n         ${err.message}`); console.log(`    FAIL ${name}\n         ${err.message}`); }
}

/* Built once — the catalogue is ~11s and every check reads the same one. */
const engine = loadPageEngine();
const catalog = buildCatalog({ engine });
const FX = { venta: 3.512, compra: 3.498, fetchedAt: Date.now(), error: null };
const ctx = { catalog, fx: FX };
const callTool = (body, deps = {}) =>
  handleMcpRequest({ method: "POST", headers: {}, body },
    { catalog, fx: { get: () => FX }, log: () => {}, ...deps });

/* ============================================================ */
group("the site's own code is what runs");

await check("the catalogue is the site's, and it is not half empty", () => {
  /* A FLOOR, NOT AN EXACT COUNT: the catalogue grows every week, so
     pinning 127,220 would fail on the next scrape. What must never
     happen is the connector quietly serving a fraction of the shop —
     which is exactly what the first build of this did (every price
     threw, and it reported zero shippable products as though that were
     a fact about the data). */
  assert.ok(catalog.stats.kept > 100_000, `only ${catalog.stats.kept} products in the pool`);
  assert.equal(catalog.stats.threw, 0, `${catalog.stats.threw} products failed to price`);
  assert.ok(catalog.stats.files >= 55, `only ${catalog.stats.files} catalogue files read`);
  assert.deepEqual(catalog.stats.missing, [], "catalogue files named by index.html are missing from the repo");
});

await check("the slices come from index.html, not from a copy here", () => {
  /* If anyone re-implements these server-side, this is the check that
     should start failing — the functions must be the page's own. */
  const src = engine.pricing.normalizeLiveItem.toString();
  assert.ok(/dutiableUsd/.test(src), "normalizeLiveItem is not the page's function");
  assert.ok(/tieredMarginUsd/.test(src), "the tiered margin is not being applied by the page's own code");
});

await check("the tiered margin is the page's, on its own worked examples", () => {
  /* index.html's comment states these three. They are the margin. */
  assert.equal(engine.pricing.tieredMarginUsd(100), 24);
  assert.equal(engine.pricing.tieredMarginUsd(1000), 210);
  assert.equal(engine.pricing.tieredMarginUsd(6000), 830);
  /* Marginal, so it never goes backwards as the price rises. */
  let prev = -1;
  for (let p = 50; p <= 8000; p += 50) {
    const m = engine.pricing.tieredMarginUsd(p);
    assert.ok(m >= prev, `margin went backwards at $${p}`);
    prev = m;
  }
});

await check("a tax-exempt store is not charged the Miami 7%, a taxable one is", () => {
  /* The bug a hand-port would almost certainly have shipped: applying
     1.07 everywhere. Walmart is enrolled and exempt; Macy's refuses
     resale and pays it. */
  const exempt = engine.pricing.normalizeLiveItem({ title: "Thing", price: 100 }, { retailer: "walmart" });
  const taxed = engine.pricing.normalizeLiveItem({ title: "Thing", price: 100 }, { retailer: "macys" });
  assert.equal(exempt.price, 124, "walmart (exempt) should be the margin alone");
  assert.equal(taxed.price, engine.pricing.round2(124 * 1.07), "macys (taxable) should carry the 7%");
  assert.equal(exempt.dutiableUsd, 100, "the dutiable base is the acquisition cost, not the marked-up price");
  assert.equal(taxed.dutiableUsd, 107);
});

/* ============================================================ */
group("prices the connector computes itself");

await check("soles come from the venta rate, and are never invented", () => {
  assert.equal(pricePen(100, { venta: 3.5 }), 350);
  assert.equal(pricePen(44.58, { venta: 3.512 }), 156.56);
  /* NO RATE MEANS NO NUMBER. A storefront whose argument is "the price
     you see is the price you pay" must not guess an exchange rate. */
  assert.equal(pricePen(100, null), null, "a missing rate produced a price anyway");
  assert.equal(pricePen(100, { venta: null }), null);
  assert.equal(pricePen(0, { venta: 3.5 }), null);
});

await check("freight is the page's $13/kg, not a second copy of it", () => {
  assert.equal(engine.pricing.CHARGE_PER_KG_USD, 13, "the public freight rate changed");
  assert.equal(freightForWeight(2, engine), 26);
  assert.equal(freightForWeight(0.23, engine), 2.99);
  assert.equal(freightForWeight(0, engine), null);
  assert.equal(freightForWeight(null, engine), null);
});

await check("a discount percentage needs a real original price", () => {
  assert.equal(discountPct(50, 100), 50);
  assert.equal(discountPct(44.58, 63.69), 30);
  assert.equal(discountPct(100, 100), null, "an equal 'original' is not a discount");
  assert.equal(discountPct(100, 90), null, "an original below the price is not a discount");
  assert.equal(discountPct(100, null), null);
});

await check("a stale real rate is kept, and a never-fetched one stays null", async () => {
  let calls = 0;
  const fx = createFxCache({
    sources: ["https://one"],
    fetchImpl: async () => { calls++; if (calls === 1) return { ok: true, json: async () => ({ venta: 3.5, compra: 3.49 }) }; throw new Error("source down"); },
  });
  await fx.warm();
  assert.equal(fx.get().venta, 3.5);
  const dead = createFxCache({ sources: ["https://one"], fetchImpl: async () => { throw new Error("source down"); } });
  await dead.warm();
  assert.equal(dead.get().venta, null, "a failed first fetch must not produce a rate");
  assert.ok(dead.get().error, "the failure is not recorded");
});

await check("the site's own rate endpoint is tried before the upstream", async () => {
  /* Same rate the shopper is charged at checkout, and apis.net.pe 429s
     on repeated direct hits — the site's function is CDN-cached. */
  assert.match(FX_SOURCES[0], /ariashop\.pe\/\.netlify\/functions\/exchange-rate/,
    "the site's own exchange-rate endpoint is not the first source tried");
  const tried = [];
  const fx = createFxCache({
    sources: ["https://first", "https://second"],
    fetchImpl: async (url) => {
      tried.push(url);
      if (url === "https://first") throw new Error("down");
      return { ok: true, json: async () => ({ venta: 3.6, compra: 3.58 }) };
    },
  });
  await fx.warm();
  assert.deepEqual(tried, ["https://first", "https://second"], "the fallback source was not tried in order");
  assert.equal(fx.get().venta, 3.6);
});

await check("an implausible rate is refused rather than passed on as soles", async () => {
  /* A source answering 200 with nonsense is worse than one that is
     down: it would quietly multiply every price on the storefront. */
  for (const venta of [0, 0.4, 250, -3]) {
    const fx = createFxCache({
      sources: ["https://bad"],
      fetchImpl: async () => ({ ok: true, json: async () => ({ venta, compra: venta }) }),
    });
    await fx.warm();
    assert.equal(fx.get().venta, null, `a venta rate of ${venta} was accepted`);
  }
});

/* ============================================================ */
group("the two tools answer, and refuse bad input readably");

await check("tools/list advertises exactly the two tools, with the brief's descriptions", async () => {
  const res = await callTool({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const tools = res.body.result.tools;
  assert.equal(tools.length, 2, "Phase 1 is two tools; a third has appeared");
  assert.deepEqual(tools.map((t) => t.name).sort(), ["get_product", "search_products"]);
  assert.equal(tools.find((t) => t.name === "search_products").description,
    "Search Aria's catalog of US-store products available for delivery to Peru. Returns products with USD and PEN prices, discount info, and images.");
  assert.equal(tools.find((t) => t.name === "get_product").description,
    "Get full details for one Aria product: description, all images, sizes, weight, freight estimate to Peru, and import-tax handling.");
});

await check("no cart, checkout or order tool is reachable on this surface", async () => {
  /* Phase 1 is read-only. These names belong to later phases and must
     not be discoverable, nor callable by guessing. */
  for (const name of ["add_to_cart", "get_cart", "checkout", "track_order", "create_order"]) {
    assert.ok(!TOOL_DEFINITIONS.some((t) => t.name === name), `${name} is advertised`);
    const res = await callTool({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {} } });
    assert.equal(res.body.error.code, -32602, `${name} was not refused`);
  }
});

await check("search returns priced products with both currencies", () => {
  const out = searchProducts({ query: "hoodie", limit: 5 }, ctx);
  assert.ok(out.products.length > 0, "no hoodies found in a catalogue of 127k products");
  for (const p of out.products) {
    assert.ok(p.id && typeof p.id === "string", "a product has no id");
    assert.ok(p.title, "a product has no title");
    assert.ok(p.price_usd > 0, "a product has no USD price");
    assert.equal(p.price_pen, Math.round(p.price_usd * FX.venta * 100) / 100, "PEN is not the USD at the venta rate");
    assert.equal(p.store, p.store.toLowerCase());
  }
});

await check("every filter actually filters", () => {
  const max = searchProducts({ query: "shoes", max_price_usd: 50, limit: 30 }, ctx);
  for (const p of max.products) assert.ok(p.price_usd <= 50, `${p.title} is $${p.price_usd}, over the $50 cap`);

  const store = searchProducts({ query: "shoes", store: "walmart", limit: 20 }, ctx);
  for (const p of store.products) assert.equal(p.store, "walmart");

  const sale = searchProducts({ query: "dress", on_sale_only: true, limit: 20 }, ctx);
  for (const p of sale.products) {
    assert.ok(p.original_price_usd > p.price_usd, `${p.title} is flagged on sale with no real markdown`);
    assert.ok(p.discount_pct > 0);
  }
  const brand = searchProducts({ query: "shoes", brand: "Nike", limit: 20 }, ctx);
  for (const p of brand.products) assert.equal(String(p.brand).toLowerCase().replace(/[^a-z0-9]/g, ""), "nike");
});

await check("a narrowing filter does not starve the result list", () => {
  /* THE BUG THIS PINS, measured: ranking the top 240 and filtering that
     to one store saw 6 of the 43 Walmart shoes and answered a limit-20
     request with 6 products. Ranking is nearly free in the width, so
     the filter now runs over a wide list. */
  const narrow = searchProducts({ query: "shoes", store: "walmart", limit: 20 }, ctx);
  assert.ok(narrow.products.length >= 20,
    `a filtered search returned ${narrow.products.length} of a requested 20 — the over-fetch is too small again`);
  for (const p of narrow.products) assert.equal(p.store, "walmart");
  /* …and the same must hold for a price cap, the other narrow filter a
     shopper actually uses. */
  const cheap = searchProducts({ query: "shoes", max_price_usd: 40, limit: 20 }, ctx);
  assert.ok(cheap.products.length >= 20,
    `a price-capped search returned ${cheap.products.length} of a requested 20`);
});

await check("limit is honoured and bounded", () => {
  assert.equal(searchProducts({ query: "shirt", limit: 3 }, ctx).products.length, 3);
  assert.ok(searchProducts({ query: "shirt" }, ctx).products.length <= 20, "the default limit is not 20");
  for (const bad of [0, 51, 1000, 2.5, -1]) {
    assert.throws(() => searchProducts({ query: "shirt", limit: bad }, ctx), InvalidInput, `limit ${bad} was accepted`);
  }
});

await check("bad input is refused with a sentence an agent can act on", () => {
  const cases = [
    [{}, /"query" is required/],
    [{ query: "" }, /"query" is required/],
    [{ query: "   " }, /"query" is required/],
    [{ query: 42 }, /"query" must be a string/],
    [{ query: "x", limit: 500 }, /from 1 to 50/],
    [{ query: "x", max_price_usd: "cheap" }, /"max_price_usd" must be a number/],
    [{ query: "x", on_sale_only: "yes" }, /"on_sale_only" must be true or false/],
    [{ query: "x", colour: "red" }, /unknown argument "colour"/],
  ];
  for (const [args, re] of cases) {
    try { searchProducts(args, ctx); assert.fail(`${JSON.stringify(args)} was accepted`); }
    catch (e) {
      assert.ok(e instanceof InvalidInput, `${JSON.stringify(args)} threw ${e.name}, not InvalidInput`);
      assert.match(e.message, re);
      assert.ok(!/\n\s+at /.test(e.message), "the message carries a stack trace");
    }
  }
});

await check("get_product returns the full record for a real id", () => {
  /* Driven off a real search hit rather than a hardcoded id, because
     ids are content-derived and move when the catalogue is rescraped. */
  const hit = searchProducts({ query: "hoodie", limit: 1 }, ctx).products[0];
  const full = getProduct({ product_id: hit.id }, ctx);
  assert.equal(full.id, hit.id);
  assert.equal(full.price_usd, hit.price_usd);
  assert.ok(Array.isArray(full.images), "images is not a list");
  assert.ok(Array.isArray(full.sizes), "sizes is not a list");
  assert.ok(full.weight_kg === null || full.weight_kg > 0, "weight is neither absent nor positive");
  if (full.weight_kg) {
    assert.equal(full.freight_estimate_usd, Math.round(full.weight_kg * 13 * 100) / 100,
      "the freight estimate is not weight x $13/kg");
  }
  assert.ok(full.dutiable_usd > 0, "no dutiable base — customs would be assessed on the wrong number");
  assert.ok(full.dutiable_usd < full.price_usd, "the dutiable base must be below the marked-up price");
});

await check("get_product on an unknown id says so instead of crashing", async () => {
  const res = await callTool({ jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "get_product", arguments: { product_id: "definitely-not-a-real-id" } } });
  assert.equal(res.status, 200, "a missing product should not be a transport error");
  assert.equal(res.body.result.isError, true);
  assert.match(res.body.result.content[0].text, /No product with id/);
  assert.ok(!/\n\s+at /.test(res.body.result.content[0].text), "a stack trace reached the agent");
});

await check("product ids are stable and collision-free across the catalogue", () => {
  assert.equal(productIdFor("walmart", "A Shirt"), productIdFor("walmart", "A Shirt"));
  assert.notEqual(productIdFor("walmart", "A Shirt"), productIdFor("target", "A Shirt"));
  /* byId is built by insertion; if two products hashed the same the
     pool and the map would disagree in size. */
  assert.equal(catalog.byId.size, catalog.items.length, "two products share an id");
});

/* ============================================================ */
group("the MCP protocol itself");

await check("initialize answers with the protocol version and the server's identity", async () => {
  const res = await callTool({ jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "muse", version: "1" } } });
  assert.equal(res.status, 200);
  assert.equal(res.body.result.protocolVersion, "2025-06-18");
  assert.equal(res.body.result.serverInfo.name, "aria-shop");
  assert.ok(res.body.result.capabilities.tools, "the server does not advertise tools");
});

await check("a malformed request is a 400 with a readable message, not a stack trace", async () => {
  const bad = [
    [{ jsonrpc: "1.0", id: 1, method: "tools/list" }, /"jsonrpc" must be "2.0"/],
    [{ jsonrpc: "2.0", id: 1 }, /"method" is required/],
    ["__PARSE_ERROR__", /not valid JSON/],
  ];
  for (const [body, re] of bad) {
    const res = await callTool(body);
    assert.equal(res.status, 400, `${JSON.stringify(body)} did not return 400`);
    assert.match(res.body.error.message, re);
    assert.ok(!/\n\s+at /.test(res.body.error.message), "a stack trace reached the client");
  }
  /* The acceptance criterion, exactly: a tools/call with no query. */
  const missing = await callTool({ jsonrpc: "2.0", id: 9, method: "tools/call",
    params: { name: "search_products", arguments: {} } });
  assert.equal(missing.status, 400, "a missing required argument did not return 400");
  assert.match(missing.body.error.message, /"query" is required/);
});

await check("an unknown method is refused by name", async () => {
  const res = await callTool({ jsonrpc: "2.0", id: 1, method: "resources/list" });
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /Unknown method "resources\/list"/);
});

await check("notifications are handled and never answered", async () => {
  const res = await callTool({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(res.status, 202, "a notification was given a response body");
});

await check("a batch is answered one entry at a time", async () => {
  const res = await callTool([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[1].result.tools.length, 2);
});

await check("CORS is open for review, and says where to narrow it", async () => {
  const res = await callTool({ jsonrpc: "2.0", id: 1, method: "ping" });
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../lib/mcp/server.mjs", import.meta.url), "utf8"));
  assert.match(src, /TO LOCK DOWN/, "nothing tells the next person where to restrict CORS");
});

await check("httpStatusFor keeps successes at 200", () => {
  assert.equal(httpStatusFor({ jsonrpc: "2.0", id: 1, result: {} }), 200);
  assert.equal(httpStatusFor({ jsonrpc: "2.0", id: 1, error: { code: -32602 } }), 400);
  assert.equal(httpStatusFor({ jsonrpc: "2.0", id: 1, error: { code: -32601 } }), 404);
  assert.equal(httpStatusFor([{}, {}]), 200, "a batch must not be given an error status");
});

/* ============================================================ */
group("rate limiting and logging");

await check("the 61st request in a minute is a 429 with Retry-After", async () => {
  let t = 1_000_000;
  const limiter = createRateLimiter({ limit: 60, windowMs: 60_000, now: () => t });
  const fire = () => handleMcpRequest(
    { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" }, body: { jsonrpc: "2.0", id: 1, method: "ping" } },
    { catalog, fx: { get: () => FX }, limiter, log: () => {} });

  for (let i = 1; i <= 60; i++) {
    const r = await fire();
    assert.equal(r.status, 200, `request ${i} of 60 was rejected`);
  }
  const over = await fire();
  assert.equal(over.status, 429, "the 61st request was not rate limited");
  assert.ok(Number(over.headers["Retry-After"]) >= 1, "no Retry-After header");
  assert.match(over.body.error.message, /Rate limit exceeded/);

  /* The window really does reopen. */
  t += 60_001;
  assert.equal((await fire()).status, 200, "the limit never resets");
});

await check("a batch is charged per entry, not per request", async () => {
  /* THE HOLE THIS CLOSES. The limiter ran once per HTTP request and
     the batch branch sat above it, so one POST carrying a thousand
     batched tool calls was a thousand searches for the price of one —
     the 60/min limit meant nothing to anyone willing to send an array. */
  let t = 3_000_000;
  const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, now: () => t });
  const fire = (body) => handleMcpRequest(
    { method: "POST", headers: { "x-forwarded-for": "198.51.100.7" }, body },
    { catalog, fx: { get: () => FX }, limiter, log: () => {} });

  const six = Array.from({ length: 6 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }));
  assert.equal((await fire(six)).status, 200, "a six-entry batch inside the limit was rejected");
  /* Six spent of ten. A second six must not fit. */
  assert.equal((await fire(six)).status, 429, "a batch was not charged for what it contains");
});

await check("an oversized batch is refused rather than half-served", async () => {
  const huge = Array.from({ length: 500 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }));
  const res = await callTool(huge);
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /at most 20 requests \(got 500\)/);
});

await check("a pathological query cannot hang the server", () => {
  /* A public endpoint with no auth is a public CPU. The input cap is
     200 characters; this is what the worst 200 characters cost. */
  const nasty = [
    "a".repeat(200),
    "zapatillas ".repeat(18).slice(0, 200),
    "qwjklxz ".repeat(25).slice(0, 200),
    "ñ".repeat(100),
  ];
  for (const q of nasty) {
    const t0 = Date.now();
    searchProducts({ query: q, limit: 20 }, ctx);
    const ms = Date.now() - t0;
    assert.ok(ms < 3000, `a 200-character query took ${ms}ms`);
  }
  assert.throws(() => searchProducts({ query: "x".repeat(201) }, ctx), InvalidInput,
    "the query length cap is not enforced");
});

await check("one client's burst does not throttle another", async () => {
  let t = 2_000_000;
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => t });
  const fire = (ip) => handleMcpRequest(
    { method: "POST", headers: { "x-forwarded-for": ip }, body: { jsonrpc: "2.0", id: 1, method: "ping" } },
    { catalog, fx: { get: () => FX }, limiter, log: () => {} });
  await fire("198.51.100.1"); await fire("198.51.100.1");
  assert.equal((await fire("198.51.100.1")).status, 429);
  assert.equal((await fire("198.51.100.2")).status, 200, "a second client inherited the first one's limit");
});

await check("the client is identified through the proxy headers", () => {
  assert.equal(clientIdFor({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), "1.2.3.4");
  assert.equal(clientIdFor({ "x-nf-client-connection-ip": "9.9.9.9" }), "9.9.9.9");
  assert.equal(clientIdFor({}), "unknown");
});

await check("every tool call is logged with name, inputs, latency and status", async () => {
  const lines = [];
  /* THE HEADER IS THE POINT, and the first version of this check did
     not send one: with no x-forwarded-for, clientIdFor answers
     "unknown", so an assertion that no raw IP is logged could never
     fail however the hashing broke. A real address goes in, and what
     comes out must not be it. */
  const withIp = (body, log) => handleMcpRequest(
    { method: "POST", headers: { "x-forwarded-for": "203.0.113.42" }, body },
    { catalog, fx: { get: () => FX }, log });
  await withIp({ jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "search_products", arguments: { query: "hoodie", limit: 2 } } }, (e) => lines.push(e));
  const call = lines.find((l) => l.event === "tool_call");
  assert.ok(call, "no tool_call was logged");
  assert.equal(call.tool, "search_products");
  assert.deepEqual(call.args, { query: "hoodie", limit: 2 });
  assert.equal(call.ok, true);
  assert.equal(typeof call.ms, "number");
  assert.equal(call.results, 2);
  /* The id is a hash, not an address: the log tells one caller from
     another without recording who they are. */
  assert.ok(call.client, "no client id was logged");
  assert.ok(!call.client.includes("203.0.113.42"), "the raw IP was written to the log");
  assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(call.client), "an IP-shaped string was written to the log");
  /* …and it is still stable, or it cannot tell two callers apart. */
  const again = [];
  await withIp({ jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "search_products", arguments: { query: "shirt", limit: 1 } } }, (e) => again.push(e));
  assert.equal(again.find((l) => l.event === "tool_call").client, call.client,
    "the same client hashed to two different ids");

  const bad = [];
  await withIp({ jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "search_products", arguments: {} } }, (e) => bad.push(e));
  const failed = bad.find((l) => l.event === "tool_call");
  assert.equal(failed.ok, false);
  assert.equal(failed.kind, "invalid_input");
});

/* ============================================================ */
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
