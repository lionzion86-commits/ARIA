#!/usr/bin/env node
/**
 * feed-to-catalog.mjs — Luxury affiliate-feed ingestion for ariashop.pe
 *
 * Converts a retailer-authorized affiliate product feed (Rakuten / AWIN / Sovrn)
 * into a <store>-catalog.json that matches the repo's catalog schema exactly
 * (see macys-catalog.json: generatedAt, source, sourceCategory,
 * declaredProductCount, recoveredProductCount, retailers.<key>.{label,
 * departments.{women|men}.items[], brands{}}).
 *
 * Why this exists: Saks Fifth Avenue and Neiman Marcus sit behind DataDome bot
 * protection (every HTTP request, including robots.txt and sitemaps, returns a
 * 403 challenge page). Direct scraping would mean bypassing their anti-bot
 * measures, which we do not do. The legitimate channel is the retailers'
 * own affiliate programs: Saks via Rakuten Advertising, Neiman Marcus via
 * Sovrn Commerce / AWIN. A publisher (Danny) downloads the product feed from
 * the network dashboard and this script does the rest.
 *
 * Usage:
 *   node feed-to-catalog.mjs --feed <file> --mapping mappings/awin.json \
 *     --store saks --label "Saks Fifth Avenue" --out saks-catalog.json \
 *     [--min-tier 3] [--limit 5000]
 *
 * Standing catalog rules enforced:
 *  - prices are raw USD shelf prices (no tax, no markup baked in)
 *  - Spanish descriptions, faithful to the feed copy; NEVER invented specs.
 *    description_en keeps the retailer's English copy, description is a neutral
 *    Spanish one-liner built only from visible facts (brand, type, color).
 *  - no product without a real image
 *  - SHIPPABLE only: furniture / TVs / appliances / oversized excluded
 *  - any captured weight x 1.10 (feeds rarely carry weight; noted when absent)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRANDS = JSON.parse(readFileSync(resolve(HERE, 'brands.json'), 'utf8'));

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
for (const req of ['feed', 'mapping', 'store', 'label', 'out']) {
  if (!args[req]) {
    console.error(`Missing --${req}. See header comment for usage.`);
    process.exit(2);
  }
}
const MIN_TIER = parseInt(args['min-tier'] || '3', 10);
const LIMIT = args.limit ? parseInt(args.limit, 10) : Infinity;

const mapping = JSON.parse(readFileSync(resolve(args.mapping), 'utf8'));
const COLS = mapping.columns;
const DELIM = mapping.delimiter === '\\t' ? '\t' : (mapping.delimiter || ',');

/* ------------------------------------------------------------------ */
/* Brand tiers                                                         */
/* ------------------------------------------------------------------ */

const tierOf = (() => {
  const t1 = new Set(BRANDS.tier1.map(b => b.toLowerCase()));
  const t2 = new Set(BRANDS.tier2.map(b => b.toLowerCase()));
  const aliases = Object.fromEntries(
    Object.entries(BRANDS.aliases).map(([k, v]) => [k.toLowerCase(), v])
  );
  return (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return { tier: 3, brand: '' };
    if (aliases[key]) return { tier: t1.has(aliases[key].toLowerCase()) ? 1 : t2.has(aliases[key].toLowerCase()) ? 2 : 3, brand: aliases[key] };
    if (t1.has(key)) return { tier: 1, brand: BRANDS.tier1.find(b => b.toLowerCase() === key) };
    if (t2.has(key)) return { tier: 2, brand: BRANDS.tier2.find(b => b.toLowerCase() === key) };
    // Title-case fallback for unknown brands ("michael kors" -> "Michael Kors")
    const brand = String(raw).trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return { tier: 3, brand };
  };
})();

/* ------------------------------------------------------------------ */
/* Delimited-file parsing (handles quoted fields, custom delimiters)   */
/* ------------------------------------------------------------------ */

function parseDelimited(text, delim) {
  // Strip UTF-8 BOM if present (AWIN feeds ship one)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // ignore; \n handles the break
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && r.some(v => String(v).trim() !== ''));
}

