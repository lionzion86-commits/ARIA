#!/usr/bin/env node
/* ==================================================================
   THE DAILY SEARCH WATCH, AS THE SHOPPER SEES IT (#443 c.6632585468).

   The watch on production (2026-11-04, after #646) scored 18 / 12. Every
   one of the twelve failures passed the suites of its day, because the
   suites asked the search endpoint's own answer (search.html's lanes)
   and the shopper never sees that answer first: the home search box
   asks the router (/search?route=1) and OPENS THE PAGE it names -- a
   department's type landing (departamento.html ?ver= ... ), a store's
   page with its search (tienda.html ?q=), a brand's page. This suite
   follows each query the way the box does and reads that page's first
   screen: its first twelve cards, in the order the page draws them (the
   lead rail, then the next).

     toallas                Disney costumes ("toallas" respelled "talla")
     victoria secret sales  0 results (tienda.html?q=sale: no title says "sale")
     pesas                  heavyweight tees, diving weight belts
     plancha                keratin sprays
     monitor                Accesorios y energía, a soundbar leading
     zapatilla              sandals and cleats leading
     keratina / alisado     a body peel and non-keratin hair products
     camara                 an RGB light bar
     vajilla                napkins, runners, glasses
     laptop                 tablets
     consola                the PlayStation Portal and VR headsets

   Each check below reads the cards with its OWN words (not the rule the
   code uses), so a rule that drifts fails here. A type the catalogue
   does not carry must answer honestly -- no cards, and the page says so
   -- and the check says which it found.

     node scripts/test/search-daily-watch-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const search = await import("../../netlify/functions/search.js");
const dept = await import("../../netlify/functions/_department-core.js");
const tienda = await import("../../netlify/functions/_tienda-core.js");
const core = await import("../../netlify/functions/_search-core.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
const call = async (qs) => JSON.parse((await search.handler({ httpMethod: "GET", queryStringParameters: qs }, { fetchImpl })).body);
const param = (url, k) => new URLSearchParams(String(url || "").split("?")[1] || "").get(k);
const FIRST = 12;

/* The page the home search box opens for q, and its first twelve cards
   (title, brand, on sale) in the order the page draws them. */
async function landing(q) {
  const d = (await call({ q, route: "1" })).destination;
  const url = d.url || "";
  const out = { d, url, cards: [], count: null, head: null };
  if (d.kind === "category") {
    const qs = { dept: param(url, "dept") };
    for (const k of ["q", "ver", "pt", "t", "a"]) if (param(url, k)) qs[k] = param(url, k);
    const head = dept.answer(qs);
    assert.equal(head.status, 200, `${q}: ${url} has no page`);
    out.head = head.body;
    out.count = head.body.count;
    for (const r of head.body.rails || []) {
      const pg = dept.answer({ ...qs, rail: String(r.i), page: "0" });
      if (pg.status === 200) out.cards.push(...pg.body.cards.slice(0, 12).map((c) => ({ title: c.t, brand: c.b || "", sale: Number(c.o) > Number(c.p) })));
      if (out.cards.length >= FIRST) break;
    }
  } else if (d.kind === "store") {
    /* tienda.html: the search box filled from ?q=, the discount order. */
    const r = tienda.answer({ store: d.key, q: param(url, "q") || "", group: "1", sort: "discount" });
    out.count = r.body.total;
    for (const g of r.body.groups || []) out.cards.push(...g.items.map((c) => ({ title: c.name, brand: c.brand || "", sale: Number(c.was) > Number(c.price) })));
  }
  out.cards = out.cards.slice(0, FIRST);
  return out;
}
const list = (cards) => cards.map((c) => c.title).join(" | ");
/* Every first-screen card is the type (want) and none is a lookalike (bad). */
function pure(L, want, bad, min = FIRST) {
  assert.ok(L.cards.length >= Math.min(min, FIRST), `only ${L.cards.length} cards on ${L.url}`);
  const off = L.cards.filter((c) => !want.test(c.title) || (bad && bad.test(c.title)));
  assert.deepEqual(off.map((c) => c.title), [], `off-type in the first ${FIRST} of ${L.url}`);
}

/* 1. toallas */
await check("«toallas» opens the towels: every one of the first 12 is a towel, no costume", async () => {
  for (const q of ["toallas", "toalla", "Toallas"]) {
    const L = await landing(q);
    assert.equal(L.d.kind, "category", `${q}: lands on ${L.d.kind}:${L.d.key} (${L.url})`);
    pure(L, /\b(towels?|washcloths?|wash cloths?)\b/i, /\b(costume|disfraz|doll|mu[nñ]eca|talla|bar|rack|hook|holder|poncho|robe)\b/i);
  }
});

