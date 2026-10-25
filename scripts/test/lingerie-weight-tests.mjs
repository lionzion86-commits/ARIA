/* ==================================================================
   VICTORIA'S SECRET IS NOT A BEAUTY STORE -- LINGERIE WEIGHTS
   (#443, Lucifer's weight finding on order #ARIA-20261018-0C6674).

   A VS maxi dress + a VS bra charged 0.10 kg of freight. The cause was
   not a scraped weight: "victoriassecret" was on BEAUTY_RETAILERS, so
   every VS line was beauty by origin and every title without a beauty
   row (a dress, a bra) took the 0.05 kg beauty catch-all. With VS off
   that list, the general table answers -- and lingerie needed its own
   row ahead of the denim / embroidery rows, which are cited for jeans
   and embroidered dresses (an embroidered demi bra is not a kilo).

   Checks: the order's own two lines resolve to a dress + a bra (never
   the beauty catch-all); every VS lingerie class lands near its
   weight-estimates.json figure; VS mists and lotions stay beauty;
   Sephora stays a beauty store; a teddy BEAR stays a toy and a slip
   DRESS stays a dress; the page's mirror agrees with the module and
   the server title by title.

   RUN: node scripts/test/lingerie-weight-tests.mjs   (no network)
   ================================================================== */
import { resolveCartWeights, resolveItemWeight } from "../../netlify/functions/_weight-resolve.js";
import { estimateWeightDetail } from "../lib/sales-sources.js";
import { BEAUTY_RETAILERS } from "../lib/beauty-weight.js";
import { loadPageWeightSlice } from "./_page-script.mjs";

let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
const VS = (title, priceUsd = 40) => ({ title, retailer: "victoriassecret", priceUsd, qty: 1, weightKg: 0.17, weightEstimated: true });

console.log("lingerie weights (order 0C6674)");

await check("the order's dress + bra resolve to a dress and a bra, not 0.05 kg each", () => {
  const c = resolveCartWeights([VS("Vintage Blossom Chiffon Ruffled Maxi Dress", 70), VS("ATELIER Victoria's Secret Satin Lace Trim Lightly Lined Demi Bra", 50)]);
  for (const it of c.items) assert(it.source !== "beauty", `${it.title}: still weighed as beauty (${it.weightKg} kg)`);
  assert(c.totalKg >= 0.55, `cart total ${c.totalKg} kg, was 0.10`);
  assert(!c.needsReview, "the cart should quote");
  return `${c.totalKg} kg`;
});

await check("Victoria's Secret is no longer a beauty store; Sephora still is", () => {
  assert(!BEAUTY_RETAILERS.has("victoriassecret"), "victoriassecret still in BEAUTY_RETAILERS");
  assert(BEAUTY_RETAILERS.has("sephora"), "sephora dropped");
  const s = resolveItemWeight({ title: "Fixture Glow Balm", retailer: "sephora", priceUsd: 30 });
  assert(s.source === "beauty", `a plain Sephora title should stay beauty, got ${s.source}`);
});

const CLASSES = [
  ["Wicked Unlined Boho Floral Embroidery Balconette Bra", 0.1, 0.25],
  ["VS Logo Embroidery Triangle Bralette", 0.1, 0.25],
  ["Denim Embroidery Brazilian Panty", 0.05, 0.12],
  ["5-Pack No-Show Leopard Lace Cheeky Panties", 0.05, 0.12],
  ["Floral Embroidery Garter Belt", 0.1, 0.25],
  ["Cherry Pop Embroidery Strappy Teddy", 0.1, 0.25],
  ["Butterflies Embroidery Tulle Short-Sleeve Babydoll Set", 0.1, 0.25],
  ["Denim Embroidery Bustier Corset Top", 0.1, 0.3],
  ["Crystal Bow Satin Mini Slip", 0.1, 0.25],
  ["Twinkle Bow Satin Mini Slip Dress", 0.35, 0.6],
];
await check("lingerie lands near weight-estimates.json (bra 0.15, underwear 0.08-0.15), not on the denim / embroidery kilo", () => {
  for (const [t, lo, hi] of CLASSES) {
    const r = resolveItemWeight(VS(t));
    assert(r.weightKg >= lo && r.weightKg <= hi, `${t}: ${r.weightKg} kg (${r.source}) outside ${lo}-${hi}`);
  }
  return `${CLASSES.length} titles`;
});

