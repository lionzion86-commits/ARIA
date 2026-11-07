#!/usr/bin/env node
/* ==================================================================
   SEARCH REACH, MEASURED (#443 c.6693598650 §3, c.6709315389).

   The Nov 6 audit's terms, each run the way a shopper's search runs on
   ariashop.pe, in process, through the real functions:
     1. /api/search?route=1&q=  (netlify/functions/search.js): where the
        search lands -- a store, a brand, a category page, or the chooser;
     2. the landing's own endpoint -- department.js for a category page
        (the same ?dept=&ver=&pt= departamento.html asks for), tienda.js
        for a store -- and its count: what the shopper can reach;
     3. the landing's first rails, every card's title read against the
        term's kind: what does not belong is contamination;
     4. /api/search?q= (the results answer, search.html?resultados=1).
   A chooser (the honest empty) reports its heading and each rail's
   label and cards.

     node scripts/search-reach-audit.mjs                      this tree, printed
     node scripts/search-reach-audit.mjs --out f.json         and written
     node scripts/search-reach-audit.mjs --before main.json --out reports/search-reach-2026-11-07.json
         (main.json: this script's --out run on a checkout of main)
   ================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const { handler: search } = await import(join(ROOT, "netlify/functions/search.js"));
const { handler: department } = await import(join(ROOT, "netlify/functions/department.js"));
const { handler: tienda } = await import(join(ROOT, "netlify/functions/tienda.js"));

/* term, the shelf the audit measured (its words), what a card must be. */
export const TERMS = [
  ["perfumes", "Fragancia, 11,217", /perfum|parfum|cologne|colonia|toilette|fragranc|fragancia|eau de|mist|body spray|brume|edp|edt|splash|aftershave|after shave|desodorante|deodorant|gel de ducha|shower gel|loci[oó]n|lotion|crema corporal|body cream|afeitado|set|gift|estuche|tester|mini/i],
  ["carteras", "Carteras, 3,805", /handbag|purse|crossbody|cross body|cross-body|shoulder|tote|clutch|satchel|hobo|bucket|top handle|top-handle|wristlet|baguette|bag|cartera|bolso/i],
  ["poleras", "hoodie/sweatshirt, 2,136", /hood|sweat|pullover|crew|fleece|zip|polero|polera|sudadera/i],
  ["polera", "hoodie/sweatshirt, 2,136", /hood|sweat|pullover|crew|fleece|zip|polero|polera|sudadera/i],
  ["champú", "shampoo, 383", /shampoo|conditioner|co-?wash|champ|acondicion/i],
  ["keratina", "keratin, 81", /kerat|queratin/i],
  ["lencería", "Ropa interior family, 4,941", /bra|bustier|shapewear|shaping|brief|boyshort|hiphugger|panty|panties|thong|lingerie|lencer|bralette|brief|bodysuit|teddy|slip|chemise|corset|garter|hipster|bikini|cheeky|boyshort|string|camisole|babydoll/i],
  ["zapatos", "footwear, 11,903", /shoe|sneaker|boot|sandal|slide|heel|pump|loafer|mule|clog|flat|slipper|trainer|cleat|wedge|oxford|derby|espadrille|moccasin|zapat|bota|flip|runner|chancla|crocs|cleat|future|ultra|predator|mercurial|phantom|copa|tiempo|dunk|jordan|samba|gazelle|air max|ugg/i],
  ["botas", "boots, 949", /boot|bota|botin|chelsea|chukka|wellie/i],
  ["consola", "consolas, 632 (word count)", /playstation|ps5|xbox|switch|steam deck|rog ally|legion go/i],
  ["celular", "celulares, 734 (word count)", /phone|galaxy|iphone|pixel|moto|unlocked|5g|smartphone|celular|blackberry|android|gb/i],
  ["pesas", "Pesas type, ~366", null],
  ["mancuernas", "Pesas type, ~366", null],
  ["chort", "shorts, 7,267", /short|bermuda/i],
  ["shor", "shorts, 7,267", /short|bermuda/i],
  ["swetshert", "sweatshirt", /hood|sweat|pullover|crew|fleece|zip|polero|polera|sudadera/i],
  ["hudi", "hoodie, 3,884", /hood|sweat|pullover|crew|fleece|zip|polero|polera|sudadera/i],
  ["youg la", "YoungLA, 800", null],
  ["victoria secret sales", "Victoria's Secret, 934", null],
  ["zapatillas de voley", "volleyball shoes, 0", null],
];
const EVENT = (qs) => ({ httpMethod: "GET", queryStringParameters: qs });
const noFx = async () => { throw new Error("offline"); };
const call = async (h, qs, opts) => JSON.parse((await h(EVENT(qs), opts)).body);
const paramsOf = (url) => Object.fromEntries(new URLSearchParams(String(url).split("?")[1] || ""));

