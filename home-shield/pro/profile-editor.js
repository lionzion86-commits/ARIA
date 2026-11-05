/* ARIA HOME SHIELD -- desk "My profile" (every desk: /home-shield/pro and /home-shield/partners).
   Field editor, gallery manager (add / reorder / main / remove; photos re-encoded on a canvas,
   which drops EXIF and GPS, in two sizes), coverage editor (license states + statewide or a
   10-500 mile range from a base ZIP), completeness meter, and a live preview built with the SAME
   renderers the customer carousel uses (window.HSPros), so what you save is what they see.
   window.HSProfileEditor.mount(el, lang). English / Spanish in I18N. */
(function () {
  "use strict";
  var API = "/.netlify/functions/";
  var I18N = {
    en: {
      title: "My profile", lede: "This is what homeowners see when they choose who to work with. Your words, your photos.",
      meter: "Profile complete", ready: "Your profile is complete. Homeowners in your range can choose you.", missingIntro: "Still missing:",
      m_mainPhoto: "a main photo", m_displayName: "your name or firm name", m_trade: "your trade", m_yearsInBusiness: "years in business", m_about: "an About of at least 80 characters",
      pendingNote: "You appear to homeowners once your license is verified and your profile is complete.",
      kind: "I am", individual: "An individual professional", firm: "A firm", displayName: "Name shown to homeowners", firmName: "Firm name (optional)",
      trade: "Trade", years: "Years in business", about: "About you, in your own words", aboutHint: "At least 80 characters.", philosophy: "How you work (optional)",
      specialties: "Specialties (comma separated, up to 8)", save: "Save profile", saved: "Saved",
      tr_roofer: "Contractor", tr_public_adjuster: "Public adjuster", tr_attorney: "Attorney", tr_insurance_agent: "Insurance agent", tr_inspector: "Inspector",
      gallery: "Photo gallery", galleryHint: "Up to 12. The main photo leads your card. Photos are resized on this phone and location data is removed.",
      addPhotos: "Add photos", main: "Main", makeMain: "Make main", left: "Move left", right: "Move right", remove: "Remove", uploading: "Uploading...",
      coverage: "Where you take jobs", licensed: "States where you are licensed", range: "Your range", statewide: "Anywhere in my licensed states", radius: "Within a distance of my base",
      baseZip: "Base ZIP", milesLabel: "Range", mi: "miles", saveCoverage: "Save coverage",
      deal: "If a customer inside your range picks you, you take the job. You drive to it. Homeowners never see your base, your city or how far you are; they see that you are licensed in their area.",
      preview: "Live preview", previewCard: "Card in the carousel", previewFull: "Full profile", noPhotoPreview: "Add a main photo: without a photo there is no card.",
      err: "Something went wrong. Please try again.", e_exif_gps: "That photo still carries location data. Save it again without location and retry.",
    },
    es: {
      title: "Mi perfil", lede: "Esto es lo que ven los dueños de casa cuando eligen con quién trabajar. Tus palabras, tus fotos.",
      meter: "Perfil completo", ready: "Tu perfil está completo. Los dueños de casa dentro de tu alcance pueden elegirte.", missingIntro: "Todavía falta:",
      m_mainPhoto: "una foto principal", m_displayName: "tu nombre o el de tu firma", m_trade: "tu especialidad", m_yearsInBusiness: "años de experiencia", m_about: "un Sobre ti de al menos 80 caracteres",
      pendingNote: "Apareces ante los dueños de casa cuando tu licencia está verificada y tu perfil está completo.",
      kind: "Soy", individual: "Un profesional independiente", firm: "Una firma", displayName: "Nombre que ven los dueños de casa", firmName: "Nombre de la firma (opcional)",
      trade: "Especialidad", years: "Años de experiencia", about: "Sobre ti, en tus propias palabras", aboutHint: "Al menos 80 caracteres.", philosophy: "Cómo trabajas (opcional)",
      specialties: "Especialidades (separadas por comas, hasta 8)", save: "Guardar perfil", saved: "Guardado",
      tr_roofer: "Contratista", tr_public_adjuster: "Ajustador público", tr_attorney: "Abogado", tr_insurance_agent: "Agente de seguros", tr_inspector: "Inspector",
      gallery: "Galería de fotos", galleryHint: "Hasta 12. La foto principal encabeza tu tarjeta. Las fotos se ajustan en este teléfono y se les quita la ubicación.",
      addPhotos: "Agregar fotos", main: "Principal", makeMain: "Hacer principal", left: "Mover a la izquierda", right: "Mover a la derecha", remove: "Quitar", uploading: "Subiendo...",
      coverage: "Dónde tomas trabajos", licensed: "Estados donde tienes licencia", range: "Tu alcance", statewide: "En cualquier parte de mis estados con licencia", radius: "Dentro de una distancia de mi base",
      baseZip: "ZIP de tu base", milesLabel: "Alcance", mi: "millas", saveCoverage: "Guardar cobertura",
      deal: "Si un cliente dentro de tu alcance te elige, tú tomas el trabajo. Tú manejas hasta allá. Los dueños de casa nunca ven tu base, tu ciudad ni a qué distancia estás; ven que tienes licencia en su zona.",
      preview: "Vista previa en vivo", previewCard: "Tarjeta en el carrusel", previewFull: "Perfil completo", noPhotoPreview: "Agrega una foto principal: sin foto no hay tarjeta.",
      err: "Algo salió mal. Inténtalo de nuevo.", e_exif_gps: "Esa foto todavía tiene datos de ubicación. Guárdala de nuevo sin ubicación e inténtalo otra vez.",
    },
  };
  var TRADES = ["roofer", "public_adjuster", "attorney", "insurance_agent", "inspector"];
  var STATES = ["FL", "GA", "AL", "LA", "MS", "SC", "NC", "TX", "TN", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "ME", "MD", "MA", "MI", "MN", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "ND", "OH", "OK", "OR", "PA", "RI", "SD", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];
  var L = "en";
  function t(k) { var v = I18N[L][k]; return v == null ? I18N.en[k] : v; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function api(path, body) {
    var o = { credentials: "same-origin", headers: {} };
    if (body) { o.method = "POST"; o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    return fetch(API + path, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); });
  }
  var CSS = ".pe .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pe-meter{height:8px;border-radius:999px;background:#2A2A2E;overflow:hidden;margin:8px 0}.pe-meter i{display:block;height:100%;background:linear-gradient(90deg,#C9A24A,#E4C77E)}" +
    ".pe-gal{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.pe-ph{position:relative;border-radius:10px;overflow:hidden;border:1px solid #3A3A40;background:#111113}.pe-ph img{display:block;width:100%;aspect-ratio:1;object-fit:cover}" +
    ".pe-ph.main{border-color:#C9A24A;box-shadow:0 0 0 1px #C9A24A}.pe-ph .tg{position:absolute;left:6px;top:6px;font-size:10px;font-weight:800;background:#C9A24A;color:#0B0B0C;border-radius:999px;padding:2px 7px}" +
    ".pe-ph .ac{display:flex;justify-content:space-between;gap:2px;padding:4px}.pe-ph .ac button{flex:1;min-height:30px;border:0;border-radius:6px;background:#1B1B1E;color:#F5F1E8;font-size:12px;cursor:pointer}" +
    ".pe-states{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;max-height:150px;overflow-y:auto;padding:2px}.pe-states label{display:flex;align-items:center;justify-content:center;gap:4px;min-height:36px;border:1px solid #3A3A40;border-radius:8px;font-size:13px;cursor:pointer}" +
    ".pe-states input{accent-color:#C9A24A}.pe-states label:has(input:checked){border-color:#C9A24A;color:#E4C77E;background:rgba(201,162,74,.12)}.pe-range{width:100%;accent-color:#C9A24A}.pe-prev{background:#0b0a08;border:1px solid #2A2A2E;border-radius:16px;padding:12px;overflow:hidden}" +
    ".pe-prev .hsp-card{flex:none;width:100%;max-width:300px}.pe-prev .hsp-gal img{border-radius:12px}";

  var S = null, root = null;
  function mount(el, lang) {
    root = el; L = lang === "es" ? "es" : "en";
    if (window.HSPros) window.HSPros.injectCss();
    if (!document.getElementById("pe-css")) { var st = document.createElement("style"); st.id = "pe-css"; st.textContent = CSS; document.head.appendChild(st); }
    if (S) { paint(); return; }
    root.innerHTML = '<p class="muted small">...</p>';
    api("hs-pro-profile-self").then(function (r) { if (r.ok) { S = r.body; paint(); } else root.innerHTML = '<p class="err">' + esc(t("err")) + "</p>"; });
  }
  function pct() { return Math.round(((5 - S.missing.length) / 5) * 100); }
  function photoSrc(id, size) { return API + "hs-profile-photo?p=" + encodeURIComponent(S.pro.id) + "&i=" + encodeURIComponent(id) + "&s=" + size; }
  function paint() {
    var p = S.profile || {}, cv = S.coverage, r = cv.range || { mode: "statewide" };
    var photos = p.photos || [];
    var HP = window.HSPros;
    root.innerHTML = '<div class="pe">' +
      '<p class="eyebrow">' + esc(t("title")) + '</p><p class="lede small" style="margin-top:0">' + esc(t("lede")) + "</p>" +
      '<div class="card" style="margin-top:12px"><b>' + esc(t("meter")) + ": " + pct() + '%</b><div class="pe-meter"><i style="width:' + pct() + '%"></i></div>' +
      (S.complete ? '<p class="small" style="color:#7FBF8E;margin:0">' + esc(t("ready")) + "</p>" : '<p class="small muted" style="margin:0">' + esc(t("missingIntro")) + " " + S.missing.map(function (m) { return esc(t("m_" + m)); }).join(", ") + "</p>") +
      (!S.verified ? '<p class="tiny" style="margin:8px 0 0">' + esc(t("pendingNote")) + "</p>" : "") + "</div>" +
      '<form class="card stack" id="peForm" style="margin-top:12px">' +
      '<div class="seg" role="radiogroup" aria-label="' + esc(t("kind")) + '" style="margin:0"><button type="button" data-kind="individual" aria-selected="' + (p.kind !== "firm") + '">' + esc(t("individual")) + '</button><button type="button" data-kind="firm" aria-selected="' + (p.kind === "firm") + '">' + esc(t("firm")) + "</button></div>" +
      fld("displayName", t("displayName"), p.displayName, 80) + fld("firmName", t("firmName"), p.firmName, 100) +
      '<div class="row2"><label class="f"><span>' + esc(t("trade")) + '</span><select class="in" name="trade"><option value=""></option>' + TRADES.map(function (x) { return '<option value="' + x + '"' + (p.trade === x ? " selected" : "") + ">" + esc(t("tr_" + x)) + "</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span>' + esc(t("years")) + '</span><input class="in" name="yearsInBusiness" type="number" min="0" max="80" inputmode="numeric" value="' + esc(p.yearsInBusiness == null ? "" : p.yearsInBusiness) + '"></label></div>' +
      '<label class="f"><span>' + esc(t("about")) + ' <small class="tiny">' + esc(t("aboutHint")) + '</small></span><textarea class="in" name="about" maxlength="1500" rows="5">' + esc(p.about || "") + "</textarea></label>" +
      '<label class="f"><span>' + esc(t("philosophy")) + '</span><textarea class="in" name="philosophy" maxlength="600" rows="3">' + esc(p.philosophy || "") + "</textarea></label>" +
      fld("specialties", t("specialties"), (p.specialties || []).join(", "), 400) +
      '<div class="actions" style="margin-top:0"><button class="btn gold" type="submit">' + esc(t("save")) + '</button><span class="small muted" id="peSaved"></span></div></form>' +
      '<section class="card stack" style="margin-top:12px"><h3>' + esc(t("gallery")) + '</h3><p class="tiny" style="margin:0">' + esc(t("galleryHint")) + "</p>" +
      (photos.length ? '<div class="pe-gal">' + photos.map(function (ph, i) {
        return '<div class="pe-ph' + (ph.main ? " main" : "") + '"><img src="' + esc(photoSrc(ph.id, "card")) + '" alt="" loading="lazy">' + (ph.main ? '<span class="tg">' + esc(t("main")) + "</span>" : "") +
          '<div class="ac"><button type="button" data-mv="' + i + '" data-d="-1" aria-label="' + esc(t("left")) + '">&lsaquo;</button>' + (ph.main ? "" : '<button type="button" data-main="' + esc(ph.id) + '">' + esc(t("main")) + "</button>") +
          '<button type="button" data-mv="' + i + '" data-d="1" aria-label="' + esc(t("right")) + '">&rsaquo;</button><button type="button" data-rm="' + esc(ph.id) + '" aria-label="' + esc(t("remove")) + '">&times;</button></div></div>';
      }).join("") + "</div>" : "") +
      (photos.length < 12 ? '<label class="btn" style="width:100%">' + esc(t("addPhotos")) + '<input type="file" id="peFiles" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden></label>' : "") + '<p class="small" id="peUp"></p></section>' +
      '<form class="card stack" id="peCov" style="margin-top:12px"><h3>' + esc(t("coverage")) + '</h3><p class="small" style="color:#E4C77E;margin:0">' + esc(t("deal")) + "</p>" +
      '<span class="small muted" style="font-weight:700">' + esc(t("licensed")) + '</span><div class="pe-states">' + STATES.map(function (s) { return '<label><input type="checkbox" name="ls" value="' + s + '"' + (cv.licenseStates.indexOf(s) >= 0 ? " checked" : "") + ">" + s + "</label>"; }).join("") + "</div>" +
      '<span class="small muted" style="font-weight:700">' + esc(t("range")) + "</span>" +
      '<label class="check"><input type="radio" name="mode" value="statewide"' + (r.mode === "statewide" ? " checked" : "") + "><span>" + esc(t("statewide")) + "</span></label>" +
      '<label class="check"><input type="radio" name="mode" value="radius"' + (r.mode !== "statewide" ? " checked" : "") + "><span>" + esc(t("radius")) + "</span></label>" +
      '<div class="row2" id="peRad"' + (r.mode === "statewide" ? " hidden" : "") + '><label class="f"><span>' + esc(t("baseZip")) + '</span><input class="in" name="baseZip" inputmode="numeric" maxlength="5" value="' + esc(r.baseZip || "") + '"></label>' +
      '<label class="f"><span>' + esc(t("milesLabel")) + ': <b id="peMi">' + esc(r.miles || 50) + "</b> " + esc(t("mi")) + '</span><input class="pe-range" type="range" name="miles" min="10" max="500" step="5" value="' + esc(r.miles || 50) + '"></label></div>' +
      '<div class="actions" style="margin-top:0"><button class="btn gold" type="submit">' + esc(t("saveCoverage")) + '</button><span class="small muted" id="peCovSaved"></span></div></form>' +
      '<section class="sec" style="margin-top:16px"><h3>' + esc(t("preview")) + '</h3><p class="tiny">' + esc(t("previewCard")) + '</p><div class="pe-prev">' +
      (HP && S.preview.card.mainPhoto ? HP.cardHTML(S.preview.card) : '<p class="small muted">' + esc(t("noPhotoPreview")) + "</p>") + '</div><p class="tiny" style="margin-top:12px">' + esc(t("previewFull")) + '</p><div class="pe-prev" style="padding:0">' + (HP ? HP.fullHTML(S.preview.full, false) : "") + "</div></section></div>";
    wire();
  }
  function fld(n, label, v, max) { return '<label class="f"><span>' + esc(label) + '</span><input class="in" name="' + n + '" maxlength="' + max + '" value="' + esc(v || "") + '"></label>'; }
  function after(r, msgEl) {
    if (!r.ok) { var e = document.getElementById(msgEl); if (e) e.textContent = (r.body && r.body.code && I18N[L]["e_" + r.body.code]) || (r.body && r.body.error) || t("err"); return; }
    S = r.body; paint(); var m = document.getElementById(msgEl); if (m) m.textContent = t("saved");
  }
  function wire() {
    var f = document.getElementById("peForm"), kind = (S.profile && S.profile.kind) || "individual";
    Array.prototype.forEach.call(f.querySelectorAll("[data-kind]"), function (b) { b.onclick = function () { kind = b.getAttribute("data-kind"); Array.prototype.forEach.call(f.querySelectorAll("[data-kind]"), function (x) { x.setAttribute("aria-selected", String(x === b)); }); }; });
    f.onsubmit = function (e) {
      e.preventDefault();
      api("hs-pro-profile-self", { profile: { kind: kind, displayName: f.displayName.value, firmName: f.firmName.value, trade: f.trade.value, yearsInBusiness: f.yearsInBusiness.value === "" ? null : Number(f.yearsInBusiness.value),
        about: f.about.value, philosophy: f.philosophy.value, specialties: f.specialties.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean) } }).then(function (r) { after(r, "peSaved"); });
    };
    var c = document.getElementById("peCov");
    Array.prototype.forEach.call(c.querySelectorAll("input[name=mode]"), function (x) { x.onchange = function () { document.getElementById("peRad").hidden = c.mode.value === "statewide"; }; });
    c.miles.oninput = function () { document.getElementById("peMi").textContent = c.miles.value; };
    c.onsubmit = function (e) {
      e.preventDefault();
      var ls = Array.prototype.map.call(c.querySelectorAll("input[name=ls]:checked"), function (x) { return x.value; });
      var range = c.mode.value === "statewide" ? { mode: "statewide" } : { mode: "radius", baseZip: c.baseZip.value.trim(), miles: Number(c.miles.value) };
      api("hs-pro-profile-self", { coverage: { licenseStates: ls, range: range } }).then(function (r) { after(r, "peCovSaved"); });
    };
    var ids = (S.profile.photos || []).map(function (p) { return p.id; });
    Array.prototype.forEach.call(root.querySelectorAll("[data-mv]"), function (b) {
      b.onclick = function () { var i = Number(b.getAttribute("data-mv")), j = i + Number(b.getAttribute("data-d")); if (j < 0 || j >= ids.length) return; var o = ids.slice(); o.splice(j, 0, o.splice(i, 1)[0]); api("hs-pro-photo-order", { order: o }).then(function (r) { after(r, "peUp"); }); };
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-main]"), function (b) { b.onclick = function () { api("hs-pro-photo-order", { order: ids, main: b.getAttribute("data-main") }).then(function (r) { after(r, "peUp"); }); }; });
    Array.prototype.forEach.call(root.querySelectorAll("[data-rm]"), function (b) { b.onclick = function () { api("hs-pro-photo-delete", { photoId: b.getAttribute("data-rm") }).then(function (r) { after(r, "peUp"); }); }; });
    var fi = document.getElementById("peFiles");
    if (fi) fi.onchange = function () {
      var files = Array.prototype.slice.call(fi.files, 0, 12 - ids.length);
      var up = document.getElementById("peUp"); up.textContent = t("uploading");
      files.reduce(function (p, file) { return p.then(function () { return shrinkBoth(file).then(function (two) { return api("hs-pro-photo-upload", two).then(function (r) { after(r, "peUp"); }); }); }); }, Promise.resolve())
        .catch(function () { var u = document.getElementById("peUp"); if (u) u.textContent = t("err"); });
    };
  }
  /* Canvas re-encode: drops EXIF / GPS; full <= 1600 px, card <= 480 px, JPEG 0.85. */
  function shrinkBoth(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var out = {};
        [["full", 1600], ["card", 480]].forEach(function (s) {
          var k = Math.min(1, s[1] / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
          var cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(img, 0, 0, w, h);
          out[s[0]] = { data: cv.toDataURL("image/jpeg", 0.85).split(",")[1], w: w, h: h };
        });
        URL.revokeObjectURL(url); res(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("decode")); };
      img.src = url;
    });
  }
  window.HSProfileEditor = { mount: mount, reset: function () { S = null; } };
})();
