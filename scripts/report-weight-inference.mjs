#!/usr/bin/env node
/* ==================================================================
   #449 SIBLING WEIGHT INFERENCE -- THE REPORT (no pricing change).

   Danny's ruling on #443 (Option 3): a cheap product that matches no
   weight row is weighed like its verified siblings -- same department,
   same kind of thing -- not at its department's band top. This script
   only REPORTS what that rule would assign. It changes nothing the
   estimator, the bundle or the resolver quotes; the pricing PR that
   follows reads reports/weight-inference-449.json.

   WHAT IT DOES
   1. Loads every catalogue the page loads (DEPT_CACHE_PARTS +
      CATALOGUE_FILES, merged per retailer and deduped exactly as the
      page does -- census-classification.mjs's loader and the page's own
      retailerItemsFor/notQuarantined/rawTitleOf).
   2. Resolves each product the way a cart line arrives: title, store,
      the customer price the card shows ((raw + tiered margin) x the
      store's sales-tax factor), the catalogue weight only when the
      catalogue carries one, and NO department.
   3. No-match = the resolver fell through (source "department" or
      "fallback"). Real weight = a published spec or a catalogue weight.
   4. Department = the catalogue bucket the product sits in. Type = the
      first TYPE_RULES pattern its title matches (title nouns, English
      and Spanish), else "other".
   5. Siblings = every catalogue product (any price) in the same
      department and type with a real weight or a rule-matched weight
      (the estimator hit a row; the beauty "sin fila" floor and the
      fall-through do not count).
   6. Assigned kg = sibling median x 1.10 (the standing cushion) when
      the pool has >= MIN_SIBLINGS; otherwise the department median
      x 1.10. Capped at 2 kg under $75; anything that would exceed the
      cap is listed, not assigned.

   RUN: node scripts/report-weight-inference.mjs
   Writes reports/weight-inference-449.md and .json (cluster level only).
   ================================================================== */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pageHtml, liftDeclarations } from "./lib/page-lift.mjs";
import { loadClassifiers, loadCatalogue } from "./census-classification.mjs";
import { resolveCartWeights, specWeightKg, catalogWeightKg } from "../netlify/functions/_weight-resolve.js";
import { CONSERVATIVE_PRICE_USD, freightQuotable } from "./lib/item-weight.js";
import { CHARGE_PER_KG } from "../weight-data.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const CUSHION = 1.10;
export const CAP_KG = 2;
export const MIN_SIBLINGS = 5;
export const SIBLING_MAX_KG = 10 * CAP_KG;

/* TITLE TYPES. Ordered: the first match wins, so the specific phrase
   ("skateboard wheels", "hot wheels") sits above the generic noun. Kept
   to plain nouns a reviewer can read; a type is only ever compared with
   siblings in its OWN department, so "case" in electronics and "case"
   in moms never share a pool. */
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
  ["breast pump part", /\bflange\b|\bvalves?\b|\bmembranes?\b|\bduckbill\b|\bbreast ?shield\b|\btubing\b|\bbreast pump\b|\bbackflow\b/],
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
  ["cover / guard", /\bcovers?\b|\bguard\b(?!.*rash)/],
  ["grips", /\bgrips?\b/],
  ["cufflinks", /\bcufflinks?\b/],
  ["keychain / lanyard", /\bkey ?chains?\b|\bkey ?rings?\b|\blanyard\b|\bllaveros?\b/],
  ["bracelet", /\bbracelets?\b|\bbangles?\b|\banklets?\b|\bpulseras?\b/],
  ["necklace", /\bnecklaces?\b|\bpendants?\b|\bchokers?\b|\blockets?\b|\bcollares?\b/],
  ["earrings", /\bearrings?\b|\bstuds?\b|\bhoops?\b|\baretes\b|\bpendientes\b/],
  ["charm", /\bcharms?\b|\bdijes?\b/],
  ["ring", /\brings?\b|\banillos?\b/],
  ["hair accessory", /\bclaw clip\b|\bhair clip\b|\bclips?\b|\bscrunchies?\b|\bhair ties?\b|\bbarrettes?\b|\bheadbands?\b|\bbows?\b/],
  ["sunglasses", /\bsunglasses\b|\bpolarized\b|\bgafas\b|\blentes de sol\b/],
  ["bra / bralette", /\bbras?\b|\bbralettes?\b|\bbrasier\b|\bsujetador\b/],
  ["underwear", /\bthongs?\b|\bhipsters?\b|\bbriefs?\b|\bboxers?\b|\bpant(y|ies)\b|\bunderwear\b|\bboy ?shorts?\b|\bcheeky\b|\btanga\b|\bcalzon/],
  ["socks", /\bsocks?\b|\bcalcetines\b|\bmedias\b/],
  ["boardshorts / swim trunks", /\bboard ?shorts?\b|\bswim trunks?\b|\bvolley\b/],
  ["rash guard", /\brash ?guards?\b/],
  ["swimsuit", /\bswim|\bbikini|\bone[- ]piece\b|\bbandeau\b|\btankini\b|\bbaño\b/],
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
  ["face mask / patch", /\bmasks?\b|\bpatch(es)?\b|\bmascarillas?\b/],
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
  ["kit / set (unspecified)", /\bkits?\b|\bsets?\b|\bpacks?\b|\bpk\b|\bbundle\b/],
];

