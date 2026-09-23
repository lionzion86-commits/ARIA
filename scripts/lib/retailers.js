/* ============================================================
   THE RETAILER REGISTRY — one place that knows what a store IS.

   WHY THIS EXISTS
   Adding Sephora and Victoria's Secret meant touching a store's identity
   in seven separate places: LIVE_RETAILERS, LIVE_RETAILER_LABEL,
   RETAILER_BADGE_COLOR and RETAILER_LOGO_FILE in index.html, three more
   hand-copied maps in checkout.html, a hardcoded <button> per store in
   the Tiendas markup, and RETAILER_CONFIG in the scraper. Miss one and
   the store shows a grey "Tienda" pill on one page and its real logo on
   the next. That does not scale to the next three to five stores.

   NOW: a store is a row in RETAILERS below. Everything that renders a
   store reads that row. Adding one is data entry — see ADDING A RETAILER.

   WHAT LIVES HERE: identity and presentation only — the name, the brand
   colour, the logo file, the one-line description, what kind of store it
   is, and whether its scraper is live yet. Actor IDs, category URLs and
   every other scraping detail stay server-side in
   netlify/functions/apify-scrape-start.js, because they are operational
   config a browser has no business holding.

   ------------------------------------------------------------
   ADDING A RETAILER
     1. Add a row below (and the matching row in index.html's mirror —
        the page is a plain <script> and cannot import).
     2. Drop its logo in logos/<key>.svg and set `logo`. Optional: with
        no logo file the store renders as a wordmark pill on its brand
        colour, which is a real fallback, not a broken state.
     3. In netlify/functions/apify-scrape-start.js, add a RETAILER_CONFIG
        entry: an actorId plus an `inputShape` name (no new code — see
        INPUT_SHAPES there). Add DEPARTMENT_CONFIG entries only if that
        actor supports real category browsing.
     4. Flip `search: true` on the row. That is what puts the store in
        the live cross-store search fan-out.
   Nothing else in the site needs to change.

   A STORE WITH A CATALOGUE BUT NO ACTOR skips steps 3 and 4 and sets
   `browse: true` instead — see the Macy's row. It is listed, browsable
   and shoppable; it just is not queried by the live search.
   ------------------------------------------------------------
   ============================================================ */

/* `search: false` means "a real store we buy from, whose scraper is not
   wired up yet". It is listed everywhere a store is listed, and honestly
   labelled, but it is kept OUT of the live search fan-out — a search that
   calls an unconfigured retailer just returns a failed store card, which
   looks like a bug to a shopper and is one to us. */
