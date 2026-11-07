/* ==================================================================
   LA FILA SIGUE: UNA PISTA AL BORDE DERECHO (#443 c.6685183073, Danny
   2026-11-06).

   En el teléfono la fila de departamentos (Mujer · Hombre · Niños ·
   Zapatos · Belleza · Accesorios · …) se desliza de lado, pero en
   reposo se ve perfectamente encuadrada: nadie descubre que sigue. Lo
   mismo pasa con las filas de pastillas de departamentos, tiendas y la
   búsqueda.

   Este script, uno solo para todas las páginas (scripts/build-nav-menu.mjs
   pone su etiqueta junto a la del menú), le da a cada fila horizontal
   que DE VERDAD desborda una pista mínima:
     - un desvanecido suave en el borde derecho (una máscara: el
       contenido se funde con el fondo, sea claro u oscuro);
     - un chevrón pequeño (›) en los colores de la marca: dorado sobre
       claro, oro claro sobre azul marino.
   La pista desaparece cuando la fila llega a su final, y no existe
   cuando la fila cabe entera (escritorio, filas cortas).

   Mientras una fila tiene un menú abierto dentro (la barra de filtros
   abre su hoja ahí), no se desvanece: la máscara recortaría la hoja.

   Solo mira y pinta: no toca los botones de ninguna fila, ni sus
   clics, ni su filtrado (la lógica de cada página es de cada página).
   El chevrón es un hermano de la fila, fuera de ella, y no recibe toques.
   ================================================================== */
(function(){
  'use strict';
  if (window.__ariaScrollHint) return;
  window.__ariaScrollHint = 1;

  /* Filas de navegación y de pastillas. Los carruseles de productos no
     entran: su desborde ya se ve (la tarjeta siguiente asoma). */
  var SEL = [
    '.nm-in',                       /* la fila de departamentos del encabezado */
    '.hs-util',                     /* la barra de utilidades del encabezado */
    '.hub-in', '.houses-in',        /* departamento: pastillas y casas */
    '.dh-aud', '.dh-jump',          /* encabezado de departamento */
    '.nf-pills', '.nf-bar',         /* filtros de navegación (búsqueda y vistas) */
    '.srp', '.hcp',                 /* pastillas de los estantes del inicio */
    '.fl-houses', '.sl .chips',     /* tienda */
    '.cats', '.brand-pills', '.jump-in', '.chips',
    '.aa-nav', '.vf-pills', '.tp-row', '.ariaQuickRail'
  ].join(',');

  var W = 28; /* ancho del desvanecido y del chevrón, en px */
  var css = ''
    /* A mask clips every descendant, a fixed bottom sheet too (the
       filter bar opens its panels inside the row): while a row holds an
       open menu, no fade. Without :has, no fade at all; the chevron stays. */
    + '[data-sh].sh-more:not(:has([aria-expanded="true"],[role="dialog"])){-webkit-mask-image:linear-gradient(to left,transparent 0,rgba(0,0,0,.25) 10px,#000 ' + W + 'px);mask-image:linear-gradient(to left,transparent 0,rgba(0,0,0,.25) 10px,#000 ' + W + 'px)}'
    + '.sh-hint{position:absolute;z-index:2;width:' + W + 'px;display:none;align-items:center;justify-content:flex-end;padding-right:3px;box-sizing:border-box;pointer-events:none;'
    + 'font:800 18px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#B8860B}'
    + '.sh-hint.sh-dark{color:#F4C463}'
    + '.sh-hint.on{display:flex}';
  var st = document.createElement('style');
  st.id = 'sh-css';
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var RO = typeof ResizeObserver === 'function' ? new ResizeObserver(function(es){ es.forEach(function(e){ update(e.target); }); }) : null;

  /* Claro u oscuro: el color del texto de la fila lo dice. */
  function darkBehind(row){
    var el = row.firstElementChild || row;
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).color || '');
    if (!m) return false;
    return (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) > 160;
  }

  function update(row){
    var hint = row.__shHint;
    if (!hint) return;
    if (!hint.parentNode || hint.parentNode !== row.parentNode || !row.isConnected){
      if (!row.isConnected){ if (hint.parentNode) hint.parentNode.removeChild(hint); if (RO) RO.unobserve(row); row.__shHint = null; return; }
      row.parentNode.insertBefore(hint, row.nextSibling);
    }
    var ox = getComputedStyle(row).overflowX;
    var scrolls = (ox === 'auto' || ox === 'scroll') && row.clientWidth > 0;
    var more = scrolls && row.scrollLeft + row.clientWidth < row.scrollWidth - 2;
    row.classList.toggle('sh-more', more);
    if (!more){ hint.classList.remove('on'); return; }
    hint.style.top = row.offsetTop + 'px';
    hint.style.height = row.clientHeight + 'px';
    hint.style.left = (row.offsetLeft + row.clientWidth - W) + 'px';
    hint.classList.toggle('sh-dark', darkBehind(row));
    hint.classList.add('on');
  }

  function attach(row){
    if (row.__shHint || !row.parentNode) return;
    var p = row.parentNode;
    if (p.nodeType !== 1) return;
    if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
    var hint = document.createElement('span');
    hint.className = 'sh-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = '›';
    p.insertBefore(hint, row.nextSibling);
    row.__shHint = hint;
    row.setAttribute('data-sh', '');
    row.addEventListener('scroll', function(){ update(row); }, { passive: true });
    if (RO) RO.observe(row);
    update(row);
  }

  var queued = false;
  function scan(){
    queued = false;
    var rows = document.querySelectorAll(SEL);
    for (var i = 0; i < rows.length; i++){
      if (rows[i].__shHint) update(rows[i]); else attach(rows[i]);
    }
  }
  function soon(){ if (!queued){ queued = true; (window.requestAnimationFrame || setTimeout)(scan); } }

  function start(){
    scan();
    if (typeof MutationObserver === 'function'){
      new MutationObserver(function(ms){
        for (var i = 0; i < ms.length; i++){
          /* our own chevrons do not wake the scan */
          var n = ms[i].addedNodes;
          if (n.length === 1 && n[0].className === 'sh-hint') continue;
          soon(); return;
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('resize', soon, { passive: true });
    window.addEventListener('load', soon);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
