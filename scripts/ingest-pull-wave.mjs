#!/usr/bin/env node
/* ============================================================
   THE 2026-11-03 PULL WAVE, INTO THE CATALOGUES (#443, Danny's voice
   order: "Pull all of them... make sure that we're pulling colors and
   sizes", then "We need makeup").

   Lucifer's delivery (branch data/pull-wave-2026-11-03) is committed as
   data/pull-wave-2026-11-03/ (REPORT.md per store). This merges it into
   the served catalogues, in each file's own format:

     bbw/bathandbodyworks-catalog.json   Bath & Body Works' first catalogue
                                         (143) -> beauty-catalog.json
                                         retailers.bathandbodyworks (the
                                         registry's catalog: "beauty")
     pacsun/pacsun-catalog-delta.json    +44 -> pacsun-catalog.json
     ulta/ulta-catalog-delta.json        +250 -> ulta-catalog.json
     ulta/ulta-makeup-delta.json         +473 -> ulta-catalog.json
     yesstyle/yesstyle-catalog-delta.json +89 -> yesstyle-catalog.json
     yesstyle/yesstyle-makeup-delta.json +331 -> yesstyle-catalog.json
     sephora/sephora-makeup-delta.json   +129 -> beauty-catalog.json
                                         retailers.sephora
     dsw/REPORT.md                       nothing delivered (DataDome)

   THE RULES (Danny's standing ones):
   - WHAT A PRODUCT IS comes from the product itself -- the store's own
     breadcrumb (Bath & Body Works) and the head noun of its title --
     never the brand and never the search query that found it (Ulta's
     "fragrance" search returns body mists and lotions; PacSun's delta
     filed Chuck Taylors under «Tops»). The aisle a product is filed
     under (its department bucket) and its `type` are set here.
   - No image, no card: a row with no real photo or no price is left out
     (counted).
   - No size, no sale: PacSun's variant units came without their size
     labels, so the garments and shoes are sizesPending (shown, «Tallas
     por confirmar»; scripts/lib/sizes-pending-data.js). The PacSun 18
     already live move from «Deportes» (sporting_goods) to Ropa
     (clothing): they are jeans and hoodies.
   - A listing's own shade SKU rides in its URL (Ulta ?sku=, Sephora
     ?skuId=) as in the rest of each catalogue: the delivery's `sku` is
     the listing's own SKU (its photo is that SKU's), and that is how a
     shade pull meets the listing (scripts/lib/variant-families.mjs
     shadeSkuOf).
   - THE SHADES THE DELIVERY CARRIES IN ITS ROWS (Sephora: 911 on 108
     products; Ulta: 3,332 on 180) are written, unchanged, in the shade
     pull's own shape (data/shade-pull-worklist-2026-11-02/README.md) as
     data/pull-wave-2026-11-03/dataset-<store>-makeup-delta.json, so
     scripts/ingest-variant-pulls.mjs reads them like every other shade
     pull. Ulta's rows name no photo per shade: each takes Ulta's
     canonical per-SKU media URL (media.ultainc.com/i/ulta/<sku>), the
     convention the shade pull itself uses and verified on all 180 of its
     products, and the one every Ulta listing's own photo already follows.
     A shade is never added that the data does not list.
   - YesStyle's makeup rows carry one variant string each (the listing's
     own shade from the search row, "#06 Under Chili"). The site's variant
     rules read a shade from a title or a shade pull, never from a size
     field, so those rows stay gated («Tonos en camino») until a real
     shade pull lands; the string is kept as `variantText` and is not
     offered as a size.
   - Spanish copy: the description is the stored Spanish
     (scripts/data/descriptions-es/<store>.json) when there is one; the
     delivery's English is kept as description_en and never shown.

   Idempotent: a product already in its catalogue (same store, same
   product page) is not added twice.

     node scripts/ingest-pull-wave.mjs [--dry]
   then the generator chain (store slices, Ofertas, search, departments,
   brands, PDP shards, prices, home, doors, destinations).
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serializerFor } from "./lib/gallery-backfill.js";
import { spanishFor } from "./lib/description-es.js";
import { beautyAisle } from "./lib/storefronts.js";
import { sizesPendingKey } from "./lib/sizes-pending.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const WAVE_DIR = "data/pull-wave-2026-11-03";
const DRY = process.argv.includes("--dry");

const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const deltaItems = (rel, store) => Object.values(read(join(WAVE_DIR, rel)).retailers[store].departments).flatMap((d) => (Array.isArray(d) ? d : d.items || []));
export const baseUrl = (u) => String(u || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
const httpUrl = (u) => (typeof u === "string" && /^https?:\/\/[^\s\/?#]+/i.test(u.trim()) ? u.trim() : "");
const withParam = (url, k, v) => (v ? String(url).replace(/[?#].*$/, "") + "?" + k + "=" + encodeURIComponent(String(v)) : String(url));

/* ---------------- what a product is ---------------- */
const PERFUME_RX = /\b(eau de (?:parfum|toilette|cologne)|parfum|perfume|cologne|fragrance mist|body mist|hair (?:&|and) body mist|fine fragrance|fragrance)\b/i;
const MIST_RX = /\b(mists?|body sprays?)\b/i;

