/* ==================================================================
   LENCERÍA + TALLAS PLUS LEADS WITH LANE BRYANT (Danny, #443
   c.6621407508, a standing rule).

   Lane Bryant photographs its lingerie on plus-size women; the other
   stores photograph an XL on a thin model. On every surface where
   lencería meets plus sizes the first rail, or the first lingerie
   cards, are Lane Bryant's -- and the section allowlist still holds
   (scripts/lib/section-allowlist.js: every lingerie card's own TYPE is
   an intimates type).

     - Tallas Plus «Lencería» rail (head / rails-N slices) and its pages;
     - Tallas Plus opened on lingerie: ?ver=tipo:mujer-lenceria, ?t=lenceria,
       the «Por tipo» axis, the filter bar (t=lenceria, and a plus Talla
       over lingerie in Moda Mujer);
     - the homepage Tallas Plus «Todas» (its first lingerie slots) and the
       Lencería carousel's Lane Bryant pill;
     - at 390px: the department rail, the ?ver= landing, the homepage.

     node scripts/test/lane-bryant-plus-tests.mjs
     SHOT_DIR=<dir> saves lanebryant-*.png
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { intimateClass, isIntimate } from "../lib/section-allowlist.js";
import { isLingerie, leadFirst, lingerieSlotsFirst, isLingerieSet, isPlusSizeLabel, PLUS_LINGERIE_LEAD, PLUS_LINGERIE_SLOTS } from "../lib/plus-lingerie.js";
import { answer, plusLingerieView } from "../../netlify/functions/_department-core.js";
import { navFilter } from "../../netlify/functions/_nav-filter-core.js";
import { buildCategoryPills } from "../build-home-category-pills.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LB = PLUS_LINGERIE_LEAD;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const json = (f) => JSON.parse(readFileSync(join(ROOT, f), "utf8"));

/* The Tallas Plus rows (the endpoint's own data): type by store + title. */
const FN = json("assets/sections/departamento/_fn/curvy.json");
const TYPE = new Map(FN.rows.map((r) => [r[2] + "::" + r[0], r[7]]));
const typeOfCard = (c) => TYPE.get(c.r + "::" + c.t) ?? "";
const allowlisted = (c) => isIntimate({ title: c.t, type: typeOfCard(c) });
const NONE = { u: "", t: "", s: "", b: "", z: "", p: "", o: "", fx: 0 };

/* ---------- depth (printed, and the floor the rule stands on) ---------- */
const depth = {};
for (const r of FN.rows) if (r[2] === LB) { const c = intimateClass({ title: r[0], type: r[7] }) || "no lencería"; depth[c] = (depth[c] || 0) + 1; }
console.log("    Lane Bryant en Tallas Plus: " + Object.entries(depth).map(([k, n]) => `${k} ${n}`).join(", "));

await check("Lane Bryant's plus lingerie is real stock: bras and panties by the allowlist, every one in an extended run", () => {
  assert.ok((depth.bra || 0) >= 20, "bras " + depth.bra);
  assert.ok((depth.panty || 0) >= 20, "panties " + depth.panty);
});

await check("the helpers: Lane Bryant first, stable; a mixed rail's first lingerie slots are Lane Bryant's; nothing outside lingerie moves", () => {
  const a = { r: "skims", t: "Thong", pt: "Panties" }, b = { r: LB, t: "Cotton Hipster Panty", pt: "Panties" }, c = { r: "skims", t: "Tee", pt: "Tops" };
  assert.deepEqual(leadFirst([a, c, b]), [b, a, c]);
  const rail = [{ retailer: LB, title: "Perfect Tee", _type: "Tops" }, { retailer: "skims", title: "Fits Everybody Bra", _type: "Bras" }, { retailer: "macys", title: "Dress", _type: "DRESS" }];
  const pool = [{ retailer: LB, title: "Cotton Bralette", _type: "Bras" }];
  const out = lingerieSlotsFirst(rail, pool);
  assert.deepEqual(out.map((x) => x.title), ["Perfect Tee", "Cotton Bralette", "Dress"]);
  assert.equal(out.length, rail.length);
  assert.equal(isLingerieSet([b, a]), true);
  assert.equal(isLingerieSet([c, c, b]), false);
  assert.equal(plusLingerieView("women", [b, a]), false, "only Tallas Plus");
  for (const z of ["1X", "2X", "3XL", "16W"]) assert.equal(isPlusSizeLabel(z), true, z);
  for (const z of ["M", "36D", "US 8", "14"]) assert.equal(isPlusSizeLabel(z), false, z);
});

