/* ============================================================
   ROCKAUTO DIRECT HTTP FALLBACK (2026-09-26)

   Zero-Apify-spend live RockAuto scraper for Aria Auto. Every
   function here is pure and fetch-injected so the whole chain is
   unit-testable without touching the network:

     runRockautoLiveChain({ year, make, model, query, entries,
                            fetchHtml, courtesyDelayMs, deadlineMs })

   `entries` is the flat [es, en] pair list built from the shared
   glossary (scripts/lib/es-en-parts-glossary.json) — the same
   source the browser inline block is generated from.

   `fetchHtml(url)` returns the page HTML as a string, or null when
   the fetch failed/timed out. The Netlify function provides the
   real implementation (stock iPhone Safari UA, windows-1252
   decoding, courtesy delay); tests inject fixtures.

   Verified chain (2026-09-26, live probes):
     1. GET /en/catalog/{make},{year},{model}
        -> engine links WITH vehicle node ids:
           /en/catalog/honda,2010,civic,1.8l+l4,1444952
     2. GET <node url>
        -> category links (full slugs, incl. "&"):
           .../1444952,fuel+&+air
     3. GET <category url>
        -> part-type links: .../fuel+&+air,air+filter,6192
     4. GET <part-type url>
        -> listing containers with brand / part number / price / image

   RockAuto serves these pages with a plain browser user agent;
   no bot wall was hit in probing (sequential GETs ~1/sec, stock
   iPhone Safari UA). We keep a courtesy delay anyway — their
   catalog is the product, we are a guest.

   NAV TREE GOTCHA: the left nav lazy-loads children via JS
   (<div class="nchildren ra-hide" id="navchildren[N]"></div> is
   EMPTY in the raw HTML). But visiting a node/category URL
   directly makes the server render THAT node's children into the
   HTML, so prefix-anchored link parsing works without JS.

   SLUG GOTCHA: category slugs contain literal "&"
   (fuel+&+air). Parse the full href; do not truncate at "&".
   ============================================================ */

export const ROCKAUTO_BASE = "https://www.rockauto.com";

/* Stock iPhone Safari. Verified 2026-09-26: RockAuto answers 200
   to this UA on every catalog/listings page, no challenge. */
export const ROCKAUTO_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/* How long a cached live-search result stays warm. Parts catalogs
   move slowly; a week keeps repeat searches free. */
export const ROCKAUTO_LIVE_TTL_MS = 7 * 24 * 3600 * 1000;

/* Cap listings per search — the card grid does not need 40 rows
   of air filters and each row is bytes on the shopper's phone. */
export const ROCKAUTO_MAX_LISTINGS = 12;

/* Courtesy pause between sequential RockAuto requests. */
export const ROCKAUTO_COURTESY_DELAY_MS = 350;

/* Overall chain deadline. Four requests at ~1s each plus delays
   fits comfortably; past this we degrade to the friendly empty
   state instead of holding the shopper hostage. */
export const ROCKAUTO_CHAIN_DEADLINE_MS = 24000;

/* RockAuto declares windows-1252; prices carry the occasional
   non-ASCII byte. Decode accordingly, never as raw UTF-8. */
export const ROCKAUTO_CHARSET = "windows-1252";

/* ============================================================
   URL building
   ============================================================ */

export function rockautoSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "+");
}

export function rockautoCatalogUrl(year, make, model) {
  return `${ROCKAUTO_BASE}/en/catalog/${rockautoSlug(make)},${encodeURIComponent(
    String(year).trim(),
  )},${rockautoSlug(model)}`;
}

/* ============================================================
   HTML parsing — prefix-anchored, never guessed.
   ============================================================ */

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/* RockAuto writes catalog hrefs as root-relative
   (href="/en/catalog/...") with &amp;-encoded ampersands in the
   category slugs (fuel+&amp;+air). Resolve to absolute URLs and
   decode the ampersands once, up front, so every parser below
   works on the real URL shape. Other entities stay encoded until
   capture time (decodeEntities), so link text cannot inject tags. */
function absolutizeCatalogHrefs(html) {
  return String(html || "")
    .replace(/&amp;/g, "&")
    .replace(
      /href="\/en\/catalog\//g,
      `href="${ROCKAUTO_BASE}/en/catalog/`,
    );
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]*>/g, "")).trim();
}

/* Step 1: engine links carry the vehicle node id:
   <catalog-url>,{engine-slug},{nodeId}  ->  "1.8L L4" */
