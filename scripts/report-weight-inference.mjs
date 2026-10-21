#!/usr/bin/env node
/* ==================================================================
   #449 SIBLING WEIGHT INFERENCE -- THE BUILDER AND ITS REPORT.

   Danny's ruling on #443 (Option 3), signed off on #449 (Lucifer,
   2026-10-20) with conditions: a cheap product that matches no weight
   row is weighed like its verified siblings -- same department, same
   kind of thing -- not at the 0.6 kg generic. This script computes the
   cluster weights the resolver prices with, and reports them.

   WHAT IT DOES
   1. Loads every catalogue the page loads (DEPT_CACHE_PARTS +
      CATALOGUE_FILES, merged per retailer and deduped exactly as the
      page does -- census-classification.mjs's loader and the page's own
      retailerItemsFor/notQuarantined/rawTitleOf).
   2. Resolves each product the way a cart line arrives: title, store,
      the customer price the card shows ((raw + tiered margin) x the
      store's sales-tax factor), the catalogue weight the card carries
      (weightKg / specWeightKg, minus the moms placeholder stamps), and
      NO department.
   3. No-match = no catalogue weight, and the resolver fell through (no
      row: source "department", "inferred" or "fallback").
   4. Department = the catalogue bucket the product sits in. Type = the
      first TYPE_RULES pattern its title matches (title nouns, English
      and Spanish), else "other".
   5. Siblings = the catalogue products (under $75) of the same
      department and type with a catalogue weight or a row weight, at
      most 20 kg, and inside the type's physical range (RANGES) when it
      has one: a sibling outside it is a row misfire (a 1.15 kg beaded
      row on earrings, the full-helmet row on a visor), not a weight to
      borrow.
   6. Cluster kg = sibling median x 1.10 with >= 5 siblings; else the
      department median x 1.10; else the catalogue median x 1.10. Pinned
      types (PINS) take their hand-checked figure. Every figure is held
      inside its type's range, and capped at 2 kg (pins excepted).
   7. WRITES the data the resolver prices with -- the same object to
      scripts/lib/inferred-weights-data.js (server, Node) and to
      assets/weight/inferred-weights.json (the app bundle) -- and the
      report, reports/weight-inference-449.md and .json.

   RUN: node scripts/report-weight-inference.mjs
   Re-run after the catalogues or the weight rows change; the weight
   tests pin representative clusters.
   ================================================================== */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pageHtml, liftDeclarations } from "./lib/page-lift.mjs";
import { loadClassifiers, loadCatalogue } from "./census-classification.mjs";
import { resolveCartWeights, specWeightKg, catalogWeightKg } from "../netlify/functions/_weight-resolve.js";
import { CONSERVATIVE_PRICE_USD, freightQuotable, inferredWeightKg, inferenceTitle, useInferredWeights } from "./lib/item-weight.js";
import { CHARGE_PER_KG } from "../weight-data.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const CUSHION = 1.10;
export const CAP_KG = 2;
export const MIN_SIBLINGS = 5;
export const SIBLING_MAX_KG = 10 * CAP_KG;
export const DATA_JSON = "assets/weight/inferred-weights.json";
export const DATA_MODULE = "scripts/lib/inferred-weights-data.js";

/* TITLE TYPES. Ordered: the first match wins, so the specific phrase
   ("skateboard wheels", "hot wheels") sits above the generic noun. Kept
   to plain nouns a reviewer can read; a type is only ever compared with
   siblings in its OWN department, so "case" in electronics and "case"
   in moms never share a pool. Matched against inferenceTitle(): lower
   case, accents folded. The catch-alls the sign-off flagged are split
   (kit/set, cover/guard, face mask/patch). */
