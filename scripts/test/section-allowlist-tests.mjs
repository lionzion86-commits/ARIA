#!/usr/bin/env node
/* ==================================================================
   SECTION ALLOWLISTS: WHAT EACH SECTION RENDERS IS ITS TYPE
   (#443 c.6615548354 -- Danny: "add a rendered-membership check to the
   build ... so a leak fails loudly pre-publish").

   Every curated section's generated files -- the slices the pages and
   the homepage paint from -- are checked card by card against the
   section's TYPE allowlist (scripts/lib/section-allowlist.js), each
   card's type read from the catalogue record it came from:

     Lencería              ropa-interior-women-feed.json, the homepage
                           Lencería shelf and store pills, Mujer › Lencería,
                           Moda Mujer / Tallas Plus «Lencería» rails
     Ropa Interior Hombre  ropa-interior-feed.json, its shelf and pills,
                           Moda Hombre «Ropa interior»
     Joyas y accesorios    the department, its pills, the homepage shelf
     Perfumes              the department and the homepage shelf
     Drones, Gym Rat, Tallas Plus, Lentes de sol   their homepage rails

   Then a browser samples the RENDERED cards (390px): the homepage
   Lencería tab and carousel, and ropa-interior.html's Mujer section.

     node scripts/test/section-allowlist-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/section-allowlist-tests.mjs   (also saves 390px screenshots)
   Same check, as the generators' gate:
     node scripts/build-ropa-interior-feed.mjs --check
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { intimateClass, isIntimate, headNoun, joyasTypeAllowed, PERFUME_TYPES, SECTION_ALLOWLISTS } from "../lib/section-allowlist.js";
import { buildFeed, buildWomenFeed } from "../build-ropa-interior-feed.mjs";
import { isDroneProduct } from "../lib/tech-aisle.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => JSON.parse(readFileSync(join(ROOT, f), "utf8"));
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const show = (bad) => bad.length + " outside the allowlist:\n           " + bad.slice(0, 12).join("\n           ");
const sb = {}; vm.createContext(sb); vm.runInContext(readFileSync(join(ROOT, "product-type.js"), "utf8"), sb);
const PT = sb.AriaProductType;

/* ---------- the rule ---------- */
await check("the rule: a lingerie TYPE is in; a lingerie WORD alone is not (the shopper's screenshot and its cousins)", () => {
  const C = (title, type) => intimateClass({ title, type });
  /* The reported leak: a pant is a pant, whatever discount it carries. */
  assert.equal(C("Women's Bengaline Pull-On Capri Pants", "PANTS"), "");
  assert.equal(C("Women's Linen-Blend Wide-Leg Pull-On Pants", "PANTS"), "");
  /* Lingerie types. */
  assert.equal(C("NO SHOW UNLINED DEMI BRA | SAND", "BRAS"), "bra");
  assert.equal(C("Viper Lace Hardware Cheeky Panty", "Ropa interior"), "underwear");
  assert.equal(C("LIGHTWEIGHT COTTON STRING THONG | SNOW", "Panty"), "panty");
  assert.equal(C("Wicked Sheer Unlined Lace-Trim Babydoll Set", "Lencería"), "lingerie");
  assert.equal(C("COTTON SHAPEWEAR HIGH-WAISTED BRIEF | MARBLE", "SHAPEWEAR_BOTTOMS"), "shapewear");
  assert.equal(C("COOL SHAPEWEAR CAPRI | ONYX", "SHAPEWEAR_BOTTOMS"), "shapewear");
  /* A type that says nothing: the head noun decides. */
  assert.equal(C("Plus Size Parfait Casey Plunge Molded T-Shirt Bra 2801", "Camisa"), "bra");
  assert.equal(C("Women's Hanes® Ultimate ComfortSoft Stretch Hipster Underwear, 5-Pack 41W5CS", "Ropa"), "underwear");
  assert.equal(C("Juniors' Pink Republic Bra Free Cami", "Ropa"), "");
  assert.equal(C("Women's Tek Gear® Ultrastretch Built-In Bra Tank Top", "Camisa"), "");
  assert.equal(C("Women's Freshwater Ring Bralette Swim Top", "Camisa"), "");
  assert.equal(C("My Sweet Love 12-inch Soft Baby Doll, Rose Pink Outfit", ""), "");
  assert.equal(C("Vans Womens UA Classic Slip-On", "Accesorios"), "");
  /* Another garment's type, whatever its title says. */
  assert.equal(C("Black Jenna Thong Platform Heeled Sandals", "HEELED SANDALS"), "");
  assert.equal(C("Yellow Bra Bag", "SHOULDER BAGS"), "");
  assert.equal(C("Black Boxer Shorts", "SHORTS"), "");
  assert.equal(C("Volcom Simply Rib Bralette Women's Bikini Top - Ocean Blue", "Bikinis"), "");
  /* The vetoes: another section's product even under an intimates type. */
  assert.equal(C("Women's Tek Gear® Ultrastretch Medium Support Zip Front Sports Bra", "Sostén"), "");
  assert.equal(C("5-Hook Bra Band Extender", "Bras"), "");
  assert.equal(C("The A&F Bella Bra-Free Linen-Blend Cami", "BRA"), "");
  /* A maternity store's department label is no garment type: the head noun decides. */
  assert.equal(C("Maternity & Postpartum Nursing & Sleep Bra", "LACTANCIA"), "bra");
  assert.equal(C("Dr. Brown's Hands Free Pumping Bra", "ALIMENTACION"), "");
  assert.equal(C("White Bullet Bra Polo", "POLOS"), "");
  /* Socks: their own class (the department's Medias half, never Lencería). */
  assert.equal(C("Women's SHINE Cozy Crew Socks", "Ropa"), "socks");
  assert.equal(C("Elite Wolf Head Crew Sock 3pk - White", "Unisex Crew Sock"), "socks");
  assert.equal(SECTION_ALLOWLISTS.lenceria.allow({ title: "Women's SHINE Cozy Crew Socks", type: "Ropa" }), false);
  assert.equal(headNoun("Bra Free Cami"), "neutral");
});

