/* ==================================================================
   THE HOME PAGE ORDER (#443).

   2026-10-21 16:03 EDT, Danny on the live site: the "Todo USA ahora en
   Lima. ARIA te lo trae." block opens the page and the navy search band
   (logo, headline, search bar) sits directly underneath it. That
   corrects the earlier same-day order below, which had put the search
   band first; the Key Club move and copy from that order stand.

   Earlier on 2026-10-21:

   Two live shoppers in one day scrolled past the hero, the deals and the
   Aria Key Club block before they found the search box. Danny's order:
   the logo + search block and the Key Club block trade places -- the
   first screen of a phone is the logo and the search bar, and the Key
   Club is met further down, as the shopper scrolls. The same order took
   the selection framing out of the Key Club copy: nobody has to be
   chosen to buy, and Fundadores is a status, never a buying gate.

   On an iPhone-sized page (390x844) served from this checkout:

   - the Todo USA block comes first, the search band follows it with
     nothing in between, and both sit above the Key Club block (the
     search's position on the first screen is printed, not asserted:
     under the Todo USA block it lands near the bottom edge);
   - nothing (greeting bubble, orb) covers the search box or its photo
     and search buttons at first paint, once the greeting is due, or
     once the shopper scrolls to it on a 390x664 screen;
   - none of the selection framing is left anywhere in index.html's text
     (hidden views and modals included), nor in the Key Club, cart and
     checkout copy the bundle and checkout.html paint;
   - the Key Club block carries the replacement copy word for word;
   - on the Mountain profile (2s round trip, 400 kbps, CPU 6x slower) the
     home search box is drawn and takes a search within 2s of the first
     paint, and a tap + type + Enter really opens search.html.

   The page is served by this script's own static server (gzip, and the
   same /build/app-*.js -> /build/min/ rewrite netlify.toml makes), so
   the transfer it reports is what a phone downloads. Third-party
   requests are refused; nothing leaves the machine.

   RUNNING IT
     node scripts/test/home-order-tests.mjs
   HOME_ORDER_PORT picks the port (default 8915). PLAYWRIGHT_CHROMIUM
   uses an installed Chromium.
   ================================================================== */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("../../", import.meta.url).pathname;
const PORT = Number(process.env.HOME_ORDER_PORT || 8915);
const BASE = `http://127.0.0.1:${PORT}`;

export const KEY_CLUB_BODY = "Únete gratis al Aria Key Club: arma tu carrito, compra cuando quieras y recibe $5 de vuelta por cada $100 en crédito Aria. Los primeros 1000 miembros quedan registrados como Fundadores. Gratis por tiempo limitado — después, la membresía tiene un costo.";

/* The gatekeeping framing. Ordinary uses of the words stay legal:
   "Selecciona tu talla", "Seleccionar todas", "Selección premium". */
export const SELECTION_FRAMING = [
  /(?<!talla[^.]{0,40})\belegid[oa]s?\b/i, // "Talla M elegida." is a size, not a gate
  /\belegimos\b/i,
  /eligiendo a mano/i,
  /elegir a los 1000/i,
  /participa en la selecci[oó]n/i,
  /selecci[oó]n de (los )?(1000|miembros|fundadores)/i,
  /\bseleccionad[oa]s? (para|como) (comprar|miembro|fundador)/i,
  /antes que todos/i,
  /\bhand-?picked\b/i,
  /\bif we (choose|pick) you\b/i,
];
const framingIn = (text) => SELECTION_FRAMING.filter((re) => re.test(text)).map((re) => `${re} -> "${(text.match(re) || [""])[0]}"`);

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const COMPRESS = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg"]);

