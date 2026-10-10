/* ==================================================================
   ROPA INTERIOR Y MEDIAS — the department, end to end, both halves.

   The rules (ropa-interior-engine.js: classify for Hombre, its mirror
   classifyWomen for Mujer), the two feeds they build
   (ropa-interior-feed.json, ropa-interior-women-feed.json), the page
   (ropa-interior.html, a Mujer and a Hombre section) and its doors (the
   homepage pills and rails, departamento.html?dept=...).

   RUNNING IT
     node scripts/test/ropa-interior-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadEngine, buildFeed, buildWomenFeed } from "../build-ropa-interior-feed.mjs";

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
  assert.match(page, /<h2 id="m-title">Ropa Interior Hombre<\/h2>/, "the Hombre section has no title");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u.test(page), "an emoji is on the page");
  assert.match(page, /body\{[^}]*background:var\(--ink\)/, "the page background is not the dark theme");
  /* Carousels first, filters after. */
  assert.ok(page.indexOf('id="m-tipo"') < page.indexOf('id="m-explorar"'), "the filters come before the carousels");
  for (const t of ["Bóxer briefs", "Briefs", "Trunks", "Medias deportivas", "Medias casuales", "Medias de vestir",
    "Stance", "SKIMS", "PSD", "Nike", "adidas", "CCS", "Kohl's", "SSENSE", "Tiendas de surf"])
    assert.ok(page.includes(`title:'${t}'`) || page.includes(`title:"${t}"`), `the "${t}" carousel is missing`);
  /* Brands aggregate across stores; a store is never a brand. */
  assert.match(page, /brandKey\(p\.b\) === r\.key/, "brand carousels are not built by brand");
  /* Biggest sales first, then halo, then best sellers -- all on sale. */
  assert.match(page, /return deep\.concat\(halo, others\)/, "carousel order is not sales, halo, best sellers");
  /* Browse shows sales only; full price by search. */
  assert.match(page, /if \(!words\.length && !onSale\(p\)\) return false;/, "the browse grid shows full price");
  assert.match(page, /getFeed\('\/ropa-interior-feed\.json'\)/, "the page does not read the men's feed");
});

check("the department has its doors", () => {
  const dept = readFileSync(ROOT + "departamento.html", "utf8");
  assert.match(dept, /ropa_interior:\s*\{name:'Ropa Interior y Medias'[^}]*href:'ropa-interior\.html#hombre'\}/, "departamento.html does not know the department");
  assert.match(dept, /ropa_interior_mujer:\s*\{name:'Ropa Interior Mujer'[^}]*href:'ropa-interior\.html#mujer'\}/, "departamento.html does not know the women's half");
  assert.match(dept, /if \(dept && dept\.href\)\{ window\.location\.replace\(dept\.href\); return; \}/, "?dept=ropa_interior does not open the page");
  const home = readFileSync(ROOT + "index.html", "utf8");
  /* The homepage reads the department FEED (2026-10-07), not the rules. */
  assert.match(home, /key: 'ropa_interior'[\s\S]{0,400}feed: \(\) => ropaInteriorRailPicks\('\/ropa-interior-feed\.json'\)/, "the men's shelf is not built from its feed");
  assert.match(home, /key: 'ropa_interior_mujer'[\s\S]{0,400}feed: \(\) => ropaInteriorRailPicks\('\/ropa-interior-women-feed\.json'\)/, "the women's shelf is not built from its feed");
  assert.match(home, /key: 'ropa_interior', label: 'Ropa Interior Hombre'/, "no men's homepage pill");
  assert.match(home, /key: 'ropa_interior_mujer', label: 'Ropa Interior Mujer'/, "no women's homepage pill");
  assert.match(home, /'mens_grooming', 'ropa_interior_mujer', 'ropa_interior',/, "the pills are not in the tab order");
  assert.match(home, /ropa_interior: `<svg/, "the men's pill has no icon (it would fall back to a letter)");
  assert.match(home, /ropa_interior_mujer: `<svg/, "the women's pill has no icon (it would fall back to a letter)");
  assert.match(home, /if\(key === 'ropa_interior'\) return '\/ropa-interior\.html#hombre';/, "?categoria=ropa_interior goes nowhere");
  assert.match(home, /if\(key === 'ropa_interior_mujer'\) return '\/ropa-interior\.html#mujer';/, "?categoria=ropa_interior_mujer goes nowhere");
});