/* ---------- the catalogue truth: every committed record's own type ---------- */
const typeOf = new Map();
function rowsOf(dept) {
  const f = `assets/sections/departamento/_fn/${dept}.json`;
  return existsSync(join(ROOT, f)) ? read(f).rows || [] : [];
}
for (const d of ["women", "men", "kids", "curvy", "joyas_accesorios", "perfumes", "gym_rat", "electronics", "sunglasses"])
  for (const r of rowsOf(d)) typeOf.set(r[2] + "::" + r[0], r[7]);
const key = (retailer, title) => String(retailer || "").toLowerCase() + "::" + String(title || "");

/* ---------- Lencería and Ropa Interior: the feeds ---------- */
const menBuilt = buildFeed({ keepType: true });
const womenBuilt = buildWomenFeed({ keepType: true });
const feedPass = new Map();
for (const [g, built] of [["men", menBuilt], ["women", womenBuilt]]) for (const i of built.items) feedPass.set(g + "|" + key(i.r, i.t), i);

for (const [g, file, built] of [["women", "ropa-interior-women-feed.json", womenBuilt], ["men", "ropa-interior-feed.json", menBuilt]]) {
  await check(`${file}: every row's own type is in its allowlist (underwear rows: INTIMATE_TYPES, sock rows: SOCK_TYPES)`, () => {
    const bad = [];
    for (const i of built.items) {
      const c = intimateClass({ title: i.t, type: i.pt });
      if (i.ty === "socks" ? c !== "socks" : !c || c === "socks") bad.push(`${i.r}: ${i.t} [${i.pt}]`);
    }
    assert.ok(!bad.length, show(bad));
  });
  await check(`${file}: the committed feed holds only rows that pass (a leak in the committed file fails here)`, () => {
    const bad = read(file).items.filter((i) => !feedPass.has(g + "|" + key(i.r, i.t))).map((i) => `${i.r}: ${i.t} [${i.ty}/${i.sub}]`);
    assert.ok(!bad.length, show(bad));
  });
}

