/* ==================================================================
   THE IMPORT LIMIT IS NEVER GIVEN AS A FIGURE (#443 c.6709315389 item 4,
   Danny: "remove the $200 number entirely").

   No customer-facing string -- in the app bundle, the shop's pages, or
   the assistant's chat and voice code (system prompts, tool replies,
   canned lines) -- carries «200» next to «impuesto», «límite» or
   «importación». The threshold constant still decides which words show;
   a string that interpolates it (`$${..._THRESHOLD_USD}` or
   '$' + IMPORT_TAX_THRESHOLD_USD) counts as printing it.

   What is checked: string literals (comments stripped) in JS, and the
   visible text plus inline-script strings of every page. terminos.html
   (the legal terms) is excluded on purpose and listed by name below --
   its wording is Danny's call, not this test's.

     node scripts/test/no-limit-figure-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
let passed = 0, failed = 0;
function check(name, fn) {
  try { const n = fn(); passed++; console.log(`  ok   ${name}${n ? ` -- ${n}` : ""}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${String(e && e.message || e).split("\n").slice(0, 12).join("\n       ")}`); }
}

/* Legal text, left for Danny (the coordinator lists its lines). */
export const EXCLUDED = ["terminos.html"];
const NEAR = 70;
const KEY = /impuesto|l[ií]mite|importaci[oó]n|arancel|umbral|mercader[ií]a|franquicia|\btax\b|import/i;

/* The threshold, interpolated into a string, is the figure printed. */
function inlineThreshold(src) {
  return src
    .replace(/\$\{\s*[A-Z_]*THRESHOLD[A-Z_]*\s*\}/g, "200")
    .replace(/(['"`])\s*\+\s*[A-Z_]*THRESHOLD[A-Z_]*\s*\+\s*(['"`])/g, "200");
}
function decodeEscapes(s) {
  return s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
/* String literals of a JS source, comments skipped. */
export function jsStrings(src) {
  src = inlineThreshold(decodeEscapes(src.replace(/\r\n/g, "\n")));
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { const j = src.indexOf("\n", i); i = j < 0 ? src.length : j; continue; }
    if (c === "/" && d === "*") { const j = src.indexOf("*/", i + 2); i = j < 0 ? src.length : j + 1; continue; }
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1, buf = "";
      for (; j < src.length && src[j] !== c; j++) {
        if (src[j] === "\\") { buf += src[j + 1] || ""; j++; continue; }
        if (c !== "`" && src[j] === "\n") break;
        buf += src[j];
      }
      out.push(buf);
      i = j;
    }
  }
  return out;
}
export function htmlTexts(html) {
  html = html.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, " ");
  const out = [];
  html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, js) => { out.push(...jsStrings(js)); return " "; });
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  out.push(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  return out;
}
export function offenders(texts) {
  const bad = [];
  for (const t of texts) {
    for (const m of t.matchAll(/(?<![\d.,])200(?![\d.,]*\d)/g)) {
      const win = t.slice(Math.max(0, m.index - NEAR), m.index + 3 + NEAR);
      if (KEY.test(win)) bad.push(win.replace(/\s+/g, " ").trim());
    }
  }
  return bad;
}

const bundle = "build/" + /<script src="\/build\/(app-[0-9a-f]{16}\.js)"/.exec(read("index.html"))[1];
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith(".html") && !EXCLUDED.includes(f)).sort();
const CHAT = [
  "netlify/functions/_aria-prompt.js", "netlify/functions/_aria-agent-prompt.js", "netlify/functions/_aria-chat-model.js",
  ...readdirSync(ROOT + "netlify/functions").filter((f) => /^aria-(chat|realtime)/.test(f)).map((f) => "netlify/functions/" + f),
  "netlify/functions/_muse-tools.js", "scripts/lib/realtime-voice.js", "scripts/lib/realtime-turn.js",
  "voice-agent/src/brain.generated.mjs",
].filter((f) => existsSync(ROOT + f));

check("the detector catches the forms the figure used to take", () => {
  assert.equal(offenders(jsStrings("x = `Tu pedido está por debajo de los $${TAX_ESTIMATE_THRESHOLD_USD} – sin impuestos`;")).length, 1);
  assert.equal(offenders(jsStrings("x = 'pasan de $' + IMPORT_TAX_THRESHOLD_USD + ' en impuestos';")).length, 1);
  assert.equal(offenders(htmlTexts("<p>Los envíos de hasta 200 dólares no pagan impuestos</p>")).length, 1);
  assert.equal(offenders(jsStrings("// over $200 the import tax\nx = 'ok';")).length, 0, "a comment is not customer-facing");
  assert.equal(offenders(jsStrings("x = 'Máx. 2000 unidades'; y = 'impuestos';")).length, 0);
});
check(`the bundle (${bundle}) prints no import-limit figure`, () => {
  const bad = offenders(jsStrings(read(bundle)));
  assert.deepEqual(bad, []);
});
check(`the pages (${PAGES.length}, terminos.html excluded) print no import-limit figure`, () => {
  const bad = [];
  for (const p of PAGES) for (const b of offenders(htmlTexts(read(p)))) bad.push(`${p}: ${b}`);
  assert.deepEqual(bad, []);
});
check(`the assistant's chat and voice code (${CHAT.length} files) says no import-limit figure`, () => {
  const bad = [];
  for (const f of CHAT) for (const b of offenders(jsStrings(read(f)))) bad.push(`${f}: ${b}`);
  assert.deepEqual(bad, []);
  return CHAT.join(", ");
});
check("the assistant names the limit in the bar's words and carries the split tip", () => {
  const prompt = read("netlify/functions/_aria-prompt.js");
  assert.match(prompt, /se acerca al límite de importación/);
  assert.match(prompt, /pasó el límite de importación/);
  assert.match(prompt, /divide tu compra en pedidos separados/);
  assert.doesNotMatch(prompt, /Nunca sugieras dividir un pedido/);
  assert.match(read(bundle), /function chatTaxLineEs\(\)\{[\s\S]*?IMPORT_LIMIT_TIP/);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
