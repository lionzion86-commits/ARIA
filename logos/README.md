# Store logos

One SVG per retailer, named after its registry key (`logos/<key>.svg`).
Each is that retailer's own logo file as published on Wikipedia/Wikimedia,
used purely to identify which store a product comes from — the same
nominative use every price-comparison site relies on.

## Adding one

1. Save the retailer's logo as `logos/<key>.svg`, where `<key>` is the key
   used in `scripts/lib/retailers.js`.
2. Set `logo: 'logos/<key>.svg'` on that store's row, in both
   `scripts/lib/retailers.js` and its mirror in `index.html`.

## Not having one is a real state, not a broken one

A store with `logo: null` renders as its wordmark on its own brand colour
(`retailerTextBadgeHTML` / `.store-logo-fallback`). That is a deliberate
treatment, and it is also what a missing or un-decodable file falls back
to at runtime — nothing on this site ever shows a broken-image icon or raw
alt text where a store logo should be.

Sephora and Victoria's Secret ship on the wordmark treatment today.
