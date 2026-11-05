/* ==================================================================
   OFERTAS KEEPS FILTERING INSIDE THE CATEGORY (#443 c.6629871333,
   Danny's live QA after #647: "If I'm going Ofertas en zapatos, I can
   choose Ofertas zapatos mujer, Ofertas zapatos hombre, or Ofertas
   zapatos de niños. I don't have those options.")

   Every category of ofertas.html's Por categoría view, not only Zapatos:
     - Mujer / Hombre / Niños pills on top, only the audiences the
       category's offers really hold (the department's own rule,
       audienceSwitch; the audience is the product's department fact in
       facts.json, never a brand or store guess);
     - the filter bar (Filtrar · Ordenar · Marca · Talla · Precio) inside
       the category's offers, stacking with the audience, live counts;
     - in place: never a new page, never a grid, never nav=1, never a
       catalogue download; the URL carries the state (&aud=mujer).

     node scripts/test/ofertas-filter-tests.mjs
     SHOT_DIR=<dir> also saves ofertas-filter-*.png (390 and 1366).
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { answerNav, loadFacts, factKey, U_CODES } from "../../netlify/functions/_nav-filter-core.js";
import { inAudience } from "../../netlify/functions/_department-core.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const RAILS = JSON.parse(read("assets/ofertas/rails.json"));
const CATS = (RAILS.cats || []).filter((c) => c && c.key && c.n > 0);
const F = loadFacts([ROOT]);
const audOf = (c) => { const r = F.keys[factKey(c.store, c.title)]; return r ? U_CODES[r[1]] || "" : ""; };
const ask = async (q) => (await answerNav({ ofertas: "1", fx: "3.75", ...q }, [ROOT])).body;
const LABEL = { women: "Mujer", men: "Hombre", kids: "Niños" };

/* ---------- the engine, every category ---------- */
const TABLE = [];
await check("every category: the bar answers on that category's offers only, with the audiences it really holds", async () => {
  assert.ok(CATS.length >= 8, CATS.length + " categories");
  for (const c of CATS) {
    const all = await ask({ cat: c.key });
    assert.ok(all.count > 0 && all.count <= c.n, `${c.key}: ${all.count} of ${c.n}`);
    assert.ok(Array.isArray(all.aud), c.key + ": no aud list");
    for (const card of all.cards) assert.equal(card.k, c.key, c.key + ": a card of " + card.k);
    const row = { cat: c.key, all: all.count };
    for (const u of all.aud) {
      const r = await ask({ cat: c.key, u });
      const live = (all.facets.u.find((x) => x[0] === u) || [])[2];
      assert.equal(r.count, live, `${c.key} ${u}: the pill says ${live}, the set holds ${r.count}`);
      assert.ok(r.count > 0 && r.count < all.count, `${c.key} ${u}: ${r.count} is not smaller than ${all.count}`);
      assert.equal(r.uAll, all.count, `${c.key} ${u}: «Todos» is not the category`);
      for (let pg = 0; pg < Math.min(r.pages, 3); pg++) {
        const cards = pg ? (await ask({ cat: c.key, u, page: String(pg) })).cards : r.cards;
        for (const card of cards) {
          assert.equal(card.k, c.key);
          assert.ok(inAudience({ u: audOf(card) }, u), `${c.key} ${u}: «${card.title}» (${card.store}) is ${audOf(card) || "unknown"}`);
        }
      }
      row[u] = r.count;
    }
    TABLE.push(row);
  }
  console.log("         " + TABLE.map((r) => r.cat + " " + r.all + (Object.keys(LABEL).filter((u) => r[u]).map((u) => " " + LABEL[u] + " " + r[u]).join(""))).join(" | "));
});
await check("Zapatos holds Mujer, Hombre and Niños; at least two more categories hold 2+ audiences", () => {
  const z = TABLE.find((r) => r.cat === "zapatos");
  assert.ok(z && z.women && z.men && z.kids, JSON.stringify(z));
  const more = TABLE.filter((r) => r.cat !== "zapatos" && Object.keys(LABEL).filter((u) => r[u]).length >= 2);
  assert.ok(more.length >= 2, more.map((r) => r.cat).join(","));
});
await check("an audience the category's offers do not really hold gets no pill (Juguetes' stray adult rows, Ropa already split)", async () => {
  for (const k of ["juguetes", "ropa_mujer", "ropa_hombre", "ropa_ninos"]) {
    if (!CATS.some((c) => c.key === k)) continue;
    const r = await ask({ cat: k });
    assert.deepEqual(r.aud, [], k + ": " + r.aud.join(","));
  }
});
await check("Zapatos · Mujer stacks with Marca and Talla: each count is the stacked result and only shrinks", async () => {
  const w = await ask({ cat: "zapatos", u: "women" });
  const b = w.facets.b[0];
  const wb = await ask({ cat: "zapatos", u: "women", b: b[0] });
  assert.equal(wb.count, b[2]);
  assert.ok(wb.count < w.count);
  for (const card of wb.cards) assert.equal(String(card.brand).trim().toLowerCase(), b[0]);
  const z = wb.facets.z[0];
  if (z) {
    const wbz = await ask({ cat: "zapatos", u: "women", b: b[0], z: z[0] });
    assert.equal(wbz.count, z[2]);
    assert.ok(wbz.count <= wb.count);
  }
  for (const k of ["u", "t", "b", "z", "p"]) for (const x of wb.facets[k]) assert.ok(x[2] > 0, `${k} ${x[0]} offered at 0`);
  const bad = await ask({ cat: "zzz" });
  assert.equal(bad.count, 0);
});
await check("the page: the bar mounts only inside a category, with the audience pills, the URL's own aud= and never nav=1", () => {
  const o = read("ofertas.html");
  assert.match(o, /function nfSync\(\)/);
  assert.match(o, /'ofertas=1&cat=' \+ encodeURIComponent\(S\.cat\)/);
  assert.match(o, /names: \{ u: 'aud' \}/);
  assert.match(o, /audPills: true/);
  assert.doesNotMatch(o, /nav=1/, "ofertas.html writes nav=1");
  assert.doesNotMatch(o, /<script[^>]*src="\/assets\/js\/nav-filter\.js"/, "the bar is never loaded on the store view");
  const nf = read("assets/js/nav-filter.js");
  assert.match(nf, /id="nfAud" aria-label="Para quién"/);
  assert.ok(!/display\s*:\s*grid/.test(nf));
  assert.match(read("netlify/functions/nav-filter.js"), /query=dept\|tienda\|marca\|ofertas\|cat\|/);
});

