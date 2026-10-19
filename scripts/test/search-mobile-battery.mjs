/* ==================================================================
   #409 ACCEPTANCE BATTERY — search on a throttled phone, measured.

   Opens search.html?q=<query> the way the home page's search box does,
   cold cache, on an iPhone-sized viewport, and reports per query.
   PROFILE=fast3g (default): DevTools "Fast 3G" (562.5ms round trip,
   1.44 Mbps down), CPU 4x slower. PROFILE=mountain (#417 night orders,
   "worst phone, worst signal"): Slow 3G (2s round trip, 400 kbps),
   CPU 6x slower. Per query:

     placeholdersMs   card-shaped placeholders on screen
     firstCardsMs     the first real cards painted
     screenPhotosMs   every photo in the first screen loaded
     apiKB            JSON transferred per /api/search page
     totalKB          everything transferred, photos included
     largest          the largest single response
     catalogue        requests for a catalogue, the index or the engine
                      (must be empty)
     minCardH         the shortest card in the first screen, in px
                      (a collapsed card would be a few px)
     entities         whether any card shows "&#38;"-style text
     domCards         result-grid cards drawn (48 a page at most)
     laneCards        cards in the mall's lanes (#416; 16 per lane)
     firstScreen      what the first screen shows, top to bottom

   Targets (#409 fire order): JSON < 300KB a page, first results
   painted < 2s, no catalogue request, shaped cards with photos.

   RUNNING IT (against a deploy preview or a local server):
     npm i --no-save playwright
     ARIA_BASE_URL=https://deploy-preview-NNN--<site>.netlify.app \
       node scripts/test/search-mobile-battery.mjs
   PLAYWRIGHT_CHROMIUM=<path> uses an installed Chromium. QUERIES="a|b"
   overrides the battery. STANDIN_PHOTO=<url> answers every retailer
   photo with that one image, for sandboxes that cannot reach the
   retailers' CDNs (the run then measures the page, not the photos).
   ================================================================== */
import { chromium } from "playwright";

const BASE = (process.env.ARIA_BASE_URL || "http://127.0.0.1:8899").replace(/\/$/, "");
const QUERIES = (process.env.QUERIES || "dolls|muñecas|adidas samba|nike air force 1").split("|");
const PROFILES = {
  fast3g: { net: { latency: 562.5, downloadThroughput: 1.44e6 / 8, uploadThroughput: 675e3 / 8 }, cpu: 4 },
  mountain: { net: { latency: 2000, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 }, cpu: 6 },
};
const PROFILE = PROFILES[process.env.PROFILE || "fast3g"];
if (!PROFILE) throw new Error("PROFILE must be fast3g or mountain");

const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const rows = [];
let failed = 0;
for (const q of QUERIES) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  if (process.env.STANDIN_PHOTO) {
    const own = new URL(BASE).host;
    await page.route((url) => url.host !== own && url.host !== new URL(process.env.STANDIN_PHOTO).host, (r) =>
      r.request().resourceType() === "image" ? r.fulfill({ status: 302, headers: { location: process.env.STANDIN_PHOTO } }) : r.abort());
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...PROFILE.net });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: PROFILE.cpu });
  const reqs = new Map();
  cdp.on("Network.responseReceived", (e) => reqs.set(e.requestId, { ...(reqs.get(e.requestId) || {}), url: e.response.url, type: e.type }));
  cdp.on("Network.loadingFinished", (e) => reqs.set(e.requestId, { ...(reqs.get(e.requestId) || {}), bytes: e.encodedDataLength }));
  await page.addInitScript(() => {
    const m = (window.__m = {});
    const tick = () => {
      const cards = document.querySelectorAll("#results .card:not(.sk)");   // grid and lanes
      if (!m.placeholders && document.querySelector("#results .card.sk")) m.placeholders = performance.now();
      if (!m.firstCards && cards.length) m.firstCards = performance.now();
      if (m.firstCards && !m.screenPhotos) {
        /* On the screen: a lane's cards off to the side are not. */
        const imgs = [...cards].filter((c) => { const b = c.getBoundingClientRect(); return b.top < innerHeight && b.left < innerWidth && b.right > 0; })
          .map((c) => c.querySelector("img")).filter(Boolean);
        if (imgs.length && imgs.every((i) => i.complete && i.naturalWidth > 0)) m.screenPhotos = performance.now();
      }
      if (!(m.firstCards && m.screenPhotos)) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  let error = null;
  try {
    await page.goto(`${BASE}/search.html?q=${encodeURIComponent(q)}`, { waitUntil: "commit", timeout: 120000 });
    await page.waitForFunction(() => window.__m.firstCards, null, { timeout: 120000, polling: 100 });
    await page.waitForFunction(() => window.__m.screenPhotos, null, { timeout: 60000, polling: 100 }).catch(() => {});
  } catch (e) { error = String(e.message).split("\n")[0]; }
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#results .card:not(.sk)")];
    const first = cards.filter((c) => c.getBoundingClientRect().top < innerHeight && c.getBoundingClientRect().left < innerWidth);
    const screen = [...document.querySelectorAll("#results > .lane h2, #results > .grid-head, #results > .card:not(.sk)")]
      .filter((e) => e.getBoundingClientRect().top < innerHeight)
      .map((e) => e.tagName === "H2" ? "[" + e.textContent + "]" : "card");
    return { ...window.__m, domCards: document.querySelectorAll("#results > .card:not(.sk)").length,
      laneCards: document.querySelectorAll("#results .lane .card").length,
      firstScreen: screen.join(" ").replace(/(card ?)+/g, (m) => (m.trim().split(" ").length) + " cards "),
      minCardH: first.length ? Math.round(Math.min(...first.map((c) => c.getBoundingClientRect().height))) : null,
      entities: cards.some((c) => /&#\d+;|&#x[0-9a-f]+;|&amp;|&quot;/i.test(c.textContent)),
      meta: (document.getElementById("meta-line") || {}).textContent || "" };
  }).catch(() => ({}));
  await new Promise((r) => setTimeout(r, 300));
  const done = [...reqs.values()].filter((r) => r.url && r.bytes != null);
  const largest = done.reduce((a, b) => (!a || b.bytes > a.bytes ? b : a), null);
  const row = {
    q, error,
    placeholdersMs: Math.round(m.placeholders || 0), firstCardsMs: Math.round(m.firstCards || 0), screenPhotosMs: Math.round(m.screenPhotos || 0),
    apiKB: done.filter((r) => /functions\/search|\/api\/search/.test(r.url)).map((r) => +(r.bytes / 1024).toFixed(1)),
    totalKB: +(done.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(1),
    largest: largest ? `${largest.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60)} ${(largest.bytes / 1024).toFixed(1)}KB` : null,
    catalogue: done.filter((r) => /-catalog\.json|department-cache|catalog-index|search-engine\.js|search-pipeline\.js/.test(r.url)).map((r) => r.url),
    domCards: m.domCards, laneCards: m.laneCards, firstScreen: (m.firstScreen || "").trim(), minCardH: m.minCardH, entities: m.entities, meta: m.meta,
  };
  const bad = row.error || row.catalogue.length || row.apiKB.some((k) => k > 300) || !(row.minCardH > 150) || row.entities || !(row.domCards <= 48);
  if (bad) failed++;
  rows.push(row);
  console.log((bad ? "FAIL " : "ok   ") + JSON.stringify(row));
  await context.close();
}
await browser.close();
console.log(`\n  ${rows.length - failed} of ${rows.length} queries within the #409 limits (first-paint times are reported, not gated: they depend on the deploy's cold start).`);
process.exit(failed ? 1 : 0);
