/* ==================================================================
   DSW STORE — BUILT, GATED, AND HONEST ABOUT WHAT IT DOES NOT HAVE
   (Issue #443, c.6323171170 as amended by c.6323202929).

   1. ZERO CATALOGUE: while dsw-catalog.json is the committed empty
      envelope, no DSW tile, rail, door, directory card or storefront
      renders anywhere (the no-dead-ends rule), and the pending flag
      agrees with the file in every mirror.
   2. FIXTURE CATALOGUE: with a tiny, clearly fake catalogue
      (scripts/test/fixtures/dsw-fixture.json, served by this test's own
      throwaway server in place of dsw-catalog.json, never by the site)
      the shopper's path renders end to end: Tiendas tile -> storefront
      ("Ofertas de DSW" first) -> product page -> cart.
   3. THE PULL: the cost estimator prints before anything runs, refuses
      to spend without --confirm-spend, and stops a run that projects
      materially above the quote. The ingest rules hold: USD per row,
      the sanity band quarantines, sizes exactly as scraped, shippable
      only, checksum-valid GTINs, the PDP's own sentences.

   RUNNING IT
     node scripts/test/dsw-store-tests.mjs
   The browser checks need Playwright + Chromium (PLAYWRIGHT_CHROMIUM or
   /opt/pw-browsers/chromium) and skip, loudly, without them. Local
   servers bind only ports 8960-8969.
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, symlinkSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import * as registry from "../lib/retailers.js";
import {
  DSW_KEY, OUT_FILE, pullPlan, estimatePull, spendCheck, ingestRow, ingestPull, validGtin, sizesOf,
  pdpSentences, productCount, currencyOf, emptyCatalog, costRatesFromEnv,
} from "../lib/dsw.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const FIXTURE = JSON.parse(readFileSync(ROOT + "scripts/test/fixtures/dsw-fixture.json", "utf8"));
const read = (rel) => readFileSync(ROOT + rel, "utf8");

let passed = 0, skipped = 0;
const failures = [];
async function check(name, fn) {
  try {
    const r = await fn();
    if (r === "skip") { skipped++; console.log("    SKIP " + name); return; }
    passed++; console.log("    ok   " + name);
  } catch (e) { failures.push(`${name}\n         ${e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n         ") : e}`); console.log("    FAIL " + name); }
}

const bundleName = () => /<script\s+src="\/(build\/app-[^"]+\.js)"><\/script>/.exec(read("index.html"))[1];
const bundleSrc = () => read(bundleName());
const tiendaStores = (html = read("tienda.html")) => JSON.parse(/var STORES = (\{.*\});/.exec(html)[1]);
const catalogNow = () => JSON.parse(read(OUT_FILE));

/* The bundle's registry, evaluated (the page is a plain script). */
function bundleRegistry(src = bundleSrc()) {
  const grab = (re) => { const m = re.exec(src); assert.ok(m, "missing in the bundle: " + re); return m[0]; };
  const code = [
    grab(/^const RETAILERS = \{[\s\S]*?\r?\n\};/m),
    grab(/^function retailerFor\(key\)\{[^\n]*\}/m),
    grab(/^function activeRetailers\(\)\{[^\n]*\}/m),
    grab(/^function storeDoorFor\(key\)\{[\s\S]*?\r?\n\}/m),
    "globalThis.__R = { RETAILERS, retailerFor, activeRetailers, storeDoorFor };",
  ].join("\n");
  /* The page loads /off-sale.js before the bundle; the bundle reads it. */
  const ctx = {};
  vm.createContext(ctx);
  if (existsSync(ROOT + "off-sale.js")) vm.runInContext(read("off-sale.js"), ctx);
  vm.runInContext("var isOffSaleRetailer = (k) => !!(globalThis.AriaOffSale && globalThis.AriaOffSale.isOffSaleRetailer(k));\n" + code, ctx);
  return ctx.__R;
}

/* ------------------------------------------------------------------
   1. THE ZERO STATE
   ------------------------------------------------------------------ */
console.log("\n  DSW — zero catalogue: nothing renders");