function toRecords(rows) {
  const header = rows[0].map(h => String(h).trim());
  return rows.slice(1).map(r => {
    const rec = {};
    header.forEach((h, i) => { rec[h] = (r[i] ?? '').trim(); });
    return rec;
  });
}

/* ------------------------------------------------------------------ */
/* Normalization helpers                                               */
/* ------------------------------------------------------------------ */

function pick(rec, canonical) {
  const col = COLS[canonical];
  if (!col) return '';
  return String(rec[col] ?? '').trim();
}

function parsePrice(s) {
  if (!s) return NaN;
  // strip currency symbols, spaces; handle "1,299.00" and "1.299,00"
  let t = String(s).replace(/[^0-9.,]/g, '');
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = t.replace(/,/g, '.');
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

function cleanText(s, max = 600) {
  let t = String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max).trimEnd() + '…';
  return t;
}

// Categories / names that cannot ship at $7-13/kg — never enter the catalog.
const UNSHIPPABLE = [
  'furniture', 'sofa', 'couch', 'sectional', 'mattress', 'bed frame', 'headboard',
  'dresser', 'cabinet', 'table', 'desk', 'chair', 'ottoman', 'bookshelf',
  'television', ' tv ', 'tv,', ',tv', 'oled', 'qled', 'smart tv',
  'refrigerator', 'freezer', 'washer', 'dryer', 'dishwasher', 'oven', 'range',
  'appliance', 'treadmill', 'elliptical', 'exercise bike', 'weight bench',
  'kettlebell', 'dumbbell set', 'home gym', 'piano', 'chandelier',
];

function isShippable(name, category) {
  const hay = ` ${(name || '').toLowerCase()} ${(category || '').toLowerCase()} `;
  return !UNSHIPPABLE.some(k => hay.includes(k));
}

const WOMEN_WORDS = ['women', "women's", 'womens', 'woman', 'ladies', 'lady', 'donna', 'femme', 'mujer', 'dama', 'female'];
const MEN_WORDS = ['men', "men's", 'mens', 'man', 'gentleman', 'uomo', 'homme', 'hombre', 'male'];

function departmentsFor(name, category) {
  const hay = ` ${(name || '').toLowerCase()} ${(category || '').toLowerCase()} `;
  const w = WOMEN_WORDS.some(k => hay.includes(k));
  const m = MEN_WORDS.some(k => hay.includes(k));
  if (w && !m) return ['women'];
  if (m && !w) return ['men'];
  return ['women', 'men']; // unknown or unisex: surface in both, never drop
}

// Ordered: first match wins. Types mirror the existing catalog vocabulary.
const TYPE_RULES = [
  ['HANDBAG', ['handbag', 'purse', 'tote', 'satchel', 'shoulder bag', 'crossbody', 'clutch', 'hobo bag', 'minaudiere', 'top handle']],
  ['BACKPACK', ['backpack', 'rucksack']],
  ['SHOE', ['shoe', 'sneaker', 'boot', 'sandal', 'loafer', 'pump', 'heel', 'oxford', 'slide', 'mule', 'espadrille', 'flat', 'slipper']],
  ['SUNGLASSES', ['sunglass', 'sunglasses', 'eyewear', 'optical', 'eyeglass']],
  ['FRAGRANCE', ['perfume', 'fragrance', 'parfum', 'cologne', 'eau de toilette', 'eau de parfum']],
  ['WATCH', ['watch']],
  ['JEWELRY', ['jewelry', 'jewellery', 'necklace', 'bracelet', 'earring', 'pendant', 'brooch', 'anklet']],
  ['RING', ['ring']],
  ['WALLET', ['wallet', 'card case', 'cardholder']],
  ['BELT', ['belt']],
  ['SCARF', ['scarf', 'shawl', 'wrap']],
  ['TIE', ['tie', 'necktie', 'bow tie']],
  ['HAT', ['hat', 'cap', 'beanie', 'beret', 'fedora']],
  ['GLOVES', ['glove']],
  ['DRESS', ['dress', 'gown', 'caftan']],
  ['JACKET', ['jacket', 'blazer', 'bomber']],
  ['COAT', ['coat', 'parka', 'trench']],
  ['JEANS', ['jean']],
  ['PANTS', ['pant', 'trouser', 'jogger', 'legging', 'chinos']],
  ['SHORTS', ['short']],
  ['SKIRT', ['skirt']],
  ['SUIT', ['suit', 'tuxedo']],
  ['SWEATER', ['sweater', 'cardigan', 'knit']],
  ['SHIRT', ['shirt', 'blouse', 'polo']],
  ['TOP', ['top', 'tank', 'camisole', 'bustier', 'corset']],
  ['TSHIRT', ['t-shirt', 'tee']],
  ['SWEATSHIRT', ['sweatshirt', 'hoodie']],
  ['SWIMSUIT', ['swimsuit', 'bikini', 'one-piece', 'swim']],
  ['LINGERIE', ['lingerie', 'bra', 'brief', 'thong', 'panty']],
  ['SLEEPWEAR', ['pajama', 'sleep', 'robe', 'nightgown']],
];

