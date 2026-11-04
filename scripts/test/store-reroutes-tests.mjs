#!/usr/bin/env node
/* STORE PAGES, LABEL-TRUE (#443 c.6522560722, re-audited on main
   2026-11-04, c.6623383286 item 5). scripts/lib/store-reroutes.js:
   a board is a board, a mist a perfume, a panty clothing.
     node scripts/test/store-reroutes-tests.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { storeFamily, boardFamily } from "../lib/store-reroutes.js";
import { RAIL_MIN } from "../build-store-slices.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + String(e.message).split("\n")[0]); }
}
const idx = (k) => JSON.parse(readFileSync(join(ROOT, "assets/tienda", k, "index.json"), "utf8"));
const fnOf = (k) => JSON.parse(readFileSync(join(ROOT, "assets/tienda/_fn", k + ".json"), "utf8"));
const titles = (k, rail) => { const fn = fnOf(k); return (fn.rails[rail] || []).map((i) => fn.rows[i][0]); };
const railOf = (k, name) => { const fn = fnOf(k); for (const [r, l] of Object.entries(fn.rails)) if (r.startsWith("t-") && !r.includes("~") && l.some((i) => fn.rows[i][0] === name)) return r; return null; };

await check("the rule: boards by stamp, noun, width or shaper; never their parts, bags, socks, clothes or toys", () => {
  const f = (name, type, brand, fam) => storeFamily({ name, type, brand }, fam);
  assert.equal(f('Blazer 26" Cruiser', "Cruisers", "Globe", "ropa"), "tablas_skate");
  assert.equal(f("Santa Cruz Slime Scream 8.25", "Accesorios", "Santa Cruz", "juguetes"), "tablas_skate");
  assert.equal(f("Jacuzzi Latham Ring Of Fire 8.5", "Accesorios", "Jacuzzi", "joyas"), "tablas_skate");
  assert.equal(f("5.10 Helium Mashup", "Accesorios", "FIREWIRE", "accesorios"), "tablas_surf");
  assert.equal(f("CJ Nelson Designs - Outlier", "Accesorios", "Thunderbolt", "accesorios"), "tablas_surf");
  assert.equal(f("Wave Riding Vehicles Islander", "Longboards", "Wave Riding Vehicles", "deportes"), "tablas_surf");
  assert.equal(f('Arbor Performance Journey Evergreen Axis 40" Longboard Complete', "Longboards", "Arbor", "deportes"), "tablas_skate");
  /* not boards */
  assert.equal(f("Machado Seaside Quad FUT", "Accesorios", "FIREWIRE", "accesorios"), "accesorios");
  assert.equal(f("Endorfins KS1 Tri Dual Tab", "Accesorios", "FIREWIRE", "accesorios"), "accesorios");
  assert.equal(f("Arbor Bogart 78a Longboard Wheels - Ghost White - 61mm", "Longboards", "Arbor", "deportes"), "deportes");
  assert.equal(f("Recon Double Surfboard Bag - Castlerock/Stone", "Tablas de surf", "Dakine", "carteras"), "carteras");
  assert.equal(f("Veia Explorer Surfboard Sock", "Tablas de surf", "Veia", "ropa"), "deportes");
  assert.equal(f("Pokemon TCG Battle Deck", "", "Pokemon", "juguetes"), "juguetes");
  assert.equal(f("Tech Deck Skateboard 4-pack", "", "Tech Deck", "juguetes"), "juguetes");
  assert.equal(f("Dry Brand Six-Inch Deck Boots - Field Sage", "Skate", "Dry Brand", "zapatos"), "zapatos");
  assert.equal(f("HUF x Toyota Land Cruiser Air Freshener - Multi", "Skate", "HUF", "hogar"), "hogar");
  assert.equal(f("ARRIS Surfboard Cable Modem Dual-Band Wi-Fi Router", "", "ARRIS", "electronica"), "electronica");
  assert.equal(f("Lost Surfboards Men's Tank - Royal", "", "Lost", "ropa"), "ropa");
  assert.equal(boardFamily({ name: "Firewire Blacks Mesh Hybrid Surfboard Sock - Black", type: "" }, "ropa"), null);
});

