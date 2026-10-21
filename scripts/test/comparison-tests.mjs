/* ==================================================================
   ONE PRODUCT, EVERY STORE -- AND THE WORDS THAT FAILED THE BATTERY
   (#416, 2026-10-19).

   Danny's build order: "Specific search with the same product at 2+
   stores -> ONE grouped block: every store's door price in soles,
   bold, Mejor precio and Entrega más rápida badges -- never 30
   ungrouped duplicate cards again." And from the battery run on
   production: "frenos" answered with women's swimsuits, and "barbie"
   and "lego" opened with branded girls' apparel ahead of the dolls and
   the sets. These checks hold:

   - "adidas samba" carries one comparison block; every row is the same
     shoe (brand, model, colour), links to that store's product page on
     Aria, and leads with its door price in soles;
   - the door price is checkout's: the cart line producto.html writes,
     the server weight resolver, freight at the published per-kg rate,
     the import-tax estimate and the small-order fee -- the helpers
     orders-create.js charges with;
   - "Mejor precio" sits on the one cheapest door price; "Entrega más
     rápida" only on a store that is genuinely faster, from the
     researched delivery table, and never on a guess;
   - different products are never grouped (colour, wearer, edition,
     brand, beauty sizes);
   - "frenos", "freno", "pastillas de freno", "discos de freno" and
     "frenos delanteros" lead with brake parts;
   - "barbie" and "lego" lead with toys; a search that is not mostly
     toys keeps its order;
   - search.html draws the block soles-first, links only inside Aria,
     uses yellow only for the sale badge, and carries no emoji.

   RUNNING IT
     node scripts/test/comparison-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const core = await import("../../netlify/functions/_search-core.js");
const door = await import("../../netlify/functions/_door-price.js");
const { resolveCartWeights } = await import("../../netlify/functions/_weight-resolve.js");
const { freightFloorUsd } = await import("../../netlify/functions/_checkout-model.js");
const W = await import("../../weight-data.js");
const { deliveryFor } = await import("../../scripts/lib/retailer-delivery.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const FX = 3.4;
const ctx = core.buildSearchContext();
const page = (q, n = 1) => core.searchPage(ctx, q, n, { fx: FX });
const r2 = (n) => Math.round(Number(n) * 100) / 100;

/* What orders-create.js charges for a one-line order, rebuilt from the
   same helpers, in its order (goods, resolved kg -> freight floor,
   dutiable base -> import tax, products + freight -> small-order fee,
   total x venta + fee). */
function checkoutTotalPen(line, fx) {
  const kg = resolveCartWeights([line]).totalKg;
  const freight = freightFloorUsd(undefined, kg, W.CHARGE_PER_KG);
  const goods = Number(line.priceUsd) * line.qty;
  const dutiable = W.dutiableBaseUsd(line.priceUsd, line.dutiableUsd) * line.qty;
  const tax = W.importTaxEstimateUsd(dutiable, freight);
  const totalUsd = r2(goods + freight + tax);
  const fee = W.smallOrderFeePen(r2((goods + freight) * fx));
  return r2(totalUsd * fx + fee);
}

/* ------------------------------------------------------------------
   THE ACCEPTANCE QUERY.
   ------------------------------------------------------------------ */
const samba = page("adidas samba");
await check("\"adidas samba\" carries ONE comparison block of 2+ stores, each a different store", () => {
  assert.equal(samba.state, "results");
  assert.equal(samba.mode, "specific");
  assert.ok(samba.compare, "no comparison block");
  const stores = samba.compare.stores.map((s) => s.store);
  assert.ok(stores.length >= 2, stores.join());
  assert.equal(new Set(stores).size, stores.length, "a store twice");
  for (const s of samba.compare.stores) assert.match(s.title, /samba/i);
  console.log("         stores: " + samba.compare.stores.map((s) => `${s.storeLabel} S/ ${s.door && s.door.pen}`).join(" | "));
});

await check("every row is the same shoe: one brand, one model, one colour", () => {
  const keys = samba.compare.stores.map((s) => core.sameProductKey(ctx, ctx.products.find((p) => p.id === s.id)));
  assert.ok(keys[0], "no key");
  assert.equal(new Set(keys).size, 1, keys.join(" / "));
});

