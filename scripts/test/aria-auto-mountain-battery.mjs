/* ==================================================================
   MOUNTAIN BATTERY -- ARIA AUTO'S FRONT DOOR (#443 c.6427505203 gates:
   throttled low-end phone, first tap, low-end Chromebook profile).

   Each profile opens aria-auto.html in a fresh context with a cold cache:
     mountain    iPhone viewport (390x844 @3x, touch); Slow 3G -- 2s round
                 trip, 400 kbps both ways -- and CPU 6x slower (the #409
                 battery's profile)
     chromebook  1366x768 @1x, mouse; 150ms round trip, 1.6 Mbps down,
                 750 kbps up, CPU 4x slower (#443 c.6418852142: the
                 low-end Chromebook becomes a Mountain Test gate)
   Per profile: firstCards (ms from navigation to the first rail card on
   screen), soles (to the first price in S/), firstTap (a tap on the first
   category tile, from the tap to the navigation it starts), KB moved,
   catalogue requests (must be none).

   RUNNING IT
     ARIA_BASE_URL=http://127.0.0.1:8961 node scripts/test/aria-auto-mountain-battery.mjs
   Without ARIA_BASE_URL it serves the repo itself. Retailer photos are
   answered with one local image (sandboxes cannot reach their CDNs).
   Exits non-zero when a gate fails: firstCards over 8000ms (mountain) /
   3000ms (chromebook), the tap's input delay over 100ms (Event Timing)
   or the tap-to-navigation wall clock over 1s, or any catalogue request.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const PHOTO = readFileSync(ROOT + "assets/sections/tiendas-mall-row.jpg");
const CATALOGUE = /-catalog\.json|department-cache|catalog-index\.json|ofertas-feed|\/_fn\/|find\.json/;

let BASE = process.env.ARIA_BASE_URL;
let server = null;
if (!BASE) {
  const TYPES = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
  server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/.netlify/functions/exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ venta: 3.75 })); return; }
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  await new Promise((r) => server.listen(0, r));
  BASE = `http://127.0.0.1:${server.address().port}`;
}

const PROFILES = {
  mountain: {
    ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" },
    net: { latency: 2000, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 }, cpu: 6, capCards: 8000,
  },
  chromebook: {
    ctx: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1,
      userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    net: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }, cpu: 4, capCards: 3000,
  },
};
const want = (process.env.PROFILES || "mountain,chromebook").split(",");
const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const rows = [];
let failed = false;

for (const name of want) {
  const P = PROFILES[name];
  if (!P) throw new Error("unknown profile " + name);
  const context = await browser.newContext(P.ctx);
  const page = await context.newPage();
  const own = new URL(BASE).host;
  await page.route((url) => url.host !== own, (r) => r.request().resourceType() === "image"
    ? r.fulfill({ status: 200, contentType: "image/jpeg", body: PHOTO }) : r.abort());
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...P.net });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: P.cpu });
  let bytes = 0, imgBytes = 0;
  const cat = [], kind = new Map();
  cdp.on("Network.responseReceived", (e) => kind.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength || 0; if (kind.get(e.requestId) === "Image") imgBytes += e.encodedDataLength || 0; });
  cdp.on("Network.requestWillBeSent", (e) => { if (CATALOGUE.test(e.request.url)) cat.push(e.request.url); });

  const t0 = Date.now();
  await page.goto(`${BASE}/aria-auto.html`, { waitUntil: "commit" });
  await page.waitForFunction(() => {
    const c = document.querySelector(".rail .card");
    return c && c.getBoundingClientRect().top < innerHeight * 3;
  }, null, { timeout: 120000, polling: 50 });
  const firstCards = Date.now() - t0;
  await page.waitForFunction(() => /S\//.test((document.querySelector(".rail .price .pen") || {}).textContent || ""), null, { timeout: 120000, polling: 100 });
  const soles = Date.now() - t0;

  /* First tap: from the tap on the first tile to the navigation it
     starts, as soon as the prices are painted (the shopper does not wait
     for the photos to settle). The page's own handling is measured too:
     the Event Timing entry's processing delay. */
  await page.evaluate(() => {
    /* The page's input delay: from the tap's own timestamp to the moment
       the page's main thread got to handle it. Kept across the navigation. */
    const note = (e) => { try { if (!sessionStorage.getItem("__tapDelay")) sessionStorage.setItem("__tapDelay", String(Math.round(performance.now() - e.timeStamp))); } catch (x) {} };
    addEventListener("pointerdown", note, true);
    addEventListener("click", note, true);
  });
  const tile = page.locator(".aa-tile").first();
  const navStarted = page.waitForEvent("request", (r) => r.isNavigationRequest() && /motos\.html/.test(r.url()), { timeout: 30000 });
  const tTap = Date.now();
  if (P.ctx.hasTouch) await tile.tap(); else await tile.click();
  await navStarted;
  const firstTap = Date.now() - tTap;
  await page.waitForURL(/motos\.html/, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const inputDelay = await page.evaluate(() => Number(sessionStorage.getItem("__tapDelay"))).catch(() => null);

  const row = { profile: name, firstCards, soles, firstTap, inputDelay, kb: Math.round(bytes / 1024), kbNoPhotos: Math.round((bytes - imgBytes) / 1024), catalogue: cat.length };
  rows.push(row);
  /* The tap's gate is the page's own input delay (Event Timing): the
     wall clock also carries the throttled browser's navigation work. */
  if (firstCards > P.capCards || (inputDelay != null && inputDelay > 100) || firstTap > 1000 || cat.length) failed = true;
  await context.close();
}

await browser.close();
if (server) server.close();
console.log("\n  profile      firstCards  soles    firstTap  inputDelay  KB(all/no photos)  catalogue");
for (const r of rows) console.log(`  ${r.profile.padEnd(12)} ${String(r.firstCards).padStart(7)}ms ${String(r.soles).padStart(6)}ms ${String(r.firstTap).padStart(6)}ms ${String(r.inputDelay ?? "n/a").padStart(7)}ms ${String(r.kb).padStart(7)}/${String(r.kbNoPhotos).padEnd(9)} ${String(r.catalogue).padStart(6)}`);
console.log(failed ? "\n  GATE FAILED\n" : "\n  all gates pass\n");
process.exit(failed ? 1 : 0);
