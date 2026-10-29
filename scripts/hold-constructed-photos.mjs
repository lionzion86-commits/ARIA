#!/usr/bin/env node
/* ============================================================
   HOLD THE CONSTRUCTED PHOTOS -- BoxLunch and Hot Topic (#443
   c.6495076024, Danny: no image, no card).

   WHY. The Oct 5 puller never captured these stores' photo URLs: it
   built every one from the product ID
   (cdn.media.amplience.net/s/hottopic/<id>_hi). For garments the asset
   ID is the product ID and the photo loads; for everything else
   (Funkos, bags, jewelry, plush, mugs...) the asset ID differs and the
   URL is a 404 -- Lucifer verified the Funkos Danny screenshotted, and
   the Oct 25 audit measured ~85-90% of BoxLunch dead. A card with
   "Foto en camino", a price and a buy button is what the rule forbids.

   WHAT. A non-garment product from these stores whose photo is a
   constructed URL has it moved to `heldImage` (image/images/thumbnail
   cleared, `photoHeld: "constructed-url"`), so every builder's own
   no-photo rule leaves it out of every slice, rail, carousel and the
   search index. Nothing else in the record changes, and nothing is
   deleted: the og:image repair (capture the real asset URL per product,
   never construct one) writes a real `image` and the product returns.
   Idempotent; re-run after any re-pull of either store.

   RUN: node scripts/hold-constructed-photos.mjs
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const HOLD_STORES = { boxlunch: "boxlunch-catalog.json", hottopic: "hottopic-catalog.json" };
export const CONSTRUCTED_RX = /^https:\/\/cdn\.media\.amplience\.net\/s\/hottopic\/\d+_hi\b/;
/* The garment types whose constructed URL is the real asset. */
export const GARMENT_TYPES = new Set(["Camiseta", "Camisa", "Top", "Hoodie", "Suéter", "Chaqueta", "Vestido", "Falda",
  "Pantalón", "Jeans", "Shorts", "Traje de baño", "Ropa de estar", "Ropa interior", "Pijama"]);

/* The type alone is not trusted: "Search for SquarePants" Funkos were
   typed Pantalón. A garment's own title names the garment. */
export const GARMENT_TITLE_RX = /\b(t-?shirts?|tees?|shirts?|tops?|tanks?|camis?|blouses?|hoodies?|sweatshirts?|sweaters?|cardigans?|jackets?|dress(es)?|skirts?|pants|jeans|joggers|leggings|shorts|swim\w*|bikinis?|one-piece|pajamas?|pajama|lounge\w*|sleep\w*|bralettes?|boxers?|briefs?|panties|underwear|overalls?|rompers?|jumpsuits?|flannel|corsets?|vests?)\b/i;
/* ...and a title that names a bag, a figure or a trinket is not one
   ("Loungefly ... Dress Mini Backpack"). */
export const NON_GARMENT_RX = /\b(loungefly|backpacks?|bags?|purses?|totes?|crossbody|wallets?|lanyards?|funko|figures?|figurines?|vinyl|plush\w*|squishmallows?|mugs?|tumblers?|cups?|keychains?|key chains?|pins?|patches|necklaces?|earrings?|rings?|bracelets?|charms?|ears|headbands?|hats?|caps?|beanies?|socks?|blankets?|throws?|pillows?|posters?|stickers?|cases?)\b/i;
export function holdsPhoto(item) {
  if (!item || !CONSTRUCTED_RX.test(String(item.image || ""))) return false;
  const title = String(item.name || item.title || "");
  const garment = GARMENT_TYPES.has(String(item.type || "")) && GARMENT_TITLE_RX.test(title) && !NON_GARMENT_RX.test(title);
  return !garment;
}

export function holdCatalogue(env, key) {
  let held = 0, kept = 0;
  for (const dept of Object.values(env.retailers[key].departments)) {
    for (const it of Array.isArray(dept) ? dept : dept.items) {
      if (holdsPhoto(it)) {
        it.heldImage = it.image;
        it.image = null; it.images = []; it.thumbnail = null;
        it.photoHeld = "constructed-url";
        held++;
      } else if (it.image) kept++;
    }
  }
  return { held, kept };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [key, file] of Object.entries(HOLD_STORES)) {
    const env = JSON.parse(readFileSync(ROOT + file, "utf8"));
    const { held, kept } = holdCatalogue(env, key);
    writeFileSync(ROOT + file, JSON.stringify(env));
    console.log(`${key}: ${held} photos held (constructed URL, not a garment), ${kept} with a photo`);
  }
}