export function parseEngineLinks(html, catalogUrl) {
  html = absolutizeCatalogHrefs(html);
  const out = [];
  const prefix = String(catalogUrl || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<a[^>]*class="[^"]*navlabellink[^"]*"[^>]*href="(${prefix},[a-z0-9+._-]+,\\d+)"[^>]*>([\\s\\S]*?)</a>`,
    "gi",
  );
  let m;
  while ((m = re.exec(String(html || "")))) {
    const label = stripTags(m[2]);
    if (!label) continue;
    out.push({ url: decodeEntities(m[1]), label, nodeId: m[1].match(/,(\d+)$/)[1] });
  }
  return out;
}

/* A vehicle can list several engines (hybrid, CNG, Si...). The
   volume engine is the honest default for a shopper who picked
   only make/model/year; the returned label goes on the results
   so the card can say which engine the parts fit. */
export function pickEngine(engines) {
  const list = Array.isArray(engines) ? engines : [];
  if (!list.length) return null;
  const volume = list.find((e) => !/hybrid|electric|\bcng\b/i.test(e.label || ""));
  return volume || list[0];
}

/* Step 2: category links hang off the node URL with the FULL slug
   (fuel+&+air, brake+&+wheel+hub, ...). */
export function parseCategoryLinks(html, nodeUrl) {
  html = absolutizeCatalogHrefs(html);
  const out = [];
  const prefix = String(nodeUrl || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<a[^>]*class="[^"]*navlabellink[^"]*"[^>]*href="(${prefix},[^"]+?)"[^>]*>([\\s\\S]*?)</a>`,
    "gi",
  );
  let m;
  while ((m = re.exec(String(html || "")))) {
    const href = decodeEntities(m[1]);
    // A category is exactly one more path segment; deeper links are
    // part types and belong to step 3.
    if (href.slice(nodeUrl.length + 1).includes(",")) continue;
    const name = stripTags(m[2]);
    if (!name) continue;
    out.push({ url: href, name });
  }
  return out;
}

/* Step 3: part-type links hang off the category URL:
   <category-url>,{part-type-slug},{partTypeId} */
export function parsePartTypeLinks(html, categoryUrl) {
  html = absolutizeCatalogHrefs(html);
  const out = [];
  const prefix = String(categoryUrl || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<a[^>]*class="[^"]*navlabellink[^"]*"[^>]*href="(${prefix},[^"]+?,\\d+)"[^>]*>([\\s\\S]*?)</a>`,
    "gi",
  );
  let m;
  while ((m = re.exec(String(html || "")))) {
    const name = stripTags(m[2]);
    if (!name) continue;
    const idm = decodeEntities(m[1]).match(/,(\d+)$/);
    out.push({ url: decodeEntities(m[1]), name, partTypeId: idm ? idm[1] : "" });
  }
  return out;
}

/* Step 4: listings. Verified selectors 2026-09-26 against a live
   Air Filter page (12 containers):
     brand  span.listing-final-manufacturer      "FRAM"
     part#  span.listing-final-partnumber        "CA10165"
     price  span#dprice[N][v]                    "$4.12"
     image  img#inlineimg[N] src                 "/info/915/CA10165_Front__ra_m.jpg"
   The canary script fails loudly if RockAuto renames these. */
export function parseListings(html) {
  html = absolutizeCatalogHrefs(html);
  const items = [];
  const segments = String(html || "").split(/<div id="listingcontainer\[\d+\]"/);
  for (let i = 1; i < segments.length && items.length < ROCKAUTO_MAX_LISTINGS; i++) {
    const seg = segments[i];
    const brandM = seg.match(
      /<span[^>]*class="[^"]*listing-final-manufacturer[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    );
    const partM = seg.match(
      /<span[^>]*class="[^"]*listing-final-partnumber[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    );
    const priceM = seg.match(
      /<span[^>]*id="dprice\[\d+\]\[v\]"[^>]*>([\s\S]*?)<\/span>/i,
    );
    const imgM = seg.match(/<img[^>]*id="inlineimg\[\d+\]"[^>]*>/i);
    const brand = brandM ? stripTags(brandM[1]) : "";
    const partNumber = partM ? stripTags(partM[1]) : "";
    const priceText = priceM ? stripTags(priceM[1]) : "";
    const priceUsd = parsePriceUsd(priceText);
    const imgSrc = imgM ? (imgM[0].match(/\ssrc="([^"]+)"/i) || [])[1] || "" : "";
    if (!brand || !partNumber || priceUsd == null || !imgSrc) continue;
    items.push({ brand, partNumber, priceUsd, imagePath: decodeEntities(imgSrc) });
  }
  return items;
}

