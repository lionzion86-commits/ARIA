/* ==================================================================
   #409 MOUNTAIN BATTERY -- ofertas.html on a throttled phone, measured.

   Cold cache, iPhone viewport (390x844 @3x, touch). PROFILE=mountain
   (default): Slow 3G -- 2s round trip, 400 kbps both ways -- and CPU
   6x slower. PROFILE=fast3g: 562.5ms, 1.44 Mbps, CPU 4x.

   Steps, one browser tab:
     landing    open ofertas.html
     store      pick one store in the filter (STORE, default target)
     more       tap "Mostrar más" (skipped when the page has none)
     search     type a word in the search box (Q, default dress)
   Per step: placeholders (card-shaped boxes on screen), firstCards,
   screenPhotos (every photo in the first screen loaded), KB moved,
   the largest response, catalogue requests (must be none), the
   shortest card in the first screen, cards in the grid.

   RUNNING IT
     ARIA_BASE_URL=http://127.0.0.1:8973 STANDIN_PHOTO=http://127.0.0.1:8973/__photo.jpg \
       PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs \
       node scripts/test/ofertas-mountain-battery.mjs
   STANDIN_PHOTO answers every retailer photo with one image (for
   sandboxes that cannot reach the retailers' CDNs); other off-site
   requests are aborted.
   ================================================================== */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = (process.env.ARIA_BASE_URL || "http://127.0.0.1:8973").replace(/\/$/, "");
const STORE = process.env.STORE || "target";
const Q = process.env.Q || "dress";
const PROFILES = {
  fast3g: { net: { latency: 562.5, downloadThroughput: 1.44e6 / 8, uploadThroughput: 675e3 / 8 }, cpu: 4 },
  mountain: { net: { latency: 2000, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 }, cpu: 6 },
};
const PROFILE = PROFILES[process.env.PROFILE || "mountain"];
if (!PROFILE) throw new Error("PROFILE must be fast3g or mountain");
const CATALOGUE = /ofertas-feed(-lite)?\.json|-catalog\.json|department-cache|assets\/ofertas\/deals\.json/;

const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
const own = new URL(BASE).host;
if (process.env.STANDIN_PHOTO) {
  const standin = new URL(process.env.STANDIN_PHOTO).host;
  await page.route((url) => url.host !== own && url.host !== standin, (r) =>
    r.request().resourceType() === "image" ? r.fulfill({ status: 302, headers: { location: process.env.STANDIN_PHOTO } }) : r.abort());
}
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Network.emulateNetworkConditions", { offline: false, ...PROFILE.net });
await cdp.send("Emulation.setCPUThrottlingRate", { rate: PROFILE.cpu });
const reqs = new Map();
let seq = 0;
cdp.on("Network.requestWillBeSent", (e) => reqs.set(e.requestId, { ...(reqs.get(e.requestId) || {}), url: e.request.url, seq: ++seq }));
cdp.on("Network.loadingFinished", (e) => reqs.set(e.requestId, { ...(reqs.get(e.requestId) || {}), bytes: e.encodedDataLength }));

/* The watcher: card-shaped boxes, the first new real card, the first
   screen's photos. Cards marked data-seen were there before the step. */
