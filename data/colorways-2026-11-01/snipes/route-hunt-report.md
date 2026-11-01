# SNIPES Colorway Route Hunt — 2026-11-01

## Verdict: ROUTE FOUND — Snipes' own SFCC `Product-Variation` endpoint, $0.00

No actor, no browser, no credentials. One plain HTTP GET per product returns the
complete SFCC variation data the two dead October routes never reached: every
colorway in the product's variation group (style code + color name + per-color
swatch image set + sale flag + per-color URL), the full size attribute with
per-size selectable flags, and the group price. Total hunt spend: **$0.00**
(0 Apify runs; 14 direct endpoint calls).

The full pull was **NOT** run — per the hunt's shape, it waits for Danny's
separate call. The estimate is in §4.

## 1. The route (exact shape)

Site ID (exact, case-sensitive): `Sites-snipesusa-Site`

**Group call** — one per product PID (PID = trailing number of the catalog URL):

```
GET https://www.snipesusa.com/on/demandware.store/Sites-snipesusa-Site/default/Product-Variation?pid=<PID>&quantity=1
```

Response JSON path: `product.variationAttributes[]`

- `attributeId: "color"` → `values[]`, each with `id`/`value` (style code),
  `displayValue` (color name, e.g. `"Dark Artic Grey | Sea Salt"`), `selected`,
  `selectable`, `accessible`, `isOnSale`, a per-color `url`, and
  `images.swatch[]` (that colorway's full photo set).
- `attributeId: "size"` → `values[]` with per-size `selectable` flags.
- `product.price.sales` / `product.price.list` (group price) and
  `product.images` for the currently selected color.

**Color-selected follow-up** — only needed for a sibling colorway that has no
PID of its own, to get its own image set / size grid:

```
GET https://www.snipesusa.com/on/demandware.store/Sites-snipesusa-Site/default/Product-Variation?dwvar_<PID>_color=<COLOR_CODE>&pid=<PID>&quantity=1
```

Sibling colorways that DO have their own PID carry it inside their color
value's `url` (e.g. ABZORB "Truffle Salt | Pink Salt" → `pid=1000129623`), so
the pull dedupes by group for free.

⚠️ **Do not trust the `colorCount` field** — it disagrees with the values
array (NB 574: `colorCount` 1, actual 2 color values; ABZORB 2000: 3 vs 4;
Skull Hoodie: 2 vs 2). Count `values[]`.

## 2. Proof results (14 calls, all 2026-11-01 ~15:41–15:46 UTC)

### Multi-colorway hits

| Product (PID) | We hold | Endpoint returned | Net-new |
|---|---|---|---|
| New Balance **574** (1000098253) | 1: ML574EVG "Grey \| White", $100 | **2 colorways**: + **U574WBG "Dark Artic Grey \| Sea Salt"** (isOnSale) | **+1 colorway that exists nowhere in our catalog** — U574WBG has no listing/PID of its own among our 4,907 Snipes products |
| New Balance **ABZORB 2000** (1000129624) | 6 listings, all named just "ABZORB 2000", zero color identity | **4 colorways** with codes + names: U2000ETB "Black", U20005F9 "Truffle Salt \| Pink Salt", U20006E1 "Wakame \| Black \| Afterglow", U20006OU "Grey \| Silver Metallic \| Black" (held, selected) | Structured color name + swatch set + group linkage for every held listing |
| Hasta Muerte **Skull Hoodie** (1000130122) | 2 listings named "Skull Hoodie" | **2 colorways**: T2SKULLHOODY-GRY "Heather Grey" (held) + HMT2SKLHDY-BLK "Black" (selectable, isOnSale, own PID 1000128361, 3 swatch photos) | Proves the two held listings are one group; names both colors |

574 follow-up proof: requesting the group with `dwvar_…_color=U574WBG` returns
U574WBG `selected:true`, the product image set switched entirely to the
sibling's own 8 photos (`new-balance_u574wbg_01.jpg`…`_08.jpg`), price $100.00.
Caveat: in that response every observed size (M7/W8.5–M13/W14.5) shows
`selectable:false` — the colorway is real in Snipes' data and flagged on sale,
but may currently be sold out. Existence ≠ stock; the payload carries both
signals separately, which is exactly what a pull needs.

### Verified single-colorway (endpoint is ground truth, census suspicion was wrong)

9 suspected + 1 random product returned exactly **1** color value each:
Chuck Taylor All Star (M7652 "White", $60) · Sk8-Hi (VN000Y18BMX
"Black | White", $80) · Dunk Low SE ("White | Black | Red", $49.99/$120) ·
Messi Samba OG (JQ0266 "White | Beige", $49.99/$100) · 2-Tone Old Skool
("Marshmallow | White", $29.99/$70) · Polo Bear Fleece Sweatshirt
(710B28795001-OLV "Cruise Olive", $175, clothing) · Mario Classic Clog
(212134-90H "Multi", $80) · Air Jordan 4 Rm ("Black | Fire Red | Wolf Grey |
White", $79.99/$160) · Shai 001 Lace Up (random sample; "Last Straw Lime |
Latte | Burnt Orange", $99.99/$120).

Read: of the 9 census-suspected products probed, only 1 (574) actually hides a
sibling inside its SFCC group — Snipes splits most colorways into separate
PIDs (which our catalog already holds as separate listings). The endpoint's
bigger value is therefore (a) the same-PID siblings only it can see, and
(b) structured color identity + group linkage for **every** product, suspected
or not — the ABZORB case (6 anonymous listings → 4 named colorways) is the
typical win, and the census cannot detect it at all.

Full structured proof: `proof.json` in this folder. Suspected-case PID list:
`suspected-213.json` in this folder.

## 3. Angles — outcome per angle

| Angle | Result |
|---|---|
| **SFCC SFRA `Product-Variation` endpoint (direct GET)** | ✅ **PROVEN** — full colorway data, $0. See §1–2. |
| SFCC OCAPI `dw/shop` product resource | ❌ HTTP 401 with a placeholder `client_id`; needs a real OCAPI client ID Snipes doesn't publish. Not needed — SFRA route is open. |
| Wrong-site-ID control (`Sites-SnipesUSA-Site`) | ❌ HTTP 500 — confirms the exact site ID matters. |
| digital_influx/product-data (Oct 2026) | ❌ Dead end, not rerun (per brief): JSON-LD carries no variations; a rerun costs ~$19.60 for the same zero. |
| constructive_calm browser scraper (Oct 2026) | ❌ Dead end, not rerun (per brief): "Salesforce variation data not traversed." |
| Generic Apify actor (e.g. apify/e-commerce-scraping-tool) on Snipes PDPs | Not run — deliberately. The native endpoint already returns complete variant data at $0; spending Apify money to re-prove a solved route buys nothing. |
| Swatch-clicking rendered-browser route | Not run — same reason; the endpoint *is* what the swatch selector calls. |

## 4. Full-pull estimate (STOP — needs Danny's call)

Mechanics: plain HTTP GETs with the Oct 28 Snipes PDP-pass fetcher pattern
(local extraction, `extract.py` precedent: 4,998/5,000 PDPs fetched, finished
on curl at ~110 requests/min, **$0.00** Apify spend). No per-item actor cost
exists on this route.

**Scope A — the 213 suspected cases**
- Requests: 213 group calls + color-selected follow-ups only for same-PID
  siblings (probe rate: 1 of 9 suspected; budget worst case +213) →
  **213–426 requests**
- Time: 213 ÷ 110/min ≈ **2 min** sequential (≈4 min worst case with
  follow-ups)
- **Cost: $0.00**

**Scope B — all Snipes shoe + clothing families (recommended scope)**
- Why: the census's 213 are a weak filter (1/9 hit rate in probes) while
  unsuspected products carry the anonymous-listing problem (ABZORB). The
  endpoint is the only way to attach real color names/linkage fleet-wide.
- Requests: one group call per shoe/clothing listing = 1,933 shoes + 2,722
  clothing = **4,655 calls** (dedupe groups via the cross-PID color URLs),
  + follow-ups for same-PID siblings only
- Time: 4,655 ÷ 110/min ≈ **42 min** sequential; ~11 min at 4-way concurrency
- **Cost: $0.00**

**Scope C — every Snipes product (4,907)**: 4,907 calls ≈ 45 min sequential,
**$0.00**. Marginal extra over Scope B; also names colors for accessories.

Fallback if direct fetching ever gets bot-blocked at scale (not observed —
14/14 calls succeeded): the October per-product actor rate was $0.004/product,
which would price Scope A at ≈$0.85 and Scope B at ≈$18.62. Indicative only;
no actor run was made or is needed on current evidence.

**Expected yield (honest bounds from probes):** same-PID hidden siblings are
rare (1 of 9 suspected; the 574 case). The certain yield is structured color
data for 100% of probed products: color name + style code + swatch photos +
group linkage + per-size availability flags — including naming the colorways
of the 727 multi-listing Snipes families whose listings currently carry no
color identity at all.

## 5. Spend log

| Item | Run ID | Cost |
|---|---|---|
| Apify runs | none | $0.00 |
| Direct SFCC endpoint calls (13 group + 1 color-selected) | n/a | $0.00 |
| **Total hunt spend** | | **$0.00** (cap was $25) |

## 6. Caveats for the pull

- Count color `values[]`, never `colorCount`.
- A returned colorway can be sold out (`selectable:false` on all sizes, e.g.
  U574WBG) — keep it as data, flag stock from the size flags, don't drop it.
- Price is per-group in this payload; a sibling with its own PID takes its
  price from its own listing (already in our catalog where the PID exists).
- Responses are large (~40–90 KB JSON each); Scope B ≈ 200–400 MB raw —
  extract-and-discard, same as the Oct 28 pass.
