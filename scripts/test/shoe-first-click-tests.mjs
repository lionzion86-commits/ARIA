/* ==================================================================
   THE FIRST SHOE, EVERY STORE (#443 c.6635781472).

   Danny opened the first product in Dick's Zapatos rail -- a cleat --
   and found no size anywhere and «Agregar al carrito» live. The rule
   since then: a shoe's product view shows the store's sizes, or says
   honestly that they are not confirmed («Tallas por confirmar», the
   sizes-pending state, scripts/lib/sizes-pending.js). Never neither.

   For every live store that sells shoes (reports/shoes-sizes-pending-
   2026-11-04.json, written by scripts/build-pdp-slices.mjs), this does
   what Danny does: opens the store's page (tienda.html), takes the FIRST
   shoe of its shoe rail (Zapatos / Zapatillas / Calzado / Chimpunes...;
   then the other rails in order, then «Ver todo» rail by rail, then the
   store's own full listing for a store whose rails hold no shoe), and
   opens that product
     - in producto.html (where every card lands), and
     - in the app's own product view (index.html's bundle, showProduct),
   asserting a real size picker, or «Tallas por confirmar» with the
   cart button disabled. Then, store-independent:
     - every shoe record with no size list carries sizesPending in its
       shard (no store can ship sizeless shoes silently again);
     - the order door refuses a sizes-pending shoe with no size.

   RUNNING IT
     node scripts/test/shoe-first-click-tests.mjs
   SHOT=<path prefix> writes one 390px screenshot per store and view.
   Prints the per-store table.
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { isOffSaleRetailer } from "../lib/off-sale.js";
import { isSizesPending, sizesPendingLines } from "../lib/sizes-pending.js";
import { answer } from "../../netlify/functions/_tienda-core.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const REPORT = JSON.parse(readFileSync(join(ROOT, "reports/shoes-sizes-pending-2026-11-04.json"), "utf8"));
const STORES = Object.keys(REPORT.footwearByStore).filter((k) => !isOffSaleRetailer(k)
  && existsSync(join(ROOT, "assets/tienda", k, "index.json"))
  && (!process.env.ONLY || process.env.ONLY.split(",").includes(k))).sort();

/* ---- the shards: no shoe without sizes and without the flag ---- */
const P = await import("../build-pdp-slices.mjs");
/* Which card is a shoe: the build's own verdict (its store's type, its title). */
const SHOES = Object.fromEntries(Object.entries(REPORT.shoeHashes).map(([k, v]) => [k, new Set(v.split(" "))]));
const isShoe = (store, name) => !!(SHOES[store] && SHOES[store].has(P.shoeHash(store, name)));
const Page = P.liftPage();
function shardRecords(retailer, name) {
  const key = Page.norm(name);
  const f = join(ROOT, "assets/pdp/p", Page.pdpShard(key) + ".json");
  const d = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  return (d[key] || []).filter((r) => r.retailer === retailer);
}

await check("the report: every store that sells shoes, its sized and sizes-pending counts add up", () => {
  assert.ok(process.env.ONLY || STORES.length >= 20, "only " + STORES.length + " shoe stores");
  for (const [k, s] of Object.entries(REPORT.footwearByStore)) assert.equal(s.shoes, s.sized + s.sizesPending, k);
  assert.ok(REPORT.cannotRestore.dicks && REPORT.cannotRestore.dicks.count > 0, "Dick's is not on the cannot-restore list");
});

await check("every shoe on the cannot-restore list is sizes-pending in its shard and at the order door", () => {
  let n = 0;
  for (const [k, s] of Object.entries(REPORT.cannotRestore)) {
    for (const name of s.titles) {
      const recs = shardRecords(k, name);
      assert.ok(recs.length, `${k}: «${name}» has no shard record`);
      assert.ok(recs.some((r) => r.sizesPending === true && !(r.sizes || []).length), `${k}: «${name}» sells without sizes`);
      assert.ok(isSizesPending(k, name), `${k}: «${name}» is not on the order door's list`);
      n++;
    }
  }
  assert.ok(n > 0);
  /* The order door: a line with no size is refused; one with a size is not this rule's. */
  const [k0] = Object.keys(REPORT.cannotRestore);
  const t0 = REPORT.cannotRestore[k0].titles[0];
  assert.equal(sizesPendingLines([{ retailer: k0, title: t0 }]).length, 1);
  assert.equal(sizesPendingLines([{ retailer: k0, title: t0, selectedSize: "9" }]).length, 0);
});

