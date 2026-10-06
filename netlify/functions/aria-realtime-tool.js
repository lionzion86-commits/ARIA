/* ============================================================
   THE TOOLS A VOICE MUST NOT COMPUTE IN THE BROWSER.

   Two of Aria's four realtime tools run in the page, against the
   catalogue it already holds in memory — searching is instant there
   and a round trip would be latency the shopper hears.

   These two do not, and for different reasons:

     calculate_total_delivered_price — the import-tax formula lives in
       exactly one place on purpose (importTaxEstimateUsd in
       weight-data.js; checkout.html's own comment records the day two
       copies disagreed and the tax a customer saw depended on whether
       an API call had succeeded). The page is a plain <script> and
       cannot import that module, so the number is computed here rather
       than mirrored into a third copy.

     get_order_status — a customer's order is not in the page, and the
       public tracking view is an allowlist that deliberately withholds
       the courier, their tracking number and our cost.

   THE TWO STORE TOOLS LIVE HERE TOO, for a third reason: the
   knowledge base is static prose, a few tens of kilobytes, and the
   page is a plain <script> that cannot import a module. Mirroring it
   into the page would make a second copy of the one thing that must
   never disagree with itself — what we tell a shopper a store sells.

   NOTHING HERE INVENTS A NUMBER. A missing weight, an unknown product
   or an unreachable tracker answers with `unavailable` and a sentence
   Aria can say out loud, because section 12 of the brief is absolute:
   she may say she does not know, never guess.
   ============================================================ */
import {
  importTaxEstimateUsd,
  TAX_ESTIMATE_THRESHOLD_USD,
  TAX_ESTIMATE_RATE,
} from "../../weight-data.js";
import { getStoreInfo, recommendStoresFor } from "./_store-knowledge.js";
import { decodeVinLocal } from "./_vin.js";

/* The customer-facing freight rate. Mirrored from index.html's
   CHARGE_PER_KG_USD, which is the figure quoted to shoppers; a test
   pins the two together. Our internal courier cost never appears on a
   customer-facing surface. */
const CHARGE_PER_KG_USD = 13;

const MAX_QTY = 20;

