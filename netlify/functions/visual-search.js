// ============================================================
// BÚSQUEDA POR FOTO (visual search) — POST { image: <base64 jpeg/png> }
//
// The shopper's photo is embedded HERE, in memory, with the same
// CLIP ViT-B/32 image encoder that embedded the catalogue (see
// scripts/visual/). The photo bytes are never written to disk,
// never logged, and die with the invocation.
//
// Everything heavy is a static file on this same site, fetched
// once per warm container: the quantized model under
// /visual-index/model/ and the catalogue index under
// /visual-index/ (int8 vectors in shards + a manifest with one
// centroid per shard). A query scores the centroids, searches
// only the closest shards, and returns the card metadata the page
// already knows how to render — so prices on these cards are the
// same normalized prices every other surface shows.
// ============================================================
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { existsSync, writeFileSync, statSync, mkdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isOffSaleRetailer } from "../../scripts/lib/off-sale.js";

const DIM = 512;
const TOPK = 24;
const SHARDS_TO_SEARCH = 4;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MODEL_PATH = "/tmp/clip-image-int8.onnx";
const MODEL_BYTES = 88997913; // exact byte size of the int8 image tower
// The model ships as two committed parts: a single 89MB file exceeds
// what the git API accepts in one blob, so the function joins the
// parts back together in /tmp on cold start (and only then).
const MODEL_PARTS = [
  "visual-index/model/clip-image-int8.onnx.part1",
  "visual-index/model/clip-image-int8.onnx.part2",
  "visual-index/model/clip-image-int8.onnx.part3",
  "visual-index/model/clip-image-int8.onnx.part4",
];

let sessionPromise = null;
let manifestCache = null;
const shardCache = new Map(); // bin name -> { vec: Int8Array, meta: Array }

/* The statics (index, model parts, runtime) live on the SAME origin
   the shopper is talking to. The request's own Host is the only
   origin that is right in every context: on deploy previews the
   URL env var still points at production (ariashop.pe), which does
   not carry a preview's index — the first preview build fetched
   its runtime from production, got 404s, and never answered.
   The env vars remain as fallbacks for non-HTTP invocations. */
let requestOrigin = null;

function siteOrigin() {
  return (
    requestOrigin ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.URL ||
    "https://ariashop.pe"
  ).replace(/\/$/, "");
}

/* The inference runtime itself travels as static files, like the
   model: onnxruntime-node's native package is ~288MB installed
   (69MB of it Linux binaries), which cannot ship inside a Netlify
   function bundle. The WASM build of the same runtime is 14.3MB of
   statics; the function downloads it once per warm container and
   imports it from /tmp. Only jpeg-js/pngjs remain as real deps. */
const RUNTIME_DIR = "/tmp/vs-runtime";
const RUNTIME_FILES = [
  "ort.wasm.bundle.min.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
];
let ortPromise = null;

async function getOrt() {
  if (!ortPromise) {
    ortPromise = (async () => {
      mkdirSync(RUNTIME_DIR, { recursive: true });
      for (const f of RUNTIME_FILES) {
        const p = `${RUNTIME_DIR}/${f}`;
        if (!existsSync(p) || statSync(p).size === 0) {
          const res = await fetch(`${siteOrigin()}/visual-index/runtime/${f}`);
          if (!res.ok) throw new Error(`runtime ${f} ${res.status}`);
          writeFileSync(p, Buffer.from(await res.arrayBuffer()));
        }
      }
      const ort = await import(pathToFileURL(`${RUNTIME_DIR}/ort.wasm.bundle.min.mjs`).href);
      ort.env.wasm.wasmPaths = `${RUNTIME_DIR}/`;
      ort.env.wasm.numThreads = 1;
      return ort;
    })();
  }
  return ortPromise;
}

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await getOrt();
      if (!existsSync(MODEL_PATH) || statSync(MODEL_PATH).size !== MODEL_BYTES) {
        const chunks = [];
        for (const part of MODEL_PARTS) {
          const res = await fetch(`${siteOrigin()}/${part}`);
          if (!res.ok) throw new Error(`model part ${res.status}`);
          chunks.push(Buffer.from(await res.arrayBuffer()));
        }
        const joined = Buffer.concat(chunks);
        if (joined.length !== MODEL_BYTES) throw new Error("model size mismatch");
        writeFileSync(MODEL_PATH, joined);
      }
      return ort.InferenceSession.create(readFileSync(MODEL_PATH));
    })();
  }
  return sessionPromise;
}