export const RETAILERS = {
  walmart: {
    key: "walmart",
    label: "Walmart",
    color: "#0071CE",
    logo: "logos/walmart.svg",
    tagline: "De todo, a buen precio",
    kind: "general",
    search: true,
  },
  target: {
    key: "target",
    label: "Target",
    color: "#CC0000",
    logo: "logos/target.svg",
    tagline: "Ropa, hogar y belleza",
    kind: "general",
    search: true,
  },
  oldnavy: {
    key: "oldnavy",
    label: "Old Navy",
    color: "#001E62",
    logo: "logos/oldnavy.svg",
    tagline: "Ropa casual para toda la familia",
    kind: "general",
    search: true,
  },
  footlocker: {
    key: "footlocker",
    label: "Foot Locker",
    color: "#000000",
    logo: "logos/footlocker.svg",
    tagline: "Zapatillas y ropa deportiva",
    kind: "general",
    search: true,
  },
  /* SEPHORA AND VICTORIA'S SECRET (2026-09-20, mandatory per the brief).

     Both are real rows: they appear on Tiendas, they carry their own
     brand colour and wordmark, and every beauty weight in the estimator
     was written for their catalogues. What they do not have yet is a
     verified Apify actor — the Apify store could not be reached from the
     build environment to confirm an actor ID, and pointing the scraper at
     a guessed one returns an empty run that reads as "this store has no
     products" rather than as a missing integration.

     So they ship as `search: false` with `catalog: "beauty"`. Step 3 and
     step 4 of ADDING A RETAILER above are the whole remaining task.

     2026-09-20: their real logo files landed, so steps 1 and 2 are done —
     all three render their own mark on Tiendas now instead of a wordmark
     pill. That is independent of the scraper: a store can look like
     itself long before its catalogue is connected.

     2026-09-22: SEPHORA IS BROWSABLE. beauty-catalog.json landed with
     80 Sephora products, so its row flips `browse: true` and drops the
     pending note, exactly as Macy's did — same distinction, same two
     flags. Victoria's Secret and Bath & Body Works are NOT in that file
     and stay pending; a store is only browsable when a catalogue
     actually names it. */
  sephora: {
    key: "sephora",
    label: "Sephora",
    color: "#000000",
    logo: "logos/sephora.png",
    /* NO BRAND NAMED HERE — the SSENSE rule, applied before it can bite.
       The brief's line was "Maquillaje y skincare — NARS, Rare Beauty",
       and both ARE in the export, so it would have been true today. It
       is still the wrong place to say it: the card already paints a
       brand line read from the catalogue (topBrandsFor), so naming the
       same two by hand would print them twice on one card and would go
       stale the first time the export changes. The data says the
       brands; the tagline says the department. */
    tagline: "Maquillaje, skincare y perfumes",
    kind: "general",
    catalog: "beauty",
    search: false,
    browse: true,
  },
  victoriassecret: {
    key: "victoriassecret",
    label: "Victoria's Secret",
    color: "#E31C79",
    logo: "logos/victoriassecret.png",
    tagline: "Lencería, brumas corporales y fragancias",
    kind: "general",
    catalog: "beauty",
    search: false,
    pendingNote: "Conectando el catálogo",
  },
  /* BATH & BODY WORKS (2026-09-20). Fragrance and body care is core to
     the audience this shop is being launched for, and it is the eighth
     store — which is what makes the stores grid symmetric at 4x2 instead
     of leaving a hole. Same status as the other two beauty stores: a
     real row, quotas written, no verified actor yet. */
  bathandbodyworks: {
    key: "bathandbodyworks",
    label: "Bath & Body Works",
    color: "#0F4C81",
    logo: "logos/bathandbodyworks.png",
    tagline: "Cremas, jabones y velas aromáticas",
    kind: "general",
    catalog: "beauty",
    search: false,
    pendingNote: "Conectando el catálogo",
  },
  /* ============================================================
     MACY'S (2026-09-22) — THE FIRST BROWSE-WITHOUT-SCRAPE STORE

     Macy's arrived as a file: an export of 960 women's-clothing best
     sellers, not a live actor. That broke an assumption baked into this
     registry since it was written — that `search` meant both "you can
     browse this store" and "we can query it live". Those are different
     capabilities and Macy's has exactly one of them, so they are two
     flags now:

       search  the live cross-store fan-out may call it. Needs a
               RETAILER_CONFIG actor in apify-scrape-start.js. FALSE for
               Macy's: calling an unconfigured retailer returns a failed
               store card, which looks like a bug to a shopper.
       browse  it has a real catalogue a shopper can walk through, from
               whatever source. TRUE — macys-catalog.json, built by
               scripts/build-macys-catalog.mjs.

     A store with `browse` is NOT "conectando el catálogo": it has one.
     That distinction is why storeCardHTML's pending state reads both
     flags rather than just `search`.

     Fulfilment is not a question here — Macy's ships to the Miami
     warehouse like the rest, so nothing special is needed downstream. */
  macys: {
    key: "macys",
    label: "Macy's",
    color: "#E21A2C",
    logo: "logos/macys.png",
    tagline: "Moda mujer, marcas y vestidos",
    kind: "general",
    search: false,
    browse: true,
  },
  /* ============================================================
     ULTA AND YESSTYLE (2026-09-22) — the rest of beauty-catalog.json

     77 Ulta products and 40 YesStyle products arrived in the same file
     as Sephora's 80. Both are browse-without-scrape, same as Macy's and
     SSENSE: a real catalogue, no actor, kept out of the live fan-out.

     BOTH MARKS LANDED (2026-09-22). They shipped as wordmark pills on
     our navy for a few hours, because a brand's name on a colour we
     invented for them is worse than one on ours. Now they render their
     own logos, and `color` has stopped being a placeholder: each value
     below was SAMPLED FROM THE SUPPLIED ARTWORK rather than recalled,
     which is the lesson the SSENSE tagline taught. Ulta's orange is
     #F88038 across 229,142 pixels of its file. YesStyle's most common
     ink is actually its near-black (#201818, the "STYLE" half), but a
     near-black badge is indistinguishable from Sephora's and SSENSE's,
     so the row takes the green (#50A838) that says whose mark it is.
     Either way the colour is now only a fallback: it backs the wordmark
     pill and the small text badge, neither of which renders while the
     logo file resolves.

     YESSTYLE'S FILE NEEDED CROPPING. The wordmark filled 7.4% of a
     1000x667 canvas and the rest was white. Contain-fit sizes the
     CANVAS, so it would have drawn a sliver exactly the way SSENSE did
     -- see the coverage test in scripts/test/run-tests.mjs, which now
     fails any logo under 35%. Cropped to 642x86, it is 89.6% mark.

     YesStyle is Asian beauty specifically (Korean and Japanese houses —
     Anua, BBIA, CLIO, Canmake). The tagline says so, because "YesStyle"
     tells a shopper in Lima nothing and "coreana" tells them everything.
     ============================================================ */
  ulta: {
    key: "ulta",
    label: "Ulta Beauty",
    color: "#F88038",
    logo: "logos/ulta.png",
    tagline: "Maquillaje, skincare y cuidado del cabello",
    kind: "general",
    catalog: "beauty",
    search: false,
    browse: true,
  },
  yesstyle: {
    key: "yesstyle",
    label: "YesStyle",
    color: "#50A838",
    logo: "logos/yesstyle.png",
    tagline: "Belleza coreana y japonesa",
    kind: "general",
    catalog: "beauty",
    search: false,
    browse: true,
  },
  /* ============================================================
     THE 2026-09-22 LOGO BATCH — seven stores, no catalogues yet

     Every one of these is `search: false` with no `browse` flag, which
     is the honest-pending state the homepage already promises: "Las que
     estamos conectando lo dicen — preferimos un 'próximamente' honesto
     a un logo que no lleva a ningún lado." They get the muted plate and
     the "Conectando el catálogo" badge on Tiendas, and their store page
     says we buy there by request while the integration is finished.
     None of them enters the search fan-out, the category feeds or
     Ofertas, because CATALOG_RETAILERS reads `search || browse` and
     they have neither. That is the whole mechanism; no new code.

     REAL LOGO TILES, NOT WORDMARK PILLS. Every row below carries a file,
     so none of them falls back to the pill treatment. `color` is only
     ever the pill's and the small text badge's background, and each
     value was SAMPLED FROM THE ARTWORK rather than recalled — Skims is
     #605848 across 145,523 pixels of its own file, Fendi and Dyson are
     #202020, and the rest are a true black.

     SUNGLASS HUT USES THE OLD "INTERNATIONAL" MARK, with the split
     yellow/blue sun. Danny's explicit call: a shopper in Lima knows
     that logo and does not know the rebrand. It is white-and-colour
     artwork on its own black field, so it tiles exactly the way
     Victoria's Secret's pink card and Bath & Body Works' blue one do —
     the field is IN the file, not in our CSS. Not stretched (the plate
     is contain-fit) and not recoloured.

     THE LUXURY THREE. Fendi, Miu Miu and Golden Goose sit in the luxury
     tier beside SSENSE; the other four are everyday. A tier decides one
     heading on Tiendas and nothing else — see TIERS below.
     ============================================================ */
  skims: {
    key: "skims",
    label: "Skims",
    color: "#605848",
    logo: "logos/skims.png",
    tagline: "Shapewear, ropa interior y loungewear",
    kind: "general",
    search: false,
    pendingNote: "Conectando el catálogo",
  },
  revolve: {
    key: "revolve",
    label: "Revolve",
    color: "#000000",
    logo: "logos/revolve.png",
    tagline: "Moda contemporánea y de diseñador",
    kind: "general",
    search: false,
    pendingNote: "Conectando el catálogo",
  },
  dyson: {
    key: "dyson",
    label: "Dyson",
    color: "#202020",
    logo: "logos/dyson.png",
    tagline: "Secadoras, aspiradoras y purificadores",
    kind: "general",
    search: false,
    pendingNote: "Conectando el catálogo",
  },
  sunglasshut: {
    key: "sunglasshut",
    label: "Sunglass Hut",
    color: "#000000",
    logo: "logos/sunglasshut.png",
    tagline: "Lentes de sol de marca",
    kind: "general",
    search: false,
    pendingNote: "Conectando el catálogo",
  },
  autozone: {
    key: "autozone",
    label: "AutoZone",
    color: "#1C8A4B",
    logo: "logos/autozone.svg",
    tagline: "Repuestos y autopartes — vía Aria Auto",
    // Aria Auto's part-search source, not a general storefront: it is
    // deliberately excluded from the general search fan-out.
    kind: "auto",
    search: true,
  },
  /* ============================================================
     SSENSE (2026-09-22) — THE HIGH-END TIER, AND NORDSTROM'S REPLACEMENT

     Nordstrom was the luxury slot and it never worked: three integration
     attempts, zero products, because its bot protection beats the actor.
     It stays retired below. SSENSE takes the slot.

     THE SHOPPER DOES NOT KNOW "SSENSE", and that is the design
     constraint Danny named: a shopper in Lima recognises Gucci, Prada
     and Adidas, not the retailer carrying them. So a high-end store is
     introduced by its BRANDS, not by its name — brandsFor() below reads
     them from the catalogue rather than from a hand-written list, so the
     card can never promise a label the store is not actually carrying.

     STATUS: listed, not yet browsable. A 2,431-product men's pull exists
     in Apify ($2.45, 2026-09-22) and the women's pull is waiting on the
     monthly limit, but neither has been exported into this repo. Until
     the file lands this is exactly the Macy's situation before its
     export arrived: a real row, honestly labelled, kept out of the live
     search so an unconfigured retailer cannot return a failed store
     card. Flip `browse: true` the day the catalogue is committed.
     ============================================================ */
  ssense: {
    key: "ssense",
    label: "SSENSE",
    color: "#000000",
    logo: "logos/ssense.png",
    /* NO BRAND NAMED HERE, and that is the correction. This row was
       written from the brief as "Gucci, Prada, Balenciaga" before the
       catalogue existed. The export that arrived carries 192 brands and
       NEITHER Gucci NOR Prada — its biggest names are Rick Owens, Dries
       Van Noten, Stone Island, Moncler and Thom Browne. A hand-written
       brand list is a promise nobody checks, so the card reads its
       brands from the catalogue instead. */
    tagline: "Diseñador y lujo, importado igual que todo lo demás",
    kind: "general",
    tier: "luxury",
    search: false,
    browse: true,
  },

  /* THE LUXURY THREE SIT BELOW SSENSE ON PURPOSE. SSENSE is the only
     store in this tier with a catalogue behind it, and retailersByTier()
     preserves declaration order — so listing three "conectando" cards
     above it would bury the one a shopper can open today. */
  fendi: {
    key: "fendi",
    label: "Fendi",
    color: "#202020",
    logo: "logos/fendi.png",
    tagline: "Bolsos, accesorios y moda italiana",
    kind: "general",
    tier: "luxury",
    search: false,
    pendingNote: "Conectando el catálogo",
  },
  miumiu: {
    key: "miumiu",
    label: "Miu Miu",
    color: "#000000",
    logo: "logos/miumiu.png",
    tagline: "Bolsos, calzado y moda italiana",
    kind: "general",
    tier: "luxury",
    search: false,
    pendingNote: "Conectando el catálogo",
  },
  goldengoose: {
    key: "goldengoose",
    label: "Golden Goose",
    color: "#000000",
    logo: "logos/goldengoose.png",
    tagline: "Zapatillas y moda italiana",
    kind: "general",
    tier: "luxury",
    search: false,
    pendingNote: "Conectando el catálogo",
  },
  /* Listed but not sold: these were integrated once and turned off for
     real reasons (cost, and Nordstrom's bot protection returning zero
     items across three attempts). They stay here so a label and a colour
     still resolve for any historical order or cached item that names
     them, and so nobody re-adds them without reading why they went. */
  bestbuy: { key: "bestbuy", label: "Best Buy", color: "#0046BE", logo: null, kind: "general", search: false, retired: true },
  nordstrom: { key: "nordstrom", label: "Nordstrom", color: "#000000", logo: null, kind: "general", search: false, retired: true,
    retiredNote: "Bot protection: tres integraciones, cero productos. Reemplazada por SSENSE." },
};

