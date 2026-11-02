/* NOBODY BUYS MAKEUP THEY CANNOT PICK A COLOUR FOR -- THE SHADE GATE
   (Danny, live production after #583: "There aren't shades or colors ...
   Why is there not a dropdown with the numbers?").

   A foundation, concealer, lipstick, lip liner, gloss, eyeliner,
   eyeshadow, blush, bronzer, mascara, brow colour, nail polish or hair
   colour is sold in shades. When the store's shade list reached us
   (scripts/lib/variant-families.mjs, scripts/lib/variants.mjs) the
   product page offers it as a «Tono» picker and the line carries the
   shade picked. When it did not -- Ulta, Sephora and YesStyle came from
   search-result scrapes with no shade list -- the product is SHOWN, NOT
   SOLD: the page says «Tonos en camino», the cart button is off, and the
   cart, checkout and the order endpoint refuse a line with no shade. A
   shade is never guessed.

   THE KIND IS THE PRODUCT'S OWN TYPE, never its brand: the product noun
   the store's title names ("Slim Lip Liner Pencil", "Fit Me Concealer"),
   plus the store's own aisle where it has one (Ulta / Sephora "type").
   Conservative on purpose -- only a product that is clearly sold in
   shades is gated:
     NOT gated  a palette, set, kit, duo/trio set or bundle (the title is
                the one product), skincare, fragrance, tools and brushes,
                primers, setting sprays and powders, removers, top / base
                coats and nail care, clear / transparent products, plain
                lip balms, lip treatments and masks, shampoo and
                conditioner (even "for colour-treated hair"), sunscreen.
     gated      the shade nouns below, when none of the above applies.
   A hair-colour KIT is a shade (Walmart sells one kit per shade), so
   "kit" does not exempt hair colour.

   A plain script (no import/export), like /display-name.js: producto.html,
   carrito / checkout.html and the app bundle load it with
   <script src="/shade-gate.js">; scripts and the order endpoint read it
   through scripts/lib/shade-gate.mjs. */