await check("each row leads with a soles door price; the grid does not repeat the block", () => {
  for (const s of samba.compare.stores) {
    assert.ok(s.door && s.door.pen > 0 && s.door.usd > 0, `${s.store}: no door price`);
    assert.ok(s.door.usd >= s.usd, `${s.store}: the door price is under the shelf price`);
    assert.ok(s.door.freightUsd > 0, `${s.store}: no freight in the door price`);
  }
  const inBlock = new Set(samba.compare.stores.map((s) => s.id));
  for (let n = 1; n <= samba.pages; n++) for (const it of page("adidas samba", n).items) assert.ok(!inBlock.has(it.id), `${it.title} is in the block and the grid`);
  if (samba.pages > 1) assert.equal(page("adidas samba", 2).compare, null, "the block is page 1 only");
  assert.equal(page("lego", 2).compare, null, "the block is page 1 only");
  assert.ok(JSON.stringify(samba).length < 300e3, "page 1 over 300KB");
});

/* ------------------------------------------------------------------
   THE DOOR PRICE IS CHECKOUT'S.
   ------------------------------------------------------------------ */
await check("the cart line is the one producto.html writes (rows link there)", () => {
  const pdp = readFileSync(ROOT + "producto.html", "utf8");
  const at = pdp.indexOf("mergeCartLine({");
  assert.ok(at > 0, "producto.html no longer adds through mergeCartLine");
  const body = pdp.slice(at, pdp.indexOf("});", at));
  assert.match(body, /priceUsd: priceUsd/);
  assert.match(body, /dutiableUsd: Math\.round\(Number\(p\.price\) \* salesTaxRate\(p\.retailer\) \* 100\) \/ 100/);
  assert.match(body, /weightKg: 0\.2,\s*weightEstimated: true/);
  const line = door.cartLineFor({ retailer: "ccs", title: "X", brand: "Y", cardUsd: 38.48, rawUsd: 29, taxRate: 1.07 });
  assert.deepEqual(line, { retailer: "ccs", title: "X", priceUsd: 38.48, dutiableUsd: 31.03, weightKg: 0.2, weightEstimated: true, brand: "Y", qty: 1 });
});

await check("door price = what orders-create.js charges for that one line (every samba and battery row)", () => {
  const rows = [];
  for (const q of ["adidas samba", "airpods", "funko", "nike dunk"]) {
    const o = page(q);
    if (o.compare) rows.push(...o.compare.stores);
  }
  assert.ok(rows.length >= 4, "too few comparison rows to check");
  for (const s of rows) {
    const p = ctx.products.find((x) => x.id === s.id);
    const line = door.cartLineFor({ retailer: p.retailer, title: p.title, brand: p.brand, cardUsd: s.usd,
      rawUsd: p.finalPrice ? null : p.price, taxRate: core.salesTaxRate(p.retailer) });
    assert.equal(s.door.pen, checkoutTotalPen(line, FX), `${s.store} ${s.title}`);
  }
});

await check("the math's edges: import tax over the $200 line, the small-order fee under S/ 50, a weight checkout refuses", () => {
  /* Over $200 of goods: 25% of goods + freight (CIF). */
  const big = door.cartLineFor({ retailer: "target", title: "Apple AirPods Max 2 - Blue", brand: "Apple", cardUsd: 893.18, rawUsd: 673.18, taxRate: 1.07 });
  const d = door.doorPrice(big, FX);
  assert.ok(d.taxUsd > 0, "no import tax on a $720 item");
  assert.equal(d.taxUsd, W.importTaxEstimateUsd(big.dutiableUsd, d.freightUsd));
  assert.equal(d.pen, checkoutTotalPen(big, FX));
  /* A S/ 30 lipstick pays the small-order fee. */
  const small = door.cartLineFor({ retailer: "ulta", title: "Lip Balm 0.15 oz", brand: "X", cardUsd: 6.62, rawUsd: 5, taxRate: 1.07 });
  const s = door.doorPrice(small, FX);
  assert.equal(s.feePen, W.SMALL_ORDER_FEE_PEN, JSON.stringify(s));
  assert.equal(s.pen, checkoutTotalPen(small, FX));
  /* Without a rate: dollars only, and the page's conversion matches. */
  const noFx = door.doorPrice(small, null);
  assert.equal(noFx.pen, null);
  assert.equal(door.doorPen(noFx, FX), s.pen);
  /* A weight checkout does not believe (a catalogue figure outside its
     plausible band): checkout refuses to quote it (resolveCartWeights
     needsReview), so no total. */
  const odd = { ...door.cartLineFor({ retailer: "target", title: "5G WiFi Bluetooth Projector", brand: "", cardUsd: 60, rawUsd: 45, taxRate: 1.07 }), specWeightKg: 0.065 };
  assert.equal(resolveCartWeights([odd]).needsReview, true);
  const u = door.doorPrice(odd, FX);
  assert.equal(u.quotable, false);
  assert.equal(u.pen, null);
  /* Danny's 889 ruling (#449): a truthful quote is not refused just
     because the freight costs more than the item. A $1.50 product no row
     knows is weighed by its siblings and gets a door price. */
  const cheap = door.cartLineFor({ retailer: "target", title: "Zorblax", brand: "", cardUsd: 1.5, rawUsd: 1.13, taxRate: 1.07 });
  assert.equal(resolveCartWeights([cheap]).needsReview, false);
  assert.equal(door.doorPrice(cheap, FX).quotable, true);
});