/* ---- Danny's click ---- */
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/.netlify/functions/tienda") {
    const out = answer(Object.fromEntries(u.searchParams), [ROOT]);
    res.writeHead(out.status, { "Content-Type": "application/json" }); res.end(JSON.stringify(out.body)); return;
  }
  if (u.pathname.startsWith("/.netlify/") || u.pathname.startsWith("/api/")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); return; }
  let p = join(ROOT, decodeURIComponent(u.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const PHOTO = readFileSync(join(ROOT, "assets/sections/tiendas-mall-row.jpg"));
async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.route((url) => url.host !== new URL(BASE).host, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/jpeg", body: PHOTO }) : r.abort());
  return { ctx, pg };
}
const SHOE_RAIL_RX = /^(zapatos|zapatillas|calzado|chimpunes|sandalias|botas|tacones)\b/i;

/* The store's page, as Danny sees it: the first card of its shoe rail. */
async function firstShoe(store) {
  const { ctx, pg } = await phone();
  try {
    await pg.goto(`${BASE}/tienda.html?tienda=${store}`, { waitUntil: "load" });
    await pg.waitForSelector("section.rail-sec .rail-title", { timeout: 30000 });
    const titles = await pg.$$eval("section.rail-sec", (ss) => ss.map((s) => s.getAttribute("aria-label") || ""));
    const order = titles.map((t, i) => ({ t, i })).filter((x) => SHOE_RAIL_RX.test(x.t.trim()));
    const rest = titles.map((t, i) => ({ t, i })).filter((x) => !SHOE_RAIL_RX.test(x.t.trim()));
    for (const { t, i } of [...order, ...rest]) {
      const sec = (await pg.$$("section.rail-sec"))[i];
      await sec.scrollIntoViewIfNeeded();
      await pg.waitForFunction((el) => !el.hasAttribute("data-lazy-rail"), sec, { timeout: 20000 }).catch(() => {});
      const cards = await sec.$$eval("a.card", (as) => as.map((a) => ({ href: a.getAttribute("href"), title: (a.querySelector(".card-title") || {}).textContent || "" })));
      for (const c of cards) {
        const name = new URL(c.href, BASE).searchParams.get("producto");
        const isShoeRail = SHOE_RAIL_RX.test(t.trim());
        /* The first shoe card: the shoe rail first, then every other rail in order. */
        if (isShoe(store, name)) {
          return { rail: t, name, shoeRail: isShoeRail };
        }
      }
    }
    /* No shoe on the first screen: the first one «Ver todo» brings, rail by rail. */
    for (const t of titles) {
      const idx = JSON.parse(readFileSync(join(ROOT, "assets/tienda", store, "index.json"), "utf8"));
      const rail = idx.rails.find((r) => r.title === t);
      if (!rail) continue;
      for (const name of railNames(store, idx, rail)) {
        if (isShoe(store, name)) return { rail: t + " (Ver todo)", name, shoeRail: false };
      }
    }
    /* A store whose rails hold no shoe (Gap, Banana Republic): its own
       listing, as its search box and chips page it. */
    const all = answer({ store, page: "1" }, [ROOT]).body;
    for (let n = 1; all && n <= (all.pages || 1); n++) {
      const pgN = n === 1 ? all : answer({ store, page: String(n) }, [ROOT]).body;
      for (const c of (pgN && pgN.items) || []) if (isShoe(store, c.name)) return { rail: "Todos (búsqueda en la tienda)", name: c.name, shoeRail: false };
    }
    return null;
  } finally { await ctx.close(); }
}
/* Every card of one rail, in its order: the endpoint's pages, or the static ones. */
function railNames(store, idx, rail) {
  const out = [];
  for (let n = 1; n <= Math.max(1, rail.pages || 1); n++) {
    let body;
    if (idx.railPages === "static") {
      const f = join(ROOT, "assets/tienda", store, "rails", rail.key + "-" + n + ".json");
      body = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
    } else body = answer({ store, rail: rail.key, page: String(n) }, [ROOT]).body;
    const items = (body && body.items) || [];
    if (!items.length) break;
    for (const c of items) out.push(c.name);
  }
  return out;
}

const SIZE_UI = { picker: "picker", pending: "Tallas por confirmar" };
async function onProducto(store, name, shot) {
  const { ctx, pg } = await phone();
  try {
    await pg.goto(`${BASE}/producto.html?tienda=${store}&producto=${encodeURIComponent(name)}`, { waitUntil: "load" });
    await pg.waitForSelector("#buy-box button, #buy-box .sizes-pending-note, #buy-box .vp-note, #vp-note", { timeout: 30000 });
    const s = await pg.evaluate(() => {
      const btn = document.getElementById("add-cart-btn");
      const sel = document.getElementById("size-select");
      return { btn: btn ? btn.textContent.trim() : "", disabled: btn ? btn.disabled : null,
        opts: sel ? [...sel.options].filter((o) => o.value && !o.disabled).length : 0,
        pendingNote: !!document.querySelector(".sizes-pending-note:not(#vp-note)"), vp: !!document.getElementById("vp-note") };
    });
    if (shot) { await pg.evaluate(() => document.getElementById("buy-box").scrollIntoView({ block: "center" })); await pg.screenshot({ path: shot, timeout: 60000 }).catch(() => {}); }
    return s;
  } finally { await ctx.close(); }
}
async function onApp(store, name, shot) {
  const { ctx, pg } = await phone();
  try {
    await pg.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { window.__appShowProduct = window.showProduct; }); });
    await pg.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => typeof window.__appShowProduct === "function" && typeof addToCartFromProduct === "function", null, { timeout: 30000 });
    /* A card from a thin slice carries no size list: the view asks the shard. */
    await pg.evaluate(([r, n]) => window.__appShowProduct(r, n, 60, 0.6, "https://img.test/p.jpg", []), [store, name]);
    await pg.evaluate(() => pendingProduct.sizeLookup);
    await pg.waitForTimeout(300);
    const s = await pg.evaluate(() => {
      const btn = document.getElementById("addToCartBtn");
      const wrap = document.getElementById("productSizeWrap");
      const sel = document.getElementById("productSizeSelect");
      return { btn: btn.textContent.trim(), disabled: btn.disabled,
        opts: wrap && !wrap.hidden ? [...sel.options].filter((o) => o.value && !o.disabled).length : 0 };
    });
    /* The rule, not the courtesy: the cart takes no sizeless shoe. */
    s.cart = await pg.evaluate(async () => { await addToCartFromProduct(); return JSON.parse(localStorage.getItem("aria_cart_v1") || "[]").length; });
    if (shot) { await pg.evaluate(() => document.getElementById("addToCartBtn").scrollIntoView({ block: "center" })); await pg.screenshot({ path: shot, timeout: 60000 }).catch(() => {}); }
    return s;
  } finally { await ctx.close(); }
}
const verdictOf = (s) => s.opts > 0 ? SIZE_UI.picker : (s.btn === "Tallas por confirmar" && s.disabled === true ? SIZE_UI.pending : "NO SIZE UI (" + s.btn + ")");