/* ---------- the department: the «Lencería» rail and its views ---------- */
function plusRails() {
  const h = json("assets/sections/departamento/curvy/head.json");
  const rails = [...h.rails];
  for (let b = 0; ; b++) {
    const f = `assets/sections/departamento/curvy/rails-${b}.json`;
    if (!existsSync(join(ROOT, f))) break;
    for (const r of json(f).rails || []) rails[r.i] = { ...rails[r.i], ...r };
  }
  return rails;
}
await check("Tallas Plus «Lencería» (the built rail): Lane Bryant's cards first, a bra then a panty, every card allowlisted", () => {
  const r = plusRails().find((x) => x.k === "tipo:mujer-lenceria");
  assert.ok(r && r.cards && r.cards.length >= 8, "no Lencería rail");
  assert.ok(r.cards.every((c) => c.r === LB), "first cards: " + r.cards.map((c) => c.r).join(","));
  assert.equal(intimateClass({ title: r.cards[0].t, type: typeOfCard(r.cards[0]) }), "bra", "opens on a bra");
  assert.ok(r.cards.every(allowlisted), "a card outside the allowlist");
});

await check("its «Ver todo» pages: the rail's page 0 opens on Lane Bryant; the whole rail stays inside the allowlist", () => {
  const h = json("assets/sections/departamento/curvy/head.json");
  const i = h.rails.findIndex((x) => x.k === "tipo:mujer-lenceria");
  const p = answer({ dept: "curvy", rail: String(i), page: "0" }).body;
  assert.ok(p.cards.slice(0, 12).every((c) => c.r === LB), p.cards.slice(0, 12).map((c) => c.r).join(","));
  for (let pg = 0; pg < (p.pages || 1); pg++) for (const c of answer({ dept: "curvy", rail: String(i), page: String(pg) }).body.cards) assert.ok(allowlisted(c), c.r + " | " + c.t);
});

await check("Tallas Plus opened on lingerie (?ver=tipo:mujer-lenceria, ?t=lenceria): Lane Bryant's rail is the first, before Ofertas", () => {
  for (const qs of [{ dept: "curvy", ver: "tipo:mujer-lenceria" }, { dept: "curvy", t: "lenceria" }, { dept: "curvy", t: "lenceria", ver: "tipos" }]) {
    const b = answer(qs).body;
    assert.ok(b.rails && b.rails.length >= 2, JSON.stringify(qs));
    assert.equal(b.rails[0].title, "Lane Bryant", JSON.stringify(qs) + ": " + b.rails.slice(0, 3).map((r) => r.title).join(" | "));
    const r0 = answer({ ...qs, rail: "0" }).body;
    assert.ok(r0.cards.length && r0.cards.every((c) => c.r === LB), JSON.stringify(qs));
  }
  /* The set is the allowlist's own (every card is lingerie). */
  const b = answer({ dept: "curvy", ver: "tipo:mujer-lenceria" }).body;
  for (let i = 0; i < b.rails.length; i++) for (const c of answer({ dept: "curvy", ver: "tipo:mujer-lenceria", rail: String(i) }).body.cards) assert.ok(allowlisted(c), c.r + " | " + c.t);
});

await check("the «Por tipo» axis: Tallas Plus «Lencería» opens on Lane Bryant; other types keep their order", () => {
  for (const u of ["", "women"]) {
    const ax = answer({ dept: "curvy", axis: "tipo", ...(u ? { u } : {}) }).body.rails;
    const l = ax.find((r) => r.title === "Lencería");
    assert.ok(l, "no Lencería axis rail");
    assert.equal(l.cards[0].r, LB, u + ": " + l.cards.slice(0, 4).map((c) => c.r).join(","));
    const tops = ax.find((r) => r.title === "Blusas y tops");
    if (tops) assert.ok(!tops.cards.every((c) => c.r === LB), "a non-lingerie rail was reordered");
  }
});

