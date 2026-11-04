#!/usr/bin/env node
/* ============================================================
   THE FULL STORE AUDIT (#443 c.6635296341, amended c.6635303627).

   Danny, live: Parrot's «Accesorios» rail (74) led with Vans shoes, its
   «Accesorios de Skate» (19) was only shoes, its Hombre filter showed
   16 products; Val Surf showed 685 accesorios against 36 zapatillas.
   "Surf shops sell shoes. The shoes must be IN the Zapatos/Zapatillas
   sections, with their true counts."

   This walks EVERY store of the homepage's Tiendas carousel
   (TIENDAS_STRIP in the bundle), section by section, from the files the
   site serves:
     front page    assets/tienda/<k>/index.json: every rail and its
                   sub-carousels, every chip (department / audience pill)
                   and its sub-carousels, with what each one CLAIMS;
     expansions    assets/tienda/_fn/<k>.json through the endpoint's own
                   code (netlify/functions/_tienda-core.js): each rail's
                   and chip's «Ver todo» railed view (groupsOf), brand
                   views included;
     filter bar    the nav-filter engine (netlify/functions/
                   _nav-filter-core.js) over the store: every type facet
                   and every audience facet;
     inbound       the homepage store pills (assets/home/store-pills),
                   category pills (assets/home/category-pills), home
                   pills (assets/home/pills) and shelves (assets/home/
                   shelves) that carry the store's products.
   Every product of every typed section goes through the one product
   truth (scripts/lib/store-truth.js: footwear.js isShoeForDept, the
   footwear houses' model lines, the garment head nouns) and the
   audience rule (store-subrails.js audienceOf).

   DEFECT CLASSES
     SHOE_IN_ACCESORIOS      a shoe inside an «Accesorios...» section
     GARMENT_IN_ACCESORIOS   a garment inside an «Accesorios...» section
     SHOE_IN_ROPA            a shoe inside a clothing section
     SHOE_IN_OTHER           a shoe inside any other typed section
     NONSHOE_IN_SHOES        a non-shoe inside a shoe section
     MISLABELED_SECTION      a typed section under half genuine
     ZAPATOS_UNDERCOUNT      the store's shoe sections hold under 90% of
                             its shoes (true counts)
     COUNT_MISMATCH          a claimed count that is not what opens
     AUDIENCE_COLLAPSE       an audience filter under half of the
                             store's wearables for that audience
     BRAND_MISMATCH          a brand rail holding another brand
     INBOUND_*               the same defects on the homepage surfaces

     node scripts/store-audit.mjs                 roll-up + per-store table
     node scripts/store-audit.mjs --json <file>   also write the full report
     node scripts/store-audit.mjs --only parrot,valsurf
     node scripts/store-audit.mjs --all            every storefront, not only the carousel
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tiendaStores, loadStoreRules, genericItems, storeProducts, SLICED_STORES, RAIL_MIN } from "./build-store-slices.mjs";
import { STOREFRONTS } from "./lib/storefronts.js";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { isShoeItem, garmentFamily, sectionKind } from "./lib/store-truth.js";
import { audienceOf } from "./lib/store-subrails.js";
import { groupsOf, loadStore } from "../netlify/functions/_tienda-core.js";
import { rowsOf } from "../netlify/functions/_nav-filter-core.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const CLASSES = ["SHOE_IN_ACCESORIOS", "GARMENT_IN_ACCESORIOS", "SHOE_IN_ROPA", "SHOE_IN_OTHER", "NONSHOE_IN_SHOES",
  "MISLABELED_SECTION", "ZAPATOS_UNDERCOUNT", "COUNT_MISMATCH", "AUDIENCE_COLLAPSE", "BRAND_MISMATCH",
  "INBOUND_SHOE_IN_NONSHOE", "INBOUND_NONSHOE_IN_SHOES", "INBOUND_COUNT_MISMATCH"];
export const MISLABEL_SHARE = 0.5, UNDERCOUNT_SHARE = 0.9, AUDIENCE_SHARE = 0.5;
/* A typed section must be at least this big to be judged mislabeled / collapsed (a 2-card group is noise). */
const MIN_JUDGED = 4;
/* A section whose label promises no type (Ofertas, a brand, an audience). */
const MIXED = "Ofertas";
/* Families whose products a person wears (an audience filter's scope). */
export const WEARABLE = new Set(["ropa", "zapatos", "trajes_bano", "sombreros", "accesorios", "carteras", "joyas"]);
const UNISEX = new Set(["ropa", "zapatos", "trajes_bano", "sombreros"]);

