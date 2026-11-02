/* ============================================================
   AVÍSAME CUANDO VUELVA -- WHO WANTED A SOLD-OUT PRODUCT
   (#443 c.6585537098, Danny's «Vuelve pronto» rule).

   A product the store lists as sold out is shown with «Vuelve pronto»
   (/vuelve-pronto.js). Its product page asks the shopper to leave an
   email or a WhatsApp number -- or, signed in, her account's email in
   one tap -- so Aria can write back when the store has it again. And
   each time such a page is opened an anonymous count goes up: how many
   people looked, with nothing about who.

   Where it goes (Blobs "restock"):
     want/<productId>/<contactHash>   one shopper's request: the product
                                      (id, title, store, its page on Aria,
                                      listing), the contact and channel,
                                      createdAt, and the signed-in
                                      account's email when there was one.
                                      ONE PER PRODUCT AND CONTACT: asking
                                      twice keeps the first.
     view/<productId>                 { n, title, store, url, lastAt } --
                                      opens of the page, no PII
     rate/<hash>/<hour>               requests from one address this hour
                                      (a hash of the address, never it)
   Read back by the admin only (admin-restock.js, a real session on
   ADMIN_EMAILS). No contact is ever served to anyone else: the public
   answer says ok, and repeats only what the shopper herself typed.

   Validated: the product must be one the list calls sold out (no free
   storage for anything else), the store a catalogue key, the contact a
   real-looking email or a phone number (a Peruvian mobile without +51
   gets it). The page Aria links is built here, inside Aria -- never the
   store's site.
   ============================================================ */
import { createHash } from "node:crypto";
import { isVuelvePronto } from "../../scripts/lib/vuelve-pronto.js";

export const RESTOCK_STORE = "restock";
export const RATE_PER_HOUR = 8;
export const VIEW_RATE_PER_HOUR = 120;
export const HONEYPOT = "website";
export const MAX = { title: 300, store: 40, v: 120, contact: 120 };

const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
export const isEmail = (s) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(String(s || ""));

/** The product's id: the same store, title and listing always give the same id. */
export function productIdOf(store, title, v) {
  return sha(`${String(store).toLowerCase()}::${String(title).toLowerCase().replace(/\s+/g, " ").trim()}::${v || ""}`).slice(0, 16);
}
/** Its page on Aria (the cards' own link, producto.html). */
export function ariaUrlOf(store, title, v) {
  return "/producto.html?producto=" + encodeURIComponent(title) + "&tienda=" + encodeURIComponent(store) + (v ? "&v=" + encodeURIComponent(v) : "");
}

/** A WhatsApp number, as digits with its country code: "+51987654321". Or null. */
export function normalizePhone(raw) {
  const s = String(raw || "").trim();
  if (!/^\+?[\d\s().-]{8,24}$/.test(s)) return null;
  let d = s.replace(/\D/g, "");
  if (!s.startsWith("+")) {
    if (/^9\d{8}$/.test(d)) d = "51" + d;               // a Peruvian mobile, as people write it
    else if (d.startsWith("00")) d = d.slice(2);
    else if (!/^51\d{9}$/.test(d)) return null;          // no country code we can be sure of
  }
  if (d.length < 8 || d.length > 15) return null;
  return "+" + d;
}

/**
 * The request, cleaned; or { error } in the shopper's words; or
 * { spam: true }. accountEmail: the session's, read by the handler.
 */
export function parseRequest(body, { accountEmail = null } = {}) {
  const b = body && typeof body === "object" ? body : {};
  const action = b.action === "view" ? "view" : b.action === "notify" ? "notify" : null;
  if (!action) return { error: "Solicitud no válida." };
  const title = clean(b.title, MAX.title);
  const store = clean(b.store, MAX.store).toLowerCase();
  const v = clean(b.v, MAX.v);
  if (!title || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(store)) return { error: "No reconocemos este producto." };
  if (!isVuelvePronto({ retailer: store, title, v })) return { error: "Este producto está disponible: puedes comprarlo ahora." };
  const product = { productId: productIdOf(store, title, v), title, store, url: ariaUrlOf(store, title, v), ...(v ? { v } : {}) };
  if (action === "view") return { action, product };
  if (clean(b[HONEYPOT], 200)) return { spam: true };
  let channel = b.channel === "whatsapp" ? "whatsapp" : b.channel === "email" ? "email" : null;
  let contact = "";
  if (b.useAccount === true) {
    if (!accountEmail) return { error: "Tu sesión se cerró. Escribe tu correo o tu WhatsApp." };
    channel = "email";
    contact = String(accountEmail).trim().toLowerCase();
  } else {
    if (!channel) return { error: "Elige cómo te avisamos: correo o WhatsApp." };
    const raw = clean(b.contact, MAX.contact);
    if (channel === "email") {
      if (!isEmail(raw)) return { error: "Revisa tu correo: parece incompleto." };
      contact = raw.toLowerCase();
    } else {
      const phone = normalizePhone(raw);
      if (!phone) return { error: "Revisa tu número de WhatsApp (9 dígitos, o con el código de tu país)." };
      contact = phone;
    }
  }
  return { action, product, channel, contact, ...(accountEmail ? { accountEmail: String(accountEmail).toLowerCase() } : {}) };
}