/* ------------------------------------------------------------------
   THE HOMEPAGE RAIL (2026-10-07): blast sales only, deepest discount
   first, from the feed -- never a hardcoded list.
   ------------------------------------------------------------------ */
check("the homepage has a Ropa Interior Mujer and a Hombre rail on both layouts", () => {
  const home = readFileSync(ROOT + "index.html", "utf8");
  for (const [label, row, hash] of [["Ropa Interior Mujer", "ropa_interior_mujer", "mujer"], ["Ropa Interior Hombre", "ropa_interior", "hombre"]]) {
    const secs = home.match(new RegExp(`<section aria-label="${label}" data-featured-rail[\\s\\S]*?<\\/section>`, "g")) || [];
    assert.equal(secs.length, 2, `${label}: expected a mobile and a desktop rail, found ${secs.length}`);
    for (const s of secs) {
      assert.match(s, new RegExp(`data-category-rail-row="${row}"`), `${label}: the rail row is not wired to the shared painter`);
      assert.match(s, new RegExp(`<a href="/ropa-interior\\.html#${hash}"[^>]*>${label}</a>`), `${label}: tapping the header does not open its section`);
      assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s), "an emoji is in the rail");
    }
  }
  /* Women's rails come right before men's, on both layouts. */
  const order = [...home.matchAll(/data-category-rail-row="(ropa_interior(?:_mujer)?)"/g)].map(m => m[1]);
  assert.deepEqual(order, ["ropa_interior_mujer", "ropa_interior", "ropa_interior_mujer", "ropa_interior"], "rail order: " + order.join(", "));
  assert.match(home, /ropaInteriorFeedPromises\[feedUrl\] = fetch\(feedUrl\)/, "the rail does not read its department feed");
});

await (async () => {
  /* The picks function itself, lifted and run against a stub feed. */
  const home = readFileSync(ROOT + "index.html", "utf8");
  const at = home.indexOf("const ropaInteriorFeedPromises = {};");
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
  const asked = [];
  const picks = await fn(async (url) => { asked.push(url); return { ok: true, json: async () => ({ items: stub }) }; },
    normalizeLiveItem, hasRealImage, carouselDiscountPct, 20)();
  check("the homepage rail is blast sales only, deepest discount first", () => {
    assert.deepEqual(picks.map(p => p.title), ["Seventy five off brief", "Half off crew", "Ten off socks"],
      "wrong picks or order: " + picks.map(p => p.title).join(", "));
    assert.ok(!picks.some(p => p.title === "Full price boxer"), "a full-price item is on the rail");
    assert.ok(!picks.some(p => p.title === "Unreported markdown"), "a markdown the retailer never reported is on the rail");
    assert.ok(!picks.some(p => p.title === "Quarantined photo"), "a quarantined photo is on the rail");
    assert.deepEqual(asked, ["/ropa-interior-feed.json"], "the men's rail reads the wrong feed: " + asked.join(", "));
  });
})();

check("the feed carries the retailer's sale report and the image verdict", () => {
  /* s is the retailer's own sale report (normalizeLiveItem's rule): an
     original price alone is not a sale -- Walmart lists originalPrice on
     items it does not mark onSale, and the site never shows those as
     markdowns. So: every flagged item is a real markdown, the flag
     follows the report, and there are reported sales for the rail. */
  const flagged = feed.items.filter(i => i.s === 1);
  assert.ok(flagged.length > 0, "no item carries the retailer's sale report — the homepage rail would be empty");
  assert.ok(flagged.every(i => i.o > i.p), "a sale-flagged item has no markdown");
  assert.ok(feed.items.every(i => i.s === undefined || i.s === 1), "the sale flag is not 1-or-absent");
});

