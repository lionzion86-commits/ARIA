#!/usr/bin/env node
/* ==================================================================
   THE PRODUCT LEADS, ITS ACCESSORIES FOLLOW (#443 c.6619999990,
   c.6620006778 -- Danny's live repro: «iPhone» opened on Zagg cases,
   VR headsets and generic smartwatches "for iPhone & Android", with
   Apple Bottoms jeans on the Apple page, and not one iPhone in front).

   The guard, the same protection the drone spellings have:
     - every form of «iphone» («iPhone», «IPHONE», «i phone», «iphones»,
       «iphone15», «iphone 15», «iphone 16 pro», «celular iphone»,
       «teléfono iphone», «apple iphone») lands on the Apple page focused
       on the iPhone (marca.html?marca=apple&q=iPhone...);
     - that page's answer leads with the phones themselves (Apple's,
       named as the phone), then the accessory carousels, then one rail
       per store of Apple's real inventory -- and nothing else: no
       accessory or other maker's product above the phones, no jeans, no
       store rail item that is not Apple's;
     - the Apple page carries no namesake's products (Apple Bottoms);
     - every other core product word (celular, laptop, drone, consola,
       audífonos, cámara, tablet, smartwatch, parlante, iPad, MacBook,
       AirPods) lands on a page whose first cards are the product, not
       what fits it.

     node scripts/test/core-product-lead-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/core-product-lead-tests.mjs   (also saves the 390px screenshot)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const search = await import("../../netlify/functions/search.js");
const core = await import("../../netlify/functions/_search-core.js");
const dst = await import("../../netlify/functions/_search-destinations.js");
const dept = await import("../../netlify/functions/_department-core.js");
const brand = await import("../../netlify/functions/_brand-core.js");
const { isAccessoryName } = await import("../lib/tech-aisle.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
async function call(qs) {
  const r = await search.handler({ httpMethod: "GET", queryStringParameters: qs }, { fetchImpl });
  assert.equal(r.statusCode, 200, JSON.stringify(qs));
  return JSON.parse(r.body);
}
const route = (q) => call({ q, route: "1" });
const param = (url, k) => new URLSearchParams(url.split("?")[1] || "").get(k);

/* What an iPhone is, and what Apple's is. */
const IPHONE_RX = /\biphone\s*(\d{1,2}e?|se|xr|xs|x|air)\b/i;
const isApple = (c) => /^(apple|iphone)$/i.test(String(c.brand || "").trim());
const isPhone = (c) => isApple(c) && IPHONE_RX.test(c.title) && !isAccessoryName(c.title) && !/\b(cases?|covers?|protectors?|chargers?)\b/i.test(c.title.split(/\s+(?:with|for)\s+/i)[0]);
const APPLE_RELATED = /\b(iphone|magsafe|lightning|apple)\b/i;
const FASHION_RX = /\b(jeans|denim|hoodie|pants|leggings|dress|skirt|shirt|bottoms)\b/i;

const IPHONE_FORMS = ["iphone", "iPhone", "IPHONE", "Iphone", "iphones", "iPhones", "i phone", "I Phone", "i-phone", "celular iphone", "celulares iphone",
  "teléfono iphone", "telefono iphone", "smartphone iphone", "apple iphone", "Apple iPhone", "iphone celular", "un iphone", "iphone nuevo"];
const IPHONE_MODELS = [["iphone 15", "iPhone 15"], ["iPhone 15", "iPhone 15"], ["iphone15", "iPhone 15"], ["IPHONE 15", "iPhone 15"],
  ["iphone 16 pro", "iPhone 16 pro"], ["iPhone 16 Pro", "iPhone 16 pro"], ["iphone 17 pro max", "iPhone 17 pro max"], ["celular iphone 17", "iPhone 17"],
  ["iphone air", "iPhone air"]];

await check(`every form of «iphone» (${IPHONE_FORMS.length}) lands on the Apple page focused on the iPhone -- one url, one set of chips`, async () => {
  const want = await route("iphone");
  assert.equal(want.destination.kind, "brand");
  assert.equal(want.destination.key, "apple");
  assert.equal(param(want.destination.url, "q"), "iPhone");
  assert.match(want.destination.url, dst.SURFACE_RX);
  const bad = [];
  for (const q of IPHONE_FORMS) {
    const a = await route(q);
    if (a.destination.url !== want.destination.url || a.destination.href !== want.destination.href) bad.push(`${q}: ${a.destination.url}`);
  }
  assert.deepEqual(bad, []);
});

