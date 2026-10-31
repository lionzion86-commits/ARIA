/* ==================================================================
   ELECTRÓNICA'S LAYOUT (Order C, #443): the cross-store Ofertas, B&H's
   destacados, Reacondicionados with its disclosure, «Laptops para
   estudiar» (c.6470946695: product price under the $200 import line,
   laptops only), a rail per electronics store, then the named aisles --
   never a store's own English category.

   Also held here: Walmart's "Restored" and a seller's "USED" are
   disclosed like every other condition word.

     node scripts/test/electronica-layout-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conditionOfTitle } from "../lib/condition.js";
import { TECH_AISLE_LABELS } from "../lib/tech-aisle.js";
import { MEDIA_RX } from "../build-department-slices.mjs";
import { loadDept, buildSections, sectionOpts, isStudyLaptop, answer, REFURB_NOTE, STUDY_NOTE, STUDY_LAPTOP_MAX, homeTechPills, HOME_PILL_MIN, phoneSellRank, PHONE_SELL_LINE_USD, PHONE_PROMOTED_SLOT, phoneBrandRank, PHONE_LEAD_BRANDS, PHONE_RANKS, celularesOrder } from "../../netlify/functions/_department-core.js";
import { isAccessoryName } from "../lib/tech-aisle.js";
import { readdirSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const head = JSON.parse(readFileSync(ROOT + "assets/sections/departamento/electronics/head.json", "utf8"));
const dept = loadDept("electronics", [ROOT]);
const sections = buildSections(dept.list, sectionOpts("electronics"));

check("the condition rule: Walmart's Restored and a shouted USED disclose; art and prose do not", () => {
  assert.equal(conditionOfTitle("Restored Dell 3100 11.6 inch HD Chromebook").label, "Reacondicionado");
  /* A plain used title is held off sale, never labelled (c.6526570723). */
  assert.equal(conditionOfTitle("Acer Chromebook 311 C722 4GB 32GB eMMC - Jun 2030 - USED").held, true);
  assert.equal(conditionOfTitle("Restored II by Brittney Schulz Framed Wall Art Print"), null);
  assert.equal(conditionOfTitle("Headphones used by pros"), null);
  assert.equal(conditionOfTitle("USB-C Hub"), null);
  /* A carrier phone is not sold used or refurbished. */
  assert.equal(conditionOfTitle("Restored Apple iPhone 17 - Spectrum Mobile - 256GB Mist Blue"), null);
  assert.equal(conditionOfTitle("Open Box Metro By T-Mobile TCL Flip 4 5G"), null);
});

/* The separation ruling (c.6488544902) puts every refurbished unit in
   Reacondicionados only, so «Laptops para estudiar» holds new machines
   and renders only when they fill a rail (the Aisle Test). */
check("the order: Ofertas, B&H's destacados, Reacondicionados, [Laptops para estudiar], Chromebooks, Consolas, then the stores", () => {
  const t = head.rails.map((r) => r.title);
  const study = sections.some((x) => x.key === "estudio");
  assert.deepEqual(t.slice(0, study ? 6 : 5), ["Ofertas", "Destacados de B&H Photo", "Reacondicionados", ...(study ? ["Laptops para estudiar"] : []), "Chromebooks", "Consolas"]);
  for (const s of ["BrandsMart USA", "Micro Center", "Walmart"]) assert.ok(t.includes(s), s);
  assert.equal(head.rails[2].d, REFURB_NOTE);
  if (study) assert.equal(head.rails[3].d, STUDY_NOTE);
});

check("the aisles are Aria's named aisles: no store's English category is a rail", () => {
  const aisles = new Set(Object.values(TECH_AISLE_LABELS));
  const stores = new Set(["Ofertas", "Destacados de B&H Photo", "Reacondicionados", "Laptops para estudiar", "Chromebooks", "Consolas", "BrandsMart USA", "Micro Center", "Walmart", "Costco"]);
  for (const r of head.rails) assert.ok(aisles.has(r.title) || stores.has(r.title), `rail "${r.title}"`);
  /* Every NEW product sits in exactly one aisle; the refurbished ones in Reacondicionados. */
  const refurb = head.rails.find((r) => r.title === "Reacondicionados").count;
  assert.equal(head.rails.reduce((n, r) => n + (aisles.has(r.title) ? r.count : 0), 0) + refurb, head.count, "every product sits in exactly one aisle");
});