/* ==================================================================
   ROPA INTERIOR MUJER (Danny, 2026-10-10): the mirror rules, the women's
   feed, one home per sock, sale-only carousels, both sections.
   ================================================================== */
const isW = (it, retailer = "", bucket = "") => E.classifyWomen(it, retailer, bucket);

check("women's intimates and socks are in, with the right type", () => {
  const cases = [
    [{ name: "Viper Lace Hardware Cheeky Panty", type: "Ropa interior", brand: "Victoria's Secret" }, "victoriassecret", "women", "underwear", "panty"],
    [{ name: "Wicked Unlined Lace Teddy", type: "Lencería", brand: "Victoria's Secret" }, "victoriassecret", "women", "underwear", "lingerie"],
    [{ name: "Viper Lace Push-Up Bra", type: "Sostenes", brand: "Victoria's Secret" }, "victoriassecret", "women", "underwear", "bra"],
    [{ name: "Floral Embroidery Garter Belt", type: "Ropa interior", brand: "Victoria's Secret" }, "victoriassecret", "women", "underwear", "lingerie"],
    [{ name: "NO SHOW UNLINED DEMI BRA | SAND", type: "Bra", brand: "Skims" }, "skims", "women", "underwear", "bra"],
    [{ name: "COOL SHAPEWEAR MID THIGH BODYSUIT | ONYX", type: "Shapewear Bodysuit", brand: "Skims" }, "skims", "women", "underwear", "shapewear"],
    [{ name: "BareBond™ Cotton Maternity & Nursing Bra | Black", type: "LACTANCIA", brand: "Kindred Bravely" }, "kindredbravely", "moms", "underwear", "bra"],
    [{ name: "Women's Jockey® 3 pk Supersoft French Cut Panty Set 2071", brand: "Jockey" }, "kohls", "women", "underwear", "panty"],
    [{ name: "Bali Comfort Revolution Wireless Bra DF3463", brand: "Bali" }, "kohls", "women", "underwear", "bra"],
    [{ name: "Vanity Fair Lingerie® Illumination Full-Figure Bra 76338", brand: "Vanity Fair Lingerie" }, "kohls", "women", "underwear", "bra"],
    [{ name: "EVERYDAY ANKLE SOCK | MARBLE", type: "SOCKS", brand: "Skims" }, "skims", "women", "socks", "casual"],
    [{ name: "W638 - Elevate crew socks", brand: "YoungLA", type: "For Her" }, "youngla", "gym_rat", "socks", "casual"],
    [{ name: "Stance Not Thirsty Crew Women's Socks", brand: "Stance" }, "mainland", "", "socks", "casual"],
    [{ name: "MeUndies Send Noods UltraModal Core Boyshort Underwear", brand: "MeUndies" }, "zumiez", "moda_mujer", "underwear", "panty"],
  ];
  for (const [it, r, b, ty, sub] of cases) {
    const c = isW(it, r, b);
    assert.ok(c, `"${it.name}" was left out`);
    assert.equal(c.type, ty, `"${it.name}" is ${c.type}, not ${ty}`);
    assert.equal(c.sub, sub, `"${it.name}" is ${c.sub}, not ${sub}`);
  }
});