await check(`a model typed with it («iphone 15», «iphone16 pro», «celular iphone 17») keeps the model on the Apple page`, async () => {
  const bad = [];
  for (const [q, model] of IPHONE_MODELS) {
    const d = (await route(q)).destination;
    if (d.kind !== "brand" || d.key !== "apple" || param(d.url, "q") !== model) bad.push(`${q}: ${d.url} (want q=${model})`);
  }
  assert.deepEqual(bad, []);
});

await check("asking for the accessory is not the phone: «funda iphone», «iphone 15 case», «cargador iphone» never land on the iPhone focus", async () => {
  for (const q of ["funda iphone", "iphone 15 case", "cargador iphone", "case iphone"]) {
    const d = (await route(q)).destination;
    assert.ok(!(d.kind === "brand" && /^iphone/i.test(param(d.url, "q") || "")), `${q}: ${d.url}`);
  }
});

/* The answer the Apple page's focus block draws (marca-focus.js:
   /search?q=<label> <model>). */
async function focusOf(q) {
  const d = (await route(q)).destination;
  const mq = param(d.url, "q");
  const label = "Apple";
  const S = new RegExp("^" + label + "\\b", "i").test(mq) ? mq : label + " " + mq;
  return call({ q: S, page: "1" });
}
const FOCUS = new Map();
for (const q of ["iphone", "iPhone 16 Pro", "i phone", "celular iphone", "iphone 15"]) FOCUS.set(q, await focusOf(q));

await check("«iphone»: the phones lead -- the first lane is the iPhone, every card in it an Apple iPhone (no case, no charger, no other maker)", () => {
  for (const [q, a] of FOCUS) {
    const lanes = a.lanes || [];
    assert.ok(lanes.length >= 3, `${q}: ${lanes.length} lanes`);
    const first = lanes[0];
    assert.equal(first.key, "producto:iphone", `${q}: the page leads with ${first.key} «${first.title}»`);
    assert.equal(first.title, "iPhone");
    assert.ok(first.items.length >= 4, `${q}: ${first.items.length} phones`);
    for (const c of first.items) assert.ok(isPhone(c), `${q}: «${c.title}» (${c.brand}) in the iPhone lane`);
    /* The charts, when the models group, compare phones. */
    for (const ch of a.compares || []) for (const s of ch.stores) assert.ok(IPHONE_RX.test(s.title) && !isAccessoryName(s.title), `${q}: chart row «${s.title}»`);
  }
});

await check("«iphone»: the first 10 cards of the page are iPhones -- every phone the catalogue sells is ahead of any accessory", () => {
  for (const [q, a] of FOCUS) {
    const cards = [...(a.compares || []).map((c) => ({ title: c.title, brand: c.brand })), ...(a.lanes || []).flatMap((l) => l.items)];
    const phones = a.lanes[0].n;
    const lead = cards.slice(0, Math.min(10, phones));
    for (const c of lead) assert.ok(isPhone(c), `${q}: lead card «${c.title}»`);
  }
});

await check("«iphone»: the accessory carousels come after the phones and before the store rails; every one fits an iPhone and is no universal gadget", () => {
  for (const [q, a] of FOCUS) {
    const kinds = a.lanes.map((l) => l.key.split(":")[0]);
    const order = kinds.map((k) => (k === "producto" ? 0 : k === "accesorios" ? 1 : k === "tienda" ? 2 : 9));
    assert.deepEqual(order, order.slice().sort((x, y) => x - y), `${q}: lane order ${kinds.join(",")}`);
    assert.ok(!order.includes(9), `${q}: an unexpected lane ${kinds.join(",")}`);
    const acc = a.lanes.filter((l) => l.key.startsWith("accesorios:"));
    assert.ok(acc.length >= 2, `${q}: ${acc.length} accessory carousels`);
    for (const l of acc) {
      assert.match(l.title, /para iPhone$/);
      for (const c of l.items) {
        assert.match(c.title, /\b(iphone|magsafe|lightning)\b/i, `${q}: «${c.title}» in ${l.title}`);
        assert.doesNotMatch(c.title, /\b(android|samsung|galaxy|vr|smart ?watch|headset|earbuds|speaker)\b/i, `${q}: «${c.title}» in ${l.title}`);
      }
    }
  }
});

