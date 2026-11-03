/* ==================================================================
   EVERY CAROUSEL SCROLLS ON A LAPTOP (#443 c.6615548354, Danny and his
   mom: carousels did not move with a mouse or a trackpad, only by touch).

   Serves the repo with the site's functions answering in-process and
   opens a carousel on the homepage, a department page, a store page,
   search and a product page's related rail.

   desktop (1366x768, mouse, no touch):
     - a horizontal wheel moves the row (one big swing, and a trackpad's
       run of small deltas, which scroll-snap used to pull back);
     - shift+wheel moves the row;
     - a plain vertical wheel over the row scrolls the page, not the row;
     - the row's «Ver siguientes» arrow is visible and pages the row;
     - a mouse drag moves the row and opens nothing;
     - a plain click on a card still opens it.
   phone (390px, touch): no arrows, the snap is the page's own, a swipe
     moves the row and a tap on a card opens it.

     node scripts/test/desktop-scroll-tests.mjs
     NO_DESK=1 node scripts/test/desktop-scroll-tests.mjs   (the pages without carousel-desk.js)
     PAGES="ofertas=ofertas.html,marca=marca.html?marca=nike" node scripts/test/desktop-scroll-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/desktop-scroll-tests.mjs   (also saves screenshots)

   Off-site requests are aborted; off-site photos answer with a 1x1 PNG.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
const fns = {};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
  if (fn) {
    if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
    const file = join(ROOT, "netlify/functions", fn[1] + ".js");
    if (!existsSync(file)) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
    try {
      fns[fn[1]] ||= (await import(file)).handler;
      const r = await fns[fn[1]]({ httpMethod: req.method, headers: {}, path: u.pathname, queryStringParameters: Object.fromEntries(u.searchParams) }, { fetchImpl });
      res.writeHead(r.statusCode || 200, r.headers || { "Content-Type": "application/json" });
      return res.end(r.body || "");
    } catch (e) { res.writeHead(500); return res.end(String(e)); }
  }
  if (process.env.NO_DESK && u.pathname === "/assets/js/carousel-desk.js") { res.writeHead(200, { "Content-Type": "application/javascript" }); return res.end(""); }
  let p = join(ROOT, decodeURIComponent(u.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const ROW = ".ariaRail:not(#liveRefineChips), div.rail, .track, .rel-row";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const SHOT_DIR = process.env.SHOT_DIR || "";

const rows = [];
const check = (page, what, pass, note = "") => rows.push({ page, what, pass, note });

/* Opens a page and marks its first carousel of real cards that overflows
   (data-ds), scrolled to the middle of the screen. `rel` asks for the
   product page's related rail. */
