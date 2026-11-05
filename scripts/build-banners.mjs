#!/usr/bin/env node
/* ============================================================
   HEADER BANNERS: THE BUILDER AND THE AUDIT (#443 c.6642024745,
   c.6642039652, Lucifer's audit c.6642097765).

   WRITES
     assets/banners/<kind>/index.json   the keys of that kind with a file
     assets/banners/<kind>/<key>.json   one small file per page in
         scripts/lib/banner-registry.js: the page's banner (its tier, its
         colour, its real logo or none, and the real product photos it
         shows, each with a srcset on the store's own CDN where that CDN
         takes a width). assets/js/page-banner.js paints it.
     reports/banner-audit-<date>.json   EVERY store, brand and department
     reports/banner-audit-<date>.md     page: what its header shows on the
         base wiring and on this wiring, classed HAS-relevant /
         LOGO-ONLY / MISSING / IRRELEVANT, with a tier.

   PHOTOS: only real product photos already served on the page's own
   cards (the store's slices, the brand's head, the section feed). A
   model shot is read by scripts/lib/model-shot.mjs (the store's own
   file naming); a known flat is never used when the page asks for
   models, and an UNKNOWN frame is never counted as a model.

     node scripts/build-banners.mjs                (write all)
     node scripts/build-banners.mjs --date 2026-11-04
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BANNER_REGISTRY, KNOWN_DEFECTS } from "./lib/banner-registry.js";
import { modelShot } from "./lib/model-shot.mjs";
import { brandKeyOf, deriveBrandLabel } from "../netlify/functions/_brand-core.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const has = (p) => !!p && existsSync(join(ROOT, String(p).replace(/^\//, "")));
export const OUT_DIR = "assets/banners";

/* ---------- srcset on the store's own CDN ---------- */
const WIDTHS = [320, 640];
function widthUrl(u, w) {
  const s = String(u);
  if (/^https:\/\/cdn\.shopify\.com\//.test(s)) { const x = new URL(s); x.searchParams.set("width", String(w)); return x.toString(); }
  if (/^https:\/\/assets\.designerbrands\.com\//.test(s) && /width:\d+/.test(s)) return s.replace(/width:\d+/, "width:" + w);
  if (/^https:\/\/www\.sephora\.com\//.test(s) && /imwidth=\d+/.test(s)) return s.replace(/imwidth=\d+/, "imwidth=" + w);
  return null;
}
export function srcsetOf(u) {
  const parts = WIDTHS.map((w) => { const v = widthUrl(u, w); return v ? v + " " + w + "w" : null; });
  return parts.every(Boolean) ? parts.join(", ") : "";
}
export function tileSrc(u) { return widthUrl(u, WIDTHS[0]) || String(u); }

/* The garment / product family of a name ("NKD Long Sleeve Top - Cold
   Foam" -> "top"), so the tiles show a range, not four of one thing. */
export function familyOf(name) {
  const base = String(name || "").split(/\s+[-|]\s+/)[0].toLowerCase().replace(/[^a-z0-9\s']/g, " ").trim().split(/\s+/);
  return base[base.length - 1] || "";
}
const BAD_FILE = /paypal/i;

/* ---------- the candidate cards of a source ---------- */
function cardsOf(src) {
  const out = [];
  if (src.from === "store") {
    const idx = JSON.parse(read(`assets/tienda/${src.key}/index.json`));
    const rails = (idx.rails || []).slice();
    const order = src.rails || rails.map((r) => r.key);
    for (const k of order) {
      const r = rails.find((x) => x.key === k);
      if (r) for (const c of r.head || []) out.push({ name: c.name, image: c.image, store: src.key, rail: k });
    }
  } else if (src.from === "brand") {
    const head = JSON.parse(read(`assets/sections/marca/${src.key}.json`));
    for (const r of head.rails || []) for (const c of r.cards || []) out.push({ name: c.t, image: c.i, store: c.r, rail: r.title });
  } else if (src.from === "feed") {
    const feed = JSON.parse(read(src.file));
    for (const p of feed.items || []) if (!src.subs || src.subs.includes(p.sub)) out.push({ name: p.t, image: p.img, store: p.r, rail: p.sub });
  }
  return out.filter((c) => /^https:\/\//.test(String(c.image || "")) && !BAD_FILE.test(c.image));
}

/* Pick the tiles: known model shots first (never a known flat when the
   page needs models), then a spread -- one per rail and family, then one
   per store -- in the cards' own order. */
export function pickTiles(entry) {
  const cards = cardsOf(entry.source);
  const seen = new Set(), picks = [];
  const take = (c) => { if (picks.length < entry.tiles && !seen.has(c.image)) { seen.add(c.image); picks.push(c); } };
  const scored = cards.map((c) => ({ ...c, model: modelShot(c.store, c.image) }));
  const pool = entry.model === "required" ? scored.filter((c) => c.model === true) : scored.filter((c) => c.model !== false);
  const models = pool.filter((c) => c.model === true), rest = pool.filter((c) => c.model !== true);
  for (const list of [models, rest]) {
    const usedStore = new Set(picks.map((p) => p.store)), usedFam = new Set(picks.map((p) => familyOf(p.name))), usedRail = new Set(picks.map((p) => p.rail));
    // round 1: a new store (sections) or a new rail, and a new family
    for (const c of list) {
      const fresh = entry.source.from === "feed" ? !usedStore.has(c.store) : !usedRail.has(c.rail);
      if (fresh && !usedFam.has(familyOf(c.name))) { take(c); usedStore.add(c.store); usedFam.add(familyOf(c.name)); usedRail.add(c.rail); }
    }
    // round 2: a new family
    for (const c of list) if (!usedFam.has(familyOf(c.name))) { take(c); usedFam.add(familyOf(c.name)); }
    for (const c of list) take(c);
    if (picks.length >= entry.tiles) break;
  }
  return picks;
}

/* ---------- the tier, computed, never typed ---------- */
export function tierOf(kind, { logo, backdrop, models, tiles, photo }) {
  if (kind === "dept") {
    if (models >= 2) return 1;                // its own on-model frames of what it sells
    if (tiles || photo) return 3;
    return 0;
  }
  if (logo && backdrop) return 1;
  if (logo && models >= 1) return 2;
  if (tiles || backdrop || photo) return 3;
  return 0;
}
const statusOf = (kind, tier) => (tier === 0 ? "MISSING" : kind === "dept" ? (tier === 1 ? "REPRESENTED" : "NOT-YET-REPRESENTED") : tier <= 2 ? "REPRESENTED" : "NOT-YET-REPRESENTED");

export function buildEntry(id, e) {
  const [kind, key] = id.split(":");
  if (e.logo && !has(e.logo)) throw new Error(`${id}: logo ${e.logo} is not in the repo -- never invent one`);
  if (e.backdrop && !has(e.backdrop)) throw new Error(`${id}: backdrop ${e.backdrop} is not in the repo`);
  if (e.photo && !has(e.photo)) throw new Error(`${id}: photo ${e.photo} is not in the repo`);
  const picks = e.source ? pickTiles(e) : [];
  const models = picks.filter((p) => p.model === true).length;
  const tier = tierOf(kind, { logo: e.logo, backdrop: e.backdrop, models, tiles: picks.length, photo: e.photo });
  const missing = [...(e.tier1 || [])];
  if (kind !== "dept" && picks.length && !models) missing.push("frames tagged on-model in " + e.label + "'s photo naming (model-shot.mjs reads none: on-model unverified)");
  return {
    v: 1, kind, key, label: e.label, page: e.page, tier, status: statusOf(kind, tier),
    color: e.color, scrim: e.scrim || "dark", fit: e.fit || "cover",
    logo: e.logo || null, backdrop: e.backdrop || null, photo: e.photo || null,
    tiles: picks.map((p) => ({ src: tileSrc(p.image), srcset: srcsetOf(p.image), store: p.store, model: p.model === true })),
    missing,
  };
}

/* ---------- the audit: every page ---------- */
const STORES_RX = /var STORES = (\{.*\});/;
function storesRegistry() { return JSON.parse(STORES_RX.exec(read("tienda.html"))[1]); }
/* The base wiring is main's: its registry from git (BANNER_BASE_REF,
   default origin/main), so a fix on this branch never rewrites history. */
function baseStores() {
  try { return JSON.parse(STORES_RX.exec(execSync(`git show ${process.env.BANNER_BASE_REF || "origin/main"}:tienda.html`, { cwd: ROOT, maxBuffer: 1 << 26 }).toString())[1]); }
  catch { return storesRegistry(); }
}
function deptsRegistry() {
  const src = /var DEPTS = (\{[\s\S]*?\n  \});/.exec(read("departamento.html"))[1];
  return Function('"use strict";return (' + src + ");")();
}
const bannerFile = (kind, key) => `${OUT_DIR}/${kind}/${key}.json`;
const firstExisting = (list) => list.find((p) => has(p)) || null;
function classify(kind, key, { photo, logo, built }) {
  const defect = KNOWN_DEFECTS[kind + ":" + key] || null;
  if (built) return { class: built.tier ? "HAS-relevant" : "MISSING", tier: built.tier, status: built.status, defect };
  if (photo) {
    const irrelevant = defect && /generic/.test(defect);
    return { class: irrelevant ? "IRRELEVANT" : "HAS-relevant", tier: 3, status: "NOT-YET-REPRESENTED", defect };
  }
  if (logo) return { class: "LOGO-ONLY", tier: 0, status: "MISSING", defect };
  return { class: "MISSING", tier: 0, status: "MISSING", defect };
}

export function audit(built) {
  const STORES = storesRegistry(), BASE = baseStores();
  const stores = Object.entries(STORES).map(([k, s]) => {
    /* the base wiring (main before this branch) */
    const s0 = BASE[k] || s;
    const baseSrc = s0.flagship ? null : s0.heroPhoto ? s0.heroPhoto : (s0.tag && !s0.backdrop ? null : `/assets/tienda/hero/${k}.jpg`);
    const base = baseSrc && has(baseSrc) ? baseSrc : null;
    /* this wiring: the banner file, the registry photo, the phone hero, the store photo */
    const now = s.flagship ? null : firstExisting([s.heroPhoto, `/assets/tienda/hero/${k}.jpg`, `/assets/stores/${k}.jpg`].filter(Boolean));
    const b = built["store:" + k];
    const logo = s.logo && has(s.logo) ? s.logo : null;
    const c = s.flagship ? { class: "FLAGSHIP", tier: null, status: "ARIA-OWN", defect: null } : classify("store", k, { photo: now, logo, built: b });
    const baseClass = s.flagship ? "FLAGSHIP" : base ? "HAS-relevant" : logo ? "LOGO-ONLY" : "MISSING";
    return { key: k, label: s.label, page: `/tienda.html?tienda=${k}`, live: has(`assets/tienda/${k}/index.json`), logo, heroPhoto: s0.heroPhoto || null, heroPhotoExists: s0.heroPhoto ? has(s0.heroPhoto) : null,
      base: { class: baseClass, src: base }, now: { ...c, src: b ? bannerFile("store", k) : now }, missingTier1: b ? b.missing : (s.flagship ? [] : [`${s.label} logo lockup + own storefront / campaign photo`].concat(logo ? [] : [`${s.label} logo file`])) };
  });
  const orphanHeroes = readdirSync(join(ROOT, "assets/tienda/hero")).filter((f) => f.endsWith(".jpg") && !STORES[f.slice(0, -4)]).map((f) => "assets/tienda/hero/" + f);
  let baseHeroes = [];
  try { baseHeroes = execSync(`git ls-tree --name-only ${process.env.BANNER_BASE_REF || "origin/main"} assets/tienda/hero/`, { cwd: ROOT }).toString().split("\n").filter((f) => f.endsWith(".jpg")); } catch {}
  const baseOrphans = baseHeroes.filter((f) => !BASE[f.split("/").pop().slice(0, -4)]);

  const DEPTS = deptsRegistry();
  const depts = Object.entries(DEPTS).map(([k, d]) => {
    const file = `assets/category/${k}.jpg`;
    const shownKey = d.alias ? (/dept=([a-z_]+)/.exec(d.href || "") || [])[1] : k;
    const page = d.href ? "/" + d.href.replace(/^\//, "") : `/departamento.html?dept=${k}`;
    const base = !d.href && has(file) ? file : null;
    const b = built["dept:" + k];
    /* departamento.html's fallbacks: the department's photo, then the
       photo of any department that redirects to it. An alias shows its
       target's page; a department with its own page (Ropa Interior) has
       only its banner file. */
    const target = d.alias ? shownKey : k;
    const viaAlias = Object.entries(DEPTS).filter(([, x]) => x.alias && (x.href || "").includes("dept=" + target)).map(([a]) => `assets/category/${a}.jpg`);
    const now = b ? bannerFile("dept", k) : (d.href && !d.alias) ? null : firstExisting([`assets/category/${target}.jpg`, ...viaAlias]);
    const c = classify("dept", k, { photo: now, logo: null, built: b });
    return { key: k, label: d.name, page, alias: d.alias ? shownKey : null, ownPage: d.href && !d.alias ? d.href : null, fileExists: has(file),
      base: { class: base ? "HAS-relevant" : "MISSING", src: base }, now: { ...c, src: now }, missingTier1: b ? b.missing : (c.tier === 3 ? [`real on-model / lifestyle photography of ${d.name} products the section sells`] : [`any relevant ${d.name} photography`]) };
  });

  /* brands: every brand key the brand endpoint can open */
  const fn = JSON.parse(read("assets/sections/marca/_fn/items.json"));
  const byKey = new Map();
  for (const r of fn.rows) { const k = brandKeyOf(r[1]); if (!k) continue; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push({ brand: r[1] }); }
  const brands = [...byKey.entries()].map(([k, items]) => {
    const base = has(`assets/brands/${k}-hero.jpg`) ? `assets/brands/${k}-hero.jpg` : null;
    const b = built["brand:" + k];
    const now = b ? bannerFile("brand", k) : firstExisting([`assets/brands/${k}-hero.jpg`, `assets/tienda/hero/${k}.jpg`, `assets/stores/${k}.jpg`]);
    const logo = firstExisting([`logos/brands/${k}.svg`, `logos/brands/${k}.png`, `logos/${k}.svg`, `logos/${k}.png`]);
    const c = classify("brand", k, { photo: now, logo, built: b });
    return { key: k, label: deriveBrandLabel(items, k), count: items.length, static: has(`assets/sections/marca/${k}.json`), logo,
      base: { class: base ? "HAS-relevant" : (logo ? "LOGO-FILE-UNUSED" : "MISSING"), src: base }, now: { ...c, src: now } };
  }).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { stores, depts, brands, orphanHeroes, baseOrphans, baseHeroCount: baseHeroes.length };
}

function tally(rows, pick) { const t = {}; for (const r of rows) { const k = pick(r); t[k] = (t[k] || 0) + 1; } return t; }

function markdown(rep) {
  const L = [];
  const { stores, depts, brands } = rep.pages, s = rep.summary;
  L.push(`# Header banner audit, ${rep.date}`, "", "Generated by `node scripts/build-banners.mjs` (do not edit by hand). Base = the wiring on main before this branch; now = this branch.", "");
  L.push("Tiers: 1 = real logo lockup over the brand's own backdrop; 2 = brand colour + real logo + a model in their product; 3 = interim category-relevant photography (NOT-YET-REPRESENTED); 0 = nothing (gradient only).", "");
  L.push("## Counts", "", "| | total | base: photo | base: no photo | now: photo | now by tier |", "|---|---|---|---|---|---|");
  L.push(`| stores | ${s.stores.total} | ${s.stores.baseHas} | ${s.stores.total - s.stores.baseHas} | ${s.stores.nowHas} | ${JSON.stringify(s.stores.nowTier)} |`);
  L.push(`| brands | ${s.brands.total} | ${s.brands.baseHas} | ${s.brands.total - s.brands.baseHas} | ${s.brands.nowHas} | ${JSON.stringify(s.brands.nowTier)} |`);
  L.push(`| departments | ${s.depts.total} | ${s.depts.baseHas} | ${s.depts.total - s.depts.baseHas} | ${s.depts.nowHas} | ${JSON.stringify(s.depts.nowTier)} |`, "");
  L.push(`Store total counts Aria Perfumes (Aria's own flagship, CSS-only by design) among the ${s.stores.total} registry keys. Brands: ${s.brands.total} brand keys open a landing (${s.brands.static} with a static head, ${s.brands.withTwo} with 2+ products); ${s.brands.logoFiles} have a real logo file in the repo that the brand page does not show.`, "");
  L.push("## Wiring defects", "");
  for (const d of rep.defects) L.push("- " + d);
  L.push("", "## Sample banners", "", "| page | tier | status | tiles | on-model | missing for tier 1 |", "|---|---|---|---|---|---|");
  for (const b of rep.samples) L.push(`| ${b.page} | ${b.tier} | ${b.status} | ${b.tiles.length} | ${b.tiles.filter((t) => t.model).length} | ${b.missing.join("; ") || "-"} |`);
  L.push("", "## Stores", "", "| store | base | now | tier | logo file | note |", "|---|---|---|---|---|---|");
  for (const r of stores) L.push(`| ${r.label} (${r.key}) | ${r.base.class} | ${r.now.class} | ${r.now.tier ?? "-"} | ${r.logo ? "yes" : "no"} | ${[r.live ? "" : "no storefront slices (off sale): the page opens the directory", r.now.defect || (r.heroPhoto && !r.heroPhotoExists ? "heroPhoto 404" : "")].filter(Boolean).join("; ")} |`);
  L.push("", "## Departments", "", "| department | page | base | now | tier | note |", "|---|---|---|---|---|---|");
  for (const r of depts) L.push(`| ${r.label} (${r.key}) | ${r.page} | ${r.base.class} | ${r.now.class} | ${r.now.tier ?? "-"} | ${r.alias ? "alias of " + r.alias : r.ownPage ? "own page" : ""} |`);
  L.push("", "## Brands with a banner now", "", "| brand | products | base | now | tier | src |", "|---|---|---|---|---|---|");
  for (const r of brands.filter((b) => b.now.class !== "MISSING" && b.now.class !== "LOGO-ONLY")) L.push(`| ${r.label} (${r.key}) | ${r.count} | ${r.base.class} | ${r.now.class} | ${r.now.tier} | ${r.now.src} |`);
  L.push("", "## The 60 biggest brands still MISSING (full list in the JSON)", "", "| brand | products | real logo file |", "|---|---|---|");
  for (const r of brands.filter((b) => b.now.tier === 0).slice(0, 60)) L.push(`| ${r.label} (${r.key}) | ${r.count} | ${r.logo || "-"} |`);
  L.push("", "## Orphan store heroes (no store page)", "");
  for (const f of rep.orphanHeroes) L.push("- " + f);
  if (!rep.orphanHeroes.length) L.push("- none (python3 scripts/build-tienda-heroes.py removed them)");
  return L.join("\n") + "\n";
}

export function buildAll({ date = new Date().toISOString().slice(0, 10), write = true } = {}) {
  const built = {};
  for (const [id, e] of Object.entries(BANNER_REGISTRY)) built[id] = buildEntry(id, e);
  const pages = audit(built);
  const has1 = (r) => r.base.class === "HAS-relevant";
  const nowHas = (r) => r.now.tier > 0;
  const summary = {
    stores: { total: pages.stores.length, baseHas: pages.stores.filter(has1).length, nowHas: pages.stores.filter(nowHas).length, nowClass: tally(pages.stores, (r) => r.now.class), nowTier: tally(pages.stores, (r) => r.now.tier ?? "flagship") },
    depts: { total: pages.depts.length, baseHas: pages.depts.filter(has1).length, filesPresent: pages.depts.filter((r) => r.fileExists).length, nowHas: pages.depts.filter(nowHas).length, nowClass: tally(pages.depts, (r) => r.now.class), nowTier: tally(pages.depts, (r) => r.now.tier) },
    brands: { total: pages.brands.length, static: pages.brands.filter((b) => b.static).length, withTwo: pages.brands.filter((b) => b.count >= 2).length, baseHas: pages.brands.filter(has1).length, nowHas: pages.brands.filter(nowHas).length, logoFiles: pages.brands.filter((b) => b.logo).length, nowClass: tally(pages.brands, (r) => r.now.class), nowTier: tally(pages.brands, (r) => r.now.tier) },
  };
  const defects = [];
  for (const r of pages.stores) if (r.heroPhoto && !r.heroPhotoExists) defects.push(`store ${r.key}: registry heroPhoto ${r.heroPhoto} does not exist (404)`);
  for (const r of pages.stores) if (r.base.class !== "HAS-relevant" && r.base.class !== "FLAGSHIP" && r.now.src && !r.now.src.startsWith(OUT_DIR)) defects.push(`store ${r.key}: a photo exists (${r.now.src}) but the base wiring never loaded it`);
  for (const r of pages.depts) if (r.alias && r.fileExists) defects.push(`dept ${r.key}: assets/category/${r.key}.jpg exists but the page redirects to ${r.alias}, which has none`);
  for (const f of pages.baseOrphans) defects.push(`orphan hero ${f} on main: no store page${pages.orphanHeroes.includes(f) ? "" : " (removed here by scripts/build-tienda-heroes.py)"}`);
  const brandKeys = new Set(pages.brands.map((b) => b.key));
  for (const f of readdirSync(join(ROOT, "assets/brands")).filter((f) => f.endsWith("-hero.jpg"))) if (!brandKeys.has(f.slice(0, -9))) defects.push(`brand hero assets/brands/${f}: no brand key "${f.slice(0, -9)}" in the brand index, so no brand page shows it`);
  for (const [k, v] of Object.entries(KNOWN_DEFECTS)) defects.push(`${k}: ${v}`);
  const samples = Object.values(built);
  const rep = { v: 1, date, generator: "scripts/build-banners.mjs", summary, defects, samples, pages, orphanHeroes: pages.orphanHeroes };
  if (write) {
    const dir = join(ROOT, OUT_DIR);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    for (const b of samples) {
      const f = join(ROOT, bannerFile(b.kind, b.key));
      mkdirSync(dirname(f), { recursive: true });
      const { page, ...pub } = b;
      writeFileSync(f, JSON.stringify(pub) + "\n");
    }
    /* One small index per kind: a page asks for its banner file only when
       the index lists it, so no page ever requests a file that is not
       published (scripts/test/no-full-catalog-tests.mjs: no 404). */
    for (const kind of ["store", "brand", "dept"]) {
      mkdirSync(join(ROOT, OUT_DIR, kind), { recursive: true });
      writeFileSync(join(ROOT, OUT_DIR, kind, "index.json"), JSON.stringify(samples.filter((b) => b.kind === kind).map((b) => b.key).sort()) + "\n");
    }
    mkdirSync(join(ROOT, "reports"), { recursive: true });
    /* 6,000+ brand rows: one array each, the columns named once. */
    const BCOLS = ["key", "label", "products", "staticHead", "logoFile", "baseClass", "baseSrc", "class", "tier", "status", "src"];
    const brandsOut = { cols: BCOLS, rows: rep.pages.brands.map((b) => [b.key, b.label, b.count, b.static, b.logo, b.base.class, b.base.src, b.now.class, b.now.tier, b.now.status, b.now.src]) };
    writeFileSync(join(ROOT, `reports/banner-audit-${date}.json`), JSON.stringify({ ...rep, pages: { ...rep.pages, brands: brandsOut } }) + "\n");
    writeFileSync(join(ROOT, `reports/banner-audit-${date}.md`), markdown(rep));
  }
  return rep;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf("--date");
  const rep = buildAll({ date: i > 0 ? process.argv[i + 1] : undefined });
  const s = rep.summary;
  console.log(`stores ${s.stores.total}: base photo ${s.stores.baseHas}, now ${s.stores.nowHas} ${JSON.stringify(s.stores.nowTier)}`);
  console.log(`depts ${s.depts.total}: files ${s.depts.filesPresent}, base ${s.depts.baseHas}, now ${s.depts.nowHas} ${JSON.stringify(s.depts.nowTier)}`);
  console.log(`brands ${s.brands.total}: base ${s.brands.baseHas}, now ${s.brands.nowHas}`);
  for (const b of rep.samples) console.log(`${b.kind}:${b.key} tier ${b.tier} ${b.status} tiles ${b.tiles.length} models ${b.tiles.filter((t) => t.model).length}`);
  console.log(rep.defects.length + " defects");
}
