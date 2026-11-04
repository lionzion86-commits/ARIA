/* ==================================================================
   STORE-SHIPPING AUDIT (#443 c.6620628148, Danny): what checkout's
   «Envío de la tienda» row shows for EVERY active store, on an
   under-threshold cart and an over-threshold cart, through the real
   code path (/store-shipping.js cartShipping + standingOf, and
   /store-carrier.js optionsFor for a group-1 store's standard option),
   with the fee expression of checkout.html renderStoreShipping (pinned
   to its source by scripts/test/store-shipping-audit-tests.mjs).

     node scripts/store-shipping-audit.mjs --root <dir> --json
        one tree's checkout rows, as JSON (a snapshot of an older commit
        works: store-carrier.js is optional)
     node scripts/store-shipping-audit.mjs --before <dir> [--pre630 <dir>]
        writes data/store-shipping-audit-2026-11-04.md: <dir> is the tree
        before the fix (origin/main), --pre630 the tree before #630.
   ================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* The active stores: every retailer in the search index, plus every store
   on Lucifer's carrier matrix (bestbuy is there with no indexed row). */
export function activeStores(root) {
  const idx = JSON.parse(readFileSync(path.join(root, "assets/search/catalog-index.json"), "utf8"));
  const ri = idx.fields.indexOf("retailer");
  const live = new Set(idx.rows.map((r) => r[ri]));
  const termsFile = path.join(root, "data/store-shipping-terms.json");
  const terms = existsSync(termsFile) ? JSON.parse(readFileSync(termsFile, "utf8")).stores : {};
  return { stores: [...new Set([...live, ...Object.keys(terms)])].sort(), live, terms };
}

/* The two carts: half the free line (or US$ 30 with none) and US$ 20 over
   it (or US$ 300), in the store's own prices. */
export function cartsFor(rule) {
  const t = rule && rule.freeOverUsd > 0 ? rule.freeOverUsd : null;
  return { underUsd: t ? Math.round(t * 50) / 100 : 30, overUsd: t ? t + 20 : 300 };
}

/* checkout.html renderStoreShipping, no tier picked (the default):
     fee = !st.rule || st.pending ? 'POR CALCULAR' : st.feeUsd > 0 ? `US$ ${st.feeUsd.toFixed(2)}` : 'GRATIS' */
export function checkoutFeeLabel(st) {
  return !st.rule || st.pending ? "POR CALCULAR" : st.feeUsd > 0 ? `US$ ${st.feeUsd.toFixed(2)}` : "GRATIS";
}

export function rowFor(S, C, store, subUsd) {
  const rate = S.salesTaxRateOf(store);
  const line = { retailer: store, priceUsd: subUsd, dutiableUsd: Math.round(subUsd * rate * 100) / 100, qty: 1 };
  const st = S.cartShipping([line]).stores[0];
  const fee = checkoutFeeLabel(st);
  const sub = st.rule ? S.ruleText(store) : "Envío en EE.UU.: lo calcula la tienda al pagar";
  let standardOption = null;
  if (C && C.hasOptions(store)) {
    const o = C.optionsFor(store, st.subtotalUsd, st)[0];
    standardOption = o.priceText;
  }
  return { fee, sub, standardOption, chargedUsd: st.feeUsd };
}

export async function auditTree(root) {
  const carrierLib = path.join(root, "scripts/lib/store-carrier.js");
  if (existsSync(carrierLib)) await import(pathToFileURL(carrierLib).href);
  await import(pathToFileURL(path.join(root, "scripts/lib/store-shipping.js")).href);
  const S = globalThis.AriaStoreShipping, C = existsSync(carrierLib) ? globalThis.AriaStoreCarrier : null;
  const { stores, live, terms } = activeStores(root);
  const out = {};
  for (const k of stores) {
    const r = S.ruleOf(k);
    const carts = cartsFor(r);
    out[k] = {
      live: live.has(k),
      rule: r ? { feeUsd: r.feeUsd, feeLadder: r.feeLadder || null, freeOverUsd: r.freeOverUsd, source: r.source, note: r.note || null } : null,
      carts,
      under: rowFor(S, C, k, carts.underUsd),
      over: rowFor(S, C, k, carts.overUsd),
      group: terms[k] ? terms[k].group : null,
      carrierClass: terms[k] ? terms[k].carrierClass : null,
    };
  }
  return out;
}

/* Stores Lucifer's sweeps marked VARIES: the store's own policy prices the
   standard parcel at its checkout (by product, ZIP or weight) and publishes
   no flat fee (#443 c.6524139671, c.6524803125). Still missing a number --
   a mock Miami checkout can read one -- but not an oversight. */
