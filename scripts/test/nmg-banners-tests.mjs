/* ==================================================================
   NEIMAN MARCUS GROUP BANNERS — OFFLINE TESTS (#443, Danny 2026-10-22:
   Neiman Marcus, Bergdorf Goodman and Horchow through one Sovrn build;
   Horchow parcel-only).

   No network, no spend. Every row is a TEST FIXTURE written by hand:
   names, brands, prices and image URLs are FAKE (example.test hosts,
   "Fixture" names) and are NOT product data. The end-to-end CLI test
   answers from a local server on 127.0.0.1:8991.

     node scripts/test/nmg-banners-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NMG_BANNERS, bannerOf, parcelVerdict, parcelDepartmentOf, longestSideCm, PARCEL_MAX_SIDE_CM } from "../lib/nmg-banners.js";
import { ingestRow, ingestPull, productCount, emptyCatalog } from "../lib/neimanmarcus.js";
import { sovrnToRow, plainBannerUrl, bannerEntries, groupIdGuidance, checkSweepPlan, replayResponses } from "../lib/sovrn.js";
import { loadShippable } from "../build-store-slices.mjs";
import { specWeightKg } from "../../netlify/functions/_weight-resolve.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const failures = [];
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (err) { failures.push(name); console.log("    FAIL " + name + "\n         " + String(err && err.stack || err).split("\n").slice(0, 6).join("\n         ")); }
}

const ctx = { isShippableItem: loadShippable(ROOT), specWeightKg: (x) => specWeightKg(x), generatedAt: "2026-01-01T00:00:00.000Z" };
const img = (n) => `https://img.example.test/fixture/${n}.jpg`;

/* TEST FIXTURE — not product data. */
function homeRow(over = {}) {
  return {
    productId: "FIXTURE-H-001",
    name: "Fixture Sateen Sheet Set",
    brand: "Fixture Linens",
    price: 180,
    currency: "USD",
    images: [img("h1"), img("h2")],
    breadcrumbs: ["Bedding", "Sheets"],
    description: "A fixture sheet set for tests. Second fixture sentence.",
    specifications: [{ name: "Shipping Weight", value: "3 lb" }],
    ...over,
  };
}

console.log("\n  Neiman Marcus Group banners — config");

await test("three banners, each with the merchant id Lucifer verified in Sovrn (c.6341843561)", () => {
  assert.deepEqual(Object.keys(NMG_BANNERS), ["neimanmarcus", "bergdorfgoodman", "horchow"]);
  assert.equal(bannerOf("neimanmarcus").merchantId, "2243");
  assert.equal(bannerOf("bergdorfgoodman").merchantId, "6756");
  assert.equal(bannerOf("horchow").merchantId, "666");
  assert.equal(bannerOf("Bergdorf-Goodman").key, "bergdorfgoodman", "spelling-tolerant");
  assert.equal(bannerOf().key, "neimanmarcus", "Neiman Marcus by default");
  assert.throws(() => bannerOf("lastcall"), /unknown banner/);
  const envs = Object.values(NMG_BANNERS).map((b) => b.groupEnv);
  assert.equal(new Set(envs).size, 3, "each banner has its own group-id env var");
  assert.equal(new Set(Object.values(NMG_BANNERS).map((b) => b.outFile)).size, 3);
  assert.deepEqual(Object.values(NMG_BANNERS).filter((b) => b.parcelOnly).map((b) => b.key), ["horchow"]);
});

