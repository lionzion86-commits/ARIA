/* ==================================================================
   THE 2026-11-03 PULL WAVE AND SHADE PULLS, LIVE (#443).

   Data (every listing, not a sample):
     - every listing a shade pull lifts carries at least one real shade
       -- a label the store's own shade list names for that listing --
       and a «Tono» dropdown when the store lists two or more shades
       (a listing its store sells in one shade names that shade);
     - every listing still gated (the rebuilt worklist,
       data/shade-pull-worklist-2026-11-02) is a shade product with no
       shade, so its page shows «Tonos en camino»; YesStyle and
       Victoria's Secret stay there whole;
     - Bath & Body Works has its storefront, with its count, a door
       (search.html STORE_PAGES) and a Tiendas tile;
     - the not-sold rule keeps its pills and food out and lets a home-
       fragrance refill and a sunscreen through.
   Browser, 390px, through the real pages: a Sephora lipstick's dropdown,
   an Ulta mascara from the 293 finish batch, the BBW store page, a
   still-gated YesStyle product.

   RUN: node scripts/test/shade-and-wave-tests.mjs
   INGEST_SHOTS=<dir> also writes ingest-*.png there.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHOTS = process.env.INGEST_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message || e).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

const { liftPage } = await import(join(ROOT, "scripts/build-pdp-slices.mjs"));
const { loadFamilies, shadeSkuOf } = await import(join(ROOT, "scripts/lib/variant-families.mjs"));
const P = liftPage(ROOT);
await import(join(ROOT, "shade-gate.js"));
await import(join(ROOT, "not-sold.js"));
const G = globalThis.AriaShadeGate;

/* Every product-page record, and every colourway group. */
const records = [];
for (const f of readdirSync(join(ROOT, "assets/pdp/p"))) {
  const shard = JSON.parse(readFileSync(join(ROOT, "assets/pdp/p", f), "utf8"));
  for (const [key, list] of Object.entries(shard)) for (const r of list) records.push({ key, ...r });
}
const groups = new Map();
for (const f of readdirSync(join(ROOT, "assets/pdp/g"))) {
  const shard = JSON.parse(readFileSync(join(ROOT, "assets/pdp/g", f), "utf8"));
  for (const [g, list] of Object.entries(shard)) if (!g.endsWith("~p")) groups.set(g, list);
}
/* The store's own shade labels, per shade SKU, from every shade pull. */
const PULLED = new Set(["sephora", "ulta", "costco"]);
const labelsBySku = new Map();
for (const fam of loadFamilies(ROOT)) {
  const r = String(fam.retailer || "").toLowerCase();
  if (!PULLED.has(r)) continue;
  for (const m of fam.members) {
    for (const sku of [m.itemId, shadeSkuOf(m.url)].filter(Boolean)) {
      const k = r + "|" + String(sku).toUpperCase();
      if (!labelsBySku.has(k)) labelsBySku.set(k, new Set());
      labelsBySku.get(k).add(String(m.label));
    }
  }
}

await check("every lifted listing has at least one real shade, and a dropdown when its store lists two or more", () => {
  const by = {};
  let dropdowns = 0, one = 0;
  for (const r of records) {
    if (!r.sk || !PULLED.has(r.retailer) || !String(r.c || "").trim()) continue;
    const sku = shadeSkuOf(r.url);
    const real = labelsBySku.get(r.retailer + "|" + sku);
    assert(real && real.has(r.c), `${r.retailer} «${r.name}» (${sku}): shade «${r.c}» is not in its store's shade list`);
    assert(r.ax === "Tono", `${r.retailer} «${r.name}»: axis ${r.ax}`);
    if (r.g) {
      const list = groups.get(r.g) || [];
      assert(list.length >= 2, `${r.retailer} «${r.name}»: group ${r.g} has ${list.length} shade(s), no dropdown`);
      assert(list.every((x) => String(x.c || "").trim()), `${r.retailer} «${r.name}»: a shade in its dropdown has no name`);
      dropdowns++;
    } else one++;
    by[r.retailer] = (by[r.retailer] || 0) + 1;
  }
  assert((by.sephora || 0) > 500 && (by.ulta || 0) > 600 && (by.costco || 0) > 0, "lifted: " + JSON.stringify(by));
  return `lifted listings ${JSON.stringify(by)}; ${dropdowns} with a «Tono» dropdown, ${one} sold in their one named shade`;
});