/** This sender's rate key for this hour: a hash of the address, never the address. */
export function rateKey(ip, kind, now = new Date()) {
  const hour = now.toISOString().slice(0, 13);
  return `rate/${sha(`aria-restock|${kind}|${hour}|${String(ip || "unknown")}`).slice(0, 24)}/${hour}`;
}
async function overRate(store, ip, kind, limit, now) {
  const rk = rateKey(ip, kind, now);
  const seen = (await store.get(rk, { type: "json" })) || { n: 0 };
  if (seen.n >= limit) return true;
  await store.setJSON(rk, { n: seen.n + 1 });
  return false;
}
export const wantKey = (productId, contact) => `want/${productId}/${sha("aria-restock-contact|" + contact).slice(0, 24)}`;

/**
 * The whole POST, with the store injected. Returns { status, body }.
 * The answer never carries anyone's contact but the one she just typed.
 */
export async function receiveRestock({ body, ip, store, accountEmail = null, now = new Date() }) {
  const p = parseRequest(body, { accountEmail });
  if (p.spam) return { status: 200, body: { ok: true } };
  if (p.error) return { status: 400, body: { error: p.error } };
  const at = now.toISOString();
  if (p.action === "view") {
    if (await overRate(store, ip, "view", VIEW_RATE_PER_HOUR, now)) return { status: 200, body: { ok: true } };
    const vk = `view/${p.product.productId}`;
    const cur = (await store.get(vk, { type: "json" })) || { n: 0 };
    await store.setJSON(vk, { ...p.product, n: (Number(cur.n) || 0) + 1, firstAt: cur.firstAt || at, lastAt: at });
    return { status: 200, body: { ok: true } };
  }
  if (await overRate(store, ip, "notify", RATE_PER_HOUR, now)) {
    return { status: 429, body: { error: "Ya recibimos varios pedidos desde aquí. Inténtalo de nuevo en un rato." } };
  }
  const k = wantKey(p.product.productId, p.contact);
  const prior = await store.get(k, { type: "json" });
  if (prior) return { status: 200, body: { ok: true, already: true, contact: p.contact } };
  await store.setJSON(k, {
    ...p.product,
    contact: p.contact,
    channel: p.channel,
    createdAt: at,
    ...(p.accountEmail ? { accountEmail: p.accountEmail } : {}),
  });
  return { status: 200, body: { ok: true, contact: p.contact } };
}

/** The admin's view: every product someone asked about, most asked first. */
export async function listRestock(store) {
  const [{ blobs: wants }, { blobs: views }] = await Promise.all([store.list({ prefix: "want/" }), store.list({ prefix: "view/" })]);
  const by = new Map();
  const slot = (rec) => {
    if (!by.has(rec.productId)) by.set(rec.productId, { productId: rec.productId, title: rec.title, store: rec.store, url: rec.url, ...(rec.v ? { v: rec.v } : {}), views: 0, interested: [] });
    return by.get(rec.productId);
  };
  for (const r of (await Promise.all(views.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean)) slot(r).views = Number(r.n) || 0;
  for (const r of (await Promise.all(wants.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean)) {
    slot(r).interested.push({ contact: r.contact, channel: r.channel, createdAt: r.createdAt, ...(r.accountEmail ? { accountEmail: r.accountEmail } : {}) });
  }
  const products = [...by.values()].map((x) => ({ ...x, interested: x.interested.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))), count: x.interested.length }))
    .sort((a, b) => (b.count - a.count) || (b.views - a.views) || String(a.title).localeCompare(String(b.title)));
  return { products, totalRequests: wants.length };
}
