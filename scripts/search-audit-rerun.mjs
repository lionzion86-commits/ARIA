#!/usr/bin/env node
/* ==================================================================
   THE SEARCH AUDIT, RE-RUN (#443 c.6621646383).

   search-audit-2026-11-03/ holds the two-wave audit: 11 slice CSVs
   (term, variant_of, expected_intent, what_leads, verdict, notes), every
   term judged PASS / WEAK / FAIL on the FIRST LANE of the live search
   function's answer. This runs every term through the local search
   function (netlify/functions/search.js, in process) and judges it by
   the same rule, mechanically:

     - a STORE intent ("store:Costco") passes when the answer keys that
       store (or routes to its page) AND its first lane leads with that
       store's own products; a store key
       with no lane from that store is a FAIL (the audit's rule 5);
     - a NOT-CARRIED store ("store:NOT carried — honest handling") passes
       on an honest answer: no store key, and no results or the chooser;
     - anything else names a product (a type, a brand, a model): the
       intent's words become matchers (JUDGE_LEX below, a word's own stem
       otherwise; a brand the catalogue sells matches the card's brand),
       and the first lane's first five cards are read: 4-5 on the intent
       PASS, 2-3 WEAK, 0-1 FAIL; no results FAIL.

   The recorded verdict is the audit's (a person reading the page); the
   judge's verdict on the base commit is reported beside it as the
   judge's agreement, so a rate moving is the search moving, not the
   judge.

     node scripts/search-audit-rerun.mjs                 the rates, per wave
     node scripts/search-audit-rerun.mjs --out f.json    and every row's verdict
     node scripts/search-audit-rerun.mjs --rows FAIL     print the failing rows
     node scripts/search-audit-rerun.mjs --only lenceria,costcco
   ================================================================== */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const DIR = join(ROOT, "search-audit-2026-11-03");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

/* ---------- the CSVs ---------- */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}
export function loadAudit(dir = DIR) {
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".csv")).sort()) {
    const wave = /^wave2-/.test(f) ? 2 : 1;
    for (const r of parseCsv(readFileSync(join(dir, f), "utf8"))) if (r.term) out.push({ ...r, file: f, wave });
  }
  return out;
}

/* ---------- the judge ---------- */
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
/* Intent words that say nothing about the product. */
const NOISE = new Set(("lead leads led leading products product items the a an of for and or in on with to as by from at is are be "
  + "es en pe latam peru peruvian plural singular variant typo accent accented unaccented spelling phonetic abbrev abbreviation apostrophe split joined "
  + "word term bare known generic everyday concept phrase test probe intent expected verify recheck wave failing fail pass weak same as "
  + "if any only general set sets view page pattern brand store type part auto redirect resolves handling honest honesty judge tolerance "
  + "ambiguity query search catalog result results danny add work merch random junk expect sells carries name dept ofertas rails per "
  + "core real true actual new old good main first full top best budget mini own other s b h d g e m l ch nb pc "
  + "women womens woman men mens man kids kid girls boys baby babies toddler unisex ladies adult adults audience plus size "
  + "black white red blue pink green navy gray grey brown gold silver beige color colour "
  + "de del la las los el para con sin y un una").split(" "));
/* A product word of an intent -> what a card that IS it carries. The
   regexes read the card's brand, title and category, folded. */