await check("dsw-catalog.json is the committed empty envelope (no invented product)", () => {
  const c = catalogNow();
  assert.equal(productCount(c), 0, "dsw-catalog.json has products: the pull landed; flip pendingCatalog and rebuild (see scripts/build-dsw-catalog.mjs)");
  assert.deepEqual(c, emptyCatalog(), "the zero state is exactly emptyCatalog()");
});

await check("the pending flag agrees with the catalogue in all three mirrors", () => {
  const empty = productCount(catalogNow()) === 0;
  const mod = registry.RETAILERS.dsw;
  const bun = bundleRegistry().RETAILERS.dsw;
  const tie = tiendaStores().dsw;
  for (const [where, row] of [["scripts/lib/retailers.js", mod], ["the app bundle", bun], ["tienda.html STORES", tie]]) {
    assert.ok(row, `DSW is missing from ${where}`);
    assert.equal(Boolean(row.pendingCatalog), empty, `${where}: pendingCatalog must be ${empty} while the catalogue has ${empty ? "no" : "real"} products`);
  }
  assert.equal(mod.label, "DSW"); assert.equal(bun.label, "DSW"); assert.equal(tie.label, "DSW");
  assert.equal(mod.color, bun.color, "registry colour drifted between mirrors");
  assert.equal(mod.color, tie.color, "storefront colour drifted from the registry");
  assert.equal(mod.search, false, "DSW never joins the live search fan-out");
  /* DSW is a store being launched, not one taken off sale: pendingCatalog
     hides it today, and nothing else may once the catalogue lands. */
  if (existsSync(ROOT + "off-sale.js")) {
    const ctx = {}; vm.createContext(ctx); vm.runInContext(read("off-sale.js"), ctx);
    assert.equal(ctx.AriaOffSale.isOffSaleRetailer(DSW_KEY), false, "DSW is on OFF_SALE_RETAILERS");
  }
  assert.equal(bun.search, false);
});

await check("a launched catalogue carries Spanish descriptions only, sizes as scraped, USD only", () => {
  /* Vacuous while the catalogue is empty; the gate the day it is not.
     The same word test translate-catalog-descriptions.mjs uses to find
     English: two or more core English words, outnumbering Spanish ones. */
  const EN = new Set("the and for with from that this your you are has have not but all made features designed perfect comfort comfortable durable lightweight soft".split(" "));
  const ES = new Set("el la los las un una de del en y con por para como muy sin sus".split(" "));
  const english = (s) => {
    const w = (String(s).toLowerCase().match(/[a-z]+/g) || []).filter((x) => x.length > 1);
    let en = 0, es = 0;
    for (const x of w) { if (EN.has(x)) en++; if (ES.has(x)) es++; }
    return w.length >= 3 && en >= 2 && en > es * 2;
  };
  const items = Object.values(catalogNow().retailers.dsw.departments || {}).flatMap((d) => d.items || []);
  for (const it of items) {
    assert.ok(!it.description || !english(it.description), `still English, run translate-catalog-descriptions.mjs: ${it.name}`);
    assert.ok(Array.isArray(it.availableSizes), `${it.name} has no size list (an empty one is honest; a missing one is not ingested)`);
    assert.equal(it.currency, "USD", `${it.name} is not USD`);
  }
});

