/* ==================================================================
   UNIVERSAL VARIANT TRUTH (#443; supersedes the title-only Phase 1 for
   every store whose source carries its variants).

   These checks hold:
   - Walmart shade families (productDetails "Actual Color" axis) parse
     into one product with one member per shade; the numbered reissue
     wins over the old unnumbered name; Pack Size values are never
     shades, and a multipack never prices a shade sold singly (a pack
     that is the only option stays); an empty variant list stays one
     product;
   - nothing is invented: a shade with no real price and photo is listed
     as pending, never offered; a second detail pass turns it into a
     member with no code change;
   - Walmart beauty is no longer excluded from grouping (its home and
     electronics aisles still are);
   - Route A, Macy's: the colour structure its export carries (colorMap)
     is re-normalised into families; each colour has its own photos, the
     product's one price (Macy's: applicableToAllUpcs) and sizes "por
     confirmar" -- the committed file is what the product pages use;
   - Data Drop 2 shapes (fixtures): Shopify sibling colourways and
     in-record Color options, Kohl's colors/swatches, Zumiez one product
     per colourway; a held colourway the live feed no longer sells is
     agotado, never buyable;
   - groups never blend: one store per group, and no two colourways of a
     group share the comparison's product key;
   - the cart line carries the shade picked, its listing id and its own
     store URL;
   - in a browser (fixture shards): the shade picker says "Tono", swaps
     photo and price, names the pending shades, blocks an agotado shade,
     and the cart line buys the picked shade;
   - SHADE SIBLINGS (#443 c.6568696054, Danny's phone pass): Walmart's
     one-listing-per-shade dyes and makeup ("..., 5 Medium Brown, 1 Kit")
     group by the exact product line into one "Tono" picker; two lines
     never merge; a size, pack, count or claim is never a shade; a hair
     dye names its tono in words; a "- N Colors" title with no shade data
     never shows the claim; the acceptance cases Danny re-tests render
     (390px) with the picker he expects, and the cart buys the shade.

   RUNNING IT
     node scripts/test/variant-family-tests.mjs
     VARIANT_SHOTS=<dir> node scripts/test/variant-family-tests.mjs   (also saves screenshots)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { liftDeclarations } from "../lib/page-lift.mjs";
import { liftPage, buildRecords } from "../build-pdp-slices.mjs";
import { groupColourways, variantIdOf, NOT_FASHION, variantExcluded, beautyShade, isShadePart } from "../lib/variants.mjs";
import { parseWalmartFamilies, readWalmartPulls, applyFamilies, shadeKey, packCount, loadFamilies, normUrl } from "../lib/variant-families.mjs";
import { ingestAll } from "../ingest-variant-pulls.mjs";
import { serve, openPage } from "./lib/variant-browser.mjs";
import { loadDisplayName } from "./lib/display-name.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const FX = ROOT + "scripts/test/fixtures/";
const PDP = ROOT + "assets/pdp/";
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("  FAIL  " + name); }
}
const P = liftPage(ROOT);

/* ---------- Walmart shade families (fixture) ---------- */
const pass1 = readWalmartPulls(FX + "variant-pulls");
const pass2 = readWalmartPulls(FX + "variant-pulls-pass2");
const W1 = parseWalmartFamilies(pass1.products);
const W2 = parseWalmartFamilies([...pass1.products, ...pass2.products]);
/* The fixture's two first listings stand in for catalogue listings. */
const asListing = (e) => ({ v: variantIdOf(e.url), retailer: "walmart", dept: "beauty", name: e.name, brand: e.brand, url: e.url, price: e.price, image: e.images[0], images: e.images });
const catalogue = pass1.products.slice(0, 2).map(asListing);

