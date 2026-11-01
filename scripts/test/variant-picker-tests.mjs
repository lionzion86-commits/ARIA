/* ==================================================================
   THE COLOUR PICKER (#443, the owner's variant order; Phase 1).

   A model a store sells in several colourways shows them all on the
   product page; picking one swaps its photos, price and sizes; the cart,
   checkout and the order carry the exact colourway. These checks hold:

   - grouping (scripts/lib/variants.mjs): colourways of one model group;
     two models never do (Samba OG vs Samba ADV); a suffix that is a fit,
     size or audience is not a colour; one colour name twice, or one
     photo twice, is never two colourways; a group needs two;
   - every one of Snipes' eleven "Samba OG" listings opens by its own
     ?v= (pickRecord), and all eleven are in one group;
   - the Samba proof case: CCS (4 models, 14 colourways), Zumiez (Samba
     ADV, 6), Snipes (sizes pending kept);
   - every grouped variant is reachable: its record, in its title's
     shard, carries its v and group;
   - two colourways in one size are two cart lines (producto.html,
     checkout.html and the app bundle agree); an older line keeps its key;
   - the server charges the colourway's own price and the order email
     names its colour;
   - in a browser: the picker swaps gallery, price and sizes, the URL
     names the colour, a Snipes colour change keeps "Tallas por
     confirmar", and the cart line carries colorway + variantId.

   RUNNING IT
     node scripts/test/variant-picker-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { createRequire } from "node:module";
import { liftDeclarations } from "../lib/page-lift.mjs";
import { serve, openPage } from "./lib/variant-browser.mjs";
import { liftPage } from "../build-pdp-slices.mjs";
import { groupColourways, variantIdOf, colourSuffix, snipesColour, midColour } from "../lib/variants.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PDP = ROOT + "assets/pdp/";
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("  FAIL  " + name); }
}
const P = liftPage(ROOT);
const shard = (key) => JSON.parse(readFileSync(PDP + "p/" + P.pdpShard(key) + ".json", "utf8"))[key] || [];
const group = (g) => JSON.parse(readFileSync(PDP + "g/" + P.groupShard(g) + ".json", "utf8"))[g] || null;

/* ---------- grouping ---------- */
const L = (retailer, name, url, image, brand = "Adidas") => ({ v: variantIdOf(url), retailer, name, brand, url, image });
await check("colourways of one model group; two models never do", () => {
  const ls = [
    L("ccs", "Adidas Womens Samba OG Shoes - Core Black/Wonder White", "https://s/1", "https://i/1.jpg"),
    L("ccs", "Adidas Womens Samba OG Shoes - Cream White/Core Black", "https://s/2", "https://i/2.jpg"),
    L("ccs", "Adidas Samba ADV Shoes - Core Black/Gum", "https://s/3", "https://i/3.jpg"),
    L("ccs", "Adidas Samba ADV Shoes - Grey/Cream White", "https://s/4", "https://i/4.jpg"),
    L("ccs", "Adidas Puig Samba Shoes - Maroon", "https://s/5", "https://i/5.jpg"),
  ];
  const m = groupColourways(ls);
  const g = (i) => m.get(ls[i].v) && m.get(ls[i].v).g;
  assert.ok(g(0) && g(0) === g(1), "the two Samba OG colourways are one group");
  assert.ok(g(2) && g(2) === g(3), "the two Samba ADV colourways are one group");
  assert.notEqual(g(0), g(2), "Samba OG and Samba ADV are two models, never one group");
  assert.equal(m.get(ls[4].v), undefined, "a model with one colourway has no group");
  assert.equal(m.get(ls[0].v).c, "Core Black/Wonder White", "the label is the store's own text");
});
await check("a fit, size or audience is not a colour; one name or one photo twice is not two colourways", () => {
  assert.equal(colourSuffix('Apex Contour Short 3.25" - Mid Rise'), null);
  assert.equal(colourSuffix("adidas Originals Samba OG - Women's"), null);
  assert.equal(colourSuffix('Welcome Skateboard Deck - Lime - 9.00"'), null);
  const ls = [
    L("ccs", "Logo Tee - Black", "https://s/a", "https://i/a.jpg"),
    L("ccs", "Logo Tee - Black", "https://s/b", "https://i/b.jpg"),
    L("ccs", "Logo Hoodie - Black", "https://s/c", "https://i/c.jpg"),
    L("ccs", "Logo Hoodie - Navy", "https://s/d", "https://i/c.jpg"),
  ];
  const m = groupColourways(ls);
  assert.equal(m.size, 0, "duplicates are not colourways: " + JSON.stringify([...m]));
});
await check("store-written colours: Snipes' URL, Zumiez' title middle", () => {
  assert.equal(snipesColour("https://www.snipesusa.com/samba-og-adidas-white---black-ig9030-1000120122.html", "Samba OG", "adidas"), "White / Black");
  assert.equal(snipesColour("https://www.snipesusa.com/motorsport-muscle-t-shirt-culture-kings-black-motorsportmuscletank-blk-1000125144.html", "Motorsport Muscle T-Shirt", "Culture Kings"), "", "no style code: no guess");
  assert.deepEqual(midColour("adidas Samba ADV Dusky Bronze, Core Black, & Gum Skate Shoes"), { model: "adidas Samba ADV", colour: "Dusky Bronze, Core Black, & Gum", tail: "Skate Shoes" });
});