check("Laptops para estudiar: new laptops only, product price under $200; absent when too few", () => {
  const s = sections.find((x) => x.key === "estudio");
  const newStudy = dept.list.filter((p) => isStudyLaptop(p) && !conditionOfTitle(p.title));
  if (newStudy.length < 6) assert.ok(!s, "fewer than 6 new: no rail");
  else assert.equal(s.items.length, newStudy.length);
  for (const p of (s ? s.items : newStudy)) {
    assert.ok(p.rawPrice < STUDY_LAPTOP_MAX, `${p.title}: $${p.rawPrice}`);
    assert.match(p.title, /\b(laptops?|notebooks?|chromebooks?|macbook)\b/i);
    assert.doesNotMatch(p.title, /\b(tablets?|ipad|trays?|desks?|drones?|bags?|cases?|sleeves?|toys?)\b/i, p.title);
    assert.ok(!conditionOfTitle(p.title), `${p.title}: a refurbished unit outside Reacondicionados`);
  }
  assert.equal(isStudyLaptop({ title: "Fordable Laptop Desk Tray w/ USB Ports", rawPrice: 14.99, type: "tech_computadoras" }), false);
  assert.equal(isStudyLaptop({ title: "Acer Chromebook 315 15.6\" Intel N50 8GB RAM 128GB", rawPrice: 200, type: "tech_computadoras" }), false, "$200 is not under $200");
});

check("every refurbished, used or open-box card carries its label", () => {
  const s = sections.find((x) => x.key === "reacondicionados");
  for (const p of s.items) assert.ok(conditionOfTitle(p.title), p.title);
  for (const c of head.rails[2].cards) assert.ok(c.k, c.t);
  for (const p of dept.list) if (/^\s*(restored|pre-?owned)\b/i.test(p.title)) assert.ok(conditionOfTitle(p.title), p.title);
});

check("one store chosen: no store rail repeats the whole list; the endpoint agrees with the slices", () => {
  const a = answer({ dept: "electronics" }, [ROOT]).body;
  assert.deepEqual(a.rails.map((r) => r.title), head.rails.map((r) => r.title));
  const one = answer({ dept: "electronics", r: "brandsmart" }, [ROOT]).body;
  assert.ok(!one.rails.some((r) => r.title === "BrandsMart USA" || /^Destacados de/.test(r.title)));
});

check("music and films are not electronics; a Blu-ray player is", () => {
  for (const p of dept.list) assert.doesNotMatch(p.title, /\b(the very best of|greatest hits|soundtrack)\b|\[(dvd|blu-?ray|cd)\]/i, p.title);
  assert.ok(!MEDIA_RX.test("Sony 4K Blu-ray Player"));
  assert.ok(MEDIA_RX.test("Pre-Owned Country Roads: The Very Best Of John Denver"));
});

check("the homepage Electrónica carousel: Ofertas, then Danny's four types, every pill filled, devices first", () => {
  const DIR = ROOT + "assets/sections/departamento/electronics/";
  const head = JSON.parse(readFileSync(DIR + "home.json", "utf8"));
  const home = { v: 1, pills: head.pills.map((p, i) => ({ k: p.k, label: p.label, cards: i ? JSON.parse(readFileSync(DIR + `home-${p.k}.json`, "utf8")).cards : head.cards })) };
  head.pills.forEach((p, i) => assert.equal(p.n, home.pills[i].cards.length, p.label));
  const keys = home.pills.map((p) => p.k);
  /* Danny's row: Ofertas, Reacondicionados second (c.6488547834), then
     the types, Chromebooks and Consolas among them (c.6488256694, c.6487219343). */
  assert.deepEqual(keys.slice(0, 8), ["ofertas", "reacondicionados", "tech_celulares", "tech_computadoras", "chromebooks", "consolas", "tech_gaming", "tech_audifonos"]);
  assert.deepEqual(home.pills.map((p) => p.label).slice(0, 8), ["Ofertas", "Reacondicionados", "Celulares", "Computadoras", "Chromebooks", "Consolas", "Videojuegos", "Audífonos"]);
  for (const p of home.pills) {
    assert.ok(p.cards.length >= HOME_PILL_MIN, `${p.label}: ${p.cards.length}`);
    for (const c of p.cards) assert.ok(c.i && c.p > 0, `${p.label}: ${c.t}`);
    if (p.k === "ofertas") for (const c of p.cards) assert.ok(c.s > 0, `Ofertas: ${c.t} is not on sale`);
    if (p.k !== "tech_accesorios") for (const c of p.cards.slice(0, 3)) assert.ok(!isAccessoryName(c.t), `${p.label} leads with an accessory: ${c.t}`);
    assert.equal(new Set(p.cards.map((c) => c.r + c.t)).size, p.cards.length, `${p.label}: a card twice`);
  }
  const fresh = homeTechPills(dept.list.map((p) => ({ ...p, image: p.image })));
  assert.deepEqual(home, JSON.parse(JSON.stringify({ v: 1, pills: fresh.pills.map((p) => ({ k: p.k, label: p.label, cards: p.cards })) })), "home.json is stale: run build-department-slices");
});

