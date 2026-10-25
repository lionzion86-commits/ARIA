/* ==================================================================
   ASSISTANT TRUTH PASS (#443, post-#457/#458).

   Taking a store off sale is a data change; this file checks that the
   assistant actually stopped recommending it, on every surface the repo
   itself decides deterministically:

   1. STORE KNOWLEDGE. Every store on /off-sale.js, by the name a shopper
      says (and its spoken variants), answers `off_sale` with at least one
      live alternative -- never a description, never "no conozco esa
      tienda".
   2. PROMPTS AND CANNED CONTENT. The text prompt, the agent prompt, the
      voice prompt, the MCP tool descriptions, the chat quick replies,
      the chat routes and the home page's own example never offer a dead
      store. A sentence that only PROHIBITS one ("no presentes ... Costco")
      is allowed.
   3. TOOL RESULTS. The search endpoint, the MCP connector and the
      committed sales feeds return no row from an off-sale store, a
      store-name query degrades to live stores or to an honest empty
      answer, and a ported product (LEGO 75424) shows its new retailer.

   The live-model and voice halves of the battery cannot run here (no
   model API, no network); see the PR for what to ask on the live site.

   RUNNING IT
     node scripts/test/assistant-truth-tests.mjs
   ARIA_TRUTH_STRICT=1 also fails on the KNOWN OPEN items listed at the end.
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OFF_SALE_RETAILERS, isOffSaleRetailer } from "../lib/off-sale.js";
import { RETAILERS } from "../lib/retailers.js";

const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const read = (p) => readFileSync(ROOT + p, "utf8");

let passed = 0;
const failures = [];
const open = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name + "\n         " + e.message); }
}
async function knownOpen(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name + " (was a known open item: remove the knownOpen wrapper)"); }
  catch (e) { open.push(`${name}\n         ${e.message}`); console.log("    OPEN " + name + "\n         " + e.message); }
}

/* The names a shopper says for each off-sale store. */
const SPOKEN = {
  target: ["Target"], bestbuy: ["Best Buy", "bestbuy"], costco: ["Costco", "Costco online"],
  nike: ["Nike", "nike.com"], footlocker: ["Foot Locker", "footlocker"], kohls: ["Kohls", "Kohl's"],
  macys: ["Macy's", "Macys"], gap: ["Gap"], oldnavy: ["Old Navy"], bananarepublic: ["Banana Republic"],
  athleta: ["Athleta"], ulta: ["Ulta", "Ulta Beauty"], ssense: ["SSENSE"], yesstyle: ["YesStyle", "Yes Style"],
  victoriassecret: ["Victoria's Secret", "Victorias Secret", "Victoria Secret", "VS"],
  newbalance: ["New Balance"], gymshark: ["Gymshark", "gym shark"], alphalete: ["Alphalete"],
  miumiu: ["Miu Miu"], fendi: ["Fendi"], goldengoose: ["Golden Goose"], pacsun: ["PacSun", "Pac Sun"],
  surfworld: ["Surf World"],
};

/* ------------------------------------------------------------------ */
console.log("\n  1. store knowledge");
const K = await import(ROOT + "netlify/functions/_store-knowledge.js");

await check("every off-sale store has its spoken names in this battery", () => {
  const missing = OFF_SALE_RETAILERS.filter((k) => !SPOKEN[k]);
  assert.deepEqual(missing, [], "add the shopper-facing names for: " + missing.join(", "));
});
for (const key of OFF_SALE_RETAILERS) {
  for (const said of SPOKEN[key] || []) {
    await check(`get_store_info("${said}") -> off_sale, with a live alternative`, () => {
      const r = K.getStoreInfo(said);
      assert.equal(r.off_sale, true, JSON.stringify(r).slice(0, 160));
      assert.equal(r.store, key);
      assert.ok(!r.product_count && !r.best_for && !r.specialties, "it describes the store");
      assert.ok(Array.isArray(r.alternatives) && r.alternatives.length > 0, "no live alternative to offer");
      for (const a of r.alternatives) {
        assert.ok(!isOffSaleRetailer(a.store), "alternative " + a.store + " is off sale");
        assert.ok(K.STORE_KNOWLEDGE[a.store], "alternative " + a.store + " has no knowledge entry");
        assert.ok(K.STORE_KNOWLEDGE[a.store].product_count >= K.MIN_RECOMMEND_DEPTH, "alternative " + a.store + " is too thin");
      }
    });
  }
}

