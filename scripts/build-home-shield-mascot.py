#!/usr/bin/env python3
"""ARIA HOME SHIELD: the plush tornado mascot, sized for the page's slots.

  python3 scripts/build-home-shield-mascot.py

Resize only. The delivered frames (assets/aria-tornado/, 571x720 RGBA,
transparent, gold rim baked in) are never cut, recoloured or boxed; alpha
is kept (premultiplied resize, so the rim stays clean on black).
Writes home-shield/img/tornado-{frame}-{h}.webp:
  360 tall  the hero figure
  240 tall  the floating launcher, the chat header, the case page
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/aria-tornado"
OUT = ROOT / "home-shield/img"
FRAMES = ["open", "blink", "talk1", "talk2"]
SIZES = {360: (72, 80), 240: (76, 85)}  # height: (quality, alpha quality)
MAX_BYTES = 40 * 1024

OUT.mkdir(parents=True, exist_ok=True)
for f in FRAMES:
    im = Image.open(SRC / f"aria-tornado-{f}.webp").convert("RGBA")
    for h, (q, aq) in SIZES.items():
        w = round(im.width * h / im.height)
        out = im.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
        dst = OUT / f"tornado-{f}-{h}.webp"
        out.save(dst, "WEBP", quality=q, method=6, alpha_quality=aq)
        n = dst.stat().st_size
        print(f"{dst.relative_to(ROOT)} {w}x{h} {n} bytes")
        if n > MAX_BYTES:
            sys.exit(f"{dst} is over {MAX_BYTES} bytes")
