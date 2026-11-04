#!/usr/bin/env node
/* THE ALL-STORES PAGE LISTS EVERY LIVE STOREFRONT (#443 c.6585655315 P4).
   18 working storefronts (Montce, FARM Rio, ViX, RevZilla, TNS, Dennis
   Kirk... 14,047 products) had no tile on tiendas.html, nor Foot Locker,
   SSENSE or Victoria's Secret, which have home rails. The grid is now the
   storefront set (scripts/build-store-doors.mjs): a tienda.html registry
   store with a non-empty assets/tienda/<key>/index.json, not off sale. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { storeDoors, writeDirectory } from "../build-store-doors.mjs";
import { isOffSaleRetailer } from "../lib/off-sale.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(ROOT, "tiendas.html"), "utf8");
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + String(e.message).split("\n")[0]); }
}
const doors = storeDoors(ROOT);
const grid = /<div class="store-grid">([\s\S]*?)<\/div>/.exec(html)[1];
const tiles = [...grid.matchAll(/<a class="store-card" href="tienda\.html\?tienda=([a-z0-9]+)"([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ key: m[1], hidden: /\bhidden\b/.test(m[2]), label: m[3] }));
const shown = tiles.filter((t) => !t.hidden).map((t) => t.key);

await check("tiendas.html's grid is the storefront set (node scripts/build-store-doors.mjs)", () => {
  assert.equal(writeDirectory(html, doors), html, "stale: run node scripts/build-store-doors.mjs");
});
await check("every live storefront has a tile, and every tile opens a live storefront", () => {
  const missing = doors.keys.filter((k) => !shown.includes(k));
  assert.deepEqual(missing, [], `live storefronts missing from tiendas.html: ${missing.join(", ")}`);
  for (const k of shown) {
    const f = join(ROOT, "assets/tienda", k, "index.json");
    assert.ok(existsSync(f) && JSON.parse(readFileSync(f, "utf8")).count > 0, `${k}: a tile that opens onto nothing`);
    assert.ok(!isOffSaleRetailer(k), `${k} is off sale`);
  }
  assert.equal(new Set(shown).size, shown.length, "a store listed twice");
});
await check("Montce, FARM Rio, ViX, RevZilla, TNS, Dennis Kirk, Foot Locker, SSENSE and Victoria's Secret are listed; Best Buy is not", () => {
  for (const k of ["montce", "farmrio", "vix", "revzilla", "tns", "denniskirk", "footlocker", "ssense", "victoriassecret"]) assert.ok(shown.includes(k), `${k} is not on tiendas.html`);
  assert.ok(!tiles.some((t) => t.key === "bestbuy"), "Best Buy is off sale (off-sale.js) but has a tile");
});
await check("the count line is the number of live storefronts; a pending store's tile ships hidden", () => {
  assert.match(html, new RegExp(`>${doors.keys.length} tiendas activas</p>`));
  for (const t of tiles.filter((x) => x.hidden)) assert.ok(doors.pending.includes(t.key), `${t.key} is hidden but not pending`);
  /* DSW was the pending store until its catalogue was stocked (#611): now a live tile. */
  assert.ok(tiles.some((t) => t.key === "dsw" && !t.hidden), "DSW is stocked but has no live tile");
  assert.ok(tiles.some((t) => t.key === "tenniswarehouse" && !t.hidden), "Tennis Warehouse is stocked but has no live tile");
});
/* The homepage Tiendas strip reads as a row you swipe (#348, re-applied
   2026-11-04, #443 c.6623383286): two lines, «Desliza» over the tap
   instruction, light on the blue backdrop (it was #6B7487 grey on blue). */
await check("the homepage Tiendas strip says it swipes, in two lines, on both bands", () => {
  const home = readFileSync(join(ROOT, "index.html"), "utf8");
  const hints = [...home.matchAll(/<span data-tiendas-hint[^>]*style="([^"]*)"><span class="block">([^<]*)<\/span><span class="block">([^<]*)<\/span><\/span>/g)];
  assert.equal(hints.length, 2, "one hint on the phone band, one on the desktop band");
  for (const [, style, l1, l2] of hints) {
    assert.equal(l1, "Desliza");
    assert.equal(l2, "Toca un logo para ir a su tienda");
    assert.match(style, /color:#DCE6FA/i);
  }
  assert.ok(!/color:#6B7487">Toca un logo/.test(home), "the old one-line grey hint is gone");
});
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
