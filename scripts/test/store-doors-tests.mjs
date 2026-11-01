#!/usr/bin/env node
/* EVERY STORE DOOR (#443 c.6564206674): search.html's store list is the
   storefront set, computed by scripts/build-store-doors.mjs, never a
   hand-kept copy; a store's name, or the start of it, opens its page. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { storeDoors, writeDoors } from "../build-store-doors.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const search = readFileSync(join(ROOT, "search.html"), "utf8");
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + String(e.message).split("\n")[0]); }
}
const pages = /var STORE_PAGES = "([^"]*)"/.exec(search)[1].trim().split(/\s+/);
const grab = (re) => re.exec(search)[0];
const storeKeyFor = new Function([
  /var STORE_PAGES = "[^"]*";/, /var STORE_ALIASES_FAST = \{[\s\S]*?\};/, /function nameKey[\s\S]*?\n\}/,
  /function storeKeyFor[\s\S]*?\n\}/, /var STORE_FULL_NAMES = \{[^\n]*\};/,
].map(grab).join("\n") + "\nreturn storeKeyFor;")();

await check("search.html's doors are the storefront set (node scripts/build-store-doors.mjs)", () => {
  assert.equal(writeDoors(search, storeDoors(ROOT)), search, "stale: run node scripts/build-store-doors.mjs");
});
await check("every door opens a storefront with products; empty ones and held ones have none", () => {
  for (const k of pages) {
    const ix = JSON.parse(readFileSync(join(ROOT, "assets/tienda", k, "index.json"), "utf8"));
    assert.ok(ix.count > 0, `${k}: a door to an empty store`);
  }
  for (const k of ["calzedonia", "intimissimi", "sephora"]) assert.ok(pages.includes(k), `${k} has no door`);
  for (const k of ["samsclub", "target", "nike"]) assert.ok(!pages.includes(k), `${k} is off sale but has a door`);
});
await check("a store's name, or the start of it, opens that store", () => {
  const cases = { Calzedonia: "calzedonia", calzed: "calzedonia", Intimissimi: "intimissimi", intimi: "intimissimi",
    Sephora: "sephora", sepho: "sephora", "Victoria's Secret": "victoriassecret", "Advance Auto Parts": "advanceauto",
    "Abercrombie & Fitch": "abercrombie", walma: "walmart" };
  for (const [q, want] of Object.entries(cases)) assert.equal(storeKeyFor(q), want, q);
});
await check("words that are not a store's name stay a search", () => {
  for (const q of ["zapatillas", "tenis", "vestido", "micro", "smart tv", "adidas", "mujer", "lenceria", "sams club"]) {
    assert.equal(storeKeyFor(q), "", q);
  }
});
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
