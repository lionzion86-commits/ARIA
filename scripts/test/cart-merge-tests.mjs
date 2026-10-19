/* ==================================================================
   #442 CART HARDENING — mergeCarts skips lines it cannot key.

   INCIDENT: a server-saved cart holding one null (or otherwise
   non-object) line made mergeCarts() throw inside cartItemKey()
   ("reading 'retailer'"). initCart() died with it, so the shopper's
   saved cart silently never merged and never rendered.

   The fix: mergeCarts() keeps only plain-object lines that carry the
   fields cartItemKey() reads (retailer, title), on both the server and
   the local side. A well-formed cart merges exactly as before.

   Two halves:
     unit     mergeCarts / cartItemKey run as they ship, sliced from the
              app bundle (scripts/test/_page-script.mjs);
     browser  the real index.html + bundle in headless Chromium, served
              by `python3 -m http.server`, with auth-me / cart-get /
              cart-save answered by page.route (no network): a seeded
              server cart with a null line merges its valid lines and
              renders; the empty, normal saved and guest paths are
              unchanged.

   RUN: node scripts/test/cart-merge-tests.mjs
   It starts its own static server on CART_MERGE_PORT (default 8947).
   ARIA_BASE_URL=<url> runs the browser half against a deploy instead.
   PLAYWRIGHT_CHROMIUM=<path> picks the browser binary.
   ================================================================== */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPageCartSlice } from "./_page-script.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); }
const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

const A = { retailer: "kohls", title: "Cart Merge Test Mug", priceUsd: 12, dutiableUsd: 12, weightKg: 0.4, weightEstimated: false, qty: 2 };
const B = { retailer: "macys", title: "Cart Merge Test Scarf", priceUsd: 20, dutiableUsd: 20, weightKg: 0.3, weightEstimated: false, qty: 1 };
const C = { retailer: "target", title: "Cart Merge Test Lamp", priceUsd: 30, dutiableUsd: 30, weightKg: 1.2, weightEstimated: false, qty: 1 };

/* ---------------- unit: the merge function as it ships ---------------- */
console.log("unit: mergeCarts");
const { mergeCarts, cartItemKey } = loadPageCartSlice();
const plain = (v) => JSON.parse(JSON.stringify(v)); // across the vm realm

await check("a null server line is skipped, the valid lines merge", () => {
  const out = plain(mergeCarts([], [A, null, B]));
  assert(out.length === 2, `expected 2 lines, got ${out.length}`);
  assert(out.map(cartItemKey).join("|") === [A, B].map(cartItemKey).join("|"), "valid lines lost or reordered");
});
await check("non-object and keyless lines are skipped on both sides", () => {
  const junk = [undefined, 0, 7, "line", true, [], [A], {}, { title: "no retailer" }, { retailer: "kohls" }, { retailer: null, title: null }, { retailer: "", title: "" }];
  const out = plain(mergeCarts([...junk, C], [...junk, A]));
  assert(out.length === 2, `expected 2 lines, got ${out.length}: ${JSON.stringify(out)}`);
  assert(out[0].title === A.title && out[1].title === C.title, "wrong lines kept");
});
await check("a non-array side merges as empty instead of throwing", () => {
  assert(plain(mergeCarts(null, [A])).length === 1, "null local side");
  assert(plain(mergeCarts([A], { cart: [] })).length === 1, "object server side");
});
await check("valid carts merge exactly as before (max qty, union, server order first)", () => {
  const out = plain(mergeCarts([{ ...A, qty: 1 }, C], [{ ...A, qty: 3 }, B]));
  assert(JSON.stringify(out) === JSON.stringify([{ ...A, qty: 3 }, B, C]), JSON.stringify(out));
});
await check("an exact mirror stays idempotent (reload never changes quantities)", () => {
  const out = plain(mergeCarts([A, B], [A, B]));
  assert(JSON.stringify(out) === JSON.stringify([A, B]), JSON.stringify(out));
});
await check("empty + empty is empty", () => {
  assert(plain(mergeCarts([], [])).length === 0, "not empty");
});
await check("string quantities still normalise", () => {
  const out = plain(mergeCarts([{ ...A, qty: "2" }], [{ ...A, qty: "1" }]));
  assert(out.length === 1 && out[0].qty === 2, JSON.stringify(out));
});

