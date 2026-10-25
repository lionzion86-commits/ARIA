/* ==================================================================
   THE PRODUCT PAGE SHOWS EVERY PHOTO AGAIN (#434, #440).

   Since #409 T1 (PR #425) producto.html reads one product from a shard
   of assets/pdp/p/, and the shard record kept only the card photo: every
   product page showed one photo (68/68 in the Diseñadores audit, 52/52
   in the PDP audit) although the catalogues carry the store's gallery
   (Agua Bendita 6 a product, New Balance up to 10, Gymshark 5-8). The
   same build also dropped the #411 size provenance (sizesTier /
   sizesSource: 0/68 records carried it).

   These checks hold the gallery in place:
   - every catalogue item's shard record unpacks to the gallery the
     page's own normalizeItem makes of it (real http photos, one copy
     each, card photo first, at most 12) and carries its sizesTier /
     sizesSource;
   - in a real browser (headless Chromium, 390px phone): an Agua Bendita
     product with 6 photos shows 6 gallery slots, a New Balance shoe its
     full set, a Gymshark product 4+; swiping and tapping thumbnails
     reach every slot; only the first photo loads with the page; the
     photo box is square before and after the photos; nothing in the
     gallery links anywhere; no emoji.

   Retailer photo CDNs are unreachable from the sandbox, so the browser
   run answers every off-site photo with a local stand-in (/__photo.jpg)
   and counts slots and loaded photos, not pixels.

   RUNNING IT
     node scripts/test/pdp-gallery-tests.mjs
   PLAYWRIGHT_CHROMIUM=<path> picks the Chromium binary (default
   /opt/pw-browsers/chromium when present). SKIP_BROWSER=1 runs the data
   checks only. PDP_GALLERY_PORT=<port> pins the local server's port
   (default: any free port).
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, extname } from "node:path";
import { liftDeclarations } from "../lib/page-lift.mjs";
import { liftPage, sourceFiles, autoRecOf } from "../build-pdp-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PDP = ROOT + "assets/pdp/";
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const page = readFileSync(ROOT + "producto.html", "utf8").replace(/\r\n/g, "\n");
const P = liftPage(ROOT);
const R = liftDeclarations(page, ["unpackImages", "recordToItem"]);
const shardCache = new Map();
const shard = (s) => {
  if (!shardCache.has(s)) shardCache.set(s, JSON.parse(readFileSync(PDP + "p/" + s + ".json", "utf8")));
  return shardCache.get(s);
};
const lookup = (key) => shard(P.pdpShard(key))[key] || null;
const hostPath = (u) => { const m = String(u).match(/^https?:\/\/([^\/?#\s]+)([^?#\s]*)/i); return m ? m[1].toLowerCase() + m[2] : null; };
const galleryOf = (it) => (it.images && it.images.length ? it.images : it.image ? [it.image] : []);

/* Every catalogue item, as the page's normalizeItem makes it. */
const all = [];
for (const f of sourceFiles(P)) {
  const p = ROOT + f.slice(1);
  if (!existsSync(p)) continue;
  for (const it of P.extractItems(JSON.parse(readFileSync(p, "utf8")))) all.push({ f, it });
}

await check("normalizeItem's gallery: real http photos, one copy each, card photo first, at most 12", () => {
  const n = P.normalizeItem({ title: "T", price: 10, image: "https://x.com/a.jpg?v=1",
    images: ["https://x.com/a.jpg?v=2", "//x.com/b.jpg", "data:image/png;base64,AAA", "/rel.jpg", "https://x.com/placeholder.png", "https://x.com/b.jpg?w=10",
      { src: "https://x.com/c.jpg" }, ...Array.from({ length: 20 }, (_, i) => "https://x.com/p" + i + ".jpg")] }, "s");
  assert.deepEqual(JSON.parse(JSON.stringify(n.images.slice(0, 3))), ["https://x.com/a.jpg?v=1", "https://x.com/b.jpg", "https://x.com/c.jpg"]);
  assert.equal(n.images.length, 12);
  assert.equal(P.normalizeItem({ title: "T", price: 1, image: "https://x.com/a.jpg" }, "s").images.length, 1);
  assert.equal(P.normalizeItem({ title: "T", price: 1, sizesTier: "scrape", sizesSource: "https://s/p" }, "s").sizesTier, "scrape");
});

