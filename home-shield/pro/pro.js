/* ARIA HOME SHIELD -- pro dashboard logic (home-shield/pro/index.html).
   Views: sign in / enroll -> pending verification -> the live board
   (New cases / My requests / Connected). Polls hs-pro-feed every 10 s;
   a new matching case plays a short WebAudio ping and shows a toast.
   All copy lives in I18N (en, es). No emojis. Every string from the
   server is escaped before it touches the DOM. */
(function () {
  "use strict";
  var API = "/.netlify/functions/";
  var POLL_MS = 10000;

  var I18N = {
    en: {
      live: "Live", offline: "Offline",
      signin: "Sign in", enroll: "Enroll as a pro",
      authTitle: "Cases from homeowners who want a professional in their corner.",
      authLede: "Aria Home Shield is an open platform for licensed public adjusters, attorneys, contractors, insurance agents and inspectors. Homeowners choose who they work with; you are introduced only when they say yes.",
      email: "Email", password: "Password", passwordNew: "Password (10+ characters)", name: "Full name", company: "Company (optional)", phone: "Phone",
      trades: "What you do", licenseType: "License type", licenseNumber: "License number", licenseState: "License state",
      centerZip: "ZIP you work from", radius: "Service radius", miles: "miles",
      attest: "My license is active and the information above is accurate. I understand Aria Home Shield verifies it before I see cases.",
      enrollBtn: "Create my account", signinBtn: "Sign in", working: "One moment...",
      enrollNote: "Takes about two minutes. Your license is verified by our team before cases appear.",
      t_public_adjuster: "Public adjuster", t_attorney: "Attorney", t_roofer: "Contractor", t_insurance_agent: "Insurance agent", t_inspector: "Inspector",
      l_public_adjuster: "Public adjuster", l_attorney: "Attorney (Bar number)", l_roofing_contractor: "Contractor license", l_general_contractor: "General contractor",
      l_insurance_agent: "Insurance agent", l_home_inspector: "Home inspector", l_other: "Other license",
      pendingEyebrow: "Pending verification", pendingTitle: "We are verifying your license.",
      pendingLede: "As soon as it is confirmed, matching cases in your area appear here, live. Nothing for you to do in the meantime.",
      stepAccount: "Account created", stepLicense: "License check", stepLive: "Live cases in your area",
      yourLicense: "Your license", area: "Service area", checkAgain: "Check again", signout: "Sign out",
      within: function (r, z) { return "Within " + r + " miles of " + z; }, zips: function (l) { return "ZIP areas: " + l; },
      hello: function (n) { return "Welcome back, " + n + "."; },
      boardLede: "Anonymized cases in your trades and area. The homeowner sees your request and decides.",
      tabFeed: "New cases", tabRequests: "My requests", tabConnected: "Connected",
      emptyFeed: "No open cases match you right now.", emptyFeedSub: "Keep this page open. New cases ping the moment they arrive.",
      emptyRequests: "You have not requested a case yet.", emptyConnected: "No connections yet.",
      emptyConnectedSub: "When a homeowner shares their contact with you, it appears here with their documents.",
      i_denied_claim: "Denied claim", i_underpaid_claim: "Underpaid claim", i_roof: "Roof damage", i_leak_water: "Leak / water damage",
      i_policy_review: "Policy review", i_inspection: "Inspection", i_other: "Home insurance question",
      u_emergency: "Emergency", u_soon: "Soon", u_planning: "Planning",
      newTag: "New", ago_now: "just now", ago_m: function (n) { return n + " min ago"; }, ago_h: function (n) { return n + " h ago"; }, ago_d: function (n) { return n + " d ago"; },
      flagsTitle: "From the policy review", docsOnFile: "Documents on file. Shared only if the homeowner connects with you.",
      contactHidden: "Contact details stay private until the homeowner chooses you.",
      request: "Request this case", requestPh: "A short note to the homeowner: who you are and how you would help (10 to 600 characters).",
      send: "Send request", cancel: "Cancel", requested: "Requested", offers: function (n) { return n === 1 ? "1 request so far" : n + " requests so far"; },
      s_pending: "Waiting for the homeowner", s_accepted_talk_first: "Wants to talk first", s_accepted: "Connected", s_declined: "Not selected",
      yourMessage: "Your message", talkFirstNote: "The homeowner wants to talk first through Aria Home Shield. Their contact is not shared yet.",
      thread: "Conversation", writePh: "Write a message", sendMsg: "Send", noMsgs: "No messages yet.",
      you: "You", homeowner: "Homeowner",
      contactTitle: "Contact shared by the homeowner", prefers: "Prefers", p_phone: "a call", p_email: "email", p_text: "a text message",
      address: "Address", insurer: "Insurer", claimNo: "Claim number", policyNo: "Policy number", documents: "Documents", download: "Open", none: "None",
      toastNew: "New case", toastConnected: "A homeowner shared their contact", toastTalk: "A homeowner wants to talk first", toastMsg: "New message from a homeowner",
      toastDeclined: "A homeowner chose another professional", view: "View",
      sent: "Request sent. The homeowner decides; you will hear it here.",
      err_generic: "Something went wrong. Please try again.", err_bad_credentials: "Email or password is incorrect.", err_exists: "An account with this email already exists. Sign in instead.",
      err_rate_limited: "Too many attempts. Wait a few minutes and try again.", err_short_message: "Write at least 10 characters.",
      err_weak_password: "Use a password of at least 10 characters.", err_bad_trades: "Choose at least one trade.", err_attest_required: "Please confirm your license is active and accurate.",
      err_bad_area: "Enter the 5-digit ZIP you work from.", err_bad_license_number: "Enter your license number.", err_bad_phone: "Enter a valid phone number.",
      err_bad_email: "Enter a valid email.", err_bad_name: "Enter your full name.", err_not_found: "This case is no longer available.",
      foot1: "Aria Home Shield connects homeowners with licensed professionals. Aria gives general information and guidance; she is not a lawyer, public adjuster, insurance agent or contractor, and nothing here is legal advice.",
      foot2: "Homeowners initiate and approve every connection. Their contact details are shared only with the professional they choose.",
    },
    es: {
      live: "En vivo", offline: "Sin conexión",
      signin: "Entrar", enroll: "Inscríbete como profesional",
      authTitle: "Casos de dueños de casa que quieren a un profesional de su lado.",
      authLede: "Aria Home Shield es una plataforma abierta para ajustadores públicos, abogados, contratistas, agentes de seguros e inspectores con licencia. El dueño de casa elige con quién trabaja; te presentamos solo cuando dice que sí.",
      email: "Correo", password: "Contraseña", passwordNew: "Contraseña (10 caracteres o más)", name: "Nombre completo", company: "Empresa (opcional)", phone: "Teléfono",
      trades: "A qué te dedicas", licenseType: "Tipo de licencia", licenseNumber: "Número de licencia", licenseState: "Estado de la licencia",
      centerZip: "ZIP desde donde trabajas", radius: "Radio de servicio", miles: "millas",
      attest: "Mi licencia está activa y la información es correcta. Entiendo que Aria Home Shield la verifica antes de mostrarme casos.",
      enrollBtn: "Crear mi cuenta", signinBtn: "Entrar", working: "Un momento...",
      enrollNote: "Toma unos dos minutos. Nuestro equipo verifica tu licencia antes de que aparezcan casos.",
      t_public_adjuster: "Ajustador público", t_attorney: "Abogado", t_roofer: "Contratista", t_insurance_agent: "Agente de seguros", t_inspector: "Inspector",
      l_public_adjuster: "Ajustador público", l_attorney: "Abogado (número del Colegio)", l_roofing_contractor: "Licencia de contratista", l_general_contractor: "Contratista general",
      l_insurance_agent: "Agente de seguros", l_home_inspector: "Inspector de viviendas", l_other: "Otra licencia",
      pendingEyebrow: "Verificación pendiente", pendingTitle: "Estamos verificando tu licencia.",
      pendingLede: "En cuanto se confirme, los casos que coinciden en tu zona aparecerán aquí, en vivo. No tienes que hacer nada mientras tanto.",
      stepAccount: "Cuenta creada", stepLicense: "Revisión de licencia", stepLive: "Casos en vivo en tu zona",
      yourLicense: "Tu licencia", area: "Zona de servicio", checkAgain: "Revisar de nuevo", signout: "Salir",
      within: function (r, z) { return "Hasta " + r + " millas de " + z; }, zips: function (l) { return "Zonas ZIP: " + l; },
      hello: function (n) { return "Hola de nuevo, " + n + "."; },
      boardLede: "Casos anónimos de tus especialidades y tu zona. El dueño de casa ve tu solicitud y decide.",
      tabFeed: "Casos nuevos", tabRequests: "Mis solicitudes", tabConnected: "Conectados",
      emptyFeed: "Ahora mismo no hay casos abiertos para ti.", emptyFeedSub: "Deja esta página abierta. Los casos nuevos suenan en cuanto llegan.",
      emptyRequests: "Todavía no has solicitado un caso.", emptyConnected: "Todavía no hay conexiones.",
      emptyConnectedSub: "Cuando un dueño de casa comparta su contacto contigo, aparecerá aquí con sus documentos.",
      i_denied_claim: "Reclamo negado", i_underpaid_claim: "Reclamo mal pagado", i_roof: "Daño en el techo", i_leak_water: "Filtración / daño por agua",
      i_policy_review: "Revisión de póliza", i_inspection: "Inspección", i_other: "Consulta de seguro de casa",
      u_emergency: "Emergencia", u_soon: "Pronto", u_planning: "Planificando",
      newTag: "Nuevo", ago_now: "ahora", ago_m: function (n) { return "hace " + n + " min"; }, ago_h: function (n) { return "hace " + n + " h"; }, ago_d: function (n) { return "hace " + n + " d"; },
      flagsTitle: "De la revisión de la póliza", docsOnFile: "Hay documentos en el caso. Se comparten solo si el dueño de casa se conecta contigo.",
      contactHidden: "Los datos de contacto son privados hasta que el dueño de casa te elija.",
      request: "Solicitar caso", requestPh: "Una nota breve para el dueño de casa: quién eres y cómo ayudarías (10 a 600 caracteres).",
      send: "Enviar solicitud", cancel: "Cancelar", requested: "Solicitado", offers: function (n) { return n === 1 ? "1 solicitud hasta ahora" : n + " solicitudes hasta ahora"; },
      s_pending: "Esperando al dueño de casa", s_accepted_talk_first: "Quiere conversar primero", s_accepted: "Conectado", s_declined: "No seleccionado",
      yourMessage: "Tu mensaje", talkFirstNote: "El dueño de casa quiere conversar primero a través de Aria Home Shield. Su contacto todavía no se comparte.",
      thread: "Conversación", writePh: "Escribe un mensaje", sendMsg: "Enviar", noMsgs: "Todavía no hay mensajes.",
      you: "Tú", homeowner: "Dueño de casa",
      contactTitle: "Contacto compartido por el dueño de casa", prefers: "Prefiere", p_phone: "una llamada", p_email: "correo", p_text: "un mensaje de texto",
      address: "Dirección", insurer: "Aseguradora", claimNo: "Número de reclamo", policyNo: "Número de póliza", documents: "Documentos", download: "Abrir", none: "Ninguno",
      toastNew: "Caso nuevo", toastConnected: "Un dueño de casa compartió su contacto", toastTalk: "Un dueño de casa quiere conversar primero", toastMsg: "Mensaje nuevo de un dueño de casa",
      toastDeclined: "Un dueño de casa eligió a otro profesional", view: "Ver",
      sent: "Solicitud enviada. El dueño de casa decide; te enterarás aquí.",
      err_generic: "Algo salió mal. Inténtalo de nuevo.", err_bad_credentials: "El correo o la contraseña no son correctos.", err_exists: "Ya existe una cuenta con este correo. Entra con tu contraseña.",
      err_rate_limited: "Demasiados intentos. Espera unos minutos y vuelve a intentar.", err_short_message: "Escribe al menos 10 caracteres.",
      err_weak_password: "Usa una contraseña de al menos 10 caracteres.", err_bad_trades: "Elige al menos una especialidad.", err_attest_required: "Confirma que tu licencia está activa y es correcta.",
      err_bad_area: "Escribe el ZIP de 5 dígitos desde donde trabajas.", err_bad_license_number: "Escribe tu número de licencia.", err_bad_phone: "Escribe un teléfono válido.",
      err_bad_email: "Escribe un correo válido.", err_bad_name: "Escribe tu nombre completo.", err_not_found: "Este caso ya no está disponible.",
      foot1: "Aria Home Shield conecta a dueños de casa con profesionales con licencia. Aria da información y orientación general; no es abogada, ajustadora pública, agente de seguros ni contratista, y nada aquí es asesoría legal.",
      foot2: "El dueño de casa inicia y aprueba cada conexión. Sus datos de contacto se comparten solo con el profesional que elige.",
    },
  };
  var TRADES = ["public_adjuster", "attorney", "roofer", "insurance_agent", "inspector"];
  var LICENSES = ["public_adjuster", "attorney", "roofing_contractor", "general_contractor", "insurance_agent", "home_inspector", "other"];
  var STATES = ["FL", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

  var qs = new URLSearchParams(location.search);
  var S = {
    lang: pickLang(), view: "loading", authTab: qs.get("signup") === "1" ? "enroll" : "signin",
    tab: "feed", pro: null, feed: null, since: null, fresh: {}, openForm: null, threads: {}, sound: readPref("hs_pro_sound", "1") === "1",
    timer: null, online: true,
  };

  function pickLang() {
    var q = qs.get("lang");
    if (q === "es" || q === "en") { writePref("hs_lang", q); return q; }
    var s = readPref("hs_lang", "");
    return s === "es" ? "es" : "en";
  }
  function readPref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function writePref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function t(k) { var v = I18N[S.lang][k]; return v == null ? (I18N.en[k] == null ? k : I18N.en[k]) : v; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function errText(body) { return (body && body.code && I18N[S.lang]["err_" + body.code]) || (body && body.error) || t("err_generic"); }

  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) { init.method = opts.method || "POST"; init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(API + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, ok: r.ok, body: b }; });
    });
  }

  /* ---------- sound: a short two-note chime, made, not downloaded ---------- */
  var audio = null;
  function unlockAudio() {
    if (audio) { if (audio.state === "suspended") audio.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { audio = new AC(); } catch (e) { audio = null; }
  }
  function ping() {
    if (!S.sound || !audio) return;
    try {
      if (audio.state === "suspended") audio.resume();
      var now = audio.currentTime;
      [[880, 0], [1318.5, 0.14]].forEach(function (n) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = "sine"; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, now + n[1]);
        g.gain.exponentialRampToValueAtTime(0.22, now + n[1] + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + 0.32);
        o.connect(g); g.connect(audio.destination);
        o.start(now + n[1]); o.stop(now + n[1] + 0.34);
      });
    } catch (e) { /* no sound is fine */ }
    if (navigator.vibrate) { try { navigator.vibrate([90, 60, 90]); } catch (e) { /* not allowed */ } }
  }
  document.addEventListener("pointerdown", unlockAudio, { passive: true });
  document.addEventListener("keydown", unlockAudio);

  function toast(title, sub, caseId) {
    var box = $("#toasts");
    var el = document.createElement("div");
    el.className = "toast"; el.setAttribute("role", "status");
    el.innerHTML = '<span class="dot" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B0B0C" stroke-width="2.4" stroke-linecap="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></span>' +
      "<div><b>" + esc(title) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "") + "</div>" +
      (caseId ? '<button type="button">' + esc(t("view")) + "</button>" : "");
    if (caseId) el.querySelector("button").onclick = function () { el.remove(); S.tab = "feed"; render(); var c = document.getElementById("case-" + caseId); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); };
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(function () { el.remove(); }, 6500);
  }

  /* ---------- chrome ---------- */
  function paintChrome() {
    document.documentElement.lang = S.lang;
    $$("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === S.lang)); });
    $$("[data-t]").forEach(function (el) { el.textContent = t(el.getAttribute("data-t")); });
    var live = $("#live"); live.hidden = S.view !== "board";
    live.classList.toggle("off", !S.online);
    live.querySelector("span").textContent = S.online ? t("live") : t("offline");
    var snd = $("#sound"); snd.hidden = S.view !== "board"; snd.setAttribute("aria-pressed", String(S.sound));
  }
  $$("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { S.lang = b.getAttribute("data-lang"); writePref("hs_lang", S.lang); render(); });
  });
  $("#sound").addEventListener("click", function () { S.sound = !S.sound; writePref("hs_pro_sound", S.sound ? "1" : "0"); unlockAudio(); paintChrome(); if (S.sound) ping(); });

  function agoText(iso) {
    var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return t("ago_now");
    if (s < 3600) return t("ago_m")(Math.floor(s / 60));
    if (s < 86400) return t("ago_h")(Math.floor(s / 3600));
    return t("ago_d")(Math.floor(s / 86400));
  }
  function issueText(i) { return t("i_" + i); }
  function tradeTags(list) { return '<div class="trades">' + (list || []).map(function (x) { return '<span class="tag">' + esc(t("t_" + x)) + "</span>"; }).join("") + "</div>"; }
  function areaText(a) { return a ? esc(a.label || "") + (a.state ? ", " + esc(a.state) : "") + (a.zip3 ? " &middot; " + esc(a.zip3) + "xx" : "") : ""; }

  /* ---------- views ---------- */
  var lastView = null;
  function render() {
    if (S.view !== lastView) { lastView = S.view; try { window.scrollTo(0, 0); } catch (e) { /* old browser */ } }
    paintChrome();
    var app = $("#app");
    if (S.view === "loading") { app.innerHTML = '<div class="card empty"><div class="ring"></div><p class="muted">' + esc(t("working")) + "</p></div>"; return; }
    if (S.view === "auth") return renderAuth(app);
    if (S.view === "pending") return renderPending(app);
    renderBoard(app);
  }

  function renderAuth(app) {
    var en = S.authTab === "enroll";
    app.innerHTML =
      '<p class="eyebrow">' + esc(en ? t("enroll") : t("signin")) + "</p>" +
      "<h1>" + esc(t("authTitle")) + "</h1>" +
      '<p class="lede">' + esc(t("authLede")) + "</p>" +
      '<div class="seg" role="tablist">' +
      '<button type="button" role="tab" data-auth="signin" aria-selected="' + !en + '">' + esc(t("signin")) + "</button>" +
      '<button type="button" role="tab" data-auth="enroll" aria-selected="' + en + '">' + esc(t("enroll")) + "</button></div>" +
      '<form class="card stack" id="authForm" novalidate>' + (en ? enrollFields() : signinFields()) +
      '<p class="err" id="authErr" role="alert"></p>' +
      '<button class="btn gold block" type="submit">' + esc(en ? t("enrollBtn") : t("signinBtn")) + "</button>" +
      (en ? '<p class="tiny">' + esc(t("enrollNote")) + "</p>" : "") + "</form>";
    $$("[data-auth]", app).forEach(function (b) { b.onclick = function () { S.authTab = b.getAttribute("data-auth"); render(); }; });
    $("#authForm").onsubmit = en ? submitEnroll : submitSignin;
  }
  function field(name, label, type, extra) {
    return '<label class="f"><span>' + esc(label) + '</span><input class="in" name="' + name + '" type="' + (type || "text") + '"' + (extra || "") + "></label>";
  }
  function signinFields() {
    return field("email", t("email"), "email", ' autocomplete="email" required') + field("password", t("password"), "password", ' autocomplete="current-password" required');
  }
  function enrollFields() {
    return field("name", t("name"), "text", ' autocomplete="name" required') +
      field("company", t("company"), "text", ' autocomplete="organization"') +
      '<div class="row2">' + field("email", t("email"), "email", ' autocomplete="email" required') + field("phone", t("phone"), "tel", ' autocomplete="tel" required') + "</div>" +
      field("password", t("passwordNew"), "password", ' autocomplete="new-password" minlength="10" required') +
      '<div><span class="small muted" style="display:block;font-weight:700;margin-bottom:8px">' + esc(t("trades")) + '</span><div class="chips">' +
      TRADES.map(function (x) { return '<label class="chip-in"><input type="checkbox" name="trades" value="' + x + '"><span>' + esc(t("t_" + x)) + "</span></label>"; }).join("") + "</div></div>" +
      '<label class="f"><span>' + esc(t("licenseType")) + '</span><select class="in" name="licenseType">' + LICENSES.map(function (x) { return '<option value="' + x + '">' + esc(t("l_" + x)) + "</option>"; }).join("") + "</select></label>" +
      '<div class="row2">' + field("licenseNumber", t("licenseNumber"), "text", ' autocapitalize="characters" required') +
      '<label class="f"><span>' + esc(t("licenseState")) + '</span><select class="in" name="licenseState">' + STATES.map(function (x) { return "<option>" + x + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="row2">' + field("centerZip", t("centerZip"), "text", ' inputmode="numeric" maxlength="5" pattern="[0-9]{5}" required') +
      '<label class="f"><span>' + esc(t("radius")) + '</span><select class="in" name="radiusMiles">' + [10, 25, 50, 75, 100, 150, 250].map(function (r) { return '<option value="' + r + '"' + (r === 50 ? " selected" : "") + ">" + r + " " + esc(t("miles")) + "</option>"; }).join("") + "</select></label></div>" +
      '<label class="check"><input type="checkbox" name="attest"><span>' + esc(t("attest")) + "</span></label>";
  }
  function busy(form, on) { var b = form.querySelector("[type=submit]"); if (!b) return; if (on) { b.dataset.label = b.textContent; b.textContent = t("working"); } else if (b.dataset.label) b.textContent = b.dataset.label; b.disabled = on; }
  function submitSignin(e) {
    e.preventDefault(); var f = e.target; busy(f, true);
    api("hs-pro-login", { body: { email: f.email.value, password: f.password.value } }).then(function (r) {
      busy(f, false);
      if (!r.ok) { $("#authErr").textContent = errText(r.body); return; }
      afterAuth(r.body);
    }).catch(function () { busy(f, false); $("#authErr").textContent = t("err_generic"); });
  }
  function submitEnroll(e) {
    e.preventDefault(); var f = e.target;
    var body = {
      name: f.name.value, company: f.company.value, email: f.email.value, phone: f.phone.value, password: f.password.value,
      trades: $$("input[name=trades]:checked", f).map(function (x) { return x.value; }),
      licenseType: f.licenseType.value, licenseNumber: f.licenseNumber.value, licenseState: f.licenseState.value,
      serviceArea: { centerZip: f.centerZip.value.trim(), radiusMiles: Number(f.radiusMiles.value) }, attest: f.attest.checked, lang: S.lang,
    };
    busy(f, true);
    api("hs-pro-signup", { body: body }).then(function (r) {
      busy(f, false);
      if (!r.ok) { $("#authErr").textContent = errText(r.body); return; }
      afterAuth(r.body);
    }).catch(function () { busy(f, false); $("#authErr").textContent = t("err_generic"); });
  }
  function afterAuth(b) {
    S.pro = b.pro;
    if (qs.has("signup")) { qs.delete("signup"); history.replaceState(null, "", location.pathname + (qs.toString() ? "?" + qs : "")); }
    if (b.pending) { S.view = "pending"; render(); startPendingWatch(); }
    else startBoard();
  }

  function areaLine(p) {
    if (p.serviceZips && p.serviceZips.length) return t("zips")(p.serviceZips.join(", "));
    var a = p.serviceArea || {};
    return t("within")(a.radiusMiles, a.centerZip);
  }
  function renderPending(app) {
    var p = S.pro || {};
    app.innerHTML =
      '<div class="card">' +
      '<div class="seal"><svg width="30" height="34" viewBox="0 0 28 32" aria-hidden="true"><path d="M14 1.5 26 6v9.3c0 7.4-5 12.9-12 15.2C7 28.2 2 22.7 2 15.3V6L14 1.5Z" fill="none" stroke="#C9A24A" stroke-width="1.6"/><path d="M14 9v8l4 2" fill="none" stroke="#E4C77E" stroke-width="1.8" stroke-linecap="round"/></svg></div>' +
      '<p class="eyebrow">' + esc(t("pendingEyebrow")) + "</p><h1>" + esc(t("pendingTitle")) + '</h1><p class="lede">' + esc(t("pendingLede")) + "</p>" +
      '<ol class="steps"><li class="done"><span class="n">1</span><span>' + esc(t("stepAccount")) + '</span></li><li class="now"><span class="n">2</span><span>' + esc(t("stepLicense")) +
      '</span></li><li><span class="n">3</span><span>' + esc(t("stepLive")) + "</span></li></ol>" +
      '<hr class="hr"><dl class="kv"><dt>' + esc(t("name")) + "</dt><dd>" + esc(p.name) + (p.company ? " &middot; " + esc(p.company) : "") + "</dd>" +
      "<dt>" + esc(t("yourLicense")) + "</dt><dd>" + esc(t("l_" + p.licenseType)) + " &middot; " + esc(p.licenseState) + " " + esc(p.licenseNumber) + "</dd>" +
      "<dt>" + esc(t("trades")) + "</dt><dd>" + (p.trades || []).map(function (x) { return esc(t("t_" + x)); }).join(", ") + "</dd>" +
      "<dt>" + esc(t("area")) + "</dt><dd>" + esc(areaLine(p)) + "</dd></dl>" +
      '<div class="actions"><button class="btn gold" type="button" id="recheck">' + esc(t("checkAgain")) + '</button><button class="btn" type="button" id="out">' + esc(t("signout")) + "</button></div></div>";
    $("#recheck").onclick = checkMe;
    $("#out").onclick = signOut;
  }
  var pendingTimer = null;
  function startPendingWatch() { clearInterval(pendingTimer); pendingTimer = setInterval(checkMe, 30000); }
  function checkMe() {
    return api("hs-pro-me").then(function (r) {
      if (r.status === 401) { S.view = "auth"; clearInterval(pendingTimer); render(); return; }
      if (!r.ok) return;
      S.pro = r.body.pro;
      if (r.body.pending) { if (S.view !== "pending") { S.view = "pending"; render(); startPendingWatch(); } else render(); }
      else { clearInterval(pendingTimer); startBoard(); }
    });
  }
  function signOut() {
    clearInterval(S.timer); clearInterval(pendingTimer);
    api("hs-pro-logout", { body: {} }).then(function () { S.pro = null; S.feed = null; S.since = null; S.view = "auth"; S.authTab = "signin"; render(); });
  }

  /* ---------- the board ---------- */
  function startBoard() {
    S.view = "board"; S.since = null;
    render();
    poll();
    clearInterval(S.timer);
    S.timer = setInterval(poll, POLL_MS);
  }
  function poll() {
    var q = S.since ? "?since=" + encodeURIComponent(S.since) : "";
    return api("hs-pro-feed" + q).then(function (r) {
      if (r.status === 401) { clearInterval(S.timer); S.view = "auth"; render(); return; }
      if (r.status === 403 && r.body.code === "pending_verification") { clearInterval(S.timer); S.pro = r.body.pro || S.pro; S.view = "pending"; render(); startPendingWatch(); return; }
      if (!r.ok) { S.online = false; paintChrome(); return; }
      S.online = true;
      var first = !S.since;
      S.feed = r.body; S.since = r.body.now;
      if (!first) announce(r.body);
      if (!isTyping()) renderBoard($("#app"));
      else paintCounts();
      paintChrome();
    }).catch(function () { S.online = false; paintChrome(); });
  }
  function isTyping() { var a = document.activeElement; return a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT") && a.value; }
  function announce(b) {
    var newIds = b.newCaseIds || [];
    if (newIds.length) {
      newIds.forEach(function (id) { S.fresh[id] = Date.now(); });
      var c = (b.cases || []).filter(function (x) { return x.id === newIds[0]; })[0];
      ping();
      toast(t("toastNew") + (newIds.length > 1 ? " (" + newIds.length + ")" : ""), c ? issueText(c.issue) + " · " + (c.area.label || "") : "", c ? c.id : null);
    }
    (b.notices || []).forEach(function (n) {
      var title = { connected: t("toastConnected"), talk_first: t("toastTalk"), message: t("toastMsg"), declined: t("toastDeclined") }[n.type];
      if (!title) return;
      if (n.type !== "declined") ping();
      toast(title, "");
      if (n.type === "message" && S.threads[n.caseId]) loadThread(n.caseId);
    });
  }
  function counts() {
    var f = S.feed || { cases: [], offers: [], connected: [] };
    return {
      feed: f.cases.filter(function (c) { return !c.myOffer; }).length,
      requests: f.offers.filter(function (o) { return o.status === "pending" || o.status === "accepted_talk_first"; }).length,
      connected: f.connected.length,
    };
  }
  function paintCounts() {
    var n = counts();
    $$(".tabs [data-tab]").forEach(function (b) { var k = b.getAttribute("data-tab"); var s = b.querySelector(".n"); if (s) { s.textContent = n[k]; s.hidden = !n[k]; } });
  }
  function renderBoard(app) {
    var p = S.pro || {};
    var n = counts();
    var tab = function (k, label) { return '<button type="button" role="tab" data-tab="' + k + '" aria-selected="' + (S.tab === k) + '">' + esc(label) + '<span class="n"' + (n[k] ? "" : " hidden") + ">" + n[k] + "</span></button>"; };
    app.innerHTML =
      '<div class="hello"><div><p class="eyebrow">' + esc(p.company || t("l_" + p.licenseType)) + "</p><h2>" + esc(t("hello")((p.name || "").split(" ")[0])) + "</h2></div>" +
      '<button class="btn" type="button" id="out" style="min-height:40px">' + esc(t("signout")) + "</button></div>" +
      '<p class="lede small">' + esc(t("boardLede")) + " " + esc(areaLine(p)) + ".</p>" +
      '<div class="tabs" role="tablist">' + tab("feed", t("tabFeed")) + tab("requests", t("tabRequests")) + tab("connected", t("tabConnected")) + "</div>" +
      '<section id="pane"></section>';
    $("#out").onclick = signOut;
    $$(".tabs [data-tab]", app).forEach(function (b) { b.onclick = function () { S.tab = b.getAttribute("data-tab"); renderBoard(app); paintChrome(); }; });
    var pane = $("#pane");
    if (!S.feed) { pane.innerHTML = '<div class="card empty"><div class="ring"></div></div>'; return; }
    if (S.tab === "feed") paneFeed(pane);
    else if (S.tab === "requests") paneRequests(pane);
    else paneConnected(pane);
  }

  function caseBody(c) {
    var fresh = S.fresh[c.id] && Date.now() - S.fresh[c.id] < 120000;
    return '<div class="case-h"><h3>' + esc(issueText(c.issue)) + "</h3>" + (fresh ? '<span class="tag new">' + esc(t("newTag")) + "</span>" : "") +
      '<span class="tag ' + esc(c.urgency) + '">' + esc(t("u_" + c.urgency)) + "</span></div>" +
      '<div class="meta"><span>' + areaText(c.area) + "</span><span>" + esc(agoText(c.createdAt)) + "</span>" + (c.offerCount ? "<span>" + esc(t("offers")(c.offerCount)) + "</span>" : "") + "</div>" +
      tradeTags(c.trades) +
      (c.summary ? '<p class="summary">' + esc(c.summary) + "</p>" : "") +
      (c.policyFlags && c.policyFlags.length ? '<div class="flags"><p>' + esc(t("flagsTitle")) + "</p><ul>" + c.policyFlags.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul></div>" : "");
  }
  var LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  function paneFeed(pane) {
    var list = S.feed.cases;
    if (!list.length) {
      pane.innerHTML = '<div class="card empty"><div class="ring"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3"/></svg></div><h3>' + esc(t("emptyFeed")) + '</h3><p class="muted small">' + esc(t("emptyFeedSub")) + "</p></div>";
      return;
    }
    pane.innerHTML = list.map(function (c) {
      var fresh = S.fresh[c.id] && Date.now() - S.fresh[c.id] < 120000;
      var act;
      if (c.myOffer) act = '<div class="actions"><span class="tag ok">' + esc(t("requested")) + "</span><span class=\"tag\">" + esc(t("s_" + c.myOffer.status)) + "</span></div>";
      else if (S.openForm === c.id) act = '<form class="stack" data-offer="' + esc(c.id) + '" style="margin-top:14px"><textarea class="in" name="message" maxlength="600" placeholder="' + esc(t("requestPh")) + '"></textarea><p class="err" role="alert"></p><div class="actions" style="margin-top:0"><button class="btn gold" type="submit">' + esc(t("send")) + '</button><button class="btn" type="button" data-cancel>' + esc(t("cancel")) + "</button></div></form>";
      else act = '<div class="actions"><button class="btn gold" type="button" data-request="' + esc(c.id) + '">' + esc(t("request")) + "</button></div>";
      return '<article class="card case' + (fresh ? " fresh" : "") + '" id="case-' + esc(c.id) + '">' + caseBody(c) +
        '<p class="lock">' + LOCK + "<span>" + esc(c.hasDocs ? t("docsOnFile") : t("contactHidden")) + "</span></p>" + act + "</article>";
    }).join("");
    $$("[data-request]", pane).forEach(function (b) { b.onclick = function () { S.openForm = b.getAttribute("data-request"); paneFeed(pane); var ta = $("textarea", pane); if (ta) ta.focus(); }; });
    $$("[data-cancel]", pane).forEach(function (b) { b.onclick = function () { S.openForm = null; paneFeed(pane); }; });
    $$("form[data-offer]", pane).forEach(function (f) {
      f.onsubmit = function (e) {
        e.preventDefault();
        var msg = f.message.value.trim();
        if (msg.length < 10) { $(".err", f).textContent = t("err_short_message"); return; }
        busy(f, true);
        api("hs-pro-offer", { body: { caseId: f.getAttribute("data-offer"), message: msg } }).then(function (r) {
          busy(f, false);
          if (!r.ok) { $(".err", f).textContent = errText(r.body); return; }
          S.openForm = null; f.message.value = "";
          toast(t("sent"), "");
          poll();
        });
      };
    });
  }

  function statusTag(s) {
    var cls = { pending: "", accepted_talk_first: "soon", accepted: "ok", declined: "bad" }[s] || "";
    return '<span class="tag ' + cls + '">' + esc(t("s_" + s)) + "</span>";
  }
  function paneRequests(pane) {
    var list = S.feed.offers;
    if (!list.length) { pane.innerHTML = '<div class="card empty"><h3>' + esc(t("emptyRequests")) + "</h3></div>"; return; }
    pane.innerHTML = list.map(function (o) {
      var talk = o.status === "accepted_talk_first";
      return '<article class="card case">' + caseBody(o.case) +
        '<div class="actions">' + statusTag(o.status) + "</div>" +
        '<div class="flags"><p>' + esc(t("yourMessage")) + '</p><div class="small muted">' + esc(o.message) + "</div></div>" +
        (talk ? '<p class="lock">' + LOCK + "<span>" + esc(t("talkFirstNote")) + "</span></p>" + threadBox(o.caseId) : "") + "</article>";
    }).join("");
    wireThreads(pane);
  }
  function paneConnected(pane) {
    var list = S.feed.connected;
    if (!list.length) { pane.innerHTML = '<div class="card empty"><h3>' + esc(t("emptyConnected")) + '</h3><p class="muted small">' + esc(t("emptyConnectedSub")) + "</p></div>"; return; }
    pane.innerHTML = list.map(function (c) {
      var ct = c.contact || {};
      var rows = [
        ct.phone ? '<dt>' + esc(t("phone")) + '</dt><dd><a href="tel:' + esc(ct.phone) + '">' + esc(fmtPhone(ct.phone)) + "</a></dd>" : "",
        ct.email ? '<dt>' + esc(t("email")) + '</dt><dd><a href="mailto:' + esc(ct.email) + '">' + esc(ct.email) + "</a></dd>" : "",
        ct.preferred ? "<dt>" + esc(t("prefers")) + "</dt><dd>" + esc(t("p_" + ct.preferred)) + "</dd>" : "",
        c.address ? "<dt>" + esc(t("address")) + "</dt><dd>" + esc(c.address) + (c.zip ? ", " + esc(c.zip) : "") + "</dd>" : "",
        c.insurer ? "<dt>" + esc(t("insurer")) + "</dt><dd>" + esc(c.insurer) + "</dd>" : "",
        c.claimNumber ? "<dt>" + esc(t("claimNo")) + "</dt><dd>" + esc(c.claimNumber) + "</dd>" : "",
        c.policyNumber ? "<dt>" + esc(t("policyNo")) + "</dt><dd>" + esc(c.policyNumber) + "</dd>" : "",
      ].join("");
      var docs = (c.docs || []).length
        ? '<ul class="docs">' + c.docs.map(function (d) { return '<li><span>' + esc(d.name) + ' <small class="tiny">' + esc(Math.max(1, Math.round(d.size / 1024))) + ' KB</small></span><button class="btn" style="min-height:36px;padding:0 14px" type="button" data-doc="' + esc(d.id) + '" data-case="' + esc(c.id) + '" data-name="' + esc(d.name) + '">' + esc(t("download")) + "</button></li>"; }).join("") + "</ul>"
        : '<p class="small muted">' + esc(t("none")) + "</p>";
      return '<article class="card case">' + caseBody(c) +
        '<div class="contact"><p class="eyebrow" style="margin-bottom:4px">' + esc(t("contactTitle")) + '</p><div class="big">' + esc(ct.name) + '</div><dl class="kv" style="margin-top:10px">' + rows + "</dl></div>" +
        '<div class="thread"><p class="eyebrow">' + esc(t("documents")) + "</p>" + docs + "</div>" + threadBox(c.id) + "</article>";
    }).join("");
    $$("[data-doc]", pane).forEach(function (b) { b.onclick = function () { openDoc(b.getAttribute("data-case"), b.getAttribute("data-doc"), b.getAttribute("data-name")); }; });
    wireThreads(pane);
  }
  function fmtPhone(p) { var d = String(p).replace(/\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1); return d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : p; }

  /* Documents: fetched through the authed function, never a public URL. Big files come in parts. */
  function openDoc(caseId, docId, name) {
    var base = API + "hs-doc-get?d=" + encodeURIComponent(docId) + "&c=" + encodeURIComponent(caseId);
    fetch(base, { credentials: "same-origin" }).then(function (r) {
      if (r.ok) return r.blob();
      return r.json().then(function (b) {
        if (b.code !== "use_parts") throw new Error(errText(b));
        var parts = [], i = 0;
        var next = function () {
          if (i >= b.parts) return new Blob(parts, { type: b.type });
          return fetch(base + "&part=" + i++, { credentials: "same-origin" }).then(function (x) { if (!x.ok) throw new Error(t("err_generic")); return x.blob(); }).then(function (bl) { parts.push(bl); return next(); });
        };
        return next();
      });
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = name || "document"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    }).catch(function (e) { toast(e.message || t("err_generic"), ""); });
  }

  /* Talk-first / connected thread. */
  function threadBox(caseId) {
    var th = S.threads[caseId];
    var msgs = th && th.messages ? th.messages : null;
    return '<div class="thread" data-thread="' + esc(caseId) + '"><p class="eyebrow">' + esc(t("thread")) + '</p><div class="msgs">' +
      (msgs ? (msgs.length ? msgs.map(function (m) { return '<div class="msg' + (m.from === "pro" ? " me" : "") + '">' + esc(m.text) + "<small>" + esc(m.from === "pro" ? t("you") : t("homeowner")) + " &middot; " + esc(agoText(m.at)) + "</small></div>"; }).join("") : '<p class="small muted">' + esc(t("noMsgs")) + "</p>") : "") +
      '</div><form class="send"><input class="in" name="text" maxlength="2000" placeholder="' + esc(t("writePh")) + '" autocomplete="off"><button class="btn gold" type="submit" style="min-height:44px">' + esc(t("sendMsg")) + "</button></form></div>";
  }
  function wireThreads(pane) {
    $$("[data-thread]", pane).forEach(function (box) {
      var id = box.getAttribute("data-thread");
      if (!S.threads[id]) loadThread(id);
      var m = $(".msgs", box); if (m) m.scrollTop = m.scrollHeight;
      $("form", box).onsubmit = function (e) {
        e.preventDefault();
        var inp = e.target.text, text = inp.value.trim();
        if (!text) return;
        api("hs-case-messages", { body: { caseId: id, text: text } }).then(function (r) {
          if (!r.ok) { toast(errText(r.body), ""); return; }
          inp.value = "";
          loadThread(id);
        });
      };
    });
  }
  function loadThread(id) {
    return api("hs-case-messages?c=" + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) return;
      S.threads[id] = r.body;
      var box = document.querySelector('[data-thread="' + id + '"]');
      if (box && !(document.activeElement && box.contains(document.activeElement) && document.activeElement.value)) {
        var fresh = document.createElement("div"); fresh.innerHTML = threadBox(id);
        box.replaceWith(fresh.firstChild);
        wireThreads(document.getElementById("pane"));
      }
    });
  }

  /* ---------- boot ---------- */
  render();
  api("hs-pro-me").then(function (r) {
    if (r.status === 401 || !r.ok) { S.view = "auth"; render(); return; }
    afterAuth(r.body);
  }).catch(function () { S.view = "auth"; render(); });
  setInterval(function () { if (S.view === "board" && !isTyping()) $$(".meta span:nth-child(2)").length && renderBoard($("#app")); }, 60000);
})();
