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
     itself long before its catalogue is connected. */
  sephora: {
    key: "sephora",
    label: "Sephora",
    color: "#000000",
    logo: "logos/sephora.png",
    tagline: "Maquillaje, skincare y perfumes",
    kind: "general",
    catalog: "beauty",
    search: false,
    pendingNote: "Conectando el catálogo",
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
    tagline: "Diseñador y lujo — Gucci, Prada, Balenciaga",
    kind: "general",
    tier: "luxury",
    search: false,
    browse: true,
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
