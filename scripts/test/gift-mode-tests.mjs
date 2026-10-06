/* ============================================================
   MODO REGALO, TESTED.

   RUN:  node scripts/test/gift-mode-tests.mjs

   WHY THIS IS NOT A GROUP IN run-tests.mjs. It should be, and it moves
   there the day that suite loads again. As of 2026-10-05 run-tests.mjs
   still cannot be imported on main: it imports
   netlify/functions/_combo-validate.js, which is not in the tree.
   Reported 2026-09-28, still open a week later. Parking these checks
   inside a file that throws on load would mean shipping Modo Regalo
   with no way to run its tests.

   WHAT IS EXERCISED. The real pure slice, lifted out of the real
   index.html and run in a VM with no DOM — the trick
   scripts/test/_page-script.mjs has used for months — and the real
   150,000-product catalogue off disk. The conversation is driven turn
   by turn exactly as the panel drives it.
   ============================================================ */
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const html = readFileSync(ROOT + "index.html", "utf8");

/* ---- the slices, lifted from the page ---- */
function definitionOf(name){
  for (const re of [new RegExp(`^function ${name}\\(`, "m"), new RegExp(`^const ${name}\\s*=`, "m"), new RegExp(`^let ${name}\\s*=`, "m")]){
    const m = re.exec(html);
    if (!m) continue;
    const rest = html.slice(m.index + 1);
    const next = /\n(?=(?:function |async function |const |let |\/\* ===))/.exec(rest);
    return html.slice(m.index, next ? m.index + 1 + next.index : m.index + 6000);
  }
  return null;
}
/* The probe CALLS the functions: a slice that merely compiles proves
   nothing, because anything reached only at call time stays unresolved
   and every later call throws. */
function slice(from, to, exports, probe){
  const base = html.slice(html.indexOf(from), html.indexOf(to));
  if (html.indexOf(from) < 0 || html.indexOf(to) < 0) throw new Error(`markers moved: ${from}`);
  let prelude = "";
  for (let i = 0; i < 80; i++){
    const sb = { console: { log(){}, warn(){}, error(){} }, window: {}, document: { createElement: () => ({ style: {} }), querySelector: () => null },
                 localStorage: { getItem: () => null, setItem(){} }, fetch: async () => ({ ok: false }), navigator: {}, location: { href: "" }, URL, setTimeout, clearTimeout };
    sb.globalThis = sb;
    vm.createContext(sb);
    try {
      vm.runInContext(`${prelude}\n${base}\n;globalThis.__x = ${exports};`, sb, { filename: "index.html#slice" });
      probe(sb.__x);
      return sb.__x;
    } catch (err){
      const m = /^(\w+) is not defined$/.exec(err.message);
      if (!m) throw err;
      const def = definitionOf(m[1]);
      if (!def) throw new Error(`slice needs ${m[1]}, which index.html does not define at the top level`);
      prelude = def + "\n" + prelude;   // deepest dependency first, or a const hits its own TDZ
    }
  }
  throw new Error("slice did not settle");
}

