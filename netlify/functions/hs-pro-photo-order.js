// ARIA HOME SHIELD -- POST hs-pro-photo-order { order: [photoId...], main?: photoId } -> the profile.
// The order is the gallery order customers swipe; main is the card photo.
import { endpoint, reply, fail } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";
import { normalizePhotos, withComplete } from "./_hs-profiles.js";
import { selfView } from "./hs-pro-profile-self.js";

export default endpoint({ methods: ["POST"], rate: { bucket: "photo-edit", limit: 240, windowSec: 3600 } }, async ({ event, S, body, now }) => {
  const pro = await proFromEvent(event, S);
  if (!pro) return fail(401, "signin", "Sign in");
  const photos = (pro.profile && pro.profile.photos) || [];
  const ids = photos.map((p) => p.id);
  const order = Array.isArray(body.order) ? body.order : ids;
  if (order.length !== ids.length || !order.every((id) => ids.includes(id)) || new Set(order).size !== ids.length) return fail(400, "bad_order", "Send every photo id once");
  const main = body.main && ids.includes(body.main) ? body.main : (photos.find((p) => p.main) || {}).id;
  const next = order.map((id) => ({ ...photos.find((p) => p.id === id), main: id === main }));
  pro.profile = withComplete({ ...pro.profile, photos: normalizePhotos(next) }, now);
  await S.pros.setJSON(pro.id, pro);
  return reply(200, selfView(pro));
});
