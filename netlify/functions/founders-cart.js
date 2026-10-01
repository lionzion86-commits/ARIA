// Los Elegidos — one member's full saved cart for Danny's review (2026-10-01).
//
// GET (admin only): ?email=ana@correo.com
// Returns the member's profile plus every saved cart line with the fields
// Danny needs to judge the cart: title, retailer, qty, price, image, size.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders, normalizeEmail } from "./_auth-helpers.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const adminEmail = await getSessionEmail(event);
  if (!isAdmin(adminEmail)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const email = normalizeEmail((event.queryStringParameters || {}).email);
  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Correo inválido" }) };
  }

  try {
    const users = getStore("users");
    const u = await users.get(email, { type: "json" });
    if (!u) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Miembro no encontrado" }) };
    }
    const carts = getStore("carts");
    const c = await carts.get(email, { type: "json" }).catch(() => null);
    const cart = c && Array.isArray(c.cart) ? c.cart : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        email: u.email,
        name: u.name || "",
        phone: u.phone || "",
        createdAt: u.createdAt || null,
        founderStatus: u.founderStatus || "pending",
        cartUpdatedAt: (c && c.updatedAt) || null,
        cart: cart.map((it) => ({
          title: it.title || "",
          retailer: it.retailer || "",
          qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
          priceUsd: Number(it.priceUsd) || 0,
          image: it.image || "",
          selectedSize: it.selectedSize || "",
        })),
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