await check("«iphone»: one rail per store, Apple's real inventory only -- every card Apple's, no jeans, nothing unrelated anywhere on the answer", () => {
  for (const [q, a] of FOCUS) {
    const stores = a.lanes.filter((l) => l.key.startsWith("tienda:"));
    assert.ok(stores.length >= 3, `${q}: ${stores.length} store rails`);
    for (const l of stores) {
      for (const c of l.items) {
        assert.ok(isApple(c), `${q}: «${c.title}» (${c.brand}) in ${l.title}`);
        assert.equal(c.store, l.store, `${q}: «${c.title}» in ${l.title}`);
      }
    }
    for (const l of a.lanes) for (const c of l.items) {
      assert.doesNotMatch(c.title, FASHION_RX, `${q}: «${c.title}» in ${l.title}`);
      assert.ok(isApple(c) || APPLE_RELATED.test(c.title), `${q}: «${c.title}» (${c.brand}) is not Apple-related`);
    }
    for (const c of a.items || []) assert.ok(isApple(c) || APPLE_RELATED.test(c.title), `${q}: grid «${c.title}» is not Apple-related`);
    /* «Ver más» on a lane pages the same lane. */
    const more = a.lanes.find((l) => l.n > l.items.length);
    if (more) {
      const S = new RegExp("^Apple\\b", "i").test(q) ? q : "Apple " + q;
      return call({ q: S, lane: more.key, off: String(more.items.length) }).then((p) => { for (const c of p.items) assert.ok(isApple(c) || APPLE_RELATED.test(c.title), c.title); });
    }
  }
});

await check("«iphone» on the search endpoint itself (search.html?resultados=1) is the same world: phones first, nothing unrelated", async () => {
  const a = await call({ q: "iphone", page: "1" });
  assert.equal(a.lanes[0].key, "producto:iphone");
  assert.ok(a.items.length > 0);
  for (const c of a.items) assert.ok(isApple(c) || APPLE_RELATED.test(c.title), `«${c.title}» (${c.brand})`);
  const firstGrid = a.items.slice(0, Math.max(0, a.lanes[0].n - (a.compares || []).reduce((n, c) => n + c.stores.length, 0)));
  for (const c of firstGrid) assert.ok(isPhone(c), `grid lead «${c.title}»`);
});

await check("the Apple page carries Apple's products only: no Apple Bottoms jeans in any rail (the store file's brand field said «Apple»)", () => {
  const head = brand.answer({ marca: "apple" }).body;
  assert.ok(head.rails.length >= 3);
  for (const r of head.rails) {
    for (const c of r.cards) assert.doesNotMatch(c.t, /apple bottoms|\bjeans\b|hoodie/i, `${r.title}: «${c.t}»`);
    assert.doesNotMatch(r.title, /zumiez/i, `a ${r.title} rail on the Apple page`);
  }
  const ab = brand.answer({ marca: "applebottoms" }).body;
  assert.ok(ab.count >= 1 && ab.rails.every((r) => r.cards.every((c) => /apple bottoms/i.test(c.t))), "Apple Bottoms has its own page");
});

