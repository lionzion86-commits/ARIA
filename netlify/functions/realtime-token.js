/* ============================================================
   /api/realtime-token — THE NAME THE SPEC CURLS.

   This is not a second implementation. It is the same handler as
   aria-realtime-session, served under the path the build spec names,
   because four rounds of testing were spent on the question "does the
   endpoint exist?" and the answer depended on which URL you asked.

   netlify.toml redirects /api/realtime-token here, so:

     curl -X POST https://<preview>/api/realtime-token

   exercises exactly the code the page runs. One handler, two names,
   nothing to drift.
   ============================================================ */
export { handler } from "./aria-realtime-session.js";
