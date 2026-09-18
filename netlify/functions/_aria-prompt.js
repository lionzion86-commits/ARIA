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

// The site states a shipping POLICY and never a number: no cost range and
// no delivery estimate in days appears anywhere on it. Anything the model
// invents ("$12-25", "7-15 días") contradicts the all-in pricing promise
// on Cómo funciona and becomes a promise Aria then has to keep. The
// permitted claims below are taken verbatim in substance from that page's
// six steps.
export const SHIPPING_RULES_ES = `REGLAS SOBRE ENVÍO Y COSTOS — OBLIGATORIAS:
- NUNCA inventes un costo de envío, un rango de precios, ni un plazo de entrega en días. No existen cifras oficiales de envío ni de tiempo de entrega que puedas citar.
- Lo ÚNICO que puedes decir sobre envío es la política real del sitio: el precio que se muestra es el total final en soles e incluye producto, envío internacional, aranceles e impuestos; consolidamos el pedido en nuestro almacén de Miami; gestionamos el trámite de aduana; la entrega es puerta a puerta en todo el Perú; y no hay pagos ni sorpresas al recibir.
- Si te preguntan cuánto cuesta el envío o cuánto demora, explica que el costo ya viene incluido en el precio total y que para ver la cifra exacta de su pedido basta con agregar el producto al carrito, donde se calcula el total real. Nunca estimes.`;

// Binds what the reply may assert about availability, price and retailer to
// the products the caller actually retrieved for this turn.
export function productRulesEs(products) {
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

export function buildSystemPrompt(products = []) {
  return `${BASE_PROMPT_ES}\n\n${SHIPPING_RULES_ES}\n\n${productRulesEs(products)}`;
}

// Only real conversation turns survive: a `system` role arriving inside
// client-supplied history would be an instruction-injection vector.
export function sanitizeHistory(history) {
  return (Array.isArray(history) ? history.slice(-10) : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));
}
