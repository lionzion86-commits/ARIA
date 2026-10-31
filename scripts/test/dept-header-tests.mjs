/* ==================================================================
   THE ROPA INTERIOR HEADER ON EVERY DEPARTMENT (#443 c.6545712892).

   Danny passed Ropa Interior and wants every department that way:
   hero stats chips, the audience switch (a full-view switch), Por tipo /
   Por marca / Por tienda / Explorar todo, and filters that narrow each
   other. These checks pin:
   DATA
   - the audience switch appears only where the data says who the
     department is for (60%+ of it known, 2+ audiences of 48+), never
     guessed: Zapatos has it; Gym Rat, whose titles do not say, does not;
   - an audience's view keeps only its own gender aisles;
   - Explorar todo is cross-dependent: each filter's options are counted
     under the other filters, and its counts add up;
   - every type label the header shows is Spanish;
   - head.json carries the stats chips.
   PAGE
   - departamento.html loads assets/js/dept-header.js and hands it the
     department through window.AriaDept; no emoji, no link out.
   BROWSER (headless Chromium, iPhone 390x844, endpoint answered locally)
   - Zapatos: stats chips, Todo / Mujer / Hombre / Niños; Mujer re-renders
     the page (stats, URL ?para=women, no Hombre aisle); the jump bar's
     Por marca draws big-card rails; Explorar todo narrows on a brand;
   - Gym Rat: no switch; an axis rail's Ver todo opens Explorar todo on it.

   RUNNING IT
     node scripts/test/dept-header-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { answer, audienceSwitch, AUD_KNOWN_SHARE, AUD_MIN, explore, axisRails, typeKeyOf, loadDept } from "../../netlify/functions/_department-core.js";
import { handler } from "../../netlify/functions/department.js";
import { DEPT_RULES } from "../build-department-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PAGE = readFileSync(ROOT + "departamento.html", "utf8");
const JS = readFileSync(ROOT + "assets/js/dept-header.js", "utf8");
const readJSON = (rel) => JSON.parse(readFileSync(ROOT + rel, "utf8"));
const DEPTS = Object.keys(DEPT_RULES);

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

await check("head.json carries the hero's stats chips for every department", () => {
  for (const k of DEPTS) {
    const h = readJSON(`assets/sections/departamento/${k}/head.json`);
    assert.ok(h.stats && h.stats.n === h.count, `${k}: stats.n ${h.stats && h.stats.n} vs count ${h.count}`);
    assert.ok(h.stats.stores === (h.stores || []).length, `${k}: stats.stores`);
  }
});

await check("the audience switch only where the data says who it is for -- Zapatos yes, Gym Rat (titles say nothing) no", () => {
  for (const k of DEPTS) {
    const h = readJSON(`assets/sections/departamento/${k}/head.json`);
    const d = loadDept(k);
    const known = d.list.filter((p) => p.u).length / Math.max(1, d.list.length);
    if (h.aud) {
      assert.ok(known >= AUD_KNOWN_SHARE, `${k}: a switch on ${Math.round(known * 100)}% known`);
      assert.ok(h.aud.length >= 2 && h.aud.every((o) => o.n >= AUD_MIN), `${k}: a thin audience`);
    }
    assert.deepEqual(h.aud || null, k === "perfumes" ? null : audienceSwitch(d.list), `${k}: head.aud is stale`);
  }
  assert.ok(readJSON("assets/sections/departamento/shoes/head.json").aud, "Zapatos has no switch");
  assert.ok(!readJSON("assets/sections/departamento/gym_rat/head.json").aud, "Gym Rat has a switch it cannot back");
  assert.ok(!readJSON("assets/sections/departamento/perfumes/head.json").aud, "Perfumes keeps its own doors");
});

await check("an audience's view keeps only its own gender aisles (no Zapatillas Hombre under Mujer)", () => {
  for (const u of ["women", "men", "kids"]) {
    const r = answer({ dept: "shoes", u });
    assert.equal(r.status, 200);
    const other = { women: /Hombre|Niños$/, men: /Mujer|Niños$/, kids: /Mujer$|Hombre$/ }[u];
    const bad = r.body.rails.filter((x) => /^tipo:[^:]+:(women|men|kids)$/.test(x.k || "") && other.test(x.title));
    assert.deepEqual(bad.map((x) => x.title), [], `${u} view shows ${bad.map((x) => x.title).join(", ")}`);
    assert.equal(r.body.u, u);
    assert.equal(r.body.stats.n, r.body.count);
  }
});

await check("Explorar todo is cross-dependent: a brand narrows the types and stores, and the counts add up", () => {
  const all = answer({ dept: "gym_rat", explore: "1" }).body;
  const sum = (l) => l.reduce((a, x) => a + x[2], 0);
  assert.equal(sum(all.facets.t), all.count, "type counts do not add up to the total");
  assert.equal(sum(all.facets.r), all.count, "store counts do not add up to the total");
  const brand = all.facets.b[1];
  const one = answer({ dept: "gym_rat", explore: "1", b: brand[0] }).body;
  assert.equal(one.count, brand[2], "the brand's count in the filter is not what the brand shows");
  assert.equal(sum(one.facets.t), one.count);
  assert.ok(one.facets.r.length < all.facets.r.length, "a brand did not narrow the stores");
  assert.equal(one.facets.b.length, all.facets.b.length, "the brand filter lost its own options");
  const t = one.facets.t[0];
  const two = answer({ dept: "gym_rat", explore: "1", b: brand[0], t: t[0] }).body;
  assert.equal(two.count, t[2]);
  assert.ok(two.cards.length > 0 && two.cards.length <= 48);
  const low = answer({ dept: "gym_rat", explore: "1", sort: "low" }).body.cards.map((c) => c.p);
  assert.deepEqual(low, [...low].sort((a, b) => a - b), "Precio: menor a mayor is not sorted");
});

await check("every type label the header shows is Spanish (English is never shown as Spanish copy)", () => {
  const EN = /\b(and|for|with|sets?|computers?|pillows?|glasses|plates|towels|bowls|tanks?|pants?|bottoms|women|men|kids|accessories|headphones|cameras|lamps|drives|keyboards|other|blankets|apparel|bowls)\b/i;
  const bad = new Set();
  for (const k of DEPTS) {
    const ex = answer({ dept: k, explore: "1" }).body;
    for (const [, label] of ex.facets.t) if (EN.test(label)) bad.add(`${k}: ${label}`);
    for (const axis of ["tipo"]) for (const r of answer({ dept: k, axis }).body.rails) if (EN.test(r.title)) bad.add(`${k} axis: ${r.title}`);
  }
  assert.deepEqual([...bad], []);
});

await check("the axes: big-card rails of 3+ products, biggest first, each opening its Explorar todo filter", () => {
  for (const axis of ["tipo", "marca", "tienda"]) {
    const r = answer({ dept: "shoes", axis }).body;
    assert.ok(r.rails.length > 0, axis);
    for (let i = 1; i < r.rails.length; i++) assert.ok(r.rails[i - 1].count >= r.rails[i].count, `${axis} not biggest first`);
    for (const x of r.rails) { assert.ok(x.count >= 3 && x.cards.length <= 12 && x.f === { tipo: "t", marca: "b", tienda: "r" }[axis]); }
  }
  assert.equal(answer({ dept: "shoes", axis: "nope" }).status, 404);
});

await check("the endpoint caches each answer by every parameter the header sends", async () => {
  const r = await handler({ httpMethod: "GET", queryStringParameters: { dept: "shoes", explore: "1", u: "women" } });
  assert.equal(r.statusCode, 200);
  for (const k of ["u", "axis", "explore", "sort"]) assert.match(r.headers["Netlify-Vary"], new RegExp("\\b" + k + "\\b"), `Netlify-Vary lacks ${k}`);
});

await check("the page: dept-header.js loads, AriaDept hands it the department, no emoji, no link out", () => {
  assert.match(PAGE, /<script src="\/assets\/js\/dept-header\.js" defer><\/script>/);
  assert.match(PAGE, /window\.AriaDept = \{/);
  assert.match(PAGE, /if \(fU\) u \+= '&u=' \+ encodeURIComponent\(fU\);/);
  for (const src of [JS, PAGE]) {
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), "an emoji");
    assert.ok(!/target="_blank"|window\.open/.test(src), "a link out");
  }
  assert.match(JS, /Por tipo/); assert.match(JS, /Explorar todo/);
});

/* ---------- the browser ---------- */
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { /* no browser here */ }
if (chromium) {
  const PHOTO = readFileSync(ROOT + "assets/sections/tiendas-mall-row.jpg");
  const TYPES = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.includes("exchange-rate")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"venta":3.75}'); return; }
    if (u.pathname === "/.netlify/functions/department") { const r = await handler({ httpMethod: "GET", queryStringParameters: Object.fromEntries(u.searchParams) }); res.writeHead(r.statusCode, { "Content-Type": "application/json" }); res.end(r.body); return; }
    if (u.pathname.startsWith("/.netlify/")) { res.writeHead(404); res.end("{}"); return; }
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.route((u) => u.host !== new URL(base).host, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/jpeg", body: PHOTO }) : r.abort());
  const ex = () => page.evaluate(() => ({ count: document.getElementById("dhCount").textContent, t: document.getElementById("dhT").options.length, r: document.getElementById("dhR").options.length, cards: document.querySelectorAll("#dhGrid .card").length }));

  await check("Zapatos on a phone: stats chips, the switch, Mujer re-renders the page, Por marca rails, Explorar todo narrows", async () => {
    await page.goto(base + "/departamento.html?dept=shoes", { waitUntil: "load" });
    await page.waitForSelector("#dhStats:not([hidden])", { timeout: 15000 });
    assert.match(await page.textContent("#dhStats"), /productos.*tiendas.*en oferta/);
    assert.deepEqual(await page.$$eval("#dhAud button", (bs) => bs.map((x) => x.firstChild.textContent)), ["Todo", "Mujer", "Hombre", "Niños"]);
    assert.equal(await page.isVisible("#toolbar"), false, "the old store-chip wall is still drawn");
    const before = await page.textContent("#dhStats");
    await page.click('#dhAud button[data-u="women"]');
    await page.waitForFunction((b0) => document.getElementById("dhStats").textContent !== b0, before, { timeout: 15000 });
    assert.match(page.url(), /para=women/);
    const titles = await page.$$eval("#rails .rail-sec h2, #salesTop h2", (hs) => hs.map((h) => h.textContent));
    assert.ok(!titles.some((t) => /Hombre$/.test(t)), "a Hombre aisle under Mujer: " + titles.join(", "));
    await page.click('#dhJump a[href="#dh-marca"]');
    await page.waitForSelector("#dh-marca .rail .card", { timeout: 15000 });
    const w = await page.$eval("#dh-marca .rail .card", (c) => c.offsetWidth);
    assert.ok(w >= 232, `axis card ${w}px is not the big card`);
    await page.click('#dhJump a[href="#dh-explorar"]');
    await page.waitForSelector("#dhGrid .card", { timeout: 15000 });
    const a = await ex();
    await page.selectOption("#dhB", { index: 1 });
    await page.waitForFunction((c0) => document.getElementById("dhCount").textContent !== c0, a.count, { timeout: 15000 });
    const z = await ex();
    assert.ok(z.r < a.r && z.t <= a.t, `a brand did not narrow the other filters: ${JSON.stringify([a, z])}`);
    assert.ok(z.cards > 0);
  });

  await check("Gym Rat on a phone: no switch (the data does not say), an axis rail's Ver todo opens Explorar todo on it", async () => {
    await page.goto(base + "/departamento.html?dept=gym_rat", { waitUntil: "load" });
    await page.waitForSelector("#dhStats:not([hidden])", { timeout: 15000 });
    assert.equal(await page.isHidden("#dhAud"), true);
    await page.click('#dhJump a[href="#dh-tipo"]');
    await page.waitForSelector("#dh-tipo .dh-open", { timeout: 15000 });
    const title = await page.$eval("#dh-tipo .rail-sec h2", (h) => h.textContent);
    await page.click("#dh-tipo .dh-open");
    await page.waitForFunction(() => document.getElementById("dhT").value !== "", null, { timeout: 15000 });
    assert.ok((await page.$eval("#dhT", (s) => s.selectedOptions[0].textContent)).startsWith(title));
    assert.deepEqual(errs, []);
  });
  await b.close(); server.close();
} else console.log("    --   no Playwright here: the browser checks were skipped");

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
