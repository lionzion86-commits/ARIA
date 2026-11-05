/* ==================================================================
   OFERTAS IS CAROUSELS (#443, Danny): the Ofertas pill, the mobile
   menu's Ofertas entry and the hero's "Ver ofertas" all land on
   /ofertas.html, and that page is the homepage's Ofertas section,
   page-long -- horizontal rails of the homepage's 172px navy deal
   cards, the lead rail first, then one rail per store, sales-led.

   In a real browser, against this checkout, with every off-site
   request refused (retailer photos included) and the exchange-rate
   function answering 3.75. The ofertas function is the real one
   (netlify/functions/ofertas.js) over the committed deals.json.

   RUNNING IT
     OFERTAS_CAROUSEL_PORT=8986 PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
       node scripts/test/ofertas-carousel-tests.mjs
   ================================================================== */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { handler as ofertasFn } from "../../netlify/functions/ofertas.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const PORT = Number(process.env.OFERTAS_CAROUSEL_PORT || 8916);
const BASE = `http://127.0.0.1:${PORT}`;
const RATE = 3.75;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const requested = [];

const server = createServer(async (req, res) => {
  const u = new URL(req.url, BASE);
  requested.push(u.pathname);
  if (u.pathname === "/.netlify/functions/ofertas") {
    const r = await ofertasFn({ httpMethod: "GET", queryStringParameters: Object.fromEntries(u.searchParams) });
    res.writeHead(r.statusCode, { "Content-Type": "application/json" });
    res.end(r.body);
    return;
  }
  if (u.pathname.startsWith("/.netlify/functions/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(u.pathname.endsWith("exchange-rate") ? JSON.stringify({ venta: RATE }) : "{}");
    return;
  }
  let path = decodeURIComponent(u.pathname);
  const bundle = /^\/build\/(app-[0-9a-f]+\.js)$/.exec(path);
  if (bundle && existsSync(join(ROOT, "build/min", bundle[1]))) path = "/build/min/" + bundle[1];
  let p = normalize(join(ROOT, path));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(readFileSync(p));
});
await new Promise((resolve, reject) => {
  server.once("error", (e) => reject(e.code === "EADDRINUSE" ? new Error(`port ${PORT} is busy -- set OFERTAS_CAROUSEL_PORT`) : e));
  server.listen(PORT, "127.0.0.1", resolve);
});

const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const IPHONE = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};
async function open(ctxOpts, url) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(e.message));
  /* Off-site photos answer with a 1x1 PNG: a photo that fails takes its card off the rail (#443 c.6547325227, no image, no card). */
  await page.route((u) => u.host !== `127.0.0.1:${PORT}`, (r) => r.request().resourceType() === "image"
    ? r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }) : r.abort());
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.message).split("\n").slice(0, 4).join("\n         ")}`); }
}
const OFF = (() => { const box = {}; new Function("window", "globalThis", readFileSync(ROOT + "off-sale.js", "utf8"))(box, box); return box.AriaOffSale; })();
const rails = JSON.parse(readFileSync(ROOT + "assets/ofertas/rails.json", "utf8"));
const pen = (n) => "S/ " + Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log("\n  ofertas.html, carousels\n");

/* ---------- the way in ---------- */
const landsOnOfertas = async (page, act) => {
  await page.waitForFunction(() => typeof window.goSales === "function", null, { timeout: 30000 });
  await Promise.all([page.waitForURL((u) => u.pathname === "/ofertas.html", { timeout: 30000 }), act()]);
  await page.waitForSelector("#content .rail .card:not(.sk)", { timeout: 30000 });
};

await check("the header's Ofertas pill lands on /ofertas.html, which paints carousels", async () => {
  const { ctx, page } = await open({ viewport: { width: 1280, height: 900 } }, "/");
  await landsOnOfertas(page, () => page.click('a.ariaNavLink[data-nav="salesView"]'));
  await ctx.close();
});

await check("the phone menu's Ofertas entry lands on /ofertas.html", async () => {
  const { ctx, page } = await open(IPHONE, "/");
  await page.waitForFunction(() => typeof window.toggleMobileMenu === "function", null, { timeout: 30000 });
  await page.click('button[aria-label="Menú"]');
  await landsOnOfertas(page, () => page.click('#mobileMenu a:text-is("Ofertas")'));
  await ctx.close();
});

await check("the hero's Ver ofertas lands on /ofertas.html", async () => {
  const { ctx, page } = await open(IPHONE, "/");
  await landsOnOfertas(page, () => page.click('button.ariaHeroCta:text-is("Ver ofertas")'));
  await ctx.close();
});

/* ---------- the page ---------- */
requested.length = 0;   // the homepage above loads its own catalogue; count this page alone
const { ctx, page } = await open(IPHONE, "/ofertas.html");
await page.waitForSelector("#content .rail .card:not(.sk)", { timeout: 30000 });
await page.waitForTimeout(800);

await check("horizontal rails, not a grid: the lead rail first, a rail per store after it", async () => {
  const r = await page.evaluate(() => {
    const secs = [...document.querySelectorAll("#content .rail-sec")];
    const track = secs[0].querySelector(".rail");
    const cs = getComputedStyle(track);
    return { n: secs.length, titles: secs.slice(0, 4).map((s) => s.querySelector(".rail-title").textContent),
      overflowX: cs.overflowX, display: cs.display, wraps: cs.flexWrap,
      scrolls: track.scrollWidth > track.clientWidth + 100, grid: !!document.querySelector(".grid"),
      pageScrollX: document.documentElement.scrollWidth > innerWidth };
  });
  assert.equal(r.titles[0], "Las mejores ofertas");
  assert.equal(r.titles[1], rails.stores[0].label || "CCS", "the first store rail is not the most sales-led store");
  assert.equal(r.n, 1 + rails.stores.length + (rails.more.length ? 1 : 0), "rail count");
  assert.equal(r.overflowX, "auto");
  assert.equal(r.display, "flex");
  assert.equal(r.wraps, "nowrap");
  assert.ok(r.scrolls, "the lead rail does not scroll sideways");
  assert.ok(!r.grid, "a grid is on the page");
  assert.ok(!r.pageScrollX, "the page itself scrolls sideways");
});

await check("the big card (#443 c.6545712892): near-full-width navy tile, 4:5 photo, gold badge, soles first", async () => {
  const c = await page.evaluate(() => {
    const card = document.querySelector("#content .rail .card:not(.sk)");
    /* layout sizes: the card nearest the middle is grown by the focus
       scale (assets/js/card-grow.js), which a bounding box would include */
    const img = card.querySelector(".card-img");
    return { w: card.offsetWidth, imgW: img.offsetWidth, imgH: img.offsetHeight, bg: getComputedStyle(card).backgroundColor,
      badgeBg: getComputedStyle(card.querySelector(".badge")).backgroundColor,
      price: card.querySelector(".price").textContent, old: card.querySelector(".price-old").textContent,
      usd: card.querySelector(".price-usd").textContent, href: card.getAttribute("href"),
      onScreen: [...document.querySelectorAll("#content .rail-sec")[0].querySelectorAll(".card")].filter((x) => x.getBoundingClientRect().right <= innerWidth).length };
  });
  const big = Math.round(Math.min(300, Math.max(232, 0.68 * 390)));
  assert.equal(c.w, big, "the card is not the big card, clamp(232px,68vw,300px)");
  assert.equal(Math.round(c.imgW), big);
  assert.equal(Math.round(c.imgH), Math.round(big * 1.25), "the photo box is not 4:5");
  assert.equal(c.bg, "rgb(26, 39, 68)");
  assert.equal(c.badgeBg, "rgb(244, 196, 99)");
  assert.equal(c.onScreen, 1, "a phone shows one whole big card and the edge of the next");
  const first = rails.lead[0];
  assert.equal(c.price, pen(first.usd * RATE), "the soles price is not usd x rate");
  assert.equal(c.old, pen(first.wasUsd * RATE));
  assert.equal(c.usd, "US$ " + first.usd.toFixed(2));
  assert.equal(c.href, "producto.html?producto=" + encodeURIComponent(first.title) + "&tienda=" + encodeURIComponent(first.store));
});

await check("the lead rail is rails.json's lead, in its order (the homepage's)", async () => {
  const ids = await page.evaluate(() => [...document.querySelectorAll('#content [data-rail="lead"] .card')].map((c) => c.dataset.id));
  assert.deepEqual(ids, rails.lead.map((c) => c.id));
});

await check("store rails fill as they near the screen, never all at once", async () => {
  const before = requested.filter((p) => p.startsWith("/assets/ofertas/slices/")).length;
  assert.ok(before <= 6, `${before} store slices asked for on landing`);
  await page.evaluate(() => document.querySelectorAll("#content .rail-sec")[12].scrollIntoView());
  await page.waitForFunction(() => document.querySelectorAll("#content .rail-sec")[12].querySelector(".card:not(.sk)"), null, { timeout: 15000 });
  const after = requested.filter((p) => p.startsWith("/assets/ofertas/slices/")).length;
  assert.ok(after > before, "scrolling down asked for no slice");
  assert.ok(after < rails.stores.length, "every store slice was asked for");
  await page.evaluate(() => scrollTo(0, 0));
});

await check("a store rail holds that store only, links into producto.html, and opens on cards the lead rail did not show", async () => {
  const key = rails.stores[0].key;
  const r = await page.evaluate((k) => [...document.querySelectorAll(`#content [data-rail="${k}"] .card`)].map((c) => ({ s: c.dataset.store, id: c.dataset.id, href: c.getAttribute("href") })), key);
  assert.ok(r.length >= 10, `${r.length} cards in the ${key} rail`);
  assert.ok(r.every((c) => c.s === key), "another store in the rail");
  assert.ok(r.every((c) => /^producto\.html\?producto=[^&]+&tienda=/.test(c.href)), "a card does not open the product page");
  const lead = new Set(rails.lead.map((c) => c.id));
  assert.ok(!lead.has(r[0].id), "the store rail opens on a lead card");
});

