/* ==================================================================
   THE CHAT NEVER LEAVES THE PAGE ON ITS OWN (2026-10-08, live bug).

   "Type anything, hit Enviar, the page goes to /ofertas.html." Any
   message with a sale word ("ofertas", "descuento", "rebaja", "sale")
   took the chat's sales shortcut, which called goSales(); since the
   2026-10-05 nav override that is a full page load, so the message and
   the conversation vanished. "Zapatos de mujer" did the same through
   openCatalog(). Now the chat answers in place with a door the shopper
   taps.

   RUNNING IT
     node scripts/test/chat-no-navigation-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const page = readFileSync(ROOT + "index.html", "utf8");
function lift(sig) {
  const at = page.indexOf(sig);
  assert.ok(at > 0, "missing " + sig);
  let d = 0;
  for (let k = page.indexOf("{", at); k < page.length; k++) {
    if (page[k] === "{") d++;
    else if (page[k] === "}" && --d === 0) return page.slice(at, k + 1);
  }
  throw new Error("unbalanced " + sig);
}

check("the chat brain never navigates by itself", () => {
  const brain = lift("async function runAssistantBrain(text){");
  /* Comments may name the functions; code may not call them. */
  const code = brain.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const re of [/\bgoSales\(/, /\bopenCatalog\(/, /\bopenStore\(/, /\bopenAriaAuto\(/, /\bshowProduct\(/,
    /\bdismissAssistantForNavigation\(/, /location\.(?:href|assign|replace)/]) {
    assert.doesNotMatch(code, re, `runAssistantBrain calls ${re.source} — a chat message would leave the page`);
  }
});

check("the sales and gendered-shoe shortcuts answer in place with a door", () => {
  const brain = lift("async function runAssistantBrain(text){");
  const uses = (brain.match(/answerInChatWithDoor\(/g) || []).length;
  assert.ok(uses >= 2, "a shortcut no longer answers in the chat");
  assert.match(brain, /addAssistantSectionOffer\('Ofertas', [^)]*'department', 'sale'\)/, "the generic sales answer has no Ofertas door");
  assert.match(brain, /addAssistantStoreOffer\(salesTarget\.key/, "a store's sales have no store door");
  assert.match(brain, /addAssistantBrandOffer\(salesTarget\.key/, "a brand's sales have no brand door");
  const door = lift("function answerInChatWithDoor(line, addDoor, statusEl, prevStatus){");
  assert.match(door, /assistantThinking = false;/, "the turn is never closed — the next message would be ignored");
  assert.doesNotMatch(door.replace(/\/\*[\s\S]*?\*\//g, ""), /goSales\(|openCatalog\(|location\./, "the door helper navigates");
});

check("the desktop chat card cannot run past the window, Tailwind or not", () => {
  assert.match(page, /#assistantPanel\{ z-index:40 \}/, "the card's stacking still depends on Tailwind");
  const desk = /@media \(min-width: 1024px\)\{\s*#assistantPanel\{([^}]*)\}/.exec(page);
  assert.ok(desk, "no real-CSS desktop rule for the chat card");
  assert.match(desk[1], /width:min\(380px, calc\(100vw - 40px\)\)/);
  assert.match(desk[1], /max-width:calc\(100vw - 40px\)/);
  assert.match(desk[1], /position:fixed; right:20px/);
});

check('"Por qué Aria" never 404s', () => {
  const redirects = readFileSync(ROOT + "_redirects", "utf8");
  assert.match(redirects, /^\/por-que-aria\.html \/nosotros\.html 301$/m);
  assert.match(redirects, /^\/por-que-aria \/nosotros\.html 301$/m);
});

const MIN_CHECKS = 4;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
