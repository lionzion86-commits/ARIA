/* ==================================================================
   TALLAS PLUS (Danny, #443 c.6526833313).

     - the name: «Tallas Plus» everywhere a shopper reads it ("Curvy"
       stays only as the department key in the links);
     - membership by real sizes: apparel the store offers in women's XL /
       1X+ / 14+ or men's XL+ / waist 40+, from the store's own run --
       never a title word, never a child's, never a cream or an accessory;
     - back on the homepage as a category carousel right after Ropa
       Interior Hombre, and Aria Luxury moved up, right after Aria
       Perfumes, ahead of the category run (composed with #561's order).

     node scripts/test/tallas-plus-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isExtendedSize, hasExtendedSizes } from "../lib/sizes.js";
import { loadAllItems, DEPT_RULES, belongsToDept, isTallasPlus } from "../build-department-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");
const json = (f) => JSON.parse(read(f));
const item = (title, sizes, extra = {}) => ({ title, sizes, type: "", retailer: "skims", bucket: "women", brand: "", ...extra });

check("the size line: women's XL / 1X+ / 14+, men's XL+ / waist 40+", () => {
  for (const s of ["XL", "XXL", "2X", "1X Petite", "XL Tall", "16W", "22/24"]) assert.equal(isExtendedSize(s, "women"), true, s);
  for (const s of ["L", "M", "12", "Womens Plus", "curvy"]) assert.equal(isExtendedSize(s, "women"), false, s);
  for (const s of ["XL", "2XL-T", "40x32", "42"]) assert.equal(isExtendedSize(s, "men"), true, s);
  for (const s of ["L", "38", "16.5"]) assert.equal(isExtendedSize(s, "men"), false, s);
  /* A bra band or a jeans waist is not a dress size. */
  assert.equal(hasExtendedSizes({ availableSizes: ["30", "32", "34", "36", "38", "40", "A", "B", "C", "D"] }), false, "bra bands");
  assert.equal(hasExtendedSizes({ availableSizes: ["24", "25", "26", "27", "28", "29", "30", "31"] }), false, "jeans waists");
  assert.equal(hasExtendedSizes({ availableSizes: ["0", "2", "4", "6", "8", "10", "12", "14", "16"] }), true, "a dress run to 16");
});

check("membership: apparel in her or his extended run; never a word, a child, a cream", () => {
  assert.equal(isTallasPlus(item("Soft Lounge Long Slip Dress", ["S", "M", "L", "XL", "2X", "3X"])), true);
  assert.equal(isTallasPlus(item("Curvy Fit High-Rise Jean", ["24", "25", "26", "27", "28"])), false, "a curvy fit in regular sizes");
  assert.equal(isTallasPlus(item("Plus Size Tunic", ["S", "M", "L"])), false, "Plus in the title");
  assert.equal(isTallasPlus(item("Revive Body Cream", ["Womens Plus"], { retailer: "revolve" })), false, "the REVOLVE cream");
  assert.equal(isTallasPlus(item("Girls Graphic Tee", ["XS", "S", "M", "L", "XL"])), false, "a child's XL");
  assert.equal(isTallasPlus(item("Leather Tote Bag", ["XL"])), false, "an accessory");
  assert.equal(isTallasPlus(item("Men's Relaxed Chino", ["30", "32", "34", "36", "38", "40", "42"], { bucket: "men" })), true, "a men's waist 40");
});

check("the built department holds only that, women first, rails in Spanish", () => {
  const h = json("assets/sections/departamento/curvy/head.json");
  assert.ok(h.count >= 500, "count " + h.count);
  for (const r of h.rails) assert.doesNotMatch(r.title, /\b(T Shirts|Bralette|Panties?|Tops|Bottoms|Mens Underwear|Accesorios)\b/, r.title);
  const all = loadAllItems(ROOT).filter((p) => belongsToDept(DEPT_RULES.curvy, p));
  assert.equal(all.length, h.count);
  assert.ok(all.every(isTallasPlus));
  /* Women lead (her section first). */
  assert.ok(h.rails.findIndex((r) => /para hombre/.test(r.title)) > h.rails.findIndex((r) => r.title === "Vestidos"), "his rails after hers");
});

check("the name is «Tallas Plus» wherever a shopper reads it", () => {
  const bundle = read("build/" + read("index.html").match(/build\/(app-[0-9a-f]{16}\.js)/)[1]);
  assert.match(bundle, /curvy: \{ label: 'Tallas Plus'/);
  assert.match(bundle, /\{ key: 'curvy', label: 'Tallas Plus'/);
  assert.doesNotMatch(bundle, /'Ofertas Curvy'|aria-label="Curvy"|'Curvy<\/h2>'/, "an old Curvy title in the bundle");
  assert.match(read("departamento.html"), /curvy:\s+\{name:'Tallas Plus'/);
  assert.match(read("categorias.html"), />Tallas Plus<\/a>/);
  for (const f of ["index.html", "departamento.html", "categorias.html"]) assert.doesNotMatch(read(f).replace(/<!--[\s\S]*?-->/g, ""), />\s*Curvy\s*</, f);
});

check("homepage: a Tallas Plus carousel after Ropa Interior (the block's last two); Aria Luxury moved up", () => {
  const html = read("index.html");
  const mobile = html.slice(html.indexOf('<div id="mobileShopfront"'), html.indexOf('<div id="desktopShopfront"'));
  const desktop = html.slice(html.indexOf('<div id="desktopShopfront"'));
  const at = (tree, label) => tree.indexOf(`aria-label="${label}"`);
  for (const [name, tree] of [["phone", mobile], ["desktop", desktop]]) {
    /* The current homepage (#561): Perfumes, then Aria Luxury (moved up,
       c.6526833313), then the category block headed by Ropa Interior
       Mujer / Hombre, Tallas Plus right after them, then Electrónica,
       Gym Rat and the rest; every store below. */
    /* Since #443 c.6567263570 Ropa Interior Hombre and Tallas Plus close the
       Todas las Tiendas block (Lencería opens it). */
    const seq = ["Aria Perfumes", "Aria Luxury", "Lencería", "Electrónica", "Gym Rat", "Ropa Interior Hombre", "Tallas Plus"].map((l) => at(tree, l));
    assert.ok(seq.every((i) => i >= 0), name + ": " + seq.join(","));
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i - 1] < seq[i], `${name}: out of order at ${i}`);
    assert.equal((tree.match(/aria-label="Aria Luxury"/g) || []).length, 1, name + ": one Aria Luxury");
    const stores = [...tree.matchAll(/data-store-rail="([a-z]+)"/g)].map((m) => m.index);
    assert.ok(stores.length && Math.min(...stores) > at(tree, "Tallas Plus"), name + ": a store above Tallas Plus");
    const sec = tree.slice(at(tree, "Tallas Plus"), tree.indexOf("</section>", at(tree, "Tallas Plus")));
    assert.match(sec, /data-category-rail-row="curvy"/, name + ": the shared category rail paints it");
    assert.match(sec, /href="\/departamento\.html\?dept=curvy"/, name + ": opens the department");
  }
  assert.equal((html.match(/data-category-rail-row="curvy"/g) || []).length, 2, "phone and desktop");
  const cat = json("assets/home/shelves/category.json").rails.curvy;
  assert.ok(Array.isArray(cat) && cat.length >= 8, "the homepage shelf is filled");
  for (const p of cat) assert.ok(hasExtendedSizes({ availableSizes: p.sizes }, "women") || hasExtendedSizes({ availableSizes: p.sizes }, "men"), p.title);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
