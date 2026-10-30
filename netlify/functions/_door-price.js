/* ============================================================
   THE DOOR PRICE OF ONE PRODUCT -- what checkout charges for it,
   bought alone (2026-10-19, #416 comparison block).

   The comparison block puts the same product from several stores side
   by side, and the number that decides the fight is what reaches the
   shopper's door: the card price, the freight, the import tax and the
   small-order fee. Nothing here is a new formula. Each step is the
   function checkout and orders-create.js already call, in the order
   orders-create.js calls them:

     the cart line      exactly what producto.html's "Agregar al carrito"
                        writes (the comparison rows link there): the card
                        price, the dutiable base (raw x the store's sales
                        tax), and an estimated weight checkout re-resolves;
     weight             resolveCartWeights() -- the server resolver
                        checkout and orders-create use; a weight it does
                        not believe (needsReview) means checkout refuses
                        to quote, and so does this: "por confirmar";
     freight            freightFloorUsd(): resolved kg x CHARGE_PER_KG
                        ($13/kg, the published rate; the live courier
                        quote is rescaled to the same rate);
     import tax         importTaxEstimateUsd(dutiable FOB, freight);
     small-order fee    smallOrderFeePen((goods + freight) in soles);
     total              (goods + freight + tax) x venta + fee, rounded the
                        way orders-create.js rounds it.

   Consolidated shipping (the default, free) and a Lima address: the
   express fee and the provincia leg are choices made at checkout, not
   properties of the product.

   scripts/test/comparison-tests.mjs pins this to the same helpers.
   ============================================================ */
import { resolveCartWeights } from "./_weight-resolve.js";
import { cartShipping } from "../../scripts/lib/store-shipping.js";
import { freightFloorUsd } from "./_checkout-model.js";
import {
  CHARGE_PER_KG, importTaxEstimateUsd, dutiableBaseUsd, smallOrderFeePen,
  SMALL_ORDER_THRESHOLD_PEN, SMALL_ORDER_FEE_PEN,
} from "../../weight-data.js";

const r2 = (n) => Math.round(Number(n) * 100) / 100;

export { SMALL_ORDER_THRESHOLD_PEN, SMALL_ORDER_FEE_PEN };

/**
 * The cart line producto.html writes for this product (see its
 * addToCart: priceUsd, dutiableUsd = raw x salesTaxRate, weightKg 0.2
 * marked estimated, brand). `cardUsd` is the card price; `rawUsd` the
 * store's own price before Aria's margin, when known.
 */
export function cartLineFor({ retailer, title, brand, cardUsd, rawUsd, taxRate }) {
  const raw = Number(rawUsd);
  return {
    retailer: String(retailer || ""),
    title: String(title || ""),
    priceUsd: r2(cardUsd),
    /* A sale-feed row has no raw price: dutiableBaseUsd() reverses the
       card price, as orders-create.js does for an unstamped line. */
    dutiableUsd: raw > 0 ? r2(raw * (Number(taxRate) || 1)) : undefined,
    weightKg: 0.2,
    weightEstimated: true,
    brand: String(brand || ""),
    qty: 1,
  };
}

/**
 * Door price of one cart line, bought alone. `fx` is the venta rate
 * (soles per dollar); without it only the dollar figures come back and
 * the page converts (search.html's withSoles).
 */
export function doorPrice(line, fx) {
  const w = resolveCartWeights([line]);
  const it = w.items[0] || {};
  const goodsUsd = r2(Number(line.priceUsd) || 0);
  if (w.needsReview || !(w.totalKg > 0)) {
    /* Checkout would refuse to quote this weight: no total is shown. */
    return { quotable: false, goodsUsd, kg: w.totalKg || null, weightSource: it.source || null, usd: null, pen: null };
  }
  const freightUsd = freightFloorUsd(undefined, w.totalKg, CHARGE_PER_KG);
  const dutiable = dutiableBaseUsd(line.priceUsd, line.dutiableUsd);
  const taxUsd = importTaxEstimateUsd(Number.isFinite(dutiable) ? dutiable : 0, freightUsd);
  /* The store's own shipping to Miami, bought alone (#443 c.6511807569):
     checkout charges it, so the door price carries it. */
  const shippingUsd = cartShipping([line]).totalUsd;
  const usd = r2(goodsUsd + freightUsd + taxUsd + shippingUsd);
  /* The small-order fee is decided on goods + freight in soles. */
  const baseUsd = r2(goodsUsd + freightUsd);
  const rate = Number(fx) > 0 ? Number(fx) : null;
  const feePen = rate ? smallOrderFeePen(r2(baseUsd * rate)) : null;
  return {
    quotable: true,
    goodsUsd, freightUsd, taxUsd, shippingUsd, usd, baseUsd,
    kg: w.totalKg,
    weightSource: it.source || null,
    feePen,
    pen: rate ? r2(usd * rate + feePen) : null,
  };
}

/** Soles for a door price computed without a rate (the page's fallback). */
export function doorPen(door, fx) {
  if (!door || !door.quotable || !(fx > 0)) return null;
  return r2(door.usd * fx + smallOrderFeePen(r2(door.baseUsd * fx)));
}
