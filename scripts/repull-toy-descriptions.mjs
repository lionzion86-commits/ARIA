#!/usr/bin/env node
/* ============================================================
   THE TOYS' REAL COPY, PULLED AGAIN (#443: toys at the same priority as
   perfumes; "re-pull the toy data for the truncated and missing
   descriptions -- real copy only").

   Walmart's toy copy reached juguetes-catalog.json cut at about 200
   characters (the listing's snippet, not the product page), and about
   1,000 toys arrived with no copy or a fragment ("1 2 3", "For Ages 3 &
   Up"). Translation cannot fix either: the words are not there. This
   pulls each affected toy's PRODUCT PAGE again with the Walmart
   program's detail actor (scripts/lib/walmart-density.js) and keeps the
   page's own description. Nothing is written for a toy whose page has no
   real copy: it stays as it is and is listed in the report.

   NOTHING IS SPENT UNTIL YOU SAY SO (the Walmart program's rule):

     node scripts/repull-toy-descriptions.mjs
         Counts the toys to re-pull, writes their page URLs to
         data/walmart/toy-repull-urls.json, prints the quote. Spends
         nothing (exit 2).

     node scripts/repull-toy-descriptions.mjs --confirm-spend --quote <usd>
         The detail runs, 500 pages each, under Apify's own per-run
         charge limit; refuses to start when the estimate is over the
         quote. Raw answers saved to data/walmart/toy-repull-raw-<stamp>.json,
         then the ingest below.

     node scripts/repull-toy-descriptions.mjs --src data/walmart/toy-repull-raw-<stamp>.json
         The ingest, from a saved pull (no spend): each toy whose page
         has longer real copy gets it as `description_en`; the new
         English texts are listed in data/walmart/toy-repull-en.jsonl
         for translation into scripts/data/descriptions-es/walmart.json.

     node scripts/repull-toy-descriptions.mjs --finalize
         Once the translations are in the memory: every toy whose
         `description_en` has its Spanish there shows it. A toy still
         waiting keeps the Spanish it had -- never English, never blank.
         Then: node scripts/build-pdp-slices.mjs

   ENV (names only): APIFY_API_KEY; optional APIFY_COST_PER_RUN_USD,
   WALMART_DETAIL_COST_PER_1000_USD.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DETAIL_ACTOR, DETAIL_URLS_PER_RUN, detailInput, ratesFromEnv } from "./lib/walmart-density.js";
import { itemIdOf } from "./lib/walmart-write.js";
import { spanishFor } from "./lib/description-es.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CATALOG = "juguetes-catalog.json";
const DATA_DIR = join(ROOT, "data/walmart");
const RUN_TIMEOUT_MS = 45 * 60 * 1000;

/* ---------------- which toys ---------------- */
const ENDS_A_SENTENCE = /[.!?)\]"”»]\s*$/;

function verdict(text) {
  const t = String(text || "").trim();
  if (!t) return "missing";
  if (t.length < 40 || t.split(/\s+/).length < 6) return "fragment";
  if (/…\s*$/.test(t) || (t.length >= 140 && !ENDS_A_SENTENCE.test(t))) return "truncated";
  return null;
}

/** Why a toy's copy needs its page again, or null when it does not:
    judged on the English it came with AND the Spanish a shopper reads,
    since a cut in either is a cut on the page. */
export function needsRepull(item) {
  if (item.descriptionSource === "walmart-pdp-repull") return null;
  return verdict(item.description_en || item.description) || verdict(item.description);
}

export function toyItems(catalog) {
  return (((catalog.retailers || {}).walmart || {}).departments || {}).toys?.items || [];
}

/* ---------------- the page's own copy ---------------- */
const stripHtml = (s) => String(s || "")
  .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, ". ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'")
  .replace(/\s*\.\s*(\.\s*)+/g, ". ")
  .replace(/\s{2,}/g, " ")
  .replace(/^[.\s]+/, "")
  .trim();

/**
 * The product page's description: the longest of the page's own
 * fields, HTML removed. Null when the page has no real copy (missing,
 * or nothing more than the product's name).
 */
export function realCopy(detail) {
  if (!detail || typeof detail !== "object") return null;
  const name = String(detail.name || detail.title || "").trim().toLowerCase();
  const texts = [detail.shortDescription, detail.longDescription, detail.description]
    .map(stripHtml)
    .filter((t) => t.length >= 40 && t.split(/\s+/).length >= 6 && t.toLowerCase() !== name);
  if (!texts.length) return null;
  return texts.sort((a, b) => b.length - a.length)[0];
}

/**
 * Put the pulled copy on the toys. Returns { updated, noCopy, unmatched,
 * newTexts } -- newTexts are the English texts to translate.
 */
export function applyRepull(catalog, details) {
  const byId = new Map();
  for (const d of details) {
    const id = itemIdOf(d && (d.url || d.productUrl || d.canonicalUrl)) || String((d && (d.usItemId || d.itemId)) || "");
    if (id) byId.set(id, d);
  }
  const out = { updated: 0, noCopy: [], unmatched: [], newTexts: [] };
  for (const item of toyItems(catalog)) {
    if (!needsRepull(item)) continue;
    const id = itemIdOf(item.url);
    const d = id && byId.get(id);
    if (!d) { out.unmatched.push(item.url); continue; }
    const text = realCopy(d);
    const had = String(item.description_en || item.description || "");
    if (!text || text.length <= had.length) { out.noCopy.push(item.url); continue; }
    item.description_en = text;
    item.descriptionSource = "walmart-pdp-repull";
    out.updated++;
    out.newTexts.push(text);
  }
  return out;
}

