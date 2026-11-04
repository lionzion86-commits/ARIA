#!/usr/bin/env node
/* ============================================================
   STORE CARRIER METADATA <- data/usps-carrier-matrix-*.md
   (#443 c.6612459871 + addendum c.6612548967, Danny, 2026-11-03)

   WHY: Aria's own Victoria's Secret order shipped USPS, was marked
   delivered and was not received -- USPS holds packages and drops them in
   weekly batches. Customers must see that BEFORE they buy. Lucifer's
   matrix classifies every store from its own published US shipping
   policy (cited sources). This script turns that matrix into data:

     data/store-shipping-terms.json   the record (diffable, reviewable)
     store-carrier-data.js            the same object as a classic script
                                      (window.AriaStoreCarrierData) for the
                                      pages and, via scripts/lib, the server

   Per store: carrierClass (usps | mixed | non-usps | unknown), group (1-5),
   carrierNote, paidAlternative (verbatim), source, the standard tier
   (name + speed as the matrix states them), every paid tier (name, speed
   in business days, price rule), buyerNote, and quotedWindow (the
   store -> Miami window Aria already shows, from
   scripts/lib/retailer-delivery.js; else the standard speed the matrix
   quotes; else null -- never invented).

   PRICE RULES (what a tier costs, exactly as the matrix prints it):
     { kind: "flat", usd }
     { kind: "byOrder", thresholdUsd, under: <rule>, atOrOver: <rule> }
        e.g. VS 3-Day "$16 (orders <$50) / $8 ($50+)"
     { kind: "percent", pct }            (Crocs: 12.5% of order total)
     { kind: "adder", usd }              on top of the standard fee (Ancora +$12)
     { kind: "store", text }             the store prices it at its own
                                         checkout: rendered "se calcula en
                                         la tienda al pagar", never a number,
                                         never $0
     freeOverUsd on a tier: free above that order total ("free 2-day/3-day
     on orders >$200").

   RE-RUNNABLE: a matrix update (UNKNOWN stores verified later) is the same
   command; every store is re-derived from its row.

     node scripts/build-store-carrier.mjs            write both files
     node scripts/build-store-carrier.mjs --check    exit 1 if stale
     node scripts/build-store-carrier.mjs --report   print the parsed tiers
     node scripts/build-store-carrier.mjs --matrix data/<file>.md
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const REPORT = args.includes("--report");
const mi = args.indexOf("--matrix");
const matrixFile = mi >= 0 ? args[mi + 1]
  : "data/" + readdirSync(join(ROOT, "data")).filter((f) => /^usps-carrier-matrix-\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().pop();
const MD = readFileSync(join(ROOT, matrixFile), "utf8").replace(/\r\n/g, "\n");

/* ---------- the store registry (to map matrix slugs onto Aria's keys) ---------- */
const { RETAILERS } = await import(join(ROOT, "scripts/lib/retailers.js"));
const tiendaHtml = readFileSync(join(ROOT, "tienda.html"), "utf8");
const STORES = JSON.parse(/\nvar STORES = (\{.*\});\r?\n/.exec(tiendaHtml)[1]);
const KNOWN = new Set([...Object.keys(RETAILERS), ...Object.keys(STORES)]);
const { RETAILER_DELIVERY } = await import(join(ROOT, "scripts/lib/retailer-delivery.js"));

