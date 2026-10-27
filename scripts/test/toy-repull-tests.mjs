/* ==================================================================
   THE TOYS' REAL COPY, PULLED AGAIN -- REAL COPY ONLY (#443).

   scripts/repull-toy-descriptions.mjs takes each cut or missing toy
   description from the toy's own product page. These hold the parts
   that decide what a child reads:
     - which toys go back to their page (cut, missing, fragment);
     - only the page's own words are kept: HTML removed, a page that
       says nothing but the toy's name is no copy at all;
     - a toy is matched to its page by Walmart's item id, and its copy
       is never replaced by something shorter or by nothing;
     - the Spanish comes from the translation memory, and a toy still
       waiting for it keeps the Spanish it had.

     node scripts/test/toy-repull-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { needsRepull, realCopy, applyRepull, finalizeFromMemory, quote } from "../repull-toy-descriptions.mjs";

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const CUT = "Lleva a casa la diversión y la amistad de Toy Story 5 de Disney y Pixar con estos peluches de los personajes clave de la película. Cada uno se vende por separado, sujeto a disponibilidad. Estos suaves peluches";

check("cut, missing and fragment copy goes back to the page; whole copy stays", () => {
  assert.equal(needsRepull({ description: CUT }), "truncated");
  assert.equal(needsRepull({ description: "" }), "missing");
  assert.equal(needsRepull({ description: "1 2 3" }), "fragment");
  assert.equal(needsRepull({ description_en: "For Ages 3 & Up", description: "Para mayores de 3 años" }), "fragment");
  assert.equal(needsRepull({ description: "El set de disfraz de princesa viene con una corona, una varita y un vestido con mangas abullonadas y más detalles en…" }), "truncated");
  assert.equal(needsRepull({ description: "Un peluche suave de 20 cm de Toy Story. Ideal para abrazar y para regalar a los fans de la película." }), null);
  assert.equal(needsRepull({ description: CUT, descriptionSource: "walmart-pdp-repull" }), null, "a toy already re-pulled went back again");
});

check("only the page's own words: HTML removed, a name alone is no copy", () => {
  const d = { name: "Toy Story Alien Plush", shortDescription: "<p>Bring home the fun of <b>Toy Story 5</b>.</p><ul><li>8 inch soft plush</li><li>Ages 3 and up</li></ul>", longDescription: "Short." };
  const t = realCopy(d);
  assert.ok(!/<|>/.test(t), "HTML survived: " + t);
  assert.match(t, /Bring home the fun of Toy Story 5\. 8 inch soft plush\. Ages 3 and up/);
  assert.equal(realCopy({ name: "Lego City Fire Truck 60374", shortDescription: "Lego City Fire Truck 60374" }), null);
  assert.equal(realCopy({}), null);
  assert.equal(realCopy({ longDescription: "Fun toy" }), null, "a fragment counts as copy");
});

check("matched by item id; never replaced by shorter copy or by nothing", () => {
  const long = "Bring home the fun and friendship of Disney and Pixar's Toy Story 5 with these plush toys of the movie's key characters. Each sold separately, subject to availability. These soft plush toys are 8 inches tall and made for hugs.";
  const catalog = { retailers: { walmart: { departments: { toys: { items: [
    { url: "https://www.walmart.com/ip/TS-ACTION-PLSH-ALIEN/18454953318?classType=REGULAR", description: CUT },
    { url: "https://www.walmart.com/ip/Some-Toy/111111111", description: "" },
    { url: "https://www.walmart.com/ip/Other/222222222", description: "1 2 3" },
    { url: "https://www.walmart.com/ip/Whole/333333333", description: "Un peluche suave de 20 cm de Toy Story. Ideal para abrazar y para regalar a los fans." },
  ] } } } } };
  const r = applyRepull(catalog, [
    { url: "https://www.walmart.com/ip/toy-story-alien/18454953318", name: "Alien Plush", shortDescription: long },
    { url: "https://www.walmart.com/ip/x/111111111", name: "Some Toy", shortDescription: "Some Toy" },
    { url: "https://www.walmart.com/ip/w/333333333", shortDescription: long },
  ]);
  const items = catalog.retailers.walmart.departments.toys.items;
  assert.equal(r.updated, 1);
  assert.equal(items[0].description_en, long);
  assert.equal(items[0].description, CUT, "the Spanish is replaced before its translation exists");
  assert.deepEqual(r.newTexts, [long]);
  assert.equal(items[1].description, "", "a page with no copy wrote something");
  assert.equal(items[1].description_en, undefined);
  assert.deepEqual(r.noCopy, [items[1].url]);
  assert.deepEqual(r.unmatched, [items[2].url]);
  assert.equal(items[3].description_en, undefined, "a whole description was pulled again");
});

check("the Spanish comes from the memory; a toy still waiting keeps what it had", () => {
  const catalog = { retailers: { walmart: { departments: { toys: { items: [
    { description_en: "Full English copy one.", description: CUT },
    { description_en: "Full English copy two.", description: CUT },
  ] } } } } };
  const n = finalizeFromMemory(catalog, (en) => (en === "Full English copy one." ? "Texto completo en español." : null));
  const items = catalog.retailers.walmart.departments.toys.items;
  assert.equal(n, 1);
  assert.equal(items[0].description, "Texto completo en español.");
  assert.equal(items[1].description, CUT);
});

check("the quote: detail pages plus one charge per run", () => {
  assert.equal(quote(1000, { detailPer1000: 2.9, perRun: 0.06 }), 3.02);
  assert.equal(quote(3935, { detailPer1000: 2.9, perRun: 0.06 }), 11.89);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
