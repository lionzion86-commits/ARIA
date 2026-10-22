/* ==================================================================
   NO GALLERY ARROWS ON A SINGLE PHOTO (#443, Danny's iPhone QA).

   A card or product page showed prev/next arrows on a product that has
   ONE photo: its data listed the same photo twice (the card copy and the
   gallery copy, or the same file at another size / ?$preset$), and the
   cards' swipe list only folded identical strings. 1,776 live products
   (Finish Line 1,099, Dennis Kirk 393, RevZilla 199, B&H 77, Dick's 6...)
   had arrows that swapped a photo for itself.

   The rule now: gallery controls (arrows, counter, thumbnails, swipe
   list) exist ONLY for 2+ DISTINCT photos, counted with producto.html's
   galleryPhotoKey / tidyGallery (#468) everywhere.

   DATA
   - the app bundle's card copies of galleryPhotoKey / galleryIsChart /
     tidyGallery are producto.html's, verbatim (renamed card*);
   - cardSwipeList is null for one photo at any number of sizes, a list
     for 2+; over every live catalogue product it gives arrows exactly
     when the product page counts 2+ photos.
   BROWSER (headless Chromium, iPhone 390x844, DPR 2; every off-site
   photo answered with a local stand-in, /__photo.jpg)
   - homepage: a Zumiez card renders in its rail with no arrows; every
     card that has arrows has 2+ distinct photos; multi-photo cards still
     have them;
   - tienda.html (Zumiez), ofertas.html, search.html: product cards, and
     no gallery control on any card;
   - producto.html: a Zumiez product and a Finish Line product (one photo
     listed at two presets) show no arrows, counter, thumbnails or
     gallery; a SKIMS product shows them all (arrows visible with a
     mouse); when every photo but the first fails, the controls go too.

   RUNNING IT
     node scripts/test/gallery-arrows-tests.mjs
   GALLERY_ARROWS_PORT picks the port (default 8986). PLAYWRIGHT_CHROMIUM
   uses an installed Chromium (default /opt/pw-browsers/chromium when it
   exists). SKIP_BROWSER=1 runs the data checks only.
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { liftPage, sourceFiles } from "../build-pdp-slices.mjs";
import { isOffSaleRetailer } from "../lib/off-sale.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const html = readFileSync(ROOT + "index.html", "utf8");
const bundleName = /<script src="\/build\/(app-[0-9a-f]+\.js)"><\/script>/.exec(html)[1];
const bundle = readFileSync(ROOT + "build/" + bundleName, "utf8").replace(/\r\n/g, "\n");
const pdp = readFileSync(ROOT + "producto.html", "utf8").replace(/\r\n/g, "\n");
const P = liftPage(ROOT);

/* A top-level function's source, brace-matched (these bodies hold no
   braces inside strings or regexes that would unbalance the count). */
function fnSource(src, name) {
  const i = src.indexOf("\nfunction " + name + "(");
  assert.ok(i >= 0, `function ${name} is gone`);
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}" && --d === 0) return src.slice(i + 1, k + 1);
  }
  throw new Error("unterminated " + name);
}
const RENAME = [["galleryPhotoKey", "cardGalleryPhotoKey"], ["galleryIsChart", "cardGalleryIsChart"], ["tidyGallery", "cardTidyGallery"]];

await check("the bundle's card gallery rule is producto.html's, verbatim", () => {
  for (const [page, card] of RENAME) {
    let want = fnSource(pdp, page);
    for (const [a, b] of RENAME) want = want.replace(new RegExp("\\b" + a + "\\b", "g"), b);
    assert.equal(fnSource(bundle, card), want, `${card} drifted from producto.html ${page}`);
  }
});

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(RENAME.map(([, c]) => fnSource(bundle, c)).concat([fnSource(bundle, "cardSwipeList")]).join("\n") + "\n;globalThis.cardSwipeList = cardSwipeList;", ctx);
const cardSwipeList = (p) => { const l = ctx.cardSwipeList(p); return l ? JSON.parse(JSON.stringify(l)) : null; };