/* ---------- the committed shards ---------- */
const snipesOG = shard("samba og").filter((r) => r.retailer === "snipes");
await check("all eleven Snipes \"Samba OG\" colourways open by their own ?v=", () => {
  assert.equal(snipesOG.length, 11, "eleven listings under one title");
  const vs = new Set(snipesOG.map((r) => r.v));
  assert.equal(vs.size, 11, "each has its own v");
  for (const r of snipesOG) {
    const got = P.pickRecord(shard("samba og"), P.STORE_FILES.snipes, r.v);
    assert.equal(got && got.v, r.v, "v " + r.v + " opened another listing");
    assert.equal(got.image, r.image);
  }
  /* An old link (no v) still opens a record, as before. */
  assert.ok(P.pickRecord(shard("samba og"), P.STORE_FILES.snipes));
  const g = group(snipesOG[0].g);
  assert.equal(g.length, 11, "all eleven in one picker");
  assert.ok(g.every((x) => x.sizesPending === true && !x.sizes), "sizes pending, none invented");
});
await check("the Samba proof case: CCS 4 models / 14 colourways, Zumiez Samba ADV 6", () => {
  const ccs = ["adidas samba adv shoes - new black/white/gum", "adidas womens samba og shoes - core black/wonder white/silver metallic",
    "adidas womens samba jane shoes - ftwr white/alumina/core black", "adidas puig samba shoes - maroon/semi solar yellow/shadow red"];
  const counts = ccs.map((k) => { const r = shard(k).find((x) => x.retailer === "ccs"); assert.ok(r && r.g, k + " has no group"); return group(r.g).length; });
  assert.deepEqual(counts, [7, 3, 2, 2]);
  const og = group(shard(ccs[1]).find((x) => x.retailer === "ccs").g);
  assert.ok(og.every((x) => Array.isArray(x.sizes) && x.sizes.length), "every CCS colourway has its own sizes");
  const z = shard("adidas samba adv dusky bronze, core black, & gum skate shoes").find((x) => x.retailer === "zumiez");
  assert.equal(group(z.g).length, 6);
});
await check("every grouped variant is reachable: its record carries its v and group", () => {
  let n = 0;
  const files = readFileSync(PDP + "index.json", "utf8");
  const idx = JSON.parse(files);
  assert.ok(idx.groups > 1000 && idx.groupedVariants > 2 * idx.groups, "groups were built: " + idx.groups);
  for (const s of ["000", "07f", "1a3", "274", "3ff"]) {
    const gs = JSON.parse(readFileSync(PDP + "g/" + s + ".json", "utf8"));
    for (const [g, vs] of Object.entries(gs)) {
      if (g.endsWith("~p")) continue;   /* a family's pending shade names */
      assert.ok(vs.length >= 2, g + " is a group of one");
      const labels = new Set(vs.map((x) => x.c.toLowerCase()));
      assert.equal(labels.size, vs.length, g + " repeats a colour name");
      for (const x of vs) {
        const rec = shard(P.norm(x.name)).find((r) => r.v === x.v);
        assert.ok(rec && rec.g === g && rec.c === x.c, `${x.name} (${x.v}) is not reachable`);
        n++;
      }
    }
  }
  assert.ok(n > 50, "checked " + n);
});

