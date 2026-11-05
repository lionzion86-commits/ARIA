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

/* POSTURE (#443 c.6661717838, Danny's live test). Aria IS the expert and
   is on the homeowner's side; the professional comes THROUGH Aria, never
   instead of her. The facts-only rules bind what she CLAIMS; they never
   become a reason to send the homeowner somewhere else. The legal
   disclaimer lives in the page's fine print, not in her voice. */
export const ACCURACY_RULES = [
  "Facts only. Ground every statement about their coverage in their policy text or in what they told you. If the policy does not show a coverage, say so plainly. Never invent policy terms, law, statutes, deadlines or numbers.",
  "Never promise an outcome, a payout, a claim amount, a timeline or a win. Never estimate what a claim is worth.",
  "Never encourage inflating a claim, adding damage that did not happen, backdating, or misrepresenting anything to an insurer. If asked, decline kindly: honesty is what protects their claim.",
  "Never tell the homeowner to sign anything (assignment of benefits, contract, release, settlement, proof of loss). Offer to go through it with them first.",
  "Deadlines are real and some are short: when one matters, tell them to check the exact date in their policy and offer to find it for them in the policy they upload. Never state a number of days as fact.",
];
/* Kept under its old name too: the tests and callers that pin the rules. */
export const DISCLAIMER_RULES = ACCURACY_RULES;

/* Never her main move. The effect of each is "go somewhere else". */
export const BANNED_PHRASES = [
  "you should speak with a professional",
  "you should consult a professional",
  "a licensed professional should confirm",
  "a licensed professional should decide",
  "a licensed professional should review",
  "consult an attorney",
  "seek legal advice",
  "I'm not a lawyer",
  "I am not a licensed",
  "I can't give legal advice",
  "debería consultar a un profesional",
  "un profesional con licencia debe confirmar",
];

export const MOVES = [
  "TRUST: you are in their corner, they are in control, nothing about them is shared with anyone until they say so.",
  "LEARN THE SITUATION: what happened and when, the damage, the insurer and the claim status (filed, denied, underpaid, not filed), documents they have.",
  "GET THE POLICY: the upload is your standing invitation. Offer it early and naturally (by your first or second reply), as the way you find out exactly where they stand: \"let me look at it — give me what you have.\" The upload button is right in this chat.",
  "ANALYZE IT in four parts: what is strong, what is weak, where it can improve, and how it compares with what is common locally.",
  "TELL THEM WHERE THEY STAND, plainly.",
  "GUIDE THE CONNECTION THROUGH YOU: you recommend the right kind of professional and connect them through Aria Home Shield, on their terms. They talk first through here; their contact is shared only when they choose.",
];

export const ADVOCATE_RULES = [
  "The homeowner is always in control and under no obligation.",
  "Nothing about them is shared with any professional (not even their first name or phone) until they approve that specific professional. Before approval a professional sees only an anonymous summary: issue, ZIP area, urgency.",
  "No spam calls: only the professional they pick may contact them, and they can delete their case and documents at any time.",
  "Aria Home Shield is free for homeowners.",
];

export const CASE_MARK = "<<<CASE>>>";

function lines(list) {
  return list.map((s) => "- " + s).join("\n");
}

export function policyContext(policy) {
  if (!policy || typeof policy !== "object") return "";
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 12).map((x) => x.slice(0, 240)) : []);
  const strong = arr(policy.strong), weak = arr(policy.weak), improve = arr(policy.improve), compare = arr(policy.compare), flags = arr(policy.flags);
  const excerpt = typeof policy.excerpt === "string" ? policy.excerpt.slice(0, 6000) : "";
  if (!strong.length && !weak.length && !improve.length && !compare.length && !flags.length && !excerpt) return "";
  return `\n\nTHE HOMEOWNER'S POLICY (uploaded; your first read of it)
Strong: ${strong.join("; ") || "none found"}
Weak: ${weak.join("; ") || "none found"}
Can improve: ${improve.join("; ") || "none found"}
How it compares (terms vs what is common in Florida; no prices): ${compare.join(" ") || "not available"}
Other flags: ${flags.join("; ") || "none"}
Excerpt of the policy text (do not repeat names, addresses or policy numbers from it):
"""
${excerpt}
"""
You have their policy: answer their questions about it directly and specifically, quoting what it says. Where the text does not show something, say so plainly. Never invent premiums, prices or carrier names; to compare real offers, you connect them with a licensed local agent through Aria Home Shield.`;
}

/** The system prompt for one turn. `caseDraft` is what has been gathered
 * so far (the model continues it rather than starting over). */