/* ------------------------------------------------------------------
   THE BADGES.
   ------------------------------------------------------------------ */
await check("\"Mejor precio\" sits on the one cheapest door price; rows run cheapest first", () => {
  for (const q of ["adidas samba", "airpods", "funko", "nike dunk"]) {
    const c = page(q).compare;
    if (!c) continue;
    const quoted = c.stores.filter((s) => s.door);
    const min = Math.min(...quoted.map((s) => s.door.usd));
    const best = c.stores.filter((s) => s.best);
    const unique = quoted.filter((s) => s.door.usd === min).length === 1;
    assert.equal(best.length, unique ? 1 : 0, q);
    if (unique) assert.equal(best[0].door.usd, min, q);
    for (let i = 1; i < quoted.length; i++) assert.ok(quoted[i - 1].door.usd <= quoted[i].door.usd, q + ": not cheapest first");
  }
});

await check("\"Entrega más rápida\" only for a store genuinely faster, from the researched table", () => {
  assert.equal(core.fastestStore(["walmart", "costco"]), "walmart");       // 2-5 vs 5-7
  assert.equal(core.fastestStore(["revolve", "macys", "dicks"]), "revolve"); // 2-2 vs 3-6
  assert.equal(core.fastestStore(["walmart", "target"]), null);            // the same 2-5: a tie
  assert.equal(core.fastestStore(["revolve", "sephora"]), null);           // 2-2 vs 1-3: sephora can be faster
  assert.equal(deliveryFor("zumiez"), null, "zumiez has researched days now: pick another store without data");
  assert.equal(core.fastestStore(["ccs", "zumiez"]), null);                // a store without data: no badge
  assert.equal(core.fastestStore(["yesstyle", "alphalete"]), null);        // 14-28 vs 7-30+: alphalete can be faster
  for (const q of ["adidas samba", "airpods", "funko", "nike dunk"]) {
    const c = page(q).compare;
    if (!c) continue;
    const fast = c.stores.filter((s) => s.fastest);
    assert.ok(fast.length <= 1, q);
    if (fast.length) assert.equal(fast[0].store, core.fastestStore(c.stores.map((s) => s.store)), q);
    if (c.stores.some((s) => !deliveryFor(s.store))) assert.equal(fast.length, 0, q + ": a badge with a store's speed unknown");
  }
});

/* ------------------------------------------------------------------
   NEVER GROUP DIFFERENT PRODUCTS.
   ------------------------------------------------------------------ */
await check("different products never share a key (colour, wearer, edition, brand, size)", () => {
  const k = (title, brand = "adidas", retailer = "x") => core.sameProductKey(ctx, { title, brand, retailer });
  assert.equal(k("Adidas Samba ADV Shoes - Dark Brown/Core Black/Gum"), k("adidas Samba ADV Dark Brown, Black & Gum Skate Shoes"));
  assert.notEqual(k("Adidas Samba ADV Shoes - Grey/Cream White/Grey"), k("adidas Samba ADV Grey & White Skate Shoes"));
  assert.notEqual(k("adidas Originals Samba OG - Women's"), k("adidas Originals Samba OG - Men's"));
  assert.notEqual(k("adidas Originals Samba OG - Women's"), k("adidas Originals Samba OG"));
  assert.notEqual(k("Apple AirPods 4", ""), k("Apple AirPods 4 with Active Noise Cancellation", ""));
  assert.notEqual(k("Nike Dunk Low Panda", "Nike"), k("Nike Dunk Low Panda", "Jordan"));
  assert.equal(k("Better Than Sex Volumizing & Lengthening Mascara", "Too Faced"), null, "a beauty product without a size grouped");
  assert.equal(k("Samba", "adidas"), null, "a one-word model is not a product");
});

