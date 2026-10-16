/* ==================================================================
   THE NUMBER THE HOMEPAGE PROMISES IS THE NUMBER OFERTAS SHOWS
   (2026-10-14, #386 Battery Run 2: the homepage's "Ver todo" said
   15,864 ofertas while the department page listed 24,386).

   The two surfaces counted different sets: the homepage counted its own
   gated cache (plus the old live scrape), the department page counts the
   feed rows that pass ITS gate -- the one sale rule and a real photo --
   in the all-stores view, which also carries the $150 mix cap. The
   department page is what the shopper lands on, so its all-stores count
   is the one number: computed here with ofertas.html's own functions
   (lifted, not copied) and stamped into both feed files as `deptTotal`,
   which the homepage shows.
   ================================================================== */
import { readFileSync } from "node:fs";
import { liftDeclarations } from "./page-lift.mjs";

export function ofertasDeptTotal(items, root) {
  const html = readFileSync(root + "ofertas.html", "utf8");
  const extra = "var window = {};\n" + readFileSync(root + "sale-rule.js", "utf8").replace(/\r\n/g, "\n") + "\n";
  const P = liftDeclarations(html, ["realImage", "isDeal", "passesMixCap"], { extra });
  let n = 0;
  for (const p of items || []) if (P.isDeal(p) && P.passesMixCap(p)) n++;
  return n;
}