await test("each banner's sweep plan is valid and runs sale first; Horchow sweeps only the five parcel departments", () => {
  for (const b of Object.values(NMG_BANNERS)) {
    const plan = checkSweepPlan(JSON.parse(readFileSync(join(ROOT, b.sweepPlan), "utf8")));
    assert.equal(plan.departments[0].category, "sale", b.key);
    assert.deepEqual(plan.request, JSON.parse(readFileSync(join(ROOT, NMG_BANNERS.neimanmarcus.sweepPlan), "utf8")).request, `${b.key}: the same request template`);
  }
  const hz = JSON.parse(readFileSync(join(ROOT, NMG_BANNERS.horchow.sweepPlan), "utf8"));
  assert.deepEqual(hz.departments.map((d) => d.category), ["sale", "bedding", "bath", "tabletop", "small_decor", "kitchen"]);
  const terms = hz.departments.flatMap((d) => d.terms).concat(hz.modifiers || []);
  const freight = terms.filter((t) => parcelVerdict({ name: t }) === "not-parcel-freight");
  assert.deepEqual(freight, [], "no Horchow sweep term asks for furniture, lighting or rugs");
});

console.log("\n  Horchow — the parcel filter (binding)");

await test("the five parcel departments enter; furniture, lighting, rugs, mirrors and wall art never do", () => {
  for (const [name, crumbs] of [["Fixture Sateen Sheet Set", ["Bedding"]], ["Fixture Bath Towel Set", ["Bath"]], ["Fixture Dinner Plates, Set of 4", ["Tabletop"]],
    ["Fixture Scented Candle", ["Decor"]], ["Fixture Cheese Board", ["Kitchen"]], ["Fixture Table Runner", ["Tabletop"]], ["Fixture Bath Rug", ["Bath"]], ["Fixture Bed Skirt", ["Bedding"]]]) {
    assert.equal(parcelVerdict({ name, breadcrumbs: crumbs }), null, name);
  }
  for (const [name, crumbs] of [["Fixture Velvet Sofa", ["Furniture"]], ["Fixture King Bed Frame", ["Bedroom"]], ["Fixture Hand-Knotted Area Rug", ["Rugs"]],
    ["Fixture Coffee Table", ["Living Room"]], ["Fixture Floor Mirror", ["Decor"]], ["Fixture Table Lamp", ["Lighting"]], ["Fixture Crystal Chandelier", ["Lighting"]],
    ["Fixture Framed Wall Art", ["Decor"]], ["Fixture Leather Club Chair", ["Living Room"]], ["Fixture Six-Drawer Dresser", ["Bedroom"]], ["Fixture Linen Throw", ["Furniture", "Sofas"]]]) {
    assert.equal(parcelVerdict({ name, breadcrumbs: crumbs }), "not-parcel-freight", name);
  }
  assert.equal(parcelVerdict({ name: "Fixture Gift Box", breadcrumbs: ["Gifts"] }), "not-parcel-department", "outside the five departments: not taken");
  assert.equal(parcelDepartmentOf({ name: "Fixture Duvet Cover" }), "bedding");
});

await test("a published side over 100 cm or the site's own unshippable rule keeps a row out", () => {
  assert.equal(longestSideCm("12 x 8 x 4 in"), 30.48);
  assert.equal(longestSideCm("40 x 20 cm"), 40);
  assert.equal(longestSideCm(null), null);
  assert.equal(parcelVerdict({ name: "Fixture Vase", breadcrumbs: ["Decor"] }, { dimensions: "Height 48 in x Width 20 in" }), "not-parcel-dimensions");
  assert.ok(48 * 2.54 > PARCEL_MAX_SIDE_CM);
  assert.equal(parcelVerdict({ name: "Fixture Vase", breadcrumbs: ["Decor"] }, { dimensions: "14 x 6 in" }), null);
  assert.equal(parcelVerdict({ name: "Fixture Vase", breadcrumbs: ["Decor"] }, { name: "Fixture Vase", weightKg: 40 }, { isShippableItem: ctx.isShippableItem }), "not-parcel-site-rule");
});

