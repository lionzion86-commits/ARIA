/* ============================================================
   THE RECIPIENT'S DNI PHOTOS (#443, embarque brief 2026-10-22).

   Amex's "Instrucciones de Embarque" packet carries, per consignee,
   photos of BOTH sides of the DNI (template note 8). Danny's rulings:
   collected at CHECKOUT only (never WhatsApp, never a post-purchase
   chase), stored server-side only, never rendered on any page but the
   owner's own, and not hoarded:

     GUESTS  pass-through. Photos build the shipment packet, then are
             deleted 30 days after the order is delivered (the 14-day
             claim window plus customs questions on that guía). A photo
             uploaded at a checkout that never became an order is
             deleted after 48 hours.
     KEY CLUB  stored on the account -- that storage is the perk. Reused
             automatically for later orders; the member can view,
             replace or delete the pack; closing the account deletes it.

   WHAT IS STORED, AND WHERE (Netlify Blobs, never the published site):
     store "dni-docs"   img:<id>   the photo, base64 (a few hundred KB:
                                   the phone compresses before upload)
                        meta:<id>  { id, side, contentType, bytes,
                                     uploadedAt, owner, orderIds,
                                     docNumber, retention }
     store "dni-packs"  <email>    { recipients: [{ docNumber, name,
                                     front, back, updatedAt }] }
   An order record carries only the two ids (order.consigneeDocs), never
   the image. An id is 128 random bits: holding it is what lets a guest's
   checkout attach the photo it just uploaded, and nothing else can.

   NOTHING IS IMPORTED HERE but node:crypto: the stores arrive as
   arguments (the same pattern as _member.js), so every rule below runs
   against a stub store in scripts/test/dni-docs-tests.mjs.
   ============================================================ */
import { randomBytes } from "node:crypto";

export const DNI_DOCS_STORE = "dni-docs";
export const DNI_PACKS_STORE = "dni-packs";

export const SIDES = ["front", "back"];
/* The phone sends a JPEG of a few hundred KB (checkout.html compresses
   to <= 1600 px). The cap is generous for an old phone that could not
   compress, and still far under the function's request limit. */
export const MAX_UPLOAD_BYTES = 1_500_000;
/* A real document photo is never this small; a blank or broken capture is. */
export const MIN_UPLOAD_BYTES = 8_000;
/* An upload has this long to become an order before it is deleted. */
export const UNATTACHED_TTL_MS = 48 * 3600 * 1000;
/* Guests: deleted this long after the order is delivered. */
export const GUEST_RETENTION_AFTER_DELIVERY_MS = 30 * 24 * 3600 * 1000;
/* An order that never got paid keeps nothing past this. */
export const UNPAID_ORDER_TTL_MS = 7 * 24 * 3600 * 1000;
const UNPAID_STATUSES = new Set(["pending_payment", "payment_not_started", "cancelled", "expired", "payment_failed"]);

const ID_RE = /^[a-f0-9]{32}$/;

/** A new photo id: 128 random bits, hex. */
export function newDocId() {
  return randomBytes(16).toString("hex");
}

export function isDocId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

/** The document number as the courier reads it: letters and digits only, upper-case. */
export function normalizeDocNumber(raw) {
  const s = String(raw ?? "").replace(/[\s.-]+/g, "").toUpperCase();
  return /^[A-Z0-9]{8,12}$/.test(s) ? s : null;
}

/* The image types a phone canvas produces; checked by magic bytes, not
   by what the request claims. */
function sniffType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Check one upload. Returns { ok: true, contentType, bytes, base64 } or
 * { ok: false, error } with a Spanish message the page can show.
 */
export function validateUpload({ side, data } = {}) {
  if (!SIDES.includes(side)) return { ok: false, error: "Indica si la foto es del frente o del reverso del documento." };
  if (typeof data !== "string" || !data) return { ok: false, error: "No recibimos la foto. Vuelve a intentarlo." };
  const base64 = data.replace(/^data:[^,]*,/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { ok: false, error: "La foto llegó dañada. Vuelve a intentarlo." };
  const buf = Buffer.from(base64, "base64");
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: "La foto es demasiado pesada. Vuelve a tomarla." };
  if (buf.length < MIN_UPLOAD_BYTES) return { ok: false, error: "La foto salió vacía o muy pequeña. Vuelve a tomarla." };
  const contentType = sniffType(buf);
  if (!contentType) return { ok: false, error: "Ese archivo no es una foto. Sube una imagen JPG o PNG." };
  return { ok: true, contentType, bytes: buf.length, base64 };
}

