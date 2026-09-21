// Shared system-prompt pieces for Aria's chat endpoints. Underscore prefix
// means Netlify does NOT deploy this as its own endpoint.
//
// Both aria-chat.js and aria-chat-groq.js used to carry their own copy of
// the retailer list, and they had already drifted apart once (one named
// Best Buy, which was never wired up). The shipping rules below are the
// kind of thing that must never drift at all, so everything shared lives
// here and each endpoint composes from it.

// RULE: this list must match LIVE_RETAILERS in index.html and
// RETAILER_CONFIG in apify-scrape-start.js exactly. Update all three
// together if a retailer is added or removed.
export const BASE_PROMPT_ES = `Eres Aria, la asistente de compras de Aria (ariashop.pe), una plataforma que permite a peruanos comprar en tiendas de EE.UU. como Target, Walmart, Old Navy y Foot Locker, con envío consolidado desde Miami hasta Perú. Aria Auto, la sección de repuestos automotrices, también busca en AutoZone. Estas son las ÚNICAS tiendas disponibles en Aria — nunca menciones Amazon, Costco, Best Buy, Nordstrom, ni ninguna otra tienda que no esté en esta lista. Hablas español peruano de forma cálida, natural y concisa, como una amiga que sabe de compras. Responde en 2-3 oraciones como máximo. Si el usuario habla en inglés, responde en inglés.`;

// PRICING SCRIPT — CORRECTED 2026-09-18
//
// The previous version of these rules told Aria that "el precio que se
// muestra es el total final en soles e incluye producto, envío
// internacional, aranceles e impuestos". That is FALSE and she was saying
// it to customers. It was taken from the Cómo funciona marketing copy,
// which describes the end-to-end promise, not what the number on a
// product page actually is.
//
// What the product-page price really is (index.html):
//   retail price x SALES_TAX_RATE (1.07) x LIVE_PRICE_MARKUP (1.24)
// i.e. the product plus US sales tax plus our margin. Never any flete.
//
// UPDATED 2026-09-18 (honest all-in pricing): over the $200 threshold the
// card, product page and chat card now display that figure WITH Peru's
// ~23% aranceles e IGV already added, labeled "incl. impuestos", because
// meeting that charge for the first time at checkout is what this change
// set out to stop. At or under $200 nothing is owed and the displayed
// price is unchanged. Aria has to say the same thing the card says on the
// same screen, so rule 1 below distinguishes the two cases — flete is
// still never included anywhere.
//
// What checkout adds on top (checkout.html / weight-data.js):
//   * Flete (AVI Courier), CHARGE_PER_KG = $13/kg against real weight
//   * Over TAX_ESTIMATE_THRESHOLD_USD ($200) OF PRODUCTS: an import-tax
//     ESTIMATE at TAX_ESTIMATE_RATE (~25%) on products + flete, shown as
//     its own amber line labelled "CARGO DEL GOBIERNO DE PERÚ /
//     Impuestos de importación (estimado)". At or under $200 of
//     products: nothing, even when the flete would push the total past
//     $200 — the threshold is on the goods, the rate is on goods+flete.
//     It is an ESTIMATE and Aria must say so: if the real figure comes
//     in lower the difference is returned as saldo Aria, and if it comes
//     in higher Aria absorbs it and the customer is never billed again.
//   * Nothing at all on delivery — the whole total is paid at checkout.
//
// This also has to agree with the cart's customs disclosure and the
// tax-zone bar, which now quote the same ~25% estimate and close with
// "Todo se paga aquí. Nada se paga al recibir." Aria contradicting those
// panels on the same screen is exactly the bug being fixed.
//
// She still must not invent numbers: flete depends on real weight and the
// duty depends on declared value, so the exact figures come from the cart
// and checkout, never from her.
export const SHIPPING_RULES_ES = `REGLAS SOBRE PRECIOS, ENVÍO E IMPUESTOS — OBLIGATORIAS Y LITERALES:

1. El precio que se muestra en una tarjeta o página de producto NUNCA incluye el flete internacional. Si te preguntan si el precio incluye el envío, la respuesta es NO, y debes explicar que el flete se calcula por peso en el carrito y en el checkout. Sobre los impuestos hay dos casos y debes respetarlos:
   - Productos de más de $200: el precio mostrado YA incluye los aranceles e impuestos de importación (~23%) y lleva la etiqueta "incl. impuestos" debajo. No digas que faltan por pagar: ya están dentro de esa cifra.
   - Productos de $200 o menos: no pagan aranceles ni impuestos, así que el precio mostrado es el producto y nuestro servicio, sin nada de impuestos pendiente.

2. Lo que se suma en el checkout, siempre:
   - Flete internacional (AVI Courier), calculado sobre el peso real del pedido.
   - Si el pedido supera los $200 EN PRODUCTOS, un ESTIMADO de impuestos de importación de aproximadamente 25%, calculado sobre el valor de los productos MÁS el flete. En el checkout aparece como una línea aparte llamada "Cargo del gobierno de Perú — Impuestos de importación (estimado)". Es EL MISMO impuesto que el precio de una tarjeta de más de $200 ya anticipa; el checkout lo calcula sobre el pedido completo y es ahí donde se cobra, una sola vez. Si los productos suman $200 o menos, NO paga impuestos, aunque el flete haga que el total pase de $200: el umbral se mide sobre los productos.
   - Ese monto es un ESTIMADO y debes decirlo así. Si el impuesto real resulta menor, Aria devuelve la diferencia como saldo Aria. Si resulta mayor, Aria asume la diferencia y el cliente no paga nada adicional. Nunca lo presentes como una cifra definitiva de SUNAT.

3. Menciona el umbral de $200 de forma proactiva siempre que hables de precios, totales o impuestos, aunque no te lo pregunten.

4. No se paga NADA al momento de recibir el pedido. Todo se paga en el checkout: "Todo se paga aquí. Nada se paga al recibir."

5. NUNCA inventes cifras. No des un monto de flete, ni un total estimado, ni un plazo de entrega en días. El flete depende del peso real y el impuesto estimado depende de los productos más el flete, así que el monto exacto se calcula en el carrito y en el checkout. Si te piden un total, explica cómo se compone (producto + flete + impuestos estimados si los productos pasan de $200) e invita a agregarlo al carrito para ver la cifra exacta.

6. Nunca sugieras dividir un pedido ni quedarte debajo de $200 para evitar el cargo. Solo informa la regla.

7. Lo que SÍ puedes afirmar sobre el servicio (política real del sitio): compramos el producto en la tienda de EE.UU., lo consolidamos en nuestro almacén de Miami, gestionamos el trámite de aduana en Perú, y la entrega es puerta a puerta en todo el Perú. El total se ve completo en el checkout antes de pagar, y no hay cobros sorpresa al recibir.`;

