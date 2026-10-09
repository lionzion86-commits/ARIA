#!/usr/bin/env python3
"""
Apply weight estimates to catalog products missing real weight data.

Usage:
    python3 apply-weight-estimates.py weight-estimates.json <catalog.json> [--dry-run] [--in-place]

- Matches product 'type' (then product 'name' as fallback) against keyword rules.
- Falls back to department-level defaults, then global default.
- Applies 1.10x cushion, rounds to 2 decimals.
- Sets weightKg + weightEstimated=true. Never overwrites existing real weights
  (products where weightEstimated is not true keep their weightKg).
- --dry-run: report what would change without writing.
- --in-place: write back to the same file (default: print patched JSON to stdout).
"""
import json, re, sys, unicodedata

def norm(s):
    s = (s or '').lower()
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    return s

def load_table(path):
    with open(path) as f:
        t = json.load(f)
    rules = []
    for r in t['rules']:
        for kw in r['keywords']:
            rules.append((norm(kw), r['kg']))
    # longest keyword first so "leather jacket" beats "jacket"
    rules.sort(key=lambda x: -len(x[0]))
    return t, rules

def estimate(prod, table, rules):
    # 1. product type
    for field in ('type', 'name'):
        text = norm(prod.get(field, ''))
        if not text:
            continue
        for kw, kg in rules:
            if kw and kw in text:
                return kg, f'{field}:{kw}'
    # 2. department fallback — walk up via retailer/department keys if present
    dept = norm(prod.get('_department', '') or prod.get('department', ''))
    fb = table.get('department_fallbacks', {})
    if dept in fb:
        return fb[dept], f'dept:{dept}'
    return table.get('default_kg', 0.5), 'default'

def iter_products(data):
    """Yield (product_dict, department_key) across catalog shapes."""
    retailers = data.get('retailers', {})
    if isinstance(retailers, dict):
        for rkey, rval in retailers.items():
            if not isinstance(rval, dict):
                continue
            depts = rval.get('departments', {})
            if not isinstance(depts, dict):
                continue
            for dkey, dval in depts.items():
                if not isinstance(dval, dict):
                    continue
                for item in dval.get('items', []):
                    item['_department'] = dkey
                    yield item
    # flat list shape
    items = data.get('products') or data.get('items')
    if isinstance(items, list):
        for item in items:
            yield item

def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    table_path, catalog_path = args[0], args[1]
    dry_run = '--dry-run' in args
    in_place = '--in-place' in args

    table, rules = load_table(table_path)
    cushion = table.get('_meta', {}).get('cushion', 1.1)

    with open(catalog_path) as f:
        data = json.load(f)

    changed, skipped_real, unmatched = 0, 0, 0
    for prod in iter_products(data):
        if prod.get('weightKg') and not prod.get('weightEstimated'):
            skipped_real += 1
            continue
        if prod.get('weightKg') and prod.get('weightEstimated'):
            # already estimated — leave as is
            continue
        kg, why = estimate(prod, table, rules)
        if why == 'default':
            unmatched += 1
        prod['weightKg'] = round(kg * cushion, 2)
        prod['weightEstimated'] = True
        changed += 1
        prod.pop('_department', None)

    # clean temp keys on untouched products too
    for prod in iter_products(data):
        prod.pop('_department', None)

    print(f'{catalog_path}: +{changed} estimated, {skipped_real} real kept, {unmatched} fell to default',
          file=sys.stderr)
    if dry_run:
        return
    out = json.dumps(data, ensure_ascii=False)
    if in_place:
        with open(catalog_path, 'w') as f:
            f.write(out)
    else:
        print(out)

if __name__ == '__main__':
    main()