/** Store a validated upload. owner is the member's email, or null for a guest. */
export async function saveUpload(docs, { side, contentType, bytes, base64 }, { owner = null, now = Date.now() } = {}) {
  const id = newDocId();
  await docs.set(`img:${id}`, base64);
  await docs.setJSON(`meta:${id}`, {
    id, side, contentType, bytes,
    uploadedAt: new Date(now).toISOString(),
    owner: owner || null,
    orderIds: [],
    docNumber: null,
    retention: owner ? "member" : "order",
  });
  return id;
}

async function readMeta(docs, id) {
  if (!isDocId(id)) return null;
  return await docs.get(`meta:${id}`, { type: "json" });
}

/**
 * The photos an order is about to carry: freshly uploaded tokens
 * ({ front, back }), or a Key Club member's registered pack for this
 * document number. Returns { ok, front, back, source } or { ok: false,
 * error } -- the checkout shows the error and nothing is charged.
 */
export async function resolveOrderDocs(stores, { upload = null, docNumber, owner = null, now = Date.now() } = {}) {
  const doc = normalizeDocNumber(docNumber);
  if (!doc) return { ok: false, error: "Falta el número de documento de quien recibe el paquete." };

  if (upload && (upload.front || upload.back)) {
    const out = {};
    for (const side of SIDES) {
      const meta = await readMeta(stores.docs, upload[side]);
      const label = side === "front" ? "frente" : "reverso";
      if (!meta || meta.side !== side) return { ok: false, error: `Falta la foto del ${label} del documento. Súbela de nuevo.` };
      /* A member's photo is only that member's; a guest's photo is
         usable by whoever holds its unguessable id (the checkout that
         uploaded it). */
      if (meta.owner && meta.owner !== owner) return { ok: false, error: `La foto del ${label} no es de esta cuenta. Súbela de nuevo.` };
      const fresh = (meta.orderIds || []).length > 0 || now - Date.parse(meta.uploadedAt) <= UNATTACHED_TTL_MS;
      if (!fresh) return { ok: false, error: `La foto del ${label} venció. Súbela de nuevo.` };
      out[side] = meta.id;
    }
    return { ok: true, front: out.front, back: out.back, source: "upload", docNumber: doc };
  }

  if (owner) {
    const pack = await packFor(stores.packs, owner, doc);
    if (pack) return { ok: true, front: pack.front, back: pack.back, source: "keyclub", docNumber: doc };
  }
  return { ok: false, error: "Sube las fotos del documento (frente y reverso) de quien recibe el paquete." };
}

/** A member's registered recipient for a document number, or null. */
export async function packFor(packs, email, docNumber) {
  if (!email) return null;
  const rec = await packs.get(email, { type: "json" });
  const doc = normalizeDocNumber(docNumber);
  return (rec && Array.isArray(rec.recipients) ? rec.recipients : []).find((r) => r.docNumber === doc) || null;
}

/**
 * Tie the photos to the order that now needs them, and -- for a member
 * uploading new photos -- register them on the account (the Key Club
 * perk), replacing that document's previous pack.
 */
export async function attachToOrder(stores, { front, back, orderId, docNumber, name = "", owner = null, source, now = Date.now() }) {
  const doc = normalizeDocNumber(docNumber);
  for (const id of [front, back]) {
    const meta = await readMeta(stores.docs, id);
    if (!meta) continue;
    const orderIds = Array.from(new Set([...(meta.orderIds || []), orderId]));
    await stores.docs.setJSON(`meta:${id}`, { ...meta, orderIds, docNumber: doc });
  }
  if (owner && source === "upload") {
    await registerPack(stores, owner, { docNumber: doc, name, front, back, now });
  }
}

/** Register (or replace) a member's pack for one document number. */
export async function registerPack(stores, email, { docNumber, name = "", front, back, now = Date.now() }) {
  const doc = normalizeDocNumber(docNumber);
  const rec = (await stores.packs.get(email, { type: "json" })) || { recipients: [] };
  const recipients = Array.isArray(rec.recipients) ? rec.recipients : [];
  const old = recipients.find((r) => r.docNumber === doc);
  const next = recipients.filter((r) => r.docNumber !== doc);
  next.push({ docNumber: doc, name: String(name || "").slice(0, 120), front, back, updatedAt: new Date(now).toISOString() });
  await stores.packs.setJSON(email, { recipients: next });
  /* The pack's photos are now the account's: kept until the member
     deletes them or closes the account, whoever uploaded them. A photo
     uploaded as a guest a minute before signing up (the Key Club invite
     at checkout) would otherwise still carry the guest rule and be
     purged 30 days after delivery from under the saved pack. */
  for (const id of [front, back]) {
    const meta = await readMeta(stores.docs, id);
    if (meta && (meta.owner !== email || meta.retention !== "member")) {
      await stores.docs.setJSON(`meta:${id}`, { ...meta, owner: email, retention: "member" });
    }
  }
  if (old) await releaseDocs(stores, [old.front, old.back].filter((id) => id !== front && id !== back));
}

