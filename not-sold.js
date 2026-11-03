/* ============================================================
   NOT SOLD AT ALL -- PILLS AND FOOD. ONE RULE (#443 c.6579517469,
   Danny, 2026-11-02: "we don't even sell pills and we're selling
   Pepcid Complete").

   Aria sells no medicine, no vitamins or supplements, and no food. A
   store's scrape is not a shelf plan: Costco's pull filed TUMS under
   Computadoras ("108 Chewable Tablets" read as a tablet), antacids
   under Belleza and nuts, sauces and formula under Fiesta and Bebé.

   WHAT. notSoldKind(title) names the kind a product is by its own
   title, or '' when it is something Aria sells:
     farmacia  over-the-counter medicine (TUMS, Pepcid, Advil, Tylenol,
               Claritin, cough drops...) and every vitamin, supplement,
               protein shake or powder sold to be swallowed;
     alimento  grocery: nuts, snacks, drinks, coffee, sauces, meat,
               formula and baby food, baked goods, frozen food;
     dulce     candy, chocolate and gum.
   NOT_SOLD says where each kind is off sale: pills and grocery at
   every store; candy only at Costco (its whole grocery aisle went),
   because Dulces y Chocolates is still a department of its own --
   that one is Danny's call.

   HOW IT IS ENFORCED (the held-used pattern, /condition.js):
     - scripts/purge-not-sold.mjs moves every such row out of the
       catalogues (into data/purges/, never silently lost) and the
       builders are re-run, so no surface can show one;
     - /off-sale.js isOffSaleItem reads THIS rule, so a product page, a
       cart line or an order for one is refused even if a stale link or
       an old cart still carries it.

   SHAPE. A plain script (no import/export): producto.html loads it with
   <script src> before /off-sale.js; scripts/lib/off-sale.js imports it
   for the builders, checkout.html and the Netlify functions.
   ============================================================ */