await check("the filter bar: Tallas Plus lingerie, and a plus Talla over Moda Mujer's lingerie, open on Lane Bryant; a price sort stays a price sort", () => {
  const plus = navFilter("curvy", { ...NONE, t: "lenceria" });
  assert.ok(plus.cards.slice(0, 8).every((c) => c.r === LB), plus.cards.slice(0, 8).map((c) => c.r).join(","));
  for (const z of ["1X", "2X", "3X"]) {
    const w = navFilter("women", { ...NONE, t: "lenceria", z });
    assert.ok(w.count > 0 && w.cards[0].r === LB, z + ": " + w.cards.slice(0, 4).map((c) => c.r).join(","));
  }
  const low = navFilter("curvy", { ...NONE, t: "lenceria" }, "low");
  for (let i = 1; i < low.cards.length; i++) assert.ok(low.cards[i - 1].p <= low.cards[i].p, "price order broken at " + i);
});

/* ---------- the homepage ---------- */
const built = buildCategoryPills(ROOT);
const tp = built.carousels.find((c) => c.k === "tallas-plus");
const len = built.carousels.find((c) => c.k === "lenceria");
await check("homepage Tallas Plus «Todas»: still opens on a Lane Bryant top; its first lingerie cards are Lane Bryant's", () => {
  assert.equal(tp.defaults[0].retailer, LB);
  const lin = tp.defaults.filter(isLingerie);
  assert.ok(lin.length >= 1, "no lingerie in the mix");
  const lead = lin.slice(0, Math.min(PLUS_LINGERIE_SLOTS, lin.length));
  assert.ok(lead.every((cd) => cd.retailer === LB), lead.map((cd) => cd.retailer).join(","));
  /* The saved shelf the page paints (build-home-shelves --truth). */
  const shelf = json("assets/home/shelves/category.json").rails.curvy;
  const linTitles = new Set(tp.defaults.filter(isLingerie).map((cd) => cd.retailer + "::" + cd.title));
  const first = shelf.find((p) => linTitles.has(String(p.retailer).toLowerCase() + "::" + p.title));
  assert.ok(first, "the saved shelf holds no lingerie");
  assert.equal(first.retailer, LB, first.retailer + " | " + first.title);
});

await check("homepage Lencería: a Lane Bryant pill, its rail all Lane Bryant and inside the allowlist (Victoria's Secret still opens «Todas»)", () => {
  const m = len.stores.find((s) => s.k === LB);
  assert.ok(m && m.rail.length >= 16, "no Lane Bryant pill");
  assert.ok(m.rail.every((cd) => cd.retailer === LB && isIntimate({ title: cd.title, type: cd._type || "" }) || cd._ty === "underwear"), "a card outside the allowlist");
  assert.equal(len.defaults[0].retailer, "victoriassecret");
});

