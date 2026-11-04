/* ============================================================
   THE HEADER BANNER REGISTRY (#443 c.6642024745, refinement
   c.6642039652, audit c.6642097765).

   Danny's rule: every destination a carousel can lead to (a store, a
   brand, a department) opens on a top banner whose backdrop is RELEVANT
   and REPRESENTS that store or brand -- if the brand's owner opened the
   page it should feel like theirs. In order of preference:
     tier 1  their real logo lockup over their own backdrop (storefront,
             store interior, campaign imagery);
     tier 2  their branding: their colour, their real logo and a model
             wearing THEIR product;
     tier 3  interim only: category-relevant photography, flagged
             NOT-YET-REPRESENTED.
   A bare gradient is never the final state.

   This file is DATA. scripts/build-banners.mjs reads it and writes one
   small file per page (assets/banners/<kind>/<key>.json) that
   assets/js/page-banner.js paints; the full rollout is more entries
   here, never hand edits to a page.

   AN ENTRY
     label     the name the banner keeps legible (the page's own heading
               or wordmark shows it; the banner never hides it)
     color     the backdrop's base colour (the store's registry colour,
               or the brand colour already in the repo's data)
     logo      a REAL logo file already in the repo, or null. Never drawn,
               never invented: null means none exists and the report
               says so.
     backdrop  a brand-own backdrop file (storefront / interior /
               campaign) already in the repo, or null
     source    where the photos come from -- only real product photos
               already served on the page's own cards:
                 {from:"store", key, rails?}  assets/tienda/<key>/index.json
                 {from:"brand", key}          assets/sections/marca/<key>.json
                 {from:"feed", file, subs?}   a section feed's cards
     fit       "cover" (apparel, on body) or "contain" (a product on white)
     scrim     "dark" (white type over it) or "light" (dark type)
     tiles     how many photos (3 on a phone, the 4th from 760px)
     tier1     the tier-1 assets still missing, for the data lane
   ============================================================ */

export const BANNER_REGISTRY = {
  /* DSW: no DSW logo file exists anywhere in the repo (STORES.dsw.logo
     is null; logos/, logos/brands/, assets/logos/ have none), so the
     page keeps its «DSW» wordmark box. Its photos are DSW's own
     product shots from its CDN, footwear rails only. */
  "store:dsw": {
    page: "/tienda.html?tienda=dsw",
    label: "DSW",
    color: "#000000",
    logo: null,
    backdrop: null,
    source: { from: "store", key: "dsw", rails: ["d-women", "d-men", "d-footwear", "d-kids"] },
    fit: "contain",
    scrim: "dark",
    tiles: 4,
    tier1: ["DSW logo file (wordmark, SVG or PNG)", "DSW storefront or store-interior photo, or a DSW campaign image"],
  },
  /* Ryderwear (Gym Rat -> Ryderwear): no Ryderwear logo file exists. Its
     own Shopify product photos, one per garment family. */
  "store:ryderwear": {
    page: "/tienda.html?tienda=ryderwear",
    label: "Ryderwear",
    color: "#000000",
    logo: null,
    backdrop: null,
    source: { from: "store", key: "ryderwear", rails: ["t-ropa", "ofertas"] },
    fit: "cover",
    scrim: "dark",
    tiles: 4,
    tier1: ["Ryderwear logo file (SVG or PNG)", "Ryderwear campaign image or storefront photo"],
  },
  /* LANEIGE: 27 products (Sephora, YesStyle, Costco). No LANEIGE logo
     file exists. #4AA8DE is the colour the app bundle's store registry
     already carries for Laneige. */
  "brand:laneige": {
    page: "/marca.html?marca=laneige",
    label: "LANEIGE",
    color: "#4AA8DE",
    logo: null,
    backdrop: null,
    source: { from: "brand", key: "laneige" },
    fit: "contain",
    scrim: "dark",
    tiles: 4,
    tier1: ["LANEIGE logo file (SVG or PNG)", "LANEIGE campaign image (e.g. Lip Sleeping Mask / Water Bank) or store photo"],
  },
  /* LENCERÍA (Ropa Interior Mujer): a department, so no owner logo; its
     backdrop is real on-model frames of lingerie it sells, read by
     scripts/lib/model-shot.mjs (Victoria's Secret _OM_, SKIMS shoot
     frames, Kindred Bravely lifestyle), one per store. */
  "dept:ropa_interior_mujer": {
    page: "/ropa-interior.html#mujer",
    label: "Ropa Interior Mujer",
    color: "#F5C4DC",
    logo: null,
    backdrop: null,
    source: { from: "feed", file: "ropa-interior-women-feed.json", subs: ["lingerie", "bra", "shapewear", "panty"] },
    fit: "cover",
    scrim: "light",
    tiles: 4,
    model: "required",
    tier1: [],
  },
};

/* Tier-1 assets missing for pages not in the sample, by name, for the
   data lane (Lucifer). Lucifer's audit names these first. */
export const KNOWN_DEFECTS = {
  "store:bestbuy": "registry heroPhoto /assets/stores/bestbuy-interior.jpg never existed (404); fixed to the store photo",
  "store:walmart": "backdrop is a generic warehouse aisle, not Walmart's own store (tier 3 at best)",
};