export function parsePriceUsd(text) {
  const m = String(text || "").replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* Relative RockAuto image paths ("/info/...") become absolute
   internally; the client only ever sees the Aria image proxy. */
export function rockautoAbsoluteImage(path) {
  const p = String(path || "");
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  return ROCKAUTO_BASE + (p.startsWith("/") ? p : "/" + p);
}

/* ============================================================
   Canonical EN term -> RockAuto category / part type.
   ============================================================ */

/* Curated first: the glossary's canonical EN term for the part the
   shopper asked about, pinned to the RockAuto category and
   part-type label it was verified against. Add rows here as new
   parts get verified — never guess a part-type id. */
export const ROCKAUTO_PART_TYPE_MAP = {
  "engine air filter": { category: /fuel/i, partType: /^air filter$/i },
  "cabin air filter": { category: /heat/i, partType: /cabin/i },
  "oil filter": { category: /^engine$/i, partType: /^oil filter$/i },
  "spark plug": { category: /ignition/i, partType: /^spark plug/i },
  "brake pads": { category: /brake/i, partType: /brake pad/i },
  "brake pad": { category: /brake/i, partType: /brake pad/i },
  "brake rotors": { category: /brake/i, partType: /rotor/i },
  "brake rotor": { category: /brake/i, partType: /rotor/i },
  "fuel filter": { category: /fuel/i, partType: /^fuel filter$/i },
  "oxygen sensor": { category: /exhaust|engine/i, partType: /^oxygen sensor$/i },
  "serpentine belt": { category: /belt/i, partType: /serpentine/i },
  "timing belt": { category: /engine/i, partType: /^timing belt/i },
  battery: { category: /electrical/i, partType: /^battery$/i },
  alternator: { category: /electrical/i, partType: /alternator/i },
  starter: { category: /electrical/i, partType: /starter/i },
  "shock absorber": { category: /suspension/i, partType: /shock/i },
  "headlight bulb": { category: /bulb/i, partType: /headlight/i },
  "wiper blade": { category: /wiper/i, partType: /wiper blade/i },
  thermostat: { category: /cooling/i, partType: /^thermostat/i },
  "water pump": { category: /cooling/i, partType: /^water pump/i },
  "pcv valve": { category: /engine|fuel/i, partType: /pcv/i },
};

const TERM_STOPWORDS = new Set(["the", "a", "an", "de", "del", "la", "el", "en"]);

function termTokens(term) {
  return String(term || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !TERM_STOPWORDS.has(t));
}

/* Token-overlap score of a candidate name against the EN term. */
function tokenScore(name, tokens) {
  if (!tokens.length) return 0;
  const flat = ` ${String(name || "").toLowerCase()} `;
  let hits = 0;
  for (const t of tokens) if (flat.includes(` ${t} `) || flat.includes(t)) hits++;
  return hits / tokens.length;
}

export function matchCategory(categories, enTerm) {
  const list = Array.isArray(categories) ? categories : [];
  const key = String(enTerm || "").toLowerCase().trim();
  const curated = ROCKAUTO_PART_TYPE_MAP[key];
  if (curated) {
    const hit = list.find((c) => curated.category.test(c.name || ""));
    if (hit) return hit;
  }
  const tokens = termTokens(enTerm);
  let best = null;
  let bestScore = 0;
  for (const c of list) {
    const s = tokenScore(c.name, tokens);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore > 0 ? best : null;
}

export function matchPartType(partTypes, enTerm) {
  const list = Array.isArray(partTypes) ? partTypes : [];
  const key = String(enTerm || "").toLowerCase().trim();
  const curated = ROCKAUTO_PART_TYPE_MAP[key];
  if (curated) {
    const hit = list.find((p) => curated.partType.test(p.name || ""));
    if (hit) return hit;
  }
  const tokens = termTokens(enTerm);
  let best = null;
  let bestScore = 0;
  for (const p of list) {
    const s = tokenScore(p.name, tokens);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return bestScore > 0 ? best : null;
}

/* ============================================================
   Spanish -> English, same semantics as the browser inline
   version (scripts/build-parts-glossary-inline.mjs): longest
   Spanish phrase first, whole words only, accent-insensitive.
   ============================================================ */

export function deaccentRockautoTerm(t) {
  return String(t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/* entries: flat [[es, en], ...] pairs from the shared glossary. */
export function translatePartQueryEsEn(entries, query) {
  let out = String(query || "").trim();
  if (!out) return out;
  const flat = deaccentRockautoTerm(out);
  const sorted = [...(entries || [])].sort((a, b) => b[0].length - a[0].length);
  for (const [es, en] of sorted) {
    const esFlat = deaccentRockautoTerm(es);
    const idx = flat.indexOf(esFlat);
    if (idx === -1) continue;
    // Whole words only: "foco" must not fire inside "enfocado".
    const before = flat[idx - 1];
    const after = flat[idx + esFlat.length];
    const isWordChar = (c) => c != null && /[a-z0-9]/.test(c);
    if (isWordChar(before) || isWordChar(after)) continue;
    return (out.slice(0, idx) + en + out.slice(idx + es.length))
      .replace(/\s+/g, " ")
      .trim();
  }
  return out;
}

/* Flatten the shared glossary JSON into the [es, en] pairs the
   translator consumes (es + synonyms_es -> en[0]). */
export function glossaryToPairs(glossary) {
  const pairs = [];
  for (const e of (glossary && glossary.entries) || []) {
    if (!e || !e.es || !Array.isArray(e.en) || !e.en.length) continue;
    for (const t of [e.es, ...((e && e.synonyms_es) || [])]) {
      if (t) pairs.push([t, e.en[0]]);
    }
  }
  return pairs;
}

/* ============================================================
   Cache key — mirrors autoPartCacheKey in index.html:
   {year}|{make}|{model}|{spanish-query}, lowercased.
   Accent-folding + whitespace collapsing keep "filtro de aire"
   and "Filtro  de Aire" on the same warm row.
   ============================================================ */

export function rockautoCacheKey(year, make, model, query) {
  const norm = (s) =>
    deaccentRockautoTerm(s).replace(/\s+/g, " ").trim();
  return [year, make, model, query].map(norm).join("|");
}

/* ============================================================
   The chain. Returns one of:
     { ok:true, items, engine, category, partType, steps }
     { ok:false, miss }   miss in:
       no-engine | no-category | no-part-type | no-listings |
       no-match | timeout | fetch-error
   A miss is a graceful catalog miss, never an exception — the
   shopper sees the friendly empty state, never a diagnostic.
   ============================================================ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runRockautoLiveChain({
  year,
  make,
  model,
  query,
  entries,
  fetchHtml,
  courtesyDelayMs = ROCKAUTO_COURTESY_DELAY_MS,
  deadlineMs = ROCKAUTO_CHAIN_DEADLINE_MS,
} = {}) {
  const started = Date.now();
  const timedOut = () => Date.now() - started > deadlineMs;
  const get = async (url) => {
    if (timedOut()) return { miss: "timeout" };
    if (courtesyDelayMs > 0) await sleep(courtesyDelayMs);
    if (timedOut()) return { miss: "timeout" };
    /* The injected fetch gets its own per-request timeout in
       production, but the chain must never hang on it: race the
       remaining deadline so a stuck socket degrades to the friendly
       empty state instead of holding the shopper hostage. */
    let timer;
    try {
      const html = await Promise.race([
        fetchHtml(url),
        new Promise((_, rej) => {
          timer = setTimeout(
            () => rej(new Error("__chain_timeout__")),
            Math.max(1, deadlineMs - (Date.now() - started)),
          );
        }),
      ]);
      if (html == null) return { miss: "fetch-error" };
      return { html };
    } catch (e) {
      return { miss: e && e.message === "__chain_timeout__" ? "timeout" : "fetch-error" };
    } finally {
      clearTimeout(timer);
    }
  };

  const enTerm = translatePartQueryEsEn(entries, query);
  if (!enTerm || !enTerm.trim()) return { ok: false, miss: "no-match" };

  const catalogUrl = rockautoCatalogUrl(year, make, model);
  let r = await get(catalogUrl);
  if (r.miss) return { ok: false, miss: r.miss };
  const engine = pickEngine(parseEngineLinks(r.html, catalogUrl));
  if (!engine) return { ok: false, miss: "no-engine" };

  r = await get(engine.url);
  if (r.miss) return { ok: false, miss: r.miss };
  const category = matchCategory(parseCategoryLinks(r.html, engine.url), enTerm);
  if (!category) return { ok: false, miss: "no-category" };

  r = await get(category.url);
  if (r.miss) return { ok: false, miss: r.miss };
  const partType = matchPartType(parsePartTypeLinks(r.html, category.url), enTerm);
  if (!partType) return { ok: false, miss: "no-part-type" };

  r = await get(partType.url);
  if (r.miss) return { ok: false, miss: r.miss };
  const items = parseListings(r.html).map((it) => ({
    ...it,
    engine: engine.label,
    category: category.name,
    partType: partType.name,
  }));
  if (!items.length) return { ok: false, miss: "no-listings" };

  return {
    ok: true,
    items,
    engine: engine.label,
    category: category.name,
    partType: partType.name,
    translatedQuery: enTerm,
  };
}
