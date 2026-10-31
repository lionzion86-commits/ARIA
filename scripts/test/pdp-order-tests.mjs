/* ==================================================================
   THE PRODUCT-PAGE LAW (Danny, #443 c.6534945667): every product page
   stacks TÍTULO, then DESCRIPCIÓN directly under it, then PRECIO
   directly under the description -- readable at first glance, never
   buried at the bottom of the page.

     node scripts/test/pdp-order-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
const page = readFileSync(ROOT + "producto.html", "utf8");
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

/* The product's own render: the one that wires the description. */
const end = page.indexOf("wireDescMore();");
const render = page.slice(page.lastIndexOf('el("p-body").innerHTML =', end), end);

check("título, then descripción, then precio, in the one column the shopper reads", () => {
  const h1 = render.indexOf("<h1"), d = render.indexOf("+ desc"), pr = render.indexOf("+ priceHtml");
  assert.ok(h1 > 0 && d > h1 && pr > d, `h1 ${h1}, desc ${d}, price ${pr}`);
  /* Nothing heavier than the store line sits between the title and the description. */
  const between = render.slice(h1, d);
  assert.doesNotMatch(between, /priceHtml|buy-box|conditionHtml/);
});

check("the description is no longer a section at the bottom of the page", () => {
  assert.doesNotMatch(render, /'<\/div><\/div>' \+ desc/);
  assert.doesNotMatch(page, /<section class="block"><h2>Descripción<\/h2>/);
});

check("readable at first glance: body text in ink, a long text opens on its first lines with Leer más", () => {
  assert.match(page, /\.p-desc-t\{font-size:15px;line-height:1\.6;color:var\(--ink\)/);
  assert.match(page, /-webkit-line-clamp:5/);
  assert.match(page, /id="p-desc-more" hidden aria-expanded="false">Leer más</);
  assert.match(page, /wireDescMore\(\);/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
