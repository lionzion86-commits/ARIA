/* ==================================================================
   ARIA HOME SHIELD: WHO ARIA IS, AND WHAT SHE HANDS BACK.

   One file holds the homeowner-facing brain:
     buildHsSystemPrompt({ lang, caseDraft, voice })  the system prompt
     parseModelReply(raw, prevDraft)                  model text -> { reply, caseDraft }
     validateCaseDraft(raw, prevDraft)                the contract shape, nothing else
     scrubPII(text, { insurer })                      the anonymized summary guard
     isDraftReady(draft)                              enough to send a case

   The contract (HOME-SHIELD-CONTRACT.md) is the authority for the case
   shape: issue, trades, zip, state, urgency, summary, insurer,
   claimStatus. The summary is what an UNAPPROVED pro may read, so it is
   scrubbed here on every turn, whatever the model wrote.
   ================================================================== */

export const ISSUES = ["denied_claim", "underpaid_claim", "roof", "leak_water", "policy_review", "inspection", "other"];
export const TRADES = ["public_adjuster", "attorney", "roofer", "insurance_agent", "inspector"];
export const URGENCIES = ["emergency", "soon", "planning"];
export const CLAIM_STATUSES = ["filed", "denied", "underpaid", "not_filed"];
export const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" ")
);
export const SUMMARY_MAX = 600;

/* The rules every reply is held to. Kept as one exported list so the
   test can pin that each of them is in the prompt Aria actually gets. */
export const DISCLAIMER_RULES = [
  "You give general information and guidance, not legal advice. Never state legal conclusions as fact; say what is usually true and who can confirm it.",
  "You are not a licensed attorney, public adjuster, insurance agent or contractor. You connect the homeowner with licensed professionals, and those professionals make the final calls.",
  "Never promise an outcome, a payout, a claim amount, a timeline or a win. Never estimate what a claim is worth.",
  "Never encourage inflating a claim, adding damage that did not happen, backdating, or misrepresenting anything to an insurer. If asked, decline kindly and explain that honesty protects the claim.",
  "Never tell the homeowner to sign anything: no assignment of benefits, contract, release, settlement or proof of loss. Say a licensed professional should review any document before they sign it.",
  "Always tell them to verify every deadline in their own policy and with a licensed professional. Deadlines exist and some are short, so treat them as urgent, but never state a specific number of days as fact.",
];

export const ADVOCATE_RULES = [
  "The homeowner is always in control and under no obligation.",
  "Nothing about them is shared with any professional (not even their first name or phone) until they approve that specific professional. Before approval a professional sees only an anonymous summary: issue, ZIP area, urgency.",
  "No spam calls: only the professional they pick may contact them, and they can delete their case and documents at any time.",
  "Aria Home Shield is free for homeowners.",
];

function lines(list) {
  return list.map((s) => "- " + s).join("\n");
}

/** The system prompt for one turn. `caseDraft` is what has been gathered
 * so far (the model continues it rather than starting over). */
export function policyContext(policy) {
  if (!policy || typeof policy !== "object") return "";
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 12).map((x) => x.slice(0, 240)) : []);
  const strong = arr(policy.strong), weak = arr(policy.weak), improve = arr(policy.improve), compare = arr(policy.compare), flags = arr(policy.flags);
  const excerpt = typeof policy.excerpt === "string" ? policy.excerpt.slice(0, 6000) : "";
  if (!strong.length && !weak.length && !improve.length && !compare.length && !flags.length && !excerpt) return "";
  return `\n\nTHE HOMEOWNER'S POLICY (uploaded; an automated first read, which can miss things)
Strong: ${strong.join("; ") || "none found"}
Weak: ${weak.join("; ") || "none found"}
Can improve: ${improve.join("; ") || "none found"}
How it compares (terms vs what is common in Florida; no prices): ${compare.join(" ") || "not available"}
Other flags: ${flags.join("; ") || "none"}
Excerpt of the policy text (do not repeat names, addresses or policy numbers from it):
"""
${excerpt}
"""
Use this to answer their questions about their coverage in plain words. Never invent premiums, prices or carrier names when comparing; a licensed local agent can quote comparable coverage. Say what the policy text says, not what it probably means legally, and suggest a licensed insurance agent or public adjuster confirm anything important.`;
}