check("the women's feed rejects men's, kids', swim, activewear and non-intimates", () => {
  const out = [
    [{ name: "AEO Men's 6\" Flex Boxer Brief", brand: "American Eagle", type: "UNDERWEAR" }, "americaneagle", "men"],
    [{ name: "Men's & Women's Crew Socks 6-Pack", brand: "Hanes" }, "walmart", "clothing"],
    [{ name: "Stance Icon Quarter 3 Pack Socks - Black", brand: "Stance" }, "ccs", "clothing"],
    [{ name: "Girls' Cotton Bralette 2-Pack", brand: "Cat & Jack" }, "target", "apparel_kids"],
    [{ name: "Kids Crew Socks 6pk", brand: "Hanes" }, "target", "apparel_women"],
    [{ name: "Roxy Printed Beach Classics Cheeky Bikini Bottoms", brand: "Roxy" }, "islandwatersports", ""],
    [{ name: "Hibiscus Tide Malibu Bralette Top", brand: "Billabong" }, "parrot", ""],
    [{ name: "Stratus Bra - Ocean", brand: "Alphalete" }, "alphalete", "gym_rat"],
    [{ name: "Women's Med Support Racer Back Bra", brand: "Everlast" }, "everlast", ""],
    [{ name: "Satin Lace-Trim Cami Pajama Set", type: "Pijamas", brand: "Victoria's Secret" }, "victoriassecret", "women"],
    [{ name: "Cotton Lounge Bra Top", type: "Ropa", brand: "Victoria's Secret" }, "victoriassecret", "women"],
    [{ name: "Bombshell Eau de Parfum", type: "Fragancia", brand: "Victoria's Secret" }, "victoriassecret", "beauty"],
    [{ name: "Kiera Boat Neck Maternity & Nursing Top | French Blue", type: "LACTANCIA", brand: "Kindred Bravely" }, "kindredbravely", "moms"],
    [{ name: "SKIMS BODY HIGH-WAISTED FLARE PANT | RAISIN", type: "SHAPEWEAR_BOTTOMS", brand: "Skims" }, "skims", "women"],
    [{ name: "Rocking Horse Teddy Keychain", brand: "Ganni" }, "ssense", "women"],
    [{ name: "Women's Long Sherpa Snap-Closure Teddy Coat", brand: "Macy's" }, "macys", "women"],
    [{ name: "Women's Padded Bra Tank Top - A New Day™ White M", brand: "A New Day" }, "target", "apparel_women"],
    [{ name: "Bonfolk Boobs Socks - Pink", brand: "Bonfolk" }, "ccs", "women"],
  ];
  for (const [it, r, b] of out) assert.equal(isW(it, r, b), null, `"${it.name}" got into the women's feed`);
});

const wfeed = JSON.parse(readFileSync(ROOT + "ropa-interior-women-feed.json", "utf8"));

check("ropa-interior-women-feed.json is what the catalogues give today", () => {
  const fresh = buildWomenFeed();
  assert.equal(wfeed.count, fresh.count,
    `the women's feed has ${wfeed.count} products, the catalogues give ${fresh.count} — run: node scripts/build-ropa-interior-feed.mjs`);
  assert.deepEqual(wfeed.items, fresh.items, "the women's feed is stale — run: node scripts/build-ropa-interior-feed.mjs");
});

check("the women's assortment is the department Danny asked for", () => {
  const items = wfeed.items;
  const under = items.filter(i => i.ty === "underwear"), socks = items.filter(i => i.ty === "socks");
  assert.ok(under.length >= 2000, `only ${under.length} women's intimates`);
  assert.ok(socks.length >= 100, `only ${socks.length} women's socks`);
  const from = (r) => items.filter(i => i.r === r).length;
  assert.ok(from("victoriassecret") >= 700, "Victoria's Secret intimates are missing");
  assert.ok(from("skims") >= 700, "SKIMS women's is missing");
  assert.ok(from("kindredbravely") >= 100, "Kindred Bravely is missing");
  for (const r of ["kohls", "macys", "lanebryant"]) assert.ok(from(r) >= 20, `${r} women's intimates are missing`);
  for (const sub of ["bra", "panty", "lingerie", "shapewear"]) assert.ok(under.some(i => i.sub === sub), `no ${sub}`);
  for (const i of items) {
    assert.ok(!/\b(?:men'?s|mens|for him|hombres?|boys?'?|girls?'?|kids?'?|toddler)\b/i.test(i.t), "a men's or kids' product got in: " + i.t);
    assert.ok(!/\b(?:eau de|parfum|fragrance|mist|lotion|pajamas?|bikini bottoms?)\b/i.test(i.t), "a non-intimate got in: " + i.t);
  }
  assert.ok(items.filter(i => i.s === 1).every(i => i.o > i.p), "a sale-flagged item has no markdown");
});