await check("no logo is drawn: logo stays null until DSW's real mark is committed", () => {
  const mod = registry.RETAILERS.dsw, bun = bundleRegistry().RETAILERS.dsw, tie = tiendaStores().dsw;
  for (const row of [mod, bun, tie]) {
    if (row.logo) assert.ok(existsSync(ROOT + String(row.logo).replace(/^\//, "")), `logo ${row.logo} is named but not committed`);
  }
  assert.ok(!existsSync(ROOT + "logos/dsw.svg") || mod.logo, "a logo file exists but the registry does not use it");
  assert.match(read("scripts/lib/retailers.js"), /TODO\(dsw-logo\)/, "the missing logo is a marked TODO");
});

await check("the registry keeps a pending store out of every listing, door and count", () => {
  assert.ok(!registry.activeRetailers().some((r) => r.key === DSW_KEY), "module activeRetailers lists DSW");
  assert.ok(!registry.browsableRetailers().includes(DSW_KEY), "module browsableRetailers lists DSW");
  assert.ok(!registry.searchableRetailers().includes(DSW_KEY));
  assert.equal(registry.storeDoorFor(DSW_KEY), null, "a product page would open a door to an empty store");
  assert.ok(!registry.retailersByTier().some((t) => t.stores.some((s) => s.key === DSW_KEY)), "Tiendas directory tier lists DSW");
  const R = bundleRegistry();
  assert.ok(!R.activeRetailers().some((r) => r.key === DSW_KEY), "bundle activeRetailers lists DSW");
  assert.equal(R.storeDoorFor(DSW_KEY), null, "bundle storeDoorFor opens DSW");
});

await check("every home DSW rail ships [hidden] and is revealed only by the live registry row", () => {
  const html = read("index.html");
  const secs = [...html.matchAll(/<section[^>]*data-store-rail="dsw"[^>]*>/g)].map((m) => m[0]);
  assert.equal(secs.length, 3, "phone, desktop and tablet rails");
  for (const s of secs) {
    assert.match(s, /\shidden[\s>]/, "a DSW rail is not hidden");
    assert.match(s, /data-pending-catalog="dsw"/);
  }
  const src = bundleSrc();
  assert.match(src, /section\[data-pending-catalog\][\s\S]{0,200}!pr\.pendingCatalog\) sec\.hidden = false/, "the reveal reads the registry");
  assert.match(src, /TIENDAS_STRIP\.filter\(s => [^\n]*!\(retailerFor\(s\.k\) \|\| \{\}\)\.pendingCatalog\)/, "the Tiendas strip filters pending stores");
});

await check("tienda.html: no directory card, and ?tienda=dsw is the directory, not 'Catálogo en preparación'", () => {
  const html = read("tienda.html");
  assert.match(html, /Object\.keys\(STORES\)\.filter\(function\(k\)\{ return !STORES\[k\]\.pendingCatalog; \}\)/);
  assert.match(html, /if \(!key \|\| !STORES\[key\] \|\| STORES\[key\]\.pendingCatalog\)\{/);
  const idx = JSON.parse(read("assets/tienda/dsw/index.json"));
  assert.equal(idx.count, 0, "the storefront slice is empty while the catalogue is");
  assert.deepEqual(idx.rails, []);
});

await check("tiendas.html: the DSW link ships hidden and reveals only on a non-empty storefront", () => {
  const html = read("tiendas.html");
  assert.match(html, /<a class="store-card" href="tienda.html\?tienda=dsw" data-pending-catalog="dsw" hidden>DSW<\/a>/);
  assert.match(html, /if \(!j \|\| !\(j\.count > 0\)\) return;/);
});

await check("no derived surface carries a DSW product (home shelves, departments, search)", () => {
  const shelves = JSON.parse(read("assets/home/shelves/index.json"));
  assert.ok(!(shelves.stores || []).includes(DSW_KEY), "a home shelf for DSW exists");
  for (const d of ["shoes", "shoes_women", "shoes_men", "gym_rat"]) {
    const f = ROOT + `assets/sections/departamento/_fn/${d}.json`;
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, "utf8"));
    assert.ok(!Object.keys(j.labels || {}).includes(DSW_KEY), `${d} lists a DSW store chip`);
  }
});

await check("the fixture is test-only: no page or builder references it", () => {
  for (const f of readdirSync(ROOT).filter((n) => /\.(html|js|json|toml)$/.test(n))) {
    assert.ok(!readFileSync(ROOT + f, "utf8").includes("fixtures/dsw-fixture"), `${f} references the test fixture`);
  }
  for (const f of readdirSync(ROOT + "scripts").filter((n) => /\.(mjs|js)$/.test(n))) {
    assert.ok(!readFileSync(ROOT + "scripts/" + f, "utf8").includes("dsw-fixture"), `scripts/${f} references the test fixture`);
  }
  assert.match(FIXTURE._fixture, /FAKE TEST DATA/);
  for (const it of Object.values(FIXTURE.retailers.dsw.departments).flatMap((d) => d.items)) {
    assert.match(it.name, /^FIXTURE .*\(not a real product\)$/, "every fixture row says it is fake");
  }
});

/* ------------------------------------------------------------------
   2. INGEST RULES
   ------------------------------------------------------------------ */
console.log("\n  DSW — ingest rules");

const quota = { category: "sale", phase: 1, gender: null };
const baseRow = () => ({
  name: "Women's Example Runner", brand: "Brand", price: 49.99, originalPrice: 79.99, currency: "USD",
  images: ["https://img.example/a.jpg", { url: "https://img.example/b.jpg" }, "https://img.example/a.jpg", "http://insecure/c.jpg"],
  variants: [{ size: "7", inStock: true }, { size: "7.5", inStock: false }, { size: "8 W", inStock: true }],
  specifications: [{ name: "Weight", value: "1.2 lbs" }, { name: "UPC", value: "036000291452" }, { name: "Heel Height", value: "1 in" }],
  description: "<p>A light everyday runner.</p><p>Cushioned footbed for all day wear. Synthetic upper.</p>",
  breadcrumbs: ["Home", "Women", "Sneakers"],
});

await check("per-row currency: USD publishes; another currency or an unstated one is quarantined", () => {
  assert.ok(ingestRow(baseRow(), quota).item);
  const cad = ingestRow({ ...baseRow(), currency: "CAD" }, quota);
  assert.equal(cad.quarantine, "currency-CAD");
  const none = { ...baseRow() }; delete none.currency;
  assert.equal(ingestRow(none, quota).quarantine, "currency-unstated", "a bare price is not proof of USD");
  assert.equal(currencyOf({ price: "CA$49.99" }), "CA");
  assert.equal(currencyOf({ price: "US$49.99" }), "USD");
  const assumed = ingestRow(none, quota, { assumeUsd: true });
  assert.equal(assumed.item.currencyAssumed, true, "an assumed currency is flagged on the row");
});

await check("the sanity band quarantines (#432): too cheap, too dear, an absurd was-price", () => {
  assert.match(ingestRow({ ...baseRow(), price: 1553.39 }, quota).quarantine, /^price-outside-band/);
  assert.match(ingestRow({ ...baseRow(), price: 2 }, quota).quarantine, /^price-outside-band/);
  assert.equal(ingestRow({ ...baseRow(), price: 20, originalPrice: 900 }, quota).quarantine, "was-price-implausible");
  const r = ingestPull([{ quota, items: [baseRow(), { ...baseRow(), name: "X", price: 999 }] }]);
  assert.equal(r.stats.published, 1);
  assert.equal(r.quarantined.length, 1, "the held row is kept for a person, not silently dropped");
});

await check("sizes exactly as scraped: in-stock variants, the row's own words, never invented", () => {
  const it = ingestRow(baseRow(), quota).item;
  assert.deepEqual(it.availableSizes, ["7", "8 W"]);
  assert.equal(it.sizeSource, "variants-in-stock");
  assert.deepEqual(sizesOf({ sizes: ["Big Kid 4", " 5 "] }).sizes, ["Big Kid 4", "5"]);
  assert.deepEqual(sizesOf({}).sizes, [], "no list means no sizes, not a template run");
  const noStock = sizesOf({ variants: [{ size: "9" }, { size: "10" }] });
  assert.deepEqual(noStock.sizes, ["9", "10"]);
});

await check("real weight, specs, checksum-valid GTIN, gallery, the PDP's own sentences", async () => {
  const { specWeightKg } = await import("../../netlify/functions/_weight-resolve.js");
  const it = ingestRow(baseRow(), quota, { specWeightKg }).item;
  assert.equal(it.weightEstimated, false);
  assert.equal(it.weightKg, 0.54);
  assert.equal(it.gtin, "036000291452");
  assert.ok(it.specifications.some((s) => s.name === "Heel Height"));
  assert.deepEqual(it.images, ["https://img.example/a.jpg", "https://img.example/b.jpg"], "https only, de-duplicated");
  assert.equal(it.description, "A light everyday runner. Cushioned footbed for all day wear.");
  assert.equal(it.descriptionSource, "dsw-pdp");
  assert.ok(!validGtin("036000291453"), "a bad check digit is not a GTIN");
  const bad = ingestRow({ ...baseRow(), specifications: [{ name: "UPC", value: "12345" }] }, quota).item;
  assert.equal(bad.gtin, undefined);
  assert.equal(pdpSentences("One. Two. Three."), "One. Two.");
});

await check("shippable only: out of stock, store-only and oversize rows drop; the site's rule runs last", async () => {
  assert.equal(ingestRow({ ...baseRow(), inStock: false }, quota).drop, "out-of-stock");
  assert.equal(ingestRow({ ...baseRow(), shippingMessage: "In-store only" }, quota).drop, "store-only");
  assert.equal(ingestRow({ ...baseRow(), shippingMessage: "Oversized item, freight delivery" }, quota).drop, "oversize");
  assert.equal(ingestRow({ ...baseRow(), shipToHome: false }, quota).drop, "not-shippable");
  const { loadShippable } = await import("../build-store-slices.mjs");
  const ship = loadShippable(ROOT);
  assert.equal(ingestRow({ ...baseRow(), specifications: [{ name: "Weight", value: "40 lbs" }] }, quota,
    { isShippableItem: ship, specWeightKg: (await import("../../netlify/functions/_weight-resolve.js")).specWeightKg }).drop, "site-unshippable");
});

await check("buckets are the site's own (women/men/kids/purses), duplicates keep the sale copy and the best-seller rank", () => {
  const sale = { category: "sale", phase: 1 }, best = { category: "bestsellers", phase: 1 };
  const row = { ...baseRow(), productId: "P1" };
  const r = ingestPull([{ quota: sale, items: [row] }, { quota: best, items: [{ ...baseRow(), productId: "P0", name: "Men's Loafer", breadcrumbs: ["Men", "Loafers"] }, row] }]);
  const women = r.catalog.retailers.dsw.departments.women.items;
  assert.equal(women.length, 1);
  assert.equal(women[0].bestSellerRank, 2, "its place in DSW's best-sellers listing");
  assert.equal(r.catalog.retailers.dsw.departments.men.items[0].bestSellerRank, 1);
  const bag = ingestRow({ ...baseRow(), name: "Leather Crossbody Bag", breadcrumbs: ["Handbags"] }, quota);
  assert.equal(bag.bucket, "purses");
});

/* ------------------------------------------------------------------
   3. THE COST ESTIMATE AND THE SPEND GUARD
   ------------------------------------------------------------------ */
console.log("\n  DSW — the cost estimate comes first, and money needs a flag");

async function freePort(from = 8960, to = 8969) {
  for (let p = from; p <= to; p++) {
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error("no free port in 8960-8969");
}

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ROOT + "scripts/build-dsw-catalog.mjs", ...args], { cwd: ROOT, env: { ...process.env, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

/* A stand-in for the deployed functions, counting every call. */
async function stubSite(handler) {
  const port = await freePort();
  const calls = [];
  const srv = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    calls.push({ method: req.method, url: req.url, body });
    const out = handler(req, body, calls);
    res.writeHead(out.status || 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out.json));
  });
  await new Promise((r) => srv.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${port}`, calls, close: () => new Promise((r) => srv.close(r)) };
}

await check("the estimate: best sellers + all sale first, each quota priced, a quote and a stop line", () => {
  const plan = pullPlan();
  assert.deepEqual(plan.slice(0, 3).map((q) => q.category), ["clearance", "sale", "bestsellers"], "phase 1 runs first");
  assert.ok(plan.find((q) => q.category === "sale").maxItems >= 1000, "'all sale' is not a fixed 60");
  const est = estimatePull(plan, costRatesFromEnv({}), { quoteUsd: 10 });
  assert.equal(est.runs, plan.length);
  assert.equal(est.quoteUsd, 10);
  assert.equal(est.stopAboveUsd, 12.5);
  const hot = spendCheck([{ quota: plan[0], usd: 50 }], plan.slice(1), est);
  assert.equal(hot.stop, true, "a run projecting far above the quote stops");
  const cool = spendCheck([{ quota: plan[0], usd: 0.01 }], [], estimatePull(plan.slice(0, 1), costRatesFromEnv({})));
  assert.equal(cool.stop, false);
});

await check("no --confirm-spend: prints ESTIMATED COST, exits 2, and never calls the site", async () => {
  const site = await stubSite(() => ({ status: 500, json: { error: "should not be called" } }));
  try {
    const r = await runCli(["--site", site.url]);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /ESTIMATED COST: ~\$\d+\.\d\d/);
    assert.match(r.out, /Nothing was spent/);
    assert.ok(r.out.indexOf("ESTIMATED COST") < r.out.indexOf("Nothing was spent"), "the estimate prints first");
    assert.equal(site.calls.length, 0, "a request reached the site without the confirm flag");
  } finally { await site.close(); }
});

await check("--confirm-spend: a run that projects above the quote stops after it and says so (exit 3)", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "dsw-data-"));
  const site = await stubSite((req) => {
    if (req.url.startsWith("/.netlify/functions/apify-scrape-start")) return { json: { runId: "run-1" } };
    if (req.url.startsWith("/.netlify/functions/apify-scrape-status")) return { json: { status: "SUCCEEDED", items: [], usageUsd: 99 } };
    return { status: 404, json: {} };
  });
  try {
    const r = await runCli(["--site", site.url, "--confirm-spend", "--quote", "5"], { DSW_DATA_DIR: dataDir });
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /PROYECCIÓN SOBRE LA COTIZACIÓN/);
    const starts = site.calls.filter((c) => c.url.startsWith("/.netlify/functions/apify-scrape-start"));
    assert.equal(starts.length, 1, "it started another run after the projection went over");
    assert.equal(JSON.parse(starts[0].body).retailer, "dsw");
    assert.ok(!existsSync(ROOT + OUT_FILE) || productCount(catalogNow()) === 0, "a stopped pull wrote the catalogue");
  } finally { await site.close(); rmSync(dataDir, { recursive: true, force: true }); }
});

await check("apify-scrape-start: DSW is UNVERIFIED and off unless DSW_ACTOR_ID is set", async () => {
  const src = read("netlify/functions/apify-scrape-start.js");
  assert.match(src, /DSW \(Issue #443, 2026-10-21\) — UNVERIFIED/);
  assert.match(src, /TO FINISH THE INTEGRATION/);
  const prev = process.env.DSW_ACTOR_ID;
  delete process.env.DSW_ACTOR_ID;
  const mod = await import("../../netlify/functions/apify-scrape-start.js?nodsw=" + Date.now());
  if (prev !== undefined) process.env.DSW_ACTOR_ID = prev;
  assert.deepEqual(Object.keys(mod.DEPARTMENT_CONFIG.dsw), ["clearance", "sale", "bestsellers", "women", "men", "kids", "bags"]);
  /* connectLambda wants a blobs context; the pending path never touches it. */
  const blobs = Buffer.from(JSON.stringify({ url: "http://127.0.0.1:1", token: "test" })).toString("base64");
  const res = await mod.handler({ httpMethod: "POST", headers: { "x-nf-site-id": "test", "x-nf-deploy-id": "test" }, blobs, body: JSON.stringify({ retailer: "dsw", department: "sale" }) });
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).pendingIntegration, true, "an unconfigured DSW is a named pending integration, not a silent empty run");
});

/* ------------------------------------------------------------------
   4. IN THE BROWSER
   ------------------------------------------------------------------ */
console.log("\n  DSW — in the browser");

async function loadChromium() {
  try { return (await import("playwright")).chromium; }
  catch { try { return (await import("/opt/node-tools/node_modules/playwright/index.mjs")).chromium; } catch { return null; } }
}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml" };

/* The repo, served as is, with `overrides` (path -> body) in front. */
async function serveRepo(overrides = {}) {
  const port = await freePort();
  const { handler: tiendaFn } = await import(ROOT + "netlify/functions/tienda.js");
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/.netlify/functions/tienda" && overrides.__tiendaFn) {
      const out = overrides.__tiendaFn(Object.fromEntries(u.searchParams));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(out)); return;
    }
    if (u.pathname === "/.netlify/functions/tienda") {
      const r = await tiendaFn({ httpMethod: "GET", queryStringParameters: Object.fromEntries(u.searchParams), headers: {} });
      res.writeHead(r.statusCode, { "Content-Type": "application/json" }); res.end(r.body); return;
    }
    if (u.pathname.startsWith("/.netlify/")) { res.writeHead(404); res.end("{}"); return; }
    const path = u.pathname === "/" ? "/index.html" : decodeURIComponent(u.pathname);
    if (Object.prototype.hasOwnProperty.call(overrides, path)) {
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
      res.end(overrides[path]); return;
    }
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file) || !/\.\w+$/.test(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise((r) => srv.listen(port, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => srv.close(r)) };
}

async function withBrowser(fn) {
  const chromium = await loadChromium();
  if (!chromium) return "skip";
  const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
  let browser;
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); } catch { return "skip"; }
  try { return await fn(browser); } finally { await browser.close(); }
}
async function phonePage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  return page;
}

await check("zero catalogue, headless: no DSW tile, rail, directory card or storefront", () => withBrowser(async (browser) => {
  const site = await serveRepo();
  try {
    const page = await phonePage(browser);
    await page.goto(site.base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll("#mTiendasStripRow button").length > 5, null, { timeout: 30000 });
    for (let y = 0; y < 30000; y += 900) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(60); }
    const home = await page.evaluate(() => ({
      tile: [...document.querySelectorAll("[onclick]")].filter((e) => /tiendaJump\('dsw'\)|openStore\('dsw'\)/.test(e.getAttribute("onclick")) && e.getClientRects().length).length,
      rails: [...document.querySelectorAll('section[data-store-rail="dsw"]')].map((s) => s.hidden && !s.getClientRects().length),
      cards: document.querySelectorAll('[data-store-rail-card="dsw"]').length,
      fetchedCatalogue: performance.getEntriesByType("resource").some((e) => /dsw-catalog\.json/.test(e.name)),
    }));
    assert.equal(home.tile, 0, "a visible DSW tile or door on the home page");
    assert.deepEqual(home.rails, [true, true, true], "a DSW rail is showing");
    assert.equal(home.cards, 0);
    assert.equal(home.fetchedCatalogue, false, "the home page fetched dsw-catalog.json for a hidden rail");

    await page.goto(site.base + "/tienda.html", { waitUntil: "load" });
    const dir = await page.evaluate(() => ({ any: !!document.querySelector('a[href="tienda.html?tienda=dsw"]'), n: document.querySelectorAll("#dirGrid .dir-card").length }));
    assert.equal(dir.any, false, "the store directory lists DSW");
    assert.ok(dir.n > 50);

    await page.goto(site.base + "/tienda.html?tienda=dsw", { waitUntil: "load" });
    const route = await page.evaluate(() => ({ dir: !document.getElementById("dirWrap").hidden, store: !document.getElementById("storeWrap").hidden, text: document.body.innerText }));
    assert.equal(route.dir, true, "?tienda=dsw did not fall back to the directory");
    assert.equal(route.store, false);
    assert.ok(!/Catálogo en preparación/.test(route.text), "a dead-end storefront rendered");

    await page.goto(site.base + "/tiendas.html", { waitUntil: "load" });
    await page.waitForTimeout(400);
    const link = await page.evaluate(() => { const a = document.querySelector('a[href="tienda.html?tienda=dsw"]'); return a ? a.hidden : null; });
    assert.equal(link, true, "tiendas.html shows the DSW link");
  } finally { await site.close(); }
}));

/* The launch state, simulated in memory: the fixture as dsw-catalog.json,
   the flag off in each mirror, and the slices built from the fixture by
   the real builders. Nothing is written into the repo. */
async function fixtureOverrides() {
  const tmp = mkdtempSync(join(tmpdir(), "dsw-fixture-"));
  for (const f of ["index.html", "sale-rule.js", "product-type.js", "producto.html", "build"]) symlinkSync(ROOT + f, join(tmp, f));
  writeFileSync(join(tmp, OUT_FILE), JSON.stringify(FIXTURE));
  const { buildStore } = await import("../build-store-slices.mjs");
  const built = buildStore(DSW_KEY, tmp + "/");
  const { liftPage, buildRecords } = await import("../build-pdp-slices.mjs");
  const P = liftPage(tmp + "/");
  /* Only the fixture file exists under tmp, so only fixture records. */
  const { byKey } = buildRecords(P, tmp + "/");
  const shards = {};
  for (const [key, cands] of byKey) {
    const s = P.pdpShard(key);
    const real = ROOT + `assets/pdp/p/${s}.json`;
    shards[s] = shards[s] || (existsSync(real) ? JSON.parse(readFileSync(real, "utf8")) : {});
    shards[s][key] = cands.length === 1 ? [cands[0].rec] : cands.map((c) => ({ ...c.rec, src: c.src }));
  }
  rmSync(tmp, { recursive: true, force: true });
  const bname = "/" + bundleName();
  const bundle = bundleSrc().replace(/(  dsw: +\{ key: 'dsw',[^\n]*?), pendingCatalog: true \}/, "$1 }");
  assert.notEqual(bundle, bundleSrc(), "could not lift the bundle's pending flag");
  const tienda = read("tienda.html").replace('"pendingCatalog": true, ', "");
  assert.notEqual(tienda, read("tienda.html"));
  const o = {
    ["/" + OUT_FILE]: JSON.stringify(FIXTURE),
    [bname]: bundle,
    "/tienda.html": tienda,
    "/assets/tienda/dsw/index.json": JSON.stringify(built.files["index.json"]),
  };
  for (const [name, body] of Object.entries(built.files)) o["/assets/tienda/dsw/" + name] = JSON.stringify(body);
  for (const [s, body] of Object.entries(shards)) o[`/assets/pdp/p/${s}.json`] = JSON.stringify(body);
  return { o, built };
}

await check("fixture catalogue, headless: Tiendas tile -> storefront (Ofertas de DSW first) -> product page -> cart", () => withBrowser(async (browser) => {
  const { o, built } = await fixtureOverrides();
  assert.equal(built.files["index.json"].count, 4);
  assert.equal(built.files["index.json"].rails[0].title, "Ofertas de DSW", "the storefront does not lead with Ofertas de DSW");
  const site = await serveRepo(o);
  try {
    const page = await phonePage(browser);
    await page.goto(site.base + "/", { waitUntil: "load" });
    /* The home rail reveals itself once the registry row is live. */
    await page.waitForFunction(() => [...document.querySelectorAll('section[data-store-rail="dsw"]')].some((s) => !s.hidden), null, { timeout: 30000 });
    const tile = page.locator("#mTiendasStripRow button[onclick=\"tiendaJump('dsw')\"]");
    await tile.waitFor({ state: "visible", timeout: 30000 });
    await tile.scrollIntoViewIfNeeded();
    await Promise.all([page.waitForURL(/tienda\.html\?tienda=dsw/), tile.click()]);

    await page.waitForSelector("#content .rail-sec", { timeout: 30000 });
    const store = await page.evaluate(() => ({
      first: document.querySelector("#content .rail-sec .rail-title").textContent,
      titles: [...document.querySelectorAll("#content .rail-title")].map((e) => e.textContent),
      hero: document.getElementById("hero").className,
      dead: /Catálogo en preparación/.test(document.body.innerText),
    }));
    assert.equal(store.first, "Ofertas de DSW");
    assert.ok(store.titles.includes("Zapatos de mujer"), "category rails below: " + store.titles.join(" | "));
    assert.match(store.hero, /themed/); assert.match(store.hero, /mono/);
    assert.equal(store.dead, false);

    const card = page.locator("#content .rail-sec a.card").filter({ hasText: "FIXTURE Test Sneaker Alpha" }).first();
    await Promise.all([page.waitForURL(/producto\.html/), card.click()]);
    await page.waitForSelector("#add-cart-btn", { timeout: 30000 });
    const sel = page.locator("#size-select");
    assert.equal(await sel.count(), 1, "the fixture's own size list renders a picker");
    const opts = await sel.locator("option:not([disabled])").allTextContents();
    assert.deepEqual(opts, ["7", "8"], "sizes are the record's, never invented");
    await sel.selectOption("8");
    await page.click("#add-cart-btn");
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
    assert.equal(cart.length, 1);
    assert.equal(cart[0].retailer, "dsw");
    assert.equal(cart[0].selectedSize, "8");
    assert.ok(cart[0].priceUsd > 40, "the customer price carries the standing stack over the $40 fixture price");

    await page.goto(site.base + "/checkout.html", { waitUntil: "load" });
    await page.waitForTimeout(800);
    const text = await page.evaluate(() => document.body.innerText);
    assert.match(text, /FIXTURE Test Sneaker Alpha/, "the cart line reached checkout");
  } finally { await site.close(); }
}));

/* ------------------------------------------------------------------ */
console.log(`\n  ${passed} passed, ${failures.length} failed${skipped ? `, ${skipped} skipped` : ""}\n`);
if (failures.length) {
  for (const f of failures) console.log("  FAIL " + f + "\n");
  process.exit(1);
}
