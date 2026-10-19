/* VARIANT TRUTH (Issue #411, #367 release gate 7). Danny's rule: Aria
   never shows a size it invented. A product offers the retailer's own
   size list, naturally sorted, or it is not sold by size yet. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e.message).split("\n")[0]); }
}

const bundleName = readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f));
const bundle = readFileSync(ROOT + "build/" + bundleName, "utf8").replace(/\r\n/g, "\n");
const pdp = readFileSync(ROOT + "producto.html", "utf8").replace(/\r\n/g, "\n");

function helperText(src) {
  const a = src.indexOf("/* VARIANT TRUTH (2026-10-18, Issue #411, Danny)");
  const end = "  return ACCESSORY_HEAD.test(t) || ACCESSORY_HEAD.test(t.split(',')[0].trim());\n}\n";
  const b = src.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "the size helper is missing");
  return src.slice(a, b + end.length);
}
const H = helperText(bundle);
const ctx = vm.createContext({});
vm.runInContext(H, ctx);
const sizes = (l) => Array.from(ctx.truthfulSizes(l));

await check("index.html's bundle and producto.html carry the same size helper", () => {
  assert.equal(helperText(pdp), H);
});

await check("sizes come out in natural order; anything else keeps the store's order", () => {
  assert.deepEqual(sizes(["XL", "S", "M", "XXL", "L"]), ["S", "M", "L", "XL", "XXL"]);
  assert.deepEqual(sizes(["XXLarge", "Small", "Large", "Medium", "XLarge"]), ["Small", "Medium", "Large", "XLarge", "XXLarge"]);
  assert.deepEqual(sizes(["10", "8.5", "9", "06.0"]), ["06.0", "8.5", "9", "10"]);
  assert.deepEqual(sizes(["32x32", "30x30", "32x30"]), ["30x30", "32x30", "32x32"]);
  assert.deepEqual(sizes(["16 oz", "10 oz", "12 oz"]), ["10 oz", "12 oz", "16 oz"]);
  assert.deepEqual(sizes(["34DD", "32C", "36B"]), ["34DD", "32C", "36B"], "band x cup is the retailer's ladder, never re-sorted");
});

await check("the stores' own spellings sort too (the #411 render audit's real lists)", () => {
  /* CCS lists largest first, in its own abbreviations. */
  assert.deepEqual(sizes(["XXL", "XL", "LG", "MD", "SM"]), ["SM", "MD", "LG", "XL", "XXL"]);
  assert.deepEqual(sizes(["XS", "SM", "MD", "LG", "XL", "2X", "3X"]), ["XS", "SM", "MD", "LG", "XL", "2X", "3X"]);
  /* Macy's petite/short sizes after the regular ones. */
  assert.deepEqual(sizes(["10S", "0", "2", "4", "0S", "2S"]), ["0", "2", "4", "0S", "2S", "10S"]);
  assert.deepEqual(sizes(["Men's 12", "Men's 10", "Men's 13", "Men's 7"]), ["Men's 7", "Men's 10", "Men's 12", "Men's 13"]);
  assert.deepEqual(sizes(["4T", "3T", "2T"]), ["2T", "3T", "4T"]);
  assert.deepEqual(sizes(["6M", "12M", "24M", "18m", "Newborn"]), ["Newborn", "6M", "12M", "18m", "24M"]);
  assert.deepEqual(sizes(["LARGE", "2T", "SMALL", "3T", "X-LARGE", "MEDIUM"]), ["2T", "3T", "SMALL", "MEDIUM", "LARGE", "X-LARGE"]);
  assert.deepEqual(sizes(["2X LARGE", "LARGE", "MEDIUM", "SMALL", "X LARGE", "X SMALL"]), ["X SMALL", "SMALL", "MEDIUM", "LARGE", "X LARGE", "2X LARGE"]);
  assert.deepEqual(sizes(["10.5-11.5", "9.5-10.5", "8.5-9.5"]), ["8.5-9.5", "9.5-10.5", "10.5-11.5"]);
  assert.deepEqual(sizes(["XS", "S", "M", "L", "xxs/xs"]), ["xxs/xs", "XS", "S", "M", "L"]);
  assert.deepEqual(sizes(["10-12 YEARS", "2T", "5", "7-8 YEARS", "12 MONTHS"]), ["12 MONTHS", "2T", "5", "7-8 YEARS", "10-12 YEARS"]);
  assert.deepEqual(sizes(["13K", "1K", "12K", "1Y", "2Y"]), ["1K", "12K", "13K", "1Y", "2Y"]);
  assert.deepEqual(sizes(["C11", "J1", "C12", "J2"]), ["C11", "C12", "J1", "J2"]);
  assert.deepEqual(sizes(["IT 42 = WAIST US 28", "IT 38 = WAIST US 24", "IT 40 = WAIST US 26"]), ["IT 38 = WAIST US 24", "IT 40 = WAIST US 26", "IT 42 = WAIST US 28"]);
  assert.deepEqual(sizes(["38(XS)", "36(XXS)", "40(S)"]), ["36(XXS)", "38(XS)", "40(S)"]);
  /* Anything it cannot place keeps the store's order. */
  assert.deepEqual(sizes(["XS", "S", "S DD", "M", "M DD"]), ["XS", "S", "S DD", "M", "M DD"]);
  assert.deepEqual(sizes(["32", "34", "A", "B"]), ["32", "34", "A", "B"]);
});

