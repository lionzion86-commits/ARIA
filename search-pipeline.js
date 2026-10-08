/* ============================================================
   SEARCH PIPELINE — what search.html does with what the shopper typed.

   2026-10-08 search brief (Danny: "If we're going to leave the search
   bar, it needs to be workable"). Between the box and the engine
   (search-engine.js, index.html's own ranker) sit the rules a shopper
   in Peru needs, all driven by assets/search/synonyms-es.json so the
   words can grow without a code change:

     1. normalise (case, accents, punctuation) and tokenise;
     2. brands as whole phrases first ("new balance", "miu miu"),
        never translated; a brand we do not carry says so instead of
        sliding into a look-alike ("h&m" was answering with HP);
     3. Spanish -> English by phrase, then by word; an array in the
        dictionary is OR (each spelling runs, results merge), separate
        words are AND (the engine's rule);
     4. typos: a word neither the dictionary nor the catalogue knows
        is corrected to the nearest dictionary word or brand at edit
        distance <= 2 when it is longer than 4 letters ("zapatilas",
        "relog", "bisicleta", "conberse"), using the engine's own
        Damerau-Levenshtein -- nothing re-implemented here;
     5. word senses ("mouse" is a computer mouse unless Mickey's,
        "monitor" a computer monitor unless a baby's);
     6. one card per product (the same Miu Miu charm was listed 27
        times), and never zero because of one word: if every word
        together finds nothing, the least important word is dropped
        and the page says which search it ran.

   Loaded by search.html in the browser and by
   scripts/test/search-brief-tests.mjs in Node, so the tests run
   exactly what the page runs.
   ============================================================ */