export const PUBLISHED_AS_CALCULATED = [
  "advanceauto", "brandsmart", "combatcorner", "crateandbarrel", "ezpz", "mainland", "microcenter",
  "mushie", "nautilus", "parrot", "pier1", "quietstorm", "sleekshop", "venum", "zumiez",
];

/* ---------- the markdown ---------- */
const money = (n) => "$" + (Number(n) % 1 === 0 ? String(n) : Number(n).toFixed(2));
function capturedText(a, t) {
  const r = a.rule;
  const parts = [];
  if (!r) parts.push("no está en STORE_SHIPPING");
  else if (r.freeOverUsd === 0) parts.push("gratis siempre");
  else {
    const fee = r.feeLadder ? r.feeLadder.map((x) => money(x.feeUsd) + " <" + money(x.underUsd)).join(", ") : r.feeUsd == null ? "fee not captured" : money(r.feeUsd);
    parts.push(fee + (r.freeOverUsd == null ? ", no free line" : " / free from " + money(r.freeOverUsd)));
  }
  if (r && r.note) parts.push("note: " + r.note);
  if (t) parts.push("carrier: " + t.carrierClass + (t.group ? " (group " + t.group + ")" : ""));
  return parts.join("; ");
}
const show = (x) => x.fee + (x.standardOption && x.standardOption.toLowerCase() !== x.fee.toLowerCase() ? " [std option: " + x.standardOption + "]" : "");

