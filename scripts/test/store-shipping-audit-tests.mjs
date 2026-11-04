/* ==================================================================
   THE STORE-SHIPPING AUDIT (#443 c.6620628148, Danny): every active
   store's «Envío de la tienda» row at checkout, on an under-threshold
   and an over-threshold cart, through the real code path
   (scripts/store-shipping-audit.mjs). A store with a captured fee shows
   that fee, never «POR CALCULAR»; the stores still without one are
   pinned by name, so the list can only shrink.

     node scripts/test/store-shipping-audit-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditTree, cartsFor, PUBLISHED_AS_CALCULATED } from "../store-shipping-audit.mjs";
import { STORE_SHIPPING, cartShipping, shippingRuleText } from "../lib/store-shipping.js";
import { STORE_CARRIER as SC } from "../lib/store-carrier.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const audit = await auditTree(ROOT);
const usd = (n) => `US$ ${Number(n).toFixed(2)}`;

/* THE STILL-MISSING LIST, Nov 4: every active store whose under-threshold
   row reads «POR CALCULAR» -- Lucifer's mock Miami checkouts. Remove a name
   when its fee lands; never add one. */
const STILL_MISSING = [
  "academy", "advanceauto", "aguabendita", "alphalete", "ancora", "assouline", "aybl",
  "bathandbodyworks", "bellybandit", "bornprimitive", "brandsmart", "combatcorner", "crateandbarrel",
  "dagnedover", "denniskirk", "elite", "elvie", "ezpz", "farmrio", "fleo", "freshlypicked", "fuji",
  "ironrebel", "jujube", "kindredbravely", "mainland", "microcenter", "mockingbird", "montce", "munchkin",
  "mushie", "nanit", "nautilus", "owlet", "paragonfitwear", "parrot", "patbo", "pier1", "prosoccer",
  "quietstorm", "silviatcherassi", "sleekshop", "smartbuyglasses", "spectra", "tennisexpress",
  "tenniswarehouse", "tns", "venum", "xtremesoccer", "zumiez",
];

check("the audit mirrors checkout.html renderStoreShipping's fee expression, character for character", () => {
  const co = read("checkout.html");
  const body = co.slice(co.indexOf("function renderStoreShipping("), co.indexOf("One renderer for the tax row"));
  assert.ok(body.includes(": !st.rule || st.pending ? 'POR CALCULAR' : st.feeUsd > 0 ? `US$ ${st.feeUsd.toFixed(2)}` : 'GRATIS';"),
    "the default (no tier) fee expression changed: update scripts/store-shipping-audit.mjs checkoutFeeLabel");
  assert.match(body, /const ship = cartShippingNow\(\);/);
  assert.match(read("scripts/store-shipping-audit.mjs"), /return !st\.rule \|\| st\.pending \? "POR CALCULAR" : st\.feeUsd > 0 \? `US\$ \$\{st\.feeUsd\.toFixed\(2\)\}` : "GRATIS";/);
});

check("every active store is audited (the search index plus the carrier matrix)", () => {
  assert.ok(Object.keys(audit).length >= 120, String(Object.keys(audit).length));
  for (const k of ["venum", "victoriassecret", "footlocker", "oldnavy", "gameness", "capittana"]) assert.ok(audit[k], k);
});

check("every store with a captured fee shows that fee under its threshold, never «POR CALCULAR»; GRATIS over it", () => {
  for (const [k, a] of Object.entries(audit)) {
    const r = STORE_SHIPPING[k];
    if (!r || r.feeUsd == null) continue;
    if (r.freeOverUsd === 0) { assert.equal(a.under.fee, "GRATIS", k); assert.equal(a.over.fee, "GRATIS", k); continue; }
    const sub = a.carts.underUsd;
    const want = r.feeLadder ? r.feeLadder.find((x) => sub < x.underUsd).feeUsd : r.feeUsd;
    assert.notEqual(a.under.fee, "POR CALCULAR", k);
    assert.equal(a.under.fee, want > 0 ? usd(want) : "GRATIS", k);
    assert.equal(a.over.fee, r.freeOverUsd == null ? usd(r.feeUsd) : "GRATIS", k + " over");
  }
});

check("group 1: the standard option carries the same captured fee as the row (it did not lose it in #630)", () => {
  let n = 0;
  for (const [k, a] of Object.entries(audit)) {
    if (!SC.hasOptions(k)) continue;
    for (const side of ["under", "over"]) {
      const x = a[side];
      if (x.fee === "POR CALCULAR") assert.equal(x.standardOption, SC.PRICE_AT_STORE, k);
      else { assert.equal(x.standardOption.toLowerCase(), x.fee.toLowerCase(), k + " " + side); n++; }
    }
  }
  assert.ok(n > 40, String(n));
});

