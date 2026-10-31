/* ==================================================================
   THE PERFUMES CAROUSEL (#443, Danny, 2026-10-22).

   assets/home/shelves/perfumes.json (scripts/build-perfumes-shelf.mjs)
   feeds the home page's Perfumes rail and the lead rail of Aria Beauty >
   Fragancias. These checks hold its rules:

     data     every card is a perfume bottle (scripts/lib/fragrance.js,
              the one definition) from a live catalogue; SALES ONLY by
              sale-rule.js except the named hero anchors
              (scripts/lib/perfume-hero-anchors.json), and every anchor
              is that exact product in a live catalogue; no off-sale store
              and no Sephora; designer houses lead, cheapest first;
              anchors cheapest first; the most expensive card never
              leads; filed under beauty; no link to the store's site;
              no emoji; a thin payload.
     page     the home rail does not load at first paint (Mountain
              Test) and paints from the shelf when scrolled to, with the
              section name in the big rail header; the card leads with
              soles and puts US$ under it; Aria Beauty > Fragancias opens
              on the Perfumes rail.

   RUN: node scripts/test/perfume-carousel-tests.mjs
   PERFUME_STATIC=1 skips the browser part. The browser part serves the
   repo on PERFUME_PORT (default 8993); outbound requests are blocked,
   so retailer photos render blank. PERFUME_SHOTS=<dir> saves the
   390x844 screenshots there.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { isFragranceItem, isPerfumeBottle } from "../lib/fragrance.js";
import { isOffSaleRetailer } from "../lib/off-sale.js";
import {
  EXCLUDED_RETAILERS, loadHeroAnchors, heroAnchorOf, brandTier, orderRail, scanPerfumeRows, census,
  ANCHOR_SLOTS, PREMIUM_USD, titleOf,
} from "../lib/perfume-rail.js";
import "../../sale-rule.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const SHELF = JSON.parse(read("assets/home/shelves/perfumes.json"));
const PICKS = SHELF.picks;
const ANCHORS = loadHeroAnchors(ROOT);
const AriaSale = globalThis.AriaSale;

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("    ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failures.push(name + "\n         " + (e && e.message)); console.log("    FAIL " + name + "\n         " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }

/* Every raw row in every catalogue, by store and title. */
const RAW = new Map();
for (const f of readdirSync(ROOT).filter((f) => /-catalog\.json$/.test(f) || /^department-cache-[a-z0-9]+\.json$/.test(f))) {
  let j; try { j = JSON.parse(read(f)); } catch { continue; }
  for (const [rk, r] of Object.entries((j && j.retailers) || {})) for (const b of Object.values((r && r.departments) || {})) {
    for (const it of (Array.isArray(b) ? b : (b && b.items) || [])) if (it) {
      const k = rk + "::" + titleOf(it).trim();
      if (!RAW.has(k)) RAW.set(k, { retailer: rk, raw: it, file: f });
    }
  }
}
const rawOf = (p) => RAW.get(p.retailer + "::" + String(p.title).trim());
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u;

/* ---------------- the classifier ---------------- */
await check("one fragrance definition: perfumes in, fragrance-free / trays / candles / mislabelled hair care out", () => {
  const yes = [
    "Yves Saint Laurent Black Opium Eau de Parfum Spray, Perfume for Women, 3.0 oz",
    "Absolu Aventus by Creed, 2.5 oz EDP Spray for Men",
    { title: "Jean Paul Gaultier Mini Gaultier Fragrance Gift Set for Him" },
    { title: "3-Piece Idôle Eau de Parfum Spray, Lotion & Mini Mascara Set" },
    { title: "Cheirosa 40 Hair & Body Perfume Mist" },
    { title: "Some Bottle", restricted: "fragancia-max-4" },
    { title: "Libre", type: "Fragancia" },
  ];
  const no = [
    "Kirkland Signature Premoistened Flushable Wipes, Fragrance Free, 640-count",
    "STONCEL Decorative Mirror Tray, Vintage Oval Display Tray for Perfume, Makeup",
    "Mainstays 3-Wick Textured Wrapped Candle, Coconut Coast Fragrance, 14 oz",
    "TONE Long-Lasting Fragrance Hydrating Body Wash - Vanilla - 500ml",
    "Pura Home Plus Smart Fragrance Diffuser White",
    { name: "Crown Affair x U Beauty Mini Dry Shampoo & Plasma Lip Compound Set", type: "Fragancia" },
    "Unisex SuperBreak One Backpack",
  ];
  for (const t of yes) assert(isFragranceItem(t), "missed: " + JSON.stringify(t));
  for (const t of no) assert(!isFragranceItem(t), "false fragrance: " + JSON.stringify(t));
  assert(!isPerfumeBottle({ title: "Cheirosa 40 Hair & Body Perfume Mist" }), "a mist is on the bottle shelf");
  assert(isPerfumeBottle("Yves Saint Laurent Libre Eau de Parfum 1 oz"), "a bottle is not a bottle");
  /* The weight module and the cap read the same answer. */
  return `${yes.length} in, ${no.length} out`;
});
await check("beauty-weight's fragrance count is the shared classifier (one definition)", async () => {
  const bw = await import(join(ROOT, "scripts/lib/beauty-weight.js"));
  assert(bw.MAX_FRAGRANCES_PER_SHIPMENT === 4, "limit");
  assert(!bw.isFragrance("Kirkland Signature Premoistened Flushable Wipes, Fragrance Free"), "wipes count");
  assert(bw.fragranceLimitState([{ title: "YSL Libre Eau de Parfum", qty: 5 }, { title: "Hoodie", qty: 3 }]).count === 5, "count");
  const src = read("scripts/lib/beauty-weight.js");
  assert(/from "\.\/fragrance\.js"/.test(src), "beauty-weight does not import the shared module");
});

