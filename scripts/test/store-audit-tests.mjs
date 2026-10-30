/* ==================================================================
   EVERY STORE PAGE LABEL-TRUE (#443 c.6522560722).

     - Parrot: decks and completes under "Tablas de skate", surfboards
       under "Tablas de surf", Nike SB shoes under Zapatos; no Juguetes
       rail holding a deck;
     - Victoria's Secret: no Accesorios rail of panties and mists; a
       slipper-only Zapatos rail reads "Pantuflas";
     - search finds the boards by what they are: "skate" and "tabla de
       skate" lead with decks and completes (Antihero on the first
       screen), "tabla de surf" with surfboards (Thunderbolt, Firewire);
     - the stamp repair re-stamps model-only titles and never one that
       names something else (a leash, a wheel, a tee).

     node scripts/test/store-audit-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { repairedType } from "../repair-type-stamps.mjs";
import { loadSearch, runQuery } from "../../netlify/functions/_search-core.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");
const rails = (k) => JSON.parse(read(`assets/tienda/${k}/index.json`)).rails;
const ctx = { window: {}, self: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read("product-type.js"), ctx);
const PT = ctx.window.AriaProductType || ctx.AriaProductType;

check("Parrot: boards in their own rails, no Juguetes", () => {
  const r = rails("parrot");
  const by = Object.fromEntries(r.map((x) => [x.title, x]));
  assert.ok(!by["Juguetes"], "Parrot still has a Juguetes rail");
  assert.ok(by["Tablas de skate"] && by["Tablas de skate"].total > 300, "no Tablas de skate rail");
  assert.ok(by["Tablas de surf"] && by["Tablas de surf"].total > 40, "no Tablas de surf rail");
  for (const t of ["Sombreros", "Accesorios", "Ropa"]) {
    const boards = (by[t] ? by[t].head : []).filter((c) => /\b(deck|surfboard|complete)\b/i.test(c.name)).map((c) => c.name);
    assert.deepEqual(boards, [], `boards in Parrot's ${t}`);
  }
});

check("Victoria's Secret: no Accesorios rail, slippers read Pantuflas, nothing in Joyas but jewelry", () => {
  const r = rails("victoriassecret");
  const by = Object.fromEntries(r.map((x) => [x.title, x]));
  assert.ok(!by["Accesorios"], "VS Accesorios: " + (by["Accesorios"] ? by["Accesorios"].head.map((c) => c.name).join(", ") : ""));
  assert.ok(by["Pantuflas"] && !by["Zapatos"], "slipper rail is not titled Pantuflas");
  for (const c of (by["Joyas"] ? by["Joyas"].head : [])) assert.match(c.name, /jewel/i, c.name);
});

check("the title-noun guard: a set is read by its first product, a part name never decides", () => {
  for (const [t, fam] of [
    ["Flannel Long Tee-Jama & Scrunchie Set", "ropa"],
    ["Mini Mist & Scrunchie Set", "perfumes"],
    ["Sun Bum x Kitsch 3-piece Scrunchie Set", "accesorios"],
    ["Strappy-Back Ring Hardware Cheeky Panty", ""],
    ["Gold Chain Necklace", "joyas"],
    ["Antihero Grimple Stix Complete 8.25", "tablas_skate"],
    ["Firewire Seaside Surfboard", "tablas_surf"],
    ["Pro Transformer Rail – Adjustable Skateboard Training Rail (Flat Bar, Bench, Round Rail)", ""],
  ]) assert.equal(PT.familyOfName(t), fam, t);
});

check("the stamp repair: model-only titles re-stamped, named products left to their noun", () => {
  const it = (name, brand, type) => ({ name, brand, type });
  assert.equal(repairedType(it("ANTIHERO CARDIEL DESERTSCAPES 8.62", "Deluxe", "Gorras y gorros")), "Decks (tablas de skate)");
  assert.equal(repairedType(it("CJ Nelson 9.6 Parallax Plus", "Thunderbolt", "Accesorios")), "Tablas de surf");
  assert.equal(repairedType(it("Nike SB Zoom Janoski OG+", "Nike SB", "Accesorios")), "Zapatos");
  assert.equal(repairedType(it("Thunderbolt Surf Leash 7'", "Thunderbolt", "Accesorios")), null);
  assert.equal(repairedType(it("Machado Seaside Quad FUT", "FIREWIRE", "Accesorios")), null, "a fin set is not a board");
  assert.equal(repairedType(it("5.2 Machado Cado FUT", "FIREWIRE", "Accesorios")), "Tablas de surf");
  assert.equal(repairedType(it("Antihero Eagle Tee", "Antihero", "Polos y camisetas")), null);
  assert.equal(repairedType(it("Nike SB Logo Tee", "Nike SB", "Polos y camisetas")), null);
});

const SEARCH = loadSearch();
const top = (q, n = 48) => (runQuery(SEARCH, q).hits || []).slice(0, n);
check("search: a board search leads with the boards, by the Spanish name too", () => {
  const BOARD = /\b(deck|complete|cruiser|skateboard|longboard)\b|\d\.\d|anti ?hero|baker|krooked|santa cruz|real\b/i;
  for (const q of ["skate", "tabla de skate", "tablas de skate", "patineta"]) {
    const t = top(q, 8);
    assert.ok(t.every((p) => p.kw && /patineta/.test(p.kw)), `${q}: ${t.map((p) => p.title).join(" / ")}`);
    assert.ok(t.every((p) => BOARD.test(p.title)), `${q}: ${t.map((p) => p.title).join(" / ")}`);
  }
  assert.ok(top("skate").some((p) => /anti[- ]?hero/i.test(p.title)), "no Antihero deck on the first screen of skate");
  const surf = top("tabla de surf");
  assert.ok(surf.slice(0, 8).every((p) => /surfboard/.test(p.kw || "")), surf.slice(0, 8).map((p) => p.title).join(" / "));
  for (const b of [/thunderbolt/i, /firewire/i]) assert.ok(surf.some((p) => b.test(p.title + " " + p.brand)), "tabla de surf: no " + b);
  assert.ok(!surf.slice(0, 8).some((p) => /\b(leash|fins?|wax)\b/i.test(p.title)), "an accessory leads tabla de surf");
});

check("a board word before an accessory noun never makes it a board", () => {
  for (const t of ["FCS 2 Christenson PG Longboard Fin", "FCS All Round Essential 6' Surfboard Leash - Black", "Venture All Polished V-Hollow Skateboard Truck - 5.0 Hi", "Santa Cruz Skateboards Classic Dot Skate Wax"])
    assert.ok(!/^tablas_/.test(PT.familyOfName(t)), t + " -> " + PT.familyOfName(t));
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