await page.addInitScript(() => {
  window.__step = (t0) => {
    const m = (window.__m = { t0 });
    const tick = () => {
      const now = performance.now() - t0;
      const cards = [...document.querySelectorAll("#content .card:not(.sk)")].filter((c) => !c.hasAttribute("data-seen"));
      if (!m.placeholders && document.querySelector("#content .skel, #content .card.sk")) m.placeholders = now;
      if (!m.firstCards && cards.length) m.firstCards = now;
      if (m.firstCards && !m.screenPhotos) {
        const imgs = cards.filter((c) => { const b = c.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; })
          .map((c) => c.querySelector("img")).filter(Boolean);
        if (imgs.length && imgs.every((i) => i.complete && i.naturalWidth > 0)) m.screenPhotos = now;
      }
      if (!(m.firstCards && m.screenPhotos)) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  window.__step(0);
});

const rows = [];
async function measure(step, act) {
  const from = seq;
  let error = null;
  try {
    if (step === "landing") await act();
    else {
      await page.evaluate(() => document.querySelectorAll("#content .card").forEach((c) => c.setAttribute("data-seen", "")));
      await page.evaluate(() => window.__step(performance.now()));
      await act();
    }
    await page.waitForFunction(() => window.__m && window.__m.firstCards, null, { timeout: 180000, polling: 100 });
    await page.waitForFunction(() => window.__m.screenPhotos, null, { timeout: 90000, polling: 100 }).catch(() => { error = "first-screen photos not all loaded in 90s"; });
  } catch (e) { error = String(e.message).split("\n")[0]; }
  /* Let in-flight responses settle so the bytes count what the step moved. */
  await new Promise((r) => setTimeout(r, Number(process.env.SETTLE_MS || 8000)));
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#content .card:not(.sk)")].filter((c) => !c.hasAttribute("data-seen"));
    const first = cards.filter((c) => { const b = c.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; });
    return { ...window.__m, gridCards: document.querySelectorAll("#content .card:not(.sk)").length,
      minCardH: first.length ? Math.round(Math.min(...first.map((c) => c.getBoundingClientRect().height))) : null,
      imgsRequested: [...document.querySelectorAll("#content .card img")].filter((i) => i.currentSrc || (i.getAttribute("src") || "")).length,
      count: (document.getElementById("countLine") || {}).textContent || "" };
  }).catch(() => ({}));
  const done = [...reqs.values()].filter((r) => r.seq > from && r.bytes != null);
  const largest = done.reduce((a, b) => (!a || b.bytes > a.bytes ? b : a), null);
  rows.push({
    step, error,
    placeholdersMs: Math.round(m.placeholders || 0), firstCardsMs: Math.round(m.firstCards || 0), screenPhotosMs: Math.round(m.screenPhotos || 0),
    totalKB: +(done.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(1),
    photos: done.filter((r) => /__photo\.jpg/.test(r.url)).length,
    largest: largest ? `${largest.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60)} ${(largest.bytes / 1024).toFixed(1)}KB` : null,
    catalogue: done.filter((r) => CATALOGUE.test(r.url)).map((r) => r.url.replace(/^https?:\/\/[^/]+/, "")),
    minCardH: m.minCardH, gridCards: m.gridCards, count: m.count,
  });
}

await measure("landing", async () => {
  await page.goto(`${BASE}/ofertas.html`, { waitUntil: "commit", timeout: 120000 });
});
const hasStore = await page.evaluate((s) => !!document.querySelector(`#store option[value="${s}"]`), STORE);
if (hasStore) {
  await measure(`store:${STORE}`, async () => {
    await page.evaluate(() => scrollTo(0, 0));
    await page.selectOption("#store", STORE);
  });
} else rows.push({ step: `store:${STORE}`, error: "store not offered" });
const hasMore = await page.evaluate(() => { const b = document.getElementById("moreBtn"); return !!(b && !b.closest("[hidden]")); });
if (hasMore) {
  await measure("mostrar-mas", async () => {
    await page.evaluate(() => { const b = document.getElementById("moreBtn"); b.scrollIntoView({ block: "end" }); });
    await page.tap("#moreBtn");
    await page.waitForFunction(() => document.querySelector("#content .card:not(.sk):not([data-seen])"), null, { timeout: 180000, polling: 100 });
    await page.evaluate(() => { const c = document.querySelector("#content .card:not(.sk):not([data-seen])"); c.scrollIntoView({ block: "start" }); });
  });
} else rows.push({ step: "mostrar-mas", error: "no Mostrar más on this page (every card drawn at once)" });
await page.selectOption("#store", "");
await new Promise((r) => setTimeout(r, 4000));
await measure(`search:${Q}`, async () => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.fill("#q", Q);
});

await browser.close();
console.log(JSON.stringify({ base: BASE, profile: process.env.PROFILE || "mountain", rows }, null, 1));