await check("cardSwipeList: one photo at any size is no swipe list; two photos are", () => {
  const fl = "https://media.finishline.com/s/finishline/FN3787_497";
  assert.equal(cardSwipeList({ image: fl + "?$App_L$", images: [fl + "?$Main$"] }), null, "Finish Line: one photo, two presets");
  const dk = "https://www.denniskirk.com/dk/product_images/oe/";
  assert.equal(cardSwipeList({ image: dk + "290pix/oe_1.jpg", images: [dk + "75pix/oe_1.jpg", dk + "600pix/oe_1.jpg"] }), null, "Dennis Kirk: three sizes");
  const z = "https://scene7.zumiez.com/is/image/zumiez/cat_max/X-_1.jpg";
  assert.equal(cardSwipeList({ image: z, images: [z] }), null, "Zumiez: the card photo listed again");
  assert.equal(cardSwipeList({ image: z }), null);
  assert.equal(cardSwipeList({ image: "https://x.com/a.jpg", images: ["https://x.com/placeholder.png", "https://x.com/logo.svg", "/rel.jpg"] }), null, "non-photos count");
  assert.deepEqual(cardSwipeList({ image: "https://x.com/a.jpg", images: ["https://x.com/a.jpg?v=2", "//x.com/b.jpg"] }), ["https://x.com/a.jpg", "https://x.com/b.jpg"]);
  assert.deepEqual(cardSwipeList({ image: "https://x.com/a.jpg", images: ["https://x.com/size-chart.jpg", "https://x.com/b.jpg"] }), ["https://x.com/a.jpg", "https://x.com/b.jpg", "https://x.com/size-chart.jpg"], "size chart last");
});

/* Every live catalogue product: arrows exactly when the product page
   counts 2+ photos. */
const all = [];
for (const f of sourceFiles(P)) {
  const p = ROOT + f.slice(1);
  if (!existsSync(p)) continue;
  const rs = JSON.parse(readFileSync(p, "utf8")).retailers || {};
  for (const [rk, r] of Object.entries(rs)) for (const section of ["departments", "brands"]) for (const b of Object.values((r && r[section]) || {})) {
    for (const raw of Array.isArray(b) ? b : (b && b.items) || []) {
      const it = P.normalizeItem(raw, rk);
      if (it && !isOffSaleRetailer(it.retailer)) all.push({ raw, it });
    }
  }
}
await check("over every live catalogue product, a card has arrows exactly when the product page counts 2+ photos", () => {
  let arrows = 0, single = 0, own = 0;
  const off = [];
  for (const { raw, it } of all) {
    const l = cardSwipeList(raw);
    const n = it.images.length;
    if (l) arrows++; else single++;
    if (!!l === n > 1) continue;
    /* The one known difference: the card opens on `image`, the product
       page on `thumbnail`, and a few Hot Topic rows name two different
       photos there -- both real, so the card's arrows walk two photos. */
    const a = P.galleryPhotoKey(raw.image), t = P.galleryPhotoKey(raw.thumbnail);
    if (l && l.length === 2 && a && t && a !== t) { own++; continue; }
    off.push(`${it.retailer}: ${it.name} (card ${l ? l.length : 1}, page ${n})`);
  }
  assert.deepEqual(off.slice(0, 6), [], `${off.length} products disagree`);
  assert.ok(arrows > 50000 && single > 30000, `${arrows} with arrows, ${single} without`);
  console.log(`         (${all.length} live products: ${arrows} with arrows, ${single} single-photo without; ${own} whose card photo and page photo are two different photos)`);
});

await check("the thin pages' product cards carry no gallery control at all", () => {
  for (const f of ["tienda.html", "ofertas.html", "search.html", "departamento.html", "ropa-interior.html", "marca.html", "disenadores.html", "motos.html"]) {
    const src = readFileSync(ROOT + f, "utf8");
    assert.doesNotMatch(src, /Foto anterior|Foto siguiente|g-nav|data-card-imgs|cardSwipe/, `${f} has a card gallery control`);
  }
});