const server = createServer((req, res) => {
  const u = new URL(req.url, BASE);
  if (u.pathname.startsWith("/.netlify/functions/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(u.pathname.endsWith("exchange-rate") ? '{"venta":3.75}' : "{}");
    return;
  }
  let path = decodeURIComponent(u.pathname);
  const bundle = /^\/build\/(app-[0-9a-f]+\.js)$/.exec(path);
  if (bundle && existsSync(join(ROOT, "build/min", bundle[1]))) path = "/build/min/" + bundle[1];
  let p = normalize(join(ROOT, path));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  const ext = extname(p);
  let body = readFileSync(p);
  const headers = { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-store" };
  if (COMPRESS.has(ext) && /gzip/.test(req.headers["accept-encoding"] || "")) { body = gzipSync(body); headers["Content-Encoding"] = "gzip"; }
  res.writeHead(200, headers);
  res.end(body);
});
await new Promise((resolve, reject) => {
  server.once("error", (e) => reject(e.code === "EADDRINUSE" ? new Error(`port ${PORT} is busy -- set HOME_ORDER_PORT`) : e));
  server.listen(PORT, "127.0.0.1", resolve);
});

const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const PHONE = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};
async function openPhone() {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.route((url) => url.host !== `127.0.0.1:${PORT}`, (r) => r.abort());
  return { ctx, page };
}

/* What sits on the search box: elementFromPoint at the input's centre
   and at the centre of each of its buttons (photo, search) must land in
   the search box itself, not on the greeting bubble or the orb. */
async function searchCovers(page) {
  return page.evaluate(() => {
    const input = document.getElementById("searchInput");
    const wrap = input.parentElement;
    const pts = [input, ...wrap.querySelectorAll("button")].map((el) => {
      const r = el.getBoundingClientRect();
      return { what: el.getAttribute("aria-label") || el.id, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    return pts.map((p) => {
      const hit = document.elementFromPoint(p.x, p.y);
      if (hit && wrap.contains(hit)) return null;
      const owner = hit ? (hit.id || (hit.closest("[id]") || {}).id || "") : "";
      return `${p.what} at ${Math.round(p.x)},${Math.round(p.y)} is covered by ${hit ? hit.tagName + "#" + owner : "nothing"}`;
    }).filter(Boolean);
  });
}

try {
  const { ctx, page } = await openPhone();
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  const coveredAtPaint = await searchCovers(page);
  await page.waitForTimeout(500);
  const layout = await page.evaluate(() => {
    const top = (el) => el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
    const club = document.querySelector('#homeView section[aria-label^="Aria Key Club"]');
    const input = document.getElementById("searchInput");
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; };
    return {
      inputTop: top(input), inputBottom: input ? Math.round(input.getBoundingClientRect().bottom + scrollY) : null,
      inputBox: box(input), clubTop: top(club), clubBox: box(club),
      clubText: club ? club.textContent.replace(/\s+/g, " ").trim() : "",
      clubHeadline: club && club.querySelector("h2") ? club.querySelector("h2").textContent.replace(/\s+/g, " ").trim() : "",
      viewport: innerHeight,
      order: [...document.getElementById("homeView").children]
        .filter((el) => el.tagName !== "SCRIPT" && getComputedStyle(el).display !== "none")
        .slice(0, 3).map((el) => el.getAttribute("aria-label") || el.tagName),
    };
  });
  console.log(`    ..   390x844: ${layout.order.join(" > ")}; search input top ${layout.inputTop}px, bottom ${layout.inputBottom}px; Key Club at ${layout.clubTop}px`);

  await check("the Todo USA block opens the page and the search band sits directly under it", () => {
    assert.deepEqual(layout.order.slice(0, 2), ["Todo USA ahora en Lima", "Compra en Estados Unidos"]);
    assert.ok(layout.inputBox && layout.inputBox.w > 200 && layout.inputBox.h > 30, `the search input is not drawn: ${JSON.stringify(layout.inputBox)}`);
  });

  await check("nothing covers the search box or its buttons at first paint, nor once the greeting is due", async () => {
    assert.deepEqual(coveredAtPaint, [], "at first paint");
    await page.waitForTimeout(3000); /* the greeting bubble's turn comes at 2.2s */
    assert.deepEqual(await searchCovers(page), [], "after the greeting's 2.2s");
  });

  await check("on a Safari-sized screen (390x664) nothing covers the search box once the shopper scrolls to it", async () => {
    const short = await browser.newContext({ ...PHONE, viewport: { width: 390, height: 664 } });
    const sp = await short.newPage();
    await sp.route((url) => url.host !== `127.0.0.1:${PORT}`, (r) => r.abort());
    await sp.goto(BASE + "/index.html", { waitUntil: "load" });
    await sp.waitForTimeout(3000);
    await sp.evaluate(() => document.getElementById("searchInput").scrollIntoView({ block: "center" }));
    await sp.waitForTimeout(600);
    const covered = await searchCovers(sp);
    await short.close();
    assert.deepEqual(covered, []);
  });

  await check("the search sits above the Key Club block", () => {
    assert.ok(layout.clubBox && layout.clubBox.h > 100, "the Key Club block is missing from the home page");
    assert.ok(layout.inputTop > 0, `search at ${layout.inputTop}px`);
    assert.ok(layout.inputTop < layout.clubTop, `search at ${layout.inputTop}px, Key Club at ${layout.clubTop}px`);
  });

  await check("the Key Club block carries the new headline and body, word for word", () => {
    assert.equal(layout.clubHeadline, "Aria Key Club");
    assert.ok(layout.clubText.includes(KEY_CLUB_BODY), "the replacement body copy is not in the Key Club block");
  });

  await check("no selection framing anywhere in index.html's rendered text", async () => {
    const text = await page.evaluate(() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll("script,style,noscript,template").forEach((n) => n.remove());
      return clone.textContent.replace(/\s+/g, " ") + " " + document.title;
    });
    assert.deepEqual(framingIn(text), []);
  });

  await check("the cart banner and member badge never say a shopper must be chosen", async () => {
    const painted = await page.evaluate(() => {
      const out = [];
      cart.push({ title: "x", priceUsd: 10, qty: 1 });
      for (const [user, status] of [[null, null], [{ email: "a@b.c" }, "pending"], [{ email: "a@b.c" }, "fundador"], [{ email: "a@b.c" }, "rechazado"]]) {
        currentUser = user; currentUserFounderStatus = status;
        renderFoundersCartBanner(); renderFoundersBadges();
        out.push((document.getElementById("foundersCartBanner") || {}).textContent || "");
        out.push((document.getElementById("foundersMemberBadge") || {}).textContent || "");
      }
      cart.pop(); currentUser = null; currentUserFounderStatus = null;
      renderFoundersCartBanner(); renderFoundersBadges();
      return out.join(" | ").replace(/\s+/g, " ");
    });
    assert.deepEqual(framingIn(painted), []);
    assert.ok(!/desbloquead|en revisi[oó]n|a[uú]n no eres/i.test(painted), `gatekeeping status copy remains: ${painted.slice(0, 300)}`);
  });
  await ctx.close();

  await check("the Key Club, cart and checkout sources carry no selection framing", () => {
    const home = readFileSync(join(ROOT, "index.html"), "utf8");
    const bundleName = /<script src="\/(build\/app-[0-9a-f]+\.js)"><\/script>/.exec(home)[1];
    const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    const bad = [];
    for (const f of [bundleName, "checkout.html", "keyclub.html", "carrito.html", "terminos.html"]) {
      const hits = framingIn(strip(readFileSync(join(ROOT, f), "utf8")));
      if (hits.length) bad.push(`${f}: ${hits.join(", ")}`);
    }
    assert.deepEqual(bad, []);
  });

  /* MOUNTAIN: the search box is the page's first job. */
  const mountain = await (async () => {
    const { ctx: mctx, page: m } = await openPhone();
    await m.route("**/search.html*", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>search</title>" }));
    await m.addInitScript(() => {
      /* __searchDrawnAt: the box is drawn and doSearch answers it;
         __searchReadyAt: ...and it is inside the first screen. */
      window.__searchReadyAt = null;
      window.__searchDrawnAt = null;
      const poll = () => {
        const el = document.getElementById("searchInput");
        if (el && typeof window.doSearch === "function") {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            if (window.__searchDrawnAt === null) window.__searchDrawnAt = performance.now();
            if (r.top < innerHeight) { window.__searchReadyAt = performance.now(); return; }
          }
        }
        setTimeout(poll, 20);
      };
      poll();
    });
    const cdp = await mctx.newCDPSession(m);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 2000, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const bytes = new Map();
    let doc = 0;
    cdp.on("Network.responseReceived", (e) => { if (e.type === "Document" && !doc) doc = e.requestId; });
    cdp.on("Network.loadingFinished", (e) => bytes.set(e.requestId, e.encodedDataLength));
    await m.goto(BASE + "/index.html", { waitUntil: "commit", timeout: 120000 });
    await m.waitForFunction(() => window.__searchDrawnAt !== null && performance.getEntriesByName("first-contentful-paint").length > 0, null, { timeout: 120000, polling: 100 });
    await m.waitForFunction(() => window.__searchReadyAt !== null, null, { timeout: 5000, polling: 100 }).catch(() => {});
    const t = await m.evaluate(() => ({ fcp: performance.getEntriesByName("first-contentful-paint")[0].startTime, drawn: window.__searchDrawnAt, ready: window.__searchReadyAt }));
    const before = Date.now();
    await m.tap("#searchInput");
    await m.keyboard.type("nike");
    const nav = m.waitForURL(/\/search\.html\?q=nike/, { timeout: 30000 }).then(() => true, () => false);
    await m.keyboard.press("Enter");
    const navigated = await nav;
    const tapMs = Date.now() - before;
    await m.waitForTimeout(100);
    await mctx.close();
    return { ...t, navigated, tapMs, htmlBytes: bytes.get(doc) || 0 };
  })();
  const gap = mountain.ready === null ? null : Math.max(0, Math.round(mountain.ready - mountain.fcp));
  console.log(`    ..   mountain: first paint ${Math.round(mountain.fcp)}ms, search drawn and live ${Math.round(mountain.drawn)}ms (${Math.max(0, Math.round(mountain.drawn - mountain.fcp))}ms after first paint), in the first screen ${gap === null ? "never" : gap + "ms after first paint"}, tap->search.html ${mountain.tapMs}ms, index.html ${mountain.htmlBytes} bytes on the wire`);

  await check("Mountain: the home search is drawn and takes a search within 2s of first paint", () => {
    const drawnGap = Math.max(0, Math.round(mountain.drawn - mountain.fcp));
    assert.ok(drawnGap <= 2000, `the search box was ready ${drawnGap}ms after the first paint`);
    assert.ok(mountain.navigated, "tap + type + Enter did not open search.html");
  });

  /* Whole-page transfer, unthrottled, to the network going quiet. */
  const transfer = await (async () => {
    const { ctx: tctx, page: t } = await openPhone();
    const cdp = await tctx.newCDPSession(t);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    const bytes = new Map();
    cdp.on("Network.loadingFinished", (e) => bytes.set(e.requestId, e.encodedDataLength));
    await t.goto(BASE + "/index.html", { waitUntil: "networkidle", timeout: 120000 });
    await tctx.close();
    let total = 0;
    for (const b of bytes.values()) total += b;
    return { total, requests: bytes.size };
  })();
  console.log(`    ..   first-screen load (no scrolling): ${transfer.requests} requests, ${transfer.total} bytes transferred`);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n"));
  process.exit(1);
}
