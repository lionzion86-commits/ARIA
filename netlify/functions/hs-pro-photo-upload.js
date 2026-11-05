// ARIA HOME SHIELD -- POST hs-pro-photo-upload. Add a gallery photo (desk "My profile").
//   POST { card: { data /* base64 */, w, h }, full: { data, w, h } }   -> { photo: { id, w, h, main }, profile }
// The page re-encodes on a canvas (drops EXIF) and sends two sizes: card (<= 480 px) and full
// (<= 1600 px). JPEG / PNG / WebP / HEIC by magic bytes, <= 4 MB each; a JPEG that still carries
// Exif GPS is refused (a photo must never leak a home location). Private store hs-profile-photos.
import { endpoint, reply, fail, newId } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";
import { photoType, jpegHasGps, MAX_PHOTOS, normalizePhotos, withComplete } from "./_hs-profiles.js";
import { selfView } from "./hs-pro-profile-self.js";

const MAX = 4 * 1024 * 1024;
function take(part) {
  if (!part || typeof part.data !== "string") return { error: "missing" };
  const buf = Buffer.from(part.data.replace(/^data:[^,]*,/, ""), "base64");
  const t = photoType(buf);
  if (!t) return { error: "type" };
  if (buf.length > MAX) return { error: "size" };
  if (t === "jpg" && jpegHasGps(buf)) return { error: "gps" };
  const w = Math.round(Number(part.w)), h = Math.round(Number(part.h));
  return { buf, t, w: w > 0 && w < 10000 ? w : null, h: h > 0 && h < 10000 ? h : null };
}
const toAB = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

export default endpoint({ methods: ["POST"], maxBody: 6 * 1024 * 1024, rate: { bucket: "photo-upload", limit: 60, windowSec: 3600 } }, async ({ event, S, body, now }) => {
  const pro = await proFromEvent(event, S);
  if (!pro) return fail(401, "signin", "Sign in");
  const profile = pro.profile || { kind: "individual", photos: [], specialties: [] };
  if ((profile.photos || []).length >= MAX_PHOTOS) return fail(409, "too_many", "Up to 12 photos");
  const card = take(body.card), full = take(body.full || body.card);
  for (const x of [card, full]) {
    if (x.error === "gps") return fail(422, "exif_gps", "This photo still carries GPS location data. Re-save it without location and try again.");
    if (x.error === "type" || x.error === "missing") return fail(415, "bad_type", "JPEG, PNG, WebP or HEIC only");
    if (x.error === "size") return fail(413, "too_large", "Up to 4 MB per photo");
  }
  const id = newId("ph").replace(/^ph_/, "f_");
  await S.photos.set(`${pro.id}/${id}/card`, toAB(card.buf));
  await S.photos.set(`${pro.id}/${id}/full`, toAB(full.buf));
  await S.photos.setJSON(`${pro.id}/${id}/meta`, { id, card: card.t, full: full.t, createdAt: new Date(now).toISOString() });
  profile.photos = normalizePhotos([...(profile.photos || []), { id, w: full.w || card.w, h: full.h || card.h, main: !(profile.photos || []).length }]);
  pro.profile = withComplete(profile, now);
  await S.pros.setJSON(pro.id, pro);
  return reply(200, { photo: pro.profile.photos.find((p) => p.id === id), ...selfView(pro) });
});
