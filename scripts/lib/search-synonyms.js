/* ============================================================
   SEARCH SYNONYMS — ONE CONCEPT, MANY WORDS.

   Danny's requirement (2026-09-24): searching "sneakers", "shoes",
   "zapatos" or "zapatillas" must ALL return the same shoe results.
   The catalogue's titles are English; the shopper types English or
   Spanish, formal or slang. Token matching is literal, so without this
   "sneakers" never finds "Running Shoes", and "zapatos" (translated to
   "shoes" by the query layer) never finds "Sneakers".

   HOW IT IS USED. Three consumers, all in index.html's catalogue
   search plus the in-category bar:
     - catalogTokenHits(): a query token that misses literally gets a
       second chance against every word in its group, in BOTH
       directions — "zapatos" finds "Sneakers" and "sneakers" finds
       "Dress Shoes".
     - rankCatalogMatches(): query tokens are canonicalised to the
       group concept first, so the four queries do not merely overlap —
       they run the identical token list and return the identical items
       in the identical order.
     - the in-category bar: each token must hit, but may hit as any
       word in its group.
   Everything else — weighting, the brand bonus, thin detection —
   keeps working on one token per word the shopper typed.

   ADDING A GROUP. Append { concept, words }. The concept is the
   canonical token: prefer the English word the catalogue actually
   uses. Words are every spelling a shopper might type, accent-free
   and lowercase — searchTokens strips accents before lookup, so
   "sostén" is stored as "sosten". Keep groups to unambiguous concept
   words: a word that means two different things ("coach" the brand
   vs the word) does not belong in a group.

   MIRROR. index.html carries this table line for line (a plain
   <script> cannot import); the test suite asserts both copies answer
   identically for every word.
   ============================================================ */

export const SEARCH_SYNONYM_GROUPS = [
  {
    concept: "shoes",
    words: [
      "shoe", "shoes",
      "sneaker", "sneakers",
      "trainer", "trainers",
      "footwear",
      // Peruvian Spanish: zapatillas = trainers, zapatos = shoes,
      // tenis = the everyday word for trainers, calzado = footwear
      "zapatilla", "zapatillas",
      "zapato", "zapatos",
      "tenis",
      "calzado", "calzados",
    ],
  },
  {
    concept: "bra",
    words: ["bra", "bras", "brassiere", "brassieres", "sosten", "sostenes"],
  },
  {
    concept: "perfume",
    words: [
      "perfume", "perfumes",
      "fragrance", "fragrances",
      "fragancia", "fragancias",
      "colonia", "colonias", "cologne", "colognes",
      "parfum",
    ],
  },
  {
    concept: "handbag",
    words: [
      "handbag", "handbags",
      "purse", "purses",
      "cartera", "carteras",
      "bolso", "bolsos",
    ],
  },
  {
    concept: "underwear",
    words: [
      "underwear",
      "panty", "panties", "pantys",
      "brief", "briefs",
      "thong", "thongs",
      "calzon", "calzones",
      "tanga", "tangas",
    ],
  },
  {
    concept: "dress",
    words: ["dress", "dresses", "vestido", "vestidos", "gown", "gowns"],
  },
  {
    concept: "watch",
    words: ["watch", "watches", "reloj", "relojes"],
  },
  /* REPORTED LIVE 2026-09-26: "aletas" is flippers — one concept so
     "aletas", "fins" and "flippers" all return the same fin sets. */
  {
    concept: "fins",
    words: ["fin", "fins", "flipper", "flippers", "aleta", "aletas"],
  },
  /* PERU 2026-09-26: "polo" is a plain T-shirt in Peru, not a collared
     polo shirt. One concept so "polo" finds tees (and collared polos
     still match too, as they did before the correction). "shirt" is in
     the group because searchTokens splits "T-Shirt" into "t"+"shirt" —
     without it the hyphenated concept word can never hit a title. */
  {
    concept: "t-shirt",
    words: [
      "t-shirt", "t-shirts", "tshirt", "tshirts",
      "tee", "tees",
      "shirt", "shirts",
      "polo", "polos",
    ],
  },
  /* PERU 2026-09-26: "buzo" is any sweatshirt-type garment in Peru — with
     or without a hood. One concept so "buzo" finds sweatshirts as well
     as hoodies. */
  {
    concept: "sweatshirt",
    words: [
      "sweatshirt", "sweatshirts",
      "hoodie", "hoodies",
      "buzo", "buzos",
    ],
  },
];

const WORD_TO_GROUP = new Map();
for (const group of SEARCH_SYNONYM_GROUPS) {
  for (const word of group.words) WORD_TO_GROUP.set(word, group);
}

/** The synonym group a word belongs to, or null. Lookup is on the
    already-normalised token (lowercase, accent-free). */
export function synonymGroupOf(word) {
  return WORD_TO_GROUP.get(String(word || "").toLowerCase()) || null;
}

/** Canonical token for a query word: the group's concept, or the word
    itself when it belongs to no group. */
export function canonicalizeToken(word) {
  const group = synonymGroupOf(word);
  return group ? group.concept : word;
}

export function canonicalizeTokens(tokens) {
  return (tokens || []).map(canonicalizeToken);
}

/** Every word that means the same as `word`, not including `word`
    itself. Empty when the word is in no group. */
export function synonymsOf(word) {
  const group = synonymGroupOf(word);
  if (!group) return [];
  const w = String(word || "").toLowerCase();
  return group.words.filter((x) => x !== w);
}