/* ---------- cart keys ---------- */
const page = readFileSync(ROOT + "producto.html", "utf8");
const PK = liftDeclarations(page, ["cartLineKey"]);
const checkoutSrc = readFileSync(ROOT + "checkout.html", "utf8");
const ckFn = /function cartLineKey\(it\)\{[\s\S]*?\n  \}/.exec(checkoutSrc)[0];
const CK = new Function(ckFn + "; return cartLineKey;")();
const bundleName = /<script src="\/build\/(app-[0-9a-f]{16}\.js)"><\/script>/.exec(readFileSync(ROOT + "index.html", "utf8"))[1];
const BK = liftDeclarations(readFileSync(ROOT + "build/" + bundleName, "utf8"), ["cartItemKey"]);
await check("two colourways in one size are two cart lines, on every page; old lines keep their key", () => {
  const a = { retailer: "snipes", title: "Samba OG", selectedSize: "9", variantId: snipesOG[0].v, colorway: snipesOG[0].c };
  const b = { ...a, variantId: snipesOG[1].v, colorway: snipesOG[1].c };
  const old = { retailer: "snipes", title: "Samba OG", selectedSize: "9" };
  for (const [name, key] of [["producto", PK.cartLineKey], ["checkout", CK], ["bundle", BK.cartItemKey]]) {
    assert.notEqual(key(a), key(b), name + " merges two colourways");
    assert.equal(key(a), key({ ...a }), name);
  }
  assert.equal(PK.cartLineKey(old), "snipes::Samba OG::9");
  assert.equal(BK.cartItemKey(old), "snipes::Samba OG::9");
  assert.equal(CK(old), "snipes::Samba OG::9");
});
await check("the server charges the colourway's own price; the email names its colour", async () => {
  const { repriceCart } = await import(ROOT + "netlify/functions/_checkout-model.js");
  const prices = JSON.parse(readFileSync(ROOT + "price-index.json", "utf8")).prices;
  const cheap = snipesOG.find((r) => r.price === 49.99), dear = snipesOG.find((r) => r.price === 130);
  for (const r of [cheap, dear]) {
    const line = { retailer: "snipes", title: "Samba OG", qty: 1, priceUsd: 1, variantId: r.v, colorway: r.c };
    const out = repriceCart([line], prices).lines[0];
    assert.equal(out.priceVerified, true);
    r.charged = out.priceUsd;
  }
  assert.ok(cheap.charged < dear.charged, `the $49.99 colourway is charged ${cheap.charged}, the $130 one ${dear.charged}`);
  const { orderConfirmationEmail } = await import(ROOT + "netlify/functions/_order-email.js");
  const mail = orderConfirmationEmail({ orderId: "A1", items: [{ title: "Samba OG", qty: 1, selectedSize: "9", colorway: "White / Black", priceUsd: 100 }], customer: { name: "Ana" } });
  assert.match(JSON.stringify(mail), /color White \/ Black, talla 9/);
});

