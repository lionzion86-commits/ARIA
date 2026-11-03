/* ==================================================================
   THE MANUAL SHADE CURATION, LIVE (#443 c.6613186317).

   data/shade-pulls-2026-11-03/MANUAL-REPORT.md lists every listing the
   data lane read by hand, with its status and how many shades went into
   the datasets (dataset-yesstyle.json, dataset-victoriassecret.json,
   dataset-rescue.json). This holds the built pages to that report, row
   by row:
     - every listing with shades in the data is lifted: a «Tono» dropdown
       (every option a shade the data names for it) or its one named
       shade; a YesStyle / Victoria's Secret dropdown's other shades are
       the same listing (its page, price and photos);
     - every no-shade-axis listing is sold without a picker, and the cart,
       checkout and the order endpoint's rule (lineNeedsShade) agree;
     - every other listing is still gated («Tonos en camino») and on the
       worklist: the unresolvable ones, the names-only ones with no SKU,
       the Ulta Mini Double Wear whose worklist SKU (2657548) is none of
       its six verified SKUs, the Walmart hub listing whose own item id is
       none of its three shades, Costco's tinted lip-oil 3-pack whose page
       names no shade;
     - none of Victoria's Secret's names-only shades appears anywhere.
   Browser, 390px: the TIRTIR cushion's dropdown (pick -> cart line), a
   Victoria's Secret lip oil, a no-axis Sephora powder that can be bought,
   the Ulta mini that stays gated.

   RUN: node scripts/test/shade-manual-tests.mjs
   SHADEMAN_SHOTS=<dir> also writes shademan-*.png there.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHOTS = process.env.SHADEMAN_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message || e).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
const DATA = join(ROOT, "data/shade-pulls-2026-11-03");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

await import(join(ROOT, "shade-gate.js"));
const G = globalThis.AriaShadeGate;
const { shadeSkuOf } = await import(join(ROOT, "scripts/lib/variant-families.mjs"));

/* ---------- the report, row by row ---------- */
const SECTION = { yesstyle: "yesstyle", victoria: "victoriassecret", sephora: "sephora", walmart: "walmart", costco: "costco", ulta: "ulta" };
const rows = [];
{
  let store = "";
  for (const line of readFileSync(join(DATA, "MANUAL-REPORT.md"), "utf8").split("\n")) {
    const h = /^## (\S+)/.exec(line);
    if (h) { store = SECTION[h[1].toLowerCase().replace(/'.*$/, "")] || ""; continue; }
    if (!store || !/^\| /.test(line) || /^\| (listing|---)/.test(line)) continue;
    const c = line.replace(/^\||\|\s*$/g, "").split("|").map((x) => x.trim());
    if (c.length < 6) continue;
    rows.push({ store, title: c[0], status: c[1], inData: Number(c[2]) || 0 });
  }
}
/* Held gated on purpose (see the header). */
const HELD = new Map([
  ["ulta|Mini Double Wear Stay-in-Place Longwear Matte Foundation", "worklist SKU 2657548 is none of the six verified SKUs (the 4W1 page reads 2657534)"],
  ["walmart|L'oreal Paris Excellence Creme Permanent Hair Color", "the hub listing's own item id (18335951483) is none of its three verified shades"],
  ["costco|Neutrogena Hydro Boost Lip Oil, 0.2 fl oz, 3-pack", "a tinted lip oil 3-pack whose page names no shade: which tints are in it is unknown"],
]);
/* The shades the data names, per store (labels exactly as written). */
const labels = new Map();
for (const f of ["dataset-yesstyle.json", "dataset-victoriassecret.json", "dataset-rescue.json"]) {
  for (const p of readJson(join(DATA, f))) {
    const host = (/^https?:\/\/([^\/]+)/.exec(p.url || "") || [])[1] || "";
    const store = f === "dataset-yesstyle.json" ? "yesstyle" : f === "dataset-victoriassecret.json" ? "victoriassecret"
      : /sephora/.test(host) ? "sephora" : /ulta/.test(host) ? "ulta" : /costco/.test(host) ? "costco" : "walmart";
    if (!labels.has(store)) labels.set(store, new Set());
    const set = labels.get(store);
    const bySku = new Map();
    for (const v of p.variantList) {
      const t = (v.variants || []).find((x) => /^(actual_color|hair_color_shade)-/.test(x));
      if (!t) continue;
      const l = t.replace(/^[a-z_]+-/, "").trim().replace(/\s+/g, " ");
      set.add(l);
      if (!bySku.has(v.usItemId)) bySku.set(v.usItemId, []);
      bySku.get(v.usItemId).push(l);
    }
    /* A pack's contents read as one: «nOOHde, MUAH-ve, p-INKED, HEY-zel». */
    for (const ls of bySku.values()) if (ls.length > 1) set.add([...new Set(ls)].join(", "));
  }
}

/* The report writes a title's "|" as "/" (it would split its table). */
const titleIn = (store, title) => [title, title.replace(/ \/ /g, " | ")].find((t) => records.has(store + "|" + t)) || title;
/* ---------- the built pages ---------- */
const records = new Map();
for (const f of readdirSync(join(ROOT, "assets/pdp/p"))) {
  const shard = readJson(join(ROOT, "assets/pdp/p", f));
  for (const list of Object.values(shard)) for (const r of list) {
    const k = r.retailer + "|" + r.name;
    if (!records.has(k)) records.set(k, []);
    records.get(k).push(r);
  }
}
const groups = new Map();
for (const f of readdirSync(join(ROOT, "assets/pdp/g"))) for (const [g, list] of Object.entries(readJson(join(ROOT, "assets/pdp/g", f)))) groups.set(g, list);
const worklist = new Set();
for (const f of readdirSync(join(ROOT, "data/shade-pull-worklist-2026-11-02")).filter((x) => x.endsWith(".json")))
  for (const e of readJson(join(ROOT, "data/shade-pull-worklist-2026-11-02", f))) worklist.add(e.store + "|" + e.title);
const outcome = new Map();   // store|title -> dropdown | oneShade | noAxis | gated
await check("every listing with shades in the data is lifted: a «Tono» dropdown or its one named shade, every label the data's own", () => {
  const by = {};
  for (const row of rows) {
    const k = row.store + "|" + titleIn(row.store, row.title);
    if (!(row.inData > 0) || HELD.has(k)) continue;
    const recs = records.get(k) || [];
    assert(recs.length, `${k}: no product page`);
    const set = labels.get(row.store) || new Set();
    let kind = "oneShade";
    for (const r of recs) {
      assert(String(r.c || "").trim(), `${k}: still no shade on its page`);
      assert(r.ax === "Tono", `${k}: axis ${r.ax}`);
      assert(set.has(r.c), `${k}: shade «${r.c}» is not one the data names`);
      assert(!worklist.has(k), `${k}: still on the worklist`);
      if (r.g) {
        const list = groups.get(r.g) || [];
        assert(list.length >= 2, `${k}: group of ${list.length}`);
        for (const x of list) assert(set.has(x.c), `${k}: dropdown shade «${x.c}» is not one the data names`);
        assert(new Set(list.map((x) => x.c)).size === list.length, `${k}: a shade twice in its dropdown`);
        /* Same page: the other shades are this listing (price, photo, URL). */
        const anchor = list.find((x) => x.v === r.v);
        for (const x of list.filter((y) => y.sp === 1)) {
          assert(anchor && x.price === anchor.price && x.image === anchor.image && (x.url || "") === (anchor.url || ""), `${k}: shade «${x.c}» is not the same listing (price/photo/URL)`);
        }
        if (["sephora", "ulta", "walmart", "costco"].includes(row.store)) assert(!list.some((x) => x.sp === 1), `${k}: a SKU store's shade offered without its own SKU listing`);
        kind = "dropdown";
      }
    }
    outcome.set(k, kind);
    const s = (by[row.store] = by[row.store] || { dropdown: 0, oneShade: 0 });
    s[kind]++;
  }
  const want = { yesstyle: { dropdown: 55, oneShade: 13 }, victoriassecret: { dropdown: 6, oneShade: 10 }, sephora: { dropdown: 0, oneShade: 45 }, walmart: { dropdown: 0, oneShade: 7 }, costco: { dropdown: 0, oneShade: 3 } };
  assert(Object.keys(by).length === Object.keys(want).length && Object.keys(want).every((s) => JSON.stringify(by[s]) === JSON.stringify(want[s])), "lifted " + JSON.stringify(by));
  return JSON.stringify(by);
});

await check("every no-shade-axis listing is sold without a picker; page, cart and order rule agree", () => {
  const noAxis = rows.filter((r) => r.status === "no_shade_axis" && !HELD.has(r.store + "|" + r.title));
  assert(noAxis.length === 12, "no-axis rows " + noAxis.length);
  const listed = Object.keys(G.NO_SHADE_AXIS).sort();
  assert(JSON.stringify(listed) === JSON.stringify(noAxis.map((r) => r.store + "|" + r.title.toLowerCase().replace(/\s+/g, " ")).sort()), "shade-gate.js NO_SHADE_AXIS differs from the report: " + listed.length);
  for (const row of noAxis) {
    const k = row.store + "|" + row.title;
    const recs = records.get(k) || [];
    assert(recs.length, `${k}: no product page`);
    for (const r of recs) {
      assert(!r.sk && !String(r.c || "").trim() && !r.g, `${k}: sk ${r.sk} c «${r.c || ""}»`);
      assert(r.price > 0 && r.image, `${k}: no price or photo`);
    }
    assert(G.kindOf({ name: row.title, retailer: row.store, dept: "beauty", type: "Rostro" }) === "", `${k}: the gate still reads it as a shade product`);
    assert(!G.lineNeedsShade({ title: row.title, retailer: row.store }), `${k}: a cart line would be refused`);
    assert(!worklist.has(k), `${k}: still on the worklist`);
    outcome.set(k, "noAxis");
  }
  /* The exemption is the store's exact title: another store or a near title is still gated. */
  assert(G.kindOf({ name: "All Nighter Waterproof Setting Powder", retailer: "ulta" }) === "makeup", "the exemption leaked to another store");
  return JSON.stringify(noAxis.reduce((a, r) => ((a[r.store] = (a[r.store] || 0) + 1), a), {}));
});

await check("every other listing of the report is still gated («Tonos en camino») and on the worklist", () => {
  const by = {};
  for (const row of rows) {
    const k = row.store + "|" + titleIn(row.store, row.title);
    if (outcome.has(k)) continue;
    const recs = records.get(k) || [];
    assert(recs.length, `${k}: no product page`);
    for (const r of recs) assert(r.sk && !String(r.c || "").trim(), `${k} (${row.status}): sold (c «${r.c || ""}», sk ${r.sk})`);
    assert(worklist.has(k), `${k}: gated but not on the worklist`);
    by[row.store] = by[row.store] || {};
    const why = HELD.has(k) ? "held" : row.status;
    by[row.store][why] = (by[row.store][why] || 0) + 1;
  }
  assert(by.sephora && by.sephora.unresolvable === 8, "Sephora unresolvable " + JSON.stringify(by.sephora));
  assert(by.ulta && by.ulta.held === 1, "Ulta " + JSON.stringify(by.ulta));
  assert(by.victoriassecret && by.victoriassecret.names_only === 5, "VS " + JSON.stringify(by.victoriassecret));
  return JSON.stringify(by);
});

await check("the Ulta Mini Double Wear stays gated: none of its six verified shades lands on the 2657548 listing", () => {
  const recs = records.get("ulta|Mini Double Wear Stay-in-Place Longwear Matte Foundation") || [];
  const r = recs.find((x) => shadeSkuOf(x.url) === "2657548");
  assert(r, "no 2657548 record");
  assert(r.sk && !r.c && !r.g, `c «${r.c}» g ${r.g}`);
  return "sk " + r.sk + ", no shade";
});

await check("none of Victoria's Secret's names-only shades appears anywhere", () => {
  const vs = labels.get("victoriassecret");
  const count = readJson(join(DATA, "dataset-victoriassecret.json")).reduce((n, p) => n + p.variantList.length, 0);
  assert(count === 25, "VS dataset shades " + count);
  const offered = new Set();
  for (const [k, recs] of records) {
    if (!k.startsWith("victoriassecret|")) continue;
    for (const r of recs) {
      if (r.c) offered.add(r.c);
      if (r.g) { for (const x of groups.get(r.g) || []) offered.add(x.c); for (const x of groups.get(r.g + "~p") || []) offered.add(x); }
    }
  }
  const stray = [...offered].filter((c) => !vs.has(c));
  assert(!stray.length, "offered but not in the data: " + stray.join(", "));
  /* The names the report itself lists as names-only, on their products. */
  const NAMES_ONLY = {
    "Bombshell Shine Lip Drama Ultra-Shimmer Gloss": ["Bronze Siren", "Peony Prism", "Kiss My Pearl", "Sparkling Spice"],
    "Shine Plumper": ["Rose", "Praline", "Clear"],
    "Shine Plumper Lip Extreme Plumper": ["Peony", "Petal Extreme"],
    "pH Gummy Lip Gloss": ["Juicy Cherry"],
    "Very Sexy Night Currant Petals Nail Lacquer": ["Spiced Bloom"],
    "Very Sexy Scarlet Amber Blossom Nail Lacquer": ["Spiced Bloom"],
    "Very Sexy Scarlet Scarlet Red Nail Lacquer": ["Spiced Bloom"],
  };
  for (const [title, names] of Object.entries(NAMES_ONLY)) {
    for (const r of records.get("victoriassecret|" + title) || []) {
      const here = [r.c, ...(r.g ? (groups.get(r.g) || []).map((x) => x.c).concat(groups.get(r.g + "~p") || []) : [])].filter(Boolean);
      for (const n of names) assert(!here.includes(n), `${title}: names-only «${n}» is offered`);
    }
  }
  return `${offered.size} VS shades offered, all from the 25 with a choice URL/ID`;
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
const shot = async (pg, name, sel, block = "center") => {
  if (!SHOTS) return;
  if (sel) { const h = await pg.$(sel); if (h) await h.evaluate((e, b) => { e.scrollIntoView({ block: b }); if (b === "start") window.scrollBy(0, -90); }, block); }
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: join(SHOTS, "shademan-" + name + ".png") });
};
const openProduct = async (pg, name, store) => {
  await pg.goto(BASE + "/producto.html?producto=" + encodeURIComponent(name) + "&tienda=" + store, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => { const b = document.getElementById("buy-box"); return b && b.children.length; }, null, { timeout: 20000 });
};
const pageState = (pg) => pg.evaluate(() => {
  const sel = document.getElementById("shade-select");
  return {
    options: sel ? Array.from(sel.options).map((o) => ({ v: o.value, t: o.textContent, on: o.selected })) : [],
    current: (document.getElementById("v-current") || {}).textContent || "",
    gate: (document.getElementById("shade-gate-note") || {}).textContent || "",
    button: ((document.getElementById("add-cart-btn") || {}).textContent || "").trim(),
    buyOn: !!document.getElementById("add-cart-btn") && !document.getElementById("add-cart-btn").disabled,
    swatchPhotos: document.querySelectorAll("#variant-box .v-opt img").length,
    pen: (document.querySelector(".p-pen") || {}).textContent || "",
    photo: (document.querySelector(".p-gallery img") || {}).getAttribute ? document.querySelector(".p-gallery img").getAttribute("data-img-orig") || document.querySelector(".p-gallery img").getAttribute("src") : "",
  };
});
const cartLines = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));

await check("TIRTIR Mask Fit Red Cushion: 40 tonos on its own page, pick one -> same price -> cart line «Tono»", async () => {
  const title = "Mask Fit Red Cushion - 40 Colors";
  const want = readJson(join(DATA, "dataset-yesstyle.json")).find((p) => p.name === title).variantList.length;
  const { ctx, pg } = await phone();
  try {
    await openProduct(pg, title, "yesstyle");
    const s = await pageState(pg);
    assert(s.options.length === want && want === 40, `${s.options.length} options (data ${want})`);
    assert(s.current === "55N Espresso", `opens on «${s.current}» (its URL's shade is 55N Espresso)`);
    assert(!s.gate && s.buyOn, `gated: ${s.gate}`);
    assert(s.swatchPhotos === 0, `${s.swatchPhotos} swatch photos: the page's photo is not a shade's swatch`);
    await shot(pg, "tirtir-dropdown", "#variant-box");
    const target = s.options.find((o) => !o.on && /21N/.test(o.t)) || s.options.find((o) => !o.on);
    await pg.selectOption("#shade-select", target.v);
    await pg.waitForFunction((v) => new URL(location.href).searchParams.get("v") === v, target.v, { timeout: 5000 });
    const a = await pageState(pg);
    assert(a.current === target.t, `label «${a.current}» after picking «${target.t}»`);
    assert(a.pen === s.pen && a.photo === s.photo, `price ${s.pen} -> ${a.pen} or photo changed`);
    await shot(pg, "tirtir-picked", "#variant-box");
    await pg.click("#add-cart-btn");
    const line = (await cartLines(pg)).find((l) => l.variantId === target.v);
    assert(line && line.variantAxis === "Tono" && line.colorway === target.t, "cart line " + JSON.stringify(line && { a: line.variantAxis, c: line.colorway }));
    assert(/pid\.1117014693/.test(line.url || ""), "the line's dispatch URL is not the listing's pid page: " + line.url);
    return `${s.options.length} tonos, «${s.current}» -> «${line.colorway}», ${a.pen}`;
  } finally { await ctx.close(); }
});

await check("Victoria's Secret: Lip Glow Sheer Lip Oil's five tonos; a nail lacquer named by its title", async () => {
  const { ctx, pg } = await phone();
  try {
    await openProduct(pg, "Lip Glow Sheer Lip Oil", "victoriassecret");
    const s = await pageState(pg);
    assert(s.options.map((o) => o.t).sort().join("|") === ["Clear", "Maple", "Mulberry", "Peony", "Poppy"].join("|"), "options " + s.options.map((o) => o.t).join(", "));
    assert(!s.gate && s.buyOn, "gated: " + s.gate);
    await shot(pg, "vs-lip-oil-dropdown", "#variant-box");
    await openProduct(pg, "Very Sexy Scarlet Amber Blossom Nail Lacquer", "victoriassecret");
    const n = await pageState(pg);
    const one = await pg.evaluate(() => (document.getElementById("shade-one") || {}).textContent || "");
    assert(/Tono: Amber Blossom/.test(one) && !n.options.length && n.buyOn, `nail lacquer: «${one}»`);
    await shot(pg, "vs-nail-lacquer-one-shade", "#shade-one");
    return `${s.options.length} tonos; «${one.trim().slice(0, 40)}»`;
  } finally { await ctx.close(); }
});

await check("a no-shade-axis Sephora powder is now buyable, with no picker and no gate", async () => {
  const title = "All Nighter Waterproof Setting Powder";
  const { ctx, pg } = await phone();
  try {
    await openProduct(pg, title, "sephora");
    const s = await pageState(pg);
    assert(!s.gate && s.buyOn && !s.options.length && s.button !== "Tonos en camino", `gate «${s.gate}», button «${s.button}»`);
    await shot(pg, "noaxis-sephora-powder", "h1", "start");
    await shot(pg, "noaxis-sephora-powder-buy", "#add-cart-btn");
    await pg.click("#add-cart-btn");
    const line = (await cartLines(pg)).find((l) => l.title === title);
    assert(line && !G.lineNeedsShade(line), "cart line refused: " + JSON.stringify(line && { shadeKind: line.shadeKind }));
    await pg.goto(BASE + "/checkout.html", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(1500);
    assert(!(await pg.$("[data-shade-missing]")), "checkout flags it as a shade product with no shade");
    return `${s.pen}, «${s.button}», cart and checkout take it`;
  } finally { await ctx.close(); }
});

await check("the Ulta Mini Double Wear still shows «Tonos en camino» and is not sold", async () => {
  const { ctx, pg } = await phone();
  try {
    await openProduct(pg, "Mini Double Wear Stay-in-Place Longwear Matte Foundation", "ulta");
    const s = await pageState(pg);
    assert(/^Tonos en camino/.test(s.gate) && !s.buyOn && s.button === "Tonos en camino" && !s.options.length, `gate «${s.gate}», button «${s.button}»`);
    await shot(pg, "ulta-mini-double-wear-gated", "#shade-gate-box");
    return s.button;
  } finally { await ctx.close(); }
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
