#!/usr/bin/env node
/* ============================================================
   ropa-interior-feed.json — THE DEPARTMENT'S PRODUCTS, PRECOMPUTED.

   WHY. The men's underwear and socks live in twenty catalogue files
   that weigh ~104MB together (SSENSE alone is 36MB). A phone cannot
   download that to show one department, so -- the same move as
   ofertas-feed.json -- the rules in ropa-interior-engine.js run here,
   once, and the page fetches only the products that passed (~0.5MB).

   REGENERATE after a catalogue refresh:
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

export function buildFeed() {
  const E = loadEngine();
  const byKey = new Map();
  for (const f of catalogueFiles()) {
    let data;
    try { data = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
    for (const [rk, r] of Object.entries((data && data.retailers) || {})) {
      for (const section of ["departments", "brands"]) {
        for (const [bk, bucket] of Object.entries((r && r[section]) || {})) {
          const arr = Array.isArray(bucket) ? bucket : (bucket && bucket.items) || [];
          for (const it of arr) {
            const c = E.classify(it, rk, section === "departments" ? bk : "");
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const feed = buildFeed();
  feed.generatedAt = new Date().toISOString();
  writeFileSync(ROOT + "ropa-interior-feed.json", JSON.stringify(feed));
  const kb = Math.round(JSON.stringify(feed).length / 1024);
  const under = feed.items.filter(i => i.ty === "underwear").length;
  console.log(`ropa-interior-feed.json: ${feed.count} products (${under} underwear, ${feed.count - under} socks), ${kb}KB`);
}
