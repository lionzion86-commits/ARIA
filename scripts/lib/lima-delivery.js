/* ============================================================
   ENTREGA EN LIMA -- THE LIMA DOOR-TO-DOOR FEE AND WHEN IT IS FREE.
   ONE RULE.

   WHY (#443 c.6709315389 item 7, Danny, 2026-11-07): "Free delivery
   live: thresholds $49 / $52 / $59, fees S/ 12 / 16 / 22.50, label
   'entrega en Lima gratis'."

   HOW THE THREE PAIRS ARE READ (a reading, flagged on the PR for
   Danny): three Lima delivery zones, nearest to farthest from the hub.
   Each zone has its own Reparto Aria fee and its own free-delivery
   threshold, paired in the order given:
       zona 1  S/ 12.00, gratis desde US$ 49 en productos
       zona 2  S/ 16.00, gratis desde US$ 52
       zona 3  S/ 22.50, gratis desde US$ 59
   The farther the zone, the higher the fee and the higher the order
   that waives it. The district-to-zone table below is Aria's reading of
   Lima's map (centre / the ring and Callao / the outer districts and
   the southern beaches); it is the one table to correct if Danny's
   zones differ. A Lima district the table does not know is charged as
   zona 3 -- never less than the real fee -- and the row says so.

   THE THRESHOLD is measured on the products, in USD, as the cards show
   them (the cart's goods total, the same priceUsd the server reprices):
   never freight, taxes or fees. At or over it: S/ 0 and the row reads
   "Entrega en Lima gratis".

   SOLES, NO EXCHANGE RATE on the fee (like the small-order fee and the
   provincia leg): it is added to the soles total as it is. Only Lima:
   an order to a province pays the provincia leg (/couriers.js) instead.

   The page (checkout.html) and the server (orders-create.js) both import
   this module, so the charged figure can never disagree with the one
   shown. scripts/test/lima-delivery-tests.mjs pins it.
   ============================================================ */

export const LIMA_DELIVERY_LABEL = "Entrega en Lima";
export const LIMA_DELIVERY_FREE_LABEL = "Entrega en Lima gratis";

export const LIMA_DELIVERY_ZONES = Object.freeze([
  Object.freeze({
    id: "lima-1", label: "Zona 1", feePen: 12, freeFromUsd: 49,
    districts: Object.freeze([
      "Barranco", "Breña", "Jesús María", "La Victoria", "Lima", "Cercado de Lima", "Lince",
      "Magdalena del Mar", "Magdalena", "Miraflores", "Pueblo Libre", "Rímac", "San Borja",
      "San Isidro", "San Luis", "San Miguel", "Santiago de Surco", "Surco", "Surquillo",
    ]),
  }),
  Object.freeze({
    id: "lima-2", label: "Zona 2", feePen: 16, freeFromUsd: 52,
    districts: Object.freeze([
      "Ate", "Ate Vitarte", "Chorrillos", "Comas", "El Agustino", "Independencia", "La Molina",
      "Los Olivos", "San Juan de Lurigancho", "San Juan de Miraflores", "San Martín de Porres",
      "Santa Anita", "Villa El Salvador", "Villa María del Triunfo",
      "Callao", "Bellavista", "Carmen de la Legua", "Carmen de la Legua Reynoso", "La Perla", "La Punta",
    ]),
  }),
  Object.freeze({
    id: "lima-3", label: "Zona 3", feePen: 22.5, freeFromUsd: 59,
    districts: Object.freeze([
      "Ancón", "Carabayllo", "Chaclacayo", "Chosica", "Cieneguilla", "Lurigancho", "Lurín",
      "Pachacámac", "Pucusana", "Puente Piedra", "Punta Hermosa", "Punta Negra", "San Bartolo",
      "Santa María del Mar", "Santa Rosa", "Ventanilla", "Mi Perú",
    ]),
  }),
]);
/** The zone a district we do not recognise is charged as: the highest fee. */
export const LIMA_DELIVERY_FALLBACK_ZONE = "lima-3";

const r2 = (n) => Math.round(Number(n) * 100) / 100;
/** "  San  Martín de Porres " -> "san martin de porres". */
export function districtKey(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
const BY_DISTRICT = new Map();
for (const z of LIMA_DELIVERY_ZONES) for (const d of z.districts) BY_DISTRICT.set(districtKey(d), z);

export function isLimaCity(destCity) {
  return districtKey(destCity) === "lima";
}

/** { zone, known } for a Lima district; an unknown one is the fallback zone. */
export function limaZoneOf(district) {
  const k = districtKey(district).replace(/^distrito de /, "");
  const z = BY_DISTRICT.get(k);
  if (z) return { zone: z, known: true };
  return { zone: LIMA_DELIVERY_ZONES.find((x) => x.id === LIMA_DELIVERY_FALLBACK_ZONE), known: false };
}

/**
 * The Lima delivery line for an order.
 *   destCity  -- the checkout's "Ciudad de destino"; anything but Lima owes nothing here.
 *   district  -- the address's district (free text).
 *   goodsUsd  -- the products, as the cards price them.
 * Returns null outside Lima; otherwise
 *   { zoneId, zoneLabel, known, feePen (charged), basePen, freeFromUsd, free, missingUsd }.
 */
export function limaDelivery(destCity, district, goodsUsd) {
  if (!isLimaCity(destCity)) return null;
  const { zone, known } = limaZoneOf(district);
  const goods = Number(goodsUsd);
  const g = Number.isFinite(goods) && goods > 0 ? goods : 0;
  const free = g >= zone.freeFromUsd;
  return {
    zoneId: zone.id, zoneLabel: zone.label, known,
    feePen: free ? 0 : zone.feePen, basePen: zone.feePen,
    freeFromUsd: zone.freeFromUsd, free,
    missingUsd: free ? 0 : r2(zone.freeFromUsd - g),
  };
}

/** The fee charged, in soles: 0 outside Lima and at or over the zone's threshold. */
export function limaDeliveryFeePen(destCity, district, goodsUsd) {
  const d = limaDelivery(destCity, district, goodsUsd);
  return d ? d.feePen : 0;
}

/**
 * The note under the line (Spanish). fx: today's venta, to say how much is
 * missing in soles first; without it, in dollars.
 */
export function limaDeliveryNote(d, fx) {
  if (!d) return "";
  const where = d.known ? d.zoneLabel : `${d.zoneLabel} (no reconocemos el distrito; revísalo)`;
  if (d.free) return `${LIMA_DELIVERY_FREE_LABEL} · ${where}`;
  const usd = `US$ ${d.missingUsd.toFixed(2)}`;
  const miss = fx > 0 ? `S/ ${r2(d.missingUsd * fx).toFixed(2)} (${usd})` : usd;
  return `${where} · te faltan ${miss} en productos para entrega en Lima gratis`;
}
