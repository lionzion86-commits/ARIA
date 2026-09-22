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
