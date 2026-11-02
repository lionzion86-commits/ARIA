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
     - at 390px a pill switches its carousel, «Todas» puts it back;
     - Danny's audit (#443 c.6567120876, c.6567135924, c.6567197812):
       the lead store of each carousel (Victoria's Secret, Lane Bryant,
       Montce with its third photo, Venum gloves then Tatami gis), Gym
       Rat's Gymshark and Alphalete at the back, never a sock or an
       accessory in front, no socks in Lencería, no straps or cases in
       Lentes, no belts, toys or wallets in Joyas, every «Todas» a mix,
       the Ofertas pill (sale items only), the new Tenis and Billeteras
       carousels, perfumes that lead with prestige.

     node scripts/test/home-category-pills-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { CAROUSELS, PILLS_DIR, MIN_CARDS, RAIL_CARDS, FIGHT_GEAR_TYPES, FIGHT_GEAR_CLASSES, OFERTAS_MIN, buildCategoryPills, pillFiles, defaultRails, liveStorefronts, storeSlice, sliceCategory, classifierOf, saleRuleOf,
  isSock, isAccessory, isEyewearAccessory, isBelt, isToyPiece, isWallet, catalogueImages } from "../build-home-category-pills.mjs";
import { perfumeHouseRank, isMenBelt } from "../../netlify/functions/_department-core.js";

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
    if (c.a) continue;   /* audience pills (Billeteras): checked below */
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
  if (c.src.wallets) {
    for (const store of Object.keys(liveStorefronts(ROOT))) {
      const s = storeSlice(ROOT, store);
      if (s) s.rows.forEach((r) => { if (r && isWallet({ title: r[0], _type: r[8] })) keys.add(store + "::" + r[0]); });
    }
  }
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

/* ---------- Danny's audit (#443 c.6567120876, c.6567135924, c.6567197812) ---------- */
const built = buildCategoryPills(ROOT);
const byK = Object.fromEntries(built.carousels.map((c) => [c.k, c]));
const category = json("assets/home/shelves/category.json").rails;
const joyasShelf = json("assets/home/shelves/joyas.json").picks;
const cardsOf = (f) => json(`${PILLS_DIR}/${f}`).cards;
const deptType = (d) => new Map(json(`assets/sections/departamento/_fn/${d}.json`).rows.map((r) => [r[2] + "::" + r[0], r[7]]));

await check("each carousel leads with its store: Victoria's Secret, Lane Bryant, Montce, Venum then Tatami; Gymshark and Alphalete at the back", () => {
  assert.equal(index.c.lenceria.s[0][0], "victoriassecret", "Lencería's first pill");
  assert.equal(index.c.lenceria.s[1][0], "skims", "Lencería's second pill");
  assert.equal(index.c["tallas-plus"].s[0][0], "lanebryant", "Tallas Plus's first pill");
  assert.equal(index.c.bano.s[0][0], "montce", "Bikinis' first pill");
  assert.deepEqual(index.c["fight-club"].s.slice(0, 2).map((x) => x[0]), ["venum", "tatami"], "Fight Club's first pills");
  const gym = index.c["gym-rat"].s.map((x) => x[0]);
  assert.deepEqual(gym.slice(-2), ["gymshark", "alphalete"], "Gymshark and Alphalete stay live, at the back of Gym Rat's pills");
  /* the default rails («Todas») */
  assert.ok(category.ropa_interior_mujer.slice(0, 3).every((p) => p.retailer === "victoriassecret"), "Lencería's rail does not open on Victoria's Secret");
  assert.match(category.ropa_interior_mujer[0].title, /\bbra\b/i, "Lencería opens on a Victoria's Secret bra");
  assert.ok(category.curvy.slice(0, 3).every((p) => p.retailer === "lanebryant"), "Tallas Plus's rail does not open on Lane Bryant");
  assert.equal(cardsOf("bano-todas.json")[0].retailer, "montce", "Bikinis' rail does not open on Montce");
  const gymFront = category.gym_rat.slice(0, 12).map((p) => p.retailer);
  assert.ok(!gymFront.includes("gymshark") && !gymFront.includes("alphalete"), "Gymshark or Alphalete in Gym Rat's first 12: " + gymFront.join(","));
  assert.ok(category.gym_rat.some((p) => p.retailer === "gymshark"), "Gymshark left Gym Rat (demoted, never removed)");
});