check("Celulares, sellable first: phones under the US$200 line lead, the iPhone 18 promoted, the other flagships last", () => {
  /* Danny's rulings (#443 c.6531245142, c.6535121937) supersede the
     Peru-presence order for display: what a Peruvian wallet buys leads;
     THE iPhone Aria promotes is the 18; other new flagships go last. */
  const rank = (t, price, b = "") => phoneSellRank({ title: t, brand: b, rawPrice: price });
  assert.equal(PHONE_SELL_LINE_USD, 200);
  assert.equal(rank("BLU G35 6.5\u201d Infinity Display 32GB", 69.99, "BLU"), 0);
  assert.equal(rank('6.67" moto E15 64GB Storage 6GB RAM Unlocked', 99.99), 0);
  assert.equal(rank("Samsung Galaxy A15 5G 128GB Factory Unlocked", 157.67), 0);
  assert.equal(rank("iPhone 18 Pro 256GB in Silver", 1199), 1, "the promoted iPhone");
  assert.equal(rank('6.3" Pixel 9a 256GB 5G Android Obsidian', 499.99), 2, "the mid range");
  assert.equal(rank('6.3" iPhone 17 Pro 256GB Sim-Free Silver', 1099), 3, "another new flagship: last");
  assert.equal(rank("Samsung Galaxy S25 Ultra 512GB", 1299, "Samsung"), 3);
  /* A refurbished phone is exempt from the flagship tier. */
  assert.equal(rank("Apple iPhone 13 Pro Max 128GB - Reacondicionado", 549.99), 2);

  const cards = JSON.parse(readFileSync(ROOT + "assets/sections/departamento/electronics/home-tech_celulares.json", "utf8")).cards;
  const names = cards.map((c) => c.t.slice(0, 28)).join(" | ");
  /* The first screen: accessible phones open it, the iPhone 18 Pro and Pro Max right behind. */
  for (const c of cards.slice(0, PHONE_PROMOTED_SLOT)) assert.ok(c.p <= PHONE_SELL_LINE_USD, "an accessible phone opens Celulares: " + names);
  const promoted = cards.slice(PHONE_PROMOTED_SLOT, PHONE_PROMOTED_SLOT + 2).map((c) => c.t);
  assert.ok(promoted.length === 2 && promoted.every((t) => /iphone\s*18/i.test(t)), "the iPhone 18 is promoted: " + names);
  const rest = cards.filter((c) => !/iphone\s*18/i.test(c.t)).map((c) => phoneSellRank({ title: c.t, brand: c.b, rawPrice: c.p }));
  assert.deepEqual(rest, [...rest].sort((a, b) => a - b), "the lens never steps back a tier: " + names);
  assert.ok(!rest.includes(3), "no non-18 flagship reaches the 24 cards the pill draws");
  /* The aisle rail of departamento.html carries the same order. */
  const aisle = sections.find((x) => x.key === "pasillo:tech_celulares");
  assert.ok(aisle && aisle.items.length > 8, "the Celulares aisle");
  assert.equal(celularesOrder(aisle.items).map((p) => p.title).join("|"), aisle.items.map((p) => p.title).join("|"), "already ordered");
  assert.ok(aisle.items.slice(PHONE_PROMOTED_SLOT, PHONE_PROMOTED_SLOT + 2).every((p) => /iphone\s*18/i.test(p.title)), "the aisle promotes the 18 too");
  /* What merely pairs with a phone never reaches the lens. */
  for (const c of cards) assert.doesNotMatch(c.t, /\b(marine|gimbal|grip)\b/i, c.t);
});

