/* ==================================================================
   «TODAS LAS TIENDAS»: STORE PILLS ON TOP OF THE HOMEPAGE'S CATEGORY
   CAROUSELS (Danny, #443, 2026-11-01).

     - a pill is a real storefront that truly sells that category, with
       real depth (no padding); its rail holds only that category's
       products from that store and ends on «Ver más en <Tienda>»;
     - Lencería is the renamed Ropa Interior Mujer carousel (same feed);
       Bikinis y Ropas de Baño and Hogar y Especialidades are new (no Auto or Motos carousel), and
       Auto and Motos stay two independent carousels (Danny reversed the
       merge, c.6564465814);
     - the category feed's Aria Fight Club rail is fight gear, mirrored
       from the fight department; Deportes is not one sport;
     - zero emoji; the Mountain Test (small files, nothing at load);
     - at 390px a pill switches its carousel, «Todas» puts it back.

     node scripts/test/home-category-pills-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { CAROUSELS, PILLS_DIR, MIN_CARDS, RAIL_CARDS, FIGHT_GEAR_TYPES, buildCategoryPills, pillFiles, liveStorefronts, storeSlice, sliceCategory, classifierOf } from "../build-home-category-pills.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");
const json = (f) => JSON.parse(read(f));
const index = json(PILLS_DIR + "/index.json");
const railFiles = readdirSync(ROOT + PILLS_DIR).filter((f) => f !== "index.json");
const html = read("index.html");
const shopfronts = () => {
  const m = html.indexOf('id="mobileShopfront"'), d = html.indexOf('id="desktopShopfront"');
  const end = html.indexOf('id="whyUs"');
  return { mobile: html.slice(m, d), desktop: html.slice(d, end > d ? end : undefined) };
};
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

await check("the committed files are what the store and department data give today", () => {
  const files = pillFiles(buildCategoryPills(ROOT));
  const strip = (b) => JSON.parse(JSON.stringify(b), (k, v) => (k === "ph" ? undefined : v));
  assert.deepEqual(Object.keys(files).sort(), readdirSync(ROOT + PILLS_DIR).sort(), "file set is stale -- node scripts/build-home-category-pills.mjs");
  for (const [name, body] of Object.entries(files)) assert.deepEqual(strip(json(`${PILLS_DIR}/${name}`)), strip(body), name + " is stale -- node scripts/build-home-category-pills.mjs");
});

await check("pills only for live storefronts that truly sell the category, with real depth", () => {
  const live = liveStorefronts(ROOT);
  for (const [k, c] of Object.entries(index.c)) {
    assert.ok(CAROUSELS.some((x) => x.k === k), "unknown carousel " + k);
    assert.ok(c.s.length >= 1, k + " has no pill");
    for (const [store, n] of c.s) {
      assert.ok(live[store], `${k}: ${store} is not a live storefront`);
      assert.ok(existsSync(ROOT + `assets/tienda/${store}/index.json`), `${k}: ${store} has no store page`);
      assert.ok(n >= MIN_CARDS, `${k}: ${store} has only ${n}`);
      assert.equal(index.labels[store], live[store], `${k}: ${store}'s label is not the store's own`);
      const f = json(`${PILLS_DIR}/${k}-${store}.json`);
      assert.equal(f.door, `/tienda.html?tienda=${store}`);
      assert.ok(f.cards.length >= Math.min(MIN_CARDS, RAIL_CARDS), `${k}/${store}: ${f.cards.length} cards`);
    }
  }
});

/* Membership recomputed from the category data, independently of the build. */
function membersOf(c) {
  const keys = new Set();
  if (c.src.feed) for (const f of json(c.src.feed).items) { if (!c.src.underwearOnly || f.ty === "underwear") keys.add(f.r + "::" + f.t); }
  if (c.src.depts) for (const d of c.src.depts) for (const r of json(`assets/sections/departamento/_fn/${d}.json`).rows) keys.add(r[2] + "::" + r[0]);
  if (c.src.swim) {
    const want = "bano";
    for (const store of Object.keys(liveStorefronts(ROOT))) {
      const s = storeSlice(ROOT, store);
      if (s) s.rows.forEach((r, i) => { if (r && sliceCategory(s, i) === want) keys.add(store + "::" + r[0]); });
    }
  }
  return keys;
}
await check("every rail is category-pure: only that category's products, only from that store", () => {
  for (const c of CAROUSELS) {
    if (!index.c[c.k]) continue;
    const keys = membersOf(c);
    for (const f of railFiles.filter((f) => f.startsWith(c.k + "-"))) {
      const body = json(`${PILLS_DIR}/${f}`);
      for (const card of body.cards) {
        assert.ok(keys.has(card.retailer + "::" + card.title), `${f}: «${card.title}» (${card.retailer}) is not in ${c.title}`);
        if (body.store) assert.equal(card.retailer, body.store, `${f}: a card from another store`);
        assert.match(card.image, /^https?:\/\//, f + ": a card without its photo");
        assert.ok(card.price > 0, f + ": a card without its price");
      }
    }
  }
  /* A training shop's sports bra is not lingerie; a fight shop's rash guard is not swimwear. */
  for (const s of index.c.lenceria.s) assert.ok(!["ryderwear", "oneractive", "gymshark", "kindredbravely"].includes(s[0]), "Lencería pills " + s[0]);
  for (const s of index.c.bano.s) assert.ok(!["venum", "tatami", "elite"].includes(s[0]), "Ropa de Baño pills " + s[0]);
});

await check("Lencería is the renamed Ropa Interior Mujer carousel; Ropa Interior Hombre stays", () => {
  const { mobile, desktop } = shopfronts();
  for (const [name, part] of [["phone", mobile], ["desktop", desktop]]) {
    const sec = /<section aria-label="Lencería"[\s\S]*?<\/section>/.exec(part);
    assert.ok(sec, name + ": no Lencería carousel");
    assert.match(sec[0], /data-category-rail-row="ropa_interior_mujer"/, name + ": Lencería is not the ropa_interior_mujer rail");
    assert.match(sec[0], />Lencería<\/a>/, name + ": the header does not say Lencería");
    assert.doesNotMatch(part, /Ropa Interior Mujer/, name + ": the old label is still on the homepage");
    assert.match(part, /aria-label="Ropa Interior Hombre"[\s\S]*?data-category-rail-row="ropa_interior"/, name + ": Ropa Interior Hombre moved");
  }
  const bundle = /<script src="(\/build\/app-[0-9a-f]{16}\.js)"><\/script>/.exec(html)[1];
  const b = read(bundle.slice(1));
  assert.match(b, /\{ key: 'ropa_interior_mujer', label: 'Lencería'/, "the carousel's end tile still says Ropa Interior Mujer");
  assert.match(b, /feed: \(\) => ropaInteriorRailPicks\('\/ropa-interior-women-feed\.json'\)/, "Lencería lost its feed");
});

await check("Todas las Tiendas header; Bikinis y Ropas de Baño and Hogar y Especialidades present; no Auto or Motos carousel (c.6565694526)", () => {
  const { mobile, desktop } = shopfronts();
  for (const [name, part] of [["phone", mobile], ["desktop", desktop]]) {
    const head = part.indexOf("data-todas-las-tiendas");
    assert.ok(head > 0 && />Todas las Tiendas</.test(part), name + ": no «Todas las Tiendas» header");
    assert.ok(head < part.indexOf('aria-label="Lencería"'), name + ": the header is not above the category block");
    for (const [k, t] of [["bano", "Bikinis y Ropas de Baño"], ["hogar", "Hogar y Especialidades"]]) {
      const n = part.split(`data-cat-pills="${k}" data-cat-pills-own`).length - 1;
      assert.equal(n, 1, `${name}: ${n} ${t} carousels`);
      assert.match(part, new RegExp(`<section aria-label="${t}" data-cat-pills-section`), `${name}: ${t} has no carousel`);
    }
    assert.doesNotMatch(part, /Ropa de Baño/, name + ": the old «Ropa de Baño» label");
    /* Auto and Motos have their own pages (aria-auto.html, motos.html): no carousel in this row. */
    assert.doesNotMatch(part, /data-cat-pills="(?:auto|motos)"/, name + ": an Auto or Motos carousel");
    assert.doesNotMatch(part, /<section aria-label="(?:Auto|Motos|Auto y Motos)" data-cat-pills-section/, name + ": an Auto or Motos carousel");
    /* Pills on every existing category carousel. */
    for (const row of ["ropa_interior_mujer", "ropa_interior", "curvy", "gym_rat", "soccer", "combat_sports", "beauty", "surf_skate", "toys", "shoes", "sunglasses"])
      assert.match(part, new RegExp(`data-category-rail-row="${row}" data-cat-pills="[a-z-]+"`), `${name}: ${row} has no pill row`);
  }
  assert.ok(!index.c.auto && !index.c.motos, "Auto or Motos pill data");
  assert.equal(index.c.hogar.door, "/departamento.html?dept=home_goods");
});

await check("a non-apparel carousel holds only its own family (one classifier): no tortillas in Juguetes, Aria sells no food", () => {
  const C = classifierOf(ROOT);
  for (const c of CAROUSELS.filter((x) => x.src.families)) {
    const typeOf = new Map();
    for (const d of c.src.depts) for (const r of json(`assets/sections/departamento/_fn/${d}.json`).rows) typeOf.set(r[2] + "::" + r[0], r[7]);
    for (const [store] of index.c[c.k].s) {
      for (const cd of json(`${PILLS_DIR}/${c.k}-${store}.json`).cards) {
        const fam = C.classify({ name: cd.title, type: typeOf.get(store + "::" + cd.title), retailer: store, brand: cd.brand });
        assert.ok(c.src.families.includes(fam), `${c.k}/${store}: "${cd.title}" is ${fam}`);
      }
    }
  }
  const costco = index.c.juguetes.s.some((s) => s[0] === "costco") ? json(`${PILLS_DIR}/juguetes-costco.json`).cards.map((c) => c.title) : [];
  for (const t of costco) assert.doesNotMatch(t, /tortilla|cocoa|cereal|mac & cheese|hot sauce|oats|juice|coca-cola|throw\b/i, "Juguetes/Costco: " + t);
});

await check("the category feed's Aria Fight Club rail is fight gear from the fight department; Deportes is not one sport", () => {
  const rails = json("assets/home/shelves/category.json").rails;
  const fight = new Map(json("assets/sections/departamento/_fn/combat_sports.json").rows.map((r) => [r[2] + "::" + r[0], r[7]]));
  assert.ok(rails.combat_sports.length >= 12, "Fight Club rail has " + rails.combat_sports.length);
  for (const p of rails.combat_sports) {
    const t = fight.get(p.retailer + "::" + p.title);
    assert.ok(t !== undefined, `«${p.title}» is not in the fight department`);
    assert.ok(FIGHT_GEAR_TYPES.has(t), `«${p.title}» (${t}) is not fight gear`);
  }
  const sg = new Set(json("assets/sections/departamento/_fn/sporting_goods.json").rows.map((r) => r[2] + "::" + r[0]));
  const soccer = new Set(json("assets/sections/departamento/_fn/soccer.json").rows.map((r) => r[2] + "::" + r[0]));
  for (const p of rails.sporting_goods) assert.ok(sg.has(p.retailer + "::" + p.title), `«${p.title}» is not in Deportes`);
  const nonSoccer = rails.sporting_goods.filter((p) => !soccer.has(p.retailer + "::" + p.title)).length;
  assert.ok(nonSoccer >= rails.sporting_goods.length / 2, `Deportes is ${rails.sporting_goods.length - nonSoccer}/${rails.sporting_goods.length} soccer`);
});

await check("zero emoji; all copy Spanish; no outside links", () => {
  const js = read("assets/js/home-category-pills.js");
  assert.doesNotMatch(js, EMOJI, "emoji in the page script");
  assert.doesNotMatch(read("scripts/build-home-category-pills.mjs"), EMOJI, "emoji in the build");
  for (const f of readdirSync(ROOT + PILLS_DIR)) assert.doesNotMatch(read(`${PILLS_DIR}/${f}`).replace(/"(title|brand|image)":"(?:[^"\\]|\\.)*"/g, ""), EMOJI, f + ": emoji outside product data");
  const { mobile, desktop } = shopfronts();
  for (const part of [mobile, desktop]) for (const m of part.matchAll(/<section aria-label="[^"]*" data-cat-pills-section[\s\S]*?<\/section>|data-todas-las-tiendas[\s\S]*?<\/div>\s*<\/div>/g)) assert.doesNotMatch(m[0], EMOJI, "emoji in the new markup");
  assert.match(js, />Todas<\/button>/);
  assert.match(js, /"Ver más en"/);
  assert.match(js, /\/producto\.html\?producto=/);
  assert.doesNotMatch(js, /https?:\/\//, "an outside link in the page script");
  for (const f of railFiles) { const d = json(`${PILLS_DIR}/${f}`).door; if (d) assert.match(d, /^\/(tienda\.html\?tienda=|departamento\.html\?dept=|motos\.html$)/, f + ": door " + d); }
});

await check("the Mountain Test: small files, nothing at load, the script deferred", () => {
  assert.ok(statSync(ROOT + PILLS_DIR + "/index.json").size < 12 * 1024, "index.json is " + statSync(ROOT + PILLS_DIR + "/index.json").size + " B");
  for (const f of railFiles) assert.ok(statSync(`${ROOT}${PILLS_DIR}/${f}`).size < 12 * 1024, f + " is over 12KB");
  assert.match(html, /<script src="\/assets\/js\/home-category-pills\.js" defer><\/script>/);
  assert.doesNotMatch(html, /category-pills\/[a-z-]+\.json/, "index.html names a pill file (preload?)");
  const js = read("assets/js/home-category-pills.js");
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /loading|railCardHTML/);
});

/* ---------- in the browser, at phone width ---------- */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await check("390px: a store pill switches its carousel to that store, ending on «Ver más en»; «Todas» puts it back", async () => {
  const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const requested = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.startsWith("/.netlify/") || u.pathname.startsWith("/api/")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); return; }
    if (u.pathname.startsWith("/" + PILLS_DIR + "/")) requested.push(u.pathname);
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    /* Remote photos are blocked here: a 1x1 PNG stands in, so the photo rescue keeps the cards. */
    await pg.route((url) => url.host !== new URL(base).host, (r) => (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(r.request().url()) || r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/png", body: PNG }) : r.abort()));
    await pg.goto(base + "/", { waitUntil: "load" });
    await pg.waitForTimeout(1500);
    assert.deepEqual(requested, [], "pill data fetched at load: " + requested.join(", "));

    /* A new carousel (Bikinis y Ropas de Baño): «Todas» paints from its own file, then a store pill. */
    const sel = '#mobileShopfront [data-cat-pills="bano"]';
    await pg.$eval(sel, (el) => el.closest("section").scrollIntoView({ block: "center" }));
    await pg.waitForFunction((s) => document.querySelector(s).querySelectorAll("[data-cat-pills-card]").length >= 8, sel, { timeout: 20000 });
    const bar = '#mobileShopfront [data-cat-pills-bar="bano"]';
    await pg.waitForSelector(bar + " button[data-hcp]:not([data-hcp=''])", { timeout: 10000 });
    const first = await pg.$eval(bar, (b) => ({ sel: b.querySelector('[aria-selected="true"]').textContent, n: b.children.length }));
    assert.equal(first.sel, "Todas", "«Todas» is not the first, selected pill");
    assert.ok(first.n >= 3, "Bikinis y Ropas de Baño has " + (first.n - 1) + " store pills");
    /* the new carousel and its pill row stay inside the phone's width (the row scrolls within itself) */
    const wide = await pg.$$eval("#mobileShopfront [data-cat-pills-section], #mobileShopfront .hcp, #mobileShopfront [data-todas-las-tiendas]", (els) => els.filter((e) => e.getBoundingClientRect().right > 391).length);
    assert.equal(wide, 0, "a pill row or new carousel is wider than the phone");
    const store = index.c.bano.s[1][0];
    await pg.click(`${bar} button[data-hcp="${store}"]`);
    await pg.waitForFunction(([s, st]) => { const c = [...document.querySelector(s).querySelectorAll("[data-cat-pills-card]")]; return c.length >= 8 && c.every((x) => x.getAttribute("data-cat-pills-card") === st); }, [sel, store], { timeout: 20000 });
    const end = await pg.$eval(sel, (row) => { const l = row.lastElementChild; return { more: l.hasAttribute("data-cat-pills-more"), href: l.getAttribute("href"), text: l.textContent.replace(/\s+/g, " ").trim() }; });
    assert.ok(end.more, "the rail does not end on its door");
    assert.equal(end.href, `/tienda.html?tienda=${store}`);
    assert.match(end.text, new RegExp("^Ver más en\\s*" + index.labels[store].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    /* the price is the bundle's own: railLeadPrice of the normalized card (soles once the
       exchange rate answers; this sandbox blocks it, so the bundle shows its US$ fallback) */
    const price = await pg.$eval(sel + " [data-cat-pills-card]", (c) => {
      const t = c.textContent;
      const lead = typeof railLeadPrice === "function" ? railLeadPrice(1).replace(/[\d.,\s]/g, "") : "";
      return { t, lead };
    });
    assert.ok(price.lead && price.t.includes(price.lead), "a pill card without the bundle's price label");
    assert.match(price.t, /(S\/|\$)\s?\d/, "a pill card without its price");
    await pg.click(`${bar} button[data-hcp=""]`);
    await pg.waitForFunction((s) => { const c = [...document.querySelector(s).querySelectorAll("[data-cat-pills-card]")]; return new Set(c.map((x) => x.getAttribute("data-cat-pills-card"))).size >= 2; }, sel, { timeout: 20000 });

    /* An existing carousel (Aria Fight Club): the pill swaps the bundle's cards, «Todas» restores them. */
    const fsel = '#mobileShopfront [data-category-rail-row="combat_sports"]';
    await pg.$eval('#mobileShopfront [aria-label="Compra por categoría"]', (el) => el.scrollIntoView());
    await pg.waitForFunction((s) => { const r = document.querySelector(s); return r && !r.closest("section").hidden; }, fsel, { timeout: 60000 });
    await pg.$eval(fsel, (el) => el.closest("section").scrollIntoView({ block: "center" }));
    await pg.waitForFunction((s) => document.querySelector(s).querySelectorAll("[data-category-rail-card]").length >= 8, fsel, { timeout: 60000 });
    const fbar = '#mobileShopfront [data-cat-pills-bar="fight-club"]';
    await pg.waitForSelector(fbar + ' button[data-hcp="venum"]', { timeout: 15000 });
    const before = await pg.$eval(fsel, (r) => r.children.length);
    await pg.click(fbar + ' button[data-hcp="venum"]');
    await pg.waitForFunction((s) => { const c = [...document.querySelector(s).querySelectorAll("[data-cat-pills-card]")]; return c.length >= 8 && c.every((x) => x.getAttribute("data-cat-pills-card") === "venum"); }, fsel, { timeout: 20000 });
    const fend = await pg.$eval(fsel, (row) => row.lastElementChild.getAttribute("href"));
    assert.equal(fend, "/tienda.html?tienda=venum");
    await pg.click(fbar + ' button[data-hcp=""]');
    await pg.waitForFunction(([s, n]) => document.querySelector(s).querySelectorAll("[data-category-rail-card]").length >= 8 && document.querySelector(s).children.length === n, [fsel, before], { timeout: 10000 });
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
