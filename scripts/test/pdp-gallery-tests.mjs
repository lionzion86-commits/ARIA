/* ==================================================================
   THE PRODUCT PAGE SHOWS EVERY PHOTO AGAIN (#434, #440).

   Since #409 T1 (PR #425) producto.html reads one product from a shard
   of assets/pdp/p/, and the shard record kept only the card photo: every
   product page showed one photo (68/68 in the Diseñadores audit, 52/52
   in the PDP audit) although the catalogues carry the store's gallery
   (Agua Bendita 6 a product, New Balance up to 10, Gymshark 5-8). The
   same build also dropped the #411 size provenance (sizesTier /
   sizesSource: 0/68 records carried it).

   These checks hold the gallery in place:
   - every catalogue item's shard record unpacks to the gallery the
     page's own normalizeItem makes of it (real http photos, one copy
     each, card photo first, at most 12) and carries its sizesTier /
     sizesSource;
   - in a real browser (headless Chromium, 390px phone): an Agua Bendita
     product with 6 photos shows 6 gallery slots, a New Balance shoe its
     full set, a Gymshark product 4+; swiping and tapping thumbnails
     reach every slot; only the first photo loads with the page; the
     photo box is square before and after the photos; nothing in the
     gallery links anywhere; no emoji.

   Retailer photo CDNs are unreachable from the sandbox, so the browser
   run answers every off-site photo with a local stand-in (/__photo.jpg)
   and counts slots and loaded photos, not pixels.

   RUNNING IT
     node scripts/test/pdp-gallery-tests.mjs
   PLAYWRIGHT_CHROMIUM=<path> picks the Chromium binary (default
   /opt/pw-browsers/chromium when present). SKIP_BROWSER=1 runs the data
   checks only.
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, extname } from "node:path";
import { liftDeclarations } from "../lib/page-lift.mjs";
import { liftPage, sourceFiles } from "../build-pdp-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PDP = ROOT + "assets/pdp/";
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const page = readFileSync(ROOT + "producto.html", "utf8").replace(/\r\n/g, "\n");
const P = liftPage(ROOT);
const R = liftDeclarations(page, ["unpackImages", "recordToItem"]);
const shardCache = new Map();
const shard = (s) => {
  if (!shardCache.has(s)) shardCache.set(s, JSON.parse(readFileSync(PDP + "p/" + s + ".json", "utf8")));
  return shardCache.get(s);
};
const lookup = (key) => shard(P.pdpShard(key))[key] || null;
const hostPath = (u) => { const m = String(u).match(/^https?:\/\/([^\/?#\s]+)([^?#\s]*)/i); return m ? m[1].toLowerCase() + m[2] : null; };
const galleryOf = (it) => (it.images && it.images.length ? it.images : it.image ? [it.image] : []);

/* Every catalogue item, as the page's normalizeItem makes it. */
const all = [];
for (const f of sourceFiles(P)) {
  const p = ROOT + f.slice(1);
  if (!existsSync(p)) continue;
  for (const it of P.extractItems(JSON.parse(readFileSync(p, "utf8")))) all.push({ f, it });
}

await check("normalizeItem's gallery: real http photos, one copy each, card photo first, at most 12", () => {
  const n = P.normalizeItem({ title: "T", price: 10, image: "https://x.com/a.jpg?v=1",
    images: ["https://x.com/a.jpg?v=2", "//x.com/b.jpg", "data:image/png;base64,AAA", "/rel.jpg", "https://x.com/placeholder.png", "https://x.com/b.jpg?w=10",
      { src: "https://x.com/c.jpg" }, ...Array.from({ length: 20 }, (_, i) => "https://x.com/p" + i + ".jpg")] }, "s");
  assert.deepEqual(JSON.parse(JSON.stringify(n.images.slice(0, 3))), ["https://x.com/a.jpg?v=1", "https://x.com/b.jpg", "https://x.com/c.jpg"]);
  assert.equal(n.images.length, 12);
  assert.equal(P.normalizeItem({ title: "T", price: 1, image: "https://x.com/a.jpg" }, "s").images.length, 1);
  assert.equal(P.normalizeItem({ title: "T", price: 1, sizesTier: "scrape", sizesSource: "https://s/p" }, "s").sizesTier, "scrape");
});

