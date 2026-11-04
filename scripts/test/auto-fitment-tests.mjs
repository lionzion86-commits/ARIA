#!/usr/bin/env node
/* ==================================================================
   VEHICLE FITMENT, ONE VIEW (#443 c.6620267344, amended c.6620289895;
   one canonical page per section, c.6621544530 / c.6621722209).

   Auto parts narrow to the shopper's car with Año / Marca del vehículo
   / Modelo -- Aria Auto's own vehicle data -- and the ONE view is Aria
   Auto's own page:
     /aria-auto.html?vy=<año>&vmk=<marca>&vmd=<modelo>[&t=<tipo>]#buscar
   The auto parts department and the auto stores carry only a «Tu
   vehículo» card that links there. This suite fails when
     - the fitment file drifts from auto-cache.json and Aria Auto's
       selector (scripts/build-fitment.mjs), or claims a fit AutoZone
       never filed;
     - an option is offered with no product behind it, or the counts do
       not narrow as the choices stack;
     - a product with no vehicle data is counted as fitting;
     - Danny's case -- «Pastillas de freno» + 2011 BMW 3 Series from the
       department card, from tienda.html?tienda=advanceauto, from Aria
       Auto's dropdowns and from its «Frenos» chip -- reaches a different
       URL or a different set, or any nav=1 URL;
     - the vehicle does not stay across the pages, or is not a removable
       chip; the part brand and the vehicle make are not two controls;
       at 390px and 1366px.

     node scripts/test/auto-fitment-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/auto-fitment-tests.mjs   (saves fitment2-*.png)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const fitBuild = await import("../../scripts/build-fitment.mjs");
const fitCore = await import("../../netlify/functions/_fitment-core.js");
const fitFn = await import("../../netlify/functions/vehicle-fit.js");
const FIT = JSON.parse(readFileSync(join(ROOT, fitCore.FIT_FILE), "utf8"));

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const ask = (qs) => { const o = fitCore.answerFit(qs); assert.equal(o.status, 200, JSON.stringify(qs)); return o.body; };
const DANNY = { t: "pastillas-de-freno", vy: "2011", vmk: "bmw", vmd: "3-series" };
const titles = (b) => b.cards.map((c) => c.t).sort();

await check("the fitment file is what scripts/build-fitment.mjs writes from auto-cache.json and Aria Auto's selector (regenerate: node scripts/build-fitment.mjs)", () => {
  assert.equal(fitBuild.FIT_FILE, fitCore.FIT_FILE);
  const { cache, VEHICLES } = fitBuild.readInputs(ROOT);
  assert.deepEqual(JSON.parse(JSON.stringify(fitBuild.buildFitment(cache, VEHICLES))), FIT);
});

await check("every vehicle is one AutoZone catalogued a part for, spelled as Aria Auto's selector spells it; every fit is a VEHICLE_SPECIFIC filing", () => {
  const { cache, VEHICLES } = fitBuild.readInputs(ROOT);
  const sel = new Map(VEHICLES.map((v) => [v.make, new Set(v.models)]));
  for (const [y, mk, md] of FIT.vehicles) assert.ok(sel.has(mk) && sel.get(mk).has(md), `${y} ${mk} ${md} is not in Aria Auto's selector`);
  const specific = new Set();
  for (const [k, bySrc] of Object.entries(cache.partSearches)) for (const arr of Object.values(bySrc)) for (const it of arr)
    if (it.vehicle_fitment === "VEHICLE_SPECIFIC") specific.add((it.productTitle || it.title) + "|" + k.split("|").slice(0, 3).join("|"));
  FIT.rows.forEach((r, i) => {
    for (const vi of FIT.fits[i]) {
      const [y, mk, md] = FIT.vehicles[vi];
      assert.ok(specific.has(r[0] + "|" + y + "|" + mk.toLowerCase() + "|" + md.toLowerCase()), `${r[0]} claimed for ${y} ${mk} ${md}`);
    }
    assert.ok(r[6] && r[3] > 0, "no image or no price: " + r[0]);
  });
});

await check("coverage: the auto products with vehicle data are counted, and Advance Auto Parts (no published fitment) has none", () => {
  const b = ask({});
  const fitted = FIT.fits.filter((f) => f.length).length;
  assert.equal(b.withData, fitted);
  const F = fitCore.loadFitment();
  const adv = F.rows.filter((r) => r.p.retailer === "advanceauto");
  assert.ok(adv.length > 1300);
  assert.ok(adv.every((r) => !r.fv));
  console.log(`         coverage: ${fitted} of ${FIT.rows.length} AutoZone parts have vehicle data (${FIT.vehicles.length} vehicles); ${adv.length} Advance Auto Parts products: 0`);
});

await check("Danny's case: 2011 BMW 3 Series brake pads are the parts AutoZone files as VEHICLE_SPECIFIC brake pads for it -- nothing more; the 120 Advance pads apart", () => {
  const b = ask(DANNY);
  const { cache } = fitBuild.readInputs(ROOT);
  const raw = Object.values(cache.partSearches["2011|bmw|3 series|pastillas de freno"]).flat();
  const want = raw.filter((it) => it.vehicle_fitment === "VEHICLE_SPECIFIC" && it.part_type === "Brake Pads").map((it) => it.productTitle).sort();
  assert.ok(want.length >= 3);
  assert.deepEqual(titles(b), want);
  /* Aria Auto's own slice for this vehicle and part holds every one of them. */
  const slice = JSON.parse(readFileSync(join(ROOT, "assets/auto/v/2011-bmw-3-series/pastillas-de-freno.json"), "utf8"));
  const inSlice = new Set(Object.values(slice.bySource).flat().map((c) => c.t));
  for (const t of want) assert.ok(inSlice.has(t), t);
  assert.equal(b.v.mkL, "BMW"); assert.equal(b.v.mdL, "3 Series"); assert.equal(b.tl, "Pastillas de freno");
  assert.equal(b.none.count, 120);
  assert.ok(b.none.cards.every((c) => c.r === "advanceauto"));
});

