/* ==================================================================
   DANNY'S PREVIEW PASS (#443 c.6497530895) AND THE HELD PHOTOS
   (c.6495076024).

     - Niños opens on Juguetes, never Deportes;
     - Mujer -> Zapatos: no soccer cleats or other sport-specific shoes;
     - Diseñadores Latinos opens on bikinis and swim;
     - a BoxLunch / Hot Topic product whose photo is a constructed URL
       (not a garment) is on no homepage rail, Ofertas lead or search row.

     node scripts/test/danny-pass-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { HOLD_STORES, CONSTRUCTED_RX, holdsPhoto } from "../hold-constructed-photos.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const json = (f) => JSON.parse(readFileSync(ROOT + f, "utf8"));
const PILLS = "assets/home/pills/";
const pillCards = (aud, k) => {
  const head = json(PILLS + aud + ".json");
  return head.pills[0].k === k ? head.cards : json(PILLS + `${aud}-${k}.json`).cards;
};
const SPORT_SHOE_RX = /\b(cleats?|soccer|f[uú]tbol|fg\/ag|firm ground|turf|futsal|pickleball|tennis shoes?|court shoes?|golf|bowling|spikes?|f50|predator|mercurial|phantom|tiempo|fg|tf)\b/i;
const SWIM_RX = /\b(bikinis?|biquinis?|trikinis?|tankinis?|swim\w*|bathing suits?|one[- ]piece|monokinis?)\b/i;

check("Niños opens on Juguetes", () => {
  const head = json(PILLS + "ninos.json");
  assert.equal(head.pills[0].label, "Juguetes", head.pills.map((p) => p.label).join(", "));
  assert.ok(head.pills.some((p) => p.label === "Deportes"), "Deportes is still a pill, further along");
});

check("Mujer -> Zapatos: no soccer cleats, court or golf shoes", () => {
  const head = json(PILLS + "mujer.json");
  const z = head.pills.find((p) => p.label === "Zapatos");
  assert.ok(z, "no Zapatos pill");
  const cards = pillCards("mujer", z.k);
  assert.ok(cards.length >= 8, `${cards.length} cards`);
  for (const c of cards) assert.doesNotMatch(c.t, SPORT_SHOE_RX, c.t);
  /* ...and it opens on marketable sneakers and running shoes (c.6507161516). */
  for (const c of cards.slice(0, 4)) assert.match(c.t, /\b(sneakers?|running|trainers?|shoes?|air max|550|spezial|samba|gazelle)\b/i, "Zapatos opens on: " + c.t);
  for (const c of cards.slice(0, 4)) assert.doesNotMatch(c.t, /\b(sandals?|slides?|flip-?flops?|heels?|boots?)\b/i, "Zapatos opens on: " + c.t);
});