await check("every catalogue item's shard record carries its whole gallery and its size provenance", () => {
  let multi = 0, tiered = 0, photos = 0;
  const misses = [];
  for (const { f, it } of all) {
    const cands = lookup(P.norm(it.name)) || [];
    const want = galleryOf(it);
    const hit = cands.some((r) => {
      const got = R.recordToItem(r);
      return r.name === it.name && Number(r.price) === it.price && (r.image || "") === it.image
        && JSON.stringify(got.images) === JSON.stringify(want)
        && got.sizesTier === (it.sizesTier || "") && got.sizesSource === (it.sizesSource || "");
    });
    if (!hit) misses.push(`${f}: ${it.name}`);
    if (want.length > 1) multi++;
    if (it.sizesTier) tiered++;
    photos += want.length;
  }
  assert.deepEqual(misses.slice(0, 8), [], `${misses.length} of ${all.length} items lost photos or provenance in their shard (rebuild: node scripts/build-pdp-slices.mjs)`);
  assert.ok(multi > 100000, `only ${multi} records with a gallery`);
  assert.ok(tiered > 40000, `only ${tiered} records with size provenance`);
  console.log(`         (${all.length} items: ${multi} with 2+ photos, ${photos} photos, ${tiered} with sizesTier/sizesSource)`);
});

