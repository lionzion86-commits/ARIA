/* ==================================================================
   ROPA INTERIOR Y MEDIAS (hombre) — the department, end to end.

   The rules (ropa-interior-engine.js), the feed they build
   (ropa-interior-feed.json), the page (ropa-interior.html) and its two
   doors (the homepage pill, departamento.html?dept=ropa_interior).

   RUNNING IT
     node scripts/test/ropa-interior-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadEngine, buildFeed } from "../build-ropa-interior-feed.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const E = loadEngine();
const is = (it, retailer = "", bucket = "") => E.classify(it, retailer, bucket);

/* ------------------------------------------------------------------
   THE RULES, on titles taken from the catalogues.
   ------------------------------------------------------------------ */
check("men's underwear and socks are in, with the right type", () => {
  const cases = [
    [{ name: "AEO Men's 6\" Flex Boxer Brief", brand: "American Eagle", type: "UNDERWEAR" }, "americaneagle", "men", "underwear", "boxer_brief"],
    [{ name: "SKIMS COTTON RIB MENS BRIEF | CHALK", brand: "Skims" }, "skims", "", "underwear", "brief"],
    [{ name: "Men's Hanes® Originals 3-Pack Ultimate SuperSoft Boxer Briefs with Total Support Pouch", brand: "Kohl's" }, "kohls", "men", "underwear", "boxer_brief"],
    [{ name: "PSD Benji Chrome Brief Underwear", brand: "PSD Underwear" }, "mainland", "", "underwear", "brief"],
    [{ name: "Two-Pack Multicolor Cotton Boxer Briefs", brand: "TOM FORD", gender: "men" }, "ssense", "men", "underwear", "boxer_brief"],
    [{ name: "Stance Icon Quarter 3 Pack Socks - Black", brand: "Stance" }, "ccs", "clothing", "socks", "casual"],
    [{ name: "Stance Athletic Tab Socks - White", brand: "Stance" }, "ccs", "clothing", "socks", "sport"],
    [{ name: "Kirkland Signature Men's Athletic Sock, 8-pair", brand: "Kirkland Signature" }, "costco", "dulces", "socks", "sport"],
    [{ name: "Texture Logo Crew Socks 3PK - Black", brand: "Crocs" }, "crocs", "", "socks", "casual"],
    [{ name: "9044 - Performance Workout Socks - 3 Pack", brand: "YoungLA", type: "For Him" }, "youngla", "gym_rat", "socks", "sport"],
    [{ name: "Toy Machine Fists Socks - Orange", brand: "Toy Machine Skateboards" }, "ccs", "clothing", "socks", "casual"],
  ];
  for (const [it, r, b, ty, sub] of cases) {
    const c = is(it, r, b);
    assert.ok(c, `"${it.name}" was left out`);
    assert.equal(c.type, ty, `"${it.name}" is ${c.type}, not ${ty}`);
    assert.equal(c.sub, sub, `"${it.name}" is ${c.sub}, not ${sub}`);
  }
});

check("women's, kids', swimwear and look-alikes are out", () => {
  const out = [
    [{ name: "Women's Vanity Fair Lingerie® Illumination Brief Panty 13109", brand: "Kohl's" }, "kohls", "women"],
    [{ name: "Stance Not Thirsty Crew Women's Socks", brand: "Stance" }, "mainland", ""],
    [{ name: "W638 - Elevate crew socks", brand: "YoungLA", type: "For Her" }, "youngla", "gym_rat"],
    [{ name: "PSD x Playboy Booted Modal Boyshort Underwear", brand: "PSD" }, "zumiez", "moda_mujer"],
    [{ name: "Mr. Owl Sock kids", brand: "Stance" }, "parrot", ""],
    [{ name: "Trimline 17\" Trunk boys", brand: "Vissla" }, "parrot", ""],
    [{ name: "Vissla Solid Sets 17.5\" Trunk", brand: "Vissla" }, "parrot", ""],
    [{ name: "Men's Trinity Coast 7-inch Swim Trunks", brand: "Kohl's" }, "kohls", "men"],
    [{ name: "Hypnotic Night Trunk", brand: "Ancora Swimwear" }, "ancora", ""],
    [{ name: "Channel Islands Snuggie 2.0 Shortboard Surfboard Sock - Grey/Black", brand: "Channel Islands" }, "surfstation", "sporting_goods"],
    [{ name: "Roam Fun Bodyboard Sock - Blue Stripe", brand: "Roam" }, "surfstation", "sporting_goods"],
    [{ name: "Taupe Tower Boxers Shorts", brand: "Rick Owens", gender: "men", type: "SHORTS" }, "ssense", "men"],
    [{ name: "Black Tower High Sock Sneaks Tall Boots", brand: "Rick Owens DRKSHDW", type: "HIGH TOP SNEAKERS" }, "ssense", ""],
    [{ name: "JBL 3-4mm Dive Socks", brand: "JBL" }, "nautilus", "clothing"],
    [{ name: "Boxer Skateboard Deck - 8.25", brand: "Baker" }, "ccs", "skateboards"],
  ];
  for (const [it, r, b] of out) assert.equal(is(it, r, b), null, `"${it.name}" got in`);
});