check("a sock lives in one feed only; kids' socks in neither; unisex socks default to men's", () => {
  const men = feed.items;
  const key = (i) => (i.b + "|" + i.t).toLowerCase();
  const wSock = new Set(wfeed.items.filter(i => i.ty === "socks").map(key));
  const wUrl = new Set(wfeed.items.filter(i => i.u).map(i => i.u));
  const dupes = men.filter(i => i.ty === "socks" && (wSock.has(key(i)) || (i.u && wUrl.has(i.u))));
  assert.equal(dupes.length, 0, "socks in both feeds: " + dupes.slice(0, 3).map(i => i.t).join(" | "));
  assert.equal(men.filter(i => i.u && wUrl.has(i.u)).length, 0, "an item is in both feeds");
  /* Every men's sock carries its gender note, and the unisex ones are there to surface. */
  const menSocks = men.filter(i => i.ty === "socks");
  assert.ok(menSocks.every(i => i.g === "m" || i.g === "u"), "a men's sock has no gender note");
  assert.ok(menSocks.filter(i => i.g === "u" && i.o > i.p).length >= 20, "no unisex sale socks to surface in Mujer");
  assert.ok(feed.items.every(i => i.ty === "socks" || i.g === undefined), "an underwear row carries a sock gender note");
  for (const [name, b] of [["Kids Crew Socks 6pk", "apparel_kids"], ["Toddler Grip Socks", ""], ["Girls' No Show Socks 6-Pack", "apparel_kids"], ["Boys' Athletic Crew Socks", ""]]) {
    assert.equal(is({ name, brand: "Hanes" }, "target", b), null, `"${name}" got into the men's feed`);
    assert.equal(isW({ name, brand: "Hanes" }, "target", b), null, `"${name}" got into the women's feed`);
  }
  for (const i of wfeed.items.filter(i => i.ty === "socks"))
    assert.ok(!/\b(?:men'?s|mens|unisex)\b/i.test(i.t), "a men's or unisex sock is in the women's feed: " + i.t);
});

/* The page's carousel picker, lifted and run on a stub. */
await (async () => {
  const lift = (sig) => {
    const at = page.indexOf(sig);
    assert.ok(at >= 0, sig + " moved — update this test");
    let depth = 0, i = page.indexOf("{", at + sig.length - 1);
    for (; i < page.length; i++) { if (page[i] === "{") depth++; else if (page[i] === "}" && --depth === 0) break; }
    return page.slice(at, i + 1);
  };
  const src = ["var RAIL_MAX = 20, RAIL_MIN = 4, DEEP = 30;", lift("function brandKey("), lift("function pct("), lift("function onSale("),
    lift("function hasPic("), lift("function bestSeller("), lift("function baseName("), lift("function curate(")].join("\n");
  const curate = new Function(src + "\nreturn curate;")();
  const mk = (t, p, o, extra = {}) => ({ t, b: extra.b || "Brand", r: "x", p, o, img: "https://x/" + t + ".jpg", rt: extra.rt || 0, rc: extra.rc || 0, ...extra });
  const list = [
    mk("Full price best seller", 20, 0, { rt: 5, rc: 9000 }),
    mk("Full price designer", 300, 0, { b: "Miu Miu" }),
    mk("Ten off", 18, 20, { rt: 4.9, rc: 5000 }),
    mk("Seventy off", 6, 20),
    mk("Forty off", 12, 20),
    mk("Designer twenty off", 240, 300, { b: "Miu Miu" }),
    mk("Seamless Bra | ONYX", 10, 20),
    mk("Seamless Bra | SAND", 10, 20),
    mk("No photo sale", 5, 50, { img: "" }),
    mk("Quarantined sale", 5, 50, { ir: "quarantined" }),
  ];
  const picks = curate(list, (p) => /miu miu/i.test(p.b));
  check("carousels are sales only: biggest sales, then premium, then best sellers", () => {
    const titles = picks.map(p => p.t);
    assert.ok(picks.every(p => p.o > p.p), "a full-price item is in a carousel: " + titles.join(", "));
    assert.deepEqual(titles, ["Seventy off", "Seamless Bra | ONYX", "Forty off", "Designer twenty off", "Ten off"], "wrong picks or order: " + titles.join(", "));
    assert.ok(!titles.includes("Seamless Bra | SAND"), "two colourways of one product in a rail");
    assert.ok(!titles.includes("No photo sale") && !titles.includes("Quarantined sale"), "an unphotographed item is in a carousel");
  });
  check("a rail with fewer than four photographed sale items is not shown", () => {
    assert.match(page, /if \(picks\.length < RAIL_MIN\) return '';/, "short rails are shown");
    assert.equal(curate(list.slice(0, 4), () => false).length, 2, "the picker padded a short rail");
  });
})();

check("the page has a Mujer and a Hombre section, each carousels first", () => {
  for (const [P, id, title, theme] of [["w", "mujer", "Ropa Interior Mujer", "sec-w"], ["m", "hombre", "Ropa Interior Hombre", "sec-m"]]) {
    assert.match(page, new RegExp(`<section class="sec ${theme}" id="${id}"`), `no ${id} section`);
    assert.match(page, new RegExp(`<h2 id="${P}-title">${title}</h2>`), `the ${id} section is not titled ${title}`);
    const order = ["-stats", "-tipo", "-marca", "-tienda", "-explorar", "-fQ", "-grid"].map(k => page.indexOf(`id="${P}${k}"`));
    assert.ok(order.every(i => i > 0), `${id}: a part of the section is missing`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `${id}: hero, carousels, filters, grid are out of order`);
  }
  assert.ok(page.indexOf('id="mujer"') < page.indexOf('id="hombre"'), "Mujer does not come first");
  /* Mujer is the Moda Mujer light pink; Hombre stays dark, never white. */
  assert.match(page, /\.sec-w\{[^}]*#F5C4DC/, "the Mujer section is not the Moda Mujer pink");
  assert.match(page, /\.sec-m\{[^}]*--bg:#0B0F17/, "the Hombre section is not dark");
  assert.match(page, /getFeed\('\/ropa-interior-women-feed\.json'\)/, "the page does not read the women's feed");
  assert.match(page, /p\.ty === 'socks' && p\.g === 'u'/, "the unisex sale socks are not surfaced in Mujer");
  for (const t of ["Sostenes", "Panties", "Lencería", "Modeladores", "Medias", "Victoria's Secret", "SKIMS", "Kindred Bravely", "Bali", "Wacoal"])
    assert.ok(page.includes(`title:'${t}'`) || page.includes(`title:"${t}"`), `the Mujer "${t}" carousel is missing`);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u.test(page), "an emoji is on the page");
  /* Every card prints title, image, price and a description line. */
  assert.match(page, /var desc = p\.d \|\| SUB_LABEL\[p\.sub\] \|\| '';/, "cards have no description");
});

check("search speaks the department's words", () => {
  const sandbox = { window: {} };
  new Function("window", readFileSync(ROOT + "search-engine.js", "utf8"))(sandbox.window);
  const T = (q) => sandbox.window.AriaSearch.translateQuery(q).query;
  assert.match(T("bragas"), /panties/, "bragas");
  assert.match(T("calzoncillos"), /boxer briefs/, "calzoncillos");
  assert.match(T("lenceria"), /lingerie/, "lencería");
  assert.match(T("ropa interior de mujer"), /underwear/, "ropa interior de mujer");
  assert.match(T("ropa interior de mujer"), /women/, "ropa interior de mujer keeps the gender");
  assert.match(T("sostenes"), /bra/, "sostenes");
  assert.match(T("calcetines"), /socks/, "calcetines");
  const dict = JSON.parse(readFileSync(ROOT + "assets/search/synonyms-es.json", "utf8"));
  for (const [w, en] of [["bragas", "panties"], ["calzoncillos", "boxer briefs"], ["lenceria", "lingerie"], ["sostenes", "bra"], ["medias", "socks"], ["calcetines", "socks"], ["boxers", "boxer briefs"]])
    assert.equal(dict.clothing[w], en, `search.html's dictionary: ${w}`);
  assert.equal(dict.phrases["ropa interior"], "underwear");
  assert.equal(dict.modifiers.mujer, "womens");
});

const MIN_CHECKS = 19;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