await test("ingestRow under --banner horchow: a sheet set is published as Horchow's; furniture, a non-parcel department and a large box are dropped", () => {
  const hz = { ...ctx, banner: "horchow" };
  const v = ingestRow(homeRow(), { category: "bedding", bucket: "home_decor" }, hz);
  assert.ok(v.item, JSON.stringify(v));
  assert.equal(v.item.retailer, "horchow");
  assert.equal(v.item.seller, "Horchow");
  assert.equal(v.item.descriptionSource, "horchow-pdp");
  assert.equal(v.bucket, "home_decor");
  assert.equal(ingestRow(homeRow({ name: "Fixture Velvet Sofa", breadcrumbs: ["Furniture"] }), {}, hz).drop, "out-of-scope-furniture", "the shared scope rule still runs first");
  assert.equal(ingestRow(homeRow({ name: "Fixture Leather Club Chair", breadcrumbs: ["Living Room"] }), {}, hz).drop, "not-parcel-freight", "what the shared rule lets through, Horchow's does not");
  assert.equal(ingestRow(homeRow({ name: "Fixture Gift Box", breadcrumbs: ["Gifts"] }), {}, hz).drop, "not-parcel-department");
  assert.equal(ingestRow(homeRow({ specifications: [{ name: "Dimensions", value: "60 x 50 x 40 in" }] }), {}, hz).drop, "not-parcel-dimensions");
  assert.equal(ingestRow(homeRow({ seller: "Fixture Marketplace Partner" }), {}, hz).quarantine, "seller-not-horchow");
  assert.ok(ingestRow(homeRow({ seller: "Horchow" }), {}, hz).item);
  /* Neiman Marcus is not parcel-only: its own scope rule only. */
  const nm = ingestRow(homeRow({ name: "Fixture Gift Box", breadcrumbs: ["Gifts"] }), {}, ctx);
  assert.equal(nm.item.retailer, "neimanmarcus");
});

console.log("\n  Bergdorf Goodman — key, seller, source page");

await test("ingestRow and ingestPull under --banner bergdorfgoodman write Bergdorf Goodman's own envelope", () => {
  const bg = { ...ctx, banner: "bergdorfgoodman" };
  const row = homeRow({ name: "Fixture Women's Silk Blouse", breadcrumbs: ["Women", "Tops"], seller: "Bergdorf Goodman" });
  const v = ingestRow(row, { category: "women_apparel", gender: "women" }, bg);
  assert.equal(v.item.retailer, "bergdorfgoodman");
  assert.equal(v.item.seller, "Bergdorf Goodman");
  assert.equal(v.item.sellerSource, "row");
  assert.equal(ingestRow({ ...row, seller: "Neiman Marcus" }, {}, bg).quarantine, "seller-not-bergdorf-goodman", "a sister banner is not this banner's seller");
  const { catalog } = ingestPull([{ quota: { category: "women_apparel", gender: "women" }, items: [row] }], bg);
  assert.deepEqual(Object.keys(catalog.retailers), ["bergdorfgoodman"]);
  assert.equal(catalog.retailers.bergdorfgoodman.label, "Bergdorf Goodman");
  assert.equal(productCount(catalog, "bergdorfgoodman"), 1);
  assert.equal(productCount(catalog), 0, "not counted as Neiman Marcus");
  assert.deepEqual(Object.keys(emptyCatalog("horchow").retailers), ["horchow"]);
  assert.deepEqual(Object.keys(emptyCatalog().retailers), ["neimanmarcus"]);
});

await test("the Sovrn mapper keeps only a plain page on the banner's own host, and the banner's merchant id as itself", () => {
  assert.equal(plainBannerUrl("https://www.bergdorfgoodman.com/p/fixture-1?ecid=x#top", "bergdorfgoodman.com"), "https://www.bergdorfgoodman.com/p/fixture-1");
  assert.equal(plainBannerUrl("https://www.neimanmarcus.com/p/fixture-1", "bergdorfgoodman.com"), null);
  assert.equal(plainBannerUrl("https://notbergdorfgoodman.com/p/fixture-1", "bergdorfgoodman.com"), null);
  const raw = { productId: "FIXTURE-SV-1", name: "Fixture Linen Napkins", price: 60, currency: "USD", imageUrl: img("n1"), merchantName: "Horchow", merchantId: 666, url: "https://www.horchow.com/p/fixture-napkins?src=aff" };
  const row = sovrnToRow(raw, { merchantIds: ["666", "G-HZ"], banner: "horchow" });
  assert.equal(row.url, "https://www.horchow.com/p/fixture-napkins");
  assert.equal(row.seller, "Horchow");
  const other = sovrnToRow({ ...raw, merchantId: 2243, merchantName: "Neiman Marcus" }, { merchantIds: ["666", "G-HZ"], banner: "horchow" });
  assert.equal(other.seller, "Neiman Marcus", "a sister banner's listing is held by the seller rule, not taken as Horchow's");
  const rp = replayResponses([{ department: "tabletop", status: 200, body: { products: [raw] } }], { merchantIds: ["666"], banner: "horchow" });
  assert.equal(rp.found[0].row.url, "https://www.horchow.com/p/fixture-napkins");
});