await check("VS mists and lotions stay on the beauty rows", () => {
  for (const t of ["Vacation Fragrance Mist", "Temptation, Served Fragrance Lotion", "Bare Vanilla Fine Fragrance Mist"]) {
    const r = resolveItemWeight(VS(t, 22));
    assert(r.source === "beauty" && r.weightKg >= 0.15, `${t}: ${r.weightKg} kg (${r.source})`);
  }
});

await check("guards: a teddy bear is not lingerie; a slip dress, gown or skirt is not a slip; a tank top with a bralette is a top; non-slip shoes and rugs, slip-ons and a boxer-short pajama set keep their rows", () => {
  eq(estimateWeightDetail("Build-A-Bear Classic Teddy Bear Plush 16 in", {}).kg, estimateWeightDetail("Build-A-Bear Classic Bear Plush 16 in", {}).kg, "teddy bear vs bear");
  eq(estimateWeightDetail("Satin Slip Dress", {}).kg, estimateWeightDetail("Satin Dress", {}).kg, "slip dress vs dress");
  assert(estimateWeightDetail("Sheer Bow Slip Gown", {}).kg >= 0.8, "slip gown should keep the gown row");
  eq(estimateWeightDetail("Women's Midi Slip Skirt", {}).kg, estimateWeightDetail("Women's Midi Skirt", {}).kg, "slip skirt vs skirt");
  assert(estimateWeightDetail("Spiderweb Girls Muscle Tank Top With Bralette", {}).kg >= 0.2, "a tank top with a bralette is a top; non-slip shoes and rugs, slip-ons and a boxer-short pajama set keep their rows");
  for (const [t, base] of [["Women's Retro Fashion Sneakers, Lace-Up Casual Non Slip Running Shoes", "Women's Retro Fashion Sneakers, Lace-Up Casual Running Shoes"],
    ["EasySteps Women's Canvas Slip-On Shoes with Padded Insole", "EasySteps Women's Canvas Shoes with Padded Insole"],
    ["Christmas Area Rug 3x5 Machine Washable Non Slip", "Christmas Area Rug 3x5 Machine Washable"],
    ["Girls' Short Sleeve Graphic Tee and Flannel Boxer Short Pajama Set", "Girls' Short Sleeve Graphic Tee and Flannel Boxer Short Pajama Set"]]) {
    const r = estimateWeightDetail(t, {}).kg;
    assert(r > 0.17, `${t}: took the lingerie / panty row (${r} kg)`);
    eq(r, estimateWeightDetail(base, {}).kg, `${t} vs ${base}`);
  }
});

const P = loadPageWeightSlice();
const PARITY = [...CLASSES.map((c) => c[0]), "Vintage Blossom Chiffon Ruffled Maxi Dress", "ATELIER Victoria's Secret Satin Lace Trim Lightly Lined Demi Bra",
  "Vacation Fragrance Mist", "Build-A-Bear Classic Teddy Bear Plush 16 in", "Satin Slip Dress", "Hanes Men's Boxer Briefs 6-Pack", "Levi's 501 Original Jeans"];
await check("the app bundle's estimator agrees with the module and the server, title by title", () => {
  for (const t of PARITY) {
    eq(P.estimateRetailWeightDetail(t, {}).kg, estimateWeightDetail(t, {}).kg, "page vs module: " + t);
    for (const [retailer, priceUsd] of [["victoriassecret", 40], ["walmart", 20], ["sephora", 25]]) {
      eq(P.estimateRetailWeightDetail(t, { retailer, priceUsd }).kg, resolveItemWeight({ title: t, retailer, priceUsd }).weightKg,
        `page vs server (${retailer}, $${priceUsd}): ${t}`);
    }
  }
  return `${PARITY.length} titles x 4 hint sets`;
});

function eq(a, b, msg) { assert(a === b, `${msg}: got ${a}, want ${b}`); }

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