check("the default option is the pre-#630 rule: an empty tier pick changes no store's row", () => {
  for (const k of Object.keys(audit)) {
    const line = [{ retailer: k, priceUsd: 20, dutiableUsd: 21.4, qty: 1 }];
    assert.deepEqual(cartShipping(line, undefined, { tiers: {} }), cartShipping(line), k);
    assert.deepEqual(cartShipping(line, undefined, { tiers: { [k]: SC.STANDARD_ID } }), cartShipping(line), k);
  }
});

check("the still-missing list is pinned by name and can only shrink", () => {
  const now = Object.keys(audit).filter((k) => audit[k].under.fee === "POR CALCULAR").sort();
  const added = now.filter((k) => !STILL_MISSING.includes(k));
  assert.deepEqual(added, [], "a store started reading POR CALCULAR: " + added.join(", "));
  for (const k of PUBLISHED_AS_CALCULATED) assert.ok(STILL_MISSING.includes(k) || !now.includes(k), k);
  console.log("         still missing (" + now.length + "): " + now.join(", "));
});

check("the audit's fixes, each from the carrier matrix row (data/usps-carrier-matrix-2026-11-03.md), source cited", () => {
  const m = read("data/usps-carrier-matrix-2026-11-03.md");
  const row = (slug) => m.split("\n").find((l) => l.includes(`| ${slug} |`)) || "";
  assert.match(row("capittana"), /free \$100\+, otherwise \$10/);
  assert.deepEqual([audit.capittana.under.fee, audit.capittana.over.fee], ["US$ 10.00", "GRATIS"]);
  assert.match(row("johannaortiz"), /US Standard is complimentary/);
  assert.deepEqual([audit.johannaortiz.under.fee, audit.johannaortiz.over.fee], ["GRATIS", "GRATIS"]);
  assert.match(row("hatch"), /Economy \$8/);
  assert.deepEqual([audit.hatch.under.fee, audit.hatch.over.fee], ["US$ 8.00", "US$ 8.00"]);
  for (const [k, t] of [["ancora", /free over \$140/], ["bellybandit", /free-over-\$40/], ["elvie", /free over \$35/], ["xtremesoccer", /free on orders \$100\+/], ["prosoccer", /Free standard shipping over \$100/], ["sleekshop", /free over \$99/]]) {
    assert.match(row(k), t, k);
    assert.equal(audit[k].over.fee, "GRATIS", k);
  }
  for (const k of ["capittana", "johannaortiz", "hatch", "ancora", "bellybandit", "elvie", "xtremesoccer", "prosoccer", "sleekshop", "gameness"]) {
    assert.match(STORE_SHIPPING[k].source, /#443 c\.6620628148/, k);
  }
});

check("Gameness: its own published ladder, $12.90 under $50, $15.90 from $50 to $99.99, free from $100", () => {
  const at = (s) => cartShipping([{ retailer: "gameness", dutiableUsd: Math.round(s * 107) / 100, qty: 1 }]).stores[0].feeUsd;
  assert.deepEqual([at(20), at(49.99), at(50), at(99.99), at(100)], [12.9, 12.9, 15.9, 15.9, 0]);
  assert.equal(shippingRuleText("gameness"), "Envío gratis desde $100 · $12.90 debajo de $50 · $15.90 de $50 a $99.99");
});

check("Venum: no under-$75 fee captured anywhere -- POR CALCULAR under $75, charged nothing, GRATIS from $75", () => {
  assert.deepEqual([STORE_SHIPPING.venum.feeUsd, STORE_SHIPPING.venum.freeOverUsd], [null, 75]);
  assert.deepEqual(cartsFor(STORE_SHIPPING.venum), { underUsd: 37.5, overUsd: 95 });
  assert.equal(audit.venum.under.fee, "POR CALCULAR");
  assert.equal(audit.venum.under.chargedUsd, 0);
  assert.equal(audit.venum.over.fee, "GRATIS");
  assert.ok(STILL_MISSING.includes("venum"));
});

check("the deliverable table lists every store, and the same still-missing names", () => {
  const md = read("data/store-shipping-audit-2026-11-04.md");
  for (const k of Object.keys(audit)) assert.match(md, new RegExp("^\\| " + k + "[ |]", "m"), k);
  const listed = md.split("## Still missing")[1].split("\n## ")[0].match(/^- ([a-z0-9]+)/gm).map((s) => s.slice(2));
  const now = Object.keys(audit).filter((k) => audit[k].under.fee === "POR CALCULAR").sort();
  assert.deepEqual(listed.sort(), now);
  assert.match(md, /\(a\) the exact standard fee on a cart under \$75/);
});

check("a store's row carries its name, never the bare slug: the registry label, else the carrier matrix name", () => {
  const co = read("checkout.html");
  assert.match(co, /function storeLabelOf\(k\)\{ return RETAILER_LABELS\[k\] \|\| \(SC\.carrierOf\(k\) \|\| \{\}\)\.name \|\| k; \}/);
  assert.match(co, /const label = storeLabelOf\(st\.store\);/);
  assert.equal(SC.carrierOf("capittana").name, "Capittana");
  assert.equal(SC.carrierOf("gameness").name, "Gameness");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
