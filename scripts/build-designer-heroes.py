#!/usr/bin/env python3
"""
<dir>/m/<name>.jpg -- THE DESIGNER ROOMS' BANNER PHOTOS, PHONE-SIZED
(2026-10-19, #437: "the room loads SLOW -- the hero photo is heavy").

disenadores.html opens every designer room on a 1600px photo (70-330KB,
2-7 seconds of a 400 kbps link). Under the banner's dark scrim a 900px
copy at quality 62 reads the same on a phone at a fraction of the
weight; the page uses it at phone widths and falls back to the original
if the copy is missing. The originals stay for desktop.

REGENERATE after a designer photo is added or replaced:
  python3 scripts/build-designer-heroes.py
"""
import os
import re

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WIDTH = 900
QUALITY = 62


def mobile_path(p):
    d, f = os.path.split(p)
    return os.path.join(d, "m", f)


def heroes():
    html = open(os.path.join(ROOT, "disenadores.html"), encoding="utf-8").read()
    paths = set(re.findall(r"hero:'([^']+\.jpg)'", html))
    paths.update(re.findall(r'class="hero-bg" src="([^"]+\.jpg)"', html))
    return sorted(p for p in paths if os.path.exists(os.path.join(ROOT, p)))


def main():
    rows = []
    for p in heroes():
        src = os.path.join(ROOT, p)
        out = os.path.join(ROOT, mobile_path(p))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im = Image.open(src).convert("RGB")
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        im.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        rows.append((p, os.path.getsize(src), os.path.getsize(out)))
    for p, a, b in rows:
        print(f"{p}: {a // 1024}KB -> {b // 1024}KB")
    ta, tb = sum(r[1] for r in rows), sum(r[2] for r in rows)
    print(f"{len(rows)} photos: {ta // 1024}KB -> {tb // 1024}KB")


if __name__ == "__main__":
    main()
