/* ==================================================================
   THE MINIFIED BUNDLE IS THE BUNDLE (#417 night order 3).

   Phones download build/min/app-<hash>.js (netlify.toml rewrites the
   source name to it). If it were missing the site would not boot; if
   it were stale, phones would run old code while every test passed on
   the source. These checks keep the two the same program.

   RUNNING IT (needs devDependencies: npm install)
     node scripts/test/app-min-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { minify, bundleName, MIN_DIR } from "../build-app-min.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const name = bundleName();
const source = readFileSync(ROOT + "build/" + name, "utf8");
const minPath = ROOT + MIN_DIR + "/" + name;

await check("the minified copy of the bundle index.html loads exists and is current", async () => {
  assert.ok(existsSync(minPath), `${MIN_DIR}/${name} is missing — run: node scripts/build-app-min.mjs`);
  const fresh = await minify(source);
  assert.ok(readFileSync(minPath, "utf8") === fresh, `${MIN_DIR}/${name} is stale — run: node scripts/build-app-min.mjs`);
});

/* ONE BUNDLE, NAMED FOR ITS CONTENT (2026-11-03). A merge kept a second
   bundle beside the one index.html loads and folded its edits into the
   loaded file without renaming it: the source said one thing, its
   minified copy (what phones run) another, and a stray file sat in
   build/ looking live. The name is the content's sha256, and it is the
   only bundle there is. */
await check("the bundle's name is its content: app-<first 16 hex of its sha256>.js", () => {
  const hash = createHash("sha256").update(readFileSync(ROOT + "build/" + name)).digest("hex").slice(0, 16);
  assert.equal(name, `app-${hash}.js`, `build/${name} was edited without the rehash -- rename it to app-${hash}.js and point index.html at it`);
});

await check("no stray bundle: build/ and build/min/ hold only the app-<hash>.js index.html loads", () => {
  const stray = [
    ...readdirSync(ROOT + "build").filter((f) => /^app-.*\.js$/.test(f) && f !== name).map((f) => "build/" + f),
    ...(existsSync(ROOT + MIN_DIR) ? readdirSync(ROOT + MIN_DIR).filter((f) => /^app-.*\.js$/.test(f) && f !== name).map((f) => MIN_DIR + "/" + f) : []),
  ];
  assert.deepEqual(stray, [], `index.html loads build/${name}; delete the others`);
});

await check("every top-level function keeps its name (inline handlers call them)", () => {
  const min = readFileSync(minPath, "utf8");
  const names = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)].map((m) => m[1]);
  assert.ok(names.length > 500, `only ${names.length} top-level functions found`);
  /* A function declared inside a block (the voice code's
     `if (SpeechRecognitionAPI) { function ... }`) comes out as the
     equivalent `var NAME = function`, still a global binding. */
  const lost = names.filter((n) => !new RegExp(`function ${n}\\(|\\b${n}=function\\b`).test(min));
  assert.deepEqual(lost, [], "renamed or dropped by the minifier");
});

await check("netlify.toml serves the minified copy at the source's address", () => {
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  const a = toml.indexOf('from = "/build/min/*"'), b = toml.indexOf('from = "/build/*"');
  assert.ok(a > 0 && b > a, "the /build/min/* identity rule must come before the /build/* rewrite");
  assert.match(toml.slice(b, b + 120), /to = "\/build\/min\/:splat"\s*\n\s*status = 200\s*\n\s*force = true/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
