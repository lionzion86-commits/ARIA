#!/usr/bin/env python3
"""PURGE A CLOSED STORE FROM EVERY CATALOGUE (#443 item 37, 2026-10-24).

A store Aria closes as a source (Target, Oct 22) must come down as if it
was never listed: off-sale.js only hides it at run time, the rows stay
in the files. This takes the store's rows out of the source catalogues
and the photo-search index, keeping each file's own formatting; the
derived slices are rebuilt by their builders afterwards.

  python3 scripts/purge-store.py target

Rows go when their "retailer" or "store" field is the key, and a
"retailers" (or per-store map) entry keyed by it goes whole. Provenance
fields that merely name the store (portedFrom.from) stay: they are not
shown and record where a description came from.
"""
import json
import os
import re
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = ("hidden-docs/", "reports/", "assets/", "build/", "visual-index/", "node_modules/")


def fmt_of(raw):
    """How the file was written, so a rewrite changes only the purged rows."""
    if "\n  " in raw[:200]:
        indent = len(re.search(r"\n( +)\S", raw).group(1))
        opts = dict(indent=indent)
    elif re.search(r'"\s*:\s', raw[:2000]) and ", " in raw[:2000]:
        opts = dict()
    else:
        opts = dict(separators=(",", ":"))
    ascii_ = "\\u00" in raw and not re.search(r"[À-￿]", raw)
    return dict(opts, ensure_ascii=ascii_)


def dump(obj, opts, raw):
    out = json.dumps(obj, **opts)
    return out + "\n" if raw.endswith("\n") else out


def purge(node, key):
    """(new node, rows removed)."""
    n = 0
    if isinstance(node, list):
        kept = []
        for v in node:
            if isinstance(v, dict) and (v.get("retailer") == key or v.get("store") == key):
                n += 1
                continue
            v, m = purge(v, key)
            n += m
            kept.append(v)
        return kept, n
    if isinstance(node, dict):
        out = {}
        for k, v in node.items():
            if k == key and isinstance(v, (dict, list)):
                n += count_rows(v)
                continue
            v, m = purge(v, key)
            n += m
            out[k] = v
        return out, n
    return node, 0


def count_rows(v):
    if isinstance(v, list):
        return sum(1 if isinstance(x, dict) and ("title" in x or "name" in x) else count_rows(x) for x in v) or 1
    if isinstance(v, dict):
        return sum(count_rows(x) for x in v.values() if isinstance(x, (dict, list))) or 1
    return 0


def purge_json_files(key):
    files = subprocess.run(["git", "ls-files", "*.json"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    needle = re.compile(r'"%s"' % re.escape(key))
    for f in files:
        if f.startswith(SKIP) or re.search(r"audit", f):
            continue
        path = os.path.join(ROOT, f)
        raw = open(path, encoding="utf8").read()
        if not needle.search(raw):
            continue
        opts = fmt_of(raw)
        data = json.loads(raw)
        if dump(data, opts, raw) != raw:
            print(f"  SKIP {f}: its formatting does not round-trip; purge by hand")
            continue
        new, n = purge(data, key)
        if n:
            open(path, "w", encoding="utf8").write(dump(new, opts, raw))
            print(f"  {f}: {n} removed")


def purge_visual_index(key):
    vdir = os.path.join(ROOT, "visual-index")
    mpath = os.path.join(vdir, "manifest.json")
    mraw = open(mpath, encoding="utf8").read()
    man = json.loads(mraw)
    dim = man["dim"]
    total = 0
    for s in man["shards"]:
        meta_path = os.path.join(vdir, s["meta"])
        raw = open(meta_path, encoding="utf8").read()
        meta = json.loads(raw)
        vec = open(os.path.join(vdir, s["bin"]), "rb").read()
        assert len(meta) == s["count"] and len(vec) == s["count"] * dim, s["bin"]
        keep = [i for i, r in enumerate(meta) if r.get("retailer") != key]
        if len(keep) != len(meta):
            opts = fmt_of(raw)
            open(meta_path, "w", encoding="utf8").write(dump([meta[i] for i in keep], opts, raw))
            open(os.path.join(vdir, s["bin"]), "wb").write(b"".join(vec[i * dim:(i + 1) * dim] for i in keep))
            print(f"  visual-index/{s['meta']}: {len(meta) - len(keep)} removed")
            s["count"] = len(keep)
        total += s["count"]
    man["total"] = total
    open(mpath, "w", encoding="utf8").write(dump(man, fmt_of(mraw), mraw))


if __name__ == "__main__":
    for key in sys.argv[1:]:
        print(f"purging {key}")
        purge_json_files(key)
        purge_visual_index(key)
