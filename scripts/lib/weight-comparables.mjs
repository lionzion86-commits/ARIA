/* ============================================================
   A WEIGHT FROM SIMILAR PRODUCTS (#443, Danny's weight ruling
   2026-10-26 10:18 EDT).

   "For a product with no weight in the data, DO NOT invent a default.
   Look at the product and at SIMILAR products, take a weight in that
   vicinity, and then PAD IT A LITTLE HIGHER." The overage doctrine
   closes the loop: below the estimate at the Miami weigh-in, the
   difference is refunded as Aria credit, so a padded estimate can only
   be corrected in the shopper's favour.

   This is the machine for "similar products". The pool is every product
   in the catalogues whose weight has a basis -- a weight the store
   published, the store's own catalogue figure, or one of our per-class
   rules (beauty, candle, a weight stated in the title, the category
   table). A product the rules cannot place is matched to the pool by
   its title: the words it shares with each candidate, weighted by how
   rare they are, so "Resin Outdoor Bar Cart" finds outdoor carts and
   resin furniture, not every product with "Pine" in its colour.

   "Same class, same ballpark size": the title says the class, and the
   price says the size -- an 8x10 rug is not a 2x3 rug, and the price
   tells them apart where the words do not. A comparable must cost
   between half and twice what the product costs, and share at least two
   of its words. The estimate is the median of the closest matches,
   padded up, and it records which products it came from, so
   any estimate can be audited: which comparables, what values, what pad.
   ============================================================ */

/* Padded "a little higher": the cited-evidence buffer the rules already
   use (CONFIDENCE_BUFFER.cited in item-weight.js). */
export const COMPARABLE_PAD = 1.15;
/* A match must share at least this share of the product's own
   (rarity-weighted) title words to count. */
export const MIN_SCORE = 0.42;
export const MAX_COMPARABLES = 5;
export const MIN_COMPARABLES = 2;
/* The size proxy: a comparable costs between half and twice as much. */
export const PRICE_RATIO = 2;

const STOP = new Set(("the and with for from your you our this that are its was set pack pcs pc piece pieces new size sizes inch inches ft feet cm mm oz lb lbs kg one two three four five six "
  + "black white grey gray red blue green pink brown beige navy tan cream ivory gold silver yellow orange purple multi multicolor natural clear pine oak walnut "
  + "men mens women womens kids kid girls boys unisex adult youth toddler baby xs small medium large xl xxl "
  + "best seller sellers bestseller exclusive signature essential essentials classic created macy original premium deluxe edition collection limited "
  + "de la el los las y con para en del al un una").split(" "));
/* A match shares at least this many of the product's words: one shared
   word ("orchid", "palm") names a theme, not a kind of product. */
export const MIN_SHARED = 2;

/** The words that say what a product is. */
export function titleTokens(title) {
  const words = String(title || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").split(/\s+/);
  const out = new Set();
  for (let w of words) {
    if (w.length < 3 || STOP.has(w) || /^\d/.test(w)) continue;
    if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) w = w.slice(0, -2);
    else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    out.add(w);
  }
  return [...out];
}

/**
 * The comparables index over the pool: [{ retailer, title, kg }].
 */
