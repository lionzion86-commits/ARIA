/* ==================================================================
   COMPRADORES -- the offline shell for /agente (#443, improvement pass 4).

   Registered by agente.html with scope "/agente", so it controls the
   agent view ONLY -- never a storefront page. At clock-in the page also
   hands it the day's product photos to keep. With no signal:
     - the page and its modules come from this cache (network first,
       cache when the network fails, so a deploy still lands);
     - product photos come from the cache;
     - /.netlify/functions/* is never cached: the page itself queues
       completions and exceptions and syncs them when signal returns.
       That includes Phase 2's dispatch poll: with no signal there is no
       ping, and a claimed order's packet is already on the phone.
   ================================================================== */
const SHELL = "aria-agente-shell-v4";
const IMG = "aria-agente-img-v1";
const SHELL_URLS = [
  "/agente.html",
  "/assets/agent/agent-core.js",
  "/assets/agent/dispatch-core.js",
  "/assets/agent/agent-store.js",
  "/assets/agent/agent.css",
  "/assets/agent/sample-batch.js",
  "/aria-icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(SHELL_URLS.map((u) => c.add(new Request(u, { cache: "no-cache" })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("aria-agente-") && k !== SHELL && k !== IMG).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type !== "warm" || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(IMG).then((c) => Promise.all(d.urls.slice(0, 400).map(async (u) => {
    if (await c.match(u)) return;
    try { const r = await fetch(u, { mode: "no-cors" }); await c.put(u, r); } catch { /* keep going */ }
  }))));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/.netlify/")) return;
    const path = url.pathname === "/agente" ? "/agente.html" : url.pathname;
    if (!SHELL_URLS.includes(path)) return;
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(path, copy)); }
      return r;
    }).catch(() => caches.open(SHELL).then((c) => c.match(path)).then((m) => m || Response.error())));
    return;
  }
  /* Photos: with signal the browser loads them as usual (always the
     store's current photo); with none, the copy kept at clock-in. */
  if (req.destination === "image" && self.navigator && self.navigator.onLine === false) {
    e.respondWith(caches.open(IMG).then((c) => c.match(req.url)).then((m) => m || Response.error()));
  }
});
