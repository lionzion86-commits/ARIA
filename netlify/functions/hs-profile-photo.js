// ARIA HOME SHIELD -- GET hs-profile-photo?p=<proId>&i=<photoId>&s=card|full. A profile photo.
// Served only for a verified pro with a complete profile, or to the owner pro / an admin
// (desk preview). Never a public storage URL. Cache-Control: private, max-age=300.
import { endpoint, fail, getJSON, isId, baseHeaders } from "./_hs-store.js";
import { proFromEvent, adminFromEvent } from "./_hs-auth.js";
import { listable, PHOTO_MIME } from "./_hs-profiles.js";

export default endpoint({ methods: ["GET"], rate: { bucket: "profile-photo", limit: 2000, windowSec: 3600, methods: ["GET"] } }, async ({ event, S, query }) => {
  const size = query.s === "full" ? "full" : "card";
  if (!isId("pro", query.p) || !/^f_[0-9a-f]{24}$/.test(String(query.i || ""))) return fail(404, "not_found", "Not found");
  const pro = await getJSON(S.pros, query.p);
  if (!pro || !((pro.profile && pro.profile.photos) || []).some((x) => x.id === query.i)) return fail(404, "not_found", "Not found");
  if (!listable(pro)) {
    const me = await proFromEvent(event, S);
    if (!(me && me.id === pro.id) && !(await adminFromEvent(event, S))) return fail(404, "not_found", "Not found");
  }
  const meta = await getJSON(S.photos, `${pro.id}/${query.i}/meta`);
  const bin = await S.photos.get(`${pro.id}/${query.i}/${size}`, { type: "arrayBuffer" });
  if (!meta || !bin) return fail(404, "not_found", "Not found");
  return { statusCode: 200, headers: { ...baseHeaders("GET, OPTIONS"), "Content-Type": PHOTO_MIME[meta[size]] || "image/jpeg", "Cache-Control": "private, max-age=300" },
    body: Buffer.from(bin).toString("base64"), isBase64Encoded: true };
});
