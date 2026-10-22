/* FRAGRANCE -- what is a perfume, ONE DEFINITION (#443, 2026-10-22).
   The Perfumes carousel builder, the cart, checkout and orders-create
   all read THIS file; see scripts/lib/fragrance.js for the why and the
   rules. A plain script on purpose (no import/export), like
   /off-sale.js: pages load it with <script src>, node imports it for
   its side effect through scripts/lib/fragrance.js. */
(function (root) {
  'use strict';

  /* The courier's clause, as Aria's per-ORDER rule: an order carries at
     most four fragrance units (quantity counts). */
  var MAX_PERFUMES_PER_ORDER = 4;

  /* A store's own product type, normalized the way the page normalizes
     it (upper case, accents folded, non-alphanumerics to _). The beauty
     aisle's types (SUBCATEGORY_SPEC "fragrance") plus their plurals. */
  var FRAGRANCE_TYPES = {
    FRAGANCIA: 1, FRAGANCIAS: 1, FRAGRANCE: 1, FRAGRANCES: 1, PERFUME: 1, PERFUMES: 1,
    EAU_DE_PARFUM: 1, EAU_DE_TOILETTE: 1, COLOGNE: 1, COLOGNES: 1, COLONIA: 1, COLONIAS: 1,
    BODY_MIST: 1, BRUMA_CORPORAL: 1
  };
  function normType(raw) {
    return String(raw == null ? '' : raw).trim().toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  /* The title names a fragrance outright. */
  var STRONG_RX = /\b(eau de parfum|eau de toilette|eau de cologne|parfum|perfumes?|colognes?|colonia|edp|edt|edc|body mist|body splash|fragrance mist|perfume mist|bruma corporal)\b/i;
  /* "Fragrance" alone is weak: "Long-Lasting Fragrance Body Wash". */
  var WEAK_RX = /\b(fragrances?|fragancias?)\b/i;
  /* Never a fragrance, whatever else the title says: the word is there
     because the thing is FREE of it, holds it, or smells of it. */
  var NEVER_RX = /\b(fragrance[- ]?free|unscented|sin fragancia|sin perfume|trays?|bandejas?|organi[sz]ers?|dish|candles?|velas?|diffusers?|difusor(es)?|wipes|toallitas|dolls?|mu[nñ]ec[ao]s?|barbie|atomi[sz]ers?|empty bottles?|air fresheners?|ambientador|car fresheners?|wax melts?|reed)\b/i;
  /* Not a fragrance unless the title also names one outright: a body
     wash or a lotion "with fragrance" is not a perfume, but a perfume
     gift set that includes a lotion is. */
  var UNLESS_STRONG_RX = /\b(body wash|shower gel|gel de ducha|face wash|cleanser|shampoo|champ[uú]|conditioner|acondicionador|deodorant|desodorante|antiperspirant|lotion|loci[oó]n|cream|crema|butter|detergent|laundry|softener|soap|jab[oó]n|serum|toner|t[oó]nico|hair ?oil|hair mask|masks?|mascarillas?|styling|mousse|pomade|gel|primer|foundation|lipsticks?|lip|mascara|brush|comb|dryer|straightener|curl\w*|treatment|tratamiento|balm|b[aá]lsamo|powder|polvo|spf|sunscreen|protector solar|moisturi[sz]er|hidratante|blush|bronzer|concealer|corrector|eyeliner|eyeshadow|palette|nail|esmalte)\b/i;

  function titleOf(it) {
    return String((it && (it.title || it.name || it.productTitle || it.productName)) || '');
  }

  /* THE CLASSIFIER. A store's declaration first (restricted flag, then
     its product type), then the title. */
  function isFragranceItem(it) {
    if (!it) return false;
    var t = typeof it === 'string' ? it : titleOf(it);
    if (NEVER_RX.test(t)) return false;
    if (typeof it === 'object') {
      if (it.restricted === 'fragancia-max-4' || it.restrictedFragrance === true) return true;
      /* A store's type is trusted unless the title names another kind of
         product and no perfume: Sephora types a dry-shampoo set and hair
         oils "Fragancia". */
      var ty = normType(it.type != null ? it.type : (it.typeName != null ? it.typeName : it.productType));
      if (ty && FRAGRANCE_TYPES[ty] === 1) return STRONG_RX.test(t) || !UNLESS_STRONG_RX.test(t);
    }
    if (STRONG_RX.test(t)) return true;
    return WEAK_RX.test(t) && !UNLESS_STRONG_RX.test(t);
  }

  /* A BOTTLE of perfume, for the Perfumes carousel: a fragrance, but not
     a body or hair mist, a sampler or a voucher. The cap still counts
     every fragrance (isFragranceItem); this only narrows the shelf. */
  var NOT_A_BOTTLE_RX = /\b(mists?|splash|brumas?|hair perfume|hair fragrance|hair (?:&|and) body|sampler|voucher|discovery set|scent sampler)\b/i;
  function isPerfumeBottle(it) {
    return isFragranceItem(it) && !NOT_A_BOTTLE_RX.test(typeof it === 'string' ? it : titleOf(it));
  }

  function lineUnits(it) {
    return Math.max(1, Math.round(Number(it && it.qty) || 1));
  }
  function isCartLine(it) {
    return !!it && typeof it === 'object' && it.lineType !== 'bundle-discount';
  }
  /* Fragrance UNITS in a cart: four bottles of one perfume are four. */
  function perfumeUnits(lines) {
    var n = 0;
    var list = Array.isArray(lines) ? lines : [];
    for (var i = 0; i < list.length; i++) if (isCartLine(list[i]) && isFragranceItem(list[i])) n += lineUnits(list[i]);
    return n;
  }
  function capState(lines) {
    var count = perfumeUnits(lines);
    return {
      count: count,
      limit: MAX_PERFUMES_PER_ORDER,
      overLimit: count > MAX_PERFUMES_PER_ORDER,
      remaining: Math.max(0, MAX_PERFUMES_PER_ORDER - count),
      extra: Math.max(0, count - MAX_PERFUMES_PER_ORDER)
    };
  }

  /* THE SPLIT. Everything that is not a perfume stays in this order;
     perfumes stay, in cart order, until four units; the rest moves to
     the next order. A line straddling the limit is split by quantity.
     Pure: new arrays, new line objects for any split line. */
  function splitForCap(lines, limit) {
    var max = Number.isFinite(limit) ? limit : MAX_PERFUMES_PER_ORDER;
    var keep = [], next = [], used = 0;
    var list = Array.isArray(lines) ? lines : [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!isCartLine(it) || !isFragranceItem(it)) { keep.push(it); continue; }
      var q = lineUnits(it);
      var room = Math.max(0, max - used);
      if (q <= room) { keep.push(it); used += q; continue; }
      if (room > 0) {
        keep.push(Object.assign({}, it, { qty: room }));
        used += room;
      }
      next.push(Object.assign({}, it, { qty: q - room }));
    }
    var moved = 0;
    for (var j = 0; j < next.length; j++) moved += lineUnits(next[j]);
    return { keep: keep, next: next, moved: moved };
  }

  /* The words a shopper sees. Plain Spanish, no store named. */
  var CAP_GUIDANCE = 'Máximo 4 perfumes por pedido — el resto puede ir en un segundo pedido.';
  function capOrderError(count) {
    return 'Tu pedido tiene ' + count + ' perfumes y el máximo por pedido es ' + MAX_PERFUMES_PER_ORDER
      + '. Deja ' + MAX_PERFUMES_PER_ORDER + ' en este pedido y pasa el resto a un segundo pedido. No se cobró nada.';
  }

  root.AriaFragrance = Object.freeze({
    MAX_PERFUMES_PER_ORDER: MAX_PERFUMES_PER_ORDER,
    NEXT_ORDER_KEY: 'aria_cart_next_v1',
    isFragranceItem: isFragranceItem,
    isPerfumeBottle: isPerfumeBottle,
    perfumeUnits: perfumeUnits,
    capState: capState,
    splitForCap: splitForCap,
    CAP_GUIDANCE: CAP_GUIDANCE,
    capOrderError: capOrderError
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
