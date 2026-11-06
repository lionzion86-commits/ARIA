/* ARIA HOME SHIELD -- the admin's own door (#443 c.6672170980). Used by home-shield/admin.html
   and home-shield/partners/admin.html. A Shield login card (email + password), "Set / reset my
   password" (an emailed one-time link), the setup screen for ?setup=<token>, and for someone
   already signed in to the shop as an admin, a "Set a Shield password" panel. It always says WHY
   access was refused, never links to the storefront, and the pages re-check on focus.
   window.HSAdminGate: me(), render(el, lang, code, onIn), shopPanel(el, lang, me, onDone), logout(). */
(function () {
  "use strict";
  var API = "/.netlify/functions/";
  var I18N = {
    en: {
      title: "Home Shield admin", email: "Email", password: "Password", signin: "Sign in", setReset: "Set / reset my password",
      r_no_session: "No admin session. Sign in below.", r_not_admin: "This account isn't a Home Shield admin.", r_bad_credentials: "Wrong email or password.",
      r_link_expired: "Link expired. Request a new one.", r_rate_limited: "Too many attempts. Wait 15 minutes and try again.", r_weak_password: "Use a password of at least 10 characters.", r_network: "Could not reach the server. Check your connection.",
      sent: "If this email is a Home Shield admin, a link to set the password is on its way. It works once, for 30 minutes.", needEmail: "Enter your admin email first.",
      setupTitle: "Choose your admin password", newPassword: "New password (10+ characters)", savePw: "Save and sign in", backToSignin: "Back to sign in",
      shopTitle: "Set a Shield password", shopBody: "You are in through your store sign-in. Set a Home Shield password so this page has its own door.", shopSet: "Set password",
      shopDone: "Shield password saved. Next time, sign in here with your email and this password.", signout: "Sign out", working: "One moment...",
    },
    es: {
      title: "Administración de Home Shield", email: "Correo", password: "Contraseña", signin: "Entrar", setReset: "Crear / cambiar mi contraseña",
      r_no_session: "No hay una sesión de administrador. Entra aquí abajo.", r_not_admin: "Esta cuenta no es administradora de Home Shield.", r_bad_credentials: "Correo o contraseña incorrectos.",
      r_link_expired: "El enlace venció. Pide uno nuevo.", r_rate_limited: "Demasiados intentos. Espera 15 minutos y vuelve a intentar.", r_weak_password: "Usa una contraseña de al menos 10 caracteres.", r_network: "No se pudo conectar con el servidor. Revisa tu conexión.",
      sent: "Si este correo es de un administrador de Home Shield, ya va en camino un enlace para crear la contraseña. Sirve una sola vez, por 30 minutos.", needEmail: "Primero escribe tu correo de administrador.",
      setupTitle: "Elige tu contraseña de administrador", newPassword: "Contraseña nueva (10 caracteres o más)", savePw: "Guardar y entrar", backToSignin: "Volver a entrar",
      shopTitle: "Crea una contraseña de Shield", shopBody: "Entraste con tu sesión de la tienda. Crea una contraseña de Home Shield para que esta página tenga su propia puerta.", shopSet: "Crear contraseña",
      shopDone: "Contraseña de Shield guardada. La próxima vez, entra aquí con tu correo y esta contraseña.", signout: "Salir", working: "Un momento...",
    },
  };
  var L = "en";
  function t(k) { var v = I18N[L][k]; return v == null ? I18N.en[k] : v; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function call(path, body) {
    var o = { credentials: "same-origin", headers: {} };
    if (body) { o.method = "POST"; o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    return fetch(API + path, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); },
      function () { return { ok: false, status: 0, body: { code: "network" } }; });
  }
  function reason(code) { var k = "r_" + (code || "no_session"); return I18N.en[k] ? t(k) : t("r_no_session"); }
  var setupToken = null;
  try { setupToken = new URLSearchParams(location.search).get("setup"); } catch (e) { setupToken = null; }
  function clearSetupParam() {
    setupToken = null;
    try { var u = new URL(location.href); u.searchParams.delete("setup"); history.replaceState(null, "", u.pathname + (u.search || "")); } catch (e) { /* old browser */ }
  }
  var CSS = ".hsg{max-width:440px;margin:24px auto}.hsg h2{margin:0 0 6px}.hsg .why{margin:0 0 14px;padding:10px 12px;border-radius:10px;border:1px solid rgba(201,162,74,.45);background:rgba(201,162,74,.10);color:#E4C77E;font-size:14px}" +
    ".hsg label{display:block;margin-top:10px;font-size:13px;color:#BDB7AA;font-weight:700}.hsg .in{margin-top:6px}.hsg .row{margin-top:14px}.hsg .note{font-size:13px;color:#BDB7AA;margin:10px 0 0}.hsg .linkish{background:none;border:0;color:#E4C77E;text-decoration:underline;cursor:pointer;font:inherit;padding:0;margin-top:12px}";
  function css() { if (document.getElementById("hsg-css")) return; var s = document.createElement("style"); s.id = "hsg-css"; s.textContent = CSS; document.head.appendChild(s); }

  function render(el, lang, code, onIn) {
    L = lang === "es" ? "es" : "en"; css();
    if (setupToken) return renderSetup(el, onIn);
    el.innerHTML = '<div class="card hsg" id="hsGate"><h2>' + esc(t("title")) + '</h2><p class="why" id="hsWhy" role="status">' + esc(reason(code)) + "</p>" +
      '<form id="hsLogin"><label>' + esc(t("email")) + '<input class="in" name="email" type="email" autocomplete="username" required></label>' +
      '<label>' + esc(t("password")) + '<input class="in" name="password" type="password" autocomplete="current-password" required></label>' +
      '<div class="row"><button class="btn gold" type="submit" id="hsSignin">' + esc(t("signin")) + "</button></div></form>" +
      '<button class="linkish" type="button" id="hsSetReq">' + esc(t("setReset")) + '</button><p class="note" id="hsNote" hidden></p></div>';
    var f = el.querySelector("#hsLogin"), why = el.querySelector("#hsWhy"), note = el.querySelector("#hsNote");
    f.onsubmit = function (e) {
      e.preventDefault();
      why.textContent = t("working");
      call("hs-admin-login", { email: f.email.value, password: f.password.value }).then(function (r) {
        if (r.ok) { onIn(); return; }
        why.textContent = reason(r.body.code || "bad_credentials");
      });
    };
    el.querySelector("#hsSetReq").onclick = function () {
      if (!f.email.value.trim()) { note.hidden = false; note.textContent = t("needEmail"); return; }
      call("hs-admin-setup-request", { email: f.email.value }).then(function () { note.hidden = false; note.textContent = t("sent"); });
    };
  }
  function renderSetup(el, onIn) {
    el.innerHTML = '<div class="card hsg" id="hsGate"><h2>' + esc(t("setupTitle")) + '</h2><p class="why" id="hsWhy" role="status" hidden></p>' +
      '<form id="hsSetup"><label>' + esc(t("newPassword")) + '<input class="in" name="password" type="password" autocomplete="new-password" minlength="10" required></label>' +
      '<div class="row"><button class="btn gold" type="submit">' + esc(t("savePw")) + '</button></div></form><button class="linkish" type="button" id="hsBack">' + esc(t("backToSignin")) + "</button></div>";
    var f = el.querySelector("#hsSetup"), why = el.querySelector("#hsWhy");
    el.querySelector("#hsBack").onclick = function () { clearSetupParam(); render(el, L, "no_session", onIn); };
    f.onsubmit = function (e) {
      e.preventDefault();
      call("hs-admin-setup", { token: setupToken, password: f.password.value }).then(function (r) {
        if (r.ok) { clearSetupParam(); onIn(); return; }
        why.hidden = false; why.textContent = reason(r.body.code);
        if (r.body.code === "link_expired") { clearSetupParam(); setTimeout(function () { render(el, L, "link_expired", onIn); }, 1200); }
      });
    };
  }
  /** For an admin who came in through the store sign-in: set a Shield password right here. */
  function shopPanel(el, lang, me, onDone) {
    L = lang === "es" ? "es" : "en"; css();
    if (!me || me.via !== "shop") { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="card hsg" style="margin:12px 0;max-width:none"><b>' + esc(t("shopTitle")) + '</b><p class="note">' + esc(t("shopBody")) + "</p>" +
      '<form id="hsShopPw" class="row" style="display:flex;gap:8px;flex-wrap:wrap"><input class="in" style="flex:1;min-width:180px;margin:0" name="password" type="password" autocomplete="new-password" minlength="10" placeholder="' + esc(t("newPassword")) + '" aria-label="' + esc(t("newPassword")) + '">' +
      '<button class="btn gold" type="submit">' + esc(t("shopSet")) + '</button></form><p class="note" id="hsShopNote" hidden></p></div>';
    var f = el.querySelector("#hsShopPw"), n = el.querySelector("#hsShopNote");
    f.onsubmit = function (e) {
      e.preventDefault();
      call("hs-admin-setup", { password: f.password.value }).then(function (r) {
        n.hidden = false; n.textContent = r.ok ? t("shopDone") : reason(r.body.code);
        if (r.ok && onDone) onDone();
      });
    };
  }
  function me() { return call("hs-admin-me"); }
  function logout() { return call("hs-admin-logout", {}); }
  window.HSAdminGate = { me: me, render: render, shopPanel: shopPanel, logout: logout, t: function (k, lang) { L = lang === "es" ? "es" : "en"; return t(k); } };
})();
