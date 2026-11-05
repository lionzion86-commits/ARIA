// ARIA HOME SHIELD -- reading a PHOTO of a policy page or a denial letter.
// Underscore: not an endpoint (hs-policy-review uses it). #443 c.6665786195.
//
// The PDF path (_hs-policy.js) reads a text layer. Homeowners mostly have
// photos and screenshots, so images go to a vision-capable model through
// the repo's existing OpenAI client constants (_aria-chat-model.js: the
// same key, URL and model id the chat uses). HS_VISION_MODEL overrides the
// model id per deploy if the chat model ever lacks image input.
//
// The answer has the SAME shape as the PDF path: findings [{key, tone,
// label}] with the PDF path's keys, strong / weak / improve, plainSummary,
// so the page's four-part review and "how it compares" work unchanged.
// It first decides what the picture IS: a declarations page or policy page,
// a denial letter (its own summary: what was denied and why, quoted), or
// something else (said plainly). Facts only: what the image shows.
import { OPENAI_CHAT_URL, OPENAI_MODEL } from "./_aria-chat-model.js";

export const FINDING_KEYS = ["hurricane_deductible", "wind_deductible", "aop_deductible", "roof_acv", "rcv", "exclusions", "water_sublimit", "ordinance_law", "matching", "loss_of_use"];
export const DOC_TYPES = ["declarations", "policy_page", "denial_letter", "other"];
export const VISION_MIME = ["image/jpeg", "image/png", "image/webp"];
const TIMEOUT_MS = 45000;

export function visionModel(env = process.env) {
  return (env && env.HS_VISION_MODEL) || OPENAI_MODEL;
}

export function visionPrompt(lang) {
  const L = lang === "es" ? "Spanish (natural US-Latino Spanish, tú)" : "English";
  return `You read ONE photo a homeowner uploaded to Aria Home Shield. Write every text field in ${L}.
First decide what it is: "declarations" (a homeowners insurance declarations page), "policy_page" (another page of a homeowners policy), "denial_letter" (a letter from an insurer denying or partly denying a claim), or "other" (anything else, or unreadable).
FACTS ONLY: report only what is printed and legible in the image. Never guess a number, never fill a gap from general knowledge. If something is not shown, leave it out. Do not copy names, addresses, policy numbers or claim numbers into any field.
For declarations / policy_page, report findings, each with a key from ${FINDING_KEYS.join(", ")}, a tone ("strong", "weak" or "note") and a short label quoting the value as printed (for example "Hurricane deductible: 5% of Coverage A"). A hurricane deductible of 5% or more, roof losses at actual cash value, and water sublimits are "weak"; replacement cost and ordinance or law of 25% or more are "strong". "improve" lists what is missing from what the page shows (for example no ordinance or law coverage listed), stated as something to ask about.
For denial_letter: "denial" = { "denied": what was denied, "reasons": [each reason given, short], "quotes": [the exact sentences from the letter that state the denial or cite the policy] }.
plainSummary: 2 to 4 plain sentences for the homeowner about what this page shows and where they stand.
Return ONE JSON object only:
{"docType": "...", "legible": true|false, "findings": [{"key": "...", "tone": "...", "label": "..."}], "improve": ["..."], "denial": null | {"denied": "...", "reasons": ["..."], "quotes": ["..."]}, "plainSummary": "..."}`;
}

const M = {
  en: {
    other: "This photo doesn't look like an insurance policy page or a denial letter, so I can't review it. Take a clear photo of your declarations page (usually the first page of the policy) or of the letter from your insurer, and send it again.",
    illegible: "I can't read this photo clearly enough to review it. Try again with the page flat, in good light, filling the frame.",
    heic: "I couldn't open this iPhone photo format. Take a screenshot of the photo and send the screenshot, or send it as a JPG.",
    failed: "I couldn't read this photo right now. It is saved privately with your case; try again in a minute.",
    denialTitle: (d) => `Your insurer denied: ${d}.`,
  },
  es: {
    other: "Esta foto no parece una página de póliza de seguro ni una carta de negación, así que no puedo revisarla. Toma una foto clara de tu página de declaraciones (normalmente la primera página de la póliza) o de la carta de tu aseguradora, y envíala otra vez.",
    illegible: "No puedo leer esta foto con suficiente claridad para revisarla. Inténtalo otra vez con la página plana, con buena luz y ocupando toda la foto.",
    heic: "No pude abrir este formato de foto del iPhone. Toma una captura de pantalla de la foto y envía la captura, o envíala como JPG.",
    failed: "No pude leer esta foto ahora mismo. Quedó guardada en privado con tu caso; inténtalo otra vez en un minuto.",
    denialTitle: (d) => `Tu aseguradora negó: ${d}.`,
  },
};
export const visionMessage = (lang, k) => M[lang === "es" ? "es" : "en"][k];

