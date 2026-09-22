# Category covers

One curated image per category, named after its key:
`assets/category/<key>.jpg` (`.png` and `.webp` are fine too).

Saving the file is not enough — add the line to `CATEGORY_COVERS` in
`index.html`, next to the note that explains the rule:

```js
const CATEGORY_COVERS = {
  electronics: 'assets/category/electronics.jpg',
};
```

A category with no entry gets the **designed cover**: the brand's
navy-to-sky field with the category's mark on it. That is a deliberate
treatment, not a placeholder, so there is no rush and no half-finished
state — add covers one at a time and the grid stays coherent throughout.

## What is here (2026-09-22)

A curated photograph for every department: `beauty`, `candy_chocolate`,
`clothing`, `electronics`, `home_goods`, `kids`, `men`, `pharmacy`,
`sale`, `sporting_goods`, `women`.

Ten arrived first. `beauty` followed a few hours later — the department
itself only became real that morning, when Sephora, Ulta and YesStyle
landed with 197 products between them, so it briefly rendered the
designed cover beside ten photographs. A test named that gap by key
rather than tolerating it, which is what got the eleventh shot.

That test now asserts the uncovered set is **empty**. Adding a twelfth
department without a cover is not a failure — it gets the designed
cover — but the assertion will change, and whoever changes it has to
decide on purpose.

**Ofertas takes a photograph too.** Its drawn gold board
(`ofertasTileArtHTML`) is still the fallback, and its gold sign is
unchanged either way — only the art in the window differs. See the note
in `deptTileHTML`.

## Why these are curated and not scraped

Three rounds were spent picking covers out of the scraper feed: the first
cached item with an image, then a scored selection across every
candidate, then per-category denylists and a cross-tile de-duplicator on
top of that. Each round killed a class of embarrassment. None of them
worked, and the reason is not fixable by tuning:

**The scorer reads titles, not pixels.**

"Cargo Pants With Stretch" is a good title. It is also a photo of a
decapitated mannequin. "Wormwood Black Walnut Complex" is a parasite
cleanse fronting Salud y Farmacia. A 6ft HDMI cable is a real piece of
electronics. Nothing in any of those strings says "do not put this on the
front of the shop" — that judgement needs eyes.

## Rules

1. **Never a product photo with a price or a number printed on it.**
   Enforced structurally: the designed cover has no photograph, and a
   curated entry only accepts a LOCAL path, so a retailer's image URL
   cannot become a cover. `assertCuratedCover()` refuses anything that
   starts with `http`, `//` or `data:`, and a test pins it.
2. **One photographic style across the whole set.** The tiles are read as
   a vertical column, so a mixed set looks like the junk drawer this
   replaced even when each photo is good alone. Pick a treatment — same
   light, same crop discipline, same saturation — before shooting any.
3. **Shoot for the frame.** The window is wide and up to 340px tall, so
   roughly 1200x750 gives ~3x for a retina screen. A curated cover is
   `object-fit: cover`, unlike a product photo: it was composed for this
   box, so filling it is right and letterboxing it would waste the crop.
4. **No text in the image.** The category name is already on the navy
   sign underneath, in the site's own type, and it is translated.