await check("a Walmart family parses into one product, one member per shade", () => {
  assert.equal(pass1.files.length, 1);
  assert.equal(W1.families.length, 1, "one family");
  const f = W1.families[0];
  assert.equal(f.axis, "Tono");
  assert.deepEqual(f.members.map((m) => m.label), ["07 Warm Up", "Deep Mesh", "Lace Detail", "Embellishment"]);
  assert.equal(f.members.find((m) => m.label === "Lace Detail").available, false);
});
await check("generation dedupe: the numbered, selected reissue wins over the old unnumbered name", () => {
  assert.equal(shadeKey("WARM UP"), shadeKey("07 Warm Up"));
  assert.equal(shadeKey("#07 Warm Up"), "warm up");
  const f = W1.families[0];
  const warm = f.members.filter((m) => shadeKey(m.label) === "warm up");
  assert.equal(warm.length, 1);
  assert.equal(warm[0].id, "6HML2AWK518H");
  assert.ok(!f.members.some((m) => m.id === "7KTDGZUL2IAQ"), "the old generation is offered");
  assert.equal(W1.stats.superseded, 1);
});
await check("pack sizes: never a shade; a multipack never prices a shade sold singly; a pack that is the only option stays", () => {
  assert.equal(packCount("2 Pack"), 2); assert.equal(packCount("1 Count"), 1); assert.equal(packCount("Pack of 3"), 3);
  const ids = W1.families.flatMap((f) => f.members.map((m) => m.id));
  assert.ok(!ids.includes("9PK2WARMUP01"), "the 2-pack became a shade");
  assert.equal(W1.stats.multipackSkipped, 1);
  const warm = W1.families[0].members[0];
  assert.equal(warm.price, 7.97, "the shade is priced from its single unit");
  assert.equal(warm.pack, "1 Count");
  /* The trio sold only as a 3-pack is not dropped: it is its own product (no colour axis). */
  assert.ok(!W1.families.some((f) => f.members.some((m) => m.id === "3ONLYPACK001")));
  assert.equal(W1.stats.single, 2, "the Revlon and the only-pack trio stay single");
});
await check("an empty variant list stays a single product, with no invented shades", () => {
  assert.ok(!W1.families.some((f) => f.members.some((m) => m.id === "5RVLNEMPTY01")));
  const solo = [asListing(pass1.products[4])];
  const r = applyFamilies(solo, W1.families);
  assert.equal(r.assign.size, 0);
  assert.equal(r.extra.length, 0);
});
await check("never invent: a shade with no real price and photo is pending, never offered", () => {
  const r = applyFamilies(catalogue, W1.families);
  const labels = [...r.assign.values()].map((a) => a.c);
  assert.deepEqual(labels.sort(), ["07 Warm Up", "Deep Mesh", "Lace Detail"]);
  assert.deepEqual([...r.pending.values()][0], ["Embellishment"]);
  for (const x of r.extra) { assert.ok(x.price > 0 && /^https:/.test(x.image) && x.name && x.url, JSON.stringify(x)); }
  const lace = [...r.assign.entries()].find(([, a]) => a.c === "Lace Detail")[1];
  assert.equal(lace.so, 1, "the unavailable shade is marked agotado");
  assert.equal([...r.assign.values()][0].ax, "Tono");
});
await check("the second detail pass drops in with no code change", () => {
  assert.equal(pass2.files.length, 1);
  const r = applyFamilies(catalogue, W2.families);
  const emb = r.extra.find((x) => /Embellishment/.test(x.name));
  assert.ok(emb, "Embellishment is not offered after its detail arrived");
  assert.equal(emb.price, 7.47);
  assert.equal(r.pending.size, 0);
});
await check("the ingest reads walmart-beauty-*/dataset.json and is a no-op while the pull is not committed", () => {
  const all = ingestAll(FX + "variant-pulls");
  assert.equal(all.get("walmart-beauty").families.length, 1);
  const real = ingestAll(ROOT + "scripts/data/variant-pulls");
  assert.ok(real instanceof Map);
});

/* ---------- the beauty exclusion ---------- */
await check("Walmart beauty is no longer excluded from grouping; its home and electronics aisles still are", () => {
  assert.ok(!NOT_FASHION.has("walmart"));
  assert.equal(variantExcluded({ retailer: "walmart", dept: "beauty" }), false);
  assert.equal(variantExcluded({ retailer: "walmart", dept: "shoes" }), false);
  assert.equal(variantExcluded({ retailer: "walmart", dept: "electronics" }), true);
  assert.equal(variantExcluded({ retailer: "walmart", dept: "home_decor" }), true);
  const m = groupColourways([
    { v: "a", retailer: "walmart", dept: "beauty", brand: "NYX", name: "NYX Fixture Lip Cream - Rose Petal", url: "https://w/1", image: "https://i/1.jpg" },
    { v: "b", retailer: "walmart", dept: "beauty", brand: "NYX", name: "NYX Fixture Lip Cream - Deep Mesh", url: "https://w/2", image: "https://i/2.jpg" },
  ]);
  assert.equal(m.size, 2, "walmart beauty colourways did not group");
});

/* ---------- Route A: Macy's colours from its own export ---------- */
const families = loadFamilies(ROOT);
const macysFams = families.filter((f) => f.retailer === "macys");
await check("Route A, Macy's: the export's colours are families; each colour its own photos, the product's price, sizes por confirmar", () => {
  assert.ok(macysFams.length > 300, "macys families: " + macysFams.length);
  const list = P.extractItems(JSON.parse(readFileSync(ROOT + "macys-catalog.json", "utf8"))).map((it) => ({ ...it, v: variantIdOf(it.url) }));
  const r = applyFamilies(list, macysFams);
  assert.ok(r.stats.families > 300 && r.extra.length > 800, JSON.stringify(r.stats));
  const byV = new Map(list.map((l) => [l.v, l]));
  for (const x of r.extra) {
    const anchor = [...r.assign.entries()].find(([v, a]) => a.g === r.assign.get(x.v).g && byV.has(v));
    const a = byV.get(anchor[0]);
    assert.equal(x.price, a.price, "a colour priced apart from its product");
    assert.equal(x.name, a.name);
    assert.notEqual(x.image, a.image, "a colour without its own photo");
    assert.equal(x.sizesPending, true, "a colour's sizes were copied from the product");
  }
  const idx = JSON.parse(readFileSync(PDP + "index.json", "utf8"));
  assert.ok(idx.variantFamilies && idx.variantFamilies.families >= r.stats.families, "the built pages do not carry the families");
});

