/* ARIA HOME SHIELD -- partner desk (home-shield/partners/index.html).
   Sign in / enroll a desk (hs-pro-login, hs-pro-signup with `desk`), wait
   for license verification, then the desk: radar, live ring with an
   answer/pass countdown (WebAudio ping + toast), unanswered queue, packs,
   claims, ledger, team chat, uploads. Polls hs-partner every 8 s. All copy
   in I18N (en/es, parity-tested). No emojis; every server string escaped. */
(function () {
  "use strict";
  var API = "/.netlify/functions/";
  var I18N = {
    en: {
      partner: "PARTNER", foot: "Payments go to ARIA SHOP LLC. Partners never hold homeowner money. A credit is used only when a homeowner verifies your claim.",
      signin: "Sign in", enroll: "Open a desk", email: "Email", password: "Password", passwordNew: "Password (10+ characters)", name: "Full name", company: "Company",
      phone: "Phone", desk: "Your desk", licenseType: "License type", licenseNumber: "License number", licenseState: "License state", centerZip: "ZIP you work from",
      radius: "Service radius (miles)", attest: "My license is active and the information is accurate.", go: "Continue", working: "One moment...",
      authTitle: "The partner desk for homeowners who want a pro in their corner.",
      authLede: "Bilingual homeowners, qualified by Aria, ringing your desk live. You pay only for claims the homeowner verifies.",
      d_roofer: "Roofer", d_public_adjuster: "Public adjuster", d_attorney: "Attorney",
      pending: "We are verifying your license. Your desk opens as soon as it is confirmed.", recheck: "Check again", signout: "Sign out",
      online: "Online", offline: "Offline", goOnline: "Go online", goOffline: "Go offline",
      credits: "Credits", held: "Held", available: "Available", sampleFree: "Your first call is free.",
      b_legal_review: "Pending legal review: per-lead pricing for your desk is not switched on yet.",
      b_membership_inactive: "Your membership is not active, so you cannot buy packs or claim leads.",
      b_no_credits: "No credits available. Buy a pack to take leads.", b_pending_verification: "Your license is pending verification.", b_no_desk: "This account has no desk.",
      paymentsOff: "Payments not yet enabled.", membershipPrice: "Membership", perMonth: "per month", free: "Free at launch",
      ringCall: "Incoming qualified call", ringPacket: "Case packet ringing", answer: "Answer", claim: "Claim packet", pass: "Pass",
      ringNote: "Answering holds one credit. It is used only if the homeowner verifies you. Passing is free.",
      seconds: "s", queue: "Not answered yet", queueEmpty: "Nothing waiting in your area.", ringingOther: "Ringing another desk", waiting: "Waiting",
      packs: "Packs", buy: "Buy", calls10: "10 qualified calls", packets5: "5 attorney packets", packets10: "10 attorney packets",
      perCall: "$750 per verified qualified connection", perPacket: "$1,000 per claimed packet",
      claims: "My claims", claimsEmpty: "No claims yet.", s_pending: "Waiting for the homeowner", s_accepted_talk_first: "Homeowner wants to talk first",
      s_accepted: "Verified", s_declined: "Not selected", paid: "Paid", sample: "Free sample", contactLocked: "Contact unlocks when the homeowner shares it.",
      contact: "Homeowner contact", ledger: "Ledger", ledgerEmpty: "No entries yet.",
      l_purchase: "Pack purchase", l_grant: "Credit grant", l_claim_debit: "Verified claim", l_refund: "Refund",
      team: "Team", teamName: "Team name", createTeam: "Create team", inviteEmail: "Invite by email", role: "Role", invite: "Invite", inviteCode: "Invite code",
      joinCode: "Have an invite code?", join: "Join", chatPh: "Message your team", send: "Send", noTeam: "You are not on a team yet.",
      r_member: "Member", r_roofer: "Roofer", r_public_adjuster: "Public adjuster", r_attorney: "Attorney", r_insurance_agent: "Insurance agent", r_office: "Office",
      uploads: "Desk documents", up_license: "Upload license", up_insurance_certificate: "Upload insurance certificate", uploaded: "Uploaded",
      i_denied_claim: "Denied claim", i_underpaid_claim: "Underpaid claim", i_roof: "Roof damage", i_leak_water: "Leak / water damage", i_policy_review: "Policy review",
      i_inspection: "Inspection", i_other: "Home insurance question", u_emergency: "Emergency", u_soon: "Soon", u_planning: "Planning",
      toastRing: "A lead is ringing your desk", err: "Something went wrong. Please try again.",
    },
    es: {
      partner: "SOCIO", foot: "Los pagos van a ARIA SHOP LLC. Los socios nunca guardan dinero de los dueños de casa. Un crédito se usa solo cuando el dueño de casa verifica tu reclamo.",
      signin: "Entrar", enroll: "Abrir un escritorio", email: "Correo", password: "Contraseña", passwordNew: "Contraseña (10 caracteres o más)", name: "Nombre completo", company: "Empresa",
      phone: "Teléfono", desk: "Tu escritorio", licenseType: "Tipo de licencia", licenseNumber: "Número de licencia", licenseState: "Estado de la licencia", centerZip: "ZIP desde donde trabajas",
      radius: "Radio de servicio (millas)", attest: "Mi licencia está activa y la información es correcta.", go: "Continuar", working: "Un momento...",
      authTitle: "El escritorio de socios para dueños de casa que quieren a un profesional de su lado.",
      authLede: "Dueños de casa bilingües, calificados por Aria, timbrando en tu escritorio en vivo. Pagas solo por los reclamos que el dueño de casa verifica.",
      d_roofer: "Techador", d_public_adjuster: "Ajustador público", d_attorney: "Abogado",
      pending: "Estamos verificando tu licencia. Tu escritorio se abre en cuanto se confirme.", recheck: "Revisar de nuevo", signout: "Salir",
      online: "En línea", offline: "Fuera de línea", goOnline: "Ponerme en línea", goOffline: "Salir de línea",
      credits: "Créditos", held: "Reservados", available: "Disponibles", sampleFree: "Tu primera llamada es gratis.",
      b_legal_review: "Revisión legal pendiente: el cobro por cliente para tu escritorio todavía no está activado.",
      b_membership_inactive: "Tu membresía no está activa, así que no puedes comprar paquetes ni tomar clientes.",
      b_no_credits: "No tienes créditos disponibles. Compra un paquete para tomar clientes.", b_pending_verification: "Tu licencia está pendiente de verificación.", b_no_desk: "Esta cuenta no tiene escritorio.",
      paymentsOff: "Los pagos todavía no están activados.", membershipPrice: "Membresía", perMonth: "al mes", free: "Gratis en el lanzamiento",
      ringCall: "Llamada calificada entrante", ringPacket: "Paquete de caso timbrando", answer: "Contestar", claim: "Tomar paquete", pass: "Pasar",
      ringNote: "Contestar reserva un crédito. Se usa solo si el dueño de casa te verifica. Pasar es gratis.",
      seconds: "s", queue: "Sin contestar todavía", queueEmpty: "No hay nada esperando en tu zona.", ringingOther: "Timbrando en otro escritorio", waiting: "Esperando",
      packs: "Paquetes", buy: "Comprar", calls10: "10 llamadas calificadas", packets5: "5 paquetes de abogado", packets10: "10 paquetes de abogado",
      perCall: "$750 por conexión calificada verificada", perPacket: "$1,000 por paquete tomado",
      claims: "Mis reclamos", claimsEmpty: "Todavía no tienes reclamos.", s_pending: "Esperando al dueño de casa", s_accepted_talk_first: "El dueño de casa quiere conversar primero",
      s_accepted: "Verificado", s_declined: "No seleccionado", paid: "Pagado", sample: "Muestra gratis", contactLocked: "El contacto se abre cuando el dueño de casa lo comparte.",
      contact: "Contacto del dueño de casa", ledger: "Movimientos", ledgerEmpty: "Todavía no hay movimientos.",
      l_purchase: "Compra de paquete", l_grant: "Créditos otorgados", l_claim_debit: "Reclamo verificado", l_refund: "Reembolso",
      team: "Equipo", teamName: "Nombre del equipo", createTeam: "Crear equipo", inviteEmail: "Invitar por correo", role: "Rol", invite: "Invitar", inviteCode: "Código de invitación",
      joinCode: "¿Tienes un código de invitación?", join: "Unirme", chatPh: "Escribe a tu equipo", send: "Enviar", noTeam: "Todavía no estás en un equipo.",
      r_member: "Miembro", r_roofer: "Techador", r_public_adjuster: "Ajustador público", r_attorney: "Abogado", r_insurance_agent: "Agente de seguros", r_office: "Oficina",
      uploads: "Documentos del escritorio", up_license: "Subir licencia", up_insurance_certificate: "Subir certificado de seguro", uploaded: "Subido",
      i_denied_claim: "Reclamo negado", i_underpaid_claim: "Reclamo mal pagado", i_roof: "Daño en el techo", i_leak_water: "Filtración / daño por agua", i_policy_review: "Revisión de póliza",
      i_inspection: "Inspección", i_other: "Consulta de seguro de casa", u_emergency: "Emergencia", u_soon: "Pronto", u_planning: "Planificando",
      toastRing: "Un cliente está timbrando en tu escritorio", err: "Algo salió mal. Inténtalo de nuevo.",
    },
  };
  var DESKS = ["roofer", "public_adjuster", "attorney"];
  var LIC = { roofer: "roofing_contractor", public_adjuster: "public_adjuster", attorney: "attorney" };
  var ROLES = ["member", "roofer", "public_adjuster", "attorney", "insurance_agent", "office"];
  var qs = new URLSearchParams(location.search);
  var S = { lang: "en", view: "loading", tab: qs.get("signup") === "1" ? "enroll" : "signin", st: null, seenRings: {}, timer: null, typing: false };
  try { var l0 = qs.get("lang") || localStorage.getItem("hs_lang"); if (l0 === "es") S.lang = "es"; } catch (e) { /* private */ }
  function t(k) { var v = I18N[S.lang][k]; return v == null ? (I18N.en[k] == null ? k : I18N.en[k]) : v; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function api(path, body) {
    var o = { credentials: "same-origin", headers: {} };
    if (body) { o.method = "POST"; o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    return fetch(API + path, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, ok: r.ok, body: b }; }); });
  }
  function errOf(b) { return (b && b.code && I18N[S.lang]["b_" + b.code]) || (b && b.code === "payments_off" && t("paymentsOff")) || (b && b.error) || t("err"); }

  var audio = null;
  document.addEventListener("pointerdown", function () { if (!audio) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) try { audio = new AC(); } catch (e) { audio = null; } } else if (audio.state === "suspended") audio.resume(); }, { passive: true });
  function ping() {
    if (!audio) return;
    try {
      var n = audio.currentTime;
      [[880, 0], [1318.5, 0.14], [880, 0.5], [1318.5, 0.64]].forEach(function (x) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = x[0]; g.gain.setValueAtTime(0.0001, n + x[1]); g.gain.exponentialRampToValueAtTime(0.22, n + x[1] + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, n + x[1] + 0.3);
        o.connect(g); g.connect(audio.destination); o.start(n + x[1]); o.stop(n + x[1] + 0.32);
      });
    } catch (e) { /* silent is fine */ }
    if (navigator.vibrate) try { navigator.vibrate([120, 80, 120]); } catch (e) { /* no */ }
  }
  function toast(msg) {
    var el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status");
    el.innerHTML = '<span class="dot" aria-hidden="true"></span><div><b>' + esc(msg) + "</b></div>";
    $("#toasts").prepend(el); setTimeout(function () { el.remove(); }, 6000);
  }

  function chrome() {
    document.documentElement.lang = S.lang;
    $$("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)); });
    $$("[data-t]").forEach(function (el) { el.textContent = t(el.dataset.t); });
  }
  $$("[data-lang]").forEach(function (b) { b.onclick = function () { S.lang = b.dataset.lang; try { localStorage.setItem("hs_lang", S.lang); } catch (e) { /* private */ } render(); }; });

  function render() {
    chrome();
    var app = $("#app");
    if (S.view === "loading") { app.innerHTML = '<p class="muted">' + esc(t("working")) + "</p>"; return; }
    if (S.view === "auth") return renderAuth(app);
    if (S.view === "pending") { app.innerHTML = '<div class="card"><h2>' + esc(t("pending")) + '</h2><div class="actions"><button class="btn gold" id="re">' + esc(t("recheck")) + '</button><button class="btn" id="out">' + esc(t("signout")) + "</button></div></div>"; $("#re").onclick = load; $("#out").onclick = signOut; return; }
    renderDesk(app);
  }
  function input(n, label, type, extra) { return '<label class="f"><span>' + esc(label) + '</span><input class="in" name="' + n + '" type="' + (type || "text") + '"' + (extra || "") + "></label>"; }
  function renderAuth(app) {
    var en = S.tab === "enroll";
    app.innerHTML = '<p class="eyebrow">' + esc(en ? t("enroll") : t("signin")) + "</p><h1>" + esc(t("authTitle")) + '</h1><p class="lede">' + esc(t("authLede")) + "</p>" +
      '<div class="seg" role="tablist"><button type="button" data-tab="signin" aria-selected="' + !en + '">' + esc(t("signin")) + '</button><button type="button" data-tab="enroll" aria-selected="' + en + '">' + esc(t("enroll")) + "</button></div>" +
      '<form class="card stack" id="af">' +
      (en ? '<label class="f"><span>' + esc(t("desk")) + '</span><select class="in" name="desk">' + DESKS.map(function (d) { return '<option value="' + d + '">' + esc(t("d_" + d)) + "</option>"; }).join("") + "</select></label>" +
        input("name", t("name")) + input("company", t("company")) + '<div class="row2">' + input("email", t("email"), "email") + input("phone", t("phone"), "tel") + "</div>" +
        input("password", t("passwordNew"), "password") + '<div class="row2">' + input("licenseNumber", t("licenseNumber")) + input("licenseState", t("licenseState"), "text", ' value="FL" maxlength="2"') + "</div>" +
        '<div class="row2">' + input("centerZip", t("centerZip"), "text", ' inputmode="numeric" maxlength="5"') + input("radiusMiles", t("radius"), "number", ' value="50"') + "</div>" +
        '<label class="check"><input type="checkbox" name="attest"><span>' + esc(t("attest")) + "</span></label>"
        : input("email", t("email"), "email") + input("password", t("password"), "password")) +
      '<p class="err" id="ae"></p><button class="btn gold block" type="submit">' + esc(t("go")) + "</button></form>";
    $$("[data-tab]", app).forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; render(); }; });
    $("#af").onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      var p = en ? api("hs-pro-signup", { desk: f.desk.value, name: f.name.value, company: f.company.value, email: f.email.value, phone: f.phone.value, password: f.password.value,
        licenseType: LIC[f.desk.value], licenseNumber: f.licenseNumber.value, licenseState: f.licenseState.value.toUpperCase(), attest: f.attest.checked, lang: S.lang,
        serviceArea: { centerZip: f.centerZip.value.trim(), radiusMiles: Number(f.radiusMiles.value) } })
        : api("hs-pro-login", { email: f.email.value, password: f.password.value });
      p.then(function (r) { if (!r.ok) { $("#ae").textContent = errOf(r.body); return; } load(); });
    };
  }
  function signOut() { clearInterval(S.timer); api("hs-pro-logout", {}).then(function () { S.view = "auth"; S.tab = "signin"; render(); }); }

  function load() {
    return api("hs-partner").then(function (r) {
      if (r.status === 401) { clearInterval(S.timer); S.view = "auth"; render(); return; }
      if (r.status === 403 && r.body.code === "pending_verification") { S.view = "pending"; render(); return; }
      if (!r.ok) { if (S.view === "loading") { S.view = "auth"; render(); } return; }
      var fresh = (r.body.rings || []).filter(function (x) { return !S.seenRings[x.caseId + x.expiresAt]; });
      fresh.forEach(function (x) { S.seenRings[x.caseId + x.expiresAt] = 1; });
      var first = !S.st;
      S.st = r.body; S.view = "desk";
      if (fresh.length && !first) { ping(); toast(t("toastRing")); }
      if (!S.typing) render();
      if (!S.timer) S.timer = setInterval(load, 8000);
    });
  }
  setInterval(function () { $$("[data-exp]").forEach(function (el) { var s = Math.max(0, Math.round((Date.parse(el.dataset.exp) - Date.now()) / 1000)); el.textContent = s + t("seconds"); var bar = el.parentNode.parentNode.querySelector(".bar i"); if (bar) bar.style.width = Math.min(100, s / ((S.st && S.st.settings.ringSeconds) || 90) * 100) + "%"; }); }, 1000);

  function caseLine(c) {
    return '<div class="case-h"><h3>' + esc(t("i_" + c.issue)) + '</h3><span class="tag ' + esc(c.urgency) + '">' + esc(t("u_" + c.urgency)) + "</span></div>" +
      '<div class="meta"><span>' + esc(c.area && c.area.label) + ", " + esc(c.area && c.area.state) + " &middot; " + esc(c.area && c.area.zip3) + "xx</span></div>" +
      (c.summary ? '<p class="summary small">' + esc(c.summary) + "</p>" : "") +
      (c.policyFlags && c.policyFlags.length ? '<div class="flags"><ul>' + c.policyFlags.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul></div>" : "");
  }
  function fmtPhone(p) { var d = String(p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1); return d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : p; }
  function money(n) { return "$" + Number(n).toLocaleString("en-US"); }
  function renderDesk(app) {
    var s = S.st, p = s.pro, b = s.balance, on = !!p.online, kind = s.kind;
    var notes = "";
    if (s.block && s.block !== "no_credits") notes += '<p class="note">' + esc(t("b_" + s.block)) + "</p>";
    else if (s.block === "no_credits") notes += '<p class="note">' + esc(t("b_no_credits")) + "</p>";
    var rings = (s.rings || []).map(function (r) {
      return '<article class="card case ring"><div class="row2" style="align-items:center"><p class="eyebrow" style="margin:0">' + esc(kind === "packet" ? t("ringPacket") : t("ringCall")) + '</p><div style="text-align:right"><span class="count" data-exp="' + esc(r.expiresAt) + '"></span></div></div>' +
        '<div class="bar"><i style="width:100%"></i></div><div style="margin-top:12px">' + caseLine(r.case) + "</div>" +
        '<p class="tiny" style="margin-top:10px">' + esc(t("ringNote")) + '</p><div class="actions"><button class="btn gold" data-answer="' + esc(r.caseId) + '">' + esc(kind === "packet" ? t("claim") : t("answer")) + '</button><button class="btn" data-pass="' + esc(r.caseId) + '">' + esc(t("pass")) + "</button></div></article>";
    }).join("");
    var queue = s.queue.length ? s.queue.map(function (q) {
      return '<article class="card case">' + caseLine(q.case) + '<div class="actions"><span class="tag">' + esc(q.status === "ringing" ? t("ringingOther") : t("waiting")) + "</span>" +
        (q.status === "waiting" && !s.block ? '<button class="btn gold" data-answer="' + esc(q.caseId) + '">' + esc(kind === "packet" ? t("claim") : t("answer")) + "</button>" : "") + "</div></article>";
    }).join("") : '<p class="muted small">' + esc(t("queueEmpty")) + "</p>";
    var legal = !s.settings.perLeadEnabled[s.desk];
    var packs = s.packs.map(function (k) {
      return '<div class="card pack"><div><b>' + esc(t(k.id)) + '</b><div class="small muted">' + esc(money(k.usd)) + " &middot; " + esc(kind === "packet" ? t("perPacket") : t("perCall")) + "</div></div>" +
        (legal ? '<span class="tag warn">' + esc(t("b_legal_review").split(":")[0]) + "</span>" : s.settings.paymentsLive ? '<button class="btn gold" data-buy="' + esc(k.id) + '">' + esc(t("buy")) + "</button>" : '<span class="tag">' + esc(t("paymentsOff")) + "</span>") + "</div>";
    }).join("");
    var claims = s.claims.length ? s.claims.map(function (c) {
      var ct = c.contactShared && c.case.contact;
      return '<article class="card case">' + caseLine(c.case) + '<div class="actions"><span class="tag ' + (c.status === "accepted" ? "ok" : "") + '">' + esc(t("s_" + c.status)) + "</span>" +
        (c.paid ? '<span class="tag ok">' + esc(c.sample ? t("sample") : t("paid")) + "</span>" : "") + "</div>" +
        (ct ? '<div class="contact"><p class="eyebrow" style="margin-bottom:4px">' + esc(t("contact")) + '</p><div class="big">' + esc(ct.name) + '</div><dl class="kv" style="margin-top:8px"><dt>' + esc(t("phone")) + '</dt><dd><a href="tel:' + esc(ct.phone) + '">' + esc(fmtPhone(ct.phone)) + "</a></dd><dt>" + esc(t("email")) + '</dt><dd><a href="mailto:' + esc(ct.email) + '">' + esc(ct.email) + "</a></dd></dl></div>"
          : '<p class="lock">' + esc(t("contactLocked")) + "</p>") + "</article>";
    }).join("") : '<p class="muted small">' + esc(t("claimsEmpty")) + "</p>";
    var ledger = s.ledger.length ? '<ul class="list">' + s.ledger.map(function (e) { return "<li><span>" + esc(t("l_" + e.type)) + (e.sample ? " &middot; " + esc(t("sample")) : "") + ' <small class="tiny">' + esc(e.at.slice(0, 10)) + "</small></span><b>" + (e.credits > 0 ? "+" : "") + esc(e.credits) + "</b></li>"; }).join("") + "</ul>" : '<p class="muted small">' + esc(t("ledgerEmpty")) + "</p>";
    var tm = s.team;
    var team = tm ? '<div class="card"><h3>' + esc(tm.name) + '</h3><ul class="list" style="margin-top:8px">' + tm.members.map(function (m) { return '<li><span class="radar' + (m.online ? " on" : "") + '"><i></i>' + esc(m.name) + "</span><span class=\"tiny\">" + esc(t("r_" + m.role)) + "</span></li>"; }).join("") + "</ul>" +
      '<div class="msgs">' + tm.messages.map(function (m) { return '<div class="msg' + (m.proId === p.id ? " me" : "") + '">' + esc(m.text) + "<small>" + esc(m.name) + "</small></div>"; }).join("") + "</div>" +
      '<form class="send" id="chat"><input class="in" name="text" placeholder="' + esc(t("chatPh")) + '" maxlength="2000"><button class="btn gold" type="submit">' + esc(t("send")) + "</button></form>" +
      (tm.ownerId === p.id ? '<form class="stack" id="inv" style="margin-top:12px"><div class="row2">' + input("email", t("inviteEmail"), "email") + '<label class="f"><span>' + esc(t("role")) + '</span><select class="in" name="role">' + ROLES.map(function (r) { return '<option value="' + r + '">' + esc(t("r_" + r)) + "</option>"; }).join("") + '</select></label></div><button class="btn" type="submit">' + esc(t("invite")) + '</button><p class="small" id="invOut"></p></form>' : "") + "</div>"
      : '<div class="card stack"><p class="muted small">' + esc(t("noTeam")) + '</p><form class="send" id="mk"><input class="in" name="name" placeholder="' + esc(t("teamName")) + '"><button class="btn gold" type="submit">' + esc(t("createTeam")) + '</button></form><form class="send" id="jn"><input class="in" name="code" placeholder="' + esc(t("joinCode")) + '"><button class="btn" type="submit">' + esc(t("join")) + "</button></form></div>";
    var docs = (p.deskDocs || []);
    var uploads = '<div class="card stack">' + ["license", "insurance_certificate"].map(function (k) {
      var has = docs.some(function (d) { return d.kind === k; });
      return '<label class="btn' + (has ? "" : " gold") + '" style="width:100%">' + esc(has ? t("uploaded") + ": " + t("up_" + k).replace(/^\S+\s/, "") : t("up_" + k)) + '<input type="file" accept="application/pdf,image/jpeg,image/png" data-up="' + k + '" hidden></label>';
    }).join("") + "</div>";
    app.innerHTML =
      '<div class="hello"><div><p class="eyebrow">' + esc(t("d_" + s.desk)) + (p.company ? " &middot; " + esc(p.company) : "") + "</p><h2>" + esc(p.name) + '</h2></div><button class="btn" id="out" style="min-height:40px">' + esc(t("signout")) + "</button></div>" +
      '<div class="card" style="margin-top:14px"><div class="pack"><span class="radar' + (on ? " on" : "") + '"><i></i><b style="font-size:16px;font-family:var(--sans)">' + esc(on ? t("online") : t("offline")) + '</b></span><button class="btn ' + (on ? "" : "gold") + '" id="ol">' + esc(on ? t("goOffline") : t("goOnline")) + "</button></div>" +
      '<div class="bal"><div><b>' + esc(b.credits) + "</b><span>" + esc(t("credits")) + "</span></div><div><b>" + esc(b.held) + "</b><span>" + esc(t("held")) + "</span></div><div><b>" + esc(b.available) + "</b><span>" + esc(t("available")) + "</span></div></div>" +
      (b.sampleAvailable ? '<p class="small" style="color:var(--gold-2);margin:10px 0 0">' + esc(t("sampleFree")) + "</p>" : "") +
      '<p class="tiny" style="margin:10px 0 0">' + esc(t("membershipPrice")) + ": " + esc(s.settings.membershipRequired && s.settings.membershipMonthlyUsd != null ? money(s.settings.membershipMonthlyUsd) + " " + t("perMonth") : t("free")) + "</p>" + notes + "</div>" +
      (rings ? '<div class="sec">' + rings + "</div>" : "") +
      '<section class="sec"><h3>' + esc(t("queue")) + "</h3>" + queue + "</section>" +
      '<section class="sec"><h3>' + esc(t("claims")) + "</h3>" + claims + "</section>" +
      '<section class="sec"><h3>' + esc(t("packs")) + "</h3>" + packs + "</section>" +
      '<section class="sec"><h3>' + esc(t("ledger")) + '</h3><div class="card">' + ledger + "</div></section>" +
      '<section class="sec"><h3>' + esc(t("team")) + "</h3>" + team + "</section>" +
      '<section class="sec"><h3>' + esc(t("uploads")) + "</h3>" + uploads + "</section>";
    wire(app);
  }
  function act(body) { return api("hs-partner", body).then(function (r) { if (!r.ok) toast(errOf(r.body)); return r; }); }
  function wire(app) {
    $("#out").onclick = signOut;
    $("#ol").onclick = function () { act({ action: "setonline", online: !S.st.pro.online }).then(load); };
    $$("[data-answer]", app).forEach(function (b) { b.onclick = function () { act({ action: S.st.kind === "packet" ? "claimpacket" : "answerlead", caseId: b.dataset.answer }).then(load); }; });
    $$("[data-pass]", app).forEach(function (b) { b.onclick = function () { act({ action: S.st.kind === "packet" ? "passpacket" : "passlead", caseId: b.dataset.pass }).then(load); }; });
    $$("[data-buy]", app).forEach(function (b) { b.onclick = function () { act({ action: "buypack", packId: b.dataset.buy }).then(function (r) { if (r.ok && r.body.url) location.href = r.body.url; }); }; });
    var f;
    if ((f = $("#chat"))) f.onsubmit = function (e) { e.preventDefault(); var v = f.text.value.trim(); if (v) act({ action: "postteammessage", text: v }).then(function () { S.typing = false; load(); }); };
    if ((f = $("#mk"))) f.onsubmit = function (e) { e.preventDefault(); act({ action: "createteam", name: e.target.name.value }).then(load); };
    if ((f = $("#jn"))) f.onsubmit = function (e) { e.preventDefault(); act({ action: "jointeam", code: e.target.code.value.trim() }).then(load); };
    if ((f = $("#inv"))) f.onsubmit = function (e) { e.preventDefault(); act({ action: "addteammember", email: e.target.email.value, role: e.target.role.value }).then(function (r) { if (r.ok) $("#invOut").textContent = t("inviteCode") + ": " + r.body.code; }); };
    $$("input.in", app).forEach(function (i) { i.addEventListener("input", function () { S.typing = !!i.value; }); });
    $$("[data-up]", app).forEach(function (i) {
      i.onchange = function () {
        var file = i.files[0]; if (!file) return;
        var rd = new FileReader();
        rd.onload = function () { act({ action: "submitupload", kind: i.dataset.up, file: { name: file.name, type: file.type, data: String(rd.result).split(",")[1] } }).then(load); };
        rd.readAsDataURL(file);
      };
    });
  }
  render();
  load().catch(function () { S.view = "auth"; render(); });
})();
