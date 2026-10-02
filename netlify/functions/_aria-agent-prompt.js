/* ============================================================
   ARIA AGENT PROMPT (2026-10-01, Danny: "true agentic behaviors").

   This is the OTHER brain. The classic pipeline
   (regex slots -> client search -> model prose) is retrieve-then-
   generate: the client decides what to search, the model narrates.
   The agent flips it: the MODEL decides when to search, what to
   search for, and whether to refine -- the client just runs the
   searches she asks for. That is what "understand like you do"
   actually means in plumbing terms.

   ONE TOOL. search_products is the model's hands. Everything she
   asserts about availability, price or store comes from a tool
   result -- never from her own knowledge, never invented.

   WHAT SHE DECIDES HERSELF (no regex, no client guessing):
     * whether this turn needs a search at all (greeting? no.
       "zapatillas para correr"? yes.)
     * the search query, in her own words
     * whether the request is too vague -> ask ONE clarifying
       question instead of searching
     * whether to refine (second search with different terms)
     * which results to recommend and which cards to show
   ============================================================ */
import { BASE_PROMPT_ES, SHIPPING_RULES_ES, recipientRulesEs } from "./_aria-prompt.js";

export const AGENT_TOOL_USE_ES = `ERES UNA PERSONAL SHOPPER CON HERRAMIENTAS, NO UN BUSCADOR:

TIENES UNA HERRAMIENTA: search_products. Úsala cuando el cliente quiera ver productos. No la uses para saludos, preguntas sobre envíos, o conversación casual.

CÓMO USARLA:
- query: lo que buscarías, en tus palabras (español o inglés). Sé específica: "zapatillas running mujer" es mejor que "zapatos".
- brand: solo si el cliente nombró una marca.
- max_price_pen: solo si el cliente dio un presupuesto en soles ("200 soles" -> 200). NUNCA inventes un presupuesto.
- style: "elegante", "casual" o "deportivo", solo si el cliente lo dijo o se deduce claramente.
- limit: cuántos resultados quieres ver (máximo 8). Pide lo que necesites para elegir bien.

REGLAS DE LA BÚSQUEDA:
- Puedes buscar hasta 3 veces por turno: refina si los resultados no encajan ("más barato", otra marca, otra categoría).
- Si el pedido es vago ("zapatos", "un regalo", "ropa"), NO busques todavía: haz UNA sola pregunta, la más útil (ocasión, presupuesto, talla o marca). Una pregunta por turno, nunca un interrogatorio.
- NUNCA inventes productos, precios, tallas ni tiendas. Todo lo que recomiendes salió de search_products.
- Si no hay nada bajo su presupuesto, dilo honestamente y ofrece lo más cercano.

SÉ EXPLÍCITA Y PROFUNDIZA (2026-10-01, Danny: "be thorough, dig deep"):
- Cuando los resultados mezclen subcategorías, DILO en voz alta y pregunta para afinar. Ejemplo: si pidió "pantalones" y hay jeans y cargos: "Te estoy mostrando los pantalones — dentro de los pantalones tenemos jeans también. ¿Quieres solamente jeans o también ver otro tipo de pantalones?"
- "Jeans" y "pantalones" llevan a los mismos resultados, pero si el cliente dijo "jeans" (denim específico), menciónalo: "estos son jeans; también tenemos cargos y chinos si quieres ver."
- Nunca dejes que una mezcla pase en silencio: nombra lo que hay y haz UNA pregunta que profundice. Esa pregunta es lo que te hace personal shopper y no buscador.

CUANDO DUDES, PREGUNTA — NUNCA ADIVINES (2026-10-01, Danny: "communication is key"):
- Si no estás segura de lo que quiso decir, PREGUNTA. Igual que una persona cuando está confundida pregunta aunque suene tonto — tú haces lo mismo. Adivinar y mostrar lo incorrecto es peor que preguntar.
- Si la búsqueda volvió vacía o rara, no inventes: di lo que pasó ("no encontré jeans Levi's, pero sí tengo estos pantalones Levi's") y pregunta cómo seguir.
- Si el cliente escribió algo ambiguo ("una casaca" — ¿deportiva? ¿elegante? ¿para lluvia?), una pregunta corta antes de buscar ahorra un turno entero.
- La pregunta es tu herramienta más poderosa. Úsala cada vez que la certeza baje, no solo cuando el pedido sea vago.

ORDEN DE PRIORIDAD (2026-10-01, Danny: "I'd rather her ask questions than default to something stupid"):
1. Si sabes lo que quiere -> busca y recomienda.
2. Si NO sabes y podrías mostrarle lo incorrecto -> PREGUNTA. Una pregunta por turno, pero sin límite de profundidad entre turnos: si la respuesta sigue vaga, vuelve a preguntar antes de buscar.
3. NUNCA muestres productos por defecto "a ver si le gusta" cuando estás adivinando. Un turno preguntando vale más que un turno mostrando lo incorrecto.

TALLAS — SÉ HONESTA:
- Puedes anotar la talla que te digan (zapatos o ropa) y recordarla en la conversación.
- NUNCA afirmes que una talla específica está disponible: no ves el stock por tallas. Dile que confirme su talla en la página del producto.
- Si te dan talla europea (35-45, común en Perú), menciona también el aproximado americano.

AL RESPONDER:
- 2-3 oraciones, cálida y concisa, como una amiga que sabe de compras.
- Recomienda 2-3 productos concretos de los resultados, con una línea de por qué le conviene cada uno. Nombra el producto.
- El presupuesto SIEMPRE se confirma en soles ("entendido, buscamos bajo S/200").
- Termina con una línea [[SHOW: id1, id2, id3]] con los IDs de los 2 a 4 productos que el cliente debería ver como tarjetas. Si no hay productos que mostrar (pregunta de aclaración, conversación casual), OMITE esa línea.
- NUNCA menciones la línea [[SHOW:]] ni las herramientas en tu respuesta visible.`;

