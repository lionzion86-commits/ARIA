/* ==================================================================
   NAMED IT, THEN RETRACTED IT — the shopper must never hear both.

   Danny, 2026-10-07: "I found the Titan Pro MMA gloves on sale" and,
   in the same reply, "but it didn't show up in our catalog". The rule:
   a product she names is a product she can show a card for. The prompt
   says so (NO_CONTRADICTION_RULE_ES); resolveCatalogContradiction holds
   it in code on every text endpoint. The cards decide which half of a
   contradiction is true.

   RUNNING IT
     node scripts/test/catalog-contradiction-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import {
  resolveCatalogContradiction as resolve,
  CATALOG_NOT_FOUND_FALLBACK_ES,
} from "../../netlify/functions/_aria-chat-model.js";
import { buildSystemPrompt, NO_CONTRADICTION_RULE_ES } from "../../netlify/functions/_aria-prompt.js";
import { buildAgentSystemPrompt } from "../../netlify/functions/_aria-agent-prompt.js";

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const PROD_EN = "I found the Titan Pro MMA gloves on sale, but it didn't show up in our catalog.";
const PROD_ES = "¡Encontré los guantes Titan Pro de MMA en oferta! Pero no aparecieron en nuestro catálogo. ¿Quieres ver otros guantes de MMA?";

check("the production reply, with no card: the unverified product is not named", () => {
  for (const t of [PROD_EN, PROD_ES]) {
    const out = resolve(t, false);
    assert.doesNotMatch(out, /Titan/i, `still names the product: ${out}`);
    assert.doesNotMatch(out, /\b(?:found|encontr[eé])\b/i, `still claims it was found: ${out}`);
  }
  /* What she said besides the contradiction survives. */
  assert.match(resolve(PROD_ES, false), /¿Quieres ver otros guantes de MMA\?$/);
});

check("the production reply, with a card: the retraction goes, the product stays", () => {
  const en = resolve(PROD_EN, true);
  assert.equal(en, "I found the Titan Pro MMA gloves on sale.");
  const es = resolve("¡Encontré los guantes Titan Pro de MMA en oferta a $46! Pero no aparecieron en nuestro catálogo.", true);
  assert.equal(es, "¡Encontré los guantes Titan Pro de MMA en oferta a $46!");
});

check("a recommendation hedged in one clause, no card, becomes an honest not-found", () => {
  assert.equal(
    resolve("Te recomiendo los Titan Pro de Everlast, aunque no los tenemos disponibles ahorita.", false),
    CATALOG_NOT_FOUND_FALLBACK_ES);
});

check("the honest shape — deny first, offer what we have — is left alone", () => {
  const honest = [
    "No encontré los Titan Pro en nuestro catálogo, pero sí tengo estos guantes de MMA de Venum que están en oferta.",
    "No encontré aletas de buceo en nuestro catálogo. ¿Te muestro máscaras?",
  ];
  for (const t of honest) {
    assert.equal(resolve(t, true), t);
    assert.equal(resolve(t, false), t);
  }
});

check("an ordinary recommendation is untouched", () => {
  const t = "Mira estos guantes Everlast en oferta, cuestan $46. Son ideales para sparring.";
  assert.equal(resolve(t, true), t);
});

check("every brain carries the rule", () => {
  assert.ok(buildSystemPrompt([], null, null).includes(NO_CONTRADICTION_RULE_ES), "classic chat prompt lacks the rule");
  /* The realtime voice builds on the agent prompt, so this covers it. */
  assert.ok(buildAgentSystemPrompt(null).includes(NO_CONTRADICTION_RULE_ES), "agent prompt lacks the rule");
});

const MIN_CHECKS = 6;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
