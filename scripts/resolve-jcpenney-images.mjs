#!/usr/bin/env node
/* ============================================================
   JCPENNEY PHOTOS FROM JCPENNEY'S OWN PAGES (#443 c.6470386941 item 1).

   Reads the pull, visits each product's page once, and keeps the Scene7
   URL the page itself uses for every asset ID the pull names
   (scripts/lib/jcpenney.mjs scene7UrlsIn). Nothing is constructed: an
   ID whose URL is not in its page stays unresolved, and its product
   stays dark (no image, no card). No spend: plain page fetches.

     node scripts/resolve-jcpenney-images.mjs --pull <jcpenney.json> --out jcpenney-images.json
        [--concurrency 3] [--delay 400] [--limit N] [--verify]
     node scripts/resolve-jcpenney-images.mjs --pull <jcpenney.json> --out map.json --html-dir <dir>
        (offline: <dir>/<product id>.html saved pages; how the tests run it)

   Resumable: a product already in --out is not fetched again. --verify
   asks each captured main photo for its headers and drops one that does
   not answer as an image. Then:

     node scripts/build-jcpenney-catalog.mjs --pull <jcpenney.json> --images jcpenney-images.json
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assetIdsOf, scene7UrlsIn, pdpUrlOf } from "./lib/jcpenney.mjs";

export async function resolveProducts(rows, { fetchPage, done = {}, concurrency = 3, delayMs = 0, limit = Infinity, log = () => {} }) {
  const byId = new Map();
  for (const r of rows || []) if (r && r.id) (byId.get(r.id) || byId.set(r.id, []).get(r.id)).push(r);
  const todo = [...byId.keys()].filter((id) => !done[id]).slice(0, limit);
  const out = { ...done };
  let i = 0, n = 0;
  async function worker() {
    while (i < todo.length) {
      const id = todo[i++];
      const group = byId.get(id);
      const wanted = new Set(group.flatMap(assetIdsOf));
      let html = null;
      try { html = await fetchPage(pdpUrlOf(group[0]), id); } catch (e) { html = null; }
      const found = html ? scene7UrlsIn(html, wanted) : new Map();
      out[id] = { status: html == null ? "unreachable" : found.size ? "ok" : "no-photos-in-page", images: Object.fromEntries(found) };
      if (++n % 100 === 0) log(`${n}/${todo.length}`);
      if (delayMs) await new Promise((d) => setTimeout(d, delayMs));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return out;
}

/** The flat asset ID -> URL map the catalogue builder reads. */
export function imageMapOf(resolved) {
  const map = {};
  for (const p of Object.values(resolved || {})) for (const [id, url] of Object.entries(p.images || {})) map[id] = url;
  return map;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const has = (k) => process.argv.includes(k);
  const pull = arg("--pull"), outFile = arg("--out"), htmlDir = arg("--html-dir");
  if (!pull || !outFile) { console.error("usage: --pull <jcpenney.json> --out <map.json> [--html-dir dir] [--concurrency n] [--delay ms] [--limit n] [--verify]"); process.exit(2); }
  const rows = JSON.parse(readFileSync(pull, "utf8"));
  const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : { products: {} };
  const fetchPage = htmlDir
    ? async (_url, id) => { const p = join(htmlDir, id + ".html"); return existsSync(p) ? readFileSync(p, "utf8") : null; }
    : async (url) => {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
        try {
          const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", "Accept": "text/html" } });
          return res.ok ? await res.text() : null;
        } finally { clearTimeout(t); }
      };
  const products = await resolveProducts(rows, {
    fetchPage, done: prev.products, concurrency: Number(arg("--concurrency")) || 3, delayMs: Number(arg("--delay") ?? 400),
    limit: Number(arg("--limit")) || Infinity, log: (s) => console.log(s),
  });
  if (has("--verify")) {
    for (const p of Object.values(products)) for (const [id, url] of Object.entries(p.images || {})) {
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (!res.ok || !/^image\//.test(res.headers.get("content-type") || "")) delete p.images[id];
      } catch { delete p.images[id]; }
    }
  }
  const map = imageMapOf(products);
  const counts = Object.values(products).reduce((c, p) => (c[p.status] = (c[p.status] || 0) + 1, c), {});
  writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), source: "jcpenney.com product pages (Scene7 URLs as the pages embed them)", counts, map, products }));
  console.log(`products ${Object.keys(products).length}`, counts, `photos ${Object.keys(map).length}`);
}
