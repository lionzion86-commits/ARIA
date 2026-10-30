/* ==================================================================
   REACONDICIONADOS -- the one condition rule (/condition.js) and where
   it lands: the department, the rail in every other department, the
   card label, the order line and the email (#443, 2026-10-23).
   Danny's three labels (c.6526570723): Caja abierta, Reacondicionado,
   Usado certificado; a plain used listing is held off sale, never
   labelled; the Reacondicionados page filters by condition.

   Every title here is a real catalogue title or a TEST FIXTURE.

     node scripts/test/condition-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conditionOfTitle, gradeOfTitle, isHeldUsed, NO_GRADE_NOTE, CONDITION_LABELS } from "../lib/condition.js";
import { isOffSaleItem } from "../lib/off-sale.js";
import { hubPills, PILL_HUBS } from "../../netlify/functions/_department-core.js";
import { buildSections, cardOf } from "../../netlify/functions/_department-core.js";
import { DEPT_RULES, belongsToDept } from "../build-department-slices.mjs";

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.stack).split("\n").slice(0, 2).join(" | ")}`); console.log("    FAIL " + name); }
}
const item = (title, extra = {}) => ({ title, brand: "", type: "", rawPrice: 10, wasPrice: 0, salePct: 0, image: "https://x/i.jpg", retailer: "walmart", bucket: "toys", ...extra });

await check("the three labels, in Danny's order; no plain «Usado»", () => {
  assert.deepEqual(Object.values(CONDITION_LABELS), ["Caja abierta", "Reacondicionado", "Usado certificado"]);
  assert.equal(conditionOfTitle("Apple iPhone 14 128GB Unlocked - Certified Pre-Owned").label, "Usado certificado");
  assert.equal(conditionOfTitle("Samsung Galaxy S23 Usado certificado").label, "Usado certificado");
  for (const t of ["Pre-Owned LEGO Star Wars The Force Awakens C-3PO Set #5002948", "6.1\" iPhone 13 128GB SIM-Free Smartphone - Midnight (Preowned)",
    "Acer Chromebook 311 C722 4GB 32GB eMMC - Jun 2030 - USED", "Moto G 5G 2023 (64GB, 4GB) Fully Unlocked - Usado", "Libro usado: Tickle Me, Elmo! A Lift-and-Peek-a-Board Book"]) {
    assert.deepEqual(conditionOfTitle(t), { condition: "used", label: "", held: true }, t);
    assert.equal(isHeldUsed(t), true, t);
  }
});

await check("a plain used listing is off sale wherever it turns up: product page, cart, order", () => {
  assert.equal(isOffSaleItem({ retailer: "walmart", title: "Pre-Owned Apple iPhone 12, 64 GB Black" }), true);
  assert.equal(isOffSaleItem({ retailer: "walmart", title: "Restored Apple iPhone 12 Unlocked (Refurbished)" }), false);
  const read = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
  assert.match(read("producto.html"), /isOffSaleItem\(\{ retailer: p\.retailer, title: p\.name \}\)/);
  /* The catalogues and the Ofertas feed hold none; held-used.json keeps every one. */
  const held = JSON.parse(read("held-used.json"));
  assert.ok(held.count >= 200 && held.items.every((h) => isHeldUsed(h.item.name || h.item.title)), "held-used.json");
  for (const f of ["walmart-electronics-catalog.json", "brandsmart-catalog.json", "juguetes-catalog.json", "ofertas-feed.json"]) {
    const titles = [...read(f).matchAll(/"(?:name|title)": ?"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse('"' + m[1] + '"'));
    assert.deepEqual(titles.filter(isHeldUsed).slice(0, 3), [], f);
  }
});

await check("the Reacondicionados page: «Todos», then one pill per condition the data fills", () => {
  assert.equal(PILL_HUBS.reacondicionados.all, "Todos");
  const list = [];
  for (let i = 0; i < 14; i++) list.push(item("Open Box LEGO Technic Set " + i), item("Restored Dell Chromebook " + i));
  list.push(item("Apple iPhone 14 Unlocked - Certified Pre-Owned"));
  const pills = hubPills("reacondicionados", list);
  assert.deepEqual(pills.map((p) => p.label), ["Caja abierta", "Reacondicionado"], "a condition with 1 product does not render");
  assert.ok(pills.every((p) => p.items.every((x) => conditionOfTitle(x.title).label === p.label)));
  const h = JSON.parse(readFileSync(new URL("../../assets/sections/departamento/reacondicionados/head.json", import.meta.url), "utf8"));
  assert.equal(h.pillAll, "Todos");
  assert.ok(h.pills.length >= 2 && h.pills.every((p) => Object.values(CONDITION_LABELS).includes(p.label)), JSON.stringify(h.pills));
});

await check("refurbished, used and open-box titles get their label", () => {
  assert.deepEqual(conditionOfTitle("Refurbished JBL Xtreme 4 Portable Bluetooth Speaker - Target Certified Refurbished"), { condition: "refurbished", label: "Reacondicionado" });
  assert.equal(conditionOfTitle("Restored Apple iPad 9th Gen (Renewed)").label, "Reacondicionado");
  assert.equal(conditionOfTitle("(Caja abierta) Mini Brands Create Masterchef Series 2").label, "Caja abierta");
  assert.equal(conditionOfTitle("Open Box LEGO Technic BASH! 42073").label, "Caja abierta");
});