await check("a store with two same-named listings stays out; no group spans list prices 2x apart", () => {
  for (const q of ["adidas samba", "nike air force 1", "airpods", "funko", "nike dunk", "barbie", "lego", "levis 501", "crocs"]) {
    const o = page(q);
    if (!o.compare) continue;
    const r = core.runQuery(ctx, q);
    for (const s of o.compare.stores) {
      const p = ctx.products.find((x) => x.id === s.id);
      const key = core.sameProductKey(ctx, p);
      assert.equal(r.hits.filter((h) => h.retailer === p.retailer && core.sameProductKey(ctx, h) === key).length, 1, `${q}: ${s.store} lists it twice`);
    }
    const lists = o.compare.stores.map((s) => { const p = ctx.products.find((x) => x.id === s.id); return Math.max(p.price, p.originalPrice || 0); });
    assert.ok(Math.max(...lists) <= 2 * Math.min(...lists), q);
  }
});

await check("a browse query never carries a comparison block", () => {
  for (const q of ["dolls", "muñecas", "vestidos", "frenos", "juguetes"]) assert.equal(page(q).compare, null, q);
});

/* ------------------------------------------------------------------
   "FRENOS" IS BRAKES.
   ------------------------------------------------------------------ */
await check("\"frenos\" and its relatives lead with brake parts, never swimwear", () => {
  const want = {
    "frenos": /\bbrake/i, "freno": /\bbrake/i, "pastillas de freno": /\bbrake pads?\b/i,
    "discos de freno": /\bbrake rotors?\b/i, "frenos delanteros": /\bfront\b[\s\S]*\bbrake|\bbrake[\s\S]*\bfront\b/i,
    "brake pads": /\bbrake pads?\b/i,
  };
  for (const [q, re] of Object.entries(want)) {
    const o = page(q);
    assert.equal(o.state, "results", q);
    const top = o.items.slice(0, 10);
    for (const it of top) assert.match(it.title, re, `${q}: "${it.title}" leads`);
    for (const it of o.items) assert.ok(!/swim|bikini|bathing suit|tankini/i.test(it.title), `${q}: swimwear "${it.title}"`);
  }
  assert.ok(page("frenos").total >= page("brake pads").total, "frenos finds fewer parts than brake pads");
});

await check("the glossary adds only multi-word part names (\"clutch\" is still a handbag)", () => {
  for (const w of ["clutch", "bateria", "foco", "escape", "marcha", "llantas"]) assert.ok(!ctx.dict.words.has(w) || !/kit|car battery|light bulb|exhaust|starter|tires/.test(ctx.dict.words.get(w).join()), `${w} was taken over`);
  assert.equal(JSON.stringify(ctx.dict.words.get("pastillas de freno")), '["brake pads"]');
  assert.equal(JSON.stringify(ctx.dict.words.get("filtro de aceite")), '["oil filter"]');
  /* A phrase the dictionary already had keeps its meaning. */
  const merged = core.withPartsGlossary({ phrases: { "filtro de aire": "air purifier filter" } }, { entries: [{ es: "filtro de aire", en: ["engine air filter"] }] });
  assert.equal(merged.phrases["filtro de aire"], "air purifier filter");
  const clutch = page("clutch");
  assert.ok(clutch.items.slice(0, 10).every((it) => !/clutch kit/i.test(it.title)), "clutch kits lead \"clutch\"");
});

/* ------------------------------------------------------------------
   TOYS LEAD A TOY SEARCH.
   ------------------------------------------------------------------ */
await check("\"barbie\" and \"lego\" open with toys; branded apparel follows", () => {
  for (const q of ["barbie", "lego", "hot wheels"]) {
    const r = core.runQuery(ctx, q);
    const firstOther = r.hits.findIndex((p) => !core.isToyDept(p));
    const lastToy = r.hits.length - 1 - [...r.hits].reverse().findIndex((p) => core.isToyDept(p));
    assert.ok(firstOther < 0 || firstOther > lastToy, `${q}: "${r.hits[firstOther] && r.hits[firstOther].title}" before a toy`);
    const byId = new Map(r.hits.map((p) => [p.id, p]));
    for (const it of page(q).items.slice(0, 12)) assert.ok(core.isToyDept(byId.get(it.id)), `${q}: "${it.title}" (not a toy) leads`);
  }
});