/* ---------- Data Drop 2 shapes (fixtures) ---------- */
const drops = ingestAll(FX + "variant-pulls");
const extract = (file) => P.extractItems(JSON.parse(readFileSync(ROOT + file, "utf8"))).map((it) => ({ ...it, v: variantIdOf(it.url) }));
await check("Shopify sibling colourways (CCS Samba OG): the live feed's six, the held one it no longer sells agotado", () => {
  const r = applyFamilies(extract("ccs-catalog.json"), drops.get("ccs").families);
  const a = [...r.assign.values()];
  assert.equal(a.length, 7);
  assert.equal(new Set(a.map((x) => x.g)).size, 1);
  const cream = a.find((x) => /Cream White/.test(x.c));
  assert.equal(cream.so, 1, "a colourway no longer live stays buyable");
  assert.equal(a.filter((x) => x.so).length, 1);
  assert.equal(r.extra.length, 4);
  assert.ok(r.extra.every((x) => /^https:\/\/shop\.ccs\.com\/products\//.test(x.url) && x.sizes && x.sizes.length));
});
await check("Shopify in-record Color option: each colour its own price, photo and sizes; no photo, pending", () => {
  const anchor = [{ v: variantIdOf("https://www.islandwatersports.com/products/fixture-rash-guard"), retailer: "islandwatersports", name: "Fixture Rash Guard", brand: "Fixture Surf",
    url: "https://www.islandwatersports.com/products/fixture-rash-guard", price: 45, image: "https://cdn.shopify.com/s/files/fixture/rash-black.jpg" }];
  const r = applyFamilies(anchor, drops.get("islandwatersports").families);
  assert.equal(r.assign.size, 2);
  const ocean = r.extra[0];
  assert.equal(ocean.price, 39);
  assert.deepEqual(ocean.sizes, ["M", "L"]);
  assert.match(ocean.url, /\?variant=20013$/);
  assert.deepEqual([...r.pending.values()][0], ["Coral"]);
  const black = drops.get("islandwatersports").families[0].members[0];
  assert.deepEqual(black.sizes, ["S"], "a sold-out size offered");
});
await check("Kohl's colors/swatches: a colour with its own photo is offered (sizes por confirmar); one without, pending", () => {
  const f = drops.get("kohls").families[0];
  const anchor = [{ v: variantIdOf(f.members[0].url), retailer: "kohls", name: f.members[0].name, brand: "Fixture Brand", url: f.members[0].url, price: 34.99, image: "https://media.kohlsimg.com/is/image/kohls/fixture_Black" }];
  const r = applyFamilies(anchor, [f]);
  assert.equal(r.assign.size, 2);
  assert.equal(r.extra[0].sizesPending, true);
  assert.notEqual(r.extra[0].v, anchor[0].v);
  assert.deepEqual([...r.pending.values()][0], ["Elite Wine"]);
});
await check("Zumiez, one product per colourway: grouped by model, a lone model stays single", () => {
  const f = drops.get("zumiez").families;
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].members.map((m) => m.label), ["Black, White & Gum", "Green & Gum"]);
});

/* ---------- never blended ---------- */
await check("groups never blend: one store per group; no two colourways share the comparison's product key", async () => {
  process.chdir(ROOT);
  const core = await import("../../netlify/functions/_search-core.js");
  const ctx = core.buildSearchContext();
  let n = 0;
  for (const s of ["000", "0a1", "1b2", "2c3", "3d4", "3ff"]) {
    const gs = JSON.parse(readFileSync(PDP + "g/" + s + ".json", "utf8"));
    for (let [g, vs] of Object.entries(gs)) {
      if (g.endsWith("~p")) continue;
      const hosts = new Set(vs.map((x) => (/^https?:\/\/([^\/]+)/.exec(x.url || "") || [])[1]).filter(Boolean));
      assert.ok(hosts.size <= 1, g + " spans stores: " + [...hosts]);
      /* "Black & White" and "White & Black" are two products at Zumiez
         (two photos, two URLs); the comparison key, which sorts words,
         cannot tell them apart, so they are left out of this check. */
      const ws = (x) => x.c.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
      const seen = new Map(); for (const x of vs) seen.set(ws(x), (seen.get(ws(x)) || 0) + 1);
      vs = vs.filter((x) => seen.get(ws(x)) === 1);
      const keys = vs.map((x) => core.sameProductKey(ctx, { title: x.name + (x.name.includes(x.c) ? "" : " " + x.c), brand: "", retailer: "x" })).filter(Boolean);
      const titled = vs.filter((x) => x.name.includes(x.c));
      if (titled.length === vs.length) assert.equal(new Set(keys).size, keys.length, g + " blends colourways: " + keys.join(" / "));
      n++;
    }
  }
  assert.ok(n > 20, "checked " + n);
});