export async function measure(term, kind) {
  const route = await call(search, { route: "1", q: term }, { fetchImpl: noFx });
  const d = route.destination || {};
  const row = { term, landing: d.kind, label: d.label, url: d.url };
  if (d.kind === "category" && /^departamento\.html/.test(d.url)) {
    const qs = paramsOf(d.url);
    const head = await call(department, qs);
    /* Ropa Interior's two halves are their own page (departamento.html
       sends them to ropa-interior.html), drawn from its feed. */
    const feed = { ropa_interior_mujer: "ropa-interior-women-feed.json", ropa_interior: "ropa-interior-feed.json" }[qs.dept];
    if (head.error && feed) {
      const f = JSON.parse(readFileSync(join(ROOT, feed), "utf8"));
      row.page = "ropa-interior.html#" + (qs.dept === "ropa_interior" ? "hombre" : "mujer");
      row.count = (f.items || []).length;
      /* the page's type rails (bras, panties, shapewear ...) before its hosiery */
      const under = (f.items || []).filter((c) => c.ty === "underwear");
      row.underwear = under.length;
      const cards = under.slice(0, 36).map((c) => String(c.title || c.name || c.t || ""));
      row.sampled = cards.length;
      row.foreign = kind ? cards.filter((t) => !kind.test(t)) : [];
      row.lead = cards.slice(0, 4);
    } else if (head.error) { row.count = null; row.note = head.error; }
    else {
      row.count = head.count;
      const cards = (head.rails || []).slice(0, 3).flatMap((r) => r.items || r.cards || []).map((c) => String(c.title || c.t || ""));
      row.sampled = cards.length;
      row.foreign = kind ? cards.filter((t) => !kind.test(t)) : [];
      row.lead = cards.slice(0, 4);
    }
  } else if (d.kind === "store") {
    const qs = paramsOf(d.url);
    /* tienda.html's own ask: the store, its words, its railed view. */
    const body = await call(tienda, { store: qs.tienda, ...(qs.q ? { q: qs.q } : {}), group: "1" });
    row.count = body.total ?? null;
    row.lead = (body.groups || []).flatMap((g) => g.items || []).slice(0, 4).map((c) => String(Array.isArray(c) ? c[0] : c.title || c.n || ""));
  } else if (d.kind === "chooser") {
    const c = route.chooser || {};
    row.chooser = { reason: c.reason, title: c.title, sub: c.sub, rails: (c.rails || []).map((r) => ({ label: r.label, url: r.url, items: (r.items || []).slice(0, 4).map((i) => i.title) })) };
    row.count = 0;
  }
  const res = await call(search, { q: term }, { fetchImpl: noFx });
  row.results = { state: res.state, total: res.total, capped: !!res.capped, sense: res.sense || null };
  return row;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const before = arg("--before") ? JSON.parse(readFileSync(arg("--before"), "utf8")) : null;
  const rows = [];
  for (const [term, shelf, kind] of TERMS) {
    const r = await measure(term, kind);
    r.shelf = shelf;
    const b = before && (before.after || before.rows || []).find((x) => x.term === term);
    rows.push(before ? { term, shelf, before: b || null, after: r } : r);
    const now = r, was = b;
    console.log(`«${term}»`.padEnd(26) + (was ? `${String(was.count ?? "-").padStart(6)} (${was.landing} ${was.label || ""}) -> ` : "") +
      `${String(now.count ?? "-").padStart(6)} ${now.landing} ${now.label || ""}${now.foreign && now.foreign.length ? `  FOREIGN ${now.foreign.length}/${now.sampled}` : ""}`);
  }
  const out = arg("--out");
  if (out) {
    const doc = before
      ? { generated: new Date().toISOString().slice(0, 10), how: "scripts/search-reach-audit.mjs: /api/search?route=1 -> the landing's own endpoint (department.js / tienda.js), in process; before = main, after = this branch", rows }
      : { generated: new Date().toISOString().slice(0, 10), after: rows };
    writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
    console.log("wrote " + out);
  }
}
