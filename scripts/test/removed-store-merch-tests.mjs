/* ==================================================================
   REMOVAL COMPLETENESS: NO MERCHANDISING FOR AN OFF-SALE STORE (#443).

   #457 took 21 stores off sale through the data (catalogues, search,
   Ofertas, tiles, the assistant), but static markup does not read
   off-sale.js: a hard-coded Best Buy banner's comments and CSS, the
   off-sale stores' ambient themes and Best Buy's "Por qué compramos"
   trust strip survived in the page templates. Danny spotted it live.

   This holds every page template (the root *.html files) to the rule:
   for every store on off-sale.js's list there is
     - no ambient theme or interior-photo CSS
       ([data-store-theme="<key>"], .storePhotoBg--<key>),
     - no store rail, banner or feature markup (data-store-rail,
       data-store-rail-row, data-<key>-feature),
     - no <img> of the store's own logo (logos/<key>.*) in the markup,
     - and none of the Best Buy promotional pieces by name.

   NOT in scope (mechanism, not merchandising): off-sale.js itself, the
   retailer registries and label dictionaries pages and the bundle carry
   (they are gated by off-sale.js at run time), image-host patterns, and
   brand names on products that live stores sell (Nike at Pro Soccer,
   Golden Goose at Farfetch).

   SEPHORA: DO NOT BUILD (#443, comms #443, Danny's iPhone QA). Resale
   is prohibited, so Sephora gets no merchandising at all: no homepage
   rail (three copies: phone, desktop, Tiendas), no strip / directory
   tile, no storefront (tienda.html registry, the app's store view, a
   product's "Ver más en" door), no ambient theme or interior photo.
   It is NOT on off-sale.js: its products in beauty-catalog.json stay
   (search, Aria Beauty, fragrances) until Danny and Lucifer decide --
   these checks pin that scope too. With Playwright installed, the
   rendered homepage (scrolled through), the app's Tiendas view,
   tienda.html and tienda.html?tienda=sephora are read for the word.

   RUNNING IT
     node scripts/test/removed-store-merch-tests.mjs
   REMOVED_STORE_PORT picks the port of the rendered checks (default
   8987); SKIP_BROWSER=1 runs the static checks only.
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import http from "node:http";
import { join, extname, normalize } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const OFF = JSON.parse("[" + /var OFF_SALE_RETAILERS = \[([\s\S]*?)\];/.exec(readFileSync(ROOT + "off-sale.js", "utf8"))[1]
  .replace(/'/g, '"').replace(/,\s*$/, "") + "]");
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

/* Markup only: the page with its <script> bodies removed, so a registry
   inside a script is not mistaken for a tag. Styles stay in. */
