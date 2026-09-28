/* PROVINCIA LAST-MILE (2026-09-27, Danny).

   Aria's model: everything consolidates through the Lima hub, which sorts
   by province and hands the last mile to partner couriers. The customer
   picks their destination AND their courier at checkout — this is the one
   list the dropdown reads, so adding the 3rd partner later is one line.

   scope: 'lima'      → offered only when the destination is Lima
          'provincia' → offered only for the rest of the country
          'both'      → offered everywhere                                       */
export const LAST_MILE_COURIERS = [
  { id: 'aria-lima',     name: 'Reparto Aria',              scope: 'lima' },
  { id: 'olva',          name: 'Olva Courier',              scope: 'both' },
  { id: 'shalom',        name: 'Shalom',                    scope: 'both' },
  { id: 'aria-asignado', name: 'Courier asignado por Aria', scope: 'provincia' },
];

/* Flat fee for the Lima → province leg, in soles. Exact per-courier rates
   come later once there is volume per route.
   TARIFA TEMPORAL — Danny: confirma el monto real antes del lanzamiento. */
export const PROVINCIA_FEE_PEN = 9.90;

export function isLimaDest(destCity){
  return String(destCity || '').trim().toLowerCase() === 'lima';
}

export function couriersFor(destCity){
  const lima = isLimaDest(destCity);
  return LAST_MILE_COURIERS.filter(c =>
    c.scope === 'both' || (lima ? c.scope === 'lima' : c.scope === 'provincia'));
}

/* Soles-denominated, like the small-order fee. 0 for Lima — the reparto
   propio is already inside the freight quote. */
export function provinciaFeePen(destCity){
  return isLimaDest(destCity) ? 0 : PROVINCIA_FEE_PEN;
}

/* The delivery-time promise, shown BEFORE the customer pays. */
export function lastMileEtaEs(destCity, courierName){
  const city = String(destCity || '').trim();
  if (isLimaDest(destCity)){
    return 'Reparto propio en Lima: tu pedido llega a tu puerta en 24–48 h después de aterrizar en nuestro hub.';
  }
  const where = city && city.toLowerCase() !== 'otra' ? ` a ${city}` : '';
  const who = courierName ? ` con ${courierName}` : '';
  return `Tu pedido viaja de Lima${where}${who}: suma de 2 a 4 días al tiempo de llegada a Lima.`;
}
