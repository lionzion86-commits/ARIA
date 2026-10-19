/* ==================================================================
   #409 MOUNTAIN BATTERY -- tienda.html storefronts on a throttled phone.

   Each store opens in a fresh tab with a cold cache, iPhone viewport
   (390x844 @3x, touch). PROFILE=mountain (default): Slow 3G -- 2s round
   trip, 400 kbps both ways -- and CPU 6x slower. PROFILE=fast3g:
   562.5ms, 1.44 Mbps, CPU 4x.

   Steps per store (STEPS, default "landing"; add chip,search,vertodo):
     landing   open tienda.html?tienda=<store>
     chip      tap the first chip after Todo
     search    type Q (default "black") in the store's search box
     vertodo   open the first rail's "Ver todo"
   Per step: placeholders (card-shaped boxes on screen), firstCards,
   screenPhotos (every photo in the first screen loaded), KB moved, the
   largest response, catalogue requests (must be none), the shortest
   card in the first screen.

   RUNNING IT
     ARIA_BASE_URL=http://127.0.0.1:8961 STANDIN_PHOTO=http://127.0.0.1:8961/__photo.jpg \
       STORES=ssense,ccs,walmart,target,newbalance,bestbuy \
       PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs \
       node scripts/test/tienda-mountain-battery.mjs
   STANDIN_PHOTO answers every retailer photo with one image (for
   sandboxes that cannot reach the retailers' CDNs); other off-site
   requests are aborted. CAP_MS (default 240000) bounds a page that
   never draws a card.
   ================================================================== */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = (process.env.ARIA_BASE_URL || "http://127.0.0.1:8961").replace(/\/$/, "");
const STORES = (process.env.STORES || "ssense,ccs,walmart,target,newbalance,bestbuy").split(",").filter(Boolean);
const STEPS = (process.env.STEPS || "landing").split(",");
const Q = process.env.Q || "black";
const CAP_MS = Number(process.env.CAP_MS || 240000);
const PROFILES = {
  fast3g: { net: { latency: 562.5, downloadThroughput: 1.44e6 / 8, uploadThroughput: 675e3 / 8 }, cpu: 4 },
  mountain: { net: { latency: 2000, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 }, cpu: 6 },
};
const PROFILE = PROFILES[process.env.PROFILE || "mountain"];
if (!PROFILE) throw new Error("PROFILE must be fast3g or mountain");
const CATALOGUE = /-catalog\.json|department-cache|catalog-index\.json|ofertas-feed|\/_fn\/|find\.json/;

const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const rows = [];

