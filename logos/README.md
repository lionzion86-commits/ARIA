# Store logos

One file per retailer, named after its registry key (`logos/<key>.<ext>`).
Each is that retailer's own logo as the retailer publishes it, used purely
to identify which store a product comes from — the same nominative use
every price-comparison site relies on.

SVG is preferred where the retailer publishes one, because it stays crisp
at every size. PNG is fine where they do not: the tiles size every mark
with `object-fit: contain`, so the format makes no difference to the
layout. Supply a PNG at roughly 3x the largest rendered size (the Tiendas
tile caps a mark at 34px tall) so it does not soften on a retina screen.

## Adding one

1. Save the retailer's logo as `logos/<key>.<ext>`, where `<key>` is the
   key used in `scripts/lib/retailers.js`.
2. Set `logo: 'logos/<key>.<ext>'` on that store's row, in both
   `scripts/lib/retailers.js` and its mirror in `index.html`.

That is the whole change. Nothing else needs touching — every surface
that draws a store mark reads the registry row.

## How a mark is sized, whatever shape it is

One height cap and `object-fit: contain`, everywhere. Foot Locker's
wordmark is 9.5:1 and Target's bullseye is square; both are capped at
34px tall and 130px wide on a Tiendas tile (26 x 96 on the homepage chip)
and scaled inside that box. So:

- a square mark and a wide one read at the same optical height,
- a banner-shaped file lands at the cap height and whatever width its
  own proportions give it,
- nothing is ever stretched, and no file needs pre-processing to fit.

A transparent PNG sits directly on the tile's own background. There is no
plate, box or backdrop drawn behind a mark.

## A logo is the retailer's art, not ours to restyle

Marks are never recoloured, filtered or redrawn. The one place that used
to break this rule was the "still being connected" treatment: it greyed
out the whole tile, logo included, which would have shipped Victoria's
Secret's pink and Bath & Body Works' blue as grey. The muting now applies
to the tile and to our own wordmark treatment, never to a real logo file.
A pending store is still obvious — muted plate, amber dot, and a
"Conectando el catálogo" badge that says it outright.

## Not having one is a real state, not a broken one

A store with `logo: null` renders as its wordmark on its own brand colour
(`retailerTextBadgeHTML` / `.store-logo-fallback`). That is a deliberate
treatment, and it is also what a missing or un-decodable file falls back
to at runtime — nothing on this site ever shows a broken-image icon or raw
alt text where a store logo should be.

Sephora, Victoria's Secret and Bath & Body Works carried that wordmark
treatment until their real files arrived on 2026-09-20. All eight stores
show their own mark now.

Two of those three are worth a note, because they look like mistakes and
are not. Victoria's Secret and Bath & Body Works publish their logos as
artwork on a brand-coloured field — pink and blue — rather than as
transparent marks, so their tiles carry a coloured rectangle where the
others carry a mark on white. That is the logo as the brand distributes
it, and the rule is to use it exactly as provided: never recoloured,
never knocked out, never redrawn. Sephora's file is genuinely transparent
and sits straight on the tile.
