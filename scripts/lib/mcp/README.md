# Aria Muse Connector (MCP) — Phase 1

A hosted [Model Context Protocol](https://modelcontextprotocol.io) server that lets
Meta's Muse agent search Aria's catalog on a shopper's behalf.

**Phase 1 is read-only: two public tools, no auth, no cart, no checkout, no money
movement.** Those are later phases and are deliberately absent rather than stubbed —
there is nothing on this surface for an agent to discover and call early.

## The tools

| tool | what it answers |
|---|---|
| `search_products` | `query` (required), `category`, `brand`, `store`, `max_price_usd`, `on_sale_only`, `limit` (1–50, default 20) |
| `get_product` | `product_id` → description, images, sizes, weight, freight to Peru, dutiable base |

## Run it

```bash
npm run mcp                 # POST http://localhost:8080/mcp,  GET /healthz
PORT=8080 node mcp-server.js
npm run test:mcp            # 31 checks, no network needed
```

Boot builds the catalogue once (~10s, ~320MB) and every request after that is served
from memory.

## Where to host it

**Recommended: a long-lived process — Fly.io, Railway, Render.** Measured on this
catalogue (127,220 products, 59 source files):

| | |
|---|---|
| cold boot (catalogue build) | median 10.4s, **p95 11.1s** |
| resident heap after boot | ~320 MB |
| warm `search_products` | median 54ms, p95 63ms filtered / 208ms unfiltered |
| warm `get_product` | median 1ms, p95 6ms |

Give it **1 GB** and a health check on `/healthz`.

`netlify/functions/mcp.js` runs the identical handler so `https://ariashop.pe/mcp`
works on the existing deploy chain, but **it is a fallback, not the recommendation**:
a cold Lambda pays the full ~11s build, against Netlify's 10s synchronous ceiling. An
agent surface is idle most of the time by nature, so cold starts are the common case,
and an MCP client reads a timeout as a dead server.

## Why there is no second copy of search or pricing

`page-slices.mjs` lifts the real functions out of `index.html` and runs them in a VM
with no DOM — the trick `scripts/test/_page-script.mjs` has used for months. The
connector calls the same `rankCatalogMatches` the search bar calls and the same
`normalizeLiveItem` that prices the cards, so the agent and the site cannot disagree
about what a product is or what it costs.

Each slice carries a **probe that calls its functions on real input**. A slice that
merely compiles proves nothing: `normalizeLiveItem` only reaches `upgradeImageUrl`
when invoked, and the first version of this resolved nothing, threw on every call, and
reported "0 products" as though the catalogue were empty.

If `index.html` moves the markers, the slice throws at boot naming the marker to fix,
rather than silently serving stale behaviour.

## Prices

Everything but two numbers is stamped by the page's own pricing:

- **USD** — tiered marginal margin on the raw US shelf price (24% to $500, 18% to
  $2,000, 12% to $5,000, 8% above), then the retailer's Miami sales tax. Walmart is
  enrolled and exempt; Macy's and others pay the 7%.
- **`dutiable_usd`** — the acquisition cost Peru assesses import tax on, never the
  marked-up shelf price.
- **PEN** — USD at the SUNAT **venta** rate, the rate checkout charges in. Fetched
  from the site's own `/.netlify/functions/exchange-rate` first (CDN-cached, and the
  upstream 429s on repeated direct hits), falling back to SUNAT directly. Override
  with `ARIA_FX_URL`.
  **If no real rate can be fetched, `price_pen` is `null`.** It is never guessed.
- **`freight_estimate_usd`** — the page's own `$13/kg`, from the page's own function.

## Operational notes

- **Rate limit** 60 req/min per client (fixed window), `429` + `Retry-After`.
  Change via `getApp({ rateLimit })`.
- **Logging** one JSON line per tool call: tool, arguments, latency, status, result
  count. The client is a **hash** of the IP — enough to tell callers apart, not enough
  to say who they are. Phase 1 inputs carry no shopper identity.
- **CORS** currently `*` for Meta's review. Narrow it in `server.mjs` — search for
  `TO LOCK DOWN` — once Meta publishes its agent origins.
- **Body limit** 1 MB.
