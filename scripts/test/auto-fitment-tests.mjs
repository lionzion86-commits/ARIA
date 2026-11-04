#!/usr/bin/env node
/* ==================================================================
   VEHICLE FITMENT, ONE SYSTEM (#443 c.6620267344, amended
   c.6620289895 -- Danny).

   Auto parts narrow to the shopper's car with Año / Marca del vehículo
   / Modelo -- Aria Auto's own vehicle data -- on the department, on the
   auto stores and in Aria Auto, and a part type plus a vehicle chosen
   from any of them lands on ONE view with the same filters and the
   same results. This suite fails when
     - the fitment file drifts from auto-cache.json and Aria Auto's
       selector (scripts/build-fitment.mjs), or invents a vehicle;
     - a vehicle option is offered with no product behind it (no dead
       end), or the counts do not narrow as the filters stack;
     - a product with no vehicle data is counted as fitting;
     - the part brand and the vehicle make are not two controls;
     - Danny's case -- «Pastillas de freno» + 2011 + BMW (+ 3 Series)
       from the department, from tienda.html?tienda=advanceauto and from
       Aria Auto -- reaches a different URL or a different set;
     - the vehicle does not stay across the three pages, or is not a
       removable chip; at 390px and 1366px.

     node scripts/test/auto-fitment-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/auto-fitment-tests.mjs   (saves fitment-*.png)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const fitBuild = await import("../../scripts/build-fitment.mjs");
const fitCore = await import("../../netlify/functions/_fitment-core.js");
const nav = await import("../../netlify/functions/_nav-filter-core.js");
const navFn = await import("../../netlify/functions/nav-filter.js");
const FIT = JSON.parse(readFileSync(join(ROOT, fitCore.FIT_FILE), "utf8"));

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const ask = (qs) => { const o = nav.answerNav(qs); assert.equal(o.status, 200, JSON.stringify(qs)); return o.body; };
const DANNY = { dept: "auto_parts", t: "pastillas-de-freno", vy: "2011", vmk: "bmw", vmd: "3-series" };
const titles = (b) => b.cards.map((c) => c.t).sort();

await check("the fitment file is what scripts/build-fitment.mjs writes from auto-cache.json and Aria Auto's selector (regenerate: node scripts/build-fitment.mjs)", () => {
  const { cache, VEHICLES } = fitBuild.readInputs(ROOT);
  assert.deepEqual(JSON.parse(JSON.stringify(fitBuild.buildFitment(cache, VEHICLES))), FIT);
});

await check("every vehicle is one AutoZone catalogued a part for, spelled as Aria Auto's selector spells it; every fit is a VEHICLE_SPECIFIC filing", () => {
  const { cache, VEHICLES } = fitBuild.readInputs(ROOT);
  const sel = new Map(VEHICLES.map((v) => [v.make, new Set(v.models)]));
  for (const [y, mk, md] of FIT.vehicles) {
    assert.ok(sel.has(mk) && sel.get(mk).has(md), `${y} ${mk} ${md} is not in Aria Auto's selector`);
    assert.ok(Number(y) >= 2009 && Number(y) <= 2026, y);
  }
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
  const dept = ask({ dept: "auto_parts" });
  const fitted = FIT.fits.filter((f) => f.length).length;
  assert.ok(fitted > 1500, "fitted " + fitted);
  assert.equal(dept.fit.withData, fitted);
  const advFitted = FIT.rows.filter((r, i) => r[2] === "advanceauto" && FIT.fits[i].length).length;
  assert.equal(advFitted, 0);
  console.log(`         coverage: ${fitted} of ${FIT.rows.length} AutoZone parts have vehicle data (${FIT.vehicles.length} vehicles); `
    + `${dept.fit.all - FIT.rows.length} department products (Advance Auto Parts and others): 0 with vehicle data`);
});

await check("no vehicle chosen: the department is exactly as before (Pastillas De Freno = 120, the same brands)", () => {
  const b = ask({ dept: "auto_parts", t: "pastillas-de-freno" });
  assert.equal(b.count, 120);
  assert.ok(b.cards.every((c) => c.r === "advanceauto"));
  assert.deepEqual(b.facets.b.map((x) => x[0]), ["carquest standard"]);
  assert.ok(b.fit.facets.y.length > 0 && b.fit.facets.mk.length > 0, "the vehicle is offered");
  assert.deepEqual(b.fit.facets.md, [], "a model is picked within a make");
});

await check("Danny's case: 2011 BMW 3 Series brake pads are the parts AutoZone files as VEHICLE_SPECIFIC brake pads for it -- nothing more", () => {
  const b = ask(DANNY);
  const slice = JSON.parse(readFileSync(join(ROOT, "assets/auto/v/2011-bmw-3-series/pastillas-de-freno.json"), "utf8"));
  const { cache } = fitBuild.readInputs(ROOT);
  const raw = Object.values(cache.partSearches["2011|bmw|3 series|pastillas de freno"]).flat();
  const want = raw.filter((it) => it.vehicle_fitment === "VEHICLE_SPECIFIC" && it.part_type === "Brake Pads").map((it) => it.productTitle).sort();
  assert.ok(want.length >= 3);
  assert.deepEqual(titles(b), want);
  /* Aria Auto's own slice for this vehicle and part holds every one of them. */
  const inSlice = new Set(Object.values(slice.bySource).flat().map((c) => c.t));
  for (const t of want) assert.ok(inSlice.has(t), t);
  assert.equal(b.fit.v.mkL, "BMW"); assert.equal(b.fit.v.mdL, "3 Series");
  /* the 120 Advance pads have no vehicle data: apart, never fitting */
  assert.equal(b.fit.none.count, 120);
  assert.ok(b.fit.none.cards.every((c) => c.r === "advanceauto"));
});

