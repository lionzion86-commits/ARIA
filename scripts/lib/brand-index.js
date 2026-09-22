/* ============================================================
   THE A-Z BRAND INDEX — one store's brand list, ordered, grouped and
   searchable.

   WHY THIS EXISTS (2026-09-22). SSENSE's export carries 192 brands, and
   every one of them was a full-size category card on the home page: a
   204-card wall between the shopper and anything else on the site.
   Danny's word for it was "a wall", and pulling it down is only half the
   fix — the brands are real stock and still have to be reachable. They
   belong inside the store that stocks them, as a list you can read,
   search and jump around in, which is what this builds.

   IT IS NOT SSENSE-SPECIFIC ON PURPOSE. It takes whatever
   `retailers.<key>.brands` holds, so Foot Locker's single Nike row and
   SSENSE's 192 come out of the same code. A store with no brands gets
   an empty list and the caller draws nothing.

   THE LABEL COMES FROM THE CATALOGUE, NOT THE KEY. The key is a slug —
   `driesvannoten`, `mm6maisonmargiela`, `paulsmith` — and title-casing a
   slug gives "Driesvannoten". Every brand bucket carries its real
   `label`, so that is what is read, sorted and shown.
   ============================================================ */

/* Accent-folded and upper-cased: the one form both the sort and the
   search compare on. "Séfr" has to answer to "sefr" typed on a phone
   keyboard, and "sacai" has to sit under S next to "Saint Laurent"
   rather than after every capitalised name. */
export function foldBrand(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

/* The letter a brand files under. Anything that does not start with a
   latin letter — "424", "1017 ALYX 9SM" — files under "#", the way a
   printed directory does it, rather than inventing a "4" section with
   one entry in it. */
export function brandLetter(label) {
  const first = foldBrand(label).charAt(0);
  return first >= "A" && first <= "Z" ? first : "#";
}

/* Does this brand answer to what the shopper has typed? Substring, on
   the folded form, so "margiela" finds "MM6 Maison Margiela" — a list
   of 192 is searched by the part of the name you remember, which is
   very often not the first word. An empty query matches everything. */
export function brandMatches(label, query) {
  const q = foldBrand(query);
  if (!q) return true;
  return foldBrand(label).includes(q);
}

/* One flat, ordered row per brand. `#` first, then A-Z, and inside a
   letter by the folded name so case never decides the order.

   A brand with no items is dropped rather than listed as "0": the panel
   is navigation, and a row that leads to an empty page is worse than no
   row. */
export function brandRows(brands) {
  const rows = [];
  for (const [key, bucket] of Object.entries(brands || {})) {
    const count = Array.isArray(bucket?.items) ? bucket.items.length : 0;
    if (!count) continue;
    const label = String(bucket?.label || key).trim() || key;
    rows.push({ key, label, count, letter: brandLetter(label) });
  }
  return rows.sort((a, b) => {
    if (a.letter !== b.letter) return a.letter === "#" ? -1 : b.letter === "#" ? 1 : a.letter < b.letter ? -1 : 1;
    return foldBrand(a.label).localeCompare(foldBrand(b.label), "es");
  });
}

/* The same rows, cut into the sections the letter jump lands on. Only
   letters that actually have brands get a section — an empty "Q" in the
   list is a dead tap. */
export function brandGroups(rows) {
  const out = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.letter === row.letter) last.brands.push(row);
    else out.push({ letter: row.letter, brands: [row] });
  }
  return out;
}

/* ============================================================
   THE SLUG A BRAND ROUTES ON.

   Derived, not invented: run it over SSENSE's brand labels and it
   reproduces the keys that export already ships — "Paul Smith" ->
   paulsmith, "Dries Van Noten" -> driesvannoten, "MM6 Maison Margiela"
   -> mm6maisonmargiela, "We11done" -> we11done. That is what lets a
   store WITHOUT a brands bucket share one route with a store that has
   one: both arrive at openCatalog('brand', key) with the same key for
   the same brand.
   ============================================================ */
export function brandKeyOf(label) {
  /* ACCENTS ARE DROPPED HERE, NOT FOLDED -- the opposite of foldBrand,
     and deliberately so. SSENSE's export slugs "Courreges" with the
     accent DELETED (`courrges`, not `courreges`), and those keys are
     already live URLs. Folding instead would have produced a second key
     for eight brands and quietly broken every link anyone had saved.

     The two rules answer two questions and must not be merged: a key is
     an address and has to match what shipped; a folded name is what a
     shopper reads and types, where "sefr" must still find "Sefr". */
  return String(label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/* ============================================================
   BRANDS OFF THE SHELF, when the catalogue does not hand us a list.

   WHY (2026-09-22). "Wire it into every storefront that carries
   multiple brands" cannot be answered from `retailers.<key>.brands`,
   because almost nobody has one that is usable:

     * SSENSE      192 real buckets, items and all.
     * Foot Locker  1 bucket (Nike).
     * Macy's       none at all -- but 754 items each naming its brand,
                    107 distinct.
     * The beauty three: a `brands` key that is a bare ARRAY OF NAMES,
                    not buckets. No items behind it. Unusable as a
                    catalogue, and it decodes as brands "0", "1", "2".

   So the brand list is counted off the store's own stock, which is the
   only source that cannot disagree with what the shopper will find. The
   caller passes items it has already deduped -- Old Navy's synthetic
   `clothing` bucket is a merge of its gendered ones and would otherwise
   count every item twice.

   The FIRST spelling of a name wins its key, so two casings of one
   brand collapse into one row instead of splitting the shelf.
   ============================================================ */
export function brandBucketsFromItems(items) {
  const out = {};
  for (const raw of items || []) {
    const label = String(raw?.brand ?? "").trim();
    if (!label) continue;
    const key = brandKeyOf(label);
    if (!key) continue;
    if (!out[key]) out[key] = { label, items: [] };
    out[key].items.push(raw);
  }
  return out;
}
