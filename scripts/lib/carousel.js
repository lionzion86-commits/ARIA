/* ============================================================
   STORE CAROUSELS — WINDOW-SHOPPING RAILS.

   Danny's redesign (2026-09-24): every store landing and every
   category drill-down leads with a horizontal, swipeable product rail —
   image-forward cards you browse like window shopping — and the wordy
   category tiles move BELOW it.

   This module holds the pure selection logic: WHICH items land on a
   rail. The HTML builders live in index.html next to the other card
   builders (they need page helpers like cardPhotoHTML); the page
   mirrors this module line for line (a plain <script> cannot import)
   and the test suite pins both copies.

   RULES.
   - CAROUSEL_MAX: a rail holds at most 16 cards — Danny's brief caps
     rails at 12–20, and 16 keeps the swipe short on a phone.
   - CAROUSEL_MIN_ITEMS: fewer than 4 items is not a rail, it is a
     broken-looking row — those surfaces keep their old layout.
   - Photos first: a rail is for looking, so items carrying a photo
     sort ahead of items without one. Order is otherwise stable (the
     feed's own order), never shuffled — the rail must match the grid
     below it, not surprise it.
   - Deduped by photo (falling back to title): departments overlap —
     Ofertas is whatever is marked down across the other shelves — so
     a naive mix prints the same product twice.
   ============================================================ */

export const CAROUSEL_MAX = 16;
export const CAROUSEL_MIN_ITEMS = 4;

export function carouselItemKey(it) {
  const img = it && (it.image || it.imageUrl || it.thumbnail);
  if (typeof img === "string" && img) return "img:" + img;
  const title = it && typeof it.title === "string" ? it.title : "";
  return "title:" + title;
}

export function carouselHasPhoto(it) {
  const img = it && (it.image || it.imageUrl || it.thumbnail);
  return typeof img === "string" && img.length > 0;
}

/* Pick up to `max` items for one rail: photos first (stable), deduped,
   capped. Pure — takes plain item objects, returns a subset. */
export function carouselPickItems(items, max) {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : CAROUSEL_MAX;
  const seen = new Set();
  const withPhoto = [];
  const withoutPhoto = [];
  for (const it of items || []) {
    if (!it) continue;
    const key = carouselItemKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    (carouselHasPhoto(it) ? withPhoto : withoutPhoto).push(it);
  }
  return withPhoto.concat(withoutPhoto).slice(0, limit);
}

/* The store landing's rail: a cross-department mix, round-robin so one
   big department (432 panties) does not eat the whole window. Takes
   the same [key, items] entries openStore builds its tiles from. */
export function carouselMixItems(deptEntries, max) {
  const lists = (deptEntries || [])
    .map(([, items]) => (items || []).filter(Boolean))
    .filter((l) => l.length > 0);
  const mixed = [];
  let i = 0;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const list of lists) {
      if (i < list.length) {
        mixed.push(list[i]);
        progressed = true;
      }
    }
    i += 1;
  }
  return carouselPickItems(mixed, max);
}
