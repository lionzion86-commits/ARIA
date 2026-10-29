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
import { loadDept, buildSections, sectionOpts, isStudyLaptop, answer, REFURB_NOTE, STUDY_NOTE, STUDY_LAPTOP_MAX } from "../../netlify/functions/_department-core.js";

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

check("the page draws the disclosure under the rail title", () => {
  const html = readFileSync(ROOT + "departamento.html", "utf8");
  assert.match(html, /r\.d \? '<p class="rail-note">' \+ esc\(r\.d\) \+ '<\/p>'/);
  assert.match(html, /\.rail-note\{/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
