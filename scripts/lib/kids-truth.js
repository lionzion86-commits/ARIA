/* ==================================================================
   NIÑOS IS ONLY FOR KIDS (#443 c.6635747308, Danny's mom: «AE Wisconsin
   Badgers Graphic Cropped Baby Tee» and «AE Oklahoma Sooners Graphic Baby
   Tee» in Niños -- adult women's crops).

   A product is a child's when the product itself proves it: its own name
   says kids, boys, girls, toddler, infant, newborn, youth, little / big
   kid, or a child's size run (2T, 6-12 months, 4-5 years). A style name
   never proves it: a «baby tee», a «baby tank», a «babydoll», a «mini
   dress» are adult cuts. An adult word (women's, men's, ladies, adult,
   juniors' in clothing) makes it an adult's unless a child's word stands beside it as
   a second wearer («Mommy and Me ... Girls'»).

   isAdultInKids(p) is true for a product that must leave Niños: the kids
   department, the Niños audience switch and every «para=kids» column.
   kidProof(title) is what a bucket re-file into kids needs (an audit's
   keyword is not proof). Both directions are pinned by
   scripts/test/nordstrom-nav-tests.mjs.
   ================================================================== */
const APOS = "['’`]";
/* The child's own words. Bare «girl(s)» / «boy(s)» are words a band or a
   show carries («Spice Girls», «Bad Girl»), so they prove a child only as
   a wearer: «Girls' Tee», «Boys Shorts», «for girls». */
const KID_STRONG_RX = new RegExp(
  "\\b(kids?|kid" + APOS + "s|toddlers?|infants?|newborns?|youth|little\\s+kids?|big\\s+kids?|preschool|grade\\s*school|ni[ñn][oa]s?|children" + APOS + "?s?|baby\\s+(?:boys?|girls?|onesies?|bodysuits?|rompers?|booties|bibs?)|(?:boys|girls)" + APOS + "|(?:boy|girl)" + APOS + "s|for\\s+(?:boys|girls|kids))(?![a-z])" +
  "|\\b(?:boys|girls)\\s+(?:tees?|t-?shirts?|shirts?|tops?|pants|shorts|jeans|dress(?:es)?|skirts?|leggings|hoodies?|sweatshirts?|sweaters?|jackets?|coats?|pajamas?|sets?|swim\\w*|uniforms?|rash\\s*guards?|volleys?|boardshorts?|polos?|socks|shoes|sneakers|sandals|boots)\\b" +
  "|\\b(?:boys|girls)\\s+(?:\\d{1,2}\\b|sizes?\\b|plus\\b|husky\\b|slim\\b)" +
  "|\\b\\d{1,2}T\\b|\\b\\d{1,2}\\s*-\\s*\\d{1,2}\\s*(?:m|mo|mos|months|y|yrs|years)\\b",
  "i");
const ADULT_RX = new RegExp("\\b(women" + APOS + "?s?|womens|woman|men" + APOS + "s|mens|men|ladies|adults?|maternity)(?![a-z])", "i");
const ADULT_STRONG_RX = new RegExp("\\b(women" + APOS + "?s|womens|men" + APOS + "s|mens|ladies|maternity)(?![a-z])", "i");
/* «Juniors'» is a young women's department in clothing (Kohl's, Macy's);
   on a shoe or a cleat «Junior» is a child's size. */
const JUNIORS_RX = /\bjuniors?['’`]?s?(?![a-z])/i;
const SHOE_WORD_RX = /\b(shoes?|cleats?|sneakers?|boots?|sandals?|slides?|trainers?|racquets?|rackets?)\b/i;
/* Adult cuts whose names sound like a child's. */
export const STYLE_TRAP_RX = /\b(baby[\s-]*(?:tees?|t-?shirts?|tanks?|camis?|tops?|ribs?|ringers?|crops?|baby\s+tees?)|babydolls?|baby\s*doll\s+(?:dress|top|chemise|set|lingerie)|mini\s+(?:dress|skirt)e?s?)\b/i;
/* A second wearer: «Women's and Girls'», «Mommy & Me», «Men + Boys». */
const BOTH_RX = /\b(?:and|&|\+)\s*(?:kids?|girls?|boys?|toddlers?|youth)\b|\b(?:kids?|girls?|boys?|toddlers?|youth)\s*(?:and|&|\+)\s*(?:women|men|adults?)|\bmommy\s*(?:and|&)\s*me\b|\bfamily\s+matching\b|\badults?\s*(?:,|\/|and|&|or)?\s*kids?\b|\bkids?\s*(?:,|\/|and|&|or)?\s*adults?\b/i;

export const kidProof = (title) => KID_STRONG_RX.test(String(title || ""));
export function isAdultInKids(p) {
  const t = String((p && p.title) || "");
  const kid = kidProof(t);
  /* With a child's proof, only a department word («Women's», «Men's»,
     «Ladies») without a second wearer makes it an adult's: «for Kids Teens
     Adults» is for both, «JBL Junior ... kids headphones» a child's. */
  if (kid) return ADULT_STRONG_RX.test(t) && !BOTH_RX.test(t);
  if (ADULT_RX.test(t) || (JUNIORS_RX.test(t) && !SHOE_WORD_RX.test(t))) return true;
  if (STYLE_TRAP_RX.test(t)) return !kid;
  return false;
}
