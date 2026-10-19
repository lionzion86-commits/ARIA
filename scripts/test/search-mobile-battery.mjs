/* ==================================================================
   #409 ACCEPTANCE BATTERY — search on a throttled phone, measured.

   Opens search.html?q=<query> the way the home page's search box does,
   cold cache, on an iPhone-sized viewport with the CPU slowed 4x and
   the network at DevTools' "Fast 3G" (562.5ms round trip, 1.44 Mbps
   down), and reports per query:

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

   Targets (#409 fire order): JSON < 300KB a page, first results
   painted < 2s, no catalogue request, shaped cards with photos.

   RUNNING IT (against a deploy preview or a local server):
     npm i --no-save playwright
     ARIA_BASE_URL=https://deploy-preview-NNN--<site>.netlify.app \
       node scripts/test/search-mobile-battery.mjs
   PLAYWRIGHT_CHROMIUM=<path> uses an installed Chromium. QUERIES="a|b"
   overrides the battery.
   ================================================================== */
import { chromium } from "playwright";

const BASE = (process.env.ARIA_BASE_URL || "http://127.0.0.1:8899").replace(/\/$/, "");
const QUERIES = (process.env.QUERIES || "dolls|muñecas|adidas samba|nike air force 1").split("|");
const FAST_3G = { latency: 562.5, downloadThroughput: 1.44e6 / 8, uploadThroughput: 675e3 / 8 };
const CPU_SLOWDOWN = 4;

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
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...FAST_3G });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  const reqs = new Map();
  cdp.on("Network.responseReceived", (e) => reqs.set(e.requestId, { ...(reqs.get(e.requestId) || {}), url: e.response.url, type: e.type }));
  cdp.on("Network.loadingFinished", (e) => reqs.set(e.requestId, { ...(reqs.get(e.requestId) || {}), bytes: e.encodedDataLength }));
  await page.addInitScript(() => {
    const m = (window.__m = {});
    const tick = () => {
      const cards = document.querySelectorAll("#results .card:not(.sk)");
      if (!m.placeholders && document.querySelector("#results .card.sk")) m.placeholders = performance.now();
      if (!m.firstCards && cards.length) m.firstCards = performance.now();
      if (m.firstCards && !m.screenPhotos) {
        const imgs = [...cards].filter((c) => c.getBoundingClientRect().top < innerHeight).map((c) => c.querySelector("img")).filter(Boolean);
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
    const first = cards.filter((c) => c.getBoundingClientRect().top < innerHeight);
    return { ...window.__m, domCards: cards.length,
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
    domCards: m.domCards, minCardH: m.minCardH, entities: m.entities, meta: m.meta,
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
