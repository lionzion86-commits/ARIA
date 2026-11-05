/* ==================================================================
   SHOP BLOBS: STRONG ONLY WHERE STRONG WORKS (#443 c.6668071617; root
   cause found in #681).

     node scripts/test/blobs-strong-tests.mjs

   A store opened with consistency "strong" sends every operation (writes
   too) to the Blobs context's uncachedEdgeURL; Lambda-compat functions
   never have one, so every call threw BlobsConsistencyError. These tests
   run the REAL @netlify/blobs client against local http servers, and pin
   statically that nothing opens a strong store except the helpers.
   ================================================================== */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FN = join(ROOT, "netlify/functions");
let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.message).slice(0, 400)}`); console.log("    FAIL " + name); }
}
const B = await import(join(FN, "_blobs-store.js"));
const { getStore } = await import("@netlify/blobs");

const hits = [];
const mk = (tag) => new Promise((res) => {
  const srv = createServer((q, a) => { hits.push(tag + " " + q.method); q.resume(); q.on("end", () => { if (q.method === "GET") { a.writeHead(404); a.end(); } else { a.writeHead(200, { etag: '"1"' }); a.end(); } }); });
  srv.listen(0, "127.0.0.1", () => res(srv));
});
const edge = await mk("edge"), uncached = await mk("uncached");
const url = (s) => `http://127.0.0.1:${s.address().port}`;
const setCtx = (o) => { process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(o)).toString("base64"); };
const quiet = console.warn;
let warnings = 0;
console.warn = () => { warnings++; };

console.log("  Shop Blobs consistency");

await test("real client, Lambda context (edge only): the old strong pairing throws; strongStore writes to the edge and does not throw", async () => {
  setCtx({ edgeURL: url(edge), siteID: "site", token: "t" });
  hits.length = 0; B.__resetWarning(); warnings = 0;
  await assert.rejects(() => getStore({ name: "dispatch", consistency: "strong" }).setJSON("k", { n: 1 }), (e) => e.name === "BlobsConsistencyError");
  await B.strongStore("dispatch").setJSON("k", { n: 1 });
  await B.strongStore("voice-threads").setJSON("k", { n: 1 });
  assert.equal(await B.strongStore("dispatch").get("missing"), null);
  assert.deepEqual(hits, ["edge PUT", "edge PUT", "edge GET"]);
  assert.equal(warnings, 1, "one warning per process");
  const { strongStore: viaAgent } = await import(join(FN, "agent-dispatch.js"));
  await viaAgent("dispatch").setJSON("k2", { n: 2 });
  assert.equal(hits.at(-1), "edge PUT", "admin-dispatch / agent-dispatch use the same helper");
});

await test("real client, v2 context (uncachedEdgeURL): strongStore is really strong (writes and reads go uncached)", async () => {
  setCtx({ edgeURL: url(edge), uncachedEdgeURL: url(uncached), siteID: "site", token: "t" });
  hits.length = 0;
  await B.strongStore("dispatch").setJSON("k", { n: 3 });
  await B.strongStore("dispatch").get("k");
  assert.deepEqual(hits, ["uncached PUT", "uncached GET"]);
});

await test("v2 adapter: a Request reaches the Lambda logic and a Response comes back (voice-thread)", async () => {
  const vt = (await import(join(FN, "voice-thread.js"))).default;
  const prev = process.env.LIVEKIT_API_SECRET;
  delete process.env.LIVEKIT_API_SECRET;
  let r = await vt(new Request("https://ariashop.pe/api/voice-thread?thread=x"), { ip: "10.0.0.1" });
  assert.ok(r instanceof Response); assert.equal(r.status, 503);
  process.env.LIVEKIT_API_SECRET = "s";
  r = await vt(new Request("https://ariashop.pe/api/voice-thread", { method: "POST", body: "{}" }), {});
  assert.equal(r.status, 401); assert.deepEqual(await r.json(), { error: "unauthorized" });
  r = await vt(new Request("https://ariashop.pe/api/voice-thread", { method: "PUT" }), {});
  assert.equal(r.status, 405);
  if (prev === undefined) delete process.env.LIVEKIT_API_SECRET; else process.env.LIVEKIT_API_SECRET = prev;
  const ad = (await import(join(FN, "admin-dispatch.js"))).default;
  setCtx({ edgeURL: url(edge), uncachedEdgeURL: url(uncached), siteID: "site", token: "t" });
  r = await ad(new Request("https://ariashop.pe/.netlify/functions/admin-dispatch", { method: "OPTIONS" }), {});
  assert.equal(r.status, 200);
});

await test("static: nothing opens a strong store except the helpers; converted functions are v2 default exports; schedules unchanged", async () => {
  const HELPERS = new Set(["_blobs-store.js", "_hs-store.js"]);
  const files = readdirSync(FN).filter((f) => f.endsWith(".js"));
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const f of files) {
    const src = strip(readFileSync(join(FN, f), "utf8"));
    if (!HELPERS.has(f)) assert.ok(!/consistency\s*:\s*["']strong["']/.test(src), `${f} opens a strong store directly; use strongStore() from _blobs-store.js`);
  }
  const V2 = ["voice-thread.js", "agent-dispatch.js", "admin-dispatch.js", "admin-agents.js", "dispatch-reconcile.js", "dispatch-watchdog.js"];
  for (const f of V2) {
    const src = strip(readFileSync(join(FN, f), "utf8"));
    assert.match(src, /export default /, f + " default export");
    assert.ok(!/export\s+(async\s+)?function\s+handler\b|export\s+const\s+handler\b|export\s*\{[^}]*\bhandler\b/.test(src), f + " must not export a Lambda `handler` (that deploys it as v1)");
    assert.ok(!/\bconnectLambda\(/.test(src), f + " uses connectIfLambda");
  }
  assert.match(readFileSync(join(FN, "dispatch-reconcile.js"), "utf8"), /export const config = \{ schedule: "10 5 \* \* \*" \};/);
  assert.match(readFileSync(join(FN, "dispatch-watchdog.js"), "utf8"), /export const config = \{ schedule: "\*\/5 \* \* \* \*" \};/);
  /* Every function that uses strongStore is either a v2 default export or the Lambda-shaped webhook (eventual fallback). */
  const LAMBDA_FALLBACK = new Set(["stripe-webhook.js"]);
  for (const f of files.filter((x) => !x.startsWith("_"))) {
    const src = strip(readFileSync(join(FN, f), "utf8"));
    if (!/\bstrongStore\b/.test(src)) continue;
    assert.ok(/export default /.test(src) || LAMBDA_FALLBACK.has(f), `${f} uses strongStore but is neither v2 nor a known Lambda fallback`);
  }
});

console.warn = quiet;
edge.close(); uncached.close();
delete process.env.NETLIFY_BLOBS_CONTEXT;
console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
