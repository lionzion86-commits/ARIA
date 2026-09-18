// Detects rendered price text burned into a product image.
//
// WHY THIS EXISTS
// The image comes from the US retailer and shows the US sticker price. Our
// price adds roughly 24% for international shipping, duties and IGV, so an
// image with a price on it ALWAYS understates what the customer actually
// pays. Side by side with our higher number it reads as bait-and-switch,
// which is the one thing a cross-border store cannot afford to look like.
//
// TWO LAYERS
//   containsPriceText(text)      pure string check, no dependencies
//   detectPriceTextInImage(buf)  OCR the image, then run the check
//
// The pure layer is deliberately separable: it is what the tests exercise
// exhaustively, and it lets callers screen OCR text they already have
// without paying for another OCR pass.
//
// FALSE POSITIVES ARE CHEAP, FALSE NEGATIVES ARE NOT
// A wrongly-rejected image costs us the next image in the list. A missed
// one puts a misleading price in front of a customer. So the patterns lean
// strict, and the unit exclusions below exist only to stop the obvious
// non-price decimals (2.4 GHz, 1.5 L, 10.5 oz) from eating entire product
// lines.

// Units that commonly follow a decimal number on packaging and specs. A
// decimal followed by one of these is a measurement, not a price.
const UNIT_AFTER = String.raw`(?:\s?(?:g|kg|mg|lbs?|oz|ml|l|fl|cm|mm|m|in|ft|yd|"|''|GHz|MHz|Hz|GB|TB|MB|kB|V|W|kW|Ah|mAh|MP|K|%|x|×|pk|ct|pcs?|pack|inch(?:es)?|liters?|litros?|gal))\b`;

const PATTERNS = [
  // $12, $ 12.99, US$30, USD 30 — a currency mark next to a number.
  { name: "dollar", re: /(?:US\s?\$|\$|USD\s*\$?)\s?\d/i },
  // S/ 45.90, S/. 45 — Peruvian soles.
  { name: "soles", re: /S\s?\/\s?\.?\s?\d/i },
  // PEN 45, 45 PEN
  { name: "pen-code", re: /\bPEN\s?\d|\d\s?PEN\b/i },
  // "precio", "price", "oferta", "sale" immediately next to a number.
  { name: "price-word", re: /\b(?:price|precio|sale|oferta|now|ahora|was|antes|reg(?:ular)?|only|solo|desde|from)\b[^0-9\n]{0,12}\d/i },
  // 24.99 / 24,99 with no unit after it — the classic bare price.
  { name: "bare-decimal", re: new RegExp(String.raw`\d+[.,]\d{2}(?!${UNIT_AFTER})(?![.,]?\d)`, "i") },
  // 9 99 / 9⁹⁹ style split pricing seen on sale tags.
  { name: "cents-superscript", re: /\d+\s?[⁰¹²³⁴⁵⁶⁷⁸⁹]{2}/ },
];

// Version strings, dates and dimensions that would otherwise trip
// bare-decimal. Checked against the whole matched neighbourhood.
const NOT_PRICE = [
  /\bv\s?\d+[.,]\d{2}\b/i,          // v1.50
  /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/, // dates (kept narrow on purpose)
  /\b\d+[.,]\d{2}\s?[-–x×]\s?\d/i,  // 10.50 x 20 dimensions
];

/**
 * @param {string} text  text extracted from (or associated with) an image
 * @returns {{hasPrice: boolean, matches: string[], reasons: string[]}}
 */
export function containsPriceText(text) {
  const raw = typeof text === "string" ? text : "";
  if (!raw.trim()) return { hasPrice: false, matches: [], reasons: [] };

  // OCR output is line-oriented and noisy; evaluate per line so a unit on
  // one line cannot suppress a price on another.
  const lines = raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  const matches = [];
  const reasons = [];

  for (const line of lines) {
    if (NOT_PRICE.some((re) => re.test(line))) continue;
    for (const { name, re } of PATTERNS) {
      const m = line.match(re);
      if (m) {
        matches.push(m[0].trim());
        reasons.push(name);
      }
    }
  }
  return { hasPrice: matches.length > 0, matches: [...new Set(matches)], reasons: [...new Set(reasons)] };
}

/**
 * OCR an image buffer and screen it for price text.
 *
 * `ocr` is injected rather than imported so this module stays dependency
 * free: the scanner supplies a tesseract.js worker, and the tests can
 * supply a stub. Signature: (buffer) => Promise<string>.
 *
 * @returns {{hasPrice: boolean, matches: string[], reasons: string[], text: string, ok: boolean}}
 *   ok=false means OCR itself failed — the caller must decide, and must NOT
 *   treat an unreadable image as verified clean.
 */
export async function detectPriceTextInImage(buffer, ocr) {
  let text = "";
  try {
    text = await ocr(buffer);
  } catch (err) {
    return { hasPrice: false, matches: [], reasons: ["ocr-failed"], text: "", ok: false, error: err.message };
  }
  return { ...containsPriceText(text), text, ok: true };
}

/**
 * Picks the first image with no price text.
 *
 * @param {string[]} urls      candidate image URLs, in preference order
 * @param {(url:string)=>Promise<{hasPrice:boolean,ok:boolean,matches?:string[]}>} check
 * @returns {{clean: string|null, quarantined: Array<{url:string,matches:string[]}>, unreadable: string[]}}
 *
 * An image OCR could not read is never promoted to "clean" — it goes to
 * `unreadable` and the product falls through to manual review, because
 * "we could not check it" is not the same as "it is fine".
 */
export async function pickCleanImage(urls, check) {
  const quarantined = [];
  const unreadable = [];
  for (const url of urls) {
    const res = await check(url);
    if (!res.ok) { unreadable.push(url); continue; }
    if (res.hasPrice) { quarantined.push({ url, matches: res.matches || [] }); continue; }
    return { clean: url, quarantined, unreadable };
  }
  return { clean: null, quarantined, unreadable };
}
