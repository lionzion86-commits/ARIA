// ARIA HOME SHIELD -- hs-partner-admin. Admin only (shop session on ADMIN_EMAILS, as admin.html).
//   GET -> { settings, partners: [{ ...pro, balance, membershipActive }], ledger: [...last 300] }
//   GET ?doc=<deskDocId> -> the desk's uploaded license / insurance certificate (private, no-store)
//   POST { action: "settings", patch: { membershipRequired?, membershipMonthlyUsd?, paymentsLive?, perLeadEnabled?: { desk: bool }, ringSeconds? } }
//   POST { action: "grant", proId, credits /* 1..100 */, note? }     -> { entry }   (testing / goodwill; no money)
//   POST { action: "refund", proId, credits, note? }                  -> { entry }   (removes credits; money back is done in Stripe)
//   POST { action: "membership", proId, active }                      -> { pro }     (manual until Stripe subscriptions)
//   POST { action: "verifyclaim", caseId, offerId }                   -> { paid }    (admin-verified claim: the one debit)
import { endpoint, reply, fail, getJSON, loadAll, isId, str, proSelf, baseHeaders } from "./_hs-store.js";
import { adminFromEvent } from "./_hs-auth.js";
import { readSettings, writeSettings, appendLedger, balanceOf, allLedger, settleClaim, membershipOk, DESKS } from "./_hs-partners.js";

export default endpoint({ methods: ["GET", "POST"] }, async ({ event, S, body, query, now }) => {
  const admin = await adminFromEvent(event, S);
  if (!admin) return fail(403, "admin_only", "Admins only");
  if (event.httpMethod === "GET") {
    if (query.doc) {
      if (!isId("doc", query.doc)) return fail(404, "not_found", "Not found");
      const meta = await getJSON(S.docs, `deskdoc/meta/${query.doc}`);
      const bin = await S.docs.get(`deskdoc/bin/${query.doc}`, { type: "arrayBuffer" });
      if (!meta || !bin) return fail(404, "not_found", "Not found");
      return { statusCode: 200, headers: { ...baseHeaders("GET"), "Content-Type": meta.type, "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${meta.name.replace(/["\\]/g, "_")}"` },
        body: Buffer.from(bin).toString("base64"), isBase64Encoded: true };
    }
    const settings = await readSettings(S);
    const pros = (await loadAll(S.pros, "p_")).filter((p) => DESKS.includes(p.desk));
    const partners = [];
    for (const p of pros) partners.push({ ...proSelf(p), balance: await balanceOf(S, p), membershipActive: membershipOk(p, settings) });
    return reply(200, { settings, partners, ledger: (await allLedger(S)).slice(0, 300) });
  }
  const a = body.action;
  if (a === "settings") {
    const r = await writeSettings(S, body.patch || {}, admin, now);
    return r.error ? fail(400, "bad_settings", r.error) : reply(200, r);
  }
  if (a === "grant" || a === "refund") {
    const p = isId("pro", body.proId) && await getJSON(S.pros, body.proId);
    const n = Number(body.credits);
    if (!p) return fail(404, "not_found", "No such partner");
    if (!(Number.isInteger(n) && n >= 1 && n <= 100)) return fail(400, "bad_credits", "credits must be 1..100");
    const r = await appendLedger(S, { proId: p.id, type: a, credits: a === "grant" ? n : -n, by: admin, note: str(body.note, 200) || null }, now);
    return reply(200, r);
  }
  if (a === "membership") {
    const p = isId("pro", body.proId) && await getJSON(S.pros, body.proId);
    if (!p || typeof body.active !== "boolean") return fail(400, "bad_request", "Send proId and active");
    p.membership = { active: body.active, setAt: new Date(now).toISOString(), setBy: admin };
    await S.pros.setJSON(p.id, p);
    return reply(200, { pro: proSelf(p) });
  }
  if (a === "verifyclaim") {
    const c = isId("case", body.caseId) && await getJSON(S.cases, body.caseId);
    const o = isId("offer", body.offerId) && await getJSON(S.offers, body.offerId);
    if (!c || !o || o.caseId !== c.id || !o.ring) return fail(404, "not_found", "No such claim");
    const r = await settleClaim(S, c, o, { by: admin, now });
    return r.error ? fail(...r.error) : reply(200, { paid: true, entry: r.entry || null });
  }
  return fail(400, "bad_action", "Unknown action");
});
