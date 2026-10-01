// Los Elegidos — Danny's member-review list (2026-10-01).
//
// GET (admin only — real session whose email is on ADMIN_EMAILS):
//   ?sort=total|date   cart total high→low, or newest signup first
//   ?status=all|pending|fundador|rechazado
//   ?page=1&per=25
//
// Returns members with a cart summary each (item count, USD total, last
// cart update) plus the picked-count meter values. Full cart contents
// come from founders-cart.js — this list stays light so a page of 25
// members costs ~50 small blob reads, not a whole-table scan.
//
// The pickedCount reported here is the maintained counter (same one the
// homepage reads); founders-pick.js keeps it exact on every transition.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";
import { FOUNDERS_TARGET } from "./founders-status.js";

const MAX_PER = 50;

function cartSummary(cart) {
  if (!Array.isArray(cart) || !cart.length) return { itemCount: 0, totalUsd: 0 };
  let totalUsd = 0;
  let itemCount = 0;
  for (const it of cart) {
    if (!it || typeof it !== "object") continue;
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    itemCount += qty;
    totalUsd += (Number(it.priceUsd) || 0) * qty;
  }
  return { itemCount, totalUsd: Math.round(totalUsd * 100) / 100 };
}

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const email = await getSessionEmail(event);
  if (!isAdmin(email)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const q = event.queryStringParameters || {};
  const sort = q.sort === "total" ? "total" : "date";
  const statusFilter = ["pending", "fundador", "rechazado"].includes(q.status) ? q.status : "all";
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const per = Math.min(MAX_PER, Math.max(1, Math.floor(Number(q.per) || 25)));

  try {
    const users = getStore("users");
    const carts = getStore("carts");
    const { blobs } = await users.list();

    // Fetch every user record once — the whole point of this dashboard is
    // reviewing all carts, and a member list is bounded by the campaign
    // (thousands, not millions). Unreadable records are dropped, not fatal.
    const records = [];
    for (const b of blobs) {
      try {
        const u = await users.get(b.key, { type: "json" });
        if (u && u.email) records.push(u);
      } catch { /* counted below */ }
    }
    const unreadable = blobs.length - records.length;

    let members = records.map((u) => ({
      email: u.email,
      name: u.name || "",
      phone: u.phone || "",
      createdAt: u.createdAt || null,
      founderStatus: u.founderStatus || "pending",
    }));
    if (statusFilter !== "all") {
      members = members.filter((m) => m.founderStatus === statusFilter);
    }

    // Cart summaries for every member in the filtered set (needed for the
    // total-sort and the per-row totals Danny reviews against).
    const withCarts = [];
    for (const m of members) {
      let cart = [];
      let cartUpdatedAt = null;
      try {
        const c = await carts.get(m.email, { type: "json" });
        if (c && Array.isArray(c.cart)) {
          cart = c.cart;
          cartUpdatedAt = c.updatedAt || null;
        }
      } catch { /* no saved cart yet — zeros below */ }
      const s = cartSummary(cart);
      withCarts.push({ ...m, itemCount: s.itemCount, cartTotalUsd: s.totalUsd, cartUpdatedAt });
    }

    withCarts.sort((a, b) =>
      sort === "total"
        ? b.cartTotalUsd - a.cartTotalUsd
        : String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );

    const total = withCarts.length;
    const start = (page - 1) * per;
    const pageMembers = withCarts.slice(start, start + per);

    let pickedCount = 0;
    try {
      const meta = getStore("founders-meta");
      const m = await meta.get("counts", { type: "json" });
      if (m && Number.isFinite(Number(m.pickedCount))) pickedCount = Math.max(0, Math.floor(Number(m.pickedCount)));
    } catch { /* 0 */ }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        members: pageMembers,
        total,
        page,
        per,
        pages: Math.max(1, Math.ceil(total / per)),
        unreadable,
        pickedCount,
        target: FOUNDERS_TARGET,
        spotsRemaining: Math.max(0, FOUNDERS_TARGET - pickedCount),
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
