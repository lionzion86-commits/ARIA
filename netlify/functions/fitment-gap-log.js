// Records a vehicle we have no fitment data for, so the gaps can be
// prioritised instead of guessed at.
//
// WHY THIS EXISTS: "pastillas de freno" works for a 2023 Elantra and
// fails for a 2023 Yaris — not a bug in the search, but a vehicle that
// was never sold in the US, so no US retailer carries fitment for it. The
// page now says so honestly instead of showing unfiltered results; this
// endpoint is how we learn WHICH vehicles keep hitting that wall, and
// therefore which are worth sourcing another way.
//
// Deliberately tiny: one counter per vehicle+part, no personal data, no
// session, no IP. It is a tally of demand, not a log of people.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { peruDateKey } from "./_peru-time.js";

const MAX_LEN = 80;
const clean = (v) => String(v || "").trim().slice(0, MAX_LEN);

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { year, make, model, query } = JSON.parse(event.body || "{}");
    const vehicle = [clean(year), clean(make), clean(model)].filter(Boolean).join(" ");
    if (!vehicle) return { statusCode: 400, headers, body: JSON.stringify({ error: "vehículo requerido" }) };

    const store = getStore("fitment-gaps");
    const key = `${vehicle}|${clean(query)}`.toLowerCase();
    const prev = (await store.get(key, { type: "json" })) || { vehicle, query: clean(query), count: 0, firstSeen: null };
    await store.setJSON(key, {
      ...prev,
      count: prev.count + 1,
      firstSeen: prev.firstSeen || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      lastSeenPeruDate: peruDateKey(),
    });
    // Fire-and-forget from the page's point of view: a customer's search
    // must never fail because a tally did.
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: error.message }) };
  }
}