/**
 * Mi cuenta "Reemplazar": new photos for a saved document, outside any
 * order. Only photos this member uploaded while signed in qualify (a
 * guest-uploaded token cannot be pulled into an account).
 */
export async function replacePack(stores, email, { docNumber, name = "", front, back, now = Date.now() } = {}) {
  if (!email) return { ok: false, error: "Inicia sesión en tu cuenta Key Club." };
  const r = await resolveOrderDocs(stores, { upload: { front, back }, docNumber, owner: email, now });
  if (!r.ok) return r;
  for (const id of [r.front, r.back]) {
    const meta = await readMeta(stores.docs, id);
    if (!meta || meta.owner !== email) return { ok: false, error: "Sube las fotos desde tu cuenta, con tu sesión iniciada." };
  }
  const prev = await packFor(stores.packs, email, r.docNumber);
  await registerPack(stores, email, { docNumber: r.docNumber, name: name || (prev && prev.name) || "", front: r.front, back: r.back, now });
  return { ok: true, docNumber: r.docNumber };
}

/** What the account page may show: names and numbers, never the photo ids. */
export async function listPack(packs, email) {
  const rec = await packs.get(email, { type: "json" });
  return (rec && Array.isArray(rec.recipients) ? rec.recipients : [])
    .map((r) => ({ docNumber: r.docNumber, name: r.name, updatedAt: r.updatedAt }));
}

/** The member deletes one recipient's pack (or all, with docNumber null). */
export async function deletePack(stores, email, docNumber = null) {
  const rec = (await stores.packs.get(email, { type: "json" })) || { recipients: [] };
  const recipients = Array.isArray(rec.recipients) ? rec.recipients : [];
  const doc = docNumber == null ? null : normalizeDocNumber(docNumber);
  const gone = recipients.filter((r) => doc == null || r.docNumber === doc);
  const kept = recipients.filter((r) => !(doc == null || r.docNumber === doc));
  if (kept.length) await stores.packs.setJSON(email, { recipients: kept });
  else await stores.packs.delete(email);
  await releaseDocs(stores, gone.flatMap((r) => [r.front, r.back]));
  return gone.length;
}

/* A photo leaving an account: deleted now unless an order still needs
   it for its packet, in which case it falls under the guest rule (30
   days after that order is delivered). */
async function releaseDocs(stores, ids) {
  for (const id of ids) {
    const meta = await readMeta(stores.docs, id);
    if (!meta) continue;
    if ((meta.orderIds || []).length) await stores.docs.setJSON(`meta:${id}`, { ...meta, retention: "order" });
    else await deleteDoc(stores.docs, id);
  }
}

export async function deleteDoc(docs, id) {
  if (!isDocId(id)) return;
  await docs.delete(`img:${id}`);
  await docs.delete(`meta:${id}`);
}

/** The photo itself, for its owner only (the account page's "ver"). */
export async function readImage(docs, id) {
  const meta = await readMeta(docs, id);
  if (!meta) return null;
  const base64 = await docs.get(`img:${id}`);
  return base64 ? { meta, base64: String(base64) } : null;
}

/**
 * THE RETENTION RULE, one photo at a time (the daily purge runs this).
 * orders: { [orderId]: { status, createdAt, deliveredAt } } for the
 * photo's orders; memberExists: whether its owner's account still exists.
 * Returns { action: "keep" | "delete", reason }.
 */
export function purgeDecision(meta, { now = Date.now(), orders = {}, memberExists = true } = {}) {
  if (!meta) return { action: "delete", reason: "no-metadata" };
  if (meta.retention === "member") {
    return memberExists ? { action: "keep", reason: "key-club-pack" } : { action: "delete", reason: "account-closed" };
  }
  const ids = meta.orderIds || [];
  if (!ids.length) {
    return now - Date.parse(meta.uploadedAt) > UNATTACHED_TTL_MS
      ? { action: "delete", reason: "never-became-an-order" }
      : { action: "keep", reason: "checkout-in-progress" };
  }
  /* Every order the photo serves must be done with it. */
  for (const id of ids) {
    const o = orders[id];
    if (!o) continue;  // an order that no longer exists needs nothing
    if (o.deliveredAt) {
      if (now - Date.parse(o.deliveredAt) <= GUEST_RETENTION_AFTER_DELIVERY_MS) return { action: "keep", reason: "within-30-days-of-delivery" };
      continue;
    }
    if (UNPAID_STATUSES.has(o.status) && now - Date.parse(o.createdAt) > UNPAID_ORDER_TTL_MS) continue;
    return { action: "keep", reason: "order-not-delivered-yet" };
  }
  return { action: "delete", reason: "orders-done" };
}
