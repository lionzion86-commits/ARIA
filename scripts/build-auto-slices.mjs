#!/usr/bin/env node
/* ============================================================
   assets/auto/ — ARIA AUTO'S PARTS, SLICED (#409, track T4).

   WHY. auto.html answered every part search by downloading the whole
   auto-cache.json: 22.5MB of JSON (1.0MB gzipped), parsed on the phone,
   to show one vehicle's brake pads. On the mountain profile (Slow 3G,
   CPU 6x) the first card took 24s. The Mountain Test: no page downloads
   a catalogue.

   WHAT THIS WRITES (all from the committed auto-cache.json and the
   shared part-name glossary scripts/lib/es-en-parts-glossary.json; it
   never calls a retailer):

     assets/auto/index.json          parts (Spanish name, Spanish
                                     synonyms, English names), the
                                     vehicles that have cached parts and
                                     which parts each has, the glossary
                                     terms we do not stock yet
     assets/auto/v/<vehicle>/<part>.json  one vehicle's results for one
                                     part (about 1-2KB gzipped): what a
                                     search fetches
     assets/auto/fb/<part>/<make>.json  "También te puede servir": the
                                     same part for other vehicles, same
                                     make first (the old keyword
                                     fallback's order), 100 at most
     assets/auto/pn/<c>.json         part-number lookup, sharded by the
                                     number's first character, with the
                                     vehicles each number is filed under

   A card carries only what the card and the cart need: id, title,
   brand, part number, line code, raw US price (the page prices it with
   the site's one formula), photo, fitment flag, location, weight.

   REGENERATE after scripts/refresh-auto-cache.js (or any change to
   auto-cache.json or the glossary):
     node scripts/build-auto-slices.mjs
   scripts/test/auto-thin-tests.mjs fails when the slices drift from
   auto-cache.json.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const OUT_DIR = "assets/auto";
export const FALLBACK_MAX = 100;

/* The selector's makes (auto.html VEHICLES). A fallback slice exists
   for every (part, make) pair so any vehicle the shopper can pick has
   one. Kept in sync by the test. */
export const SELECTOR_MAKES = ["Toyota", "Honda", "Ford", "Kia", "Hyundai", "Chevrolet", "Nissan", "Subaru", "Volvo", "BMW", "Mercedes-Benz", "Audi", "Jeep"];

/* Same slug on both sides: the page computes file names with this
   exact function (a copy lives in auto.html; the test pins them). */