export const TYPE_RULES = [
  ["gift card", /\b(e-?gift|digital gift|gift) cards?\b|\bgift box\b|\btarjeta de regalo\b/],
  ["diecast vehicle", /\bhot wheels\b|\bdie-?cast\b|\bmatchbox\b|\b1:64\b|\bcarritos?\b/],
  ["trading cards", /\btcg\b|\btrading cards?\b|\bbooster (packs?|box(es)?|bundles?)\b|\bcard lot\b|\bcartas\b|\bpokemon\b.*\bcards?\b|\bbattle deck\b/],
  ["skateboard wheels", /\bskate(board)?\s+wheels?\b|\bwheels?\b.*\b\d{2}\s?mm\b|\b\d{2}\s?mm\b.*\b\d{2,3}[ad]\b|\b\d{2,3}[ad]\b.*\b\d{2}\s?mm\b/],
  ["skateboard trucks", /\bskate(board)?\s+trucks?\b|\b(independent|thunder|venture|tensor|krux|ace)\b.*\btrucks?\b/],
  ["skate bearings", /\bbearings?\b/],
  ["skate hardware", /\bhardware\b|\brocketbolts\b|\bbolts\b|\baxle\b/],
  ["grip tape", /\bgrip\s?tape\b|\bgriptape\b/],
  ["surf traction pad", /\btraction\b|\btail pad\b|\bdeck grip\b|\bfcs\b.*\bgrip\b|\bclassic grip\b/],
  ["surf leash", /\bleash\b/],
  ["surf wax", /\bwax\b/],
  ["surf fins", /\bfins?\b/],
  ["skateboard deck", /\bdeck\b|\bskateboards?\b|\bcomplete skate/],
  ["sticker / decal", /\bstickers?\b|\bdecals?\b|\bcalcoman/],
  ["flag / banner", /\bbanners?\b|\bflags?\b|\bbanderas?\b/],
  ["mouse / keyboard", /\bkeyboard\b|\bgaming mouse\b|\bwireless mouse\b|\bmouse pad\b/],
  ["memory card", /\bmemory card\b|\bsd(hc|xc)\b|\bmicrosd|\bcompactflash\b|\bflash drive\b|\busb drive\b/],
  ["charger / cable", /\bcharg(er|ing)\b|\bcables?\b|\badapters?\b|\bcords?\b|\bpower bank\b|\bcargador\b/],
  ["controller", /\bcontrollers?\b|\bgamepad\b|\bjoystick\b|\bmando\b/],
  ["video game", /\b(standard|deluxe|digital|gold|ultimate) edition\b|\b(playstation|ps[45]|xbox|nintendo switch)\b/],
  ["batteries", /\bbatter(y|ies)\b|\bpilas\b/],
  ["tripod / mount", /\btripod\b|\bmount\b|\bclamp\b|\bball head\b|\bmagic arm\b|\bwall plate\b|\bcinepin\b/],
  ["speaker / audio", /\bspeakers?\b|\bearbuds?\b|\bheadphones?\b|\bearphones?\b|\baudifonos\b/],
  ["light bulb", /\bbulbs?\b|\bfocos?\b/],
  ["phone / device case", /\bphone case\b|\bcase for\b|\bslim case\b|\bscreen protector\b|\bfunda\b|\bshieldgrip\b/],
  ["razor / trimmer", /\brazors?\b|\btrimmer\b|\bshaver\b|\bclippers?\b|\bgroomer\b|\bblades?\b/],
  ["breast pump part", /\bflanges?\b|\bvalves?\b|\bmembranes?\b|\bduckbill\b|\bbreast ?shields?\b|\btubing\b|\bbackflow\b|\bspouts?\b|\bconnectors?\b/],
  ["breast pump", /\bbreast pumps?\b/],
  ["milk storage bags", /\bmilk (storage |collection )?bags?\b/],
  ["nursing pads", /\bnursing pads?\b|\bbreast pads?\b|\bnipple pads?\b/],
  ["baby bottle / nipple", /\bbaby bottles?\b|\bbottle nipples?\b|\bnipples?\b|\bteats?\b|\bbiberon\b|\bmamadera\b/],
  ["pacifier / teether", /\bpacifiers?\b|\bsoothers?\b|\bteeth(er|ing)\b|\bchupete\b|\bmordedor\b/],
  ["swaddle / blanket", /\bswaddles?\b|\bmuslin\b|\bblankets?\b|\bmantas?\b|\bfrazadas?\b/],
  ["bib", /\bbibs?\b|\bbaberos?\b/],
  ["toothbrush", /\btooth ?brush|\bcepillo de dientes\b/],
  ["lunch box", /\blunch ?box|\bbento\b|\blonchera\b/],
  ["water bottle / tumbler", /\b(water )?bottles?\b|\btumblers?\b|\bflasks?\b|\bbotellas?\b|\btermos?\b/],
  ["stabilizer / sway bar link", /\bstabilizer\b|\bsway bar\b|\bbar link\b|\bend link\b/],
  ["brake pads", /\bbrake pads?\b|\bbrake shoes?\b/],
  ["fluid / oil", /\bfluid\b|\bmotor oil\b|\bquart\b|\bcoolant\b|\bantifreeze\b|\blubricant\b|\bgrease\b/],
  ["filter", /\bfilters?\b|\bfiltro\b/],
  ["sensor / switch / relay", /\bsensors?\b|\brelay\b|\bsolenoid\b|\bstator\b|\bregulator\b|\bswitch\b/],
  ["exhaust part", /\bexhaust\b|\bmuffler\b|\bheader\b/],
  ["helmet part", /\bcheek pads?\b|\bchin strap|\bvisors?\b|\bface ?shields?\b|\bhelmet (liner|pads?|parts?|lens|vents?|shields?)\b|\bfor\b.*\bhelmets?\b/],
  ["helmet", /\bhelmets?\b|\bcascos?\b/],
  ["mouth guard", /\bmouth ?guards?\b|\bmouthguards?\b|\bprotector bucal\b/],
  ["shin / body guard", /\b(shin|chest|groin|cup|arm|elbow|knee|body|rib|hand) ?guards?\b|\bespinilleras?\b/],
  ["cover", /\bcovers?\b/],
  ["guard (other)", /\bguard\b(?!.*rash)/],
  ["grips", /\bgrips?\b/],
  ["cufflinks", /\bcufflinks?\b/],
  ["keychain / lanyard", /\bkey ?chains?\b|\bkey ?rings?\b|\blanyard\b|\bllaveros?\b/],
  ["bracelet", /\bbracelets?\b|\bbangles?\b|\banklets?\b|\bpulseras?\b/],
  ["necklace", /\bnecklaces?\b|\bpendants?\b(?!\s*(lights?|lamps?))|\bchokers?\b|\blockets?\b|\bcollares?\b/],
  ["earrings", /\bearrings?\b|\bstuds?\b(?!\s*finder)|\bhoops?\b(?!.*\b(basketball|hula|embroidery|net|game)\b)|\baretes\b|\bpendientes\b/],
  ["charm", /\bcharms?\b|\bdijes?\b/],
  ["ring", /\brings?\b(?!\s*lights?)|\banillos?\b/],
  ["hair accessory", /\bclaw clip\b|\bhair clip\b|\bclips?\b|\bscrunchies?\b|\bhair ties?\b|\bbarrettes?\b|\bheadbands?\b|\bbows?\b/],
  ["sunglasses", /\bsunglasses\b|\bpolarized\b|\bgafas\b|\blentes de sol\b/],
  ["bra / bralette", /\bbras?\b|\bbralettes?\b|\bbrasier\b|\bsujetador\b/],
  ["underwear", /\bthongs?\b|\bhipsters?\b|\bbriefs?\b|\bboxers?\b|\bpant(y|ies)\b|\bunderwear\b|\bboy ?shorts?\b|\bcheeky\b|\btanga\b|\bcalzon/],
  ["socks", /\bsocks?\b|\bcalcetines\b|\bmedias\b/],
  ["boardshorts / swim trunks", /\bboard ?shorts?\b|\bswim trunks?\b|\bvolley\b/],
  ["rash guard", /\brash ?guards?\b/],
  ["swimsuit", /\bswim|\bbikini|\bone[- ]piece\b|\bbandeau\b|\btankini\b|\bbano\b/],
  ["gi / kimono", /\bgi\b|\bkimono\b|\bspats\b|\bsinglet\b/],
  ["jersey", /\bjerseys?\b|\bname set\b/],
  ["beanie / balaclava", /\bbeanies?\b|\bbalaclava\b|\bgorros?\b/],
  ["hat / cap", /\bhats?\b|\bcaps?\b|\bsnapback\b|\btrucker\b|\bvisor\b|\bgorras?\b/],
  ["gloves", /\bgloves?\b|\bguantes\b|\bhand wraps?\b/],
  ["backpack", /\bbackpacks?\b|\bmochilas?\b/],
  ["bag / pouch / wallet", /\btotes?\b|\bcrossbody\b|\bpurses?\b|\bhandbags?\b|\bclutch\b|\bbags?\b|\bpouch\b|\bwallets?\b|\bcard (case|holder)\b|\bcarteras?\b|\bbolsos?\b/],
  ["hoodie / sweatshirt", /\bhood(ie|y)s?\b|\bsweatshirts?\b|\bcrew ?necks?\b|\bpullovers?\b|\bsweaters?\b|\bcardi(gan)?s?\b|\bfleece\b|\bpoleron\b/],
  ["jacket / vest", /\bjackets?\b|\bcoats?\b|\bparkas?\b|\bvests?\b|\bwindbreaker\b|\bchaquetas?\b|\bcasacas?\b/],
  ["tank / cami", /\btanks?\b|\bcamis?\b|\bcamisoles?\b/],
  ["t-shirt", /\bt-?shirts?\b|\btees?\b|\bcamisetas?\b|\bpolos?\b/],
  ["shirt / top", /\bshirts?\b|\bwoven\b|\bflannels?\b|\bhenleys?\b|\bblouses?\b|\blong ?sleeves?\b|\bl\/s\b|\bs\/s\b|\btops?\b|\btunics?\b|\bcamisas?\b|\bblusas?\b/],
  ["shorts / skort", /\bshorts?\b|\bwalkshorts?\b|\bskorts?\b/],
  ["pants / leggings", /\bpants?\b|\bleggings?\b|\bsweatpants?\b|\bjoggers?\b|\bjeans?\b|\btrousers\b|\btights\b|\bpantalon/],
  ["costume", /\bcostumes?\b|\bdisfraz\b|\bdisfraces\b/],
  ["dress / skirt", /\bdress(es)?\b|\bvestidos?\b|\bskirts?\b|\bfaldas?\b|\bgowns?\b|\bnightgowns?\b/],
  ["sleep / lounge set", /\bpajamas?\b|\bpyjamas?\b|\blounge\b|\bonesies?\b|\bbodysuits?\b|\brompers?\b|\bjumpsuits?\b|\bpijamas?\b/],
  ["belt", /\bbelts?\b|\bcinturon/],
  ["plush", /\bplush\b|\bpeluches?\b|\bstuffed\b|\bsquishmallows?\b/],
  ["action figure / collectible figure", /\bfigur|\bfunko\b|\bbobblehead\b|\bvinyl\b|\bminifig/],
  ["doll", /\bdolls?\b|\bmunecas?\b/],
  ["puzzle", /\bpuzzles?\b|\brompecabezas\b|\bjigsaw\b/],
  ["building set", /\blego\b|\bbuilding (sets?|blocks?|kits?|bricks?|toys?)\b|\bbloques\b|\bmega bloks\b|\bmagna-?tiles\b|\bbricks\b/],
  ["blaster / darts", /\bnerf\b|\bblasters?\b|\bdarts?\b/],
  ["dough / slime / clay", /\bplay-?doh\b|\bslime\b|\bclay\b|\bdough\b|\bplastilina\b|\bkinetic sand\b/],
  ["bubbles", /\bbubbles?\b|\bburbujas\b/],
  ["playset", /\bplay ?sets?\b|\bset de juego\b/],
  ["toy vehicle", /\bvehicles?\b|\btrucks?\b|\bcars?\b|\bcamion(es|cito)?\b|\bcoches?\b|\btrains?\b|\btren\b|\bracers?\b|\bvehiculos?\b/],
  ["miniature / dollhouse kit", /\bminiature\b|\bdollhouse\b|\bdoll house\b/],
  ["craft / art kit", /\bcrafts?\b|\bart (set|kit)\b|\bpaint|\bcrayons?\b|\bmarkers?\b|\bcoloring\b|\bdiy\b/],
  ["board / card game", /\bgames?\b|\bjuegos?\b/],
  ["ball", /\bballs?\b|\bpelotas?\b|\bbalon(es)?\b/],
  ["candle holder", /\bcandle ?holders?\b|\bcandelabra\b|\bcandlesticks?\b|\bcandelabros?\b/],
  ["picture frame", /\bframes?\b|\bmarcos?\b/],
  ["wall decal", /\bwall (decal|sticker)s?\b|\bpeel and stick\b/],
  ["wall art / sign", /\bwall art\b|\bcanvas\b|\bprints?\b|\bposters?\b|\bsigns?\b|\bletreros?\b|\bcuadros?\b/],
  ["artificial plant / floral", /\bartificial\b|\bfaux\b|\barrangement\b|\bplants?\b|\bflowers?\b|\bwreath\b|\bgarland\b|\bfloral stem\b|\bplantas?\b/],
  ["vase", /\bvases?\b|\bjarron/],
  ["tray", /\btrays?\b|\bbandejas?\b/],
  ["storage basket / bin", /\bbaskets?\b|\bbins?\b|\bstorage\b|\borganizers?\b|\bcaddy\b|\bcanastas?\b/],
  ["ornament / figurine / decor", /\bornaments?\b|\bfigurines?\b|\bsculptures?\b|\bstatues?\b|\bdecor\b|\bpumpkins?\b/],
  ["pillow / cushion", /\bpillows?\b|\bcushions?\b|\bcojin/],
  ["rug / mat", /\brugs?\b|\bmats?\b|\bdoormat\b|\btapetes?\b|\balfombras?\b/],
  ["lights / lamp", /\blights?\b|\blamps?\b|\blanterns?\b|\bled\b|\bluces\b|\blamparas?\b/],
  ["kitchen utensil / gadget", /\butensils?\b|\bspatulas?\b|\bwhisk\b|\btongs\b|\bpeeler\b|\bgadgets?\b|\bladles?\b|\bknife\b|\bknives\b|\bmitts?\b|\btrivets?\b/],
  ["cookware", /\bskillets?\b|\bfrying pan\b|\bsaucepan\b|\bcookware\b|\bdutch oven\b|\bsarten/],
  ["napkins / tablecover / coasters", /\bnapkins?\b|\bservilletas?\b|\btable ?covers?\b|\btablecloths?\b|\bplacemats?\b|\brunners?\b|\bcoasters?\b/],
  ["plates / bowls / cups", /\bplates?\b|\bbowls?\b|\bmugs?\b|\bcups?\b|\bglass(es)?\b|\bdinnerware\b|\bplatos?\b|\bvasos?\b|\btazas?\b|\bstraws?\b|\bspoons?\b/],
  ["towel", /\btowels?\b|\btoallas?\b/],
  ["balloons", /\bballoons?\b|\bglobos?\b/],
  ["party favors", /\bfavors?\b|\bgoodie\b|\bloot\b|\bpinatas?\b/],
  ["party decorations", /\bdecorations?\b|\bbackdrops?\b|\bconfetti\b|\bstreamers?\b|\bcenterpieces?\b|\bcake toppers?\b/],
  ["sunscreen", /\bspf\b|\bsunscreen\b|\bsun stick\b|\bbloqueador\b|\bprotector solar\b/],
  ["snorkel / dive mask", /\b(snorkel|snorkeling|dive|diving|scuba|swim|freedive|free dive|spearfishing) masks?\b|\bmasks? (and|&) snorkel/],
  ["skincare mask / patch", /\b(sheet|clay|mud|peel-?off|sleeping|overnight|hydrating|lip|eye|under-?eye|hydrogel|collagen|charcoal|facial|face) masks?\b|\bmask packs?\b|\b(pimple|acne|blemish|hydrocolloid|eye|under-?eye|nose|lip) patch(es)?\b|\bmascarillas?\b/],
  ["mask (other)", /\bmasks?\b/],
  ["patch", /\bpatch(es)?\b/],
  ["shampoo / hair care", /\bshampoo\b|\bconditioner\b|\bhair (oil|serum|treatment|mask)\b|\bcurl\b/],
  ["serum / essence / toner", /\bserums?\b|\bessences?\b|\btoners?\b|\bampoules?\b|\btonic\b/],
  ["cleanser", /\bcleans(er|ing)\b|\bfoam\b|\bface wash\b|\bmicellar\b/],
  ["cream / lotion / balm", /\bcreams?\b|\bcremas?\b|\bmoisturi[sz]|\blotions?\b|\bbalms?\b|\bbutter\b|\bgel\b/],
  ["lip product", /\blips?\b|\blabial/],
  ["eye makeup", /\bmascara\b|\beyeliner\b|\bbrows?\b|\beyeshadow\b|\blash(es)?\b|\bpestanas\b/],
  ["face makeup", /\bfoundation\b|\bconcealer\b|\bpowder\b|\bblush\b|\bbronzer\b|\bhighlighter\b|\bprimer\b|\bpalette\b/],
  ["nail product", /\bnails?\b|\bpolish\b|\besmalte\b|\bunas\b/],
  ["body scrub / wash / soap", /\bscrub\b|\bbody wash\b|\bsoaps?\b|\bjabon\b|\bbath\b/],
  ["mist / fragrance", /\bmists?\b|\bperfumes?\b|\bfragrance\b|\bbody spray\b|\bcologne\b|\bspray\b/],
  ["beauty tool / brush", /\bbrush(es)?\b|\bsponges?\b|\bapplicators?\b|\btweezers?\b|\bcurlers?\b|\bcombs?\b/],
  ["book", /\bbooks?\b|\blibros?\b|\bnovel\b|\bhardcover\b|\bpaperback\b/],
  ["strap / carrier", /\bstraps?\b|\bcarriers?\b|\bharness\b|\briding board\b/],
  ["resistance band / jump rope", /\bresistance\b|\bbands?\b|\bjump ropes?\b|\bropes?\b/],
  ["pads / guards", /\bpads?\b|\bguards?\b|\bprotectors?\b|\bespinilleras?\b/],
  ["gift / sampler set", /\bgift sets?\b|\bsampler\b|\bdiscovery sets?\b|\btrio\b|\bduo\b|\bmini sets?\b|\btravel sets?\b|\bcoffret\b/],
  ["tool / repair kit", /\btool ?(kits?|sets?)\b|\brepair kits?\b|\brebuild kits?\b|\binstall(ation)? kits?\b|\bservice kits?\b|\bgasket (kits?|sets?)\b|\bhardware kits?\b/],
  ["replacement / accessory pack", /\breplacement\b|\baccessor(y|ies) (kits?|sets?|packs?)\b|\brefills?\b|\bspare\b/],
  ["multi-pack", /\b\d+[- ]?(pack|pk|count|ct)\b|\bpack of \d+\b/],
  ["kit / set (other)", /\bkits?\b|\bsets?\b|\bpacks?\b|\bpk\b|\bbundle\b/],
];

