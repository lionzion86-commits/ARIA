#!/usr/bin/env node
/* ============================================================
   PURGE THE PILLS AND THE FOOD (#443 c.6579517469, c.6579542290 --
   Danny, 2026-11-02: "we don't even sell pills and we're selling Pepcid
   Complete"; tortillas in Juguetes).

   WHAT. Every product row /not-sold.js marks off sale at its store --
   medicine, vitamins and supplements, grocery anywhere; candy at Costco,
   whose whole grocery aisle goes -- is cut out of the committed
   catalogues (every root *catalog* / *cache* / *feed* file, byte-exact:
   the scrub-perishable cut, so no other row's formatting moves) and out
   of the photo-search index (visual-index: meta row + its vector).

   Nothing is lost silently: each cut row is recorded, whole, in
   data/purges/<name>.json (kind, store, file, title) -- the purge report
   and the way back if Danny ever rules otherwise. Idempotent: a second
   run finds nothing and keeps the report.

   THEN re-run the builders (store slices, departments, search index,
   Ofertas, PDP shards, price index, brand index, home pills/shelves,
   store doors, search destinations): they read the catalogues.

     node scripts/purge-not-sold.mjs [--dry-run] [--report data/purges/costco-2026-11-02.json]
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../not-sold.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const NS = globalThis.AriaNotSold;
export const { notSoldKind, isNotSold } = NS;
export const DEFAULT_REPORT = "data/purges/costco-2026-11-02.json";

const isProduct = (o) => o && typeof o === "object" && !Array.isArray(o) && (o.name || o.title) && "price" in o;
const titleOf = (o) => String(o.name || o.title || "");

/* Every product row of a parsed catalogue, with the store it sits under
   (its own retailer field, else the { retailers: { <key> } } envelope key). */
export function productRows(node, out = [], store = "", depth = 0, path = []) {
  if (Array.isArray(node)) { for (const v of node) productRows(v, out, store, depth, path); return out; }
  if (node && typeof node === "object") {
    if (isProduct(node)) { out.push({ item: node, retailer: String(node.retailer || node.store || store || "").toLowerCase(), path }); return out; }
    for (const [k, v] of Object.entries(node)) {
      const s = path.length === 1 && path[0] === "retailers" ? k : store;
      productRows(v, out, s, depth + 1, path.length < 4 ? [...path, k] : path);
    }
  }
  return out;
}

/* The end of the JSON value that opens at raw[i], strings skipped. */
function valueEnd(raw, i) {
  let depth = 0, inStr = false;
  for (let j = i; j < raw.length; j++) {
    const c = raw[j];
    if (inStr) { if (c === "\\") j++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) return j + 1; }
  }
  return -1;
}

/* Cut the not-sold rows out of one catalogue's raw text, byte-exact.
   A title is cut only when EVERY row carrying it in this file is off
   sale (a candy bar Costco and Walmart both list stays at Walmart);
   a mixed title is reported, not cut. */
