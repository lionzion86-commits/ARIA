#!/usr/bin/env node
/* ==================================================================
   ONE STORE COUNT, AND NO EMPTY STORE PRESENTED AS A STORE
   (#443 c.6693598650 s.5, the Nov 6 full-page audit).

   The homepage said «comparando 4 tiendas», «Ocho tiendas, todas
   reales» and showed a much larger directory, on one page; the Marc
   Jacobs and DSW catalogues were read as empty while their names were
   on the site. Held here:

   1. THE COUNT. Every store-count claim on a generated surface equals
      the one computed number: the stores with products for sale
      (scripts/build-store-doors.mjs storeDoors(), the storefronts whose
      first screen has products, minus the stores off sale). The
      homepage slots, tiendas.html, tienda.html's directory, the search
      and brand doors, and the rendered app (Tiendas heading, results
      bar, Cómo funciona's «+N», the grid plus its «Y N tiendas más»).
   2. THE GATE. A store whose catalogue has no product of its own is on
      /off-sale.js AWAITING_CATALOG (scripts/lib/store-gate.mjs, every
      registry store, not one); every store named on a generated surface
      has products; a hidden store's own link says «Esta tienda no tiene
      productos disponibles por ahora», never an empty grid.

     node scripts/test/store-count-tests.mjs
   SKIP_BROWSER=1 skips the rendered checks; PLAYWRIGHT_CHROMIUM=<path>
   uses an installed Chromium.
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { storeDoors, syncStoreCount, spanishCount, STORE_COUNT_SLOT_RX } from "../build-store-doors.mjs";
import * as GATE from "../lib/store-gate.mjs";
import { isOffSaleRetailer, OFF_SALE_RETAILERS } from "../lib/off-sale.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..") + "/";
const read = (f) => readFileSync(ROOT + f, "utf8");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.message).split("\n").slice(0, 6).join("\n         ")}`); console.log("    FAIL " + name); }
}

const doors = storeDoors(ROOT);
const N = doors.keys.length;
const SELLABLE = new Set(doors.keys);
const sliceCount = (k) => {
  const p = ROOT + `assets/tienda/${k}/index.json`;
  return existsSync(p) ? Number(JSON.parse(readFileSync(p, "utf8")).count) || 0 : 0;
};
const registry = JSON.parse(/\nvar STORES = (\{.*\});\r?\n/.exec(read("tienda.html"))[1]);
/* The registry stores hidden for having no products (not the off-sale list proper). */
const HIDDEN = Object.keys(registry).filter((k) => !OFF_SALE_RETAILERS.includes(k) && !SELLABLE.has(k)).sort();
console.log(`  the count: ${N} stores with products; hidden for no products: ${HIDDEN.join(", ") || "none"}`);