/* Bath & Body Works: the store's own breadcrumb, read with the title's noun. */
export function bbwFile(it) {
  const crumbs = (it.breadcrumbs || []).slice(1, -1).join(" > ").toLowerCase();
  const n = String(it.name || "");
  if (/gift (?:bag|box)/i.test(n)) return { bucket: "regalos", type: "Bolsas de regalo" };
  if (/\bgift set\b/i.test(n)) return { bucket: "beauty", type: "Sets de regalo" };
  if (/\bcandle holder\b|\bpedestal\b/i.test(n)) return { bucket: "casa_velas", type: "Accesorios para velas" };
  if (/\bcandles?\b/i.test(n)) return { bucket: "casa_velas", type: "Velas" };
  if (/wallflowers|room spray|car fragrance|fragrance (?:holder|diffuser)|hanging .*diffuser|diffuser/i.test(n) || /wallflowers|room spray/.test(crumbs))
    return { bucket: "casa_velas", type: "Aromas para el hogar" };
  if (/\bdispenser\b/i.test(n)) return { bucket: "casa_cama_bano", type: "Accesorios de baño" };
  if (/\bholder\b/i.test(n)) return { bucket: "accesorios", type: "Accesorios" };
  if (/\blip (?:oil|gloss|balm)\b/i.test(n)) return { bucket: "beauty", type: "Labios" };
  if (/\b(eau de parfum|cologne|perfume)\b/i.test(n)) return { bucket: "fragrance", type: "Fragancia" };
  if (MIST_RX.test(n)) return { bucket: "fragrance", type: "Bruma corporal" };
  if (/hand (?:soap|sanitizer)|pocketbac|foaming (?:hand soap|refill)|sanitizer/i.test(n)) return { bucket: "beauty", type: "Cuidado de manos" };
  if (/hand cream/i.test(n)) return { bucket: "beauty", type: "Cuidado de manos" };
  return { bucket: "beauty", type: "Cuidado corporal" };
}

/* Bath & Body Works' aisles, labelled ({ label, items }: the department
   builders read a labelled bucket, scripts/build-department-slices.mjs). */
export const BBW_LABELS = { beauty: "Cuidado corporal", fragrance: "Fragancias", casa_velas: "Velas y aromas", casa_cama_bano: "Baño", accesorios: "Accesorios", regalos: "Regalos" };