export function normTitle(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'");
}
export function typeOf(title) {
  const t = normTitle(title);
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

/* ------------------------------------------------------------------ */
function main() {
  const html = pageHtml(ROOT);
  const P = loadClassifiers(html);
  /* The card's customer price, from the page's own code. */
  const T = liftDeclarations(html, ["SALES_TAX_RATE", "TAX_EXEMPT_STATUS", "salesTaxRateFor", "round2", "tieredMarginUsd",
    "ABSURD_PRICE_RAW_USD", "ABSURD_PRICE_EXEMPT", "ABSURD_LUXURY_RETAILERS", "ABSURD_TYPE_CEILINGS", "absurdCeilingUsd"]);
  const customerPrice = (raw, rk) => T.round2((raw + T.tieredMarginUsd(raw)) * T.salesTaxRateFor(rk));
  const absurd = (raw, rk, title) => raw > T.absurdCeilingUsd(rk, title)
    || (raw > T.ABSURD_PRICE_RAW_USD && !T.ABSURD_PRICE_EXEMPT.has(rk) && !T.ABSURD_LUXURY_RETAILERS.has(rk));

  const { retailers, missing } = loadCatalogue(P);
  if (missing.length) console.warn("missing catalogue files:", missing.join(", "));

  /* Every product once, in the page's order, keeping its bucket. */
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

  /* Resolve each one the way its cart line would be resolved. */
  const NOMATCH = new Set(["department", "fallback"]);
  for (const p of products) {
    const cat = catalogWeightKg(p.raw);
    const line = { title: p.title, retailer: p.rk, priceUsd: p.price, qty: 1, ...(cat ? { specWeightKg: cat.kg } : {}) };
    const r = resolveCartWeights([line]).items[0];
    const real = specWeightKg({ ...p.raw, weightEstimated: p.raw.weightEstimated }) || cat;
    p.source = r.source;
    p.kg = r.weightKg;
    p.held = !!r.needsReview;
    p.real = real ? real.kg : null;
    p.noMatch = !real && NOMATCH.has(r.source);
    p.ruleMatched = !NOMATCH.has(r.source) && !(r.source === "beauty" && /sin fila/.test(r.basis || ""));
    const weighed = p.real != null ? p.real : p.ruleMatched ? r.weightKg : null;
    p.type = typeOf(p.title);
    /* A sibling is in the same price class (under $75), and weighs no
       more than SIBLING_MAX_KG. A sub-$75 product the estimator puts
       above that is, in this catalogue, a row misfire (Play-Doh playsets
       on the 74.25 kg swing-set row, silicone spatulas on a 121.5 kg
       row), not a weight to borrow; those are counted and listed. */
    p.siblingKg = null;
    if (weighed != null && p.price < CONSERVATIVE_PRICE_USD) {
      if (weighed <= SIBLING_MAX_KG) p.siblingKg = weighed;
      else p.misfire = weighed;
    }
  }

  /* Sibling pools: department x type, and department-wide. */
  const pool = new Map(), deptPool = new Map(), typePool = new Map();
  for (const p of products) {
    if (p.siblingKg == null) continue;
    const k = p.dept + "\u0000" + p.type;
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(p.siblingKg);
    /* Same type in every department: NOT used to assign (the ruling is
       department first), only shown next to over-cap and questionable
       clusters so a reviewer can compare. */
    if (!typePool.has(p.type)) typePool.set(p.type, []);
    typePool.get(p.type).push(p.siblingKg);
    if (!deptPool.has(p.dept)) deptPool.set(p.dept, []);
    deptPool.get(p.dept).push(p.siblingKg);
  }
  const allSiblings = [].concat(...deptPool.values());
  const globalMedian = median(allSiblings);

  const nomatch = products.filter((p) => p.noMatch);
  const cheap = nomatch.filter((p) => p.price < CONSERVATIVE_PRICE_USD);
  const guard = nomatch.filter((p) => p.price >= CONSERVATIVE_PRICE_USD);

  const deptMedians = {};
  for (const [d, arr] of deptPool) deptMedians[d] = { n: arr.length, medianKg: round2(median(arr)) };

  /* Assign. */
  const clusters = new Map();
  const overCap = [];
  const bucket = { sibling: 0, deptMedian: 0, globalMedian: 0, overCap: 0 };
  const heldBucket = { sibling: 0, deptMedian: 0, globalMedian: 0, overCap: 0 };
  let stillAbovePrice = 0;
  for (const p of cheap) {
    const k = p.dept + "\u0000" + p.type;
    const sib = pool.get(k) || [];
    let basis, med;
    if (p.type !== "other" && sib.length >= MIN_SIBLINGS) { basis = "sibling"; med = median(sib); }
    else if ((deptPool.get(p.dept) || []).length >= MIN_SIBLINGS) { basis = "deptMedian"; med = median(deptPool.get(p.dept)); }
    else { basis = "globalMedian"; med = globalMedian; }
    const wouldKg = round2(med * CUSHION);
    if (!clusters.has(k)) {
      const tp = typePool.get(p.type) || [];
      clusters.set(k, { dept: p.dept, type: p.type, basis, n: 0, held: 0, siblings: sib.length,
        typeSiblings: tp.length, typeMedianKg: tp.length ? round2(median(tp)) : null,
        siblingMedianKg: sib.length ? round2(median(sib)) : null, poolMedianKg: round2(med), wouldKg,
        assignedKg: wouldKg > CAP_KG ? null : wouldKg, examples: [], stores: new Set() });
    }
    const c = clusters.get(k);
    c.n++; if (p.held) c.held++;
    c.stores.add(p.rk);
    if (c.examples.length < 3 && !c.examples.includes(p.title)) c.examples.push(p.title);
    if (wouldKg > CAP_KG) {
      bucket.overCap++; if (p.held) heldBucket.overCap++;
      overCap.push({ title: p.title, store: p.rk, priceUsd: p.price, dept: p.dept, type: p.type, wouldKg });
    } else {
      bucket[basis]++; if (p.held) heldBucket[basis]++;
      /* Informational: the freight on the inferred weight, against the price. */
      if (!freightQuotable({ kg: wouldKg, reviewKind: "gap", source: "department" }, p.price, CHARGE_PER_KG).quotable) stillAbovePrice++;
    }
  }

  const list = [...clusters.values()].sort((a, b) => b.n - a.n || a.dept.localeCompare(b.dept) || a.type.localeCompare(b.type));
  const misfires = products.filter((p) => p.misfire != null);
  return { products, nomatch, cheap, guard, list, overCap, bucket, heldBucket, deptMedians, globalMedian, stillAbovePrice, misfires };
}

/* ------------------------------------------------------------------ */
const R = main();
const sib = R.list.filter((c) => c.basis === "sibling");
const nonSib = R.list.filter((c) => c.basis !== "sibling");
const sumHeld = R.cheap.filter((p) => p.held).length;
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 60);
const kg = (x) => (x == null ? "-" : x.toFixed(2));