/* ============================================================
   TIERS — how the DIRECTORY is grouped, and nothing else.

   Danny's call (2026-09-22): Tiendas needs a visible high-end section
   rather than one flat run of logos, because "SSENSE" means nothing to
   a shopper in Lima while "Gucci" and "Prada" mean a great deal.

   A TIER IS PRESENTATION, NEVER A GATE. It decides which heading a
   store sits under on Tiendas. It does NOT decide who is in the
   cross-store search, who is in Ofertas, or whose prices are compared —
   those read `search`, `browse` and the deals feed, all of which ignore
   tier completely. That separation is the point: searching "Adidas
   sneakers" has to show SSENSE beside Foot Locker, and an SSENSE
   markdown has to compete in Ofertas on the same row as a Macy's one.
   Tests pin both.

   `everyday` is the default and is written out rather than implied, so
   a new row's tier is a decision somebody made instead of a field
   somebody forgot.
   ============================================================ */
export const TIERS = [
  { key: "luxury",   label: "Diseñador y lujo",
    blurb: "Las marcas que ya conoces, importadas igual que todo lo demás." },
  { key: "everyday", label: "Tiendas de siempre",
    blurb: "Lo de todos los días, a precio puerta a puerta." },
  { key: "auto",     label: "Repuestos", blurb: "Autopartes vía Aria Auto." },
];