async function getManifest() {
  if (manifestCache) return manifestCache;
  const res = await fetch(`${siteOrigin()}/visual-index/manifest.json`);
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  manifestCache = await res.json();
  for (const s of manifestCache.shards) {
    const b = Buffer.from(s.centroid, "base64");
    s._centroid = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  }
  return manifestCache;
}

async function getShard(shard) {
  let hit = shardCache.get(shard.bin);
  if (hit) return hit;
  const [binRes, metaRes] = await Promise.all([
    fetch(`${siteOrigin()}/visual-index/${shard.bin}`),
    fetch(`${siteOrigin()}/visual-index/${shard.meta}`),
  ]);
  if (!binRes.ok || !metaRes.ok) throw new Error("shard fetch failed");
  const vec = new Int8Array(await binRes.arrayBuffer());
  const meta = await metaRes.json();
  hit = { vec, meta };
  shardCache.set(shard.bin, hit);
  return hit;
}

function decodePhoto(buf) {
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    const d = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { data: d.data, width: d.width, height: d.height };
  }
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50) {
    const png = PNG.sync.read(buf);
    return { data: png.data, width: png.width, height: png.height };
  }
  throw Object.assign(new Error("formato"), { code: "BAD_FORMAT" });
}

// CLIP preprocessing geometry: resize the shorter side to 224 and
// center-crop 224x224 — done here as one cover-crop + bilinear pass.
// (The mean/std normalization lives inside the ONNX graph.)
function toClipTensor(img, ort) {
  const { data, width: w, height: h } = img;
  const side = Math.min(w, h);
  const x0 = Math.floor((w - side) / 2);
  const y0 = Math.floor((h - side) / 2);
  const out = new Float32Array(3 * 224 * 224);
  const scale = side / 224;
  for (let y = 0; y < 224; y++) {
    const sy = Math.min(side - 1.001, y * scale);
    const yA = Math.floor(sy), fy = sy - yA;
    for (let x = 0; x < 224; x++) {
      const sx = Math.min(side - 1.001, x * scale);
      const xA = Math.floor(sx), fx = sx - xA;
      for (let c = 0; c < 3; c++) {
        const p00 = data[((y0 + yA) * w + (x0 + xA)) * 4 + c];
        const p01 = data[((y0 + yA) * w + (x0 + xA + 1)) * 4 + c];
        const p10 = data[((y0 + yA + 1) * w + (x0 + xA)) * 4 + c];
        const p11 = data[((y0 + yA + 1) * w + (x0 + xA + 1)) * 4 + c];
        const v =
          p00 * (1 - fx) * (1 - fy) + p01 * fx * (1 - fy) +
          p10 * (1 - fx) * fy + p11 * fx * fy;
        out[(c * 224 + y) * 224 + x] = v / 255;
      }
    }
  }
  return new ort.Tensor("float32", out, [1, 3, 224, 224]);
}

async function embedPhoto(buf) {
  const session = await getSession();
  const ort = await getOrt();
  const tensor = toClipTensor(decodePhoto(buf), ort);
  const out = await session.run({ pixels: tensor });
  return Float32Array.from(out.embedding.data);
}

/* RELATED, HONESTLY LABELLED (Danny, 2026-10-15).
   A photo search must never present a similar item AS the
   photographed model. The results come back in three tiers:
     1 — the exact model, claimed only at near-duplicate evidence:
         a same-brand item scoring >= 0.94 with its own model
         cluster behind it (>= 2 same-brand items >= 0.88), or a
         lone item >= 0.96. Calibrated on the pilot's gating test
         (2026-10-15): a different retailer photo of a carried model
         peaked at 0.944 (JW Pei Harlee, ranked #1), while the
         tightest WRONG-model clusters (a sibling Vans model with
         the photographed one removed; Nike's Court Vision against
         an Air Force 1 photo) topped out at 0.91-0.93. A same-brand
         cluster alone does NOT prove the model — the holdout test
         showed a sibling model's cluster scoring 0.91 — so below
         the bar the framing stays honestly at "similares".
     2 — the same brand's similar models (Sambas photographed ->
         other Adidas low-tops first).
     3 — visually similar styles from other brands.
   The client frames the set from `framing`: "exact" only when
   tier 1 is non-empty; otherwise the copy says, in substance,
   "no encontré ese modelo exacto, pero aquí tienes similares". */