await check("Aria Fight Club opens on Venum gloves, then Tatami gis, then the mix (Venum-led, not all-Venum)", () => {
  const fight = deptType("combat_sports");
  const cls = (p) => { const t = fight.get(p.retailer + "::" + p.title); const c = FIGHT_GEAR_CLASSES.find(([, ts]) => ts.includes(t)); return c ? c[0] : ""; };
  const r = category.combat_sports;
  assert.ok(r[0].retailer === "venum" && cls(r[0]) === "guantes", `first card is ${r[0].retailer} ${cls(r[0])}: ${r[0].title}`);
  assert.match(r[0].title, /gloves/i);
  const firstTatami = r.findIndex((p) => p.retailer === "tatami");
  assert.ok(firstTatami > 0 && firstTatami <= 3 && cls(r[firstTatami]) === "gi", "Tatami's gi does not follow the gloves");
  assert.ok(r.filter((p) => p.retailer === "venum").length <= r.length / 2, "the rail is all Venum");
  assert.ok(new Set(r.map((p) => p.retailer)).size >= 4, "the rail is not a mix");
});

await check("Bikinis y Ropas de Baño: the first card is Montce's lead product in its third catalogue photo", () => {
  const first = cardsOf("bano-todas.json")[0];
  const imgs = catalogueImages(ROOT, first.retailer, first.title);
  assert.ok(imgs.length >= 3, "the lead product has no third photo");
  assert.equal(first.image, imgs[2], "the first card is not images[2]");
  assert.equal(first.title, cardsOf("bano-montce.json")[0].title, "the lead is not Montce's own lead product");
});

const WORN = CAROUSELS.filter((c) => c.worn);
await check("never a sock or an accessory in front: every pill rail and every «Todas» of a carousel of clothes opens on worn apparel", () => {
  for (const c of WORN) {
    const b = byK[c.k];
    for (const m of b.stores) assert.ok(m.rail.slice(0, 4).every((cd) => !cd._low), `${c.k}/${m.k} opens on «${m.rail.find((cd) => cd._low)?.title}»`);
    const low = new Set(b.stores.flatMap((m) => m.rail.filter((cd) => cd._low).map((cd) => cd.retailer + "::" + cd.title)));
    const todas = c.host === "new" ? cardsOf(`${c.k}-todas.json`) : category[c.row];
    for (const p of todas.slice(0, 6)) assert.ok(!low.has(p.retailer + "::" + p.title), `${c.k} «Todas» opens on «${p.title}»`);
    for (const p of todas.slice(0, 6)) assert.doesNotMatch(p.title, /\bsocks?\b|\bband extenders?\b|\bhardware\b|\bbearings\b/i, `${c.k} «Todas» opens on «${p.title}»`);
    for (const f of railFiles.filter((f) => f.startsWith(c.k + "-") && !f.endsWith("-ofertas.json") && f !== c.k + "-todas.json"))
      assert.doesNotMatch(cardsOf(f)[0].title, /\bsocks?\b/i, f + " opens on socks");
  }
});

await check("no socks in Lencería (pills, «Todas», the saved rail)", () => {
  const socks = new Set(json("ropa-interior-women-feed.json").items.filter((f) => f.ty === "socks").map((f) => f.r + "::" + f.t));
  const all = [...railFiles.filter((f) => f.startsWith("lenceria-")).flatMap(cardsOf), ...category.ropa_interior_mujer];
  for (const p of all) {
    assert.ok(!socks.has(p.retailer + "::" + p.title), "a sock in Lencería: " + p.title);
    assert.ok(!(p.departments || []).includes("socks"), "a sock in Lencería: " + p.title);
    assert.doesNotMatch(p.title, /\bsocks?\b/i, "a sock in Lencería: " + p.title);
  }
  assert.ok(!all.some((p) => p.retailer === "kindredbravely"), "Kindred Bravely's socks are back");
});

await check("no straps, cases, retainers or cleaning kits in Lentes de Sol", () => {
  const all = [...railFiles.filter((f) => f.startsWith("lentes-")).flatMap(cardsOf), ...category.sunglasses];
  for (const p of all) assert.ok(!isEyewearAccessory(p), "an accessory in Lentes: " + p.title);
  for (const t of ["Southern Tide Sunglass Strap", "I-SEA SUNGLASSE CASE", "Costa Del Mar Loop Retainer", "Oakley Eclipse Accessary Case"]) assert.ok(isEyewearAccessory({ title: t }), t);
  for (const t of ["Rodeo Ridge Men's Sunglasses with Cord", "Knockaround Campeones Men's Sunglasses - Trophy Case", "Polarized Fit Over Glasses Sunglasses for Women with Hard Case, Oversized"]) assert.ok(!isEyewearAccessory({ title: t }), t);
  const iws = cardsOf("lentes-islandwatersports.json");
  assert.match(iws[0].title, /sunglass/i, "Island Water Sports' rail opens on " + iws[0].title);
});