/* Ulta: the head noun decides; the search's aisle only where no noun says. */
const ULTA_AISLE_TYPE = { piel: "Cuidado de la piel", cabello: "Cabello", cuerpo: "Baño y cuerpo", herramientas: "Herramientas de belleza", unas: "Belleza" };
const ULTA_QUERY_TYPE = { "Cuidado del Cabello": "Cabello", "Fragancias": "Fragancia", "Cuidado de la Piel": "Cuidado de la piel" };
export function ultaType(it) {
  const t = String(it.type || "");
  const n = String(it.name || "");
  const a = beautyAisle(it);
  if (a === "herramientas" && /\b(brush(?:es)?|combs?|sharpeners?|curlers?|sponges?|dryers?|irons?|tweezers?|mirrors?|bags?)\b/i.test(n)) return "Herramientas de belleza";
  if (/^(Rostro|Labios|Ojos)$/.test(t)) return t;
  if (t === "Fragancias") {
    if (/\b(eau de (?:parfum|toilette|cologne)|parfum|perfume|cologne)\b/i.test(n)) return "Fragancia";
    if (PERFUME_RX.test(n) && !/\b(shampoo|conditioner|lotion|body wash|shower gel|deodorant|cream)\b/i.test(n)) return "Fragancia";
    return (a && ULTA_AISLE_TYPE[a]) || "Fragancia";
  }
  if (/\b(body wash|shower gel|body lotion|body scrub|body oil)\b/i.test(n)) return "Baño y cuerpo";
  if (t === "Cuidado del Cabello" && /\b(shave|shaving)\b/i.test(n) && !/\bshampoo\b/i.test(n)) return "Cuidado de la piel";
  return ULTA_QUERY_TYPE[t] || t || "Belleza";
}
/* YesStyle: the catalogue's own aisle names. */
export function yesstyleType(it) {
  const n = String(it.name || "");
  if (String(it.type) === "Maquillaje") {
    if (/\blip|\btint\b|lipstick|gloss/i.test(n)) return "Labios";
    if (/\b(eyes?|eyeliner|eyeshadow|lash(?:es)?|brows?|eyebrows?|mascara|liner)\b/i.test(n)) return "Ojos";
    return "Maquillaje";
  }
  if (/\b(sunscreen|sun (?:cream|stick|serum|essence|gel|milk)|spf\s*\d+|uv)\b/i.test(n)) return "Protector Solar";
  if (/\b(serum|ampoule|essence)\b/i.test(n)) return "Sérums";
  if (/\b(moisturi[sz]er|cream|lotion|emulsion|gel)\b/i.test(n)) return "Hidratantes";
  return "Cuidado de la Piel";
}
/* PacSun: the garment or shoe the title names. */
const PAC_SHOE = /\b(shoes?|sneakers?|sandals?|slides?|clogs?|boots?|high tops?)\b/i;
const PAC_HAT = /\b(hats?|caps?|beanies?|snapbacks?)\b/i;
export function pacsunType(it) {
  const n = String(it.name || "");
  if (PAC_SHOE.test(n)) return "Calzado";
  if (PAC_HAT.test(n)) return "Gorras";
  if (/\bjeans?\b/i.test(n)) return "Jeans";
  if (/\b(dress)\b/i.test(n)) return "Vestidos";
  if (/\b(bikini|swimsuit|one piece)\b/i.test(n)) return "Trajes de baño";
  if (/\b(shorts?)\b/i.test(n)) return "Shorts";
  if (/\b(sweatpants|pants|joggers?)\b/i.test(n)) return "Pantalones";
  if (/\b(hoodie|sweatshirt|crew neck)\b/i.test(n)) return "Sudaderas";
  if (/\b(jacket)\b/i.test(n)) return "Chaquetas";
  if (/\b(t-shirt|tee|top|jersey|tank)\b/i.test(n)) return "Polos y tops";
  return "Ropa";
}

