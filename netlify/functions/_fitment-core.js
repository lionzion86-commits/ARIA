/* ============================================================
   THE VEHICLE FILTER (#443 c.6620267344, amended c.6620289895; one
   canonical page, c.6621544530 / c.6621722209).

   ONE VIEW: Aria Auto, the section's own page --
     /aria-auto.html?vy=<año>&vmk=<marca>&vmd=<modelo>[&t=<tipo>][&b=<marca del repuesto>]#buscar
   The «Tu vehículo» cards on the auto parts department and the auto
   stores only open it. This module answers it (netlify/functions/
   vehicle-fit.js): one page of cards and every option counted under
   every other selection, so only a choice that returns products is
   offered (no dead end).

   THE DATA. The auto parts with vehicle data (assets/sections/
   departamento/_fn/auto_parts.fitment.json, scripts/build-fitment.mjs:
   AutoZone's VEHICLE_SPECIFIC filings in auto-cache.json, named as Aria
   Auto's selector names them) and the auto parts department's own rows
   (Advance Auto Parts publishes no fitment). A product with no vehicle
   data is never shown as fitting: with a vehicle chosen it is listed
   apart, «Universal / sin datos de compatibilidad».

   THE PARAMS are the same on every page: vy=<year>, vmk=<make slug>,
   vmd=<model slug> (Aria Auto's slug(): «3 Series» -> 3-series),
   t=<part type>, b=<part brand>.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { rowItem, cardOf, photosFirst, loadDept } from "./_department-core.js";

export const FIT_FILE = "assets/sections/departamento/_fn/auto_parts.fitment.json";
export const DEPT = "auto_parts";
export const PAGE = 24;

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
/* A part type, as its store or Aria Auto names it: «pastillas de freno» -> Pastillas de freno. */
function typeOf(raw) {
  const s = String(raw || "").trim();
  if (!s || /^repuestos?$/i.test(s)) return null;
  return { k: vslug(s), label: s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() };
}

const cache = new Map();
/* { vehicles: [{y, mk, md, mkL, mdL}], rows: [{p, t, bk, fv}] } */
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
      const rows = [], seen = new Set();
      (f.rows || []).forEach((r, i) => {
        const p = rowItem(r);
        seen.add(keyOf(p.retailer, p.title));
        const fv = (f.fits || [])[i] || [];
        rows.push({ p, fv: fv.length ? fv : null });
      });
      /* The department's own auto parts: no vehicle data (none is published). */
      const d = loadDept(DEPT, roots || CANDIDATES);
      for (const p of (d && d.list) || []) {
        if (seen.has(keyOf(p.retailer, p.title)) || !/^(advanceauto|autozone)$/.test(p.retailer)) continue;
        rows.push({ p, fv: null });
      }
      for (const r of rows) { r.t = typeOf(r.p.type); r.bk = String(r.p.brand || "").trim().toLowerCase(); }
      out = { vehicles, rows: rows.filter((r) => r.p.image && r.p.rawPrice > 0) };
      break;
    } catch { /* next */ }
  }
  cache.set(ck, out);
  return out;
}

/* The selection, read and clamped from a query. */
export function readFit(qs) {
  const s = (v, n) => (new RegExp("^[a-z0-9-]{1," + n + "}$").test(String(v || "")) ? String(v) : "");
  return {
    y: /^\d{4}$/.test(String(qs.vy || "")) ? String(qs.vy) : "",
    mk: s(qs.vmk, 40), md: s(qs.vmd, 40), t: s(qs.t, 60),
    b: String(qs.b || "").trim().toLowerCase().slice(0, 80),
    page: Math.max(0, Math.min(200, Number(qs.page) || 0)),
  };
}

export function answerFit(qs, roots) {
  const F = loadFitment(roots);
  if (!F) return { status: 500, body: { error: "Sin datos de compatibilidad." } };
  const f = readFit(qs);
  const on = !!(f.y || f.mk || f.md);
  const vOk = (x, skip) => (skip === "y" || !f.y || x.y === f.y) && (skip === "mk" || !f.mk || x.mk === f.mk) && (skip === "md" || !f.md || x.md === f.md);
  const fits = (r, skip) => {
    if (!r.fv) return false;
    for (const i of r.fv) if (vOk(F.vehicles[i], skip)) return true;
    return false;
  };
  /* In the view: the parts whose data says they fit the vehicle (with no
     vehicle yet: every part that has vehicle data). */
  const other = (r, skip) => (skip === "t" || !f.t || (r.t && r.t.k === f.t)) && (skip === "b" || !f.b || r.bk === f.b);
  const match = (r, skip) => other(r, skip) && fits(r, skip);
  const tally = (skip, keysOf) => {
    const n = new Map();
    for (const r of F.rows) {
      if (!match(r, skip)) continue;
      for (const [k, label] of keysOf(r)) {
        if (!k) continue;
        const o = n.get(k) || [k, label, 0];
        o[2]++; n.set(k, o);
      }
    }
    return [...n.values()];
  };
  const vKeys = (field, skip) => (r) => {
    const out = new Map();
    for (const i of r.fv || []) { const x = F.vehicles[i]; if (vOk(x, skip)) out.set(x[field], [x[field], field === "y" ? x.y : field === "mk" ? x.mkL : x.mdL]); }
    return [...out.values()];
  };
  const byN = (a, b) => (b[2] - a[2]) || (a[1] < b[1] ? -1 : 1);
  const alpha = (a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  const facets = {
    t: tally("t", (r) => [[r.t && r.t.k, r.t && r.t.label]]).sort(byN),
    b: tally("b", (r) => [[r.bk, String(r.p.brand || "").trim()]]).sort(byN),
    y: tally("y", vKeys("y", "y")).sort((a, b) => Number(b[0]) - Number(a[0])),
    mk: tally("mk", vKeys("mk", "mk")).sort(alpha),
    /* a model is picked within a make */
    md: f.mk ? tally("md", vKeys("md", "md")).sort(alpha) : [],
  };
  const label = (list, k) => ((list.find((o) => o[0] === k) || [])[1]) || "";
  const hits = photosFirst(F.rows.filter((r) => match(r)).map((r, i) => ({ r, i }))
    .sort((a, b) => ((b.r.p.salePct || 0) - (a.r.p.salePct || 0)) || (a.i - b.i)).map((x) => x.r.p));
  const body = {
    v: { y: f.y, mk: f.mk, md: f.md, mkL: label(facets.mk, f.mk), mdL: label(facets.md, f.md) },
    f: { t: f.t, b: f.b }, tl: label(facets.t, f.t), bl: label(facets.b, f.b),
    count: on ? hits.length : 0, page: f.page, pages: on ? Math.ceil(hits.length / PAGE) : 0,
    cards: on ? hits.slice(f.page * PAGE, (f.page + 1) * PAGE).map(cardOf) : [],
    facets,
    /* how many of the products under the part filters carry vehicle data */
    withData: F.rows.filter((r) => other(r) && r.fv).length,
    all: F.rows.filter((r) => other(r)).length,
  };
  if (on) {
    const none = photosFirst(F.rows.filter((r) => other(r) && !r.fv).map((r) => r.p));
    body.none = { count: none.length, cards: f.page ? [] : none.slice(0, PAGE).map(cardOf) };
  }
  return { status: 200, body };
}
