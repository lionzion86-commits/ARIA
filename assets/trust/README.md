# Trust card backgrounds

The four cards in the home page's feature strip — *Precio transparente*,
*Pagos seguros*, *Aduana resuelta*, *Entrega puerta a puerta* — each take
a full-bleed photograph behind their roundel, title and description.

| card | file |
|---|---|
| Precio transparente | `trust-precio.jpg` |
| Pagos seguros | `trust-pagos.jpg` |
| Aduana resuelta | `trust-aduana.jpg` |
| Entrega puerta a puerta | `trust-entrega.jpg` |

**None of these four files is committed yet.** Until they are, every card
renders navy with white type, which is a designed state and not a broken
one: `.ariaTrustCard` carries the navy, the `<img>` removes itself on
error, and the contrast numbers below hold either way. Drop the four
files in at these exact names and they appear with no other change.

## The rules

**Decorative.** `alt=""` and `aria-hidden="true"` — the title beside the
photo already says what the card is about.

**Survivable.** `onerror="this.remove()"`, and the navy lives on the
*card*, never on the photo. A missing or broken file leaves navy plus
scrim, never a broken-image glyph under white type.

**Lazy.** The strip is below the fold on every viewport.

**Positioning lives in the inline `<style>`, never in a Tailwind
utility.** `.ariaTrustPhoto` is `position:absolute`; if its containing
block came from a `relative` utility then on any load where the Tailwind
CDN is blocked — which is exactly how `browser-tests.mjs` runs, on
purpose — the photo would resolve against the viewport and lie across the
whole page. `.ariaTrustCard` is the guard, and a browser check asserts
the geometry rather than the stylesheet text.

**No text, badges, prices or numbers baked into the image.** Ever. A
price inside a JPEG cannot be updated, translated, or made honest.

## The scrim is bottom-weighted, and the numbers were computed

The card's content is anchored to the bottom, so the gradient is nearly
clear where the photograph does its work (0.12) and heavy where the type
sits (0.72 → 0.90). A flat wash over the whole card is the muddy version:
a dimmed photograph *and* weaker contrast, the worst of both.

The stops were measured against a **pure white** pixel — the worst case
any photograph can present — so they generalise to images nobody has seen
yet. White over `rgba(4,12,28,0.60)` on pure white is 5.22:1; 0.55 is
4.39:1 and fails. Measured on rendered pixels with a white stand-in
served in place of all four photos:

| | colour | worst background | ratio |
|---|---|---|---|
| title | `#fff` | `rgb(72,78,90)` | **8.36:1** |
| description | `#E3EAF8` | `rgb(59,66,78)` | **8.38:1** |

So a photograph dropped in here is legible by construction rather than by
luck. Re-run that probe anyway once the real files land — it is cheap,
and "measured" beats "should be fine".
