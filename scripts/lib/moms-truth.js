/* ============================================================
   THE MOMS CATALOGUE'S TYPES, BY WHAT THE PRODUCT IS (#443, Danny's
   ruling on the «Alimentación» rail: a Munchkin «Peek-A-Boo Penguin Bath
   Toy» and a Dr. Brown's watering-can bath toy sat in it, next to
   descaler liquid, HEPA filters, detergent tablets and a cookbook).

   Aria sells no food. The moms catalogue's ALIMENTACION type is baby
   FEEDING GEAR and nothing else -- «Biberones y alimentación del
   bebé»: bottles, nipples, warmers, sterilizers and bottle washers,
   bottle care, food makers and pouches, infant spoons and utensils,
   bowls, plates, cups, bibs.

   The pull filed every product of a store's "feeding" collection there,
   whatever it was. The same coarse typing ran through the other buckets
   (a gaming chair as a Silla de comer, swaddles under Lactancia, baby
   pajamas under Maternidad). One rule, by the product's own title noun:

     momsTypeOf(item) -> the type the product truly is: a moms type
                         below, or the type it already has when its title
                         names nothing else.

   What is not a product a shopper buys at a baby store (spare and
   replacement parts, refills, cleaning consumables, books, plans and
   donations, strays from another aisle) is not retyped: /not-sold.js
   names it, scripts/purge-not-sold.mjs cuts it from every catalogue and
   the builders are re-run.

   Applied by scripts/apply-moms-truth.mjs (idempotent); pinned by
   scripts/test/moms-feeding-truth-tests.mjs, so a re-pull that brings
   the coarse types back fails the suite until it is applied again.
   ============================================================ */

/* The moms catalogue's types and how each reads in Spanish
   (netlify/functions/_department-core.js TYPE_ES carries the same). */
export const MOMS_TYPE_LABELS = {
  ALIMENTACION: "Biberones y alimentación del bebé",
  LACTANCIA: "Lactancia",
  MATERNIDAD: "Maternidad",
  COCHE: "Coche",
  HABITACION_BEBE: "Habitación del bebé",
  PANALES: "Pañales",
  AUTOASIENTO: "Autoasiento",
  SILLA_DE_COMER: "Silla de comer",
  PORTABEBE: "Portabebe",
  BANO_BEBE: "Baño del bebé",
  CHUPETES: "Chupetes y mordedores",
  CUIDADO_BEBE: "Cuidado del bebé",
  ROPA_BEBE: "Ropa de bebé",
  JUGUETES_BEBE: "Juguetes",
};
export const FEEDING_TYPE = "ALIMENTACION";
export const FEEDING_LABEL = MOMS_TYPE_LABELS.ALIMENTACION;

const rx = (words) => new RegExp("\\b(?:" + words + ")\\b", "i");

/* Words that are never feeding gear: what the shopper saw in the rail. */
export const NOT_FEEDING_NOUN_RX = rx("toys?|bath|bathtub|tub|duck(?:y|ies)|squirts|bobbers|filters?|descal\\w*|detergent|tablets|cookbook|recipes?|books?|guide|replacement|refills?|spare|parts?|toothbrush(?:es)?|toothpaste|pacifiers?|paci|teethers?|teething|swing|bouncer|rocker|mirror|harness|onesie|t-?shirt|nightie|nail|aspirator|potty|deodorizers?|hamper|wipes?|sun shade|seat guardian|stroller|car seat|backpack|soap|candies|electrolyte|drink mix|pumping bra|breast pads?|gripebelt|swaddling|compress|thermometer");

/* ---- the rules. The product is the FIRST thing its title names
   ("Baby Stroller ... with Cup Holder" is a stroller, "High Chair with
   5-Point Safety Harness" a high chair); of two names that start at the
   same word the longer one reads ("Bottle Brush", not "Bottle"). A title
   none of them reads keeps the type it has. ---- */
