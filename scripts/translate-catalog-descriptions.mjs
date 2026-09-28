// Translates English product descriptions to Spanish in catalog JSONs.
//
//   node scripts/translate-catalog-descriptions.mjs <catalog.json> [...]
//   node scripts/translate-catalog-descriptions.mjs --all
//   node scripts/translate-catalog-descriptions.mjs --dry-run <catalog.json>
//
// WHY THIS EXISTS
// Shoppers are Peruvian; every customer-facing string must be Spanish.
// Retailer scrapes arrive in English, so every catalog build/import must
// run this as its last step. The 2026-09-27 backlog (11k descriptions)
// was translated offline; this keeps new arrivals Spanish from day one.
//
// HOW IT WORKS
// - Walks every item.description in the file(s).
// - Skips anything already Spanish (word-list heuristic; short fragments
//   and brand-only strings are left alone).
// - Translates the English ones via Groq (GROQ_API_KEY env, same key and
//   model the chat endpoints use), batched 8 per request.
// - FAITHFUL translation only: the prompt forbids inventing facts, specs,
//   or prices, and requires brand names / model numbers / sizes kept as-is.
// - Writes back compact JSON (the served format); reports counts.
//
// Env: GROQ_API_KEY (required to translate; without it the script reports
// what WOULD be translated and exits non-zero so a build step can't
// silently ship English).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const BATCH = 8;

const EN_CORE = new Set(("the and for with from that this these those they their them there then than which when will would your you are was were been has have had not but all any each every more most other some such only just about into over after before between through during very made make many much get new used using design designed crafted built featuring features includes including provides perfect ideal great ultimate premium quality comfort comfortable durable lightweight soft breathable stylish versatile collection").split(" "));
const ES_CORE = new Set(("el la los las un una unos unas de del en y con por para como muy sin sobre entre hasta desde donde cuando este esta estos estas ese esa esos esas son estan fue fueron han tiene tienen sus nuestro nuestra pero porque tambien todo toda todos todas hay ser estar").split(" "));

function isEnglish(s) {
  const words = (s.toLowerCase().match(/[a-z]+/g) || []).filter((w) => w.length > 1);
  if (words.length < 3) return false;
  let en = 0, es = 0;
  for (const w of words) {
    if (EN_CORE.has(w)) en++;
    if (ES_CORE.has(w)) es++;
  }
  return en >= 2 && en > es * 2;
}

function* walkItems(obj) {
  if (Array.isArray(obj)) {
    for (const v of obj) yield* walkItems(v);
    return;
  }
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj.items)) {
      for (const it of obj.items) {
        if (it && typeof it === "object") yield it;
      }
    }
    for (const v of Object.values(obj)) yield* walkItems(v);
  }
}

const SYSTEM = `You are a faithful English-to-Spanish translator for product descriptions on a Peruvian shopping site.
Rules:
- Translate naturally into neutral Latin American Spanish (Peru).
- NEVER invent, add, or change facts, specs, materials, sizes, prices, or claims. Translate only what is there.
- Keep brand names, model numbers, sizes, and proper nouns exactly as-is (e.g. "Venum", "990v4", "UFC").
- If a line is a fragment or spec list, keep it a fragment or spec list; do not pad it into sentences.
- Output ONLY the translations, one per line, in the same order, with no numbering or commentary.`;

async function translateBatch(texts, apiKey) {
  const numbered = texts.map((t, i) => `###${i + 1}###\n${t}`).join("\n");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      max_tokens: 4000,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: numbered },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const out = data.choices?.[0]?.message?.content ?? "";
  // Split back on the ###n### markers; fall back to line split.
  const parts = out.split(/###\d+###/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === texts.length) return parts;
  const lines = out.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length === texts.length) return lines;
  throw new Error(`batch shape mismatch: sent ${texts.length}, got ${parts.length}/${lines.length}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const files = args.includes("--all")
    ? fs.readdirSync(ROOT).filter((f) => f.endsWith("-catalog.json")).map((f) => path.join(ROOT, f))
    : args.filter((a) => !a.startsWith("--"));
  if (!files.length) {
    console.error("usage: node scripts/translate-catalog-descriptions.mjs [--dry-run] <catalog.json> [...] | --all");
    process.exit(2);
  }
  const apiKey = (process.env.GROQ_API_KEY || "").trim();

  let totalFound = 0, totalDone = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    const targets = [];
    for (const item of walkItems(data)) {
      const d = item.description;
      if (typeof d === "string" && d.trim().length >= 12 && isEnglish(d)) targets.push(item);
    }
    console.log(`${path.basename(file)}: ${targets.length} English descriptions`);
    totalFound += targets.length;
    if (dryRun || !targets.length) continue;
    if (!apiKey) {
      console.error("GROQ_API_KEY missing — refusing to silently skip translation.");
      process.exit(3);
    }
    for (let i = 0; i < targets.length; i += BATCH) {
      const slice = targets.slice(i, i + BATCH);
      const translated = await translateBatch(slice.map((it) => it.description.trim()), apiKey);
      slice.forEach((it, j) => { it.description = translated[j]; });
      totalDone += slice.length;
      process.stdout.write(`  ${Math.min(i + BATCH, targets.length)}/${targets.length}\r`);
      await new Promise((r) => setTimeout(r, 1200));
    }
    process.stdout.write("\n");
    fs.writeFileSync(file, JSON.stringify(data));
    console.log(`  wrote ${path.basename(file)}`);
  }
  console.log(`done: ${totalDone}/${totalFound} translated${dryRun ? " (dry run)" : ""}`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
