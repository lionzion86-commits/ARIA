/* ============================================================
   VUELVE PRONTO -- A SOLD-OUT PRODUCT, EVERYWHERE A SHOPPER SEES IT
   (#443 c.6585537098, Danny's site-wide rule).

   A product the store lists as sold out (the record's `so`, the one
   stock flag the build carries: scripts/build-pdp-slices.mjs) is
   labelled «Vuelve pronto» -- never "Próximamente", which says it was
   never here. It stays CLICKABLE: its card opens its product page as
   any card does; it is only not addable to the cart. Its product page
   says «Vuelve pronto» and asks «Avísame cuando vuelva» (an email or a
   WhatsApp number, or the signed-in account's email in one tap), kept
   by netlify/functions/notify-restock.js so Aria can write back when it
   restocks.

   NOT FOR ANYTHING ELSE. A product unavailable for another reason keeps
   its own honest label: an off-sale store, a held used listing, pills
   and food (/off-sale.js), «Tonos en camino» (/shade-gate.js), «Tallas
   por confirmar» (sizes pending). The list (scripts/build-vuelve-
   pronto.mjs) leaves off-sale products out, and isSoldOut() says no to
   them too.

   THE LIST. assets/data/vuelve-pronto.json: FNV-1a hashes of the keys
   (a few KB, fetched once). A key is "<retailer>::<title lower case,
   spaces collapsed>", "::v:<listing>" for one listing, "*::<title>"
   when every store's copy is sold out (a card that links without its
   store). The server reads the full keys (scripts/lib/vuelve-pronto.js).

   WHERE.
     cards      every card on every page that loads this script: a
                homepage card ([data-cp-t], app bundle) or any link to
                producto.html (tiendas, departamentos, marcas, Ofertas,
                búsqueda, Diseñadores, ropa interior, comparison rows).
                The card gets the «Vuelve pronto» pill on its photo and
                a "Comprar" on it reads "Ver detalle" -- it still opens.
     PDP        producto.html and the app's product view: the cart
                button reads «Vuelve pronto», disabled, and the Avísame
                box sits under it.
     cart       the app's cart line and checkout.html say «Vuelve
                pronto»; Pagar waits until the line is removed; the
                order endpoint refuses it (orders-create.js).

   A plain script (no import/export), like /off-sale.js: pages load it
   with <script src="/vuelve-pronto.js">, the builders and functions
   through scripts/lib/vuelve-pronto.js.
   ============================================================ */
