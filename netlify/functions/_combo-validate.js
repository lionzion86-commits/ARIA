/* BUNDLE-DISCOUNT VALIDATION (2026-09-27).

   The browser builds bundle-discount cart lines, but money is decided
   here. Every such line must:

     1. name a REAL combo id from combo-deals.js (the same file the
        shopper's page loaded — imported directly, not copied);
     2. carry EXACTLY that combo's savingUsd as a negative priceUsd;
     3. sit beside enough complete product pairs to earn it, with the
        discount qty equal to the number of complete pairs;
     4. carry no weight and no dutiable stamp (it is a saving, not goods).

   Anything else is rejected outright — never silently adjusted — so a
   tampered request cannot buy a bigger saving than the combos allow.
   Pure function: no I/O, unit-tested in scripts/test/run-tests.mjs. */

import { COMBO_DEALS } from "../../combo-deals.js";

/* Mirrors the page's cartItemKey(): retailer + title + size, joined. */
const keyOf = (it) => [it?.retailer ?? "", it?.title ?? "", it?.selectedSize || ""].join("::");

const cents = (n) => Math.round(Number(n) * 100) / 100;

export function validateBundleDiscounts(items) {
  const list = Array.isArray(items) ? items : [];
  const deals = new Map((Array.isArray(COMBO_DEALS) ? COMBO_DEALS : []).map((d) => [d?.id, d]));

  /* Qty on hand per product key, counting only real product lines. */
  const stock = new Map();
  for (const it of list) {
    if (!it || it.lineType === "bundle-discount") continue;
    const k = keyOf(it);
    stock.set(k, (stock.get(k) || 0) + Math.max(0, Math.floor(Number(it.qty) || 0)));
  }

  for (const it of list) {
    if (!it || it.lineType !== "bundle-discount") continue;
    const deal = deals.get(it.comboId);
    if (!deal) {
      return { ok: false, error: `Combo desconocido: ${String(it.comboId ?? "").slice(0, 40)}` };
    }
    const want = cents(deal.savingUsd);
    if (!(want > 0) || cents(it.priceUsd) !== -want) {
      return { ok: false, error: `El descuento del combo ${deal.id} no coincide con la oferta publicada.` };
    }
    const pairs = Math.min(...deal.items.map((p) => stock.get(keyOf(p)) || 0));
    const qty = Math.max(0, Math.floor(Number(it.qty) || 0));
    if (!(pairs >= 1) || qty !== pairs) {
      return { ok: false, error: `El descuento del combo ${deal.id} no coincide con los productos del pedido.` };
    }
    if (Number(it.weightKg) !== 0 || Number(it.dutiableUsd) !== 0) {
      return { ok: false, error: `El descuento del combo ${deal.id} trae valores inválidos.` };
    }
  }
  return { ok: true };
}