await check("the choices stack and narrow (Año x Marca del vehículo x Modelo x Tipo x Marca del repuesto); every option offered returns exactly its count -- no dead end, no zero", () => {
  const steps = [{ vy: "2011" }, { vy: "2011", vmk: "bmw" }, { vy: "2011", vmk: "bmw", vmd: "3-series" },
    { vy: "2011", vmk: "bmw", vmd: "3-series", t: "pastillas-de-freno" }, { vy: "2011", vmk: "bmw", vmd: "3-series", t: "pastillas-de-freno", b: "duralast" }];
  let prev = Infinity;
  for (const qs of steps) {
    const b = ask(qs);
    assert.ok(b.count > 0 && b.count <= prev, JSON.stringify(qs) + " " + b.count);
    prev = b.count;
    for (const [field, param] of [["y", "vy"], ["mk", "vmk"], ["md", "vmd"], ["t", "t"], ["b", "b"]]) for (const [k, , n] of b.facets[field]) {
      assert.ok(n > 0, `${field}=${k} offered at 0`);
      assert.equal(ask({ ...qs, [param]: k }).count, n, `${JSON.stringify(qs)} ${param}=${k}`);
    }
  }
  assert.deepEqual(ask(steps[3]).facets.b.map((x) => x[0]).sort(), ["duralast", "powerstop"]);
  assert.deepEqual(ask({ vy: "2011" }).facets.md, [], "a model is picked within a make");
});

await check("the endpoint answers the view and keys its cache on the vehicle (Netlify-Vary); netlify.toml ships it its two files", async () => {
  const r = await fitFn.handler({ httpMethod: "GET", queryStringParameters: DANNY });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["Netlify-Vary"], "query=vy|vmk|vmd|t|b|page");
  assert.deepEqual(JSON.parse(r.body).cards.map((c) => c.t).sort(), titles(ask(DANNY)));
  const toml = readFileSync(join(ROOT, "netlify.toml"), "utf8");
  const m = /\[functions\."vehicle-fit"\]\s*\n\s*included_files = (\[[^\]]*\])/.exec(toml);
  assert.ok(m, "no [functions.\"vehicle-fit\"]");
  assert.deepEqual(JSON.parse(m[1]).sort(), ["assets/sections/departamento/_fn/auto_parts.fitment.json", "assets/sections/departamento/_fn/auto_parts.json"]);
});