/* ---------------- browser: the real page ---------------- */
const PORT = Number(process.env.CART_MERGE_PORT || 8947);
let server = null;
if (!process.env.ARIA_BASE_URL) {
  server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  const until = Date.now() + 10000;
  for (;;) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/index.html`); if (r.ok) break; } catch {}
    if (Date.now() > until) { server.kill(); throw new Error("static server did not start on " + PORT); }
    await new Promise((r) => setTimeout(r, 150));
  }
}
const BASE = (process.env.ARIA_BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const OWN = new URL(BASE).host;

const browser = await chromium.launch({ headless: true, executablePath: EXE });

/* One page load with a given login state, server cart and local cart.
   Returns what the shopper sees plus what the page saved back. */
async function loadCart({ user = null, serverCart = null, localCart = null }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  const saves = [];
  page.on("pageerror", (e) => errors.push(String(e && e.message)));
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.host !== OWN) return route.abort();
    const fm = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (!fm) return route.continue();
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const name = fm[1];
    if (name === "auth-me") return json(200, user ? { email: user } : {});
    if (name === "cart-get") return user ? json(200, { cart: serverCart || [] }) : json(401, { error: "No autenticado" });
    if (name === "cart-save") {
      try { saves.push(JSON.parse(route.request().postData() || "{}").cart); } catch {}
      return json(user ? 200 : 401, user ? { ok: true } : { error: "No autenticado" });
    }
    if (name === "exchange-rate") return json(200, { compra: 3.72, venta: 3.75, fecha: "2026-10-19" });
    return json(404, { error: "no function " + name });
  });
  if (localCart) await ctx.addInitScript((c) => { try { localStorage.setItem("aria_cart_v1", JSON.stringify(c)); } catch {} }, localCart);
  await page.goto(BASE + "/?carrito=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof cartLoaded !== "undefined" && cartLoaded === true, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  const seen = await page.evaluate(() => ({
    cart: JSON.parse(JSON.stringify(cart)),
    stored: JSON.parse(localStorage.getItem("aria_cart_v1") || "null"),
    items: document.getElementById("cartItemsWrap")?.innerText || "",
    emptyHidden: document.getElementById("cartEmpty")?.hidden,
    badge: document.getElementById("cartCountBadge")?.textContent,
    cartActive: document.getElementById("cartView")?.classList.contains("active"),
  }));
  await ctx.close();
  return { ...seen, errors, saves };
}

console.log("browser: index.html cart load");
try {
  await check("seeded server cart with a null line: valid lines merge and render", async () => {
    const r = await loadCart({ user: "shopper@example.com", serverCart: [A, null, B] });
    assert(r.cartActive, "cart view did not open");
    assert(!r.errors.some((e) => /retailer/.test(e)), "page threw: " + r.errors.join(" | "));
    assert(r.cart.length === 2, `cart has ${r.cart.length} lines`);
    assert(r.items.includes(A.title) && r.items.includes(B.title), "valid lines not rendered");
    assert(r.emptyHidden === true, "empty-cart message showing");
    assert(r.badge === "3", "badge reads " + r.badge);
    assert(Array.isArray(r.stored) && r.stored.length === 2 && r.stored.every((x) => x && typeof x === "object"), "localStorage not saved clean");
    assert(r.saves.some((s) => Array.isArray(s) && s.length === 2 && !s.includes(null)), "server not re-saved clean");
    return "2 lines, badge 3, re-saved without the null";
  });
  await check("empty cart (logged in, nothing saved) is unchanged", async () => {
    const r = await loadCart({ user: "shopper@example.com", serverCart: [] });
    assert(r.cart.length === 0, `cart has ${r.cart.length} lines`);
    assert(r.emptyHidden === false, "empty-cart message hidden");
    assert(r.errors.length === 0, "page threw: " + r.errors.join(" | "));
  });
  await check("normal saved cart merges with the local cart as before", async () => {
    const r = await loadCart({ user: "shopper@example.com", serverCart: [{ ...A, qty: 3 }, B], localCart: [{ ...A, qty: 1 }, C] });
    assert(r.cart.map((x) => x.title + "x" + x.qty).join(",") === `${A.title}x3,${B.title}x1,${C.title}x1`, JSON.stringify(r.cart.map((x) => [x.title, x.qty])));
    assert(r.items.includes(A.title) && r.items.includes(B.title) && r.items.includes(C.title), "lines not rendered");
    assert(r.badge === "5", "badge reads " + r.badge);
    assert(r.errors.length === 0, "page threw: " + r.errors.join(" | "));
  });
  await check("guest cart (logged out) loads from localStorage only", async () => {
    const r = await loadCart({ user: null, serverCart: [C], localCart: [A, B] });
    assert(r.cart.map((x) => x.title).join(",") === `${A.title},${B.title}`, JSON.stringify(r.cart.map((x) => x.title)));
    assert(r.badge === "3", "badge reads " + r.badge);
    assert(r.errors.length === 0, "page threw: " + r.errors.join(" | "));
  });
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