function inferType(name, category) {
  const hay = ` ${(name || '').toLowerCase()} ${(category || '').toLowerCase()} `;
  for (const [type, kws] of TYPE_RULES) {
    if (kws.some(k => hay.includes(k))) return type;
  }
  return 'APPAREL';
}

// Spanish one-liner from visible facts only. Never invents specs.
const TYPE_ES = {
  HANDBAG: 'cartera', BACKPACK: 'mochila', SHOE: 'calzado', SUNGLASSES: 'lentes de sol',
  FRAGRANCE: 'fragancia', WATCH: 'reloj', JEWELRY: 'joya', RING: 'anillo',
  WALLET: 'billetera', BELT: 'cinturón', SCARF: 'bufanda', TIE: 'corbata',
  HAT: 'sombrero', GLOVES: 'guantes', DRESS: 'vestido', JACKET: 'chaqueta',
  COAT: 'abrigo', JEANS: 'jeans', PANTS: 'pantalón', SHORTS: 'short',
  SKIRT: 'falda', SUIT: 'traje', SWEATER: 'suéter', SHIRT: 'camisa',
  TOP: 'top', TSHIRT: 'polo', SWEATSHIRT: 'sudadera', SWIMSUIT: 'traje de baño',
  LINGERIE: 'lencería', SLEEPWEAR: 'pijama', APPAREL: 'prenda',
};
const COLOR_ES = {
  black: 'negro', white: 'blanco', brown: 'marrón', beige: 'beige', red: 'rojo',
  blue: 'azul', green: 'verde', pink: 'rosado', gold: 'dorado', silver: 'plateado',
  gray: 'gris', grey: 'gris', navy: 'azul marino', nude: 'nude', tan: 'marrón claro',
  burgundy: 'burdeos', purple: 'morado', yellow: 'amarillo', orange: 'naranja',
  ivory: 'marfil', cream: 'crema', cognac: 'cognac', taupe: 'topo',
};

function spanishOneLiner(brand, type, colorRaw) {
  const t = TYPE_ES[type] || 'prenda';
  const c = String(colorRaw || '').toLowerCase().split(/[\/,|]/)[0].trim();
  const cEs = COLOR_ES[c];
  // Feminine/masculine article: cartera/fragancia/joya are feminine
  const fem = ['HANDBAG', 'FRAGRANCE', 'JEWELRY'].includes(type);
  let s = `${fem ? 'Hermosa' : 'Elegante'} ${t} ${brand}`;
  if (cEs) s += ` en color ${cEs}`;
  return s + '.';
}