async function open(ctx, path, { rel = false } = {}) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image"
    ? r.fulfill({ status: 200, contentType: "image/png", body: PNG }) : r.abort());
  await pg.goto(`${BASE}/${path}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(2500);
  const pick = async () => pg.evaluate(({ ROW, rel }) => {
    const cards = (r) => [...r.children].filter((c) => (/^(A|BUTTON|ARTICLE)$/.test(c.tagName) || c.classList.contains("card")) && !c.classList.contains("sk") && c.offsetWidth);
    const all = [...document.querySelectorAll(rel ? ".rel-row" : ROW)].filter((r) => r.offsetParent && /auto|scroll/.test(getComputedStyle(r).overflowX)
      && r.scrollWidth > r.clientWidth + 40 && cards(r).length >= 3 && r.getBoundingClientRect().height > 150);
    if (!all.length) return false;
    const r = all[0];
    r.setAttribute("data-ds", "");
    r.scrollLeft = 0;
    r.scrollIntoView({ block: "center" });
    return true;
  }, { ROW, rel });
  let found = await pick();
  /* rows lower on the page fill in as the page scrolls */
  for (let i = 0; !found && i < 8; i++) { await pg.mouse.wheel(0, 700); await pg.waitForTimeout(400); found = await pick(); }
  await pg.waitForTimeout(500);
  /* The homepage opens a product in place (showProduct): count those. */
  await pg.evaluate(() => { window.__dsOpened = 0; if (typeof window.showProduct === "function" && !window.showProduct.__ds) {
    const f = window.showProduct; window.showProduct = function () { window.__dsOpened++; return f.apply(this, arguments); }; window.showProduct.__ds = 1; } });
  return { pg, errs, found };
}
const row = (pg) => pg.locator("[data-ds]");
const left = (pg) => row(pg).evaluate((r) => r.scrollLeft);
/* A point on the row's second card (its body, under the photo when it can). */
async function cardPoint(pg, i = 1) {
  return row(pg).evaluate((r, i) => {
    const cards = [...r.children].filter((c) => (/^(A|BUTTON|ARTICLE)$/.test(c.tagName) || c.classList.contains("card")) && !c.classList.contains("sk") && c.offsetWidth);
    const c = cards[Math.min(i, cards.length - 1)], b = c.getBoundingClientRect(), rb = r.getBoundingClientRect();
    const x = Math.max(rb.left + 20, Math.min(b.left + b.width / 2, rb.right - 80));
    return { x, y: b.top + Math.min(b.height * 0.75, b.height - 12) };
  }, i);
}
/* What a card click opened: another URL, or the app's product view. */
async function state(pg) {
  return pg.evaluate(() => location.href + "|" + (window.__dsOpened || 0));
}

const PAGES = [
  ["home", "index.html"],
  ["department", "departamento.html?dept=perfumes"],
  ["store", "tienda.html?tienda=abercrombie"],
  ["search", "search.html?q=zapatillas"],
  ["product", null],
];
/* PAGES="ofertas=ofertas.html,marca=marca.html?marca=nike" checks other pages instead. */
if (process.env.PAGES) PAGES.splice(0, PAGES.length, ...process.env.PAGES.split(",").map((x) => x.split(/=(.*)/s).slice(0, 2)));

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const desk = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: false, isMobile: false });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/* The product page: the first product card on the department page. */
if (PAGES.some((p) => p[0] === "product" && !p[1])) {
  const { pg } = await open(desk, "departamento.html?dept=perfumes");
  const href = await pg.evaluate(() => { const a = document.querySelector("a[href*='producto.html?producto=']"); return a ? a.getAttribute("href") : ""; });
  await pg.close();
  PAGES.find((p) => p[0] === "product")[1] = href ? href.replace(/^\//, "") : "producto.html";
}

for (const [name, path] of PAGES) {
  const rel = name === "product";
  /* ---------------- desktop ---------------- */
  {
    const { pg, errs, found } = await open(desk, path, { rel });
    check(name, "desktop: a carousel of cards that overflows", found, path.slice(0, 70));
    if (found) {
      const p = await cardPoint(pg, 1);
      await pg.mouse.move(p.x, p.y);
      await pg.waitForTimeout(200);

      /* horizontal wheel, one swing */
      let l0 = await left(pg);
      await pg.mouse.wheel(400, 0); await pg.waitForTimeout(700);
      let l1 = await left(pg);
      check(name, "desktop: mouse.wheel deltaX moves scrollLeft", l1 > l0 + 50, `${l0} -> ${l1}`);

      /* a trackpad's run of small deltas */
      await row(pg).evaluate((r) => { r.scrollLeft = 0; }); await pg.waitForTimeout(400);
      l0 = await left(pg);
      for (let i = 0; i < 20; i++) { await pg.mouse.wheel(6, 0); await pg.waitForTimeout(20); }
      await pg.waitForTimeout(900);
      l1 = await left(pg);
      check(name, "desktop: a trackpad's small deltaX steps add up (no snap-back)", l1 > l0 + 60, `${l0} -> ${l1} after 20 x 6px`);

      /* shift + wheel: one notch */
      await row(pg).evaluate((r) => { r.scrollLeft = 0; }); await pg.waitForTimeout(400);
      l0 = await left(pg);
      await pg.keyboard.down("Shift"); await pg.mouse.wheel(0, 100); await pg.keyboard.up("Shift");
      await pg.waitForTimeout(900);
      l1 = await left(pg);
      check(name, "desktop: one notch of shift+wheel moves the row", l1 > l0 + 40, `${l0} -> ${l1}`);

      /* plain vertical wheel: the page scrolls, the row does not */
      await row(pg).evaluate((r) => { r.scrollLeft = 0; }); await pg.waitForTimeout(300);
      const y0 = await pg.evaluate(() => scrollY); l0 = await left(pg);
      await pg.mouse.wheel(0, 300); await pg.waitForTimeout(700);
      const y1 = await pg.evaluate(() => scrollY); l1 = await left(pg);
      check(name, "desktop: vertical wheel over a row scrolls the page, not the row", y1 > y0 + 100 && l1 === l0, `scrollY ${y0} -> ${y1}, row ${l0} -> ${l1}`);

      /* the arrows */
      await row(pg).evaluate((r) => { r.scrollLeft = 0; r.scrollIntoView({ block: "center" }); }); await pg.waitForTimeout(500);
      const next = pg.locator("[data-ds] ~ .cd-arrow.cd-next");
      const vis = (await next.count()) ? await next.evaluate((b) => { const r = b.getBoundingClientRect(), s = getComputedStyle(b); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { ok: !b.hidden && s.display !== "none" && +s.opacity > 0.5 && r.width >= 36 && r.top >= 0 && r.bottom <= innerHeight && (hit === b || b.contains(hit)), w: r.width, top: Math.round(r.top) }; }) : { ok: false };
      check(name, "desktop: a visible «Ver siguientes» arrow beside the row", vis.ok, JSON.stringify(vis));
      if (vis.ok) {
        l0 = await left(pg);
        await next.click(); await pg.waitForTimeout(900);
        l1 = await left(pg);
        const cw = await row(pg).evaluate((r) => r.clientWidth);
        check(name, "desktop: the arrow pages the row by about a screen of cards", l1 - l0 > cw * 0.4 && l1 - l0 <= cw + 20, `${l0} -> ${l1} (row ${cw}px)`);
        const prevOn = await pg.locator("[data-ds] ~ .cd-arrow.cd-prev").evaluate((b) => !b.hidden && !b.hasAttribute("data-off"));
        check(name, "desktop: the «Ver anteriores» arrow shows once the row has moved", prevOn);
        if (SHOT_DIR && name === "home") {
          await pg.mouse.move(683, 40);
          await pg.screenshot({ path: join(SHOT_DIR, "desktop-scroll-home-1366.png") });
        }
        if (SHOT_DIR && name !== "home") await pg.screenshot({ path: join(SHOT_DIR, `desktop-scroll-${name}-1366.png`) });
      } else check(name, "desktop: the arrow pages the row by about a screen of cards", false, "no arrow");

      /* a mouse drag: the row moves, nothing opens */
      await row(pg).evaluate((r) => { r.scrollLeft = 0; }); await pg.waitForTimeout(400);
      const before = await state(pg);
      const d = await cardPoint(pg, 1);
      l0 = await left(pg);
      await pg.mouse.move(d.x, d.y); await pg.mouse.down();
      for (let i = 1; i <= 10; i++) { await pg.mouse.move(d.x - i * 25, d.y); await pg.waitForTimeout(16); }
      await pg.mouse.up(); await pg.waitForTimeout(1200);
      l1 = await left(pg);
      const after = await state(pg);
      check(name, "desktop: a mouse drag moves scrollLeft", l1 > l0 + 120, `${l0} -> ${l1}`);
      check(name, "desktop: a mouse drag does not open the card", after === before, after === before ? "" : `${before} -> ${after}`);

      /* a plain click opens the card */
      const c = await cardPoint(pg, 1);
      await pg.mouse.click(c.x, c.y);
      await pg.waitForTimeout(1500);
      const clicked = await state(pg).catch(() => "navigated");
      check(name, "desktop: a plain click on a card opens it", clicked !== before, clicked.slice(0, 110));
    }
    check(name, "desktop: no page errors", !errs.length, errs.slice(0, 2).join("; ").slice(0, 200));
    await pg.close();
  }
  /* ---------------- phone ---------------- */
  {
    const { pg, errs, found } = await open(phone, path, { rel });
    check(name, "phone: a carousel of cards that overflows", found);
    if (found) {
      const r = await pg.evaluate(() => ({ arrows: [...document.querySelectorAll(".cd-arrow")].filter((b) => b.offsetWidth).length,
        snap: getComputedStyle(document.querySelector("[data-ds]")).scrollSnapType }));
      check(name, "phone: no desktop arrows", r.arrows === 0, `${r.arrows} shown`);
      check(name, "phone: the row keeps its snap", r.snap !== "none" && r.snap !== "", r.snap);
      const before = await state(pg);
      const p = await cardPoint(pg, 1);
      const l0 = await left(pg);
      const cdp = await phone.newCDPSession(pg);
      const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 2, radiusY: 2, force: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(p.x, p.y) });
      for (let k = 1; k <= 12; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(p.x - k * 22, p.y + 1) }); await pg.waitForTimeout(16); }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await pg.waitForTimeout(1200);
      const l1 = await left(pg);
      check(name, "phone: a swipe moves the row", l1 > l0 + 60, `${l0} -> ${l1}`);
      check(name, "phone: a swipe opens nothing", (await state(pg)) === before);
      if (SHOT_DIR && name === "home") await pg.screenshot({ path: join(SHOT_DIR, "desktop-scroll-home-390.png") });
      const t = await cardPoint(pg, 1);
      await pg.touchscreen.tap(t.x, t.y);
      await pg.waitForTimeout(1500);
      const tapped = await state(pg).catch(() => "navigated");
      check(name, "phone: a tap on a card opens it", tapped !== before, tapped.slice(0, 110));
    }
    check(name, "phone: no page errors", !errs.length, errs.slice(0, 2).join("; ").slice(0, 200));
    await pg.close();
  }
}

await browser.close();
server.close();

const failed = rows.filter((r) => !r.pass);
for (const r of rows) console.log(`${r.pass ? "ok  " : "FAIL"} ${r.page} | ${r.what}${r.note ? " | " + r.note : ""}`);
console.log(`\n  ${rows.length - failed.length} passed, ${failed.length} failed\n`);
if (failed.length) process.exit(1);
