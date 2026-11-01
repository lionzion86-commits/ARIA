# SNIPES USA colorway route — hunt result & full-pull estimate

**Date:** 2026-11-01 · **Verdict: ROUTE FOUND AND PROVEN.** · **Probe spend: $0.00** (of the $3 cap — no Apify run was needed or made)

---

## The route (named)

**SNIPES's own Algolia search index, reached through the edge proxy SNIPES ships in its storefront JavaScript** — plus the SFRA `Product-Variation` JSON endpoint for per-colorway size runs.

Why the old routes returned zero, in one sentence: on SNIPES's Salesforce Commerce Cloud (SFCC) setup, **each colorway is its own master product** (own pid, own PDP, sizes as the only variation) and **PDPs never cross-link sibling colors** — so PDP JSON-LD scrapers (how our catalog was built, 2026-10-27) and the Shopify-feed path each see exactly one color per product, forever. The colorway family exists only in SNIPES's search index.

### Evidence chain

1. PDP HTML for a known catalog item (AF1 Low '07 Black, pid `1000089529`) shows site `Sites-snipesusa-Site`, catalog `Sites-snipes-master-catalog`, and a color selector containing **exactly one** color (`CW2288-001` "Black").
2. `GET /on/demandware.store/Sites-snipesusa-Site/en_US/Product-Variation?pid=1000089529&quantity=1` returns clean JSON confirming it: `"productType": "master"`, `"vendorStyle": "CW2288-001"`, variationAttributes color = `[CW2288-001 "Black"]` only, sizes = 18 values. One master = one colorway.
3. The same PDP embeds the Algolia cartridge config: products index `production_na01_snipes_demandware_net__snipesusa__products__en_US`, and the cartridge JS (`js/algolia/index.js`) builds its search client against a **same-origin proxy**: host `www.snipesusa.com`, prefix `/_algolia`, with the literal placeholder credential `edge-proxy` (the real keys are injected server-side by SNIPES's edge). So the exact requests SNIPES's own search page makes are:
   `POST https://www.snipesusa.com/_algolia/1/indexes/production_na01_snipes_demandware_net__snipesusa__products__en_US/query` with headers `X-Algolia-Application-Id: edge-proxy`, `X-Algolia-API-Key: edge-proxy` — plain HTTPS, no account, no key of ours.
4. Index size: empty query → **6,088 records** (colorway-level; the index serves one record per colorway/vendorStyle). Browse endpoint is not forwarded by the proxy (404) — enumeration goes through faceted queries instead, which is fine at this size.
5. Desk check, Apify Store: searches for a Salesforce Commerce Cloud / Demandware variant-capable actor surfaced **none** — only generic PDP/JSON-LD e-commerce scrapers (the known blind spot) and Shopify tools. Nothing on Apify is worth paying for here; the first-party route is strictly better and free.

## Probe results (live, 2026-11-01, $0)

**Target 1 — Nike Air Force 1 Low '07.** Our catalog holds **6** colorway pids under that exact name. One Algolia query returned **13 distinct colorways** (vendorStyle · color · price · PDP pid):

| vendorStyle | Color | Price | PDP pid |
|---|---|---|---|
| CW2288-111 | White | $115 | 1000089530 |
| CW2288-001 | Black | $115 | 1000089529 |
| DD8959-001 | Black | $115 | 1000089682 |
| DD8959-100 | White | $115 | 1000089582 |
| IR1982-100 | White | $130 | 1000132601 |
| IH1221-900 | Brown | $125 | 1000128145 |
| HV9405-400 | Blue | $125 | 1000127071 |
| IV5732-002 | Grey | $115 | 1000133908 |
| IV5732-001 | Grey | $115 | 1000133907 |
| IX0349-100 | White | $125 | 1000133910 |
| IO9803-200 | Brown | $125 | 1000128144 |
| FV5951-111 | White (Big Kids') | $49.99 | 1000114304 |
| FV5951-001 | Black (Kids') | $69.99 | 1000114306 |

**Target 2 — adidas Samba.** Query "Samba" → 54 hits; Samba OG alone shows ~25 distinct vendorStyles (B75806, B75807, IH3979, KJ7488, JI3201, IH9052, IG9030, IG9031, KJ7489, KJ7479, KJ7486, KJ2309, KI6674, JR8750, JR8749, JR8848, …) vs a handful of Samba OG pids in our catalog. Verbatim hit:

```json
{
  "name": "Samba OG",
  "brand": "adidas",
  "vendorStyle": "B75806",
  "refinementColor": "Black",
  "price": { "USD": 100 },
  "in_stock": true,
  "url": "https://www.snipesusa.com/samba-og-adidas-white---black---clear-b75806-3000029529.html",
  "objectID": "3000029529"
}
```

**Target 3 — enrichment check on a colorway our catalog does not contain at all.** `Product-Variation?pid=1000132601` (found only via the index) returned: "Air Force 1 '07 NY vs NY", vendorStyle `IR1982-100`, color display "White | Volt | Black", $130.00, full size run M7.5/W9 → M15/W16.5. So per-colorway sizes/prices are also fully readable, free, from the SFRA endpoint.

## Full-pull estimate (Danny's call — not run)

Both scopes cost **$0.00 in tooling** — the only real cost is build/reconcile time on our side. Observed request latency ~0.2–1.4 s per query through the egress proxy.

- **Scope A — the 213 suspected-sibling families first:** one Algolia query per family name (≈213 requests, facet/exact-filtered) → complete live colorway list per family (vendorStyle, color name, price, PDP URL + pid, stock flag, image set), plus an optional `Product-Variation` call per newly found colorway for its size run. **Runtime ≈ 5–15 min sequential. Cost $0.**
- **Scope B — everything (superset; covers all 1,599 catalog shoe listings):** dump the full products index via faceted empty queries (brand × division, `hitsPerPage=1000`, paginated) — 6,088 colorway records across all departments — then reconcile against the catalog by pid: yields every missing colorway **and** flags stale/dead catalog listings in the same pass. **Runtime ≈ 10–20 min polite sequential. Cost $0.**

Recommendation: run Scope B — it's barely more work than A, costs the same $0, and A is a strict subset of its output.

## Caveats (read before building on this)

- **Relevance noise:** fuzzy name queries bleed (Kobe AF1s inside "Samba" results; one record literally named "Samba 0G"). The full pull must enumerate by facets/filters and verify vendorStyle/name matches, not trust raw relevance order.
- **The Algolia hit's `size` field is a single representative value, not the size run.** Full sizes per colorway come from `Product-Variation` (proven above).
- **The index is the live assortment** (today's), our catalog is a 2026-10-27 pull: counts differ in both directions — new colorways appear, delisted ones vanish. Reconciliation by pid handles both.
- Rate-limit politely (sequential, few req/s): these are the same requests SNIPES's own search page makes, with the credential SNIPES itself ships publicly to every browser — but there's no reason to hammer it.
- Probe artifacts (PDP HTML, Product-Variation JSON, Algolia responses, cartridge JS) are saved alongside this file in `snipes-probe/`.