check("a phone that saw an earlier build gets this build's homepage data", () => {
  const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");
  assert.match(bundle, /function dataUrl\(u\)/);
  assert.match(bundle, /fetchWithTimeout\(dataUrl\(HOME_SHELVES_DIR \+ name \+ '\.json'\)/, "home shelves carry the build version");
  assert.match(bundle, /pillFileLoads\[url\] = fetch\(dataUrl\(url\)\)/, "pill heads and lenses carry the build version");
  assert.match(bundle, /fetchWithTimeout\(dataUrl\('\/ofertas-feed-lite\.json'\)/, "the Ofertas feed carries the build version");
  const headers = readFileSync(ROOT + "_headers", "utf8");
  for (const path of ["/assets/home/*", "/assets/ofertas/*", "/ofertas-feed-lite.json"]) assert.match(headers, new RegExp(path.replace(/[.*]/g, (c) => "\\" + c) + "\\s+Cache-Control: no-cache"), path);
});

check("Diseñadores Latinos opens on bikinis and swim", () => {
  const rail = json("assets/home/shelves/category.json").rails.latino_designers;
  assert.ok(Array.isArray(rail) && rail.length >= 8, "no Diseñadores Latinos rail");
  const lead = rail.slice(0, 6).map((p) => p.title);
  for (const t of lead) assert.match(t, SWIM_RX, "the lead is not swim: " + lead.join(" | "));
  const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");
  assert.match(bundle, /swimFirst: true, \/\* DANNY 2026-10-28/);
  assert.match(bundle, /swimFirst: cat\.swimFirst/, "the tab rail passes swimFirst through");
});

/* The held products, by store + title. */
const held = new Set();
let kept = 0;
for (const [key, file] of Object.entries(HOLD_STORES)) {
  for (const dept of Object.values(json(file).retailers[key].departments)) {
    for (const it of Array.isArray(dept) ? dept : dept.items) {
      if (it.photoHeld) held.add(key + "::" + String(it.name || it.title).trim());
      else if (it.image) kept++;
    }
  }
}

check("the held photos: every non-garment constructed URL is held, the garments keep theirs", () => {
  /* BoxLunch's holds lift with the 2026-10-30 re-pull (its real photos,
     data/gallery-repull-2026-10-30/boxlunch.json); Hot Topic's stay
     until its re-pull is final. */
  assert.ok(held.size > 1000, `${held.size} held`);
  let restored = 0;
  for (const dept of Object.values(json(HOLD_STORES.boxlunch).retailers.boxlunch.departments))
    for (const it of Array.isArray(dept) ? dept : dept.items) if (it.photoRestored) {
      restored++;
      assert.ok(it.image && it.images.includes(it.image) && !it.photoHeld, `boxlunch: ${it.name} restored without its own photo`);
      /* (A held URL the store's own page returned is real after all.) */
    }
  assert.ok(restored > 2000, `${restored} BoxLunch photos restored`);
  assert.ok(kept > 1000, `${kept} kept`);
  assert.ok(holdsPhoto({ image: "https://cdn.media.amplience.net/s/hottopic/34555692_hi", type: "Pantalón",
    name: "Funko Pop! Movies The SpongeBob Movie: Search for SquarePants Vinyl Figure" }), "a Funko typed Pantalón keeps a dead photo");
  assert.ok(holdsPhoto({ image: "https://cdn.media.amplience.net/s/hottopic/1_hi", type: "Vestido", name: "Loungefly Tangled Dress Mini Backpack" }), "a backpack keeps a dead photo");
  assert.ok(!holdsPhoto({ image: "https://cdn.media.amplience.net/s/hottopic/1_hi", type: "Camiseta", name: "Hatsune Miku Checkered T-Shirt" }), "a tee loses its photo");
  for (const [key, file] of Object.entries(HOLD_STORES))
    for (const dept of Object.values(json(file).retailers[key].departments))
      for (const it of Array.isArray(dept) ? dept : dept.items) {
        /* A restored photo came from the store's own page (photoRestored),
           whatever its URL looks like. */
        if (!it.photoRestored) assert.ok(!holdsPhoto(it), `${key}: ${it.name} still carries a constructed photo`);
        if (it.photoHeld) assert.match(it.heldImage, CONSTRUCTED_RX, "the held URL is kept for the repair");
      }
});

check("no held product on a homepage rail, the Ofertas lead or in search", () => {
  const files = [
    ...readdirSync(ROOT + PILLS).map((f) => PILLS + f),
    ...readdirSync(ROOT + "assets/home/shelves").map((f) => "assets/home/shelves/" + f),
    "assets/ofertas/rails.json",
  ];
  const hits = [];
  const walk = (v, f) => {
    if (Array.isArray(v)) { for (const x of v) walk(x, f); return; }
    if (!v || typeof v !== "object") return;
    const r = v.r || v.retailer || v.store, t = v.t || v.title;
    if (r && t && held.has(r + "::" + String(t).trim())) hits.push(`${f}: ${t}`);
    for (const x of Object.values(v)) if (x && typeof x === "object") walk(x, f);
  };
  for (const f of files) walk(json(f), f);
  assert.deepEqual(hits.slice(0, 5), []);
  const idx = readFileSync(ROOT + "assets/search/catalog-index.json", "utf8");
  const leaked = (idx.match(/amplience\.net\/s\/hottopic\/\d+_hi/g) || []).length;
  assert.ok(leaked <= kept, `${leaked} constructed photos in the search index, ${kept} kept`);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
