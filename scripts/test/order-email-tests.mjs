/* ==================================================================
   ORDER CONFIRMATION EMAIL -- PRODUCT PHOTOS PER LINE (#443).

   Each line shows its catalog photo (the hosted URL stored on the order
   line) next to its name and soles price. Hosted link, never an
   attachment; a line with no usable image renders with no <img>; a
   hostile URL is dropped; still exactly one email per order.

   No network and no real email: providers are stubbed.

   RUNNING IT
     node scripts/test/order-email-tests.mjs
     ORDER_EMAIL_SAMPLE=/path/sample.html node scripts/test/order-email-tests.mjs
       (also writes the rendered sample email to that path)
   ================================================================== */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { register } from "node:module";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.stack.split("\n").slice(0, 2).join(" | ")}`); }
}

/* ---- @netlify/blobs, in memory (same stub as checkout-tests.mjs) ---- */
globalThis.__blobs = new Map();
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(
      "const S = globalThis.__blobs;" +
      "export const connectLambda = () => {};" +
      "export function getStore(name){" +
      " if(!S.has(name)) S.set(name,new Map()); const m=S.get(name);" +
      " return { get: async (k)=> m.has(k)? JSON.parse(m.get(k)) : null," +
      " setJSON: async (k,v,o)=>{ if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; }," +
      " set: async (k,v,o)=>{ if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, String(v)); return { modified: true }; }," +
      " delete: async (k)=>{ m.delete(k); }, list: async ()=>({ blobs: [...m.keys()].map(key=>({key})) }) }; }"
    ), shortCircuit: true };
    return next(spec, ctx);
  }
`), import.meta.url);

const E = await import(ROOT + "netlify/functions/_order-email.js");

const IMG_A = "https://i5.walmartimages.com/seo/3-In-1-Duffle-Bag-45L_9aba96b1.jpeg";
const IMG_B = "https://cdn.shopify.com/s/files/1/0869/4382/files/AriaBambooBottoms_granite.jpg?v=1";
const SAMPLE = {
  orderId: "ARIA-20261021-1MG443", paymentStatus: "paid", pricePenCharged: 412.3, amountCapturedPen: 412.3, fxRateUsed: 3.4,
  customer: { name: "Alejandra Prueba", email: "danny@ariashop.pe" },
  shipping: { destCity: "Cusco", courier: { id: "olva", name: "Olva Courier" } },
  items: [
    { title: "Maletín deportivo 45L", qty: 1, priceUsd: 24.65, image: IMG_A },
    { title: "Pantalón de bambú", selectedSize: "M", qty: 2, priceUsd: 56.9, image: IMG_B },
    { title: "Llavero sin foto", qty: 1, priceUsd: 5 },
    { title: "Descuento combo", lineType: "bundle-discount", qty: 1, priceUsd: -3, image: IMG_A },
  ],
};
const imgs = (html) => html.match(/<img\b[^>]*>/g) || [];
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];

await check("two lines with photos show them, sized for email, alt = product name, display:block", () => {
  const { html } = E.orderConfirmationEmail(SAMPLE);
  const tags = imgs(html);
  assert.equal(tags.length, 2, `expected 2 <img>, got ${tags.length}`);
  assert.equal(attr(tags[0], "src"), IMG_A);
  assert.equal(attr(tags[1], "src"), IMG_B.replace(/&/g, "&amp;"));
  assert.equal(attr(tags[0], "alt"), "Maletín deportivo 45L");
  assert.equal(attr(tags[1], "alt"), "Pantalón de bambú");
  for (const t of tags) {
    const w = Number(attr(t, "width")), h = Number(attr(t, "height"));
    assert.ok(w >= 64 && w <= 80 && h === w, `thumb is ${w}x${h}`);
    assert.match(attr(t, "style"), /display:block/);
  }
  assert.match(html, /<table role="presentation"[^>]*cellpadding="0"/, "line items are not a table layout");
});

await check("each line sits beside its name and its soles price", () => {
  const { html } = E.orderConfirmationEmail(SAMPLE);
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g);
  assert.equal(rows.length, 3, "the combo-discount line is shown, or a line is missing");
  assert.match(rows[0], /Maletín deportivo 45L x1[\s\S]*S\/ 83[.,]81/);
  assert.match(rows[1], /Pantalón de bambú \(talla M\) x2[\s\S]*S\/ 386[.,]92/);
  assert.match(rows[2], /Llavero sin foto x1[\s\S]*S\/ 17[.,]00/);
});

await check("a line with no stored image renders with no <img> (no broken-image box)", () => {
  const { html } = E.orderConfirmationEmail(SAMPLE);
  const row = html.match(/<tr>[\s\S]*?<\/tr>/g)[2];
  assert.doesNotMatch(row, /<img/i);
  const none = E.orderConfirmationEmail({ ...SAMPLE, items: [{ title: "Sin foto", qty: 1, priceUsd: 5 }, { title: "Vacía", qty: 1, image: "" }] }).html;
  assert.equal(imgs(none).length, 0);
  assert.doesNotMatch(none, /width="84"/, "an empty photo column is kept when no line has a photo");
});

