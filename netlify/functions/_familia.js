/* ============================================================
   FAMILIA (#443 c.6364959264, Danny's design). An account Danny names
   buys products at Aria's cost: the margin comes off the product line,
   freight stays at the standard $13/kg, import tax passes through as
   always, and nothing stacks (no Key Club 5%, no commission, no combo
   discount -- there is no margin to give them from).

   The flag lives on the account (users store, `familia: true`) and is
   read server-side from the session. It is never a code: a code leaks,
   an account flag does not. Danny adds or removes a name through
   admin-familia.js; nothing customer-facing announces it.
   ============================================================ */
import { getStore } from "@netlify/blobs";

/** Is this signed-in account on Danny's Familia list? Never throws. */
export async function isFamiliaAccount(email, users = null) {
  if (!email) return false;
  try {
    const u = await (users || getStore("users")).get(email, { type: "json" });
    return Boolean(u && u.familia === true);
  } catch {
    return false;
  }
}
