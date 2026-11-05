/* ==================================================================
   THE ADDRESSES IN META'S FORM (#443 c.6632377414).

   Danny's Muse Connector Platform submission names
     endpoint       https://connector.ariashop.pe/mcp
     documentation  https://docs.ariashop.pe/mcp
   This pins what the repo does to make both true:

     1. netlify.toml routes each host, first match wins the way Netlify
        reads it: connector.ariashop.pe/mcp reaches the mcp function,
        docs.ariashop.pe/mcp the static page docs/mcp/index.html (and
        NOT the function, which the bare /mcp rule would give it), and
        ariashop.pe/mcp still the function.
     2. A real MCP handshake over HTTP with Host connector.ariashop.pe
        (a local server that applies those rules and runs the handler
        in-process): initialize, notifications/initialized, tools/list,
        tools/call search_products, plus OPTIONS, GET and SSE.
     3. The docs page lists the tools and arguments tools/list really
        advertises, the endpoint, no auth, purchases on ariashop.pe,
        Términos and Privacidad, no emojis and no link off Aria.

     node scripts/test/connector-hosts-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createServer, request } from "node:http";

const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const { handler, originOf } = await import("../../netlify/functions/mcp.js");
const { SEARCH_DEFINITION, GET_DEFINITION } = await import("../../netlify/functions/_muse-tools.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const group = (name) => console.log("\n  " + name);
const SHOW = process.argv.includes("--show");

/* ---------- netlify.toml's redirects, in file order ---------- */
function redirects() {
  const text = readFileSync("netlify.toml", "utf8");
  const out = [];
  for (const block of text.split(/^\[\[redirects\]\]\s*$/m).slice(1)) {
    const body = block.split(/^\[/m)[0];
    const r = {};
    for (const m of body.matchAll(/^\s*(from|to|status|force|query)\s*=\s*(.+?)\s*$/gm)) {
      const v = m[2];
      r[m[1]] = /^".*"$/.test(v) ? v.slice(1, -1) : v === "true" ? true : v === "false" ? false : /^\d+$/.test(v) ? Number(v) : v;
    }
    out.push(r);
  }
  return out;
}
/* Netlify's matching for the rules this file uses: a host-conditioned
   "https://host/path" matches only that host; a bare "/path" matches
   any host; a trailing slash is ignored; a rule with query = {...}
   needs those parameters; the first match wins. */
const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
function route(host, path, query = {}) {
  for (const r of redirects()) {
    let from = r.from;
    const m = /^https?:\/\/([^/]+)(\/.*)$/.exec(from);
    if (m) { if (m[1].toLowerCase() !== host.toLowerCase()) continue; from = m[2]; }
    if (r.query) {
      const keys = [...String(r.query).matchAll(/(\w+)\s*=/g)].map((k) => k[1]);
      if (!keys.every((k) => k in query)) continue;
    }
    if (from.endsWith("/*")) { if (!(norm(path) + "/").startsWith(from.slice(0, -1))) continue; }
    else if (norm(from) !== norm(path)) continue;
    return r;
  }
  return null;
}

group("netlify.toml: each address in Meta's form reaches the right thing");

await check("connector.ariashop.pe/mcp -> the mcp function, a forced 200 rewrite (the same as ariashop.pe/mcp)", () => {
  const all = redirects();
  const own = all.find((r) => r.from === "https://connector.ariashop.pe/mcp");
  assert.ok(own, "a host-conditioned rule for connector.ariashop.pe/mcp exists");
  assert.deepEqual({ to: own.to, status: own.status, force: own.force }, { to: "/.netlify/functions/mcp", status: 200, force: true });
  for (const p of ["/mcp", "/mcp/"]) {
    const r = route("connector.ariashop.pe", p);
    assert.equal(r && r.to, "/.netlify/functions/mcp", p);
    assert.equal(r.status, 200);
  }
  const main = route("ariashop.pe", "/mcp");
  assert.deepEqual({ to: main.to, status: main.status, force: main.force }, { to: "/.netlify/functions/mcp", status: 200, force: true }, "ariashop.pe/mcp unchanged");
  assert.ok(existsSync("netlify/functions/mcp.js"));
});

await check("docs.ariashop.pe/mcp -> docs/mcp/index.html (200), and it comes BEFORE the bare /mcp rule", () => {
  const all = redirects();
  const i = all.findIndex((r) => r.from === "https://docs.ariashop.pe/mcp");
  const bare = all.findIndex((r) => r.from === "/mcp");
  assert.ok(i >= 0, "a host-conditioned rule for docs.ariashop.pe/mcp exists");
  assert.ok(bare >= 0 && i < bare, "the docs rule precedes the bare /mcp rule (first match wins)");
  for (const p of ["/mcp", "/mcp/"]) {
    const r = route("docs.ariashop.pe", p);
    assert.equal(r && r.to, "/docs/mcp/index.html", p);
    assert.equal(r.status, 200);
    assert.equal(r.force, true);
  }
  assert.ok(existsSync("docs/mcp/index.html"));
  const root = route("docs.ariashop.pe", "/");
  assert.equal(root && root.to, "https://docs.ariashop.pe/mcp", "the docs host's root goes to the page");
  assert.equal(route("ariashop.pe", "/"), null, "the store's own root is untouched");
});

await check("the function serves the connector host as its own (OWN_HOST): shards come from this deploy", () => {
  const saved = process.env.ARIA_SITE_ORIGIN;
  delete process.env.ARIA_SITE_ORIGIN;
  try {
    assert.equal(originOf({ headers: { host: "connector.ariashop.pe" } }), "https://connector.ariashop.pe");
    assert.equal(originOf({ headers: { host: "ariashop.pe" } }), "https://ariashop.pe");
  } finally { if (saved !== undefined) process.env.ARIA_SITE_ORIGIN = saved; }
});

/* ---------- a local Netlify: the rules above, the handler in-process ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".png": "image/png" };
const srv = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const host = String(req.headers.host || "").replace(/:\d+$/, "");
  const url = new URL(req.url, "http://" + host);
  const r = route(host, url.pathname, Object.fromEntries(url.searchParams));
  const to = r ? r.to : url.pathname;
  if (r && r.status >= 300 && r.status < 400) { res.writeHead(r.status, { Location: to }); return res.end(); }
  if (to === "/.netlify/functions/mcp") {
    const out = await handler({
      httpMethod: req.method,
      headers: { ...req.headers, "x-nf-client-connection-ip": "203.0.113.9" },
      body: Buffer.concat(chunks).toString("utf8"),
    }, {}, { fx: 3.38, limiter: null, log: () => {} });
    res.writeHead(out.statusCode, out.headers);
    return res.end(out.body);
  }
  const file = ROOT + to.replace(/^\/+/, "");
  if (!existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[file.slice(file.lastIndexOf("."))] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const PORT = srv.address().port;

/* http.request, not fetch: fetch may not set Host. */
function http(method, host, path, { headers = {}, body } = {}) {
  return new Promise((ok, bad) => {
    const q = request({ host: "127.0.0.1", port: PORT, method, path, headers: { host, ...headers } }, (res) => {
      const parts = [];
      res.on("data", (c) => parts.push(c));
      res.on("end", () => {
        const text = Buffer.concat(parts).toString("utf8");
        let json; try { json = text ? JSON.parse(text) : null; } catch { json = undefined; }
        ok({ status: res.statusCode, headers: res.headers, text, body: json });
      });
    });
    q.on("error", bad);
    if (body !== undefined) q.write(typeof body === "string" ? body : JSON.stringify(body));
    q.end();
  });
}
const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  origin: "https://muse.example.test",
};
const post = (body, extra = {}) => http("POST", "connector.ariashop.pe", "/mcp", { headers: { ...MCP_HEADERS, ...extra }, body });
const show = (label, r) => { if (SHOW) console.log(`\n--- ${label}: HTTP ${r.status} ${r.headers["content-type"] || ""}\n${r.text}`); };

