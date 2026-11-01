/* ============================================================
   COLOURWAYS: ONE MODEL, THE STORE'S OWN COLOURS (#443, the owner's
   variant order; Phase 1, built from the data already in the repo).

   No feed we hold carries a colour field (the variant audit, #443
   c.6547579148): a store's colourways reach us as separate listings of
   one model. This module finds them, conservatively, from the signals
   the stores themselves write:

     suffix  the title ends in the colour after " - ", " | ", " — "
             or " – " ("Samba ADV Shoes - Core Black/Gum"): CCS, Skims, Gymshark,
             Ryderwear and the other Shopify stores. Same retailer, same
             brand, same model text.
     mid     Zumiez writes the colour between the model and the kind of
             product ("adidas Samba ADV Dusky Bronze, Core Black, & Gum
             Skate Shoes"): the longest run of colour words before the
             last words, with at least one plain colour in it; same
             brand, same model text before it, same words after it.
     slug    the same title, the colour in the store's URL: Snipes
             ("...-samba-og-adidas-white---black-ig9030-1000120122.html")
             and Revolve ("...-in-white-black-clear-granite/dp/...").
     image   the same title, the colour in the photo's file name: Dick's
             ("..._Black_Pink_is").
     sku     the same title and no colour name anywhere: Foot Locker.
             Labelled "Estilo <SKU>" (the store's own style code) until a
             pull brings the colour names.
     lead    SSENSE writes the colour first ("Brown Samba OG Sneakers");
             grouped by brand + the rest of the title + the store's
             gender section, only when the rest has 3+ words.

   NEVER: a group of one; two models in one group (the model text must
   match exactly); a colour that is not the store's (a label is the
   store's text, title-cased at most); two members with the same label
   (unless the store's own style code tells them apart: "Black / White,
   estilo IH9052"; otherwise the later one stays a single listing) or
   the same photo (a colourway
   always has its own). A suffix with digits, sizes, fits or audiences
   ("Mid Rise", "Men's", '9.00"') is not a colour and never groups.

   variantIdOf(): the listing's stable id (the "v" the product page
   links with): FNV-1a over its own store URL, base 36. The page never
   gets the URL (it never links out), only this id.
   ============================================================ */

