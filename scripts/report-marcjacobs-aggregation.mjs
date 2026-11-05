#!/usr/bin/env node
/* ============================================================
   MARC JACOBS ACROSS EVERY CATALOGUE ARIA HOLDS (#443 c.6643310622
   step 1, amended c.6643334129: the aggregation now FEEDS the
   Comparador, the direct store anchors it).

   Walks every committed catalogue (*-catalog.json, the department
   caches) for the house's spellings (scripts/lib/marcjacobs-match.js
   MJ_BRAND_RX: «Marc Jacobs», «Marc Jacobs Beauty», «The Marc Jacobs»,
   «Marc by Marc Jacobs»), one product once per store (link + photo), and
   counts by store and by aisle -- bags, shoes, ready-to-wear,
   accessories, beauty (fragrance included) -- read from each product's
   own type, then its title (scripts/lib/marcjacobs.js mjAisle).

   Beauty is deduplicated across stores by its name (the same Daisy at
   Macy's, Ulta and Sephora is one product): that line is what Aria
   already sells, and the store's scope leaves it out.

   It also counts what the Comparador will join once the official
   catalogue lands: the retailer fashion listings that carry a Marc
   Jacobs model key (mjModelKey, the key netlify/functions/_search-core.js
   modelKey uses for the house), from the search index the Comparador
   actually reads.

     node scripts/report-marcjacobs-aggregation.mjs [--out reports/marcjacobs-aggregation-2026-11-04.json]
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMarcJacobsBrand, mjModelKey, MJ_BRAND_RX } from "./lib/marcjacobs-match.js";
import { mjAisle, MJ_CATALOG_FILE } from "./lib/marcjacobs.js";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { INDEX_PATH } from "./build-search-index.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = arg("--out") || "reports/marcjacobs-aggregation-2026-11-04.json";
const AISLES = ["bolsos", "zapatos", "ropa", "accesorios", "belleza", "sin categoria"];
const LABEL = { bolsos: "bags", zapatos: "shoes", ropa: "ready-to-wear", accesorios: "accessories", belleza: "beauty (incl. fragrance)", "sin categoria": "no category" };
/* The stores the directive names; a name with no catalogue is reported so. */
const ASKED = ["ssense", "farfetch", "macys", "nordstrom", "revolve", "saks", "saksfifthavenue", "neimanmarcus", "bergdorfgoodman"];

const files = readdirSync(ROOT).filter((f) => (/-catalog\.json$/.test(f) || /^department-cache(-[a-z]+)?\.json$/.test(f)) && f !== MJ_CATALOG_FILE).sort();
const stores = {};
const spellings = {};
const beauty = new Map();
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

for (const f of files) {
  let env;
  try { env = JSON.parse(readFileSync(join(ROOT, f), "utf8")); } catch { continue; }
  const seen = new Set();
  const walk = (function walk(o, store) {
    if (Array.isArray(o)) { for (const x of o) walk(x, store); return; }
    if (!o || typeof o !== "object") return;
    const name = o.name || o.title || o.productName;
    if (name && (o.price != null || o.effectivePrice != null)) {
      const brand = String(o.brand || "").trim();
      if (!isMarcJacobsBrand(brand)) return;
      const k = String(o.retailer || store || "?");
      const id = k + "|" + String(o.url || name) + "|" + String(o.image || "");
      if (seen.has(id)) return;
      seen.add(id);
      spellings[brand] = (spellings[brand] || 0) + 1;
      const aisle = mjAisle(o.type, name) || "sin categoria";
      const s = (stores[k] ||= { files: new Set(), total: 0, byAisle: Object.fromEntries(AISLES.map((a) => [a, 0])) });
      s.files.add(f);
      s.total++;
      s.byAisle[aisle]++;
      if (aisle === "belleza") {
        /* One product across stores: its name without the size, the
           edition words or the store's own suffixes. */
        const bk = norm(String(name).replace(/\(?\s*\.?\d+(?:\.\d+)?\s?(?:fl\.?\s?oz|oz|ml)\.?\s*\)?/gi, " "))
          .replace(/\b(limited edition|en spray|spray|para mujer|para hombre|tester|repuesto|mini|sin caja)\b/g, " ").replace(/^marc jacobs /, "").replace(/ with .*$/, "").replace(/\s+/g, " ").trim();
        if (!beauty.has(bk)) beauty.set(bk, new Set());
        beauty.get(bk).add(k);
      }
      return;
    }
    for (const v of Object.values(o)) walk(v, store);
  });
  if (env && env.retailers && typeof env.retailers === "object") for (const [rk, r] of Object.entries(env.retailers)) walk(r, rk);
  else walk(env, f.replace(/^department-cache-?|(-catalog)?\.json$/g, "") || "walmart");
}