/* ---------- 390px ---------- */
const SHOT = process.env.SHOT_DIR || "";
let pw = null;
try { pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright"); } catch { /* reported below */ }
await check("browser: playwright is available", () => assert.ok(pw, "playwright is not installed"));
if (pw) {
  const department = (await import("../../netlify/functions/department.js")).handler;
  const navf = (await import("../../netlify/functions/nav-filter.js")).handler;
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = fn[1] === "department" ? department : fn[1] === "nav-filter" ? navf : null;
      if (!h) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end("{}"); }
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
      res.writeHead(r.statusCode, r.headers || {});
      return res.end(r.body || "");
    }
    if (u.pathname.startsWith("/api/")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end("{}"); }
    let f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const phone = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return { c, page, errors };
  };
  const noWide = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  try {
    await check("390px: departamento.html?dept=curvy -- the «Lencería» rail opens on Lane Bryant cards", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/departamento.html?dept=curvy`);
      const sel = '.rail-sec[data-k="tipo:mujer-lenceria"]';
      for (let i = 0; i < 40 && !(await page.$(sel)); i++) { await page.evaluate(() => window.scrollBy(0, 1600)); await page.waitForTimeout(300); }
      await page.waitForSelector(sel + " .card", { timeout: 30000 });
      await page.$eval(sel, (el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(600);
      const txt = await page.$$eval(sel + " .card", (cs) => cs.slice(0, 3).map((x) => x.textContent.replace(/\s+/g, " ")));
      assert.ok(txt.length === 3 && txt.every((t) => /Lane Bryant/.test(t)), txt.join(" || "));
      assert.ok(await noWide(page), "horizontal page scroll");
      if (SHOT) await page.screenshot({ path: join(SHOT, "lanebryant-tallas-plus-lenceria.png") });
      assert.deepEqual(errors, []);
      await c.close();
    });
    await check("390px: its «Ver todo» (?ver=tipo:mujer-lenceria) -- the first carousel is Lane Bryant, before Ofertas", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/departamento.html?dept=curvy&ver=${encodeURIComponent("tipo:mujer-lenceria")}`);
      await page.waitForSelector("#rails .rail-sec[data-ri] .card", { timeout: 60000 });
      /* What the shopper sees first, the lifted sales rail (#salesTop) included. */
      const heads = await page.$$eval("#salesTop .rail-head h2, #rails .rail-sec[data-ri] .rail-head h2", (h) => h.filter((x) => x.offsetParent !== null).map((x) => x.textContent.trim()));
      assert.equal(heads[0], "Lane Bryant", heads.slice(0, 3).join(" | "));
      assert.ok(heads.includes("Ofertas"), "the Ofertas rail is still on the page");
      const txt = await page.$$eval("#rails .rail-sec[data-ri] .card", (cs) => cs.slice(0, 3).map((x) => x.textContent.replace(/\s+/g, " ")));
      assert.ok(txt.every((t) => /Lane Bryant/.test(t)), txt.join(" || "));
      assert.ok(await noWide(page), "horizontal page scroll");
      await page.$eval("#rails .rail-sec[data-ri]", (el) => el.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -120));
      await page.waitForTimeout(400);
      if (SHOT) await page.screenshot({ path: join(SHOT, "lanebryant-ver-lenceria.png") });
      assert.deepEqual(errors, []);
      await c.close();
    });
    await check("390px: the homepage Tallas Plus carousel -- its first lingerie card is Lane Bryant's; the Lencería carousel's Lane Bryant pill paints Lane Bryant only", async () => {
      const { c, page } = await phone();
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      const row = '#mobileShopfront [data-category-rail-row="curvy"]';
      /* The category rails sit in [hidden] sections until the zone computes: scroll down to them like a shopper. */
      for (let i = 0; i < 80; i++) {
        const n = await page.$eval(row, (e) => (e.closest("section").hidden ? -1 : e.querySelectorAll("img").length));
        if (n >= 8) break;
        await page.evaluate(() => window.scrollBy(0, 700));
        await page.waitForTimeout(500);
      }
      await page.$eval(row, (el) => el.closest("section").scrollIntoView({ block: "center" }));
      await page.waitForFunction((s) => document.querySelector(s).querySelectorAll("img").length >= 8, row, { timeout: 60000 });
      const lingerie = new Set(tp.defaults.filter(isLingerie).map((cd) => cd.title));
      const cards = await page.$$eval(row + " > *", (cs) => cs.map((x) => x.textContent.replace(/\s+/g, " ")));
      const at = cards.findIndex((t) => [...lingerie].some((title) => t.includes(title)));
      assert.ok(at >= 0, "no lingerie card painted");
      assert.match(cards[at], /Lane Bryant/, cards[at]);
      await page.$eval(row, (el, i) => { const k = el.children[i]; el.scrollLeft = Math.max(0, k.offsetLeft - 20); }, at);
      await page.waitForTimeout(500);
      if (SHOT) await page.screenshot({ path: join(SHOT, "lanebryant-home-tallas-plus.png") });
      /* The Lencería carousel: tap the Lane Bryant pill. */
      const lsel = '#mobileShopfront [data-category-rail-row="ropa_interior_mujer"]';
      await page.$eval(lsel, (el) => el.closest("section").scrollIntoView({ block: "center" }));
      await page.waitForTimeout(800);
      const pill = await page.waitForSelector(`#mobileShopfront [data-cat-pills-bar="lenceria"] button[data-hcp="${LB}"]`, { timeout: 30000 });
      await pill.click();
      await page.waitForFunction(([s, st]) => { const k = [...document.querySelector(s).querySelectorAll("[data-cat-pills-card]")]; return k.length >= 8 && k.every((x) => x.getAttribute("data-cat-pills-card") === st); }, [lsel, LB], { timeout: 30000 });
      assert.ok(await noWide(page), "horizontal page scroll");
      if (SHOT) await page.screenshot({ path: join(SHOT, "lanebryant-home-lenceria-pill.png") });
      await c.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
