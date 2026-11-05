// ARIA HOME SHIELD -- POST hs-pro-photo-delete { photoId } -> the profile without it (the next photo becomes main).
import { endpoint, reply, fail } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";
import { normalizePhotos, withComplete } from "./_hs-profiles.js";
import { selfView } from "./hs-pro-profile-self.js";

export default endpoint({ methods: ["POST"], rate: { bucket: "photo-edit", limit: 240, windowSec: 3600 } }, async ({ event, S, body, now }) => {
  const pro = await proFromEvent(event, S);
  if (!pro) return fail(401, "signin", "Sign in");
  const photos = (pro.profile && pro.profile.photos) || [];
  if (!photos.some((p) => p.id === body.photoId)) return fail(404, "not_found", "No such photo");
  for (const k of ["card", "full", "meta"]) await S.photos.delete(`${pro.id}/${body.photoId}/${k}`);
  pro.profile = withComplete({ ...pro.profile, photos: normalizePhotos(photos.filter((p) => p.id !== body.photoId)) }, now);
  await S.pros.setJSON(pro.id, pro);
  return reply(200, selfView(pro));
});