await check("every still-gated listing is a shade product with no shade («Tonos en camino»)", () => {
  const dir = join(ROOT, "data/shade-pull-worklist-2026-11-02");
  const byKey = new Map();
  for (const r of records) { const k = r.retailer + "|" + r.name; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }
  const counts = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const list = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const e of list) {
      const recs = byKey.get(e.store + "|" + e.title) || [];
      assert(recs.some((r) => r.sk && !String(r.c || "").trim()), `${e.store} «${e.title}»: on the worklist but its page is not gated`);
    }
    counts[f.replace(/\.json$/, "")] = list.length;
  }
  assert((counts.yesstyle || 0) >= 83 && (counts.victoriassecret || 0) === 21, "worklist: " + JSON.stringify(counts));
  /* Every YesStyle makeup row of the wave that is a shade product is gated. */
  const ys = readJson("data/pull-wave-2026-11-03/yesstyle/yesstyle-makeup-delta.json").retailers.yesstyle.departments.beauty.items;
  const listed = new Set(JSON.parse(readFileSync(join(dir, "yesstyle.json"), "utf8")).map((e) => e.title));
  const shadeRows = records.filter((r) => r.retailer === "yesstyle" && r.sk && ys.some((y) => y.name === r.name));
  assert(shadeRows.length > 200, "YesStyle wave shade products: " + shadeRows.length);
  for (const r of shadeRows) assert(!r.c && listed.has(r.name), `YesStyle «${r.name}» is sold without a shade list`);
  return JSON.stringify(counts) + `; YesStyle wave makeup gated ${shadeRows.length}`;
});

await check("Bath & Body Works: a storefront with its products, a door and a Tiendas tile", () => {
  const ix = readJson("assets/tienda/bathandbodyworks/index.json");
  assert(ix.count === 143, "count " + ix.count);
  assert(ix.rails.length >= 3 && ix.rails.every((r) => r.total > 0), "rails " + ix.rails.map((r) => r.key).join(","));
  const search = readFileSync(join(ROOT, "search.html"), "utf8");
  assert(/var STORE_PAGES = "[^"]* bathandbodyworks /.test(search), "no store door in search.html");
  assert(/tienda=bathandbodyworks/.test(readFileSync(join(ROOT, "tiendas.html"), "utf8")), "no Tiendas tile");
  const beauty = readJson("beauty-catalog.json").retailers.bathandbodyworks;
  const rows = Object.values(beauty.departments).flatMap((d) => (Array.isArray(d) ? d : d.items || []));
  assert(rows.length === 143 && rows.every((x) => x.image && x.price > 0), "catalogue rows " + rows.length);
  assert(rows.every((x) => !x.description || x.description !== x.description_en), "English shown as Spanish");
  /* Home fragrance is home, never Perfumes. */
  const fn = readJson("assets/tienda/_fn/bathandbodyworks.json");
  const perf = (fn.rails["t-perfumes"] || []).map((i) => fn.rows[i][0]).filter((n) => /wallflowers|car fragrance|candle|room spray|diffuser/i.test(n));
  assert(!perf.length, "home fragrance in Perfumes: " + perf.join(" | "));
  return ix.rails.map((r) => r.title + " " + r.total).join(", ");
});

await check("not sold: pills and food stay out; a home-fragrance refill and a sunscreen are not food", () => {
  const N = globalThis.AriaNotSold;
  assert(N.notSoldKind("Black Cherry Merlot Wallflowers Refills 2-Pack") === "", "wallflowers refill");
  assert(N.notSoldKind("Relief Sun: Rice + Probiotics Mini") === "", "Relief Sun");
  assert(N.notSoldKind("Probiotics 30 capsules") === "farmacia", "probiotics");
  assert(N.notSoldKind("Sun Chlorella Tablets 300 count") === "farmacia", "Sun Chlorella");
  const bad = [];
  for (const f of ["beauty-catalog.json", "ulta-catalog.json", "yesstyle-catalog.json", "pacsun-catalog.json"]) {
    const j = readJson(f);
    for (const [store, r] of Object.entries(j.retailers)) for (const d of Object.values(r.departments)) for (const x of (Array.isArray(d) ? d : d.items || [])) if (N.isNotSold({ title: x.name, retailer: store })) bad.push(store + ": " + x.name);
  }
  assert(!bad.length, bad.join(" | "));
});

/* ---------------- the browser ---------------- */
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); }
const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
async function fnCall(name, req, body) {
  if (name === "exchange-rate") return { statusCode: 200, body: JSON.stringify({ compra: 3.72, venta: 3.75, fecha: "2026-11-03" }) };
  if (name === "tienda" || name === "search") {
    const { handler } = await import(join(ROOT, "netlify/functions/" + name + ".js"));
    const u = new URL(req.url, "http://x");
    return handler({ httpMethod: req.method, headers: req.headers, body, rawUrl: "http://127.0.0.1" + req.url, path: u.pathname, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
  }
  return { statusCode: 401, body: JSON.stringify({ error: "No autenticado" }) };
}
const server = await new Promise((ok) => {
  const srv = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      try {
        const u = new URL(req.url, "http://x");
        const m = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
        if (m) { const r = await fnCall(m[1], req, body); res.writeHead(r.statusCode, { "Content-Type": "application/json" }); return res.end(r.body); }
        if (u.pathname.startsWith("/api/")) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
        let p = join(ROOT, decodeURIComponent(u.pathname));
        if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
        if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
        res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
      } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
    });
  });
  srv.listen(0, "127.0.0.1", () => ok(srv));
});
const BASE = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/png", body: PNG }) : r.abort());
  const pg = await ctx.newPage();
  return { ctx, pg };
}
const shot = async (pg, name, sel) => {
  if (!SHOTS) return;
  if (sel) { const h = await pg.$(sel); if (h) await h.scrollIntoViewIfNeeded(); }
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: join(SHOTS, "ingest-" + name + ".png") });
};
const openProduct = async (pg, name, store) => {
  await pg.goto(BASE + "/producto.html?producto=" + encodeURIComponent(name) + "&tienda=" + store, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => { const b = document.getElementById("buy-box"); return b && b.children.length; }, null, { timeout: 20000 });
};
const pageState = (pg) => pg.evaluate(() => {
  const sel = document.getElementById("shade-select");
  return {
    options: sel ? Array.from(sel.options).map((o) => o.textContent) : [],
    gate: (document.getElementById("shade-gate-note") || {}).textContent || "",
    button: ((document.getElementById("add-cart-btn") || {}).textContent || "").trim(),
    buyOn: !!document.getElementById("add-cart-btn") && !document.getElementById("add-cart-btn").disabled,
  };
});
/* A lifted record of this store whose title matches, in a dropdown group. */
const liftedOf = (store, rx, extra = () => true) => records.find((r) => r.retailer === store && r.sk && r.c && r.g && rx.test(r.name) && (groups.get(r.g) || []).length >= 3 && extra(r));

