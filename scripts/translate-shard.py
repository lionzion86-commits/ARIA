#!/usr/bin/env python3
"""Shard worker: translate rows [start:end) of the work JSONL file.

Pipeline per description:
  1. HTML-unescape entities (&quot; etc.)
  2. Protect brand name with a placeholder (restored after)
  3. Glossary pre-replacements for known-bad MT terms
  4. argos en->es (MiniSBD), restore brand placeholder

Usage: translate-shard.py <start> <end> <out_jsonl>
"""
import html as ihtml
import json
import re
import sys

GLOSSARY = [
    ("body wash", "gel de ducha"),
    ("sports gear", "equipo deportivo"),
    ("skincare", "cuidado de la piel"),
    ("skin care", "cuidado de la piel"),
]
PLACEHOLDER = "Xyzbrand"

def build_translator():
    from argostranslate import translate, settings
    settings.chunk_type = settings.ChunkType.MINISBD
    langs = translate.get_installed_languages()
    en = next(l for l in langs if l.code == 'en')
    es = next(l for l in langs if l.code == 'es')
    return en.get_translation(es).translate

def safe_translate(tr, text, brand=None):
    t = ihtml.unescape(text)
    t = re.sub(r'\s+', ' ', t).strip()
    if brand and len(brand) >= 2:
        t = re.sub(re.escape(brand), PLACEHOLDER, t, flags=re.IGNORECASE)
    for en_term, es_term in GLOSSARY:
        t = re.sub(r'\b' + re.escape(en_term) + r'\b', es_term, t, flags=re.IGNORECASE)
    out = tr(t)
    if brand and len(brand) >= 2:
        out = re.sub(re.escape(PLACEHOLDER), brand, out, flags=re.IGNORECASE)
    return out

def main():
    start, end, out_path = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    tr = build_translator()
    with open('/home/hatch/workspace/goals/ariashop-pe-site-build/hidden_files/desc-translate-work.jsonl') as f:
        rows = f.readlines()
    shard = rows[start:end]
    done = 0
    with open(out_path, 'w', encoding='utf-8') as out:
        for line in shard:
            w = json.loads(line)
            try:
                es_text = safe_translate(tr, w['en'], w.get('brand'))
            except Exception as e:
                es_text = w['en']
                print(f'WARN fail: {e}', file=sys.stderr)
            out.write(json.dumps({'file': w['file'], 'key': w['key'], 'es': es_text},
                                 ensure_ascii=False) + '\n')
            done += 1
            if done % 250 == 0:
                print(f'shard [{start}:{end}]: {done}/{len(shard)}', flush=True)
    print(f'shard [{start}:{end}] DONE: {done}')

main()
