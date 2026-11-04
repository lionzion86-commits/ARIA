#!/usr/bin/env node
/* ==================================================================
   THE HEADER CART ON EVERY PAGE (#443 c.6619105467 and c.6619111897,
   Danny's live check: the cart icon showed in the header on the
   homepage only, never on a department, store, brand, product, search
   or checkout page).

   PAGE (static)
   - every page in scripts/header-search.mjs's page list carries the
     cart, current with the generator: the link to /?carrito=1 as the
     last item of the header row, its CSS inline in <head>, and
     assets/js/header-cart.js (defer); index.html keeps its own
     bundle-driven cart button with #cartCountBadge;
   - carrito.html still lands on the homepage's cart view;
   - header-cart.js reads localStorage 'aria_cart_v1' and nothing else:
     no fetch, no catalogue; Spanish, no emoji.
   BROWSER (headless Chromium, 390x844 phone and 1366x800 desktop) on
   index, departamento (women, men, beauty), tienda, marca, producto,
   search, ofertas, ropa-interior, disenadores, carrito and checkout:
   - the cart is visible in the header, in the top-right region, and is
     what a tap there hits;
   - an empty cart shows no badge; a seeded cart of 2 items reads 2;
   - clicking it reaches the cart view (/?carrito=1, «Tu carrito»).

     node scripts/test/header-cart-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/header-cart-tests.mjs   (saves the 2-item screenshots)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const HS = await import("../header-search.mjs");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

/* ------------------------------ static ------------------------------ */
await check(`every page in the header generator's list (${HS.HS_PAGES.length}) carries the cart, current with scripts/header-search.mjs`, () => {
  assert.deepEqual(HS.syncPages({ write: false }), [], "a copy is stale -- run: node scripts/header-search.mjs");
  assert.deepEqual([...HS.HC_PAGES, "index.html"].sort(), [...HS.HS_PAGES].sort(), "a page with the header has no cart");
  for (const f of HS.HC_PAGES) {
    const s = read(f);
    const head = s.slice(0, s.indexOf("</head>"));
    assert.ok(head.includes('<style id="hc-css">'), `${f}: the cart CSS is not inline in <head>`);
    assert.match(head, /<script src="\/assets\/js\/header-cart\.js"[^>]*><\/script>/, `${f}: header-cart.js is not loaded`);
    assert.equal((s.match(/ data-hc>/g) || []).length, 1, `${f}: one header cart`);
    const hdr = s.slice(s.indexOf("<header"), s.indexOf("</header>"));
    const cart = hdr.match(/<!-- hc:start -->([\s\S]*?)<!-- hc:end -->/);
    assert.ok(cart, `${f}: the cart is not inside the header`);
    assert.match(cart[1], /^<a class="hc( hc-dark)?" href="\/\?carrito=1" aria-label="Carrito" data-hc>/, `${f}: the cart does not open the cart view`);
    assert.match(cart[1], /<span class="hc-n" hidden>0<\/span><\/a>$/, `${f}: the badge does not start hidden`);
    /* The last item of the header row: nothing but whitespace between it and the row's close. */
    const after = s.slice(s.indexOf("<!-- hc:end -->") + 15);
    assert.match(after, /^\s*<\/(div|nav)>/, `${f}: the cart is not the last item of the header row`);
  }
});

await check("index.html keeps its own header cart (the bundle's openCart and #cartCountBadge)", () => {
  const s = read("index.html");
  const hdr = s.slice(s.indexOf("<header"), s.indexOf("</header>"));
  assert.match(hdr, /<button onclick="openCart\(\)" aria-label="Carrito"/);
  assert.ok(hdr.includes('id="cartCountBadge" hidden'));
  assert.ok(!s.includes("header-cart.js"), "index.html would paint its badge twice");
});

await check("carrito.html lands on the homepage's cart view", () => {
  const s = read("carrito.html");
  assert.ok(s.includes("location.replace('/?carrito=1'"));
  assert.equal(HS.HC_HREF, "/?carrito=1");
});