await check("every stored gallery unpacks to real, distinct photos, card photo first", () => {
  let recs = 0;
  for (let i = 0; i < 4096; i++) {
    const s = ("00" + i.toString(16)).slice(-3);
    for (const cands of Object.values(shard(s))) for (const r of cands) {
      recs++;
      if (!r.images) continue;
      const g = R.unpackImages(r.images, r.image);
      assert.ok(g.length >= 1 && g.length <= 12, `${r.name}: ${g.length} photos`);
      assert.ok(g.every((u) => /^https?:\/\//.test(u)), `${r.name}: a non-http photo`);
      assert.equal(new Set(g.map(hostPath)).size, g.length, `${r.name}: the same photo twice`);
      if (/^https?:\/\//.test(r.image || "")) assert.equal(g[0], r.image, `${r.name}: the gallery does not open on the card photo`);
    }
    shardCache.delete(s);
  }
  assert.ok(recs > 140000);
});

/* GALLERY COVERAGE (#443, c.6304525284): the page renders a gallery
   WHEREVER the data has one -- every shard record, not three samples. */
const G = liftDeclarations(page, ["esc", "declaredImageWidth", "sizedImageUrl", "galleryPhotoKey", "galleryIsChart", "tidyGallery", "galleryList", "galleryHTML", "unpackImages", "recordToItem"]);
/* DANNY'S GALLERY POLICY (#443): one copy of each photo (a photo at
   another size is the same photo), size charts kept but last, the
   retailer's photos otherwise in the retailer's order. producto.html
   tidyGallery does it, inside normalizeItem (so in every shard) and
   again in galleryList (so on every page). */
const raws = new Map();          // retailer|name -> the catalogue row
const RAW_STORES = new Set(["bhphoto", "revzilla", "denniskirk", "baublebar", "skims", "aguabendita", "elite"]);
for (const f of sourceFiles(P)) {
  const p = ROOT + f.slice(1);
  if (!existsSync(p)) continue;
  const rs = JSON.parse(readFileSync(p, "utf8")).retailers || {};
  for (const rk of Object.keys(rs)) for (const section of ["departments", "brands"]) for (const b of Object.values((rs[rk] || {})[section] || {})) {
    for (const raw of Array.isArray(b) ? b : (b && b.items) || []) {
      const it = P.normalizeItem(raw, rk);
      if (it && RAW_STORES.has(it.retailer) && !raws.has(it.retailer + "|" + it.name)) raws.set(it.retailer + "|" + it.name, raw);
    }
  }
}
/* The gallery as it was before the policy: host + path decide, at most 12. */
function hostPathGallery(raw) {
  const out = [], seen = new Set();
  const card = raw.thumbnail || raw.image || (Array.isArray(raw.images) && raw.images[0]) || "";
  for (let u of [card].concat(Array.isArray(raw.images) ? raw.images : [])) {
    if (out.length >= 12) break;
    if (u && typeof u === "object") u = u.src || u.url || "";
    u = String(u || "").trim();
    if (u.startsWith("//")) u = "https:" + u;
    const k = hostPath(u);
    if (!k || /\.svg$|placeholder|no[-_]?image|spacer\.gif/i.test(k) || seen.has(k)) continue;
    seen.add(k); out.push(u);
  }
  return out;
}
const shardGallery = (it) => {
  const r = (lookup(P.norm(it.name)) || []).find((x) => x.name === it.name && (x.retailer || "") === it.retailer && (x.image || "") === it.image);
  return r ? plain(R.unpackImages(r.images, r.image)) : null;
};
function plain(x) { return JSON.parse(JSON.stringify(x)); }
const keysOf = (g) => g.map((u) => P.galleryPhotoKey(u));
const chartsLast = (g) => { const c = g.map((u, i) => i > 0 && P.galleryIsChart(u)); return !c.some((x, i) => x && c.slice(i + 1).some((y) => !y)); };

await check("tidyGallery: one copy per photo whatever its size, charts last, the card first, order kept", () => {
  const bh = "https://static.bhphoto.com/images/";
  assert.deepEqual(plain(P.tidyGallery([bh + "fb/sony_a7_v_mirrorless_camera_1935439.jpg", bh + "images500x500/sony_a7_v_mirrorless_camera_1764667996_1935439.jpg",
    bh + "images345x345/1764667996_1935439.jpg", bh + "images150x150/1764667996_1935439.jpg", bh + "smallimages/1764667996_1935439.jpg",
    bh + "multiple_images/images500x500/1764668011_IMG_2624210.jpg", bh + "multiple_images/images500x500/1764668011_IMG_2624211.jpg"], 12)),
    [bh + "fb/sony_a7_v_mirrorless_camera_1935439.jpg", bh + "multiple_images/images500x500/1764668011_IMG_2624210.jpg", bh + "multiple_images/images500x500/1764668011_IMG_2624211.jpg"]);
  const rz = "https://www.revzilla.com/product_images/2616/";
  assert.deepEqual(plain(P.tidyGallery([rz + "7402/helmet_grey_480x480.jpg", rz + "7402/helmet_grey_1800x1800.jpg", rz + "7419/helmet_thumb.jpg", rz + "7402/helmet_grey.jpg", rz + "7402/helmet_grey_thumb.jpg"], 12)),
    [rz + "7402/helmet_grey_480x480.jpg", rz + "7419/helmet_thumb.jpg"]);
  const dk = "https://www.denniskirk.com/dk/product_images/oe/";
  assert.deepEqual(plain(P.tidyGallery([dk + "290pix/oe_1b16.jpg", dk + "75pix/oe_1b16.jpg", dk + "600pix/oe_1b16.jpg", dk + "290pix/oe_2c27.jpg"], 12)), [dk + "290pix/oe_1b16.jpg", dk + "290pix/oe_2c27.jpg"]);
  const s = "https://cdn.shopify.com/s/files/1/0030/files/";
  /* The size chart goes last; the card never moves; a .gif is not the still of the same name. */
  assert.deepEqual(plain(P.tidyGallery([s + "gi_1.jpg?v=1", s + "gi_2.jpg", s + "gi-size-chart.jpg", s + "gi_3.jpg", s + "gi_3.jpg?v=9", s + "gi_3.gif", s + "Paracord_FontChart_Gold_vis.jpg"], 12)),
    [s + "gi_1.jpg?v=1", s + "gi_2.jpg", s + "gi_3.jpg", s + "gi_3.gif", s + "gi-size-chart.jpg", s + "Paracord_FontChart_Gold_vis.jpg"]);
  assert.deepEqual(plain(P.tidyGallery([s + "size-chart.png", s + "a.jpg"], 12)), [s + "size-chart.png", s + "a.jpg"], "the card photo moved");
  /* Not charts: a product named Charter, a deck "size_80in", a SKIMS swatch and GIF, a helmet called Grid. */
  for (const u of [s + "Charter_Backpack_Blk_3.png", s + "Creature_Skateboard_Deck_size_80inx318in_1800x.webp", s + "SKIMS-FITSEVERYBODY-JSP-SW.jpg",
    "https://www.revzilla.com/product_images/1/2/bell_race_star_flex_dlx_grid_helmet_yellow_thumb.jpg", s + "cottonrib_tank_boxer.gif"]) assert.equal(P.galleryIsChart(u), false, u);
  for (const u of [s + "5033-Size-Chart.png", s + "ugg-all-gender-size-guide.png", s + "STATE_25_KANE_FAM_SIZE_COMPARISON_CHART_1.png", s + "Birthstone_Chart_1_RS_SQ_2026_x.jpg",
    s + "108982_G_Grid_vis.jpg", s + "Pisa_Sizes_3456_Label_6mm_x_RS_SQ_2026.jpg", s + "WaterproofInitals_ColorChart_102925_vis.jpg"]) assert.equal(P.galleryIsChart(u), true, u);
  /* Repeats go before the cap: 12 real photos survive 12 copies. */
  const many = []; for (let i = 0; i < 12; i++) many.push(dk + "290pix/oe_p" + i + ".jpg", dk + "75pix/oe_p" + i + ".jpg");
  assert.equal(P.normalizeItem({ title: "T", price: 1, image: many[0], images: many }, "denniskirk").images.length, 12);
});

await check("B&H and RevZilla product pages no longer repeat a photo at another size", () => {
  const out = {};
  for (const store of ["bhphoto", "revzilla", "denniskirk"]) {
    let products = 0, before = 0, after = 0, fewer = 0;
    for (const [k, raw] of raws) {
      if (!k.startsWith(store + "|")) continue;
      const it = P.normalizeItem(raw, store);
      const g = shardGallery(it);
      assert.ok(g, `${it.name}: no shard record`);
      const old = hostPathGallery(raw);
      assert.equal(new Set(keysOf(g)).size, g.length, `${it.name}: a photo twice in ${JSON.stringify(g)}`);
      assert.equal(g[0], it.image, `${it.name}: the gallery does not open on the card photo`);
      products++; before += old.length; after += g.length; if (g.length < old.length) fewer++;
    }
    out[store] = { products, slidesBefore: before, slidesAfter: after, galleriesShortened: fewer };
    assert.ok(products > 1000 && fewer > 0.8 * products, `${store}: ${JSON.stringify(out[store])}`);
  }
  /* The B&H camera from the report: 7 slides of 3 photos. */
  const a7 = raws.get("bhphoto|Sony a7 V Mirrorless Camera");
  assert.ok(a7, "the Sony a7 V left the B&H catalogue -- pick another");
  assert.equal(hostPathGallery(a7).length, 7);
  assert.deepEqual(shardGallery(P.normalizeItem(a7, "bhphoto")).map((u) => u.split("/").pop()), ["sony_a7_v_mirrorless_camera_1935439.jpg", "1764668011_IMG_2624210.jpg", "1764668011_IMG_2624211.jpg"]);
  console.log("         (" + Object.entries(out).map(([s, x]) => `${s}: ${x.products} products, ${x.galleriesShortened} shortened, ${x.slidesBefore} -> ${x.slidesAfter} slides`).join("; ") + ")");
});

await check("size charts are kept and come last (BaubleBar, Elite); SKIMS galleries keep the retailer's order", () => {
  let withChart = 0, moved = 0, skims = 0, skimsCharts = 0;
  const photos = (l) => l.filter((u, i) => !i || !P.galleryIsChart(u));
  for (const [k, raw] of raws) {
    const store = k.slice(0, k.indexOf("|"));
    if (store !== "skims" && store !== "baublebar" && store !== "elite") continue;
    const it = P.normalizeItem(raw, store);
    const g = shardGallery(it);
    const old = hostPathGallery(raw);
    if (store === "skims") {
      skims++;
      skimsCharts += g.filter((u, i) => i && P.galleryIsChart(u)).length;
      /* No SKIMS chart: where nothing repeats, the gallery is exactly the retailer's. */
      if (new Set(keysOf(old)).size === old.length) assert.deepEqual(g, old, `${it.name}: SKIMS order changed`);
      continue;
    }
    if (!g.some((u, i) => i && P.galleryIsChart(u))) continue;
    withChart++;
    assert.ok(chartsLast(g), `${it.name}: a chart before a photo: ${JSON.stringify(g)}`);
    /* Kept, not dropped: every chart the old 12 showed is still there. */
    for (const u of old.slice(1)) if (P.galleryIsChart(u) && new Set(keysOf(old)).size === old.length) assert.ok(g.includes(u), `${it.name}: chart ${u} dropped`);
    if (JSON.stringify(g) !== JSON.stringify(old)) moved++;
    /* The photos keep the retailer's order. */
    assert.deepEqual(photos(g), photos(old).filter((u) => g.includes(u)), `${it.name}: photo order changed`);
  }
  assert.ok(withChart > 1000 && moved > 200, `${withChart} galleries with a chart, ${moved} reordered`);
  assert.ok(skims > 2000, `${skims} SKIMS products`);
  assert.equal(skimsCharts, 0, "SKIMS data now carries a size chart -- check it sits last");
  console.log(`         (${withChart} BaubleBar/Elite galleries carry a chart, all last; ${moved} reordered; ${skims} SKIMS galleries keep the retailer's order)`);
});

await check("a normal multi-photo product keeps every photo in the retailer's order", () => {
  let n = 0;
  for (const [k, raw] of raws) {
    if (!k.startsWith("aguabendita|")) continue;
    const it = P.normalizeItem(raw, "aguabendita");
    const old = hostPathGallery(raw);
    if (old.length < 4) continue;
    assert.deepEqual(shardGallery(it), old, `${it.name}: gallery changed`);
    n++;
  }
  assert.ok(n > 300, `only ${n} Agua Bendita galleries`);
  console.log(`         (${n} Agua Bendita galleries of 4+ photos unchanged)`);
});

await check("full shard sweep: 0 galleries repeat a photo, 0 show a size chart before a photo", () => {
  let recs = 0, galleries = 0, withChart = 0;
  const dup = [], late = [];
  for (let i = 0; i < 4096; i++) {
    const s = ("00" + i.toString(16)).slice(-3);
    for (const cands of Object.values(shard(s))) for (const r of cands) {
      recs++;
      if (!r.images) continue;
      galleries++;
      const g = R.unpackImages(r.images, r.image);
      if (new Set(keysOf(g)).size !== g.length) dup.push(`${r.retailer}: ${r.name}`);
      if (!chartsLast(g)) late.push(`${r.retailer}: ${r.name}`);
      if (g.some((u, i) => i && P.galleryIsChart(u))) withChart++;
      /* The page's own pass is a no-op on a tidy gallery. */
      if (JSON.stringify(G.galleryList({ images: g, image: r.image })) !== JSON.stringify(g)) dup.push(`${r.name}: galleryList changes it`);
    }
    shardCache.delete(s);
  }
  assert.deepEqual(dup.slice(0, 8), [], `${dup.length} galleries repeat a photo`);
  assert.deepEqual(late.slice(0, 8), [], `${late.length} galleries show a chart before a photo`);
  console.log(`         (${recs} records, ${galleries} galleries: 0 repeat a photo, 0 show a chart before a photo; ${withChart} carry a chart, last)`);
});

await check("producto.html's gallery drops a repeat and moves a chart last even from an untidy record", () => {
  const s = "https://cdn.shopify.com/s/files/1/0030/files/";
  const html = G.galleryHTML({ name: "T", image: s + "a.jpg", images: [s + "a.jpg", s + "a_1800x1800.jpg", s + "size-chart.png", s + "b.jpg"] });
  const slides = [...html.matchAll(/class="g-slide"[^>]*><img [^>]*data-img-orig="([^"]+)"/g)].map((m) => m[1].split("/").pop());
  assert.deepEqual(slides, ["a.jpg", "b.jpg", "size-chart.png"]);
  assert.match(html, /data-count="3"/);
});

await check("producto.html renders the gallery for every shard record with 2+ photos, and one photo otherwise", () => {
  let multi = 0, single = 0;
  const bad = [];
  for (let i = 0; i < 4096; i++) {
    const s = ("00" + i.toString(16)).slice(-3);
    for (const cands of Object.values(shard(s))) for (const r of cands) {
      const item = G.recordToItem(r);
      const photos = item.images.filter((u) => /^https?:\/\//i.test(u)).slice(0, 12);
      const html = G.galleryHTML(item);
      const slides = (html.match(/class="g-slide"/g) || []).length;
      const thumbs = (html.match(/class="g-thumb"/g) || []).length;
      if (photos.length > 1) {
        multi++;
        if (!html.includes(`class="p-gallery" data-count="${photos.length}"`) || slides !== photos.length || thumbs !== photos.length) bad.push(`${r.name}: ${photos.length} photos, ${slides} slides`);
      } else {
        single++;
        if (html.includes("p-gallery") || slides) bad.push(`${r.name}: one photo drew a gallery`);
      }
    }
    shardCache.delete(s);
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} records render the wrong gallery`);
  assert.ok(multi > 100000, `only ${multi} records render a gallery`);
  console.log(`         (${multi} records render a swipe gallery, ${single} a single photo)`);
});

await check("the AutoZone part shard keeps the part's whole gallery (it kept images[0] only)", () => {
  const rec = { productTitle: "Brake Pad Set", price: 40, thumbnail: "https://a.example/p1.jpg", part_number: "X1",
    images: ["https://a.example/p1.jpg", "https://a.example/p2.jpg", "https://a.example/p3.jpg"] };
  const out = autoRecOf(rec);
  assert.deepEqual(out.images, rec.images);
  const it = P.normalizeItem({ name: out.productTitle, price: out.price, thumbnail: out.thumbnail, images: out.images }, "autozone");
  assert.equal(it.images.length, 3);
  assert.equal(autoRecOf({ productTitle: "T", price: 1 }).images, undefined);
});

await check("the department-cache pull keeps every gallery field the actor returns (images, imageUrls, gallery)", () => {
  const src = readFileSync(ROOT + "scripts/refresh-department-cache.js", "utf8");
  const fields = src.match(/const GALLERY_FIELDS = \[([^\]]*)\]/);
  assert.ok(fields, "GALLERY_FIELDS is gone from refresh-department-cache.js");
  for (const f of ["images", "imageUrls", "gallery"]) assert.ok(fields[1].includes(`"${f}"`), `${f} is dropped at pull time`);
  const slim = src.slice(src.indexOf("function slimItem("), src.indexOf("function labelFor("));
  assert.match(slim, /for \(const k of GALLERY_FIELDS\)/);
  assert.doesNotMatch(slim, /item\.images\.slice\(0, 1\)|images\[0\]\]/, "the pull keeps only the first photo");
});

await check("size provenance is data, never a link (the page never links out)", () => {
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /href[^;\n]{0,80}sizesSource/);
  const gal = code.slice(code.indexOf("function galleryHTML("), code.indexOf("function galleryPhotoFailed("));
  assert.ok(gal.length > 200, "galleryHTML moved -- update this test");
  assert.doesNotMatch(gal, /<a[\s>]|href=/, "the gallery links somewhere");
  assert.doesNotMatch(gal, /\p{Extended_Pictographic}/u, "an emoji in the gallery");
});

/* ---------- the browser ---------- */
function pick(store, test) {
  const keyCount = new Map();
  for (const { it } of all) { const k = P.norm(it.name); keyCount.set(k, (keyCount.get(k) || 0) + 1); }
  const own = all.filter(({ it }) => it.retailer === store && keyCount.get(P.norm(it.name)) === 1);
  const hit = own.find(({ it }) => test(it));
  return hit && hit.it;
}
/* The New Balance shoe with the most photos among titles only one record carries. */
const nbMax = Math.max(...all.filter(({ it }) => it.retailer === "newbalance" && it.sizes.length && !lookup(P.norm(it.name))[1]).map(({ it }) => it.images.length));
const PRODUCTS = [
  { label: "Agua Bendita, 6 photos", store: "aguabendita", it: pick("aguabendita", (it) => it.images.length === 6), min: 6 },
  { label: "New Balance shoe, full set", store: "newbalance", it: pick("newbalance", (it) => it.images.length === nbMax && it.sizes.length), min: 8 },
  { label: "Gymshark, 4+ photos", store: "gymshark", it: pick("gymshark", (it) => it.images.length >= 6), min: 4 },
  /* Women's lingerie (#443 c.6324227678: multiple angles sell lingerie). */
  { label: "SKIMS bra, 5+ photos", store: "skims", it: pick("skims", (it) => /\bbra\b/i.test(it.name) && it.images.length >= 5), min: 5 },
  /* Danny's gallery policy (#443): the B&H camera that swiped through 7
     slides of 3 photos shows 3; a size chart sits on the last slide. */
  { label: "B&H camera, one slide per photo", store: "bhphoto", it: pick("bhphoto", (it) => it.name === "Sony a7 V Mirrorless Camera"), min: 3 },
  { label: "Elite women's rash guard, size chart last", store: "elite", it: pick("elite", (it) => /women/i.test(it.name) && it.images.length >= 6 && P.galleryIsChart(it.images[it.images.length - 1])), min: 6, chartLast: true },
  { label: "BaubleBar, chart last", store: "baublebar", it: pick("baublebar", (it) => it.images.length >= 5 && it.images.filter((u, i) => i && P.galleryIsChart(u)).length === 1 && P.galleryIsChart(it.images[it.images.length - 1])), min: 5, chartLast: true },
];

const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
let chromium = null;
if (!process.env.SKIP_BROWSER) {
  try { ({ chromium } = await import("playwright")); }
  catch (e) { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch (e2) {} }
}

if (chromium) {
  /* A gzip static server over the repo, like the CDN; the rate function
     answers 3.75; every off-site photo gets the stand-in. */
  const PHOTO = readFileSync(ROOT + "assets/category/sunglasses.jpg");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const send = (code, type, body) => {
      let b = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const h = { "Content-Type": type };
      if (/gzip/.test(req.headers["accept-encoding"] || "") && /json|html|javascript|css|svg/.test(type)) { b = gzipSync(b); h["Content-Encoding"] = "gzip"; }
      res.writeHead(code, h); res.end(b);
    };
    if (u.pathname === "/__photo.jpg") return send(200, "image/jpeg", PHOTO);
    if (u.pathname === "/.netlify/functions/exchange-rate") return send(200, "application/json", JSON.stringify({ venta: 3.75 }));
    if (u.pathname.startsWith("/.netlify/")) return send(404, "application/json", "{}");
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) return send(404, "text/plain", "nf");
    send(200, TYPES[extname(p)] || "application/octet-stream", readFileSync(p));
  });
  await new Promise((r) => server.listen(Number(process.env.PDP_GALLERY_PORT || 0), "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const results = [];

  for (const prod of PRODUCTS) {
    await check(`${prod.label}: every photo has its slot, and swiping reaches each one`, async () => {
      assert.ok(prod.it, `no ${prod.store} product fits -- the catalogue changed`);
      const want = prod.it.images.length;
      assert.ok(want >= prod.min, `${prod.it.name} has ${want} photos`);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      let offsite = 0, links = 0;
      await pg.route((url) => url.host !== new URL(BASE).host, (r) => {
        if (r.request().resourceType() === "image") { offsite++; return r.fulfill({ status: 302, headers: { location: BASE + "/__photo.jpg" } }); }
        return r.abort();
      });
      await pg.goto(`${BASE}/producto.html?producto=${encodeURIComponent(prod.it.name)}&tienda=${prod.store}`);
      await pg.waitForSelector(".p-gallery .g-slide img[src]", { timeout: 30000 });
      const first = await pg.evaluate(() => {
        const box = document.querySelector(".p-gallery .p-photo").getBoundingClientRect();
        return {
          slides: document.querySelectorAll(".g-slide").length, thumbs: document.querySelectorAll(".g-thumb").length,
          count: document.querySelector(".g-count").textContent, w: box.width, h: box.height,
          withSrc: document.querySelectorAll(".g-slide img[src]").length,
          links: document.querySelectorAll(".p-gallery a").length,
          title: document.querySelector("h1") && document.querySelector("h1").textContent,
        };
      });
      assert.equal(first.title, prod.it.name);
      const order = await pg.evaluate(() => [...document.querySelectorAll(".g-slide img")].map((i) => i.getAttribute("data-img-orig")));
      assert.deepEqual(order, JSON.parse(JSON.stringify(prod.it.images)), "the slides are not the gallery, in order");
      assert.equal(new Set(order.map((u) => P.galleryPhotoKey(u))).size, order.length, "a photo twice");
      if (prod.chartLast) assert.ok(P.galleryIsChart(order[order.length - 1]) && !order.slice(0, -1).some((u, i) => i && P.galleryIsChart(u)), "the size chart is not the last slide");
      assert.equal(first.slides, want, `${first.slides} gallery slots for ${want} photos`);
      assert.equal(first.thumbs, want, `${first.thumbs} thumbnails for ${want} photos`);
      assert.equal(first.count, `1 / ${want}`);
      assert.ok(Math.abs(first.w - first.h) <= 1 && first.h > 300, `photo box ${first.w}x${first.h} is not a square`);
      assert.ok(first.withSrc <= 2, `${first.withSrc} slide photos requested with the page (the rest wait for the swipe)`);
      assert.equal(first.links, 0);
      links = first.links;
      /* Swipe to each photo in turn. */
      for (let i = 1; i < want; i++) {
        await pg.evaluate((i) => { const t = document.querySelector(".g-track"); t.scrollTo({ left: i * t.clientWidth }); }, i);
        await pg.waitForFunction((i) => {
          const img = document.querySelectorAll(".g-slide img")[i];
          return img && img.complete && img.naturalWidth > 0;
        }, i, { timeout: 15000 });
      }
      await pg.waitForFunction((n) => document.querySelector(".g-count").textContent === `${n} / ${n}`, want, { timeout: 5000 });
      /* A thumbnail takes you back to the first photo. */
      await pg.click(".g-thumb[data-i='0']");
      await pg.waitForFunction((n) => document.querySelector(".g-count").textContent === `1 / ${n}`, want, { timeout: 5000 });
      const after = await pg.evaluate(() => {
        const box = document.querySelector(".p-gallery .p-photo").getBoundingClientRect();
        return {
          loaded: [...document.querySelectorAll(".g-slide img")].filter((i) => i.complete && i.naturalWidth > 0).length,
          w: box.width, h: box.height, pageW: document.documentElement.scrollWidth,
          current: document.querySelector('.g-thumb[aria-current="true"]').getAttribute("data-i"),
        };
      });
      assert.equal(after.loaded, want, `${after.loaded} of ${want} slots loaded a photo`);
      assert.ok(Math.abs(after.w - first.w) <= 1 && Math.abs(after.h - first.h) <= 1, "the photo box changed size");
      assert.ok(after.pageW <= 390, `the page scrolls sideways (${after.pageW}px)`);
      assert.equal(after.current, "0");
      results.push({ product: prod.it.name, store: prod.store, photos: want, slots: first.slides, loaded: after.loaded, offsite, links });
      await ctx.close();
    });
  }
  await browser.close();
  server.close();
  console.table(results);
} else {
  console.log("    skip the browser checks (no playwright / SKIP_BROWSER)");
}

if (failures.length) console.log("\n  FAILED:\n  " + failures.join("\n  "));
console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