const RULES = [
  /* Strollers and what goes on one. */
  ["COCHE", rx("strollers?|stroller wagon|wagon canopy|travel system|pushchair|buggy|cup holders?|footmuff|stroller organizer|stroller fan|stroller cooling pad|stroller hand muff|stroller travel bag|stroller seat liners?")],
  /* Car seats and car travel. */
  ["AUTOASIENTO", rx("car seats?|infant car seat|booster car seat|booster seat|belt-positioning booster|car seat base|seat base|car mirror|seat guardian|sun safety shade|stretch to fit™? sun shade|sun shade|trunk organizer|car seat travel bag")],
  /* High chairs and dining seats. */
  ["SILLA_DE_COMER", rx("high ?chairs?|highchairs?|feeding chairs?|dining booster seat|learn-to-dine feeding seat")],
  /* Carriers. */
  ["PORTABEBE", rx("baby carriers?|ergonomic baby carrier|wrap carrier|baby wrap")],
  /* Bath time: tubs, bath toys, rinse cups, bath thermometers, towels. */
  ["BANO_BEBE", rx("bath toys?|bath squirts|bath duckies|bath bobbers|ducky|float & play bubbles|float & hatch dino eggs|bath stickers|bath spout cover|bath rinse cup|bath toy organizer|bath thermometer|floating bath thermometer|bathtub|baby bath|first bath set|bath bombs|bubble bath|hooded baby towel|poncho towel|baby washcloths?|foaming infant wash")],
  /* Pacifiers, teethers and what holds them. */
  ["CHUPETES", rx("tumbler teether|pacifiers?|happypaci|li[’']?lpaci|teethers?|teething (?:ring|tubes|kit|mitten)|pacifier clips?|pacifier clip two-pack|pacifier and teether holder|pacifier & teether")],
  /* Grooming and health. */
  ["CUIDADO_BEBE", rx("infant lotion|toothbrush(?:es)?|toothscrubber|toothpaste|oral cleaners|finger toothbrush|nail scissors|nail file|nasal aspirator|baby brush \\+ comb|medicine dispenser|baby scale|gripebelt|colic swaddling belt|cold comfort compress|diaper rash spray|healthy wipes|forehead and ear thermometer|baby thermometer|mini thermometer|potty seat|safety harness|all-in-1 (?:core|elite|glow) baby kit")],
  /* Baby clothing. */
  ["ROPA_BEBE", rx("baby onesie|bamboo onesie|long sleeve onesie|room to roam onesie|room to roam t-shirt|baby pajamas?|baby two-piece pajama|baby gown|baby pajama bundle|bodysuit set|swaddle hat set|bucket hat")],
  /* Toys and play. */
  ["JUGUETES_BEBE", rx("play ?mat|playmat|tool set|hetical game")],
  /* Nursery: sleep, swings, bouncers, monitors, playards, swaddles. */
  ["HABITACION_BEBE", rx("swings?|bouncer|rocker|vibrating pad|nursery deodorizers|nursery hamper|playards?|play yard|cribs?|bassinet|swaddles?|swaddle blankets?|sleep sack|sound machine|baby monitor|baby loungers?|nap mat|changing table")],
  /* Diapering, and the bags that carry it. */
  ["PANALES", rx("wipe warmer|diaper|changing pad|insulated bottle bag|bottle tote|wet/dry bag|cooler bag|lunch box|backpack|zipper pouch|quick change kit bag|quick change half moon bag|wristlet wallet")],
  /* Feeding gear. */
  ["ALIMENTACION", rx("burp cloths?|bottle warmer|breast milk water warmer|self-feeding set|all-in-one gift set|breast ?milk (?:&|and) bottle warmer|bottle (?:&|and) breast ?milk warmer|water warmer|warm water dispenser|sterilizers?|sterilizer bags?|bottle washer|drying (?:rack|tower)|dry(?:ing)? & prep|bottle brush|cleaning (?:bristle )?brush|silicone brush|electric silicone brush set|squeeze & scrub|dishwasher basket|dishwasher bag|storage tray|sink caddy|collapsible sink|food maker|food pouches|squeeze station|pouch holder|feeders?|freezer tray|spoons?|forks?|utensils?|bowls?|plates?|dining set|dishware|mealtime|meals bundle|first (?:bites|tastes) bundle|happy snacker|snack(?: catcher| wheel| and dipping cups)|snack\\+|bento|cups?|tumblers?|sippy|straw|bibs?|bottles?|nipples?|feeding system|feed & store|travel caps|silicone sleeves?|silicone handles|conversion kit|nibbles|baby gift box|portable baby bottle cooler|bottle cooler")],
  /* Lactation. */
  ["LACTANCIA", rx("express & collect|collection kit|breast ?pumps?|pumps?|pump bottles|pumping|breast ?milk|breastmilk|milk (?:storage|collection|collector|bags?|bottle)|colostrum|collection cups|nursing cups|stride cups|nursing (?:pillow|cover|pads?)|feeding pillow|feeding support cushion|feeding & nursing|nipple (?:shields?|cream|balm|pads|cushions|sizing tool)|nipple \\+ lip balm|lanolin\\+? nipple|lactation|breast pads|breast therapy|breast shells?|butterfly nipple|cooler with ice pack|breastfeeding|latch kit|wearable feeding|feeding nightie")],
  /* Mom's own: belly bands, pregnancy pillows, compression, recovery. */
  ["MATERNIDAD", rx("pelvic pain relief band|belly bands?|belly wrap|pregnancy (?:pillows?|ball|support|body pillow|knee pillow)|maternity (?:belly band|ball|exercise ball|body pillow)|compression socks|medical socks|kegel exerciser|stretch mark cream|back support belt")],
];