await check("header-cart.js reads the homepage's cart key and makes no request; Spanish, no emoji", () => {
  const js = read("assets/js/header-cart.js");
  assert.ok(js.includes("'aria_cart_v1'"));
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|import\s*\(|catalog\.json|\.json['"]/.test(js), "header-cart.js requests something");
  const all = js + HS.HC_CSS + HS.hcMarkup() + HS.hcMarkup({ dark: true });
  assert.ok(!EMOJI.test(all), "an emoji");
  assert.ok(js.includes("'Carrito, '") && js.includes("' productos'"));
});

/* ----------------------------- browser ------------------------------ */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available for the page checks", () => assert.ok(pw, "playwright is not installed"));
if (pw) {
  const { createServer } = await import("node:http");
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const handlers = {
    search: (await import("../../netlify/functions/search.js")).handler,
    brand: (await import("../../netlify/functions/brand.js")).handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
  };
  /* checkout.html compiles Tailwind from cdn.tailwindcss.com, which this
     sandbox cannot reach: the same classes are built here and served. */
  const twDir = mkdtempSync(join(tmpdir(), "hc-tw-"));
  writeFileSync(join(twDir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  writeFileSync(join(twDir, "tw.config.cjs"), `module.exports = { content: [${JSON.stringify(join(ROOT, "checkout.html"))}, ${JSON.stringify(join(ROOT, "index.html"))}] };`);
  const tw = spawnSync(join(ROOT, "node_modules/.bin/tailwindcss"), ["-c", join(twDir, "tw.config.cjs"), "-i", join(twDir, "in.css"), "-o", join(twDir, "out.css")], { encoding: "utf8" });
  const TW_CSS = tw.status === 0 ? readFileSync(join(twDir, "out.css"), "utf8") : "";
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/__tw.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(TW_CSS); }
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) }, { fetchImpl });
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

  /* A Zumiez record with its own page, for producto.html. */
  const zum = JSON.parse(read("zumiez-catalog.json"));
  let ZT = "";
  for (const b of Object.values(zum.retailers.zumiez.departments)) for (const it of (Array.isArray(b) ? b : b.items || [])) if (!ZT && (it.title || it.name)) ZT = it.title || it.name;
  const PAGES = [
    ["index", "/"],
    ["departamento-women", "/departamento.html?dept=women"],
    ["departamento-men", "/departamento.html?dept=men"],
    ["departamento-beauty", "/departamento.html?dept=beauty"],
    ["tienda", "/tienda.html?tienda=sephora"],
    ["marca", "/marca.html?marca=nike"],
    ["producto", `/producto.html?producto=${encodeURIComponent(ZT)}&tienda=zumiez`],
    ["search", "/search.html?q=blorptastic"],
    ["ofertas", "/ofertas.html"],
    ["ropa-interior", "/ropa-interior.html"],
    ["disenadores", "/disenadores.html"],
    ["carrito", "/carrito.html"],
    ["checkout", "/checkout.html"],
  ];
  /* Two real lines the homepage cart keeps (scripts/test/cart-thumb-tests.mjs). */
  const TWO = [
    { retailer: "americaneagle", title: "AEO Men's 6\" Flex Boxer Brief", selectedSize: "M", priceUsd: 14.95, weightKg: 0.1, qty: 1 },
    { retailer: "ccs", title: "Brixton x Coors Light Silver Speed T-Shirt - Black", selectedSize: "L", priceUsd: 32, weightKg: 0.25, qty: 1 },
  ];

  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const open = async (w, cart) => {
    const phone = w < 768;
    const c = await browser.newContext(phone
      ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: w, height: 800 } });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
      const u = new URL(r.request().url());
      if (u.host === "cdn.tailwindcss.com") return r.fulfill({ status: 200, contentType: "application/javascript", body: `document.write('<link rel="stylesheet" href="${BASE}/__tw.css">');` });
      return r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort();
    });
    /* Seed once per context, before the first page's scripts run (not on
       every navigation, so the cart view sees what the page left). */
    await c.addInitScript((cart) => {
      try {
        if (sessionStorage.getItem("__hcSeeded")) return;
        sessionStorage.setItem("__hcSeeded", "1");
        if (cart) localStorage.setItem("aria_cart_v1", JSON.stringify(cart)); else localStorage.removeItem("aria_cart_v1");
      } catch (e) { /* storage blocked */ }
    }, cart);
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return { c, page, errors, phone };
  };
  const CART_SEL = "header [data-hc], header button[onclick=\"openCart()\"]";
  const BADGE_JS = `(() => { const a = document.querySelector(${JSON.stringify(CART_SEL)}); if (!a) return null; const b = a.querySelector(".hc-n, #cartCountBadge"); if (!b) return "no badge"; const shown = !b.hidden && getComputedStyle(b).display !== "none" && b.getBoundingClientRect().width > 0; return shown ? b.textContent.trim() : "hidden"; })()`;
  /* Is the cart on screen, in the header, top-right, and what a tap there hits? */
  const seen = (page) => page.evaluate((sel) => {
    const all = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0);
    if (all.length !== 1) return `${all.length} visible header carts`;
    const a = all[0], r = a.getBoundingClientRect();
    if (r.width < 32 || r.height < 32) return `${Math.round(r.width)}x${Math.round(r.height)} is under 32x32`;
    if (r.top < 0 || r.bottom > 140) return `not at the top: top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}`;
    if (r.left < innerWidth * 0.5 || r.right > innerWidth) return `not top-right: left ${Math.round(r.left)}, right ${Math.round(r.right)} of ${innerWidth}`;
    if (document.documentElement.scrollWidth > innerWidth + 1) return `horizontal overflow: ${document.documentElement.scrollWidth} > ${innerWidth}`;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !a.contains(hit)) return `covered by ${hit && hit.tagName}.${hit && hit.className}`;
    return "ok";
  }, CART_SEL);
  const SHOT = process.env.SHOT_DIR || "";
  const SHOTS = { "departamento-women": "dept", "producto": "product" };

  try {
    for (const W of [390, 1366]) {
      for (const [name, path] of PAGES) {
        if (process.env.ONLY && !process.env.ONLY.split(",").includes(name)) continue;
        await check(`browser ${W}px: ${name} -- empty cart: the header cart is visible top-right, no badge`, async () => {
          const { c, page, errors } = await open(W, null);
          try {
            await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
            await page.waitForSelector(CART_SEL, { state: "visible", timeout: 20000 });
            await page.waitForTimeout(300);
            assert.equal(await seen(page), "ok");
            assert.equal(await page.evaluate(BADGE_JS), "hidden", "an empty cart shows a badge");
            assert.deepEqual(errors, []);
          } finally { await c.close(); }
        });
        await check(`browser ${W}px: ${name} -- 2 items: the badge reads 2; clicking the cart reaches the cart view`, async () => {
          const { c, page, errors } = await open(W, TWO);
          try {
            await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
            await page.waitForSelector(CART_SEL, { state: "visible", timeout: 20000 });
            await page.waitForFunction((js) => (0, eval)(js) === "2", BADGE_JS, { timeout: 30000 }).catch(() => {});
            assert.equal(await page.evaluate(BADGE_JS), "2", "the badge does not read 2");
            assert.equal(await seen(page), "ok");
            if (SHOT && SHOTS[name]) await page.screenshot({ path: join(SHOT, `cart-${SHOTS[name]}-${W}.png`) });
            await page.click(CART_SEL);
            await page.waitForFunction(() => {
              const v = document.getElementById("cartView");
              return v && getComputedStyle(v).display !== "none" && /Tu carrito/.test(v.textContent) && document.querySelectorAll("#cartItemsWrap > *").length > 0;
            }, null, { timeout: 30000 });
            const u = new URL(page.url());
            assert.equal(u.pathname, "/", `the cart is not the homepage's cart view: ${page.url()}`);
            /* The homepage's own badge waits for its cart to load (initCart). */
            await page.waitForFunction((js) => (0, eval)(js) === "2", BADGE_JS, { timeout: 30000 }).catch(() => {});
            assert.equal(await page.evaluate(BADGE_JS), "2", "the cart view's own header badge does not read 2");
            assert.deepEqual(errors, []);
          } finally { await c.close(); }
        });
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\nheader cart: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