/* ---------- shade siblings (Model B) ---------- */
await check("shade siblings: the store's shade part is read; sizes, packs, counts and claims are never shades", () => {
  assert.deepEqual(beautyShade("L'Oreal Paris Excellence Creme Permanent Hair Color, 5 Medium Brown, Triple Protection, 1 Kit"),
    { model: "loreal paris excellence creme permanent hair color", shade: "5 Medium Brown" });
  assert.equal(beautyShade("L'Oreal Paris Feria Permanent Hair Color, V38 Violet Noir, Up to 40 Percent Stronger Hair, 1 Kit").shade, "V38 Violet Noir");
  assert.equal(beautyShade("L'Oreal Paris Superior Preference Hair Color, Ultra Ash Very Light Blonde 10UA").shade, "Ultra Ash Very Light Blonde 10UA");
  assert.equal(beautyShade("Revlon Liquid Foundation, Age Defying Makeup, 025 SAND BEIGE, 1 Fl Oz").shade, "025 Sand Beige");
  assert.equal(beautyShade("Revlon Glimmer Tinted Facial Moisturizer Stick, Light Coverage Foundation, 120, 0.31 oz").shade, "120");
  assert.equal(isShadePart("8G Golden Blonde"), true, "a shade code, not 8 grams");
  assert.equal(isShadePart("8.5 g"), false);
  for (const x of ["1 Kit", "0.13 fl oz", "Pack of 1", "Gray Coverage", "Medium Coverage", "16hr Longwear", "4 Ultra-Pigmented Matte & Shimmer Shades", "6 colors", "SPF 18", "Triple Protection"])
    assert.equal(isShadePart(x), false, x + " is not a shade");
  assert.equal(beautyShade("(2 pack) L'Oreal Paris Colour Riche Lip Liner, Toffee To Be 782"), null, "a multipack is never a shade");
  assert.equal(beautyShade("Maybelline Lifter Liner Lip Liner Makeup with Hyaluronic Acid, Big Lift, 0.04 oz"), null, "no code and no colour word: not grouped");
  assert.equal(beautyShade("Sun Bum Revitalizing 10oz Shampoo"), null);
});
await check("shade siblings group by the exact line into one Tono picker; two lines never merge", () => {
  const W = (name, id, price) => ({ v: variantIdOf("https://www.walmart.com/ip/x/" + id), retailer: "walmart", dept: "beauty", brand: "", name, price, url: "https://www.walmart.com/ip/x/" + id, image: "https://i/" + id + ".jpg" });
  const ls = [
    W("L'Oreal Paris Excellence Creme Permanent Hair Color, 5 Medium Brown, Triple Protection, 1 Kit", 1, 11.97),
    W("L'Oreal Paris Excellence Creme Permanent Hair Color, 7 Dark Blonde, 1 kit", 2, 11.97),
    W("L'Oreal Paris Excellence Universal Nudes Permanent Hair Color, 5N Natural Brown, 1 kit", 3, 11.97),
    W("L'Oreal Paris Excellence Universal Nudes Permanent Hair Color, 5N Natural Brown, 1 kit", 4, 12.97),
    W("Revlon Glimmer Color Correcting Concealer, 101 Peach, 0.3 fl oz", 5, 12.5),
    W("Revlon Glimmer Color Correcting Concealer, 100 Green, 0.3 fl oz", 6, 10.25),
    { ...W("L'Oreal Paris Excellence Creme Permanent Hair Color, 6 Light Brown, 1 kit", 7, 11.97), dept: "home" },
  ];
  const m = groupColourways(ls);
  const g = (i) => m.get(ls[i].v);
  assert.ok(g(0) && g(1) && g(0).g === g(1).g, "the two Excellence Creme shades are one picker");
  assert.equal(g(0).ax, "Tono");
  assert.equal(g(1).c, "7 Dark Blonde");
  assert.equal(g(2), undefined, "Universal Nudes is another product; one shade twice is not two shades");
  assert.ok(g(4) && g(4).g === g(5).g && g(4).g !== g(0).g, "the concealer is its own picker");
  assert.equal(g(6), undefined, "outside a beauty aisle, no shade grouping");
});
await check("the committed pages: real Walmart dye and makeup siblings are one Tono picker each (Model B)", () => {
  const rec = (t) => (JSON.parse(readFileSync(PDP + "p/" + P.pdpShard(P.norm(t)) + ".json", "utf8"))[P.norm(t)] || [])[0];
  const grp = (r) => JSON.parse(readFileSync(PDP + "g/" + P.groupShard(r.g) + ".json", "utf8"))[r.g];
  const a = rec("L'Oreal Paris Excellence Creme Permanent Hair Color, 5 Medium Brown, Triple Protection, 1 Kit");
  assert.equal(a.ax, "Tono"); assert.equal(a.c, "5 Medium Brown");
  assert.deepEqual(grp(a).map((x) => x.c).sort(), ["5 Medium Brown", "7 Dark Blonde"]);
  const cc = rec("e.l.f. Camo CC Cream, Light 205 N, 1.05 oz");
  assert.ok(cc.g && grp(cc).length >= 5, "e.l.f. Camo CC Cream shades");
  /* A dye sold here in one shade still names it (no picker). */
  const one = rec("L'Oreal Paris Excellence Universal Nudes Permanent Hair Color, 5N Natural Brown, 1 kit");
  assert.equal(one.g, undefined); assert.equal(one.c, "5N Natural Brown"); assert.equal(one.ax, "Tono");
});

