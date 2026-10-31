/* ==================================================================
   JCPENNEY PHOTO ROUTE (#443 c.6470386941 item 1).

   The pull names every photo by Scene7 asset ID. Held here: an ID
   resolves only to the URL JCPenney's own page uses for it (never a
   constructed one); a product without a captured main photo stays out
   (no image, no card); the slice's rules (variations folded into one
   product with its sizes, the store's was-price only where it is higher,
   departments from the store's own type and gender, the "more brands"
   catch-all is no brand, English kept aside and never shown).

     node scripts/test/jcpenney-photos-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { assetIdsOf, scene7UrlsIn, pdpUrlOf, normalizeJcpenney, deptOf } from "../lib/jcpenney.mjs";
import { resolveProducts, imageMapOf } from "../resolve-jcpenney-images.mjs";

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

/* Rows shaped as the 2026-10-27 pull delivers them (two size variations of one dress). */
const dress = (size, over = {}) => ({ id: "ppr5008719636", variation_id: "v" + size, product_title: "Premier Amour Womens Midi Mock Neck Sleeveless Sheath Dress",
  brand: "premier amour", image_url: "DP70235361-20260805203003M", group_image: "DP70235361-20260805203003M",
  alt_images: ["DP70235403-20260805203012M", "DP70235400-20260805203012M"], swatch_image: "DP70235011-20260805202858S",
  url: "/p/premier-amour-womens-midi-mock-neck-sleeveless-sheath-dress/ppr5008719636?pTmplType=regular",
  product_type: ["dresses"], gender: ["women"], size: [size], color: ["red"],
  effective_price_min: 47.19, price_min: 58.99, original_price_min: 79, clearance: "N",
  description: "<p>Make your next occasion memorable.</p><ul><li>Midi length</li></ul>", ...over });
const watch = { id: "ppr2", product_title: "Womens Gold Tone Bracelet Watch", brand: "more brands", image_url: "DP1111111-20260101000000M",
  alt_images: [], url: "/p/watch/ppr2", product_type: ["watches"], gender: ["women"], size: [], effective_price_min: 30, original_price_min: 30, description: "" };
const dark = { id: "ppr3", product_title: "Mens Polo", brand: "st. john's bay", image_url: "DP2222222-20260101000000M", alt_images: [],
  url: "/p/polo/ppr3", product_type: ["shirts + tops"], gender: ["mens"], size: ["M"], effective_price_min: 20, description: "" };

const PAGE_DRESS = `<html><script>window.__DATA__={"images":["https:\\u002F\\u002Fjcpenney.scene7.com\\u002Fis\\u002Fimage\\u002FJCPenney\\u002FDP70235361-20260805203003M?wid=350&hei=350"]}</script>
<img src="https://jcpenney.scene7.com/is/image/JCPenney/DP70235403-20260805203012M?op_sharpen=1&amp;wid=1200">
<img src="http://jcpenney.scene7.com/is/image/JCPenney/DP70235400-20260805203012M.jpg">
<img src="https://jcpenney.scene7.com/is/image/JCPenney/DP99999999-20200101000000M"></html>`;
const PAGE_WATCH = `<img src="https://jcpenney.scene7.com/is/image/JCPenney/DP1111111-20260101000000M?wid=600">`;
const PAGE_DARK = `<html><body>no images in this response</body></html>`;

await check("an asset ID resolves only to the URL the product's own page uses (escaped, http, .jpg and query forms read)", () => {
  const m = scene7UrlsIn(PAGE_DRESS, new Set(assetIdsOf(dress("2"))));
  assert.equal(m.get("DP70235361-20260805203003M"), "https://jcpenney.scene7.com/is/image/JCPenney/DP70235361-20260805203003M");
  assert.equal(m.get("DP70235403-20260805203012M"), "https://jcpenney.scene7.com/is/image/JCPenney/DP70235403-20260805203012M");
  assert.equal(m.get("DP70235400-20260805203012M"), "https://jcpenney.scene7.com/is/image/JCPenney/DP70235400-20260805203012M.jpg");
  assert.ok(!m.has("DP99999999-20200101000000M"), "a photo the row does not name is not taken");
  assert.equal(scene7UrlsIn(PAGE_DARK).size, 0, "a page without the photo resolves nothing; no URL is built from the ID");
  assert.deepEqual(assetIdsOf(dress("2")), ["DP70235361-20260805203003M", "DP70235403-20260805203012M", "DP70235400-20260805203012M"], "the swatch is not a product photo");
  assert.equal(pdpUrlOf(dress("2")), "https://www.jcpenney.com/p/premier-amour-womens-midi-mock-neck-sleeveless-sheath-dress/ppr5008719636");
});

await check("the resolver visits each product once, records why a product stayed dark, and resumes", async () => {
  const pages = { ppr5008719636: PAGE_DRESS, ppr2: PAGE_WATCH, ppr3: PAGE_DARK };
  const seen = [];
  const fetchPage = async (url, id) => { seen.push(id); return pages[id] ?? null; };
  const rows = [dress("2"), dress("4"), watch, dark];
  const res = await resolveProducts(rows, { fetchPage, concurrency: 2 });
  assert.deepEqual(seen.sort(), ["ppr2", "ppr3", "ppr5008719636"]);
  assert.equal(res.ppr3.status, "no-photos-in-page");
  assert.equal(Object.keys(imageMapOf(res)).length, 4);
  const again = await resolveProducts(rows, { fetchPage: async () => { throw new Error("refetched"); }, done: res });
  assert.equal(Object.keys(again).length, 3, "a finished product is not fetched again");
});

await check("the slice: no captured photo, no card; variations fold into one product with its sizes; sale only where the store's price is higher", async () => {
  const res = await resolveProducts([dress("2"), dress("4"), watch, dark], { fetchPage: async (u, id) => ({ ppr5008719636: PAGE_DRESS, ppr2: PAGE_WATCH, ppr3: PAGE_DARK })[id] });
  const { departments, skipped } = normalizeJcpenney([dress("2"), dress("4"), watch, dark], new Map(Object.entries(imageMapOf(res))));
  assert.deepEqual(Object.keys(departments).sort(), ["jewelry", "women"]);
  assert.equal(skipped["no captured photo"], 1, "the polo with no photo in its page stays out");
  const d = departments.women.items[0];
  assert.deepEqual(d.sizes, ["2", "4"]);
  assert.equal(d.price, 47.19);
  assert.equal(d.originalPrice, 79);
  assert.equal(d.images.length, 3);
  assert.ok(d.images.every((u) => /^https:\/\/jcpenney\.scene7\.com\/is\/image\//.test(u)));
  assert.equal(d.description, "", "English is never shown");
  assert.match(d.description_en, /^Make your next occasion memorable\. \. Midi length$|^Make your next occasion memorable\.\s+\.?\s*Midi length$/);
  assert.equal(d.brand, "Premier Amour");
  const w = departments.jewelry.items[0];
  assert.equal(w.brand, "", '"more brands" is a marketplace catch-all, not a brand');
  assert.ok(!w.onSale, "no was-price when the store's own original is not higher");
  assert.equal(deptOf({ product_type: ["sandals"], gender: ["women"] }), "shoes");
  assert.equal(deptOf({ product_type: ["fragrance"] }), "fragrance");
  assert.equal(deptOf({ product_type: ["sheets"] }), "home");
  assert.equal(deptOf({ product_type: ["pants"], gender: ["girls"] }), "kids");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