group("the MCP handshake on Host connector.ariashop.pe (HTTP, the handler in-process)");

await check("initialize -> 200 JSON, serverInfo aria-shop, tools capability, CORS open", async () => {
  const r = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "muse-review", version: "1" } } });
  show("initialize", r);
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /^application\/json/);
  assert.equal(r.headers["access-control-allow-origin"], "*");
  assert.equal(r.body.result.protocolVersion, "2025-06-18");
  assert.equal(r.body.result.serverInfo.name, "aria-shop");
  assert.deepEqual(r.body.result.capabilities, { tools: {} });
  assert.equal(r.headers["mcp-session-id"], undefined, "stateless: no session issued");
});

await check("notifications/initialized -> 202, empty", async () => {
  const r = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { "mcp-protocol-version": "2025-06-18" });
  show("notifications/initialized", r);
  assert.equal(r.status, 202);
  assert.equal(r.text, "");
});

await check("tools/list -> search_products and get_product, exactly", async () => {
  const r = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { "mcp-protocol-version": "2025-06-18" });
  if (SHOW) console.log(`\n--- tools/list: HTTP ${r.status}\n` + JSON.stringify(r.body.result.tools.map((t) => ({ name: t.name, required: t.inputSchema.required, arguments: Object.keys(t.inputSchema.properties) }))));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.result.tools.map((t) => t.name), ["search_products", "get_product"]);
});

await check("tools/call search_products {query:\"zapatillas\", limit:3} -> real products, Aria links only", async () => {
  const r = await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_products", arguments: { query: "zapatillas", limit: 3 } } }, { "mcp-protocol-version": "2025-06-18" });
  show("tools/call search_products", r);
  assert.equal(r.status, 200);
  const res = r.body.result;
  assert.equal(res.isError, false);
  const out = res.structuredContent;
  assert.ok(out.count > 0 && out.products.length === 3, "three products");
  for (const p of out.products) {
    assert.ok(p.id && p.title && p.price_usd > 0, "id, title, price");
    assert.match(p.product_url, /^https:\/\/ariashop\.pe\/producto\.html\?/, "the product link is Aria's own page");
  }
});