/* ---------- Lencería and Ropa Interior: what the homepage paints ---------- */
const PILLS = "assets/home/category-pills/";
const pillFiles = (prefix) => readdirSync(join(ROOT, PILLS)).filter((f) => f.startsWith(prefix + "-") && f.endsWith(".json"));
for (const [k, g, cls] of [["lenceria", "women", "lenceria"], ["interior-hombre", "men", "interior-hombre"]]) {
  await check(`homepage «${k}» rails (every store pill, Ofertas, Todas): each card is a passing feed row${k === "lenceria" ? ", never a sock" : ""}`, () => {
    const bad = [];
    for (const f of pillFiles(k)) for (const c of read(PILLS + f).cards || []) {
      const row = feedPass.get(g + "|" + key(c.retailer, c.title));
      if (!row || !SECTION_ALLOWLISTS[cls].allow({ title: row.t, type: row.pt })) bad.push(`${f}: ${c.retailer}: ${c.title}${row ? " [" + row.pt + "]" : " (not a feed row)"}`);
    }
    assert.ok(!bad.length, show(bad));
  });
}
await check("homepage shelves (category.json): the Lencería and Ropa Interior Hombre rails hold only passing feed rows", () => {
  const rails = read("assets/home/shelves/category.json").rails;
  const bad = [];
  for (const [rail, g, cls] of [["ropa_interior_mujer", "women", "lenceria"], ["ropa_interior", "men", "interior-hombre"]])
    for (const p of rails[rail] || []) {
      const row = feedPass.get(g + "|" + key(p.retailer, p.title));
      if (!row || !SECTION_ALLOWLISTS[cls].allow({ title: row.t, type: row.pt })) bad.push(`${rail}: ${p.retailer}: ${p.title}`);
    }
  assert.ok(!bad.length, show(bad));
});
await check("Mujer › Lencería (assets/home/pills/mujer-lenceria.json): each card's catalogue type is lingerie", () => {
  const bad = (read("assets/home/pills/mujer-lenceria.json").cards || [])
    .filter((c) => !SECTION_ALLOWLISTS.lenceria.allow({ title: c.t, type: typeOf.get(key(c.r, c.t)) }))
    .map((c) => `${c.r}: ${c.t} [${typeOf.get(key(c.r, c.t))}]`);
  assert.ok(!bad.length, show(bad));
});

/* The department pages' own «Lencería» / «Ropa interior» rails (Moda Mujer,
   Moda Hombre, Tallas Plus) and the Moda type pills' lenses. */
function deptRails(dept, titles) {
  const dir = `assets/sections/departamento/${dept}/`;
  const head = read(dir + "head.json");
  const want = new Set((head.rails || []).filter((r) => titles.includes(r.title)).map((r) => r.i));
  const cards = [];
  for (const r of head.rails || []) if (want.has(r.i) && r.cards) cards.push(...r.cards);
  for (const f of readdirSync(join(ROOT, dir)).filter((f) => /^rails-\d+\.json$/.test(f)))
    for (const r of read(dir + f).rails || []) if (want.has(r.i)) cards.push(...(r.cards || []));
  for (const f of ["lens-tipo-lenceria.json"]) if (existsSync(join(ROOT, dir, f))) for (const r of read(dir + f).rails || []) cards.push(...(r.cards || []));
  return cards;
}
for (const [dept, titles] of [["women", ["Lencería"]], ["men", ["Ropa interior", "Lencería"]], ["curvy", ["Lencería", "Ropa interior para hombre"]]]) {
  await check(`departamento.html?dept=${dept}: its ${titles.map((t) => "«" + t + "»").join(" / ")} rails and lens hold intimates types only`, () => {
    const cards = deptRails(dept, titles);
    assert.ok(cards.length > 0, "no cards found");
    const bad = cards.filter((c) => !isIntimate({ title: c.t, type: typeOf.get(key(c.r, c.t)) })).map((c) => `${c.r}: ${c.t} [${typeOf.get(key(c.r, c.t))}]`);
    assert.ok(!bad.length, show([...new Set(bad)]));
  });
}

