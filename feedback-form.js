/* ============================================================
   DANOS TU FEEDBACK -- the form (#443 c.6447438497).

   One form for both doors: the compact section at the foot of the
   homepage and the full page /opinion.html. It mounts into every
   [data-feedback-form] element; data-compact="1" leaves out the optional
   name and contact (the full page has them) and links to the page.

   It posts to /.netlify/functions/feedback (netlify/functions/_feedback.js
   holds the rules). No login. A thank-you that is never a dead end: the
   shopper can send another or go back to shopping. This is the
   improvement inbox, not the Libro de Reclamaciones. No emojis.
   ============================================================ */
(function () {
  'use strict';
  var ENDPOINT = '/.netlify/functions/feedback';
  var TIPOS = [
    ['recomendacion', 'Recomendación'],
    ['consejo', 'Consejo'],
    ['tienda', 'Tienda que quiero'],
    ['opinion', 'Mi opinión'],
  ];
  var CSS = '' +
    '.afb{font-family:inherit;color:#0B1B3A}' +
    '.afb-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;padding:0;border:0}' +
    '.afb-chips legend{font-size:13px;font-weight:700;margin:0 0 8px;padding:0}' +
    '.afb-chip{min-height:40px;padding:8px 14px;border-radius:999px;border:1.5px solid #D7DCE5;background:#fff;color:#0B1B3A;font:inherit;font-size:14px;font-weight:700;cursor:pointer}' +
    '.afb-chip[aria-pressed="true"]{background:#0B1B3A;border-color:#0B1B3A;color:#fff}' +
    '.afb label{display:block;font-size:13px;font-weight:700;margin:12px 0 6px}' +
    '.afb input[type=text],.afb textarea{width:100%;box-sizing:border-box;border:1.5px solid #D7DCE5;border-radius:12px;padding:12px 14px;font:inherit;font-size:16px;color:#0B1B3A;background:#fff}' +
    '.afb textarea{min-height:120px;resize:vertical}' +
    '.afb input:focus,.afb textarea:focus,.afb-chip:focus-visible,.afb-send:focus-visible{outline:3px solid #F4C463;outline-offset:2px}' +
    '.afb-help{font-size:12.5px;color:#5B6576;margin:6px 0 0}' +
    '.afb-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
    '.afb-send{margin-top:16px;min-height:48px;padding:0 28px;border:0;border-radius:12px;background:#0B1B3A;color:#fff;font:inherit;font-size:15px;font-weight:800;cursor:pointer}' +
    '.afb-send[disabled]{opacity:.6;cursor:default}' +
    '.afb-err{color:#B42318;font-size:13.5px;font-weight:600;margin:10px 0 0}' +
    '.afb-more{display:inline-block;margin:14px 0 0 16px;font-size:13.5px;font-weight:700;color:#0B1B3A}' +
    '.afb-done{padding:18px;border-radius:14px;background:#F3F6FB;border:1px solid #D7DCE5}' +
    '.afb-done p{margin:0 0 12px;font-size:15.5px;line-height:1.5;font-weight:600}' +
    '.afb-done a,.afb-done button{display:inline-block;margin:0 14px 0 0;font:inherit;font-size:14px;font-weight:800;color:#0B1B3A;background:none;border:0;padding:0;text-decoration:underline;cursor:pointer}';

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function mount(root) {
    if (root.__afb) return;
    root.__afb = true;
    var compact = root.getAttribute('data-compact') === '1';
    var uid = 'afb' + Math.random().toString(36).slice(2, 8);
    var state = { tipo: 'recomendacion', busy: false };

    var chips = TIPOS.map(function (t) {
      return el('button', { type: 'button', class: 'afb-chip', 'data-tipo': t[0], 'aria-pressed': String(t[0] === state.tipo), text: t[1], onclick: function () { pick(t[0]); } });
    });
    var tiendaIn = el('input', { type: 'text', id: uid + '-tienda', name: 'tienda', maxlength: '80', autocomplete: 'off' });
    var tiendaBox = el('div', { 'data-afb': 'tienda', hidden: '' }, [
      el('label', { for: uid + '-tienda', text: '¿Qué tienda de Estados Unidos te gustaría ver en Aria?' }), tiendaIn,
    ]);
    var msgIn = el('textarea', { id: uid + '-msg', name: 'mensaje', maxlength: '2000', required: '' });
    var nameIn = el('input', { type: 'text', id: uid + '-nombre', name: 'nombre', maxlength: '80', autocomplete: 'name' });
    var contactIn = el('input', { type: 'text', id: uid + '-contacto', name: 'contacto', maxlength: '120', autocomplete: 'email' });
    var hp = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    var err = el('p', { class: 'afb-err', role: 'alert', hidden: '' });
    var send = el('button', { type: 'submit', class: 'afb-send', text: 'Enviar' });

    var form = el('form', { class: 'afb', novalidate: '' }, [
      el('fieldset', { class: 'afb-chips' }, [el('legend', { text: '¿Qué nos quieres contar?' })].concat(chips)),
      tiendaBox,
      el('label', { for: uid + '-msg', text: 'Tu mensaje' }), msgIn,
      compact ? null : el('label', { for: uid + '-nombre', text: 'Nombre (opcional)' }), compact ? null : nameIn,
      compact ? null : el('label', { for: uid + '-contacto', text: 'WhatsApp o correo (opcional)' }), compact ? null : contactIn,
      compact ? null : el('p', { class: 'afb-help', text: 'Solo si quieres que te respondamos.' }),
      el('div', { class: 'afb-hp' }, [el('label', { text: 'No llenar' }), hp]),
      err,
      el('div', {}, [send, compact ? el('a', { class: 'afb-more', href: '/opinion.html', text: '¿Quieres que te respondamos?' }) : null]),
    ]);

    function pick(tipo) {
      state.tipo = tipo;
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-tipo') === tipo)); });
      if (tipo === 'tienda') tiendaBox.removeAttribute('hidden'); else tiendaBox.setAttribute('hidden', '');
    }
    function fail(text) { err.textContent = text; err.removeAttribute('hidden'); }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (state.busy) return;
      err.setAttribute('hidden', '');
      var mensaje = msgIn.value.trim();
      if (state.tipo === 'tienda' && !tiendaIn.value.trim()) { fail('Cuéntanos qué tienda te gustaría ver en Aria.'); tiendaIn.focus(); return; }
      if (mensaje.length < 3) { fail('Escríbenos tu mensaje.'); msgIn.focus(); return; }
      state.busy = true; send.setAttribute('disabled', ''); send.textContent = 'Enviando…';
      var body = { tipo: state.tipo, mensaje: mensaje, tienda: tiendaIn.value, nombre: nameIn.value, contacto: contactIn.value, website: hp.value, page: compact ? 'inicio' : 'opinion' };
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'No pudimos enviar tu mensaje. Inténtalo de nuevo en un momento.');
          done();
        })
        .catch(function (e) { fail(e.message || 'No pudimos enviar tu mensaje. Inténtalo de nuevo en un momento.'); })
        .then(function () { state.busy = false; send.removeAttribute('disabled'); send.textContent = 'Enviar'; });
    });

    function done() {
      var again = el('button', { type: 'button', text: 'Enviar otro mensaje', onclick: function () {
        msgIn.value = ''; tiendaIn.value = ''; pick('recomendacion');
        root.replaceChild(form, thanks); msgIn.focus();
      } });
      var thanks = el('div', { class: 'afb-done', role: 'status' }, [
        el('p', { text: '¡Gracias! Leemos cada mensaje, y las tiendas que más nos piden son las que buscamos primero.' }),
        again,
        el('a', { href: '/', text: 'Seguir comprando' }),
      ]);
      root.replaceChild(thanks, form);
      again.focus();
    }

    root.appendChild(form);
  }

  if (!document.getElementById('afb-css')) {
    var st = document.createElement('style');
    st.id = 'afb-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  var roots = document.querySelectorAll('[data-feedback-form]');
  for (var i = 0; i < roots.length; i++) mount(roots[i]);
  window.ariaFeedbackMount = mount;
})();