/* The product a bundle is named for: "Cleaning Bundle: Bottle Washer +
   Tablets" is a bottle washer. */
function headOf(title) {
  const t = String(title || "");
  const m = /\bbundle\s*[:：]\s*(.+)$/i.exec(t) || /\bkit\s*[:：]\s*(.+)$/i.exec(t);
  return m ? m[1] : t;
}

/* Titles the rules cannot read, decided by hand (what each one is). */
export const OVERRIDES = {
  /* JuJuBe bundles: a backpack is the product. */
  "Hello Kitty® × JuJuBe Cherry Blossoms Zealous Backpack + Insulated Bottle Bag + Medium Spiral Notebook Bundle": "PANALES",
  /* A swing seat cover and a swing's travel case are the swing's. */
  "Premium Seat Cover for Swing": "HABITACION_BEBE",
  "Premium Seat Cover for Bouncer & Rocker": "HABITACION_BEBE",
  "Travel Case for Swing": "HABITACION_BEBE",
  "Swing + Premium Swing Seat Cover": "HABITACION_BEBE",
  /* A car seat's antimicrobial cover and head support. */
  "XtraGuard™ Antimicrobial 5-in-1 Cover": "AUTOASIENTO",
  "XtraGuard™ Antimicrobial Head Support & Straps": "AUTOASIENTO",
  /* A nursing nightie is Hatch's nursing wear. */
  "The Pointelle Feeding Nightie": "LACTANCIA",
  /* A dining booster seat is a high chair. */
  "Ingenuity Deluxe Learn-to-Dine Feeding Seat, Ages 6 Months to 3 Years, Orange and Teal": "SILLA_DE_COMER",
  /* Momcozy's playard bundles lead with the playard. */
  "Playard & Diaper Pail & 2-in-1 Electric Baby Swing Bundle": "HABITACION_BEBE",
  "Playard & Diaper Pail Bundle": "HABITACION_BEBE",
  "PureHug Baby Carrier & 99% Water Baby Wipes Set": "PORTABEBE",
  "On the Go Bundle：PureHug Baby Carrier and Breastmilk Cooler Bag and Bottle Warmer": "PORTABEBE",
  "On-the-Go Bundle：Bottle Warmer and Bottle Cooler and Breastmilk Cooler Bag": "ALIMENTACION",
  "Feeding & Oral Care Bundle: Portable Breast Milk Cooler and Tongue Cleaner": "LACTANCIA",
  "On-the-Go Baby Care Bundle: Portable Breast Milk Cooler and Finger Toothbrush Set": "LACTANCIA",
  "On-the-Go Baby Care Bundle: Portable Breast Milk Cooler and Teether Toys": "LACTANCIA",
  "Momcozy Portable Baby Bottle Cooler for Outdoor - 12oz": "ALIMENTACION",
  "Momcozy Baby Wipe Warmer & 99% Water Wipes Set": "PANALES",
  "Portable Breast Milk Water Warmer & 99% Water Wipes Set": "ALIMENTACION",
  "KleanPal Pro Baby Bottle Washer & 99% Water Wipes Set": "ALIMENTACION",
  /* A nipple sizing tool sizes the breast-pump flange. */
  "Nipple Sizing Tool": "LACTANCIA",
  /* A stroller's bassinet attachment is the stroller's. */
  "Bassinet for Momcozy ChangeGo Baby Stroller": "COCHE",
  /* A high chair that also swings is still a high chair. */
  "3 in 1 Baby Swing Convertible BabyHigh Chair,Portable Baby Feeding Chairs,Baby Folding Dining Chairs for Babies and Toddlers,Adjustable Height,Unisex,KHAKI": "SILLA_DE_COMER",
  /* Spectra's tumbler is a drinking cup for mom, not a baby's. */
  "Pink Tumbler": "MATERNIDAD",
  /* Lillebaby's Carryon is a carrier; the hat comes with it. */
  "Carryon Airflow DLX + Bucket Hat - Mossy Oak® Break-Up Country®": "PORTABEBE",
};

/** The type the product truly is (an existing moms type), by its own title. */
export function momsTypeOf(item) {
  const title = String((item && (item.name || item.title)) || "");
  const cur = String((item && item.type) || "");
  if (Object.prototype.hasOwnProperty.call(OVERRIDES, title)) return OVERRIDES[title];
  const m = firstNamed(headOf(title));
  return m ? m.type : cur;
}

/* The first product name in a title: { type, at, text } or null. */
export function firstNamed(text) {
  let best = null;
  for (const [type, re] of RULES) {
    const g = new RegExp(re.source, "gi");
    let m;
    while ((m = g.exec(text))) {
      if (!best || m.index < best.at || (m.index === best.at && m[0].length > best.text.length)) best = { type, at: m.index, text: m[0] };
      if (!m[0].length) g.lastIndex++;
    }
  }
  return best;
}