await check("a search that is not mostly toys keeps the engine's order", () => {
  const P = (dept, id) => ({ id, departments: [dept] });
  const half = [P("apparel_kids", 1), P("toys", 2), P("jewelry", 3), P("toys", 4)];
  assert.deepEqual(core.toysLead(half).map((p) => p.id), [1, 2, 3, 4], "50/50 moved");
  const toyish = [P("apparel_kids", "a"), ...Array.from({ length: 12 }, (_, i) => P("toys", i))];
  assert.equal(core.toysLead(toyish)[0].id, 0);
  assert.equal(core.toysLead(toyish).at(-1).id, "a");
  const raw = ctx.P.run({ S: ctx.S, products: ctx.products, retailers: ctx.retailers, dict: ctx.dict, resultLimit: ctx.resultLimit }, "mickey").hits;
  assert.ok(raw.filter(core.isToyDept).length / raw.length < 0.5, "mickey became mostly toys: pick another mixed search");
  assert.deepEqual(core.runQuery(ctx, "mickey").hits.slice(0, 50).map((p) => p.id), raw.slice(0, 50).map((p) => p.id));
});

/* ------------------------------------------------------------------
   THE PAGE.
   ------------------------------------------------------------------ */
const html = readFileSync(ROOT + "search.html", "utf8");
await check("search.html draws the block: soles first, badges, each row to its own Aria product page", () => {
  const start = html.indexOf("function productHref("), end = html.indexOf("/* ---------- search ---------- */");
  const box = { esc: (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"), decodeEntities: (s) => s,
    fmtUsd: (n) => "US$ " + Number(n).toFixed(2), fmtPen: (n) => "S/ " + Number(n).toFixed(2), BASE: "",
    cardImgAttrs: (u) => 'src="' + u + '"', encodeURIComponent };
  vm.runInNewContext(html.slice(start, end) + "\nthis.f = compareHTML;", box);
  const h = box.f(samba.compare);
  assert.match(h, /class="cmp"/);
  for (const s of samba.compare.stores) {
    const at = h.indexOf("tienda=" + s.store);
    assert.ok(at > 0, s.store + " row missing");
    const rowEnd = h.indexOf("</a>", at);
    const row = h.slice(at, rowEnd);
    assert.ok(row.indexOf("S/ " + s.door.pen.toFixed(2)) >= 0 && row.indexOf("S/ ") < row.indexOf("US$ "), s.store + ": soles not first");
    if (s.logo) assert.ok(row.includes('src="/' + s.logo + '"'), s.store + ": no logo");
  }
  const hrefs = [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= samba.compare.stores.length);
  for (const u of hrefs) assert.match(u, /^producto\.html\?producto=/, "a link out of Aria: " + u);
  if (samba.compare.stores.some((s) => s.best)) assert.match(h, /Mejor precio/);
  assert.ok(!/Entrega más rápida/.test(h) || samba.compare.stores.some((s) => s.fastest));
  const tbd = box.f({ title: "X", stores: [{ store: "a", storeLabel: "A", title: "X", usd: 10, door: null }, { store: "b", storeLabel: "B", title: "X", usd: 12, door: { usd: 20, pen: 68 } }] });
  assert.match(tbd, /Total por confirmar/);
  assert.ok(!/US\$ 10\.00/.test(tbd), "an unquotable row shows its shelf price as if it were a total");
});

await check("search.html: yellow only on the sale badge, no emoji, rows never link to a retailer", () => {
  const css = html.slice(html.indexOf("/* ONE PRODUCT, EVERY STORE"), html.indexOf(".empty{"));
  const gold = [...css.matchAll(/([.\w -]+)\{[^}]*var\(--gold\)/g)].map((m) => m[1].trim());
  assert.deepEqual(gold, [".cmp-badge.off"]);
  const block = html.slice(html.indexOf("/* ---------- one product, every store"), html.indexOf("/* ---------- search ---------- */"));
  assert.ok(!/\p{Extended_Pictographic}/u.test(block + css), "an emoji in the comparison block");
  assert.ok(!/https?:\/\//.test(block), "an absolute link in the comparison block");
});

await check("the index's store table: every store named, every logo a real file", () => {
  const ix = JSON.parse(readFileSync(ROOT + "assets/search/catalog-index.json", "utf8"));
  assert.ok(ix.stores && typeof ix.stores === "object", "no stores table: rebuild with node scripts/build-search-index.mjs");
  const at = ix.fields.indexOf("retailer");
  for (const k of new Set(ix.rows.map((r) => r[at]))) {
    assert.ok(ix.stores[k] && ix.stores[k].label, k + " has no name");
    if (ix.stores[k].logo) assert.ok(existsSync(ROOT + ix.stores[k].logo), k + ": " + ix.stores[k].logo + " missing");
  }
  for (const k of ["ccs", "zumiez", "walmart", "dicks", "finishline"]) assert.ok(ix.stores[k].logo, k + " lost its logo");   /* live lanes (#443) */
});

const MIN_CHECKS = 18;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