/* QUESTIONABLE CLUSTERS. Read by eye against the sibling pools (the
   notes say what was found); rendered with the live numbers so a re-run
   keeps them honest. [dept or "*", type or "*", note]. */
const QUESTIONABLE = [
  ["*", "kit / set (unspecified)", "Catch-all: \"kit / set / pack / bundle\" with no other noun. It groups unlike things (toy kits, beauty sets, kitchen sets), so its median is a department average under another name. Candidates for the department median instead."],
  ["toys", "trading cards", "Overweight. The siblings are mostly board/card-game rows (1.0 kg) and a 1.15 kg generic row; a booster pack weighs ~30 g and a booster box ~0.4 kg. A dedicated trading-card row would serve better than inference."],
  ["sporting_goods", "surf leash", "Overweight. The pool splits between real leash rows (0.29 kg) and a 1.0 kg sporting row; the median lands on 1.0. A leash ships at ~0.3 kg."],
  ["sporting_goods", "surf traction pad", "Same 1.0 kg sporting row as the leashes; a traction pad is ~0.2-0.3 kg. Overweight but under the cap."],
  ["sporting_goods", "rash guard", "Same 1.0 kg sporting row; a rash guard is apparel (~0.25 kg)."],
  ["jewelry_accessories", "*", "Earrings, necklaces and bracelets here take 1.15 kg, a generic row that fires on Walmart jewelry titles. Real jewelry ships at 0.05-0.3 kg. The same type in other departments is far lighter (see the type median)."],
  ["women", "earrings", "1.15 kg from the same generic row; see jewelry_accessories."],
  ["moms", "breast pump part", "Siblings mix whole pumps and a 121.5 kg misfire (excluded) with tiny parts; a flange or valve ships at well under 0.1 kg."],
  ["moms", "pacifier / teether", "0.8 kg is far above a pacifier (~0.05 kg); the pool is moms-catalogue estimates, not pacifiers."],
  ["moms", "swaddle / blanket", "The moms catalogue carries a flat 4.0 kg `specWeightKg` (marked estimated) on 65 products (momcozy, owlet, kindredbravely, walmartbaby...): placeholder values, not weights. They dominate this pool. The same swaddles published with `weightEstimated: false` read 0.17-0.25 kg."],
  ["moms", "*", "Moms clusters lean heavy for the same reason: the 4.0 kg placeholder catalogue weights are siblings by the rule (a catalogue weight), and they pull medians up."],
  ["home", "storage basket / bin", "No usable pool. The kitchen-storage siblings sit on a 40.5 kg row (excluded as misfires); what is left mixes a 0.05 kg beauty floor on makeup organisers with 5-8 kg title parses of shelf organisers. Over the cap: listed, not assigned."],
  ["home", "kitchen utensil / gadget", "Its siblings are a 121.5 kg row firing on spatulas and tongs (excluded as misfires), so the pool is too small and it falls to the department median, which is reasonable (~0.45 kg)."],
  ["home", "ornament / figurine / decor", "Small pool of heavy home rows; over the cap. A figurine is usually under 1 kg."],
  ["toys", "ball", "Over the cap because the pool is the goal-set row (18.9 kg) and a ping-pong set on a 60.75 kg row (excluded). A toy ball ships at 0.1-0.6 kg."],
  ["skate_snow", "*", "This department's weighted products are mostly complete skateboards (3.38 kg), so every residual here (wheels, pads, a lotion) inherits 3.7 kg and goes over the cap. The same types in sporting_goods are 0.13-0.55 kg."],
  ["motos", "other", "Department median 1.28 kg covers motorcycle tires (IRC NR77U, MX IX) priced under $75. A dirt-bike tire is 3-6 kg, so these under-quote."],
  ["motos", "helmet part", "Parts (cheek pads, visors, shields, liners) are 0.1-0.3 kg. About half the pool is visor rows at 0.2 kg; the rest is the estimator's full-helmet row (2.03 kg) firing on part titles (\"Helmet Liner\", \"Pinlock Ready Shield for ... Helmet\", even a \"Helmet Shield Bag\"). The median lands in between: overweight but under the cap. Fixing the helmet row's impostors would fix the pool."],
  ["*", "cover / guard", "Mixed noun: moto/auto covers, mouth guards and shin guards share the key. Fine inside one department, but read each row's examples."],
  ["clothing", "face mask / patch", "Mixed: fabric face masks, snorkel masks and skincare patches."],
  ["beauty", "*", "Beauty clusters sit at 0.06-0.11 kg: the beauty table's own rows. Plausible for a single cosmetic; light for sets and large bottles."],
];