export function slug(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function vehicleSlug(year, make, model) { return slug(year + " " + make + " " + model); }
export function pnShard(pn) {
  const c = String(pn || "").toUpperCase().replace(/[^A-Z0-9]/g, "").charAt(0);
  return c || "_";
}
export function normPn(pn) { return String(pn || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

export function cardOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const price = Number(raw.discounted_price != null ? raw.discounted_price : raw.price);
  const img = raw.thumbnail || (Array.isArray(raw.images) && raw.images[0]) || raw.imageUrl || "";
  const c = { t: raw.productTitle || raw.title || raw.name || "Repuesto" };
  const b = raw.brand || raw.sub_brand; if (b) c.b = b;
  const pn = raw.part_number || raw.partNumber || raw.sku || raw.mpn; if (pn) c.pn = String(pn);
  const lc = raw.line_code || raw.lineCode; if (lc) c.lc = lc;
  const oem = raw.oem_part_number || raw.oemPartNumber; if (oem) c.oem = String(oem);
  if (price > 0) c.u = price;
  if (img) c.img = img;
  if (String(raw.vehicle_fitment || "").toUpperCase() === "VEHICLE_SPECIFIC") c.f = 1;
  if (raw.location) c.loc = raw.location;
  if (Number(raw.weight_kg) > 0) c.kg = Number(raw.weight_kg);
  return c;
}
function cardKey(c) { return String(c.pn || c.t || ""); }

export function buildSlices(cache, glossary) {
  const ps = (cache && cache.partSearches) || {};
  const keys = Object.keys(ps);

  /* ---- parts: the cached query names, with every name a shopper uses ---- */
  const gl = (glossary && glossary.entries) || [];
  const glByEs = new Map();
  for (const e of gl) {
    glByEs.set(e.es.toLowerCase(), e);
    for (const s of e.synonyms_es || []) if (!glByEs.has(s.toLowerCase())) glByEs.set(s.toLowerCase(), e);
  }
  const partOrder = [];
  const partTypes = new Map();      // part -> Map(English part_type -> count)
  for (const k of keys) {
    const p = k.split("|").slice(3).join("|");
    if (!partTypes.has(p)) { partTypes.set(p, new Map()); partOrder.push(p); }
    for (const arr of Object.values(ps[k] || {})) {
      if (!Array.isArray(arr)) continue;
      for (const it of arr) {
        const t = it && it.part_type;
        if (t) partTypes.get(p).set(t, (partTypes.get(p).get(t) || 0) + 1);
      }
    }
  }
  const parts = partOrder.map((p) => {
    const g = glByEs.get(p);
    const en = new Set(g ? g.en : []);
    /* AutoZone's own English part type, when it names most of the
       results (a stray "Brake Hardware" row in a pads search does not
       make "brake hardware" a name for pads). */
    const pt = [...partTypes.get(p).entries()].sort((a, b) => b[1] - a[1]);
    const total = pt.reduce((s, x) => s + x[1], 0);
    for (const [t, n] of pt) if (n / total >= 0.25) en.add(t.toLowerCase());
    const syn = g ? [g.es, ...(g.synonyms_es || [])].filter((s) => s.toLowerCase() !== p) : [];
    return { s: slug(p), es: p, en: [...en], syn };
  });
  const partIdx = new Map(parts.map((p, i) => [p.es, i]));
  /* Glossary words we do not stock yet: the page says so instead of
     "no results" with nothing to go on. */
  const stocked = new Set();
  for (const p of parts) { stocked.add(p.es.toLowerCase()); for (const s of p.syn) stocked.add(s.toLowerCase()); }
  const unstocked = [];
  for (const e of gl) {
    if (stocked.has(e.es.toLowerCase())) continue;
    if (parts.some((p) => p.syn.map((s) => s.toLowerCase()).includes(e.es.toLowerCase()))) continue;
    unstocked.push({ es: e.es, en: e.en, syn: e.synonyms_es || [] });
  }

  /* ---- per vehicle ---- */
  const vehicles = new Map();   // "year|make|model" -> { slug, parts: { partSlug: { source: cards } } }
  const vehicleOrder = [];
  for (const k of keys) {
    const bits = k.split("|");
    if (bits.length < 4) continue;
    const vk = bits.slice(0, 3).join("|");
    const p = bits.slice(3).join("|");
    if (!vehicles.has(vk)) { vehicles.set(vk, { slug: vehicleSlug(bits[0], bits[1], bits[2]), parts: {} }); vehicleOrder.push(vk); }
    const bySrc = {};
    for (const [src, arr] of Object.entries(ps[k] || {})) {
      if (!Array.isArray(arr)) continue;
      const seen = new Set(), out = [];
      for (const raw of arr) {
        const c = cardOf(raw);
        if (!c || seen.has(cardKey(c))) continue;
        seen.add(cardKey(c)); out.push(c);
      }
      if (out.length) bySrc[src] = out;
    }
    if (Object.keys(bySrc).length) vehicles.get(vk).parts[slug(p)] = bySrc;
  }
  const vIndex = {};
  vehicleOrder.forEach((vk) => {
    const v = vehicles.get(vk);
    vIndex[vk] = Object.keys(v.parts).map((ps_) => parts.findIndex((p) => p.s === ps_));
  });

  /* ---- fallback: same part, other vehicles, same make first ---- */
  const fallback = {};   // partSlug -> makeSlug -> [cards with s]
  for (const part of parts) {
    const partKeys = keys.filter((k) => k.split("|").slice(3).join("|") === part.es);
    for (const make of SELECTOR_MAKES) {
      const ml = make.toLowerCase();
      const ordered = partKeys.filter((k) => k.split("|")[1] === ml).concat(partKeys.filter((k) => k.split("|")[1] !== ml));
      const seen = new Set(), out = [];
      for (const k of ordered) {
        for (const [src, arr] of Object.entries(ps[k] || {})) {
          if (!Array.isArray(arr)) continue;
          for (const raw of arr) {
            const c = cardOf(raw);
            if (!c || seen.has(cardKey(c))) continue;
            seen.add(cardKey(c));
            out.push({ s: src, ...c });
            if (out.length >= FALLBACK_MAX) break;
          }
          if (out.length >= FALLBACK_MAX) break;
        }
        if (out.length >= FALLBACK_MAX) break;
      }
      (fallback[part.s] = fallback[part.s] || {})[slug(make)] = out;
    }
  }

  /* ---- part numbers ---- */
  const vNum = new Map(vehicleOrder.map((vk, i) => [vk, i]));
  const pn = {};   // shard -> { PN: { s, card, v: [vehicle idx], p: [part idx] } }
  for (const k of keys) {
    const bits = k.split("|");
    const vi = vNum.get(bits.slice(0, 3).join("|"));
    const pi = partIdx.get(bits.slice(3).join("|"));
    for (const [src, arr] of Object.entries(ps[k] || {})) {
      if (!Array.isArray(arr)) continue;
      for (const raw of arr) {
        const c = cardOf(raw);
        const n = c && normPn(c.pn);
        if (!n) continue;
        const sh = (pn[pnShard(n)] = pn[pnShard(n)] || {});
        const e = (sh[n] = sh[n] || { s: src, c, v: [], fv: [] });
        if (!e.v.includes(vi)) e.v.push(vi);
        /* "fv": the vehicles whose search filed it as VEHICLE_SPECIFIC */
        if (c.f && !e.fv.includes(vi)) e.fv.push(vi);
        if (pi != null && !(e.p = e.p || []).includes(pi)) e.p.push(pi);
      }
    }
  }

  const index = {
    generatedAt: cache.generatedAt || null,
    parts,
    unstocked,
    makes: SELECTOR_MAKES.map(slug),
    vehicles: vehicleOrder,
    has: vIndex,
  };
  return { index, vehicles, fallback, pn };
}

function writeJson(rel, obj) {
  const p = join(ROOT, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(obj));
  return Buffer.byteLength(JSON.stringify(obj));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cache = JSON.parse(readFileSync(join(ROOT, "auto-cache.json"), "utf8"));
  const glossary = JSON.parse(readFileSync(join(ROOT, "scripts/lib/es-en-parts-glossary.json"), "utf8"));
  const { index, vehicles, fallback, pn } = buildSlices(cache, glossary);
  if (existsSync(join(ROOT, OUT_DIR))) rmSync(join(ROOT, OUT_DIR), { recursive: true });
  let files = 0, bytes = 0, maxB = 0, maxF = "";
  const w = (rel, obj) => { const b = writeJson(rel, obj); files++; bytes += b; if (b > maxB) { maxB = b; maxF = rel; } };
  w(`${OUT_DIR}/index.json`, index);
  for (const [vk, v] of vehicles) for (const [ps_, bySrc] of Object.entries(v.parts)) w(`${OUT_DIR}/v/${v.slug}/${ps_}.json`, { v: vk, part: ps_, bySource: bySrc });
  for (const [ps_, byMake] of Object.entries(fallback)) for (const [m, items] of Object.entries(byMake)) w(`${OUT_DIR}/fb/${ps_}/${m}.json`, { part: ps_, make: m, items });
  for (const [sh, map] of Object.entries(pn)) w(`${OUT_DIR}/pn/${sh}.json`, map);
  console.log(`assets/auto: ${files} files, ${(bytes / 1024).toFixed(0)}KB raw, largest ${maxF} ${(maxB / 1024).toFixed(1)}KB; ` +
    `${index.parts.length} parts, ${index.vehicles.length} vehicles, ${Object.values(pn).reduce((s, m) => s + Object.keys(m).length, 0)} part numbers`);
}