const json = (status, body) => ({
  statusCode: status,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

/**
 * The true door-to-door total, in the one place that formula lives.
 *
 * The page sends what it already knows about the product (its marked
 * price, its dutiable base, its weight) because it has them stamped at
 * pricing time; this adds the freight and the import tax and returns a
 * breakdown Aria can read aloud line by line.
 */
export function deliveredTotal({ priceUsd, dutiableUsd, weightKg, quantity = 1 }) {
  const qty = Math.min(Math.max(Math.round(Number(quantity) || 1), 1), MAX_QTY);
  const price = Number(priceUsd);
  const kg = Number(weightKg);
  if (!Number.isFinite(price) || price <= 0) {
    return { unavailable: "no tengo un precio confiable para ese producto ahorita" };
  }
  if (!Number.isFinite(kg) || kg <= 0) {
    /* Freight is charged by weight. Without one there is no honest
       total, and a guessed weight is a guessed price. */
    return { unavailable: "no tengo el peso de ese producto, así que no puedo darte el total exacto todavía" };
  }
  /* The tax base is the goods' real cost, never our marked-up price —
     stamped on the item at pricing time. If it is missing we cannot
     compute the tax honestly, so we say so rather than taxing the
     wrong number in either direction. */
  const fobEach = Number(dutiableUsd);
  if (!Number.isFinite(fobEach) || fobEach <= 0) {
    return { unavailable: "no puedo calcular los impuestos de ese producto con lo que tengo" };
  }

  const productUsd = Math.round(price * qty * 100) / 100;
  const freightUsd = Math.round(kg * qty * CHARGE_PER_KG_USD * 100) / 100;
  const fobUsd = Math.round(fobEach * qty * 100) / 100;
  const taxUsd = importTaxEstimateUsd(fobUsd, freightUsd);
  const totalUsd = Math.round((productUsd + freightUsd + taxUsd) * 100) / 100;

  return {
    quantity: qty,
    product_usd: productUsd,
    freight_usd: freightUsd,
    freight_basis: `${Math.round(kg * qty * 100) / 100} kg x $${CHARGE_PER_KG_USD}/kg`,
    import_tax_usd: taxUsd,
    /* Said explicitly so Aria can explain WHY there is no tax, which is
       the single most common question this shop gets. */
    import_tax_note: taxUsd > 0
      ? `aplica porque el valor de la mercadería pasa los $${TAX_ESTIMATE_THRESHOLD_USD} (${Math.round(TAX_ESTIMATE_RATE * 100)}% sobre CIF)`
      : `no aplica: la mercadería no llega a $${TAX_ESTIMATE_THRESHOLD_USD}`,
    total_usd: totalUsd,
  };
}

async function orderStatus(orderRef, origin) {
  const ref = String(orderRef || "").trim();
  if (!ref) return { unavailable: "necesito el código del pedido" };
  try {
    const res = await fetch(`${origin}/.netlify/functions/shipment-track?shipmentId=${encodeURIComponent(ref)}`);
    if (res.status === 404) return { unavailable: `no encuentro ningún pedido con el código ${ref}` };
    if (!res.ok) return { unavailable: "no puedo consultar el estado ahorita" };
    const data = await res.json();
    return { order: data };
  } catch {
    return { unavailable: "no puedo consultar el estado ahorita" };
  }
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "El cuerpo no es JSON válido." }); }

  const tool = String(body.tool || "");
  const args = (body.args && typeof body.args === "object") ? body.args : {};

  switch (tool) {
    case "calculate_total_delivered_price":
      return json(200, deliveredTotal(args));
    /* Static knowledge, so no catalogue and no fan-out: a lookup and
       a return. Both answer with a sentence Aria can say when they
       have nothing, never with silence. */
    case "get_store_info":
      return json(200, getStoreInfo(args.store_name));
    case "recommend_stores_for":
      return json(200, recommendStoresFor(args.interest, { resolved: args.resolved === true }));
    /* THE VIN. Positions 1-3 and 10 are decodable from the number
       itself; model, trim and engine are not, because positions 4-8
       mean whatever each manufacturer decided they mean. Those come
       from NHTSA's free vPIC service or they come back null — a
       guessed model becomes a wrong part, and the shopper pays for
       it. A vPIC outage degrades the answer, it does not fail it. */
    case "decode_vin": {
      const local = decodeVinLocal(args.vin);
      if (local.unavailable) return json(200, local);
      let remote = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch(
          `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(local.vin)}?format=json`,
          { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          const data = await res.json();
          remote = (data && data.Results && data.Results[0]) || null;
        }
      } catch { remote = null; }
      const pick = (v) => {
        const s = String(v == null ? "" : v).trim();
        /* vPIC answers with "" and with "Not Applicable" for fields it
           has nothing for. Both mean null, and neither may be read out
           as if it were an answer. */
        return (!s || /^not applicable$/i.test(s)) ? null : s;
      };
      return json(200, {
        ...local,
        /* The local decode wins on year and make where vPIC is silent,
           and vPIC wins where it actually knows — it reads the
           manufacturer tables we do not have. */
        year: (remote && Number(pick(remote.ModelYear))) || local.year,
        make: pick(remote && remote.Make) || local.make,
        model: pick(remote && remote.Model),
        trim: pick(remote && remote.Trim),
        engine: remote
          ? (pick(remote.DisplacementL) ? pick(remote.DisplacementL) + "L" : null)
          : null,
        source: remote ? "vpic" : "vin",
        note: remote
          ? null
          : "Solo pude leer el año y la marca del VIN. Pregúntale el modelo — no lo adivines.",
      });
    }

    /* A BRAND WE DO NOT CARRY IS A TALLY, NOT A DEAD END. Mirrors
       fitment-gap-log.js exactly: one counter per brand, no session,
       no IP, no personal data. It is a record of demand, not of
       people. */
    case "request_brand": {
      const brand = String(args.brand_name || "").trim().slice(0, 60);
      if (!brand) return json(200, { unavailable: "dime qué marca quieres y la anoto" });
      const note = String(args.shopper_note || "").trim().slice(0, 200);
      try {
        /* IMPORTED HERE, NOT AT THE TOP. @netlify/blobs only exists in
           the deployed runtime, and a top-level import of it makes the
           whole module unloadable anywhere else — including the test
           suite, which imports deliveredTotal from this file. One
           request-logging path must not cost us the ability to test
           the tax arithmetic. */
        const { getStore, connectLambda } = await import("@netlify/blobs");
        connectLambda(event);
        const store = getStore("brand-requests");
        const key = brand.toLowerCase();
        const prev = (await store.get(key, { type: "json" }))
          || { brand, count: 0, firstSeen: null, notes: [] };
        const notes = note ? [...(prev.notes || []), note].slice(-10) : (prev.notes || []);
        await store.setJSON(key, {
          ...prev, brand, notes,
          count: prev.count + 1,
          firstSeen: prev.firstSeen || new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });
        return json(200, {
          request_id: key,
          message: "anotado",
          /* NO DATE, EVER. "Te aviso cuando llegue" is a promise we can
             keep; "llega en dos semanas" is not. */
          say: "Listo, ya está pedida. Te aviso cuando llegue.",
        });
      } catch (e) {
        /* The tally failing must not turn into a promise we did not
           make. She says she could not note it, and offers the
           alternative instead. */
        return json(200, { unavailable: "no pude anotarla ahorita, pero dime qué buscabas y te muestro algo parecido" });
      }
    }

    case "get_order_status": {
      const proto = event.headers?.["x-forwarded-proto"] || "https";
      const host = event.headers?.host || "ariashop.pe";
      return json(200, await orderStatus(args.order_ref, `${proto}://${host}`));
    }
    default:
      return json(400, { error: `"${tool}" no es una herramienta de este endpoint.` });
  }
}