await check("every catalogue item's shard record carries its whole gallery and its size provenance", () => {
  let multi = 0, tiered = 0, photos = 0;
  const misses = [];
  for (const { f, it } of all) {
    const cands = lookup(P.norm(it.name)) || [];
    const want = galleryOf(it);
    const hit = cands.some((r) => {
      const got = R.recordToItem(r);
      return r.name === it.name && Number(r.price) === it.price && (r.image || "") === it.image
        && JSON.stringify(got.images) === JSON.stringify(want)
        && got.sizesTier === (it.sizesTier || "") && got.sizesSource === (it.sizesSource || "");
    });
    if (!hit) misses.push(`${f}: ${it.name}`);
    if (want.length > 1) multi++;
    if (it.sizesTier) tiered++;
    photos += want.length;
  }
  assert.deepEqual(misses.slice(0, 8), [], `${misses.length} of ${all.length} items lost photos or provenance in their shard (rebuild: node scripts/build-pdp-slices.mjs)`);
  assert.ok(multi > 100000, `only ${multi} records with a gallery`);
  assert.ok(tiered > 40000, `only ${tiered} records with size provenance`);
  console.log(`         (${all.length} items: ${multi} with 2+ photos, ${photos} photos, ${tiered} with sizesTier/sizesSource)`);
});