function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  if (args.includes("--json")) {
    auditTree(path.resolve(opt("--root") || HERE)).then((o) => process.stdout.write(JSON.stringify(o)));
    return;
  }
  const run = (root) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--root", root, "--json"], { maxBuffer: 64 << 20 }).toString());
  const before = run(path.resolve(opt("--before")));
  const head = run(HERE);
  const pre = opt("--pre630") ? run(path.resolve(opt("--pre630"))) : null;
  const terms = JSON.parse(readFileSync(path.join(HERE, "data/store-shipping-terms.json"), "utf8")).stores;
  const rows = [], missing = [], counts = { fee: 0, gratis: 0, threshold: 0, calculated: 0, fixed: 0, partlyFixed: 0, missing: 0 };
  const regress = [];
  for (const k of Object.keys(head).sort()) {
    const a = head[k], b = before[k] || null;
    const wasCalc = !b || b.under.fee === "POR CALCULAR" || b.over.fee === "POR CALCULAR";
    const changed = b && (b.under.fee !== a.under.fee || b.over.fee !== a.over.fee);
    let status;
    if (a.under.fee.startsWith("US$")) { counts.fee++; status = "real fee"; }
    else if (a.under.fee === "GRATIS" && a.over.fee === "GRATIS") { counts.gratis++; status = "always free"; }
    else if (a.under.fee === "POR CALCULAR") {
      const pub = PUBLISHED_AS_CALCULATED.includes(k);
      if (pub) counts.calculated++; else counts.missing++;
      if (a.over.fee === "GRATIS") counts.threshold++;
      missing.push(k);
      status = pub ? "STILL MISSING: published as calculated at checkout" : "STILL MISSING: no fee ever captured";
    } else status = "?";
    if (changed && wasCalc) {
      if (a.under.fee === "POR CALCULAR") counts.partlyFixed++; else counts.fixed++;
      status = a.under.fee === "POR CALCULAR" ? "PARTLY FIXED: threshold wired (GRATIS over it); under it " + status : "FIXED: " + status;
    }
    if (pre && pre[k] && b && (pre[k].under.fee !== b.under.fee || pre[k].over.fee !== b.over.fee)) regress.push(k);
    rows.push(`| ${k}${a.live ? "" : " (not in the search index)"} | ${a.carts.underUsd} / ${a.carts.overUsd} | ${b ? show(b.under) + " / " + show(b.over) : "-"} | ${capturedText(a, terms[k])} | ${show(a.under)} / ${show(a.over)} | ${status} |`);
  }
  const md = `# Store-shipping audit, 2026-11-04 (#443 c.6620628148)

What checkout's «Envío de la tienda» row shows for every active store (${rows.length}: the search index plus the carrier matrix), on an under-threshold cart and an over-threshold cart, computed through the real code path: /store-shipping.js \`cartShipping\` and /store-carrier.js \`optionsFor\` (a group-1 store's standard option), with checkout.html \`renderStoreShipping\`'s fee expression. Generated by \`node scripts/store-shipping-audit.mjs --before <origin/main tree> --pre630 <3001013 tree>\`; pinned by scripts/test/store-shipping-audit-tests.mjs.

Captured data compared: STORE_SHIPPING (feeUsd, freeOverUsd, source), data/store-shipping-terms.json and data/usps-carrier-matrix-2026-11-03.md (standard tier, paid tiers, each row's quoted policy), Lucifer's Oct 30 filings (#443 c.6524139671, c.6524803125; the master table itself, shipping-rules-master-2026-10-30.md, is not in the repo) and git history of store-shipping.js (no captured fee was ever dropped; the only removed fees were superseded by Lucifer's corrections in b79c992).

## Summary

- Real fee shown on the under-threshold cart: **${counts.fee}**
- Always free (GRATIS on both carts): **${counts.gratis}**
- «POR CALCULAR» under the threshold, published as calculated at the store's checkout (Lucifer: VARIES): **${counts.calculated}**
- «POR CALCULAR» under the threshold, no fee ever captured: **${counts.missing}**
- of those ${counts.calculated + counts.missing}, GRATIS over a known threshold: **${counts.threshold}**
- Fixed in this change, a captured fee now shown under the threshold (was «POR CALCULAR»): **${counts.fixed}**
- Partly fixed, a captured free-shipping line now wired (GRATIS over it; the fee under it is still missing): **${counts.partlyFixed}**

## Did #630 (USPS split, de66170) change what checkout shows?

${pre ? (regress.length ? "Yes, for: " + regress.join(", ") + "." : "No. With the default (standard) option, every store's row is identical at 3001013 (before #630) and at origin/main, on both carts. #630 did not touch STORE_SHIPPING; it only added the opt-in tier (`opts.tiers`) to `cartShipping`, the alert and the options block. The standard option of every group-1 store that has a captured fee shows that same fee; a group-1 store with no captured fee shows «se calcula en la tienda al pagar» on its standard option, as before (its row read POR CALCULAR before #630 too).") : "(not computed)"}

## Conflicts for Danny / Lucifer (left as they are)

- ariaperfumes: STORE_SHIPPING $6.95 / free from $49 (FragranceX customer-service page, #443 c.6568051694, Danny); the carrier matrix row reads "free over $35, otherwise $5.95". The table stands until Lucifer re-reads the page.
- silviatcherassi: STORE_SHIPPING free from $500 (product pages + terms); the matrix row reads "complimentary ground standard shipping on U.S. orders". Left at $500, under it «por calcular».
- hatch: the store publishes Economy $8 (4-7 days) and Standard $12 (3-5 days), no free line. Wired at Economy $8, its base option (the buyer selects Economy); Danny may prefer Standard $12.
- fuji: stays off the table (its own pages read $125 and $150, #443 c.6568736516).

## Still missing: Lucifer's mock Miami 33166 checkouts (${missing.length})

For each: the exact under-threshold standard fee (a small parcel, one item), every option with its price, and the carrier of the standard / free option.

${missing.map((k) => "- " + k + (PUBLISHED_AS_CALCULATED.includes(k) ? " (policy: calculated at checkout)" : "")).join("\n")}

## Venum

STORE_SHIPPING: free from $75, fee \`null\` (Lucifer, #443 c.6524803125: "policy: product-based, calculated at checkout"). The carrier matrix row: "The courier for your order is selected by the 3PL"; FedEx Home Delivery listed; PO Boxes via USPS; no selectable faster option. No other file in data/, docs/, reports/ or hidden-docs/, and no commit in history, holds a Venum under-$75 fee. Checkout shows «POR CALCULAR» under $75 and GRATIS from $75; nothing is charged for Venum under $75. A live mock checkout cannot run from the build sandbox (retailer sites are blocked), so no number was read here.

Lucifer's mock Miami 33166 checkout must capture: (a) the exact standard fee on a cart under $75 (one pair of gloves, about $40-60), with the subtotal it was read at; (b) every shipping option Venum offers at that checkout, its name, speed and price; (c) the carrier of the free shipping from $75 (and of the paid standard, if different).

The record that takes Lucifer's numbers is in store-shipping.js (\`venum\`): set \`feeUsd\` to the observed fee and cite the checkout; any paid option goes in the matrix row (paid alternative) and \`npm run build:store-carrier\` (scripts/build-store-carrier.mjs) regenerates the tiers.

## Every store

Carts are in the store's own prices (US$). Shows: under cart / over cart; [std option] is the group-1 standard option's price when it differs.

| Store | Carts | Checkout before this fix (origin/main 50c3f92) | Captured data | Checkout now | Status |
|---|---|---|---|---|---|
${rows.join("\n")}
`;
  writeFileSync(path.join(HERE, "data/store-shipping-audit-2026-11-04.md"), md);
  console.log(JSON.stringify({ counts, missing, regress }, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