const md = [];
md.push("# #449 sibling weight inference: report (no pricing change)");
md.push("");
md.push("Generated by `node scripts/report-weight-inference.mjs`. This changes no freight quote. The cluster weights below are what the follow-up pricing PR would assign, once Lucifer and Danny have reviewed this table.");
md.push("");
md.push("## Method");
md.push("");
md.push(`- **Universe.** Every product the page loads: the department caches (\`DEPT_CACHE_PARTS\`) and every file in \`CATALOGUE_FILES\`, merged and deduped the way \`retailerItemsFor\` does it, priced and not absurd-quarantined. **${R.products.length.toLocaleString("en-US")} products.**`);
md.push("- **Resolution.** Each product goes through `resolveCartWeights` exactly as a cart line arrives: title, store, the customer price the card shows (raw + tiered margin, x the store's sales-tax factor), the catalogue weight only when the catalogue carries one, and no department.");
md.push("- **No-match.** The resolver fell through to `department` (#451's band top) or `fallback` (0.6 kg generic), and the record has no published or catalogue weight.");
md.push("- **Department.** The catalogue bucket the product sits in (`toys`, `sporting_goods`, `jewelry`, ...), the same key #451's sweep table used.");
md.push("- **Type.** The first title-noun pattern in `TYPE_RULES` (in the script, English and Spanish) the title matches; otherwise `other`.");
md.push(`- **Siblings.** Every product of the same department and type with a published/catalogue weight or a weight from an estimator row. The fall-through, the 0.6 generic and the beauty \"sin fila\" floor do not count. Two screens: a sibling is in the same price class (under $${CONSERVATIVE_PRICE_USD}), and weighs at most ${SIBLING_MAX_KG} kg; a sub-$${CONSERVATIVE_PRICE_USD} product the estimator puts above that is treated as a row misfire, not a sibling (listed at the end).`);
md.push(`- **Assigned kg.** Sibling median x ${CUSHION.toFixed(2)} (the standing 10% cushion). **Minimum pool: ${MIN_SIBLINGS} siblings.** With fewer, or with type \`other\`, the product takes its department median x ${CUSHION.toFixed(2)}. Rule-matched siblings already carry their row's confidence buffer, so this errs heavy.`);
md.push(`- **Cap.** Under $${CONSERVATIVE_PRICE_USD}, an inferred quote over ${CAP_KG} kg is not assigned; the product is listed under "Over the cap" below instead.`);
md.push("- **Flag.** Every assigned weight is meant to ship flagged `inferred` in the data (source `sibling` / `dept-median`), separate from rule and spec weights.");
md.push("");
md.push("## Bucket totals");
md.push("");
md.push(`No-match products, all prices: **${R.nomatch.length.toLocaleString("en-US")}**. Of these, **${R.cheap.length.toLocaleString("en-US")} are under $${CONSERVATIVE_PRICE_USD}** and **${R.guard.length.toLocaleString("en-US")} are $${CONSERVATIVE_PRICE_USD}+**.`);
md.push("");
md.push(`Of the ${R.cheap.length.toLocaleString("en-US")} cheap no-match products, **${sumHeld.toLocaleString("en-US")} are held for review at checkout today** on this branch (their band or generic freight exceeds the price). The "Held today" column shows how the inference treats that subset.`);
md.push("");
md.push("| Bucket | Products | Held today | Rule |");
md.push("|---|---:|---:|---|");
md.push(`| Sibling-inferred | ${R.bucket.sibling.toLocaleString("en-US")} | ${R.heldBucket.sibling.toLocaleString("en-US")} | dept x type median x ${CUSHION}, pool >= ${MIN_SIBLINGS} |`);
md.push(`| Department median | ${R.bucket.deptMedian.toLocaleString("en-US")} | ${R.heldBucket.deptMedian.toLocaleString("en-US")} | type \`other\` or pool < ${MIN_SIBLINGS}: dept median x ${CUSHION} |`);
if (R.bucket.globalMedian) md.push(`| Catalogue median (department has < ${MIN_SIBLINGS} weighted products) | ${R.bucket.globalMedian} | ${R.heldBucket.globalMedian} | all-catalogue median ${kg(R.globalMedian)} x ${CUSHION} |`);
md.push(`| Over the ${CAP_KG} kg cap (listed, not assigned) | ${R.bucket.overCap.toLocaleString("en-US")} | ${R.heldBucket.overCap.toLocaleString("en-US")} | see list below |`);
md.push(`| $${CONSERVATIVE_PRICE_USD}+ guard (#451, unchanged) | ${R.guard.length.toLocaleString("en-US")} | ${R.guard.filter((p) => p.held).length.toLocaleString("en-US")} | band top, not inferred |`);
md.push("");
md.push(`After inference, **${R.stillAbovePrice.toLocaleString("en-US")}** of the assigned cheap products would still carry freight above their price at $${CHARGE_PER_KG}/kg (mostly items under ~$5). They are under the cap, so they would quote if \`inferred\` is exempt from the gap rule; that is the pricing PR's call.`);
md.push("");
md.push("### On the 3,295 figure");
md.push("");
md.push(`#451's body counts 3,295 products newly held for review out of 150,744. Its sweep script is not in the repo. This script reaches **${R.products.length.toLocaleString("en-US")}** products through the page's own loader, dedupe and absurd-price quarantine. Of those, **${sumHeld.toLocaleString("en-US")}** are cheap, no-match and held today, which is the same population to within 2%.`);
md.push("");
md.push(`Danny's rule reaches further than the held set: all ${R.cheap.length.toLocaleString("en-US")} cheap no-match products. Today each one quotes either a band top or the 0.6 kg generic, with no knowledge behind it. The table covers all of them, and the "Held today" column picks out the subset that is blocked now.`);
md.push("");
md.push(`## Sibling-inferred clusters (${sib.length}), by product count`);
md.push("");
md.push("| # | Department | Type | Products | Held today | Siblings | Sibling median kg | Assigned kg | Examples |");
md.push("|---:|---|---|---:|---:|---:|---:|---:|---|");
sib.forEach((c, i) => md.push(`| ${i + 1} | ${c.dept} | ${c.type} | ${c.n} | ${c.held} | ${c.siblings} | ${kg(c.siblingMedianKg)} | ${c.assignedKg == null ? `over cap (${kg(c.wouldKg)})` : kg(c.assignedKg)} | ${c.examples.map(esc).join("; ")} |`));
md.push("");
md.push("## Department-median products, by department");
md.push("");
md.push("Products whose type is `other` or whose type pool is under the minimum. One row per department; the types that fell here are listed with their counts.");
md.push("");
const byDept = new Map();
for (const c of nonSib) {
  if (!byDept.has(c.dept)) byDept.set(c.dept, { dept: c.dept, n: 0, held: 0, poolMedianKg: c.poolMedianKg, wouldKg: c.wouldKg, basis: c.basis, types: [], examples: [] });
  const d = byDept.get(c.dept);
  d.n += c.n; d.held += c.held; d.types.push(`${c.type} ${c.n}${c.siblings ? ` (${c.siblings} sib)` : ""}`);
  for (const e of c.examples) if (d.examples.length < 2) d.examples.push(e);
}
const deptRows = [...byDept.values()].sort((a, b) => b.n - a.n);
md.push("| Department | Products | Held today | Weighted products in dept | Dept median kg | Assigned kg | Types that fell here | Examples |");
md.push("|---|---:|---:|---:|---:|---:|---|---|");
for (const d of deptRows) {
  const dm = R.deptMedians[d.dept];
  md.push(`| ${d.dept} | ${d.n} | ${d.held} | ${dm ? dm.n : 0} | ${kg(d.poolMedianKg)}${d.basis === "globalMedian" ? " (catalogue)" : ""} | ${d.wouldKg > CAP_KG ? `over cap (${kg(d.wouldKg)})` : kg(d.wouldKg)} | ${esc(d.types.sort((a, b) => parseInt(b.split(" ").pop()) - parseInt(a.split(" ").pop())).slice(0, 8).join(", ")).slice(0, 160)} | ${d.examples.map(esc).join("; ")} |`);
}
md.push("");
md.push(`## Over the ${CAP_KG} kg cap (${R.overCap.length})`);
md.push("");
if (!R.overCap.length) md.push("None: no cluster or department median reaches the cap.");
else {
  md.push("By cluster, with the same type's median across all departments for comparison (not used to assign):");
  md.push("");
  md.push("| Department | Type | Products | Pool | Pool median kg | Would-be kg | Same type, all depts: siblings / median kg |");
  md.push("|---|---|---:|---|---:|---:|---|");
  for (const c of R.list.filter((c) => c.assignedKg == null).sort((a, b) => b.n - a.n)) {
    md.push(`| ${c.dept} | ${c.type} | ${c.n} | ${c.basis === "sibling" ? `${c.siblings} siblings` : c.basis === "deptMedian" ? "dept median" : "catalogue median"} | ${kg(c.poolMedianKg)} | ${kg(c.wouldKg)} | ${c.type === "other" ? "-" : `${c.typeSiblings} / ${kg(c.typeMedianKg)}`} |`);
  }
  md.push("");
  md.push("Every product on the list:");
  md.push("");
  md.push("| Title | Store | Price USD | Dept / type | Would-be kg |");
  md.push("|---|---|---:|---|---:|");
  for (const o of R.overCap.sort((a, b) => b.wouldKg - a.wouldKg || a.title.localeCompare(b.title))) md.push(`| ${esc(o.title)} | ${o.store} | ${o.priceUsd.toFixed(2)} | ${o.dept} / ${o.type} | ${kg(o.wouldKg)} |`);
}
md.push("");
md.push("## Questionable clusters");
md.push("");
md.push("Read by eye against the sibling pools. Each note shows the matching clusters with their live numbers. \"Type median\" is the same type across every department, shown for comparison only.");
md.push("");
for (const [qd, qt, note] of QUESTIONABLE) {
  const hits = R.list.filter((c) => (qd === "*" || c.dept === qd) && (qt === "*" || c.type === qt) && c.n > 0);
  if (!hits.length) continue;
  const show = hits.sort((a, b) => b.n - a.n).slice(0, 4).map((c) =>
    `${c.dept} / ${c.type}: ${c.n} products, ${c.basis === "sibling" ? `${c.siblings} siblings, median ${kg(c.siblingMedianKg)}` : c.basis === "deptMedian" ? `dept median ${kg(c.poolMedianKg)}` : `catalogue median ${kg(c.poolMedianKg)}`}, assigned ${c.assignedKg == null ? `over cap (${kg(c.wouldKg)})` : kg(c.assignedKg)}${c.type !== "other" && c.typeMedianKg != null ? `; type median ${kg(c.typeMedianKg)}` : ""}`);
  md.push(`- **${qd === "*" ? "any dept" : qd} / ${qt === "*" ? "any type" : qt}.** ${note}`);
  for (const l of show) md.push(`  - ${l}`);
  if (hits.length > 4) md.push(`  - (+${hits.length - 4} more clusters)`);
}
md.push("");
md.push(`## Side finding: estimator rows that misfire on cheap products (${R.misfires.length})`);
md.push("");
md.push(`Sub-$${CONSERVATIVE_PRICE_USD} products the live estimator already quotes above ${SIBLING_MAX_KG} kg from a row. They were kept out of the sibling pools. They are outside this report's scope (they are not no-match), but each is a live quote worth a look. Counted by quoted weight and the row it came from:`);
md.push("");
{
  const g = new Map();
  for (const p of R.misfires) {
    const k = `${kg(p.misfire)} kg (${p.real != null ? "published/catalogue weight" : p.source})`;
    if (!g.has(k)) g.set(k, { k, n: 0, ex: [] });
    const e = g.get(k); e.n++; if (e.ex.length < 3) e.ex.push(`${p.title} (${p.rk}, $${p.price.toFixed(2)})`);
  }
  md.push("| Quoted kg (source) | Products | Examples |");
  md.push("|---|---:|---|");
  for (const e of [...g.values()].sort((a, b) => b.n - a.n).slice(0, 25)) md.push(`| ${e.k} | ${e.n} | ${e.ex.map(esc).join("; ")} |`);
}
md.push("");

