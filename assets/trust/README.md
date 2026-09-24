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

All four are committed, at 1200×800 and roughly 60–170 KB each (they
arrived at 1920×1280 and 1.5 MB the set). A test asserts all four exist
and that none exceeds 200 KB, so a full-size original cannot quietly come
back.

If one ever goes missing the card renders navy with white type, which is
a designed state and not a broken one: `.ariaTrustCard` carries the navy,
the `<img>` removes itself on error, and the contrast numbers below hold
either way.

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

The stops were first measured against a **pure white** pixel — the worst
case any photograph can present — because the real files had not arrived
yet. White over `rgba(4,12,28,0.60)` on pure white is 5.22:1; 0.55 is
4.39:1 and fails. Against a white stand-in served in all four slots the
shipped scrim gave 8.36:1 (title) and 8.38:1 (description).

The real photographs then measured **better**, as a bound implies they
must. Worst case across both viewports, on rendered pixels:

| | colour | worst background | ratio |
|---|---|---|---|
| title | `#fff` | `rgb(65,66,68)` | **10.06:1** |
| description | `#E3EAF8` | `rgb(57,58,61)` | **9.42:1** |

`trust-entrega.jpg` is the one that justified the method: its brightest
pixel is `rgb(254,255,250)`, essentially the white the bound assumed.

So a replacement photograph is legible by construction rather than by
luck. Re-run the probe anyway when one changes — it is cheap, and
"measured" beats "should be fine".
