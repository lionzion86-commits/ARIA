#!/usr/bin/env node
/* ============================================================
   assets/sections/marca/ — EVERY BRAND PAGE, WITHOUT CATALOGUES.

   WHY (2026-10-19, #409 track T5). marca.html (one template for every
   brand: Nike, Gymshark, Crocs, LEGO, Miu Miu, ...) downloaded 63
   catalogue files to show one brand's carousels. The Mountain Test:
   nothing catalogue-sized on any path a shopper takes.

   WHAT THIS WRITES
     _fn/items.json      one row per product of the 63 files (title,
                         brand, store, price, was-price, % off, photo,
                         product type) -- for netlify/functions/brand.js,
                         never sent to a phone
     <key>.json          a brand's head (its carousels and their first
                         12 cards), for every brand with at least
                         STATIC_MIN products: the first screen is one
                         small static file, no function on the way

   Brands not written here (and every "Ver todo" / "Mostrar más") are
   answered by the endpoint with the same core
   (netlify/functions/_brand-core.js). The rules are the page's own,
   moved here unchanged: the same files in the same order, the same
   de-dup (store + url-or-name), the same sale rule (sale-rule.js), the
   same classifier (product-type.js), the same brand match.

   REGENERATE after any catalogue change:
     node scripts/build-brand-index.mjs
   scripts/test/marca-thin-tests.mjs fails when they drift.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RETAILERS } from "./lib/retailers.js";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { FN_FILE, brandKeyOf, titleWords, filterByBrand, headOf, fnRow } from "../netlify/functions/_brand-core.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const OUT_DIR = "assets/sections/marca";
export const STATIC_MIN = 12;

/* The page's 63 sources, in the page's order. */
export const CATALOG_FILES = [
  "/department-cache-walmart.json",
  "/department-cache-oldnavy.json", "/department-cache-footlocker.json",
  "/macys-catalog.json", "/ssense-catalog.json", "/beauty-catalog.json",
  "/lanebryant-catalog.json", "/dicks-catalog.json", "/pacsun-catalog.json",
  "/skims-catalog.json", "/revolve-catalog.json", "/ulta-catalog.json",
  "/yesstyle-catalog.json", "/miumiu-catalog.json", "/partycity-catalog.json",
  "/samsclub-catalog.json", "/costco-catalog.json", "/gymrat-catalog.json",
  "/kohls-catalog.json", "/crateandbarrel-catalog.json", "/pier1-catalog.json", "/newbalance-catalog.json", "/bhphoto-catalog.json",
  "/advanceauto-catalog.json", "/nautilus-catalog.json",
  "/islandwatersports-catalog.json", "/quietstorm-catalog.json",
  "/surfstation-catalog.json",
  "/mainland-catalog.json", "/parrot-catalog.json", "/ccs-catalog.json",
  "/valsurf-catalog.json", "/venum-catalog.json", "/tatami-catalog.json",
  "/everlast-catalog.json", "/mmawarehouse-catalog.json",
  "/combatcorner-catalog.json", "/fuji-catalog.json", "/fightclub-catalog.json",
  "/crocs-catalog.json", "/baublebar-catalog.json", "/jwpei-catalog.json",
  "/meliebianco-catalog.json", "/bentgo-catalog.json", "/mushie-catalog.json",
  "/ezpz-catalog.json", "/statebags-catalog.json", "/books-catalog.json",
  "/moms-catalog.json", "/ae-catalog.json", "/farfetch-catalog.json",
  "/soccer-catalog.json", "/tennis-catalog.json",
  "/latino-designers-dtc-catalog.json", "/jewelry-catalog.json",
  "/moto-catalog.json", "/juguetes-catalog.json", "/sunglasses-catalog.json",
  "/finishline-catalog.json", "/zumiez-catalog.json", "/hottopic-catalog.json",
  "/boxlunch-catalog.json",
  /* Best Buy (2026-10-19, #413): Apple, Sony, Samsung, Nintendo... */
  "/bestbuy-catalog.json",
  /* DSW (#443): the committed empty envelope until the pull lands. */
  "/dsw-catalog.json",
  /* Aria Perfumes (#443 item 32). */
  "/perfumes-catalog.json",
];