/* ---------- the browser ---------- */
let chromium = null;
if (!process.env.SKIP_BROWSER) {
  try { ({ chromium } = await import("playwright")); } catch (e) { console.log("    (playwright not installed: browser checks skipped)"); }
}
if (chromium) {
  const PORT = Number(process.env.GALLERY_ARROWS_PORT || 8986);
  const BASE = `http://127.0.0.1:${PORT}`;
  const PHOTO = readFileSync(ROOT + "assets/category/sunglasses.jpg");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, BASE);
    if (u.pathname === "/__photo.jpg") { res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(PHOTO); }
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
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(readFileSync(p));
  });
  await new Promise((resolve, reject) => {
    server.once("error", (e) => reject(e.code === "EADDRINUSE" ? new Error(`port ${PORT} is busy -- set GALLERY_ARROWS_PORT`) : e));
    server.listen(PORT, "127.0.0.1", resolve);
  });
  const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") && statSync("/opt/pw-browsers/chromium").isFile() ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" };
  async function open(url, opts = {}) {
    const c = await browser.newContext(opts.desktop ? { viewport: { width: 1280, height: 900 } } : IPHONE);
    const pg = await c.newPage();
    await pg.route((u) => u.host !== new URL(BASE).host, (r) => {
      if (r.request().resourceType() !== "image") return r.abort();
      if (opts.failAfterFirst && opts.failAfterFirst(r.request().url())) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ status: 302, headers: { location: BASE + "/__photo.jpg" } });
    });
    await pg.goto(BASE + url);
    return { c, pg };
  }
  /* Card gallery controls on a page: the bundle's arrows, plus any
     producto-style nav / dots a card could carry. */
  const CONTROLS = '[aria-label="Foto anterior"], [aria-label="Foto siguiente"], .g-nav, .g-dot, [data-card-imgs]';
  const keyCount = (list) => new Set(list.map((u) => P.galleryPhotoKey(u))).size;

  await check("homepage (iPhone): a Zumiez card has no arrows; every card with arrows has 2+ distinct photos", async () => {
    const { c, pg } = await open("/index.html");
    const H = await pg.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H + 800; y += 700) { await pg.evaluate((y) => window.scrollTo(0, y), y); await pg.waitForTimeout(120); }
    await pg.waitForFunction(() => document.querySelectorAll('[data-store-rail-row="zumiez"] img').length > 0, null, { timeout: 30000 });
    const r = await pg.evaluate((sel) => {
      const zRow = [...document.querySelectorAll('[data-store-rail-row="zumiez"]')].find((e) => e.offsetWidth) || document.querySelector('[data-store-rail-row="zumiez"]');
      return {
        zCards: zRow.querySelectorAll("img").length,
        zControls: zRow.querySelectorAll(sel).length,
        withArrows: [...document.querySelectorAll("[data-card-imgs]")].map((f) => ({
          imgs: JSON.parse(f.getAttribute("data-card-imgs")),
          arrows: f.querySelectorAll('[aria-label="Foto anterior"], [aria-label="Foto siguiente"]').length,
        })),
        arrowsOutside: [...document.querySelectorAll('[aria-label="Foto anterior"]')].filter((a) => !a.closest("[data-card-imgs]")).length,
      };
    }, CONTROLS);
    assert.ok(r.zCards >= 3, `the Zumiez rail shows ${r.zCards} cards`);
    assert.equal(r.zControls, 0, "a Zumiez card carries gallery controls");
    assert.equal(r.arrowsOutside, 0, "an arrow outside a card photo frame");
    const bad = r.withArrows.filter((x) => keyCount(x.imgs) < 2 || x.arrows !== 2);
    assert.deepEqual(bad.slice(0, 3), [], `${bad.length} cards with arrows but fewer than 2 distinct photos`);
    assert.ok(r.withArrows.length >= 10, `only ${r.withArrows.length} multi-photo cards keep their arrows`);
    console.log(`         (Zumiez rail: ${r.zCards} cards, 0 controls; ${r.withArrows.length} multi-photo cards with arrows, all 2+ distinct)`);
    await c.close();
  });

  for (const [label, url, cardSel] of [
    ["tienda.html (Zumiez storefront)", "/tienda.html?tienda=zumiez", "a[href*='producto.html']"],
    ["ofertas.html", "/ofertas.html", "a[href*='producto.html']"],
  ]) {
    await check(`${label} (iPhone): product cards render with no gallery control`, async () => {
      const { c, pg } = await open(url);
      await pg.waitForFunction((s) => document.querySelectorAll(s).length >= 3, cardSel, { timeout: 30000 });
      await pg.evaluate(() => window.scrollTo(0, 1200));
      await pg.waitForTimeout(600);
      const r = await pg.evaluate(([s, sel]) => ({ cards: document.querySelectorAll(s).length, controls: document.querySelectorAll(sel).length }), [cardSel, CONTROLS]);
      assert.ok(r.cards >= 3, `${r.cards} cards`);
      assert.equal(r.controls, 0, `${r.controls} gallery controls`);
      console.log(`         (${r.cards} cards, 0 controls)`);
      await c.close();
    });
  }

  const pick = (store, test) => {
    const n = new Map();
    for (const { it } of all) { const k = P.norm(it.name); n.set(k, (n.get(k) || 0) + 1); }
    const hit = all.find((x) => x.it.retailer === store && n.get(P.norm(x.it.name)) === 1 && test(x.it, x.raw));
    return hit && hit.it;
  };
  const zumiez = pick("zumiez", (it) => it.images.length === 1);
  /* One photo the data lists at two presets (?$App_L$ and ?$Main$): the
     card used to show arrows for it. */
  const finish = pick("finishline", (it, raw) => it.images.length === 1 && Array.isArray(raw.images) && raw.images.some((u) => u !== raw.image));
  const skims = pick("skims", (it) => it.images.length >= 4);
  const pdpState = (pg) => pg.evaluate(() => {
    const vis = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
    return {
      title: (document.querySelector("h1") || {}).textContent || "",
      gallery: !!document.querySelector(".p-gallery"),
      nav: document.querySelectorAll(".g-nav").length,
      navVisible: [...document.querySelectorAll(".g-nav")].filter(vis).length,
      count: vis(document.querySelector(".g-count")),
      thumbs: [...document.querySelectorAll(".g-thumbs")].filter(vis).length,
      slides: document.querySelectorAll(".g-slide").length,
      photo: document.querySelectorAll(".p-photo img").length,
    };
  });
  for (const [label, it, store] of [["a Zumiez product (one photo)", zumiez, "zumiez"], ["a Finish Line product (one photo at two presets)", finish, "finishline"]]) {
    await check(`producto.html (iPhone): ${label} shows no arrows, counter, thumbnails or gallery`, async () => {
      assert.ok(it, `no ${store} product fits -- the catalogue changed`);
      const { c, pg } = await open(`/producto.html?producto=${encodeURIComponent(it.name)}&tienda=${store}`);
      await pg.waitForFunction((n) => (document.querySelector("h1") || {}).textContent === n, it.name, { timeout: 30000 });
      const s = await pdpState(pg);
      assert.deepEqual({ gallery: s.gallery, nav: s.nav, count: s.count, thumbs: s.thumbs, slides: s.slides }, { gallery: false, nav: 0, count: false, thumbs: 0, slides: 0 });
      assert.equal(s.photo, 1, "the one photo is shown");
      await c.close();
    });
  }
  await check("producto.html: a SKIMS product with 4+ photos keeps its arrows, counter and thumbnails", async () => {
    assert.ok(skims, "no SKIMS product fits");
    const url = `/producto.html?producto=${encodeURIComponent(skims.name)}&tienda=skims`;
    let { c, pg } = await open(url);
    await pg.waitForSelector(".p-gallery .g-slide img[src]", { timeout: 30000 });
    let s = await pdpState(pg);
    assert.ok(s.gallery && s.nav === 2 && s.count && s.thumbs === 1 && s.slides === skims.images.length, JSON.stringify(s));
    await c.close();
    ({ c, pg } = await open(url, { desktop: true }));
    await pg.waitForSelector(".p-gallery .g-slide img[src]", { timeout: 30000 });
    s = await pdpState(pg);
    assert.equal(s.navVisible, 2, "with a mouse both arrows show");
    await c.close();
  });
  await check("producto.html: when every photo but the first fails, the arrows, counter and thumbnails go", async () => {
    const first = skims.images[0];
    const { c, pg } = await open(`/producto.html?producto=${encodeURIComponent(skims.name)}&tienda=skims`,
      { desktop: true, failAfterFirst: (u) => P.galleryPhotoKey(u) !== P.galleryPhotoKey(first) });
    await pg.waitForSelector(".p-gallery .g-slide img[src]", { timeout: 30000 });
    await pg.waitForFunction(() => document.querySelectorAll(".g-slide").length === 1, null, { timeout: 30000 });
    const s = await pdpState(pg);
    assert.deepEqual({ navVisible: s.navVisible, count: s.count, thumbs: s.thumbs }, { navVisible: 0, count: false, thumbs: 0 });
    await c.close();
  });
  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n"));
  process.exit(1);
}