/* PHYSICAL SANITY: what a parcel of each type can plausibly weigh, in kg.
   A sibling outside its type's range is a row misfire and does not join
   the pool; an assigned figure (cluster, department or catalogue median)
   is moved into the range. Types with no entry are bounded only by the
   2 kg cap. Reasoned from the catalogue's own published weights and the
   item class, generous on both ends. */
export const RANGES = {
  "gift card": [0.01, 0.2], "diecast vehicle": [0.03, 1.2], "trading cards": [0.01, 1.2],
  "skateboard wheels": [0.15, 0.8], "skateboard trucks": [0.3, 1.5], "skate bearings": [0.03, 0.3],
  "skate hardware": [0.02, 0.3], "grip tape": [0.05, 0.5], "surf traction pad": [0.1, 0.6],
  "surf leash": [0.1, 0.6], "surf wax": [0.05, 0.4], "surf fins": [0.1, 1.2], "sticker / decal": [0.01, 0.3],
  "memory card": [0.01, 0.2], "charger / cable": [0.03, 1.2], "light bulb": [0.03, 0.8],
  "phone / device case": [0.03, 0.5], "razor / trimmer": [0.03, 1.2], "breast pump part": [0.02, 0.3], "breast pump": [0.2, 2.5],
  "milk storage bags": [0.05, 1], "nursing pads": [0.03, 0.5], "baby bottle / nipple": [0.03, 0.8],
  "pacifier / teether": [0.02, 0.3], "swaddle / blanket": [0.1, 1.5], "bib": [0.03, 0.4], "toothbrush": [0.02, 0.3],
  "helmet part": [0.05, 0.6], "mouth guard": [0.03, 0.3], "cufflinks": [0.03, 0.3], "keychain / lanyard": [0.01, 0.25],
  "bracelet": [0.01, 0.3], "necklace": [0.01, 0.3], "earrings": [0.01, 0.2], "charm": [0.01, 0.15], "ring": [0.01, 0.2],
  "hair accessory": [0.01, 0.4], "sunglasses": [0.03, 0.4], "bra / bralette": [0.05, 0.5], "underwear": [0.02, 0.4],
  "socks": [0.03, 0.6], "boardshorts / swim trunks": [0.1, 0.6], "rash guard": [0.1, 0.5], "swimsuit": [0.05, 0.6],
  "beanie / balaclava": [0.05, 0.4], "hat / cap": [0.05, 0.5], "gloves": [0.05, 1.2], "t-shirt": [0.1, 0.6],
  "tank / cami": [0.05, 0.5], "plush": [0.05, 2], "action figure / collectible figure": [0.05, 1.5],
  "doll": [0.1, 2], "puzzle": [0.1, 2], "blaster / darts": [0.05, 2], "dough / slime / clay": [0.05, 2], "bubbles": [0.05, 2],
  "ball": [0.05, 1], "storage basket / bin": [0.15, 3], "ornament / figurine / decor": [0.05, 1.5],
  "balloons": [0.01, 1], "party favors": [0.01, 1], "sunscreen": [0.03, 0.6], "skincare mask / patch": [0.01, 0.5],
  "lip product": [0.01, 0.3], "patch": [0.01, 0.3], "snorkel / dive mask": [0.1, 1.2], "eye makeup": [0.01, 0.3], "face makeup": [0.01, 0.6], "nail product": [0.01, 0.5],
};