/* ---------------- one served row ---------------- */
const realImage = (it) => [it.image, ...(Array.isArray(it.images) ? it.images : [])].map(httpUrl).find(Boolean) || "";
export function servedRow(it, store, extra = {}) {
  const image = realImage(it);
  const price = Number(it.price);
  if (!image || !(price > 0) || !String(it.name || "").trim()) return null;
  const images = [...new Set([image, ...(Array.isArray(it.images) ? it.images.map(httpUrl).filter(Boolean) : [])])];
  const row = { name: String(it.name).trim() };
  if (it.brand) row.brand = String(it.brand);
  row.price = price;
  row.image = image;
  row.images = images;
  row.url = it.url;
  if (it.rating != null && Number(it.rating) > 0) row.rating = Number(it.rating);
  if (it.reviewCount != null && Number(it.reviewCount) > 0) row.reviewCount = Number(it.reviewCount);
  row.onSale = Boolean(it.onSale && Number(it.originalPrice) > price);
  if (row.onSale) row.originalPrice = Number(it.originalPrice);
  if (Array.isArray(it.availableSizes)) row.availableSizes = it.availableSizes.slice();
  if (Number(it.weightKg) > 0) { row.weightKg = Number(it.weightKg); row.weightEstimated = it.weightEstimated !== false; }
  row.retailer = store;
  if (it.sku) row.sku = String(it.sku);
  if (it.productId) row.productId = it.productId;
  if (it.priceRange) row.priceRange = it.priceRange;
  Object.assign(row, extra);
  const en = String(it.description || "").trim();
  if (en) {
    const es = spanishFor(store, en);
    if (es) row.description = es;
    row.description_en = en;
  }
  return row;
}

/* ---------------- the shades the rows carry, in the pull's shape ---------------- */
function shadeRows(items, store) {
  const out = [];
  for (const it of items) {
    const shades = Array.isArray(it.shades) ? it.shades.filter((s) => s && s.skuId && String(s.name || "").trim()) : [];
    if (!shades.length) continue;
    const listingUrl = it.__url;
    const variantList = shades.map((s) => {
      const sku = String(s.skuId);
      const url = store === "ulta" ? withParam(it.url, "sku", sku) : httpUrl(s.url) || withParam(it.url, "skuId", sku);
      const image = store === "ulta" ? "https://media.ultainc.com/i/ulta/" + sku : httpUrl(s.image);
      const v = { usItemId: sku, url, variants: ["actual_color-" + String(s.name).trim()] };
      const p = Number(s.price) > 0 ? Number(s.price) : 0;
      if (p) v.priceInfo = { price: p };
      if (image) { v.imageUrl = image; v.allImages = [image]; }
      v.availabilityStatus = s.inStock === false ? "OUT_OF_STOCK" : "IN_STOCK";
      return v;
    });
    out.push({ usItemId: String(it.sku), name: it.name, brand: it.brand || "", url: listingUrl, variantList });
  }
  return out;
}

/* ---------------- merging into a catalogue file ---------------- */
function loadCatalogue(rel) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  const ser = serializerFor(text);
  if (!ser) throw new Error(rel + ": unknown JSON format");
  return { rel, obj: ser.parse(text), ser };
}
function saveCatalogue(c) {
  if (DRY) return;
  writeFileSync(join(ROOT, c.rel), c.ser(c.obj));
}
function bucketList(r, dept, label) {
  r.departments = r.departments || {};
  const d = r.departments[dept];
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.items)) return d.items;
  r.departments[dept] = label ? { label, items: [] } : [];
  return Array.isArray(r.departments[dept]) ? r.departments[dept] : r.departments[dept].items;
}
function allRows(r) {
  return Object.values(r.departments || {}).flatMap((d) => (Array.isArray(d) ? d : d && d.items) || []);
}
function countRows(obj) {
  return Object.values(obj.retailers || {}).reduce((a, r) => a + allRows(r).length, 0);
}

