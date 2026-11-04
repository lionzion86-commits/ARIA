#!/usr/bin/env node
/* ============================================================
   assets/sections/auto/_fn/fitment.json -- VEHICLE FITMENT, ONE SOURCE
   (#443 c.6620267344, amended c.6620289895).

   The auto parts pages (departamento.html?dept=auto_parts, the auto
   store pages, Aria Auto) narrow to the shopper's car with one vehicle
   filter: Año / Marca del vehículo / Modelo. This file is that filter's
   data, read by the filter bar's engine (netlify/functions/
   _fitment-core.js, used by _nav-filter-core.js). It is never sent to a
   phone.

   WHERE THE FITMENT COMES FROM. Aria Auto's own data, nothing new:
     - auto-cache.json: AutoZone's answers to "this part for this
       vehicle" (year|make|model|part). A part AutoZone files as
       VEHICLE_SPECIFIC for a vehicle fits that vehicle -- the same rule
       Aria Auto's «Compatible con tu ...» badge uses. A part filed only
       as UNIVERSAL has no vehicle data: it is listed, never claimed.
     - auto.html's selector (VEHICLES): the make and model names as the
       Aria Auto dropdowns spell them («BMW», «3 Series»).
   Advance Auto Parts publishes no fitment (scripts/lib/retailers.js:
   "no compatibility data, no fitment claim"), so its products carry
   none here: with a vehicle chosen they show apart, as «Universal / sin
   datos de compatibilidad», never as fitting.

   WHAT IT HOLDS
     vehicles  [[year, make, model]] -- only vehicles some part fits
     rows      AutoZone's parts as department rows (_department-core.js
               fnRow), one per title, with a photo and a price
     fits      rows[i]'s vehicles (indices into vehicles); [] = none
     type      the part's type is the Aria Auto part it was searched
               as, when AutoZone's own part type is that part's (a wear
               sensor in a brake pad search is not a brake pad)

     node scripts/build-fitment.mjs
   scripts/test/auto-fitment-tests.mjs fails when the file drifts.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { cardOf } from "./build-auto-slices.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const FIT_FILE = "assets/sections/auto/_fn/fitment.json";

/* Aria Auto's selector: VEHICLES as auto.html declares it. */
export function selectorVehicles(root = ROOT) {
  const page = readFileSync(join(root, "auto.html"), "utf8");
  const m = /var VEHICLES = \[[\s\S]*?\n\];/.exec(page);
  if (!m) throw new Error("auto.html: VEHICLES moved -- update build-fitment.mjs");
  const box = {};
  vm.runInNewContext(m[0] + "\nthis.V = VEHICLES;", box);
  return JSON.parse(JSON.stringify(box.V));
}

export function buildFitment(cache, VEHICLES) {
  const ps = (cache && cache.partSearches) || {};
  const makeL = new Map(), modelL = new Map();
  for (const v of VEHICLES) {
    makeL.set(v.make.toLowerCase(), v.make);
    for (const md of v.models) modelL.set(v.make.toLowerCase() + "|" + md.toLowerCase(), md);
  }
  const title = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());
  /* A part's own types: AutoZone's part_type that names 25%+ of its
     results (build-auto-slices.mjs's rule for the part's English names). */
  const ptCount = new Map();
  for (const [k, bySrc] of Object.entries(ps)) {
    const part = k.split("|").slice(3).join("|");
    const m = ptCount.get(part) || new Map();
    for (const arr of Object.values(bySrc || {})) for (const it of arr || []) if (it && it.part_type) m.set(it.part_type, (m.get(it.part_type) || 0) + 1);
    ptCount.set(part, m);
  }
  const partTypes = new Map();
  for (const [part, m] of ptCount) {
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    partTypes.set(part, new Set([...m].filter(([, n]) => n / total >= 0.25).map(([t]) => t)));
  }

  const vIdx = new Map(), vehicles = [];
  const byTitle = new Map();   // title -> { row, fits:Set, type }
  for (const k of Object.keys(ps)) {
    const bits = k.split("|");
    if (bits.length < 4) continue;
    const [y, mk, md] = bits;
    const part = bits.slice(3).join("|");
    for (const [src, arr] of Object.entries(ps[k] || {})) {
      for (const raw of arr || []) {
        const c = cardOf(raw);
        if (!c || !c.img || !(c.u > 0)) continue;   /* no image, no card; never a priceless card */
        let e = byTitle.get(c.t);
        if (!e) {
          const was = Number(raw.was_price) > c.u ? Number(raw.was_price) : 0;
          const pct = was ? Math.round((1 - c.u / was) * 100) : 0;
          e = { row: [c.t, c.b || "", src, c.u, was, pct >= 5 && pct <= 70 ? pct : 0, c.img, ""], fits: new Set() };
          byTitle.set(c.t, e);
        }
        if (!e.row[7] && raw.part_type && (partTypes.get(part) || new Set()).has(raw.part_type)) e.row[7] = part;
        if (String(raw.vehicle_fitment || "").toUpperCase() !== "VEHICLE_SPECIFIC") continue;
        const vk = y + "|" + mk + "|" + md;
        if (!vIdx.has(vk)) {
          vIdx.set(vk, vehicles.length);
          vehicles.push([y, makeL.get(mk) || title(mk), modelL.get(mk + "|" + md) || title(md)]);
        }
        e.fits.add(vIdx.get(vk));
      }
    }
  }
  const entries = [...byTitle.values()];
  return {
    v: 1,
    generatedAt: cache.generatedAt || null,
    source: "auto-cache.json (AutoZone, VEHICLE_SPECIFIC) + auto.html VEHICLES",
    vehicles,
    rows: entries.map((e) => e.row),
    fits: entries.map((e) => [...e.fits].sort((a, b) => a - b)),
  };
}

export function readInputs(root = ROOT) {
  return { cache: JSON.parse(readFileSync(join(root, "auto-cache.json"), "utf8")), VEHICLES: selectorVehicles(root) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, VEHICLES } = readInputs();
  const out = buildFitment(cache, VEHICLES);
  const p = join(ROOT, FIT_FILE);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(out));
  const fitted = out.fits.filter((f) => f.length).length;
  console.log(`${FIT_FILE}: ${out.rows.length} parts (${fitted} with vehicle data), ${out.vehicles.length} vehicles, ${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0)}KB`);
}