const G = slice(
  "const GIFT_OCCASION_RE", "/* END OF THE GIFT MODE PURE SLICE",
  "{giftModeOpens,giftOccasionOf,giftKinOf,giftCharactersIn,giftCategoryOf,giftBudgetOf,giftBareAmountOf,giftStateAdvance,nextGiftQuestion,curateGiftResults,giftCandidates,giftRejectReason,giftModeShouldYield,giftTitleMinAge,GIFT_CATEGORIES,GIFT_BUDGETS,GIFT_MAX_RESULTS,GIFT_CHILD_PRICE_CEILING_USD}",
  (x) => { if (x.giftOccasionOf("mi hija cumple 6 años") !== "cumpleaños") throw new Error("probe: occasion"); },
);
const S = slice(
  "const CATALOG_SEARCH_LIMIT", "/* END OF THE PURE SLICE",
  "{searchTokens,catalogWordsOf,catalogItemCategory,rankCatalogMatches}",
  (x) => { if (!x.catalogWordsOf({ title: "Nike Hoodie" }).has("hoodie")) throw new Error("probe: search"); },
);
const R = slice(
  "function extractRecipient(text, history){", "function recipientLabelEs(",
  "{extractRecipient}",
  (x) => {
    /* EVERY BRANCH, not just the happy one. extractRecipient only
       touches RECIPIENT_BABY_RE when no age is stated, so a probe that
       passes "6 años" resolves nothing and every later call throws —
       which is exactly what happened the first time this ran. */
    if (x.extractRecipient("mi hija cumple 6 años", []).gender !== "female") throw new Error("probe: gender");
    if (x.extractRecipient("algo para mi bebé", []).ageBand !== "baby") throw new Error("probe: baby");
    if (x.extractRecipient("para un niño", []).ageBand !== "kids") throw new Error("probe: kids");
    if (x.extractRecipient("para mi esposa", []).ageBand !== "adult") throw new Error("probe: adult");
    if (x.extractRecipient("para mi sobrina", []).ageBand !== "kids") throw new Error("probe: younger kin");
  },
);