/* ------------------------------------------------------------------ */
console.log("\n  2. prompts and canned content");

/* Store names that are only a store. Nike, New Balance, Miu Miu, Fendi
   and Golden Goose are also BRANDS still sold through live stores, so a
   prompt may say "unas Nike"; their store-only forms are checked below. */
const STORE_ONLY = ["Target", "Best Buy", "Costco", "Foot Locker", "Kohl's", "Kohls", "Macy's", "Macys",
  "Old Navy", "Gap", "Banana Republic", "Athleta", "Ulta", "SSENSE", "YesStyle", "Yes Style",
  "Victoria's Secret", "Victorias Secret", "Victoria Secret", "Gymshark", "Alphalete", "PacSun", "Pac Sun",
  "Nike.com", "Nike direct", "tienda de Nike", "tienda Nike", "tienda de New Balance"];
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/* A sentence that only prohibits a store is fine. */
const PROHIBITS = /\b(?:no presentes|nunca (?:recomiendes|ofrezcas|menciones)|ya no vendemos|no vendemos|never|no longer)\b/i;
function offers(text) {
  const hits = [];
  const sentences = stripComments(text).split(/(?<=[.;:!?\n])\s/);
  for (const s of sentences) {
    if (PROHIBITS.test(s)) continue;
    for (const name of STORE_ONLY) {
      const re = new RegExp("(?<![\\w-])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])", "i");
      /* "target" is also an English word in code; prompts are prose, so
         only the capitalised store name counts there. */
      const reCase = name === "Target" || name === "Gap" ? new RegExp("(?<![\\w-])" + name + "(?![\\w-])") : re;
      if (reCase.test(s)) hits.push(name + " in: " + s.trim().slice(0, 120));
    }
  }
  return hits;
}
const PROMPT_FILES = [
  "netlify/functions/_aria-prompt.js",
  "netlify/functions/_aria-agent-prompt.js",
  "netlify/functions/_aria-chat-model.js",
  "scripts/lib/realtime-voice.js",
  "assets/js/aria-launcher.js",
];
for (const f of PROMPT_FILES) {
  await check(`${f}: no dead store offered`, () => {
    const hits = offers(read(f));
    assert.deepEqual(hits, [], hits.join("\n         "));
  });
}

await check("voice prompt tells Aria what to do with off_sale", () => {
  const v = read("scripts/lib/realtime-voice.js");
  assert.match(v, /"off_sale"/, "the voice prompt never mentions off_sale");
  assert.match(v, /alternatives/, "the voice prompt does not point at the alternatives");
});

await check("MCP tool descriptions name no off-sale store as an example", async () => {
  const { TOOL_DEFINITIONS } = await import("../lib/mcp/tools.mjs");
  const text = JSON.stringify(TOOL_DEFINITIONS);
  for (const k of OFF_SALE_RETAILERS) assert.ok(!new RegExp('\\\\"' + k + '\\\\"').test(text), "MCP example store: " + k);
  const hits = offers(TOOL_DEFINITIONS.map((t) => t.description + " " + JSON.stringify(t.inputSchema)).join("\n"));
  assert.deepEqual(hits, [], hits.join("; "));
});

