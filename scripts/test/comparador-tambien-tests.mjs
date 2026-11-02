#!/usr/bin/env node
/* COMPARADOR WINNER + TAMBIÉN PRUEBA (#443 c.6567313255, c.6567346916). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSearch, searchPage, alsoTry } from "../../netlify/functions/_search-core.js";

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

await check("another spelling that finds more is offered: allstar <-> all star, airforce <-> air force", () => {
  const cases = [["converse all star", "converse allstar"], ["allstar", "all star"], ["airforce 1", "air force 1"], ["sweat shirt", "sweatshirt"]];
  for (const [q, want] of cases) {
    const o = searchPage(ctx, q, 1, {});
    assert.ok(o.alsoTry.some((a) => a.q === want && a.total > o.total), `${q}: ${JSON.stringify(o.alsoTry)}`);
  }
});

await check("no noise: a full answer, or a form that finds no more, offers nothing; never a junk split", () => {
  for (const q of ["nike", "vestido", "mochila", "air force 1", "converse allstar", "bluetooth"]) assert.deepEqual(searchPage(ctx, q, 1, {}).alsoTry, [], q);
  for (const q of ["converse all star", "skate board", "sweat shirt"]) {
    for (const a of searchPage(ctx, q, 1, {}).alsoTry) assert.ok(a.q.split(" ").every((w) => w.length >= 3 || /\d/.test(w)), q + ": " + a.q);
  }
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