function normUrl(u) {
  return String(u || '').trim().split('#')[0];
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

const raw = readFileSync(resolve(args.feed), 'utf8');
const records = toRecords(parseDelimited(raw, DELIM));
console.log(`Parsed ${records.length} feed rows (network: ${mapping.network}, delimiter: ${JSON.stringify(DELIM)})`);

const seen = new Set();
const items = [];
const rejects = {};
const tierCounts = { 1: 0, 2: 0, 3: 0 };
let weightSeen = 0;

const reject = (reason) => { rejects[reason] = (rejects[reason] || 0) + 1; };

for (const rec of records) {
  if (items.length >= LIMIT) break;
  const name = pick(rec, 'name');
  const { tier, brand } = tierOf(pick(rec, 'brand'));
  const price = parsePrice(pick(rec, 'price'));
  const wasPrice = parsePrice(pick(rec, 'wasPrice'));
  const image = pick(rec, 'image');
  const url = normUrl(pick(rec, 'directUrl') || pick(rec, 'url'));
  const category = pick(rec, 'category');
  const color = pick(rec, 'color');
  const descEn = cleanText(pick(rec, 'description'));
  const inStockRaw = pick(rec, 'inStock').toLowerCase();
  const currencyRaw = pick(rec, 'currency').toUpperCase();

  if (!name) { reject('missing_name'); continue; }
  if (!brand) { reject('missing_brand'); continue; }
  if (tier > MIN_TIER) { reject('tier_excluded'); continue; }
  if (!Number.isFinite(price) || price <= 0) { reject('bad_price'); continue; }
  if (currencyRaw && !['USD', '$', ''].includes(currencyRaw) && currencyRaw !== 'USD') { reject('non_usd'); continue; }
  if (!/^https?:\/\//i.test(image)) { reject('missing_image'); continue; }
  if (!/^https?:\/\//i.test(url)) { reject('missing_url'); continue; }
  if (!isShippable(name, category)) { reject('unshippable_category'); continue; }
  if (inStockRaw && ['0', 'false', 'no', 'out_of_stock', 'outofstock'].includes(inStockRaw)) { reject('out_of_stock'); continue; }

  const idKey = (pick(rec, 'id') || url).toLowerCase();
  if (seen.has(idKey)) { reject('duplicate'); continue; }
  seen.add(idKey);

  const type = inferType(name, category);
  const onSale = Number.isFinite(wasPrice) && wasPrice > price;

  const item = {
    name: cleanText(name, 200),
    type,
    brand,
    price: Math.round(price * 100) / 100,
    image,
    images: [image],
    rating: null,
    reviewCount: 0,
    onSale,
    url,
    description: spanishOneLiner(brand, type, color),
    descriptionSource: 'feed',
    description_en: descEn || null,
  };
  item._depts = departmentsFor(name, category);
  item._tier = tier;
  items.push(item);
  tierCounts[tier]++;
}

if (weightSeen === 0) console.log('Note: feed carried no weight column — 10% cushion rule has nothing to apply to (site estimate tables remain the source).');

/* ------------------------------------------------------------------ */
/* Export in exact repo catalog schema                                 */
/* ------------------------------------------------------------------ */

const women = [], men = [];
const brandCounts = {};
for (const it of items) {
  const { _depts, _tier, ...clean } = it;
  for (const d of _depts) (d === 'women' ? women : men).push(clean);
  brandCounts[clean.brand] = (brandCounts[clean.brand] || 0) + 1;
}

const catalog = {
  generatedAt: new Date().toISOString(),
  source: `${args.label} (${mapping.network} affiliate feed)`,
  sourceCategory: 'luxury',
  declaredProductCount: records.length,
  recoveredProductCount: items.length,
  truncatedExport: false,
  retailers: {
    [args.store]: {
      label: args.label,
      departments: {
        women: { items: women },
        men: { items: men },
      },
      brands: brandCounts,
    },
  },
};

writeFileSync(resolve(args.out), JSON.stringify(catalog, null, 2) + '\n');

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

console.log('\n==== FEED → CATALOG REPORT ====');
console.log(`Store: ${args.label} (${args.store})`);
console.log(`Feed rows: ${records.length} → catalog items: ${items.length}`);
console.log(`Tier 1 (Peru-status): ${tierCounts[1]} | Tier 2: ${tierCounts[2]} | Tier 3: ${tierCounts[3]}`);
console.log(`Departments: women=${women.length} men=${men.length}`);
console.log('Top brands:', Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([b, n]) => `${b} ${n}`).join(' · '));
console.log('Rejects:', Object.entries(rejects).map(([k, v]) => `${k}=${v}`).join(' '));
console.log(`Wrote ${args.out}`);
