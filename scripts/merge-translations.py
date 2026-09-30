#!/usr/bin/env python3
"""Merge translated descriptions back into catalog JSON files.

Reads translation records from:
  - desc-es-done.jsonl (first pass)
  - desc-es-shardA.jsonl, desc-es-shardB.jsonl (second pass)
Matches on (file, key). Writes back compact JSON per catalog file.
Reports per-file translated counts.
"""
import json
import os
import re

HIDDEN = '/home/hatch/workspace/goals/ariashop-pe-site-build/hidden_files'
ROOT = '/home/hatch/workspace/aria-desc-es'

EN_CORE = set(("the and for with from that this these those they their them there "
    "then than which when will would your you are was were been has have had not but all any each every "
    "more most other some such only just about into over after before between through during very made make "
    "many much get new used using design designed crafted built featuring features includes including provides "
    "perfect ideal great ultimate premium quality comfort comfortable durable lightweight soft breathable "
    "stylish versatile collection").split())
ES_CORE = set(("el la los las un una unos unas de del en y con por para como muy sin sobre entre hasta desde "
    "donde cuando este esta estos estas ese esa esos esas son estan fue fueron han tiene tienen sus nuestro "
    "nuestra pero porque tambien todo toda todos todas hay ser estar").split())

def is_english(s):
    words = [w for w in re.findall(r'[a-z]+', s.lower()) if len(w) > 1]
    if len(words) < 3:
        return False
    en = sum(1 for w in words if w in EN_CORE)
    es = sum(1 for w in words if w in ES_CORE)
    return en >= 2 and en > es * 2

def walk_items(obj):
    if isinstance(obj, list):
        for v in obj:
            yield from walk_items(v)
        return
    if isinstance(obj, dict):
        if isinstance(obj.get('items'), list):
            for it in obj['items']:
                if isinstance(it, dict):
                    yield it
        for v in obj.values():
            yield from walk_items(v)

def main():
    # load all translations
    trans = {}
    for name in ['desc-es-done.jsonl', 'desc-es-shardA.jsonl', 'desc-es-shardB.jsonl',
                 'desc-es-fastA.jsonl', 'desc-es-fastB.jsonl',
                 'desc-es-fastC.jsonl', 'desc-es-fastD.jsonl']:
        p = os.path.join(HIDDEN, name)
        if not os.path.exists(p):
            print(f'skip missing {name}')
            continue
        n = 0
        with open(p, encoding='utf-8') as f:
            for line in f:
                w = json.loads(line)
                trans[(w['file'], w['key'])] = w['es']
                n += 1
        print(f'loaded {n} from {name}')
    print(f'total translations: {len(trans)}')

    # group files
    files = sorted(set(f for f, _ in trans.keys()))
    grand = 0
    for fname in files:
        path = os.path.join(ROOT, fname)
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        count = 0
        for it in walk_items(data):
            d = it.get('description')
            if not (isinstance(d, str) and len(d.strip()) >= 12 and is_english(d)):
                continue
            key = it.get('url') or it.get('title') or it.get('name')
            es = trans.get((fname, key))
            if es:
                it['description'] = es
                count += 1
        if count:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        print(f'{fname}: {count} applied')
        grand += count
    print(f'MERGE DONE: {grand} descriptions updated')

main()
