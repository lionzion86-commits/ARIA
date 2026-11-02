#!/usr/bin/env node
/* COMPARADOR WINNER + TAMBIÉN PRUEBA (#443 c.6567313255, c.6567346916). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSearch, searchPage, alsoTry, spellingForms } from "../../netlify/functions/_search-core.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const page = readFileSync(join(ROOT, "search.html"), "utf8");
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + String(e.message).split("\n")[0]); }
}
const ctx = loadSearch();

await check("the winner (Mejor costo hasta Miami) is filled light blue, never yellow; every store keeps its breakdown", () => {
  assert.match(page, /'<a class="cmp-row bd' \+ \(s\.bestCost \? " win" : ""\)/);
  const css = /\.cmp-row\.win\{[^}]*\}/.exec(page)[0];
  assert.match(css, /background:#DCEBFF/);
  assert.doesNotMatch(css, /gold|#F4C463|#FFD|yellow/i);
  const o = searchPage(ctx, "air force 1", 1, { fx: 3.75 });
  const rows = (o.compares || []).flatMap((c) => c.stores);
  assert.ok(rows.length >= 2 && rows.some((s) => s.bestCost), "no chart with a winner for «air force 1»");
});

await check("«Compara el mismo producto en diferentes tiendas» stands out (bold, brand blue, larger)", () => {
  const css = /\.cmp-sec-sub\{[^}]*\}/.exec(page)[0];
  assert.match(css, /font-weight:800/);
  assert.match(css, /color:var\(--blue\)/);
});

await check("ONE NAME, ONE SEARCH (#443 c.6568542763): joined, separated and hyphenated spellings give the same results and the same comparison charts", () => {
  const sig = (q) => { const o = searchPage(ctx, q, 1, {}); return { total: o.total, charts: (o.compares || []).map((c) => c.title) }; };
  for (const [a, b] of [["converse all star", "converse allstar"], ["all star", "all-star"], ["all star", "allstar"], ["sweat shirt", "sweatshirt"]]) {
    assert.deepEqual(sig(a), sig(b), a + " vs " + b);
  }
  const cs = sig("converse all star");
  assert.ok(cs.charts.length && cs.charts.some((t) => /AS-1 Pro/.test(t)), "Danny's case: «Converse All Star» separated shows the AS-1 Pro chart: " + JSON.stringify(cs.charts));
  for (const [a, b] of [["air force 1", "airforce 1"], ["new balance 9060", "newbalance 9060"]]) {
    const x = sig(a), y = sig(b);
    assert.deepEqual(x.charts, y.charts, a + " vs " + b + ": charts");
    assert.ok(Math.abs(x.total - y.total) <= Math.max(10, 0.3 * Math.max(x.total, y.total)), a + " vs " + b + ": " + x.total + " / " + y.total);
  }
});

await check("no noise: a full answer offers no other spelling; never a junk split", () => {
  for (const q of ["nike", "vestido", "mochila", "air force 1", "converse allstar", "converse all star", "bluetooth"]) assert.deepEqual(searchPage(ctx, q, 1, {}).alsoTry, [], q);
  for (const q of ["converse all star", "skate board", "sweat shirt", "allstar"]) for (const { q: f } of spellingForms(ctx, q)) assert.ok(f.split(" ").every((w) => w.length >= 3 || /\d/.test(w)), q + ": " + f);
  assert.deepEqual(alsoTry(ctx, "", 0), []);
});

await check("search.html shows «También prueba:» as tappable chips that re-run the search", () => {
  assert.match(page, /También prueba:/);
  assert.match(page, /tb\.addEventListener\("click", function\(\)\{ searchFor\(a\.q\); \}\)/);
});

await check("Aria Perfumes ships on FragranceX's rule (free from $49, $6.95 under), measured on the shopper's price -- never POR CALCULAR, never a cost", async () => {
  const S = await import("../lib/store-shipping.js");
  assert.equal(S.shippingRuleText("ariaperfumes"), "Envío gratis desde $49 · $6.95 debajo de ese monto");
  const line = (price) => ({ retailer: "ariaperfumes", title: "x", priceUsd: price, dutiableUsd: Math.round(price / 1.18 * 100) / 100, qty: 1 });
  const under = S.cartShipping([line(39)]).stores[0], over = S.cartShipping([line(95)]).stores[0];
  assert.equal(under.feeUsd, 6.95); assert.equal(under.subtotalUsd, 39);
  assert.equal(over.feeUsd, 0); assert.equal(over.subtotalUsd, 95);
  const co = readFileSync(join(ROOT, "checkout.html"), "utf8");
  assert.match(co, /data-ship-explainer/);
  assert.match(co, /por eso ves un envío por tienda/);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
