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

/* PERF (2026-10-14): index.html's script ships as an external bundle
   (build/app-<hash>.js) for browser caching. pageHtml() inlines the
   bundle back at its tag, so reads of the page below see the page
   exactly as written. */
function pageHtml() {
  const html = readFileSync(ROOT + "index.html", "utf8");
  const tag = /<script\s+src="\/(build\/app-[^"]+\.js)"[^>]*><\/script>/.exec(html);
  if (!tag) return html;
  const bundle = readFileSync(ROOT + tag[1], "utf8");
  return html.replace(tag[0], () => `<script>\n${bundle}\n</script>`);
}

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const page = pageHtml();
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
  /* The turn's body moved into runAssistantTurn (2026-10-13, F-LAG);
     the wrapper and the body are checked together. */
  const brain = lift("async function runAssistantBrain(text") + "\n" + lift("async function runAssistantTurn(text, turn){");
  /* Comments may name the functions; code may not call them. */
  const code = brain.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const re of [/\bgoSales\(/, /\bopenCatalog\(/, /\bopenStore\(/, /\bopenAriaAuto\(/, /\bshowProduct\(/,
    /\bdismissAssistantForNavigation\(/, /location\.(?:href|assign|replace)/]) {
    assert.doesNotMatch(code, re, `runAssistantBrain calls ${re.source} — a chat message would leave the page`);
  }
});

check("the sales and gendered-shoe shortcuts answer in place with a door", () => {
  /* The turn's body moved into runAssistantTurn (2026-10-13, F-LAG);
     the wrapper and the body are checked together. */
  const brain = lift("async function runAssistantBrain(text") + "\n" + lift("async function runAssistantTurn(text, turn){");
  const uses = (brain.match(/answerInChatWithDoor\(/g) || []).length;
  assert.ok(uses >= 2, "a shortcut no longer answers in the chat");
  assert.match(brain, /addAssistantSectionOffer\('Ofertas', [^)]*'department', 'sale'\)/, "the generic sales answer has no Ofertas door");
  assert.match(brain, /addAssistantStoreOffer\(salesTarget\.key/, "a store's sales have no store door");
  assert.match(brain, /addAssistantBrandOffer\(salesTarget\.key/, "a brand's sales have no brand door");
  const door = lift("function answerInChatWithDoor(line, addDoor, statusEl, prevStatus, userText){");
  assert.match(door, /assistantThinking = false;/, "the turn is never closed — the next message would be ignored");
  assert.doesNotMatch(door.replace(/\/\*[\s\S]*?\*\//g, ""), /goSales\(|openCatalog\(|location\./, "the door helper navigates");
});

/* THE VOICE NEVER LEAVES THE PAGE EITHER (#443 P0 c.6692638975, the
   Instagram reset). The rule above covered the typed brain only; the
   voice path -- her events, her tools, the search behind them -- is held
   to it too. The one door is open_product, which the shopper asks for
   by name ("ábrelo"); nothing else she does may navigate or reload. */
const NAVIGATES = [/\bgoSales\(/, /\bopenCatalog\(/, /\bopenStore\(/, /\bopenAriaAuto\(/, /\bshowProduct\(/, /\bdoSearch\(/,
  /\bdismissAssistantForNavigation\(/, /location\.(?:href|assign|replace|reload)/, /\.reload\(/, /history\.(?:go|back|forward)\(/,
  /\.submit\(\)/, /\bwindow\.open\(/];
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

check("the voice path never navigates or reloads by itself", () => {
  const tools = lift("async function executeRealtimeTool(name, args){");
  /* The shopper-asked door, cut out and checked on its own. */
  const openAt = tools.indexOf("  if (name === 'open_product'){");
  assert.ok(openAt > 0, "open_product moved");
  let d = 0, openEnd = -1;
  for (let k = tools.indexOf("{", openAt); k < tools.length; k++) {
    if (tools[k] === "{") d++;
    else if (tools[k] === "}" && --d === 0) { openEnd = k; break; }
  }
  const rest = tools.slice(0, openAt) + tools.slice(openEnd + 1);
  const voice = [rest,
    lift("async function onRealtimeEvent(event, turn, send){"),
    lift("async function runRealtimeTool(event, send){"),
    lift("async function realtimeSearchWithFallback(args, budgetUsd){"),
    lift("async function ownedVoiceTool(name, rawArgs){"),
    lift("function ownedVoiceTurn(role, text){"),
    lift("function ownedVoiceShow(ids){"),
    lift("async function catalogSearch(query, opts){"),
    lift("async function catalogSearchOnServer(query, opts){"),
    lift("function ariaWarmVoiceCatalogue(){"),
    lift("function addAssistantProductCard(item, retailer){").replace(/card\.onclick = \(\) => \{[\s\S]*?\n  \};/, ""),
  ].map(stripComments).join("\n");
  for (const re of NAVIGATES) assert.doesNotMatch(voice, re, `the voice path calls ${re.source} — a voice turn would leave the page`);
  assert.doesNotMatch(stripComments(rest), /openShownProduct\(/, "a tool other than open_product opens a product");
});

check("nothing in the page reloads it: not on an error, a hidden tab or a refused microphone", () => {
  assert.doesNotMatch(stripComments(page), /location\.reload\s*\(|\bhistory\.go\(\s*0?\s*\)/, "the page can reload itself");
});

check("a call on a phone never warms the whole catalogue: the search server answers instead", () => {
  const warm = lift("function ariaWarmVoiceCatalogue(){");
  const lowAt = warm.indexOf("ariaLowMemoryBrowser()");
  assert.ok(lowAt > 0 && lowAt < warm.indexOf("relatedPool()"), "the phone check is not ahead of the catalogue warm-up");
  assert.match(warm.slice(lowAt, warm.indexOf("relatedPool()")), /\?warm=1[\s\S]*return;/, "the phone branch does not return before the catalogue");
  for (const sig of ["async function startRealtimeVoiceOnce(){", "async function startOwnedVoice(){"]) {
    const body = stripComments(lift(sig));
    assert.doesNotMatch(body, /relatedPool\(|loadDepartmentCache\(/, `${sig} loads the catalogue itself`);
    assert.match(body, /ariaWarmVoiceCatalogue\(\)/, `${sig} no longer warms through the phone-safe helper`);
  }
  const search = lift("async function catalogSearch(query, opts){");
  assert.match(search, /^async function catalogSearch\(query, opts\)\{\r?\n  if \(ariaSearchOnServer\(\)\) return catalogSearchOnServer\(query, opts\);/,
    "catalogSearch reaches the catalogue before asking whether this is a phone");
  const inApp = /const IN_APP_BROWSER_RE = \/([^\n]*)\/i;/.exec(page);
  assert.ok(inApp, "the in-app browser list is gone");
  for (const app of ["Instagram", "FBAN", "FBAV", "WhatsApp", "TikTok"]) assert.ok(inApp[1].includes(app), app + " is not treated as a light browser");
  assert.match(lift("function ariaLowMemoryBrowser(){"), /iPhone\|iPad\|iPod\|Android/, "a phone is not treated as a light browser");
});

check("the in-page product view never loads the whole catalogue on a phone: rail, combo, route lookup", () => {
  for (const sig of ["async function renderRelatedRail(anchorIn){", "async function resolveComboDeal(combo, anchor){", "async function findCatalogProductByTitle(title){"]) {
    const body = stripComments(lift(sig));
    const gate = body.indexOf("ariaSearchOnServer()");
    assert.ok(gate > 0, `${sig} has no phone check`);
    assert.ok(gate < body.indexOf("relatedPool()"), `${sig} reaches relatedPool() before asking whether this is a phone`);
  }
});

check("a spoken number is never dropped as noise", () => {
  const noise = lift("function realtimeTranscriptIsNoise(t){");
  assert.match(noise, /if \(letters < 2\) return !\/\\d\/\.test\(s\);/, "a digits-only answer (\"5000.\") is noise again");
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

const MIN_CHECKS = 9;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
