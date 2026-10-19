"""VARIANT TRUTH MERGE (2026-10-18, Issue #411 / #367 release gate 7).

Danny's rule: Aria never shows a size it invented. Lucifer's swarm read
each retailer's own product page and wrote the real size list per
product to data/variant-truth/merged-sizes.json (branch
data/variant-truth-2026-10-18), keyed "<catalog file>|<product name>".
This writes those lists onto the catalogue records themselves, so every
surface (homepage cards and product view, producto.html, the cart)
reads one field: `sizes`.

    python3 scripts/merge-variant-truth.py <merged-sizes.json> [--dry]

Rules:
- A record gets `sizes` only from a non-empty list in the dataset, plus
  `sizesTier` (live / scrape / verified / inferred) and `sizesSource`, so
  the Miami buy step knows how the list was established.
- A record the dataset gives no list keeps whatever list the retailer's
  own scrape already gave it (scrape lists are truth per Danny); nothing
  is invented either way.
- Names repeat inside a file (colourways, re-listings); the dataset keys
  the second appearance "<name> #2", the third "#3", in file order.
- Records keyed by `productName` (the Foot Locker cache) are left alone:
  they already carry the retailer's per-size stock objects.
- The Ofertas feed (ofertas-feed.json, generated outside this repo)
  copies each deal's sizes at build time, so it is updated too: a deal
  gets the dataset's list when every dataset entry with that title
  agrees on one list. Regenerate the lite feed afterwards
  (node scripts/build-ofertas-lite.mjs).
- Names are compared as plain text. The catalogues' titles were
  HTML-decoded on 2026-10-19 (#417, "Lizzie &#38; Oliver" -> "Lizzie &
  Oliver"); the dataset was keyed before that, so both sides go through
  the same decoder (scripts/decode-catalog-entities.py) before they are
  matched.
- Each file is written back in its own JSON style (separators, indent,
  ASCII escaping), sniffed by an exact round-trip, so the diff is the
  sizes and nothing else. A file is only written when it changed.
"""
import importlib.util
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
_spec = importlib.util.spec_from_file_location(
    "decode_catalog_entities", os.path.join(os.path.dirname(os.path.abspath(__file__)), "decode-catalog-entities.py"))
_dec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_dec)
plain = _dec.decode


def sniff_style(raw, data):
    for ea in (False, True):
        for compact in (True, False):
            for ind in (None, 2, 1, 4):
                sep = (",", ": ") if ind else ((",", ":") if compact else (", ", ": "))
                st = dict(ensure_ascii=ea, separators=sep, indent=ind)
                out = json.dumps(data, **st)
                if out == raw or out + "\n" == raw:
                    return st, raw.endswith("\n")
    raise SystemExit("cannot reproduce the file's JSON style exactly; refusing to rewrite it")


def records(node):
    if isinstance(node, list):
        for x in node:
            if isinstance(x, dict) and (isinstance(x.get("name"), str) or isinstance(x.get("title"), str)):
                yield x
            else:
                yield from records(x)
    elif isinstance(node, dict):
        for v in node.values():
            yield from records(v)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: merge-variant-truth.py <merged-sizes.json> [--dry]")
    dry = "--dry" in sys.argv[2:]
    with open(sys.argv[1], encoding="utf8") as fh:
        truth = json.load(fh)
    by_file = {}
    for key, rec in truth.items():
        if "|" not in key:
            continue
        f, name = key.split("|", 1)
        by_file.setdefault(f, {})[plain(name)] = rec

    total = {"files": 0, "written": 0, "sized": 0, "unmatched": 0}
    for f, recs in sorted(by_file.items()):
        path = os.path.join(ROOT, f)
        if not os.path.exists(path):
            print(f"skip {f}: not in this tree")
            continue
        with open(path, encoding="utf8") as fh:
            raw = fh.read()
        data = json.loads(raw)
        style, newline = sniff_style(raw, data)
        seen, counts, sized = set(), {}, 0
        for r in records(data):
            name = plain(r["name"] if isinstance(r.get("name"), str) else r["title"])
            counts[name] = counts.get(name, 0) + 1
            n = counts[name]
            key = f"{name} #{n}" if n > 1 and f"{name} #{n}" in recs else name
            rec = recs.get(key)
            if not rec:
                continue
            seen.add(key)
            lst = []
            for s in rec.get("sizes") or []:
                s = str(s).strip()
                if s and s not in lst:
                    lst.append(s)
            if not lst:
                continue
            r["sizes"] = lst
            r["sizesTier"] = rec.get("sizes_tier") or ("verified" if rec.get("verified") else "scrape")
            if rec.get("source_url"):
                r["sizesSource"] = rec["source_url"]
            sized += 1
        unmatched = len([k for k in recs if k not in seen])
        out = json.dumps(data, **style) + ("\n" if newline else "")
        changed = out != raw
        total["files"] += 1
        total["sized"] += sized
        total["unmatched"] += unmatched
        print(f"{f}: {sized} sized, {unmatched} dataset names not found{'' if changed else ', unchanged'}")
        if changed and not dry:
            with open(path, "w", encoding="utf8") as fh:
                fh.write(out)
            total["written"] += 1
    print(json.dumps(total))

    # The Ofertas feed: one list per title, only where the dataset agrees.
    by_title = {}
    for key, rec in truth.items():
        if "|" not in key:
            continue
        name = plain(key.split("|", 1)[1])
        base = name.rsplit(" #", 1)[0] if name.rsplit(" #", 1)[-1].isdigit() else name
        lst = []
        for s in (rec or {}).get("sizes") or []:
            s = str(s).strip()
            if s and s not in lst:
                lst.append(s)
        if lst:
            by_title.setdefault(base, set()).add(tuple(lst))
    path = os.path.join(ROOT, "ofertas-feed.json")
    if os.path.exists(path):
        with open(path, encoding="utf8") as fh:
            raw = fh.read()
        data = json.loads(raw)
        style, newline = sniff_style(raw, data)
        n = 0
        for it in data.get("items", []):
            lists = by_title.get(plain(it.get("title") or ""))
            if lists and len(lists) == 1:
                lst = list(next(iter(lists)))
                if it.get("sizes") != lst:
                    it["sizes"] = lst
                    n += 1
        out = json.dumps(data, **style) + ("\n" if newline else "")
        print(f"ofertas-feed.json: {n} deals given their verified sizes")
        if out != raw and not dry:
            with open(path, "w", encoding="utf8") as fh:
                fh.write(out)


if __name__ == "__main__":
    main()
