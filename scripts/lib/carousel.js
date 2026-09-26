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
   - SALE MERCHANDISING (Danny, 2026-09-24): the rail opens on the
     biggest MEANINGFUL sales — the first thing a shopper sees is a
     discount that draws her in, never a full-price item and never a
     meaningless markdown. After the lead run the rail goes non-sale,
     with the remaining sales spread through (never clumped).
   ============================================================ */

export const CAROUSEL_MAX = 16;
export const CAROUSEL_MIN_ITEMS = 4;
/* Same discount floor Ofertas uses: a markdown under 5% is noise. */
export const CAROUSEL_MIN_DISCOUNT_PCT = 5;
/* The rail opens on this many lead sales — Danny: "two, three". */
export const CAROUSEL_SALE_LEAD_MAX = 3;
/* USD. A $2 trinket at 50% off draws nobody in; a $40 bra at 30%
   off does. Below this a sale can still appear on the rail — it
   just never leads it. */
export const CAROUSEL_SALE_LEAD_MIN_PRICE = 10;
/* After the lead run, one sale card every Nth non-sale card. */
export const CAROUSEL_SALE_SPREAD_EVERY = 4;
/* Trivial filler never leads the rail, however deep its discount.
   Socks, hair ties, keychains: not what anyone came to window-shop
   for. Conservative on purpose — this only keeps items out of the
   lead slots, never off the rail. */
const CAROUSEL_TRIVIAL_LEAD_PATTERNS = [
  /\bsocks?\b/i,
  /\bhair ties?\b/i,
  /\bscrunchies?\b/i,
  /\bbobby pins?\b/i,
  /\bkeychains?\b/i,
  /\bkey rings?\b/i,
  /\bstickers?\b/i,
  /\bshoelaces?\b/i,
  /\blint rollers?\b/i,
];

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

/* Discount depth in percent, 0 when there is no real markdown. Reads
   the same price/original fields the site's sale detection does, so a
   rail and Ofertas always agree on what "on sale" means. */
export function carouselDiscountPct(it) {
  const price = Number(it?.price ?? it?.effectivePrice ?? it?.currentPrice ?? it?.salePrice);
  const original = Number(it?.regularPrice ?? it?.wasPrice ?? it?.was_price ?? it?.originalPrice);
  if (!Number.isFinite(price) || !Number.isFinite(original) || price <= 0 || original <= price) return 0;
  return Math.round((1 - price / original) * 100);
}

/* A sale the site itself would recognize: a sale flag plus a real
   markdown at or above the discount floor. */
export function carouselIsSale(it) {
  const flag =
    it?.onSale === true ||
    it?.isOnSale === true ||
    (typeof it?.savingsAmount === "number" && it.savingsAmount > 0) ||
    (typeof it?.savingsPercent === "number" && it.savingsPercent > 0) ||
    (typeof it?.percentageOff === "number" && it.percentageOff > 0) ||
    (typeof it?.percentOff === "number" && it.percentOff > 0);
  return flag && carouselDiscountPct(it) >= CAROUSEL_MIN_DISCOUNT_PCT;
}

/* Lead-slot eligibility: the items allowed to OPEN the rail. Danny's
   rule — the first cards are the biggest sales, UNLESS the sale is on
   something meaningless. A lead card needs a photo (the rail is for
   looking), a meaningful ticket (no $2 trinkets), and a non-trivial
   product (no socks leading the window, however deep the discount). */
export function carouselSaleLeadEligible(it) {
  if (!carouselHasPhoto(it)) return false;
  if (!carouselIsSale(it)) return false;
  const price = Number(it?.price ?? it?.effectivePrice ?? it?.currentPrice ?? it?.salePrice);
  if (!Number.isFinite(price) || price < CAROUSEL_SALE_LEAD_MIN_PRICE) return false;
  const hay = (it?.type || "") + " " + (it?.title || it?.name || "");
  for (const re of CAROUSEL_TRIVIAL_LEAD_PATTERNS) {
    if (re.test(hay)) return false;
  }
  return true;
}

/* The rail's oldest rule, kept per segment: photo items ahead of
   photo-less ones, order otherwise stable. */
function carouselPhotoFirst(list) {
  const withPhoto = [];
  const withoutPhoto = [];
  for (const it of list) (carouselHasPhoto(it) ? withPhoto : withoutPhoto).push(it);
  return withPhoto.concat(withoutPhoto);
}

/* Spread sales through the non-sale run instead of clumping them:
   every CAROUSEL_SALE_SPREAD_EVERY non-sale cards, one sale card.
   Deterministic — the rail must match the grid below it. */
function carouselSpreadSales(plain, sales) {
  const out = [];
  let si = 0;
  for (let i = 0; i < plain.length; i++) {
    out.push(plain[i]);
    if ((i + 1) % CAROUSEL_SALE_SPREAD_EVERY === 0 && si < sales.length) out.push(sales[si++]);
  }
  while (si < sales.length) out.push(sales[si++]);
  return out;
}

/* Pick up to `max` items for one rail: deduped, then Danny's sale
   merchandising — the biggest meaningful sales open the rail (at most
   CAROUSEL_SALE_LEAD_MAX), then non-sale with the remaining sales
   spread through. Photos first within each segment, capped.
   Pure — takes plain item objects, returns a subset. */
export function carouselPickItems(items, max) {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : CAROUSEL_MAX;
  const seen = new Set();
  const deduped = [];
  for (const it of items || []) {
    if (!it) continue;
    const key = carouselItemKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }
  const leads = [];
  const otherSales = [];
  const plain = [];
  for (const it of deduped) {
    if (carouselSaleLeadEligible(it)) leads.push(it);
    else if (carouselIsSale(it)) otherSales.push(it);
    else plain.push(it);
  }
  // Biggest discount first; ties keep feed order (stable sort).
  leads.sort((a, b) => carouselDiscountPct(b) - carouselDiscountPct(a));
  // Sprinkles prefer better sales too: spare leads first, then the rest
  // deepest-first. Ties keep feed order (stable sort).
  otherSales.sort((a, b) => carouselDiscountPct(b) - carouselDiscountPct(a));
  const head = carouselPhotoFirst(leads).slice(0, CAROUSEL_SALE_LEAD_MAX);
  const spareLeads = carouselPhotoFirst(leads).slice(CAROUSEL_SALE_LEAD_MAX);
  const tail = carouselSpreadSales(
    carouselPhotoFirst(plain),
    carouselPhotoFirst(spareLeads.concat(otherSales)),
  );
  return head.concat(tail).slice(0, limit);
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