await check("no belts, toys or wallets in Joyas (pills and the saved rail); keychains stay", () => {
  const type = deptType("joyas_accesorios");
  const all = [...railFiles.filter((f) => f.startsWith("joyas-")).flatMap(cardsOf), ...joyasShelf];
  for (const p of all) {
    const cd = { title: p.title, _type: type.get(p.retailer + "::" + p.title) || p.type || "" };
    assert.ok(!isBelt(cd), "a belt in Joyas: " + p.title);
    assert.ok(!isToyPiece(cd), "a toy in Joyas: " + p.title);
    assert.ok(!isWallet(cd), "a wallet in Joyas: " + p.title);
    assert.doesNotMatch(p.title, /\bfunko\b|\bpocket pop\b/i, "in Joyas: " + p.title);
  }
  assert.doesNotMatch(cardsOf("joyas-boxlunch.json")[0].title, /funko|pop!/i, "BoxLunch opens on a Funko");
  if (index.c.joyas.s.some((x) => x[0] === "ssense")) assert.ok(cardsOf("joyas-ssense.json").every((p) => !/\bbelt/i.test(p.title)), "SSENSE's belts");
});

await check("every «Todas» is a mix: several stores up front, never one store's pill", () => {
  const todas = { joyas: joyasShelf };
  for (const c of CAROUSELS) {
    if (!index.c[c.k] || c.host === "tech") continue;
    todas[c.k] = c.host === "new" ? cardsOf(`${c.k}-todas.json`) : c.host === "joyas" ? joyasShelf : category[c.row];
  }
  for (const [k, list] of Object.entries(todas)) {
    const n = (index.c[k] || index.c.joyas).s.length;
    const front = new Set(list.slice(0, 10).map((p) => p.retailer)).size;
    assert.ok(front >= Math.min(3, n), `${k}: ${front} store(s) in the first 10 «Todas» cards`);
    for (const [store] of (index.c[k] || index.c.joyas).s) {
      const pill = cardsOf(`${k}-${store}.json`).map((p) => p.title);
      assert.notDeepEqual(list.slice(0, pill.length).map((p) => p.title), pill, `${k}: «Todas» is ${store}'s pill`);
    }
  }
  const j = joyasShelf.slice(0, 12).map((p) => p.retailer);
  assert.equal(j[0], "baublebar", "Joyas may lead with BaubleBar");
  assert.ok(j.filter((r) => r === "baublebar").length <= 3, "Joyas' front is all BaubleBar");
});

await check("Ofertas: one file per view with at least 8 sale items, sale items only (the site's one sale rule)", () => {
  const sale = saleRuleOf(ROOT);
  assert.equal(index.omin, OFERTAS_MIN);
  let n = 0;
  for (const [k, c] of Object.entries(index.c)) {
    if (c.o) { assert.ok(c.o >= OFERTAS_MIN); assert.ok(existsSync(`${ROOT}${PILLS_DIR}/${k}-ofertas.json`), k + "-ofertas.json missing"); }
    else assert.ok(!existsSync(`${ROOT}${PILLS_DIR}/${k}-ofertas.json`), k + ": an Ofertas file without its pill");
    for (const [store, , o] of c.s) {
      const f = `${ROOT}${PILLS_DIR}/${k}-${store}-ofertas.json`;
      assert.equal(existsSync(f), o >= OFERTAS_MIN, `${k}/${store}: ofertas count ${o} vs file`);
    }
  }
  for (const f of railFiles.filter((f) => f.endsWith("-ofertas.json"))) {
    const cards = cardsOf(f);
    assert.ok(cards.length >= OFERTAS_MIN, `${f}: ${cards.length} cards`);
    for (const p of cards) assert.ok(sale.isOnSale(p), `${f}: «${p.title}» is not on sale`);
    n++;
  }
  assert.ok(n >= 20, "only " + n + " Ofertas files");
  assert.ok(!index.c.electronica.o, "Electrónica already has its own Ofertas pill");
  assert.ok(index.c.lenceria.o >= OFERTAS_MIN && index.c.bano.o >= OFERTAS_MIN, "Lencería / Bikinis without Ofertas");
});

