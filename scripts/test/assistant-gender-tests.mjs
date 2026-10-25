/* ==================================================================
   THE LIVE ASSISTANT: WHO IT IS FOR, AND NO FALSE "NO TENEMOS"
   (#443 c.6373560777, Danny's iPhone call, Oct 23).

   He asked for men's Adidas running shoes. The pick was Women's Adizero
   SL2; asked again, she said "no tenemos zapatillas Adidas de running
   para hombre" while men's running shoes sat on the shelf. These run the
   page's own search_products, as the live call does.

     python3 -m http.server 8899        # from the repo root
     node scripts/test/assistant-gender-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { REALTIME_TOOLS } from "../lib/realtime-turn.js";
import { buildRealtimeSession } from "../lib/realtime-voice.js";

const BASE = process.env.ARIA_BASE_URL || "http://127.0.0.1:8899";
const exe = process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium";
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

await check("search_products takes who it is for, and the prompt carries the rule", () => {
  const sp = REALTIME_TOOLS.find((t) => t.name === "search_products");
  assert.deepEqual(sp.parameters.properties.gender.enum, ["hombre", "mujer", "niño", "niña"]);
  assert.match(sp.parameters.properties.gender.description, /pregúntale una vez/i);
  const s = buildRealtimeSession({});
  const text = JSON.stringify(s);
  assert.match(text, /¿Para hombre o para mujer\?/, "the one question is not in her instructions");
  assert.match(text, /NUNCA DIGAS \\"NO TENEMOS\\" DE ALGO QUE SÍ VENDEMOS/, "the no-false-absence rule is not in her instructions");
  assert.match(text, /broadened/);
});

const browser = await chromium.launch({ executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.route("**/cdn.tailwindcss.com/**", (r) => r.abort());
await page.route("**/.netlify/functions/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await page.goto(BASE + "/index.html", { waitUntil: "load" });
await page.waitForTimeout(4000);
const run = (args) => page.evaluate(async (a) => {
  const r = await executeRealtimeTool("search_products", a);
  return { ...r, products: (r.products || []).map((p) => ({ title: p.title, brand: p.brand })) };
}, args);

await check("Danny's ask: men's Adidas running shows men's running shoes, never women's, and says it broadened", async () => {
  for (const args of [{ query: "zapatillas de running para hombre", brand: "Adidas", limit: 4 },
                      { query: "zapatillas de running", brand: "Adidas", gender: "hombre", limit: 4 }]) {
    const r = await run(args);
    assert.ok(r.products.length >= 3, "only " + r.products.length + " for " + JSON.stringify(args));
    for (const p of r.products) {
      assert.ok(!/\bwomen'?s?\b|\bwomens\b|\bgirls?\b|\bkids?'?\b/i.test(p.title), "not for him: " + p.title);
      assert.match(p.title, /run|sneaker|shoe/i, "not a running shoe: " + p.title);
    }
    assert.equal(r.for_gender, "hombre");
    assert.equal(r.broadened, "sin la marca Adidas");
    assert.match(r.note, /NUNCA digas "no tenemos"/);
  }
});

await check("the same ask for her keeps Adidas and shows only women's", async () => {
  const r = await run({ query: "zapatillas de running", brand: "Adidas", gender: "mujer", limit: 4 });
  assert.ok(r.products.length >= 2);
  for (const p of r.products) { assert.equal(p.brand, "Adidas"); assert.ok(!/\bmen'?s\b/i.test(p.title.replace(/women'?s/gi, "")), p.title); }
  assert.equal(r.broadened, undefined, "an exact hit was reported as broadened");
});

await check("Nike for him: the kids' and women's Nike runners never lead", async () => {
  const r = await run({ query: "zapatillas para correr hombre", brand: "Nike", limit: 4 });
  assert.ok(r.products.length >= 3);
  for (const p of r.products) assert.ok(!/\bwomen'?s?\b|\bkids?'?\b/i.test(p.title), p.title);
});

await check("a search with no gender is not filtered (LEGO stays LEGO)", async () => {
  const r = await run({ query: "lego technic", limit: 3 });
  assert.equal(r.products.length, 3);
  for (const p of r.products) assert.match(p.title, /lego/i);
  assert.equal(r.for_gender, undefined);
});

await check("the page raised no errors", () => assert.deepEqual(errors, []));
await browser.close();

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