/* The Comparador's own rows: the search index (what search.js and the
   brand pages serve), Marc Jacobs fashion listings and their model keys. */
const idx = JSON.parse(readFileSync(join(ROOT, INDEX_PATH), "utf8"));
const F = Object.fromEntries(idx.fields.map((n, i) => [n, i]));
const keyed = {}, unkeyed = {}, keys = new Map();
let fashionRows = 0;
for (const r of idx.rows) {
  if (!isMarcJacobsBrand(r[F.brand])) continue;
  const aisle = mjAisle("", r[F.title]);
  if (aisle === "belleza") continue;
  fashionRows++;
  const k = mjModelKey(r[F.title], r[F.brand], r[F.department]);
  const st = r[F.retailer];
  if (k) { keyed[st] = (keyed[st] || 0) + 1; if (!keys.has(k)) keys.set(k, new Set()); keys.get(k).add(st); }
  else unkeyed[st] = (unkeyed[st] || 0) + 1;
}

const byStore = Object.fromEntries(Object.entries(stores).sort((a, b) => b[1].total - a[1].total).map(([k, s]) => [k, {
  files: [...s.files], live: !isOffSaleRetailer(k), total: s.total,
  byCategory: Object.fromEntries(AISLES.filter((a) => s.byAisle[a]).map((a) => [LABEL[a], s.byAisle[a]])),
}]));
const byCategory = Object.fromEntries(AISLES.map((a) => [LABEL[a], Object.values(stores).reduce((n, s) => n + s.byAisle[a], 0)]).filter(([, n]) => n));
const fashionTotal = ["bolsos", "zapatos", "ropa", "accesorios"].reduce((n, a) => n + Object.values(stores).reduce((m, s) => m + s.byAisle[a], 0), 0);
const totalListings = Object.values(stores).reduce((n, s) => n + s.total, 0);
const beautyListings = byCategory[LABEL.belleza] || 0;

const report = {
  generatedAt: new Date().toISOString(),
  directive: "#443 c.6643310622 (aggregation count), amended c.6643334129 (direct store; aggregation feeds the Comparador)",
  method: "every committed *-catalog.json and department cache; brand matched by " + MJ_BRAND_RX + "; one product once per store (link + photo); aisle from the product's own type, then its title (scripts/lib/marcjacobs.js mjAisle)",
  spellingsFound: spellings,
  spellingsNotFound: ["The Marc Jacobs", "Marc by Marc Jacobs"].filter((s) => !spellings[s]),
  catalogsScanned: files.length,
  storesAskedWithoutMarcJacobs: ASKED.filter((k) => !stores[k]).map((k) => ({
    store: k, why: files.some((f) => f.startsWith(k)) ? "catalogue held, no Marc Jacobs in it" : "no catalogue for this store in the repo",
  })),
  total: { listings: totalListings, fashion: fashionTotal, beautyListings, beautyUniqueProducts: beauty.size },
  byCategory,
  byStore,
  beautyDedupe: {
    note: "Beauty and fragrance already sell through these stores; the Marc Jacobs store leaves them out. Unique = one name across stores.",
    listings: beautyListings, unique: beauty.size,
    soldAtMoreThanOneStore: [...beauty].filter(([, s]) => s.size > 1).map(([n, s]) => ({ name: n, stores: [...s].sort() })),
  },
  comparador: {
    note: "Retailer Marc Jacobs fashion listings in the search index (what the Comparador reads) and whether each carries a model key (scripts/lib/marcjacobs-match.js mjModelKey). A keyed listing gets the official store's row the day marcjacobs-catalog.json holds the same model; a style-number join needs the official catalogue's codes (no retailer feed carries a Marc Jacobs style number today: SSENSE's productCode is its own).",
    fashionListings: fashionRows,
    withMatchKey: Object.values(keyed).reduce((a, b) => a + b, 0),
    withoutMatchKey: Object.values(unkeyed).reduce((a, b) => a + b, 0),
    distinctModels: keys.size,
    byStore: Object.fromEntries([...new Set([...Object.keys(keyed), ...Object.keys(unkeyed)])].map((k) => [k, { withKey: keyed[k] || 0, withoutKey: unkeyed[k] || 0 }])),
    styleNumberMatches: 0,
  },
};
writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ total: report.total, byCategory, byStore: Object.fromEntries(Object.entries(byStore).map(([k, v]) => [k, v.byCategory])), comparador: { ...report.comparador, note: undefined } }, null, 1));