const EXTRA_LABELS = {
  americaneagle: "American Eagle", partycity: "Party City", elite: "Elite Sports", gameness: "Gameness",
  tennisexpress: "Tennis Express", academy: "Academy Sports", prosoccer: "Pro Soccer", xtremesoccer: "Xtreme Soccer",
};
export const ALL_LABELS = { ...EXTRA_LABELS, ...Object.fromEntries(Object.entries(RETAILERS).map(([k, r]) => [k, r.label || k])) };

function runBrowserScript(root, file) {
  const win = {};
  new Function("window", readFileSync(join(root, file), "utf8"))(win);
  return win;
}

/* Every product, normalized and de-duplicated exactly as the page did. */
export function loadAllItems(root = ROOT) {
  const { AriaSale } = runBrowserScript(root, "sale-rule.js");
  const { AriaProductType } = runBrowserScript(root, "product-type.js");
  const out = [], seen = new Set();
  for (const f of CATALOG_FILES) {
    let data;
    try { data = JSON.parse(readFileSync(join(root, f), "utf8")); } catch { continue; }
    const retailers = data && data.retailers;
    if (!retailers || typeof retailers !== "object") continue;
    for (const rkey of Object.keys(retailers)) {
      const r = retailers[rkey];
      if (!r || typeof r !== "object") continue;
      for (const section of ["departments", "brands"]) {
        const sec = r[section];
        if (!sec || typeof sec !== "object") continue;
        for (const skey of Object.keys(sec)) {
          const bucket = sec[skey];
          const arr = Array.isArray(bucket) ? bucket : (bucket && Array.isArray(bucket.items) ? bucket.items : null);
          if (!arr) continue;
          for (const it of arr) {
            if (!it || typeof it !== "object") continue;
            const name = it.name || it.title || "";
            const price = Number(it.price);
            if (!name || !(price > 0)) continue;
            let img = it.thumbnail || it.image || "";
            if (!img && Array.isArray(it.images) && it.images[0]) img = it.images[0];
            const onSale = AriaSale.isOnSale(it);
            const orig = onSale ? Number(AriaSale.originalPrice(it)) : 0;
            const retailer = String(it.retailer || rkey || "");
            if (isOffSaleRetailer(retailer) || isOffSaleRetailer(rkey)) continue;   /* /off-sale.js */
            const p = {
              name: String(name), brand: String(it.brand || ""), brandKey: brandKeyOf(it.brand || ""),
              price, orig, image: String(img || ""), url: String(it.url || it.link || ""), retailer,
              ptype: AriaProductType.classify({ name, type: it.type, retailer: it.retailer || rkey, brand: it.brand }),
            };
            /* The page measured the percent on its normalized item. */
            p.pct = AriaSale.discountPct({ name: p.name, price: p.price, originalPrice: onSale ? orig : null, onSale });
            const k = (p.retailer + "|" + (p.url || p.name)).toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(p);
          }
        }
      }
    }
  }
  return out;
}

/* Brand keys worth a static head: every brand field with STATIC_MIN+
   products once the title-word rule is applied. */
export function staticBrands(items) {
  const n = {};
  for (const p of items) if (p.brandKey) n[p.brandKey] = (n[p.brandKey] || 0) + 1;
  return Object.keys(n).filter((k) => n[k] >= STATIC_MIN).sort();
}

export function build(root = ROOT) {
  const items = loadAllItems(root);
  const out = join(root, OUT_DIR);
  if (existsSync(out)) rmSync(out, { recursive: true });
  mkdirSync(join(root, OUT_DIR, "_fn"), { recursive: true });
  const labels = {};
  for (const p of items) if (ALL_LABELS[p.retailer]) labels[p.retailer] = ALL_LABELS[p.retailer];
  writeFileSync(join(root, FN_FILE), JSON.stringify({ v: 1, labels, rows: items.map(fnRow) }));
  /* Title words once, for the static heads (the endpoint does the same per query). */
  for (const p of items) p.words = " " + titleWords(p.name).join(" ") + " ";
  const keys = staticBrands(items);
  for (const key of keys) writeFileSync(join(out, key + ".json"), JSON.stringify(headOf(key, filterByBrand(items, key), labels)));
  return { items: items.length, heads: keys.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = Date.now();
  const s = build();
  console.log(`${s.items} products, ${s.heads} static brand heads, ${((Date.now() - t) / 1000).toFixed(1)}s -> ${OUT_DIR}/`);
}