/** The Spanish from the memory, for every toy whose English has it. */
export function finalizeFromMemory(catalog, lookup = (en) => spanishFor("walmart", en)) {
  let n = 0;
  for (const item of toyItems(catalog)) {
    if (!item.description_en) continue;
    const es = lookup(item.description_en);
    if (es && es !== item.description) { item.description = es; n++; }
  }
  return n;
}

export function quote(urlCount, rates = ratesFromEnv()) {
  const runs = Math.ceil(urlCount / DETAIL_URLS_PER_RUN);
  return Math.round(((urlCount / 1000) * rates.detailPer1000 + runs * rates.perRun) * 100) / 100;
}

/* ---------------- the pull ---------------- */
async function fetchJson(url, options = {}, timeoutMs = 60000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: c.signal });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, body };
  } finally { clearTimeout(t); }
}

async function runDetail(token, urls, chargeLimitUsd) {
  const auth = { Authorization: `Bearer ${token}` };
  const r = await fetchJson(`https://api.apify.com/v2/acts/${DETAIL_ACTOR.replace("/", "~")}/runs?maxTotalChargeUsd=${chargeLimitUsd.toFixed(2)}`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(detailInput(urls)),
  });
  if (!r.ok) throw new Error(`start failed (${r.status})`);
  const runId = r.body.data.id;
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const s = await fetchJson(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, { headers: auth });
    if (!s.ok) throw new Error(`status failed (${s.status})`);
    const run = s.body.data;
    if (run.status === "SUCCEEDED") {
      const items = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await fetchJson(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&offset=${offset}&limit=1000`, { headers: auth }, 5 * 60 * 1000);
        if (!page.ok) throw new Error(`dataset fetch failed (run ${runId})`);
        const rows = Array.isArray(page.body) ? page.body : [];
        items.push(...rows);
        if (rows.length < 1000) break;
      }
      return { items, usageUsd: Number(run.usageTotalUsd) || 0 };
    }
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) throw new Error(`run ${runId} ended ${run.status}`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error(`run ${runId} still running after the timeout`);
}

function ingest(catalog, details) {
  const r = applyRepull(catalog, details);
  writeFileSync(join(ROOT, CATALOG), JSON.stringify(catalog));
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "toy-repull-en.jsonl"), [...new Set(r.newTexts)].map((en) => JSON.stringify({ store: "walmart", en })).join("\n") + "\n");
  console.log(`updated ${r.updated} toys with their page's copy; ${r.noCopy.length} pages had no longer real copy (left as they are); ${r.unmatched.length} not returned by the pull`);
  console.log(`new English texts to translate: data/walmart/toy-repull-en.jsonl`);
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (k) => argv.includes(k);
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const catalog = JSON.parse(readFileSync(join(ROOT, CATALOG), "utf8"));

  if (flag("--finalize")) {
    const n = finalizeFromMemory(catalog);
    writeFileSync(join(ROOT, CATALOG), JSON.stringify(catalog));
    console.log(`${n} toys now show their full Spanish copy. Next: node scripts/build-pdp-slices.mjs`);
    return;
  }
  if (val("--src")) { ingest(catalog, JSON.parse(readFileSync(val("--src"), "utf8"))); return; }

  const want = toyItems(catalog).map((i) => ({ i, why: needsRepull(i) })).filter((x) => x.why && itemIdOf(x.i.url));
  const why = want.reduce((m, x) => ((m[x.why] = (m[x.why] || 0) + 1), m), {});
  const urls = [...new Set(want.map((x) => x.i.url.split("?")[0]))];
  const q = quote(urls.length);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "toy-repull-urls.json"), JSON.stringify(urls, null, 1));
  console.log(`toys to re-pull: ${urls.length} (${Object.entries(why).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`quote: US$${q.toFixed(2)} (${Math.ceil(urls.length / DETAIL_URLS_PER_RUN)} detail runs)`);
  if (!flag("--confirm-spend")) { console.log("nothing spent. Re-run with --confirm-spend --quote <usd> to pull."); process.exit(2); }
  const cap = Number(val("--quote"));
  if (!(cap >= q)) { console.error(`refusing: the quote (US$${q.toFixed(2)}) is over --quote ${val("--quote")}`); process.exit(1); }
  if (!process.env.APIFY_API_KEY) { console.error("APIFY_API_KEY not set"); process.exit(1); }

  const details = [];
  let spent = 0;
  for (let i = 0; i < urls.length; i += DETAIL_URLS_PER_RUN) {
    const batch = urls.slice(i, i + DETAIL_URLS_PER_RUN);
    const left = cap - spent;
    const est = quote(batch.length);
    if (est > left) { console.error(`stopping: the next run (US$${est.toFixed(2)}) would cross the quote`); break; }
    const { items, usageUsd } = await runDetail(process.env.APIFY_API_KEY, batch, left);
    details.push(...items);
    spent += usageUsd;
    console.log(`run ${i / DETAIL_URLS_PER_RUN + 1}: ${items.length} pages, US$${usageUsd.toFixed(2)} (total US$${spent.toFixed(2)})`);
  }
  const file = join(DATA_DIR, `toy-repull-raw-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(details));
  console.log(`raw pages saved: ${file}`);
  ingest(catalog, details);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