const str = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const list = (v, n, m) => (Array.isArray(v) ? v.map((x) => str(x, m)).filter(Boolean).slice(0, n) : []);

/** Validate the model's JSON into the review shape the page renders. */
export function normalizeVision(raw, lang) {
  let o = raw;
  if (typeof raw === "string") {
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    try { o = JSON.parse(a >= 0 && b > a ? raw.slice(a, b + 1) : raw); } catch { o = null; }
  }
  if (!o || typeof o !== "object") return { textFound: false, docType: "other", flags: [], findings: [], strong: [], weak: [], improve: [], plainSummary: visionMessage(lang, "failed"), source: "vision" };
  const docType = DOC_TYPES.includes(o.docType) ? o.docType : "other";
  if (docType === "other") return { textFound: false, docType, flags: [], findings: [], strong: [], weak: [], improve: [], plainSummary: visionMessage(lang, "other"), source: "vision" };
  if (o.legible === false) return { textFound: false, docType, flags: [], findings: [], strong: [], weak: [], improve: [], plainSummary: visionMessage(lang, "illegible"), source: "vision" };
  const seen = new Set();
  const findings = (Array.isArray(o.findings) ? o.findings : [])
    .filter((f) => f && FINDING_KEYS.includes(f.key) && !seen.has(f.key) && seen.add(f.key))
    .map((f) => ({ key: f.key, tone: ["strong", "weak", "note"].includes(f.tone) ? f.tone : "note", label: str(f.label, 200) }))
    .filter((f) => f.label)
    .slice(0, 12);
  let denial = null;
  if (docType === "denial_letter" && o.denial && typeof o.denial === "object") {
    denial = { denied: str(o.denial.denied, 300), reasons: list(o.denial.reasons, 6, 300), quotes: list(o.denial.quotes, 4, 500) };
  }
  const plain = str(o.plainSummary, 900) || (denial && denial.denied ? visionMessage(lang, "denialTitle")(denial.denied) : "");
  return {
    textFound: true, source: "vision", docType,
    findings,
    flags: findings.map((f) => f.label),
    strong: findings.filter((f) => f.tone === "strong").map((f) => f.label),
    weak: findings.filter((f) => f.tone === "weak").map((f) => f.label),
    improve: docType === "denial_letter" ? [] : list(o.improve, 8, 240),
    denial,
    plainSummary: plain,
    excerpt: [plain, ...findings.map((f) => f.label), ...(denial ? [denial.denied, ...denial.reasons, ...denial.quotes] : [])].filter(Boolean).join("\n").slice(0, 6000),
  };
}

/** Read one image. Resolves the review shape; never throws on a model failure. */
export async function readImage({ bytes, mime, lang = "en", fetchImpl = fetch, env = process.env }) {
  if (!VISION_MIME.includes(mime)) {
    return { textFound: false, docType: "other", flags: [], findings: [], strong: [], weak: [], improve: [], plainSummary: visionMessage(lang, "heic"), source: "vision", code: "unreadable_format" };
  }
  if (!env.OPENAI_API_KEY) return { textFound: false, docType: "other", flags: [], findings: [], strong: [], weak: [], improve: [], plainSummary: visionMessage(lang, "failed"), source: "vision", code: "not_configured" };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: visionModel(env),
        messages: [
          { role: "system", content: visionPrompt(lang) },
          { role: "user", content: [
            { type: "text", text: "Here is the photo." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`, detail: "high" } },
          ] },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1400,
      }),
      signal: ac.signal,
    });
    if (!res.ok) {
      let detail = ""; try { detail = (await res.text()).slice(0, 300); } catch { /* none */ }
      console.error("[hs-vision] model error", res.status, detail);
      return { ...normalizeVision(null, lang), code: "vision_error" };
    }
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return normalizeVision(content, lang);
  } catch (e) {
    console.error("[hs-vision]", e && e.message);
    return { ...normalizeVision(null, lang), code: "vision_error" };
  } finally {
    clearTimeout(timer);
  }
}