/* 2. victoria secret sales */
await check("«victoria secret sales» opens Victoria's Secret on sale: 12+ markdowns, every card the store's own", async () => {
  for (const q of ["victoria secret sales", "victoria secret sale", "victorias secret sale", "victoria's secret ofertas"]) {
    const L = await landing(q);
    assert.equal(L.d.kind, "store", `${q}: ${L.d.kind}:${L.d.key}`);
    assert.equal(L.d.key, "victoriassecret", q);
    assert.ok(L.count >= 12, `${q}: ${L.url} shows ${L.count} products`);
    assert.equal(L.cards.length, FIRST, q);
    assert.ok(L.cards.every((c) => c.sale), `${q}: a full-price card among the first 12: ${list(L.cards.filter((c) => !c.sale))}`);
  }
  /* The store page's own search box, the same rule. */
  const r = tienda.answer({ store: "victoriassecret", q: "sale" });
  assert.ok(r.body.total >= 12 && r.body.items.every((c) => Number(c.was) > Number(c.price)), "tienda q=sale");
});

/* 3. pesas */
await check("«pesas» is gym weights or an honest none -- never heavyweight tees or diving belts", async () => {
  const GYM = /\b(dumbbells?|kettle ?bells?|barbells?|weight plates?|bumper plates?|hand weights?|ankle weights?|weight sets?)\b/i;
  const stocked = core.loadSearch().products.filter((p) => p.image && core.isWeight(p) && !/\b(sweatpants|hoodies?|tees?|t-?shirts?|shorts|joggers?)\b/i.test(p.title));
  for (const q of ["pesas", "mancuernas", "pesa"]) {
    const L = await landing(q);
    assert.equal(L.d.kind, "category", q);
    if (!stocked.length) {
      /* The catalogue sells no gym weight today (2026-11-04: its barbell and
         plate words are apparel prints, dinner plates and license plates). */
      assert.equal(L.count, 0, `${q}: ${L.url} shows ${L.count} cards with no gym weight in stock: ${list(L.cards)}`);
      assert.ok(L.head && L.head.pt === "pesas" && L.head.ptl, `${q}: the page cannot say what it does not carry`);
    } else pure(L, GYM, /\b(heavyweight|belts?|dive|diving|tees?|shirts?|hoodies?)\b/i, 1);
  }
});

/* 4. plancha */
await check("«plancha» opens irons (hair or clothes), never a keratin spray or a no-iron shirt", async () => {
  for (const q of ["plancha", "planchas", "plancha de pelo", "plancha para cabello"]) {
    const L = await landing(q);
    assert.equal(L.d.kind, "category", q);
    pure(L, /\b(flat irons?|straighteners?|airstrait|steam irons?|clothes irons?|garment steamers?)\b/i, /\b(spray|keratin treatment|serum|balm|shampoo|no-?iron|cream|protector)\b/i, 1);
  }
});

/* 5. monitor */
await check("«monitor» opens monitors: no soundbar, no mount, no blood-pressure or baby monitor", async () => {
  for (const q of ["monitor", "monitores", "monitor gamer"]) {
    const L = await landing(q);
    assert.equal(L.d.kind, "category", q);
    assert.ok(!/tech_accesorios/.test(L.url), `${q}: still the Accesorios aisle (${L.url})`);
    pure(L, /\bmonitors?\b/i, /\b(sound ?bar|speakers? with|ball head|hdmi cable|blood pressure|heart rate|baby|headphones|(wall|desk) (mount|stand|arm)|for (desktop )?monitor)\b/i);
  }
});

/* 6. zapatilla */
await check("«zapatilla» opens sneakers: no sandal, slide, cleat, boot or tee leads", async () => {
  const SHOE = /\b(sneakers?|trainers?|shoes?|runners?|zapatillas?)\b/i;
  for (const q of ["zapatilla", "zapatillas", "sneakers"]) {
    const L = await landing(q);
    assert.equal(L.d.kind, "category", q);
    assert.equal(L.d.key, "shoes", q);
    const off = L.cards.filter((c) => /\b(sandals?|slides?|cleats?|boots?|heels?|flip ?flops?|tees?|t-?shirt|liners?|socks?)\b/i.test(c.title));
    assert.deepEqual(off.map((c) => c.title), [], `${q}: not a sneaker`);
    /* A sneaker's title names it, or names the shoe the store files as one. */
    const named = L.cards.filter((c) => SHOE.test(c.title)).length;
    assert.ok(L.cards.length === FIRST && named >= 8, `${q}: ${named}/12 name a sneaker or shoe: ${list(L.cards)}`);
  }
});

/* 7. keratina */
await check("«keratina» opens hair keratin only: every card says keratin, no body peel or skin", async () => {
  for (const q of ["keratina", "keratin", "queratina"]) {
    const L = await landing(q);
    pure(L, /\bkeratin|keratina|queratina/i, /\b(body|skin|peel|kojic|nails?|lash|apron|comb)\b/i);
  }
});