const JUDGE_LEX = [
  [/^(phones?|cellphones?|smartphones?|celulares?)$/, /\b(phone|iphone|smartphone|galaxy (s|a|z)\s?\d|pixel \d|moto g|motorola (edge|razr|moto)|xiaomi|redmi)\b/],
  [/^iphones?$/, /\biphone\s?(\d{1,2}|se|xr|xs|air)\b/],
  [/^(cell)$/, /\b(phone|iphone|smartphone|galaxy)\b/],
  [/^(laptops?|notebooks?|computers?|portatil(es)?|macbooks?|chromebooks?)$/, /\b(laptop|notebook|chromebook|macbook|imac|desktop|all in one|computer|ideapad|thinkpad|vivobook|zenbook|inspiron|pavilion|omen|legion|aspire|swift)\b/],
  [/^(tvs?|televisions?|televisores?)$/, /\b(tv|television|televisor|qled|oled|smart tv|roku tv|fire tv|uhd)\b/],
  [/^(speakers?|parlantes?|soundbars?)$/, /\b(speakers?|soundbar|parlante|boombox)\b/],
  [/^(headphones?|earbuds?|audifonos|airpods)$/, /\b(headphones?|earbuds?|earphones?|airpods|headset|buds|in ear|over ear)\b/],
  [/^(smartwatch(es)?|watch(es)?)$/, /\b(watch|smartwatch|band)\b/],
  [/^(drones?)$/, /\b(drones?|dji|quadcopter|mavic|avata)\b/],
  [/^(cameras?|camaras?|gopro)$/, /\b(camera|gopro|mirrorless|dslr|camcorder|webcam|instax|cam)\b/],
  [/^(consoles?|playstation|ps|xbox|switch|nintendo)$/, /\b(console|playstation|ps5|ps4|xbox|switch|steam deck)\b/],
  [/^(tablets?|ipads?)$/, /\b(tablet|ipad|galaxy tab|fire hd|tab)\b/],
  [/^(tires?|llantas?|neumaticos)$/, /\b(tires?|tyres?|neumatico|llanta)\b/],
  [/^(wheels?|rims?)$/, /\b(wheels?|rims?)\b/],
  [/^(batteries|battery|pilas|baterias?)$/, /\b(battery|batteries|power bank|batteries)\b/],
  [/^(dumbbells?|weights?|pesas|mancuernas|kettlebells?|barbells?|plates)$/, /\b(dumbbells?|kettle ?bells?|barbells?|weight plates?|weights?|bumper plates?|weight set)\b/],
  [/^(treadmills?|caminadoras?)$/, /\b(treadmill|walking pad)\b/],
  [/^(skates?|patines)$/, /\b(skates?|rollerblades?|patines)\b/],
  [/^(skateboards?|decks?)$/, /\b(skateboard|deck|complete)\b/],
  [/^(bikes?|bicycles?|bicicletas?)$/, /\b(bikes?|bicycles?|bicicleta|bmx|ebike)\b/],
  [/^(helmets?|cascos?)$/, /\b(helmets?|casco)\b/],
  [/^(gloves?|guantes)$/, /\b(gloves?|guantes?|mitts?)\b/],
  [/^(lunchbox(es)?|loncheras?)$/, /\b(lunch ?box(es)?|lunch bag|bento|lunchbox)\b/],
  [/^(blenders?|licuadoras?)$/, /\b(blenders?|blender|nutribullet|ninja)\b/],
  [/^(fragrances?|perfumes?|colognes?|edp|edt)$/, /\b(perfume|parfum|eau de|cologne|fragrance|edp|edt|body mist|colonia)\b/],
  [/^(lipsticks?)$/, /\b(lipsticks?|lip color|lip stick|labial)\b/],
  [/^(creams?|moisturizers?|lotions?)$/, /\b(cream|moisturi[sz]er|lotion|creme|crema|locion)\b/],
  [/^(sunscreens?)$/, /\b(sunscreen|spf|sun screen|protector solar|sunblock)\b/],
  [/^(shampoos?)$/, /\b(shampoo|champu)\b/],
  [/^(sneakers?|zapatillas?|trainers?)$/, /\b(sneakers?|shoes?|trainers?|runners?|zapatillas?|air max|air force|dunk|samba|gazelle|superstar|campus|old skool|chuck|550|990|jordan|retro|spizike)\b/],
  [/^(shoes?|zapatos?|footwear)$/, /\b(shoes?|sneakers?|boots?|sandals?|slides?|heels?|loafers?|flats?|mules?|clogs?|footwear|cleats?|pumps?)\b|footwear/],
  [/^(boots?|botas?)$/, /\b(boots?|booties?|botas?)\b/],
  [/^(bras?|brasieres?)$/, /\b(bras?|bralette|brassiere|push up)\b/],
  [/^(lingerie|lenceria)$/, /\b(bras?|bralette|panty|panties|thong|lingerie|teddy|bodysuit|garter|corset|babydoll|chemise|slip)\b/],
  [/^(underwear)$/, /\b(underwear|briefs?|boxers?|panty|panties|thong|trunks?|bras?)\b/],
  [/^(clothing|clothes|ropa|apparel)$/, /\b(shirt|tee|t shirt|dress|pants|shorts|jacket|hoodie|sweater|sweatshirt|top|leggings|jeans|skirt|blouse|polo|jogger|romper|onesie|bodysuit|set|outfit|coat|vest|pajama|cardigan|tank)\b/],
  [/^(parts?|repuestos)$/, /\b(brake|filter|spark plug|rotor|pads?|bearing|sensor|pump|belt|hose|gasket|alternator|starter|radiator|shock|strut|oil|battery|wiper|headlight|bulb|clutch|exhaust|muffler|caliper|tie rod|control arm)\b/],
];
const stemRx = (w) => new RegExp("\\b" + w.replace(/(es|s)$/, "").replace(/[^a-z0-9]/g, "") + "(s|es)?\\b");
export function makeJudge(ctx, labels) {
  /* Brand names the catalogue sells, longest first (multi-word names whole). */
  const brands = new Map();
  for (const p of ctx.products) { const b = fold(p.brand); if (b.length >= 2) brands.set(b, (brands.get(b) || 0) + 1); }
  const brandNames = [...brands.entries()].filter(([b, n]) => n >= 5 && b.length >= 3).map(([b]) => b).sort((a, b) => b.length - a.length);
  const storeByName = new Map();
  for (const [k, l] of Object.entries(labels)) { storeByName.set(fold(l), k); storeByName.set(fold(k), k); storeByName.set(fold(l).replace(/ /g, ""), k); }
  const storeOf = (name) => {
    const n = fold(name).replace(/\b(s)\b/g, "").replace(/\s+/g, " ").trim();
    return storeByName.get(n) || storeByName.get(n.replace(/ /g, "")) || [...storeByName.entries()].find(([k]) => k.replace(/ /g, "") === n.replace(/ /g, ""))?.[1] || null;
  };
  /* An intent -> { kind, store?, brand?, words: [regex] }. */
  function intentOf(row) {
    const raw = String(row.expected_intent || "");
    const s = raw.replace(/\(.*?\)/g, " ");
    let st = /^\s*store\s*:\s*(.+)$/i.exec(s);
    /* "store redirect: Kohl's store page", "Costco store page". */
    if (!st && /\bstore\b/i.test(s)) { const m = /^(?:store redirect\s*:\s*)?(.+?)\s+store\b/i.exec(s.replace(/^store redirect\s*:\s*/i, "")); if (m && storeOf(m[1])) st = [null, m[1]]; }
    if (st) {
      if (/not carried|honest|none/i.test(st[1])) return { kind: "honest" };
      const key = storeOf(st[1].replace(/\b(beauty|com|usa|store)\b/gi, "").trim()) || storeOf(st[1]);
      return { kind: "store", store: key, name: st[1].trim() };
    }
    let text = " " + fold(s.replace(/^\s*(brand|auto part|auto type|type|brand pattern)\s*:\s*/i, "")) + " ";
    let brand = null;
    /* A brand the intent names -- not a product word that happens to be one too ("blenders"). */
    for (const b of brandNames) if (text.includes(" " + b + " ") && !(b.split(" ").length === 1 && JUDGE_LEX.some(([k]) => k.test(b)))) { brand = b; text = text.replace(" " + b + " ", " "); break; }
    const words = text.split(" ").filter((w) => w && !NOISE.has(w) && (/^\d{2,}$/.test(w) || (!/\d/.test(w) && w.length >= 3)));
    const rxs = [];
    for (const w of words) {
      const hit = JUDGE_LEX.find(([k]) => k.test(w));
      rxs.push(hit ? hit[1] : /^\d+$/.test(w) ? new RegExp("\\b" + w + "\\b") : stemRx(w));
    }
    if (!brand && !rxs.length) return { kind: "unjudged" };
    return { kind: "product", brand, rxs };
  }
  function cardIs(it, c) {
    const text = " " + fold(c.brand + " " + c.title + " " + (c.category || "")) + " ";
    if (it.brand && !(" " + fold(c.brand) + " ").includes(" " + it.brand + " ") && !text.includes(" " + it.brand + " ")) return false;
    /* Most of the intent's product words ("running shoes": running AND a
       shoe; "air max 90 shoes": three of four). */
    return it.rxs.filter((rx) => rx.test(text)).length >= Math.ceil(it.rxs.length / 2);
  }
  function judge(row, a, d) {
    const it = intentOf(row);
    const lane = (a && a.lanes && a.lanes[0]) || null;
    const cards = lane ? lane.items : (a && a.items) || [];
    if (it.kind === "honest") {
      const honest = !a.store && (a.state !== "results" || (d && d.destination && d.destination.kind === "chooser"));
      return { verdict: honest ? "PASS" : "FAIL", why: honest ? "honest" : `store=${a.store} state=${a.state}` };
    }
    if (it.kind === "store") {
      if (!it.store) return { verdict: "UNJUDGED", why: "unknown store " + it.name };
      const routed = d && d.destination && d.destination.kind === "store" && d.destination.key === it.store;
      if (a.store !== it.store && !routed) return { verdict: "FAIL", why: `store key ${a.store || "None"} (want ${it.store})` };
      const own = cards.slice(0, 5).filter((c) => c.store === it.store).length;
      if (lane && own >= Math.min(4, cards.length)) return { verdict: "PASS", why: "store key + its own products lead" };
      return { verdict: (a.lanes || []).some((l) => l.key === "tienda:" + it.store) ? "WEAK" : "FAIL", why: "store key, first lane " + (lane ? lane.key : "none") };
    }
    if (it.kind === "unjudged") return { verdict: "UNJUDGED", why: "no product word" };
    if (!a || a.state !== "results" || !cards.length) return { verdict: "FAIL", why: "no results" };
    const top = cards.slice(0, 5);
    const n = top.filter((c) => cardIs(it, c)).length, share = n / top.length;
    /* A lane of one or two cards is thin: WEAK at best. */
    const v = share >= 0.8 && top.length >= 3 ? "PASS" : share >= 0.4 ? "WEAK" : "FAIL";
    return { verdict: v, why: `${n}/${top.length} on intent; first lane ${lane ? lane.key : "grid"}` };
  }
  return { judge, intentOf };
}

