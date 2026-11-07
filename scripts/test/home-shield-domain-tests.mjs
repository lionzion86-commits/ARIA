// ARIA HOME SHIELD ON ITS OWN DOMAIN (#443 c.6709587835).
// Simulates Netlify's first-match redirect order over netlify.toml for the
// ariahomeshield.com host: the root is the Home Shield landing (a 200
// rewrite, never a hop to ariashop.pe), the short paths reach the same
// pages, assets and functions pass through, any other path shows the
// landing, www goes to the apex, and ariashop.pe is untouched.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const toml = readFileSync(join(ROOT, "netlify.toml"), "utf8");
let passed = 0; const failures = [];
const test = (name, fn) => { try { fn(); passed++; console.log("    ok   " + name); } catch (e) { failures.push(name + "\n      " + e.message); console.log("    FAIL " + name); } };

/* The [[redirects]] blocks, in file order (from / to / status / force / query). */
const rules = toml.split(/^\[\[/m).filter((b) => b.startsWith("redirects]]")).map((b) => {
  const g = (k) => { const m = b.match(new RegExp("^\\s*" + k + "\\s*=\\s*(.+)$", "m")); return m ? m[1].trim().replace(/^"|"$/g, "") : null; };
  return { from: g("from"), to: g("to"), status: Number(g("status") || 301), force: g("force") === "true", query: g("query") };
});

function match(url) {
  const u = new URL(url);
  for (const r of rules) {
    if (r.query) continue;
    let host = null, path = r.from;
    if (/^https?:\/\//.test(r.from)) { const f = new URL(r.from.replace("/*", "/__SPLAT__")); host = f.host; path = f.pathname.replace("/__SPLAT__", "/*"); }
    if (host && host !== u.host) continue;
    if (!host && u.host !== "ariashop.pe") continue; // path-only rules apply to every host; we only probe them for the mall
    let splat = null;
    if (path.endsWith("/*")) { const base = path.slice(0, -1); if (!u.pathname.startsWith(base)) continue; splat = u.pathname.slice(base.length); }
    else if (u.pathname !== path) continue;
    return { ...r, target: r.to.replace(":splat", splat ?? "") };
  }
  return null;
}
const H = "https://ariahomeshield.com";

test("root is the Home Shield landing, a 200 rewrite (no hop to ariashop.pe)", () => {
  const m = match(H + "/");
  assert.equal(m.target, "/home-shield/index.html"); assert.equal(m.status, 200); assert.ok(m.force);
  assert.ok(!/ariashop\.pe/.test(m.target));
});
test("short paths reach the same pages: /pro, /pro/*, /partners, /partners/admin, /admin, /caso", () => {
  const cases = { "/pro": "/home-shield/pro/index.html", "/pro/pro.js": "/home-shield/pro/pro.js", "/partners": "/home-shield/partners/index.html",
    "/partners/admin": "/home-shield/partners/admin.html", "/partners/partners.js": "/home-shield/partners/partners.js",
    "/admin": "/home-shield/admin.html", "/caso": "/home-shield/caso.html", "/caso.html": "/home-shield/caso.html" };
  for (const [p, t] of Object.entries(cases)) { const m = match(H + p); assert.equal(m && m.target, t, p); assert.equal(m.status, 200, p); }
});
test("the pages' own assets and the hs-* functions pass straight through", () => {
  for (const p of ["/home-shield/hs.css", "/home-shield/hs.js", "/home-shield/img/tornado-open-240.webp", "/home-shield/caso.html"]) assert.equal(match(H + p).target, p, p);
  assert.equal(match(H + "/.netlify/functions/hs-chat").target, "/.netlify/functions/hs-chat");
});
test("any other path on that host shows the Home Shield landing, never the mall", () => {
  for (const p of ["/search.html", "/departamento.html", "/producto.html", "/whatever"]) assert.equal(match(H + p).target, "/home-shield/index.html", p);
});
test("www goes to the apex with a 301", () => {
  const m = match("https://www.ariahomeshield.com/pro"); assert.equal(m.status, 301); assert.equal(m.target, H + "/pro");
});
test("ariashop.pe is untouched by the host rules", () => {
  const m = match("https://ariashop.pe/"); assert.ok(!m || !/ariahomeshield/.test(m.from), m && m.from);
  assert.equal(match("https://ariashop.pe/home-shield").target, "/home-shield/index.html");
});
test("every host rule sits above every path rule (first match wins)", () => {
  const firstPath = rules.findIndex((r) => r.from && r.from.startsWith("/"));
  const lastHost = rules.map((r) => /ariahomeshield\.com/.test(r.from || "")).lastIndexOf(true);
  assert.ok(lastHost >= 0 && lastHost < firstPath, `last host rule ${lastHost}, first path rule ${firstPath}`);
});
test("every rewrite target exists in the repo", () => {
  for (const r of rules.filter((r) => /ariahomeshield\.com/.test(r.from) && r.status === 200 && !r.to.includes(":splat"))) assert.ok(existsSync(join(ROOT, r.to)), r.to);
});

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