/* ---------- the other curated sections ---------- */
await check("Joyas y accesorios: no home piece, book or toy by its own type -- the department, its homepage pills and its shelf", () => {
  const bad = [];
  for (const r of rowsOf("joyas_accesorios")) if (!joyasTypeAllowed({ title: r[0], type: r[7] })) bad.push(`dept: ${r[2]}: ${r[0]} [${r[7]}]`);
  for (const f of pillFiles("joyas")) for (const c of read(PILLS + f).cards || []) {
    const type = typeOf.get(key(c.retailer, c.title));
    if (!joyasTypeAllowed({ title: c.title, type })) bad.push(`${f}: ${c.retailer}: ${c.title} [${type}]`);
  }
  for (const p of read("assets/home/shelves/joyas.json").picks || []) if (!joyasTypeAllowed(p)) bad.push(`shelf: ${p.retailer}: ${p.title} [${p.type}]`);
  assert.ok(!bad.length, show(bad));
});
await check("Perfumes: the department and the homepage shelf hold Fragancia (and a fragrance line's Cuidado corporal) only", () => {
  const bad = [];
  for (const r of rowsOf("perfumes")) if (!PERFUME_TYPES.has(String(r[7]).toLowerCase())) bad.push(`dept: ${r[2]}: ${r[0]} [${r[7]}]`);
  for (const p of read("assets/home/shelves/perfumes.json").picks || [])
    if (!PERFUME_TYPES.has(String(p.type).toLowerCase())) bad.push(`shelf: ${p.retailer}: ${p.title} [${p.type}]`);
  assert.ok(!bad.length, show(bad));
});
await check("Drones: the Electrónica › Drones rail holds drones only (tech-aisle isDroneProduct)", () => {
  const f = "assets/sections/departamento/electronics/home-tech_drones.json";
  const cards = read(f).cards || [];
  assert.ok(cards.length >= 8);
  const bad = cards.filter((c) => !isDroneProduct({ title: c.t, type: typeOf.get(key(c.r, c.t)) || c.ty || "" })).map((c) => `${c.r}: ${c.t}`);
  assert.ok(!bad.length, show(bad));
});
for (const [k, fams, extra] of [
  ["gym-rat", ["ropa", "deportes", "accesorios", "sombreros", "carteras", "trajes_bano"], (c, t) => !PT.isFootwear({ title: c.title, type: t }, c.retailer)],
  ["tallas-plus", ["ropa", "trajes_bano"], null],
  ["lentes", ["accesorios"], null],
]) {
  await check(`homepage «${k}» rails: each card's family (type first, /product-type.js) is ${fams.join(" / ")}`, () => {
    const bad = [];
    for (const f of pillFiles(k)) for (const c of read(PILLS + f).cards || []) {
      const t = typeOf.get(key(c.retailer, c.title)) || c.type || "";
      const fam = PT.classify({ title: c.title, type: t, retailer: c.retailer });
      if (!fams.includes(fam) || (extra && !extra(c, t))) bad.push(`${f}: ${c.retailer}: ${c.title} [${t}] -> ${fam}`);
    }
    assert.ok(!bad.length, show(bad));
  });
}