await check("counts narrow as the filters stack (Tipo x Marca del repuesto x Año x Marca del vehículo x Modelo x Precio), and no option is a dead end", () => {
  const steps = [
    { dept: "auto_parts", fx: "3.75" },
    { dept: "auto_parts", fx: "3.75", vy: "2011" },
    { dept: "auto_parts", fx: "3.75", vy: "2011", vmk: "bmw" },
    { dept: "auto_parts", fx: "3.75", vy: "2011", vmk: "bmw", vmd: "3-series" },
    { dept: "auto_parts", fx: "3.75", vy: "2011", vmk: "bmw", vmd: "3-series", t: "pastillas-de-freno" },
    { dept: "auto_parts", fx: "3.75", vy: "2011", vmk: "bmw", vmd: "3-series", t: "pastillas-de-freno", b: "duralast" },
  ];
  let prev = Infinity;
  for (const qs of steps.slice(1)) {
    const b = ask(qs);
    assert.ok(b.count > 0 && b.count <= prev, JSON.stringify(qs) + " " + b.count);
    prev = b.count;
    /* every offered option, taken, returns exactly its count */
    for (const [field, param] of [["y", "vy"], ["mk", "vmk"], ["md", "vmd"]]) {
      for (const [k, , n] of b.fit.facets[field]) {
        assert.ok(n > 0, `${field}=${k} offered at 0`);
        assert.equal(ask({ ...qs, [param]: k }).count, n, `${JSON.stringify(qs)} ${param}=${k}`);
      }
    }
    for (const [facet] of [["t"], ["b"], ["p"]]) for (const o of b.facets[facet]) assert.ok(o[2] > 0, facet + " " + o[0]);
  }
  /* the price facet narrows under the vehicle */
  const all = ask(steps[3]), priced = ask({ ...steps[3], p: all.facets.p[0][0] });
  assert.ok(priced.count > 0 && priced.count < all.count);
  /* the part brand counts under the vehicle */
  assert.deepEqual(ask(steps[4]).facets.b.map((x) => x[0]).sort(), ["duralast", "powerstop"]);
});

await check("the endpoint carries the vehicle in its cache key (Netlify-Vary)", async () => {
  const r = await navFn.handler({ httpMethod: "GET", queryStringParameters: DANNY });
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["Netlify-Vary"], /\|vy\|vmk\|vmd/);
  assert.deepEqual(JSON.parse(r.body).cards.map((c) => c.t).sort(), titles(ask(DANNY)));
});

await check("pages without fitment answer as before (no fit block, the same counts)", () => {
  const b = ask({ dept: "shoes", vy: "2011", vmk: "bmw" });
  assert.equal(b.fit, undefined);
  assert.equal(b.count, ask({ dept: "shoes" }).count);
});