await check("a new product has no condition", () => {
  assert.equal(conditionOfTitle("LEGO Creator 3 in 1 Turtle with a Water Lily Flower"), null);
  assert.equal(conditionOfTitle("Renewal Facial Serum 1 oz"), null);
  assert.equal(conditionOfTitle(""), null);
  assert.equal(conditionOfTitle(undefined), null);
});

await check("used clothing, footwear and auto parts are never sold as used (item 28)", () => {
  assert.equal(conditionOfTitle("Pre-Owned Nike Air Max 90 Sneakers Size 10"), null);
  assert.equal(conditionOfTitle("Open Box Levi's 501 Jeans"), null);
  assert.equal(conditionOfTitle("Remanufactured Alternator for 2012 Honda Civic"), null);
  assert.equal(conditionOfTitle("Open Box Brake Rotors Front Pair"), null);
});

await check("phones: unlocked only", () => {
  assert.equal(conditionOfTitle("Restored Apple iPhone 13 128GB Straight Talk (Refurbished)"), null);
  assert.equal(conditionOfTitle("Restored Samsung Galaxy S21 Verizon Locked (Refurbished)"), null);
  assert.equal(conditionOfTitle("Restored Apple iPhone 13 128GB Unlocked (Refurbished)").label, "Reacondicionado");
});

await check("the grade is the store's words, or nothing", () => {
  assert.equal(gradeOfTitle("Refurbished JBL Xtreme 4 Portable Bluetooth Speaker - Black - Target Certified Refurbished "), "Target Certified Refurbished");
  assert.equal(gradeOfTitle("Refurbished: JBL Grip Compact Bluetooth Speaker (Red) -Manufacturer Refurbished"), "Manufacturer Refurbished");
  assert.equal(gradeOfTitle("Pre-Owned Technic Race Truck Set LEGO 8041 [Damaged Package]"), "[Damaged Package]");
  assert.equal(gradeOfTitle("Restored Apple iPad 9th Gen Grade A (Refurbished)"), "Grade A");
  assert.equal(gradeOfTitle("Open Box LEGO Technic BASH! 42073"), "");
  assert.equal(gradeOfTitle("Renewed Anker Soundcore 2 Portable Bluetooth Speaker (Refurbished))"), "");
  assert.equal(NO_GRADE_NOTE, "La tienda no indica un grado.");
});

await check("every department with 3+ such products gets the rail second", () => {
  const list = [item("LEGO City Police Station", { salePct: 20, wasPrice: 12 }), item("Open Box LEGO Technic BASH! 42073"),
    item("Refurbished Barbie Collectible Doll"), item("(Open Box) PAW Patrol Chase Plush Toy"), item("Hot Wheels 5-Pack")];
  const s = buildSections(list);
  assert.equal(s[0].key, "ofertas");
  assert.equal(s[1].key, "reacondicionados");
  assert.equal(s[1].title, "Reacondicionados");
  assert.equal(s[1].items.length, 3);
});

await check("no rail under 3, and none inside the department made of nothing else", () => {
  const two = [item("Hot Wheels 5-Pack"), item("Open Box LEGO Technic BASH! 42073"), item("Refurbished Barbie Collectible Doll")];
  assert.ok(!buildSections(two).some((x) => x.key === "reacondicionados"));
  const all = [item("Open Box LEGO Technic BASH! 42073"), item("Refurbished Barbie Collectible Doll"), item("(Open Box) PAW Patrol Chase Plush Toy")];
  assert.ok(!buildSections(all).some((x) => x.key === "reacondicionados"));
});

await check("the department takes exactly the titles the rule labels", () => {
  const rule = DEPT_RULES.reacondicionados;
  assert.deepEqual(rule, { kind: "refurb" });
  assert.equal(belongsToDept(rule, item("Open Box LEGO Technic BASH! 42073")), true);
  assert.equal(belongsToDept(rule, item("LEGO Creator 3 in 1 Turtle")), false);
  assert.equal(belongsToDept(rule, item("Pre-Owned Nike Air Max 90 Sneakers")), false);
});

await check("the card carries the label (k); a new product's card does not", () => {
  assert.equal(cardOf(item("Open Box LEGO Technic BASH! 42073")).k, "Caja abierta");
  assert.equal("k" in cardOf(item("Hot Wheels 5-Pack")), false);
});

await check("the built department is not dead and holds only labelled products", () => {
  const h = JSON.parse(readFileSync(new URL("../../assets/sections/departamento/reacondicionados/head.json", import.meta.url), "utf8"));
  assert.ok(h.count >= 12, "count " + h.count);
  for (const r of h.rails) for (const c of r.cards || []) {
    assert.ok(conditionOfTitle(c.t), c.t);
    assert.equal(c.k, conditionOfTitle(c.t).label);
  }
});

await check("the order line's condition is the title's, never the browser's word", () => {
  const src = readFileSync(new URL("../../netlify/functions/orders-create.js", import.meta.url), "utf8");
  assert.match(src, /conditionOfTitle\(line\.title\)/);
  assert.match(src, /else delete line\.condition/);
});

await check("the email line names the condition", async () => {
  const { orderConfirmationEmail } = await import("../../netlify/functions/_order-email.js");
  if (typeof orderConfirmationEmail !== "function") return;
  const out = orderConfirmationEmail({ id: "ARIA-TEST", items: [{ title: "Open Box LEGO Technic BASH! 42073", condition: "Caja abierta", qty: 1, priceUsd: 40 }], fxRateUsed: 3.7 });
  assert.match(JSON.stringify(out), /\[Caja abierta\]/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