/* ---------- the browser, 390 and 1366 ---------- */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported */ }
await check("browser: playwright is available", () => assert.ok(pw));
if (pw) {
  const { createServer } = await import("node:http");
  const handlers = {
    "nav-filter": (await import("../../netlify/functions/nav-filter.js")).handler,
    ofertas: (await import("../../netlify/functions/ofertas.js")).handler,
  };
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404); return res.end("{}"); }
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) });
      res.writeHead(r.statusCode, r.headers || {});
      return res.end(r.body || "");
    }
    if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
    const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!f.startsWith(ROOT) || !existsSync(f) || f.endsWith("/")) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const SHOT = process.env.SHOT_DIR || "";
  const CATALOG_RX = /-catalog\.json|department-cache|auto-cache\.json|ofertas-feed|catalog-index\.json|deals\.json|facts\.json|\/_fn\//;
  const ctx = async (desktop) => {
    const c = await browser.newContext(desktop ? { viewport: { width: 1366, height: 900 }, hasTouch: false, isMobile: false } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    const reqs = [];
    page.on("request", (r) => reqs.push(r.url()));
    return { c, page, reqs };
  };
  const tap = (page, desktop, sel) => (desktop ? page.click(sel) : page.tap(sel));
  const settled = (page) => page.waitForFunction(() => { const n = document.getElementById("nfCount"); return n && !/Cargando/.test(n.textContent); }, null, { timeout: 60000 });
  const digits = (t) => Number(String(t || "").replace(/[^0-9]/g, ""));
  const pills = (page) => page.$$eval("#nfAud .nf-pill", (b) => b.map((x) => [x.getAttribute("data-nf-u"), x.firstChild.textContent.trim(), Number((x.querySelector("small") || {}).textContent.replace(/[^0-9]/g, "") || 0), x.getAttribute("aria-pressed")]));

  for (const desktop of [false, true]) {
    const W = desktop ? 1366 : 390;
    /* Zapatos, then two more categories whose offers hold audiences. */
    const withAud = TABLE.filter((r) => Object.keys(LABEL).filter((u) => r[u]).length >= 2);
    const picks = ["zapatos"].concat(withAud.map((r) => r.cat).filter((k) => k !== "zapatos").slice(0, 2));
    for (const k of picks) {
      const row = TABLE.find((r) => r.cat === k);
      const auds = Object.keys(LABEL).filter((u) => row[u]);
      const u = auds[0];
      await check(`browser ${W}: Ofertas → ${k} → ${LABEL[u]} re-renders in place to only ${LABEL[u]}'s offers, a smaller live count, one carousel, the URL shareable (&aud=), no nav=1, no catalogue`, async () => {
        const { c, page, reqs } = await ctx(desktop);
        const errors = []; page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(BASE + "/ofertas.html?vista=categoria&cat=" + k, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('#cats button[data-cat="' + k + '"][aria-pressed="true"]', { timeout: 60000 });
        await page.waitForSelector("#nfAud .nf-pill", { timeout: 60000 });
        await page.waitForSelector("#results .rail-sec .card", { timeout: 60000 });
        const p0 = await pills(page);
        assert.deepEqual(p0.map((x) => x[1]), ["Todos"].concat(auds.map((a) => LABEL[a])), "the pills");
        assert.equal(p0[0][2], row.all, "«Todos» is not the category's count");
        for (const a of auds) assert.equal(p0.find((x) => x[0] === a)[2], row[a], a + "'s pill count");
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains("nf-on")), false, "opened narrowed");
        const btns = await page.$$eval("#nfBar .nf-dd:not([hidden]) .nf-btn span", (x) => x.map((e) => e.textContent));
        for (const b of ["Filtrar", "Ordenar", "Marca"]) assert.ok(btns.includes(b), btns.join(" | "));
        if (SHOT && !desktop && k === "zapatos") await page.screenshot({ path: join(SHOT, "ofertas-filter-" + k + "-landing-390.png") });
        const url0 = page.url();
        await tap(page, desktop, '#nfAud [data-nf-u="' + u + '"]');
        await page.waitForFunction((u) => { const b = document.querySelector('#nfAud [data-nf-u="' + u + '"]'); return b && b.getAttribute("aria-pressed") === "true"; }, u, { timeout: 60000 });
        await settled(page);
        await page.waitForSelector("#nfRail .card", { timeout: 60000 });
        assert.ok(page.url().startsWith(url0.split("#")[0]), "left the page");
        assert.match(page.url(), new RegExp("[?&]aud=" + { women: "mujer", men: "hombre", kids: "ninos" }[u] + "(&|$)"));
        assert.match(page.url(), new RegExp("[?&]cat=" + k + "(&|$)"));
        assert.doesNotMatch(page.url(), /nav=1/);
        const shown = await page.evaluate(async () => {
          const d = window.AriaNF.data();
          const server = await fetch(window.AriaNF.url()).then((r) => r.json());
          const digits = (t) => Number(String(t || "").replace(/[^0-9]/g, ""));
          return { count: d.count, server: server.count, line: digits(document.getElementById("nfCount").textContent), head: digits(document.getElementById("nfN").textContent),
            title: document.getElementById("nfTitle").textContent, cards: document.querySelectorAll("#nfRail .card").length, page: (server.cards || []).length,
            server_cards: (server.cards || []).map((c) => ({ title: c.title, store: c.store, k: c.k })), landingShown: !!document.querySelector("#results").offsetParent,
            countLine: !!document.getElementById("countLine").offsetParent };
        });
        assert.equal(shown.count, row[u], "the live count is not the engine's");
        assert.ok(shown.count < row.all, `${shown.count} is not under ${row.all}`);
        assert.equal(shown.line, shown.count, "the count line");
        assert.equal(shown.head, shown.count, "the rail header");
        assert.match(shown.title, new RegExp(LABEL[u]));
        assert.ok(shown.cards > 0 && shown.cards <= shown.page, `the carousel holds ${shown.cards} of the page's ${shown.page}`);
        assert.equal(shown.landingShown, false, "the category's store rails still show under the filter");
        assert.equal(shown.countLine, false, "the page's unfiltered count still shows");
        for (const card of shown.server_cards) { assert.equal(card.k, k); assert.ok(inAudience({ u: audOf(card) }, u), `«${card.title}» is ${audOf(card) || "unknown"}`); }
        const rows = await page.$$eval("#nfRail .card", (cs) => new Set(cs.map((x) => Math.round(x.getBoundingClientRect().top))).size);
        assert.equal(rows, 1, "cards in more than one row");
        if (SHOT && !desktop) await page.screenshot({ path: join(SHOT, "ofertas-filter-" + k + "-" + { women: "mujer", men: "hombre", kids: "ninos" }[u] + "-390.png") });
        /* The bar stacks inside the audience: a brand, its live count. */
        if (await page.isVisible('[data-dd="b"]')) {
          await tap(page, desktop, '[data-nf-btn="b"]');
          await page.waitForSelector(".nf-pan [data-nf-b]");
          assert.equal(await page.$$eval(".nf-pan button small", (s) => s.filter((x) => /^0$/.test(x.textContent.trim())).length), 0, "an option at zero");
          const want = await page.$eval(".nf-pan [data-nf-b]", (b) => Number(b.querySelector("small").textContent.replace(/[^0-9]/g, "")));
          await tap(page, desktop, ".nf-pan [data-nf-b]");
          await page.waitForFunction(() => document.querySelectorAll('[data-nf-x="b"]').length === 1, null, { timeout: 60000 });
          await settled(page);
          await tap(page, desktop, ".nf-pan [data-nf-done]");
          const n = digits(await page.textContent("#nfCount"));
          assert.equal(n, want, "the brand's count is not the stacked result");
          assert.ok(n <= shown.count);
          assert.equal(await page.getAttribute('#nfAud [data-nf-u="' + u + '"]', "aria-pressed"), "true", "the audience fell off");
          if (SHOT && !desktop && k === "zapatos") await page.screenshot({ path: join(SHOT, "ofertas-filter-" + k + "-mujer-marca-390.png") });
        }
        /* Shareable: the URL opens on the same state. */
        const shared = page.url();
        await page.goto(shared, { waitUntil: "domcontentloaded" });
        await page.waitForFunction((u) => { const b = document.querySelector('#nfAud [data-nf-u="' + u + '"]'); return b && b.getAttribute("aria-pressed") === "true"; }, u, { timeout: 60000 });
        await settled(page);
        await page.waitForSelector("#nfRail .card", { timeout: 60000 });
        /* «Todos» and clearing bring the category's own rails back. */
        const clear = await page.$("[data-nf-clear]");
        if (clear) await tap(page, desktop, "[data-nf-clear]"); else await tap(page, desktop, '#nfAud [data-nf-u=""]');
        await page.waitForFunction(() => !document.documentElement.classList.contains("nf-on"), null, { timeout: 60000 });
        assert.ok(await page.isVisible("#results .rail-sec"), "the category's rails did not come back");
        assert.doesNotMatch(page.url(), /aud=/);
        assert.deepEqual(reqs.filter((x) => CATALOG_RX.test(x)), [], "a catalogue file was requested");
        assert.equal(await page.$$eval('input[type="checkbox"]', (x) => x.filter((e) => e.offsetParent).length), 0, "a visible checkbox");
        assert.deepEqual(errors, []);
        await c.close();
      });
    }
    await check(`browser ${W}: Todas and Por tienda take the bar away; a category with one audience (Juguetes) gets the bar without audience pills`, async () => {
      const { c, page } = await ctx(desktop);
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(BASE + "/ofertas.html?vista=categoria&cat=juguetes", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.AriaNF && window.AriaNF.data(), null, { timeout: 60000 });
      assert.equal(await page.isVisible("#nfAud"), false, "Juguetes shows audience pills");
      assert.ok(await page.isVisible("#nfBar"), "Juguetes has no filter bar");
      if (SHOT && !desktop) await page.screenshot({ path: join(SHOT, "ofertas-filter-juguetes-390.png") });
      await tap(page, desktop, '#cats button[data-cat="zapatos"]');
      await page.waitForSelector("#nfAud .nf-pill", { timeout: 60000 });
      await tap(page, desktop, '#nfAud [data-nf-u="kids"]');
      await page.waitForFunction(() => document.documentElement.classList.contains("nf-on"), null, { timeout: 60000 });
      await tap(page, desktop, '#cats button[data-cat=""]');
      await page.waitForFunction(() => document.getElementById("nf").hidden && !document.documentElement.classList.contains("nf-on"), null, { timeout: 60000 });
      assert.doesNotMatch(page.url(), /aud=|cat=/);
      await tap(page, desktop, '#mode [data-mode="tienda"]');
      assert.equal(await page.isVisible("#nf"), false);
      /* The store view never loads the bar on its own. */
      await page.goto(BASE + "/ofertas.html", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#content .rail-sec .card", { timeout: 60000 });
      assert.equal(await page.$("#nf"), null);
      assert.deepEqual(errors, []);
      await c.close();
    });
  }
  await browser.close();
  srv.close();
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