/* ---- the real catalogue ---- */
const pool = [];
for (const f of readdirSync(ROOT).filter(f => /-catalog\.json$/.test(f) || /^department-cache.*\.json$/.test(f))){
  let env; try { env = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
  for (const [retailer, bucket] of Object.entries(env?.retailers || {}))
    for (const [department, entry] of Object.entries(bucket?.departments || {})){
      const items = Array.isArray(entry) ? entry : (entry?.items || []);
      for (const raw of items){
        const title = raw.title || raw.name;
        if (title) pool.push({ title, brand: raw.brand || null, retailer, departments: [department], price: raw.price, rating: raw.rating, originalPrice: raw.originalPrice });
      }
    }
}
for (const it of pool){ it._wordSet = S.catalogWordsOf(it); it._brandWordSet = new Set(S.searchTokens(it.brand || "")); it._cat = S.catalogItemCategory(it); }
const windex = new Map();
for (const it of pool) for (const w of it._wordSet){ let l = windex.get(w); if (!l) windex.set(w, l = []); l.push(it); }
pool._windex = windex;

let passed = 0; const failures = [];
function group(n){ console.log(`\n  ${n}`); }
function check(n, fn){ try { fn(); passed++; console.log(`    ok   ${n}`); } catch (e){ failures.push(`${n}\n         ${e.message}`); console.log(`    FAIL ${n}\n         ${e.message}`); } }

/** Drive a whole interview the way the panel does. */
function interview(turns){
  let st = null;
  const asked = [];
  for (const turn of turns){
    const rec = R.extractRecipient(turn, []);
    st = G.giftStateAdvance(st, turn, 3.5);
    if (rec.gender) st.gender = rec.gender;
    if (rec.ageBand) st.ageBand = rec.ageBand;
    if (Number.isFinite(rec.ageYears)) st.ageYears = rec.ageYears;
    const q = G.nextGiftQuestion(st);
    if (q){ st.asked.push(q.id); asked.push(q); }
  }
  return { state: st, asked };
}

/* ============================================================ */
group("it knows a gift from a shopping trip");

check("an occasion and a person together open the interview", () => {
  for (const t of ["Mi hija cumple 6 años pronto", "regalo de navidad para mi sobrino",
                   "qué le compro a mi mamá para el día de la madre", "es el cumpleaños de mi esposa"]){
    assert.ok(G.giftOccasionOf(t), `no occasion in "${t}"`);
    assert.ok(G.giftKinOf(t), `no recipient in "${t}"`);
  }
});

check("one without the other is ordinary shopping, not an interview", () => {
  /* THE FALSE POSITIVE THAT WOULD RUIN THE SITE: "zapatos para mi hija"
     is a search. Interviewing someone who asked a plain question is
     worse than the bug this feature fixes. */
  for (const t of ["zapatos para mi hija", "ropa para mi esposa", "algo para mi mamá"]){
    assert.ok(!G.giftOccasionOf(t), `"${t}" should carry no occasion`);
  }
  for (const t of ["ofertas de navidad", "decoración de cumpleaños", "qué hay para navidad"]){
    assert.ok(!G.giftKinOf(t), `"${t}" should name no person`);
  }
});

check("the interview opens on an occasion AND a person, never on one", () => {
  /* THE DECISION ITSELF, not its ingredients. Two mutations of this
     rule — either-or instead of both, and ignoring an explicit order —
     were caught by nothing while it lived in the wiring. */
  for (const t of ["Mi hija cumple 6 años pronto", "regalo de navidad para mi sobrino",
                   "es el cumpleaños de mi esposa", "qué le doy a mi mamá para el día de la madre"]){
    assert.equal(G.giftModeOpens(t), true, `"${t}" should open the interview`);
  }
  for (const t of ["zapatos para mi hija", "ropa para mi esposa", "ofertas de navidad",
                   "decoración de cumpleaños", "busco una casaca", "qué hay en oferta"]){
    assert.equal(G.giftModeOpens(t), false, `"${t}" must NOT open an interview`);
  }
  /* An order wins even when it carries an occasion and a person. */
  assert.equal(G.giftModeOpens("mi hija cumple 6, solo muéstrame juguetes"), false,
    "an explicit order was overridden by the trigger");
});

check("an explicit order is obeyed, never interviewed", () => {
  for (const t of ["solo muéstrame juguetes", "sólo muéstrame los juguetes", "muéstrame ya los juguetes", "just show me toys"]){
    assert.ok(G.giftModeShouldYield(t), `"${t}" should bypass the interview`);
  }
  assert.ok(!G.giftModeShouldYield("mi hija cumple 6 años"), "an opening must not be read as an order");
});

/* ============================================================ */
group("the interview: at most three questions, none of them repeated");

check("the brief's own example runs question for question", () => {
  const { state, asked } = interview([
    "Mi hija cumple 6 años pronto.",
    "Le encanta dibujar y pintar.",
    "Un set de arte estaría perfecto.",
    "Como $30.",
  ]);
  assert.equal(asked.map(q => q.id).join("|"), "P1|P2|P3", "the three questions did not come in order");
  assert.match(asked[0].text, /qué le gusta a tu hija de 6 años/i);
  assert.equal([...asked[0].pills].join("|"), "Juguetes|Ropa|Arte y manualidades|Deportes");
  assert.match(asked[1].text, /set de arte|libros para colorear/i, "P2 did not adapt to the art answer");
  assert.match(asked[2].text, /presupuesto/i);
  assert.equal([...asked[2].pills].join("|"), [...G.GIFT_BUDGETS].map(b => b.label).join("|"));
  assert.equal(state.category, "arte");
  assert.equal(state.ageYears, 6);
  assert.equal(state.occasion, "cumpleaños");
  assert.equal(state.budget.max, 35, "$30 should allow a little headroom, not a hard $30");
  assert.equal(G.nextGiftQuestion(state), null, "a fourth question was offered");
});

check("three is a ceiling, however little she knows", () => {
  /* Four shrugs still end the interview — being interrogated is the
     failure mode the brief names. */
  const { asked, state } = interview(["Mi hijo cumple años", "no sé", "ni idea", "lo que sea", "cualquier cosa"]);
  assert.ok(asked.length <= 3, `asked ${asked.length} questions`);
  assert.equal(G.nextGiftQuestion(state), null, "still asking after three");
});

check("the three-question ceiling holds even if a fourth is ever added", () => {
  /* The natural flow already stops at three, because each question
     guards on its own id — so the shrug test above cannot tell the
     ceiling from the guards. This exercises the ceiling itself: three
     questions recorded under names the guards do not recognise, and
     nothing filled, so only `asked.length >= 3` can stop P1. A future
     P4 that forgets the ceiling fails here. */
  const starved = { occasion: "cumpleaños", kin: "hija", ageYears: 6, ageBand: "kids",
                    category: null, characters: [], budget: null, asked: ["Q1", "Q2", "Q3"] };
  assert.equal(G.nextGiftQuestion(starved), null, "a fourth question was offered");
  /* …and with only two recorded, she is still allowed to ask. */
  assert.ok(G.nextGiftQuestion({ ...starved, asked: ["Q1", "Q2"] }), "she stopped asking too early");
});

check("a slot the opening sentence filled is never asked about", () => {
  /* "le encanta Barbie" in the first breath means P1 is already
     answered — asking "¿qué le gusta?" after that reads as not
     listening. */
  const { asked } = interview(["Mi hija cumple 6 y le encanta Barbie"]);
  assert.equal(asked[0].id, "P2", "P1 was asked even though the character was already given");
  assert.match(asked[0].text, /Barbie/, "P2 did not pick up the character");
});

check("a character named at any point is remembered", () => {
  const { state } = interview(["Mi sobrino cumple 5", "le gusta PAW Patrol"]);
  assert.ok(state.characters.includes("PAW Patrol"));
  assert.equal([...G.giftCharactersIn("quiere algo de Spiderman y Lego")].join("|"), "Spider-Man|LEGO");
});

check("budget is read from a chip, a dollar figure, or soles", () => {
  assert.equal(G.giftBudgetOf("$25–$50").max, 50);
  assert.equal(G.giftBudgetOf("Sin límite").max, null, "sin límite is a choice, not a missing answer");
  assert.equal(G.giftBudgetOf("como $30").max, 35);
  assert.equal(G.giftBudgetOf("unos 100 soles", 3.5).max, Math.round((100 / 3.5) * 1.15));
  /* No rate, no conversion — a guessed exchange rate on this storefront
     is the one thing that must never happen. */
  assert.equal(G.giftBudgetOf("100 soles", null), null, "soles were converted with no rate");
  /* A bare number is an age in "cumple 6 años" and a budget only once
     the budget question has been asked. */
  assert.equal(G.giftBudgetOf("6"), null, "a bare 6 was read as a budget");
  assert.equal(G.giftBareAmountOf("30").max, 35);
});

/* ============================================================ */
group("curation: what a six-year-old never sees");

const child = { occasion: "cumpleaños", ageYears: 6, ageBand: "kids", gender: "female", category: null, characters: [], asked: [] };

check("adult stores, adult aisles and adult titles are all refused", () => {
  assert.equal(G.giftRejectReason({ title: "Bolso de cuero", price: 90, retailer: "ssense", departments: ["women"] }, child), "tienda de adultos");
  assert.equal(G.giftRejectReason({ title: "Blusa", price: 40, retailer: "macys", departments: ["women"] }, child), "sección de adultos");
  assert.equal(G.giftRejectReason({ title: "Black T-Shirt with Crochet Craft for Women", price: 9, retailer: "tns", departments: ["toys"] }, child), "producto de adulto");
  assert.equal(G.giftRejectReason({ title: "DIY Miniature Dollhouse Kit for Adults", price: 20, retailer: "walmart", departments: ["toys"] }, child), "producto de adulto");
});

check("\"for Teens and Adults\" is adult, \"for Kids & Adults\" is family", () => {
  /* CAUGHT IN THE BROWSER, not by a test: a dollhouse kit "for Teens
     and Adults" reached the shelf for a six-year-old, because the
     adult check only knew possessives and "for adults". Widening it to
     bare "adult" would have been worse — 163 toy titles say "adult"
     and most are family games ("Card Game For Kids & Adults"), which a
     six-year-old should absolutely see. */
  const adult = (t) => G.giftRejectReason({ title: t, price: 20, retailer: "walmart", departments: ["toys"] }, child);
  for (const t of ["3D Puzzle Dollhouse Kit, Craft for Teens and Adults",
                   "LEGO ART Hokusai – The Great Wave Wall Art Adults Set 31208",
                   "Puzzle Adults Only Edition"]){
    assert.equal(adult(t), "producto de adulto", `"${t}" reached a child`);
  }
  for (const t of ["Pictionary Air Takeover Family Game for Kids, Adults & Game Night",
                   "MindWare Legs Crossed - Card Game For Kids & Adults",
                   "LEGO Star Wars Building Set for Boys, Girls and Teens"]){
    assert.equal(adult(t), null, `"${t}" was wrongly withheld from a child`);
  }
});

check("the $1,186 designer jacket cannot reach a child's birthday", () => {
  /* Named in the brief, so pinned by name. */
  const jacket = { title: "Chaqueta acolchada", price: 1186, retailer: "walmart", departments: ["toys"] };
  assert.equal(G.giftRejectReason(jacket, child), "fuera de presupuesto");
  assert.ok(G.GIFT_CHILD_PRICE_CEILING_USD <= 150, "the child ceiling drifted upward");
  /* …and an adult with no budget is not price-capped at all. */
  const adult = { ...child, ageYears: 34, ageBand: "adult" };
  assert.equal(G.giftRejectReason(jacket, adult), null, "an adult gift was capped like a child's");
});

check("a birthday is not Halloween and not Christmas", () => {
  for (const t of ["Figurine de calabaza", "Halloween Pumpkin Decor", "Adorno navideño de árbol", "Christmas Dollhouse Kit"]){
    assert.equal(G.giftRejectReason({ title: t, price: 20, retailer: "walmart", departments: ["toys"] }, child),
      "temporada equivocada", `"${t}" was allowed on a birthday`);
  }
  /* …but at Christmas it obviously is. */
  const xmas = { ...child, occasion: "navidad" };
  assert.equal(G.giftRejectReason({ title: "Adorno navideño de árbol", price: 20, retailer: "walmart", departments: ["toys"] }, xmas), null);
});

check("a toy that states an older age is refused for a younger child", () => {
  assert.equal(G.giftTitleMinAge("LEGO City carrito de policía para niños de 5 años en adelante"), 5);
  assert.equal(G.giftTitleMinAge("Set de bloques 8+"), 8);
  assert.equal(G.giftTitleMinAge("Peluche suave"), null);
  assert.equal(G.giftRejectReason({ title: "Set de química 10+", price: 20, retailer: "walmart", departments: ["toys"] }, child), "edad no apropiada");
  assert.equal(G.giftRejectReason({ title: "Set de bloques para niños de 3 años en adelante", price: 20, retailer: "walmart", departments: ["toys"] }, child), null);
});

check("the chosen category is a filter, not a hint", () => {
  const arty = { ...child, category: "arte" };
  assert.equal(G.giftRejectReason({ title: "Pelota de fútbol", price: 15, retailer: "walmart", departments: ["toys"] }, arty), "otra categoría");
  assert.equal(G.giftRejectReason({ title: "Crayola set de pintura", price: 15, retailer: "walmart", departments: ["toys"] }, arty), null);
});

/* ============================================================ */
group("the answer, against the real catalogue");

check("the catalogue is the real one and it is not empty", () => {
  assert.ok(pool.length > 100000, `only ${pool.length} products loaded`);
});

check("the brief's example ends in 6-12 appropriate products", () => {
  const { state } = interview([
    "Mi hija cumple 6 años pronto.", "Le encanta dibujar y pintar.", "Un set de arte estaría perfecto.", "Como $30.",
  ]);
  const { products } = G.curateGiftResults(G.giftCandidates(pool, state), state, { max: G.GIFT_MAX_RESULTS });
  assert.ok(products.length >= 6 && products.length <= 12, `showed ${products.length} products, wanted 6-12`);
  for (const p of products){
    assert.ok(p.price <= 35, `${p.title} costs $${p.price}, over the stated budget`);
    assert.equal(G.giftRejectReason(p, state), null, `${p.title} should not have survived`);
  }
  /* Not one store's aisle. */
  const stores = new Set(products.map(p => p.retailer));
  assert.ok(stores.size >= 2, `every product came from ${[...stores][0]}`);
});

check("the reported bug does not come back", () => {
  /* MEASURED ON main BEFORE THIS CHANGE: "mi hija cumple 6 años" built
     the query "cumple girls", which collided with GIRL — a skateboard
     brand we stock — and answered with sixteen skate decks and a
     Pac-Man hoodie. Not one toy. */
  const { state } = interview(["Mi hija cumple 6 años pronto.", "Juguetes", "Menos de $25"]);
  const { products } = G.curateGiftResults(G.giftCandidates(pool, state), state, { max: 12 });
  assert.ok(products.length >= 6, `only ${products.length} products`);
  for (const p of products){
    assert.ok(!/skate|deck|crewneck|thrasher|hoodie/i.test(p.title), `skate merch came back: ${p.title}`);
    assert.ok((p.departments || []).includes("toys"), `${p.title} is not from the toy aisle`);
    assert.ok(p.price < 25, `${p.title} is $${p.price}, over the chosen band`);
  }
});

check("a named character leads the shelf", () => {
  const { state } = interview(["Mi hija cumple 6 y le encanta Barbie", "Juguetes de Barbie", "Menos de $25"]);
  const { products } = G.curateGiftResults(G.giftCandidates(pool, state), state, { max: 12 });
  assert.ok(products.length >= 6, `only ${products.length} Barbie products`);
  const barbies = products.filter(p => /barbie/i.test(p.title)).length;
  assert.ok(barbies >= Math.ceil(products.length / 2), `only ${barbies} of ${products.length} are Barbie`);
});

check("an impossible budget says so instead of inventing something", () => {
  const state = { occasion: "cumpleaños", kin: "hija", ageYears: 6, ageBand: "kids", category: "arte",
                  characters: [], budget: { key: "custom", label: "hasta $1", min: 0, max: 1 }, asked: ["P1", "P2", "P3"] };
  const { products } = G.curateGiftResults(G.giftCandidates(pool, state), state, { max: 12 });
  assert.equal(products.length, 0, "something was shown at a $1 budget");
});

check("a bigger shelf extends the smaller one instead of reshuffling it", () => {
  /* "Ver m\u00e1s" renders only the tail past what is already on screen, so
     the first N of a bigger request must be the same N, in the same
     order. If the ranking were unstable the shopper would see the same
     product twice and miss others entirely — which is exactly what the
     browser showed before the append fix (12 cards became 36, the
     first 12 of them duplicates). */
  const state = { occasion: "cumplea\u00f1os", kin: "hijo", ageYears: 8, ageBand: "kids", category: "juguetes",
                  characters: [], budget: null, asked: ["P1", "P2", "P3"] };
  const candidates = G.giftCandidates(pool, state);
  const twelve = G.curateGiftResults(candidates, state, { max: 12 }).products;
  const twentyFour = G.curateGiftResults(candidates, state, { max: 24 }).products;
  assert.equal(twelve.length, 12);
  assert.equal(twentyFour.length, 24);
  assert.equal(twentyFour.slice(0, 12).map(p => p.title).join("|"), twelve.map(p => p.title).join("|"),
    "the longer shelf reordered the first twelve");
  /* …and the tail is genuinely new, not the head again. */
  const head = new Set(twelve.map(p => p.title));
  const tail = twentyFour.slice(12).filter(p => head.has(p.title));
  assert.equal(tail.length, 0, `${tail.length} products repeat in the second page`);
});

check("the shelf never exceeds twelve, however much stock there is", () => {
  const state = { occasion: "cumpleaños", kin: "hijo", ageYears: 8, ageBand: "kids", category: "juguetes",
                  characters: [], budget: null, asked: ["P1", "P2", "P3"] };
  const { products, kept } = G.curateGiftResults(G.giftCandidates(pool, state), state, { max: 12 });
  assert.ok(kept > 500, `only ${kept} toys survived the filters — the aisle should be deep`);
  assert.equal(products.length, 12, `showed ${products.length}`);
});

/* ============================================================ */
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length){ for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