await check("OPTIONS -> 204 preflight; GET -> 405 Allow: POST, OPTIONS; SSE-only Accept -> one event", async () => {
  const pre = await http("OPTIONS", "connector.ariashop.pe", "/mcp", { headers: { origin: "https://muse.example.test", "access-control-request-method": "POST", "access-control-request-headers": "content-type, mcp-protocol-version" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers["access-control-allow-origin"], "*");
  assert.match(pre.headers["access-control-allow-headers"], /MCP-Protocol-Version/);
  const get = await http("GET", "connector.ariashop.pe", "/mcp", { headers: { accept: "text/event-stream" } });
  assert.equal(get.status, 405);
  assert.equal(get.headers.allow, "POST, OPTIONS");
  const sse = await post({ jsonrpc: "2.0", id: 4, method: "ping" }, { accept: "text/event-stream" });
  assert.equal(sse.status, 200);
  assert.match(sse.headers["content-type"], /^text\/event-stream/);
  assert.match(sse.text, /^event: message\ndata: \{"jsonrpc":"2\.0","id":4,"result":\{\}\}\n\n$/);
});

await check("ariashop.pe/mcp answers the same; docs.ariashop.pe/mcp answers HTML, not JSON-RPC", async () => {
  const main = await http("POST", "ariashop.pe", "/mcp", { headers: MCP_HEADERS, body: { jsonrpc: "2.0", id: 5, method: "tools/list" } });
  assert.deepEqual(main.body.result.tools.map((t) => t.name), ["search_products", "get_product"]);
  const docs = await http("GET", "docs.ariashop.pe", "/mcp");
  assert.equal(docs.status, 200);
  assert.match(docs.headers["content-type"], /^text\/html/);
  assert.match(docs.text, /Conector MCP de Aria Shop/);
  const root = await http("GET", "docs.ariashop.pe", "/");
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, "https://docs.ariashop.pe/mcp");
});
srv.close();

/* ---------- the docs page ---------- */
group("docs/mcp/index.html says what the server really does");
const PAGE = readFileSync("docs/mcp/index.html", "utf8");
const TEXT = PAGE.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

await check("Spanish, and every tool and argument tools/list advertises is named (no others)", () => {
  assert.match(PAGE, /<html lang="es">/);
  for (const def of [SEARCH_DEFINITION, GET_DEFINITION]) {
    assert.ok(PAGE.includes(`<code>${def.name}</code>`), def.name);
    for (const arg of Object.keys(def.inputSchema.properties)) assert.ok(PAGE.includes(`<code>${arg}</code>`), `${def.name}.${arg}`);
    for (const req of def.inputSchema.required) {
      const row = new RegExp(`<tr><td><code>${req}</code></td><td>[^<]*obligatorio`);
      assert.match(PAGE, row, `${req} marked obligatorio`);
    }
  }
  const named = [...PAGE.matchAll(/<h3><code>([a-z_]+)<\/code>/g)].map((m) => m[1]);
  assert.deepEqual(named, ["search_products", "get_product"], "only the real tools get a section");
  const rows = [...PAGE.matchAll(/<tr><td><code>([a-z_]+)<\/code>/g)].map((m) => m[1]);
  assert.deepEqual(rows, [...Object.keys(SEARCH_DEFINITION.inputSchema.properties), ...Object.keys(GET_DEFINITION.inputSchema.properties)], "the argument tables are exactly the schemas'");
});

await check("endpoint, no auth, public read-only, purchases on ariashop.pe, Términos and Privacidad", () => {
  assert.ok(PAGE.includes("https://connector.ariashop.pe/mcp"));
  assert.match(TEXT, /Sin autenticación/);
  assert.match(TEXT, /solo lectura/);
  assert.match(TEXT, /Las compras se completan en ariashop\.pe/);
  assert.match(PAGE, /<a href="https:\/\/ariashop\.pe\/terminos">Términos/);
  assert.match(PAGE, /<a href="https:\/\/ariashop\.pe\/privacidad">Política de privacidad/);
});

await check("no emojis, and no link off Aria (only ariashop.pe, mailto, the site's CDN and fonts)", () => {
  assert.equal(/\p{Extended_Pictographic}/u.test(PAGE.replace(/™|©/g, "")), false, "no emoji");
  for (const m of PAGE.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.match(m[1], /^(?:https:\/\/(?:[a-z]+\.)?ariashop\.pe\/|mailto:contacto@ariashop\.pe$|https:\/\/cdn\.tailwindcss\.com$|https:\/\/fonts\.googleapis\.com\/)/, m[1]);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