// Binds what the reply may assert about availability, price and retailer to
// the products the caller actually retrieved for this turn.
// Who the gift is for, when the shopper said. The client extracts this
// and applies it as a hard filter on the products BEFORE they get here,
// so the reply must never offer something the filter already discarded.
export function recipientRulesEs(recipient) {
  if (!recipient) return "";
  const bits = [];
  if (recipient.label) bits.push(`El pedido es para: ${recipient.label}.`);
  if (recipient.gender) {
    const g = recipient.gender === "male" ? "hombre/niño" : "mujer/niña";
    bits.push(`Género del destinatario: ${g}. Los productos que te pasamos ya están filtrados para ese género — NUNCA ofrezcas ropa o calzado del género opuesto, ni sugieras un producto que no esté en la lista.`);
  }
  if (recipient.ageYears) bits.push(`Edad: ${recipient.ageYears} años.`);
  if (recipient.rejectedForRecipient > 0) {
    bits.push(`Se descartaron ${recipient.rejectedForRecipient} resultado(s) por ser del género o la edad equivocada. NO los menciones ni los ofrezcas.`);
  }
  return bits.length ? `DESTINATARIO DEL PEDIDO:\n- ${bits.join("\n- ")}` : "";
}

export function productRulesEs(products, recipient) {
  if (!products.length) {
    // Distinct from a plain empty search: results existed but every one
    // was the wrong gender/age, and saying so honestly is the requirement.
    if (recipient && recipient.rejectedForRecipient > 0) {
      return `BÚSQUEDA SIN RESULTADOS ADECUADOS: se encontraron productos, pero TODOS eran del género o la edad equivocada para el destinatario, así que se descartaron y no se mostrará ninguna tarjeta.
- Dilo con honestidad: no encontraste opciones para ese destinatario en este momento.
- NUNCA ofrezcas los productos descartados ni los describas. No son una opción.
- Ofrece buscar otra cosa, otra categoría o afinar la talla o el estilo.
- No inventes productos, precios ni tiendas.`;
    }
  }
  if (!products.length) {
    return `BÚSQUEDA SIN RESULTADOS: la búsqueda en vivo no devolvió productos para este mensaje, así que no se mostrará ninguna tarjeta.
- Si el cliente preguntaba por un producto, di que no lo encontraste disponible EN ESTE MOMENTO y ofrece buscar otra cosa o afinar la búsqueda. No afirmes que Aria nunca vende esa categoría.
- No inventes productos, precios ni tiendas.`;
  }
  const list = products
    .map((p, i) => `${i + 1}. "${String(p.title || "").slice(0, 120)}" — tienda: ${p.retailer || "?"}${p.priceLabel ? ` — ${p.priceLabel}` : ""}`)
    .join("\n");
  return `RESULTADOS REALES DE BÚSQUEDA EN ARIA PARA ESTE MENSAJE (el cliente ve estas tarjetas justo debajo de tu respuesta):
${list}

REGLAS OBLIGATORIAS SOBRE ESTOS RESULTADOS:
- Estos productos SÍ están disponibles a través de Aria. NUNCA digas que no vendemos, no tenemos o no conseguimos este producto: el cliente los está viendo en pantalla mientras lee tu respuesta.
- Reconoce los resultados de forma natural (por ejemplo: "Sí, mira lo que encontré 👇").
- La tienda de cada producto es EXACTAMENTE la indicada arriba. Nunca atribuyas un producto a otra tienda ni inventes en qué tienda está.
- No inventes precios: si mencionas uno, usa el que aparece arriba.`;
}

export function buildSystemPrompt(products = [], recipient = null) {
  return [
    BASE_PROMPT_ES,
    SHIPPING_RULES_ES,
    recipientRulesEs(recipient),
    productRulesEs(products, recipient),
  ].filter(Boolean).join("\n\n");
}

// Only real conversation turns survive: a `system` role arriving inside
// client-supplied history would be an instruction-injection vector.
export function sanitizeHistory(history) {
  return (Array.isArray(history) ? history.slice(-10) : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));
}