const markupOf = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>");

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
async function check_async(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

check(`the off-sale list is the one #457 set (${OFF.length} stores)`, () => {
  for (const k of ["bestbuy", "target", "costco", "victoriassecret", "pacsun"]) assert.ok(OFF.includes(k), `${k} is not on off-sale.js`);
});

for (const page of PAGES) {
  const html = readFileSync(ROOT + page, "utf8");
  const markup = markupOf(html);
  check(`${page}: no theme, rail, banner or logo markup for an off-sale store`, () => {
    const found = [];
    for (const k of OFF) {
      const rx = [
        [`theme CSS`, new RegExp(`data-store-theme="${k}"`)],
        [`photo backdrop CSS`, new RegExp(`storePhotoBg--${k}\\b`)],
        [`store rail`, new RegExp(`data-store-rail(-row)?="${k}"`)],
        [`feature block`, new RegExp(`data-${k}-feature\\b`)],
        [`logo <img>`, new RegExp(`<img\\b[^>]*\\bsrc="/?logos/${k}\\.(svg|png|jpg|webp)"`, "i")],
      ];
      for (const [what, re] of rx) if (re.test(markup)) found.push(`${k}: ${what}`);
    }
    assert.deepEqual(found, []);
  });
}

check("the Best Buy banner, its CSS and its trust strip are gone", () => {
  const home = readFileSync(ROOT + "index.html", "utf8");
  assert.doesNotMatch(home, /BEST BUY BANNER/);
  assert.doesNotMatch(home, /\.bb(Band|TagRule|Logo|Kicker|Cta|Points)\b/);
  assert.doesNotMatch(readFileSync(ROOT + "tienda.html", "utf8"), /Por qué compramos en Best Buy/);
});

check("no orphan block comments for removed shelves (Costco treasure hunt, Target rail)", () => {
  const home = readFileSync(ROOT + "index.html", "utf8");
  assert.doesNotMatch(home, /TREASURE-HUNT SHELF/);
  assert.doesNotMatch(home, /Target rail removed/);
});

/* ---------------- Sephora: no merchandising, products untouched ---------------- */
const NO_STOREFRONT = ["sephora"];
const bundleFile = /<script src="\/build\/(app-[0-9a-f]+\.js)"><\/script>/.exec(readFileSync(ROOT + "index.html", "utf8"))[1];
const BUNDLE = readFileSync(ROOT + "build/" + bundleFile, "utf8").replace(/\r\n/g, "\n");

for (const page of PAGES) {
  const markup = markupOf(readFileSync(ROOT + page, "utf8"));
  check(`${page}: no rail, theme, photo or logo markup for a no-storefront store (Sephora)`, () => {
    const found = [];
    for (const k of NO_STOREFRONT) for (const [what, re] of [
      ["theme CSS", new RegExp(`data-store-theme="${k}"`)],
      ["photo backdrop CSS", new RegExp(`storePhotoBg--${k}\\b`)],
      ["store rail", new RegExp(`data-store-rail(-row)?="${k}"`)],
      ["store door", new RegExp(`openStore\\('${k}'\\)|tienda=${k}\\b`)],
      ["logo <img>", new RegExp(`<img\\b[^>]*\\bsrc="/?logos/${k}\\.(svg|png|jpg|webp)"`, "i")],
    ]) if (re.test(markup)) found.push(`${k}: ${what}`);
    assert.deepEqual(found, []);
  });
}

check("index.html: no Sephora word left anywhere in the page (rails, CSS, comments)", () => {
  assert.doesNotMatch(readFileSync(ROOT + "index.html", "utf8"), /sephora/i);
});

check("the app bundle: Sephora has no rail, strip or directory tile, store door, theme or interior photo", () => {
  const rails = /const STORE_RAIL_STORES = \[([^\]]*)\]/.exec(BUNDLE)[1];
  assert.doesNotMatch(rails, /'sephora'/, "Sephora is a homepage rail");
  /* Closed (#443 item 40): no registry row left to need a no-storefront flag. */
  assert.doesNotMatch(BUNDLE, /\bsephora:\s*\{\s*key:\s*'sephora'/, "Sephora is still a registered store");
  const fnOf = (name) => { const i = BUNDLE.indexOf("function " + name + "("); assert.ok(i >= 0, name + " is gone"); return BUNDLE.slice(i, BUNDLE.indexOf("\n}\n", i)); };
  assert.match(fnOf("otherStoresStripOrder"), /hasStorefront\(r\.key\)/, "the Tiendas strip shows it");
  assert.match(fnOf("retailersByTier"), /hasStorefront\(r\.key\)/, "the Tiendas directory shows it");
  assert.match(fnOf("storeDoorFor"), /!hasStorefront\(r\.key\)/, "a product opens its store");
  assert.match(fnOf("openStore"), /if \(!hasStorefront\(retailer\)\)/, "the store view opens");
  assert.match(BUNDLE, /isOffSaleRetailer\(k\) && hasStorefront\(k\) && \(r\.search \|\| r\.browse\)/, "the assistant can open its store");
  const strip = /const TIENDAS_STRIP = \[([\s\S]*?)\n\];/.exec(BUNDLE)[1];
  assert.doesNotMatch(strip, /k:'sephora'/);
  for (const name of ["STORE_BACKDROPS", "STORE_THEMES"]) {
    const i = BUNDLE.indexOf("const " + name + " = {");
    assert.ok(i >= 0, name + " is gone");
    assert.doesNotMatch(BUNDLE.slice(i, BUNDLE.indexOf("\n};", i)), /^\s*sephora:/m, `${name} still dresses Sephora`);
  }
});

check("tienda.html and producto.html: no Sephora storefront, no door to one", () => {
  const stores = JSON.parse(/var STORES = (\{.*\});/.exec(readFileSync(ROOT + "tienda.html", "utf8"))[1]);
  assert.ok(!("sephora" in stores), "tienda.html still opens a Sephora storefront");
  const pdp = readFileSync(ROOT + "producto.html", "utf8");
  assert.doesNotMatch(pdp, /"sephora"/, "producto.html still maps Sephora");
  assert.match(pdp, /if \(tk && NO_STOREFRONT\[tk\]\) return '';/, "the product page links to the Sephora storefront");
});

check("no generated Sephora merchandising: home shelf, storefront slices, store photos", () => {
  const idx = JSON.parse(readFileSync(ROOT + "assets/home/shelves/index.json", "utf8"));
  assert.ok(!idx.stores.includes("sephora"), "the home shelves still build a Sephora rail");
  for (const f of ["assets/home/shelves/store-sephora.json", "assets/tienda/sephora", "assets/tienda/_fn/sephora.json", "assets/tienda/hero/sephora.jpg", "assets/stores/sephora.jpg"])
    assert.ok(!existsSync(ROOT + f), `${f} still exists`);
});

/* SCOPE, UPDATED (#443 item 40, Lucifer: "Sephora (lane closed) ... comes
   out in the Item 37-style sweep under existing rulings"): Sephora is off
   sale and its products are gone from every served file -- shelved under
   hidden-docs/shelved/, which is never served. */
check("scope: Sephora is closed -- off sale, its products off the site, the data shelved", () => {
  assert.ok(OFF.includes("sephora"), "sephora is not on off-sale.js");
  const beauty = JSON.parse(readFileSync(ROOT + "beauty-catalog.json", "utf8"));
  assert.ok(!(beauty.retailers && beauty.retailers.sephora), "beauty-catalog.json still serves Sephora products");
  assert.ok(existsSync(ROOT + "hidden-docs/shelved/sephora-beauty-catalog.json"), "Sephora's rows are not shelved");
});

/* ---------------- rendered: the word, as a shopper's phone shows it ---------------- */
let chromium = null;
if (!process.env.SKIP_BROWSER) { try { ({ chromium } = await import("playwright")); } catch (e) { console.log("    (playwright not installed: rendered checks skipped)"); } }
if (chromium) {
  const PORT = Number(process.env.REMOVED_STORE_PORT || 8987);
  const BASE = `http://127.0.0.1:${PORT}`;
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, BASE);
    if (u.pathname.startsWith("/.netlify/functions/")) {
      res.writeHead(u.pathname.endsWith("exchange-rate") ? 200 : 404, { "Content-Type": "application/json" });
      return res.end(u.pathname.endsWith("exchange-rate") ? '{"venta":3.75}' : "{}");
    }
    let path = decodeURIComponent(u.pathname);
    const b = /^\/build\/(app-[0-9a-f]+\.js)$/.exec(path);
    if (b && existsSync(join(ROOT, "build/min", b[1]))) path = "/build/min/" + b[1];
    let p = normalize(join(ROOT, path));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  await new Promise((resolve, reject) => {
    server.once("error", (e) => reject(e.code === "EADDRINUSE" ? new Error(`port ${PORT} is busy -- set REMOVED_STORE_PORT`) : e));
    server.listen(PORT, "127.0.0.1", resolve);
  });
  const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const words = (s) => (String(s).match(/sephora/gi) || []).length;
  const counts = {};
  async function rendered(url, after) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pg = await c.newPage();
    await pg.route((u) => u.host !== new URL(BASE).host, (r) => r.abort());
    await pg.goto(BASE + url);
    await pg.waitForTimeout(2500);
    const H = await pg.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H + 800; y += 700) { await pg.evaluate((y) => window.scrollTo(0, y), y); await pg.waitForTimeout(100); }
    await pg.waitForTimeout(1200);
    const r = await pg.evaluate(() => ({ text: document.body.innerText, html: document.documentElement.outerHTML.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "") }));
    const out = { text: words(r.text), markup: words(r.html), rails: await pg.evaluate(() => document.querySelectorAll('[data-store-rail="sephora"], [data-store-rail-row="sephora"], [data-retailer="sephora"]').length) };
    if (after) Object.assign(out, await after(pg));
    await c.close();
    return out;
  }
  await check_async("rendered: the homepage, the app's Tiendas view, tienda.html and tienda.html?tienda=sephora show no Sephora", async () => {
    counts.home = await rendered("/index.html", async (pg) => {
      await pg.evaluate(() => { showPage("storesView"); if (typeof renderStoresGrid === "function") renderStoresGrid(); });
      await pg.waitForTimeout(800);
      return { tiendasView: await pg.evaluate(() => (document.getElementById("storesView").innerText.match(/sephora/gi) || []).length) };
    });
    counts.tienda = await rendered("/tienda.html");
    counts.tiendaSephora = await rendered("/tienda.html?tienda=sephora", async (pg) => ({ storefront: await pg.evaluate(() => !!(document.getElementById("storeWrap") && document.getElementById("storeWrap").offsetWidth)) }));
    console.log("         " + JSON.stringify(counts));
    assert.deepEqual(counts.home, { text: 0, markup: 0, rails: 0, tiendasView: 0 });
    /* Markup is the page with its scripts taken out: tienda.html's own
       script names sephora.com once, in its photo-host rule (a
       mechanism, not merchandising). */
    assert.deepEqual(counts.tienda, { text: 0, markup: 0, rails: 0 });
    assert.deepEqual(counts.tiendaSephora, { text: 0, markup: 0, rails: 0, storefront: false });
  });
  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n"));
  process.exit(1);
}
