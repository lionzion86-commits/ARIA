/* ==================================================================
   ONE PRICE EVERYWHERE — THE STANDALONE PAGES PRICE LIKE THE SPA.

   weight-data.js: "Every price on the site is built as
   (raw + tieredMarginUsd(raw)) x taxRate". The SPA did; the standalone
   pages (tienda, search, marca, producto, departamento, motos,
   ropa-interior) stopped at the margin, 7% under the SPA for every
   retailer but Walmart. The NAV override sends almost every click to
   those pages, and checkout charges the price the cart line carries, so
   most orders were missing the Miami sales tax Aria pays at the register.

   RUNNING IT
     node scripts/test/price-parity-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadPageEngine } from "../lib/mcp/page-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const PAGES = ["tienda.html", "search.html", "marca.html", "producto.html", "departamento.html", "motos.html", "ropa-interior.html"];
const ENGINE = loadPageEngine();
const spa = (raw, retailer) => ENGINE.pricing.normalizeLiveItem({ title: "x", price: raw, retailer }, { retailer });

function lift(src, sig) {
  const at = src.indexOf(sig);
  if (at < 0) return null;
  let depth = 0, i = src.indexOf("{", at + sig.length - 1);
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  return src.slice(at, i + 1);
}
function pagePricing(file) {
  const src = readFileSync(ROOT + file, "utf8");
  const margin = lift(src, "function tieredMarginUsd(") || lift(src, "function marginUsd(");
  const exempt = /var TAX_EXEMPT = (\{[^}]*\});/.exec(src);
  const parts = [margin, exempt && exempt[0], lift(src, "function salesTaxRate("), lift(src, "function finalUsd(")];
  assert.ok(parts.every(Boolean), `${file}: pricing functions moved — update this test`);
  const api = new Function(parts.join("\n") + "\nreturn { finalUsd, salesTaxRate, TAX_EXEMPT };")();
  return { ...api, src };
}

const index = readFileSync(ROOT + "index.html", "utf8");
const statusBlock = /const TAX_EXEMPT_STATUS = \{([\s\S]*?)\n\};/.exec(index)[1];
const SPA_EXEMPT = [...statusBlock.matchAll(/^\s*([a-z0-9_]+):\s*'exempt'/gm)].map((m) => m[1]).sort();

await check("the SPA's exempt list is what this test thinks it is", () => {
  assert.ok(SPA_EXEMPT.includes("walmart"), "walmart is no longer exempt in index.html");
});

for (const file of PAGES) {
  await check(`${file}: same price as the SPA card, tax included, for every kind of retailer`, () => {
    const P = pagePricing(file);
    assert.deepEqual(Object.keys(P.TAX_EXEMPT).sort(), SPA_EXEMPT, `${file}'s exempt list drifted from index.html`);
    for (const retailer of ["walmart", "target", "autozone", "gymshark", "somebrandnew"]) {
      for (const raw of [5, 54.99, 499.99, 750, 2600]) {
        assert.equal(P.finalUsd(raw, retailer), spa(raw, retailer).price,
          `${file}: ${retailer} $${raw} shows ${P.finalUsd(raw, retailer)}, the SPA card shows ${spa(raw, retailer).price}`);
      }
    }
    assert.equal(P.finalUsd(54.99, "autozone"), 72.96, "the AutoZone pad from the voice brief");
  });
}

await check("every finalUsd call on those pages passes the retailer", () => {
  for (const file of PAGES) {
    const src = readFileSync(ROOT + file, "utf8");
    const calls = [...src.matchAll(/finalUsd\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)]
      .map((m) => m[1]).filter((a) => !/^(raw|r)\s*,\s*retailer$/.test(a.trim()));
    for (const a of calls) assert.match(a, /,/, `${file}: finalUsd(${a}) has no retailer — it would price at 7% tax even for Walmart, or vice versa`);
  }
});

await check("producto.html's cart line stamps the same dutiable base as the SPA", () => {
  const src = readFileSync(ROOT + "producto.html", "utf8");
  const m = /dutiableUsd:\s*([^\n]+),\s*\r?\n/.exec(src);
  assert.ok(m, "the cart line's dutiableUsd moved");
  const P = pagePricing("producto.html");
  const stamp = (price, retailer) => new Function("p", "salesTaxRate", `return ${m[1]};`)({ price, retailer }, P.salesTaxRate);
  for (const [raw, retailer] of [[54.99, "autozone"], [19.99, "walmart"], [120, "target"]]) {
    assert.equal(stamp(raw, retailer), spa(raw, retailer).dutiableUsd, `${retailer} $${raw}`);
  }
});

const MIN_CHECKS = PAGES.length + 3;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