await test("group id: each banner's guidance names its own merchant id and env var; the Approved Merchants reader finds its entry", () => {
  const g = groupIdGuidance({ banner: "horchow" });
  assert.match(g, /HORCHOW GROUP ID MISSING/);
  assert.match(g, /merchant 666/);
  assert.match(g, /HORCHOW_SOVRN_GROUP_ID/);
  assert.match(groupIdGuidance({ banner: "bergdorfgoodman" }), /BG_SOVRN_GROUP_ID/);
  assert.match(groupIdGuidance(), /NEIMAN MARCUS GROUP ID MISSING/);
  const answer = { merchants: [{ name: "Fixture Other Store", merchantId: 1 }, { name: "Bergdorf Goodman", merchantId: 6756, groupId: "G-FIXTURE-BG" }, { name: "Horchow", merchantId: 666, groupId: "666" }] };
  assert.deepEqual(bannerEntries(answer, "bergdorfgoodman").map((h) => h.groupId), ["G-FIXTURE-BG"]);
  assert.deepEqual(bannerEntries(answer, "horchow").map((h) => h.groupId), ["666"]);
});

console.log("\n  CLI — --banner");

function runCli(argv, env) {
  return new Promise((res) => {
    const p = spawn(process.execPath, argv, { env });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => res({ status: code, stdout: out, stderr: err }));
  });
}
const CLI = join(ROOT, "scripts/build-neimanmarcus-catalog.mjs");

await test("--banner horchow without its group id: Horchow's guidance, exit 5, nothing requested; the Apify path is refused for it", async () => {
  const env = { ...process.env, SOVRN_API_KEY: "TESTKEY-FIXTURE-0002", HORCHOW_SOVRN_GROUP_ID: "", NM_SOVRN_GROUP_ID: "G-NOT-USED", SOVRN_PRODUCTS_URL: "http://127.0.0.1:9/never" };
  const r = await runCli([CLI, "--banner", "horchow", "--via", "sovrn", "--dry-run"], env);
  assert.equal(r.status, 5, r.stdout + r.stderr);
  assert.match(r.stdout, /HORCHOW GROUP ID MISSING/);
  const a = await runCli([CLI, "--banner", "bergdorfgoodman"], env);
  assert.equal(a.status, 1);
  assert.match(a.stderr, /only routes are --via sovrn and --src/);
});

