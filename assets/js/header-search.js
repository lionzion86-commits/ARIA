/* THE HEADER SEARCH (Danny, 2026-11-02: "if I scroll down I lose it").
   Every page's sticky header carries .hs: a pill on a phone that opens a
   full-width field over the header row, a real field on a wide screen.
   Submitting goes where the homepage's own search goes,
   /search.html?q=<query>, so search.html's destination router decides the
   landing. An empty query does nothing. Listeners hang on the document,
   so this works the moment it runs, whatever else the page is still
   loading. Markup and styles: scripts/header-search.mjs. */
(function(){
  if (window.__ariaHeaderSearch) return;
  window.__ariaHeaderSearch = 1;
  var d = document, warmed = false;
  function box(el){ return el && el.closest ? el.closest('.hs') : null; }
  function field(hs){ return hs.querySelector('.hs-in'); }
  function open(hs){
    hs.classList.add('hs-open');
    var p = hs.querySelector('.hs-pill'); if (p) p.setAttribute('aria-expanded', 'true');
    var i = field(hs); if (i){ i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch(e){} }
  }
  function close(hs, refocus){
    if (!hs.classList.contains('hs-open')) return;
    hs.classList.remove('hs-open');
    var p = hs.querySelector('.hs-pill'); if (p){ p.setAttribute('aria-expanded', 'false'); if (refocus) p.focus(); }
  }
  function go(q){
    q = (q || '').replace(/\s+/g, ' ').trim();
    if (!q) return false;
    window.location.href = '/search.html?q=' + encodeURIComponent(q);
    return true;
  }
  d.addEventListener('click', function(e){
    var t = e.target, hs = box(t);
    if (hs && t.closest('.hs-pill')){ e.preventDefault(); open(hs); return; }
    if (hs && t.closest('.hs-x')){ e.preventDefault(); close(hs, true); return; }
    var all = d.querySelectorAll('.hs.hs-open');
    for (var k = 0; k < all.length; k++) if (all[k] !== hs) close(all[k], false);
  });
  d.addEventListener('submit', function(e){
    var hs = box(e.target);
    if (!hs || !e.target.classList.contains('hs-form')) return;
    e.preventDefault();
    var i = field(hs);
    if (!go(i && i.value) && i) i.focus();
  });
  d.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    var hs = box(e.target); if (hs) close(hs, true);
  });
  /* The first focus wakes the search function while the words are typed
     (the homepage's own boxes do the same). */
  d.addEventListener('focusin', function(e){
    if (warmed || !e.target.classList || !e.target.classList.contains('hs-in')) return;
    warmed = true;
    try { fetch('/.netlify/functions/search?warm=1').catch(function(){}); } catch(err){}
  });
  /* On search.html the field says what was searched. */
  function prefill(){
    if (!/\/search\.html$/.test(location.pathname)) return;
    var q = ''; try { q = new URLSearchParams(location.search).get('q') || ''; } catch(e){}
    var ins = d.querySelectorAll('.hs-in');
    for (var k = 0; k < ins.length; k++) if (!ins[k].value) ins[k].value = q;
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', prefill); else prefill();
})();