export const DEFAULT_TIER = "everyday";

/** A store's tier, with the default made explicit. */
export function tierOf(retailer) {
  if (!retailer) return DEFAULT_TIER;
  if (retailer.tier) return retailer.tier;
  // Aria Auto's source is its own section — it is not a storefront a
  // shopper browses for clothes.
  if (retailer.kind === "auto") return "auto";
  return DEFAULT_TIER;
}

/**
 * The directory, grouped for display: [{ key, label, blurb, stores }].
 *
 * Only non-empty tiers come back, in TIERS order, so a tier with no
 * stores in it never renders as an empty heading.
 */
export function retailersByTier() {
  const active = activeRetailers();
  return TIERS
    .map((t) => ({ ...t, stores: active.filter((r) => tierOf(r) === t.key) }))
    .filter((t) => t.stores.length);
}

/** Every row, in display order, minus the retired ones. */
export function activeRetailers() {
  return Object.values(RETAILERS).filter((r) => !r.retired);
}

/** Stores the live cross-store product search actually fans out to. */
export function searchableRetailers() {
  return activeRetailers().filter((r) => r.search && r.kind === "general").map((r) => r.key);
}

/** Every store a shopper can browse on Tiendas, Aria Auto's source included. */
export function storefrontRetailers() {
  return activeRetailers();
}

