#!/usr/bin/env python3
"""HTML entities out of catalogue titles and brands, in place (#417 night order 4).

Scraped titles arrive with HTML entities ("Lizzie &#38; Oliver",
"18&#34; Dolls", "Li&#39;l Woodzeez"); every page printed them raw.
This rewrites ONLY the "title", "name", "productName" and "brand" string
values that contain an entity, decoded, in the file's own JSON escaping
(\\uXXXX or raw UTF-8, sniffed per file). Every other byte is left as it
was -- these files are written by other tools, and re-serialising them
would reformat megabytes (see scripts/merge-variant-truth.py).

Run after a scrape lands:
    python3 scripts/decode-catalog-entities.py
then node scripts/build-ofertas-lite.mjs, node scripts/build-search-index.mjs.
scripts/test/entity-tests.mjs fails while any catalogue still carries one.
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
NAMED = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "nbsp": " ", "reg": "®", "trade": "™",
         "copy": "©", "deg": "°", "eacute": "é", "ntilde": "ñ", "rsquo": "’", "lsquo": "‘",
         "rdquo": "”", "ldquo": "“", "ndash": "–", "mdash": "—", "hellip": "…"}
ENTITY = re.compile(r"&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);")
FIELD = re.compile(r'"(title|name|productName|brand)"(\s*:\s*)"((?:[^"\\]|\\.)*)"')


def decode(s):
    for _ in range(2):
        if "&" not in s:
            break
        def one(m):
            e = m.group(1)
            if e[0] == "#":
                cp = int(e[2:], 16) if e[1] in "xX" else int(e[1:])
                return chr(cp) if 0 < cp <= 0x10FFFF else m.group(0)
            return NAMED.get(e.lower(), m.group(0))
        s = ENTITY.sub(one, s)
    return s


def fix_file(path):
    raw = open(path, encoding="utf-8").read()
    ascii_only = not any(ord(c) > 127 for c in raw)
    changed = 0

    def repl(m):
        nonlocal changed
        val = json.loads('"' + m.group(3) + '"')
        if not ENTITY.search(val):
            return m.group(0)
        new = decode(val)
        if new == val:
            return m.group(0)
        changed += 1
        enc = json.dumps(new, ensure_ascii=ascii_only)[1:-1]
        return '"%s"%s"%s"' % (m.group(1), m.group(2), enc)

    out = FIELD.sub(repl, raw)
    if changed:
        json.loads(out)  # still JSON
        open(path, "w", encoding="utf-8", newline="").write(out)
    return changed


if __name__ == "__main__":
    files = sys.argv[1:] or sorted(f for f in os.listdir(ROOT)
                                   if re.search(r"(-catalog|^department-cache-[a-z]+|feed)\.json$", f) and "lite" not in f)
    total = 0
    for f in files:
        n = fix_file(os.path.join(ROOT, f))
        if n:
            print(f"{f}: {n} values decoded")
        total += n
    print(f"{total} values decoded")
