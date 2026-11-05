#!/usr/bin/env python3
"""ARIA HOME SHIELD: cut the plush star out of her white studio background.

  python3 scripts/cut-aria-star.py            (writes home-shield/img/aria-*-cut-400.webp)

Only ALPHA is computed; no pixel colour of the character is changed.
  1. The background colour is sampled from the four corners.
  2. Flood fill from the image border (connected to the edge only, so the
     whites inside her, like the eye highlights, survive): pixels within
     TOL of the background become fully transparent.
  3. Enclosed patches of studio white big enough to be background (the gap
     between her legs, closed off by the floor shadow) get the same matte;
     small ones (eye highlights) are hers and stay.
  4. The studio glow and floor shadow (still connected to the edge and
     within BAND of the background colour) go transparent too, so no light
     halo sits on a dark page. Her fur starts well above BAND.
  5. A 1px feather on the alpha edge, then a premultiplied resize to 480.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/aria-star"
OUT = ROOT / "home-shield/img"
FRAMES = ["open", "blink", "talk1", "talk2"]
TOL, BAND, SIZE, MAX_BYTES = 12, 45, 400, 26 * 1024
PATCH_D, PATCH_MIN = 40, 1500  # enclosed studio-white patches (between the legs), half-res px


def edge_flood(ok):
    """Pixels where ok is True and that connect to the image border."""
    reach = np.zeros_like(ok)
    reach[0, :] = ok[0, :]; reach[-1, :] = ok[-1, :]; reach[:, 0] = ok[:, 0]; reach[:, -1] = ok[:, -1]
    while True:
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]; grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]; grown[:, :-1] |= reach[:, 1:]
        grown &= ok
        if (grown == reach).all():
            return reach
        reach = grown


def big_patches(ok, taken, min_area):
    """Connected regions of ok (not already taken) with at least min_area pixels."""
    from collections import deque
    h, w = ok.shape
    seen = taken.copy()
    out = np.zeros_like(ok)
    ys, xs = np.nonzero(ok & ~seen)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        comp, q = [], deque([(y0, x0)])
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            comp.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and ok[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(comp) >= min_area:
            cy, cx = zip(*comp)
            out[list(cy), list(cx)] = True
    return out


def cut(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    k = 12
    corner = np.median(np.concatenate([a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3), a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)]), axis=0)
    d = np.abs(a - corner).max(axis=2).astype(np.float32)
    # Work on a half-size grid for the flood (fast), then scale the masks up.
    h, w = d.shape
    small = Image.fromarray(d.astype(np.uint8)).resize((w // 2, h // 2), Image.NEAREST)
    ds = np.asarray(small).astype(np.float32)
    bg = edge_flood(ds <= TOL)
    band = edge_flood(ds <= BAND)
    band |= big_patches(ds <= PATCH_D, band, PATCH_MIN)
    up = lambda m: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((w, h), Image.NEAREST)) > 127
    bg, band = up(bg), up(band)
    # The studio glow and floor shadow (the band) go fully transparent with
    # the background: on a black page any part of them reads as a halo.
    bg = bg | band
    alpha = np.where(bg, 0.0, 255.0).astype(np.float32)
    al = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    al = np.asarray(al).astype(np.float32)
    rgba = Image.fromarray(np.dstack([np.asarray(im), al.astype(np.uint8)]), "RGBA")
    return rgba.convert("RGBa").resize((SIZE, SIZE), Image.LANCZOS).convert("RGBA")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in FRAMES:
        img = cut(SRC / f"aria-star-{f}.webp")
        dst = OUT / f"aria-{f}-cut-{SIZE}.webp"
        for q in (78, 72, 66, 60, 54):
            img.save(dst, "WEBP", quality=q, method=6, alpha_quality=70)
            if dst.stat().st_size <= MAX_BYTES:
                break
        n = dst.stat().st_size
        print(f"{dst.relative_to(ROOT)} {n} bytes")
        if n > MAX_BYTES:
            sys.exit(f"{dst} over {MAX_BYTES} bytes")


if __name__ == "__main__":
    main()
