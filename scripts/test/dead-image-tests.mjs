/* ==================================================================
   NO IMAGE, NO CARD (#443 c.6547325227).

   The homepage Diseñadores Latinos rail drew the Ancora "Swimming Up
   Trunk" as the ARIA / "Foto en camino" placeholder: its lead photo
   (M164-FRONT.webp) is 404 at the source. Two halves keep it from
   happening again:

     - data: scripts/data/dead-images.json lists photos verified dead;
       scripts/sweep-dead-images.mjs drops them from every catalogue
       (next photo leads; none left = the record is held), and no
       catalogue or generated slice may still carry one;
     - client: a card whose photo fails in the browser tries its next
       photo and otherwise leaves the rail -- no page draws the
       placeholder (or a "Sin imagen" box) on a product card.

     node scripts/test/dead-image-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { loadDeadSet, catalogueFiles, sweepCatalogue, sweepItem, deadKey } from "../sweep-dead-images.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");
const dead = loadDeadSet(ROOT);
const FOLDER = "https://cdn.shopify.com/s/files/1/0570/4512/3262/files/";
const NUEVA0 = FOLDER + "swimming-up-trunk-nueva0_151dc274-7df8-428f-8765-c22dfdcaadb7.jpg?v=1791560908";
const M164 = FOLDER + "M164.webp?v=1747244849";

check("the dead list carries the three Ancora M164 files, each with its source", () => {
  const d = JSON.parse(read("scripts/data/dead-images.json"));
  assert.ok(d.dead.length >= 3);
  for (const e of d.dead) assert.ok(e.url && e.status && e.verified && e.source, JSON.stringify(e));
  for (const f of ["M164-FRONT.webp", "M164.gif", "M164-BACK.webp"]) assert.ok(dead.has(deadKey(FOLDER + f)), f);
  assert.ok(!dead.has(deadKey(M164)), "M164.webp is live and must not be listed");
});

check("the sweep: a dead lead falls back to the next photo, none left = held, extra copies dropped", () => {
  const ds = new Set([deadKey("https://x.test/a.jpg"), deadKey("https://x.test/b.jpg")]);
  const a = { name: "A", image: "https://x.test/a.jpg?v=9", images: ["https://x.test/a.jpg?v=9", "https://x.test/c.jpg"] };
  assert.equal(sweepItem(a, ds), "fixed");
  assert.equal(a.image, "https://x.test/c.jpg");
  assert.deepEqual(a.images, ["https://x.test/c.jpg"]);
  const b = { name: "B", image: "https://x.test/a.jpg", images: ["https://x.test/b.jpg"] };
  assert.equal(sweepItem(b, ds), "suppressed");
  assert.equal(b.image, null); assert.deepEqual(b.images, []); assert.equal(b.photoHeld, "dead-at-source");
  assert.equal(b.heldImage, "https://x.test/a.jpg");
  const c = { name: "C", image: "https://x.test/c.jpg", images: ["https://x.test/c.jpg", "https://x.test/b.jpg"] };
  assert.equal(sweepItem(c, ds), "cleaned");
  assert.deepEqual(c.images, ["https://x.test/c.jpg"]);
  assert.equal(sweepItem({ name: "D", image: "https://x.test/d.jpg" }, ds), null);
});

check("no catalogue still carries a photo on the dead list (sweep --check is clean)", () => {
  const rows = [];
  for (const f of catalogueFiles(ROOT)) {
    let env; try { env = JSON.parse(read(f)); } catch (e) { continue; }
    rows.push(...sweepCatalogue(env, dead).rows.map((r) => f + "  " + r));
  }
  assert.deepEqual(rows, []);
});

check("no generated feed, slice or shelf carries a dead photo", () => {
  const files = ["ofertas-feed.json", "ofertas-feed-lite.json", "assets/ofertas/deals.json", "assets/search/catalog-index.json",
    "assets/sections/marca/_fn/items.json", "assets/tienda/_fn/ancora.json", "assets/pdp/p/6cf.json"];
  for (const d of ["assets/home/shelves", "assets/sections/disenadores"]) for (const f of readdirSync(ROOT + d)) if (f.endsWith(".json")) files.push(d + "/" + f);
  for (const f of files) {
    const t = read(f);
    for (const u of JSON.parse(read("scripts/data/dead-images.json")).dead.map((e) => e.url.replace(/[?#].*$/, ""))) {
      assert.ok(!t.includes(u), `${f} still carries ${u}`);
    }
  }
});

check("the Swimming Up Trunk leads with its live photo in the catalogue and on the homepage rail", () => {
  const env = JSON.parse(read("latino-designers-dtc-catalog.json"));
  const it = env.retailers.ancora.departments.latino_designers.items.find((x) => x.name === "Swimming Up Trunk");
  assert.equal(it.image, NUEVA0);
  assert.deepEqual(it.images, [NUEVA0, M164]);
  const home = JSON.parse(read("assets/home/shelves/category.json")).rails.latino_designers.find((x) => x.title === "Swimming Up Trunk");
  if (home) assert.equal(home.image, NUEVA0);
  const feed = JSON.parse(read("ofertas-feed.json")).items.find((x) => x.retailer === "ancora" && x.title === "Swimming Up Trunk");
  assert.equal(feed.image, NUEVA0);
});

/* ---------- the client half ---------- */
const bundleName = (read("index.html").match(/\/build\/(app-[0-9a-f]{16}\.js)/) || [])[1];
const bundle = read("build/" + bundleName);
const slice = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a) + a.length));