await check("Tenis and Billeteras: new carousels with store pills, phone and desktop; Tennis Warehouse only with a live catalogue", () => {
  const { mobile, desktop } = shopfronts();
  for (const [name, part] of [["phone", mobile], ["desktop", desktop]]) {
    assert.equal(part.split('data-cat-pills="tenis" data-cat-pills-own').length - 1, 1, `${name}: Tenis`);
    assert.match(part, /<section aria-label="Tenis" data-cat-pills-section/, `${name}: Tenis section`);
    /* Billeteras: the same carousel twice (c.6567232584) -- with Bolsos inside Aria Luxury, and its own carousel next to it. */
    assert.equal(part.split('data-cat-pills="billeteras" data-cat-pills-own').length - 1, 2, `${name}: two Billeteras carousels`);
    assert.equal((part.match(/<section aria-label="Billeteras" data-cat-pills-section/g) || []).length, 2, `${name}: Billeteras sections`);
    assert.ok(part.indexOf('aria-label="Tenis"') > part.indexOf('aria-label="Fútbol"') && part.indexOf('aria-label="Tenis"') < part.indexOf('aria-label="Aria Fight Club"'), name + ": Tenis is not next to Fútbol");
    const lux = part.slice(part.indexOf('aria-label="Aria Luxury"'));
    assert.ok(lux.indexOf('aria-label="Billeteras"') > lux.indexOf('aria-label="Bolsos"') && lux.indexOf('aria-label="Billeteras"') < lux.indexOf('aria-label="Moda de diseñador"'), name + ": Billeteras is not beside Bolsos in Aria Luxury");
    assert.match(part, /data-cat-pills="billeteras" data-cat-pills-own data-cat-pills-theme="light"/);
  }
  assert.ok(index.c.tenis.s.length >= 2 && index.c.tenis.s.some((x) => x[0] === "tennisexpress"), "Tenis pills: " + index.c.tenis.s.map((x) => x[0]));
  assert.equal(index.c.tenis.door, "/departamento.html?dept=tennis");
  const tw = existsSync(ROOT + "assets/tienda/tenniswarehouse/index.json") ? json("assets/tienda/tenniswarehouse/index.json").count : 0;
  assert.equal(index.c.tenis.s.some((x) => x[0] === "tenniswarehouse"), tw >= MIN_CARDS, "Tennis Warehouse pill vs its catalogue (" + tw + ")");
  assert.equal(index.c.billeteras.door, "/departamento.html?dept=purses");
  for (const f of railFiles.filter((f) => f.startsWith("billeteras-"))) for (const p of cardsOf(f)) assert.ok(isWallet({ title: p.title }), `${f}: «${p.title}» is not a wallet`);
  for (const f of railFiles.filter((f) => f.startsWith("tenis-"))) for (const p of cardsOf(f)) assert.doesNotMatch(p.title, /barbie|doll|mahjong/i, f + ": " + p.title);
});

await check("Billeteras: «Todas · Mujer · Hombre · Unisex», no store pills; audience from the data; the «Todas» a mix of stores", () => {
  const e = index.c.billeteras;
  assert.equal(e.a, 1, "Billeteras is not an audience carousel");
  assert.deepEqual(e.s.map((x) => x[0]), ["mujer", "hombre", "unisex"], "Billeteras pills: " + e.s.map((x) => x[0]));
  assert.deepEqual(e.s.map((x) => index.labels[x[0]]), ["Mujer", "Hombre", "Unisex"]);
  const b = byK.billeteras;
  const total = b.storeMembers.reduce((n, m) => n + m.n, 0);
  assert.equal(e.s.reduce((n, x) => n + x[1], 0), total, "a wallet without an audience pill (Unisex must hold the untagged)");
  for (const [a] of e.s) {
    const f = json(`${PILLS_DIR}/billeteras-${a}.json`);
    assert.ok(!f.store && f.aud === a && /^\/departamento\.html\?dept=/.test(f.door), a + ": door " + f.door);
    assert.ok(new Set(f.cards.slice(0, 8).map((p) => p.retailer)).size >= 2 || a === "mujer" && new Set(f.cards.map((p) => p.retailer)).size >= 2, a + ": one store");
    for (const p of f.cards) assert.ok(isWallet({ title: p.title }), `${a}: «${p.title}» is not a wallet`);
  }
  const todas = json(`${PILLS_DIR}/billeteras-todas.json`).cards;
  assert.ok(new Set(todas.slice(0, 10).map((p) => p.retailer)).size >= 5, "Billeteras «Todas» is not a mix");
  assert.ok(!railFiles.some((f) => /^billeteras-(ssense|boxlunch|walmart|miumiu|jwpei)\.json$/.test(f)), "a store pill in Billeteras");
});