/* ---------------- the shelf ---------------- */
await check("the shelf exists and holds at least its own minimum", () => {
  assert(Array.isArray(PICKS) && PICKS.length >= SHELF.min && SHELF.min >= 4, `picks ${PICKS && PICKS.length}, min ${SHELF.min}`);
  return `${PICKS.length} cards`;
});
await check("every card is a perfume bottle from a live catalogue, with a real photo and a price", () => {
  for (const p of PICKS) {
    const r = rawOf(p);
    assert(r, "not in any catalogue: " + p.retailer + " " + p.title);
    assert(isPerfumeBottle(r.raw), "not a perfume bottle: " + p.title);
    assert(Number(p.price) > 0 && /^https?:\/\//.test(p.image || ""), "no price or photo: " + p.title);
  }
});
await check("no off-sale store and no Sephora on the rail", () => {
  for (const p of PICKS) {
    assert(!isOffSaleRetailer(p.retailer), "off-sale store: " + p.retailer);
    assert(!Object.prototype.hasOwnProperty.call(EXCLUDED_RETAILERS, p.retailer), "excluded store: " + p.retailer);
  }
  assert(EXCLUDED_RETAILERS.sephora, "Sephora is not on the rail's exclusion list");
});
await check("SALES ONLY, except the named hero anchors", () => {
  let sale = 0, anchors = 0;
  for (const p of PICKS) {
    const r = rawOf(p);
    if (p.heroAnchor) {
      anchors++;
      const a = ANCHORS.find((x) => x.id === p.heroAnchor);
      assert(a && a.name && a.why, "anchor is not a named, reviewed entry: " + p.heroAnchor);
      assert(heroAnchorOf(r.raw, ANCHORS)?.id === p.heroAnchor, "card is not that anchor's product: " + p.title);
    } else {
      assert(AriaSale.isOnSale(r.raw), "full price and not an anchor: " + p.title);
      assert(p.onSale === true && Number(p.originalPrice) > Number(p.price), "sale card without its was-price: " + p.title);
      sale++;
    }
  }
  return `${sale} sale, ${anchors} anchors`;
});
await check("every hero anchor on the rail exists in a live, buyable catalogue; the list stays curated", () => {
  assert(ANCHORS.length > 0 && ANCHORS.length <= 12, "anchor list size " + ANCHORS.length);
  const ids = new Set();
  for (const a of ANCHORS) {
    assert(a.id && a.name && Array.isArray(a.brands) && a.brands.length && Array.isArray(a.titleAll) && a.titleAll.length && a.why, "incomplete anchor " + JSON.stringify(a).slice(0, 80));
    assert(!ids.has(a.id), "duplicate anchor " + a.id); ids.add(a.id);
  }
  const live = scanPerfumeRows(ROOT).filter((r) => !r.offSale && !r.excluded);
  for (const p of PICKS.filter((p) => p.heroAnchor)) {
    assert(live.some((r) => r.retailer === p.retailer && r.title === String(p.title).trim()), "anchor not live: " + p.title);
  }
  /* The flanker is not the icon: Absolu Aventus does not qualify as Aventus. */
  assert(heroAnchorOf({ name: "Absolu Aventus by Creed, 2.5 oz EDP Spray for Men" }, ANCHORS) === null, "Absolu Aventus counted as Creed Aventus");
  return [...new Set(PICKS.filter((p) => p.heroAnchor).map((p) => p.heroAnchor))].join(", ");
});
await check("designer houses lead the sales, cheapest first inside each tier", () => {
  const sales = PICKS.filter((p) => !p.heroAnchor && Number(p.price) < PREMIUM_USD);
  for (let i = 1; i < sales.length; i++) {
    const a = sales[i - 1], b = sales[i];
    assert(brandTier(a) < brandTier(b) || (brandTier(a) === brandTier(b) && Number(a.price) <= Number(b.price)),
      `order: ${a.title} ($${a.price}) before ${b.title} ($${b.price})`);
  }
  assert(PICKS.length && brandTier(PICKS[0]) === 0, "the rail does not open on a designer house");
});
await check("Danny's lead trio opens the rail; after it, anchors take the anchor slots cheapest first and the most expensive card never leads", () => {
  /* LEAD FIRST (#443 item 39 revision, 2026-10-25): the anchors carrying
     `lead` open the rail in that order; every rule below holds for the rest. */
  const LEADS = ANCHORS
    .filter((a) => Number.isFinite(a.lead)).sort((x, y) => x.lead - y.lead).map((a) => a.id);
  assert(JSON.stringify(PICKS.slice(0, LEADS.length).map((p) => p.heroAnchor)) === JSON.stringify(LEADS), "the lead trio does not open the rail");
  const REST = PICKS.slice(LEADS.length);
  const ids = PICKS.filter((p) => p.heroAnchor).map((p) => p.heroAnchor);
  assert(new Set(ids).size === ids.length, "a hero shows twice: " + ids.join(", "));
  /* The premium heroes (Creed Aventus) ride their own reserved slots. */
  const anchors = REST.map((p, i) => ({ p, i })).filter((x) => x.p.heroAnchor && Number(x.p.price) < PREMIUM_USD);
  for (let k = 1; k < anchors.length; k++) assert(Number(anchors[k - 1].p.price) <= Number(anchors[k].p.price), "anchors not cheapest first");
  for (const { i } of anchors.slice(0, ANCHOR_SLOTS.length)) assert(ANCHOR_SLOTS.includes(i) || i >= ANCHOR_SLOTS.length, "anchor off its slot at " + i);
  const top = Math.max(...REST.map((p) => Number(p.price)));
  assert(Number(REST[0].price) < top, "the most expensive card leads the rest of the rail");
  assert(Number(REST[0].price) < PREMIUM_USD, "a premium card leads the rest of the rail");
});
await check("orderRail: lead anchors open the rail in their order, whatever their price", () => {
  const card = (title, price, extra = {}) => ({ title, price, onSale: true, ...extra });
  const rail = orderRail([
    card("Versace Eros Eau de Toilette", 60),
    card("Y Eau de Toilette", 127, { onSale: false, heroAnchor: "ysl-y" }),
    card("Creed Aventus Eau de Parfum", 480, { onSale: false, heroAnchor: "creed-aventus" }),
    card("Coco Mademoiselle Eau de Parfum", 179, { onSale: false, heroAnchor: "chanel-coco-mademoiselle" }),
    card("Dior Sauvage Eau de Toilette", 105, { onSale: false, heroAnchor: "dior-sauvage" }),
  ], 16, { "creed-aventus": 1, "chanel-coco-mademoiselle": 2, "ysl-y": 3 });
  assert(rail.slice(0, 3).map((p) => p.heroAnchor).join() === "creed-aventus,chanel-coco-mademoiselle,ysl-y", "the leads are out of order");
  assert(rail.length === 5, "a card was lost");
});
await check("orderRail: anchors in slots, sales by tier then price, premium sprinkled never first", () => {
  const card = (title, price, extra = {}) => ({ title, price, onSale: true, ...extra });
  const rail = orderRail([
    card("Creed Aventus Eau de Parfum", 480, { onSale: false, heroAnchor: "creed-aventus" }),
    card("Unknown House Eau de Parfum", 30),
    card("Versace Eros Eau de Toilette", 60),
    card("Gucci Bloom Eau de Parfum", 45),
    card("Carolina Herrera 212 VIP Eau de Parfum", 90, { onSale: false, heroAnchor: "carolina-herrera-212" }),
    card("Paco Rabanne 1 Million Eau de Toilette", 70, { onSale: false, heroAnchor: "paco-rabanne-1-million" }),
    card("Tom Ford Oud Wood Eau de Parfum", 310),
    card("Hoodie full price", 20, { onSale: false }),
  ]);
  const t = rail.map((p) => p.title.split(" ")[0]);
  assert(rail[0].heroAnchor === "paco-rabanne-1-million" && rail[2].heroAnchor === "carolina-herrera-212", "anchor slots: " + t);
  assert(!rail.some((p) => p.title.startsWith("Hoodie")), "a full-price non-anchor got in");
  assert(rail.indexOf(rail.find((p) => p.title.startsWith("Gucci"))) < rail.indexOf(rail.find((p) => p.title.startsWith("Versace"))), "tier 0 not cheapest first");
  assert(rail.findIndex((p) => p.title.startsWith("Versace")) < rail.findIndex((p) => p.title.startsWith("Unknown")), "a designer house trails an unknown");
  assert(Number(rail[0].price) < PREMIUM_USD, "premium leads");
  return t.join(" ");
});
await check("orderRail: each hero once, the premium hero keeps its slot on a full rail, no fragrance twice, two sale slots per house", () => {
  const card = (title, price, extra = {}) => ({ title, price, onSale: true, ...extra });
  const houses = ["Versace", "Gucci", "Prada", "Burberry", "Azzaro", "Kenzo", "Lacoste", "Coach", "Moschino", "Valentino"];
  const many = Array.from({ length: 30 }, (_, i) => card(`Scent${i} \u2014 Eau de Toilette 100 ml`, 10 + i, { brand: houses[i % houses.length] }));
  const rail = orderRail([
    card("212 NYC \u2014 Eau de Toilette 50 ml", 50, { onSale: false, heroAnchor: "carolina-herrera-212", brand: "Carolina Herrera" }),
    card("212 VIP \u2014 Eau de Parfum 80 ml", 90, { onSale: false, heroAnchor: "carolina-herrera-212", brand: "Carolina Herrera" }),
    card("Aventus \u2014 Eau de Parfum 100 ml", 468, { onSale: false, heroAnchor: "creed-aventus", brand: "Creed" }),
    card("Euphoria \u2014 Eau de Toilette 30 ml", 12, { brand: "Calvin Klein" }),
    card("Euphoria \u2014 Eau de Toilette 100 ml", 20, { brand: "Calvin Klein" }),
    ...many,
  ]);
  assert(rail.length === 16, "rail length " + rail.length);
  assert(rail.filter((p) => p.heroAnchor === "carolina-herrera-212").length === 1, "212 shows twice");
  assert(rail.find((p) => p.heroAnchor === "carolina-herrera-212").price === 50, "the hero is not its cheapest bottle");
  assert(rail.some((p) => p.heroAnchor === "creed-aventus"), "the premium hero was crowded out");
  assert(rail.filter((p) => /^Euphoria/.test(p.title)).length === 1, "one fragrance shows in two sizes");
  for (const h of houses) assert(rail.filter((p) => p.brand === h).length <= 2, h + " took more than two sale slots");
  assert(Number(rail[0].price) < PREMIUM_USD, "premium leads");
});
await check("filed under beauty, no link to the store's site, no emoji, thin payload", () => {
  for (const p of PICKS) {
    assert(JSON.stringify(p.departments) === '["beauty"]', "departments: " + JSON.stringify(p.departments));
    assert(!p.url && !JSON.stringify(p).includes('"url"'), "a store link travels with " + p.title);
  }
  for (const f of ["assets/home/shelves/perfumes.json", "scripts/lib/perfume-hero-anchors.json", "fragrance.js", "scripts/lib/fragrance.js", "scripts/lib/perfume-rail.js", "scripts/build-perfumes-shelf.mjs"]) {
    assert(!EMOJI.test(read(f)), "emoji in " + f);
  }
  const bytes = Buffer.byteLength(JSON.stringify(SHELF));
  assert(bytes < 12 * 1024, "perfumes.json is " + bytes + " bytes");
  return bytes + " bytes";
});
await check("census: Sephora's bottles are counted and kept off the rail", () => {
  const c = census(scanPerfumeRows(ROOT));
  assert(c.withExcluded.bottles >= c.withoutExcluded.bottles, "counts");
  assert(!c.withoutExcluded.byStore.sephora, "Sephora counted as eligible");
  return `with Sephora ${c.withExcluded.bottles} bottles (${c.withExcluded.sale} on sale), without ${c.withoutExcluded.bottles} (${c.withoutExcluded.sale} on sale)`;
});

/* ---------------- the page ---------------- */
if (!process.env.PERFUME_STATIC) {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); }
  const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const SHOTS = process.env.PERFUME_SHOTS || "";
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const FX = { compra: 3.72, venta: 3.75, fecha: "2026-10-22" };
  const PORT = Number(process.env.PERFUME_PORT || 8993);
  const fileCache = new Map();
  const server = await new Promise((ok, bad) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      const fm = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
      if (fm) {
        const body = fm[1] === "exchange-rate" ? JSON.stringify(FX) : JSON.stringify({ error: "No autenticado" });
        res.writeHead(fm[1] === "exchange-rate" ? 200 : 401, { "Content-Type": "application/json" });
        return res.end(body);
      }
      let p = join(ROOT, decodeURIComponent(u.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
      if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
      if (!fileCache.has(p)) fileCache.set(p, readFileSync(p));
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(fileCache.get(p));
    });
    srv.once("error", (e) => bad(e.code === "EADDRINUSE" ? new Error(`port ${PORT} is busy -- set PERFUME_PORT`) : e));
    srv.listen(PORT, "127.0.0.1", () => ok(srv));
  });
  const BASE = `http://127.0.0.1:${PORT}`;
  const OWN = new URL(BASE).host;
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  async function newPage() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
    await context.route("**/*", (route) => (new URL(route.request().url()).host === OWN ? route.continue() : route.abort()));
    const page = await context.newPage();
    const requests = [];
    page.on("request", (r) => requests.push(new URL(r.url()).pathname));
    return { context, page, requests };
  }

  try {
    await check("Mountain: the Perfumes rail loads nothing at first paint, then paints from its small shelf when scrolled to", async () => {
      const { context, page, requests } = await newPage();
      try {
        await page.goto(BASE + "/", { waitUntil: "load" });
        await page.waitForTimeout(1500);
        assert(!requests.some((u) => u.endsWith("/shelves/perfumes.json")), "perfumes.json fetched at first paint");
        const sec = page.locator("#mobileShopfront [data-perfumes-section]");
        await sec.scrollIntoViewIfNeeded();
        await page.waitForSelector("#mPerfumesRail [data-perfume-card]", { timeout: 30000 });
        const n = await page.locator("#mPerfumesRail [data-perfume-card]").count();
        assert(n === PICKS.length, `painted ${n} of ${PICKS.length}`);
        const sinceScroll = requests.slice(requests.indexOf("/assets/home/shelves/perfumes.json"));
        assert(requests.includes("/assets/home/shelves/perfumes.json"), "the shelf was never fetched");
        assert(!sinceScroll.some((u) => /-catalog\.json$|department-cache/.test(u)), "a catalogue was fetched for the rail: " + sinceScroll.filter((u) => /catalog|cache/.test(u)).join(", "));
        const head = await page.$eval("#mobileShopfront [data-perfumes-section] h2", (h) => ({ t: h.textContent.trim(), fs: parseFloat(getComputedStyle(h).fontSize), up: getComputedStyle(h).textTransform }));
        /* The flagship band (#443 item 39): its own title, set large. */
        assert(head.t === "Aria Perfumes" && head.fs >= 24, "header: " + JSON.stringify(head));
        await page.waitForTimeout(400);
        if (SHOTS) {
          await page.evaluate(() => { const s = document.querySelector("#mobileShopfront [data-perfumes-section]"); window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - 120); });
          await page.waitForTimeout(400);
          await page.screenshot({ path: join(SHOTS, "perfume-home-rail.png") });
        }
        return `${n} cards`;
      } finally { await context.close(); }
    });

    await check("the card leads with soles, US$ small under it; an anchor card shows no fake discount", async () => {
      const { context, page } = await newPage();
      try {
        await page.goto(BASE + "/", { waitUntil: "load" });
        await page.locator("#mobileShopfront [data-perfumes-section]").scrollIntoViewIfNeeded();
        await page.waitForSelector("#mPerfumesRail [data-perfume-card]", { timeout: 30000 });
        const card = await page.$eval("#mPerfumesRail [data-perfume-card]", (c) => {
          const spans = [...c.querySelectorAll("span")];
          const lead = spans.find((s) => /S\/|US\$|\$/.test(s.textContent) && s.classList.contains("font-extrabold") && s.classList.contains("tabular"));
          const ref = c.querySelector(".ariaPricePen");
          return { lead: lead && lead.textContent.trim(), leadFs: lead ? parseFloat(getComputedStyle(lead).fontSize) : 0,
            ref: ref && ref.textContent.trim(), refFs: ref ? parseFloat(getComputedStyle(ref).fontSize) : 0,
            badge: /-\d+%/.test(c.textContent), anchor: c.getAttribute("data-hero-anchor"), links: c.querySelectorAll("a[href]").length };
        });
        assert(/^S\//.test(card.lead || ""), "lead price is not soles: " + card.lead);
        assert(/US\$/.test(card.ref || "") && card.refFs < card.leadFs, "US$ line: " + JSON.stringify(card));
        /* A hero at full price shows no badge; a hero on a real sale shows
           the store's own was-price, like any sale card (#443 item 39 D). */
        const shelfCard = PICKS.find((p) => p.heroAnchor === card.anchor);
        if (card.anchor && !(shelfCard && shelfCard.onSale && Number(shelfCard.originalPrice) > Number(shelfCard.price))) assert(!card.badge, "a full-price anchor card shows a discount badge");
        assert(card.links === 0, "the card links out");
        return `${card.lead} / ${card.ref}`;
      } finally { await context.close(); }
    });

    await check("the home rail's Ver todo opens the Perfumes department; Aria Beauty > Fragancias opens on the Perfumes rail", async () => {
      const { context, page, requests } = await newPage();
      try {
        await page.goto(BASE + "/", { waitUntil: "load" });
        const href = await page.$eval("#mobileShopfront [data-perfumes-section] a[href]", (a) => a.getAttribute("href"));
        /* #443 item 32: the Perfumes department is the perfume home now;
           Aria Beauty > Fragancias keeps its lead rail. */
        assert(href === "/departamento.html?dept=perfumes", "Ver todo: " + href);
        await page.goto(BASE + "/departamento.html?dept=beauty&pasillo=fragancias", { waitUntil: "load" });
        await page.waitForSelector("#perfumesLead:not([hidden]) #perfumesLeadRail .card", { timeout: 60000 });
        const r = await page.evaluate(() => {
          const lead = document.getElementById("perfumesLead");
          const rails = document.getElementById("rails");
          const firstRail = rails.querySelector(".rail-sec");
          return { cards: lead.querySelectorAll(".card").length, title: lead.querySelector("h2").textContent.trim(),
            kicker: lead.querySelector(".pl-kicker").textContent.trim(),
            before: !firstRail || (lead.compareDocumentPosition(firstRail) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
            hrefs: [...lead.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
            pen: (lead.querySelector(".price .pen") || {}).textContent || "", usd: (lead.querySelector(".price .usd") || {}).textContent || "" };
        });
        assert(r.cards === PICKS.length && r.title === "Perfumes" && r.kicker === "Fragancias", JSON.stringify(r));
        assert(r.before, "the Perfumes rail does not lead the department's rails");
        /* Cards open Aria's product page; the end card opens the Perfumes department. */
        assert(r.hrefs.every((h) => h.startsWith("producto.html?") || h === "departamento.html?dept=perfumes"), "a card links out: " + r.hrefs.join(" "));
        assert(/^S\//.test(r.pen.trim()) && /US\$/.test(r.usd), "price: " + r.pen + " / " + r.usd);
        assert(!requests.some((u) => /-catalog\.json$/.test(u)), "a catalogue was fetched");
        if (SHOTS) {
          await page.goto(BASE + href, { waitUntil: "load" });
          await page.waitForSelector("#perfumesLead:not([hidden]) #perfumesLeadRail .card", { timeout: 60000 });
          await page.waitForTimeout(600);
          await page.screenshot({ path: join(SHOTS, "perfume-fragancias-lead.png") });
        }
        return `${r.cards} cards, ${r.pen.trim()} / ${r.usd.trim()}`;
      } finally { await context.close(); }
    });
    await check("the Perfumes lead rail is Aria Beauty's alone", async () => {
      const { context, page } = await newPage();
      try {
        await page.goto(BASE + "/departamento.html?dept=women", { waitUntil: "load" });
        await page.waitForTimeout(1500);
        assert(await page.$eval("#perfumesLead", (s) => s.hidden), "shown on another department");
      } finally { await context.close(); }
    });
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