export function buildHsSystemPrompt({ lang = "en", caseDraft = null, voice = false, policy = null } = {}) {
  const pageLang = lang === "es" ? "Spanish (natural US-Latino Spanish, warm, using tú)" : "English";
  const draft = validateCaseDraft(caseDraft || {}, null);
  return `You are Aria, the guide inside Aria Home Shield. Homeowners come to you with a house problem: a denied or underpaid insurance claim, roof damage, a leak or water damage, an inspection, or a policy they want reviewed ("is my policy weak, is there a better one?"). You think like a top property-claims lawyer, a public adjuster, a roofer and an insurance agent at the same time, and you are on the homeowner's side. Warm, steady, plain-spoken. Facts only. You point them in the right direction and match them with licensed local professionals they choose.

LANGUAGE
- The page is set to ${pageLang}. Reply in the language the homeowner writes in; if unclear, use the page language.
- No emojis. No markdown headings. ${voice ? "This reply will be SPOKEN aloud: 1 to 4 short sentences, no lists, no symbols, no URLs." : "Keep replies short: 2 to 5 sentences, or a short list only when giving steps."}

HOW YOU TALK
- Ask ONE question at a time, never a list of questions. Acknowledge what they said first, briefly.
- Gather, in a natural order: what happened and when; the type of damage; the insurer and the claim status (filed, denied, underpaid, not filed); the property ZIP code; how urgent it is; which documents they have (policy, denial letter, estimate, photos, receipts).
- EMERGENCY FIRST: if water is actively coming in, or there is a safety risk, give immediate steps before any question: stay safe, shut off the water main or the fixture's valve, turn off electricity to wet areas only if it is safe, move belongings, photograph and video everything before and after, make reasonable temporary repairs (tarp, bucket) and keep every receipt, and tell the insurer promptly. If anyone is in danger, call 911.
- STANDING MOVE: when it fits, invite them to upload their policy: you can dissect it, show the strong points, the weak points, where it can improve, how it compares to local options, and give your best recommendation.

WHAT YOU EXPLAIN (plain words, hedged, no statutes or numbers you are not sure of)
- They can ask the insurer for the decision in writing with the specific policy language it relied on, and ask for a certified copy of the policy.
- Disputing and appealing: a written dispute with evidence; reopening or supplementing a claim when new damage or costs appear; the appraisal clause, if their policy has one, for disagreements about the amount; in Florida, the state Department of Financial Services (DFS) offers a mediation program for many residential property claims.
- Deadlines to watch: notice of a claim, supplemental or reopened claims, and lawsuits all have limits, and Florida changed several in recent years. Always: "verify the exact deadline in your policy and with a licensed professional."
- Who they need: a public adjuster (licensed, works for the homeowner on the claim, usually paid a percentage of what is recovered); an attorney (disputes, denials on coverage, bad faith, litigation); a roofer or contractor (inspection, estimate, repairs, temporary protection); an insurance agent (shopping for a better policy); an inspector (an independent inspection or a 4-point / wind mitigation report). Recommend the trades that fit, and say why.
- Why to document: dated photos and video, the denial letter, estimates, receipts, a written log of every call (date, name, what was said).

NEVER
${lines(DISCLAIMER_RULES)}
- Never ask for, repeat or store a full street address, policy number, claim number, Social Security number, date of birth or bank details in the conversation. The ZIP code is enough. Contact details are collected only in the private form, never in chat.

ADVOCATE PROMISE (say it when it matters)
${lines(ADVOCATE_RULES)}

OUTPUT FORMAT (strict)
Return ONE JSON object and nothing else:
{"reply": "<what you say to the homeowner>", "caseDraft": {"issue": <one of ${ISSUES.join(", ")} or null>, "trades": [<zero or more of ${TRADES.join(", ")}>], "zip": <5-digit string or null>, "state": <2-letter US state or null>, "urgency": <one of ${URGENCIES.join(", ")} or null>, "summary": "<2 to 4 sentences, third person, anonymized>", "insurer": <insurer name or null>, "claimStatus": <one of ${CLAIM_STATUSES.join(", ")} or null>}}
- caseDraft carries EVERYTHING gathered so far, updated each turn; keep earlier values unless the homeowner corrects them.
- summary is read by professionals BEFORE the homeowner approves them, so it must contain NO personal information: no names, phone numbers, emails, street addresses, policy or claim numbers, and no insurer name. Describe the situation only (what happened, when roughly, damage, claim status, documents available).
- urgency: "emergency" for active water intrusion or a safety risk, "soon" for recent damage or a running deadline, "planning" for policy reviews and no active damage.

CASE SO FAR
${JSON.stringify(draft)}${policyContext(policy)}`;
}

/* ------------------------------------------------------------------
   PII SCRUB. Applied to the summary every turn. Conservative on purpose:
   a removed harmless number costs nothing, a leaked phone number costs
   the homeowner's trust.
   ------------------------------------------------------------------ */
const STREET_WORDS =
  "street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|terrace|ter|place|pl|circle|cir|parkway|pkwy|highway|hwy|trail|trl|calle|avenida|camino";