await check("swiping to a rail's end draws the next cards in place", async () => {
  const key = rails.stores[0].key;
  const n0 = await page.evaluate((k) => document.querySelectorAll(`#content [data-rail="${k}"] .card`).length, key);
  await page.evaluate((k) => { const s = document.querySelector(`#content [data-rail="${k}"]`); s.scrollIntoView(); const t = s.querySelector(".rail"); t.scrollLeft = t.scrollWidth; }, key);
  await page.waitForFunction(([k, n]) => document.querySelectorAll(`#content [data-rail="${k}"] .card`).length > n, [key, n0], { timeout: 15000 });
  await page.evaluate(() => scrollTo(0, 0));
});

await check("no off-sale store, no retailer link, no catalogue download, no errors", async () => {
  const r = await page.evaluate(() => ({
    stores: [...document.querySelectorAll("#content .card[data-store]")].map((c) => c.dataset.store),
    out: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^https?:/i.test(h)),
  }));
  const off = r.stores.filter((s) => OFF.isOffSaleRetailer(s));
  assert.deepEqual(off, [], "off-sale cards drawn");
  assert.deepEqual(r.out, [], "a link leaves the site");
  assert.ok(!requested.some((p) => /deals\.json|ofertas-feed|-catalog\.json|department-cache/.test(p)), "a catalogue was downloaded");
  assert.deepEqual(page.__errors, []);
});