check("the known false-positive brands never get in", () => {
  for (const [brand, r, name] of [
    ["Kindred Bravely", "kindredbravely", "Non-Slip Quarter Crew Socks | White & Red"],
    ["Victoria's Secret", "victoriassecret", "Exploded Logo Cotton High-Waist Boxer Brief"],
    ["Miu Miu", "miumiu", "Men's Cotton Boxer Briefs"],
    ["Montce", "montce", "Red Gingham Mini Swim Trunk"],
    ["Bonfolk", "ccs", "Bonfolk Boobs Socks - Pink"],
  ]) assert.equal(is({ name, brand }, r, "men"), null, `${brand} got in`);
});

/* ------------------------------------------------------------------
   THE FEED.
   ------------------------------------------------------------------ */
const feed = JSON.parse(readFileSync(ROOT + "ropa-interior-feed.json", "utf8"));

check("ropa-interior-feed.json is what the catalogues give today", () => {
  const fresh = buildFeed();
  assert.equal(feed.count, fresh.count,
    `the feed has ${feed.count} products, the catalogues give ${fresh.count} — run: node scripts/build-ropa-interior-feed.mjs`);
  assert.deepEqual(feed.items, fresh.items, "the feed is stale — run: node scripts/build-ropa-interior-feed.mjs");
});