/** The Tiendas carousel's stores, as the bundle lists them. */
export function carouselStores(root = ROOT) {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const src = /src="\/?(build\/app-[0-9a-f]{16}\.js)"/.exec(html);
  const js = readFileSync(join(root, src[1]), "utf8");
  const block = /const TIENDAS_STRIP = \[([\s\S]*?)\n\];/.exec(js)[1];
  const keys = [...block.matchAll(/\{k:'([a-z0-9]+)'/g)].map((m) => m[1]);
  return keys.filter((k) => !isOffSaleRetailer(k) && existsSync(join(root, "assets/tienda", k, "index.json")));
}

const readJson = (root, rel) => { try { return JSON.parse(readFileSync(join(root, rel), "utf8")); } catch { return null; } };
const pkey = (name, image) => String(name) + "\u0000" + String(image || "");

/* The store's products with their own type fields, keyed by name + photo. */
function productMeta(key, meta, rules, root) {
  const m = new Map();
  try {
    const list = SLICED_STORES[key] ? storeProducts(key, root) : genericItems(key, meta, rules, root).items;
    for (const p of list) m.set(pkey(p.name, p.image), p);
  } catch { /* no catalogue: the title alone answers */ }
  return m;
}

function judge(store, label, products) {
  const kind = sectionKind(label);
  const out = [];
  if (kind === "mixed") return out;
  const shoes = products.filter((p) => p.shoe), garments = products.filter((p) => !p.shoe && p.garment);
  const sample = (l) => l.slice(0, 6).map((p) => p.name);
  if (kind === "accesorios") {
    if (shoes.length) out.push({ cls: "SHOE_IN_ACCESORIOS", n: shoes.length, items: sample(shoes) });
    if (garments.length) out.push({ cls: "GARMENT_IN_ACCESORIOS", n: garments.length, items: sample(garments) });
    const genuine = products.length - shoes.length - garments.length;
    if (products.length >= MIN_JUDGED && genuine < products.length * MISLABEL_SHARE) out.push({ cls: "MISLABELED_SECTION", n: products.length - genuine, items: [`${genuine} of ${products.length} genuine`] });
  } else if (kind === "ropa") {
    if (shoes.length) out.push({ cls: "SHOE_IN_ROPA", n: shoes.length, items: sample(shoes) });
  } else if (kind === "shoe") {
    const non = products.filter((p) => !p.shoe);
    if (non.length) out.push({ cls: "NONSHOE_IN_SHOES", n: non.length, items: sample(non) });
    if (products.length >= MIN_JUDGED && non.length > products.length * (1 - MISLABEL_SHARE)) out.push({ cls: "MISLABELED_SECTION", n: non.length, items: [`${products.length - non.length} of ${products.length} genuine`] });
  } else if (shoes.length) out.push({ cls: "SHOE_IN_OTHER", n: shoes.length, items: sample(shoes) });
  return out;
}

export function auditStore(key, ctx, root = ROOT) {
  const idx = readJson(root, `assets/tienda/${key}/index.json`);
  const fn = loadStore(key, [root]);
  const rep = { store: key, label: idx ? idx.label : key, count: idx ? idx.count : 0, sections: 0, defects: [], counts: {} };
  if (!idx || !fn) { rep.defects.push({ where: "store", cls: "COUNT_MISMATCH", n: 1, items: ["no storefront files"] }); return rep; }
  const meta = ctx.stores[key] || { label: idx.label, files: [] };
  const pm = productMeta(key, meta, ctx.rules, root);
  const rows = fn.rows;
  const famOf = new Map();
  for (const [rk, list] of Object.entries(fn.rails || {})) if (/^t-[^~]+$/.test(rk)) for (const i of list) if (!famOf.has(i)) famOf.set(i, rk.slice(2));
  /* One verdict per row, computed once. */
  const P = rows.map((r, i) => {
    const raw = pm.get(pkey(r[0], r[5])) || { name: r[0], brand: r[1] };
    const p = { name: r[0], brand: r[1], type: raw.type || "", dept: raw.dept || r[6] || "", gender: raw.gender || "", retailer: key, i };
    p.shoe = isShoeItem(p, key);
    p.garment = !!garmentFamily(p.name);
    p.fam = famOf.get(i) || "";
    const famForAud = p.shoe ? "zapatos" : p.fam || "ropa";
    p.aud = audienceOf(p, famForAud);
    p.wear = p.shoe || p.garment || WEARABLE.has(p.fam);
    return p;
  });
  const add = (where, list) => { for (const d of list) rep.defects.push({ where, ...d }); };
  const section = (where, label, idxList, claimed) => {
    rep.sections++;
    const prods = idxList.map((i) => P[i]).filter(Boolean);
    add(where, judge(key, label, prods));
    if (claimed != null && claimed !== idxList.length) rep.defects.push({ where, cls: "COUNT_MISMATCH", n: Math.abs(claimed - idxList.length), items: [`claims ${claimed}, opens ${idxList.length}`] });
  };
  const rowIdx = new Map(rows.map((r, i) => [r, i]));
  const grouped = (where, idxList) => {
    const s = { ...fn, _rowIndex: rowIdx };
    for (const g of groupsOf(s, idxList.map((i) => rows[i]), [root])) section(`${where} › Ver todo › ${g.t}`, g.t, g.rows.map((r) => rowIdx.get(r)), null);
  };
  /* 1. Count truth of the store itself. */
  if (idx.count !== rows.length || fn.count !== rows.length) rep.defects.push({ where: "store", cls: "COUNT_MISMATCH", n: Math.abs(idx.count - rows.length), items: [`index ${idx.count}, fn ${fn.count}, rows ${rows.length}`] });
  /* 2. Every rail, its sub-carousels, its «Ver todo». */
  for (const r of idx.rails || []) {
    const list = fn.rails[r.key] || [];
    section(`rail ${r.title}`, r.key.startsWith("b-") ? MIXED : r.title, list, r.total);
    for (const s of r.subs || []) section(`rail ${r.title} › ${s.t}${s.a ? " " + s.a : ""}`, s.t, fn.rails[s.k] || [], s.n);
    if (r.key.startsWith("b-")) {
      const other = list.filter((i) => String(rows[i][1]).toLowerCase().trim() !== String(r.title).toLowerCase().trim());
      if (other.length) rep.defects.push({ where: `rail ${r.title}`, cls: "BRAND_MISMATCH", n: other.length, items: other.slice(0, 6).map((i) => rows[i][1] + ": " + rows[i][0]) });
    }
    grouped(`rail ${r.title}`, list);
  }
  /* 3. Every chip (department / audience pill), its subs, its railed view. */
  const chips = idx.chips || {};
  const chipList = chips.mode === "facet"
    ? [...(chips.genders || []).map((g) => ({ label: g.label, count: g.count, idx: rows.map((r, i) => (r[7] === g.key ? i : -1)).filter((i) => i >= 0) })),
       ...(chips.cats || []).map((c) => ({ label: c.label, count: c.count, idx: rows.map((r, i) => (r[8] === c.key ? i : -1)).filter((i) => i >= 0) }))]
    : (chips.depts || []).map((d) => ({ label: d.label, key: d.key, count: d.count, subs: d.subs,
      idx: (fn.chips && fn.chips[d.key]) || rows.map((r, i) => (r[6] === d.key ? i : -1)).filter((i) => i >= 0) }));
  const AUD_LABELS = { Hombre: "men", Mujer: "women", "Niños": "kids", "Moda Hombre": "men", "Moda Mujer": "women", "Moda Niños": "kids" };
  /* A wearable whose data names no audience counts for both adults where
     anyone wears its family (build-store-slices UNISEX_FAMILIES). */
  const trueAud = (u) => P.filter((p) => p.wear && (p.aud === u || (u !== "kids" && !p.aud && (p.shoe || p.garment || UNISEX.has(p.fam))))).length;
  for (const c of chipList) {
    const isAud = AUD_LABELS[c.label];
    section(`chip ${c.label}`, isAud ? MIXED : c.label, c.idx, c.count);
    for (const s of c.subs || []) section(`chip ${c.label} › ${s.t}`, s.t, fn.rails[s.k] || [], s.n);
    grouped(`chip ${c.label}`, c.idx);
    if (isAud) {
      const t = trueAud(isAud);
      rep.counts["chip " + c.label] = [c.count, t];
      if (t >= MIN_JUDGED && c.count < t * AUDIENCE_SHARE) rep.defects.push({ where: `chip ${c.label}`, cls: "AUDIENCE_COLLAPSE", n: t - c.count, items: [`shows ${c.count} of the store's ${t} ${c.label.toLowerCase()} wearables`] });
    }
  }
  /* 4. The filter bar: every type facet and every audience facet. */
  const nav = ctx.nav[key] || [];
  const byT = new Map();
  nav.forEach((r, i) => { const k = r.t.label; if (!byT.has(k)) byT.set(k, []); byT.get(k).push(i); });
  for (const [label, list] of byT) section(`filtro Tipo › ${label}`, label, list, null);
  for (const [u, label] of [["men", "Hombre"], ["women", "Mujer"], ["kids", "Niños"]]) {
    const n = nav.filter((r) => (u === "kids" ? r.u === "kids" : r.u === u || r.u === "unisex")).length;
    const t = trueAud(u);
    rep.counts["filtro " + label] = [n, t];
    /* An option the bar does not offer (0) collapses nothing. */
    if (n > 0 && t >= MIN_JUDGED && n < t * AUDIENCE_SHARE) rep.defects.push({ where: `filtro Para ${label}`, cls: "AUDIENCE_COLLAPSE", n: t - n, items: [`shows ${n} of the store's ${t} ${label.toLowerCase()} wearables`] });
  }
  /* 5. True shoe count: the shoes the store sells against what its shoe sections hold. */
  const shoeIdx = P.filter((p) => p.shoe).map((p) => p.i);
  const inShoeRails = new Set();
  for (const r of idx.rails || []) if (sectionKind(r.title) === "shoe") for (const i of fn.rails[r.key] || []) inShoeRails.add(i);
  /* A store with fewer shoes than a rail's minimum (build-store-slices
     RAIL_MIN) keeps them in its shared «Más de» rail: there, they are home. */
  const thinShoes = !inShoeRails.size && shoeIdx.length < RAIL_MIN;
  if (thinShoes) for (const r of idx.rails || []) if (/^(t|d)-mas$/.test(r.key)) for (const i of fn.rails[r.key] || []) inShoeRails.add(i);
  rep.counts.zapatos = [inShoeRails.size, shoeIdx.length];
  if (!thinShoes && shoeIdx.length >= MIN_JUDGED && shoeIdx.filter((i) => inShoeRails.has(i)).length < shoeIdx.length * UNDERCOUNT_SHARE) {
    const out = shoeIdx.filter((i) => !inShoeRails.has(i));
    rep.defects.push({ where: "store › Zapatos", cls: "ZAPATOS_UNDERCOUNT", n: out.length, items: [`Zapatos shows ${inShoeRails.size}; the store sells ${shoeIdx.length} shoes`, ...out.slice(0, 5).map((i) => rows[i][0])] });
  }
  /* 6. Inbound: the homepage surfaces carrying this store's products. */
  const byName = new Map();
  for (const p of pm.values()) if (!byName.has(p.name)) byName.set(p.name, p);
  inbound(key, rep, ctx, root, idx, fn, byName);
  return rep;
}

/* What a homepage surface promises, by its own key. */
function inboundKind(k) {
  if (/(^|-)(zapatos|zapatillas|sandalias)(-|$)/.test(k)) return "shoe";
  if (/(^|-)(joyas|billeteras|lentes|bano|interior|lenceria|cinturones|gorras|relojes|mochilas|carteras|bolsos|perfumes|maquillaje|cabello|tops|vestidos|accesorios|ropa)(-|$)/.test(k)) return "nonshoe";
  return "mixed";
}
/* A card carries no type: the store's own record (by title) answers. */
function cardShoe(c, key, byName) {
  const name = c.title || c.t || c.name;
  const own = byName && byName.get(name);
  return isShoeItem({ name, brand: c.brand || c.b || (own && own.brand) || "", type: (own && own.type) || "", dept: (own && own.dept) || "" }, key);
}
function inbound(key, rep, ctx, root, idx, fn, byName) {
  const check = (where, kind, cards) => {
    const mine = cards.filter((c) => (c.retailer || c.r) === key);
    if (!mine.length) return;
    rep.sections++;
    if (kind === "mixed") return;
    if (kind === "shoe") {
      const bad = mine.filter((c) => !cardShoe(c, key, byName));
      if (bad.length) rep.defects.push({ where, cls: "INBOUND_NONSHOE_IN_SHOES", n: bad.length, items: bad.slice(0, 6).map((c) => c.title || c.t) });
    } else {
      const bad = mine.filter((c) => cardShoe(c, key, byName));
      if (bad.length) rep.defects.push({ where, cls: "INBOUND_SHOE_IN_NONSHOE", n: bad.length, items: bad.slice(0, 6).map((c) => c.title || c.t) });
    }
  };
  /* Store pills above the store's homepage rail: label-true, counts true. */
  const row = readJson(root, `assets/home/store-pills/${key}.json`);
  for (const p of (row && row.pills) || []) {
    const f = readJson(root, `assets/home/store-pills/${key}-${p.k}.json`) || { cards: [] };
    const kind = sectionKind(p.label) === "shoe" ? "shoe" : sectionKind(p.label) === "mixed" ? "mixed" : "nonshoe";
    check(`home store pill ${p.label}`, kind, f.cards.map((c) => ({ ...c, retailer: key })));
    if (sectionKind(p.label) === "accesorios") {
      const g = f.cards.filter((c) => garmentFamily(c.title) && !cardShoe(c, key, byName));
      if (g.length) rep.defects.push({ where: `home store pill ${p.label}`, cls: "GARMENT_IN_ACCESORIOS", n: g.length, items: g.slice(0, 6).map((c) => c.title) });
    }
    const base = p.k.replace(/-(women|men|kids)$/, "");
    const rail = (idx.rails || []).find((r) => r.key === "t-" + p.k) || null;
    if (rail && rail.total !== p.n) rep.defects.push({ where: `home store pill ${p.label}`, cls: "INBOUND_COUNT_MISMATCH", n: Math.abs(rail.total - p.n), items: [`pill ${p.n}, store aisle ${rail.total}`] });
    void base;
  }
  for (const f of ctx.homeFiles) {
    const kind = inboundKind(f.k);
    check(`home ${f.where}`, kind, f.cards);
  }
}

function homeFiles(root) {
  const out = [];
  const dir = (d) => (existsSync(join(root, d)) ? readdirSync(join(root, d)).filter((f) => f.endsWith(".json") && f !== "index.json") : []);
  for (const f of dir("assets/home/category-pills")) {
    const j = readJson(root, "assets/home/category-pills/" + f);
    if (j && Array.isArray(j.cards)) out.push({ where: "category pill " + f.replace(/\.json$/, ""), k: String(j.c || f.replace(/\.json$/, "")), cards: j.cards });
  }
  for (const f of dir("assets/home/pills")) {
    const j = readJson(root, "assets/home/pills/" + f);
    if (j && Array.isArray(j.cards)) out.push({ where: "pill " + f.replace(/\.json$/, ""), k: f.replace(/\.json$/, ""), cards: j.cards });
  }
  for (const f of dir("assets/home/shelves")) {
    const j = readJson(root, "assets/home/shelves/" + f);
    if (j && Array.isArray(j.picks)) out.push({ where: "shelf " + f.replace(/\.json$/, ""), k: f.replace(/\.json$/, ""), cards: j.picks });
  }
  return out;
}

/** Every storefront with a first screen (--all: beyond the carousel). */
export function allStores(root = ROOT) {
  return readdirSync(join(root, "assets/tienda")).filter((k) => k !== "_fn" && existsSync(join(root, "assets/tienda", k, "index.json")) && !isOffSaleRetailer(k));
}
export async function auditAll(root = ROOT, only = null, every = false) {
  /* The page-lift helpers read <root>index.html: a root is a directory path ending in "/". */
  if (!root.endsWith("/")) root += "/";
  const keys = (every ? allStores(root) : carouselStores(root)).filter((k) => !only || only.includes(k));
  const ctx = { stores: tiendaStores(root), rules: loadStoreRules(root), nav: {}, homeFiles: homeFiles(root) };
  for (const k of keys) ctx.nav[k] = (await rowsOf({ tienda: k }, [root])) || [];
  const reports = keys.map((k) => auditStore(k, ctx, root));
  return { stores: reports, rollup: rollup(reports) };
}

export function rollup(reports) {
  const byClass = {};
  for (const c of CLASSES) byClass[c] = { stores: 0, sections: 0, items: 0 };
  for (const r of reports) {
    const seen = new Set();
    for (const d of r.defects) {
      const b = byClass[d.cls] || (byClass[d.cls] = { stores: 0, sections: 0, items: 0 });
      b.sections++; b.items += d.n || 0;
      if (!seen.has(d.cls)) { seen.add(d.cls); b.stores++; }
    }
  }
  const defective = reports.filter((r) => r.defects.length).length;
  return { stores: reports.length, defective, clean: reports.length - defective, sections: reports.reduce((n, r) => n + r.sections, 0), byClass };
}

export function printReport({ stores, rollup: R }) {
  console.log(`STORES ${R.stores}: ${R.defective} with defects, ${R.clean} clean (${R.sections} sections checked)`);
  for (const [c, b] of Object.entries(R.byClass).sort((a, b) => b[1].stores - a[1].stores)) if (b.sections) console.log(`  ${c.padEnd(24)} ${String(b.stores).padStart(3)} stores  ${String(b.sections).padStart(5)} sections  ${String(b.items).padStart(6)} items`);
  console.log("");
  for (const r of stores) {
    const z = r.counts.zapatos || [0, 0];
    console.log(`${r.store.padEnd(18)} ${String(r.count).padStart(6)} products  ${String(r.sections).padStart(4)} sections  zapatos ${z[0]}/${z[1]}  ${r.defects.length ? r.defects.length + " defects" : "CLEAN"}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const oi = process.argv.indexOf("--only");
  const only = oi > 0 ? String(process.argv[oi + 1] || "").split(",").filter(Boolean) : null;
  const ji = process.argv.indexOf("--json");
  const out = await auditAll(ROOT, only, process.argv.includes("--all"));
  printReport(out);
  if (ji > 0) writeFileSync(process.argv[ji + 1], JSON.stringify(out, null, 1));
  if (process.argv.includes("--details")) for (const r of out.stores) for (const d of r.defects) console.log(`${r.store} | ${d.cls} | ${d.where} | ${d.n} | ${d.items.join(" ; ")}`);
}
