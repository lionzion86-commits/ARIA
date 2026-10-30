#!/usr/bin/env node
/* ============================================================
   REPAIR THE SCRAPE-TIME TYPE STAMPS (#443 c.6522560722, Danny: every
   store page label-true -- "a Juguetes rail holding a skateboard deck
   makes us look like we don't have our act together").

   WHY. The store pages group by the product's type (productTypeOf ->
   AriaProductType). A title that names its product ("Blazer XL 36"
   Cruiser") is read by its noun; a title that names only a model
   ("ANTIHERO CARDIEL DESERTSCAPES 8.62", "CJ Nelson 9.6 Parallax Plus",
   "Nike SB Zoom Janoski OG+") falls back to the type the puller stamped
   -- and Parrot's clothing pass stamped decks "Gorras y gorros",
   surfboards and Nike SB shoes "Accesorios".

   WHAT. For those model-only titles, the stamp is corrected from what
   the product is: a surfboard by its shaper, a deck by its deck brand
   and width, a Nike SB shoe by its line. A title that names an
   accessory, a part or a garment is never re-stamped (the noun already
   decides it). Nothing is removed; the original stamp is kept as
   `typeWas`. Idempotent; re-run after any re-pull of the store.

   RUN: node scripts/repair-type-stamps.mjs
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const REPAIR_STORES = { parrot: "parrot-catalog.json" };

/* A title that names something else is read by that noun, never re-stamped. */
const OTHER_NOUN_RX = /\b(leash(?:es)?|fins?|wax|bags?|socks?|covers?|pads?|traction|grips?|tape|racks?|keys?|keychains?|repair|wheels?|trucks?|bearings?|bushings?|hardware|risers?|tools?|stickers?|posters?|pins?|patch(?:es)?|tees?|t-?shirts?|shirts?|hoodies?|crews?|jackets?|pants|shorts|trunks|hats?|caps?|beanies?|visors?|socks?|belts?|wetsuits?|springsuits?|vests?|boots?|gloves?|earrings?|coasters?)\b/i;
/* Surfboard shapers whose model-only titles are boards. */
const SURF_SHAPERS_RX = /^(thunderbolt|firewire|lost|channel islands|haydenshapes|js industries|pyzel|sharp eye|chilli|torq|catch surf|wavestorm|stewart|harbour)$/i;
/* A fin set names its fin system ("Machado Seaside Quad FUT"); a board
   with those boxes leads with its length ("5.2 Machado Cado FUT"). */
const FIN_SET_RX = /\b(fut|fcs\s*2?|dual\s+tab|single\s+tab|fins?|keel|endorfins)\b/i;
const BOARD_LENGTH_RX = /^\d{1,2}(?:[.'’]\d{1,2})\b/;
/* Deck brands and their distributors at Parrot. */
const DECK_BRAND_RX = /^(?:\*?sale\*?\s+)?(antihero|anti hero|santa cruz|real|krooked|baker|creature|powell(?: peralta)?|girl|chocolate|zero|element|primitive|toy machine|deathwish|shake junt|april|welcome|hockey|fucking awesome|bones brigade|globe|landyachtz|sector 9|arbor)\b/i;
const DECK_DISTRO_RX = /^(deluxe|nhs|eastern skateboard supply)$/i;
const DECK_WIDTH_RX = /\b(?:7\.[5-9]\d{0,2}|8\.\d{1,3}|9\.[0-5]\d{0,1})"?\s*$/;
/* Nike SB's skate shoes, by line. */
const SB_SHOE_RX = /\bnike\s+sb\b.*\b(zoom|janoski|nyjah|dunk|blazer|ps8|force\s*58|chron|ishod|bruin|day\s+one|react|vertebrae|malor|pogo)\b/i;

export function repairedType(it) {
  const t = String(it.name || it.title || ""), brand = String(it.brand || "").trim(), type = String(it.type || "");
  if (SB_SHOE_RX.test(t) && !/\b(tees?|shirts?|hoodies?|crews?|pants|shorts|jackets?|hats?|caps?|socks?|bags?)\b/i.test(t)) return /^zapat/i.test(type) ? null : "Zapatos";
  if (OTHER_NOUN_RX.test(t)) return null;
  if (SURF_SHAPERS_RX.test(brand) && (BOARD_LENGTH_RX.test(t) || !FIN_SET_RX.test(t))) return /tablas de surf/i.test(type) ? null : "Tablas de surf";
  if (DECK_BRAND_RX.test(t) && (DECK_WIDTH_RX.test(t) || DECK_DISTRO_RX.test(brand))) return /decks? \(tablas de skate\)/i.test(type) ? null : "Decks (tablas de skate)";
  return null;
}

export function repairCatalogue(env, key) {
  const changed = {};
  for (const dept of Object.values(env.retailers[key].departments)) {
    for (const it of Array.isArray(dept) ? dept : dept.items) {
      /* Always from the puller's own stamp, so a narrowed rule takes back what it no longer claims. */
      const was = it.typeWas !== undefined ? it.typeWas : it.type || "";
      const to = repairedType({ ...it, type: was });
      if (!to) { if (it.typeWas !== undefined) { it.type = it.typeWas; delete it.typeWas; } continue; }
      it.typeWas = was;
      changed[`${was} -> ${to}`] = (changed[`${was} -> ${to}`] || 0) + 1;
      it.type = to;
    }
  }
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [key, file] of Object.entries(REPAIR_STORES)) {
    const env = JSON.parse(readFileSync(ROOT + file, "utf8"));
    const changed = repairCatalogue(env, key);
    writeFileSync(ROOT + file, JSON.stringify(env));
    console.log(key, JSON.stringify(changed));
  }
}
