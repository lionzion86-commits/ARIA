# Section photographs

Full-bleed art for a destination page, as opposed to the tile that leads
to it (`assets/category/`). A section can have both: Belleza's tile is
`assets/category/beauty.jpg` and its banner is `beauty-banner.jpg` here,
and they are different shots because they are different crops — the tile
is close and square-ish, the banner is wide with the silk left empty.

## Rules

1. **Positioning lives in the inline `<style>`, never in a Tailwind
   utility.** The page is built to boot with the CDN blocked. An
   absolutely-positioned photo whose containing block came from a
   utility does not degrade when that utility is missing — it covers the
   page. `.ariaBeautyBanner` carries its own `position:relative` and
   `overflow:hidden`, and a browser check asserts the computed values
   rather than the class name.
2. **Decorative, and survivable.** `alt=""`, `aria-hidden`, and an
   `onerror` that removes the element, so a missing file leaves the page
   correct rather than showing a broken glyph above a safety warning.
3. **Lazy.** These sit below the fold of the page that opens them.
4. **No text, badges or prices in the image.**