await check("the one view's url is built by one function, and the pages load the one component (no second vehicle dataset)", () => {
  const js = readFileSync(join(ROOT, "assets/js/vehicle-fit.js"), "utf8");
  for (const p of ["departamento.html", "tienda.html", "aria-auto.html", "auto.html"]) assert.match(readFileSync(join(ROOT, p), "utf8"), /<script src="\/assets\/js\/vehicle-fit\.js"[^>]*><\/script>/, p);
  assert.doesNotMatch(js, /var VEHICLES|models:\s*\[/, "a second vehicle list");
  const dep = readFileSync(join(ROOT, "departamento.html"), "utf8");
  assert.ok(dep.indexOf("vehicle-fit.js") < dep.indexOf("nav-filter.js"), "vehicle-fit.js must run before the bar");
  assert.doesNotMatch(js, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "an emoji");
});

/* ---------------- the browser ---------------- */
let pw = null;
try { pw = await import("playwright"); } catch { pw = null; }
if (!pw) console.log("    skip browser checks (no playwright)");
else {
  const { createServer } = await import("node:http");
  const handlers = {
    "nav-filter": navFn.handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
  };
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const seen = [];
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    seen.push(u.pathname);
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404); return res.end("{}"); }
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) });
      res.writeHead(r.statusCode, r.headers || {});
      return res.end(r.body || "");
    }
    let p = decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname);
    if (p === "/auto") p = "/aria-auto.html";
    const f = join(ROOT, p);
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
  const watch = (page) => { const errors = []; page.on("pageerror", (e) => errors.push(e.message)); return errors; };
  const filters = (url) => { const sp = new URL(url).searchParams; const o = {}; for (const k of ["dept", "nav", "t", "vy", "vmk", "vmd"]) if (sp.get(k)) o[k] = sp.get(k); return { path: new URL(url).pathname, ...o }; };
  const railTitles = (page) => page.$$eval("#nfRail .card .card-title", (els) => els.map((e) => e.textContent.trim()).sort());
  const settle = (page) => page.waitForFunction(() => { const c = document.getElementById("nfCount"); return c && c.textContent && !/Cargando/.test(c.textContent); }, null, { timeout: 60000 });
  const pickSel = async (page, field, value) => {
    await page.waitForSelector(`#vfRow select[data-vf="${field}"] option[value="${value}"]`, { state: "attached", timeout: 60000 });
    await page.selectOption(`#vfRow select[data-vf="${field}"]`, value);
    await page.waitForFunction((v) => new URLSearchParams(location.search).get(v[0]) === v[1], [field === "y" ? "vy" : field === "mk" ? "vmk" : "vmd", value]);
    await page.waitForTimeout(50);
    await settle(page);
  };
  const want = titles(ask(DANNY));
  try {
    for (const w of [390, 1366]) {
      const c = await ctx(w);
      const page = await c.newPage();
      const errors = watch(page);
      const urls = {};
      const sets = {};
      await check(`browser ${w}: the department -- Pastillas De Freno, then Año 2011, Marca del vehículo BMW, Modelo 3 Series; counts narrow in place; a removable chip`, async () => {
        await page.goto(`${BASE}/departamento.html?dept=auto_parts&nav=1&t=pastillas-de-freno`);
        await settle(page);
        await page.waitForSelector("#vfRow select[data-vf=y]");
        assert.match(await page.textContent("#nfCount"), /^120 productos/);
        /* two controls: the part brand and the vehicle make */
        assert.equal((await page.textContent('[data-nf-btn="b"]')).trim(), "Marca del repuesto");
        assert.match(await page.textContent("#vfRow"), /Marca del vehículo/);
        assert.equal(await page.$eval('#vfRow select[data-vf="md"]', (s) => s.disabled), true);
        /* no zero options */
        const opts = await page.$$eval('#vfRow select[data-vf="y"] option', (os) => os.map((o) => o.textContent));
        assert.ok(opts.length > 2 && opts.slice(1).every((t) => /\((\d[\d.,]*)\)$/.test(t) && !/\(0\)$/.test(t)), opts.join(","));
        await pickSel(page, "y", "2011");
        const n1 = Number((await page.textContent("#nfCount")).replace(/\D/g, ""));
        await pickSel(page, "mk", "bmw");
        const n2 = Number((await page.textContent("#nfCount")).replace(/\D/g, ""));
        await pickSel(page, "md", "3-series");
        const n3 = Number((await page.textContent("#nfCount")).replace(/\D/g, ""));
        assert.ok(120 >= n1 && n1 >= n2 && n2 >= n3 && n3 > 0, [n1, n2, n3].join(">"));
        assert.match(await page.textContent("#nfSel [data-vf-x]"), /Vehículo: 2011 BMW 3 Series/);
        assert.match(await page.textContent("#vfNone h2"), /Universal \/ sin datos de compatibilidad/);
        assert.equal(await page.$$eval("#vfNone .rail .card", (x) => x.length) > 0, true);
        urls.dept = page.url(); sets.dept = await railTitles(page);
        assert.deepEqual(sets.dept, want);
        if (SHOT && w === 390) await page.screenshot({ path: join(SHOT, "fitment-dept.png"), fullPage: false });
        if (SHOT && w === 390) { await page.$eval("#vfNone", (e) => { e.scrollIntoView(); window.scrollBy(0, -150); }); await page.screenshot({ path: join(SHOT, "fitment-dept-sin-datos.png") }); }
        if (SHOT && w === 1366) await page.screenshot({ path: join(SHOT, "fitment-dept-1366.png") });
        /* the Marca del repuesto stacks on top of the vehicle */
        await page.click('[data-nf-btn="b"]');
        assert.equal((await page.textContent(".nf-pan h4")).trim(), "Marca del repuesto");
        const brands = await page.$$eval(".nf-pan [data-nf-b]", (bs) => bs.map((b) => b.getAttribute("data-nf-b")));
        assert.ok(brands.includes("duralast"), brands.join());
        await page.click('.nf-pan [data-nf-b="duralast"]');
        await page.waitForFunction(() => new URLSearchParams(location.search).get("b") === "duralast");
        await settle(page);
        const n4 = Number((await page.textContent("#nfCount")).replace(/\D/g, ""));
        assert.ok(n4 > 0 && n4 < n3, n4 + " vs " + n3);
        assert.match(await page.textContent('#nfSel [data-nf-x="b"]'), /^Marca del repuesto: Duralast/);
        await page.click('#nfSel [data-nf-x="b"]');
        await page.waitForFunction(() => !new URLSearchParams(location.search).get("b"));
        await settle(page);
      });
      await check(`browser ${w}: the store (tienda.html?tienda=advanceauto) keeps the vehicle, and its «Pastillas De Freno» + vehicle opens the same view with the same results`, async () => {
        await page.goto(`${BASE}/tienda.html?tienda=advanceauto`);
        await page.waitForSelector("#vfCard select[data-vf=t]", { timeout: 60000 });
        assert.match(await page.textContent("#vfCard"), /Vehículo: 2011 BMW 3 Series/);
        await page.waitForSelector('#vfCard select[data-vf=t] option[value="pastillas-de-freno"]', { state: "attached" });
        await page.selectOption("#vfCard select[data-vf=t]", "pastillas-de-freno");
        await page.waitForFunction(() => /pastillas-de-freno/.test((document.getElementById("vfGo") || {}).href || "") && /Ver \d/.test(document.getElementById("vfGo").textContent));
        assert.match(await page.textContent("#vfGo"), new RegExp("^Ver " + want.length + " repuestos para tu 2011 BMW 3 Series"));
        if (SHOT && w === 390) await page.screenshot({ path: join(SHOT, "fitment-store.png") });
        await Promise.all([page.waitForNavigation(), page.click("#vfGo")]);
        await settle(page);
        urls.store = page.url(); sets.store = await railTitles(page);
      });
      await check(`browser ${w}: Aria Auto restores 2011 BMW 3 Series in its own selector, and its «Frenos» lands on the same view`, async () => {
        await page.goto(`${BASE}/aria-auto.html#buscar`);
        await page.waitForFunction(() => document.getElementById("autoModel") && document.getElementById("autoModel").value === "3 Series", null, { timeout: 60000 });
        assert.equal(await page.$eval("#autoYear", (s) => s.value), "2011");
        assert.equal(await page.$eval("#autoMake", (s) => s.value), "BMW");
        assert.match(await page.textContent('label[for="autoMake"]'), /Marca del vehículo/);
        if (SHOT && w === 390) { await page.$eval("#t-vehiculo", (e) => { e.scrollIntoView(); window.scrollBy(0, -80); }); await page.screenshot({ path: join(SHOT, "fitment-aria-auto.png") }); }
        await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.click('#searchCard .chip[data-q="pastillas de freno"]')]);
        await settle(page);
        urls.auto = page.url(); sets.auto = await railTitles(page);
        if (SHOT && w === 390) await page.screenshot({ path: join(SHOT, "fitment-aria-auto-landing.png") });
      });
      await check(`browser ${w}: department, store and Aria Auto -- one url (the same filters) and equal result sets`, () => {
        assert.deepEqual(filters(urls.store), filters(urls.dept));
        assert.deepEqual(filters(urls.auto), filters(urls.dept));
        assert.deepEqual(filters(urls.dept), { path: "/departamento.html", dept: "auto_parts", nav: "1", t: "pastillas-de-freno", vy: "2011", vmk: "bmw", vmd: "3-series" });
        assert.deepEqual(sets.store, sets.dept);
        assert.deepEqual(sets.auto, sets.dept);
      });
      await check(`browser ${w}: the chip removes the vehicle -- here and on the next page -- and the department is whole again`, async () => {
        await page.click("#nfSel [data-vf-x]");
        await page.waitForFunction(() => !new URLSearchParams(location.search).get("vy"));
        await settle(page);
        assert.match(await page.textContent("#nfCount"), /^120 productos/);
        assert.equal(await page.$("#vfNone"), null);
        assert.equal(await page.evaluate(() => localStorage.getItem("aria_vehicle_v1")), null);
        await page.goto(`${BASE}/departamento.html?dept=auto_parts&nav=1`);
        await settle(page);
        assert.equal(new URL(page.url()).searchParams.get("vy"), null);
        assert.deepEqual(errors, []);
      });
      await c.close();
    }
    await check("browser: no page fetched a catalogue or a _fn/ list (the fitment data stays on the server)", () => {
      const bad = seen.filter((p) => /(-catalog\.json|auto-cache\.json|\/_fn\/|department-cache)/.test(p));
      assert.deepEqual(bad, []);
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