(function (root) {
  'use strict';
  /* Sold in shades. */
  var SHADE_NOUN = new RegExp('\\b(?:'
    + 'lipsticks?|lip ?sticks?|lip ?gloss(?:es)?|lip ?glaze|lip ?lacquers?|lip ?liners?|lip ?pencils?|lip ?stains?|lip ?tints?|lip ?colou?rs?|lip ?crayons?|lip ?oils?|lip ?creams?|liquid lip|lip ?paint|lip ?mousse|lip ?velvet|tinted (?:lip )?balm|lip ?butter balm'
    + '|labiales?|delineador(?:es)?|brillo labial|gloss(?:es)?'
    + '|foundations?|concealers?|colou?r correct(?:or|ors|ing)|correctors?|tinted moisturi[sz]er|skin ?tint|bb ?cream|cc\\+? ?cream|tinted serum|tints?|(?:pencil|gel|liquid|kohl|ink|felt|tattoo|wing(?:ed)?) liners?|illuminators?|cushion compact|cushion foundation|cushions?'
    + '|bases? de maquillaje|correctores?|corrector'
    + '|blush(?:es|er)?|bronzers?|highlighters?|contour(?: stick)?|rubor(?:es)?|iluminador(?:es)?'
    + '|eye ?liners?|eyeliners?|kohl|eye ?pencils?|kajal|eye ?shadows?|eyeshadows?|shadow sticks?|sombras?|mascaras?|m[aá]scaras? de pesta[nñ]as'
    + '|brow (?:pencil|pomade|gel|powder|wax|tint|definer|pen|marker)s?|eyebrow (?:pencil|pomade|gel|powder|wax|tint|pen)s?'
    + '|nail (?:polish|lacquer|colou?r|enamel|paint)|gel polish|esmaltes?'
    + '|hair colou?r|hair dye|permanent colou?r|semi-?permanent|demi-?permanent|root (?:touch[- ]?up|cover(?:up)?|concealer)|tinte(?:s)? (?:para el )?cabello|tinte'
    + '|pressed powder|face powder|powder foundation|compact powder|(?:setting|loose|finishing|blurring|baking|matte|mineral) powder|powder blush'
    + ')\\b', 'i');
  /* NEVER a shade product, whatever else the title says: the title is a
     set or palette (one product), a tool, a remover, nail care, hair
     care, fragrance, false lashes, or a clear / colourless product. */
  var NOT_SHADED = new RegExp('\\b(?:'
    + 'palettes?|paletas?|quads?|trios?|sets?|gift|bundle|collection|coffret|vault|value pack|kits?|estuche'
    + '|brush(?:es)?|brochas?|sponges?|blender|applicators?|sharpeners?|tweezers?|curlers?|(?:makeup|compact|hand|vanity|travel|led|lighted) mirrors?|bags?|totes?|pouch(?:es)?|cases?|organizer|refill tray'
    + '|translucent|transparent|clear|incoloro|nipple|pasties|(?:mascara|lash|eye|eyeshadow|lip) (?:primer|base)|hair styling|styling gel|flyaway'
    + '|removers?|cleansers?|cleansing|micellar|wipes?|desmaquillante'
    + '|top ?coat|base ?coat|nail (?:care|treatment|strengthener|hardener|oil|file|clipper|tips?|art|stickers?|glue)|press[- ]on|cuticle'
    + '|shampoos?|conditioners?|champ[uú]|acondicionador|hair (?:mask|oil|serum|spray|treatment)|colou?r[- ]?(?:safe|treated|protect\\w*)|developer|bond'
    + '|perfumes?|fragrances?|eau de|cologne|body (?:mist|lotion|wash|oil|butter|scrub)|deodorant'
    + '|false lashes|lash(?:es)? (?:glue|adhesive|serum|primer|curler)|lash strips?|individual lashes|pesta[nñ]as postizas|lash extensions?'
    + ')\\b', 'i');
  /* Skincare and care words: not a shade product -- unless the title
     names one outright (a "Serum Powered Foundation", a "Tinted
     Moisturizer ... SPF 30", a "Skin Tint SPF 50" are sold in shades). */
  var CARE = new RegExp('\\b(?:'
    + 'primers?|prebase|setting (?:spray|mist)|fixing spray'
    + '|serums?|s[eé]rum|moisturi[sz]ers?|creams?|cr[eè]me|toners?|t[oó]nicos?|essence|ampoules?|masks?|mascarillas?|sunscreen|sun ?stick|exfoliat\\w*|scrub|lotion|oil'
    + '|lip (?:balm|mask|scrub|treatment|serum|plump(?:er|ing)?|care|sleeping)|balms?|b[aá]lsamo'
    + '|eye ?(?:cream|serum|patch(?:es)?|gel|mask)|contorno de ojos'
    + ')\\b', 'i');
  var STRONG = /\b(?:foundations?|concealers?|skin ?tints?|tinted (?:moisturi[sz]er|serum|balm|sunscreen)|bb ?cream|cc\+? ?cream|cushions?|lipsticks?|lip ?liners?|lip ?pencils?|lip ?oils?|lip ?gloss(?:es)?|lip ?creams?|eye ?liners?|eyeliners?|mascaras?|blush(?:es)?|bronzers?|highlighters?|eye ?shadows?|eyeshadows?)\b/i;
  /* THE STORE'S OWN WORDS: a beauty title that says "- 14 Colors" or
     "- 5 Shades" (YesStyle) is sold in that many shades, by the store's
     own account -- unless it is a palette, whose colours are its contents. */
  var SHADE_CLAIM = /\b\d+\s+(?:[A-Za-z][\w-]*\s+){0,3}?(?:colou?rs|shades|tonos|colores)\b/i;
  /* The store's makeup aisles (Ulta / Sephora / YesStyle / Victoria's
     Secret "type"). */
  var MAKEUP_TYPE = /^(?:labios|ojos|rostro|maquillaje|makeup|u[nñ]as|lips?|eyes?|face|nails?)$/i;
  /* In a makeup aisle, still not a shade product: care, prep and finish. */
  var CARE_AISLE = /\b(?:primers?|prebase|setting (?:spray|mist)|fixing spray|serums?|moisturi[sz]ers?|creams?|cr[eè]me|toners?|essence|masks?|sunscreen|spf|exfoliat\w*|scrub|balms?|oils?|treatments?|ointments?|rollers?|lifters?|drying|retinol|pdrn|peptides?|lash system|grandelash\w*|remover|cleans\w*|lash (?:serum|growth)|brow (?:serum|growth)|growth|conditioner|patch(?:es)?|refill|sharpener|spray|mist|wipes?|pads?|tools?)\b/i;
  /* "12 Eyeshadows, 1 Highlighter, 1 Blush": counted pieces are a set. */
  var SEVERAL_PIECES = /\b\d+\s+[A-Za-z][\w -]*,\s*\d+\s+(?:highlighters?|blush(?:es)?|bronzers?|eye ?shadows?|lip\w*|mascaras?|liners?|brush(?:es)?|concealers?)\b/i;
  /* "Smudge & Set", "Lock & Set": a claim, not a set. */
  var SET_CLAIM = /(?:&|and|\+)\s*set\b/gi;
  /* A hair-colour kit is one shade (Walmart: one kit per shade). */
  var HAIR_COLOUR = /\b(?:hair colou?r|hair dye|permanent colou?r|semi-?permanent|demi-?permanent|root (?:touch[- ]?up|cover(?:up)?|concealer)|tinte)\b/i;
  var HAIR_NOT = /\b(?:shampoos?|conditioners?|champ[uú]|acondicionador|hair (?:mask|oil|serum|spray|treatment)|colou?r[- ]?(?:safe|treated|protect\w*)|developer|bond|brush(?:es)?|gloves?|bowl|cape)\b/i;

  /* A BEAUTY PRODUCT FIRST. "Foundation" is a bra line at Macy's, "Blush"
     a balloon at Party City and "Contour" a legging at Alphalete: the
     shade nouns are read only where the store itself files the product
     as beauty -- a beauty-only store, or a beauty aisle / type. */
  var BEAUTY_STORES = { ulta: 1, sephora: 1 };
  var BEAUTY_AISLE = /^(?:beauty|belleza|makeup|maquillaje|cosm[eé]ticos?|labios|ojos|rostro|u[nñ]as|cabello|hair ?colou?r|lips?|eyes?|face|nails?)$/i;
  function beautyContext(item) {
    var r = String(item && item.retailer || '').toLowerCase().trim();
    if (BEAUTY_STORES[r]) return true;
    if (item && item.beauty === true) return true;
    return BEAUTY_AISLE.test(String(item && item.dept || '').trim());
  }
  function kindOf(item) {
    var name = String(item && (item.name || item.title) || '');
    if (!name || !beautyContext(item)) return '';
    if (HAIR_COLOUR.test(name)) return HAIR_NOT.test(name) ? '' : 'hair';
    var t = name.replace(SET_CLAIM, ' ');
    if (NOT_SHADED.test(t) || SEVERAL_PIECES.test(t)) return '';
    if (SHADE_CLAIM.test(t)) return 'makeup';
    if (CARE.test(t) && !STRONG.test(t)) return '';
    if (SHADE_NOUN.test(t)) return 'makeup';
    /* THE STORE'S OWN MAKEUP AISLE (Danny: "every single makeup has to have
       a color dropdown"): a product the store files under lips, eyes, face
       makeup or nails, whose title names no shade noun ("Almost Lipstick"
       aside, "Hollywood Flawless Filter"), is sold in shades too -- gated
       rather than sold without one. Its care, tool and set words above
       still keep a primer, a brush or a palette out. */
    if (MAKEUP_TYPE.test(String(item && item.type || '').trim()) && !CARE_AISLE.test(t)) return 'makeup';
    return '';
  }
  /* What made it a shade product, for the shade-pull worklist: the noun
     in its title, the store's "- N Colors", or the store's makeup aisle. */
  function reasonOf(item) {
    var kind = kindOf(item);
    if (!kind) return '';
    var t = String(item && (item.name || item.title) || '').replace(SET_CLAIM, ' ');
    var m = kind === 'hair' ? HAIR_COLOUR.exec(t) : (SHADE_CLAIM.exec(t) || SHADE_NOUN.exec(t));
    if (m) return m[0].toLowerCase();
    return 'aisle: ' + String(item.type || '').trim();
  }
  /* Is this product sold in shades (by its own type)? */
  function isShadeDependent(item) { return !!kindOf(item); }

  var SHADE_PENDING_NOTE = 'Tonos en camino: todavía no tenemos la lista de tonos de este producto, así que no se puede comprar aún.';
  var SHADE_PENDING_BUTTON = 'Tonos en camino';
  function shadeOrderError(title) {
    return 'Todavía no podemos vender «' + String(title || 'este producto') + '»: no tenemos su lista de tonos y no se compra maquillaje sin elegir el tono. Quítalo del carrito para continuar.';
  }
  /* A cart / order line: a shade product with no shade on it is refused.
     The shade is the store's label the line carries (colorway, picked on
     the product page, or the one shade the listing is sold in). */
  function lineNeedsShade(line) {
    if (!line || typeof line !== 'object' || line.lineType === 'bundle-discount') return false;
    var shade = String(line.colorway || line.shade || '').trim();
    if (shade) return false;
    /* The product page marks a shade product on the line (shadeKind). */
    if (line.shadeKind === 'makeup' || line.shadeKind === 'hair') return true;
    return isShadeDependent({ name: line.title || line.name, dept: line.dept, retailer: line.retailer, beauty: line.shadeKind === 'makeup' || line.shadeKind === 'hair' });
  }

  root.AriaShadeGate = Object.freeze({
    SHADE_NOUN: SHADE_NOUN,
    NOT_SHADED: NOT_SHADED,
    CARE: CARE,
    SHADE_CLAIM: SHADE_CLAIM,
    STRONG: STRONG,
    kindOf: kindOf,
    beautyContext: beautyContext,
    reasonOf: reasonOf,
    isShadeDependent: isShadeDependent,
    lineNeedsShade: lineNeedsShade,
    shadeOrderError: shadeOrderError,
    SHADE_PENDING_NOTE: SHADE_PENDING_NOTE,
    SHADE_PENDING_BUTTON: SHADE_PENDING_BUTTON,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
