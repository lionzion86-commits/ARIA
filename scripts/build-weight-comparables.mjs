#!/usr/bin/env node
/* ============================================================
   THE WEIGHTS THE RULES CANNOT GIVE, FROM SIMILAR PRODUCTS (#443,
   Danny's weight ruling 2026-10-26: "no 1 kg defaults anywhere; a null
   weight triggers the comparables method, never a constant").

   For every product in the catalogues the product page reads, the
   weight resolver (netlify/functions/_weight-resolve.js) is asked what
   it would quote. Products it can place -- a published weight, the
   store's catalogue figure, a beauty or candle rule, a weight stated in
   the title, the category table -- form the pool of comparables. The
   products it can only cover with a constant (a department's
   conservative ceiling, the generic guess) get a padded estimate from
   their most similar pool products instead (scripts/lib/weight-
   comparables.mjs), recorded with its comparables so it can be audited.

     node scripts/build-weight-comparables.mjs

   Writes assets/data/weight-comparables.json, read by the resolver (so
   the product page, the cart, checkout and orders-create all quote the
   same number), and reports/weight-comparables-<date>.md: the counts,
   a sample of estimates, and the products with no comparable at all,
   which wait for a human estimate rather than a constant.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildIndex, buildClassIndex, comparablesFor, classComparablesFor, comparableKey, COMPARABLE_PAD, MIN_SCORE } from "./lib/weight-comparables.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
/* The web pass over the no-comparable tail (#443 c.6420102856 /
   c.6420144307, harvested by Lucifer 2026-10-26, c.6428323843): one row
   per product it found a published weight for, with its source. The
   CSV stays in hidden-docs/ (never served); the table carries the kg,
   the pad, the source type and the row's product id for the audit. */
export const WEB_TABLE = "hidden-docs/weight-tail-full-2026-10-26.csv";
export const WEB_PAD = 1.1;
/* Held back for re-judgment, as the harvest itself flags: Miu Miu's two
   hits carry an inferred unit (grams). */
export const WEB_HOLD = new Set(["miumiu"]);

/* The catalogues keep some titles HTML-escaped ("&amp;"); the harvest
   wrote them decoded. Both sides are matched on the decoded key. */
export const decodedKey = (k) => String(k).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** The harvest's rows, keyed like the comparables table (decoded). */
export function loadWebWeights(root = ROOT) {
  const file = root + WEB_TABLE;
  if (!existsSync(file)) return new Map();
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  const col = (name) => head.indexOf(name);
  const out = new Map();
  for (const r of body) {
    if (r.length < head.length) continue;
    const retailer = r[col("retailer")], title = r[col("product_name")];
    const found = Number(r[col("found_weight_kg")]);
    if (!retailer || !title || !(found > 0) || WEB_HOLD.has(retailer)) continue;
    out.set(decodedKey(comparableKey(retailer, title)), {
      kg: Math.round(found * WEB_PAD * 1000) / 1000,
      baseKg: found,
      pad: WEB_PAD,
      method: "web",
      src: r[col("source_type")] || "other",
      kind: r[col("weight_kind")] || "item",
      id: r[col("product_id")],
    });
  }
  return out;
}
export const OUT = "assets/data/weight-comparables.json";
const POOL_SOURCES = new Set(["spec", "catalog", "beauty", "candle", "title", "category"]);
const TARGET_SOURCES = new Set(["department", "fallback"]);