/* 8. alisado */
await check("«alisado» opens hair straightening only: no body peel, no ingrown-hair or skin smoother", async () => {
  for (const q of ["alisado", "alisados", "alisado brasilero"]) {
    const L = await landing(q);
    pure(L, /\b(straighten\w*|smoothing|alisad\w*|relaxer|brazilian blowout|keratin treatment|lisse)\b/i, /\b(body|skin|peel|ingrown|bikini|razor|shave|face|facial)\b/i);
  }
});

/* 9. camara */
await check("«cámara» opens cameras only: no light bar, ring light, tripod, bag or tablet", async () => {
  for (const q of ["camara", "cámara", "camaras"]) {
    const L = await landing(q);
    pure(L, /\b(cameras?|cam|camcorders?|webcams?|dash ?cams?|gopro|mirrorless|dslr)\b/i, /\b(light ?bar|ring light|lights?|tripod|bag|case|strap|battery|tablet|vr|goggles|drone)\b/i);
  }
});

/* 10. vajilla */
await check("«vajilla» opens dinnerware: plates, bowls and sets -- no napkin, runner, placemat or glass", async () => {
  for (const q of ["vajilla", "vajillas", "juego de vajilla"]) {
    const L = await landing(q);
    pure(L, /\b(dinnerware|plates?|bowls?|place settings?)\b/i, /\b(napkins?|runners?|placemats?|glass(es)?|mugs?|cups?|flatware|tumblers?)\b/i);
  }
  /* Vajilla is the set: every first-screen card is sold as a set (dinnerware, a place setting, plates or bowls by the set). */
  const L = await landing("vajilla");
  const loose = L.cards.filter((c) => !/\b(dinnerware|place settings?|sets?|set of \d+|\d+[- ]?(piece|pc))\b/i.test(c.title));
  assert.deepEqual(loose.map((c) => c.title), [], "a single piece among the first 12");
});

/* 11. laptop */
await check("«laptop» opens laptops only: no tablet, no Chromebook, no headset or stand", async () => {
  for (const q of ["laptop", "laptops", "notebook", "lapto"]) {
    const L = await landing(q);
    pure(L, /\b(laptops?|notebooks?|macbook)\b/i, /\b(tablets?|ipad|chromebooks?|headsets?|headphones|stand|sleeve|bag|case|tray|mouse|keyboard|hub)\b/i);
  }
});

/* 12. consola */
await check("«consola» opens consoles (PS5, Xbox, Switch, the handhelds): no Portal, no VR headset, no game", async () => {
  for (const q of ["consola", "consolas", "consola de videojuegos"]) {
    const L = await landing(q);
    pure(L, /\b(playstation\s*5|ps5|xbox series|nintendo switch|switch\s*2|steam deck|rog ally|legion go)\b/i, /\b(portal|remote player|quest|vr|headset|controller)\b/i, 1);
  }
  /* What the catalogue has, said: the report names a missing class. */
  const L = await landing("consola");
  const has = (rx) => L.count && L.cards.some((c) => rx.test(c.title));
  console.log(`         consoles in stock: ${L.count} -- PS5 ${has(/ps5|playstation\s*5/i) ? "yes" : "none"}, Xbox ${has(/xbox/i) ? "yes" : "none"}, Switch ${has(/switch/i) ? "yes" : "none"}`);
});

/* The search's own answer agrees (search.html, the «Producto» door): the
   type layer answers each word with the same type. */
await check("the search answer agrees: each word's first 12 on search.html are its type", async () => {
  const bad = [];
  for (const [q, rx] of [["toallas", /\b(towels?|washcloths?)\b/i], ["monitor", /\bmonitors?\b/i], ["laptop", /\b(laptops?|notebooks?|macbook)\b/i],
    ["consola", /\b(ps5|playstation\s*5|xbox|switch|steam deck|rog ally|legion go)\b/i], ["vajilla", /\b(dinnerware|plates?|bowls?|place settings?)\b/i],
    ["camara", /\b(cameras?|cam|camcorders?|webcams?)\b/i], ["keratina", /keratin/i], ["alisado", /\b(straighten\w*|smoothing|alisad\w*|relaxer|blowout|keratin treatment|lisse)\b/i]]) {
    const r = core.searchPage(core.loadSearch(), q, 1, { pageSize: FIRST });
    const off = (r.items || []).filter((c) => !rx.test(c.title));
    if (!r.items || !r.items.length) bad.push(`${q}: nothing`);
    else if (off.length) bad.push(`${q}: ${off.map((c) => c.title).slice(0, 3).join(" | ")}`);
  }
  assert.deepEqual(bad, []);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
