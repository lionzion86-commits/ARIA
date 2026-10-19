#!/usr/bin/env node
/* ============================================================
   assets/sections/motos/ — ARIA MOTOS, PRECOMPUTED.

   WHY (2026-10-19, #409 track T5). motos.html downloaded
   moto-catalog.json (4.7MB raw, 0.8MB gzipped: descriptions, variants
   and sizes the grid never shows) before drawing a card.

   WHAT THIS WRITES
     <type>-<store>-<n>.json   the grid for every type chip x store chip,
                               48 cards at a time ("Ver más productos")
     _fn/items.json            one row per product, for
                               netlify/functions/motos.js (the search
                               box); never sent to a phone

   The page's rules, unchanged (netlify/functions/_motos-core.js):
   RevZilla then Dennis Kirk, priced items only, sale-rule.js for the
   percent, sale first then cheapest.

   REGENERATE after any catalogue change:
     node scripts/build-motos-slices.mjs
   scripts/test/motos-thin-tests.mjs fails when they drift.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FN_FILE, TYPES, STORES, PAGE_SIZE, subType, filterList, pageOf, fnRow } from "../netlify/functions/_motos-core.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const OUT_DIR = "assets/sections/motos";
export const CATALOG = "moto-catalog.json";

export function loadItems(root = ROOT) {
  const win = {};
  new Function("window", readFileSync(join(root, "sale-rule.js"), "utf8"))(win);
  const AriaSale = win.AriaSale;
  const data = JSON.parse(readFileSync(join(root, CATALOG), "utf8"));
  const out = [];
  for (const rk of ["revzilla", "denniskirk"]) {
    const items = (((data.retailers[rk] || {}).departments || {}).motos || {}).items || [];
    for (const it of items) {
      const title = it.title || it.name || it.productTitle || "";
      if (!title) continue;
      const rawPrice = Number(it.price);
      if (!(rawPrice > 0)) continue;
      const salePct = AriaSale.discountPct(it);
      const p = {
        title: String(title), brand: it.brand || "", type: it.type || "", rawPrice, salePct,
        wasPrice: salePct > 0 ? Number(AriaSale.originalPrice(it)) || 0 : 0,
        image: it.thumbnail || (it.images && it.images[0]) || "", retailer: rk,
      };
      p.subtype = subType(p.title);
      out.push(p);
    }
  }
  return out.map((p, i) => ({ p, i })).sort((a, b) => {
    const as = a.p.salePct > 0 ? 1 : 0, bs = b.p.salePct > 0 ? 1 : 0;
    if (as !== bs) return bs - as;
    return (a.p.rawPrice - b.p.rawPrice) || (a.i - b.i);
  }).map((x) => x.p);
}

export function build(root = ROOT) {
  const all = loadItems(root);
  const out = join(root, OUT_DIR);
  if (existsSync(out)) rmSync(out, { recursive: true });
  mkdirSync(join(root, OUT_DIR, "_fn"), { recursive: true });
  writeFileSync(join(root, FN_FILE), JSON.stringify({ v: 1, rows: all.map(fnRow) }));
  let files = 1;
  for (const t of TYPES) for (const r of STORES) {
    const list = filterList(all, { t, r });
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    for (let n = 0; n < pages; n++) { writeFileSync(join(out, `${t}-${r}-${n}.json`), JSON.stringify({ t, r, q: "", ...pageOf(list, n) })); files++; }
  }
  return { items: all.length, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = build();
  console.log(`${s.items} products, ${s.files} files -> ${OUT_DIR}/`);
}