/* PINNED TYPES: hand-checked weights the sign-off asked for, ahead of
   any pool. `types` pins a title type; `match` (+ `dept`) pins a phrase.
   `steps` refine by size: the first pattern that matches wins. Dirt-bike
   tyres are real weights of 3-6 kg, so they may exceed the 2 kg cap. */
export const PINS = [
  { key: "trading cards", types: ["trading cards"], kg: 0.05,
    steps: [["\\b(booster box(es)?|elite trainer|collection box|display|tins?|bundle|premium collection|gift box)\\b", 0.45]] },
  { key: "jewelry", types: ["earrings", "necklace", "bracelet", "charm", "ring"], kg: 0.05 },
  { key: "surf leash / traction pad / rash guard", types: ["surf leash", "surf traction pad", "rash guard"], kg: 0.3 },
  { key: "dirt-bike tire", dept: "motos",
    match: "\\b(tires?|tyres?|llantas?)\\b(?!.*\\b(tubes?|levers?|irons?|gauges?|pressure|warmers?|changers?|repair|plugs?|valves?|balancers?|stands?|spoons?|patch|sealant|chains?|covers?|bags?|racks?|t-?shirts?|stickers?)\\b)",
    kg: 5,
    steps: [
      ["\\b\\d{2,3}\\/\\d{2,3}[- ]?(zr|r)?\\s?(8|10|12)\\b|\\b\\d\\.\\d{2}-(8|10|12)\\b", 2.5],
      ["\\b(scooter|moped|mini|kids|pit ?bike)\\b|\\b\\d{2,3}\\/\\d{2,3}[- ]?(zr|r)?\\s?1[34]\\b|\\b\\d\\.\\d{2}-1[34]\\b", 3],
      ["\\b[2-3]\\.\\d{2}-(1[6-9]|2[01])\\b|\\b([6-9]\\d|10\\d)\\/\\d{2,3}[- ]?(zr|r)?\\s?(19|2[01])\\b|\\bfront\\b", 4],
      ["\\b(1[1-9]\\d|[2-3]\\d\\d)\\/\\d{2,3}[- ]?(zr|r)?\\s?1[5-9]\\b|\\b[4-5]\\.\\d{2}-1[6-9]\\b|\\brear\\b", 6],
    ] },
];

/* skate_snow's leftovers (wheels, pads...) take sporting goods' pool for
   the same type when their own is too thin: the department's weighted
   products are mostly complete skateboards. */
export const POOL_ALIASES = { skate_snow: "sporting_goods" };

export function typeOf(title) {
  const t = inferenceTitle(title);
  for (const [key, re] of TYPE_RULES) if (re.test(t)) return key;
  return "other";
}

const round2 = (n) => Math.round(n * 100) / 100;
function median(arr) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const inRange = (type, kg) => { const r = RANGES[type]; return !r || (kg >= r[0] && kg <= r[1]); };
const clampRange = (type, kg) => { const r = RANGES[type]; return r ? Math.min(r[1], Math.max(r[0], kg)) : kg; };