/* JSON: cluster level only. */
const json = {
  issue: 449,
  generatedBy: "scripts/report-weight-inference.mjs",
  pricingChange: false,
  rule: { cushion: CUSHION, capKg: CAP_KG, minSiblings: MIN_SIBLINGS, underUsd: CONSERVATIVE_PRICE_USD, flag: "inferred" },
  universe: R.products.length,
  buckets: { noMatchAll: R.nomatch.length, noMatchUnder75: R.cheap.length, heldToday: sumHeld, ...R.bucket, guard75: R.guard.length },
  typeRules: TYPE_RULES.map(([k, re]) => [k, re.source]),
  clusters: sib.map((c) => ({ dept: c.dept, type: c.type, n: c.n, siblings: c.siblings, siblingMedianKg: c.siblingMedianKg, assignedKg: c.assignedKg, wouldKg: c.wouldKg })),
  departmentMedians: Object.fromEntries(Object.entries(R.deptMedians).sort().map(([d, v]) => [d, { siblings: v.n, medianKg: v.medianKg, assignedKg: round2(v.medianKg * CUSHION) > CAP_KG ? null : round2(v.medianKg * CUSHION) }])),
  catalogueMedianKg: round2(R.globalMedian),
};

/* One cluster per line: small, and diffable when the pricing PR re-runs it. */
function compactJson(obj) {
  const lines = ["{"];
  const keys = Object.keys(obj);
  keys.forEach((k, i) => {
    const v = obj[k];
    const tail = i < keys.length - 1 ? "," : "";
    if (Array.isArray(v)) lines.push(`  ${JSON.stringify(k)}: [\n${v.map((x) => "    " + JSON.stringify(x)).join(",\n")}\n  ]${tail}`);
    else if (v && typeof v === "object" && Object.values(v).every((x) => x && typeof x === "object"))
      lines.push(`  ${JSON.stringify(k)}: {\n${Object.entries(v).map(([a, b]) => `    ${JSON.stringify(a)}: ${JSON.stringify(b)}`).join(",\n")}\n  }${tail}`);
    else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${tail}`);
  });
  lines.push("}");
  return lines.join("\n") + "\n";
}
mkdirSync(ROOT + "reports", { recursive: true });
writeFileSync(ROOT + "reports/weight-inference-449.json", compactJson(json));
writeFileSync(ROOT + "reports/weight-inference-449.md", md.join("\n"));
console.log(JSON.stringify({ universe: R.products.length, ...json.buckets, stillAbovePrice: R.stillAbovePrice, misfires: R.misfires.length, sibClusters: sib.length }));
for (const [i, c] of sib.slice(0, 25).entries()) console.log(i + 1, c.dept, "/", c.type, c.n, c.assignedKg == null ? "over cap " + c.wouldKg : c.assignedKg);
