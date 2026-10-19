#!/usr/bin/env python3
"""
assets/tienda/hero/<key>.jpg -- THE STOREFRONT BACKDROP, PHONE-SIZED
(2026-10-19, #409 track T2).

tienda.html opens every store on a photo of the store (assets/stores/
<key>.jpg, 130-370KB each: 3-7 seconds of a 400 kbps link, fetched
before a single product photo). Under the hero's dark scrim a 720px
copy at quality 60 reads the same on a phone at a fraction of the
weight; the page loads it after the first-screen product photos.

The originals stay where they are (the app bundle reads them). A store
that names its own heroPhoto (Best Buy, #413) keeps it.

REGENERATE after a store photo is added or replaced:
  python3 scripts/build-tienda-heroes.py
"""
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "assets", "stores")
OUT = os.path.join(ROOT, "assets", "tienda", "hero")
WIDTH = 720
QUALITY = 60


def stores():
    html = open(os.path.join(ROOT, "tienda.html"), encoding="utf-8").read()
    return json.loads(re.search(r"var STORES = (\{.*\});", html).group(1))


def main():
    os.makedirs(OUT, exist_ok=True)
    reg = stores()
    want = {k for k, s in reg.items() if not s.get("heroPhoto") and os.path.exists(os.path.join(SRC, k + ".jpg"))}
    for f in os.listdir(OUT):
        if f.endswith(".jpg") and f[:-4] not in want:
            os.remove(os.path.join(OUT, f))
    before = after = 0
    for k in sorted(want):
        src = os.path.join(SRC, k + ".jpg")
        im = Image.open(src)
        im = im.convert("RGB")
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        dst = os.path.join(OUT, k + ".jpg")
        im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        before += os.path.getsize(src)
        after += os.path.getsize(dst)
    print(f"{len(want)} store backdrops: {before // 1024}KB -> {after // 1024}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