/* ---------- the run ---------- */
async function main() {
  const search = await import("../netlify/functions/search.js");
  const core = await import("../netlify/functions/_search-core.js");
  const ctx = core.loadSearch({ labels: search.LABELS });
  const { judge } = makeJudge(ctx, search.LABELS);
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const call = async (qs) => JSON.parse((await search.handler({ httpMethod: "GET", queryStringParameters: qs }, { fetchImpl })).body);
  const only = arg("--only") ? new Set(arg("--only").split(",").map((x) => x.trim().toLowerCase())) : null;
  const rows = loadAudit().filter((r) => !only || only.has(r.term.toLowerCase()));
  let out = [];
  /* --rejudge f.json: judge a saved run again (the judge changed, not the search). */
  if (arg("--rejudge")) {
    out = JSON.parse(readFileSync(arg("--rejudge"), "utf8"));
    const byTerm = new Map(rows.map((r) => [r.file + "|" + r.term + "|" + r.expected_intent, r]));
    for (const x of out) {
      const a = { ...x.a, lanes: x.a.lanes.concat(x.a.laneKeys.slice(1).map((key) => ({ key, items: [] }))) };
      Object.assign(x, judge(byTerm.get(x.file + "|" + x.term + "|" + x.intent) || { expected_intent: x.intent }, a, x.d));
      x.verdict = x.verdict;
    }
  }
  for (const r of arg("--rejudge") ? [] : rows) {
    const a = await call({ q: r.term });
    const d = await call({ q: r.term, route: "1" });
    const j = judge(r, a, d);
    const lane = a.lanes && a.lanes[0];
    out.push({ file: r.file, wave: r.wave, term: r.term, intent: r.expected_intent, recorded: r.verdict, verdict: j.verdict, why: j.why,
      store: a.store || null, total: a.total, canonical: a.canonical || null, didYouMean: a.didYouMean || null,
      dest: d.destination ? `${d.destination.kind}:${d.destination.key || ""}` : null,
      lead: lane ? lane.key + " | " + lane.items.slice(0, 3).map((c) => c.title).join(" / ") : "",
      a: { state: a.state, store: a.store || null, lanes: (a.lanes || []).slice(0, 1).map((l) => ({ key: l.key, items: l.items.slice(0, 5).map((c) => ({ brand: c.brand, title: c.title, category: c.category, store: c.store })) })),
        laneKeys: (a.lanes || []).map((l) => l.key), items: (a.items || []).slice(0, 5).map((c) => ({ brand: c.brand, title: c.title, category: c.category, store: c.store })) },
      d: { destination: d.destination ? { kind: d.destination.kind, key: d.destination.key || null } : null } });
  }
  const rate = (xs, k) => { const j = xs.filter((x) => x[k] !== "UNJUDGED"); return j.length ? (100 * j.filter((x) => x[k] === "PASS").length / j.length).toFixed(1) : "-"; };
  console.log("wave  rows  recorded-PASS%  judged-PASS%  judged WEAK/FAIL  agreement-with-recorded");
  for (const w of [1, 2]) {
    const xs = out.filter((x) => x.wave === w);
    if (!xs.length) continue;
    const j = xs.filter((x) => x.verdict !== "UNJUDGED");
    const agree = (100 * j.filter((x) => x.verdict === x.recorded).length / (j.length || 1)).toFixed(1);
    console.log(`  ${w}   ${String(xs.length).padStart(4)}   ${rate(xs, "recorded").padStart(6)}         ${rate(xs, "verdict").padStart(6)}        ${j.filter((x) => x.verdict === "WEAK").length}/${j.filter((x) => x.verdict === "FAIL").length}            ${agree}%`);
  }
  if (arg("--rows")) for (const x of out.filter((x) => x.verdict === arg("--rows"))) console.log(`${x.verdict}\t${x.term}\t[${x.intent}]\t${x.why}\t${x.lead.slice(0, 140)}`);
  if (arg("--out")) writeFileSync(arg("--out"), JSON.stringify(out, null, 1));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
