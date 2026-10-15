#!/usr/bin/env node
/* ============================================================
   CLASSIFICATION CENSUS (2026-10-13 audit, made repeatable).

   Runs the page's OWN classifiers -- lifted out of index.html, not
   copied -- over every committed catalogue, the way the page loads them
   (normalizeCatalogueEnvelope, aliasEnvelopeTitles, repairNativeTypes
   when the page has it). Reports, per surface, how many items each
   section holds and how many of those are the wrong kind of thing.

   USAGE
     node scripts/census-classification.mjs                 # this checkout
     node scripts/census-classification.mjs --html <file>   # another index.html
     node scripts/census-classification.mjs --json          # machine-readable

   GROUND TRUTH. "Footwear" below is the branch's isFootwearLoose: the
   published type when it names a kind, the footwear title nouns with
   isFootwear's vetoes, and the shoe-model dictionary for catch-all
   types. It is the same for both sides of a before/after, so the
   comparison is fair; the absolute counts are floors (a shoe with no
   type, no noun and no known model is invisible to it).
   ============================================================ */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { liftDeclarations, pageHtml } from "./lib/page-lift.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export const CLASSIFIER_NAMES = ["FOOTWEAR_TYPE", "FOOTWEAR_TITLE", "CLEAT_HIKER_RX", "NOT_FOOTWEAR", "FOOTWEAR_RETAILERS",
  "OXFORD_CLOTH_RX", "FOOTWEAR_NOUN_NOT_OXFORD", "isFootwearType", "isFootwearTitle", "isFootwear",
  "SHOE_MODEL_RX", "NB_MODEL_RX", "SHOE_MODEL_APPAREL_VETO", "isShoeModel", "CATCHALL_TYPE_RX", "isCatchallType", "BUCKET_TYPE_RX", "isFootwearLoose",
  "LATINO_PRODUCT_TYPES", "latinoProductTypeOfItem", "FOOTWEAR_RX", "NOT_FOOTWEAR_RX", "isShoeItem", "isShoeForFashionRooms",
  "isKidsItem", "KIDS_APPAREL_RX", "isKidsFashionItem", "FRAGRANCE_RX", "WOMEN_FASHION_RX", "WOMEN_NON_APPAREL_RX",
  "isWomenFashionItem", "MEN_MARKER", "WOMEN_MARKER", "KID_MARKER", "isMenFashionItem", "genderFromTitle",
  "isMensShoeItem", "isWomensShoeItem", "isKidsShoeItem",
  "repairNativeTypes", "nativeTypeGroupsFor", "retailerItemsFor", "notQuarantined", "rawTitleOf",
  "aliasEnvelopeTitles", "normalizeCatalogueEnvelope", "DEPT_CACHE_PARTS", "CATALOGUE_FILES"];
const NEW_IN_BRANCH = ["OXFORD_CLOTH_RX", "FOOTWEAR_NOUN_NOT_OXFORD", "SHOE_MODEL_RX", "NB_MODEL_RX", "SHOE_MODEL_APPAREL_VETO", "isShoeModel", "CATCHALL_TYPE_RX",
  "isCatchallType", "BUCKET_TYPE_RX", "isFootwearLoose", "isShoeForFashionRooms", "repairNativeTypes"];

export function loadClassifiers(html) {
  return liftDeclarations(html, CLASSIFIER_NAMES, { optional: NEW_IN_BRANCH });
}

