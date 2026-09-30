#!/usr/bin/env python3
"""Translate English product descriptions to Spanish using local argos model.

Fallback for scripts/translate-catalog-descriptions.mjs when GROQ_API_KEY
is unavailable. Same walk + English-detection heuristic; translates with
argostranslate (en->es, ctranslate2, fully offline).

Usage:
  ~/workspace/.venvs/mt/bin/python scripts/translate-en-es-local.py <file.json> [...]
  ~/workspace/.venvs/mt/bin/python scripts/translate-en-es-local.py --all
  ~/workspace/.venvs/mt/bin/python scripts/translate-en-es-local.py --dry-run --all

Writes back compact JSON (the served format). Reports counts.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    if '--all' in args:
        files = sorted(f for f in os.listdir(ROOT) if f.endswith('-catalog.json'))
        files = [os.path.join(ROOT, f) for f in files]
    else:
        files = [a for a in args if not a.startswith('--')]
    if not files:
        print(__doc__); sys.exit(2)

    translate = None
    if not dry_run:
        from argostranslate import translate as at
        installed = at.get_installed_languages()
        en = next((l for l in installed if l.code == 'en'), None)
        es = next((l for l in installed if l.code == 'es'), None)
        if not en or not es:
            print('FATAL: en->es package not installed. Run: argospm install translate-en_es', file=sys.stderr)
            sys.exit(1)
        tr = en.get_translation(es)
        translate = tr.translate

    total_found = 0
    total_done = 0
    for path in files:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        targets = [it for it in walk_items(data)
                   if isinstance(it.get('description'), str)
                   and len(it['description'].strip()) >= 12
                   and is_english(it['description'])]
        print(f'{os.path.basename(path)}: {len(targets)} English descriptions', flush=True)
        total_found += len(targets)
        if dry_run or not targets:
            continue
        BATCH = 32
        for i in range(0, len(targets), BATCH):
            sl = targets[i:i+BATCH]
            # translate one by one (ctranslate2 handles batching internally per call)
            for it in sl:
                src = it['description'].strip()
                try:
                    it['description'] = translate(src)
                except Exception as e:
                    print(f'  WARN: translation failed, keeping original: {e}', file=sys.stderr)
                total_done += 1
            print(f'  {min(i+BATCH, len(targets))}/{len(targets)}', flush=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        print(f'  wrote {os.path.basename(path)}')
    print(f'done: {total_done}/{total_found} translated' + (' (dry run)' if dry_run else ''))

main()
