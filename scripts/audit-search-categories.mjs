#!/usr/bin/env node
/* ==================================================================
   SEARCH CATEGORY AUDIT (#443 c.6674074811, Danny: every section and
   category name on the site must land on its category).

   Every section name the site shows -- each department, each Moda lens,
   each type rail in assets/search/destinations.json, each nav tab and
   column in assets/data/nav-menu.json -- plus the names shoppers use for
   Tallas Plus, run as a search through the real search endpoint
   (route=1). A name that falls to the chooser or lands anywhere but a
   category is this bug.

     node scripts/audit-search-categories.mjs [--root <tree>] [--out <file.json>]
   ================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ROOT = resolve(arg("--root") || join(dirname(fileURLToPath(import.meta.url)), ".."));
/* Named on purpose, with the reason: a section name that is also a more
   common product word keeps the product word's page. */
export const KNOWN_EXCEPTIONS = {
  tenis: "«tenis» is also the everyday word for sneakers; it opens Zapatillas (the product-word ruling, c.6579541628), with the sport one tap away. Danny decides.",
};
export const PLUS_QUERIES = ["tallas plus", "talla plus", "plus size", "plus-size", "tallas grandes", "talla grande", "tallas especiales", "curvy", "Tallas Plus", "TALLAS PLUS", "Tallas Grandes", "Plus Size"];

/** Every section label: [{ label, dept, from }]. */
export function sectionLabels(root = ROOT) {
  const d = JSON.parse(readFileSync(join(root, "assets/search/destinations.json"), "utf8"));
  const out = [], seen = new Set();
  const add = (label, dept, from) => { const k = String(label || "").trim().toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push({ label: String(label).trim(), dept, from }); };
  for (const [k, [name]] of Object.entries(d.depts)) add(name, k, "department");
  for (const [k, [, lenses]] of Object.entries(d.depts)) for (const label of Object.values(lenses || {})) add(label, k, "lens");
  for (const [k, rails] of Object.entries(d.types)) for (const [label] of Object.values(rails || {})) add(label, k, "type rail");
  const navFile = join(root, "assets/data/nav-menu.json");
  if (existsSync(navFile)) {
    const nav = JSON.parse(readFileSync(navFile, "utf8"));
    const walk = (node, depth) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach((x) => walk(x, depth)); return; }
      const label = node.label || node.title || node.name;
      const href = String(node.href || node.url || "");
      const m = /departamento\.html\?dept=([a-z_]+)/.exec(href);
      if (label && m && !/[?&](b|tienda|marca|q)=/.test(href)) add(label, m[1], "nav");
      for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, depth + 1);
    };
    walk(nav, 0);
  }
  return out;
}

export async function audit(root = ROOT) {
  const cwd = process.cwd();
  process.chdir(root);
  const search = await import(pathToFileURL(join(root, "netlify/functions/search.js")).href);
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const run = async (q) => {
    const r = await search.handler({ httpMethod: "GET", queryStringParameters: { q, route: "1" } }, { fetchImpl });
    const j = JSON.parse(r.body);
    const d = j.destination || {};
    return { kind: d.kind, key: d.key, url: d.url || null };
  };
  const rows = [];
  for (const s of sectionLabels(root)) rows.push({ ...s, ...(await run(s.label)) });
  for (const q of PLUS_QUERIES) rows.push({ label: q, dept: "curvy", from: "tallas plus", ...(await run(q)) });
  process.chdir(cwd);
  for (const r of rows) r.ok = r.kind === "category" && (r.from === "type rail" || r.from === "lens" || r.from === "nav" ? true : r.key === r.dept);
  /* A department name, or a Tallas Plus word, must land on ITS department. */
  for (const r of rows) if ((r.from === "department" || r.from === "tallas plus") && r.key !== r.dept) r.ok = false;
  for (const r of rows) { const ex = KNOWN_EXCEPTIONS[r.label.toLowerCase()]; if (ex && !r.ok) { r.ok = true; r.exception = ex; } }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const rows = await audit(ROOT);
  const bad = rows.filter((r) => !r.ok);
  const out = arg("--out");
  if (out) writeFileSync(out, JSON.stringify({ root: ROOT, total: rows.length, failing: bad.length, rows }, null, 1) + "\n");
  console.log(`${rows.length} labels, ${bad.length} not landing on their category, ${rows.filter((r) => r.exception).length} named exception(s)`);
  for (const r of bad) console.log(`  ${JSON.stringify(r.label)} (${r.from}, ${r.dept}) -> ${r.kind} ${r.key} ${r.url || ""}`);
}
