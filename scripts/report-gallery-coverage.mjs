#!/usr/bin/env node
/* ==================================================================
   GALLERY COVERAGE (#443, comments 6304525284 / 6324227678).

   Danny and Ale: women's products especially need several photos.
   This measures, for every catalogue the PDP shards are built from
   (scripts/build-pdp-slices.mjs sourceFiles + auto-cache.json), the
   share of ON-SALE products whose data carries more than one REAL,
   DISTINCT photo -- the photos a shopper could swipe through on
   producto.html.

   COUNTING
   - The product page's own normalizeItem (lifted from producto.html)
     reads each record, so a photo it would never show is not counted:
     non-http, .svg, "placeholder" / "no-image" / spacer files.
   - Off-sale retailers (/off-sale.js) are left out entirely.
   - One product = one retailer + normalised title (a record listed
     both under a department and under a brand counts once; the copy
     with the most photos wins).
   - Distinct = after folding resized copies of one photo into one:
     the query string, size folders (images500x500/, 290pix/, a
     Cloudinary/Scene7 transform segment), size suffixes (_480x480,
     _1800x1800, Shopify _grande/_large...), and B&H's per-size copies
     of one shot. normalizeItem only folds host + path, so a gallery
     can SHOW more slides than it has photos; both figures are kept
     ("slides" vs "real").
   - Shared non-product images are left out: a photo used by 10 or
     more different products of one store (size charts, font charts,
     fit guides, promo banners) is not a photo OF the product -- unless
     it is that product's own card photo.

   DEPARTMENTS are this report's own grouping (title + the catalogue's
   type + the bucket it sits in), see deptOf(): lingerie & intimates
   and swim come first, then footwear / beauty / jewelry / bags, then
   apparel by gender, then the non-fashion departments.

   RUN
     node scripts/report-gallery-coverage.mjs        -> prints the tables
     node scripts/report-gallery-coverage.mjs --json -> also writes
                                    reports/gallery-coverage.json
   Read-only on the catalogues; no network.
   ================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { liftPage, sourceFiles } from "./build-pdp-slices.mjs";
import { isOffSaleRetailer } from "./lib/off-sale.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SHARED_MIN = 10;

/* ---------- one photo, whatever size it was saved at ---------- */
export function photoKey(u) {
  const m = String(u || "").match(/^https?:\/\/([^\/?#\s]+)([^?#\s]*)/i);
  if (!m) return null;
  const host = m[1].toLowerCase();
  let path = decodeURIComponent(m[2]).toLowerCase();
  /* B&H keeps every shot at 500x500, 345x345, 150x150 and a "fb" copy:
     .../images500x500/<slug>_<ts>_<id>.jpg, .../images345x345/<ts>_<id>.jpg,
     .../fb/<slug>_<id>.jpg -- one photo per <ts>_<id> (the fb copy is the
     card shot). */
  if (/bhphoto\.com$/.test(host)) {
    const t = path.match(/(\d{9,11})_(\d+)\.\w+$/);
    if (t) return "bh:" + t[2] + ":" + t[1];
    const f = path.match(/_(\d+)\.\w+$/);
    if (f) return "bh:" + f[1] + ":fb";
  }
  path = path
    .split("/")
    .filter((seg) => !/^(images)?\d+x\d+$|^\d+pix$|^t_[\w-]+$|^[a-z]_[\w%,.-]+(,[a-z]_[\w%,.-]+)*$/.test(seg))
    .join("/");
  path = path
    .replace(/[_-](\d+x\d*|x\d+)(@\dx)?(?=\.\w+$|$)/, "")
    .replace(/_(pico|icon|thumb|small|compact|medium|large|grande|original|master|1024x1024|2048x2048)(@\dx)?(?=\.\w+$|$)/, "")
    .replace(/\.(jpe?g|png|webp|avif|gif)$/, "");
  return host + path;
}

/* The real, distinct photos of a gallery (shown = normalizeItem's list). */
export function realPhotos(shown, sharedSet, cardPhoto) {
  const keys = [], seen = new Set();
  for (const u of shown) {
    const bare = String(u).replace(/[?#].*$/, "");
    if (sharedSet && sharedSet.has(bare) && u !== cardPhoto) continue;
    let k = photoKey(u);
    if (!k) continue;
    /* A B&H card copy is the same shot as one of the sized copies. */
    if (k.startsWith("bh:") && k.endsWith(":fb")) { if (keys.some((x) => x.startsWith(k.slice(0, -2)))) continue; }
    else if (k.startsWith("bh:")) { const fb = k.replace(/:\d+$/, ":fb"); const i = keys.indexOf(fb); if (i >= 0) { keys.splice(i, 1); seen.delete(fb); } }
    if (seen.has(k)) continue;
    seen.add(k); keys.push(k);
  }
  return keys.length;
}

/* ---------- departments ---------- */
const RX = {
  lingerie: /\b(bras?|bralettes?|brassieres?|panty|panties|thongs?|g-?string|briefs?|hipsters?|cheeky|boyshorts?|lingerie|intimates?|shapewear|corsets?|bustiers?|garters?|teddy|chemise|slip dress|camisoles?|underwear|boxers?|boxer briefs|trunks|sleepwear|pajamas?|pyjamas?|pj|robes?|loungewear|nightgowns?|nightshirts?|bodysuits?|bodys|nursing (bra|tank|cami)|calzones|sostenes?|brasier|tangas?|ropa interior|pijamas?)\b/i,
  swim: /\b(bikinis?|swim\w*|one[- ]piece|tankini|monokini|cover[- ]?ups?|boardshorts?|board shorts|trajes? de ba[ñn]o|ba[ñn]adores?|beachwear|sarongs?|pareos?|kaftans?|caftans?|rash ?guards?|swimsuits?)\b/i,
  footwear: /\b(shoes?|sneakers?|boots?|booties|sandals?|slides|heels?|pumps|loafers?|clogs?|flip[- ]?flops?|mules?|espadrilles?|zapatillas?|sandalias?|chimpunes?|calzado|zapatos?|cleats?|slippers?)\b/i,
  beauty: /\b(makeup|lipstick|lip (gloss|liner|oil|balm)|mascara|eyeliner|eyeshadow|palette|foundation|concealer|blush|bronzer|highlighter|primer|serum|moisturi[sz]er|cleanser|skin ?care|fragrance|perfume|eau de|cologne|nail polish|cuidado de la piel|rostro|fragancia|belleza|labios|ojos|shampoo|conditioner)\b/i,
  jewelry: /\b(earrings?|necklaces?|bracelets?|rings?|pendants?|anklets?|jewel(ry|lery)|chokers?|charms?|joyer[ií]a|aretes?|collares?|pulseras?|anillos?|brooch|pins?|sunglasses|lentes de sol|hair (clips?|accessories)|headbands?|scrunchies?|belts?|scarf|scarves|watch(es)?)\b/i,
  bags: /\b(handbags?|purses?|totes?|crossbody|backpacks?|clutch(es)?|wallets?|mochilas?|carteras?|bolsos?|shoulder bags?|duffle|top handle|satchel|hobo|bag)\b/i,
  apparel: /\b(sweatshirts?|hoodies?|t-?shirts?|tees?|tops?|blouses?|shirts?|sweaters?|cardigans?|jackets?|coats?|jeans|denim|pants|trousers|leggings|shorts|skirts?|dress(es)?|gowns?|jumpsuits?|rompers?|joggers?|polos?|vests?|blazers?|tanks?|camis?|tunics?|kimonos?|sets?|co-?ords?|overalls?|sweatpants|knit|pullovers?|turtlenecks?|crop|corsets?|outerwear|apparel|clothing|ropa|camisetas?|casacas|chompas|pantal[oó]n(es)?|vestidos?|faldas|polos y camisetas|socks?|medias|gorras?|hats?|caps?|beanies?|gi|spats|maternity|maternidad)\b/i,
  women: /\b(women'?s?|womens|woman|ladies|lady|mujer(es)?|moda_mujer|for her|her|girls?'? ?(?!s? ?(size|kids))|femenin[oa]|maternity|maternidad|nursing)\b/i,
  men: /\b(men'?s?|mens|man|hombres?|moda_hombre|for him|him|masculin[oa]|boys?)\b/i,
  kids: /\b(kids?|kid's|toddlers?|baby|babies|infant|youth|juniors?|ni[ñn][oa]s?|moda_ninos|little (girls?|boys?)|big (girls?|boys?)|boys'?|girls'?)\b/i,
};
const WOMEN_STORES = new Set(["lanebryant", "revolve", "farmrio", "aguabendita", "patbo", "johannaortiz", "silviatcherassi", "capittana",
  "ancora", "vix", "montce", "eberjey", "tns", "kindredbravely", "bellybandit", "meliebianco"]);
const NONFASHION = [
  [/^(electronics|bhphoto)$/, "Electronics"],
  [/auto_parts|^motos$|advanceauto|revzilla|denniskirk/, "Auto & moto"],
  [/toys|juguetes|toys_games/, "Toys"],
  [/^moms$|^kids$/, "Baby, kids & moms (non-apparel)"],
  [/books/, "Books"],
  [/sporting|combat|fitness|skate|surf/, "Sports & outdoor gear"],
];

/* it: the normalised item; raw: the catalogue row (type), dept: the bucket. */
export function deptOf(it, raw, dept) {
  const t = String(it.name || "");
  const type = String((raw && (raw.type || raw.typeName)) || "").replace(/_/g, " ");
  const d = String(dept || "").replace(/_/g, " ");
  const text = t + " | " + type;
  const all = text + " | " + d;
  const genderFrom = (s) => (RX.kids.test(s) && !/\bwomen|\bmen\b/i.test(s) ? "kids" : RX.women.test(s) ? "women" : RX.men.test(s) ? "men" : RX.kids.test(s) ? "kids" : "");
  let gender = genderFrom(t) || genderFrom(type) || genderFrom(d) || (WOMEN_STORES.has(it.retailer) ? "women" : "")
    || (it.retailer === "skims" ? (/^men/i.test(d) ? "men" : "women") : "");
  if (it.retailer === "farfetch" && /^(WOMEN|MEN)$/.test(type)) gender = type === "WOMEN" ? "women" : "men";
  const combat = /combat/.test(d);
  /* Buckets that decide on their own (a lipstick called "Lip Lingerie",
     a "Teddy Bear" charm, a "BRA-126" fluid, a book called "Intimate"). */
  if (it.retailer === "sephora" || /beauty/.test(d)) return "Beauty";
  if (/^(electronics)$/.test(d) || it.retailer === "bhphoto") return "Electronics";
  if (/auto_parts|^motos$/.test(d)) return "Auto & moto";
  if (/^books$/.test(d)) return "Books";
  if (/toys/.test(d)) return "Toys";
  if (/^(jewelry|jewelry_accessories|elegante|boho_hippie|personalizado|otaku|edgy|punk_rocker|fan_shop|personajes|ninos|novedad|otros|sunglasses)$/.test(dept || "")) return RX.bags.test(t) ? "Bags" : "Jewelry & accessories";
  if (/^(home_goods|home_decor|small_home|candy_chocolate)$/.test(dept || "") || it.retailer === "partycity" || it.retailer === "samsclub") return "Home, party & grocery";
  const fashionStore = WOMEN_STORES.has(it.retailer) || /^(farfetch|skims|hatch|islandwatersports|surfstation|valsurf|parrot|ccs|mainland|quietstorm|zumiez|walmart|abercrombie|hollister|americaneagle|dicks)$/.test(it.retailer);
  const anime = /\b(luffy|zoro|sanji|chopper|anime|funko|pacifier|seat|race suit|bracket|edition)\b/i;
  const swim = RX.swim.test(text.replace(/\bone[- ]piece\b/gi, "")) || /\btrunks\b/i.test(t) && !/boxer/i.test(t)
    || (/\bone[- ]piece\b/i.test(text) && fashionStore && !anime.test(text));
  if (swim && !combat) return gender === "men" || /\btrunks\b/i.test(t) ? "Swim (men)" : gender === "kids" ? "Swim (kids)" : "Swim (women)";
  const lingText = text.replace(/\bbra-?free\b|\bthong (sandals?|flip[- ]?flops?)\b/gi, "");
  if (RX.lingerie.test(lingText) && !/\bbriefcase|phone case/i.test(t) && !(/moms/.test(d) && !/\b(bra|bralette|nursing|pajama|robe|sleep|underwear)/i.test(text))) {
    const womanly = /\b(bras?|bralettes?|panty|panties|thongs?|lingerie|corsets?|bustiers?|camisoles?|chemise|teddy|nightgowns?|bodysuits?|cheeky|nursing|maternity|shapewear|slip dress|boyshorts?|hipsters?)\b/i.test(lingText);
    if (gender === "men" || (!gender && /\bboxers?\b|boxer briefs?/i.test(t))) return "Underwear & sleepwear (men)";
    if (gender === "kids") return "Underwear & sleepwear (kids)";
    if (gender === "women" || womanly) return "Lingerie & intimates (women)";
    return "Underwear & sleepwear (gender not stated)";
  }
  if (RX.footwear.test(text) || /shoes|footwear|calzado/.test(d)) return "Footwear";
  if (/accesorios/.test(d) && !RX.apparel.test(t)) return RX.bags.test(t) ? "Bags" : "Jewelry & accessories";
  if (RX.bags.test(text) || /purses/.test(d)) return "Bags";
  if (RX.jewelry.test(text) && !RX.apparel.test(type)) return "Jewelry & accessories";
  for (const [rx, label] of NONFASHION) if (rx.test(d.replace(/ /g, "_")) && !(/^kids$/.test(d) && RX.apparel.test(text) && !/bentgo|mushie|ezpz|statebags/.test(it.retailer))) {
    if (label === "Sports & outdoor gear" && RX.apparel.test(type || t) && !/gloves|pads|mitts|bag|belt|board|deck|truck|helmet|fin|mask/i.test(type || t)) break;
    return label;
  }
  const fashionBucket = /women|men|kids|cloth|apparel|fashion|moda|latino|luxury|gym rat|general|clearance|sporting|combat/.test(d);
  if (RX.apparel.test(text) || (fashionBucket && /women|men|kids|cloth|apparel|fashion|moda|latino|luxury|gym rat/.test(d))) {
    if (gender === "women") return "Women's apparel";
    if (gender === "men") return "Men's apparel";
    if (gender === "kids") return "Kids' apparel";
    return "Apparel (gender not stated)";
  }
  if (/home|decor|candy|party|plates|napkins|balloons|small home/.test(d)) return "Home, party & grocery";
  return "Other (general merchandise)";
}

/* ---------- the walk ---------- */
export function measure(root = ROOT) {
  const P = liftPage(root);
  const files = sourceFiles(P);
  const rows = [];           // { file, retailer, name, shown, card, dept, raw }
  for (const f of files) {
    const p = root + f.slice(1);
    if (!existsSync(p)) continue;
    const data = JSON.parse(readFileSync(p, "utf8"));
    const rs = (data && data.retailers) || {};
    for (const rk of Object.keys(rs)) {
      for (const section of ["departments", "brands"]) {
        const sec = rs[rk] && rs[rk][section];
        if (!sec || typeof sec !== "object") continue;
        for (const sk of Object.keys(sec)) {
          const b = sec[sk];
          const arr = Array.isArray(b) ? b : b && Array.isArray(b.items) ? b.items : [];
          for (const raw of arr) {
            const it = P.normalizeItem(raw, rk);
            if (!it) continue;
            rows.push({ file: f, retailer: it.retailer, key: it.retailer + "|" + P.norm(it.name), it, raw, dept: section === "departments" ? sk : "" });
          }
        }
      }
    }
  }
  /* Photos one store uses for many different products. */
  const use = new Map();
  for (const r of rows) for (const u of r.it.images) {
    const k = r.retailer + " " + String(u).replace(/[?#].*$/, "");
    if (!use.has(k)) use.set(k, new Set());
    use.get(k).add(r.key);
  }
  const sharedByStore = new Map();
  for (const [k, s] of use) if (s.size >= SHARED_MIN) {
    const [store, url] = [k.slice(0, k.indexOf(" ")), k.slice(k.indexOf(" ") + 1)];
    if (!sharedByStore.has(store)) sharedByStore.set(store, new Set());
    sharedByStore.get(store).add(url);
  }
  /* One product per store + title; the copy with the most photos. */
  const products = new Map();
  for (const r of rows) {
    const shared = sharedByStore.get(r.retailer);
    const real = realPhotos(r.it.images, shared, r.it.image);
    const slides = r.it.images.length || (r.it.image ? 1 : 0);
    const prev = products.get(r.file + "|" + r.key);
    if (prev && (prev.real > real || (prev.real === real && prev.dept))) continue;
    products.set(r.file + "|" + r.key, { file: r.file, retailer: r.retailer, name: r.it.name, real, slides,
      offSale: isOffSaleRetailer(r.retailer), dept: deptOf(r.it, r.raw, r.dept || (prev && prev.bucket) || ""), bucket: r.dept || (prev && prev.bucket) || "" });
  }
  /* auto-cache.json (the auto-pn / auto-t shards). */
  const auto = { products: 0, multi: 0 };
  if (existsSync(root + "auto-cache.json")) {
    const c = JSON.parse(readFileSync(root + "auto-cache.json", "utf8"));
    const seen = new Set();
    for (const k in c.partSearches || {}) for (const src in c.partSearches[k] || {}) for (const rec of c.partSearches[k][src] || []) {
      const it = P.normalizeItem({ name: rec.productTitle || rec.title, price: rec.price, thumbnail: rec.thumbnail, images: rec.images }, "autozone");
      if (!it) continue;
      const key = P.norm(it.name);
      if (seen.has(key)) continue;
      seen.add(key);
      auto.products++;
      if (realPhotos(it.images, null, it.image) > 1) auto.multi++;
    }
  }
  return { files, products: [...products.values()], sharedByStore, auto };
}

function pct(a, b) { return b ? (100 * a / b).toFixed(1) + "%" : "-"; }
function agg(list) {
  const n = list.length, multi = list.filter((p) => p.real > 1).length, slides = list.filter((p) => p.slides > 1).length;
  const avg = n ? list.reduce((s, p) => s + p.real, 0) / n : 0;
  const three = list.filter((p) => p.real >= 3).length;
  return { n, multi, slides, three, avg };
}
function row(label, a, extra = "") {
  return `| ${label} | ${a.n} | ${a.multi} | ${pct(a.multi, a.n)} | ${pct(a.three, a.n)} | ${a.avg.toFixed(2)} | ${pct(a.slides, a.n)} |${extra}`;
}
const HEAD = "| | on-sale products | >1 real photo | share | 3+ photos | avg real photos | PDP shows >1 slide |\n|---|---:|---:|---:|---:|---:|---:|";

export function tables(m) {
  const on = m.products.filter((p) => !p.offSale);
  const out = [];
  const total = agg(on);
  out.push("### Headline\n", HEAD, row("**All on-sale catalogues**", total));
  const auto = m.auto;
  out.push(`| auto-cache.json (AutoZone parts, auto shards) | ${auto.products} | ${auto.multi} | ${pct(auto.multi, auto.products)} | - | - | - |`);
  out.push("");
  /* Departments. */
  const byDept = new Map();
  for (const p of on) { if (!byDept.has(p.dept)) byDept.set(p.dept, []); byDept.get(p.dept).push(p); }
  const FOCUS = ["Women's apparel", "Lingerie & intimates (women)", "Swim (women)"];
  out.push("### By department (women's apparel, lingerie and swim first)\n", HEAD);
  const depts = [...byDept.keys()].sort((a, b) => (FOCUS.indexOf(a) + 1 || 99) - (FOCUS.indexOf(b) + 1 || 99) || byDept.get(b).length - byDept.get(a).length);
  for (const d of depts) out.push(row(FOCUS.includes(d) ? `**${d}**` : d, agg(byDept.get(d))));
  out.push("");
  /* Focus departments by store. */
  for (const d of FOCUS) {
    const list = byDept.get(d) || [];
    const byStore = new Map();
    for (const p of list) { if (!byStore.has(p.retailer)) byStore.set(p.retailer, []); byStore.get(p.retailer).push(p); }
    out.push(`#### ${d}, by store\n`, HEAD.replace("| |", "| store |"));
    for (const [s, l] of [...byStore].sort((a, b) => b[1].length - a[1].length)) out.push(row(s, agg(l)));
    out.push("");
  }
  /* Catalogues. */
  out.push("### By catalogue (on-sale retailers only)\n", HEAD.replace("| |", "| catalogue (on-sale stores) |"));
  const byFile = new Map();
  for (const p of m.products) { if (!byFile.has(p.file)) byFile.set(p.file, []); byFile.get(p.file).push(p); }
  const offOnly = [];
  for (const f of m.files) {
    const l = byFile.get(f) || [];
    const onl = l.filter((p) => !p.offSale);
    const stores = [...new Set(onl.map((p) => p.retailer))];
    const off = [...new Set(l.filter((p) => p.offSale).map((p) => p.retailer))];
    if (!onl.length) { offOnly.push(`${f} (${l.length ? "off sale: " + off.join(", ") : "no records"})`); continue; }
    const a = agg(onl);
    const flag = a.multi / a.n < 0.5 ? " **low**" : "";
    out.push(row(`${f.slice(1)} (${stores.length > 4 ? stores.length + " stores" : stores.join(", ")})${off.length ? " -- excl. " + off.join(", ") : ""}${flag}`, a));
  }
  out.push("", "Not counted (every record off sale, or no records): " + offOnly.join("; ") + ".", "");
  /* Stores. */
  out.push("### By store (on sale)\n", HEAD.replace("| |", "| store |"));
  const byStore = new Map();
  for (const p of on) { if (!byStore.has(p.retailer)) byStore.set(p.retailer, []); byStore.get(p.retailer).push(p); }
  for (const [s, l] of [...byStore].sort((a, b) => agg(a[1]).multi / a[1].length - agg(b[1]).multi / b[1].length)) out.push(row(s, agg(l)));
  out.push("");
  /* Galleries that show one photo twice (at two sizes) or a shared chart. */
  const dup = new Map();
  for (const p of on) if (p.slides > p.real && p.slides > 1) { if (!dup.has(p.retailer)) dup.set(p.retailer, { n: 0, extra: 0 }); const x = dup.get(p.retailer); x.n++; x.extra += p.slides - p.real; }
  out.push("### PDP galleries that repeat a photo (resized copy) or show a shared chart\n", "| store | products affected | extra slides | share of the store's products |", "|---|---:|---:|---:|");
  for (const [s, x] of [...dup].sort((a, b) => b[1].n - a[1].n)) out.push(`| ${s} | ${x.n} | ${x.extra} | ${pct(x.n, byStore.get(s).length)} |`);
  out.push("");
  return { md: out.join("\n"), total, byDept: Object.fromEntries(depts.map((d) => [d, agg(byDept.get(d))])), byStore: Object.fromEntries([...byStore].map(([s, l]) => [s, agg(l)])) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = measure();
  const t = tables(m);
  console.log(t.md);
  const shared = [...m.sharedByStore].map(([s, set]) => `${s}: ${set.size}`).join(", ");
  console.log(`Shared non-product photos left out (used by ${SHARED_MIN}+ products of one store): ${shared || "none"}`);
  if (process.argv.includes("--json")) {
    writeFileSync(ROOT + "reports/gallery-coverage.json", JSON.stringify({ total: t.total, auto: m.auto, byDept: t.byDept, byStore: t.byStore }, null, 1) + "\n");
  }
}
