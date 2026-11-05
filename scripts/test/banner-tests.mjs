#!/usr/bin/env node
/* ==================================================================
   HEADER BANNERS (#443 c.6642024745, c.6642039652, c.6642097765).

   Every store, brand and department page a carousel can lead to opens
   on a banner that represents it, or says which tier it is at:
     - the registry (scripts/lib/banner-registry.js) names only real
       logo files and real photos already served on the page's cards;
     - the built files (assets/banners/) are what the builder writes now
       (node scripts/build-banners.mjs);
     - the audit report covers every store, brand and department page,
       each with a class and a tier;
     - in a browser, every audited page type paints a banner element with
       a real image, or reports its tier on the hero (data-banner-tier),
       with no layout shift.

     node scripts/test/banner-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/banner-tests.mjs   (banner-*.png at 390 and 1366)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const { BANNER_REGISTRY } = await import("../lib/banner-registry.js");
const B = await import("../build-banners.mjs");
const { modelShot } = await import("../lib/model-shot.mjs");
const REPORT = "reports/banner-audit-2026-11-04.json";

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { const r = await fn(); if (r === "skip") { console.log("    skip " + name); return; } passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const STORES = JSON.parse(/var STORES = (\{.*\});/.exec(read("tienda.html"))[1]);

/* ---------------- static ---------------- */
await check("registry: a logo or backdrop is a real file in the repo, or null -- never invented", () => {
  for (const [id, e] of Object.entries(BANNER_REGISTRY)) {
    for (const f of ["logo", "backdrop", "photo"]) if (e[f]) assert.ok(existsSync(join(ROOT, e[f].replace(/^\//, ""))), `${id}: ${f} ${e[f]} missing`);
    assert.ok(e.label && e.page && e.source, id);
  }
});

await check("built banners are current (node scripts/build-banners.mjs)", () => {
  for (const [id, e] of B.liveEntries()) {
    const [kind, key] = id.split(":");
    const f = `assets/banners/${kind}/${key}.json`;
    assert.ok(existsSync(join(ROOT, f)), `${f} missing`);
    const { page, ...want } = B.buildEntry(id, e);
    assert.deepEqual(JSON.parse(read(f)), want, `${f} is stale`);
  }
});

await check("tiles: real https product photos already served on the page's cards, 3+ per banner, no known flat when models are required", () => {
  const served = (e) => {
    const s = e.source, out = new Set();
    if (s.from === "store") for (const r of JSON.parse(read(`assets/tienda/${s.key}/index.json`)).rails) for (const c of r.head || []) out.add(c.image);
    if (s.from === "brand") for (const r of JSON.parse(read(`assets/sections/marca/${s.key}.json`)).rails) for (const c of r.cards) out.add(c.i);
    if (s.from === "feed") for (const p of JSON.parse(read(s.file)).items) out.add(p.img);
    return out;
  };
  for (const [id, e] of B.liveEntries()) {
    const b = B.buildEntry(id, e), cards = served(e), base = [...cards].map((u) => [u, B.tileSrc(u)]);
    assert.ok(b.tiles.length >= 3, `${id}: ${b.tiles.length} tiles`);
    for (const t of b.tiles) {
      assert.match(t.src, /^https:\/\//);
      assert.ok(base.some(([u, s]) => s === t.src), `${id}: ${t.src} is not on a served card`);
      if (e.model === "required") assert.equal(modelShot(t.store, base.find(([u, s]) => s === t.src)[0]), true, `${id}: ${t.src} is not a known model shot`);
    }
    assert.equal(new Set(b.tiles.map((t) => t.src)).size, b.tiles.length, `${id}: a repeated photo`);
  }
});

await check("tier: computed from what exists (logo + own backdrop = 1, logo + model = 2, else 3; a department on its own on-model frames = 1)", () => {
  assert.equal(B.tierOf("store", { logo: "x", backdrop: "y", models: 0, tiles: 0 }), 1);
  assert.equal(B.tierOf("store", { logo: "x", backdrop: null, models: 1, tiles: 3 }), 2);
  assert.equal(B.tierOf("store", { logo: null, backdrop: null, models: 3, tiles: 3 }), 3);
  assert.equal(B.tierOf("brand", { logo: null, backdrop: null, models: 0, tiles: 0 }), 0);
  assert.equal(B.tierOf("dept", { models: 4, tiles: 4 }), 1);
  assert.equal(B.tierOf("dept", { models: 0, tiles: 0, photo: "c.jpg" }), 3);
  for (const [id, e] of B.liveEntries()) {
    const b = B.buildEntry(id, e);
    if (!e.logo && b.kind !== "dept") assert.equal(b.tier, 3, `${id}: no logo file cannot be tier 1 or 2`);
    if (b.tier === 3) assert.equal(b.status, "NOT-YET-REPRESENTED", id);
    if (b.kind !== "dept" && b.tier > 1) assert.ok(b.missing.length, `${id}: names no missing tier-1 asset`);
  }
});

await check("srcset: a width on the store's own CDN (Shopify, DSW, Sephora); none invented for others", () => {
  assert.match(B.srcsetOf("https://cdn.shopify.com/s/files/1/x.jpg?v=1"), /width=320 320w, .*width=640 640w$/);
  assert.match(B.srcsetOf("https://assets.designerbrands.com/match/Site_Name/1_ss_01/?quality=85&io=transform:fit,width:1280"), /width:320 320w, .*width:640 640w$/);
  assert.match(B.srcsetOf("https://www.sephora.com/productimages/sku/s1-main-zoom.jpg?imwidth=600"), /imwidth=320 320w/);
  assert.equal(B.srcsetOf("https://d1flfk77wl2xk4.cloudfront.net/Assets/1.jpg"), "");
});

await check("audit report: every store, department and brand page, each with a class and a tier", () => {
  assert.ok(existsSync(join(ROOT, REPORT)) && existsSync(join(ROOT, REPORT.replace(".json", ".md"))));
  const r = JSON.parse(read(REPORT));
  const sk = new Set(r.pages.stores.map((s) => s.key));
  /* A store AWAITING its catalogue has no page (tienda.html drops it), so nothing to audit. */
  for (const k of Object.keys(STORES)) if (!B.isGated("store:" + k)) assert.ok(sk.has(k), `store ${k} not audited`);
  const DEPTS = Function('"use strict";return (' + /var DEPTS = (\{[\s\S]*?\n  \});/.exec(read("departamento.html"))[1] + ");")();
  const dk = new Set(r.pages.depts.map((d) => d.key));
  for (const k of Object.keys(DEPTS)) assert.ok(dk.has(k), `dept ${k} not audited`);
  const CLASSES = ["HAS-relevant", "MISSING", "LOGO-ONLY", "IRRELEVANT", "FLAGSHIP"];
  for (const row of [...r.pages.stores, ...r.pages.depts]) {
    assert.ok(CLASSES.includes(row.now.class), `${row.key}: ${row.now.class}`);
    assert.ok(row.now.tier === null ? row.now.class === "FLAGSHIP" : [0, 1, 2, 3].includes(row.now.tier), `${row.key}: tier ${row.now.tier}`);
  }
  const ci = r.pages.brands.cols.indexOf("class"), ti = r.pages.brands.cols.indexOf("tier");
  assert.ok(r.pages.brands.rows.length > 1000);
  for (const row of r.pages.brands.rows) assert.ok(CLASSES.includes(row[ci]) && [0, 1, 2, 3].includes(row[ti]), row[0]);
  for (const s of r.samples) assert.ok(s.tier >= 1 && s.status, s.key);
});

await check("gated: a store AWAITING its catalogue (Marc Jacobs) publishes no banner file and no index entry", () => {
  for (const id of Object.keys(BANNER_REGISTRY).filter(B.isGated)) {
    const [kind, key] = id.split(":");
    assert.ok(!existsSync(join(ROOT, `assets/banners/${kind}/${key}.json`)), `${id}: a banner file while gated`);
    assert.ok(!JSON.parse(read(`assets/banners/${kind}/index.json`)).includes(key), `${id}: listed while gated`);
  }
});

await check("wiring: every destination page loads page-banner.js (defer); stores fall back to the phone hero then the store photo; Best Buy's photo exists", () => {
  for (const p of ["tienda.html", "marca.html", "departamento.html", "ropa-interior.html"])
    assert.match(read(p), /<script src="\/assets\/js\/page-banner\.js" defer><\/script>/, p);
  const t = read("tienda.html");
  assert.match(t, /'\/assets\/tienda\/hero\/' \+ storeKey \+ '\.jpg', '\/assets\/stores\/' \+ storeKey \+ '\.jpg'/);
  for (const [k, s] of Object.entries(STORES)) if (s.heroPhoto) assert.ok(existsSync(join(ROOT, s.heroPhoto.slice(1))), `${k}: heroPhoto ${s.heroPhoto} 404s`);
  assert.ok(existsSync(join(ROOT, "assets/tienda/hero/bestbuy.jpg")));
  for (const o of ["samsclub", "target", "surfworld"]) assert.ok(!existsSync(join(ROOT, `assets/tienda/hero/${o}.jpg`)) || STORES[o], `orphan hero ${o}`);
  assert.match(read("marca.html"), /'\/assets\/tienda\/hero\/' \+ _heroKey \+ '\.jpg', '\/assets\/stores\/' \+ _heroKey \+ '\.jpg'/);
});

/* ---------------- browser ---------------- */
await check("browser: every audited page type paints a banner with a real image, or reports its tier; no layout shift; 390 and 1366", async () => {
  let pw;
  try { pw = await import("playwright"); } catch { return "skip"; }
  const { createServer } = await import("node:http");
  const handlers = {
    brand: (await import("../../netlify/functions/brand.js")).handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
    "nav-filter": (await import("../../netlify/functions/nav-filter.js")).handler,
  };
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404); return res.end("{}"); }
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) }, { fetchImpl });
      res.writeHead(r.statusCode, r.headers || {});
      return res.end(r.body || "");
    }
    const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!f.startsWith(ROOT) || !existsSync(f) || f.endsWith("/")) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  /* Retailer CDNs are blocked here: every external photo is a plain grey
     stub, counted, so the test sees which real URLs the banner asked for. */
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#c9ced6"/></svg>';
  const SHOT = process.env.SHOT_DIR || "";
  const CASES = [
    { name: "dsw", url: "/tienda.html?tienda=dsw", host: "#hero", tiles: true },
    { name: "ryderwear", url: "/tienda.html?tienda=ryderwear", host: "#hero", tiles: true },
    { name: "laneige", url: "/marca.html?marca=laneige", host: "#brandHero", tiles: true },
    { name: "lenceria", url: "/ropa-interior.html#mujer", host: "#mujer > .hero", tiles: true },
    { name: "walmart", url: "/tienda.html?tienda=walmart", host: "#hero", tier: 3, src: /\/assets\/tienda\/hero\/walmart\.jpg$/ },
    { name: "tenniswarehouse", url: "/tienda.html?tienda=tenniswarehouse", host: "#hero", tier: 3, src: /\/assets\/tienda\/hero\/tenniswarehouse\.jpg$/ },
    { name: "gap", url: "/tienda.html?tienda=gap", host: "#hero", tier: 0 },
    { name: "nike", url: "/marca.html?marca=nike", host: "#brandHero", tier: 3, src: /\/assets\/brands\/nike-hero\.jpg$/ },
    { name: "joyas", url: "/departamento.html?dept=joyas_accesorios", host: "#deptHero", tier: 3, src: /\/assets\/category\/jewelry\.jpg$/ },
    { name: "perfumes", url: "/departamento.html?dept=perfumes", host: "#deptHero", tier: 0 },
  ];
  try {
    for (const vw of [390, 1366]) {
      for (const cs of CASES) {
        if (vw === 1366 && !cs.tiles) continue;
        const c = await browser.newContext(vw === 390 ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 900 } });
        const asked = [];
        await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => { if (r.request().resourceType() === "image") { asked.push(r.request().url()); return r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }); } return r.abort(); });
        const page = await c.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(BASE + cs.url);
        await page.waitForSelector(cs.host + "[data-banner-tier]", { timeout: 30000, state: "attached" }).catch((e) => { throw new Error(`${cs.name}@${vw}: no banner state on ${cs.host} -- ${e.message.split("\n")[0]}`); });
        const got = await page.$eval(cs.host, (h) => {
          const art = h.querySelector(":scope > .pb-art");
          const before = h.getBoundingClientRect().height;
          let without = before;
          if (art) { art.style.display = "none"; without = h.getBoundingClientRect().height; art.style.display = ""; }
          return { tier: Number(h.getAttribute("data-banner-tier")), src: h.getAttribute("data-banner-src") || "", art: !!art, pos: art ? getComputedStyle(art).position : "",
            imgs: art ? [...art.querySelectorAll("img")].map((i) => ({ src: i.currentSrc || i.src, lazy: i.loading, dec: i.decoding })) : [], before, without,
            bg: (h.querySelector(".hero-bg:not([hidden])") || {}).src || "" };
        });
        if (cs.tiles) {
          const want = JSON.parse(read(`assets/banners/${cs.url.includes("tienda=") ? "store" : cs.url.includes("marca=") ? "brand" : "dept"}/${cs.name === "lenceria" ? "ropa_interior_mujer" : cs.name}.json`));
          assert.ok(got.art, `${cs.name}@${vw}: no banner element`);
          assert.equal(got.tier, want.tier, `${cs.name}: tier`);
          assert.ok(got.imgs.length >= 3 && got.imgs.every((i) => /^https:\/\//.test(i.src) && i.lazy === "lazy" && i.dec === "async"), `${cs.name}: ${JSON.stringify(got.imgs)}`);
          assert.equal(got.pos, "absolute", `${cs.name}: the banner takes space`);
          assert.equal(got.before, got.without, `${cs.name}: the banner shifts the layout`);
          for (const t of want.tiles.slice(0, 3)) assert.ok(asked.some((u) => u === t.src || (t.srcset && t.srcset.includes(u))), `${cs.name}: never asked for ${t.src}`);
        } else {
          assert.equal(got.tier, cs.tier, `${cs.name}: tier ${got.tier}`);
          if (cs.src) assert.match(got.src, cs.src, cs.name);
          if (cs.tier === 3) assert.match(got.bg, cs.src, `${cs.name}: the photo is not on screen`);
        }
        assert.deepEqual(errors, [], cs.name);
        if (SHOT && cs.tiles) {
          await page.evaluate((sel) => { const h = document.querySelector(sel); if (h) h.scrollIntoView({ block: "start" }); window.scrollBy(0, -140); }, cs.host);
          await page.waitForTimeout(500);
          await page.screenshot({ path: join(SHOT, `banner-${cs.name}-${vw}.png`) });
        }
        await c.close();
      }
    }
  } finally { await browser.close(); srv.close(); }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.join("\n\n")); process.exit(1); }