export function buildIndex(pool) {
  const docs = [];
  const df = new Map();
  const post = new Map();
  const seen = new Set();
  for (const p of pool) {
    if (!(p.kg > 0)) continue;
    const key = p.retailer + "::" + String(p.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const toks = titleTokens(p.title);
    if (!toks.length) continue;
    const id = docs.length;
    docs.push({ retailer: p.retailer, title: p.title, kg: p.kg, price: Number(p.price) || 0, toks });
    for (const t of toks) {
      df.set(t, (df.get(t) || 0) + 1);
      let l = post.get(t);
      if (!l) post.set(t, (l = []));
      l.push(id);
    }
  }
  const N = docs.length;
  const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;
  return { docs, post, idf, N };
}

/**
 * The similar products for a title and the padded estimate, or null when
 * fewer than MIN_COMPARABLES clear MIN_SCORE (then nothing is invented:
 * the product waits for a human estimate).
 */
export function comparablesFor(index, title, { exclude = null, price = 0 } = {}) {
  const toks = titleTokens(title);
  if (!toks.length) return null;
  const w = new Map(toks.map((t) => [t, index.idf(t)]));
  const total = [...w.values()].reduce((a, b) => a + b, 0);
  /* Candidates share at least one of the title's rarer words; a word in
     a quarter of the pool says nothing about what a product is. */
  const scores = new Map(), shared = new Map();
  for (const t of toks) {
    const l = index.post.get(t);
    if (!l || l.length > index.N / 4) continue;
    const wt = w.get(t);
    for (const id of l) { scores.set(id, (scores.get(id) || 0) + wt); shared.set(id, (shared.get(id) || 0) + 1); }
  }
  const ranked = [];
  for (const [id, s] of scores) {
    const d = index.docs[id];
    if (shared.get(id) < Math.min(MIN_SHARED, toks.length)) continue;
    if (exclude && d.retailer + "::" + d.title.toLowerCase() === exclude) continue;
    if (price > 0 && !(d.price > 0 && d.price * PRICE_RATIO >= price && d.price <= price * PRICE_RATIO)) continue;
    /* Rarity-weighted overlap, both ways: what share of THIS title the
       candidate covers, and what share of the candidate this title
       covers, so a one-word candidate cannot match everything. */
    const dTotal = d.toks.reduce((a, t) => a + index.idf(t), 0);
    const score = Math.min(s / total, s / dTotal);
    if (score >= MIN_SCORE) ranked.push({ d, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.d.kg - b.d.kg);
  const top = ranked.slice(0, MAX_COMPARABLES);
  if (top.length < MIN_COMPARABLES) return null;
  const kgs = top.map((x) => x.d.kg).sort((a, b) => a - b);
  /* The middle of the vicinity; the pad is the "a little higher". */
  const q = kgs.length % 2 ? kgs[(kgs.length - 1) / 2] : (kgs[kgs.length / 2 - 1] + kgs[kgs.length / 2]) / 2;
  return {
    kg: Math.round(q * COMPARABLE_PAD * 100) / 100,
    baseKg: Math.round(q * 100) / 100,
    pad: COMPARABLE_PAD,
    comps: top.map((x) => [x.d.retailer, x.d.title.slice(0, 90), x.d.kg, Math.round(x.score * 100) / 100, x.d.price]),
  };
}

/* THE CLASS TIER. A short title ("Black Tower SL Outershirt", "Studded
   Leather Flats") shares too few words with anything for the word match,
   but it still names its class in its last word. When the word match
   finds nothing and that word is a soft-goods class (CLASS_WORDS), the
   products whose own titles end in the same word -- at least CLASS_MIN
   of them, within a wider price band -- are the comparables. */
export const CLASS_MIN = 5;
/* Only soft goods: clothing, jewelry, bags and shoes, where the class word
   names one kind of product and a wrong guess is a few hundred grams. A
   "pump", a "guard", a "card" or a "kit" can be anything from a shoe to
   an engine part; those wait for a human estimate instead. */
export const CLASS_WORDS = new Set(("pant short dress shirt top tee tank skirt jacket coat sweater hoodie sweatshirt cardigan blouse vest jean legging "
  + "jogger trouser overshirt outershirt turtleneck polo bodysuit jumpsuit romper blazer parka puffer anorak bra brief bralette thong panty boxer "
  + "sock swimsuit bikini trunk kimono robe pajama gown tunic camisole cami corset shacket overall "
  + "bracelet necklace earring ring pendant anklet choker charm brooch "
  + "bag tote backpack wallet clutch crossbody satchel pouch belt hat cap beanie scarf glove sunglass "
  + "sneaker boot sandal flat heel loafer mule slide slipper clog oxford derby espadrille trainer").split(" "));
export const CLASS_PRICE_RATIO = 4;
const tail = (toks) => (toks.length ? toks[toks.length - 1] : "");
export function buildClassIndex(index) {
  const byTail = new Map();
  index.docs.forEach((d, id) => {
    const t = tail(d.toks);
    if (!t) return;
    let l = byTail.get(t);
    if (!l) byTail.set(t, (l = []));
    l.push(id);
  });
  return byTail;
}
export function classComparablesFor(index, byTail, title, { exclude = null, price = 0 } = {}) {
  const t = tail(titleTokens(title));
  if (!CLASS_WORDS.has(t)) return null;
  const l = byTail.get(t);
  if (!l) return null;
  const docs = l.map((id) => index.docs[id]).filter((d) =>
    !(exclude && d.retailer + "::" + d.title.toLowerCase() === exclude)
    && (!(price > 0) || (d.price > 0 && d.price * CLASS_PRICE_RATIO >= price && d.price <= price * CLASS_PRICE_RATIO)));
  if (docs.length < CLASS_MIN) return null;
  const kgs = docs.map((d) => d.kg).sort((a, b) => a - b);
  const q = kgs.length % 2 ? kgs[(kgs.length - 1) / 2] : (kgs[kgs.length / 2 - 1] + kgs[kgs.length / 2]) / 2;
  const pick = docs.slice().sort((a, b) => Math.abs(a.kg - q) - Math.abs(b.kg - q)).slice(0, MAX_COMPARABLES);
  return {
    kg: Math.round(q * COMPARABLE_PAD * 100) / 100,
    baseKg: Math.round(q * 100) / 100,
    pad: COMPARABLE_PAD,
    method: "class:" + t + " (" + docs.length + ")",
    comps: pick.map((d) => [d.retailer, d.title.slice(0, 90), d.kg, 0, d.price]),
  };
}

/** The key a product's estimate is stored under (one definition, shared with the functions). */
export { comparableKey } from "./comparable-key.js";