/* ---------------- 1. the count ---------------- */
console.log("\n  one store count");
await check("the count is computed: every store in it has a storefront with products", () => {
  assert.ok(N >= 20, `only ${N} stores`);
  for (const k of doors.keys) assert.ok(sliceCount(k) > 0, `${k}: counted with an empty storefront`);
  for (const k of doors.keys) assert.ok(!isOffSaleRetailer(k), `${k}: counted while off sale`);
});
await check("the homepage slots are current (node scripts/build-store-doors.mjs)", () => {
  const r = syncStoreCount(ROOT, { check: true, doors });
  assert.deepEqual(r.stale, [], `stale: ${r.stale.join(", ")}`);
});
await check("index.html: every store-count slot holds the count, as data and as text", () => {
  const src = read("index.html");
  const slots = [...src.matchAll(new RegExp(STORE_COUNT_SLOT_RX.source, "g"))].map((m) => m[0]);
  assert.ok(slots.length >= 2, `${slots.length} slots (the Tiendas heading and the results bar)`);
  for (const s of slots) {
    assert.match(s, new RegExp(`data-store-count="${N}"`), s);
    const text = />([^<]*)<\/span>$/.exec(s)[1];
    assert.ok(text === String(N) || text === spanishCount(N), `${s} reads «${text}»`);
  }
  assert.match(src, /comparando <span data-store-count="\d+"[^>]*id="storeCount"/, "the results bar is a slot");
});
await check("index.html: no other number of stores is written in the page's own words", () => {
  /* Text outside comments, scripts and styles. The one category claim
     («Tablas, skate y neopreno de 9 tiendas», the Surf & Skate tile) is
     a count of that category's stores, not of the shop's. */
  const text = read("index.html").replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(STORE_COUNT_SLOT_RX, " SLOT ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const WORDS = "una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|cien";
  const claims = [...text.matchAll(new RegExp(`\\b(\\d+|${WORDS})\\s+tiendas\\b[^.]{0,40}`, "gi"))].map((m) => m[0]);
  const other = claims.filter((c) => !/^9 tiendas\b/.test(c));
  assert.deepEqual(other, [], "a store count nothing computes");
});
await check("tiendas.html: «N tiendas activas» and N visible tiles", () => {
  const src = read("tiendas.html");
  const m = /<p id="storeCountLine"[^>]*>(\d+) tiendas activas<\/p>/.exec(src);
  assert.ok(m, "no count line");
  assert.equal(Number(m[1]), N);
  const tiles = [...src.matchAll(/<a class="store-card" href="tienda\.html\?tienda=([a-z0-9]+)"([^>]*)>/g)].filter((t) => !/\bhidden\b/.test(t[2])).map((t) => t[1]);
  assert.equal(tiles.length, N);
  assert.deepEqual([...tiles].sort(), [...doors.keys].sort());
});
await check("tienda.html's directory and the search and brand doors are the same set", () => {
  const live = Object.keys(registry).filter((k) => !isOffSaleRetailer(k) && !registry[k].pendingCatalog);
  assert.deepEqual(live.sort(), [...doors.keys].sort(), "tienda.html's «N tiendas» is its registry after the gate");
  for (const f of ["search.html", "marca.html"]) {
    const pages = /var STORE_PAGES = "([^"]*)"/.exec(read(f))[1].trim().split(/\s+/);
    assert.deepEqual(pages.sort(), [...doors.keys].sort(), f);
  }
});