export function purgeText(raw, file) {
  const rows = productRows(JSON.parse(raw));
  const byTitle = new Map();
  for (const r of rows) { const t = titleOf(r.item); if (!byTitle.has(t)) byTitle.set(t, []); byTitle.get(t).push(r); }
  const cut = [], mixed = [];
  let text = raw;
  for (const [t, list] of byTitle) {
    const bad = list.filter((r) => isNotSold({ title: t, retailer: r.retailer }));
    if (!bad.length) continue;
    if (bad.length !== list.length) { mixed.push(t); continue; }
    let n = 0;
    for (const key of ["name", "title"]) {
      const needle = new RegExp('\\{\\s*"' + key + '"\\s*:\\s*' + JSON.stringify(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      let m;
      while ((m = needle.exec(text))) {
        const start = m.index, end = valueEnd(text, start);
        if (end < 0) break;
        let a = start, b = end;
        const after = /^\s*,\s*/.exec(text.slice(b));
        if (after) b += after[0].length;
        else { const before = /,\s*$/.exec(text.slice(0, a)); if (before) a -= before[0].length; }
        text = text.slice(0, a) + text.slice(b);
        n++;
        needle.lastIndex = a;
      }
    }
    if (n < list.length) { mixed.push(t); continue; }
    for (const r of list) cut.push({ kind: notSoldKind(t), retailer: r.retailer, file, bucket: r.path.slice(2).join("/"), title: t, url: r.item.url || r.item.productUrl || "", item: r.item });
  }
  if (cut.length) JSON.parse(text);
  return { text, cut, mixed };
}

/* A declared product count stays true. */
function fixDeclared(text, n) {
  return n ? text.replace(/("declaredProductCount"\s*:\s*)(\d+)/, (_, a, d) => a + Math.max(0, Number(d) - n)) : text;
}

export function catalogueFiles(root = ROOT) {
  return readdirSync(root).filter((f) => /(catalog|cache|feed)[^/]*\.json$/.test(f)).sort();
}

/* The photo-search index: drop the rows (and their vectors) of products off sale. */
export function purgeVisualIndex(root = ROOT, dry = false) {
  const vdir = join(root, "visual-index"), mpath = join(vdir, "manifest.json");
  if (!existsSync(mpath)) return [];
  const man = JSON.parse(readFileSync(mpath, "utf8"));
  const dim = man.dim, out = [];
  let total = 0;
  for (const s of man.shards) {
    const meta = JSON.parse(readFileSync(join(vdir, s.meta), "utf8"));
    const vec = readFileSync(join(vdir, s.bin));
    if (meta.length !== s.count || vec.length !== s.count * dim) throw new Error("visual-index shard out of step: " + s.bin);
    const keep = [];
    meta.forEach((r, i) => (isNotSold({ title: r.title || r.name, retailer: r.retailer }) ? out.push({ kind: notSoldKind(r.title || r.name), retailer: r.retailer, file: "visual-index/" + s.meta, title: r.title || r.name }) : keep.push(i)));
    if (keep.length !== meta.length && !dry) {
      writeFileSync(join(vdir, s.meta), JSON.stringify(keep.map((i) => meta[i])));
      writeFileSync(join(vdir, s.bin), Buffer.concat(keep.map((i) => vec.subarray(i * dim, (i + 1) * dim))));
    }
    s.count = keep.length;
    total += s.count;
  }
  man.total = total;
  if (out.length && !dry) writeFileSync(mpath, JSON.stringify(man));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dry = process.argv.includes("--dry-run");
  const ri = process.argv.indexOf("--report");
  const reportFile = ri > 0 ? process.argv[ri + 1] : DEFAULT_REPORT;
  const all = [], mixedAll = [];
  for (const f of catalogueFiles()) {
    const raw = readFileSync(join(ROOT, f), "utf8");
    try { JSON.parse(raw); } catch { continue; }
    const { text, cut, mixed } = purgeText(raw, f);
    for (const t of mixed) mixedAll.push(f + ": " + t);
    if (!cut.length) continue;
    all.push(...cut);
    const envelopeRows = cut.filter((c) => c.bucket).length;
    if (!dry) writeFileSync(join(ROOT, f), fixDeclared(text, /"declaredProductCount"/.test(text) ? envelopeRows : 0));
    console.log(`${f}: ${cut.length} cut`);
  }
  const vis = purgeVisualIndex(ROOT, dry);
  if (vis.length) console.log(`visual-index: ${vis.length} rows cut`);
  if (mixedAll.length) console.log("NOT cut (a title another store still sells):\n  " + mixedAll.join("\n  "));
  /* The report: one entry per product (store + title), every place it was cut. */
  const path = join(ROOT, reportFile);
  const prior = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  const products = new Map((prior && prior.products || []).map((p) => [p.retailer + "|" + p.title, p]));
  for (const c of [...all, ...vis]) {
    const k = c.retailer + "|" + c.title;
    const p = products.get(k) || { kind: c.kind, retailer: c.retailer, title: c.title, url: "", files: [], record: null };
    if (!p.files.includes(c.file)) p.files.push(c.file);
    if (!p.url && c.url) p.url = c.url;
    if (!p.record && c.item && /-catalog\.json$/.test(c.file)) p.record = c.item;
    products.set(k, p);
  }
  const list = [...products.values()].sort((a, b) => (a.retailer < b.retailer ? -1 : a.retailer > b.retailer ? 1 : 0) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.title < b.title ? -1 : 1));
  const counts = { total: list.length, byKind: {}, byStore: {} };
  for (const p of list) {
    counts.byKind[p.kind] = (counts.byKind[p.kind] || 0) + 1;
    const s = (counts.byStore[p.retailer] ||= {});
    s[p.kind] = (s[p.kind] || 0) + 1;
  }
  const report = {
    date: (prior && prior.date) || new Date().toISOString().slice(0, 10),
    issue: "#443 c.6579517469, c.6579542290",
    rule: "Aria sells no pills and no food (/not-sold.js): medicine, vitamins, supplements and grocery are off sale at every store; candy at Costco. Each row was cut from the catalogues by scripts/purge-not-sold.mjs; `record` keeps the catalogue row whole (salvage rule).",
    counts, products: list,
  };
  if (!dry && list.length) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(report, null, 1) + "\n"); }
  console.log(`${all.length} catalogue rows ${dry ? "found" : "cut"}; ${list.length} products in ${reportFile}`, JSON.stringify(counts.byKind));
}
