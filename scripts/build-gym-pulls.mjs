#!/usr/bin/env node
/* ============================================================
   GYM RAT: THE 12-BRAND INGEST (#443 c.6542443890, apparel-only ruling
   c.6542490625).

   Lucifer's pull, 2026-10-30: branch lucifer/gallery-repull-2026-10-30,
   folder data/gym-pulls-2026-10-30/ (12 files, one per brand). Point
   --src at a checkout of that folder:

     node scripts/build-gym-pulls.mjs --src <dir with ryderwear.json, aybl.json, ...>

   Each brand becomes a store in gymrat-catalog.json (next to YoungLA):
     - its CLOTHING in the gym_rat bucket (Gym Rat);
     - its fight / training gear in combat_sports (Aria Fight Club), never
       in Gym Rat;
     - anything else (bottles, bags, decals, shoes) held, counted.
   The split is scripts/lib/gym-apparel.js, the same rule the Gym Rat
   department reads, so a later pull cannot leak gear back in.

   Descriptions: `description` holds Spanish only. A pull whose
   description is the English (9 of the 12 brands) keeps it as
   description_en and ships `description` empty until the Spanish lands
   (scripts/data/descriptions-es/<brand>.json, apply-description-memory).
   Nothing is invented: no size, price or photo the pull does not carry.
   Writes reports/gym-pulls-2026-10-30.json.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gymKind } from "./lib/gym-apparel.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

/* Biggest first (the pull's own counts). */
export const GYM_BRANDS = [
  { key: "ryderwear", label: "Ryderwear" },
  { key: "aybl", label: "AYBL" },
  { key: "bornprimitive", label: "Born Primitive" },
  { key: "buffbunny", label: "Buffbunny" },
  { key: "paragonfitwear", label: "Paragon Fitwear" },
  { key: "killcrew", label: "Kill Crew" },
  { key: "oneractive", label: "Oner Active" },
  { key: "gorillawear", label: "Gorilla Wear" },
  { key: "fleo", label: "FLEO" },
  { key: "tlfapparel", label: "TLF Apparel" },
  { key: "ironrebel", label: "Iron Rebel" },
  { key: "athleta", label: "Athleta" },
];

const ES_RX = /\b(el|la|los|las|de|del|con|para|y|en|que|su|sus|una|un|por|es|tu|tus)\b/gi;
const EN_RX = /\b(the|and|with|for|your|this|that|is|are|of|to|in|it)\b/gi;
/* Spanish, positively: more Spanish function words than English ones. */
export function looksSpanish(s) {
  const t = String(s || "");
  const es = (t.match(ES_RX) || []).length, en = (t.match(EN_RX) || []).length;
  return es >= 3 && es > en * 2;
}
const realPhoto = (u) => typeof u === "string" && /^https:\/\//.test(u) && u.length > 20;

export function gymItem(r, brand) {
  const name = String(r.name || r.title || "").trim();
  const price = Number(r.price);
  const images = [...new Set((Array.isArray(r.images) && r.images.length ? r.images : [r.image]).filter(realPhoto))];
  if (!name || !(price > 0) || !images.length) return null;
  const sizes = (Array.isArray(r.inStockSizes) && r.inStockSizes.length ? r.inStockSizes : r.sizes || []).map(String).filter(Boolean);
  const en = String(r.description_en || "").trim();
  const desc = String(r.description || "").trim();
  const it = { name, brand: brand.label, price, currency: "USD", image: images[0], images, url: String(r.url || ""),
    sku: String(r.sku || ""), type: String(r.subcategory || ""), retailer: brand.key,
    description: desc && desc !== en && looksSpanish(desc) ? desc : "",
    description_en: en || (desc && !looksSpanish(desc) ? desc : "") };
  if (sizes.length) it.availableSizes = sizes;
  const was = Number(r.compareAtPrice);
  if (was > price) { it.originalPrice = was; it.onSale = true; }
  const g = (r.variants || []).map((v) => Number(v && v.weightGrams)).find((x) => x > 0);
  if (g) { it.weightKg = Math.round(g) / 1000; it.weightEstimated = false; }
  if (!it.description_en) delete it.description_en;
  return it;
}

export function buildGym(src) {
  const report = { generatedAt: new Date().toISOString(), source: "lucifer/gallery-repull-2026-10-30:data/gym-pulls-2026-10-30", brands: {} };
  const retailers = {};
  for (const b of GYM_BRANDS) {
    const rows = JSON.parse(readFileSync(join(src, b.key + ".json"), "utf8"));
    const gym = [], fight = [], held = {}, seen = new Set();
    const hold = (why) => { held[why] = (held[why] || 0) + 1; };
    const gearByType = {};
    for (const r of rows) {
      if (r.inStock === false || /out ?of ?stock/i.test(String(r.availability || ""))) { hold("out of stock"); continue; }
      const it = gymItem(r, b);
      if (!it) { hold("no name, price or photo"); continue; }
      const k = it.name + "|" + it.price + "|" + it.image;
      if (seen.has(k)) { hold("duplicate"); continue; }
      seen.add(k);
      const kind = gymKind(r);
      if (kind === "apparel") gym.push(it);
      else if (kind === "fight") { fight.push(it); gearByType[it.type || "?"] = (gearByType[it.type || "?"] || 0) + 1; }
      else hold("not clothing, not fight gear: " + (r.subcategory || "?"));
    }
    const departments = {};
    if (gym.length) departments.gym_rat = { label: "Gym Rat", items: gym };
    if (fight.length) departments.combat_sports = { label: "Aria Fight Club", items: fight };
    retailers[b.key] = { label: b.label, departments };
    report.brands[b.key] = { label: b.label, pulled: rows.length, gymRat: gym.length, fightClub: fight.length,
      gearExcludedFromGymRat: fight.length + Object.entries(held).filter(([w]) => w.startsWith("not clothing")).reduce((n, [, c]) => n + c, 0),
      gearToFightClubByType: gearByType, held,
      spanishDescriptions: gym.concat(fight).filter((i) => i.description).length };
  }
  return { retailers, report };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = arg("--src");
  if (!src) { console.error("usage: node scripts/build-gym-pulls.mjs --src <data/gym-pulls-2026-10-30>"); process.exit(2); }
  const { retailers, report } = buildGym(src);
  const file = join(ROOT, "gymrat-catalog.json");
  const cat = JSON.parse(readFileSync(file, "utf8"));
  for (const [k, r] of Object.entries(retailers)) cat.retailers[k] = r;
  cat.declaredProductCount = Object.values(cat.retailers).reduce((n, r) => n + Object.values(r.departments || {}).reduce((m, d) => m + (d.items || []).length, 0), 0);
  writeFileSync(file, JSON.stringify(cat));
  mkdirSync(join(ROOT, "reports"), { recursive: true });
  writeFileSync(join(ROOT, "reports/gym-pulls-2026-10-30.json"), JSON.stringify(report, null, 1));
  for (const [k, v] of Object.entries(report.brands)) console.log(k.padEnd(15), `pulled ${v.pulled}, Gym Rat ${v.gymRat}, Fight Club ${v.fightClub}, held ${JSON.stringify(v.held)}, Spanish ${v.spanishDescriptions}`);
}