check("the homepage order (Danny's live pass, c.6507225989): Ofertas, Tiendas, Key Club, Auto, Motos, Walmart (BrandsMart off the homepage, c.6539449309), Compra por categoría, Mujer, Hombre, Niños, the store rails led by Victoria's Secret, then Electrónica", () => {
  const html = readFileSync(ROOT + "index.html", "utf8");
  const top = ['<section aria-label="Ofertas"', '<section aria-label="Tiendas"', '<section aria-label="Aria Key Club"', '<div id="mobileShopfront"'].map((s) => html.indexOf(s));
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1] > 0 && top[i - 1] < top[i], `the top of the page is out of order at #${i}`);
  for (const id of ["mobileShopfront", "desktopShopfront"]) {
    const from = html.indexOf(`<div id="${id}"`);
    const at = (label) => html.indexOf(`<section aria-label="${label}"`, from);
    const seq = ["Aria Auto", "Aria Motos", "Walmart", "Compra por categoría", "Mujer", "Hombre", "Niños", "Victoria's Secret", "Electrónica"].map(at);
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i - 1] > from && seq[i - 1] < seq[i], `${id}: out of order at #${i}`);
    assert.ok(html.indexOf('data-store-rail="', from) === html.indexOf('data-store-rail="victoriassecret"', from), `${id}: a store rail ahead of VS`);
  }
});

check("the homepage shelves: Mujer, Hombre, Niños, and Electrónica down with the stores (c.6495088261); pills above each carousel; a lens that hides nothing", () => {
  const html = readFileSync(ROOT + "index.html", "utf8");
  const shelves = [...html.matchAll(/<section aria-label="([^"]+)" data-pill-shelf="([a-z]+)"[^>]*>([\s\S]*?)<\/section>/g)];
  assert.deepEqual(shelves.map((m) => m[2]), ["mujer", "hombre", "ninos", "tech", "mujer", "hombre", "ninos", "tech"], "phone and desktop");
  for (const m of shelves) {
    assert.ok(m[3].indexOf("data-pill-row") > 0 && m[3].indexOf("data-pill-row") < m[3].indexOf("data-pill-rail"), `${m[2]}: the pill row sits above the carousel`);
    assert.match(m[0], / hidden /, `${m[2]}: hidden until it fills`);
  }
  const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");
  const fn = bundle.slice(bundle.indexOf("function setPillShelf"), bundle.indexOf("function openPillShelfProduct"));
  assert.ok(fn.length > 0 && !/\.hidden|display|remove\(/.test(fn.replace(/\/\*[\s\S]*?\*\//g, "")), "a pill changes only its own carousel");
  assert.match(bundle, /const PILL_SHELF_MIN = 8;/);
  for (const aud of ["mujer", "hombre", "ninos"]) {
    const head = JSON.parse(readFileSync(ROOT + `assets/home/pills/${aud}.json`, "utf8"));
    assert.ok(head.pills.length >= 3, aud);
    head.pills.forEach((p, i) => {
      const cards = i ? JSON.parse(readFileSync(ROOT + `assets/home/pills/${aud}-${p.k}.json`, "utf8")).cards : head.cards;
      assert.ok(cards.length >= 8 && cards.length === p.n, `${aud}/${p.label}`);
      for (const c of cards) assert.ok(c.i && c.p > 0, `${aud}/${p.label}: ${c.t}`);
    });
  }
  /* Danny's scoped types (c.6483623203); Electrónica is never an audience pill. */
  const labels = (a) => JSON.parse(readFileSync(ROOT + `assets/home/pills/${a}.json`, "utf8")).pills.map((p) => p.label);
  for (const l of ["Zapatos", "Perfumes", "Maquillaje", "Cabello"]) assert.ok(labels("mujer").includes(l), "Mujer: " + l);
  for (const l of ["Ropa", "Zapatos", "Zapatillas", "Relojes"]) assert.ok(labels("hombre").includes(l), "Hombre: " + l);
  for (const l of ["Deportes", "Juguetes", "Ropa"]) assert.ok(labels("ninos").includes(l), "Niños: " + l);
  for (const a of ["mujer", "hombre", "ninos"]) assert.ok(!labels(a).some((l) => /electr|celular|computadora/i.test(l)), a);
});

check("the page draws the disclosure under the rail title", () => {
  const html = readFileSync(ROOT + "departamento.html", "utf8");
  assert.match(html, /r\.d \? '<p class="rail-note">' \+ esc\(r\.d\) \+ '<\/p>'/);
  assert.match(html, /\.rail-note\{/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