/* ---------- the cart line ---------- */
const page = readFileSync(ROOT + "producto.html", "utf8");
await check("a \"- N Colors\" claim is never shown as the title; a palette's contents stay", () => {
  const L = loadDisplayName(ROOT);
  assert.equal(L.displayName("Non-Stick Cup Mirror Glare Lip Gloss - 16 Colors"), "Non-Stick Cup Mirror Glare Lip Gloss");
  assert.equal(L.displayName("Salmon Darkcircle Concealer Cream - 3 Colors"), "Salmon Darkcircle Concealer Cream");
  assert.equal(L.displayName("Non-Stick Cup Mirror Glare Lip Gloss - 16 Colors 10pcs Bundle Set"), "Non-Stick Cup Mirror Glare Lip Gloss 10pcs Bundle Set");
  assert.equal(L.displayName("Slim Liquid Eyeliner - 4 Classic Ultra-Fine Colours"), "Slim Liquid Eyeliner");
  assert.equal(L.displayName("Tubing Liquid Eyeliner | Ultra Long Lasting - 2 Colors"), "Tubing Liquid Eyeliner | Ultra Long Lasting");
  assert.equal(L.displayName("Real Nature Face Mask - 20 Types"), "Real Nature Face Mask");
  assert.equal(L.displayName("2 IN 1 Highlighter Contour Palette - 4 Colors"), "2 IN 1 Highlighter Contour Palette - 4 Colors");
  assert.equal(L.displayName("Adidas Samba ADV Shoes - Core Black/Gum"), "Adidas Samba ADV Shoes - Core Black/Gum");
  /* A product's own words are not a claim. */
  for (const t of ["L'Oreal Paris Magic Root Rescue 10 Minute Root Hair Color, 4 Dark Brown, 1 kit", "e.l.f. Camo CC Cream, SPF 30 Color-Correcting Medium-To-Full Coverage Face Foundation, Deep 530 W"])
    assert.equal(L.displayName(t), t);
  /* Every committed record that claims a choice and offers none: the title shown drops the claim. */
  let n = 0;
  for (const f of ["yesstyle-catalog.json", "ulta-catalog.json", "beauty-catalog.json"]) {
    const txt = readFileSync(ROOT + f, "utf8");
    for (const m of txt.matchAll(/"name":\s*"([^"]*\b\d+\s+(?:colou?rs?|shades?)\b[^"]*)"/gi)) {
      const t = JSON.parse('"' + m[1] + '"');
      if (L.PALETTE_RX.test(t)) continue;
      assert.doesNotMatch(L.displayName(t), /\b\d+\s+(?:[\w-]+\s+){0,3}(?:colou?rs|shades)\b(?!-)/i, t);
      n++;
    }
  }
  assert.ok(n > 90, "checked " + n);
});
await check("the cart line carries the shade picked, its listing id and its own store URL", () => {
  const L = liftDeclarations(page, ["unpackImages", "variantProduct"]);
  const base = { name: "A", v: "v1", url: "https://www.walmart.com/ip/a/1", retailer: "walmart", price: 7.97, ax: "Tono" };
  const q = L.variantProduct(base, { v: "v2", c: "Deep Mesh", name: "B", price: 6.48, image: "https://i/2.jpg", url: "https://www.walmart.com/ip/b/2" });
  assert.equal(q.url, "https://www.walmart.com/ip/b/2");
  assert.equal(q.ax, "Tono");
  const q2 = L.variantProduct(base, { v: "v3", c: "X", name: "C", price: 1, image: "https://i/3.jpg" });
  assert.equal(q2.url, "", "a variant without its own URL must not carry another listing's");
  const at = page.indexOf("mergeCartLine({");
  const body = page.slice(at, page.indexOf("});", at));
  assert.match(body, /colorway: p\.c/); assert.match(body, /variantId: p\.v/); assert.match(body, /url: \/\^https\?/);
  assert.match(body, /variantAxis: p\.c && p\.ax === "Tono"/);
});

