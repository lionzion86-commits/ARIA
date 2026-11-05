// ARIA HOME SHIELD -- GET hs-pro-me. Who is signed in.
//   200 { pro, pending }   401 { code: "signin" }
import { endpoint, reply, fail, proSelf } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";

export const handler = endpoint({ methods: ["GET"] }, async ({ event, S }) => {
  const pro = await proFromEvent(event, S);
  if (!pro) return fail(401, "signin", "Sign in");
  return reply(200, { pro: proSelf(pro), pending: !pro.verified });
});
