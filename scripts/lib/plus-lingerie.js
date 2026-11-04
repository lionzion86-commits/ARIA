/* ============================================================
   LENCERÍA + TALLAS PLUS LEADS WITH LANE BRYANT (Danny, #443
   c.6621407508, a standing rule).

   WHY. Lane Bryant photographs its lingerie on plus-size women; the
   other stores photograph an XL on a thin model. A plus-size shopper
   must see plus-size women first. So wherever lencería meets plus
   sizes -- the Tallas Plus «Lencería» rail and its pages, a Tallas
   Plus view filtered to a lingerie type, a plus-size Talla filter over
   lingerie, the homepage Tallas Plus «Todas» -- Lane Bryant's rail
   comes first, or its pieces take the first lingerie slots of a mixed
   rail.

   WHAT COUNTS AS LINGERIE. The section allowlist (section-allowlist.js
   isIntimate: the product's own TYPE, never a word in its title), so a
   Lane Bryant band extender or sports bra filed "Bras" is not lingerie
   here either. Nothing is added to a section: this only orders what the
   section already holds.

   NO PHOTO SIGNAL IS INVENTED. Lane Bryant's files carry no model / flat
   marker (<style>_<colour code>), so lib/model-shot.mjs reads them as
   unknown; the lead is the STORE, on Danny's word about its
   photography, not a per-photo guess.
   ============================================================ */
import { isIntimate, intimateClass } from "./section-allowlist.js";

export const PLUS_LINGERIE_LEAD = "lanebryant";
/* How many lingerie slots of a MIXED rail go to Lane Bryant first. */
export const PLUS_LINGERIE_SLOTS = 4;

const titleOf = (p) => String((p && (p.title || p.name || p.t)) || "");
const typeOf = (p) => (p && (p._type != null ? p._type : p.type != null ? p.type : p.pt)) ?? "";
const storeOf = (p) => String((p && (p.retailer || p.r)) || "").toLowerCase();

/** Lingerie by the section allowlist (a department row, a pill card or a feed row). */
export const isLingerie = (p) => isIntimate({ title: titleOf(p), type: typeOf(p) });
export const isLead = (p) => storeOf(p) === PLUS_LINGERIE_LEAD;

/** A set that is lingerie: most of it passes the allowlist (a "Sostenes"
    type view also holds a store's band extenders filed Bras). */
export function isLingerieSet(items) {
  const l = items || [];
  if (!l.length) return false;
  let n = 0;
  for (const p of l) if (isLingerie(p)) n++;
  return n * 2 > l.length;
}

/** Stable: Lane Bryant's pieces first, everything else in its own order.
    mix: Lane Bryant's block takes its lingerie classes in turn -- a bra,
    then a panty, ... (the Lencería carousel opens on a bra) -- so a rail
    is not twelve panties; each class keeps its own order. */
export function leadFirst(items, { mix = false } = {}) {
  let a = [], b = [];
  for (const p of items || []) (isLead(p) ? a : b).push(p);
  if (mix && a.length) a = classTurns(a);
  return a.length && b.length ? a.concat(b) : a.length ? a : b;
}
const CLASS_TURN = ["bra", "panty", "lingerie", "shapewear", "underwear"];
function classTurns(list) {
  const by = new Map(CLASS_TURN.map((k) => [k, []])), other = [];
  for (const p of list) { const c = intimateClass({ title: titleOf(p), type: typeOf(p) }); (by.get(c) || other).push(p); }
  const queues = [...by.values()].filter((q) => q.length);
  const out = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift());
  return out.concat(other);
}

/** A mixed rail (a «Todas»): its first `slots` lingerie positions go to
    Lane Bryant's lingerie -- what the rail already holds first, then the
    pool's (Lane Bryant's own pill rail) -- and the other stores' lingerie
    moves down the remaining lingerie positions. Non-lingerie cards keep
    their places; the rail's length never changes. */
export function lingerieSlotsFirst(rail, pool = [], slots = PLUS_LINGERIE_SLOTS) {
  const out = (rail || []).slice();
  const at = [];
  out.forEach((cd, i) => { if (isLingerie(cd)) at.push(i); });
  if (!at.length) return out;
  const key = (cd) => storeOf(cd) + "::" + titleOf(cd).trim().toLowerCase();
  const inRail = new Set(out.map(key));
  const lbIn = at.map((i) => out[i]).filter(isLead);
  const lbMore = (pool || []).filter((cd) => isLead(cd) && isLingerie(cd) && !inRail.has(key(cd)));
  const lead = classTurns(lbIn.concat(lbMore)).slice(0, Math.min(slots, at.length));
  const leadKeys = new Set(lead.map(key));
  const rest = at.map((i) => out[i]).filter((cd) => !leadKeys.has(key(cd)));
  const seq = lead.concat(rest);
  at.forEach((i, j) => { out[i] = seq[j]; });
  return out;
}

/** The plus sizes a Talla filter can name (1X-6X, XL+, numeric 14+ women's). */
export function isPlusSizeLabel(z) {
  const t = String(z || "").trim().toLowerCase();
  if (!t) return false;
  if (/^(xl|xxl|xxxl|[2-6]xl|[0-6]x)$/.test(t)) return true;
  const m = /^(\d{1,2})w?$/.exec(t);
  return !!m && Number(m[1]) >= 14 && Number(m[1]) <= 40 && /w$/.test(t);
}
