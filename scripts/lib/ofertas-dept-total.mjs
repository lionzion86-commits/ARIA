/* ==================================================================
   THE NUMBER THE HOMEPAGE PROMISES IS THE NUMBER OFERTAS SHOWS
   (2026-10-14, #386 Battery Run 2: the homepage's "Ver todo" said
   15,864 ofertas while the department page listed 24,386).

   The two surfaces counted different sets: the homepage counted its own
   gated cache (plus the old live scrape), the department page counts the
   feed rows that pass ITS gate -- the one sale rule and a real photo --
   in the all-stores view, which also carries the $150 mix cap. The
   department page is what the shopper lands on, so its all-stores count
   is the one number: since #409 the page draws server-built slices, so
   it is computed here with the slice builder's own functions (the
   all-stores view is every card marked m, under the mix cap) and
   stamped into both feed files as `deptTotal`, which the homepage shows.
   ================================================================== */
import { buildCards, loadSaleRule } from "../build-ofertas-slices.mjs";

export function ofertasDeptTotal(items, root) {
  const cards = buildCards(items, loadSaleRule(root));
  let n = 0;
  for (const c of cards) if (c.m === 1) n++;
  return n;
}