const table = [];
for (const store of STORES) {
  await check(`${store}: the first shoe in its shoe rail shows sizes or «Tallas por confirmar», in producto.html and the app's view`, async () => {
    const first = await firstShoe(store);
    assert.ok(first, store + ": no shoe card found on its store page");
    const shot = process.env.SHOT ? process.env.SHOT + "-" + store : "";
    const a = await onProducto(store, first.name, shot && shot + "-producto.png");
    const b = await onApp(store, first.name, shot && shot + "-app.png");
    const row = { store, rail: first.rail, name: first.name, producto: verdictOf(a), app: verdictOf(b),
      sized: REPORT.footwearByStore[store].sized, pending: REPORT.footwearByStore[store].sizesPending };
    table.push(row);
    assert.ok(row.producto === SIZE_UI.picker || row.producto === SIZE_UI.pending, `${store} producto.html «${first.name}»: ${row.producto}`);
    assert.ok(row.app === SIZE_UI.picker || row.app === SIZE_UI.pending, `${store} app view «${first.name}»: ${row.app}`);
    if (row.app === SIZE_UI.pending) assert.equal(b.cart, 0, `${store}: a sizes-pending shoe reached the cart`);
    if (a.pendingNote === false && row.producto === SIZE_UI.pending) assert.fail(store + ": no «confirmando las tallas» note");
  });
}

await browser.close();
server.close();
console.log("\n  store | shoe rail | first shoe | producto.html | app view | shoes sized / sizes-pending");
for (const r of table) console.log(`  ${r.store} | ${r.rail} | ${r.name} | ${r.producto} | ${r.app} | ${r.sized} / ${r.pending}`);
if (process.env.TABLE_JSON) (await import("node:fs")).writeFileSync(process.env.TABLE_JSON, JSON.stringify(table, null, 1));
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