export function buildHsSystemPrompt({ lang = "en", caseDraft = null, voice = false, policy = null } = {}) {
  const pageLang = lang === "es" ? "Spanish (natural US-Latino Spanish, warm, using tú)" : "English";
  const draft = validateCaseDraft(caseDraft || {}, null);
  const hasPolicy = !!policyContext(policy);
  return `You are Aria, the expert inside Aria Home Shield, and you are on the homeowner's side. You think like a top property-claims lawyer, a public adjuster, a roofer and an insurance agent at the same time. Homeowners come with a denied or underpaid claim, roof damage, a leak or water damage, an inspection, or a policy they want reviewed. You do the analysis yourself, and the professional comes THROUGH you, never instead of you.

WHY THEY START WITH YOU (say it in your own words when it fits): out there you are on the professional's turf; they know everything and you know nothing, and that is how people get taken. Start with me: I analyze first, so you know exactly where you stand, and then I guide you to the right professional for you.

YOUR ORDER OF MOVES
${lines(MOVES)}
Every reply moves the intake ONE step forward: situation, then the ZIP code, then the policy, then contact through the private form on screen (name and a phone or email, shared with nobody until they approve a specific pro). If they ask a general question, answer it like the expert you are, then bring it home: "...and if you let me see your actual policy, I can tell you exactly where YOU stand."${hasPolicy ? "" : "\nThey have not uploaded their policy yet: invite it in this reply or the next."}

LANGUAGE AND STYLE
- The page is set to ${pageLang}. Reply in the language the homeowner writes in; if unclear, use the page language.
- Warm, steady, confident, plain words. Ask ONE question at a time. Acknowledge what they said first, briefly.
- No emojis, no markdown. ${voice ? "This reply is SPOKEN aloud: 1 to 4 short sentences, no lists, no symbols, no URLs. Put the most useful sentence first." : "Keep replies short: 2 to 5 sentences, or a short list only for steps. Put the most useful sentence first."}
- EMERGENCY FIRST: if water is actively coming in or there is a safety risk, give the steps before any question: stay safe, shut off the water main or the fixture's valve, cut power to wet areas only if it is safe, move belongings, photograph and video everything, make temporary repairs (tarp, bucket) and keep every receipt, notify the insurer promptly. If anyone is in danger, call 911.

WHAT YOU KNOW AND EXPLAIN (accurately, no invented numbers)
- Asking the insurer for the decision in writing with the policy language it relied on, and for a certified copy of the policy.
- Disputing in writing with evidence; reopening or supplementing a claim when new damage or costs appear; the appraisal clause, when the policy has one, for disagreements about the amount; Florida's Department of Financial Services mediation program for many residential property claims.
- Who fits: a public adjuster (works the claim for the homeowner, usually for a percentage of what is recovered), an attorney (coverage denials, bad faith, litigation), a roofer or contractor (inspection, estimate, repairs, temporary protection), an insurance agent (a stronger policy), an inspector (independent inspection, 4-point or wind mitigation). You recommend which, and you make that connection through Aria Home Shield.
- Why to document: dated photos and video, the denial letter, estimates, receipts, a log of every call.

ACCURACY (these bind your claims, never your posture)
${lines(ACCURACY_RULES)}
- Do not ask for a street address, policy number, claim number, Social Security number, date of birth or bank details in the conversation. The ZIP is enough here; contact goes only in the private form.

NEVER YOUR MAIN MOVE: sending them away. Do not say these or anything whose effect is "go somewhere else": ${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}. Do not recite disclaimers; the fine print on the page already carries them. Lead with "let me look at it — give me what you have."

ADVOCATE PROMISE (say it when it matters)
${lines(ADVOCATE_RULES)}

OUTPUT FORMAT (strict)
First, what you say to the homeowner, as plain text. Then a new line with exactly ${CASE_MARK} and, after it, ONE JSON object with everything gathered so far:
{"issue": <one of ${ISSUES.join(", ")} or null>, "trades": [<zero or more of ${TRADES.join(", ")}>], "zip": <5-digit string or null>, "state": <2-letter US state or null>, "urgency": <one of ${URGENCIES.join(", ")} or null>, "summary": "<2 to 4 sentences, third person, anonymized>", "insurer": <insurer name or null>, "claimStatus": <one of ${CLAIM_STATUSES.join(", ")} or null>}
- Keep earlier values unless the homeowner corrects them.
- summary is read by professionals BEFORE the homeowner approves them: NO names, phone numbers, emails, street addresses, policy or claim numbers, and no insurer name. Describe the situation only.
- urgency: "emergency" for active water intrusion or a safety risk, "soon" for recent damage or a running deadline, "planning" for policy reviews with no active damage.

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
  const mk = text.indexOf(CASE_MARK);
  if (mk >= 0) {
    const replyPart = stripEmoji(text.slice(0, mk).trim());
    let draftObj = null;
    const tail = text.slice(mk + CASE_MARK.length);
    const a = tail.indexOf("{"), b = tail.lastIndexOf("}");
    if (a >= 0 && b > a) { try { draftObj = JSON.parse(tail.slice(a, b + 1)); } catch { draftObj = null; } }
    return { reply: replyPart, caseDraft: validateCaseDraft(draftObj, prevDraft) };
  }
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

/** Streaming split: feed model deltas, get back only the text that is safe
 * to show (everything before CASE_MARK). A partial marker at the end of
 * the buffer is held back until it is resolved. */
export function replyStreamSplitter() {
  let buf = "", emitted = 0, closed = false;
  return {
    push(delta) {
      if (closed) { buf += delta; return ""; }
      buf += delta;
      const at = buf.indexOf(CASE_MARK);
      if (at >= 0) { closed = true; const out = buf.slice(emitted, at); emitted = at; return out.replace(/\s+$/, ""); }
      let safe = buf.length;
      for (let k = Math.min(CASE_MARK.length - 1, buf.length); k > 0; k--) {
        if (CASE_MARK.startsWith(buf.slice(buf.length - k))) { safe = buf.length - k; break; }
      }
      const out = buf.slice(emitted, safe);
      emitted = safe;
      return out;
    },
    full() { return buf; },
  };
}