const bundleName = /<script src="\/build\/(app-[0-9a-f]{16}\.js)"><\/script>/.exec(read("index.html"))[1];
const bundle = read("build/" + bundleName);
function constBlock(src, name) {
  const at = src.indexOf("const " + name + " = ");
  assert.ok(at >= 0, name + " not found in the bundle");
  const open = src.indexOf(src[src.indexOf("=", at) + 2], at);
  const closer = { "[": "]", "{": "}" }[src[open]];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === src[open]) depth++;
    else if (src[i] === closer && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(name + " is not closed");
}
await check("chat quick replies name no dead store", () => {
  const hits = offers(constBlock(bundle, "ARIA_QUICK_REPLIES"));
  assert.deepEqual(hits, [], hits.join("; "));
});
await check("chat routes (domain fallbacks, overrides, gift interests) never open an off-sale store", () => {
  for (const name of ["CHAT_DOMAIN_FALLBACKS", "CHAT_DOMAIN_OVERRIDES", "CHAT_POLICY_EXCLUSIONS", "CHAT_GIFT_INTERESTS"]) {
    const block = constBlock(bundle, name);
    for (const m of block.matchAll(/action:\s*'store',\s*key:\s*'([a-z0-9]+)'/g)) {
      assert.ok(!isOffSaleRetailer(m[1]), `${name} routes to off-sale store ${m[1]}`);
    }
    const hits = offers(block.replace(/keys:\s*\[[^\]]*\]/g, ""));
    assert.deepEqual(hits, [], name + ": " + hits.join("; "));
  }
});
await check("the chat store router builds its doors without off-sale stores", () => {
  const at = bundle.indexOf("function chatStoreIndex(");
  const body = bundle.slice(at, bundle.indexOf("\n}\n", at));
  assert.match(body, /!isOffSaleRetailer\(k\)/, "chatStoreIndex no longer drops off-sale stores");
});
await check("index.html shows no off-sale store as an example or recommendation", () => {
  const html = read("index.html");
  for (const m of html.matchAll(/class="howStoreLogo" data-retailer="([a-z0-9]+)"/g)) {
    assert.ok(!isOffSaleRetailer(m[1]), "Cómo funciona shows " + m[1]);
  }
  for (const m of html.matchAll(/data-quick-reply="([^"]*)"/g)) {
    const hits = offers(m[1]);
    assert.deepEqual(hits, [], hits.join("; "));
  }
});

/* ------------------------------------------------------------------ */
console.log("\n  3. tool results");
const { handler: searchHandler } = await import("../../netlify/functions/search.js");
const fetchImpl = async () => ({ ok: true, json: async () => ({ venta: 3.75 }) });
async function ask(q) {
  const r = await searchHandler({ httpMethod: "GET", queryStringParameters: { q, page: "1" } }, { fetchImpl });
  assert.equal(r.statusCode, 200);
  return JSON.parse(r.body);
}
const rowsOf = (b) => [...(b.items || []), ...((b.lanes || []).flatMap((l) => l.items || [])),
  ...((b.compare && (b.compare.groups || b.compare.items)) || []).flatMap((g) => g.offers || g.items || [g])];

const STORE_QUERIES = ["target juguetes", "target", "victoria's secret brasier", "victorias secret", "nike air max",
  "ssense", "best buy", "costco", "foot locker jordan", "kohls", "macy's", "old navy", "gap jeans", "banana republic",
  "athleta leggings", "ulta", "yesstyle", "new balance 550", "gymshark", "alphalete", "miu miu", "fendi",
  "golden goose", "pacsun"];
for (const q of STORE_QUERIES) {
  await check(`search "${q}": no off-sale row; live results or an honest empty answer`, async () => {
    const b = await ask(q);
    const dead = rowsOf(b).filter((it) => isOffSaleRetailer(it.store || it.retailer));
    assert.equal(dead.length, 0, "off-sale rows: " + dead.slice(0, 3).map((d) => d.store + " " + d.title).join(" | "));
    assert.ok(["results", "none"].includes(b.state), "state " + b.state);
    if (b.state === "results") assert.ok(b.items.length > 0);
  });
}
await check('search "75424": the ported LEGO AT-ST shows retailer Walmart', async () => {
  const b = await ask("75424");
  const hit = (b.items || []).find((it) => /AT-ST/i.test(it.title));
  assert.ok(hit, "LEGO 75424 not found");
  assert.equal(hit.store, "walmart");
});

