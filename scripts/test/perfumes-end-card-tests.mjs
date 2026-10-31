/* ==================================================================
   THE PERFUMES CAROUSEL ENDS IN A CARD THAT OPENS EVERY PERFUME
   (#443 c.6405624575, Danny, live desktop QA 2026-10-25).

   "The lead carousel just ENDS. The only way into the full department is
   the pill above the rail." Every Perfumes carousel built on the shared
   shelf -- the homepage rows, Aria Beauty's Fragancias lead -- and the
   Perfumes department's lead rail now end in a card; tapping it opens the
   whole department in the full-screen overlay (48 at a time, Mostrar
   más), never a page change. Prices in the overlay are the shelf's.

     node scripts/test/perfumes-end-card-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { answer } from "../../netlify/functions/_department-core.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(ROOT);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/.netlify/functions/department") {
    try { const o = answer(Object.fromEntries(u.searchParams)); res.writeHead(o.status, { "Content-Type": "application/json" }); res.end(JSON.stringify(o.body)); }
    catch (e) { res.writeHead(500); res.end(String(e)); }
    return;
  }
  let p = join(ROOT, decodeURIComponent(u.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

await check("the department function pages the whole department, the lead carousel first", () => {
  const a = answer({ dept: "perfumes", rail: "all", page: "0" });
  assert.equal(a.status, 200);
  assert.ok(a.body.count > 10000, "not the whole department: " + a.body.count);
  assert.equal(a.body.cards.length, 48);
  const head = JSON.parse(readFileSync(ROOT + "assets/sections/departamento/perfumes/head.json", "utf8"));
  assert.deepEqual(a.body.cards.slice(0, head.rails[0].cards.length).map((c) => c.t), head.rails[0].cards.map((c) => c.t), "the lead carousel does not lead");
  const last = answer({ dept: "perfumes", rail: "all", page: String(a.body.pages - 1) });
  const all = new Set();
  for (let p = 0; p < a.body.pages; p++) for (const c of answer({ dept: "perfumes", rail: "all", page: String(p) }).body.cards) all.add(c.r + "::" + c.t);
  assert.equal(all.size, a.body.count, "a product shows twice or not at all");
  assert.ok(last.body.cards.length > 0);
});

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
async function open(path) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await pg.goto(`${BASE}/${path}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3000);
  return { pg, errs };
}

/* ONE DOOR, ONE DESTINATION (Danny, #443 c.6534461885): every Perfumes
   end card opens the Perfumes department page; the flat "Todos los
   perfumes" grid is gone. */
await check("homepage: both Perfumes rows end in the card; it opens the Perfumes department page", async () => {
  const { pg, errs } = await open("index.html");
  await pg.evaluate(() => document.querySelector("[data-perfumes-section]").scrollIntoView());
  await pg.waitForFunction(() => document.querySelectorAll("[data-perfumes-rail] [data-perfume-card]").length > 0, null, { timeout: 15000 });
  const ends = await pg.evaluate(() => [...document.querySelectorAll("[data-perfumes-rail]")].map((r) => r.lastElementChild && r.lastElementChild.hasAttribute("data-perfumes-more")));
  assert.deepEqual(ends, [true, true], "a Perfumes row does not end in the card");
  await Promise.all([
    pg.waitForURL(/departamento\.html\?dept=perfumes$/, { timeout: 15000 }),
    pg.evaluate(() => [...document.querySelectorAll("[data-perfumes-rail]")].find((r) => r.offsetParent).lastElementChild.click()),
  ]);
  assert.deepEqual(errs, []);
  await pg.close();
});

for (const [dept, sel] of [["beauty", "#perfumesLeadRail"]]) {
  await check(`departamento ${dept}: the Perfumes lead carousel ends in the card; it opens the Perfumes department page`, async () => {
    const { pg, errs } = await open(`departamento.html?dept=${dept}`);
    await pg.waitForFunction((sel) => { const r = document.querySelector(sel); return r && r.querySelector(".card:not(.sk)"); }, sel, { timeout: 15000 });
    const last = await pg.evaluate((sel) => { const e = document.querySelector(sel).lastElementChild; return [e.className, e.getAttribute("href")]; }, sel);
    assert.match(last[0], /\brail-more\b/);
    assert.equal(last[1], "departamento.html?dept=perfumes");
    assert.deepEqual(errs, []);
    await pg.close();
  });
}
for (const f of ["index.html", "departamento.html"]) assert.doesNotMatch(readFileSync(ROOT + f, "utf8"), /Todos los perfumes/, f);

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