(function (root) {
  'use strict';

  var RESERVED = { _readme: 1, phrases: 1, brands: 1, stopwords: 1, intents: 1, senses: 1 };
  var RESULT_LIMIT = 60;
  var MAX_VARIANTS = 6;

  /* Lower case, no accents (ñ -> n), apostrophes joined ("levi's" ->
     "levis"), punctuation to spaces. "&" stays: it is part of "h&m". */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`´]/g, '')
      .replace(/[^a-z0-9&\s-]/g, ' ')
      .replace(/\s*&\s*/g, '&')
      .replace(/(^|\s)-+|-+(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function squash(s) { return norm(s).replace(/[^a-z0-9]/g, ''); }
  function asList(v) { return Array.isArray(v) ? v : [v]; }

  /* ---------- the dictionary, compiled once ---------- */
  function prepare(dict, S, products) {
    var words = new Map();
    Object.keys(dict || {}).forEach(function (sec) {
      if (RESERVED[sec]) return;
      var m = dict[sec];
      if (!m || typeof m !== 'object' || Array.isArray(m)) return;
      Object.keys(m).forEach(function (k) { words.set(norm(k), asList(m[k]).map(String)); });
    });
    Object.keys((dict && dict.phrases) || {}).forEach(function (k) { words.set(norm(k), asList(dict.phrases[k]).map(String)); });
    var brands = new Set(((dict && dict.brands) || []).map(norm));
    var stop = new Set(((dict && dict.stopwords) || []).map(norm));
    var intents = new Map();
    Object.keys((dict && dict.intents) || {}).forEach(function (k) { intents.set(norm(k), String(dict.intents[k])); });
    var senses = ((dict && dict.senses) || []).map(function (s) {
      return {
        words: asList(s.word).map(norm), label: s.label || s.word,
        unless: new Set((s.unless || []).map(norm)),
        noun: s.noun ? new RegExp('^(?:' + s.noun + ')$', 'i') : null,
        keep: s.keep ? new RegExp(s.keep, 'i') : null,
        drop: s.drop ? new RegExp(s.drop, 'i') : null,
        brand: s.brand ? squash(s.brand) : null,
        or: (s.or || []).map(String)
      };
    });
    /* Typo targets: every single dictionary word and every brand word. */
    var fuzzyTargets = [];
    words.forEach(function (_, k) { if (k.indexOf(' ') < 0 && k.length > 3) fuzzyTargets.push({ key: k, brand: false }); });
    brands.forEach(function (b) { if (b.indexOf(' ') < 0 && b.length > 3) fuzzyTargets.push({ key: b, brand: true }); });
    /* The brands the catalogue carries, squashed ("Levi's" -> levis,
       "YoungLA" -> youngla). */
    var carried = new Set();
    (products || []).forEach(function (p) { if (p && p.brand) carried.add(squash(p.brand)); });
    var multiBrands = new Map();
    brands.forEach(function (b) { if (b.indexOf(' ') > 0) multiBrands.set(b, b.replace(/[^a-z0-9]/g, '')); });
    var maxPhrase = 1;
    words.forEach(function (_, k) { maxPhrase = Math.max(maxPhrase, k.split(' ').length); });
    brands.forEach(function (b) { maxPhrase = Math.max(maxPhrase, b.split(' ').length); });
    return { words: words, brands: brands, stop: stop, intents: intents, senses: senses,
      fuzzyTargets: fuzzyTargets, multiBrands: multiBrands, carried: carried, maxPhrase: maxPhrase, S: S };
  }

  function brandCarried(D, b) {
    var k = squash(b);
    if (!k) return false;
    if (D.carried.has(k)) return true;
    if (k.length < 5) return false;
    var it = D.carried.values();
    for (var r = it.next(); !r.done; r = it.next()) {
      var c = r.value;
      if (c.indexOf(k) === 0 && c.length - k.length <= 3) return true;
      if (Math.abs(c.length - k.length) <= 1 && D.S.fuzzyEditDist(c, k, 1) <= 1) return true;
    }
    return false;
  }

  function catalogueKnows(windex, t) {
    var l = windex && typeof windex.get === 'function' ? windex.get(t) : null;
    return !!(l && l.length >= 3);
  }

  /* Nearest dictionary word or brand, d <= 2, only for words longer
     than 4 letters (shorter ones are left to the engine, which knows
     "nik" -> Nike from the catalogue itself). */
  function correctTypo(D, t, windex) {
    /* A short word one letter short of a brand is the brand: "nik"
       is Nike even though one skateboard is called "Nik Stain". */
    if (t.length >= 3 && t.length <= 4 && !/\d/.test(t)) {
      for (var b = 0; b < D.fuzzyTargets.length; b++) {
        var bt = D.fuzzyTargets[b];
        if (bt.brand && bt.key.length === t.length + 1 && bt.key.indexOf(t) === 0) return bt;
      }
    }
    if (t.length <= 4 || /\d/.test(t) || catalogueKnows(windex, t)) return null;
    var best = null, bestD = 3;
    for (var i = 0; i < D.fuzzyTargets.length; i++) {
      var c = D.fuzzyTargets[i];
      if (Math.abs(c.key.length - t.length) > 2) continue;
      var d = D.S.fuzzyEditDist(c.key, t, 2);
      if (d < bestD || (d === bestD && best && !best.brand && c.brand)) { best = c; bestD = d; }
    }
    return bestD <= 2 ? best : null;
  }

  /* ---------- what the shopper asked for ---------- */
  function interpret(D, q, windex) {
    var toks = norm(q).split(' ').filter(Boolean);
    var slots = [], intents = {}, corrected = false, said = [];
    for (var i = 0; i < toks.length;) {
      var took = 0;
      for (var n = Math.min(D.maxPhrase, toks.length - i); n >= 2 && !took; n--) {
        var ph = toks.slice(i, i + n).join(' ');
        if (D.brands.has(ph)) { slots.push({ kind: 'brand', alts: [ph], text: ph }); took = n; }
        else if (D.words.has(ph)) { slots.push({ kind: 'word', alts: D.words.get(ph), text: ph }); took = n; }
      }
      /* A multi-word brand typed with a slip ("youg la", "tomy
         hilfiger", "new balanse"): the words together, one or two
         edits from the brand. Checked before stopwords, or the "la"
         of "young la" would be thrown away first. */
      for (var m = Math.min(D.maxPhrase, toks.length - i); m >= 2 && !took; m--) {
        var win = toks.slice(i, i + m), wk = win.join('');
        if (D.words.has(win.join(' '))) continue;
        D.multiBrands.forEach(function (bk, b) {
          if (took || Math.abs(bk.length - wk.length) > 2) return;
          var lim = bk.length > 6 ? 2 : 1;
          if (D.S.fuzzyEditDist(bk, wk, lim) <= lim) { slots.push({ kind: 'brand', alts: [b], text: b }); took = m; corrected = true; }
        });
      }
      if (took) { said.push(slots[slots.length - 1].text); i += took; continue; }
      var t = toks[i++];
      if (D.brands.has(t)) { slots.push({ kind: 'brand', alts: [t], text: t }); said.push(t); continue; }
      if (D.intents.has(t)) { intents[D.intents.get(t)] = true; said.push(t); continue; }
      if (D.stop.has(t)) { said.push(t); continue; }
      if (D.words.has(t)) {
        var alts = D.words.get(t).filter(Boolean);
        if (alts.length) slots.push({ kind: 'word', alts: alts, text: t });
        said.push(t);
        continue;
      }
      var fix = correctTypo(D, t, windex);
      if (fix) {
        corrected = true;
        said.push(fix.key);
        if (fix.brand) slots.push({ kind: 'brand', alts: [fix.key], text: fix.key });
        else slots.push({ kind: 'word', alts: D.words.get(fix.key).filter(Boolean), text: fix.key });
        continue;
      }
      /* A number nothing in the catalogue carries is not a search:
         "12345" was answering with YoungLA style codes. */
      if (/^\d+$/.test(t) && !(windex && windex.get && windex.get(t))) { corrected = true; continue; }
      /* Nor is a vowelless string the catalogue has never seen ("zzkx",
         "qwrtp"): the engine's fuzzy layer would find *something* for
         it -- a helmet brand, "wrap" -- and the shopper typed noise. */
      if (t.length >= 3 && !/[aeiouy]/.test(t) && !(windex && windex.get && windex.get(t))) { corrected = true; continue; }
      slots.push({ kind: 'raw', alts: [t], text: t });
      said.push(t);
    }
    return { slots: slots, intents: intents, corrected: corrected ? said.join(' ') : null };
  }

  /* Every OR combination, as { brand, rest }: the brand phrase goes to
     the engine as typed, only the rest is translated ("polo" is a
     T-shirt in Peru, and still part of "polo ralph lauren"). */
  function variantsOf(slots) {
    var out = [{ brand: [], rest: [] }];
    slots.forEach(function (s) {
      var next = [];
      out.forEach(function (v) {
        s.alts.forEach(function (a) {
          if (next.length >= MAX_VARIANTS) return;
          next.push(s.kind === 'brand' ? { brand: v.brand.concat([a]), rest: v.rest } : { brand: v.brand, rest: v.rest.concat([a]) });
        });
      });
      out = next;
    });
    return out.map(function (v) { return { brand: v.brand.join(' '), rest: v.rest.join(' ') }; })
      .filter(function (v) { return v.brand || v.rest; });
  }
  function textOf(v) { return (v.brand + ' ' + v.rest).trim(); }

  /* The sense a query is in, if one of its words has two. */
  function senseFor(D, queries, q) {
    var said = new Set(norm(q).split(' '));
    for (var i = 0; i < D.senses.length; i++) {
      var s = D.senses[i], hit = false, blocked = false;
      queries.forEach(function (v) {
        var w = norm(textOf(v)).split(' ');
        s.words.forEach(function (x) { if (w.indexOf(x) >= 0) hit = true; });
        w.forEach(function (x) { if (s.unless.has(x)) blocked = true; });
      });
      said.forEach(function (x) { if (s.unless.has(x)) blocked = true; });
      if (hit && !blocked) return s;
    }
    return null;
  }
  /* noun: the title's head noun ("Apple iPad (A16) 11-inch" -> ipad,
     "Television Snapback Hat" -> hat) must be the thing itself. */
  function senseFilter(s, S) {
    return function (it) {
      if (!it) return false;
      var t = String(it.title || it.name || '');
      if (s.drop && s.drop.test(t)) return false;
      if (s.brand && squash(it.brand) === s.brand) return true;
      if (s.noun) {
        var head = Array.from(S.catalogHeadWords(it)).pop();
        if (!head || !s.noun.test(head)) return false;
      }
      return !s.keep || s.keep.test(t);
    };
  }

  /* One card per product: the same title from the same brand, or from
     the same store (Walmart lists one sneaker as "Avia" and as no
     brand at all), is the same product, whatever bucket or URL it came
     in. */
  function productKey(it) {
    return squash(it.brand) + '|' + squash(it.title || it.name);
  }
  function storeKey(it) {
    return '@' + String(it.retailer || '') + '|' + squash(it.title || it.name);
  }

  /* search.html's engine call (translation, sound-alike correction,
     ranking). */
  function engineSearch(ctx, v, filter) {
    var S = ctx.S, windex = ctx.products._windex;
    var rest = v.rest, fixedRest = null;
    if (rest) {
      var t1 = S.translateQuery(rest);
      var fixed = S.soundCorrectQuery(t1.query, windex);
      rest = fixed.changed ? S.translateQuery(fixed.query).query : t1.query;
      if (fixed.changed) fixedRest = fixed.query;
    }
    var query = (v.brand + ' ' + rest).trim();
    var opts = { limit: RESULT_LIMIT * 2, retailers: ctx.retailers };
    if (filter) opts.filter = filter;
    var res = S.rankCatalogMatches(ctx.products, query, opts);
    var items = (res && res.items) || [];
    if (filter) items = items.filter(filter);
    return { items: items, query: query, corrected: fixedRest ? (v.brand + ' ' + fixedRest).trim() : null };
  }

  function runQueries(ctx, queries, filter) {
    var byKey = new Map(), order = [], engineFix = null;
    queries.forEach(function (q) {
      var r = engineSearch(ctx, q, filter);
      if (r.corrected && !engineFix) engineFix = r.corrected;
      r.items.forEach(function (it, rank) {
        var k = productKey(it), sk = storeKey(it);
        var score = typeof it.matchScore === 'number' ? it.matchScore : -rank / 1000;
        var had = byKey.get(k) || byKey.get(sk);
        if (!had) { had = { item: it, score: score, seq: order.length }; order.push(had); }
        else if (score > had.score) { had.score = score; }
        byKey.set(k, had); byKey.set(sk, had);
      });
    });
    order.sort(function (a, b) { return (b.score - a.score) || (a.seq - b.seq); });
    return { hits: order.map(function (x) { return x.item; }), engineFix: engineFix };
  }

  /* ---------- the whole search ---------- */
  function run(ctx, raw) {
    var q = String(raw == null ? '' : raw).trim();
    if (!q) return { state: 'empty', hits: [] };
    if (squash(q).length < 2) return { state: 'short', hits: [] };
    var D = ctx.dict, windex = ctx.products._windex;
    var plan = interpret(D, q, windex);
    if (!plan.slots.length) return { state: 'none', hits: [], query: q };
    /* A brand the catalogue does not carry is an honest "no", never a
       look-alike brand. */
    for (var b = 0; b < plan.slots.length; b++) {
      var sl = plan.slots[b];
      if (sl.kind === 'brand' && !brandCarried(D, sl.text)) return { state: 'none', hits: [], query: q, missingBrand: sl.text };
    }
    var queries = variantsOf(plan.slots);
    var sense = senseFor(D, queries, q);
    if (sense) sense.or.forEach(function (o) {
      queries = queries.concat(queries.map(function (v) {
        return { brand: v.brand, rest: norm(v.rest).split(' ').map(function (w) { return sense.words.indexOf(w) >= 0 ? o : w; }).join(' ') };
      }));
    });
    var filter = sense ? senseFilter(sense, ctx.S) : null;
    var r = runQueries(ctx, queries.slice(0, MAX_VARIANTS * 2), filter);
    var relaxed = null;
    /* NEVER ZERO BECAUSE OF ONE WORD: drop one slot at a time, least
       important first (unknown words, then modifiers, never the brand),
       and say which search ran. */
    if (!r.hits.length && plan.slots.length > 1) {
      var order = plan.slots.map(function (s, i) { return i; }).sort(function (a, b) {
        var rank = function (s) { return s.kind === 'raw' ? 0 : s.kind === 'word' ? 1 : 2; };
        return rank(plan.slots[a]) - rank(plan.slots[b]) || b - a;
      });
      for (var o = 0; o < order.length && !r.hits.length; o++) {
        if (plan.slots[order[o]].kind === 'brand') continue;
        var rest = plan.slots.filter(function (_, i) { return i !== order[o]; });
        var rq = variantsOf(rest);
        var rr = runQueries(ctx, rq, filter);
        if (rr.hits.length) {
          r = rr;
          relaxed = rest.map(function (s) { return s.text; }).join(' ');
        }
      }
    }
    var hits = r.hits;
    if (plan.intents.cheap) {
      hits = hits.slice(0, RESULT_LIMIT).sort(function (a, b) { return priceOf(a) - priceOf(b); });
    }
    hits = hits.slice(0, RESULT_LIMIT);
    var shown = relaxed || plan.corrected || r.engineFix || null;
    if (!hits.length) {
      return { state: 'none', hits: [], query: q,
        sense: sense ? sense.label : null,
        suggestion: ctx.S.suggestSearchQuery(queries[0] ? textOf(queries[0]) : q, windex) || null };
    }
    return { state: 'results', hits: hits, query: q, shown: shown && shown !== norm(q) ? shown : null,
      sense: sense ? sense.label : null };
  }
  function priceOf(it) { return Number(it && it.price) || Infinity; }

  root.AriaSearchPage = { prepare: prepare, run: run, norm: norm, interpret: interpret, productKey: productKey, storeKey: storeKey };
})(typeof window !== 'undefined' ? window : globalThis);