await check("Sephora lipstick: its «Tono» dropdown lists the store's shades and it can be bought", async () => {
  const rec = liftedOf("sephora", /lipstick/i);
  assert(rec, "no lifted Sephora lipstick");
  const { ctx, pg } = await phone();
  try {
    await openProduct(pg, rec.name, "sephora");
    const s = await pageState(pg);
    assert(s.options.length === groups.get(rec.g).length && s.options.length >= 3, `${rec.name}: ${s.options.length} options`);
    assert(!s.gate && s.buyOn, `${rec.name}: gated (${s.gate})`);
    await shot(pg, "sephora-lipstick-dropdown", "#shade-select");
    return `${rec.brand} ${rec.name}: ${s.options.length} tonos (${s.options.slice(0, 3).join(" | ")}...)`;
  } finally { await ctx.close(); }
});

await check("Ulta mascara from the 293 finish batch: shades from the pull, buyable", async () => {
  const fin = readJson("data/shade-pulls-2026-11-03/dataset-ulta-makeup-finish.json");
  const skus = new Set(fin.flatMap((f) => f.variantList.map((v) => String(v.usItemId))));
  const rec = records.find((r) => r.retailer === "ulta" && r.sk && r.c && r.g && /mascara/i.test(r.name) && skus.has(shadeSkuOf(r.url)) && (groups.get(r.g) || []).length >= 2);
  assert(rec, "no lifted Ulta mascara from the finish batch");
  const { ctx, pg } = await phone();
  try {
    await openProduct(pg, rec.name, "ulta");
    const s = await pageState(pg);
    assert(s.options.length >= 2 && !s.gate && s.buyOn, `${rec.name}: ${s.options.length} options, gate «${s.gate}»`);
    await shot(pg, "ulta-mascara-finish", "#shade-select");
    return `${rec.brand} ${rec.name}: ${s.options.join(" | ")}`;
  } finally { await ctx.close(); }
});

await check("the Bath & Body Works store page opens with its products", async () => {
  const { ctx, pg } = await phone();
  try {
    await pg.goto(BASE + "/tienda.html?tienda=bathandbodyworks", { waitUntil: "domcontentloaded" });
    const cards = pg.locator('a[href*="producto.html"]');
    await cards.first().waitFor({ state: "visible", timeout: 20000 });
    const n = await cards.count();
    const text = await pg.evaluate(() => document.body.innerText);
    assert(/Bath & Body Works/.test(text) && n >= 8, `cards ${n}`);
    const out = await pg.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")).filter((h) => /^https?:/.test(h) && !h.includes(location.host)));
    assert(!out.some((h) => /bathandbodyworks\.com/.test(h)), "links out to the retailer: " + out.filter((h) => /bathandbodyworks/.test(h)).slice(0, 2).join(" "));
    await shot(pg, "bbw-store");
    return `${n} cards on the first screen`;
  } finally { await ctx.close(); }
});

await check("a still-gated YesStyle makeup product shows «Tonos en camino» and is not sold", async () => {
  const list = JSON.parse(readFileSync(join(ROOT, "data/shade-pull-worklist-2026-11-02/yesstyle.json"), "utf8"));
  const ys = new Set(readJson("data/pull-wave-2026-11-03/yesstyle/yesstyle-makeup-delta.json").retailers.yesstyle.departments.beauty.items.map((x) => x.name));
  const e = list.find((x) => ys.has(x.title) && /lip|tint/i.test(x.title)) || list[0];
  const { ctx, pg } = await phone();
  try {
    await openProduct(pg, e.title, "yesstyle");
    const s = await pageState(pg);
    assert(/^Tonos en camino/.test(s.gate) && !s.buyOn && s.button === "Tonos en camino", `${e.title}: gate «${s.gate}», button «${s.button}»`);
    assert(!s.options.length, "a dropdown with no shade data");
    await shot(pg, "yesstyle-gated", "#shade-gate-box");
    return e.title;
  } finally { await ctx.close(); }
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