await check("every stored gallery unpacks to real, distinct photos, card photo first", () => {
  let recs = 0;
  for (let i = 0; i < 4096; i++) {
    const s = ("00" + i.toString(16)).slice(-3);
    for (const cands of Object.values(shard(s))) for (const r of cands) {
      recs++;
      if (!r.images) continue;
      const g = R.unpackImages(r.images, r.image);
      assert.ok(g.length >= 1 && g.length <= 12, `${r.name}: ${g.length} photos`);
      assert.ok(g.every((u) => /^https?:\/\//.test(u)), `${r.name}: a non-http photo`);
      assert.equal(new Set(g.map(hostPath)).size, g.length, `${r.name}: the same photo twice`);
      if (/^https?:\/\//.test(r.image || "")) assert.equal(g[0], r.image, `${r.name}: the gallery does not open on the card photo`);
    }
    shardCache.delete(s);
  }
  assert.ok(recs > 140000);
});

await check("size provenance is data, never a link (the page never links out)", () => {
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /href[^;\n]{0,80}sizesSource/);
  const gal = code.slice(code.indexOf("function galleryHTML("), code.indexOf("function galleryPhotoFailed("));
  assert.ok(gal.length > 200, "galleryHTML moved -- update this test");
  assert.doesNotMatch(gal, /<a[\s>]|href=/, "the gallery links somewhere");
  assert.doesNotMatch(gal, /\p{Extended_Pictographic}/u, "an emoji in the gallery");
});

/* ---------- the browser ---------- */
function pick(store, test) {
  const keyCount = new Map();
  for (const { it } of all) { const k = P.norm(it.name); keyCount.set(k, (keyCount.get(k) || 0) + 1); }
  const own = all.filter(({ it }) => it.retailer === store && keyCount.get(P.norm(it.name)) === 1);
  const hit = own.find(({ it }) => test(it));
  return hit && hit.it;
}
/* The New Balance shoe with the most photos among titles only one record carries. */
const nbMax = Math.max(...all.filter(({ it }) => it.retailer === "newbalance" && it.sizes.length && !lookup(P.norm(it.name))[1]).map(({ it }) => it.images.length));
const PRODUCTS = [
  { label: "Agua Bendita, 6 photos", store: "aguabendita", it: pick("aguabendita", (it) => it.images.length === 6), min: 6 },
  { label: "New Balance shoe, full set", store: "newbalance", it: pick("newbalance", (it) => it.images.length === nbMax && it.sizes.length), min: 8 },
  { label: "Gymshark, 4+ photos", store: "gymshark", it: pick("gymshark", (it) => it.images.length >= 6), min: 4 },
];

const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
let chromium = null;
if (!process.env.SKIP_BROWSER) {
  try { ({ chromium } = await import("playwright")); }
  catch (e) { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch (e2) {} }
}

if (chromium) {
  /* A gzip static server over the repo, like the CDN; the rate function
     answers 3.75; every off-site photo gets the stand-in. */
  const PHOTO = readFileSync(ROOT + "assets/category/sunglasses.jpg");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const send = (code, type, body) => {
      let b = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const h = { "Content-Type": type };
      if (/gzip/.test(req.headers["accept-encoding"] || "") && /json|html|javascript|css|svg/.test(type)) { b = gzipSync(b); h["Content-Encoding"] = "gzip"; }
      res.writeHead(code, h); res.end(b);
    };
    if (u.pathname === "/__photo.jpg") return send(200, "image/jpeg", PHOTO);
    if (u.pathname === "/.netlify/functions/exchange-rate") return send(200, "application/json", JSON.stringify({ venta: 3.75 }));
    if (u.pathname.startsWith("/.netlify/")) return send(404, "application/json", "{}");
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) return send(404, "text/plain", "nf");
    send(200, TYPES[extname(p)] || "application/octet-stream", readFileSync(p));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const results = [];

  for (const prod of PRODUCTS) {
    await check(`${prod.label}: every photo has its slot, and swiping reaches each one`, async () => {
      assert.ok(prod.it, `no ${prod.store} product fits -- the catalogue changed`);
      const want = prod.it.images.length;
      assert.ok(want >= prod.min, `${prod.it.name} has ${want} photos`);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      let offsite = 0, links = 0;
      await pg.route((url) => url.host !== new URL(BASE).host, (r) => {
        if (r.request().resourceType() === "image") { offsite++; return r.fulfill({ status: 302, headers: { location: BASE + "/__photo.jpg" } }); }
        return r.abort();
      });
      await pg.goto(`${BASE}/producto.html?producto=${encodeURIComponent(prod.it.name)}&tienda=${prod.store}`);
      await pg.waitForSelector(".p-gallery .g-slide img[src]", { timeout: 30000 });
      const first = await pg.evaluate(() => {
        const box = document.querySelector(".p-gallery .p-photo").getBoundingClientRect();
        return {
          slides: document.querySelectorAll(".g-slide").length, thumbs: document.querySelectorAll(".g-thumb").length,
          count: document.querySelector(".g-count").textContent, w: box.width, h: box.height,
          withSrc: document.querySelectorAll(".g-slide img[src]").length,
          links: document.querySelectorAll(".p-gallery a").length,
          title: document.querySelector("h1") && document.querySelector("h1").textContent,
        };
      });
      assert.equal(first.title, prod.it.name);
      assert.equal(first.slides, want, `${first.slides} gallery slots for ${want} photos`);
      assert.equal(first.thumbs, want, `${first.thumbs} thumbnails for ${want} photos`);
      assert.equal(first.count, `1 / ${want}`);
      assert.ok(Math.abs(first.w - first.h) <= 1 && first.h > 300, `photo box ${first.w}x${first.h} is not a square`);
      assert.ok(first.withSrc <= 2, `${first.withSrc} slide photos requested with the page (the rest wait for the swipe)`);
      assert.equal(first.links, 0);
      links = first.links;
      /* Swipe to each photo in turn. */
      for (let i = 1; i < want; i++) {
        await pg.evaluate((i) => { const t = document.querySelector(".g-track"); t.scrollTo({ left: i * t.clientWidth }); }, i);
        await pg.waitForFunction((i) => {
          const img = document.querySelectorAll(".g-slide img")[i];
          return img && img.complete && img.naturalWidth > 0;
        }, i, { timeout: 15000 });
      }
      await pg.waitForFunction((n) => document.querySelector(".g-count").textContent === `${n} / ${n}`, want, { timeout: 5000 });
      /* A thumbnail takes you back to the first photo. */
      await pg.click(".g-thumb[data-i='0']");
      await pg.waitForFunction((n) => document.querySelector(".g-count").textContent === `1 / ${n}`, want, { timeout: 5000 });
      const after = await pg.evaluate(() => {
        const box = document.querySelector(".p-gallery .p-photo").getBoundingClientRect();
        return {
          loaded: [...document.querySelectorAll(".g-slide img")].filter((i) => i.complete && i.naturalWidth > 0).length,
          w: box.width, h: box.height, pageW: document.documentElement.scrollWidth,
          current: document.querySelector('.g-thumb[aria-current="true"]').getAttribute("data-i"),
        };
      });
      assert.equal(after.loaded, want, `${after.loaded} of ${want} slots loaded a photo`);
      assert.ok(Math.abs(after.w - first.w) <= 1 && Math.abs(after.h - first.h) <= 1, "the photo box changed size");
      assert.ok(after.pageW <= 390, `the page scrolls sideways (${after.pageW}px)`);
      assert.equal(after.current, "0");
      results.push({ product: prod.it.name, store: prod.store, photos: want, slots: first.slides, loaded: after.loaded, offsite, links });
      await ctx.close();
    });
  }
  await browser.close();
  server.close();
  console.table(results);
} else {
  console.log("    skip the browser checks (no playwright / SKIP_BROWSER)");
}

if (failures.length) console.log("\n  FAILED:\n  " + failures.join("\n  "));
console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