await check("Parrot: «Tablas de skate» and «Tablas de surf» rails; no board in Ropa, Accesorios, Juguetes, Joyas or the tail", () => {
  const keys = idx("parrot").rails.map((r) => r.key);
  for (const k of ["t-tablas_skate", "t-tablas_surf"]) assert.ok(keys.includes(k), keys.join(","));
  assert.ok(!keys.includes("t-juguetes"), "a Juguetes rail");
  const titlesBy = Object.fromEntries(idx("parrot").rails.map((r) => [r.key, r.title]));
  assert.equal(titlesBy["t-tablas_skate"], "Tablas de skate");
  assert.equal(titlesBy["t-tablas_surf"], "Tablas de surf");
  /* Lucifer's audit items, by name. */
  for (const n of ['Blazer 26" Cruiser', "Big Blazer 32\" Cruiser", "Santa Cruz Slime Scream 8.25", "Jacuzzi Latham Ring Of Fire 8.5", "Anti Hero Doobie (Lance) 8.75"]) assert.equal(railOf("parrot", n), "t-tablas_skate", n);
  for (const n of ["CJ Nelson Designs - Sprout 2.0", "CJ Nelson Designs - Outlier", "7.0 Outlier Red - Mustard", "5.4 Helium Mashup", "5.10 Helium Mashup"]) assert.equal(railOf("parrot", n), "t-tablas_surf", n);
  for (const n of ["Machado Seaside Quad FUT", "Spun Honey Fin Set"]) assert.notEqual(railOf("parrot", n), "t-tablas_surf", n);
  assert.equal(railOf("parrot", "Veia Surfboard Sock"), "t-deportes");
  const ropa = titles("parrot", "t-ropa");
  assert.ok(!ropa.some((t) => /\bcruiser\b|board sock|surfboard sock/i.test(t)), ropa.filter((t) => /cruiser|sock/i.test(t)).slice(0, 3).join(" | "));
  assert.ok(titles("parrot", "t-tablas_skate").length >= RAIL_MIN && titles("parrot", "t-tablas_surf").length >= RAIL_MIN);
});

await check("a board rail stands only at rail size (Dick's 11 skateboards stay in Deportes, not the tail)", () => {
  const keys = idx("dicks").rails.map((r) => r.key);
  assert.ok(!keys.includes("t-tablas_skate"), keys.join(","));
  assert.ok(titles("dicks", "t-deportes").some((t) => /skateboard/i.test(t)));
  assert.ok(!titles("dicks", "t-mas").some((t) => /skateboard/i.test(t)));
});

await check("Victoria's Secret: mists are Perfumes; panties, a playsuit, a garter belt are Ropa, not «Más de»", () => {
  for (const n of ["Halloween Shimmer Mist", "4-Piece Exclusive Shimmer Mist Gift Set", "10-Piece Mini Mist Wreath Gift Set ft. Archive Scents"]) assert.equal(railOf("victoriassecret", n), "t-perfumes", n);
  for (const n of ["Strappy-Back Ring Hardware Cheeky Panty", "Just-in-Case V-String Panty in a Bag", "Shine Chain Strap Lace Garter Belt", "Laces Out Embroidery Crotchless Open-Cup Playsuit"]) assert.equal(railOf("victoriassecret", n), "t-ropa", n);
  /* Lotions stay body care; a makeup bag stays out of Ropa. */
  assert.equal(railOf("victoriassecret", "Classic Fragrance Lotion"), "t-belleza");
  assert.notEqual(railOf("victoriassecret", "Top-Zip Makeup Bag"), "t-ropa");
  assert.ok(!idx("victoriassecret").rails.some((r) => r.key === "t-accesorios"), "an Accesorios rail");
});

await check("socks never lead a store's Ropa rail: moved to its back, not removed (Parrot, AYBL, Kill Crew, Oner Active)", () => {
  for (const k of ["parrot", "aybl", "killcrew", "oneractive"]) {
    const head = idx(k).rails.find((r) => r.key === "t-ropa").head;
    assert.ok(!head.slice(0, 12).some((c) => /\bsocks?\b/i.test(c.name)), `${k}: ${head.slice(0, 4).map((c) => c.name).join(" | ")}`);
    const all = titles(k, "t-ropa"), first = all.findIndex((t) => /\bsocks?\b/i.test(t));
    assert.ok(first > 0 && all.slice(first).every((t) => /\bsocks?\b|no[- ]show/i.test(t)), `${k}: socks are kept, at the back`);
  }
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
