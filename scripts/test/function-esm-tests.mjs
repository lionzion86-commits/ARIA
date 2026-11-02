/* ==================================================================
   NO FUNCTION LOADS A .mjs (#443 c.6475013417).

   Netlify's default bundler turns each function's .js sources into
   CommonJS and leaves a .mjs as an ES module; the bundle then require()s
   it and the function dies at load: «require() of ES Module
   .../scripts/lib/weight-comparables.mjs ... not supported». Every
   search answered a plain 502, and orders-create and resolve-weight
   share the same import. This walks each function's static import graph
   from its entry and fails on any .mjs it reaches.

     node scripts/test/function-esm-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const FN = join(ROOT, "netlify/functions");
/* Every entry is held here. (mcp.js used to import an .mjs app and was
   exempt; the Muse connector, #443 c.6578981079, is plain .js now.) */
const KNOWN = new Set([]);
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const IMPORT_RX = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;

/** The .mjs files a function entry reaches through relative static imports, with the path to each. */
export function mjsReached(entry) {
  const seen = new Set(), hits = [];
  const walk = (file, trail) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (file.endsWith(".mjs")) { hits.push(trail.concat(file).map((f) => relative(ROOT, f)).join(" -> ")); return; }
    if (!existsSync(file)) return;
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of src.matchAll(IMPORT_RX)) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith(".")) continue;
      walk(resolve(dirname(file), spec), trail.concat(file));
    }
  };
  walk(entry, []);
  return hits;
}

const entries = readdirSync(FN).filter((f) => f.endsWith(".js") && !f.startsWith("_") && !KNOWN.has(f));

check("no function reaches a .mjs through its imports (the load-time 502)", () => {
  const bad = entries.flatMap((f) => mjsReached(join(FN, f)));
  assert.deepEqual(bad, []);
});

check("search, orders-create and resolve-weight still resolve weights from the comparables table", () => {
  for (const f of ["search.js", "orders-create.js", "resolve-weight.js"]) assert.ok(entries.includes(f), f);
  const src = readFileSync(join(FN, "_weight-comparables.js"), "utf8");
  assert.match(src, /from "\.\.\/\.\.\/scripts\/lib\/comparable-key\.js"/);
});

check("the walk sees a .mjs where one is imported (the check is not blind)", () => {
  const dir = mkdtempSync(join(tmpdir(), "fn-esm-"));
  try {
    writeFileSync(join(dir, "entry.js"), 'import { x } from "./helper.js";\nexport default x;\n');
    writeFileSync(join(dir, "helper.js"), 'export { x } from "./lib.mjs";\n');
    writeFileSync(join(dir, "lib.mjs"), "export const x = 1;\n");
    assert.equal(mjsReached(join(dir, "entry.js")).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

check("the Muse connector (mcp.js) is held to the rule too", () => {
  assert.ok(entries.includes("mcp.js"));
  assert.deepEqual(mjsReached(join(FN, "mcp.js")), []);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
