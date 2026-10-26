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
  const table = {}, none = [];
  for (const [key, t] of targets) {
    const c = comparablesFor(index, t.title, { exclude: key, price: t.price })
      || classComparablesFor(index, byTail, t.title, { exclude: key, price: t.price });
    if (c) table[key] = c;
    else none.push(t);
  }
  mkdirSync(ROOT + "assets/data", { recursive: true });
  writeFileSync(ROOT + OUT, JSON.stringify({ v: 1, pad: COMPARABLE_PAD, minScore: MIN_SCORE, estimates: table }));
  const date = new Date().toISOString().slice(0, 10);
  const n = Object.keys(table).length;
  const sample = Object.entries(table).slice(0, 25);
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
    `| ...with no similar product: weight "por confirmar", waiting for a human estimate | ${none.length.toLocaleString("en")} |`,
    "",
    "## Sample estimates (product -> kg; comparables with their kg and match score)",
    "",
    ...sample.map(([k, c]) => `- **${k.split("::")[1].slice(0, 80)}** (${k.split("::")[0]}, US$${targets.get(k).price.toFixed(2)}): ${c.kg} kg (${c.baseKg} x ${c.pad}); ${c.comps.map((x) => `${x[1].slice(0, 50)} US$${x[4]} ${x[2]} kg [${x[3]}]`).join("; ")}`),
    "",
    "## No similar product",
    "",
    "| Store | Product | US$ | Was quoted |",
    "|---|---|---:|---|",
    ...none.map((t) => `| ${t.retailer} | ${t.title.slice(0, 90).replace(/\|/g, "/")} | ${t.price.toFixed(2)} | ${t.was.weightKg} kg (${t.was.basis}) |`),
    "",
  ].join("\n");
  mkdirSync(ROOT + "reports", { recursive: true });
  writeFileSync(ROOT + `reports/weight-comparables-${date}.md`, md);
  console.log(`pool ${index.docs.length}; constant-covered ${targets.size}; estimated ${n}; no comparable ${none.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
