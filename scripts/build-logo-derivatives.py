#!/usr/bin/env python3
"""LOGOS AT THE SIZE THEY ARE DRAWN (#443 c.6587429371, image weight).

Every store mark on the homepage app is drawn at 14-78 CSS px tall (the
card badge 14-44, the rail plaque 22, the Tiendas tile 26, the store
strip 34, the Tiendas grid 78), but the files in logos/ are the stores' own masters -- 600x600,
1400x348, 1549x626 -- and the homepage alone pulled ~2 MB of them.

This writes logos/h240/<same path>.webp: the same mark, scaled down to
240 px tall (aspect kept, never scaled up), stored as LOSSLESS WebP --
the pixels are exactly the scaled PNG's, the file about half. 240
device px covers an 80 CSS px mark on a 3x phone, so anywhere the mark is drawn at 80 CSS px
or less the derivative is pixel-for-pixel as sharp as the master. The
pages use it only there (logoAt() in the app bundle, the rail plaques
in index.html); one size for every use, so a mark shown twice is
fetched once; every other use keeps the master, and a derivative
that fails to load falls back to the master before any text pill.

A master that is already 240 px tall or less is stored unscaled (the
same pixels, lossless) -- so the rule "logos/x.png ->
logos/h240/x.webp" holds for every PNG logo.

THE ORB, TOO: assets/aria-orb-pixar-320.png and its blink frame (the
homepage assistant button, 95 KB each) get a lossless WebP twin,
assets/aria-orb-pixar-320.webp / -blink-320.webp: identical pixels,
about two thirds of the bytes. The PNG stays as the fallback.

    python3 scripts/build-logo-derivatives.py
Re-run after adding or replacing a PNG in logos/ (the image-weight
test fails when a derivative is missing or stale).
"""
import os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "logos")
OUT = os.path.join(SRC, "h240")
H = 240

ORBS = ["assets/aria-orb-pixar-320.png", "assets/aria-orb-pixar-blink-320.png"]

def lossless(im, dst):
    mode = "RGBA" if (im.mode in ("RGBA", "LA", "P", "PA") or "transparency" in im.info) else "RGB"
    im = im.convert(mode)
    im.save(dst, "WEBP", lossless=True, quality=100, method=6, exact=True)

def fit(w, h):
    """The scaled size whose aspect is closest to the master's, between
    234 px (a 78 CSS px mark at 3x, the largest use) and 240 px tall -- a
    mark drawn at a fixed CSS height takes its width from the file's
    aspect, so this keeps every drawn mark the same width to a hundredth
    of a pixel."""
    best = None
    for nh in range(H, H - 7, -1):
        nw = max(1, round(w * nh / h))
        err = abs(nw / nh - w / h)
        if best is None or err < best[0] - 1e-12:
            best = (err, nw, nh)
    return best[1], best[2]

def derive(src, dst):
    with Image.open(src) as im:
        im.load()
        w, h = im.size
        if h <= H:
            lossless(im, dst); return "copy"
        mode = "RGBA" if (im.mode in ("RGBA", "LA", "P", "PA") or "transparency" in im.info) else "RGB"
        small = im.convert(mode).resize(fit(w, h), Image.LANCZOS)
        lossless(small, dst)
        return "scaled"

def main():
    n = {"copy": 0, "scaled": 0}
    before = after = 0
    for dirpath, dirs, files in os.walk(SRC):
        if os.path.abspath(dirpath).startswith(OUT):
            continue
        dirs[:] = [d for d in dirs if os.path.join(dirpath, d) != OUT]
        for f in sorted(files):
            if not f.lower().endswith(".png"):
                continue
            src = os.path.join(dirpath, f)
            dst = os.path.join(OUT, os.path.relpath(src, SRC))[:-4] + ".webp"
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            n[derive(src, dst)] += 1
            before += os.path.getsize(src); after += os.path.getsize(dst)
    # a derivative whose master is gone (a purged store) goes with it
    gone = 0
    for dirpath, dirs, files in os.walk(OUT):
        for f in files:
            master = os.path.join(SRC, os.path.relpath(os.path.join(dirpath, f), OUT))[:-5] + ".png"
            if not f.endswith(".webp") or not os.path.exists(master):
                os.remove(os.path.join(dirpath, f)); gone += 1
    print("logos: %d scaled, %d unscaled, %d orphans removed; %d -> %d bytes" % (n["scaled"], n["copy"], gone, before, after))
    for rel in ORBS:
        src = os.path.join(ROOT, rel)
        with Image.open(src) as im:
            im.load(); lossless(im, src[:-4] + ".webp")
        print("%s: %d -> %d bytes" % (rel, os.path.getsize(src), os.path.getsize(src[:-4] + ".webp")))

if __name__ == "__main__":
    sys.exit(main())