await check("men's belts: out of Joyas, into Moda Hombre's «Cinturones» pill", () => {
  const h = json("assets/home/pills/hombre.json");
  assert.ok(h.pills.some((p) => p.k === "cinturones" && p.label === "Cinturones" && p.n >= 8), "no Cinturones pill in Moda Hombre");
  const cards = json("assets/home/pills/hombre-cinturones.json").cards;
  for (const c of cards) { assert.match(c.t, /\bbelts?\b/i, c.t); assert.ok(isMenBelt({ title: c.t, type: c.y || "" }), c.t); }
  assert.ok(!isMenBelt({ title: "Black 2 CM Belt Shoulder Bag" }) && !isMenBelt({ title: "Enamel Belt Ring" }) && !isMenBelt({ title: "Leather Belt Bag" }));
  const type = deptType("joyas_accesorios");
  for (const f of railFiles.filter((f) => f.startsWith("joyas-"))) for (const p of cardsOf(f)) assert.ok(!isBelt({ title: p.title, _type: type.get(p.retailer + "::" + p.title) || "" }), f + ": " + p.title);
});

await check("order inside Todas las Tiendas: Lencería first; Ropa Interior Hombre, then Tallas Plus, last (phone and desktop)", () => {
  const { mobile, desktop } = shopfronts();
  for (const [name, part] of [["phone", mobile], ["desktop", desktop]]) {
    const head = part.indexOf("data-todas-las-tiendas"), end = part.indexOf("<!-- TIENDAS: every store below the categories");
    const block = [...part.matchAll(/<section aria-label="([^"]+)" data-(?:featured-rail|cat-pills-section|pill-shelf|joyas-section)/g)].filter((m) => m.index > head && m.index < end).map((m) => m[1]);
    assert.equal(block[0], "Lencería", name + ": " + block.join(", "));
    assert.deepEqual(block.slice(-2), ["Ropa Interior Hombre", "Tallas Plus"], name + ": " + block.join(", "));
    for (const t of ["Bikinis y Ropas de Baño", "Gym Rat", "Fútbol", "Tenis", "Aria Fight Club", "Hogar y Especialidades"]) assert.ok(block.includes(t), name + ": " + t + " left the block");
  }
});

await check("perfume pills lead with prestige houses (Dior, Chanel, YSL, Prada, Tom Ford...), bargains after", () => {
  for (const aud of ["mujer", "hombre"]) {
    const cards = json(`assets/home/pills/${aud}-perfumes.json`).cards;
    assert.ok(cards.length >= 8);
    for (const c of cards.slice(0, 12)) assert.ok(perfumeHouseRank({ brand: c.b, title: c.t }) >= 0, `${aud}: «${c.b} ${c.t}» opens the pill`);
    assert.ok(perfumeHouseRank({ brand: cards[0].b, title: cards[0].t }) <= 4, `${aud}: the first bottle is ${cards[0].b}`);
    assert.ok(!cards.slice(0, 12).some((c) => /wild musk|white shoulders/i.test(c.t)), aud + ": a bargain bottle up front");
    assert.ok(new Set(cards.slice(0, 8).map((c) => c.b)).size >= 6, aud + ": one house owns the front");
  }
});