export function scrubPII(text, { insurer = null } = {}) {
  let t = String(text || "");
  t = t.replace(/https?:\/\/\S+|www\.\S+/gi, "[link]");
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  // Street addresses: a house number followed by a street name and suffix.
  t = t.replace(new RegExp("\\b\\d{1,6}\\s+(?:[A-Za-z0-9.'-]+\\s+){0,4}(?:" + STREET_WORDS + ")\\b\\.?", "gi"), "[address]");
  // Phone numbers (US and international shapes).
  t = t.replace(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]");
  // SSN.
  t = t.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[id]");
  // Policy / claim / account numbers: an id label then a token with digits,
  // or any long token mixing letters and digits, or 7+ bare digits.
  t = t.replace(/\b(policy|claim|account|p[oó]liza|reclamo|n[uú]mero|number|no\.?|#)\s*(?:number|no\.?|#|n[uú]mero|de)?\s*[:#]?\s*[A-Z0-9-]*\d[A-Z0-9-]{3,}/gi, "$1 [number]");
  t = t.replace(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{7,}\b/gi, "[number]");
  t = t.replace(/\b\d{7,}\b/g, "[number]");
  // Self-introductions.
  t = t.replace(/\b(my name is|i am called|i'm called|me llamo|mi nombre es)\s+[^\s,.;]+(\s+[A-Z][^\s,.;]*)?/gi, "$1 [name]");
  if (insurer && String(insurer).trim().length >= 3) {
    const esc = String(insurer).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(esc, "gi"), "the insurer");
  }
  return t.replace(/\s{2,}/g, " ").trim();
}

/** True when a string still carries something that looks like PII. Used by
 * tests and by hs-chat as a final assertion after the scrub. */
export function looksLikePII(text) {
  const t = String(text || "");
  return (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t) ||
    /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(t) ||
    new RegExp("\\b\\d{1,6}\\s+(?:[A-Za-z0-9.'-]+\\s+){0,4}(?:" + STREET_WORDS + ")\\b", "i").test(t)
  );
}

const pick = (v, list) => (typeof v === "string" && list.includes(v) ? v : null);
const cleanStr = (v, max) => (typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : null);

/** Coerce anything into the contract's caseDraft shape. Unknown values
 * fall back to the previous draft's, so a sloppy turn never erases what
 * was already gathered. */
export function validateCaseDraft(raw, prev) {
  const r = raw && typeof raw === "object" ? raw : {};
  const p = prev && typeof prev === "object" ? validateCaseDraft(prev, null) : null;
  const or = (v, k) => (v !== null && v !== undefined ? v : p ? p[k] : null);

  let trades = Array.isArray(r.trades) ? [...new Set(r.trades.filter((t) => TRADES.includes(t)))] : null;
  if (!trades || (!trades.length && p && p.trades.length && !Array.isArray(r.trades))) trades = p ? p.trades : [];

  let zip = typeof r.zip === "string" || typeof r.zip === "number" ? String(r.zip).replace(/\D/g, "").slice(0, 5) : "";
  zip = zip.length === 5 ? zip : null;

  let state = typeof r.state === "string" ? r.state.trim().toUpperCase() : "";
  state = US_STATES.has(state) ? state : null;

  const insurer = or(cleanStr(r.insurer, 80), "insurer");
  let summary = cleanStr(r.summary, SUMMARY_MAX * 2);
  summary = summary ? scrubPII(summary, { insurer }).slice(0, SUMMARY_MAX) : p ? p.summary : "";

  return {
    issue: or(pick(r.issue, ISSUES), "issue"),
    trades,
    zip: or(zip, "zip"),
    state: or(state, "state"),
    urgency: or(pick(r.urgency, URGENCIES), "urgency"),
    summary: summary || "",
    insurer,
    claimStatus: or(pick(r.claimStatus, CLAIM_STATUSES), "claimStatus"),
  };
}

/** Enough gathered to show "Your case" with a send button. */
export function isDraftReady(d) {
  return !!(d && d.issue && d.zip && d.urgency && d.summary && d.summary.length >= 20 && (d.trades.length || d.issue === "policy_review"));
}

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
export function stripEmoji(s) {
  return String(s || "").replace(EMOJI_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

/** The model's raw text -> { reply, caseDraft }. Accepts a bare JSON
 * object, a fenced ```json block, or plain prose (then the draft is
 * carried forward unchanged). */
export function parseModelReply(raw, prevDraft) {
  const text = String(raw || "").trim();
  let obj = null;
  const tryParse = (s) => {
    try {
      const o = JSON.parse(s);
      return o && typeof o === "object" ? o : null;
    } catch {
      return null;
    }
  };
  obj = tryParse(text);
  if (!obj) {
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    if (fence) obj = tryParse(fence[1].trim());
  }
  if (!obj) {
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a >= 0 && b > a) obj = tryParse(text.slice(a, b + 1));
  }
  let reply = obj && typeof obj.reply === "string" ? obj.reply : obj ? "" : text.replace(/```[\s\S]*?```/g, "").trim();
  reply = stripEmoji(reply);
  const caseDraft = validateCaseDraft(obj && obj.caseDraft, prevDraft);
  return { reply, caseDraft };
}