/* ---------- in a browser ---------- */
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { /* no browser here */ }
const state = (pg) => pg.evaluate(() => ({
  opts: document.querySelectorAll(".v-opt").length,
  current: (document.getElementById("v-current") || {}).textContent || "",
  checked: (document.querySelector('.v-opt[aria-checked="true"] span') || {}).textContent || "",
  title: (document.querySelector("#p-body h1") || {}).textContent || "",
  price: (document.querySelector(".p-pen") || {}).textContent || "",
  photo: (document.querySelector(".p-photo img") || {}).getAttribute ? document.querySelector(".p-photo img").getAttribute("data-img-orig") : "",
  sizes: [...document.querySelectorAll("#size-select option")].slice(1).map((o) => o.value),
  button: (document.getElementById("add-cart-btn") || {}).textContent || "",
  url: location.search,
}));
if (!chromium) {
  failures.push("browser checks\n         playwright is not installed here (never run playwright install; symlink node_modules)");
} else {
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    await check("browser: picking a colour swaps photos, price and that colour's own sizes; the URL names it", async () => {
      const pg = await openPage(browser, base);
      await pg.goto(base + "/producto.html?producto=" + encodeURIComponent("Adidas Samba ADV Shoes - Cardboard/Ftwr White/Gum") + "&tienda=ccs", { waitUntil: "load" });
      await pg.waitForSelector(".v-opt", { timeout: 15000 });
      const a = await state(pg);
      assert.equal(a.opts, 7);
      assert.equal(a.current, "Cardboard/Ftwr White/Gum");
      assert.equal(a.sizes.length, 19);
      await pg.click('.v-opt:has-text("Blush Pink/Cardboard/Gum")');
      await pg.waitForFunction(() => (document.getElementById("v-current") || {}).textContent === "Blush Pink/Cardboard/Gum");
      const b = await state(pg);
      assert.equal(b.checked, "Blush Pink/Cardboard/Gum");
      assert.notEqual(b.photo, a.photo, "the gallery did not change");
      assert.notEqual(b.price, a.price, "the price did not change");
      assert.equal(b.sizes.length, 18, "the sizes are not this colour's own");
      assert.ok(!b.sizes.includes("14.0"));
      assert.match(b.url, /v=15yd2c3qsb4mt|v=[a-z0-9]+/);
      assert.match(decodeURIComponent(b.url.replace(/\+/g, " ")), /Blush Pink/);
      /* The cart line carries the colour picked. */
      await pg.selectOption("#size-select", "9.0");
      await pg.click("#add-cart-btn");
      const cart = await pg.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
      assert.equal(cart.length, 1);
      assert.equal(cart[0].colorway, "Blush Pink/Cardboard/Gum");
      assert.ok(cart[0].variantId);
      assert.equal(cart[0].title, "Adidas Samba ADV Shoes - Blush Pink/Cardboard/Gum");
      /* A reload opens the colour the address names. */
      await pg.reload({ waitUntil: "load" });
      await pg.waitForSelector(".v-opt", { timeout: 15000 });
      assert.equal((await state(pg)).current, "Blush Pink/Cardboard/Gum");
      assert.deepEqual(pg.errors, []);
      await pg.context().close();
    });
    await check("browser: a Snipes colour change keeps sizes pending honestly; a v link opens that colour", async () => {
      const pg = await openPage(browser, base);
      const target = snipesOG.find((r) => r.price === 130 && /IH9052/.test(r.c)) || snipesOG[5];
      await pg.goto(base + "/producto.html?producto=" + encodeURIComponent("Samba OG") + "&tienda=snipes&v=" + target.v, { waitUntil: "load" });
      await pg.waitForSelector(".v-opt", { timeout: 15000 });
      const a = await state(pg);
      assert.equal(a.opts, 11);
      assert.equal(a.current, target.c);
      assert.match(a.button, /Tallas por confirmar/);
      await pg.click('.v-opt:has-text("Aurora Ivy")');
      await pg.waitForFunction(() => /Aurora Ivy/.test((document.getElementById("v-current") || {}).textContent));
      const b = await state(pg);
      assert.match(b.button, /Tallas por confirmar/);
      assert.deepEqual(b.sizes, []);
      assert.notEqual(b.price, a.price);
      assert.deepEqual(pg.errors, []);
      await pg.context().close();
    });
    await check("browser: a single-colour product shows no picker", async () => {
      const pg = await openPage(browser, base);
      await pg.goto(base + "/producto.html?producto=" + encodeURIComponent("Adidas SAMBA ADV Skate Shoes") + "&tienda=mainland", { waitUntil: "load" });
      await pg.waitForSelector("#buy-box", { timeout: 15000 });
      await pg.waitForTimeout(500);
      assert.equal((await state(pg)).opts, 0);
      await pg.context().close();
    });
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log("  FAIL  " + f + "\n");
process.exit(failures.length ? 1 : 0);