const CANDIDATES = 60;
const EXACT_SIM = 0.94;
const SUPPORT_SIM = 0.88;
const LONE_DUP_SIM = 0.96;
const BRAND_SIM = 0.84;
const FLOOR_SIM = 0.6;

export function tierResults(scored) {
  /* Off-sale stores (/off-sale.js) stay in the embeddings, never in an answer. */
  const pool = scored.filter((x) => x.s >= FLOOR_SIM && !isOffSaleRetailer(x.meta && x.meta.retailer)).slice(0, CANDIDATES);
  // The photo's brand family: the brand with the strongest cluster
  // near the top (most members in the top 12, best sim breaks ties).
  const clusters = new Map();
  pool.slice(0, 12).forEach((x) => {
    const b = (x.meta.brand || "").trim();
    if (!b) return;
    const c = clusters.get(b) || { brand: b, count: 0, best: 0 };
    c.count++;
    c.best = Math.max(c.best, x.s);
    clusters.set(b, c);
  });
  let family = null;
  for (const c of clusters.values()) {
    if (c.count >= 2 && (!family || c.count > family.count ||
        (c.count === family.count && c.best > family.best))) family = c;
  }
  const tiers = { 1: [], 2: [], 3: [] };
  if (family) {
    const fam = pool.filter((x) => (x.meta.brand || "").trim() === family.brand);
    const support = fam.filter((x) => x.s >= SUPPORT_SIM).length;
    for (const x of fam) {
      // Tier 1 is claimed ONLY at near-duplicate evidence levels
      // with the model's own cluster behind it (see header note).
      if ((x.s >= EXACT_SIM && support >= 2) || x.s >= LONE_DUP_SIM) tiers[1].push(x);
      else if (x.s >= BRAND_SIM) tiers[2].push(x);
    }
  }
  const placed = new Set([...tiers[1], ...tiers[2]]);
  for (const x of pool) if (!placed.has(x)) tiers[3].push(x);
  const ordered = [...tiers[1], ...tiers[2], ...tiers[3]].slice(0, TOPK);
  const items = ordered.map((x) => ({
    ...x.meta,
    visualScore: Math.round(x.s * 1000) / 1000,
    tier: tiers[1].includes(x) ? 1 : tiers[2].includes(x) ? 2 : 3,
  }));
  const framing = tiers[1].length ? "exact"
    : tiers[2].length ? "similar-brand" : "similar";
  return { items, framing, brand: family ? family.brand : null };
}

function searchShards(q, shardData) {
  const scored = [];
  for (const { shard, vec, meta } of shardData) {
    const n = shard.count;
    for (let i = 0; i < n; i++) {
      let dot = 0;
      const base = i * DIM;
      for (let d = 0; d < DIM; d++) dot += q[d] * vec[base + d];
      scored.push({ s: dot / 127, meta: meta[i] });
    }
  }
  scored.sort((a, b) => b.s - a.s);
  return tierResults(scored);
}

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(obj),
});

export async function handler(event) {
  const host = event.headers && (event.headers.host || event.headers.Host);
  if (host) requestOrigin = `https://${host}`;
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  if (!event.body || event.body.length > MAX_BODY_BYTES)
    return json(413, { error: "too_large" });

  const t0 = Date.now();
  try {
    const { image } = JSON.parse(event.body || "{}");
    if (!image || typeof image !== "string")
      return json(400, { error: "no_image" });
    const buf = Buffer.from(image, "base64");
    const q = await embedPhoto(buf);
    const tEmbed = Date.now();

    const manifest = await getManifest();
    const byCentroid = manifest.shards
      .map((shard) => {
        let dot = 0;
        for (let d = 0; d < DIM; d++) dot += q[d] * shard._centroid[d];
        return { shard, dot };
      })
      .sort((a, b) => b.dot - a.dot)
      .slice(0, SHARDS_TO_SEARCH);
    const shardData = [];
    for (const { shard } of byCentroid) {
      shardData.push({ shard, ...(await getShard(shard)) });
    }
    const { items, framing, brand } = searchShards(q, shardData);
    return json(200, {
      items,
      framing,
      brand,
      searched: shardData.reduce((n, s) => n + s.shard.count, 0),
      total: manifest.total,
      ms: { embed: tEmbed - t0, total: Date.now() - t0 },
    });
  } catch (e) {
    if (e && e.code === "BAD_FORMAT") return json(415, { error: "bad_format" });
    console.error("[visual-search]", e && e.message);
    return json(500, { error: "search_failed" });
  }
}
