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
import { loadDept, buildSections, sectionOpts, isStudyLaptop, answer, REFURB_NOTE, STUDY_NOTE, STUDY_LAPTOP_MAX, homeTechPills, HOME_PILL_MIN } from "../../netlify/functions/_department-core.js";
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
  assert.equal(conditionOfTitle("Acer Chromebook 311 C722 4GB 32GB eMMC - Jun 2030 - USED").label, "Usado");
  assert.equal(conditionOfTitle("Restored II by Brittney Schulz Framed Wall Art Print"), null);
  assert.equal(conditionOfTitle("Headphones used by pros"), null);
  assert.equal(conditionOfTitle("USB-C Hub"), null);
  /* A carrier phone is not sold used or refurbished. */
  assert.equal(conditionOfTitle("Restored Apple iPhone 17 - Spectrum Mobile - 256GB Mist Blue"), null);
  assert.equal(conditionOfTitle("Open Box Metro By T-Mobile TCL Flip 4 5G"), null);
});

check("the order: Ofertas, B&H's destacados, Reacondicionados, Laptops para estudiar, then the stores", () => {
  const t = head.rails.map((r) => r.title);
  assert.deepEqual(t.slice(0, 4), ["Ofertas", "Destacados de B&H Photo", "Reacondicionados", "Laptops para estudiar"]);
  for (const s of ["BrandsMart USA", "Micro Center", "Walmart"]) assert.ok(t.includes(s), s);
  assert.equal(head.rails[2].d, REFURB_NOTE);
  assert.equal(head.rails[3].d, STUDY_NOTE);
});

check("the aisles are Aria's named aisles: no store's English category is a rail", () => {
  const aisles = new Set(Object.values(TECH_AISLE_LABELS));
  const stores = new Set(["Ofertas", "Destacados de B&H Photo", "Reacondicionados", "Laptops para estudiar", "BrandsMart USA", "Micro Center", "Walmart", "Costco"]);
  for (const r of head.rails) assert.ok(aisles.has(r.title) || stores.has(r.title), `rail "${r.title}"`);
  assert.equal(head.rails.reduce((n, r) => n + (aisles.has(r.title) ? r.count : 0), 0), head.count, "every product sits in exactly one aisle");
});

check("Laptops para estudiar: laptops only, product price under $200, new machines first", () => {
  const s = sections.find((x) => x.key === "estudio");
  assert.ok(s && s.items.length >= 6);
  let seenUsed = false;
  for (const p of s.items) {
    assert.ok(p.rawPrice < STUDY_LAPTOP_MAX, `${p.title}: $${p.rawPrice}`);
    assert.match(p.title, /\b(laptops?|notebooks?|chromebooks?|macbook)\b/i);
    assert.doesNotMatch(p.title, /\b(tablets?|ipad|trays?|desks?|drones?|bags?|cases?|sleeves?|toys?)\b/i, p.title);
    const used = Boolean(conditionOfTitle(p.title));
    assert.ok(!(seenUsed && !used), `${p.title}: a new laptop after a used one`);
    seenUsed = seenUsed || used;
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
  assert.deepEqual(keys.slice(0, 5), ["ofertas", "tech_celulares", "tech_computadoras", "tech_gaming", "tech_audifonos"]);
  assert.deepEqual(home.pills.map((p) => p.label).slice(0, 5), ["Ofertas", "Celulares", "Computadoras", "Videojuegos", "Audífonos"]);
  for (const p of home.pills) {
    assert.ok(p.cards.length >= HOME_PILL_MIN, `${p.label}: ${p.cards.length}`);
    for (const c of p.cards) assert.ok(c.i && c.p > 0, `${p.label}: ${c.t}`);
    if (p.k === "ofertas") for (const c of p.cards) assert.ok(c.s > 0, `Ofertas: ${c.t} is not on sale`);
    if (p.k !== "tech_accesorios") for (const c of p.cards.slice(0, 3)) assert.ok(!isAccessoryName(c.t), `${p.label} leads with an accessory: ${c.t}`);
    assert.equal(new Set(p.cards.map((c) => c.r + c.t)).size, p.cards.length, `${p.label}: a card twice`);
  }
  assert.deepEqual(home, JSON.parse(JSON.stringify(homeTechPills(dept.list.map((p) => ({ ...p, image: p.image })))) ), "home.json is stale: run build-department-slices");
});

check("the homepage shelves: Electrónica, then Mujer, Hombre, Niños; pills above each carousel; a lens that hides nothing", () => {
  const html = readFileSync(ROOT + "index.html", "utf8");
  const shelves = [...html.matchAll(/<section aria-label="([^"]+)" data-pill-shelf="([a-z]+)"[^>]*>([\s\S]*?)<\/section>/g)];
  assert.deepEqual(shelves.map((m) => m[2]), ["tech", "mujer", "hombre", "ninos", "tech", "mujer", "hombre", "ninos"], "phone and desktop");
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
