/* ============================================================
   ARIA AUTO'S PARTS SOURCES — a registry, not a hardcoded store

   WHY MORE THAN ONE. One source means one fitment database. When
   AutoZone has no fitment for a vehicle, the section is a dead end and a
   shopper leaves — and that is not a rare case: "pastillas de freno"
   resolves for an Audi A4 and fails for a 2023 Yaris, because that model
   year was never sold in the US. A second catalogue is the difference
   between "we do not have it" and "we do not have it HERE".

   It is also returns protection, which is the part that costs money. A
   wrong-fit part is a return Aria eats. Two catalogues mean two chances
   to confirm a fit rather than guess at one, and when both confirm it,
   the shopper picks on door-to-door price.

   THESE ARE NOT TIENDAS. Aria Auto's sources live here, not in
   scripts/lib/retailers.js, and they do not appear in the Tiendas grid —
   that grid stays at its symmetric eight. AutoZone is the one row that
   exists in both, because it was there first and a historical order can
   still name it.

   ------------------------------------------------------------
   ADDING A PARTS SOURCE
     1. Add a row below.
     2. Add a RETAILER_CONFIG entry in
        netlify/functions/apify-scrape-start.js (actorId + inputShape).
     3. Flip `search: true`.
   Nothing in the Aria Auto UI changes: it renders whatever rows this
   file returns, one block per source, each with its own fitment verdict
   and its own empty state.
   ------------------------------------------------------------
   ============================================================ */

export const AUTO_SOURCES = {
  autozone: {
    key: "autozone",
    label: "AutoZone",
    color: "#1C8A4B",
    logo: "logos/autozone.png",
    search: true,
    /* Whether this source publishes a per-vehicle compatibility list at
       all. `partial` is the honest answer for AutoZone today: the actor
       runs in overview mode, which returns no description, no features
       and a two-key specs object — an audit of all 9,285 cached items
       found exactly zero compatibility lists, and neither this pipeline
       nor apify-scrape-status.js drops them, so the actor simply does
       not send them in that mode. The lists exist on the product detail
       page; capturing them is a scrape-mode change (AUTO_SCRAPE_MODE),
       not a code change.

       UNTIL A REFRESH BRINGS THEM IN, results still show — with the part
       number prominent and an honest line saying we could not confirm
       the fit ourselves. Hiding them instead was the first cut of this
       fix, and it turned a section whose results were actually correct
       into a dead one. See renderAutoPartBlock's three outcomes. */
    fitmentData: "partial",
    note: "Catálogo amplio; el calce viene en la ficha del producto, no en el listado.",
  },
  /* ROCKAUTO (2026-09-20, per the brief). Deep catalogue, competitive
     prices, a real YMM selector, and a site that does not fight
     scrapers — which is why it is the second source rather than one of
     the chains.

     It ships `search: false` for the same reason Sephora and Victoria's
     Secret did: apify.com is unreachable from this build environment
     (the egress proxy answers 403 to every host outside its allowlist),
     so there is no way to verify an actor ID from here. Pointing the
     scraper at a guessed actor returns an empty run, which reads to a
     shopper as "RockAuto has no parts for your car" — a lie, and exactly
     the kind this section is being fixed to stop telling. Step 2 and
     step 3 of ADDING A PARTS SOURCE above are the whole remaining task. */
  rockauto: {
    key: "rockauto",
    label: "RockAuto",
    color: "#303090",
    logo: "logos/rockauto.png",
    search: false,
    fitmentData: "yes",
    pendingNote: "Conectando el catálogo",
    note: "Selector año/marca/modelo propio y listas de compatibilidad por pieza.",
  },
  /* ADVANCE AUTO PARTS — conditional per the brief: probe it, onboard it
     only if the scrape comes back clean, and skip it silently otherwise
     rather than blocking the fix.

     NOT PROBED, and that is a fact rather than a judgement: this
     environment cannot reach advanceautoparts.com any more than it can
     reach apify.com. So the row exists with the probe recorded as not
     run, and it is excluded from the UI exactly as if it had failed —
     `search: false` keeps it out of the fan-out, and an unprobed source
     is not presented to a shopper. Run the probe, and if it returns real
     items, flip the flag. NAPA is the same shape when its turn comes. */
  advanceauto: {
    key: "advanceauto",
    label: "Advance Auto Parts",
    color: "#D5001C",
    logo: null,
    search: false,
    fitmentData: "unknown",
    probe: "not-run",
    pendingNote: "Por evaluar",
    note: "Onboarding condicional: solo si el scrape responde limpio.",
  },
  /* O'REILLY IS OUT, and stays out. Danny tried it: the site declines
     scraper requests. Kept as a row so nobody spends another afternoon
     rediscovering that. Never flip `search` on this one without a new
     reason that is not "let us try again". */
  oreilly: {
    key: "oreilly",
    label: "O'Reilly Auto Parts",
    color: "#006341",
    logo: null,
    search: false,
    excluded: true,
    excludedReason: "Rechaza peticiones de scraping (probado 2026-09).",
  },
};

/* ============================================================
   THE PART NUMBER IS THE BUYER'S OWN CHECK

   Danny's standing point, and it is how he verified the Sonata pads
   himself: in auto parts, reading the manufacturer's part or series
   number and cross-checking it is normal buyer diligence, not a burden
   we invented. A "D2076" pasted into a search engine answers "does this
   fit my car" in seconds.

   So every auto listing shows it. When we can confirm fitment from the
   source's own data we say so outright with the green badge; when we
   genuinely cannot, the number is what lets the shopper close the gap
   instead of guessing. It is the one piece of information that makes an
   unconfirmed listing useful rather than a shrug.

   Sources name it differently, so this reads the shapes they use and
   returns the most specific one. `oem` is kept separate because an OEM
   number and an aftermarket number are different lookups.
   ============================================================ */
export function partNumberOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const first = (...keys) => {
    for (const k of keys) {
      const v = raw[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s && s.toLowerCase() !== "null") return s;
    }
    return null;
  };
  const partNumber = first("part_number", "partNumber", "sku", "mpn", "manufacturerPartNumber", "item_id");
  const oem = first("oem_part_number", "oemPartNumber", "oem");
  const lineCode = first("line_code", "lineCode", "brand", "sub_brand");
  if (!partNumber && !oem) return null;
  return { partNumber, oem, lineCode };
}

/** "Duralast D2076" — what the shopper pastes into a search engine. */
export function partNumberLabel(raw) {
  const p = partNumberOf(raw);
  if (!p) return null;
  const core = p.partNumber || p.oem;
  return p.lineCode && p.partNumber ? `${p.lineCode} ${core}` : core;
}

/** Sources Aria Auto actually queries. */
export function searchableAutoSources() {
  return Object.values(AUTO_SOURCES).filter((s) => s.search && !s.excluded);
}

/**
 * Every source a shopper is shown, in order — the ones we query, plus
 * the ones being connected, which get an honest "conectando" block
 * rather than being hidden. A source that was tried and refused
 * (O'Reilly) is not shown at all: it is an operational fact, not news.
 */
export function visibleAutoSources() {
  return Object.values(AUTO_SOURCES).filter((s) => !s.excluded && s.probe !== "not-run");
}

export function autoSourceFor(key) {
  return AUTO_SOURCES[String(key || "").toLowerCase()] || null;
}

export function autoSourceLabel(key) {
  return autoSourceFor(key)?.label || key || "Tienda";
}
