#!/usr/bin/env node
/* ============================================================
   ropa-interior-feed.json — THE DEPARTMENT'S PRODUCTS, PRECOMPUTED.

   WHY. The men's underwear and socks live in twenty catalogue files
   that weigh ~104MB together (SSENSE alone is 36MB). A phone cannot
   download that to show one department, so -- the same move as
   ofertas-feed.json -- the rules in ropa-interior-engine.js run here,
   once, and the page fetches only the products that passed (~0.5MB).

   TWO FEEDS (2026-10-10): ropa-interior-feed.json (men's, classify)
   and ropa-interior-women-feed.json (women's, classifyWomen). A sock
   has one home: the women's feed only with an explicit women's signal.

   REGENERATE after a catalogue refresh (writes both):
     node scripts/build-ropa-interior-feed.mjs
   scripts/test/ropa-interior-tests.mjs fails when the feed has fallen
   behind the catalogues.
   ============================================================ */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export function loadEngine() {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ROOT + "ropa-interior-engine.js", "utf8"), sandbox, { filename: "ropa-interior-engine.js" });
  return sandbox.AriaRopaInterior;
}

/* Every committed catalogue: the rules decide, not a file list that
   would go stale the day a store is added. */
export function catalogueFiles() {
  return readdirSync(ROOT).filter(f => /(?:-catalog|^department-cache-[a-z]+)\.json$/.test(f)).sort();
}

/* A short real description for the card, when the catalogue has one:
   the first sentence, cut at a word boundary. Never invented. */
function shortDescription(it) {
  const d = String(it.description || it.description_en || "").replace(/\s+/g, " ").trim();
  if (!d) return "";
  const first = d.split(/(?<=[.!?])\s/)[0];
  return first.length <= 110 ? first : first.slice(0, 110).replace(/\s+\S*$/, "") + "…";
}

/* One builder, two feeds: the men's rules (classify) and the women's
   mirror (classifyWomen) run over the same catalogues the same way. */
function buildWith(E, classifyFn, opts = {}) {
  const byKey = new Map();
  for (const f of catalogueFiles()) {
    let data;
    try { data = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
    for (const [rk, r] of Object.entries((data && data.retailers) || {})) {
      for (const section of ["departments", "brands"]) {
        for (const [bk, bucket] of Object.entries((r && r[section]) || {})) {
          const arr = Array.isArray(bucket) ? bucket : (bucket && bucket.items) || [];
          const dept = section === "departments" ? bk : "";
          for (const it of arr) {
            const c = classifyFn(it, rk, dept);
            if (!c) continue;
            const title = String(it.title || it.name);
            const price = Number(it.price);
            if (!(price > 0)) continue;
            const img = it.thumbnail || it.image || (Array.isArray(it.images) && it.images[0]) || "";
            const row = {
              t: title, b: String(it.brand || ""), r: rk, p: price,
              o: E.originalOf(it) || 0, img: String(img), u: String(it.url || it.link || ""),
              ty: c.type, sub: c.sub,
              rt: Number(it.rating) || 0, rc: Number(it.reviewCount) || 0,
            };
            const d = shortDescription(it);
            if (d) row.d = d;
            /* Men's feed: a sock's gender note. 'u' (nothing says men's)
               is the unisex sock the women's section may surface from
               this feed -- it is never listed in the women's feed. */
            if (opts.sockGender && c.type === "socks") row.g = E.sockGender(it, rk, dept);
            /* The image-quality verdict rides along: a photo that was not
               cleared of its US price sticker is never shown, on the
               department page or on the homepage rail. */
            if (it.imageReview) row.ir = String(it.imageReview);
            /* The retailer's own sale report rides along too: the site
               never shows a markdown the retailer did not report
               (normalizeLiveItem's rule), so the homepage rail needs it. */
            if (row.o > 0 && (it.onSale === true || it.isOnSale === true
                || Number(it.savingsAmount) > 0 || Number(it.savingsPercent) > 0
                || Number(it.percentageOff) > 0 || Number(it.percentOff) > 0
                || Number(it.compareAt) > price)) row.s = 1;
            /* One product, one card: keep the copy with a markdown and a
               picture when the same brand+title appears twice. */
            const key = (row.b + "|" + title).toLowerCase();
            const had = byKey.get(key);
            const better = !had || (row.o > 0 && !had.o) || (!had.img && row.img);
            if (better) byKey.set(key, row);
          }
        }
      }
    }
  }
  const items = [...byKey.values()].sort((a, b) => (a.r + a.t).localeCompare(b.r + b.t));
  return { generatedAt: null, count: items.length, items };
}

export function buildFeed() {
  const E = loadEngine();
  return buildWith(E, E.classify, { sockGender: true });
}

/* ONE HOME PER ITEM. A product a store files under both its men's and
   its women's departments (SSENSE's gender-neutral socks) is unisex, and
   unisex lives in the men's feed: the women's feed never lists what the
   men's feed already has. */
export function buildWomenFeed() {
  const E = loadEngine();
  const men = buildWith(E, E.classify, { sockGender: true }).items;
  const key = (i) => (i.b + "|" + i.t).toLowerCase();
  const menKeys = new Set(men.map(key));
  const menUrls = new Set(men.filter(i => i.u).map(i => i.u));
  const women = buildWith(E, E.classifyWomen);
  women.items = women.items.filter(i => !menKeys.has(key(i)) && !(i.u && menUrls.has(i.u)));
  women.count = women.items.length;
  return women;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stamp = new Date().toISOString();
  for (const [file, feed] of [["ropa-interior-feed.json", buildFeed()], ["ropa-interior-women-feed.json", buildWomenFeed()]]) {
    feed.generatedAt = stamp;
    writeFileSync(ROOT + file, JSON.stringify(feed));
    const kb = Math.round(JSON.stringify(feed).length / 1024);
    const under = feed.items.filter(i => i.ty === "underwear").length;
    const sale = feed.items.filter(i => i.o > i.p).length;
    console.log(`${file}: ${feed.count} products (${under} underwear, ${feed.count - under} socks, ${sale} on sale), ${kb}KB`);
  }
}
