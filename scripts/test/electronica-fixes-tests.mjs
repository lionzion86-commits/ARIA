/* ==================================================================
   DANNY'S ELECTRÓNICA FIXES (#443 c.6487219343, re-filed c.6494880875)
   and the Reacondicionados rulings that came with them (c.6488256694,
   c.6488281596, c.6488288883, c.6488481308, c.6488544902, c.6488547834).

     1. a Consolas pill: the console itself (Switch, PlayStation, Xbox,
        Meta Quest) -- "gaming" is not Consolas;
     2. Ofertas leads with a good Walmart camera; small accessories close it;
     3. the card carries "+ S/ <amount> IMP" under its price;
   and: Reacondicionados is pill #2, led by the refurbished Chromebooks,
   each card badged with its own condition; every other shelf is NEW
   only; Computadoras and Chromebooks carry a door to Reacondicionados;
   a Chromebooks pill; the sold-out promise on the product page, in
   checkout and in its own order message.

     node scripts/test/electronica-fixes-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { conditionOfTitle, SOLD_OUT_NOTE } from "../lib/condition.js";
import { isConsole, isChromebook } from "../../netlify/functions/_department-core.js";
import { voltageGate, isGameSoftware } from "../lib/brandsmart.js";
import { soldOutEmail } from "../../netlify/functions/_order-email.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const DIR = ROOT + "assets/sections/departamento/electronics/";
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
const home = json(DIR + "home.json");
const pill = (k) => (k === home.pills[0].k ? home.cards : json(DIR + `home-${k}.json`).cards);
const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");

check("the pill row: Ofertas, Reacondicionados second, then Celulares, Computadoras, Chromebooks, Consolas", () => {
  assert.deepEqual(home.pills.slice(0, 6).map((p) => p.label), ["Ofertas", "Reacondicionados", "Celulares", "Computadoras", "Chromebooks", "Consolas"]);
});

check("1. Consolas: the consoles themselves, never a game, a controller or a strap", () => {
  const cards = pill("consolas");
  assert.ok(cards.length >= 8, `${cards.length} consoles`);
  for (const c of cards) assert.match(c.t, /switch|playstation|ps5|xbox|quest|steam deck/i, c.t);
  for (const c of cards) assert.doesNotMatch(c.t, /\b(controller|strap|facial|case|charger|cross-gen|edition|dlc|for (ps5|xbox|switch))\b|\[digital\]/i, c.t);
  assert.ok(cards.some((c) => /switch\s*(™)?\s*2/i.test(c.t)) && cards.some((c) => /quest/i.test(c.t)), "Switch 2 and Meta Quest are in");
  assert.equal(isConsole({ title: "Mario Kart World - Nintendo Switch 2" }), false, "a game is Videojuegos");
  assert.equal(isConsole({ title: "Nintendo Switch™ 2 System" }), true);
  assert.ok(!pill("tech_gaming").some((c) => isConsole({ title: c.t })), "no console is also in Videojuegos");
});

check("the 220 V gate: a game draws no current; a console sells on a stated rating, never on the word 'controller'", () => {
  assert.equal(isGameSoftware("Call of Duty®: Black Ops 7 - Cross-Gen Bundle - Xbox Series X and Xbox One"), true);
  assert.equal(voltageGate({ name: "Diablo IV: Cross-Gen Bundle - Xbox Series X", subcategory: "" }), "sell");
  assert.equal(voltageGate({ name: "PlayStation 5 Slim Console + PlayStation 5 DualSense Wireless Controller", subcategory: "" }), "held-voltage-unstated");
  assert.equal(voltageGate({ name: "DualSense Wireless Controller for PS5", subcategory: "gaming" }), "sell", "the controller itself is still an accessory");
});

check("2. Ofertas opens on a good Walmart camera on sale; a small accessory never leads it", () => {
  const [lead, ...rest] = home.cards;
  assert.equal(lead.r, "walmart", lead.t);
  assert.match(lead.t, /\b(digital camera|mirrorless|dslr|camcorder|optical zoom)\b/i, lead.t);
  assert.doesNotMatch(lead.t, /\b(body|kids?|drone|security|dash)\b/i, lead.t);
  assert.ok(lead.s >= 30 && lead.p >= 50, `${lead.t}: -${lead.s}% $${lead.p}`);
  for (const c of home.cards.slice(0, 8)) assert.doesNotMatch(c.t, /^(\S+\s){0,3}(cable|car charger|case|screen protector|adapter)\b/i, "an accessory leads: " + c.t);
  const head = json(DIR + "head.json");
  assert.equal(head.rails[0].cards[0].t, lead.t, "the department's Ofertas opens on the same camera");
  void rest;
});

check("3. the card shows the import tax: '+ S/ <amount> IMP' on the product view's own estimate, and only over $200", () => {
  assert.match(bundle, /function cardImpLineHTML\(p, cls, color\)/);
  assert.match(bundle, /\$\{cardImpLineHTML\(p, 'block text-\[11px\] font-bold tabular mt-0\.5'/, "railCardHTML draws it under the price");
  const fn = bundle.slice(bundle.indexOf("function cardImpTaxUsd(p)"), bundle.indexOf("function cardImpLineHTML"));
  assert.match(fn, /d > IMPORT_TAX_THRESHOLD_USD/, "nothing under the franchise");
  assert.match(fn, /\(d \+ freightUsd\(kg\)\) \* TAX_ZONE_RATE/, "the same estimate as productTaxLineHTML");
  assert.match(bundle, /\+ \$\{escapeHtml\(money\)\} IMP<\/span>/);
});

check("Reacondicionados: pill #2, refurbished Chromebooks first and cheapest first, every card badged with its own condition", () => {
  const p = home.pills.find((x) => x.k === "reacondicionados");
  assert.ok(p && p.note, "the disclosure rides with the pill");
  const cards = pill("reacondicionados");
  for (const c of cards) { assert.ok(conditionOfTitle(c.t), c.t); assert.equal(c.k, conditionOfTitle(c.t).label, c.t); }
  const books = cards.filter((c) => isChromebook({ title: c.t }));
  assert.ok(books.length >= 6, `${books.length} refurbished Chromebooks`);
  assert.deepEqual(cards.slice(0, books.length).map((c) => c.t), books.map((c) => c.t), "the Chromebooks lead");
  for (let i = 1; i < books.length; i++) assert.ok(books[i].p >= books[i - 1].p, "cheapest first");
  assert.ok(books.every((c) => c.p < 200), "every one under the $200 line");
  assert.match(bundle, /styleLabel: p\.conditionLabel \|\| ''/, "the card wears its condition");
});

check("the separation ruling: every other pill and shelf is NEW only; Computadoras and Chromebooks open a door to Reacondicionados", () => {
  for (const p of home.pills) if (p.k !== "reacondicionados") for (const c of pill(p.k)) assert.ok(!conditionOfTitle(c.t), `${p.label}: ${c.t}`);
  assert.deepEqual(home.pills.filter((p) => p.door).map((p) => p.k).sort(), ["chromebooks", "tech_computadoras"]);
  const head = json(DIR + "head.json");
  for (const r of head.rails) if (r.title !== "Reacondicionados") for (const c of r.cards || []) assert.ok(!c.k, `${r.title}: ${c.t}`);
  assert.ok(head.rails.find((r) => r.title === "Chromebooks").door, "the Chromebooks shelf's door");
  assert.ok(head.rails.find((r) => r.title === "Computadoras y tablets").door, "the Computadoras shelf's door");
  assert.match(readFileSync(ROOT + "departamento.html", "utf8"), /data-to-refurb/);
});

check("Chromebooks: new devices only, no accessory that merely names one", () => {
  const cards = pill("chromebooks");
  assert.ok(cards.length >= 8, `${cards.length}`);
  for (const c of cards) { assert.match(c.t, /chromebook/i); assert.doesNotMatch(c.t, /\b(for|charger|adapter|case|sleeve|mouse|keyboard)\b/i, c.t); }
});

check("the sold-out promise: product page, product sheet, checkout and its own order message", () => {
  assert.match(SOLD_OUT_NOTE, /^Si este producto se agota en la tienda, te avisamos de inmediato y te devolvemos el total: a tu tarjeta o en crédito Aria, tú eliges\.$/);
  assert.match(readFileSync(ROOT + "producto.html", "utf8"), /window\.AriaCondition\.SOLD_OUT_NOTE/);
  assert.match(readFileSync(ROOT + "checkout.html", "utf8"), /data-soldout-note/);
  assert.match(bundle, /C\.SOLD_OUT_NOTE/);
  assert.match(readFileSync(ROOT + "index.html", "utf8"), /<script src="\/condition\.js"><\/script>/);
  const m = soldOutEmail({ orderId: "A-1", customer: { name: "Rosa Pérez", email: "r@example.com" }, fxRateUsed: 3.75 }, { title: "Restored Lenovo N21 Chromebook", qty: 1, priceUsd: 50 });
  assert.equal(m.to, "r@example.com");
  assert.match(m.text, /se agotó en la tienda/);
  assert.match(m.text, /a tu tarjeta o en saldo Aria, tú eliges/);
  assert.match(m.text, /S\/\s?187\.50/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
