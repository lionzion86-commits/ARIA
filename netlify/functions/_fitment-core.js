/* ============================================================
   THE VEHICLE FILTER (#443 c.6620267344, amended c.6620289895).

   One fitment system for every page that sells auto parts. The filter
   bar's engine (_nav-filter-core.js) asks this module three things:

     fitList(dept, list)   the department's rows plus the parts that
                           carry vehicle data (assets/sections/auto/_fn/
                           fitment.json, scripts/build-fitment.mjs);
     fitMatcher(dept, v)   whether a row is in the view: with no vehicle
                           chosen, the department exactly as before; with
                           one, only the rows whose data says they fit it;
     .answer(rows)         the vehicle dropdowns (Año / Marca del vehículo
                           / Modelo), each option counted under every
                           other filter, so only a combination that
                           returns products is offered (no dead end); and
                           the rows with no vehicle data, kept apart as
                           «Universal / sin datos de compatibilidad».

   THE PARAMS are the same on every page: vy=<year>, vmk=<make slug>,
   vmd=<model slug> (slugs as Aria Auto's slug(): «3 Series» -> 3-series).
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { rowItem, photosFirst } from "./_department-core.js";

export const FIT_FILE = "assets/sections/departamento/_fn/auto_parts.fitment.json";
/* The departments whose view takes the vehicle filter. */
export const FIT_DEPTS = new Set(["auto_parts"]);
export const NONE_CARDS = 24;

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);

/* Aria Auto's slug (scripts/build-auto-slices.mjs). */
export function vslug(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const keyOf = (retailer, title) => String(retailer || "") + "\u0000" + String(title || "");

const cache = new Map();
export function loadFitment(roots) {
  const ck = roots ? roots.join("|") : "";
  if (cache.has(ck)) return cache.get(ck);
  let out = null;
  for (const dir of roots || CANDIDATES) {
    const p = join(dir, FIT_FILE);
    try {
      if (!existsSync(p)) continue;
      const f = JSON.parse(readFileSync(p, "utf8"));
      const vehicles = (f.vehicles || []).map(([y, mk, md]) => ({ y: String(y), mk: vslug(mk), md: vslug(md), mkL: mk, mdL: md }));
      const fits = new Map();
      const rows = (f.rows || []).map((r, i) => {
        const p = rowItem(r);
        p.xfit = 1;                     /* joins the view only with a vehicle chosen */
        const fv = (f.fits || [])[i] || [];
        if (fv.length) fits.set(keyOf(p.retailer, p.title), fv);
        return p;
      });
      out = { vehicles, rows, fits };
      break;
    } catch { /* next */ }
  }
  cache.set(ck, out);
  return out;
}

/* The vehicle, read and clamped from a query. */
export function readVehicle(qs) {
  const y = /^\d{4}$/.test(String(qs.vy || "")) ? String(qs.vy) : "";
  const s = (v) => (/^[a-z0-9-]{1,40}$/.test(String(v || "")) ? String(v) : "");
  return { y, mk: s(qs.vmk), md: s(qs.vmd) };
}
const active = (v) => !!(v && (v.y || v.mk || v.md));

const listCache = new WeakMap();
/* The department's list plus the parts with vehicle data (same array per list). */
export function fitList(key, list, roots) {
  if (!FIT_DEPTS.has(key)) return list;
  const F = loadFitment(roots);
  if (!F) return list;
  if (listCache.has(list)) return listCache.get(list);
  const have = new Set(list.map((p) => keyOf(p.retailer, p.title)));
  const out = list.concat(F.rows.filter((p) => !have.has(keyOf(p.retailer, p.title))));
  listCache.set(list, out);
  return out;
}

/* null for a page without fitment; else the row test and the answer. */
export function fitMatcher(key, v, roots) {
  if (!FIT_DEPTS.has(key)) return null;
  const F = loadFitment(roots);
  if (!F) return null;
  const on = active(v);
  const fvOf = (p) => F.fits.get(keyOf(p.retailer, p.title)) || null;
  const vOk = (x, skip) => (skip === "y" || !v.y || x.y === v.y) && (skip === "mk" || !v.mk || x.mk === v.mk) && (skip === "md" || !v.md || x.md === v.md);
  const fitsV = (p, skip) => {
    const fv = fvOf(p);
    if (!fv) return false;
    for (const i of fv) if (vOk(F.vehicles[i], skip)) return true;
    return false;
  };
  return {
    on,
    /* In the view: no vehicle -> the department as it was; a vehicle -> what fits it. */
    ok: (p) => (on ? fitsV(p) : !p.xfit),
    /* rows: the engine's rows; others(r): r passes every filter but the vehicle. */
    answer(rows, others, card) {
      const base = rows.filter(others);
      const count = (field, skip, label) => {
        const n = new Map();
        for (const r of base) {
          const fv = fvOf(r.p);
          if (!fv) continue;
          const seen = new Set();
          for (const i of fv) {
            const x = F.vehicles[i];
            if (!vOk(x, skip) || seen.has(x[field])) continue;
            seen.add(x[field]);
            const o = n.get(x[field]) || [x[field], label(x), 0];
            o[2]++; n.set(x[field], o);
          }
        }
        return [...n.values()];
      };
      const alpha = (a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
      const y = count("y", "y", (x) => x.y).sort((a, b) => Number(b[0]) - Number(a[0]));
      const mk = count("mk", "mk", (x) => x.mkL).sort(alpha);
      /* A model is picked within a make. */
      const md = v.mk ? count("md", "md", (x) => x.mdL).sort(alpha) : [];
      const label = (list, k) => ((list.find((o) => o[0] === k) || [])[1]) || "";
      const out = {
        v: { y: v.y, mk: v.mk, md: v.md, mkL: label(mk, v.mk), mdL: label(md, v.md) },
        facets: { y, mk, md },
        /* how many of the products under the other filters carry vehicle data */
        withData: base.filter((r) => fvOf(r.p)).length,
        all: base.length,
      };
      if (on) {
        const none = photosFirst(base.filter((r) => !fvOf(r.p)).map((r) => r.p));
        out.none = { count: none.length, cards: none.slice(0, NONE_CARDS).map(card) };
      }
      return out;
    },
  };
}
