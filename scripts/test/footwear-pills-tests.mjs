/* ==================================================================
   FOOTWEAR, THREE PILLS PER AUDIENCE (Danny's format plan, #443
   c.6504037778 §3), on the homepage Mujer / Hombre / Niños carousels:

     Zapatos    everyday shoes -- high-tops and Vans, women's boots;
     Zapatillas running and gym;
     Sandalias  sandals, slides, slippers.

   Cleats are Zapatillas (Danny's rule, Lucifer #443 c.6512244834) and
   never lead one -- even a cleat whose title was stripped to the model
   ("PUMA Jr. TACTO II"), known by its photo or its soccer store; no bag
   that says "gym"; women's Zapatos opens on marketable sneakers and
   carries boots. In the three Mujer pills Farfetch rides at the end,
   never the lead (Danny, #443 c.6547326285).

     node scripts/test/footwear-pills-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { footClass, isSportShoe } from "../../netlify/functions/_department-core.js";

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

const SOCCER = new Set(["xtremesoccer", "prosoccer"]);
const asProduct = (c) => ({ title: c.t, image: c.i, retailer: c.r });
const isCleat = (c) => CLEAT.test(c.t) || isSportShoe(asProduct(c)) || SOCCER.has(c.r);

check("cleats only in Zapatillas, behind every everyday shoe; no bag; each pill holds its own kind", () => {
  for (const aud of ["mujer", "hombre", "ninos"]) {
    for (const [label, cls] of [["Zapatos", "zapatos"], ["Zapatillas", "zapatillas"], ["Sandalias", "sandalias"]]) {
      const cards = cardsOf(aud, label);
      let cleatSeen = false;
      for (const c of cards) {
        if (label !== "Zapatillas") assert.ok(!isCleat(c), `${aud}/${label}: ${c.t} (${c.r})`);
        else if (isCleat(c)) cleatSeen = true;
        else assert.ok(!cleatSeen, `${aud}/${label}: a cleat ahead of ${c.t}`);
        assert.doesNotMatch(c.t, /\b(bags?|duffels?|totes?|backpacks?)\b/i, `${aud}/${label}: ${c.t}`);
        assert.equal(footClass(asProduct(c)), cls, `${aud}/${label}: ${c.t}`);
      }
      if (label === "Zapatillas") assert.ok(!isCleat(cards[0]), `${aud}/${label} opens on a cleat`);
    }
  }
});

check("Lucifer's two: PUMA Jr. TACTO II and ATTACANTO are out of Niños Zapatos", () => {
  const z = cardsOf("ninos", "Zapatos").map((c) => c.t);
  for (const t of ["PUMA Jr. TACTO II", "PUMA Jr. ATTACANTO"]) assert.ok(!z.includes(t), t);
  assert.equal(footClass({ title: "PUMA Jr. TACTO II", retailer: "xtremesoccer",
    image: "https://cdn.shopify.com/s/files/1/2833/2672/files/1-puma-jr-tacto-ii-little-big-kids-firm-artificial-ground-low-top-soccer-cleats-106704-04.jpg" }), "zapatillas");
});

check("women's Zapatos carries boots, one card in three after the sneaker lead", () => {
  const boots = cardsOf("mujer", "Zapatos").filter((c) => /\b(boots?|booties|botas?|botines?|chelsea)\b/i.test(c.t));
  assert.ok(boots.length >= 4, `${boots.length} boots`);
});

check("women's Zapatos opens on marketable sneakers", () => {
  for (const c of cardsOf("mujer", "Zapatos").slice(0, 4)) assert.match(c.t, /(sneakers?|550|spezial|samba|air max|air force|chuck taylor|old skool)/i, c.t);
});

check("Mujer Zapatos, Zapatillas and Sandalias: Farfetch never leads, pinned to the end, still in the pill (Danny, #443 c.6547326285)", () => {
  let farfetch = 0;
  for (const label of ["Zapatos", "Zapatillas", "Sandalias"]) {
    const cards = cardsOf("mujer", label);
    assert.notEqual(cards[0].r, "farfetch", `Mujer/${label} opens on Farfetch: ${cards[0].t}`);
    const first = cards.findIndex((c) => c.r === "farfetch");
    if (first === -1) continue;
    farfetch += cards.length - first;
    for (const c of cards.slice(first)) assert.equal(c.r, "farfetch", `Mujer/${label}: ${c.t} (${c.r}) behind a Farfetch card`);
  }
  assert.ok(farfetch > 0, "Farfetch is demoted, not removed: no Farfetch card left in the Mujer shoe pills");
});

check("the rule: boots and Vans are Zapatos, runners and cleats Zapatillas, slides Sandalias, a Slide sneaker a shoe", () => {
  assert.equal(footClass({ title: "Women's Leather Ankle Boots" }), "zapatos");
  assert.equal(footClass({ title: "Vans Old Skool High Top" }), "zapatos");
  assert.equal(footClass({ title: "Women's Adizero SL2 Running Shoes" }), "zapatillas");
  assert.equal(footClass({ title: "Men's Leather Slides" }), "sandalias");
  assert.equal(footClass({ title: "Slide glitter-detail sneakers" }), "zapatos");
  assert.equal(footClass({ title: "Nike Phantom GX Academy FG Soccer Cleats" }), "zapatillas");
  assert.equal(footClass({ title: "Travel Duffel Bag, Tote Gym Bag" }), "");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