(function (root) {
  'use strict';
  var LABEL = 'Vuelve pronto';
  var CTA = 'Avísame cuando vuelva';
  var PRODUCT_NOTE = 'La tienda no lo tiene por ahora. Déjanos tu correo o tu WhatsApp y te avisamos cuando vuelva.';
  var VARIANT_NOTE_COLOR = 'Este color vuelve pronto: la tienda no lo tiene por ahora. Puedes elegir otro o pedir que te avisemos.';
  var VARIANT_NOTE_TONO = 'Este tono vuelve pronto: la tienda no lo tiene por ahora. Puedes elegir otro o pedir que te avisemos.';
  var LINE_NOTE = 'Vuelve pronto: la tienda no lo tiene por ahora. Quítalo de tu carrito para poder pagar.';
  var TOAST = 'Este producto vuelve pronto: la tienda no lo tiene por ahora.';
  var PRIVACY = 'Solo te escribimos para avisarte que volvió.';
  var ENDPOINT = '/.netlify/functions/notify-restock';
  var LIST_URL = '/assets/data/vuelve-pronto.json';

  function titleKey(t) {
    return String(t == null ? '' : t).toLowerCase().replace(/\s+/g, ' ').trim();
  }
  /* "<retailer>::<title>" (the sizes-pending key), "::v:<v>" for one listing. */
  function key(retailer, title, v) {
    var k = String(retailer == null ? '' : retailer).toLowerCase().trim() + '::' + titleKey(title);
    return v ? k + '::v:' + String(v).trim() : k;
  }
  /* FNV-1a, the shards' own hash (producto.html pdpHash), in base 36. */
  function hashKey(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return (h >>> 0).toString(36);
  }

  var SET = null, READY = null, KEYS = null;
  /* The server's copy: the full keys (scripts/lib/vuelve-pronto.js). */
  function useKeys(list) {
    KEYS = {};
    for (var i = 0; i < (list || []).length; i++) KEYS[list[i]] = true;
  }
  function useHashes(csv) {
    SET = {};
    var a = String(csv || '').split(',');
    for (var i = 0; i < a.length; i++) if (a[i]) SET[a[i]] = true;
  }
  function has(k) {
    if (KEYS) return KEYS[k] === true;
    return !!SET && SET[hashKey(k)] === true;
  }
  /* The pages' copy, fetched once. Resolves when the list is in (or
     could not be read: then nothing is labelled, and the server still
     refuses the order). */
  function load() {
    if (READY) return READY;
    if (KEYS || typeof fetch !== 'function') return (READY = Promise.resolve());
    READY = fetch(LIST_URL).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { useHashes(d && d.h); })
      .catch(function () { if (!SET) SET = {}; });
    return READY;
  }

  function otherGate(it) {
    var O = root.AriaOffSale;
    return !!(O && O.isOffSaleItem && O.isOffSaleItem({ retailer: it.retailer || it.store, title: it.title || it.name }));
  }
  /* Is this product, card or cart line sold out at its store? Its own
     `so` when it carries one (a product record), else the list. */
  function isSoldOut(it) {
    if (!it || typeof it !== 'object' || it.lineType === 'bundle-discount') return false;
    if (otherGate(it)) return false;
    if (it.so === 1 || it.so === true) return true;
    var title = it.title || it.name;
    if (!titleKey(title)) return false;
    var r = String(it.retailer || it.store || '').toLowerCase().trim();
    var v = it.variantId || it.v || '';
    if (r && v && has(key(r, title, v))) return true;
    if (r) return has(key(r, title));
    return has(key('*', title));
  }
  function soldOutLines(items) {
    var out = [], list = Array.isArray(items) ? items : [];
    for (var i = 0; i < list.length; i++) if (isSoldOut(list[i])) out.push(list[i]);
    return out;
  }
  function orderError(title) {
    return 'El producto “' + String(title || 'de tu carrito') + '” vuelve pronto: la tienda no lo tiene por ahora. '
      + 'Quítalo de tu carrito para continuar. No se cobró nada.';
  }

  /* ---------------- the pages ---------------- */
  var doc = typeof document !== 'undefined' ? document : null;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  var STYLE = ''
    + '.vp-pill{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.01em;line-height:1;padding:6px 9px;border-radius:999px;background:#14213D;color:#fff;white-space:nowrap}'
    + '.vp-on-photo{position:absolute;left:8px;bottom:8px;z-index:2;pointer-events:none}'
    + '.vp-inline{margin:4px 0 6px}'
    + '.vp-box{margin:12px 0 0;padding:14px;border:1px solid #D8DDE8;border-radius:14px;background:#F7F8FB;color:#14213D;max-width:420px}'
    + '.vp-box h3{font-size:15.5px;font-weight:800;margin:0 0 4px}'
    + '.vp-box p{font-size:13px;line-height:1.45;margin:0 0 10px;color:#4A5568}'
    + '.vp-ch{display:flex;gap:6px;margin:0 0 8px}'
    + '.vp-ch button{flex:1;min-height:40px;border-radius:999px;border:1px solid #C8CDD8;background:#fff;color:#14213D;font-size:13px;font-weight:700}'
    + '.vp-ch button[aria-pressed="true"]{background:#14213D;color:#fff;border-color:#14213D}'
    + '.vp-in{width:100%;box-sizing:border-box;height:46px;border:1px solid #C8CDD8;border-radius:12px;padding:0 12px;font-size:16px;background:#fff;color:#14213D}'
    + '.vp-send,.vp-one{display:block;width:100%;min-height:46px;margin:8px 0 0;border:0;border-radius:999px;background:#1D4ED8;color:#fff;font-size:14.5px;font-weight:800}'
    + '.vp-send[disabled],.vp-one[disabled]{opacity:.6}'
    + '.vp-alt{display:block;margin:8px 0 0;background:none;border:0;padding:4px 0;color:#1D4ED8;font-size:13px;font-weight:600;text-decoration:underline}'
    + '.vp-err{color:#B03A2E !important;font-weight:700;margin:8px 0 0 !important}'
    + '.vp-priv{font-size:12px !important;color:#6B7487 !important;margin:10px 0 0 !important}'
    + '.vp-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}'
    + '.vp-done h3{color:#0F7A3D}';
  function ensureStyle() {
    if (!doc || doc.getElementById('vp-style')) return;
    var s = doc.createElement('style');
    s.id = 'vp-style';
    s.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(s);
  }
  function pillHTML(extra) { return '<span class="vp-pill' + (extra ? ' ' + extra : '') + '" data-vuelve-pronto>' + LABEL + '</span>'; }

  /* The product a card shows: a homepage card carries it (data-cp-t /
     data-cp-r, railCardHTML); any other card is its link to producto.html. */
  function productOfCard(el) {
    var t = el.getAttribute && el.getAttribute('data-cp-t');
    if (t) return { title: t, retailer: (el.getAttribute('data-cp-r') || '').toLowerCase() };
    var href = el.getAttribute && el.getAttribute('href');
    if (!href) return null;
    var u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    if (!/\/producto(\.html)?$/.test(u.pathname)) return null;
    var title = u.searchParams.get('producto') || u.searchParams.get('id') || u.searchParams.get('nombre');
    if (!title) return null;
    return { title: title, retailer: (u.searchParams.get('tienda') || u.searchParams.get('store') || '').toLowerCase(), v: u.searchParams.get('v') || '' };
  }
  function labelCard(el) {
    if (el.getAttribute('data-vp') === '1') return;
    el.setAttribute('data-vp', '1');
    ensureStyle();
    /* A comparison row (search.html): the label rides with its badges. */
    if (el.classList && el.classList.contains('cmp-row')) {
      var top = el.querySelector('.cmp-badges');
      if (!top) {
        top = doc.createElement('div');
        top.className = 'cmp-badges';
        var head = el.querySelector('.cmp-top') || el;
        head.appendChild(top);
      }
      top.insertAdjacentHTML('afterbegin', pillHTML());
      return;
    }
    var img = el.querySelector('img');
    if (img && img.parentElement) {
      var box = img.parentElement;
      if (root.getComputedStyle && root.getComputedStyle(box).position === 'static') box.style.position = 'relative';
      box.insertAdjacentHTML('beforeend', pillHTML('vp-on-photo'));
    } else {
      el.insertAdjacentHTML('afterbegin', pillHTML('vp-inline'));
    }
    /* A card never offers a purchase its page cannot complete. */
    var btns = el.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) if (/^\s*Comprar\s*$/.test(btns[i].textContent || '')) btns[i].textContent = 'Ver detalle';
  }
  /* Only cards not yet looked at: a page that redraws often re-reads
     nothing it already read. */
  var CARD_SEL = '[data-cp-t]:not([data-vp]), a[href*="producto.html?"]:not([data-vp]), a[href^="/producto?"]:not([data-vp]), a[href^="producto?"]:not([data-vp])';
  function decorate(scope) {
    if (!doc || !SET && !KEYS) return;
    var list = (scope && scope.querySelectorAll ? scope : doc).querySelectorAll(CARD_SEL);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.getAttribute('data-vp')) continue;
      /* A link inside a homepage card is that card's. */
      if (!el.hasAttribute('data-cp-t') && el.closest && el.closest('[data-cp-t]')) continue;
      if (el.closest && el.closest('[data-vp-skip]')) continue;
      var p = productOfCard(el);
      if (p && isSoldOut(p)) labelCard(el);
      else el.setAttribute('data-vp', '0');
    }
  }
  var queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    (root.requestAnimationFrame || setTimeout)(function () { queued = false; decorate(doc); });
  }
  function watch() {
    if (!doc || watch.on) return;
    watch.on = true;
    load().then(function () {
      decorate(doc);
      if (typeof MutationObserver === 'function') new MutationObserver(queue).observe(doc.documentElement, { childList: true, subtree: true });
    });
  }

  /* ---------------- Avísame cuando vuelva ---------------- */
  function post(body) {
    return fetch(ENDPOINT, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d || {} }; }); })
      .catch(function () { return { ok: false, status: 0, data: { error: 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.' } }; });
  }
  var viewed = {};
  /* The anonymous "someone opened it" count: the product, nothing about who. */
  function countView(p) {
    var k = key(p.retailer, p.name || p.title, p.v);
    if (viewed[k] || typeof fetch !== 'function') return;
    viewed[k] = true;
    post({ action: 'view', title: p.name || p.title, store: p.retailer, v: p.v || '' });
  }
  var ME = null;
  function signedIn() {
    if (!ME) ME = fetch('/.netlify/functions/auth-me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return d && d.email ? String(d.email) : null; })
      .catch(function () { return null; });
    return ME;
  }
  function boxHTML() {
    return '<h3>' + CTA + '</h3>'
      + '<p>' + esc(PRODUCT_NOTE) + '</p>'
      + '<div class="vp-acct" hidden></div>'
      + '<div class="vp-form">'
      + '<div class="vp-ch" role="group" aria-label="Cómo te avisamos">'
      + '<button type="button" data-ch="email" aria-pressed="true">Correo</button>'
      + '<button type="button" data-ch="whatsapp" aria-pressed="false">WhatsApp</button></div>'
      + '<label class="vp-lbl" for="vp-contact" style="display:block;font-size:12.5px;font-weight:700;margin:0 0 6px">Tu correo</label>'
      + '<input id="vp-contact" class="vp-in" type="email" inputmode="email" autocomplete="email" placeholder="tucorreo@ejemplo.com" maxlength="120">'
      + '<input class="vp-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<button type="button" class="vp-send">' + CTA + '</button></div>'
      + '<p class="vp-err" role="alert" hidden></p>'
      + '<p class="vp-priv">' + PRIVACY + '</p>';
  }
  function thanksHTML(contact, already) {
    return '<h3>' + (already ? 'Ya estás en la lista' : 'Listo, te avisamos') + '</h3>'
      + '<p>Te escribimos a <b>' + esc(contact) + '</b> cuando la tienda lo vuelva a tener.</p>'
      + '<p class="vp-priv">' + PRIVACY + '</p>';
  }
  /* The box under the disabled cart button. p: { name, retailer, v }. */
  function mountInterest(container, p) {
    if (!doc || !container || !p) return null;
    ensureStyle();
    var box = doc.createElement('div');
    box.className = 'vp-box';
    box.id = 'vp-box';
    box.setAttribute('data-vp-skip', '');
    box.innerHTML = boxHTML();
    container.appendChild(box);
    var channel = 'email';
    var input = box.querySelector('#vp-contact');
    var lbl = box.querySelector('.vp-lbl');
    var err = box.querySelector('.vp-err');
    var send = box.querySelector('.vp-send');
    var chBtns = box.querySelectorAll('.vp-ch button');
    function setChannel(c) {
      channel = c;
      for (var i = 0; i < chBtns.length; i++) chBtns[i].setAttribute('aria-pressed', String(chBtns[i].getAttribute('data-ch') === c));
      if (c === 'whatsapp') {
        input.type = 'tel'; input.inputMode = 'tel'; input.autocomplete = 'tel'; input.placeholder = '987 654 321';
        lbl.textContent = 'Tu número de WhatsApp';
      } else {
        input.type = 'email'; input.inputMode = 'email'; input.autocomplete = 'email'; input.placeholder = 'tucorreo@ejemplo.com';
        lbl.textContent = 'Tu correo';
      }
      err.hidden = true;
    }
    for (var i = 0; i < chBtns.length; i++) chBtns[i].addEventListener('click', function () { setChannel(this.getAttribute('data-ch')); });
    function submit(body, btn, shown) {
      err.hidden = true;
      btn.disabled = true;
      post(body).then(function (r) {
        btn.disabled = false;
        if (r.ok && r.data && r.data.ok) {
          box.classList.add('vp-done');
          box.innerHTML = thanksHTML(r.data.contact || shown, r.data.already);
          return;
        }
        err.textContent = (r.data && r.data.error) || 'No pudimos guardar tu pedido. Inténtalo de nuevo en un momento.';
        err.hidden = false;
      });
    }
    var base = { action: 'notify', title: p.name || p.title, store: p.retailer, v: p.v || '' };
    send.addEventListener('click', function () {
      var contact = String(input.value || '').trim();
      if (!contact) {
        err.textContent = channel === 'whatsapp' ? 'Escribe tu número de WhatsApp.' : 'Escribe tu correo.';
        err.hidden = false;
        input.focus();
        return;
      }
      var b = {};
      for (var k in base) b[k] = base[k];
      b.channel = channel; b.contact = contact;
      b.website = (box.querySelector('.vp-hp') || {}).value || '';
      submit(b, send, contact);
    });
    /* Signed in: her account's email, in one tap. */
    signedIn().then(function (email) {
      if (!email || !box.parentNode || box.classList.contains('vp-done')) return;
      var acct = box.querySelector('.vp-acct');
      var form = box.querySelector('.vp-form');
      acct.innerHTML = '<button type="button" class="vp-one">Avísame a ' + esc(email) + '</button>'
        + '<button type="button" class="vp-alt">Usar otro correo o WhatsApp</button>';
      acct.hidden = false;
      form.hidden = true;
      input.value = email;
      acct.querySelector('.vp-one').addEventListener('click', function () {
        var b = {};
        for (var k in base) b[k] = base[k];
        b.channel = 'email'; b.useAccount = true;
        submit(b, this, email);
      });
      acct.querySelector('.vp-alt').addEventListener('click', function () { acct.hidden = true; form.hidden = false; input.focus(); });
    });
    countView(p);
    return box;
  }

  root.AriaVuelvePronto = Object.freeze({
    LABEL: LABEL,
    CTA: CTA,
    PRODUCT_NOTE: PRODUCT_NOTE,
    LINE_NOTE: LINE_NOTE,
    TOAST: TOAST,
    PRIVACY: PRIVACY,
    variantNote: function (word) { return word === 'Tono' ? VARIANT_NOTE_TONO : VARIANT_NOTE_COLOR; },
    titleKey: titleKey,
    key: key,
    hashKey: hashKey,
    useKeys: useKeys,
    useHashes: useHashes,
    load: load,
    isSoldOut: isSoldOut,
    soldOutLines: soldOutLines,
    orderError: orderError,
    pillHTML: pillHTML,
    decorate: decorate,
    mountInterest: mountInterest,
    countView: countView,
  });
  if (doc && !(doc.currentScript && doc.currentScript.hasAttribute('data-vp-manual'))) {
    load();
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch);
    else watch();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
