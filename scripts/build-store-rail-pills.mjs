#!/usr/bin/env node
/* ============================================================
   assets/home/store-pills/ — ONE PILL ROW ABOVE EVERY STORE RAIL ON THE
   HOMEPAGE (Danny, #443 c.6525893681: "a no-resistance straight line to
   checkout").

   WHAT. Each store rail on the homepage gets one row of pills; a pill
   re-scopes THAT rail in place (the shopper never has to enter the store
   page), «Todo» puts the rail back.

   ONE SOURCE OF TRUTH. The pills are the store page's own aisles --
   assets/tienda/_fn/<store>.json, built by build-store-slices.mjs from
   the same product-type map as the store pages and the re-route audit --
   so a pill can never say something its store page does not.

   DATA-DRIVEN, LABEL-TRUE OR NOTHING.
     - an aisle becomes a pill only with real depth (PILL_MIN products);
     - an aisle splits by wearer ("Ropa mujer / Ropa hombre / Ropa niños")
       only where EACH half has that depth, and the splits collapse back to
       the one aisle when they would make the row too long (MAX_PILLS);
     - a store with fewer than two pills gets no row (one pill would be
       the rail itself);
     - every card has its photo (no image, no card).
   Stores whose aisles are too thin are reported, never padded.

   THE MOUNTAIN TEST. index.json lists the stores that have a row;
   <store>.json is the row (labels only, a few hundred bytes), fetched
   when its rail nears the screen; <store>-<pill>.json is one pill's
   cards, fetched only when that pill is tapped.

   RUN after the store slices: node scripts/build-store-rail-pills.mjs
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { stampHomePhotos } from "./stamp-home-photos.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PILLS_DIR = "assets/home/store-pills";
export const PILL_MIN = 24, MAX_PILLS = 8, PILL_CARDS = 16;
/* Aisles a store's wearer split is honest for (a toy or a lamp has no wearer). */
const SPLIT_TYPES = new Set(["t-ropa", "t-zapatos", "t-trajes_bano"]);
const AUD = [["women", "mujer"], ["men", "hombre"], ["kids", "niños"]];
/* The row's columns (build-store-slices ROW). */
const R = { name: 0, brand: 1, price: 2, was: 3, image: 5 };

/** The stores with a rail on the homepage, in page order. */
export function homeStoreRails(root = ROOT) {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const keys = [];
  for (const m of html.matchAll(/data-store-rail-row="([a-z0-9]+)"/g)) if (!keys.includes(m[1])) keys.push(m[1]);
  return keys.filter((k) => !isOffSaleRetailer(k));
}

const cardOf = (r, store) => {
  const c = { title: r[R.name], price: r[R.price], image: r[R.image], retailer: store };
  if (r[R.brand]) c.brand = r[R.brand];
  if (r[R.was] > r[R.price]) c.originalPrice = r[R.was];
  return c;
};

/** { pills: [{ k, label, n, cards }], thin: [label…] } for one store. */
export function storePills(store, root = ROOT) {
  const fnFile = join(root, `assets/tienda/_fn/${store}.json`), idxFile = join(root, `assets/tienda/${store}/index.json`);
  if (!existsSync(fnFile) || !existsSync(idxFile)) return { pills: [], thin: [] };
  const fn = JSON.parse(readFileSync(fnFile, "utf8")), idx = JSON.parse(readFileSync(idxFile, "utf8"));
  const pills = [], thin = [];
  for (const rail of idx.rails || []) {
    if (!/^t-/.test(rail.key)) continue;            /* Ofertas / Más vendidos are the rail's own default */
    const rows = (fn.rails[rail.key] || []).map((i) => fn.rows[i]).filter((r) => r && r[R.image]);
    if (rows.length < PILL_MIN) { if (rows.length) thin.push(`${rail.title} (${rows.length})`); continue; }
    const whole = { k: rail.key.slice(2), label: rail.title, rows };
    if (SPLIT_TYPES.has(rail.key)) {
      /* The wearer is the store page's own sub-aisles (t-ropa~women~tops…). */
      const halves = AUD.map(([g, word]) => {
        const seen = new Set();
        for (const [sk, list] of Object.entries(fn.rails)) if (sk.startsWith(rail.key + "~" + g + "~")) for (const i of list) seen.add(i);
        return { k: whole.k + "-" + g, label: rail.title + " " + word, rows: (fn.rails[rail.key] || []).filter((i) => seen.has(i)).map((i) => fn.rows[i]).filter((r) => r && r[R.image]) };
      }).filter((h) => h.rows.length >= PILL_MIN);
      /* Split only when two wearers each fill a rail and together they hold the aisle (4 in 5). */
      const covered = halves.reduce((n, h) => n + h.rows.length, 0);
      if (halves.length >= 2 && covered >= rows.length * 0.8) { pills.push({ ...whole, halves }); continue; }
    }
    pills.push(whole);
  }
  /* Too long a row: the smallest splits collapse back to their aisle first. */
  const count = () => pills.reduce((n, p) => n + (p.halves ? p.halves.length : 1), 0);
  while (count() > MAX_PILLS) {
    const split = pills.filter((p) => p.halves).sort((a, b) => a.rows.length - b.rows.length)[0];
    if (!split) break;
    delete split.halves;
  }
  const flat = pills.flatMap((p) => (p.halves ? p.halves : [p])).slice(0, MAX_PILLS);
  return {
    pills: flat.length >= 2 ? flat.map((p) => ({ k: p.k, label: p.label, n: p.rows.length, cards: p.rows.slice(0, PILL_CARDS).map((r) => cardOf(r, store)) })) : [],
    thin,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(join(ROOT, PILLS_DIR), { recursive: true, force: true });
  mkdirSync(join(ROOT, PILLS_DIR), { recursive: true });
  const report = {};
  for (const store of homeStoreRails()) {
    const { pills, thin } = storePills(store);
    report[store] = { pills: pills.map((p) => `${p.label} ${p.n}`), thin };
    if (!pills.length) continue;
    writeFileSync(join(ROOT, PILLS_DIR, `${store}.json`), JSON.stringify({ v: 1, store, pills: pills.map(({ k, label, n }) => ({ k, label, n })) }));
    for (const p of pills) writeFileSync(join(ROOT, PILLS_DIR, `${store}-${p.k}.json`), JSON.stringify({ v: 1, store, k: p.k, label: p.label, cards: p.cards }));
  }
  /* The manifest: the stores that have a row (the page asks for no other). */
  writeFileSync(join(ROOT, PILLS_DIR, "index.json"), JSON.stringify({ v: 1, stores: Object.keys(report).filter((s) => report[s].pills.length) }));
  stampHomePhotos(ROOT, [PILLS_DIR]);
  for (const [s, r] of Object.entries(report)) console.log(s.padEnd(18), r.pills.length ? r.pills.join(" | ") : "(no row)", r.thin.length ? "   thin: " + r.thin.join(", ") : "");
}
