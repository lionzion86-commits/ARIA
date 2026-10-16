/* ============================================================
   ROPA INTERIOR Y MEDIAS (hombre) — the department's rules.

   One file, two readers: ropa-interior.html runs it in the browser,
   scripts/test/ropa-interior-tests.mjs runs it in Node over the
   committed catalogues. What the test counts is exactly what the page
   shows.

   WHY THE DEPARTMENT EXISTS (Danny, 2026-10-07). About 1,200 men's
   underwear and sock products already sat in the catalogues across
   25 stores with no department home. Women's lingerie has its own
   section; this covers the men's gap.

   THE RULES, in order:
     1. A known false-positive brand is out (Kindred Bravely,
        Victoria's Secret, Miu Miu, Montce, Bonfolk).
     2. Anything signalled women's or kids' is out.
     3. Not underwear or socks is out: swim trunks, boardshorts,
        undershirts, shoes ("Sock Dart"), and skate hardware whose
        graphic happens to say "boxer" or "sock".
     4. A men's signal is required: men/hombre/caballero in the title,
        type, gender or department, OR a men's brand or shop
        (Stance, BN3TH, PSD, Ethika, the surf and skate shops).
   ============================================================ */
(function (root) {
  'use strict';

  var EXCLUDED_BRANDS = /^(?:kindred bravely|victoria'?s secret|miu miu|montce|bonfolk)$/i;
  var EXCLUDED_RETAILERS = { victoriassecret: 1, miumiu: 1, kindredbravely: 1, montce: 1 };

  var WOMEN_RE = /\b(?:for her|women'?s?|womens|woman|mujer(?:es)?|dama|damas|ladies|lady|female|girls?'?|ni[nñ]as?|maternity|bra|bras|bralette|panty|panties|thong|thongs|cheeky|bikini brief|hipster|lingerie|boy\s*shorts?|boyshorts?)\b/i;
  var KIDS_RE = /\b(?:boys?'?|kids?'?|toddler|baby|infant|youth|juniors?|little|big kids|ni[nñ]os?)\b/i;
  var MEN_RE = /\b(?:for him|men'?s?|mens|man|hombres?|caballeros?|male|guys?)\b/i;

  /* Product type. Underwear first, because "boxer brief" must never be
     read as a brief, and "trunk" only counts as underwear. */
  var UNDERWEAR_RE = /\b(?:underwear|boxer[\s-]*briefs?|boxers?|briefs?|trunks?|calzoncillos?|b[oó]xers?|jockstraps?|undies)\b/i;
  var SOCKS_RE = /\b(?:socks?|calcetines|calcetas|medias)\b/i;

  /* Never underwear or socks, wherever the word sits: swimwear,
     undershirts, and footwear named after socks ("Sock Boots"). */
  var NOT_GARMENT_RE = /\b(?:swim|swimwear|board\s*shorts?|boardshorts?|volley|bathing|undershirts?|shoes?|sneakers?|sneaks|slides?|sandals?|clogs?|boots?|dive|freedive|neoprene|reef)\b/i;
  /* THE HEAD NOUN DECIDES. A title names its product before the first
     qualifier ("Toy Machine Fists Socks - Orange", "MENS COTTON BOXER
     BRIEF | BONE", "Kirkland Men's Athletic Sock, 8-pair"); a skate deck
     with a sock graphic names a deck. Pack counts are not the noun. */
  var HEAD_NOISE = /^(?:\d+|\d+pk|\d+-?pack|pack|pk|pairs?|pr|set|count|ct|x|multicolor|multi|ombre|black|white|grey|gray|navy|blue|red|green|heather|charcoal|assorted)$/i;
  var GARMENT_NOUN = /^(?:socks?|calcetines|calcetas|medias|underwear|boxers?|briefs?|trunks?|calzoncillos?|b[oó]xers?|jockstraps?|undies|crew|quarter|ankle|no-show|liner)$/i;
  function headWords(title){
    /* A leading product code ("9044 - Performance Workout Socks") is
       not the product: the first segment with words in it is. */
    var segs = String(title).split(/\s[-–|—]\s|\s\|\s|[,(:]|\swith\s/i);
    var seg = title;
    for (var s = 0; s < segs.length; s++) if (/[a-z]{3,}/i.test(segs[s].replace(/\b[a-z]?\d+[a-z]?\b/gi, ''))) { seg = segs[s]; break; }
    var toks = seg.toLowerCase().replace(/[^a-z0-9áéíóúñ\s-]/g, ' ').split(/[\s]+/).filter(function (w) {
      return w && !HEAD_NOISE.test(w) && !/^\d+(?:-?pk|-?pack|-?pair|\.\d+)?$/.test(w);
    });
    return toks.slice(-2);
  }
  function headIsGarment(title){
    var h = headWords(title);
    for (var i = 0; i < h.length; i++) if (GARMENT_NOUN.test(h[i])) return true;
    return false;
  }
  /* "Sock" and "boxer" also name a sneaker silhouette and a dog. */
  var NOT_SOCK_RE = /\b(?:sock\s*dart|sock\s*liner|sockliner|knit sock sneaker|boxer dog|(?:body|surf|skim|long|sup)?\s*board\s*socks?|bodyboard\s*socks?|surfboard\s*socks?)\b/i;
  /* Novelty that reads as underwear or socks but is a joke gift. */
  var NOVELTY_RE = /\bboobs?\b/i;

  var MEN_BRANDS = /^(?:stance|bn3th|psd|psd underwear|psd x.*|ethika|henny apparel|saxx|meundies|tommy john|jockey|hanes|fruit of the loom|calvin klein|polo ralph lauren|tom ford|rick owens|huf|ripndip)$/i;
  /* Brands whose underwear is underwear even when the title just says
     "Trunk" -- at a surf shop a bare "Trunk" is a swim trunk. */
  var UNDERWEAR_BRANDS = /^(?:bn3th|psd|psd underwear|psd x.*|ethika|saxx|meundies|tommy john|jockey|hanes|fruit of the loom|calvin klein|tom ford|skims|2\(x\)ist|emporio armani|hugo boss|boss)$/i;
  /* Unisex sock brands the catalogue scan verified as the men's sock
     assortment (Crocs, Nike, adidas): socks only, never underwear. */
  var SOCK_BRANDS = /^(?:stance|nike|adidas|crocs|huf|ripndip|kirkland signature)$/i;
  /* Surf and skate shops: their underwear and socks are men's-led and
     rarely say so in the title. */
  var MEN_SHOPS = { ccs: 1, parrot: 1, islandwatersports: 1, mainland: 1, surfstation: 1, surfworld: 1, valsurf: 1, quietstorm: 1, zumiez: 1 };

  function text(it) {
    return [it.title || it.name || '', it.type || '', it.gender || ''].join(' ');
  }

  function classify(it, retailer, bucket) {
    if (!it) return null;
    var title = String(it.title || it.name || '');
    if (!title) return null;
    var brand = String(it.brand || '').trim();
    if (EXCLUDED_BRANDS.test(brand) || EXCLUDED_RETAILERS[retailer]) return null;
    var hay = text(it);
    var dept = String(bucket || '');
    /* 2. Women's and kids' are out, by any signal. */
    if (WOMEN_RE.test(hay) && !MEN_RE.test(title)) return null;
    if (/^(?:women|womens|moda_mujer|mujer|apparel_women|lingerie|intimates|kids|moda_ninos|ninos|apparel_kids|baby)$/i.test(dept)) return null;
    if (KIDS_RE.test(title)) return null;
    if (NOVELTY_RE.test(title)) return null;
    /* 3. Underwear or socks, and nothing that only borrows the words. */
    var typeField = String(it.type || '');
    if (/^(?:shorts|swim|swimwear|boardshorts)$/i.test(typeField)) return null;
    if (/swim/i.test(brand)) return null;
    var isUnder = UNDERWEAR_RE.test(title) || /^underwear$/i.test(typeField);
    /* SWIM TRUNKS ARE NOT TRUNKS. A title whose only underwear word is
       "trunk" needs an underwear brand or type behind it. */
    if (isUnder && !/\b(?:underwear|boxer|brief|calzoncillo|b[oó]xer|jockstrap|undies)/i.test(title)
        && !/^underwear$/i.test(typeField) && !UNDERWEAR_BRANDS.test(brand)) isUnder = false;
    var isSocks = SOCKS_RE.test(title) || /^socks?$/i.test(String(it.type || ''));
    if (!isUnder && !isSocks) return null;
    if (NOT_SOCK_RE.test(title)) return null;
    if (retailer === 'hottopic' && !MEN_RE.test(hay)) return null;
    if (NOT_GARMENT_RE.test(title)) return null;
    /* An underwear brand saying "Underwear" names the product even when
       a print name follows it ("PSD Underwear Cheetos Crunchy"). */
    var brandSaysIt = UNDERWEAR_BRANDS.test(brand) && /\bunderwear\b/i.test(title);
    if (!headIsGarment(title) && !brandSaysIt && !/^(?:underwear|socks?)$/i.test(typeField)) return null;
    /* 4. A men's signal. */
    var men = MEN_RE.test(hay) || /^(?:men|mens|apparel_men|grooming_men)$/i.test(dept)
      || /^m(?:en)?$/i.test(String(it.gender || ''))
      || MEN_BRANDS.test(brand) || !!MEN_SHOPS[retailer]
      || (isSocks && !isUnder && (SOCK_BRANDS.test(brand) || /\bunisex\b/i.test(hay)));
    if (!men) return null;
    var type = isUnder && !(isSocks && !UNDERWEAR_RE.test(title)) ? 'underwear' : 'socks';
    return { type: type, sub: type === 'underwear' ? underwearSub(title) : socksSub(title) };
  }

  function underwearSub(t) {
    if (/\bboxer[\s-]*briefs?\b|\bb[oó]xer[\s-]*brief/i.test(t)) return 'boxer_brief';
    if (/\btrunks?\b/i.test(t)) return 'trunk';
    if (/\bbriefs?\b/i.test(t)) return 'brief';
    if (/\bboxers?\b|\bb[oó]xers?\b/i.test(t)) return 'boxer_brief';
    return 'boxer_brief';
  }
  function socksSub(t) {
    if (/\b(?:dress|trouser|business|formal|vestir)\b/i.test(t)) return 'dress';
    if (/\b(?:athletic|performance|run(?:ning)?|training|train|sport|basketball|golf|tennis|soccer|football|hiking|cushion(?:ed)?|compression|grip|elite|dri-?fit|tech|crossfit|gym|ski|snowboard|skate)\b/i.test(t)) return 'sport';
    return 'casual';
  }

  /* Price helpers: the sale signal is any original price above price. */
  function originalOf(it) {
    var o = Number(it.originalPrice || it.compareAt || it.regularPrice || 0);
    return o > Number(it.price) ? o : 0;
  }
  function discountPct(it) {
    var o = originalOf(it), p = Number(it.price);
    return o > 0 && p > 0 ? Math.round((1 - p / o) * 100) : 0;
  }

  /* ============================================================
     ROPA INTERIOR MUJER (Danny, 2026-10-10) — the mirror of the rules
     above, same file, not a fork. It shares the garment words, the
     look-alike guards (swimwear, shoes, board socks, novelty) and the
     head-noun test; only the gender rules flip:
       1. Men's signal anywhere is out (it belongs to the men's feed).
       2. Kids' and girls' are out (their own audience).
       3. Intimates or socks only: panties, bras, lingerie, shapewear,
          socks. Pajamas, loungewear, swim, sports bras and Victoria's
          Secret's "Ropa", "Pijamas" and beauty are out.
       4. A women's signal is required: women/mujer/for her in the
          title, type or department, a women's intimates garment word
          (bra, panty, thong, lingerie -- the same words rule 2 above
          reads as women's), or a women's intimates brand or store.
     A sock lives in exactly one feed: women's only with an explicit
     women's signal; unisex and unassigned socks stay in the men's feed.
     ============================================================ */
  var W_KIDS_RE = /\b(?:girls?'?|ni[nñ]as?|boys?'?|kids?'?|toddler|infant|youth|juniors?|big kids|little kids|ni[nñ]os?|baby(?!\s*doll)|beb[eé]s?)\b/i;
  var W_SIGNAL_RE = /\b(?:for her|women'?s?|womens|woman|mujer(?:es)?|dama|damas|ladies|lady|female|maternity|nursing|maternidad|lactancia)\b/i;
  var W_DEPTS = /^(?:women|womens|moda_mujer|mujer|apparel_women|lingerie|intimates)$/i;
  var W_EXCLUDED_DEPTS = /^(?:beauty|men|mens|apparel_men|grooming_men|kids|moda_ninos|ninos|apparel_kids|baby|toys)$/i;
  /* Victoria's Secret files its intimates under these types; "Ropa"
     (clothing) and "Pijamas" are not this department. */
  var VS_INTIMATE_TYPES = /^(?:ropa interior|sostenes|lencer[ií]a)$/i;
  /* Gym and fight brands: their "bras" are sports bras (activewear),
     not this department; their socks still count. */
  var ACTIVE_SHOPS = { alphalete: 1, youngla: 1, gymshark: 1, everlast: 1, venum: 1, tatami: 1, mmawarehouse: 1, combatcorner: 1, fuji: 1, elite: 1, gameness: 1 };
  /* Stores whose catalogue IS women's intimates and maternity. */
  var W_SHOPS = { victoriassecret: 1, skims: 1, kindredbravely: 1, lanebryant: 1 };

  var BRA_RE = /\b(?:bras?|bralettes?|brassieres?|sostenes|sost[eé]n|sujetador(?:es)?|bandeau|balconette|bustier)\b/i;
  var PANTY_RE = /\b(?:panty|panties|pantys|thongs?|tangas?|cheeky|cheekies|hipsters?|boy\s*shorts?|boyshorts?|g-?strings?|bragas?|calzones|underwear|briefs?|bikini(?=\s+(?:panty|panties|briefs?|underwear)))\b/i;
  /* Panty words that are women's by themselves ("briefs" and
     "underwear" are not). */
  var W_PANTY_WORD_RE = /\b(?:panty|panties|pantys|thongs?|tangas?|cheeky|cheekies|hipsters?|boy\s*shorts?|boyshorts?|g-?strings?|bragas?)\b/i;
  var LINGERIE_RE = /\b(?:lingerie|lencer[ií]a|teddy|teddies|babydolls?|baby\s*doll|chemise|corsets?|garters?|garter\s*belts?|negligee|bustier)\b/i;
  var SHAPEWEAR_RE = /\b(?:shapewear|shaper|shapers|body\s*shaper|sculpting|waist\s*(?:trainer|cincher)|modeladora?s?|fajas?)\b/i;
  var HOSIERY_RE = /\b(?:tights|pantyhose|hosiery|stockings?|thigh[\s-]*highs?|knee[\s-]*highs?)\b/i;
  /* Not this department even when an intimates word appears. */
  /* Words that make an item fashion or swim rather than intimates --
     unless the store's own type field files it as intimates (Victoria's
     Secret's "Corset Top" under Sostenes, Skims' "String Bikini" under
     Panties). A "bra top" is a bra. */
  var W_NOT_UNTYPED_RE = /\b(?:bikini(?!\s+(?:panty|panties|briefs?|underwear))|bottoms?|tops?|gowns?|one[\s-]*piece|swimsuits?)\b/i;
  var W_NOT_RE = /\b(?:pant|coats?|extenders?|bra\s*straps?|keychains?|key\s*rings?|sweatshirts?|cardigans?|plush|toys?|ornaments?|mugs?|earrings?|necklaces?|charms?|stickers?|pins?|blankets?|pillows?|pajamas?|pijamas?|pjs?|sleep\s*shirts?|sleepwear|robes?|night\s*gowns?|nightgowns?|nightshirts?|lounge\s*pants?|leggings?|sports?\s*bras?|swim|bikini\s*(?:top|bottom|set)|cover[\s-]*ups?|t-?shirts?|tees?|tank\s*tops?|dress(?:es)?(?!\s*socks?)|jeans?|pants|skirts?|jackets?|sweaters?|hoodies?|bags?|purses?|wallets?|pads?|nipple|breast\s*pumps?|pump|bottles?|wipes|diapers?|perfume|fragrance|mist|lotion|candle|gift\s*card|organizer|hanger|laundry|detergent|wash\s*bag)\b/i;
  var W_GARMENT_NOUN = /^(?:panty|panties|pantys|thongs?|tangas?|cheeky|cheekies|hipsters?|boyshorts?|shorts?|briefs?|bras?|bralettes?|brassieres?|underwear|lingerie|teddy|teddies|babydolls?|doll|chemise|corsets?|garters?|bustier|shapewear|shapers?|bodysuits?|socks?|calcetines|medias|tights|pantyhose|hosiery|stockings?|highs?|crew|quarter|ankle|no-show|liner|set|pack|bragas?|g-string|bikini)$/i;
  function headIsWomenGarment(title){
    var h = headWords(title);
    for (var i = 0; i < h.length; i++) if (W_GARMENT_NOUN.test(h[i])) return true;
    return false;
  }
  /* Store type fields that name an intimates garment outright
     (Skims, Victoria's Secret, Kohl's). */
  var W_TYPE_GARMENT = /^(?:panty|panties|panty pack|bra|bras|bralette|bralettes|shapewear.*|shapewear_.*|socks?|ropa interior|sostenes|lencer[ií]a|underwear|intimates|lingerie)$/i;

  function classifyWomen(it, retailer, bucket) {
    if (!it) return null;
    var title = String(it.title || it.name || '');
    if (!title) return null;
    var brand = String(it.brand || '').trim();
    var typeField = String(it.type || '');
    var dept = String(bucket || '');
    var hay = text(it);
    if (W_EXCLUDED_DEPTS.test(dept)) return null;
    /* Victoria's Secret: intimates types only (no Ropa, Pijamas, beauty). */
    if (retailer === 'victoriassecret' && !VS_INTIMATE_TYPES.test(typeField)) return null;
    /* 1. Men's anywhere: the men's feed's item. */
    if (MEN_RE.test(hay) || /^m(?:en)?$/i.test(String(it.gender || ''))) return null;
    /* 2. Kids' and girls'. */
    if (W_KIDS_RE.test(title) || W_KIDS_RE.test(typeField)) return null;
    if (NOVELTY_RE.test(title)) return null;
    /* 3. Intimates or socks, and nothing that only borrows the words. */
    if (/^(?:shorts|swim|swimwear|swim_.*|tops?|bottoms?|dresses|sets?|accessories|pajamas?|pijamas|ropa|sleep.*|lounge.*)$/i.test(typeField)
        && !BRA_RE.test(title) && !PANTY_RE.test(title)) return null;
    if (/swim/i.test(brand) || /swim/i.test(typeField)) return null;
    if (NOT_GARMENT_RE.test(title) || W_NOT_RE.test(title) || NOT_SOCK_RE.test(title)) return null;
    var typed = W_TYPE_GARMENT.test(typeField);
    if (!typed && W_NOT_UNTYPED_RE.test(title.replace(/\bbra(?:lette)?\s+tops?\b/ig, 'bra'))) return null;
    var sub = null;
    if (/^socks?$/i.test(typeField) || SOCKS_RE.test(title) || HOSIERY_RE.test(title)) sub = 'socks';
    if (/^(?:sostenes|bras?|bralettes?)$/i.test(typeField) || BRA_RE.test(title)) sub = 'bra';
    /* A title with both a bra and a panty word is a set (lingerie). */
    if (/^(?:panty|panties|panty pack|ropa interior|underwear)$/i.test(typeField) || PANTY_RE.test(title)) {
      if (sub !== 'bra') sub = 'panty';
      else if (PANTY_RE.test(title)) sub = 'set';
    }
    /* "Vanity Fair Lingerie(R) ... Bra" is a bra: the garment word wins
       over a brand that says lingerie, unless the store files it so. */
    if (/^lencer[ií]a$/i.test(typeField) || (LINGERIE_RE.test(title) && (!sub || sub === 'set'))) sub = 'lingerie';
    /* A garter belt or a corset is lingerie even where the store files it
       under panties or bras (Victoria's Secret): the title has no bra or
       panty word of its own. */
    if (LINGERIE_RE.test(title) && !BRA_RE.test(title.replace(/\bbustier\b/ig, '')) && !W_PANTY_WORD_RE.test(title) && !/\b(?:briefs?|underwear)\b/i.test(title)) sub = 'lingerie';
    if (/^shapewear/i.test(typeField) || SHAPEWEAR_RE.test(title)) sub = 'shapewear';
    if (!sub) return null;
    if (!typed && !headIsWomenGarment(title)) return null;
    if (ACTIVE_SHOPS[retailer] && sub !== 'socks') return null;
    /* Surf and skate shops: a women's "cheeky" or "bralette" there is
       swimwear unless the title says underwear outright. */
    if (MEN_SHOPS[retailer] && sub !== 'socks' && !/\b(?:underwear|lingerie|panty|panties)\b/i.test(title)) return null;
    /* 4. A women's signal. Socks need an explicit one: a sock with no
       gender is the men's feed's (unisex), never listed twice. */
    var explicit = W_SIGNAL_RE.test(hay) || W_DEPTS.test(dept) || !!W_SHOPS[retailer];
    var garmentSays = sub !== 'socks' && (BRA_RE.test(title) || W_PANTY_WORD_RE.test(title) || LINGERIE_RE.test(title));
    if (!explicit && !garmentSays) return null;
    if (sub === 'set') sub = 'lingerie';
    var socksKind = sub === 'socks' ? (HOSIERY_RE.test(title) ? 'hosiery' : socksSub(title)) : null;
    return { type: sub === 'socks' ? 'socks' : 'underwear', sub: sub === 'socks' ? socksKind : sub };
  }

  /* The men's feed's gender note for a sock: 'u' when nothing in the
     item says men's -- the unisex socks the women's section may surface
     from the men's feed without listing them twice. */
  function sockGender(it, retailer, bucket) {
    var hay = text(it);
    if (MEN_RE.test(hay) || /^(?:men|mens|apparel_men|grooming_men)$/i.test(String(bucket || ''))
        || /^m(?:en)?$/i.test(String(it.gender || ''))) return 'm';
    return 'u';
  }

  var api = { classify: classify, classifyWomen: classifyWomen, sockGender: sockGender,
    discountPct: discountPct, originalOf: originalOf,
    MEN_SHOPS: MEN_SHOPS, W_SHOPS: W_SHOPS, EXCLUDED_BRANDS: EXCLUDED_BRANDS };
  root.AriaRopaInterior = api;
})(typeof window !== 'undefined' ? window : globalThis);