/* ---------- the rendered cards ---------- */
let pw = null;
if (!process.env.SECTION_ALLOWLIST_NO_BROWSER) { try { pw = (await import("playwright")).default || (await import("playwright")); } catch { pw = null; } }
if (!pw || !pw.chromium) console.log("    skip browser: playwright not available (or SECTION_ALLOWLIST_NO_BROWSER)");
else {
  const { createServer } = await import("node:http");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const srv = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.startsWith("/.netlify/functions/exchange-rate")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
    if (u.pathname.startsWith("/.netlify/")) { res.writeHead(503); return res.end("{}"); }
    const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!f.startsWith(ROOT) || !existsSync(f) || f.endsWith("/")) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const SHOT = process.env.SHOT_DIR || "";
  const phone = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    return { c, page };
  };
  const passWomen = (retailerLess) => [...feedPass.entries()].some(([k, v]) => k.startsWith("women|") && v.t === retailerLess && SECTION_ALLOWLISTS.lenceria.allow({ title: v.t, type: v.pt }));
  try {
    await check("rendered 390px: ropa-interior.html#mujer -- the first cards of every Mujer rail are lingerie or socks by type, and Sostenes / Panties lead with lingerie", async () => {
      const { c, page } = await phone();
      await page.goto(`${BASE}/ropa-interior.html#mujer`);
      await page.waitForSelector("#w-main:not([hidden]) .card .title", { timeout: 60000 });
      const titles = await page.$$eval("#w-main .card:not(.sk) .title", (ts) => ts.slice(0, 60).map((t) => t.textContent.trim()));
      assert.ok(titles.length >= 12, "few cards: " + titles.length);
      const womenTitles = new Map([...feedPass.entries()].filter(([k]) => k.startsWith("women|")).map(([, v]) => [v.t.replace(/\s+/g, " ").trim(), v]));
      const bad = titles.filter((t) => { const v = womenTitles.get(t.replace(/\s+/g, " ")); return !v || !intimateClass({ title: v.t, type: v.pt }); });
      assert.ok(!bad.length, show(bad));
      if (SHOT) {
        await page.evaluate(() => { const el = document.getElementById("w-tipo"); if (el) el.scrollIntoView(); window.scrollBy(0, -140); });
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(SHOT, "lenceria-page-mujer.png") });
      }
      await c.close();
    });
    await check("rendered 390px: the homepage Lencería tab and carousel lead with lingerie (each card a passing Lencería feed row)", async () => {
      const { c, page } = await phone();
      await page.goto(`${BASE}/`);
      await page.waitForFunction(() => typeof setCategoryTab === "function", null, { timeout: 60000 });
      await page.evaluate(() => document.getElementById("mCategoryTabRail").scrollIntoView());
      await page.waitForFunction(() => document.querySelector('#mCategoryTabPills [data-cat-tab="ropa_interior_mujer"]'), null, { timeout: 60000 });
      await page.click('#mCategoryTabPills [data-cat-tab="ropa_interior_mujer"]');
      await page.waitForTimeout(600);
      const tab = await page.$$eval("#mCategoryTabRail [data-category-rail-card]", (cs) => cs.map((x) => x.getAttribute("data-idx")));
      const picks = await page.evaluate(() => (categoryRailsRendered.ropa_interior_mujer || []).map((p) => [p.retailer, p.title]));
      assert.ok(tab.length >= 8 && picks.length >= 8, `tab ${tab.length}, picks ${picks.length}`);
      const bad = picks.filter(([r, t]) => { const v = feedPass.get("women|" + key(r, t)); return !v || !SECTION_ALLOWLISTS.lenceria.allow({ title: v.t, type: v.pt }); }).map((x) => x.join(": "));
      assert.ok(!bad.length, show(bad));
      assert.match(await page.textContent("#mCategoryTabBlurb"), /lencer/i);
      if (SHOT) {
        await page.evaluate(() => { document.querySelector("[data-category-tabs]").scrollIntoView(); });
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(SHOT, "lenceria-home-tab.png") });
      }
      await c.close();
    });
    if (SHOT) await check("rendered 390px: Mujer › Lencería pill on the homepage (screenshot)", async () => {
      const { c, page } = await phone();
      await page.goto(`${BASE}/`);
      await page.waitForFunction(() => typeof setPillShelf === "function", null, { timeout: 60000 });
      await page.evaluate(() => document.querySelector('[data-pill-shelf="mujer"]').previousElementSibling.scrollIntoView());
      await page.waitForSelector('[data-pill-shelf="mujer"]:not([hidden]) [data-shelf-pill="lenceria"]', { timeout: 60000 });
      await page.click('[data-pill-shelf="mujer"]:not([hidden]) [data-shelf-pill="lenceria"]');
      await page.waitForTimeout(1500);
      const titles = await page.$$eval('[data-pill-shelf="mujer"]:not([hidden]) [data-shelf-card]', (cs) => cs.length);
      assert.ok(titles >= 8);
      await page.evaluate(() => { document.querySelector('[data-pill-shelf="mujer"]:not([hidden])').scrollIntoView(); });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(SHOT, "lenceria-mujer-pill.png") });
      await c.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log("  FAIL  " + f);
process.exit(failures.length ? 1 : 0);