check("app bundle: a card photo that runs out of photos drops the card, never the placeholder", () => {
  const fb = slice(bundle, "function cardPhotoFallback(", "function dropDeadPhotoCard(");
  assert.ok(!/photoPlaceholderHTML\(/.test(fb), "cardPhotoFallback still draws the placeholder");
  assert.ok(/dropDeadPhotoCard\(img\)/.test(fb));
  const drop = slice(bundle, "function dropDeadPhotoCard(", "\n}");
  assert.ok(/ariaPhotoRescue/.test(drop) && /\[data-card-root\]/.test(drop) && /\.remove\(\)/.test(drop));
  const html = slice(bundle, "function cardPhotoHTML(", "function cardPhotoFallback(");
  assert.ok(!/photoPlaceholderHTML\(/.test(html), "a card with no photo URL still draws the placeholder");
  assert.equal((bundle.match(/photoPlaceholderHTML\(\)/g) || []).length, 0, "the placeholder is still called somewhere");
});

check("app bundle: every product card root is marked so the guard can take it off the rail", () => {
  for (const [fn, end] of [["function railCardHTML(", "\nfunction "], ["function carouselCardHTML(", "\nfunction "]]) {
    assert.ok(/data-card-root data-cp-t=/.test(slice(bundle, fn, end)), fn);
  }
  assert.ok(/<div class="\$\{CARD_SHELL_CLASS\}" data-card-root data-cp-t=/.test(bundle), "grid card");
});

check("card-photos.js: the rescue walks the product's gallery, then removes the card; early failures are drained", () => {
  const cp = read("assets/js/card-photos.js");
  assert.ok(/window\.ariaPhotoRescue = rescue;/.test(cp));
  assert.ok(/__ariaDeadPhotos/.test(cp));
  const r = slice(cp, "function rescue(img)", "window.ariaPhotoRescue");
  assert.ok(/new Image\(\)/.test(r) && /dropCard\(card, img\)/.test(r) && /unpack\(rec\.images, rec\.image\)/.test(r));
});

check("no page draws a placeholder or a hidden photo on a product card: the last error stop is photoGone", () => {
  for (const f of ["disenadores.html", "tienda.html", "departamento.html", "ofertas.html", "marca.html", "ropa-interior.html", "producto.html"]) {
    const t = read(f);
    assert.ok(/window\.photoGone = function\(el\)/.test(t), `${f}: no photoGone`);
    assert.ok(/photoGone\(this\)/.test(t), `${f}: no card hands its dead photo to photoGone`);
    assert.ok(!/'<span class="noimg">Sin imagen<\/span>'/.test(t), `${f}: a "Sin imagen" card is still drawn`);
    /* producto.html's own lead photo is the product page, not a card. */
    if (f !== "producto.html") assert.ok(!/imgOrigRetry\(this\)\)\{this\.style\.(display|visibility)/.test(t), `${f}: a dead photo is only hidden`);
    assert.ok(/card-photos\.js/.test(t), `${f}: card-photos.js (the rescue) is not loaded`);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