await check("a hostile image URL is dropped, never rendered", () => {
  const evil = [
    "javascript:alert(1)",
    " JAVASCRIPT:alert(document.cookie)",
    'https://x.test/a.jpg" onerror="alert(1)',
    "https://x.test/a.jpg'><script>alert(1)</script>",
    "https://x.test/a b.jpg",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "vbscript:msgbox(1)",
    "ftp://x.test/a.jpg",
    "https://user:pass@x.test/a.jpg",
    "https://x.test/a.jpg\n<script>",
    "x.test/a.jpg",
    { toString: () => IMG_A },
  ];
  for (const bad of evil) assert.equal(E.emailImageUrl(bad), null, `accepted ${String(bad)}`);
  const { html } = E.orderConfirmationEmail({ ...SAMPLE, items: evil.map((image, i) => ({ title: `Linea ${i}`, qty: 1, priceUsd: 1, image })) });
  assert.equal(imgs(html).length, 0);
  assert.doesNotMatch(html, /javascript:|vbscript:|onerror|<script|data:image/i);
});

await check("protocol- and root-relative images are made absolute on a hosted origin", () => {
  assert.equal(E.emailImageUrl("//cdn.shopify.com/a.jpg"), "https://cdn.shopify.com/a.jpg");
  assert.equal(E.emailImageUrl("/assets/orb-64.png"), "https://ariashop.pe/assets/orb-64.png");
  assert.equal(E.emailImageUrl("http://media.kohlsimg.com/a.jpg?wid=180"), "http://media.kohlsimg.com/a.jpg?wid=180");
});

await check("the email links nowhere new: no <a> but the existing mailto", () => {
  const { html } = E.orderConfirmationEmail(SAMPLE);
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["mailto:contacto@ariashop.pe"]);
});

await check("no attachments: SMTP and Resend carry hosted links only", async () => {
  let mailed = null;
  const createTransport = () => ({ sendMail: async (m) => { mailed = m; return { messageId: "<m@x>" }; } });
  await E.sendOrderConfirmation(SAMPLE, { env: { SMTP_HOST: "h", SMTP_USER: "pedidos@ariashop.pe", SMTP_PASS: "p" }, createTransport });
  assert.ok(mailed);
  assert.ok(!("attachments" in mailed), "SMTP message has attachments");
  assert.doesNotMatch(mailed.html, /cid:|data:image/i);
  assert.match(mailed.html, new RegExp(IMG_A.replace(/[.?/]/g, "\\$&")));
  let body = null;
  const fetchImpl = async (url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ id: "em_1" }) }; };
  await E.sendOrderConfirmation(SAMPLE, { env: { RESEND_API_KEY: "re_test" }, fetchImpl });
  assert.ok(!("attachments" in body), "Resend body has attachments");
  assert.doesNotMatch(body.html, /cid:|data:image/i);
});

await check("the text part is unchanged by the photos", () => {
  const { text } = E.orderConfirmationEmail(SAMPLE);
  assert.doesNotMatch(text, /https?:\/\//);
  assert.match(text, /Maletín deportivo 45L x1/);
});

await check("exactly one email per order, from the real webhook, with the photos in it", async () => {
  const { createHmac } = await import("node:crypto");
  const secret = "whsec_test_photos";
  const prev = { ...process.env };
  Object.assign(process.env, { STRIPE_WEBHOOK_SECRET: secret, RESEND_API_KEY: "re_test" });
  delete process.env.SMTP_HOST;
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { sent.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ id: "em_" + sent.length }) }; }
    throw new Error("unexpected fetch " + url);
  };
  try {
    const orderId = SAMPLE.orderId;
    globalThis.__blobs.set("orders", new Map([[orderId, JSON.stringify({ ...SAMPLE, status: "pending_payment", paymentStatus: "unpaid", amountCapturedPen: null })]]));
    const { handler } = await import(ROOT + "netlify/functions/stripe-webhook.js");
    const signed = (evt) => {
      const body = JSON.stringify(evt), t = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
      return { httpMethod: "POST", body, headers: { "stripe-signature": `t=${t},v1=${sig}` } };
    };
    const meta = { orderId };
    const [a, b] = await Promise.all([
      handler(signed({ id: "evt_cs", type: "checkout.session.completed", created: 1, data: { object: { id: "cs_1", payment_intent: "pi_1", currency: "pen", amount_total: 41230, payment_status: "paid", metadata: meta } } })),
      handler(signed({ id: "evt_pi", type: "payment_intent.succeeded", created: 1, data: { object: { id: "pi_1", currency: "pen", amount_received: 41230, metadata: meta } } })),
    ]);
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(b.statusCode, 200, b.body);
    await handler(signed({ id: "evt_retry", type: "payment_intent.succeeded", created: 2, data: { object: { id: "pi_1", currency: "pen", amount_received: 41230, metadata: meta } } }));
    assert.equal(sent.length, 1, `sent ${sent.length} emails for one order`);
    assert.equal(imgs(sent[0].html).length, 2);
    assert.ok(!("attachments" in sent[0]));
    assert.ok(JSON.parse(globalThis.__blobs.get("orders").get(orderId)).confirmationEmailSentAt);
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ["STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY"]) { if (k in prev) process.env[k] = prev[k]; else delete process.env[k]; }
  }
});

await check("the preview QA send (email-check) mails a sample with two photos and one photoless line", async () => {
  const { testOrder } = await import(ROOT + "netlify/functions/email-check.js");
  const { html } = E.orderConfirmationEmail(testOrder("danny@ariashop.pe"));
  assert.equal(imgs(html).length, 2);
  assert.equal((html.match(/<tr>/g) || []).length, 3);
});

if (process.env.ORDER_EMAIL_SAMPLE) {
  writeFileSync(process.env.ORDER_EMAIL_SAMPLE, E.orderConfirmationEmail(SAMPLE).html);
  console.log("    wrote " + process.env.ORDER_EMAIL_SAMPLE);
}

const MIN_CHECKS = 10;
for (const f of failures) console.log("    FAIL " + f);
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
