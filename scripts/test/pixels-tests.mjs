/* ==================================================================
   META + TIKTOK PIXELS (#415).

   What must hold:
   - each pixel ID lives in one line of assets/js/pixels.js, nowhere else;
   - with an ID empty, that pixel is dormant: no script element, no
     vendor global, no network, no error;
   - with IDs set, PageView fires on load, and the five events reach both
     pixels with the semantics #415 asks for (Purchase: value, PEN,
     order id; TikTok's name for it is CompletePayment);
   - calls made before the file arrives are not lost;
   - every customer page carries the stub, and the events are wired
     where they happen.

   pixels.js runs here inside a vm with a fake window and document:
   nothing in this test can reach the network.

   RUNNING IT
     node scripts/test/pixels-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const PIXELS = readFileSync(ROOT + "assets/js/pixels.js", "utf8");
const STUB = "window.ariaTrack=window.ariaTrack||function(){(ariaTrack.q=ariaTrack.q||[]).push(arguments)};";

/* pixels.js in a sealed realm. `ids` replaces the two config lines; `early`
   are ariaTrack calls the page made before the file arrived. */
function boot(ids = {}, early = [], host = "ariashop.pe") {
  const appended = [];
  const listeners = {};
  const document = {
    readyState: "loading",
    head: { appendChild: (el) => appended.push(el) },
    createElement: (tag) => ({ tag }),
  };
  const timers = [];
  /* As in a browser, `window` is the global object itself. */
  const box = {
    document,
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    setTimeout: (fn) => timers.push(fn),
    console: { log() {}, error() { throw new Error("console.error"); } },
    location: { hostname: host },
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(STUB, box);
  for (const args of early) box.window.ariaTrack(...args);
  const src = PIXELS
    .replace(/var ARIA_META_PIXEL_ID = "[^"]*";/, `var ARIA_META_PIXEL_ID = ${JSON.stringify(ids.meta || "")};`)
    .replace(/var ARIA_TIKTOK_PIXEL_ID = "[^"]*";/, `var ARIA_TIKTOK_PIXEL_ID = ${JSON.stringify(ids.tiktok || "")};`);
  vm.runInContext(src, box);
  const load = () => { document.readyState = "complete"; for (const fn of listeners.load || []) fn(); while (timers.length) timers.shift()(); };
  return { window: box.window, appended, load };
}

check("each pixel ID is one line in assets/js/pixels.js, set to Danny's IDs (#443 item 34)", () => {
  assert.match(PIXELS, /^var ARIA_META_PIXEL_ID = "1459100226418221";$/m);
  assert.match(PIXELS, /^var ARIA_TIKTOK_PIXEL_ID = "DBECJTJC77U4J2JQD4SG";$/m);
  assert.equal(PIXELS.match(/ARIA_META_PIXEL_ID/g).length, 2, "the Meta ID is read in one place");
  assert.equal(PIXELS.match(/ARIA_TIKTOK_PIXEL_ID/g).length, 2, "the TikTok ID is read in one place");
});

check("with no IDs nothing loads, nothing is defined, and calls are harmless", () => {
  const { window, appended, load } = boot({}, [["ViewContent", { contentId: "x" }]]);
  window.ariaTrack("Purchase", { value: 10, currency: "PEN", orderId: "A1" });
  load();
  assert.equal(appended.length, 0, "a script was added");
  assert.equal(window.fbq, undefined);
  assert.equal(window.ttq, undefined);
});

check("never on a preview, a branch deploy or localhost (#443 item 34)", () => {
  for (const host of ["deploy-preview-485--ariashopperu.netlify.app", "ariashopperu.netlify.app", "localhost", "127.0.0.1", "ariashop.pe.evil.example"]) {
    const { window, appended, load } = boot({ meta: "123", tiktok: "ABC" }, [["PageView", {}]], host);
    window.ariaTrack("Purchase", { value: 10, currency: "PEN", orderId: "A1" });
    load();
    assert.equal(appended.length, 0, "a vendor script loaded on " + host);
    assert.equal(window.fbq, undefined, host);
    assert.equal(window.ttq, undefined, host);
  }
  const live = boot({ meta: "123" }, [], "www.ariashop.pe");
  live.load();
  assert.equal(live.appended.length, 1, "www.ariashop.pe is the live site");
});

check("one ID set: only that vendor exists", () => {
  const { window, appended, load } = boot({ meta: "123" });
  load();
  assert.equal(appended.length, 1);
  assert.match(appended[0].src, /^https:\/\/connect\.facebook\.net\//);
  assert.equal(window.ttq, undefined);
});

check("the vendor scripts are fetched only after the page's load event", () => {
  const { appended, load } = boot({ meta: "123", tiktok: "ABC" });
  assert.equal(appended.length, 0, "fetched before load");
  load();
  assert.deepEqual(appended.map((s) => new URL(s.src).host).sort(), ["analytics.tiktok.com", "connect.facebook.net"]);
  assert.ok(appended.every((s) => s.async));
});

check("PageView on load, then the five events on both pixels, early calls included", () => {
  const early = [["ViewContent", { contentId: "target|Tee", contentName: "Tee", value: 43.13, currency: "PEN" }]];
  const { window } = boot({ meta: "123", tiktok: "ABC" }, early);
  window.ariaTrack("AddToCart", { contentId: "target|Tee", contentName: "Tee", value: 43.13, currency: "PEN" });
  window.ariaTrack("InitiateCheckout", { contentIds: ["target|Tee"], numItems: 2, value: 86.25, currency: "PEN" });
  window.ariaTrack("Purchase", { value: 151.234, currency: "PEN", orderId: "ARIA-77", contentIds: ["target|Tee"], numItems: 2 });

  const plain = (x) => JSON.parse(JSON.stringify(x));
  const fb = Array.from(window.fbq.queue).map((a) => plain(Array.from(a)));
  assert.deepEqual(fb.slice(0, 2).map((a) => a.slice(0, 2)), [["init", "123"], ["track", "PageView"]]);
  assert.deepEqual(fb.slice(2).map((a) => a[1]), ["ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]);
  const buy = fb[5];
  assert.equal(buy[2].value, 151.23);
  assert.equal(buy[2].currency, "PEN");
  assert.equal(buy[2].order_id, "ARIA-77");
  assert.equal(buy[3].eventID, "ARIA-77", "the event id is the ARIA order id (item 34)");
  assert.equal(fb[2][2].currency, "PEN");
  assert.equal(fb[2][2].value, 43.13);
  assert.deepEqual(fb[2][2].content_ids, ["target|Tee"]);
  assert.equal(fb[4][2].num_items, 2);

  const tt = Array.from(window.ttq).filter((a) => a && typeof a === "object" && typeof a.length === "number").map((a) => plain(Array.from(a)));
  assert.equal(tt[0][0], "page");
  assert.deepEqual(tt.slice(1).map((a) => a[1]), ["ViewContent", "AddToCart", "InitiateCheckout", "CompletePayment"]);
  const tbuy = tt[4];
  assert.equal(tbuy[2].value, 151.23);
  assert.equal(tbuy[2].currency, "PEN");
  assert.equal(tbuy[2].order_id, "ARIA-77");
  assert.equal(tbuy[3].event_id, "ARIA-77");
});

check("a value in dollars is never sent (#443 item 34)", () => {
  const { window } = boot({ meta: "123", tiktok: "ABC" });
  window.ariaTrack("AddToCart", { contentId: "target|Tee", value: 12.5, currency: "USD" });
  window.ariaTrack("ViewContent", { contentId: "target|Tee", value: 12.5 });
  const fb = Array.from(window.fbq.queue).map((a) => JSON.parse(JSON.stringify(Array.from(a)))).slice(2);
  for (const e of fb) { assert.equal(e[2].value, undefined, JSON.stringify(e)); assert.equal(e[2].currency, undefined); assert.deepEqual(e[2].content_ids, ["target|Tee"]); }
  const tt = Array.from(window.ttq).filter((a) => a && typeof a === "object" && typeof a.length === "number").map((a) => JSON.parse(JSON.stringify(Array.from(a)))).slice(1);
  for (const e of tt) { assert.equal(e[2].value, undefined); assert.equal(e[2].currency, undefined); }
});

check("every call site sends soles, never dollars (#443 item 34)", () => {
  const home = readFileSync(ROOT + "index.html", "utf8");
  const bundle = readFileSync(ROOT + /<script src="\/(build\/app-[0-9a-f]+\.js)"><\/script>/.exec(home)[1], "utf8");
  for (const [name, src] of [["bundle", bundle], ["producto.html", readFileSync(ROOT + "producto.html", "utf8")], ["checkout.html", readFileSync(ROOT + "checkout.html", "utf8")]]) {
    const calls = src.match(/ariaTrack\('[A-Za-z]+',[\s\S]{0,260}?\}\)/g) || [];
    assert.ok(calls.length >= 1, name);
    for (const c of calls) { assert.ok(!/currency: 'USD'/.test(c), name + ": " + c); assert.match(c, /currency: 'PEN'/, name + ": " + c); }
  }
});

check("every customer page carries the stub and the async loader, and still parses", () => {
  /* Staff pages (admin, the compradores dashboard) carry no pixels. */
  const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html") && !["admin.html", "agente.html", "admin-agentes.html"].includes(f));
  assert.ok(pages.length >= 20, `only ${pages.length} pages`);
  for (const f of pages) {
    const src = readFileSync(ROOT + f, "utf8");
    const head = src.slice(0, src.indexOf("</head>"));
    assert.ok(head.includes(STUB), `${f}: no ariaTrack stub in <head>`);
    assert.ok(head.includes('<script src="/assets/js/pixels.js" async></script>'), `${f}: no async pixels.js`);
    for (const m of src.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/json|module|text\/template/.test(m[1])) continue;
      try { new vm.Script(m[2]); } catch (e) { throw new Error(`${f}: an inline script does not parse: ${e.message}`); }
    }
  }
  new vm.Script(PIXELS);
});

check("the events are wired where they happen", () => {
  const home = readFileSync(ROOT + "index.html", "utf8");
  const bundle = readFileSync(ROOT + /<script src="\/(build\/app-[0-9a-f]+\.js)"><\/script>/.exec(home)[1], "utf8");
  new vm.Script(bundle);
  const fnBody = (src, name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return src.slice(i, src.indexOf("\n}\n", i)); };
  assert.match(fnBody(bundle, "showProduct"), /ariaTrack\('ViewContent'/, "the app's product view");
  assert.match(fnBody(bundle, "addToCart"), /ariaTrack\('AddToCart'/, "the app's cart funnel");
  const pdp = readFileSync(ROOT + "producto.html", "utf8");
  assert.match(fnBody(pdp, "render"), /ariaTrack\('ViewContent'/, "producto.html view");
  assert.match(fnBody(pdp, "addCurrentToCart"), /ariaTrack\('AddToCart'/, "producto.html add");
  const co = readFileSync(ROOT + "checkout.html", "utf8");
  assert.match(co, /ariaTrack\('InitiateCheckout'/);
  /* Purchase only once the server confirms payment, before the cart is cleared. */
  const ret = co.slice(co.indexOf("async function returnFromStripe"), co.indexOf("returnFromStripe();\n", co.indexOf("async function returnFromStripe")));
  assert.match(ret, /if \(r\.ok && d\.paid\)\{[\s\S]*ariaTrack\('Purchase', \{ value: Number\(d\.chargedPen\) \|\| 0, currency: 'PEN', orderId: paidId[\s\S]*clearCart\(\);/);
  assert.equal(co.match(/ariaTrack\('Purchase'/g).length, 1, "Purchase is sent from one place");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