export function catalogFiles() {
  const page = readFileSync(ROOT + "producto.html", "utf8");
  return JSON.parse(/var CATALOG_FILES = (\[[^\]]*\]);/.exec(page)[1]).map((f) => f.replace(/^\//, ""));
}

/** Every product with a title and a price, with its store. */
export function* products(data) {
  const stack = [[data, null]];
  while (stack.length) {
    const [o, s0] = stack.pop();
    if (Array.isArray(o)) { for (const v of o) stack.push([v, s0]); continue; }
    if (!o || typeof o !== "object") continue;
    const s = typeof o.retailer === "string" ? o.retailer : s0;
    if ((o.title || o.name) && (o.price != null || o.salePrice != null) && s) { yield { ...o, retailer: s }; continue; }
    for (const [k, v] of Object.entries(o)) {
      if (!v || typeof v !== "object") continue;
      if (k === "retailers" && !Array.isArray(v)) for (const [rk, rv] of Object.entries(v)) stack.push([rv, rk]);
      else stack.push([v, s]);
    }
  }
}

async function main() {
  process.env.ARIA_WEIGHT_COMPARABLES = "off"; // the resolver as it is without this table
  const { resolveItemWeight } = await import(ROOT + "netlify/functions/_weight-resolve.js");
  const pool = [], targets = new Map();
  for (const f of catalogFiles()) {
    if (!existsSync(ROOT + f)) continue;
    for (const p of products(JSON.parse(readFileSync(ROOT + f, "utf8")))) {
      const title = String(p.title || p.name);
      const line = { ...p, title, priceUsd: Number(p.salePrice ?? p.price) || 0 };
      const published = Number(p.weightKg) > 0 && p.weightEstimated === false;
      const r = resolveItemWeight(line);
      if (published) pool.push({ retailer: p.retailer, title, kg: Number(p.weightKg), price: line.priceUsd });
      else if (POOL_SOURCES.has(r.source) && !r.needsReview) pool.push({ retailer: p.retailer, title, kg: r.weightKg, price: line.priceUsd });
      else if (TARGET_SOURCES.has(r.source)) targets.set(comparableKey(p.retailer, title), { retailer: p.retailer, title, price: line.priceUsd, was: r });
    }
  }
  const index = buildIndex(pool);
  const byTail = buildClassIndex(index);
  const table = {}, none = [], web = loadWebWeights();
  let webUsed = 0;
  /* The harvest worked from this report, whose titles are cut at 90
     characters; a cut title matches the one product it names, and only
     when no other product in the tail shares those 90 characters. */
  const cut = (t) => decodedKey(comparableKey(t.retailer, t.title.slice(0, 90)));
  const cutCount = new Map();
  for (const t of targets.values()) cutCount.set(cut(t), (cutCount.get(cut(t)) || 0) + 1);
  const webFor = (key, t) => web.get(decodedKey(key)) || (t.title.length > 90 && cutCount.get(cut(t)) === 1 ? web.get(cut(t)) : undefined);
  for (const [key, t] of targets) {
    const c = comparablesFor(index, t.title, { exclude: key, price: t.price })
      || classComparablesFor(index, byTail, t.title, { exclude: key, price: t.price });
    if (c) table[key] = c;
    else if (webFor(key, t)) { table[key] = webFor(key, t); webUsed++; }
    else none.push(t);
  }
  mkdirSync(ROOT + "assets/data", { recursive: true });
  writeFileSync(ROOT + OUT, JSON.stringify({ v: 1, pad: COMPARABLE_PAD, minScore: MIN_SCORE, estimates: table }));
  const date = new Date().toISOString().slice(0, 10);
  const n = Object.keys(table).length - webUsed;
  const sample = Object.entries(table).filter(([, c]) => c.method !== "web").slice(0, 25);
  const webSample = Object.entries(table).filter(([, c]) => c.method === "web").slice(0, 15);
  const md = [
    `# Weights from similar products, ${date}`,
    "",
    "#443 weight ruling (Danny, 2026-10-26): a product with no weight in the data gets a padded estimate from similar products, never a constant. Built by `scripts/build-weight-comparables.mjs`.",
    "",
    `| | Products |`,
    `|---|---:|`,
    `| Comparables pool (a published weight, the store's figure, or a per-class rule) | ${index.docs.length.toLocaleString("en")} |`,
    `| Products the rules could only cover with a constant | ${targets.size.toLocaleString("en")} |`,
    `| ...now estimated from similar products (median x ${COMPARABLE_PAD}) | ${n.toLocaleString("en")} |`,
    `| ...with no similar product, weighed by the web pass (found weight x ${WEB_PAD}, source in ${WEB_TABLE}) | ${webUsed.toLocaleString("en")} |`,
    `| ...with neither: weight "por confirmar" | ${none.length.toLocaleString("en")} |`,
    "",
    "## Sample estimates (product -> kg; comparables with their kg and match score)",
    "",
    ...sample.map(([k, c]) => `- **${k.split("::")[1].slice(0, 80)}** (${k.split("::")[0]}, US$${targets.get(k).price.toFixed(2)}): ${c.kg} kg (${c.baseKg} x ${c.pad}); ${c.comps.map((x) => `${x[1].slice(0, 50)} US$${x[4]} ${x[2]} kg [${x[3]}]`).join("; ")}`),
    "",
    "## Sample web-pass estimates (found weight x pad; the source URL is in the CSV)",
    "",
    ...webSample.map(([k, c]) => `- **${k.split("::")[1].slice(0, 80)}** (${k.split("::")[0]}): ${c.kg} kg (${c.baseKg} x ${c.pad}; ${c.kind}, ${c.src})`),
    "",
    "## Por confirmar: no similar product and no published weight",
    "",
    "| Store | Product | US$ | Was quoted |",
    "|---|---|---:|---|",
    ...none.map((t) => `| ${t.retailer} | ${t.title.slice(0, 90).replace(/\|/g, "/")} | ${t.price.toFixed(2)} | ${t.was.weightKg} kg (${t.was.basis}) |`),
    "",
  ].join("\n");
  mkdirSync(ROOT + "reports", { recursive: true });
  writeFileSync(ROOT + `reports/weight-comparables-${date}.md`, md);
  console.log(`pool ${index.docs.length}; constant-covered ${targets.size}; comparables ${n}; web ${webUsed} of ${web.size} harvested; por confirmar ${none.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