export function run() {
  const report = { added: {}, skipped: {}, moved: [], untranslated: {}, sizesPending: 0, shadeDatasets: {}, gatedVariantText: 0, typeFixes: [] };
  const note = (store, k, n = 1) => { report[k][store] = (report[k][store] || 0) + n; };

  /* ---- Bath & Body Works -> beauty-catalog.json ---- */
  const beauty = loadCatalogue("beauty-catalog.json");
  {
    const store = "bathandbodyworks";
    const items = deltaItems("bbw/bathandbodyworks-catalog.json", store);
    const r = beauty.obj.retailers[store] || (beauty.obj.retailers[store] = { label: "Bath & Body Works", departments: {} });
    const have = new Set(allRows(r).map((x) => baseUrl(x.url)));
    for (const it of items) {
      if (have.has(baseUrl(it.url))) continue;
      const f = bbwFile(it);
      const row = servedRow({ ...it, url: httpUrl(it.url) }, store, { type: f.type });
      if (!row) { note(store, "skipped"); continue; }
      if (!row.description && row.description_en) note(store, "untranslated");
      bucketList(r, f.bucket, BBW_LABELS[f.bucket]).push(row);
      have.add(baseUrl(it.url));
      note(store, "added");
    }
  }
  /* ---- Sephora makeup -> beauty-catalog.json ---- */
  const sephShades = [];
  {
    const store = "sephora";
    const items = deltaItems("sephora/sephora-makeup-delta.json", store);
    const r = beauty.obj.retailers[store];
    const have = new Set(allRows(r).map((x) => baseUrl(x.url)));
    const list = bucketList(r, "beauty");
    for (const it of items) {
      const url = withParam(it.url, "skuId", it.sku);
      sephShades.push({ ...it, __url: url });
      if (have.has(baseUrl(it.url))) continue;
      const row = servedRow({ ...it, url }, store, { type: it.type });
      if (!row) { note(store, "skipped"); continue; }
      if (!row.description && row.description_en) note(store, "untranslated");
      list.push(row);
      have.add(baseUrl(it.url));
      note(store, "added");
    }
  }
  saveCatalogue(beauty);

  /* ---- Ulta -> ulta-catalog.json ---- */
  const ulta = loadCatalogue("ulta-catalog.json");
  const ultaShades = [];
  {
    const store = "ulta";
    const r = ulta.obj.retailers[store];
    const have = new Set(allRows(r).map((x) => baseUrl(x.url)));
    const list = bucketList(r, "beauty", "Belleza");
    for (const rel of ["ulta/ulta-catalog-delta.json", "ulta/ulta-makeup-delta.json"]) {
      for (const it of deltaItems(rel, store)) {
        const url = withParam(it.url, "sku", it.sku);
        ultaShades.push({ ...it, __url: url });
        if (have.has(baseUrl(it.url))) continue;
        const type = ultaType(it);
        if (type !== it.type) report.typeFixes.push({ store, name: it.name, from: it.type, to: type });
        const row = servedRow({ ...it, url }, store, { type });
        if (!row) { note(store, "skipped"); continue; }
        if (!row.description && row.description_en) note(store, "untranslated");
        list.push(row);
        have.add(baseUrl(it.url));
        note(store, "added");
      }
    }
    ulta.obj.declaredProductCount = countRows(ulta.obj);
  }
  saveCatalogue(ulta);

  /* ---- YesStyle -> yesstyle-catalog.json ---- */
  const ys = loadCatalogue("yesstyle-catalog.json");
  {
    const store = "yesstyle";
    const r = ys.obj.retailers[store];
    const pid = (u) => (/\/pid\.(\d+)/i.exec(String(u || "")) || [])[1] || baseUrl(u);
    const have = new Set(allRows(r).map((x) => pid(x.url)));
    const list = bucketList(r, "beauty", "Belleza");
    for (const rel of ["yesstyle/yesstyle-catalog-delta.json", "yesstyle/yesstyle-makeup-delta.json"]) {
      const makeup = /makeup/.test(rel);
      for (const it of deltaItems(rel, store)) {
        if (have.has(pid(it.url))) continue;
        const type = yesstyleType(it);
        if (type !== it.type) report.typeFixes.push({ store, name: it.name, from: it.type, to: type });
        const extra = { type };
        let src = it;
        /* A makeup row's variant string is its shade, not a size. */
        if (makeup) {
          const vt = (it.availableSizes || []).concat((it.shades || []).map((s) => s && s.name)).filter(Boolean);
          src = { ...it, availableSizes: [] };
          if (vt.length) { extra.variantText = [...new Set(vt)]; report.gatedVariantText++; }
        }
        const row = servedRow(src, store, extra);
        if (!row) { note(store, "skipped"); continue; }
        if (!row.description && row.description_en) note(store, "untranslated");
        list.push(row);
        have.add(pid(it.url));
        note(store, "added");
      }
    }
    ys.obj.declaredProductCount = countRows(ys.obj);
  }
  saveCatalogue(ys);

  /* ---- PacSun -> pacsun-catalog.json ---- */
  const pac = loadCatalogue("pacsun-catalog.json");
  const pending = [];
  {
    const store = "pacsun";
    const r = pac.obj.retailers[store];
    /* The 18 already live are clothing, not «Deportes». */
    if (r.departments.sporting_goods) {
      const old = r.departments.sporting_goods;
      const items = Array.isArray(old) ? old : old.items || [];
      const list = bucketList(r, "clothing", "Ropa");
      for (const x of items) list.push(x);
      report.moved.push({ store, from: "sporting_goods", to: "clothing", n: items.length });
      delete r.departments.sporting_goods;
    }
    const have = new Set(allRows(r).map((x) => baseUrl(x.url)));
    const list = bucketList(r, "clothing", "Ropa");
    for (const it of deltaItems("pacsun/pacsun-catalog-delta.json", store)) {
      if (have.has(baseUrl(it.url))) continue;
      const type = pacsunType(it);
      if (type !== it.type) report.typeFixes.push({ store, name: it.name, from: it.type, to: type });
      /* The variant units are real, their size labels did not come: shown, not sold. */
      const units = Array.isArray(it.variants) ? it.variants.length : 0;
      const row = servedRow({ ...it, availableSizes: [] }, store, { type, sizesPending: true, ...(units ? { variantUnits: units } : {}) });
      if (!row) { note(store, "skipped"); continue; }
      delete row.availableSizes;
      if (!row.description && row.description_en) note(store, "untranslated");
      list.push(row);
      have.add(baseUrl(it.url));
      pending.push(sizesPendingKey(store, row.name));
      note(store, "added");
    }
    pac.obj.declaredProductCount = countRows(pac.obj);
  }
  saveCatalogue(pac);
  report.sizesPending = pending.length;

  /* ---- the sizes-pending list (page + order door), PacSun's added ---- */
  if (!DRY && pending.length) {
    const cur = readFileSync(join(ROOT, "scripts/lib/sizes-pending-data.js"), "utf8");
    const list = JSON.parse(/export const SIZES_PENDING = (\[.*\]);/.exec(cur)[1]);
    const all = [...new Set([...list, ...pending])].sort();
    writeFileSync(join(ROOT, "scripts/lib/sizes-pending-data.js"),
      "/* GENERATED by scripts/build-pull-catalogs.mjs -- the items shown but not sold until their sizes are confirmed\n" +
      "   (scripts/lib/sizes-pending.js). Do not edit by hand. */\n" +
      "export const SIZES_PENDING = " + JSON.stringify(all) + ";\n");
    writeFileSync(join(ROOT, "assets/data/sizes-pending.json"), JSON.stringify(all));
  }

  /* ---- the shades the rows carry -> shade-pull datasets ---- */
  for (const [store, items] of [["sephora", sephShades], ["ulta", ultaShades]]) {
    const rows = shadeRows(items, store);
    report.shadeDatasets[store] = { products: rows.length, shades: rows.reduce((a, r) => a + r.variantList.length, 0) };
    if (!DRY) writeFileSync(join(ROOT, WAVE_DIR, `dataset-${store}-makeup-delta.json`), JSON.stringify(rows, null, 1) + "\n");
  }
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(join(ROOT, WAVE_DIR))) { console.error("missing " + WAVE_DIR); process.exit(1); }
  const r = run();
  const fixes = r.typeFixes;
  delete r.typeFixes;
  console.log(JSON.stringify(r, null, 1));
  console.log("type corrections by the product's own noun: " + fixes.length);
  for (const f of fixes) if (process.argv.includes("--verbose")) console.log("  " + f.store + ": " + f.name + ": " + f.from + " -> " + f.to);
}
