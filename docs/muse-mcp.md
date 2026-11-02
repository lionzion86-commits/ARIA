# Aria Muse connector (MCP), Phase 1

This is a hosted [Model Context Protocol](https://modelcontextprotocol.io) server. It lets Meta's Muse agent search Aria's catalogue for a shopper. Phase 1 has **two public read tools** and nothing else: no cart, no checkout, no money movement, no auth. Those tools are absent from the server, not stubbed.

| | |
|---|---|
| Endpoint | `POST https://ariashop.pe/mcp` |
| Transport | Streamable HTTP, stateless. No `Mcp-Session-Id` is issued. |
| Protocol versions | `2025-06-18` (latest), `2025-03-26`, `2024-11-05` |
| Server | `serverInfo: { name: "aria-shop", title: "Aria Shop", version: "1.0.0" }`, `capabilities: { tools: {} }` |
| Code | `netlify/functions/mcp.js` (the handler), `_mcp-protocol.js` (transport), `_muse-tools.js` (tools) |
| Tests | `npm run test:muse-mcp` (`scripts/test/muse-mcp-tests.mjs`) |
| Local server | `npm run mcp`. This runs the same handler at `http://localhost:8080/mcp` and answers `GET /healthz`. |

## Transport

- **POST** takes a JSON-RPC 2.0 request, notification or batch (up to 20 messages). The server handles `initialize`, `notifications/initialized`, `ping`, `tools/list` and `tools/call`.
  - Answers are `application/json`.
  - A client whose `Accept` header names `text/event-stream` but not `application/json` gets the same answer as a single SSE `message` event, and then the stream closes.
  - A notification, or a response the client sends, is answered `202` with no body.
- **`initialize` negotiation.** The server echoes the client's `protocolVersion` when it supports that version. Otherwise it answers with `2025-06-18`, and the client decides whether to continue.
- **`MCP-Protocol-Version` header.** If the client sends it with a version the server does not support, the answer is `400`.
- **GET and DELETE** are answered `405` with `Allow: POST, OPTIONS`. There is no server-initiated stream and no session to end.
- **OPTIONS** is the CORS preflight. It answers `204`.
- **Errors:**
  - A body that is not JSON, or not a JSON-RPC message, gets HTTP `400` with JSON-RPC `-32700` or `-32600`.
  - A well-formed call that cannot be honoured gets HTTP `200` with a JSON-RPC error and a readable message:
    - unknown method: `-32601`
    - unknown tool: `-32602`
    - bad tool arguments: `-32602`, for example `Invalid arguments for search_products: "query" is required (a non-empty string).`
  - A product that does not exist, or details that cannot be loaded right now, come back as tool output with `isError: true`.
  - A response never carries a stack trace.
- **Tool results** carry `structuredContent`, which matches the tool's `outputSchema`, and the same JSON as one `text` content item.

## Tools

### `search_products`

> Search Aria's catalog of US-store products available for delivery to Peru. Returns products with USD and PEN prices, discount info, and images.

| argument | type | |
|---|---|---|
| `query` | string, required, max 120 | Spanish or English. It is accent-insensitive and typo-tolerant (`"hudi"` finds hoodies). |
| `category` | string | Examples: `"zapatillas"`, `"shoes"`, `"belleza"`, `"jewelry"`. It matches the index's own category or department, or whatever the site's search finds for that word. |
| `brand` | string | Exact brand, ignoring case and accents. `"adidas"` also matches `"adidas Originals"`. |
| `store` | string | A store key or name (`"footlocker"` or `"Foot Locker"`). |
| `max_price_usd` | number > 0 | Compared with `price_usd`, Aria's price. |
| `on_sale_only` | boolean | Only real markdowns, under the site's sale rule (`/sale-rule.js`: 5–70% off a real original price). |
| `limit` | integer 1–50, default 20 | |

Unknown arguments are refused.

The result is `{ query, count, products[], exchange_rate_pen_per_usd, did_you_mean?, note? }`. Each product is:

```
{ id, title, brand, store, store_name, price_usd, price_pen,
  original_price_usd?, discount_pct?, image_url, product_url }
```

- **Ranking** comes from the site's own search (`_search-core.js`, `equivalentQuery`). That is the same index, engine, Spanish dictionary, spelling forms and synonyms as the search bar, so results are in the same rank order. Filters are applied after ranking, over the full ranked list (up to 2,000 results).
- **No image, no product.** Every product has an `http(s)` `image_url`. That is the store's image CDN URL, exactly as the site's cards use it.
- **Off sale.** Stores on `/off-sale.js` and held-used listings never appear. If the shopper asks for such a store, the `note` says so.
- **Shade gate.** Makeup that is sold in shades but has no shade list yet (`/shade-gate.js`) is **left out** of the results. On the site it is shown but cannot be bought, and an agent should not offer it. The `note` gives how many products were left out.
  - Only rows that could be shade products are checked against their product-page record. That means a beauty store, a beauty aisle, or a shade noun in the title. On the 2026-11-02 catalogue every gated record's row passed this check, and 3.6% of all rows do.
  - If a record cannot be read, the product is left out rather than offered unchecked.

### `get_product`

> Get full details for one Aria product: description, all images, sizes, weight, freight estimate to Peru, and import-tax handling.

The only argument is `product_id` (string, required). It must be an id returned by `search_products`.

The result is:

```
{ id, title, brand, store, store_name, price_usd, price_pen,
  original_price_usd?, discount_pct?, images[], description, sizes[], variant?,
  weight_kg, weight_basis, freight_estimate_usd, freight_estimate_pen,
  freight_rate_usd_per_kg, dutiable_usd, import_tax_estimate_usd, import_tax,
  store_shipping_usd, store_shipping_note?, buyable, not_buyable_reason?,
  product_url, exchange_rate_pen_per_usd }
```

- **Data source.** The data is the record `producto.html` shows, from the same shard (`assets/pdp/p/<hhh>.json`, built by `scripts/build-pdp-slices.mjs`).
  - The record is the same store's record for that title. It is the very listing when the URL hash matches (about 90% of a 400-row sample), and in 97% or more of rows it is the record the product page picks.
  - Shards are read off disk where they exist (tests, `mcp-server.js`). On Netlify they are fetched from the deploy's own CDN, the way the page fetches them, and cached per instance. The roughly 230 MB of shards would not fit in a function bundle.
- **`description`** is the catalogue's Spanish description that the page shows, cut to its first two sentences (400 characters at most). It is `null` when the store gave none.
- **`sizes`** are the page's `truthfulSizes`: the store's list without "one size" placeholders or repeats. The test pins them to the page's own function over 2,000 records.
- **`buyable: false`** is set, with a reason, when the product page would not sell the product. The reasons are: the shade gate, out of stock at the store, sizes pending, or no confirmed price.
- **`product_url`** is Aria's own product page (`https://ariashop.pe/producto.html?producto=…&tienda=…[&v=…]`). It is the same link the site's cards use.

**The product id** is the id the site's search index gives each listing: a hash of store and URL (`scripts/build-search-index.mjs` `productId`). The search cards carry the same id. Ids can change when the catalogue is rebuilt. A stale id gets an `isError` answer telling the agent to search again.

## Where every number comes from

Nothing is re-implemented. Each figure comes from the module the site uses for it:

| field | source |
|---|---|
| `price_usd` | The card and product-page price, `finalUsd()` (`_search-core.js`, mirrored in `producto.html`). That is the tiered margin plus the store's Miami sales tax. Pre-priced stores are taken as is. The test checks it against `cardOf()` and against checkout's `price-index.json`. |
| `original_price_usd`, `discount_pct` | Search uses the site's sale rule (`/sale-rule.js`). The product page uses the record's `wasPrice`/`salePct`, as `producto.html` does. |
| `price_pen` | `price_usd` × the **SUNAT venta** rate. It comes from `search.js` `sellRate()`, which asks SUNAT first and then falls back to the last good rate kept in Netlify Blobs. If no real rate is available, `price_pen` is `null` and a `note` says why. A rate is never guessed. |
| `weight_kg` | `resolveCartWeights()` (`_weight-resolve.js`). This is the resolver that the product page (through `resolve-weight`) and checkout use, on the page's own cart line. A weight the page shows as "Por confirmar" is returned as `null`. |
| `freight_estimate_usd` | `freightFloorUsd(kg × CHARGE_PER_KG)` (`_checkout-model.js`, `weight-data.js`), at $13/kg. |
| `dutiable_usd` | The store's price × the Miami sales tax Aria pays there, which is the page's import-tax base. |
| `import_tax_estimate_usd` | `importTaxEstimateUsd()` (`weight-data.js`). It is 0 at $200 FOB or less; above that, 25% of (dutiable value + freight). |
| `store_shipping_usd` | `shippingOf()` (`_search-core.js`, which uses `scripts/lib/store-shipping.js`). This is the store's shipping to Aria's Miami warehouse. It is `null` when the store calculates it at payment. |

**No wholesale cost is ever served.** Aria Perfumes is a pre-priced store (`PRE_PRICED` in `weight-data.js`): its catalogue price is already Aria's price, and its dutiable base is the supplier cost. For pre-priced stores `dutiable_usd` is `null`, and `import_tax_estimate_usd` is only given when it is 0, so no figure can be worked back to the cost. **No retailer link is ever served** either: store URLs in the records are never output.

## Limits and operations

- **Rate limit.** 60 requests per minute per client. The client is identified by Netlify's `x-nf-client-connection-ip`, not by the spoofable `X-Forwarded-For`. Every message in a batch counts.
  - Over the limit, the answer is HTTP `429` with `Retry-After` (seconds left in the window) and `X-RateLimit-*` headers.
  - **Phase 1 limitation:** the window is kept in memory on each instance. A client spread over N warm instances could make up to N × 60 requests a minute, and a cold start forgets the window. If abuse appears, move the counter to Netlify Blobs.
  - The `MCP_RATE_LIMIT` environment variable overrides the limit.
- **Body limit.** 1 MB (`413` above it). The query is limited to 120 characters.
- **Logging.** The function writes one JSON line per tool call to the Netlify function log, through `console`. Each line has the tool, the arguments as sent (truncated to 600 characters), latency in ms, status (`ok`, `invalid_params`, `tool_error` or `internal_error`) and result count. There is also one line per HTTP request and one per rate-limited request.
  - The client appears only as a 12-character hash of its IP.
  - Phase 1 inputs carry no shopper identity.
- **CORS.** `Access-Control-Allow-Origin: *` for Phase 1. **To lock it down:** in `netlify/functions/_mcp-protocol.js` (search for `TO LOCK DOWN`), replace `*` with Meta's agent origins once Meta publishes them. Then echo the request's `Origin` when it is on that list, and add `Vary: Origin`. The server holds no cookies or credentials, so the wildcard exposes nothing today.
- **No internal surface.** The function has no admin, debug or internal methods or endpoints. Anything other than the five methods listed under Transport gets `-32601`.

### Hosting (`netlify.toml`)

- A redirect sends `/mcp` to `/.netlify/functions/mcp` (a 200 rewrite).
- `[functions."mcp"] included_files` ships only what the function reads off disk:
  - the search index, engine and pipeline
  - the Spanish dictionary
  - the auto-parts glossary
  - the weight-comparables table

### Latency

These figures were measured locally by the test suite on a shared container, so expect noise.

| | |
|---|---|
| cold: first answer after process start | about 3–4.5 s, almost all of it loading the 39 MB search index. This is the same load `/api/search` pays. RSS is about 510 MB. |
| warm `search_products`, new query | p50 about 170 ms, p95 about 500–600 ms |
| warm `search_products`, repeated query plus filter | p50 about 6 ms |
| warm `get_product`, shards on disk | p50 about 1 ms. On Netlify, add one CDN fetch (about 40 KB) for a shard the instance has not read yet. |

A real Netlify cold start cannot be measured from here. Check the function log's `ms` on the first call after a deploy.

## Out of scope

- **Phase 2:** carts, a hand-off into Aria's checkout, shopper identity and auth, and a shared rate-limit counter.
- **Phase 3:** checkout and payment, order status and anything else that moves money.

None of these is on this surface.