(function (root) {
  'use strict';

  /* OVER THE COUNTER: the medicine brands and the medicine words. */
  var OTC_RX = /\b(tylenol|advil|motrin|aleve|excedrin|bayer aspirin|aspirin|ibuprofen|acetaminophen|naproxen|pepcid|tums|rolaids|pepto[- ]?bismol|alka[- ]?seltzer|prilosec|prevacid|nexium|zantac|zegerid|famotidine|omeprazole|lansoprazole|esomeprazole|claritin|zyrtec|allegra|xyzal|flonase|nasacort|benadryl|mucinex|nyquil|dayquil|zzzquil|robitussin|delsym|theraflu|halls cough|halls|ricola|unisom|miralax|dulcolax|metamucil|colace|senokot|imodium|gas-x|gaviscon|maalox|mylanta|dramamine|midol|pamprin|emergen-c|zicam|cold-eeze|sudafed|afrin|visine|neosporin|polysporin|cortizone|icy hot|bengay|salonpas|voltaren|nicorette|nicotine (gum|lozenges?|patch(es)?)|pedialyte|desitin|preparation h|orajel|abreva|lotrimin|lamisil|tinactin|monistat|culturelle|cetirizine|loratadine|fexofenadine|diphenhydramine|guaifenesin|dextromethorphan|phenylephrine|pseudoephedrine|melatonin)\b|\bvicks (vapo\w*|dayquil|nyquil|zzzquil|sinex|cough\w*|formula 44)\b|\bairborne (immune|vitamin|chewable|effervescent|gumm\w*)\b/i;
  var MEDICINE_RX = /\b(antacids?|acid reducers?|pain relievers?|fever reducers?|antihistamines?|allergy (relief|medicine|tablets|tabs)|decongestants?|laxatives?|stool softeners?|sleep aids?|cold (&|and|\+) flu|cough (drops?|syrup|suppressant|relief|medicine)|throat lozenges?|nasal (spray|decongestant)|lubricant eye drops|eye drops|(fever|cold|cough|allergy|pain|sleep|children'?s) medicine|liquid gels?|liqui-gels?)\b/i;
  /* A medicine name on what is not medicine: a tee ("Icecream Nyquil"),
     a dress or a lamp called Allegra, a skate deck called Aleve, a heated
     eye mask sold as a sleep aid. */
  var NOT_MEDICINE_RX = /\b(shoes?|sneakers?|dress(es)?|hoodies?|t-shirts?|tees?|s\/s|l\/s|shirts?|tanks?|necklaces?|charms?|lamps?|prints?|wall art|posters?|stickers?|decks?|wheels|heated|heating|massager|cordless|rechargeable|electric|masks?|machines?|devices?)\b/i;
  /* SWALLOWED TO BE HEALTHY: vitamins, supplements, protein. */
  var SUPPLEMENT_RX = /\b(multi-?vitamins?|prenatals?|probiotics?|omega-?3s?|fish oil|krill oil|cod liver oil|glucosamine|chondroitin|joint health|curcumin|coq-?10|ashwagandha|astaxanthin|sea moss|spirulina|chlorella|creatine|pre-?workout|bcaa|whey|verisol|fat burner|fat[- ]burning|metabolism capsules|grow capsules|dietary supplements?|supplements?|nutritional (shakes?|drinks?|supplements?)|meal replacements?|pediasure|protein (powder|shakes?|drinks?|bars?|coffee)|immune support|lactation (drink|cookie|bites|supplement)\w*|collagen (peptides|powder|gumm\w*|tablets|capsules|supplement|drink|with biotin|advanced)|electrolyte (powder|drink mix|tablets|packets|supplement)|hair,? skin,? (and|&) nails|(magnesium|calcium|zinc|iron|biotin|turmeric|elderberry|vitamin [a-z0-9]+) (gumm\w*|tablets|capsules|softgels|caplets|chews|supplement)|cranberry \d+\s*mg)\b/i;
  var DOSE_FORM_RX = /\b\d[\d,]*\s*(vegetarian |veggie |coated |chewable |liquid |quick[- ]dissolve |rapid release |extra strength )?(capsules|softgels|caplets|gummies|tablets|lozenges|vcaps|chewables|liquid gels)\b|\b\d+\s*(mg|mcg|iu)\b.{0,60}\b(capsules|softgels|tablets|caplets|gummies)\b/i;
  /* A pill word on what is not a pill: a serum capsule, a dishwasher or
     cleaning tablet, a tablet computer, a bra "supplement" pad. */
  var NOT_PILL_RX = /\b(spf|sunscreen|relief sun|sun (?:creams?|serums?|essences?|sticks?|gels?|milks?|lotions?|balms?|fluids?)|sprays?|primer|coat|shoes?|sneakers?|dress(es)?|hoodies?|t-shirts?|tees?|s\/s|l\/s|shirts?|tanks?|necklaces?|charms?|lamps?|prints?|art|posters?|stickers?|decks?|wheels|heated|heating|massager|cordless|rechargeable|devices?|electric|serums?|ceramide|retinol|cream|moisturi[sz]\w*|lotion|cleans\w*|toner|essence|masks?|facial|eye (cream|gel|patch\w*)|lip|shampoo|conditioner|body wash|scrub|perfume|parfum|nail|dishwasher|detergent|toilet|cleaning|cleaner|denture|purification|chlorine|pool|bath bombs?|android|ipad|inch|\d+\s*gb|wi-?fi|screen|drawing|writing tablet|lcd|graphics|keyboard|stylus|bra|tank|shirt|tee|dog|cat|pet|horse|aquarium|fish food|plant food|fertili[sz]er|garden)\b/i;

  /* GROCERY: a food or drink word, on a title that is not a tool, a
     garment, a toy or a cosmetic named after one. */
  var FOOD_RX = /\b(snacks?|snacking|nuts|pistachios|cashews|almonds|pecans|walnuts|peanuts|macadamia|trail mix|popcorn|pretzels?|crackers?|cookies?|brownies?|muffins?|donuts?|donettes|cake balls|cakes?|pies?|bread|bagels?|tortillas?|tortilla chips|chips|fries|jerky|cereal|oats|oatmeal|granola|wafers|biscuits|waffles|pancake mix|maple syrup|honey|jam|peanut butter|nutella|ketchup|mustard|mayonnaise|salad dressing|salsa|seasoning|olive oil|cooking oil|vinegar|rice|pasta|noodles|ramen|soup|broth|flour|(cane|brown|powdered|granulated) sugar|coffee (beans|pods|k-cups?|creamer)|ground coffee|whole bean|instant coffee|instant latte|\d+\s*oz coffee|roast|k-cups?|tea bags|matcha|hot cocoa|hot chocolate|lemonade|juices?|bottled water|sparkling water|spring water|soda pop|sodas|energy drinks?|sports drinks?|drink mix|kombucha|creamer|(whole|powdered|toddler|cow|goat|chocolate|oat|almond|evaporated|condensed) milk|milk (drink|powder)|yogurt|cheese|chicken (wings|breasts?|thighs|nuggets|broth)|beef|pork|turkey breast|bacon|sausages?|salmon fillets?|shrimp|lobster|steaks?|seafood|raisins|dried fruit|fruit cups?|vegetables|ice cream|gelato|pizza|burritos?|tamales|dumplings|baby food|(infant|baby|toddler|gentlease|non-gmo) formula|toddler (drink|milk)|pouches|applesauce|apple sauce|smoothies?|puree|wine|chateau|cabernet|merlot|chardonnay|pinot noir|sauvignon|vanilla extract|beer|vodka|whiskey|tequila|sauces?|hot sauce|bbq sauce|barbecue sauce|food|gift basket|gift tower|box tower|(tower of|halloween|funhouse|krispies) treats|bev ?bombs|alfajores|fruit bites|oat melts|smoothie melts|hot fries|(granola|protein|snack|mini|candy|chocolate|cereal|ice cream) bars|frito[- ]lay|pepsi|coca-cola|gatorade|bodyarmor|enfamil|similac|enfagrow|nido)\b/i;
  /* ...and the evidence it is sold as food: a net weight, a count or a
     pack (grocery titles state them). */
  var FOOD_SIZE_RX = /\b\d[\d.,\/]*\s*(oz|ounces?|lbs?|pounds?|fl\.? ?oz|g|kg|ml|l|gallons?|gal|ct|count|servings?|meals|pack|pk|cans?|bottles?|bags?|boxes?|jars?|pouches|pieces|bars|packs|tins?)\b|\b(variety pack|\d+[- ]count|\d+[- ]pack|gift (basket|box|tin|tower)|tower of|assortment|servings)\b/i;
  /* (2026-11-03 pull wave: a Bath & Body Works «Black Cherry Merlot
     Wallflowers Refills 2-Pack» is a home-fragrance refill, Beauty of
     Joseon's «Relief Sun: Rice + Probiotics» a sunscreen.)
  /* What a food word names when the product is something else: a garment,
     a toy, a cosmetic, a candle, pet or garden goods, decor, media, a
     gadget. Always wins. */
  var HARD_NOT_FOOD_RX = /\b(wallflowers?|room sprays?|(?<!(formula|milk|cocoa|protein|collagen|drink) )powders?|lip ?stains?|balms?|gloss|plumping|mascara|eyeliner|bronzing|play-?doh|play food|ages \d|wooden|die-?cast|leapfrog|melissa (&|and) doug|hot wheels|reusable|silicone|feeders?|collectors?|cartridges?|toothpaste|nursing|bras?|tanks?|plastic|paper|(straw|water|chug|insulated|sports|feeding) bottles?|dipping cups|snack cups|snack-a-pillar|rambler|after ?shave|deodorant|desodorante|ducha|parfum|manteca|emulsion|ceramide|primer|tint|highlight|makers?|machines?|cookers?|fryers?|grinders?|blenders?|kettles?|shirts?|tees?|t-shirts?|hoodies?|sweatshirts?|sweaters?|pajamas?|socks?|costumes?|dress(es)?|leggings|shorts|jackets?|hats?|beanies?|shoes?|sneakers?|sandals?|slippers?|boots?|plush|plushies|toys?|lego|playsets?|play ?set|pretend|kitchen set|figures?|figurines?|dolls?|squishmallows?|funko|keychains?|enamel pins?|stickers?|posters?|books?|paperback|hardcover|candles?|wax melts?|scents?|scented|fragrances?|perfumes?|eau de|cologne|body (wash|spray|mist|butter|lotion|oil|scrub)|lotions?|shampoo|conditioner|soaps?|scrubs?|lip (balm|gloss|oil|mask|stick)|lipsticks?|masks?|serums?|(?<!ice )creams?|concealers?|foundations?|ampoules?|essences?|pads|wash|moisturi[sz]\w*|cleansers?|toners?|bath|shower|hair|skin|face|facial|nail|polish|makeup|eyeshadow|blush|bronzer|highlighter|palettes?|dog|dogs|cat|cats|pet|pets|puppy|kitten|bird|fish|aquarium|horse|chicken coop|garden|seeds|fertili[sz]er|planters?|wreaths?|garlands?|decor|decorations?|blankets?|throws?|pillows?|rugs?|curtains?|tablecloths?|gift card|e-?gift|wrap|ribbon|tissue paper|envelopes?|bouquets?|floral|flowers?|roses|stems?|arrangements?|vases?|plants?|board games?|games?|puzzles?|crayons|markers|electric|rechargeable|bluetooth|usb|batter(y|ies)|\d+\s*gb|camera|speakers?|headphones?|phone|tablet computer|laptop|watch|bracelets?|necklaces?|earrings?|jewelry|purses?|wallets?|wallpaper|paint|chalk|soap ?making|candle ?making|slime|bath bombs?|squish\w*|fidget|vinyl|cassette|dvd|blu-?ray|season \d|playstation|xbox|nintendo|switch|detergent|laundry|cleaner|dishwasher|pool|chlorine)\b/i;
  /* ...and a container, a tool or a pack word, which a strong grocery
     word or a candy brand outranks ("Mini Bags", "Kit Kat", "Ring Pop"). */
  var SOFT_NOT_FOOD_RX = /\b(pots?|pans?|trays?|molds?|cutters?|bowls?|plates?|platters?|mugs?|tumblers?|bottles? (holder|opener)|containers?|storage|dispensers?|scoops?|knives|knife|press|warmers?|coolers?|lunch ?box(es)?|lunch ?bags?|totes?|backpacks?|dish(es)?|glass(es|ware)?|pitchers?|carafes?|filters?|racks?|organizers?|bags?|(phone|carrying|storage|pencil|display) cases?|cases? for|kit\b|charms?|rings?|straws|picks|skewers|thermometers?|scales?|timers?|napkins?|cutlery|utensils?|towels?|aprons?|signs?|lights?|ornaments?|cards?|cookbooks?|recipe)\b/i;
  /* Grocery that a non-grocery shop lists without a size ("Hank Rub Seasoning"). */
  var NO_SIZE_FOOD_RX = /\b(seasoning|hot sauce|coffee creamer|superfood creamer|ground coffee)\b/i;
  var STRONG_FOOD_RX = /\b(infant formula|baby food|applesauce|apple sauce|pouches|trail mix|mixed nuts|potato chips|sports drinks?|energy drinks?|bottled water|frito[- ]lay|pepsi|coca-cola|gatorade|bodyarmor|alfajores|kind (mini|bars?)|candy bars?|chewing gum|bubble gum|gummi candy|chocolate candy|enfamil|similac|holle|little spoon|amara|nido|ice cream( bars)?|smoothie melts|yogurt smoothie|david'?s cookies|cookie (tray|decorating kit))\b/i;

  var CANDY_RX = /\b(candy|candies|candy bars?|chocolates?|truffles|gummi|gummy (bears|worms|candy|clusters)|gummies|chewing gum|bubble gum|gum\b|lollipops?|lollies|pops\b|mints\b|caramels?|toffee|licorice|jelly beans|marshmallows?|fudge|bonbons|fruit (snacks|chews|by the foot)|peppermint patties|candy canes?|buttermints)\b/i;
  var CANDY_BRAND_RX = /\b(m&m'?s|skittles|starburst|snickers|reese'?s|hershey'?s|kit ?kat|twix|haribo|nerds|airheads|sour patch|sour punch|sour strips|jolly rancher|tootsie|twizzlers|red vines|werther'?s|lindt|lindor|ferrero|godiva|ghirardelli|milky way|butterfinger|3 musketeers|almond joy|payday|york|life savers|hubba bubba|wrigley'?s|trident|dubble bubble|blow pops?|ring pops?|push pops|charms (mini|blow)|gushers|hi-chew|mamba|trolli|brach'?s|e\.frutti|mars minis|crunch candy)\b/i;

  /* THE BABY STORES' NON-PRODUCTS (#443, Danny's ruling on the moms
     «Alimentación» rail, 2026-11-03: "descaler liquid, detergent tablets,
     HEPA filters, spare/replacement parts, the cookbook, and everything
     like them" come off the catalogue). The moms catalogue's stores
     (scripts/lib/moms-truth.js retypes their real products) listed what
     a shopper does not buy as a product:
       repuesto     a spare or replacement part, a refill, a machine's
                    component (valves, tubing, flanges, chargers, mounts,
                    wheel sets, a warmer's adapter);
       limpieza     a cleaning consumable (detergent and descaling
                    tablets, descaler, dish soap, cleaner spray, wipes for
                    cleaning gear);
       publicacion  a book, a guide, a cookbook, a training course;
       servicio     a plan, a subscription, a donation, an embroidery;
       ajeno        what is no baby or mom product at all, pulled in by a
                    store's search (gaming and office chairs, wall art,
                    bumper magnets, slogan tees).
     Each is off sale only at these stores: a filter or a charger at Best
     Buy is a product. A part named inside a bundle or "with" a product
     ("Stroller and Car Seat Adapter", "Washer + Detergent Tablets") is
     the product's, and stays. Food the baby stores listed (lactation
     crisps, nausea candies, electrolyte solution, a hydration drink mix)
     is food: off sale everywhere, with the rest. */
  var BABY_STORES = ['babybrezza', 'bellybandit', 'dagnedover', 'drbrowns', 'elvie', 'freshlypicked', 'hatch', 'jujube',
    'kindredbravely', 'lillebaby', 'mockingbird', 'momcozy', 'munchkin', 'nanit', 'owlet', 'spectra', 'walmartbaby'];
  var PART_RX = /\b(replacement|replacements|refills?|spare parts?|washable parts bundle|duckbill valves?|valves?(?: set| kit)?|diaphragms?|tubing|backflow protector|pump seals|gaskets|cup fronts|connect kit|nipple inserts|breast shields|breast flange( set| single)?|air cap set|waist clip|pump bra adjusters|breast pump accessories|power (?:adapter|cable|cord)|adapter\/charger|vehicle adapter|charging cable|mounting kit|wall mount(?: elbow connector)?|floor stand(?: (?:long|short) segment)?|flex stand|signal booster|sensor module|additional fabric sock|accessories rack|breast pump rack|accessory bundle|lock latch|wheel set|crotch pad|shoulder pads set|harness with magnetic buckle|riding board strap|adapters?|toss™? bags|baking soda cartridge|deodorizer packs|trash bags for diaper pail|cleaning syringe|softshape™? silicone shield)\b/i;
  var CLEANING_RX = /\b(detergent tablets|descaling tablets|cleaning tablets|descaler|dish soap|cleaner spray|travel cleaning pack|pacifier wipes|pacifier & bottle healthy wipes)\b/i;
  var PUBLICATION_RX = /\b(cookbook|books?|feeding guide|oral feeding practice)\b|^just keep going$/i;
  var SERVICE_RX = /\b(insights plan|annual plan|round up your purchase|custom embroidery|tree seedling|gift cards?)\b/i;
  var STRAY_RX = /\b(gaming chairs?|gamer chairs?|game chairs?|office chairs?|computer chairs?|desk chairs?|wall art|print on wood|framed print|car magnet|child seat|advocate like a mother|dad-vocate)\b/i;
  /* A part or a consumable named after the product it comes with. */
  var WITH_PRODUCT_RX = /\b(with|bundle)\b|\s\+\s|[:：]|\b(strollers?|pails?|washers?|warmers?|sterilizers?|monitors?|cameras?|thermometers?|pumps?(?! (?:spout|seals|bra adjusters|breast shields|washable)))\b.*(?:\band\b|&)\s/i;
  var BABY_FOOD_RX = /\b(lactation crisps|nausea candies|hydration drink mix)\b/i;
  var BABY_MEDICINE_RX = /\belectrolyte solution\b/i;

  function babyStoreKind(t) {
    var m = PART_RX.exec(t);
    if (m && !WITH_PRODUCT_RX.test(t.slice(0, m.index))) return 'repuesto';
    m = CLEANING_RX.exec(t);
    if (m && !WITH_PRODUCT_RX.test(t.slice(0, m.index))) return 'limpieza';
    if (PUBLICATION_RX.test(t)) return 'publicacion';
    if (SERVICE_RX.test(t)) return 'servicio';
    if (STRAY_RX.test(t)) return 'ajeno';
    return '';
  }

  /* Where each kind is off sale ('*': every store). */
  var NOT_SOLD = { farmacia: '*', alimento: '*', dulce: ['costco'],
    repuesto: BABY_STORES, limpieza: BABY_STORES, publicacion: BABY_STORES, servicio: BABY_STORES, ajeno: BABY_STORES };

  /** What the title says the product is when Aria does not sell it:
      'farmacia' | 'alimento' | 'dulce' (everywhere / Costco), or, read
      for the baby stores only, 'repuesto' | 'limpieza' | 'publicacion' |
      'servicio' | 'ajeno'; '' when it is something Aria sells. */
  function notSoldKind(title, retailer) {
    var t = String(title || '');
    if (!t) return '';
    if (BABY_MEDICINE_RX.test(t)) return 'farmacia';
    if (BABY_FOOD_RX.test(t)) return 'alimento';
    if (retailer && BABY_STORES.indexOf(String(retailer).trim().toLowerCase()) !== -1) {
      var b = babyStoreKind(t);
      if (b) return b;
    }
    if ((OTC_RX.test(t) || MEDICINE_RX.test(t)) && !NOT_MEDICINE_RX.test(t) && !/\s\d\.\d{1,3}"?\s*$/.test(t)) return 'farmacia';
    if ((SUPPLEMENT_RX.test(t) || (DOSE_FORM_RX.test(t) && /\bvitamins?\b|\bsupplements?\b|\bgumm(y|ies)\b|\bcapsules\b|\bsoftgels\b|\bcaplets\b/i.test(t))) && !NOT_PILL_RX.test(t)) return 'farmacia';
    var strong = STRONG_FOOD_RX.test(t) || CANDY_BRAND_RX.test(t);
    if ((FOOD_SIZE_RX.test(t) || NO_SIZE_FOOD_RX.test(t) || /\bbox tower\b|\bgift (basket|box|tin|tower)\b/i.test(t)) && !HARD_NOT_FOOD_RX.test(t) && (strong || !SOFT_NOT_FOOD_RX.test(t))) {
      if (CANDY_RX.test(t) || CANDY_BRAND_RX.test(t)) return 'dulce';
      if (FOOD_RX.test(t)) return 'alimento';
    }
    return '';
  }
  /** True when the product's kind is off sale at its store. */
  function isNotSold(it) {
    if (!it || typeof it !== 'object') return false;
    var r = String(it.retailer || it.store || '').trim().toLowerCase();
    var k = notSoldKind(it.title || it.name || it.productName, r);
    if (!k) return false;
    var where = NOT_SOLD[k];
    if (where === '*') return true;
    return where.indexOf(r) !== -1;
  }

  root.AriaNotSold = Object.freeze({ notSoldKind: notSoldKind, isNotSold: isNotSold, NOT_SOLD: NOT_SOLD, BABY_STORES: BABY_STORES });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
