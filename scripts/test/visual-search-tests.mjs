/* ==================================================================
   BÚSQUEDA POR FOTO (2026-10-15, Danny — Phase 2 visual search).

   A shopper photographs a product; Aria returns the closest items
   from its own catalogue as ordinary cards. These checks pin the
   contract the feature must not break as the code around it moves:

   - Both doors exist (assistant composer + search bars), Spanish,
     no emojis, and the file inputs accept images so iPhone Safari
     offers the camera.
   - Results render through the SAME card paths as everything else
     (productCardHTML / addAssistantProductCard -> showProduct), so
     prices and the size gate cannot drift from the rest of the shop.
   - The phone never downloads the embedding index: the client only
     POSTs the photo to the function. The index loads on demand,
     server-side — page boot stays exactly as light as it was.
   - The function never persists the photo.
   - The committed index is internally consistent: shard counts,
     vector bytes and metadata rows all agree with the manifest.

   RUNNING IT
     node scripts/test/visual-search-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;

function pageHtml() {
  const html = readFileSync(ROOT + "index.html", "utf8");
  const tag = /<script\s+src="\/(build\/app-[^"]+\.js)"><\/script>/.exec(html);
  if (!tag) return html;
  const bundle = readFileSync(ROOT + tag[1], "utf8");
  return html.replace(tag[0], () => `<script>\n${bundle}\n</script>`);
}

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const page = pageHtml();
const fnSrc = readFileSync(ROOT + "netlify/functions/visual-search.js", "utf8");

function lift(sig) {
  const at = page.indexOf(sig);
  assert.ok(at > 0, "missing " + sig);
  let d = 0;
  for (let k = page.indexOf("{", at); k < page.length; k++) {
    if (page[k] === "{") d++;
    else if (page[k] === "}" && --d === 0) return page.slice(at, k + 1);
  }
  throw new Error("unbalanced " + sig);
}

check("assistant composer has the photo door", () => {
  assert.match(page, /id="assistantPhotoBtn"[^>]*onclick="openVisualSearch\('assistant'\)"/);
  assert.match(page, /id="visualFileAssistant"[^>]*accept="image\/\*"/);
  assert.match(page, /id="visualFileAssistant"[^>]*onchange="onVisualFileChosen\(this,'assistant'\)"/);
});

check("search bars have the photo door", () => {
  const hits = page.match(/onclick="openVisualSearch\('search'\)"/g) || [];
  assert.ok(hits.length >= 3, `expected >=3 search photo buttons, got ${hits.length}`);
  assert.match(page, /id="visualFileSearch"[^>]*accept="image\/\*"/);
});

check("photo doors are Spanish and emoji-free", () => {
  const buttons = page.match(/<button[^>]*openVisualSearch[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.ok(buttons.length >= 4);
  for (const b of buttons) {
    assert.match(b, /aria-label="Buscar por foto"/);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(b), "emoji in photo button");
  }
});

check("assistant results reuse the assistant card renderer", () => {
  const flow = lift("async function runVisualSearch");
  assert.match(flow, /addAssistantProductCard\(item, item\.retailer\)/);
});

check("search results reuse the catalogue card renderer and opener", () => {
  const painter = lift("function showVisualResults");
  assert.match(painter, /productCardHTML\(p, \{ open: `openSearchProduct\(\$\{i\}\)`/);
  assert.match(painter, /searchRendered = items\.slice/);
});

check("the photo is downscaled on the phone before upload", () => {
  const payload = lift("function visualPhotoPayload");
  assert.match(payload, /512/);
  assert.match(payload, /toDataURL\('image\/jpeg'/);
});

check("the client only talks to the function — never the index", () => {
  assert.ok(!page.includes("visual-index"), "page must not reference the embedding index");
  const flow = lift("async function runVisualSearch");
  assert.match(flow, /fetch\('\/\.netlify\/functions\/visual-search'/);
});

check("the function embeds with the catalogue's model and persists no photo", () => {
  assert.match(fnSrc, /ort\.wasm\.bundle\.min\.mjs/);
  assert.match(fnSrc, /visual-index\/runtime/);
  const pkg = JSON.parse(readFileSync(ROOT + "package.json", "utf8"));
  assert.ok(!("onnxruntime-node" in (pkg.dependencies || {})),
    "the native onnxruntime package must not come back (it breaks the function bundle)");
  assert.match(fnSrc, /visual-index\/manifest\.json/);
  const writes = fnSrc.match(/writeFileSync\([^)]*\)/g) || [];
  assert.ok(writes.length >= 1, "model cache write expected");
  // Writes may only ever be the two /tmp caches (model, runtime).
  // The photo buffer must never touch the disk.
  for (const w of writes) {
    assert.ok(/MODEL_PATH/.test(w) || /^writeFileSync\(p,/.test(w),
      "function writes something other than the model/runtime cache: " + w);
    assert.ok(!/buf/.test(w), "function writes the photo buffer: " + w);
  }
  assert.ok(!/createWriteStream/.test(fnSrc));
});

check("similar is never framed as exact (Danny's honesty rule)", () => {
  assert.match(page, /No encontré ese modelo exacto, pero aquí tienes modelos similares de/);
  assert.match(page, /No encontré ese modelo exacto, pero aquí tienes versiones similares:/);
  assert.match(page, /Encontré ese modelo en nuestro catálogo:/);
  const painter = lift("function showVisualResults");
  assert.match(painter, /verdict\.framing === 'exact'/);
  assert.match(painter, /No encontramos ese modelo exacto/);
});

check("the function tiers results and only claims exact for a cluster", () => {
  assert.match(fnSrc, /EXACT_SIM/);
  assert.match(fnSrc, /framing/);
  assert.match(fnSrc, /similar-brand/);
});

check("the committed index agrees with its manifest", () => {
  const manifest = JSON.parse(readFileSync(ROOT + "visual-index/manifest.json", "utf8"));
  assert.equal(manifest.model, "openai-clip-vit-b-32");
  assert.equal(manifest.dim, 512);
  let total = 0;
  const seen = new Set();
  for (const shard of manifest.shards) {
    total += shard.count;
    const bin = readFileSync(ROOT + "visual-index/" + shard.bin);
    assert.equal(bin.length, shard.count * 512, `${shard.bin} size`);
    const meta = JSON.parse(readFileSync(ROOT + "visual-index/" + shard.meta, "utf8"));
    assert.equal(meta.length, shard.count, `${shard.meta} rows`);
    for (const row of meta) {
      assert.ok(row.id && row.title && row.retailer && row.image, "metadata row missing card fields");
      assert.ok(Number(row.price) > 0, "metadata row without a price");
      assert.ok(!seen.has(row.id), "duplicate id " + row.id);
      seen.add(row.id);
    }
    const centroid = Buffer.from(shard.centroid, "base64");
    assert.equal(centroid.length, 512 * 4, "centroid bytes");
    const floats = new Float32Array(centroid.buffer, centroid.byteOffset, 512);
    let norm = 0;
    for (const v of floats) norm += v * v;
    assert.ok(Math.abs(Math.sqrt(norm) - 1) < 0.05, "centroid not normalized");
  }
  assert.equal(total, manifest.total, "manifest total");
  // Coverage floor for the shipped snapshot. The full pool is
  // 141,786 items; the backfill (scripts/visual/README.md) embeds
  // it in priority order (on-sale first) and each refreshed index
  // raises this floor. Never lower it.
  assert.ok(manifest.total > 3000, "index should cover a meaningful catalogue slice, got " + manifest.total);
});

check("index files are cacheable as versioned statics", () => {
  const headers = readFileSync(ROOT + "_headers", "utf8");
  assert.match(headers, /\/visual-index\/\*/);
});

const MIN_CHECKS = 12;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
