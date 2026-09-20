# Store logos

One file per retailer, named after its registry key (`logos/<key>.<ext>`).
Each is that retailer's own logo as the retailer publishes it, used purely
to identify which store a product comes from — the same nominative use
every price-comparison site relies on.

SVG is preferred where the retailer publishes one, because it stays crisp
at every size. PNG is fine where they do not: the tiles size every mark
with `object-fit: contain`, so the format makes no difference to the
layout. A Tiendas tile draws a mark up to 130x56, so supply a PNG of at
least 400px on its long edge and it will not soften on a retina screen.

## Adding one

1. Save the retailer's logo as `logos/<key>.<ext>`, where `<key>` is the
   key used in `scripts/lib/retailers.js`.
2. Set `logo: 'logos/<key>.<ext>'` on that store's row, in both
   `scripts/lib/retailers.js` and its mirror in `index.html`.

That is the whole change. Nothing else needs touching — every surface
that draws a store mark reads the registry row.

## How a mark is sized, whatever shape it is

Every mark is contain-fit inside the same zone: **130 x 56** on a Tiendas
tile, **96 x 42** on the homepage chip. Each file grows until it reaches
whichever edge its own proportions meet first, so:

- a wordmark reaches the zone's width and a square mark reaches its
  height, and the two cover about the same area,
- a banner-shaped file needs nothing special — Victoria's Secret ships
  1200x631 and lands 106 x 56,
- nothing is ever stretched, and no file needs pre-processing to fit.

A transparent PNG sits directly on the tile's own background. There is no
plate, box or backdrop drawn behind a mark.

### Why those numbers, and why a `width` as well as the caps

Two things went wrong the first time, and both are easy to reintroduce.

**`max-height` and `max-width` alone are a ceiling, not a zone.** They
clamp a file that is too big; they never grow one that is small. The
`width: 100%` alongside them is what makes a mark fill the space it is
given. Dropping it is invisible in a diff and immediately visible on the
page.

**The zone's shape decides who gets starved.** The zone was 130 x 34 —
an aspect of 3.8, which is the shape of a wordmark. Walmart (5.3:1) and
Foot Locker (9.5:1) reached the width and drew 130px across; anything
square reached the 34px height and drew 34 x 34, roughly a third of
Walmart's ink. Sephora came off worst: its artwork is portrait (283 x 400
of ink on its canvas), so it drew 24px wide — a sliver beside Walmart.

A square mark and a `w:1` wordmark cover the same area when the zone's
`width / height` equals `sqrt(w)`. Walmart is the widest real wordmark at
5.26:1, so the target aspect is 2.29; 130/56 is 2.32 and 96/42 is 2.29.
Measured on the page, a square mark now draws at 98-101% of Walmart's
area instead of 36%.

Both suites guard this. `run-tests.mjs` requires the `width: 100%` and
refuses a zone wider than 2.5:1; `browser-tests.mjs` renders all eight
marks and fails if any of them drops below 60% of Walmart's drawn area.

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