await check("one component, one view: the pages load vehicle-fit.js; it builds the Aria Auto url and never a nav=1 one; no second vehicle list; no emoji", () => {
  const js = readFileSync(join(ROOT, "assets/js/vehicle-fit.js"), "utf8");
  for (const p of ["departamento.html", "tienda.html", "aria-auto.html", "auto.html"]) assert.match(readFileSync(join(ROOT, p), "utf8"), /<script src="\/assets\/js\/vehicle-fit\.js"[^>]*><\/script>/, p);
  assert.doesNotMatch(js, /nav=1|['"]\/?departamento\.html\?/, "the view is Aria Auto's, never a department variant");
  assert.match(js, /var VIEW = '\/aria-auto\.html'/);
  assert.doesNotMatch(js, /var VEHICLES|models:\s*\[/, "a second vehicle list");
  assert.doesNotMatch(js, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "an emoji");
  assert.doesNotMatch(readFileSync(join(ROOT, "netlify/functions/_nav-filter-core.js"), "utf8"), /fitment/, "the department bar takes no vehicle");
});

/* ---------------- the browser ---------------- */
let pw = null;
try { pw = await import("playwright"); } catch { pw = null; }
if (!pw) console.log("    skip browser checks (no playwright)");
else {
  const { createServer } = await import("node:http");
  const handlers = {
    "vehicle-fit": fitFn.handler,
    "nav-filter": (await import("../../netlify/functions/nav-filter.js")).handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
  };
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const seen = [];
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    seen.push(u.pathname + u.search);
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404); return res.end("{}"); }
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) });
      res.writeHead(r.statusCode, r.headers || {});
      return res.end(r.body || "");
    }
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
  const ctx = async (w) => {
    const c = await browser.newContext(w === 390 ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 900 } });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    return c;
  };
  const filters = (url) => { const x = new URL(url); const o = { path: x.pathname, hash: x.hash }; for (const k of ["vy", "vmk", "vmd", "t", "b"]) if (x.searchParams.get(k)) o[k] = x.searchParams.get(k); return o; };
  const VIEW = { path: "/aria-auto.html", hash: "#buscar", vy: "2011", vmk: "bmw", vmd: "3-series", t: "pastillas-de-freno" };
  const viewSet = async (page) => {
    await page.waitForFunction(() => /para tu 2011 BMW 3 Series/.test((document.querySelector("#vfView h2") || {}).textContent || "") && document.getElementById("vfRail"), null, { timeout: 60000 });
    await page.waitForFunction(() => /Pastillas de freno para tu/.test(document.querySelector("#vfView h2").textContent), null, { timeout: 60000 });
    return page.$$eval("#vfRail .card .card-title", (els) => els.map((e) => e.textContent.trim()).sort());
  };
  const cardPick = async (page, field, value) => {
    await page.waitForSelector(`#vfCard select[data-vf="${field}"] option[value="${value}"]`, { state: "attached", timeout: 60000 });
    await page.selectOption(`#vfCard select[data-vf="${field}"]`, value);
    await page.waitForFunction((fv) => { const s = document.querySelector(`#vfCard select[data-vf="${fv[0]}"]`); return s && s.value === fv[1]; }, [field, value], { timeout: 60000 });
  };
  const want = titles(ask(DANNY));
  try {
    for (const w of [390, 1366]) {
      const c = await ctx(w);
      const page = await c.newPage();
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      const urls = {}, sets = {};
      await check(`browser ${w}: the department (departamento.html?dept=auto_parts) carries only «Tu vehículo»; Pastillas + 2011 + BMW + 3 Series opens Aria Auto's view`, async () => {
        await page.goto(`${BASE}/departamento.html?dept=auto_parts`);
        await page.waitForSelector("#vfCard select[data-vf=y]", { timeout: 60000 });
        assert.equal(await page.$("#vfRow"), null);
        assert.match(await page.textContent("#vfCard"), /Marca del vehículo/);
        const opts = await page.$$eval('#vfCard select[data-vf="y"] option', (os) => os.map((o) => o.textContent));
        assert.ok(opts.length > 2 && opts.slice(1).every((t) => /\(\d[\d.,]*\)$/.test(t)), opts.join(","));
        await cardPick(page, "y", "2011");
        await cardPick(page, "mk", "bmw");
        await cardPick(page, "md", "3-series");
        await cardPick(page, "t", "pastillas-de-freno");
        await page.waitForFunction(() => /^Ver \d/.test((document.getElementById("vfGo") || {}).textContent || "") && /t=pastillas-de-freno/.test(document.getElementById("vfGo").href));
        assert.match(await page.textContent("#vfGo"), new RegExp("^Ver " + want.length + " repuestos para tu 2011 BMW 3 Series"));
        if (SHOT && w === 390) { await page.$eval("#vfCard", (e) => { e.scrollIntoView(); window.scrollBy(0, -90); }); await page.screenshot({ path: join(SHOT, "fitment2-dept-card.png") }); }
        await Promise.all([page.waitForNavigation(), page.click("#vfGo")]);
        urls.dept = page.url(); sets.dept = await viewSet(page);
        assert.deepEqual(sets.dept, want);
        /* the view: the chip, Marca del repuesto, the apart group */
        assert.match(await page.textContent("#vfView .vf-chip"), /Vehículo: 2011 BMW 3 Series/);
        assert.match(await page.textContent("#vfView"), /Marca del repuesto/);
        assert.match(await page.textContent("#vfNone h3"), /Universal \/ sin datos de compatibilidad/);
        assert.ok(await page.$$eval("#vfNoneRail .card", (x) => x.length) > 0);
        assert.equal(await page.$eval("#autoModel", (s) => s.value), "3 Series");
        if (SHOT && w === 390) { await page.$eval("#vfView", (e) => { e.scrollIntoView(); window.scrollBy(0, -200); }); await page.screenshot({ path: join(SHOT, "fitment2-aria-auto-view.png") });
          await page.$eval("#vfNone", (e) => { e.scrollIntoView(); window.scrollBy(0, -200); }); await page.screenshot({ path: join(SHOT, "fitment2-aria-auto-sin-datos.png") }); }
        if (SHOT && w === 1366) { await page.$eval("#vfView", (e) => { e.scrollIntoView(); window.scrollBy(0, -200); }); await page.screenshot({ path: join(SHOT, "fitment2-aria-auto-view-1366.png") }); }
        /* the part brand stacks */
        await page.selectOption('#vfView select[data-vf="b"]', "duralast");
        await page.waitForFunction(() => new URLSearchParams(location.search).get("b") === "duralast");
        await page.waitForFunction(() => /^\d+ repuestos? catalogados?/.test((document.getElementById("vfCount") || {}).textContent || "") && document.querySelector('#vfView select[data-vf="b"]').value === "duralast");
        const nb = Number((await page.textContent("#vfCount")).replace(/\D.*$/, ""));
        assert.ok(nb > 0 && nb < want.length, String(nb));
      });
      await check(`browser ${w}: the store (tienda.html?tienda=advanceauto) keeps the vehicle; its «Tu vehículo» opens the same view`, async () => {
        await page.goto(`${BASE}/tienda.html?tienda=advanceauto`);
        await page.waitForSelector("#vfCard select[data-vf=t]", { timeout: 60000 });
        assert.match(await page.textContent("#vfCard"), /Vehículo: 2011 BMW 3 Series/);
        await cardPick(page, "t", "pastillas-de-freno");
        await page.waitForFunction(() => /t=pastillas-de-freno/.test((document.getElementById("vfGo") || {}).href || "") && /^Ver \d/.test(document.getElementById("vfGo").textContent));
        if (SHOT && w === 390) { await page.$eval("#vfCard", (e) => { e.scrollIntoView(); window.scrollBy(0, -90); }); await page.screenshot({ path: join(SHOT, "fitment2-store-card.png") }); }
        const bb = await page.$('[data-nf-btn="b"]');
        if (bb) assert.equal((await bb.textContent()).trim(), "Marca del repuesto");
        await Promise.all([page.waitForNavigation(), page.click("#vfGo")]);
        urls.store = page.url(); sets.store = await viewSet(page);
      });
      await check(`browser ${w}: Aria Auto restores the kept vehicle in its own selector, and its «Frenos» chip lands on the same view`, async () => {
        await page.goto(`${BASE}/aria-auto.html`);
        await page.waitForFunction(() => document.getElementById("autoModel").value === "3 Series", null, { timeout: 60000 });
        assert.match(await page.textContent('label[for="autoMake"]'), /Marca del vehículo/);
        await page.waitForSelector("#vfView .vf-pill", { timeout: 60000 });
        await page.click('#searchCard .chip[data-q="pastillas de freno"]');
        await page.waitForFunction(() => new URLSearchParams(location.search).get("t") === "pastillas-de-freno", null, { timeout: 60000 });
        urls.chip = page.url(); sets.chip = await viewSet(page);
      });
      await check(`browser ${w}: Aria Auto's dropdowns, from nothing: 2011, BMW, 3 Series, then «Pastillas de freno» -- the same view`, async () => {
        const c2 = await ctx(w);
        const p2 = await c2.newPage();
        const e2 = []; p2.on("pageerror", (e) => e2.push(e.message));
        await p2.goto(`${BASE}/aria-auto.html#buscar`);
        await p2.waitForSelector("#autoYear option[value='2011']", { state: "attached", timeout: 60000 });
        await p2.selectOption("#autoYear", "2011");
        await p2.selectOption("#autoMake", "BMW");
        await p2.selectOption("#autoModel", "3 Series");
        await p2.waitForSelector('#vfView .vf-pill[data-vf-t="pastillas-de-freno"]', { timeout: 60000 });
        await p2.click('#vfView .vf-pill[data-vf-t="pastillas-de-freno"]');
        urls.drop = p2.url(); sets.drop = await viewSet(p2);
        assert.deepEqual(e2, []);
        await c2.close();
      });
      await check(`browser ${w}: department, store, Aria Auto's chip and its dropdowns -- one url (the same filters), equal result sets, no nav=1 anywhere`, () => {
        for (const k of ["dept", "store", "chip", "drop"]) {
          assert.ok(urls[k], k);
          assert.deepEqual(filters(urls[k]), VIEW, k);
          assert.deepEqual(sets[k], want, k);
        }
        assert.deepEqual(seen.filter((u) => /[?&]nav=1/.test(u)), []);
      });
      await check(`browser ${w}: the chip removes the vehicle -- in the view and on the next page`, async () => {
        await page.click("#vfView .vf-chip");
        await page.waitForFunction(() => !new URLSearchParams(location.search).get("vy"));
        assert.equal(await page.evaluate(() => localStorage.getItem("aria_vehicle_v1")), null);
        assert.equal(await page.$eval("#autoYear", (s) => s.value), "");
        await page.goto(`${BASE}/departamento.html?dept=auto_parts`);
        await page.waitForSelector("#vfCard select[data-vf=y]", { timeout: 60000 });
        assert.doesNotMatch(await page.textContent("#vfCard"), /Vehículo:/);
        assert.deepEqual(errors, []);
      });
      await c.close();
    }
    await check("browser: no page fetched a catalogue, auto-cache.json or a _fn/ list (the fitment stays on the server)", () => {
      assert.deepEqual(seen.filter((p) => /(-catalog\.json|auto-cache\.json|\/_fn\/|department-cache)/.test(p)), []);
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