/* ------------------------------------------------------------------ */
export function loadProducts() {
  const html = pageHtml(ROOT);
  const P = loadClassifiers(html);
  const T = liftDeclarations(html, ["SALES_TAX_RATE", "TAX_EXEMPT_STATUS", "salesTaxRateFor", "round2", "tieredMarginUsd",
    "ABSURD_PRICE_RAW_USD", "ABSURD_PRICE_EXEMPT", "ABSURD_LUXURY_RETAILERS", "ABSURD_TYPE_CEILINGS", "absurdCeilingUsd"]);
  const customerPrice = (raw, rk) => T.round2((raw + T.tieredMarginUsd(raw)) * T.salesTaxRateFor(rk));
  const absurd = (raw, rk, title) => raw > T.absurdCeilingUsd(rk, title)
    || (raw > T.ABSURD_PRICE_RAW_USD && !T.ABSURD_PRICE_EXEMPT.has(rk) && !T.ABSURD_LUXURY_RETAILERS.has(rk));
  const { retailers, missing } = loadCatalogue(P);
  if (missing.length) console.warn("missing catalogue files:", missing.join(", "));
  const products = [];
  for (const [rk, r] of Object.entries(retailers)) {
    const seen = new Set();
    for (const [dept, bucket] of Object.entries(r.departments || {})) {
      for (const raw of bucket?.items || []) {
        if (!P.notQuarantined(raw)) continue;
        const dedupe = P.rawTitleOf(raw) + "::" + (raw.price ?? raw.effectivePrice ?? "");
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const title = P.rawTitleOf(raw);
        const rawPrice = Number(raw.price ?? raw.effectivePrice);
        if (!title || !(rawPrice > 0) || absurd(rawPrice, rk, title)) continue;
        products.push({ rk, dept, title, raw, price: customerPrice(rawPrice, rk) });
      }
    }
  }
  return products;
}

/* The catalogue weight a cart line carries (#452's method, unchanged):
   a supplier `specWeightKg` the resolver reads as a catalogue weight,
   minus the moms placeholder stamps (catalogWeightKg() drops those). */
export function lineCatalog(p) {
  const kg = Number(p.raw.specWeightKg);
  if (!(kg > 0)) return null;
  return catalogWeightKg({ specWeightKg: kg, retailer: p.rk, title: p.title, priceUsd: p.price });
}

/** One product as checkout resolves it. */
export function resolveProduct(p) {
  const cat = lineCatalog(p);
  const line = { title: p.title, retailer: p.rk, priceUsd: p.price, qty: 1, ...(cat ? { specWeightKg: cat.kg } : {}) };
  return resolveCartWeights([line]).items[0];
}

const NOMATCH = new Set(["department", "fallback", "inferred"]);

export function build(products) {
  for (const p of products) {
    const r = resolveProduct(p);
    const cat = lineCatalog(p);
    const spec = specWeightKg(p.raw);
    p.source = r.source;
    p.kg = r.weightKg;
    p.held = !!r.needsReview;
    p.real = spec ? spec.kg : cat ? cat.kg : null;
    p.noMatch = p.real == null && NOMATCH.has(r.source);
    p.ruleMatched = !NOMATCH.has(r.source) && !(r.source === "beauty" && /sin fila/.test(r.basis || ""));
    p.type = typeOf(p.title);
    const weighed = p.real != null ? p.real : p.ruleMatched ? r.weightKg : null;
    p.siblingKg = null;
    if (weighed != null && p.price < CONSERVATIVE_PRICE_USD) {
      if (weighed > SIBLING_MAX_KG) p.misfire = weighed;
      else if (!inRange(p.type, weighed)) p.outOfRange = weighed;
      else p.siblingKg = weighed;
    }
  }

  const pool = new Map(), deptPool = new Map(), typePool = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const p of products) {
    if (p.siblingKg == null) continue;
    push(pool, p.dept + "\u0000" + p.type, p.siblingKg);
    push(typePool, p.type, p.siblingKg);
    push(deptPool, p.dept, p.siblingKg);
  }
  const catalogMedian = median([].concat(...deptPool.values()));
  const catalogKg = round2(catalogMedian * CUSHION);

  const depts = {};
  for (const [d, arr] of deptPool) if (arr.length >= MIN_SIBLINGS) depts[d] = round2(median(arr) * CUSHION);

  /* Cluster weights: every (department, type) pool of 5+ siblings, then
     the aliased department's pool for a thin one. */
  const clusters = {};
  const clusterInfo = new Map();
  for (const [k, arr] of pool) {
    if (arr.length < MIN_SIBLINGS) continue;
    const [d, t] = k.split("\u0000");
    if (t === "other") continue;
    const kg = round2(clampRange(t, median(arr) * CUSHION));
    (clusters[d] ||= {})[t] = kg;
    clusterInfo.set(k, { siblings: arr.length, siblingMedianKg: round2(median(arr)), via: null });
  }
  for (const [d, alias] of Object.entries(POOL_ALIASES)) {
    /* Its leftovers too: the department median of complete skateboards
       would price a pad or a lotion at 3.7 kg. */
    if (depts[alias] != null) depts[d] = depts[alias];
    for (const [t, kg] of Object.entries(clusters[alias] || {})) {
      if (clusters[d] && clusters[d][t] != null) continue;
      (clusters[d] ||= {})[t] = kg;
      clusterInfo.set(d + "\u0000" + t, { ...clusterInfo.get(alias + "\u0000" + t), via: alias });
    }
  }

  const ranges = { ...RANGES };
  const pins = PINS.map((p) => ({ key: p.key, ...(p.types ? { types: p.types } : {}), ...(p.match ? { match: p.match } : {}),
    ...(p.dept ? { dept: p.dept } : {}), kg: p.kg, ...(p.steps ? { steps: p.steps } : {}) }));

  /* What the product's OWN department and type would get: the reference
     the store mapping below is measured against. */
  const data0 = { underUsd: CONSERVATIVE_PRICE_USD, capKg: CAP_KG, types: TYPE_RULES.map(([k, re]) => [k, re.source]),
    pins, ranges, clusters, depts, catalog: catalogKg, stores: {} };
  const ownKg = (p) => inferredWeightKg(p.title, { retailer: "__own__", priceUsd: p.price },
    { ...data0, stores: { __own__: [p.dept, {}] } });

  /* STORES -> DEPARTMENT. A cart line names its store, not its bucket.
     Each store maps to the department most of its products sit in, with
     a per-type exception where that store's products of the type mostly
     sit elsewhere AND the exception changes the answer. */
  /* Counted over the products inference serves (no-match, under $75)
     where the store has any, else over everything the store sells. */
  const byStore = new Map();
  const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const incT = (m, t, d) => { if (!m.has(t)) m.set(t, new Map()); inc(m.get(t), d); };
  for (const p of products) {
    if (!byStore.has(p.rk)) byStore.set(p.rk, { depts: new Map(), types: new Map(), servedDepts: new Map(), servedTypes: new Map() });
    const s = byStore.get(p.rk);
    inc(s.depts, p.dept); incT(s.types, p.type, p.dept);
    if (p.noMatch && p.price < CONSERVATIVE_PRICE_USD) { inc(s.servedDepts, p.dept); incT(s.servedTypes, p.type, p.dept); }
  }
  const argmax = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const stores = {};
  for (const [rk, s] of [...byStore].sort((a, b) => a[0].localeCompare(b[0]))) {
    const main = argmax(s.servedDepts.size ? s.servedDepts : s.depts);
    const ex = {};
    for (const t of [...s.types.keys()].sort()) {
      const tm = s.servedTypes.get(t) || s.types.get(t);
      const d = argmax(tm);
      if (d === main) continue;
      /* Worth a line of data only when it moves the answer. */
      const probe = (dd) => inferredWeightKg("", { retailer: "x", priceUsd: 1 }, { ...data0, types: [[t, "^"]], stores: { x: [dd, {}] } });
      const a = probe(d), b = probe(main);
      if (a && b && Math.abs(a.kg - b.kg) >= 0.01) ex[t] = d;
    }
    stores[rk] = Object.keys(ex).length ? [main, ex] : [main];
  }

  const data = { issue: 449, generatedBy: "scripts/report-weight-inference.mjs", ...data0, stores };
  return { data, clusterInfo, deptPool, typePool, catalogMedian, ownKg };
}

