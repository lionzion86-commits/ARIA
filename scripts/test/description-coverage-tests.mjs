/* ==================================================================
   NO PRODUCT LOSES ITS SPANISH, NO STORE GROWS ITS GAP (#443
   c.6535043159, the ingest guard).

   The product page shows only `description`, and it must be stored
   Spanish. scripts/audit-description-language.mjs counts, per store,
   the records the product pages show with NO description. A store may
   ship with missing descriptions only up to the count and reason its
   entry in scripts/data/description-missing-ledger.json records (each
   one an open backfill on #443); a build that adds to a store's gap
   fails here. When a backfill lands, lower the ledger to the new count.

     node scripts/test/description-coverage-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("../../", import.meta.url).pathname;
const ledger = JSON.parse(readFileSync(ROOT + "scripts/data/description-missing-ledger.json", "utf8"));
const audit = JSON.parse(execFileSync("node", [ROOT + "scripts/audit-description-language.mjs", "--json"], { cwd: ROOT, maxBuffer: 64 << 20 }).toString());
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

check("no store has more products without a description than its ledger allows", () => {
  const over = [];
  for (const [store, row] of Object.entries(audit)) {
    const allowed = ledger[store] ? ledger[store].maxMissing : 0;
    if ((row.none || 0) > allowed) over.push(`${store}: ${row.none} missing, ledger allows ${allowed}`);
  }
  assert.deepEqual(over, []);
});

check("every ledger entry says why, and none is stale (lower it when a backfill lands)", () => {
  for (const [store, e] of Object.entries(ledger)) {
    assert.ok(String(e.reason || "").length > 10, `${store}: no reason`);
    const now = audit[store] ? audit[store].none || 0 : 0;
    assert.ok(e.maxMissing <= now + 0, `${store}: ledger ${e.maxMissing}, now ${now} -- lower the ledger`);
  }
});

check("the 2026-10-31 backfill: Walmart electronics, Costco electronics and SSENSE's sourced texts are Spanish", () => {
  assert.equal(audit.costco.none, 0);
  assert.ok(audit.walmart.es >= 7000, `walmart es ${audit.walmart.es}`);
  assert.ok(audit.ssense.es >= 4390, `ssense es ${audit.ssense.es}`);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
