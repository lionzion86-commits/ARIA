# Section backgrounds

Full-bleed photographs that sit *behind* a whole home-page section, or
lead a destination page, as opposed to `assets/category/`, which holds
the art inside a single tile. A subject can have both, and they are
different shots because they are different crops: Belleza's tile is
`assets/category/beauty.jpg`, close and square-ish, while its banner is
`beauty-banner.jpg` here, wide with the silk left empty for type.

| file | section | shipped |
|---|---|---|
| `tiendas-mall-row.jpg` | Tiendas — the store-mark rail on a phone, the retailers strip on a laptop | 1760×410, ~114 KB |
| `beauty-banner.jpg` | Belleza — the banner leading the destination page | 1920×1280, ~325 KB |

## The rules a section background has to follow

**It is decorative.** `alt=""` and `aria-hidden="true"`. The heading
beside it already says "Tiendas en EE. UU."; a screen reader narrating a
mall row adds nothing.

**It must be survivable.** `onerror="this.remove()"` and the navy lives
on the *section*, not on the photo — so a missing file leaves navy plus
scrim, which is dark and legible, rather than a broken-image glyph under
white type. The same stack as the explainer (`#whyUs`).

**It is lazy.** Every one of these is below the fold. A phone's first
bytes belong to the product it came for.

**The positioning lives in the inline `<style>`, never in a Tailwind
utility.** `.ariaSectionPhoto` is `position:absolute`, so it is laid out
against the nearest positioned ancestor. If that ancestor is positioned
by a `relative` utility, then on any load where the Tailwind CDN is
blocked — which is exactly how `scripts/test/browser-tests.mjs` runs, on
purpose — the photo resolves against the viewport instead and lies
across the entire page. It does not degrade, it detonates.
`.ariaSectionShot` is the guard, and a browser check asserts the
geometry rather than the stylesheet text.

## The scrim is computed, not chosen

Sample the brightest pixel in the finished asset, composite white text
over `rgba(4,12,28,α)` on top of it, and pick the lightest α that still
clears 4.5:1. For this photograph the brightest pixel is
`rgb(254,254,248)` — a blown sky highlight — which puts α = 0.55 at
4.39:1 (a fail), 0.60 at 5.22:1, and the shipped 0.66 at 6.50:1. The
extra margin is because the type over it is 12.5–15px, where the
explainer's is display size.

Then *verify on rendered pixels*, don't trust the arithmetic: hide the
glyphs, screenshot, and find the brightest pixel actually behind each
text run. That step is what caught "Ver todas" at 4.35:1 in `#9FC5FF`
after the maths said the section was fine — the link sits over a lit
shop window, not over the average. It ships at `#C3D9FF`, 5.37:1.

## Crop the picture, not just the file

`tiendas-mall-row.jpg` arrived 2576×859 with a navy wash baked over its
bottom 30% — a flat gradient starting at row 600, measured. A baked
scrim only lines up at the one aspect ratio it was made for, and on the
phone rail, which is short enough to show nearly the whole frame, it
landed as a dead band across the bottom third. It was cropped out and
`.ariaSectionScrim` does that job at every size instead.

## One photographic section per breakpoint

The store marks appear twice on the home page: the shopfront rail
(`lg:hidden`) and the retailers strip at the foot. Both took the
photograph at first, which put it on screen twice on a phone — and,
worse, the foot strip is a two-column grid ten rows tall at 393px, so
`cover` showed the middle eleventh of a 4.29:1 frame. A dark blur.

So the photo goes wherever the section is *wide and short*, which is a
different element at each width: the rail on a phone, the strip on a
laptop. The switch is `lg`, because that is where `#mobileShopfront`
hides; the two numbers must not drift apart, and `run-tests.mjs` pins
them to each other.

## A banner is the same discipline, a different class

`beauty-banner.jpg` leads the Belleza destination page rather than
sitting behind a home-page section, so it has its own
`.ariaBeautyBanner` — but the trap is identical and so is the guard:
that class carries its own `position:relative` and `overflow:hidden` in
the inline `<style>`, never as a Tailwind utility, and a browser check
asserts the computed values rather than the class name. It is `alt=""`,
`aria-hidden`, lazy, and removes itself on error, so a missing file
leaves the page correct instead of putting a broken glyph above a
safety warning.

## Adding another one

Reuse `.ariaSectionShot` / `.ariaSectionPhoto` / `.ariaSectionScrim` /
`.ariaSectionLayer` rather than writing a second treatment that merely
looks similar. Keep the file under 200 KB (asserted). No text, badges,
prices or numbers baked into the image — ever; those are the page's job,
and a price inside a JPEG cannot be updated, translated, or made honest.