/* ------------------------------------------------------------------ */
function compactJson(obj) {
  const lines = ["{"];
  const keys = Object.keys(obj);
  keys.forEach((k, i) => {
    const v = obj[k];
    const tail = i < keys.length - 1 ? "," : "";
    if (Array.isArray(v)) lines.push(`  ${JSON.stringify(k)}: [\n${v.map((x) => "    " + JSON.stringify(x)).join(",\n")}\n  ]${tail}`);
    else if (v && typeof v === "object" && Object.keys(v).length && Object.values(v).every((x) => x && typeof x === "object"))
      lines.push(`  ${JSON.stringify(k)}: {\n${Object.entries(v).map(([a, b]) => `    ${JSON.stringify(a)}: ${JSON.stringify(b)}`).join(",\n")}\n  }${tail}`);
    else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${tail}`);
  });
  lines.push("}");
  return lines.join("\n") + "\n";
}

/* The signed-off table (#452's report, Lucifer 2026-10-20) is the
   baseline the deltas are measured against. The first run reads it from
   the report JSON it replaces; every run carries it forward. */
function signedOffBaseline() {
  const p = ROOT + "reports/weight-inference-449.json";
  if (!existsSync(p)) return null;
  const j = JSON.parse(readFileSync(p, "utf8"));
  if (j.signedOff) return j.signedOff;
  if (j.pricingChange !== false) return null;
  return {
    source: "#452 report (signed off on #449, 2026-10-20)",
    buckets: j.buckets,
    clusters: Object.fromEntries(j.clusters.map((c) => [c.dept + "|" + c.type, c.assignedKg ?? c.wouldKg])),
    clusterN: Object.fromEntries(j.clusters.map((c) => [c.dept + "|" + c.type, c.n])),
    depts: Object.fromEntries(Object.entries(j.departmentMedians).map(([d, v]) => [d, round2(v.medianKg * CUSHION)])),
    catalog: round2(j.catalogueMedianKg * CUSHION),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

function main() {
  const baseline = signedOffBaseline();
  /* Pools and the "before" state are read with inference OFF, so a
     re-run never borrows from its own previous output. */
  useInferredWeights(null);
  const products = loadProducts();
  const B = build(products);

  /* Write the data first, then re-resolve every product with it: the
     report shows what the resolver now quotes, not a projection. */
  mkdirSync(ROOT + "assets/weight", { recursive: true });
  const dataJson = JSON.stringify(B.data);
  writeFileSync(ROOT + DATA_JSON, dataJson + "\n");
  writeFileSync(ROOT + DATA_MODULE, "/* GENERATED by scripts/report-weight-inference.mjs -- do not edit.\n   The same object as assets/weight/inferred-weights.json (the app bundle\n   fetches that one); the weight tests assert they match. */\nexport default " + dataJson + ";\n");
  useInferredWeights(B.data);

  const cheap = products.filter((p) => p.noMatch && p.price < CONSERVATIVE_PRICE_USD);
  const guard = products.filter((p) => p.noMatch && p.price >= CONSERVATIVE_PRICE_USD);
  const bucket = { pinned: 0, sibling: 0, deptMedian: 0, catalogMedian: 0 };
  const bucketHeld = { pinned: 0, sibling: 0, deptMedian: 0, catalogMedian: 0 };
  let capped = 0, aboveCapPinned = 0, stillAbovePrice = 0, mismatch = 0, heldAfter = 0;
  const clusters = new Map();
  const overCap = [];
  const bkey = { pinned: "pinned", sibling: "sibling", "dept-median": "deptMedian", "catalog-median": "catalogMedian" };
  for (const p of cheap) {
    const inf = inferredWeightKg(p.title, { retailer: p.rk, priceUsd: p.price }, B.data);
    const own = B.ownKg(p);
    const r = resolveProduct(p);
    p.after = r;
    if (r.needsReview) heldAfter++;
    if (own && Math.abs(own.kg - inf.kg) > 0.005) mismatch++;
    const b = bkey[inf.basis];
    bucket[b]++; if (p.held) bucketHeld[b]++;
    if (inf.capped) { capped++; overCap.push({ title: p.title, store: p.rk, priceUsd: p.price, dept: p.dept, type: p.type, kg: inf.kg }); }
    if (inf.basis === "pinned" && inf.kg > CAP_KG) aboveCapPinned++;
    if (freightQuotable({ kg: r.weightKg, source: "fallback" }, p.price, CHARGE_PER_KG).quotable === false) stillAbovePrice++;
    const k = p.dept + "|" + p.type;
    if (!clusters.has(k)) clusters.set(k, { dept: p.dept, type: p.type, n: 0, held: 0, kgs: new Map(), bases: new Map(), examples: [] });
    const c = clusters.get(k);
    c.n++; if (p.held) c.held++;
    c.kgs.set(r.weightKg, (c.kgs.get(r.weightKg) || 0) + 1);
    c.bases.set(inf.basis, (c.bases.get(inf.basis) || 0) + 1);
    if (c.examples.length < 2) c.examples.push(p.title);
  }
  const modal = (m) => [...m].sort((a, b) => b[1] - a[1])[0][0];
  const list = [...clusters.values()].map((c) => {
    const info = B.clusterInfo.get(c.dept + "\u0000" + c.type);
    const so = baseline ? baseline.clusters[c.dept + "|" + c.type] ?? null : null;
    const kg = modal(c.kgs);
    return { ...c, kg, basis: modal(c.bases), siblings: info ? info.siblings : 0, via: info ? info.via : null,
      siblingMedianKg: info ? info.siblingMedianKg : null, signedOffKg: so, mixed: c.kgs.size > 1 };
  }).sort((a, b) => b.n - a.n || a.dept.localeCompare(b.dept) || a.type.localeCompare(b.type));

  /* The signed-off report's 407: under $75, a published / catalogue
     weight or the resolver's answer above 20 kg. */
  const quoteKg = (p) => (p.real != null ? p.real : resolveProduct(p).weightKg);
  const misfiresAfter = products.filter((p) => p.price < CONSERVATIVE_PRICE_USD && quoteKg(p) > SIBLING_MAX_KG);

  /* ---------------------------- the report ---------------------------- */
  const fmt = (n) => n.toLocaleString("en-US");
  const kg = (x) => (x == null ? "-" : Number(x).toFixed(2));
  const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 60);
  const delta = (a, b) => (a == null || b == null ? "-" : (b - a >= 0 ? "+" : "") + (b - a).toFixed(2));
  const md = [];
  md.push("# #449 sibling weight inference: pricing");
  md.push("");
  md.push("Generated by `node scripts/report-weight-inference.mjs`, which also writes the data the resolver prices with (`" + DATA_MODULE + "` for the server, `" + DATA_JSON + "` for the app bundle). Signed off on #449 (Lucifer, 2026-10-20) with conditions; the earlier table (#452) is the baseline for every delta below.");
  md.push("");
  md.push("## Method");
  md.push("");
  md.push(`- **Universe.** Every product the page loads: the department caches and every catalogue file, merged and deduped the way \`retailerItemsFor\` does it, priced and not absurd-quarantined. **${fmt(products.length)} products.**`);
  md.push("- **Resolution.** Each product goes through `resolveCartWeights` as a cart line arrives: title, store, the customer price the card shows, the catalogue weight the card carries (minus the moms placeholder stamps), and no department.");
  md.push("- **No-match.** No catalogue weight, and no row recognised the title.");
  md.push("- **Type.** The first title-noun pattern in `TYPE_RULES` the title matches, else `other`. The catch-alls are split: kit/set (gift set, tool kit, replacement pack, multi-pack, other), cover/guard (mouth guard, shin/body guard, cover, other), face mask/patch (snorkel mask, skincare mask/patch, other mask, patch).");
  md.push(`- **Siblings.** Same department and type, under $${CONSERVATIVE_PRICE_USD}, with a catalogue weight or a row weight, at most ${SIBLING_MAX_KG} kg, and inside the type's physical range when it has one (\`RANGES\`). A sibling outside the range is a row misfire and is left out (the 1.15 kg beaded row on earrings, the full-helmet row on visors). The moms catalogue's flat 4 kg stamp is no weight at all, and its 12 / 25 kg stamps count only on a stroller / crib (on lines under $${CONSERVATIVE_PRICE_USD}; $${CONSERVATIVE_PRICE_USD}+ lines read them as on main).`);
  md.push(`- **Assigned kg.** Sibling median x ${CUSHION.toFixed(2)} with ${MIN_SIBLINGS}+ siblings; else the department median x ${CUSHION.toFixed(2)}; else the catalogue median x ${CUSHION.toFixed(2)} (${kg(B.data.catalog)} kg). skate_snow takes sporting goods' pool for a type its own pool is too thin for. Every figure is held inside its type's range and capped at ${CAP_KG} kg.`);
  md.push("- **Pinned types.** Trading cards 0.05 kg (boxes, tins and bundles 0.45); jewellery (earrings, necklaces, bracelets, charms, rings) 0.05; surf leash, traction pad and rash guard 0.3; motorcycle tyres by size, 2.5-6 kg (real weights, so above the cap).");
  md.push("- **Store, not bucket.** A cart line names its store. Each store maps to the department most of its products sit in, with a per-type exception where the store's products of that type mostly sit elsewhere and the exception changes the answer.");
  md.push(`- **Misfire rows.** The rows that quoted cheap products above ${SIBLING_MAX_KG} kg carry guards (\`NOT_BULKY_RE\` and per-row \`cheapNot\` impostors in \`scripts/lib/item-weight.js\`); rugs are weighed by area; a lb range or a mount's load is not a weight. The guards read only lines under $${CONSERVATIVE_PRICE_USD} (or unpriced), so every $${CONSERVATIVE_PRICE_USD}+ quote is as on main.`);
  md.push("- **Flag.** The resolver answers `source: \"inferred\"`, `inferred: true`, with the basis and the cluster. It is an estimate (\"peso estimado\"), not a gap, so it is not held for costing more than the product (Danny's ruling on the 889).");
  md.push("");
  md.push("## Bucket totals");
  md.push("");
  md.push(`No-match products under $${CONSERVATIVE_PRICE_USD}: **${fmt(cheap.length)}**` + (baseline ? ` (signed-off table: ${fmt(baseline.buckets.noMatchUnder75)})` : "") + `. $${CONSERVATIVE_PRICE_USD}+ no-match (the #451 band, unchanged): **${fmt(guard.length)}**.`);
  md.push("");
  md.push("| Bucket | Products | Held without inference | Signed-off table |");
  md.push("|---|---:|---:|---:|");
  md.push(`| Pinned type | ${fmt(bucket.pinned)} | ${fmt(bucketHeld.pinned)} | - |`);
  md.push(`| Sibling-inferred | ${fmt(bucket.sibling)} | ${fmt(bucketHeld.sibling)} | ${baseline ? fmt(baseline.buckets.sibling) : "-"} |`);
  md.push(`| Department median | ${fmt(bucket.deptMedian)} | ${fmt(bucketHeld.deptMedian)} | ${baseline ? fmt(baseline.buckets.deptMedian) : "-"} |`);
  md.push(`| Catalogue median | ${fmt(bucket.catalogMedian)} | ${fmt(bucketHeld.catalogMedian)} | ${baseline ? fmt(baseline.buckets.globalMedian) : "-"} |`);
  md.push(`| **of which capped at ${CAP_KG} kg** | ${fmt(capped)} | | ${baseline ? fmt(baseline.buckets.overCap) + " over the cap" : "-"} |`);
  md.push("");
  md.push(`- "Held without inference" is the freight-confirm hold these products would carry on the 0.6 kg generic (its freight above the price); the sweep against main is in the PR. **Held after: ${fmt(heldAfter)}.**`);
  md.push(`- ${fmt(stillAbovePrice)} of them now quote freight above their price (mostly items under ~$5). Per Danny's ruling they sell: the customer sees the real freight and decides.`);
  md.push(`- ${fmt(aboveCapPinned)} pinned motorcycle tyres quote above ${CAP_KG} kg (real tyre weights).`);
  md.push(`- Store mapping: ${fmt(mismatch)} of ${fmt(cheap.length)} products get a different figure from their store's department than from their own catalogue bucket.`);
  md.push("");
  md.push("## Flagged clusters: signed-off figure -> final");
  md.push("");
  md.push("The clusters the sign-off asked to be fixed, as the resolver now prices them.");
  md.push("");
  md.push("| Department | Signed-off type | Type now | Products (no-match, under $75) | Signed-off kg | Final kg | Basis |");
  md.push("|---|---|---|---:|---:|---:|---|");
  /* [department, signed-off type, the type(s) it is priced under now]. */
  const FLAGGED = [
    ["toys", "trading cards", ["trading cards"]], ["sporting_goods", "surf leash", ["surf leash"]],
    ["sporting_goods", "surf traction pad", ["surf traction pad"]], ["sporting_goods", "rash guard", ["rash guard"]],
    ["jewelry_accessories", "earrings", ["earrings"]], ["jewelry_accessories", "necklace", ["necklace"]],
    ["jewelry_accessories", "bracelet", ["bracelet"]], ["women", "earrings", ["earrings"]],
    ["moms", "swaddle / blanket", ["swaddle / blanket"]], ["moms", "pacifier / teether", ["pacifier / teether"]],
    ["moms", "breast pump part", ["breast pump part", "breast pump"]],
    ["skate_snow", "skateboard wheels", ["skateboard wheels"]], ["skate_snow", "pads / guards", ["pads / guards"]],
    ["home", "storage basket / bin", ["storage basket / bin"]], ["home", "ornament / figurine / decor", ["ornament / figurine / decor"]],
    ["toys", "ball", ["ball"]], ["motos", "helmet part", ["helmet part"]],
    ["toys", "kit / set (unspecified)", ["gift / sampler set", "tool / repair kit", "replacement / accessory pack", "multi-pack", "kit / set (other)"]],
    ["home", "kit / set (unspecified)", ["gift / sampler set", "tool / repair kit", "replacement / accessory pack", "multi-pack", "kit / set (other)"]],
    ["sporting_goods", "cover / guard", ["mouth guard", "shin / body guard", "cover", "guard (other)"]],
    ["clothing", "face mask / patch", ["snorkel / dive mask", "skincare mask / patch", "mask (other)", "patch"]],
  ];
  const probe = (d, t) => inferredWeightKg("", { retailer: "x", priceUsd: 1 }, { ...B.data, types: [[t, "^"]], stores: { x: [d, {}] } });
  for (const [d, t, now] of FLAGGED) {
    const so = baseline ? baseline.clusters[d + "|" + t] ?? null : null;
    now.forEach((nt, i) => {
      const r = probe(d, nt);
      const c = list.find((x) => x.dept === d && x.type === nt);
      md.push(`| ${d} | ${i ? "" : t} | ${nt} | ${c ? c.n : 0} | ${i ? "" : kg(so)} | ${kg(r.kg)} | ${r.basis}${(B.clusterInfo.get(d + "\u0000" + nt) || {}).via ? " via " + B.clusterInfo.get(d + "\u0000" + nt).via : ""} |`);
    });
  }
  {
    const so = baseline ? baseline.depts.skate_snow : null;
    md.push(`| skate_snow | other (leftovers) | other | ${(list.find((x) => x.dept === "skate_snow" && x.type === "other") || { n: 0 }).n} | ${kg(so)} | ${kg(probe("skate_snow", "other").kg)} | ${probe("skate_snow", "other").basis} |`);
  }
  md.push("");
  md.push("Motorcycle tyres under $75 (motos / other in the signed-off table, 1.28 kg) are now pinned by size: " +
    (() => { const t = cheap.filter((p) => p.dept === "motos" && p.after && p.after.inferredKey === "dirt-bike tire"); const m = new Map(); for (const p of t) m.set(p.after.weightKg, (m.get(p.after.weightKg) || 0) + 1); return [...m].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${n} at ${kg(k)} kg`).join(", ") || "none"; })() + ".");
  md.push("");
  md.push(`## All clusters (${list.length}), by product count`);
  md.push("");
  md.push("Final kg is what the resolver quotes for the cluster's products (the modal figure where a store's department mapping or a size step splits a cluster). Δ is final minus the signed-off figure.");
  md.push("");
  md.push("| # | Department | Type | Products | Held without inference | Siblings | Sibling median kg | Signed-off kg | Final kg | Δ | Basis |");
  md.push("|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|");
  list.forEach((c, i) => md.push(`| ${i + 1} | ${c.dept} | ${c.type} | ${c.n} | ${c.held} | ${c.siblings || "-"} | ${kg(c.siblingMedianKg)} | ${kg(c.signedOffKg)} | ${kg(c.kg)}${c.mixed ? "*" : ""} | ${delta(c.signedOffKg, c.kg)} | ${c.basis}${c.via ? " via " + c.via : ""} |`));
  md.push("");
  md.push("## Department medians");
  md.push("");
  md.push("| Department | Weighted siblings | Assigned kg (median x 1.10) | Signed-off kg | Δ |");
  md.push("|---|---:|---:|---:|---:|");
  for (const [d, arr] of [...B.deptPool].sort((a, b) => b[1].length - a[1].length)) {
    const now = B.data.depts[d] ?? null;
    const so = baseline ? baseline.depts[d] ?? null : null;
    md.push(`| ${d} | ${arr.length} | ${now == null ? "too few (catalogue)" : kg(now)} | ${kg(so)} | ${delta(so, now)} |`);
  }
  md.push("");
  md.push(`Catalogue median x 1.10: **${kg(B.data.catalog)} kg**${baseline ? ` (signed off: ${kg(baseline.catalog)})` : ""}.`);
  md.push("");
  md.push(`## Capped at ${CAP_KG} kg (${overCap.length})`);
  md.push("");
  if (!overCap.length) md.push("None.");
  else {
    md.push("Quoted at the cap and listed here for a real row:");
    md.push("");
    md.push("| Title | Store | Price USD | Dept / type |");
    md.push("|---|---|---:|---|");
    for (const o of overCap.sort((a, b) => a.dept.localeCompare(b.dept) || a.title.localeCompare(b.title))) md.push(`| ${esc(o.title)} | ${o.store} | ${o.priceUsd.toFixed(2)} | ${o.dept} / ${o.type} |`);
  }
  md.push("");
  md.push(`## Products under $${CONSERVATIVE_PRICE_USD} still quoting over ${SIBLING_MAX_KG} kg (${misfiresAfter.length})`);
  md.push("");
  if (!misfiresAfter.length) md.push(`None. The signed-off report listed ${baseline ? fmt(baseline.buckets.misfires ?? 407) : "407"}; the rows that misfired now carry guards (\`NOT_BULKY_RE\` and the per-row impostors in \`scripts/lib/item-weight.js\`), rugs are weighed by area, a lb range or a mount's load is not a weight, and the moms placeholder stamps are ignored.`);
  else {
    md.push("| Title | Store | Price USD | kg | Source |");
    md.push("|---|---|---:|---:|---|");
    for (const p of misfiresAfter) { const r = resolveProduct(p); md.push(`| ${esc(p.title)} | ${p.rk} | ${p.price.toFixed(2)} | ${kg(quoteKg(p))} | ${p.real != null ? "catalogue weight" : r.source} |`); }
    md.push("");
    const rowLeft = misfiresAfter.filter((p) => p.real == null).length;
    md.push(rowLeft
      ? `${rowLeft} of these still come from a weight row and need a rule fix.`
      : "No weight row is left among them. Each is a weight the store's catalogue publishes as real (`weightEstimated: false`): Best Buy's 52.6 kg (116 lb) on a descaler and a soda carbonator, Kindred Bravely's 25.7 kg on a nursing bra top. Those are data errors at the source, quoted as published; they need a catalogue correction, not a rule, and are left for that follow-up.");
  }
  md.push("");
  writeFileSync(ROOT + "reports/weight-inference-449.md", md.join("\n"));

  const json = {
    issue: 449,
    generatedBy: "scripts/report-weight-inference.mjs",
    pricingChange: true,
    data: [DATA_MODULE, DATA_JSON],
    rule: { cushion: CUSHION, capKg: CAP_KG, minSiblings: MIN_SIBLINGS, underUsd: CONSERVATIVE_PRICE_USD, flag: "inferred" },
    universe: products.length,
    buckets: { noMatchUnder75: cheap.length, ...bucket, capped, heldOnMain: cheap.filter((p) => p.held).length, heldAfter, stillAbovePrice, guard75: guard.length, over20kgUnder75: misfiresAfter.length },
    clusters: list.map((c) => ({ dept: c.dept, type: c.type, n: c.n, siblings: c.siblings, siblingMedianKg: c.siblingMedianKg, kg: c.kg, basis: c.basis, signedOffKg: c.signedOffKg })),
    signedOff: baseline,
  };
  writeFileSync(ROOT + "reports/weight-inference-449.json", compactJson(json));
  console.log(JSON.stringify({ universe: products.length, ...json.buckets, mismatch, dataBytes: dataJson.length, clusters: list.length }));
}