await check("the store's stock objects keep the sizes in stock; junk is dropped", () => {
  assert.deepEqual(sizes([{ size: "07.0", available: true }, { size: "08.0", available: false }, { size: "09.0" }]), ["07.0", "09.0"]);
  assert.deepEqual(sizes(["M", " m ", "", null, "S"]), ["S", "M"]);
  assert.deepEqual(sizes(undefined), []);
});

await check("bags, wallets, charms and phone cases are not sized, garments still are", () => {
  for (const t of ["World Cup Dachshund Soccer Jersey Bag Charm - Red", "Hana Long Zip Wallet – Brown Canvas",
                   "Cigarette Heels Phone Case - Pink", "Roark 5 Day Mule Backpack - Black - 55L",
                   "Women's Small Top Zip Faux Suede Handbag, Cognac", "Oakley Eye Jacket Redux Prizm Black Polarized Sunglasses"]) {
    assert.ok(ctx.isAccessoryTitle(t), `"${t}" was treated as a garment`);
  }
  for (const t of ["Men's Hanes® Ultimate 3-Pack Boxer Brief Underwear with Total Support Pouch™",
                   "Shine Charm Strappy Thong Panty", "Petite Easy Paper Bag Waist Capri Pants", "6006 - Cargo Rave Pants"]) {
    assert.ok(!ctx.isAccessoryTitle(t), `"${t}" lost its size requirement`);
  }
});

await check("no invented size list exists anywhere a shopper can reach", () => {
  for (const [name, src] of [["bundle", bundle], ["producto.html", pdp]]) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(code, /function standardSizeOptions|function revealStandardSizePicker|ADULT_CLOTHING_SIZES|KIDS_SHOE_SIZES/, name + " still carries a template size list");
    assert.doesNotMatch(src, /tallas est[aá]ndar de referencia/, name + " still offers 'reference' sizes");
  }
});

await check("the RECORD decides (#411 P0): a size list means no cart without a size; no list sells plainly", () => {
  /* Every door: the funnel, the product view, the cross-sell rail, the chat, producto.html. */
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code(bundle), /apparelNeedsSize|setProductSizesUnconfirmed|Tallas por confirmar/, "the bundle still gates on title words");
  assert.doesNotMatch(code(pdp), /apparelNeedsSize|Tallas por confirmar/, "producto.html still gates on title words");
  assert.match(bundle, /const sizeList = truthfulSizes\(Array\.isArray\(item\.sizeOptions\) && item\.sizeOptions\.length \? item\.sizeOptions : item\.sizes\);\n    const chosen = String\(item\.selectedSize \|\| ''\)\.trim\(\);\n    if \(sizeList\.length && \(!chosen \|\| !sizeList\.includes\(chosen\)\)\)\{/, "addToCart lets a sized line in without its size");
  assert.match(bundle, /if \(truthfulSizes\(it\.sizes\)\.length\)\{ openCrossSellProduct\(idx\); return; \}/, "the cross-sell rail adds a sized product with no size");
  assert.match(bundle, /function chatSizeOptions\(entry\)\{\n  return truthfulSizes\(entry\.item\.sizes\)\.slice\(0, 24\);\n\}/, "the chat offers sizes that are not the store's");
  assert.match(pdp, /var sizes = truthfulSizes\(p\.sizes\);\n  var wantsSize = sizes\.length > 0;/, "producto.html decides the picker from something other than the record");
  assert.match(pdp, /if \(!size \|\| sizes\.indexOf\(size\) < 0\)\{/, "producto.html adds a sized product without a size");
});

await check("the verified lists are on the catalogue records (Danny's YoungLA example)", () => {
  const gym = JSON.parse(readFileSync(ROOT + "gymrat-catalog.json", "utf8"));
  const stack = [gym]; let hit = null;
  while (stack.length && !hit) {
    const n = stack.pop();
    if (Array.isArray(n)) stack.push(...n);
    else if (n && typeof n === "object") {
      if (n.name === "6006 - Cargo Rave Pants") hit = n; else stack.push(...Object.values(n));
    }
  }
  assert.ok(hit, "YoungLA 6006 Cargo Rave Pants is gone from the catalogue");
  assert.deepEqual(sizes(hit.sizes), ["Small", "Medium", "Large", "XLarge", "XXLarge"]);
  assert.ok(hit.sizesSource && hit.sizesTier, "the record does not say where its sizes came from");
});

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed || passed < 7) process.exit(1);
