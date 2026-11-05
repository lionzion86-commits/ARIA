/* ARIA HOME SHIELD -- "Your options": the customer's pick carousel (caso.html) and the shared
   card / full-profile renderers (the desk "My profile" preview uses the same ones, so what a pro
   saves is exactly what the customer sees). #443 c.6668346697 / c.6668413152.

   Law kept here: no distance, no city, no base ZIP, no range, no sort or filter control;
   location language is only "Licensed in your area". The order is the server's best fit. No
   image, no card. Choosing opens a talk-first thread; nothing is shared until the customer says so.
   Additive to caso.html: it renders only into #hsPros. English / Spanish follow <html lang>. */
(function () {
  "use strict";
  var API = "/.netlify/functions/";
  var I18N = {
    en: {
      title: "Your options", sub: "Licensed professionals who serve your area. Look, compare, and choose who you want. Nobody gets your contact until you say so.",
      tr_roofer: "Contractors", tr_public_adjuster: "Public adjusters", tr_attorney: "Attorneys", tr_insurance_agent: "Insurance agents", tr_inspector: "Inspectors",
      one_roofer: "Contractor", one_public_adjuster: "Public adjuster", one_attorney: "Attorney", one_insurance_agent: "Insurance agent", one_inspector: "Inspector",
      years: "years in business", year1: "year in business", verified: "License verified", inArea: "Licensed in your area", firm: "Firm",
      photos: "photos", view: "See profile", choose: "Choose", close: "Close", about: "About", philosophy: "How we work", specialties: "Specialties",
      confirmQ: "Choose this professional?", confirmBody: "They will reach out to you inside the app. Nothing is shared until you say so.",
      yes: "Yes, choose", cancel: "Not yet", picked: "You picked", pickedBody: "They will reach out in the app; nothing is shared until you say so.",
      emptyTitle: "Aria is still lining up options here", emptyBody: "No professional for this is ready in your area yet. Keep talking with Aria or leave your case open; we will bring options to you.",
      talkAria: "Talk to Aria", err: "Something went wrong. Please try again.", gallery: "Photos",
    },
    es: {
      title: "Tus opciones", sub: "Profesionales con licencia que atienden tu zona. Mira, compara y elige a quien quieras. Nadie recibe tu contacto hasta que tú lo digas.",
      tr_roofer: "Contratistas", tr_public_adjuster: "Ajustadores públicos", tr_attorney: "Abogados", tr_insurance_agent: "Agentes de seguros", tr_inspector: "Inspectores",
      one_roofer: "Contratista", one_public_adjuster: "Ajustador público", one_attorney: "Abogado", one_insurance_agent: "Agente de seguros", one_inspector: "Inspector",
      years: "años de experiencia", year1: "año de experiencia", verified: "Licencia verificada", inArea: "Con licencia en tu zona", firm: "Firma",
      photos: "fotos", view: "Ver perfil", choose: "Elegir", close: "Cerrar", about: "Sobre nosotros", philosophy: "Cómo trabajamos", specialties: "Especialidades",
      confirmQ: "¿Eliges a este profesional?", confirmBody: "Se comunicará contigo dentro de la app. Nada se comparte hasta que tú lo digas.",
      yes: "Sí, elegir", cancel: "Todavía no", picked: "Elegiste a", pickedBody: "Se comunicará contigo en la app; nada se comparte hasta que tú lo digas.",
      emptyTitle: "Aria todavía está reuniendo opciones aquí", emptyBody: "Aún no hay un profesional listo para esto en tu zona. Sigue conversando con Aria o deja tu caso abierto; te traeremos opciones.",
      talkAria: "Hablar con Aria", err: "Algo salió mal. Inténtalo de nuevo.", gallery: "Fotos",
    },
  };
  function lang() { return document.documentElement.lang === "es" ? "es" : "en"; }
  function t(k) { var v = I18N[lang()][k]; return v == null ? I18N.en[k] : v; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var CSS = ".hsp{margin:28px 0 8px}.hsp h2{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:26px;margin:0 0 6px;color:#f5efe3}.hsp>p{margin:0 0 16px;color:#b8ae9c;font-size:15px}" +
    ".hsp-sec{margin:18px 0 6px}.hsp-sec h3{margin:0 0 10px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#d6b46a}" +
    ".hsp-rail{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 12px;-webkit-overflow-scrolling:touch;scrollbar-width:none}.hsp-rail::-webkit-scrollbar{display:none}" +
    ".hsp-card{flex:0 0 78%;max-width:300px;scroll-snap-align:start;background:#13110d;border:1px solid rgba(214,180,106,.22);border-radius:18px;overflow:hidden;text-align:left;color:#f5efe3;padding:0;font:inherit;cursor:pointer}" +
    ".hsp-card img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#1b1813}.hsp-cb{padding:12px 14px 14px}.hsp-cb b{display:block;font-family:Fraunces,Georgia,serif;font-size:19px;line-height:1.2}" +
    ".hsp-meta{font-size:13px;color:#b8ae9c;margin-top:3px}.hsp-ab{font-size:14px;color:#e9e1d2;margin:8px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
    ".hsp-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.hsp-badge{font-size:11px;font-weight:700;letter-spacing:.04em;padding:3px 8px;border-radius:999px;border:1px solid rgba(214,180,106,.45);color:#ecd29a}" +
    ".hsp-empty{background:#13110d;border:1px solid rgba(214,180,106,.22);border-radius:18px;padding:16px}.hsp-empty b{font-family:Fraunces,Georgia,serif;font-size:18px;display:block}.hsp-empty p{color:#b8ae9c;margin:6px 0 12px;font-size:14px}" +
    ".hsp-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:999px;border:1px solid rgba(245,239,227,.25);background:none;color:#f5efe3;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}" +
    ".hsp-gold{background:linear-gradient(180deg,#ecd29a,#d6b46a);color:#1a1408;border-color:transparent}" +
    ".hsp-sheet{position:fixed;inset:0;z-index:60;background:rgba(5,4,3,.72);display:flex;align-items:flex-end;justify-content:center}.hsp-in{background:#0b0a08;border:1px solid rgba(214,180,106,.3);border-radius:22px 22px 0 0;width:100%;max-width:640px;max-height:92vh;overflow-y:auto;padding:0 0 calc(18px + env(safe-area-inset-bottom,0px))}" +
    ".hsp-gal{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}.hsp-gal::-webkit-scrollbar{display:none}.hsp-gal img{flex:0 0 100%;width:100%;aspect-ratio:4/3;object-fit:cover;scroll-snap-align:start;background:#1b1813}" +
    ".hsp-body{padding:16px 18px}.hsp-body h3{font-family:Fraunces,Georgia,serif;font-size:24px;margin:0;color:#f5efe3;text-transform:none;letter-spacing:0}.hsp-body h4{margin:16px 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#d6b46a}.hsp-body p{margin:0;color:#e9e1d2;white-space:pre-line}" +
    ".hsp-in{position:relative}.hsp-x{position:absolute;top:10px;right:10px;z-index:2;min-height:40px;background:rgba(11,10,8,.75)}.hsp-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.hsp-dots{font-size:12px;color:#8d8473;padding:6px 18px 0}" +
    ".hsp-picked{border-color:#d6b46a}.hsp-ok{color:#8fc7a0;font-weight:700}";
  function injectCss() { if (document.getElementById("hsp-css")) return; var s = document.createElement("style"); s.id = "hsp-css"; s.textContent = CSS; document.head.appendChild(s); }

  function yearsText(y) { return y === 1 ? "1 " + t("year1") : y + " " + t("years"); }
  /** The customer card (no image -> no card). */
  function cardHTML(c) {
    if (!c || !c.mainPhoto) return "";
    return '<button type="button" class="hsp-card" data-pro="' + esc(c.proId) + '"><img src="' + esc(c.mainPhoto) + '" alt="" loading="lazy" decoding="async">' +
      '<span class="hsp-cb"><b>' + esc(c.displayName) + "</b>" + '<span class="hsp-meta">' + esc(t("one_" + c.trade) || "") + " &middot; " + esc(yearsText(c.yearsInBusiness)) + (c.kind === "firm" && c.firmName ? " &middot; " + esc(c.firmName) : "") + "</span>" +
      (c.aboutShort ? '<span class="hsp-ab">' + esc(c.aboutShort) + "</span>" : "") +
      '<span class="hsp-badges">' + (c.licenseVerified ? '<span class="hsp-badge">' + esc(t("verified")) + "</span>" : "") + '<span class="hsp-badge">' + esc(t("inArea")) + "</span></span></span></button>";
  }
  /** The full profile sheet body (gallery, about, philosophy, specialties). */
  function fullHTML(p, withChoose) {
    var gal = (p.gallery || []).filter(function (g) { return g.full; });
    return (gal.length ? '<div class="hsp-gal" aria-label="' + esc(t("gallery")) + '">' + gal.map(function (g) { return '<img src="' + esc(g.full) + '" alt="" loading="lazy" decoding="async">'; }).join("") + "</div>" +
      (gal.length > 1 ? '<div class="hsp-dots">' + gal.length + " " + esc(t("photos")) + "</div>" : "") : "") +
      '<div class="hsp-body"><h3>' + esc(p.displayName) + "</h3>" +
      '<div class="hsp-meta">' + esc(t("one_" + p.trade) || "") + " &middot; " + esc(yearsText(p.yearsInBusiness)) + (p.firmName ? " &middot; " + esc(p.firmName) : "") + "</div>" +
      '<div class="hsp-badges">' + (p.licenseVerified ? '<span class="hsp-badge">' + esc(t("verified")) + "</span>" : "") + '<span class="hsp-badge">' + esc(t("inArea")) + "</span></div>" +
      (p.about ? "<h4>" + esc(t("about")) + "</h4><p>" + esc(p.about) + "</p>" : "") +
      (p.philosophy ? "<h4>" + esc(t("philosophy")) + "</h4><p>" + esc(p.philosophy) + "</p>" : "") +
      ((p.specialties || []).length ? "<h4>" + esc(t("specialties")) + '</h4><div class="hsp-badges">' + p.specialties.map(function (s) { return '<span class="hsp-badge">' + esc(s) + "</span>"; }).join("") + "</div>" : "") +
      (withChoose ? '<div class="hsp-actions" data-choose-box><button type="button" class="hsp-btn hsp-gold" data-choose>' + esc(t("choose")) + "</button></div>" : "") + "</div>";
  }
  window.HSPros = { cardHTML: cardHTML, fullHTML: fullHTML, injectCss: injectCss, t: t };

  /* ---------------- caso.html ---------------- */
  var root = document.getElementById("hsPros");
  if (!root) return;
  var qs = new URLSearchParams(location.search), C = qs.get("c"), T = qs.get("t");
  if (!C || !T) return;
  var S = { trades: [], lists: {}, picked: {} };
  function get(path) { return fetch(API + path, { credentials: "same-origin" }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); }); }

  function render() {
    injectCss();
    if (!S.trades.length) { root.hidden = true; return; }
    root.hidden = false;
    root.className = "hsp";
    root.innerHTML = "<h2>" + esc(t("title")) + "</h2><p>" + esc(t("sub")) + "</p>" + S.trades.map(function (tr) {
      var L = S.lists[tr];
      if (!L) return "";
      var head = '<section class="hsp-sec" data-trade="' + esc(tr) + '"><h3>' + esc(t("tr_" + tr)) + "</h3>";
      if (L.picked) {
        var pc = (L.pros || []).filter(function (p) { return p.proId === L.picked; })[0];
        return head + '<div class="hsp-empty hsp-picked"><b>' + esc(t("picked")) + " " + esc(pc ? pc.displayName : "") + '</b><p class="hsp-ok">' + esc(t("pickedBody")) + "</p></div></section>";
      }
      var cards = (L.pros || []).map(cardHTML).join("");
      if (!cards) return head + '<div class="hsp-empty"><b>' + esc(t("emptyTitle")) + "</b><p>" + esc(t("emptyBody")) + '</p><a class="hsp-btn hsp-gold" href="/home-shield?lang=' + lang() + '">' + esc(t("talkAria")) + "</a></div></section>";
      return head + '<div class="hsp-rail">' + cards + "</div></section>";
    }).join("");
    Array.prototype.forEach.call(root.querySelectorAll("[data-pro]"), function (b) {
      b.onclick = function () { openSheet(b.getAttribute("data-pro"), b.closest("[data-trade]").getAttribute("data-trade")); };
    });
  }

  function openSheet(proId, trade) {
    get("hs-pro-profile?p=" + encodeURIComponent(proId) + "&c=" + encodeURIComponent(C) + "&t=" + encodeURIComponent(T)).then(function (r) {
      if (!r.ok) return;
      var p = r.body.profile;
      var sh = document.createElement("div");
      sh.className = "hsp-sheet"; sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true"); sh.setAttribute("aria-label", p.displayName);
      sh.innerHTML = '<div class="hsp-in"><button type="button" class="hsp-btn hsp-x" data-close>' + esc(t("close")) + "</button>" + fullHTML(p, true) + "</div>";
      document.body.appendChild(sh);
      document.body.style.overflow = "hidden";
      var close = function () { sh.remove(); document.body.style.overflow = ""; };
      sh.addEventListener("click", function (e) { if (e.target === sh) close(); });
      sh.querySelector("[data-close]").onclick = close;
      sh.querySelector("[data-choose]").onclick = function () {
        var box = sh.querySelector("[data-choose-box]");
        box.innerHTML = '<div style="width:100%"><b style="display:block;font-size:17px">' + esc(t("confirmQ")) + '</b><p style="color:#b8ae9c;margin:6px 0 12px">' + esc(t("confirmBody")) + '</p><div class="hsp-actions" style="margin:0"><button type="button" class="hsp-btn hsp-gold" data-yes>' + esc(t("yes")) + '</button><button type="button" class="hsp-btn" data-no>' + esc(t("cancel")) + "</button></div></div>";
        box.querySelector("[data-no]").onclick = close;
        box.querySelector("[data-yes]").onclick = function () {
          fetch(API + "hs-case-pick", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: C, token: T, proId: proId, trade: trade }) })
            .then(function (x) { return x.json().then(function (b) { return { ok: x.ok, body: b }; }); })
            .then(function (x) {
              if (!x.ok) { box.innerHTML = '<p style="color:#f0a39a">' + esc(x.body.error || t("err")) + "</p>"; return; }
              box.innerHTML = '<p class="hsp-ok">' + esc(t("picked")) + " " + esc(p.displayName) + ". " + esc(t("pickedBody")) + "</p>";
              S.lists[trade].picked = proId;
              render();
            });
        };
      };
    });
  }

  get("hs-case-status?c=" + encodeURIComponent(C) + "&t=" + encodeURIComponent(T)).then(function (r) {
    if (!r.ok || !r.body.case) return;
    var cs = r.body.case;
    if (cs.status === "connected" || cs.status === "closed") return;
    S.trades = (cs.trades || []).slice(0, 5);
    return Promise.all(S.trades.map(function (tr) {
      return get("hs-pros-for-case?c=" + encodeURIComponent(C) + "&t=" + encodeURIComponent(T) + "&trade=" + encodeURIComponent(tr)).then(function (x) { S.lists[tr] = x.ok ? x.body : { pros: [] }; });
    })).then(render);
  }).catch(function () { /* the rest of the page works without options */ });
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