await check("the saved default rails are the pill build's own «Todas» (scripts/build-home-shelves.mjs --truth)", () => {
  const specs = defaultRails(built);
  for (const [rail, spec] of Object.entries(specs)) {
    const saved = rail === "joyas" ? joyasShelf : category[rail];
    assert.ok(saved.length >= 12, rail + ": " + saved.length);
    const order = new Map(spec.cards.map((c, i) => [c.retailer + "::" + c.title, i]));
    let last = -1;
    for (const p of saved) {
      const i = order.get(p.retailer + "::" + p.title);
      assert.ok(i !== undefined, `${rail}: «${p.title}» is not in the pill build's «Todas» -- node scripts/build-home-shelves.mjs --truth`);
      assert.ok(i > last, `${rail}: out of the build's order at «${p.title}»`);
      last = i;
    }
  }
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

    /* OFERTAS (Danny's audit): next to «Todas», on-sale items only, in place; with a store pill, that store's sale rail. */
    const saleTitles = (f) => new Set(json(`${PILLS_DIR}/${f}`).cards.map((c) => c.title));
    await pg.waitForSelector(bar + " button[data-hcp-sale]", { timeout: 10000 });
    const second = await pg.$eval(bar, (b) => b.children[1].textContent);
    assert.equal(second, "Ofertas", "«Ofertas» is not next to «Todas»");
    await pg.click(bar + " button[data-hcp-sale]");
    const banoSale = saleTitles("bano-ofertas.json");
    await pg.waitForFunction(([s, t]) => { const c = [...document.querySelector(s).querySelectorAll("[data-cat-pills-card]")]; return c.length >= 8 && c.every((x) => t.includes(decodeURIComponent((x.getAttribute("data-pdp") || "").split("producto=")[1].split("&")[0]))); }, [sel, [...banoSale]], { timeout: 20000 });
    assert.equal(await pg.$eval(bar + " button[data-hcp-sale]", (b) => b.getAttribute("aria-pressed")), "true");
    const saleStore = index.c.bano.s.find((x) => x[2] >= OFERTAS_MIN)[0];
    await pg.click(`${bar} button[data-hcp="${saleStore}"]`);
    const storeSale = saleTitles(`bano-${saleStore}-ofertas.json`);
    await pg.waitForFunction(([s, st, t]) => { const c = [...document.querySelector(s).querySelectorAll("[data-cat-pills-card]")]; return c.length >= 8 && c.every((x) => x.getAttribute("data-cat-pills-card") === st && t.includes(decodeURIComponent(x.getAttribute("data-pdp").split("producto=")[1].split("&")[0]))); }, [sel, saleStore, [...storeSale]], { timeout: 20000 });
    if (process.env.AUDIT_SHOTS) await pg.$eval(sel, (el) => el.closest("section").scrollIntoView({ block: "center" })).then(() => pg.waitForTimeout(400)).then(() => pg.screenshot({ path: process.env.AUDIT_SHOTS + "/audit-ofertas.png" }));
    await pg.click(`${bar} button[data-hcp=""]`);
    await pg.waitForFunction((s) => { const c = [...document.querySelector(s).querySelectorAll("[data-cat-pills-card]")]; return new Set(c.map((x) => x.getAttribute("data-cat-pills-card"))).size >= 2; }, sel, { timeout: 20000 });
    assert.equal(await pg.$eval(bar + " button[data-hcp-sale]", (b) => b.getAttribute("aria-pressed")), "false", "«Todas» did not clear Ofertas");

    /* The new carousels paint at 390px with their pills: Tenis (stores), Billeteras (Mujer, Hombre, Unisex). */
    for (const [k, first] of [["tenis", null], ["billeteras", "Mujer"]]) {
      const rs = `#mobileShopfront [data-cat-pills="${k}"]`;
      await pg.$eval(rs, (el) => el.closest("section").scrollIntoView({ block: "center" }));
      await pg.waitForFunction((s) => document.querySelector(s).querySelectorAll("[data-cat-pills-card]").length >= 8, rs, { timeout: 20000 });
      const labels = await pg.$eval(`#mobileShopfront [data-cat-pills-bar="${k}"]`, (b) => [...b.children].map((x) => x.textContent));
      assert.equal(labels[0], "Todas", k + ": " + labels.join(","));
      assert.ok(labels.length >= 3, k + ": " + labels.join(","));
      if (first) assert.deepEqual(labels.filter((l) => l !== "Todas" && l !== "Ofertas"), ["Mujer", "Hombre", "Unisex"], k + ": " + labels.join(","));
      const w = await pg.$eval(rs, (el) => el.closest("section").getBoundingClientRect().right);
      assert.ok(w <= 391, k + " is wider than the phone");
    }
    await pg.click('#mobileShopfront [data-cat-pills-bar="billeteras"] button[data-hcp="hombre"]');
    await pg.waitForFunction(() => { const r = document.querySelector('#mobileShopfront [data-cat-pills="billeteras"]'); const l = r.lastElementChild; return l && l.hasAttribute("data-cat-pills-more") && l.getAttribute("href") === "/departamento.html?dept=men"; }, null, { timeout: 20000 });

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