await test("--banner horchow --via sovrn --dry-run (local fixture server): its group id, its folder, parcel rows only, no catalogue", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nmg-horchow-"));
  const seen = [];
  /* TEST FIXTURES — not product data. */
  const products = [
    { productId: "FIXTURE-HZ-1", name: "Fixture Percale Sheet Set", brand: "Fixture Linens", price: 220, currency: "USD", imageUrl: img("hz1"), additionalImages: [img("hz1b")], merchantName: "Horchow", merchantId: 666, category: "Bedding > Sheets", description: "A fixture sheet set. Second fixture sentence.", url: "https://www.horchow.com/p/fixture-sheets" },
    { productId: "FIXTURE-HZ-2", name: "Fixture Porcelain Dinner Plates, Set of 4", brand: "Fixture Table", price: 140, currency: "USD", imageUrl: img("hz2"), merchantName: "Horchow", merchantId: 666, category: "Tabletop > Dinnerware" },
    { productId: "FIXTURE-HZ-3", name: "Fixture Tufted Velvet Sofa", brand: "Fixture Home", price: 2400, currency: "USD", imageUrl: img("hz3"), merchantName: "Horchow", merchantId: 666, category: "Furniture > Sofas" },
    { productId: "FIXTURE-HZ-4", name: "Fixture Crystal Table Lamp", brand: "Fixture Light", price: 480, currency: "USD", imageUrl: img("hz4"), merchantName: "Horchow", merchantId: 666, category: "Lighting > Table Lamps" },
  ];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      seen.push({ url: req.url, body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ products: seen.length === 1 ? products : [] }));
    });
  });
  await new Promise((r) => server.listen(8991, "127.0.0.1", r));
  try {
    const plan = join(dir, "plan.json");
    const tmpl = JSON.parse(readFileSync(join(ROOT, NMG_BANNERS.horchow.sweepPlan), "utf8")).request;
    writeFileSync(plan, JSON.stringify({ request: tmpl, departments: [{ category: "sale", phase: 1, bucket: "home_decor", terms: ["sale", "bedding sale"] }] }));
    const env = { ...process.env, NM_DATA_DIR: join(dir, "data"), GROQ_API_KEY: "", SOVRN_API_KEY: "TESTKEY-FIXTURE-0003", HORCHOW_SOVRN_GROUP_ID: "G-FIXTURE-HZ", NM_SOVRN_GROUP_ID: "G-WRONG", SOVRN_PRODUCTS_URL: "http://127.0.0.1:8991/ai-orchestration/products" };
    const r = await runCli([CLI, "--banner", "horchow", "--via", "sovrn", "--dry-run", "--sweep-plan", plan, "--max-requests", "5", "--no-weight-estimates"], env);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(seen.every((s) => /includeMerchants=G-FIXTURE-HZ/.test(s.url)), "Horchow's own group id, not Neiman Marcus's");
    assert.match(r.stdout, /Horchow via Sovrn Commerce/);
    assert.match(r.stdout, /merchant 666, group ID G-FIXTURE-HZ \(differs from the merchant id\)/);
    assert.match(r.stdout, /HORCHOW VIA SOVRN/);
    assert.match(r.stdout, /Horchow ingest: 2 published of 4 rows/);
    assert.match(r.stdout, /"out-of-scope-furniture":1/);
    assert.match(r.stdout, /"not-parcel-freight":1/, "the lamp");
    assert.match(r.stdout, /--dry-run: nothing written/);
    const dirs = readdirSync(join(dir, "data", "horchow")).filter((f) => f.startsWith("sovrn-raw-"));
    assert.equal(dirs.length, 1, "raw answers under data/neimanmarcus/horchow/");
    const index = JSON.parse(readFileSync(join(dir, "data", "horchow", dirs[0], "index.json"), "utf8"));
    assert.equal(index.banner, "horchow");
    assert.equal(index.merchantId, "666");
    for (const f of readdirSync(join(dir, "data", "horchow", dirs[0]))) assert.doesNotMatch(readFileSync(join(dir, "data", "horchow", dirs[0], f), "utf8"), /TESTKEY-FIXTURE-0003/, `the key was written to ${f}`);
    /* Replaying a Horchow harvest as Neiman Marcus is refused. */
    const rp = await runCli([CLI, "--src", join(dir, "data", "horchow", dirs[0]), "--dry-run", "--no-weight-estimates"], env);
    assert.notEqual(rp.status, 0);
    assert.match(rp.stderr, /is a horchow harvest; re-run with --banner horchow/);
    const ok = await runCli([CLI, "--banner", "horchow", "--src", join(dir, "data", "horchow", dirs[0]), "--dry-run", "--no-weight-estimates"], env);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /Horchow ingest: 2 published of 4 rows/);
    assert.equal(existsSync(join(ROOT, NMG_BANNERS.horchow.outFile)), false);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