/* ---------- in a browser (fixture shards) ---------- */
function fixtureShards() {
  const fx = pass1.products;
  const env = { retailers: { walmart: { label: "Walmart", departments: { beauty: { items: fx.slice(0, 2).map((e) => ({ name: e.name, brand: e.brand, price: e.price, wasPrice: e.was_price, image: e.images[0], images: e.images, url: e.url })) } } } } };
  const built = buildRecords(P, ROOT, W1.families, { "/department-cache-walmart.json": env });
  const p = {}, g = {};
  for (const [key, cands] of built.byKey) {
    const s = P.pdpShard(key);
    (p[s] = p[s] || {})[key] = cands.length === 1 ? [cands[0].rec] : cands.map((c) => ({ ...c.rec, src: c.src }));
  }
  for (const [gid, vs] of built.groups) {
    const s = P.groupShard(gid);
    (g[s] = g[s] || {})[gid] = vs;
    if (built.pending.has(gid)) g[s][gid + "~p"] = built.pending.get(gid);
  }
  return { p, g, built };
}
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { /* no browser here */ }
const SHOTS = process.env.VARIANT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const state = (pg) => pg.evaluate(() => ({
  opts: document.querySelectorAll(".v-opt").length,
  label: (document.getElementById("v-label") || {}).textContent || "",
  current: (document.getElementById("v-current") || {}).textContent || "",
  pending: (document.getElementById("v-pending") || {}).textContent || "",
  price: (document.querySelector(".p-pen") || {}).textContent || "",
  photo: document.querySelector(".p-photo img") ? document.querySelector(".p-photo img").getAttribute("data-img-orig") : "",
  button: (document.getElementById("add-cart-btn") || {}).textContent || "",
  sizes: [...document.querySelectorAll("#size-select option")].slice(1).map((o) => o.value),
}));
if (!chromium) {
  failures.push("browser checks\n         playwright is not installed here (never run playwright install; symlink node_modules)");
} else {
  const { p: pShards, g: gShards } = fixtureShards();
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const merged = (dir, s, extra) => {
    const f = PDP + dir + "/" + s + ".json";
    return JSON.stringify({ ...(existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {}), ...extra });
  };
  try {
    await check("browser: the shade picker says Tono, swaps photo and price, names pending shades, and the cart buys the picked shade with its URL", async () => {
      const pg = await openPage(browser, base);
      await pg.route(/\/assets\/pdp\/(p|g)\/([0-9a-f]{3})\.json$/, (r) => {
        const [, dir, s] = /\/assets\/pdp\/(p|g)\/([0-9a-f]{3})\.json$/.exec(r.request().url());
        const extra = (dir === "p" ? pShards : gShards)[s];
        if (!extra) return r.continue();
        r.fulfill({ status: 200, contentType: "application/json", body: merged(dir, s, extra) });
      });
      const warm = pass1.products[0];
      await pg.goto(base + "/producto.html?producto=" + encodeURIComponent(warm.name) + "&tienda=walmart", { waitUntil: "load" });
      await pg.waitForSelector(".v-opt", { timeout: 15000 });
      const a = await state(pg);
      assert.equal(a.opts, 3, "Warm Up, Deep Mesh, Lace Detail");
      assert.match(a.label, /^Tono: 07 Warm Up/);
      assert.match(a.pending, /Embellishment/);
      assert.match(a.pending, /detalle pendiente/);
      await pg.click('.v-opt:has-text("Deep Mesh")');
      await pg.waitForFunction(() => (document.getElementById("v-current") || {}).textContent === "Deep Mesh");
      const b = await state(pg);
      assert.notEqual(b.photo, a.photo, "the photo did not change");
      assert.notEqual(b.price, a.price, "the price did not change");
      await pg.click("#add-cart-btn");
      const cart = await pg.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
      assert.equal(cart.length, 1);
      assert.equal(cart[0].colorway, "Deep Mesh");
      assert.equal(cart[0].url, pass1.products[1].url, "the line does not carry the picked shade's URL");
      assert.equal(cart[0].variantId, variantIdOf(pass1.products[1].url));
      await pg.click('.v-opt:has-text("Lace Detail")');
      await pg.waitForFunction(() => (document.getElementById("v-current") || {}).textContent === "Lace Detail");
      const c = await state(pg);
      assert.match(c.button, /^Vuelve pronto$/);
      assert.deepEqual(pg.errors, []);
      await pg.context().close();
    });
    const shot = async (pg, name) => { if (!SHOTS) return; await pg.locator("#variant-box").scrollIntoViewIfNeeded(); await pg.evaluate(() => window.scrollBy(0, -260)); await pg.screenshot({ path: SHOTS + "/" + name + ".png" }); };
    const open = async (title, store, v, liveStore) => {
      const pg = await openPage(browser, base);
      /* Kohl's is off sale on main (off-sale.js) until its storefront
         ships: the test lifts that one store to see the page it will get. */
      if (liveStore) await pg.route(/\/off-sale\.js(\?|$)/, (r) => r.fulfill({ status: 200, contentType: "application/javascript",
        body: readFileSync(ROOT + "off-sale.js", "utf8").replace("'" + liveStore + "', ", "") }));
      await pg.goto(base + "/producto.html?producto=" + encodeURIComponent(title) + "&tienda=" + store + (v ? "&v=" + v : ""), { waitUntil: "load" });
      await pg.waitForSelector(".v-opt", { timeout: 20000 });
      return pg;
    };
    await check("REAL (Drop 1): NYX Lip Lingerie XXL at Walmart: 24 single shades in the pull, 21 offered, 3 with no photo pending; a pick swaps photo and price; the cart buys it with its own URL", async () => {
      const pg = await open("NYX Professional Makeup Lip Lingerie XXL Liquid Lipstick, Warm Up, 0.13 fl oz", "walmart");
      const a = await state(pg);
      assert.equal(a.opts, 21);
      assert.match(a.label, /^Tono: 07 Warm Up/);
      assert.match(a.pending, /On Fuego, Peek Show, Knockout/);
      await shot(pg, "nyx-lip-lingerie-xxl-picker-open");
      await pg.click('.v-opt:has-text("Hot Caramelo")');
      await pg.waitForFunction(() => (document.getElementById("v-current") || {}).textContent === "Hot Caramelo");
      const b = await state(pg);
      assert.notEqual(b.photo, a.photo);
      await pg.click('.v-opt:has-text("09 Deep Mesh")');
      await pg.waitForFunction(() => (document.getElementById("v-current") || {}).textContent === "09 Deep Mesh");
      const c = await state(pg);
      assert.notEqual(c.price, a.price, "Deep Mesh ($7.50) shows Warm Up's price");
      await shot(pg, "nyx-lip-lingerie-xxl-deep-mesh-picked");
      await pg.click("#add-cart-btn");
      const cart = await pg.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
      assert.equal(cart.length, 1);
      assert.equal(cart[0].colorway, "09 Deep Mesh");
      assert.match(cart[0].url, /\/256290401(\?|$)/);
      assert.ok(cart[0].variantId);
      await pg.click('.v-opt:has-text("Peach Flirt")');
      await pg.waitForFunction(() => (document.getElementById("v-current") || {}).textContent === "Peach Flirt");
      assert.match((await state(pg)).button, /^Vuelve pronto$/);
      assert.deepEqual(pg.errors, []);
      await pg.context().close();
    });
    await check("REAL (Drop 1): Maybelline SuperStay Ink Crayon: 30 shades, the store's out-of-stock ones agotado", async () => {
      const pg = await open("Maybelline SuperStay Ink Crayon Lipstick, Matte Longwear Lipstick Makeup, Trust Your Gut, 0.04 oz.", "walmart");
      const a = await state(pg);
      assert.equal(a.opts, 30);
      assert.match(a.label, /^Tono: 10 Trust Your Gut/);
      const out = await pg.evaluate(() => document.querySelectorAll(".v-opt.v-out").length);
      assert.ok(out >= 10 && out < 30, "agotado shades: " + out);
      await shot(pg, "maybelline-superstay-ink-crayon-picker");
      await pg.context().close();
    });
    /* ---------- Danny's acceptance cases (#443 c.6568696054..c.6568789690), 390px ---------- */
    const SHADE_SHOTS = process.env.SHADE_SHOTS || "";
    const shadeShot = async (pg, name) => { if (!SHADE_SHOTS) return; await pg.evaluate(() => window.scrollTo(0, 0)); const box = await pg.$("#variant-box"); if (box) { await box.scrollIntoViewIfNeeded(); await pg.evaluate(() => window.scrollBy(0, -160)); } await pg.screenshot({ path: SHADE_SHOTS + "/shade-" + name + ".png" }); };
    const shadeState = (pg) => pg.evaluate(() => ({
      h1: (document.querySelector("#p-body h1") || {}).textContent || "",
      doc: document.title,
      shade: (document.getElementById("p-shade") || {}).textContent || "",
      tappable: [...document.querySelectorAll(".v-opt")].filter((b) => { const r = b.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; }).length,
    }));
    const pick = async (pg, label) => {
      await pg.tap('.v-opt:has(> span:text-is("' + label + '"))');
      await pg.waitForFunction((l) => (document.getElementById("v-current") || {}).textContent === l, label);
    };
    const buy = async (pg) => { await pg.click("#add-cart-btn"); return pg.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]")); };
    const openPlain = async (title, store) => {
      const pg = await openPage(browser, base);
      await pg.goto(base + "/producto.html?producto=" + encodeURIComponent(title) + "&tienda=" + store, { waitUntil: "load" });
      await pg.waitForSelector("#buy-box", { timeout: 20000 });
      await pg.waitForTimeout(600);
      return pg;
    };
    await check("ACCEPT: Maybelline Super Stay Lumi-Matte foundation by number: a Tono picker of 24, every option tappable; a pick changes the label and the cart buys it", async () => {
      const pg = await open("Maybelline Super Stay Lumi-Matte Foundation Makeup, 220, 1 fl oz", "walmart");
      const a = await state(pg), s = await shadeState(pg);
      assert.equal(a.opts, 24); assert.equal(s.tappable, 24, "options under 40px");
      assert.match(a.label, /^Tono: 220/);
      await pick(pg, "120");
      const cart = await buy(pg);
      assert.equal(cart[0].colorway, "120"); assert.equal(cart[0].variantAxis, "Tono"); assert.ok(cart[0].variantId);
      await shadeShot(pg, "maybelline-superstay-lumi-matte-120");
      assert.deepEqual(pg.errors, []);
      await pg.context().close();
    });
    await check("ACCEPT: Maybelline SuperStay Full Coverage foundation (110, 120, ...): Tono picker of 22", async () => {
      const pg = await open("Maybelline New York SuperStay Full Coverage Foundation, Classic Ivory", "walmart");
      const a = await state(pg);
      assert.equal(a.opts, 22); assert.match(a.label, /^Tono: 120 Classic Ivory/);
      /* 110 Porcelain is out of stock at Walmart: offered as agotado, never sold. */
      await pick(pg, "110 Porcelain");
      assert.match((await state(pg)).button, /^Vuelve pronto$/);
      await pick(pg, "105 Fair Ivory");
      assert.equal((await buy(pg))[0].colorway, "105 Fair Ivory");
      await shadeShot(pg, "maybelline-superstay-full-coverage-105");
      await pg.context().close();
    });
    await check("ACCEPT: NYX Lip Lingerie lip liner stain: Tono picker of 12; NYX Lip Lingerie XXL: 21", async () => {
      const pg = await open("NYX Professional Makeup Lip Lingerie Lip Liner Stain, Waterproof Lip Color, Up To No Good, 0.03 fl oz", "walmart");
      const a = await state(pg);
      assert.equal(a.opts, 12); assert.match(a.label, /^Tono: Up To No Good/);
      await pick(pg, "Naughty Nude");
      assert.equal((await buy(pg))[0].colorway, "Naughty Nude");
      await shadeShot(pg, "nyx-lip-lingerie-liner-naughty-nude");
      await pg.context().close();
      const pg2 = await open("NYX Professional Makeup Lip Lingerie XXL Liquid Lipstick, Warm Up, 0.13 fl oz", "walmart");
      assert.equal((await state(pg2)).opts, 21);
      await shadeShot(pg2, "nyx-lip-lingerie-xxl");
      await pg2.context().close();
    });
    await check("ACCEPT: a waterproof eyeliner and a lip liner with colours (Walmart): NYX Epic Ink 9, Milani Understatement 12", async () => {
      const pg = await open("NYX Professional Makeup Epic Ink Vegan Waterproof Liquid Eyeliner, Black, 0.16 oz", "walmart");
      assert.equal((await state(pg)).opts, 9);
      await pick(pg, "Milk Chocolate");
      assert.equal((await buy(pg))[0].colorway, "Milk Chocolate");
      await shadeShot(pg, "nyx-epic-ink-eyeliner-milk-chocolate");
      await pg.context().close();
      const pg2 = await open("Milani Understatement Lip Liner, Rich Cocoa", "walmart");
      assert.equal((await state(pg2)).opts, 12);
      await shadeShot(pg2, "milani-lip-liner");
      await pg2.context().close();
    });
    await check("ACCEPT: hair dye siblings (Model B): L'Oreal Excellence Creme, a Tono picker; the shade is written in the description area and follows the pick", async () => {
      const pg = await open("L'Oreal Paris Excellence Creme Permanent Hair Color, 5 Medium Brown, Triple Protection, 1 Kit", "walmart");
      const a = await state(pg), s = await shadeState(pg);
      assert.equal(a.opts, 2); assert.match(a.label, /^Tono: 5 Medium Brown/);
      assert.equal(s.shade, "Tono: 5 Medium Brown");
      await pick(pg, "7 Dark Blonde");
      assert.equal((await shadeState(pg)).shade, "Tono: 7 Dark Blonde");
      const cart = await buy(pg);
      assert.equal(cart[0].colorway, "7 Dark Blonde"); assert.equal(cart[0].variantAxis, "Tono");
      await shadeShot(pg, "loreal-excellence-creme-7-dark-blonde");
      assert.deepEqual(pg.errors, []);
      await pg.context().close();
    });
    await check("ACCEPT: a hair dye in one shade: no dead selector, the tono in words, the cart line carries it", async () => {
      const pg = await openPlain("L'Oreal Paris Excellence Universal Nudes Permanent Hair Color, 5N Natural Brown, 1 kit", "walmart");
      const a = await state(pg), s = await shadeState(pg);
      assert.equal(a.opts, 0); assert.equal(s.shade, "Tono: 5N Natural Brown");
      assert.equal(await pg.evaluate(() => !!document.getElementById("variant-box")), false);
      assert.equal((await buy(pg))[0].colorway, "5N Natural Brown");
      await shadeShot(pg, "loreal-universal-nudes-5n-single");
      await pg.context().close();
    });
    for (const [title, name] of [["Non-Stick Cup Mirror Glare Lip Gloss - 16 Colors", "pudaier-mirror-glare-gloss"], ["Salmon Darkcircle Concealer Cream - 3 Colors", "skinfood-salmon-concealer"], ["Waterproof Easy Eyeliner - 2 Colors", "pinkflash-waterproof-eyeliner"], ["Sharp So Simple Waterproof Pencil Liner - 13 Colors", "clio-pencil-liner"]]) {
      await check("ACCEPT (Model C): YesStyle \"" + title + "\": no shade data, so no picker, no colour claim in the title, and not sold (Tonos en camino)", async () => {
        const pg = await openPlain(title, "yesstyle");
        const a = await state(pg), s = await shadeState(pg);
        assert.equal(a.opts, 0);
        assert.equal(s.h1, title.replace(/ - \d+ Colors$/, ""));
        assert.doesNotMatch(s.h1 + " " + s.doc, /\d+ Colors/);
        assert.equal(await pg.evaluate(() => !!document.getElementById("variant-box")), false, "a dead selector");
        /* No shade list, no sale (the shade gate, /shade-gate.js; Danny after
           #583: nobody buys makeup they can't pick a colour for). */
        const gate = await pg.evaluate(() => ({ note: (document.getElementById("shade-gate-note") || {}).textContent || "",
          off: !!document.getElementById("add-cart-btn") && document.getElementById("add-cart-btn").disabled }));
        assert.match(gate.note, /^Tonos en camino/);
        assert.equal(gate.off, true, "the cart button is on with no shade");
        await shadeShot(pg, name);
        assert.deepEqual(pg.errors, []);
        await pg.context().close();
      });
    }
    await check("REAL (Drop 2): CCS women's Samba OG: the six live colourways, Cream White/Core Black/Sand Strata agotado", async () => {
      const pg = await open("Adidas Womens Samba OG Shoes - Ftwr White/Frozen Purple/Night Indigo", "ccs");
      const a = await state(pg);
      assert.equal(a.opts, 7);
      assert.match(a.label, /^Color: Ftwr White\/Frozen Purple\/Night Indigo/);
      const out = await pg.evaluate(() => [...document.querySelectorAll(".v-opt.v-out span")].map((x) => x.textContent));
      assert.deepEqual(out, ["Cream White/Core Black/Sand Strata"]);
      assert.ok(a.sizes.length > 0, "a live colourway without its sizes");
      await shot(pg, "ccs-samba-og-womens-picker");
      await pg.context().close();
    });
    await check("REAL (Drop 2): a Kohl's product in several colours, each with the store's own photo, sizes por confirmar", async () => {
      const pg = await open("Women's Croft & Barrow® Effortless Stretch Pull-On Straight-Leg Pants", "kohls", "", "kohls");
      const a = await state(pg);
      assert.equal(a.opts, 7);
      assert.match(a.pending, /Inviting Red/);
      await pg.click('.v-opt:has-text("Genuine Navy")');
      await pg.waitForFunction(() => (document.getElementById("v-current") || {}).textContent === "Genuine Navy");
      const b = await state(pg);
      assert.match(b.photo, /3354493_Genuine_Navy/);
      assert.match(b.button, /Tallas por confirmar/);
      await shot(pg, "kohls-pull-on-pants-colour-picked");
      await pg.context().close();
    });
    await check("browser: a shoe colourway picker (CCS Samba ADV) still says Color", async () => {
      const pg = await openPage(browser, base);
      await pg.goto(base + "/producto.html?producto=" + encodeURIComponent("Adidas Samba ADV Shoes - Cardboard/Ftwr White/Gum") + "&tienda=ccs", { waitUntil: "load" });
      await pg.waitForSelector(".v-opt", { timeout: 15000 });
      const a = await state(pg);
      assert.equal(a.opts, 9, "CCS sells 9 Samba ADV colourways live (Drop 2)");
      assert.match(a.label, /^Color: /);
      await shot(pg, "shoe-colourway-picker");
      await pg.context().close();
    });
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log("  FAIL  " + f + "\n");
process.exit(failures.length ? 1 : 0);