/* ---------- the general class: a core product word leads with the product ---------- */
/* The first cards of the landing as the shopper sees them. */
async function leadCards(q, n = 8) {
  const a = await route(q), d = a.destination;
  if (d.kind === "category") {
    const qs = Object.fromEntries(new URLSearchParams(d.url.split("?")[1]).entries());
    const out = dept.answer(qs).body;
    return { d, cards: (out.rails || []).flatMap((r) => r.cards || []).slice(0, n).map((c) => ({ title: c.t, brand: c.b })) };
  }
  if (d.kind === "brand") {
    const mq = param(d.url, "q");
    const head = brand.answer({ marca: d.key }).body;
    const cards = [];
    if (mq) {
      const S = new RegExp("^" + head.label + "\\b", "i").test(mq) ? mq : head.label + " " + mq;
      const f = await call({ q: S, page: "1" });
      for (const c of f.compares || []) cards.push({ title: c.title, brand: c.brand });
      for (const l of f.lanes || []) cards.push(...l.items);
    }
    for (const r of head.rails) cards.push(...r.cards.map((c) => ({ title: c.t, brand: c.b })));
    return { d, cards: cards.slice(0, n) };
  }
  return { d, cards: [] };
}
const NOUN = /\b(tablets?|laptops?|notebooks?|smart ?watch(es)?|watch|speakers?|drones?|cameras?|headphones?|earbuds?|iphone|ipad|macbook|airpods|phones?|smartphones?|consoles?)\b/i;
const CORE = [
  ["celular", /departamento\.html\?dept=electronics&ver=pasillo%3Atech_celulares/], ["laptop", /pasillo%3Atech_computadoras/],
  ["drone", /pasillo%3Atech_drones/], ["consola", /ver=consolas/], ["playstation", /ver=consolas/], ["audífonos", /pasillo%3Atech_audifonos/],
  ["cámara", /pasillo%3Atech_camaras/], ["tablet", /q=tablet&ver=pasillo%3Atech_computadoras/], ["tablets", /q=tablet&ver=pasillo%3Atech_computadoras/],
  ["smartwatch", /pasillo%3Atech_relojes/], ["reloj inteligente", /pasillo%3Atech_relojes/], ["parlante", /pasillo%3Atech_audio/], ["bocina", /pasillo%3Atech_audio/],
  ["ipad", /marca=apple&q=iPad/], ["ipad pro", /marca=apple&q=iPad%20pro/], ["macbook", /marca=apple&q=MacBook/], ["airpods", /marca=apple&q=AirPods/],
  ["iphone", /marca=apple&q=iPhone/],
];
await check(`every core product word (${CORE.length}) lands on its product -- never the department home -- and its first 8 cards are the product, not what fits it`, async () => {
  const bad = [];
  for (const [q, rx] of CORE) {
    const { d, cards } = await leadCards(q);
    if (!rx.test(d.url)) { bad.push(`${q}: lands on ${d.url}`); continue; }
    if (cards.length < 4) { bad.push(`${q}: ${cards.length} cards`); continue; }
    /* An accessory by its name -- unless the title opens on the product
       itself ("Android 16 Tablet ..., 6000mAh Battery" is the tablet). */
    const named = (c) => NOUN.test(String(c.title).split(/\s+/).slice(0, 7).join(" "));
    const acc = cards.filter((c) => !named(c) && (isAccessoryName(c.title) || /\b(cases?|chargers?|power banks?|screen protectors?)\b/i.test(String(c.title).split(/\s+(?:with|for|compatible)\s+/i)[0])));
    if (acc.length) bad.push(`${q}: led by ${acc.map((c) => "«" + c.title.slice(0, 50) + "»").join(", ")}`);
  }
  assert.deepEqual(bad, []);
});

/* ------------------------- in the browser ------------------------- */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available for the page checks", () => assert.ok(pw, "playwright is not installed"));
if (pw) {
  const { createServer } = await import("node:http");
  const handlers = {
    search: search.handler,
    brand: (await import("../../netlify/functions/brand.js")).handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
  };
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404); return res.end("{}"); }
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) }, { fetchImpl });
      res.writeHead(r.statusCode, r.headers || {});
      return res.end(r.body || "");
    }
    const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!f.startsWith(ROOT) || !existsSync(f) || f.endsWith("/")) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const SHOT = process.env.SHOT_DIR || "";
  try {
    for (const word of ["iphone", "iPhone"]) {
      await check(`browser 390px: «${word}» typed in the header search lands on the Apple page -- the iPhone carousel first, its accessories after, Apple's store rails, no jeans, no grid`, async () => {
        const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
        const page = await c.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`${BASE}/departamento.html?dept=toys`, { waitUntil: "load" });
        await page.tap(".hs-pill");
        await page.fill(".hs-in", word);
        await page.press(".hs-in", "Enter");
        await page.waitForURL(/marca\.html\?marca=apple&q=iPhone/, { timeout: 60000 });
        await page.waitForSelector("#brandFocus .fc-lane .card", { timeout: 60000 });
        const lanes = await page.$$eval("#brandFocus .fc-lane", (ls) => ls.map((l) => ({
          h: l.querySelector("h2").textContent.trim(),
          cards: [...l.querySelectorAll(".card")].map((x) => ({ b: (x.querySelector(".brand") || {}).textContent || "", t: (x.querySelector(".name") || {}).textContent || "" })),
        })));
        assert.equal(lanes[0].h, "iPhone", "the page leads with " + lanes[0].h);
        for (const x of lanes[0].cards) assert.match(x.t, IPHONE_RX, x.t);
        const accAt = lanes.findIndex((l) => /para iPhone$/.test(l.h));
        assert.ok(accAt > 0, "no accessory carousel after the phones");
        const body = await page.textContent("body");
        assert.doesNotMatch(body, /Apple Bottoms|\bJeans\b/i, "jeans on the page");
        assert.equal(await page.$$eval(".re-grid, #typeLead, #tlGrid, .grid", (x) => x.length), 0, "a grid on the page");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow");
        if (SHOT && word === "iphone") { await page.waitForTimeout(800); await page.screenshot({ path: join(SHOT, "iphone-after.png") }); }
        assert.deepEqual(errors, []);
        await c.close();
      });
    }
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log("  FAIL " + f + "\n");
process.exit(failures.length ? 1 : 0);