/* The catalogue, merged per retailer the way fetchCatalogPart merges it. */
export function loadCatalogue(P) {
  const retailers = {};
  const files = [...P.DEPT_CACHE_PARTS, ...P.CATALOGUE_FILES];
  const missing = [];
  for (const url of files) {
    const path = ROOT + url.replace(/^\//, "");
    if (!existsSync(path)) { missing.push(url); continue; }
    let env = JSON.parse(readFileSync(path, "utf8"));
    env = P.DEPT_CACHE_PARTS.includes(url) ? P.aliasEnvelopeTitles(env) : P.normalizeCatalogueEnvelope(env);
    if (P.repairNativeTypes) env = P.repairNativeTypes(env);
    for (const [rk, bucket] of Object.entries(env.retailers || {})) {
      const ex = retailers[rk];
      if (ex && ex.departments && bucket && bucket.departments) {
        ex.departments = Object.assign({}, ex.departments, bucket.departments);
        for (const k of Object.keys(bucket)) if (k !== "departments") ex[k] = bucket[k];
      } else retailers[rk] = bucket;
    }
  }
  return { retailers, missing };
}

export function census(P, truth) {
  const { retailers, missing } = loadCatalogue(P);
  const T = truth || P; /* the ground-truth classifiers (the branch's) */
  const isShoe = (it, rk) => T.isFootwearLoose ? T.isFootwearLoose(it, rk, retailers[rk] && retailers[rk].label) : T.isFootwear(it, rk);
  const out = { missing, stores: Object.keys(retailers).length };
  /* Every item once, per retailer (the page's own dedupe). */
  const all = [];
  for (const [rk, r] of Object.entries(retailers)) for (const it of P.retailerItemsFor(r)) all.push([rk, it]);
  out.items = all.length;

  /* M1: latinoProductTypeOfItem. */
  const JEWELRY = /\b(jewelry|jewellery|joyer[ií]a|earrings?|necklaces?|bracelets?|rings?|anillos?|pendants?|charms?|anklets?|brooch(?:es)?|bangles?|chokers?)\b/i;
  const NOT_JEWELRY = /\b(candle|napkin|curtain|shower|key|teething|onion|boxing|binder|o)[-\s]+rings?\b|\bring\s+(?:lights?|doorbells?)\b/i;
  const m1 = {};
  for (const [rk, it] of all) {
    const k = P.latinoProductTypeOfItem({ ...it, retailer: rk });
    const row = m1[k] || (m1[k] = { n: 0, shoes: 0, notJewelry: 0, notShoes: 0 });
    row.n++;
    const shoe = isShoe(it, rk);
    if (shoe) row.shoes++;
    if (k === "joyas" && (shoe || !JEWELRY.test(it.title || it.name || "") || NOT_JEWELRY.test(it.title || it.name || ""))) row.notJewelry++;
    if (k === "zapatos" && !shoe) row.notShoes++;
  }
  out.m1 = m1;
  const traps = {
    "Jordan 6 Rings": { name: "Jordan 6 Rings" },
    "Charmin Ultra Soft Toilet Paper": { name: "Charmin Ultra Soft Toilet Paper" },
    "Spring Dish Towels": { name: "Spring Dish Towels, Set of 4" },
    "Captain America Shield": { name: "Captain America Shield Wall Decal" },
    "Escape Room Game": { name: "Escape Room Game for Adults" },
    "Shattered Wall Decal": { name: "Shattered Glass Wall Decal" },
    "Baggy Jeans": { name: "Women's Baggy Jeans" },
    "Sandalwood Shampoo": { name: "Sandalwood Shampoo 12 oz" },
    "Men's Flat Front Shorts": { name: "Men's Flat Front Shorts" },
    "Ferris Wheel Frame": { name: "Ferris Wheel Picture Frame" },
    "New Balance 1906": { name: "New Balance 1906R", brand: "New Balance" },
    "Nike Pegasus 41": { name: "Nike Pegasus 41 Men's Road Running" },
    "Beach Wall Art": { name: "Beach Sunset Canvas Wall Art" },
  };
  out.m1Traps = Object.fromEntries(Object.entries(traps).map(([k, it]) => [k, P.latinoProductTypeOfItem(it)]));

  /* M3: New Balance's native sections. */
  const nb = retailers.newbalance;
  if (nb) {
    const groups = P.nativeTypeGroupsFor(nb) || [];
    out.nb = {
      sections: groups.map(([t, items]) => ({ type: t, n: items.length, shoes: items.filter(it => isShoe(it, "newbalance")).length })),
      isShoeItem: P.retailerItemsFor(nb).filter(it => P.isShoeItem({ ...it, retailer: "newbalance" })).map(it => `${it.title || it.name} [${it.type || ""}]`),
    };
  }

  /* M5: the Walmart / Target rooms. */
  out.rooms = {};
  const ROOMS = { ropa_hombre: "isMenFashionItem", ropa_mujer: "isWomenFashionItem", ropa_ninos: "isKidsFashionItem",
    zapatos_hombre: "isMensShoeItem", zapatos_mujer: "isWomensShoeItem", zapatos_ninos: "isKidsShoeItem" };
  for (const rk of ["walmart", "target"]) {
    const r = retailers[rk]; if (!r) continue;
    const items = [];
    for (const d of Object.values(r.departments || {})) for (const it of d.items || []) items.push({ ...it, retailer: rk });
    out.rooms[rk] = {};
    for (const [room, fn] of Object.entries(ROOMS)) {
      const inRoom = items.filter(it => P[fn](it));
      const wrong = room.startsWith("ropa") ? inRoom.filter(it => isShoe(it, rk)) : inRoom.filter(it => !isShoe(it, rk));
      out.rooms[rk][room] = { n: inRoom.length, wrong: wrong.length, examples: wrong.slice(0, 4).map(it => it.title || it.name) };
    }
  }

  /* M4: isFootwear catalogue-wide on non-shoes caught by "hiking". */
  out.m4Hiking = all.filter(([rk, it]) => P.isFootwear(it, rk) && /\bhiking\b/i.test(it.title || it.name || "")
    && !/\b(shoes?|boots?|sneakers?|sandals?|hikers?|trail runners?)\b/i.test(it.title || it.name || ""))
    .map(([rk, it]) => `${rk}: ${it.title || it.name}`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--html");
  const html = i > 0 ? readFileSync(process.argv[i + 1], "utf8") : pageHtml(ROOT);
  const P = loadClassifiers(html);
  const T = loadClassifiers(pageHtml(ROOT));
  const res = census(P, T);
  if (process.argv.includes("--json")) { console.log(JSON.stringify(res, null, 1)); process.exit(0); }
  console.log(`${res.items} items, ${res.stores} stores; missing files: ${res.missing.length ? res.missing.join(" ") : "none"}`);
  console.log("M1 latinoProductTypeOfItem:");
  for (const [k, r] of Object.entries(res.m1).sort((a, b) => b[1].n - a[1].n))
    console.log(`  ${k.padEnd(12)} ${String(r.n).padStart(6)}  shoes ${String(r.shoes).padStart(5)}` + (k === "joyas" ? `  not jewelry ${r.notJewelry}` : "") + (k === "zapatos" ? `  not footwear ${r.notShoes}` : ""));
  console.log("  traps:", JSON.stringify(res.m1Traps));
  if (res.nb) {
    console.log("New Balance sections:", res.nb.sections.map(s => `${s.type} ${s.n} (shoes ${s.shoes})`).join(" | "));
    console.log("  isShoeItem over NB:", res.nb.isShoeItem.length, res.nb.isShoeItem.slice(0, 6).join(" | "));
  }
  for (const [rk, rooms] of Object.entries(res.rooms))
    for (const [room, r] of Object.entries(rooms)) console.log(`${rk} ${room.padEnd(15)} ${String(r.n).padStart(5)}  wrong ${r.wrong}` + (r.wrong ? `  e.g. ${r.examples.slice(0, 2).join(" | ")}` : ""));
  console.log("isFootwear via bare 'hiking':", res.m4Hiking.length, res.m4Hiking.slice(0, 5).join(" | "));
}