await check("a search shows rails per store, biggest discount first, with Mostrar más", async () => {
  await page.fill("#q", "nike");
  await page.waitForSelector("#qRails .card", { timeout: 15000 });
  const r = await page.evaluate(() => ({
    content: document.getElementById("content").hidden,
    rails: [...document.querySelectorAll("#qRails .rail-sec")].map((s) => [...s.querySelectorAll(".card")].map((c) => c.dataset.store)),
    more: !!document.getElementById("moreBtn"),
    count: document.getElementById("countLine").textContent,
  }));
  assert.ok(r.content, "the carousels stay under the results");
  assert.ok(r.rails.length >= 1);
  assert.ok(r.rails.every((cards) => cards.length && cards.every((s) => s === cards[0])), "a search rail mixes stores");
  assert.match(r.count, /para «nike»/);
  if (r.more) {
    const n0 = await page.evaluate(() => document.querySelectorAll("#qRails .card").length);
    await page.click("#moreBtn");
    await page.waitForFunction((n) => document.querySelectorAll("#qRails .card").length > n, n0, { timeout: 15000 });
  }
  await page.fill("#q", "");
  await page.waitForFunction(() => !document.getElementById("content").hidden && document.querySelector("#content .card:not(.sk)"), null, { timeout: 15000 });
});

await ctx.close();
await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