check("the assortment is the department Danny asked for", () => {
  const under = feed.items.filter(i => i.ty === "underwear");
  const socks = feed.items.filter(i => i.ty === "socks");
  const stores = new Set(feed.items.map(i => i.r));
  assert.ok(under.length >= 400, `only ${under.length} underwear products`);
  assert.ok(socks.length >= 600, `only ${socks.length} sock products`);
  assert.ok(stores.size >= 20, `only ${stores.size} stores`);
  const brand = (re) => feed.items.filter(i => re.test(i.b)).length;
  assert.ok(brand(/^stance$/i) >= 300, "Stance is missing");
  assert.ok(brand(/^skims$/i) >= 100, "SKIMS men's is missing");
  assert.ok(brand(/^psd/i) >= 50, "PSD is missing");
  for (const i of feed.items) {
    assert.ok(!/\b(?:women'?s?|womens|ladies|panty|panties|boyshort)\b/i.test(i.t), "a women's product got in: " + i.t);
    assert.ok(!/^(?:kindred bravely|victoria'?s secret|miu miu|montce|bonfolk)$/i.test(i.b), "an excluded brand got in: " + i.b);
  }
});

/* ------------------------------------------------------------------
   THE PAGE AND ITS DOORS.
   ------------------------------------------------------------------ */
const page = readFileSync(ROOT + "ropa-interior.html", "utf8");

check("the page follows the department pattern", () => {
  assert.match(page, /<h1>Ropa Interior y Medias<\/h1>/, "the department name is not the title");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u.test(page), "an emoji is on the page");
  assert.match(page, /body\{[^}]*background:var\(--ink\)/, "the page background is not the dark theme");
  /* Carousels first, filters after. */
  assert.ok(page.indexOf('id="por-tipo"') < page.indexOf('id="explorar"'), "the filters come before the carousels");
  for (const t of ["Bóxer briefs", "Briefs", "Trunks", "Medias deportivas", "Medias casuales", "Medias de vestir",
    "Stance", "SKIMS", "PSD", "Nike", "adidas", "CCS", "Kohl's", "SSENSE", "Tiendas de surf"])
    assert.ok(page.includes(`title:'${t}'`) || page.includes(`title:"${t}"`), `the "${t}" carousel is missing`);
  /* Brands aggregate across stores; a store is never a brand. */
  assert.match(page, /brandKey\(p\.b\) === r\.key/, "brand carousels are not built by brand");
  /* Sales first, then halo, then best sellers. */
  assert.match(page, /return sale\.concat\(halo, others\)/, "carousel order is not sales, halo, best sellers");
  /* Browse shows sales only; full price by search. */
  assert.match(page, /if \(!words\.length && !onSale\(p\)\) return false;/, "the browse grid shows full price");
  assert.match(page, /fetch\('\/ropa-interior-feed\.json'\)/, "the page does not read the feed");
});

check("the department has its doors", () => {
  const dept = readFileSync(ROOT + "departamento.html", "utf8");
  assert.match(dept, /ropa_interior:\s*\{name:'Ropa Interior y Medias'[^}]*href:'ropa-interior\.html'\}/, "departamento.html does not know the department");
  assert.match(dept, /if \(dept && dept\.href\)\{ window\.location\.replace\(dept\.href\); return; \}/, "?dept=ropa_interior does not open the page");
  const home = readFileSync(ROOT + "index.html", "utf8");
  /* The homepage reads the department FEED (2026-10-07), not the rules. */
  assert.match(home, /key: 'ropa_interior'[\s\S]{0,400}feed: \(\) => ropaInteriorRailPicks\(\)/, "the homepage shelf is not built from the feed");
  assert.match(home, /key: 'ropa_interior', label: 'Ropa Interior y Medias'/, "no homepage pill");
  assert.match(home, /'mens_grooming', 'ropa_interior',/, "the pill is not in the tab order");
  assert.match(home, /ropa_interior: `<svg/, "the pill has no icon (it would fall back to a letter)");
  assert.match(home, /if\(key === 'ropa_interior'\) return '\/ropa-interior\.html';/, "?categoria=ropa_interior goes nowhere");
});

/* ------------------------------------------------------------------
   THE HOMEPAGE RAIL (2026-10-07): blast sales only, deepest discount
   first, from the feed -- never a hardcoded list.
   ------------------------------------------------------------------ */
check("the homepage has a Ropa Interior y Medias rail on both layouts", () => {
  const home = readFileSync(ROOT + "index.html", "utf8");
  const secs = home.match(/<section aria-label="Ropa Interior y Medias" data-featured-rail[\s\S]*?<\/section>/g) || [];
  assert.equal(secs.length, 2, `expected a mobile and a desktop rail, found ${secs.length}`);
  for (const s of secs) {
    assert.match(s, /data-category-rail-row="ropa_interior"/, "the rail row is not wired to the shared painter");
    assert.match(s, /<a href="\/ropa-interior\.html"[^>]*>Ropa Interior y Medias<\/a>/, "tapping the header does not open the department");
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s), "an emoji is in the rail");
  }
  assert.match(home, /fetch\('\/ropa-interior-feed\.json'\)/, "the rail does not read the department feed");
});

await (async () => {
  /* The picks function itself, lifted and run against a stub feed. */
  const home = readFileSync(ROOT + "index.html", "utf8");
  const at = home.indexOf("let ropaInteriorFeedPromise = null;");
  const end = home.indexOf("const ROPA_INTERIOR_RAIL_TOTAL = 20;");
  const src = home.slice(at, end);
  const stub = [
    { t: "Full price boxer", b: "Kohl's", r: "kohls", p: 20, o: 0, img: "https://x/a.jpg", ty: "underwear" },
    { t: "Ten off socks", b: "Stance", r: "ccs", p: 18, o: 20, s: 1, img: "https://x/b.jpg", ty: "socks" },
    { t: "Seventy five off brief", b: "American Eagle", r: "americaneagle", p: 4, o: 16, s: 1, img: "https://x/c.jpg", ty: "underwear" },
    { t: "Unreported markdown", b: "PSD", r: "mainland", p: 10, o: 30, img: "https://x/d.jpg", ty: "underwear" },
    { t: "Half off crew", b: "HUF", r: "ccs", p: 10, o: 20, s: 1, img: "https://x/e.jpg", ty: "socks" },
    { t: "Quarantined photo", b: "Stance", r: "ccs", p: 5, o: 50, s: 1, img: "https://x/f.jpg", ir: "quarantined", ty: "socks" },
  ];
  /* Stand-ins with the page's rules: a markdown counts only when the
     retailer reported it; a quarantined photo is no photo. */
  const normalizeLiveItem = (i) => ({ title: i.title, brand: i.brand, price: i.price,
    originalPrice: i.onSale && i.originalPrice > i.price ? i.originalPrice : null,
    image: i.imageReview && i.imageReview !== "clean" ? null : i.image });
  const hasRealImage = (i) => !!i.image;
  const carouselDiscountPct = (i) => i.originalPrice > i.price ? Math.round((1 - i.price / i.originalPrice) * 100) : 0;
  const fn = new Function("fetch", "normalizeLiveItem", "hasRealImage", "carouselDiscountPct", "ROPA_INTERIOR_RAIL_TOTAL",
    src + "\n return ropaInteriorRailPicks;");
  const picks = await fn(async () => ({ ok: true, json: async () => ({ items: stub }) }),
    normalizeLiveItem, hasRealImage, carouselDiscountPct, 20)();
  check("the homepage rail is blast sales only, deepest discount first", () => {
    assert.deepEqual(picks.map(p => p.title), ["Seventy five off brief", "Half off crew", "Ten off socks"],
      "wrong picks or order: " + picks.map(p => p.title).join(", "));
    assert.ok(!picks.some(p => p.title === "Full price boxer"), "a full-price item is on the rail");
    assert.ok(!picks.some(p => p.title === "Unreported markdown"), "a markdown the retailer never reported is on the rail");
    assert.ok(!picks.some(p => p.title === "Quarantined photo"), "a quarantined photo is on the rail");
  });
})();

check("the feed carries the retailer's sale report and the image verdict", () => {
  const sale = feed.items.filter(i => i.o > i.p);
  assert.ok(sale.length > 0, "the feed has no sale items");
  assert.ok(sale.every(i => i.s === 1), "a markdown in the feed lacks the retailer's sale flag — the homepage rail would drop it");
});

const MIN_CHECKS = 10;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
