/* ==================================================================
   FOOTWEAR, THREE PILLS PER AUDIENCE (Danny's format plan, #443
   c.6504037778 §3), on the homepage Mujer / Hombre / Niños carousels:

     Zapatos    everyday shoes -- high-tops and Vans, women's boots;
     Zapatillas running and gym;
     Sandalias  sandals, slides, slippers.

   No soccer cleat in any of them (cleats live in Deportes and Fútbol),
   no bag that says "gym", and women's Zapatos opens on marketable
   sneakers.

     node scripts/test/footwear-pills-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { footClass } from "../../netlify/functions/_department-core.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const json = (f) => JSON.parse(readFileSync(ROOT + f, "utf8"));
const cardsOf = (aud, label) => {
  const head = json(`assets/home/pills/${aud}.json`);
  const p = head.pills.find((x) => x.label === label);
  assert.ok(p, `${aud}: no ${label} pill`);
  return p === head.pills[0] ? head.cards : json(`assets/home/pills/${aud}-${p.k}.json`).cards;
};
const CLEAT = /\b(cleats?|soccer|f50|predator|mercurial|phantom|tiempo|goletto|turf|futsal|fg|tf)\b/i;

check("Mujer, Hombre and Niños each carry Zapatos, Zapatillas and Sandalias, in that order", () => {
  for (const aud of ["mujer", "hombre", "ninos"]) {
    const labels = json(`assets/home/pills/${aud}.json`).pills.map((p) => p.label);
    const i = labels.indexOf("Zapatos");
    assert.deepEqual(labels.slice(i, i + 3), ["Zapatos", "Zapatillas", "Sandalias"], `${aud}: ${labels.join(", ")}`);
  }
});

check("no cleat and no bag in any footwear pill; each pill holds its own kind", () => {
  for (const aud of ["mujer", "hombre", "ninos"]) {
    for (const [label, cls] of [["Zapatos", "zapatos"], ["Zapatillas", "zapatillas"], ["Sandalias", "sandalias"]]) {
      for (const c of cardsOf(aud, label)) {
        assert.doesNotMatch(c.t, CLEAT, `${aud}/${label}: ${c.t}`);
        assert.doesNotMatch(c.t, /\b(bags?|duffels?|totes?|backpacks?)\b/i, `${aud}/${label}: ${c.t}`);
        assert.equal(footClass({ title: c.t }), cls, `${aud}/${label}: ${c.t}`);
      }
    }
  }
});

check("women's Zapatos opens on marketable sneakers", () => {
  for (const c of cardsOf("mujer", "Zapatos").slice(0, 4)) assert.match(c.t, /(sneakers?|550|spezial|samba|air max|air force|chuck taylor|old skool)/i, c.t);
});

check("the rule: boots and Vans are Zapatos, runners Zapatillas, slides Sandalias, a Slide sneaker a shoe", () => {
  assert.equal(footClass({ title: "Women's Leather Ankle Boots" }), "zapatos");
  assert.equal(footClass({ title: "Vans Old Skool High Top" }), "zapatos");
  assert.equal(footClass({ title: "Women's Adizero SL2 Running Shoes" }), "zapatillas");
  assert.equal(footClass({ title: "Men's Leather Slides" }), "sandalias");
  assert.equal(footClass({ title: "Slide glitter-detail sneakers" }), "zapatos");
  assert.equal(footClass({ title: "Nike Phantom GX Academy FG Soccer Cleats" }), "");
  assert.equal(footClass({ title: "Travel Duffel Bag, Tote Gym Bag" }), "");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