const { loadPageEngine } = await import("../lib/mcp/page-slices.mjs");
const { buildCatalog } = await import("../lib/mcp/catalog.mjs");
const { searchProducts } = await import("../lib/mcp/tools.mjs");
const catalog = buildCatalog({ engine: loadPageEngine() });
const mctx = { catalog, fx: { venta: 3.512, compra: 3.498, fetchedAt: Date.now(), error: null } };

await check("MCP pool holds no off-sale row", () => {
  const dead = catalog.items.filter((i) => isOffSaleRetailer(i.retailer));
  assert.equal(dead.length, 0, dead.length + " off-sale rows in the MCP pool");
});
for (const q of ["target juguetes", "victoria's secret brasier", "nike air max", "ssense", "costco", "gymshark leggings", "pacsun"]) {
  await check(`MCP search_products "${q}": no off-sale row`, () => {
    const out = searchProducts({ query: q, limit: 20 }, mctx);
    const dead = out.products.filter((p) => isOffSaleRetailer(p.store));
    assert.equal(dead.length, 0, dead.map((d) => d.store).join(","));
  });
}
for (const [query, store] of [["juguetes", "target"], ["brasier", "victoriassecret"], ["zapatillas", "Nike"], ["jeans", "old navy"]]) {
  await check(`MCP search_products store="${store}": empty, with the off-sale note`, () => {
    const out = searchProducts({ query, store, limit: 20 }, mctx);
    assert.equal(out.count, 0);
    assert.match(out.note || "", /no longer sells/i, "note: " + out.note);
  });
}
await check('MCP search_products "LEGO 75424": the ported set shows store walmart', () => {
  const out = searchProducts({ query: "LEGO 75424", limit: 5 }, mctx);
  const hit = out.products.find((p) => /AT-ST/i.test(p.title));
  assert.ok(hit, "not found");
  assert.equal(hit.store, "walmart");
});

await check("committed sales feeds hold no off-sale row", () => {
  for (const f of ["ofertas-feed.json", "ofertas-feed-lite.json"]) {
    const dead = JSON.parse(read(f)).items.filter((it) => isOffSaleRetailer(it.retailer));
    assert.equal(dead.length, 0, `${f}: ${dead.length}`);
  }
  const deals = JSON.parse(read("assets/ofertas/deals.json"));
  const dead = deals.items.filter((r) => isOffSaleRetailer(r[3]));
  assert.equal(dead.length, 0, "deals.json: " + dead.length);
  const stores = Array.isArray(deals.stores) ? deals.stores : Object.keys(deals.stores || {});
  for (const s of stores) assert.ok(!isOffSaleRetailer(typeof s === "string" ? s : s.key), "deals.json store " + JSON.stringify(s));
});
await check("the live sales cache filters off-sale rows before serving", () => {
  const src = stripComments(read("netlify/functions/sales-cache.js"));
  assert.match(src, /cached\.items\.filter\(\(it\) => !isOffSaleItem\(it\)\)/);
});

/* ------------------------------------------------------------------
   KNOWN OPEN (reported, not fixed here: not a string re-point).
   All the LEGO the catalogue still sells is at Walmart, whose rows carry
   no brand field; the only rows branded "LEGO" were Target's, now off
   sale. So the search pipeline's "brand we do not carry" guard answers
   "lego" with "Todavía no vendemos LEGO" over 860 LEGO sets.
   ------------------------------------------------------------------ */
console.log("\n  known open");
await knownOpen('search "lego" / "LEGO 75424" finds the Walmart LEGO sets', async () => {
  for (const q of ["lego", "LEGO 75424"]) {
    const b = await ask(q);
    assert.equal(b.missingBrand, null, `"${q}" answers "Todavía no vendemos ${String(b.missingBrand).toUpperCase()}"`);
    assert.ok((b.items || []).some((it) => it.store === "walmart" && /lego/i.test(it.title)), `"${q}": no Walmart LEGO`);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed, ${open.length} known open`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); }
if (failures.length || (process.env.ARIA_TRUTH_STRICT === "1" && open.length)) process.exit(1);