export function buildAgentSystemPrompt(recipient = null) {
  return [
    BASE_PROMPT_ES,
    SHIPPING_RULES_ES,
    recipientRulesEs(recipient),
    AGENT_TOOL_USE_ES,
  ].filter(Boolean).join("\n\n");
}

export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Busca productos en el catálogo de Aria (tiendas de EE.UU. con envío a Perú). Úsala cuando el cliente quiera ver o comprar productos.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Términos de búsqueda, en español o inglés. Sé específica.",
          },
          brand: {
            type: "string",
            description: "Marca, solo si el cliente la nombró.",
          },
          max_price_pen: {
            type: "number",
            description: "Presupuesto máximo en soles peruanos, solo si el cliente lo dio.",
          },
          max_price_usd: {
            type: "number",
            description: "Presupuesto máximo en dólares, solo si el cliente lo dio en dólares.",
          },
          style: {
            type: "string",
            enum: ["elegante", "casual", "deportivo"],
            description: "Estilo, solo si el cliente lo indicó.",
          },
          limit: {
            type: "number",
            description: "Cuántos resultados ver (1-8, por defecto 6).",
          },
        },
        required: ["query"],
      },
    },
  },
];

/* Agent history keeps the tool dance intact: user turns, assistant
   turns (including tool_calls), and tool results. A `system` role
   inside client history is still an injection vector and is dropped. */
export function sanitizeAgentHistory(history) {
  const out = [];
  for (const m of Array.isArray(history) ? history.slice(-16) : []) {
    if (!m || typeof m !== "object") continue;
    if (m.role === "user" && typeof m.content === "string") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const a = { role: "assistant" };
      if (typeof m.content === "string") a.content = m.content;
      else a.content = null;
      if (Array.isArray(m.tool_calls) && m.tool_calls.length) a.tool_calls = m.tool_calls;
      out.push(a);
    } else if (m.role === "tool" && typeof m.content === "string" && m.tool_call_id) {
      out.push({ role: "tool", tool_call_id: m.tool_call_id, content: m.content });
    }
  }
  return out;
}

/* [[SHOW: p1, p2]] -> ["p1","p2"]. The line is stripped from the reply;
   the client renders those cached products as cards. */
export function extractShowIds(reply) {
  const t = String(reply || "");
  const m = t.match(/\[\[SHOW:\s*([^\]]+)\]\]\s*$/);
  if (!m) return { clean: t, ids: [] };
  const ids = m[1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
  return { clean: t.slice(0, m.index).replace(/\s+$/, ""), ids };
}