/* ---------------- 2. the gate ---------------- */
console.log("\n  no empty store presented as a store");
await check("the gate reads every registry store, and its line is current", () => {
  const gated = GATE.gatedStores(ROOT);
  for (const k of Object.keys(registry)) if (!OFF_SALE_RETAILERS.includes(k)) assert.ok(k in gated, `${k} is not read by the gate`);
  const sync = GATE.syncStoreGate(ROOT, { check: true });
  assert.equal(sync.changed, false, "off-sale.js AWAITING_CATALOG is stale: run node scripts/build-store-slices.mjs");
  for (const [k, n] of Object.entries(sync.counts)) if (n === 0) assert.ok(GATE.gateLine(ROOT).includes(k), `${k} has no products and is not gated`);
});
await check("a registry store with products is never gated; one without products always is", () => {
  const sync = GATE.syncStoreGate(ROOT, { check: true });
  for (const k of doors.keys) assert.ok(sync.counts[k] > 0, `${k}: ${sync.counts[k]} products by the gate, ${sliceCount(k)} on its storefront`);
  for (const k of HIDDEN) assert.ok(isOffSaleRetailer(k), `${k}: no products and not hidden`);
});
await check("the gate, run on a store whose catalogue empties: it hides, then reopens when products land", () => {
  const tmp = mkdtempSync(join(tmpdir(), "store-gate-"));
  try {
    copyFileSync(ROOT + "off-sale.js", join(tmp, "off-sale.js"));
    const env = (k, items) => JSON.stringify({ retailers: { [k]: { label: k, departments: { all: { items } } } } });
    const reg = { stocked: { label: "Stocked", files: ["/stocked-catalog.json"] }, emptied: { label: "Emptied", files: ["/emptied-catalog.json"] } };
    writeFileSync(join(tmp, "tienda.html"), `<script>\nvar STORES = ${JSON.stringify(reg)};\n</script>\n`);
    writeFileSync(join(tmp, "stocked-catalog.json"), env("stocked", [{ productName: "Zapatilla", effectivePrice: 40 }]));
    writeFileSync(join(tmp, "emptied-catalog.json"), env("emptied", [{ name: "Sin precio" }]));
    let r = GATE.syncStoreGate(tmp);
    assert.deepEqual(r.awaiting, ["emptied", "marcjacobs"]);
    assert.match(readFileSync(join(tmp, "off-sale.js"), "utf8"), /var AWAITING_CATALOG = \['emptied', 'marcjacobs'\];/);
    writeFileSync(join(tmp, "emptied-catalog.json"), env("emptied", [{ name: "Bolso", price: 120 }]));
    r = GATE.syncStoreGate(tmp);
    assert.deepEqual(r.awaiting, ["marcjacobs"]);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
await check("Marc Jacobs and DSW: the store with an empty catalogue is hidden, the stocked one is a store", () => {
  assert.equal(GATE.catalogueCount(ROOT, "marcjacobs-catalog.json", "marcjacobs"), 0);
  assert.ok(isOffSaleRetailer("marcjacobs") && !SELLABLE.has("marcjacobs"), "Marc Jacobs' empty store is presented");
  const dsw = GATE.catalogueCount(ROOT, "dsw-catalog.json", "dsw");
  assert.ok(dsw > 0 ? SELLABLE.has("dsw") : isOffSaleRetailer("dsw"), `DSW: ${dsw} products, ${SELLABLE.has("dsw") ? "shown" : "hidden"}`);
});
await check("every store named by the generated homepage and section data has products", () => {
  const idx = JSON.parse(read("assets/home/shelves/index.json"));
  const named = new Map();
  const add = (k, where) => { if (k) named.set(String(k).toLowerCase(), (named.get(String(k).toLowerCase()) || []).concat(where)); };
  for (const k of idx.stores || []) add(k, "home store rail");
  for (const t of idx.tiles || []) for (const k of t.retailers || []) add(k, `home tile ${t.key}`);
  for (const k of Object.keys(idx.brandLines || {})) add(k, "Tiendas brand line");
  for (const f of readdirSync(ROOT + "assets/home/shelves")) if (/^store-/.test(f)) add(f.replace(/^store-|\.json$/g, ""), f);
  for (const d of readdirSync(ROOT + "assets/sections/departamento")) {
    const p = ROOT + `assets/sections/departamento/${d}/head.json`;
    if (!existsSync(p)) continue;
    for (const s of JSON.parse(readFileSync(p, "utf8")).stores || []) { add(s.k, `departamento ${d}`); assert.ok(s.n > 0, `${d}: ${s.k} listed with ${s.n}`); }
  }
  for (const [k, where] of named) assert.ok(SELLABLE.has(k), `${k} (${[...new Set(where)].slice(0, 3).join(", ")}) has no products`);
  for (const k of HIDDEN) assert.ok(!named.has(k), `${k} is named`);
});
await check("tienda.html: a hidden store's own link says so plainly (no name, no grid)", () => {
  const src = read("tienda.html");
  assert.match(src, /var EMPTY_STORE = '<div class="state" data-empty-store><h2>Esta tienda no tiene productos disponibles por ahora<\/h2>/);
  assert.match(src, /if \(!j \|\| !j\.count\)\{ renderNoCatalog\(\);/, "a storefront with no products renders the line, not a grid");
  assert.doesNotMatch(src, /Catálogo en preparación/);
});

/* ---------------- rendered ---------------- */
let chromium = null;
if (!process.env.SKIP_BROWSER) { try { ({ chromium } = await import("playwright")); } catch { console.log("    (playwright not installed: rendered checks skipped)"); } }
if (chromium) {
  console.log("\n  rendered at 390px");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.startsWith("/.netlify/functions/")) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
    let path = decodeURIComponent(u.pathname);
    const b = /^\/build\/(app-[0-9a-f]+\.js)$/.exec(path);
    if (b && existsSync(join(ROOT, "build/min", b[1]))) path = "/build/min/" + b[1];
    let p = normalize(join(ROOT, path));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
    /* Photos are not what this battery reads. */
    if (/\.(jpe?g|png|webp|gif|avif)$/i.test(p)) { res.writeHead(204); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const open = async (url) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    await pg.route((u) => !String(u).startsWith(BASE), (r) => r.abort());
    await pg.goto(BASE + url, { waitUntil: "load" });
    await pg.waitForTimeout(1500);
    return { ctx, pg };
  };
  try {
    const { ctx, pg } = await open("/");
    const seen = await pg.evaluate(() => {
      showPage("storesView");
      const tiles = document.querySelectorAll("#storesGrid section > div.grid > *, #storesGrid > *:not(section) > *").length;
      const more = (document.getElementById("storesGridMore").innerText.match(/Y (\d+) tiendas? más/) || [])[1];
      const heading = document.querySelector("#storesView h2 [data-store-count]").textContent.trim();
      const results = document.getElementById("storeCount").textContent.trim();
      const plus = (document.getElementById("howStoreChips").innerText.match(/\+(\d+)/) || [])[1];
      const chips = document.querySelectorAll("#howStoreChips > :not(:last-child)").length;
      const keys = new Set();
      for (const r of activeRetailers()) keys.add(r.key);
      for (const e of document.querySelectorAll("[data-store-rail], [data-store-rail-row]")) keys.add(e.getAttribute("data-store-rail") || e.getAttribute("data-store-rail-row"));
      for (const t of TIENDAS_STRIP) if (!isOffSaleRetailer(t.k)) keys.add(t.k);
      for (const r of otherStoresStripOrder()) keys.add(r.key);
      return { tiles, more: Number(more || 0), heading, results, plus: Number(plus || 0), chips, keys: [...keys] };
    });
    await ctx.close();
    if (process.env.DEBUG) console.log(JSON.stringify({ ...seen, keys: seen.keys.length }));
    await check("the app: the Tiendas heading, the results bar and Cómo funciona's «+N» say the count", () => {
      assert.equal(seen.heading, spanishCount(N));
      assert.equal(seen.results, String(N));
      assert.equal(seen.plus + seen.chips, N, `Cómo funciona: ${seen.chips} logos + ${seen.plus}`);
    });
    await check("the app: the Tiendas grid's tiles plus «Y N tiendas más» are the count", () => {
      assert.equal(seen.tiles + seen.more, N, `${seen.tiles} tiles + ${seen.more} more`);
    });
    await check("the app: every store it names (registry, rails, strips) has products", () => {
      const bad = seen.keys.filter((k) => !SELLABLE.has(k));
      assert.deepEqual(bad, []);
      for (const k of HIDDEN) assert.ok(!seen.keys.includes(k), `${k} is named`);
    });
    for (const k of HIDDEN.length ? HIDDEN : ["marcjacobs"]) {
      const { ctx: c2, pg: p2 } = await open(`/tienda.html?tienda=${k}`);
      const r = await p2.evaluate(() => ({ line: (document.querySelector("[data-empty-store]") || {}).textContent || "", store: !!(document.getElementById("storeWrap") && document.getElementById("storeWrap").offsetWidth), text: document.body.innerText }));
      await c2.close();
      await check(`tienda.html?tienda=${k}: «Esta tienda no tiene productos disponibles por ahora», no storefront, no name`, () => {
        assert.match(r.line, /Esta tienda no tiene productos disponibles por ahora/);
        assert.equal(r.store, false);
        const label = registry[k] && registry[k].label;
        if (label) assert.ok(!r.text.includes(label), `${label} is named on its own empty page`);
      });
    }
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n"));
  process.exit(1);
}