export function fnv1a(s, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/* Two 32-bit halves: ~12 characters, no collisions across 200k listings. */
export function variantIdOf(url, fallback = "") {
  const key = String(url || "").trim().replace(/#.*$/, "") || String(fallback || "");
  if (!key) return "";
  return fnv1a(key).toString(36) + fnv1a(key, 0x01000193).toString(36);
}
export function groupIdOf(key) {
  return "g" + fnv1a(key).toString(36) + fnv1a(key, 0x01000193).toString(36);
}

const SEP = /\s+(?:-|\||—|–)\s+(?!.*\s(?:-|\||—|–)\s)(.+)$/;
const NOT_A_COLOUR = /\d|\b(?:men'?s|women'?s|mens|womens|boys?'?|girls?'?|kids?'?|youth|toddlers?|infants?|baby|babies|grade school|pre-?school|little kids|big kids|unisex|adults?|juniors?|rise|fit|inseam|length|petite|tall|plus|regular|slim|relaxed|wide|cropped|long|short|sleeves?|sleeveless|pack|set|bundle|edition|size|sizes|oz|ml|gb|tb|inch|inches|cm|mm|pairs?|refill|mini|travel|deluxe|kit|limited|exclusive|sale|clearance|left|right|lefty|righty|refurbished|renewed|open box|used|pre-?owned|for|para|hombre|mujer|with|without|cold|cool|warm|tropical|handbag|clutch|bag|tote|wallet|case|shirt|tee|shoes?|sneakers?|dress|hat|cap|hoodie|pants|shorts|jacket|sofa|chair|loveseat|recliner)\b/i;
export function colourSuffix(title) {
  const t = String(title || "").trim();
  const m = SEP.exec(t);
  if (!m) return null;
  const colour = m[1].trim(), model = t.slice(0, m.index).trim();
  if (!colour || !model || colour.length > 40 || colour.split(/\s+/).length > 6) return null;
  if (NOT_A_COLOUR.test(colour) || !/[a-z]/i.test(colour) || /^new$/i.test(colour)) return null;
  if (model.split(/\s+/).length < 2) return null;
  return { model, colour };
}

const titleCase = (s) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
const slugWords = (s) => String(s || "").toLowerCase().replace(/['\u2019]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);

/* Snipes: <title>-<brand>-<colour, parts split by "---">-<style>-<id>.html */
export function snipesColour(url, title, brand) {
  const m = /\/([^\/?#]+)\.html/i.exec(String(url || ""));
  if (!m) return "";
  let s = m[1].toLowerCase().replace(/---+/g, "|").replace(/--+/g, "-");
  let toks = s.split("-").filter((x) => x !== "");
  /* The title's words, then the brand's, exactly in order: anything else
     and the colour cannot be told from the rest of the slug. */
  for (const w of [...slugWords(title), ...slugWords(brand)]) {
    if (toks.length && toks[0] === w) toks.shift();
    else return "";
  }
  while (toks.length && /^\d{6,}$/.test(toks[toks.length - 1])) toks.pop();
  let style = 0;
  while (toks.length && /\d/.test(toks[toks.length - 1].replace(/\|/g, ""))) { toks.pop(); style++; }
  if (!style) return "";
  if (!toks.length || toks.some((x) => /\d/.test(x))) return "";
  const parts = toks.join(" ").split("|").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return "";
  return parts.map(titleCase).join(" / ");
}
/* The store's style code for a listing, to tell two listings the store
   gives the same colour name apart: Snipes' style token, else the last
   code-like token of the URL path (letters and digits). */
export function styleCode(retailer, url) {
  const u = String(url || "").replace(/[?#].*$/, "");
  if (retailer === "snipes") {
    const m = /-([a-z0-9]*\d[a-z0-9]*(?:-\d+)?)-\d{6,}\.html$/i.exec(u);
    return m ? m[1].toUpperCase() : "";
  }
  const seg = (u.split("/").filter(Boolean).pop() || "").replace(/\.(html?|aspx)$/i, "");
  const m = /([a-z0-9]*\d[a-z0-9]*)$/i.exec(seg);
  return m && m[1].length >= 5 ? m[1].toUpperCase() : "";
}
export function revolveColour(url) {
  const m = /-in-([a-z0-9-]+)\/dp\//i.exec(String(url || ""));
  if (!m || /\d/.test(m[1])) return "";
  return titleCase(m[1].replace(/-/g, " "));
}
export function dicksColour(image) {
  const m = /\/[A-Z0-9]+_([A-Za-z]+(?:_[A-Za-z]+)*)_is\b/.exec(String(image || ""));
  return m ? m[1].split("_").join(" / ") : "";
}
export function footlockerSku(url) {
  const m = /\/([A-Za-z0-9]+)\.html(?:$|[?#])/.exec(String(url || ""));
  return m ? "Estilo " + m[1].toUpperCase() : "";
}
const SSENSE_COLOURS = new Set("black white red blue green brown gray grey beige navy pink purple yellow orange off-white cream tan khaki burgundy silver gold multicolor multicolour ivory taupe olive indigo ecru camel charcoal transparent khaki lavender violet maroon turquoise teal".split(" "));
export function ssenseLead(title) {
  const w = String(title || "").trim().split(/\s+/);
  let i = 0;
  while (i < w.length - 1 && (SSENSE_COLOURS.has(w[i].toLowerCase()) || (w[i] === "&" && i > 0))) i++;
  while (i > 0 && w[i - 1] === "&") i--;
  if (!i || w.length - i < 3) return null;
  return { colour: w.slice(0, i).join(" "), rest: w.slice(i).join(" ") };
}

const COLOUR_CORE = new Set("black white red blue green brown gray grey beige navy pink purple yellow orange cream tan khaki burgundy silver gold ivory taupe olive indigo ecru camel charcoal lavender violet maroon turquoise teal mint sage rust coral peach lilac plum wine cherry lime aqua sand stone bone gum bronze copper rose blush magenta fuchsia mustard emerald jade cobalt denim chocolate mocha espresso oatmeal tobacco multi multicolor".split(" "));
const COLOUR_MOD = new Set("light dark pale bright neon off core chalk cloud carbon dusky frozen royal sky forest hunter natural washed vintage heather smoke slate ash clear one metallic".split(" "));
export function midColour(title) {
  const w = String(title || "").trim().split(/\s+/);
  const bare = (t) => t.toLowerCase().replace(/[,]+$/, "");
  const isC = (t) => t === "&" || COLOUR_CORE.has(bare(t)) || COLOUR_MOD.has(bare(t));
  for (let i = 2; i < w.length - 1; i++) {
    if (!isC(w[i]) || w[i] === "&" || isC(w[i - 1])) continue;
    let j = i;
    while (j < w.length && isC(w[j])) j++;
    const run = w.slice(i, j), tail = w.slice(j);
    if (!tail.length || tail.length > 3 || run[run.length - 1] === "&") continue;
    if (!run.some((t) => COLOUR_CORE.has(bare(t)))) continue;
    return { model: w.slice(0, i).join(" "), colour: run.join(" ").replace(/,$/, ""), tail: tail.join(" ") };
  }
  return null;
}

/* PHASE 1 IS FASHION AND BEAUTY (the order: shoe colourways, clothing
   colours, makeup shades). Stores whose " - <option>" is a fragrance
   form, a furniture configuration, a flavour, a gadget or a jewellery
   letter / zodiac sign are left to a later phase. */
export const NOT_FASHION = new Set(["ariaperfumes", "costco", "pier1", "crateandbarrel", "sleekshop", "walmart", "walmartbaby",
  "bestbuy", "brandsmart", "microcenter", "bhphoto", "revzilla", "denniskirk", "advanceauto", "partycity", "samsclub",
  "assouline", "chronicle", "drbrowns", "spectra", "momcozy", "elvie", "babybrezza", "owlet", "nanit", "munchkin",
  "baublebar", "autozone"]);

const low = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

/* listings: [{ v, retailer, name, brand, url, image }] (one per v). Returns
   Map v -> { g, c } for every listing that belongs to a group of 2+. */
export function groupColourways(listings) {
  const buckets = new Map();
  const add = (key, l, label) => {
    if (!label) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ l, label });
  };
  const byTitle = new Map();
  for (const l of listings) {
    const r = String(l.retailer || "").toLowerCase();
    const k = r + "|" + low(l.brand) + "|" + low(l.name);
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(l);
  }
  const SAME_TITLE = { snipes: (l) => snipesColour(l.url, l.name, l.brand), revolve: (l) => revolveColour(l.url),
    dicks: (l) => dicksColour(l.image), footlocker: (l) => footlockerSku(l.url) };
  for (const l of listings) {
    const r = String(l.retailer || "").toLowerCase();
    if (NOT_FASHION.has(r)) continue;
    const suf = colourSuffix(l.name);
    if (suf) { add("suffix|" + r + "|" + low(l.brand) + "|" + low(suf.model), l, suf.colour); continue; }
    if (SAME_TITLE[r]) {
      if ((byTitle.get(r + "|" + low(l.brand) + "|" + low(l.name)) || []).length >= 2)
        add(r + "|" + low(l.brand) + "|" + low(l.name), l, SAME_TITLE[r](l));
      continue;
    }
    if (r === "zumiez") {
      const mid = midColour(l.name);
      if (mid) add("mid|" + r + "|" + low(l.brand) + "|" + low(mid.model) + "|" + low(mid.tail), l, mid.colour);
      continue;
    }
    if (r === "ssense") {
      const lead = ssenseLead(l.name);
      const gender = (/\/(men|women)\//.exec(String(l.url || "")) || [])[1] || "";
      if (lead && gender) add("lead|" + gender + "|" + low(l.brand) + "|" + low(lead.rest), l, lead.colour);
    }
  }
  const out = new Map();
  for (const [key, members] of buckets) {
    const photos = new Set(), byPhoto = [];
    for (const m of members) {
      const pk = String(m.l.image || "").replace(/[?#].*$/, "");
      if (pk && photos.has(pk)) continue;
      if (pk) photos.add(pk);
      byPhoto.push(m);
    }
    const count = new Map();
    for (const m of byPhoto) count.set(low(m.label), (count.get(low(m.label)) || 0) + 1);
    const labels = new Set(), kept = [];
    for (const m of byPhoto) {
      let label = m.label;
      /* Only where the store names colours apart from the title (a URL,
         a photo, SSENSE's lead word); two title-suffix listings with one
         colour name are one listing twice. */
      if (count.get(low(label)) > 1 && !key.startsWith("suffix|") && !key.startsWith("mid|")) {
        const code = styleCode(String(m.l.retailer || "").toLowerCase(), m.l.url);
        if (code && !/^estilo /i.test(label)) label = label + ", estilo " + code;
      }
      if (labels.has(low(label))) continue;
      labels.add(low(label));
      kept.push({ l: m.l, label });
    }
    if (kept.length < 2) continue;
    const g = groupIdOf(key);
    for (const m of kept) out.set(m.l.v, { g, c: m.label });
  }
  return out;
}