/* ---------- table rows, by section ---------- */
function cells(line) {
  const c = line.split("|").map((s) => s.trim());
  return c.slice(1, c.length - 1);
}
const rows = [];
let section = null;
for (const line of MD.split("\n")) {
  const h = /^## (Group (\d)|Removed)\b/.exec(line);
  if (h) { section = h[2] ? Number(h[2]) : "removed"; continue; }
  if (/^## /.test(line)) { section = null; continue; }
  if (!section || !/^\|/.test(line)) continue;
  const c = cells(line);
  if (c.length < 7 || c[0] === "Store" || /^-+$/.test(c[0])) continue;
  rows.push({ section, name: c[0], slug: c[1], classRaw: c[2], upgrade: c[3], detail: c[4], alt: c[5], source: c[6] });
}

function classOf(raw) {
  const r = String(raw).toUpperCase();
  if (/^USPS/.test(r)) return "usps";
  if (/^MIXED/.test(r)) return "mixed";
  if (/^NON-USPS/.test(r)) return "non-usps";
  return "unknown";
}

/* ---------- helpers: depth-aware splitting ---------- */
function splitTop(s, seps) {
  const out = []; let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const sep = seps.find((x) => s.startsWith(x, i));
      if (sep) { out.push(cur); cur = ""; i += sep.length - 1; continue; }
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const num = (s) => Number(String(s).replace(/,/g, ""));

/* Business days a tier name or its parenthetical states. */
function daysOf(text) {
  const t = String(text);
  let m = /(\d+)\s*-\s*(\d+)\s*(?:business |working |bus\.? )?days?/i.exec(t);
  if (m) return { min: num(m[1]), max: num(m[2]) };
  m = /up to (\d+)\s*(?:business |working )?days?/i.exec(t);
  if (m) return { min: null, max: num(m[1]) };
  m = /\b(\d+)\s*(?:business |working |bus\.? )?days?\b/i.exec(t);
  if (m && !/\d+\s*-?\s*(?:Bus\.?\s*)?Day\s+(?:Express|Select|Air|Shipping|Delivery)/i.test(t)) return { min: num(m[1]), max: num(m[1]) };
  if (/\b(Next[- ](?:Bus\.? )?Day|next business-day|Overnight|OneDay|1[- ]Day|Saturday)\b/i.test(t)) return { min: 1, max: 1 };
  if (/\b(2nd Day|Second Day|2Day|TwoDay|2[- ]Day|2 Bus\.? Day)\b/i.test(t)) return { min: 2, max: 2 };
  if (/\b(3rd Day|3[- ]Day|3 Bus\.? Day)\b/i.test(t)) return { min: 3, max: 3 };
  return null;
}

const STORE_PRICED = /not stated|no price|no fixed|not listed|no flat|calculated|shown at checkout|shown during checkout|varies|by phone|no prices|populate at checkout|depends on|quoted at checkout|rates at checkout|at current carrier rates|additional charges|additional cost|extra fee|rising to|weight-tiered|seller-set|not fixed/i;
const NOTE_SEG = /^(alternative shipping|options populate|no |FAQ |page |policy |rates? |prices? |the official|seller-set|paid delivery)/i;

/* A price fragment -> rule, or null when it states no price. */
function priceOf(text, ctx) {
  const t = String(text);
  let m = /\+\s*\$([\d.,]+)/.exec(t) || /upgrade for \$([\d.,]+)/i.exec(t);
  if (m) return { kind: "adder", usd: num(m[1]) };
  /* "$16 (orders <$50) / $8 ($50+)" */
  m = /\$([\d.,]+)\s*\(orders?\s*<\s*\$([\d.,]+)\)\s*\/\s*\$([\d.,]+)/i.exec(t);
  if (m) { ctx.threshold = num(m[2]); return { kind: "byOrder", thresholdUsd: num(m[2]), under: { kind: "flat", usd: num(m[1]) }, atOrOver: { kind: "flat", usd: num(m[3]) } }; }
  /* "$19 / $11" -- the same threshold as the tier before it */
  m = /\$([\d.,]+)\s*\/\s*\$([\d.,]+)/.exec(t);
  if (m && ctx.threshold != null) return { kind: "byOrder", thresholdUsd: ctx.threshold, under: { kind: "flat", usd: num(m[1]) }, atOrOver: { kind: "flat", usd: num(m[2]) } };
  /* "$15.99 on orders $10+ ($19.99 under $10)" */
  m = /\$([\d.,]+) on orders \$([\d.,]+)\+\s*\(\$([\d.,]+) under \$[\d.,]+\)/i.exec(t);
  if (m) return { kind: "byOrder", thresholdUsd: num(m[2]), under: { kind: "flat", usd: num(m[3]) }, atOrOver: { kind: "flat", usd: num(m[1]) } };
  /* "$14.99 on orders up to $120" (the percent above it is the next segment) */
  m = /\$([\d.,]+) on orders up to \$([\d.,]+)/i.exec(t);
  if (m) return { kind: "byOrder", thresholdUsd: num(m[2]), under: { kind: "flat", usd: num(m[1]) }, atOrOver: null };
  /* "Free ... on most orders over $49" / "free on orders $150+" */
  m = /free[^$]*?orders (?:over )?\$([\d.,]+)\+?/i.exec(t);
  if (m && /free/i.test(t)) return { kind: "byOrder", thresholdUsd: num(m[1]), under: { kind: "store" }, atOrOver: { kind: "flat", usd: 0 } };
  if (STORE_PRICED.test(t)) return null;
  m = /(?:US)?\$([\d.,]+)/.exec(t);
  if (m && !/from \$|to US?\$|-\$/i.test(t)) return { kind: "flat", usd: num(m[1]) };
  return null;
}

/* Tier names in one segment: "2nd Day and Next Day", "UPS 3 Day Select / 2nd Day Air / Next Day Air". */
function cleanName(n) {
  return String(n)
    .replace(/^(top tier|also|then)\s+/i, "")
    .replace(/^Fulfilled via [^:]+:\s*/i, "")
    .replace(/\s+(is the cheapest faster tier)\b.*$/i, "")
    .replace(/\s+(shipping options|shipping methods offered|shipping methods|options offered at checkout|options shown at checkout|options offered|tiers offered|offered\b.*|selectable|at checkout|options|at an additional charge)$/i, "")
    .replace(/\s+(options shown at checkout|at checkout|calculated at checkout|calculated)$/i, "")
    .replace(/\s+(shipping options|options)$/i, "")
    .replace(/\s*[,—-]\s*$/, "")
    .trim();
}

function parseTiers(alt) {
  const tiers = []; const notes = []; const ctx = { threshold: null };
  let freeRule = null;
  const text = String(alt).replace(/\s+/g, " ").trim();
  if (!text || text === "—") return { tiers, notes };
  /* "(free 2-day/3-day on orders >$200)" */
  const fr = /\(free ([\w\/-]+) on orders >\$([\d.,]+)\)/i.exec(text);
  if (fr) freeRule = { days: fr[1].split("/").map((d) => daysOf(d)).filter(Boolean).map((d) => d.max), overUsd: num(fr[2]) };
  const segs = splitTop(text.replace(/\(free [\w\/-]+ on orders >\$[\d.,]+\)/i, ""), [";"]);
  for (const segRaw of segs) {
    let seg = segRaw.trim();
    /* Crocs: "12.5% of order total on orders of $120 or more" completes the tier before it. */
    const pc = /^([\d.]+)% of order total on orders of \$([\d.,]+) or more/i.exec(seg);
    if (pc && tiers.length) {
      const last = tiers[tiers.length - 1];
      if (last.price && last.price.kind === "byOrder" && last.price.atOrOver == null) last.price.atOrOver = { kind: "percent", pct: num(pc[1]) };
      last.matrixText += "; " + seg;
      continue;
    }
    if (NOTE_SEG.test(seg)) { notes.push(seg); continue; }
    const [head, ...tailParts] = splitTop(seg, [" — "]);
    const tail = tailParts.join(" — ");
    /* name part = head up to its first price; keep parentheticals for days */
    const firstDollar = head.search(/\s+(?:on most orders over|free on orders|on orders over)\s+\$|(?:US)?\$|\+\s*\$|\bupgrade for\b/i);
    const namePart = firstDollar >= 0 ? head.slice(0, firstDollar) : head;
    const pricePart = firstDollar >= 0 ? head.slice(firstDollar) : "";
    const protectedList = / via /i.test(namePart) && /,/.test(namePart);
    const names = protectedList ? [namePart] : splitTop(namePart, [", then ", ", and ", " and ", " & ", " / ", ", "]);
    const freeM = /^(.*?)\s+(?:on most orders over|free on orders|on orders over)\s+\$([\d.,]+)\+?/i.exec(head);
    let price = freeM && /free/i.test(head)
      ? { kind: "byOrder", thresholdUsd: num(freeM[2]), under: { kind: "store" }, atOrOver: { kind: "flat", usd: 0 } }
      : priceOf(pricePart, ctx);
    if (!price && tail && !STORE_PRICED.test(tail) && /\$/.test(tail)) price = priceOf(tail, ctx);
    if (!price && /free[^$]*orders/i.test(head)) price = priceOf(head, ctx);
    const segDays = daysOf(pricePart) || null;
    for (const raw of names) {
      const parenM = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/.exec(raw);
      const paren = parenM ? parenM[1] : "";
      let name = cleanName(raw.replace(/\s*\(.*$/, ""));
      if (!name) continue;
      /* "Express delivery via DHL Express, FedEx, UPS, Aramex or RPX": the tier is
         "Express delivery"; the carrier list stays in the record. */
      let carriers = null;
      const via = /^(.*?) via (.+,.+)$/i.exec(name);
      if (via) { name = via[1]; carriers = via[2]; }
      /* No tier name, only a description ("Purchaser may choose from a variety
         of shipping methods"): kept, flagged, never shown as a name. */
      const named = !(name.length > 40 || /^(Purchaser|Buyer-selected)\b/i.test(name));
      const days = daysOf(paren) || daysOf(name) || (names.length === 1 ? segDays || daysOf(tail) : null);
      tiers.push({
        name: named ? name : null,
        nameRaw: name,
        named,
        carriers: carriers || undefined,
        days,
        price: price ? JSON.parse(JSON.stringify(price)) : { kind: "store" },
        usps: /\bUSPS\b|Priority Mail|First Class Mail/i.test((raw + " " + paren).replace(/\bvs\.? USPS\b/gi, "")),
        viaCustomerService: /customer service/i.test(seg),
        matrixText: seg,
      });
    }
  }
  if (freeRule) for (const t of tiers) if (t.days && freeRule.days.includes(t.days.max)) t.freeOverUsd = freeRule.overUsd;
  /* ids: stable, from the name */
  const seen = {};
  for (const t of tiers) {
    let id = (t.nameRaw || "opcion").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (seen[id]) id += "-" + (++seen[id]); else seen[id] = 1;
    t.id = id;
  }
  return { tiers, notes };
}

/* The standard tier as the matrix quotes it: its name and speed. */
function parseStandard(detail) {
  const d = String(detail);
  const m = /\b((?:Free )?(?:Standard(?: Delivery| Shipping| Ground)?|Economy|Super Saver|Free Ground|Free Standard Shipping|Standard Ground|USPS Ground Advantage|First Class Mail))\b[^;.]*?\(?(\d+)\s*-\s*(\d+)\s*(?:business |working )?days?/i.exec(d)
    || /\b(Standard(?: Delivery| Shipping)?|Economy|Basic)\b\s*(\d+)\s*-\s*(\d+)\s*days/i.exec(d);
  const cap = (x) => { const v = String(x).replace(/^free\s+(?=standard)/i, ""); return v.charAt(0).toUpperCase() + v.slice(1); };
  if (m) return { name: cap(m[1]), days: { min: num(m[2]), max: num(m[3]) } };
  const n = /\b(Standard Delivery|Standard Shipping|Standard Ground|Standard|Economy|Super Saver|Free Ground)\b/.exec(d);
  return { name: n ? cap(n[1]) : null, days: null };
}

/* ---------- build ---------- */
const stores = {};
const removed = [];
const unmapped = [];
for (const r of rows) {
  if (r.section === "removed") { removed.push({ slug: r.slug, name: r.name, note: r.detail.slice(0, 120) }); continue; }
  const slug = r.slug.toLowerCase();
  if (!KNOWN.has(slug)) unmapped.push({ slug, name: r.name });
  const carrierClass = classOf(r.classRaw);
  const { tiers, notes } = parseTiers(r.alt);
  const standard = parseStandard(r.detail);
  const rd = RETAILER_DELIVERY[slug];
  const quotedWindow = rd ? { min: rd.miamiMin, max: rd.miamiMax, plus: !!rd.plus, source: "retailer-delivery" }
    : standard.days ? { min: standard.days.min, max: standard.days.max, plus: false, source: "matrix" } : null;
  const ancora = tiers.find((t) => t.viaCustomerService);
  stores[slug] = {
    slug, name: r.name, group: r.section, carrierClass, classLabel: r.classRaw, upgrade: r.upgrade,
    carrierNote: r.detail, paidAlternative: r.alt === "—" ? null : r.alt, source: r.source,
    standardTier: { name: standard.name, days: standard.days },
    tiers: r.section === 1 ? tiers : [],
    recordedTiers: r.section === 1 ? undefined : (tiers.length ? tiers : undefined),
    tierNotes: notes.length ? notes : undefined,
    checkoutOptions: r.section === 1,
    buyerNote: ancora ? `${r.name}: «${ancora.name}» se pide por servicio al cliente de la tienda, no en su checkout (${ancora.matrixText}).` : null,
    quotedWindow,
  };
}

const out = {
  generatedFrom: matrixFile,
  generatedBy: "scripts/build-store-carrier.mjs",
  wideningDays: 5,
  counts: Object.fromEntries(["usps", "mixed", "non-usps", "unknown"].map((k) => [k, Object.values(stores).filter((s) => s.carrierClass === k).length])),
  groups: Object.fromEntries([1, 2, 3, 4, 5].map((g) => [g, Object.values(stores).filter((s) => s.group === g).length])),
  removed,
  stores,
};
const json = JSON.stringify(out, null, 2) + "\n";
const js = "/* GENERATED by scripts/build-store-carrier.mjs from " + matrixFile + " -- do not edit by hand.\n"
  + "   The same object as data/store-shipping-terms.json; read by /store-carrier.js. */\n"
  + "(function (root) { root.AriaStoreCarrierData = " + JSON.stringify(out) + "; })(typeof window !== 'undefined' ? window : globalThis);\n";

if (REPORT) {
  for (const s of Object.values(stores)) {
    if (s.group !== 1) continue;
    console.log(`${s.slug} [${s.carrierClass}] std=${JSON.stringify(s.standardTier)} win=${JSON.stringify(s.quotedWindow)}`);
    for (const t of s.tiers) console.log(`    ${t.id} | ${t.name} | ${JSON.stringify(t.days)} | ${JSON.stringify(t.price)}${t.freeOverUsd ? " free>" + t.freeOverUsd : ""}${t.usps ? " USPS" : ""}`);
  }
}
console.error(`stores ${Object.keys(stores).length} · classes ${JSON.stringify(out.counts)} · groups ${JSON.stringify(out.groups)} · removed ${removed.map((r) => r.slug).join(",")}`);
if (unmapped.length) console.error("UNMAPPED (not in scripts/lib/retailers.js or tienda.html STORES): " + unmapped.map((u) => u.slug).join(", "));
else console.error("every matrix slug maps to a store key");

const files = [["data/store-shipping-terms.json", json], ["store-carrier-data.js", js]];
if (CHECK) {
  let stale = false;
  for (const [f, body] of files) { let cur = ""; try { cur = readFileSync(join(ROOT, f), "utf8"); } catch {} if (cur !== body) { console.error("STALE: " + f); stale = true; } }
  process.exit(stale ? 1 : 0);
}
for (const [f, body] of files) writeFileSync(join(ROOT, f), body);