for (const store of STORES) {
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
  cdp.on("Network.dataReceived", (e) => { const r = reqs.get(e.requestId); if (r) r.partial = (r.partial || 0) + (e.encodedDataLength || 0); });
  cdp.on("Network.loadingFinished", (e) => reqs.set(e.requestId, { ...(reqs.get(e.requestId) || {}), bytes: e.encodedDataLength }));

  /* The watcher: card-shaped boxes, the first new real card, the first
     screen's photos. Cards marked data-seen were there before the step.
     ROOT is the page body for the landing and the grid steps, the
     overlay for "Ver todo". */
  await page.addInitScript(() => {
    window.__step = (t0, root) => {
      const m = (window.__m = { t0 });
      /* the "Ver todo" overlay when it is open, else the page */
      const scope = () => document.querySelector(root || (document.getElementById("railExpand") && !document.getElementById("railExpand").hidden ? "#reGrid" : "#content"));
      const tick = () => {
        const now = performance.now() - t0;
        const host = scope();
        if (host) {
          const cards = [...host.querySelectorAll(".card:not(.sk)")].filter((c) => !c.hasAttribute("data-seen"));
          if (!m.placeholders && host.querySelector(".skel, .card.sk")) m.placeholders = now;
          if (!m.firstCards && cards.length) m.firstCards = now;
          if (m.firstCards && !m.screenPhotos) {
            const imgs = cards.filter((c) => { const b = c.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; })
              .map((c) => c.querySelector("img")).filter(Boolean);
            if (imgs.length && imgs.every((i) => i.complete && i.naturalWidth > 0)) m.screenPhotos = now;
          }
        }
        if (!(m.firstCards && m.screenPhotos)) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    window.__step(0);
  });

  async function measure(step, act, root) {
    const from = seq;
    let error = null;
    const t0 = Date.now();
    try {
      if (step !== "landing") {
        await page.evaluate(() => document.querySelectorAll(".card").forEach((c) => c.setAttribute("data-seen", "")));
        await page.evaluate((r) => window.__step(performance.now(), r), root || null);
      }
      await act();
      await page.waitForFunction(() => window.__m && window.__m.firstCards, null, { timeout: CAP_MS, polling: 200 });
      await page.waitForFunction(() => window.__m.screenPhotos, null, { timeout: 120000, polling: 200 }).catch(() => { error = "first-screen photos not all loaded in 120s"; });
    } catch (e) { error = "no card in " + Math.round((Date.now() - t0) / 1000) + "s"; }
    await new Promise((r) => setTimeout(r, Number(process.env.SETTLE_MS || 6000)));
    const m = await page.evaluate((root) => {
      const ov = document.getElementById("railExpand");
      const host = document.querySelector(root || (ov && !ov.hidden ? "#reGrid" : "#content")) || document;
      const cards = [...host.querySelectorAll(".card:not(.sk)")].filter((c) => !c.hasAttribute("data-seen"));
      const first = cards.filter((c) => { const b = c.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; });
      return { ...window.__m, cards: cards.length,
        minCardH: first.length ? Math.round(Math.min(...first.map((c) => c.getBoundingClientRect().height))) : null,
        count: (document.getElementById("countLine") || {}).textContent || "" };
    }, root || null).catch(() => ({}));
    const mine = [...reqs.values()].filter((r) => r.seq > from);
    const bytes = (r) => (r.bytes != null ? r.bytes : r.partial || 0);
    const largest = mine.reduce((a, b) => (!a || bytes(b) > bytes(a) ? b : a), null);
    rows.push({
      store, step, error,
      placeholdersMs: Math.round(m.placeholders || 0), firstCardsMs: Math.round(m.firstCards || 0), screenPhotosMs: Math.round(m.screenPhotos || 0),
      totalKB: +(mine.reduce((s, r) => s + bytes(r), 0) / 1024).toFixed(1),
      largest: largest ? `${largest.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 70)} ${(bytes(largest) / 1024).toFixed(1)}KB` : null,
      catalogue: mine.filter((r) => CATALOGUE.test(r.url)).map((r) => r.url.replace(/^https?:\/\/[^/]+/, "")),
      minCardH: m.minCardH, cards: m.cards, count: m.count,
    });
    console.error(JSON.stringify(rows[rows.length - 1]));
  }

  await measure("landing", async () => {
    await page.goto(`${BASE}/tienda.html?tienda=${store}`, { waitUntil: "commit", timeout: 120000 });
  });
  if (STEPS.includes("chip") && await page.$(".chips .chip:nth-child(2)")) {
    await measure("chip", async () => { await page.evaluate(() => scrollTo(0, 0)); await page.tap(".chips .chip:nth-child(2)"); });
    await page.evaluate(() => { const b = document.getElementById("reBack"); if (b && !document.getElementById("railExpand").hidden) b.click(); const t = document.querySelector(".chips .chip"); if (t) t.click(); });
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (STEPS.includes("search")) {
    await measure("search:" + Q, async () => { await page.evaluate(() => scrollTo(0, 0)); await page.fill("#q", Q); });
    await page.fill("#q", "");
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (STEPS.includes("vertodo") && await page.$(".rail-ver")) {
    await measure("vertodo", async () => { await page.tap(".rail-ver"); }, "#reGrid");
  }
  await context.close();
}

await browser.close();
console.log(JSON.stringify({ base: BASE, profile: process.env.PROFILE || "mountain", rows }, null, 1));