/**
 * Stores whose catalogue a shopper can actually walk through — live
 * scraper OR cached file. This is the list the storefront and the
 * department feeds read; searchableRetailers() is the narrower one, and
 * conflating them is what would send a search to a retailer with no
 * actor behind it.
 */
export function browsableRetailers() {
  return activeRetailers().filter((r) => r.search || r.browse).map((r) => r.key);
}

/** True when this store has a catalogue but no live scraper behind it. */
export function isBrowseOnlyRetailer(key) {
  const r = retailerFor(key);
  return Boolean(r && r.browse && !r.search);
}

/** One row, case-insensitively, or null. */
export function retailerFor(key) {
  return RETAILERS[String(key || "").toLowerCase()] || null;
}

export function retailerLabel(key) {
  return retailerFor(key)?.label || key || "Tienda";
}

export function retailerColor(key) {
  return retailerFor(key)?.color || "#0A1F44";
}

/** True when this store's whole catalogue is beauty/fragrance. */
export function isBeautyRetailer(key) {
  return retailerFor(key)?.catalog === "beauty";
}

/* The flat maps the older call sites still want, derived from the rows
   above so they can never drift from them. */
export const RETAILER_LABELS = Object.fromEntries(Object.values(RETAILERS).map((r) => [r.key, r.label]));
export const RETAILER_COLORS = Object.fromEntries(Object.values(RETAILERS).map((r) => [r.key, r.color]));
export const RETAILER_LOGOS = Object.fromEntries(
  Object.values(RETAILERS).filter((r) => r.logo).map((r) => [r.key, r.logo]),
);
