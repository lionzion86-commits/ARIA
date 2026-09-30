#!/usr/bin/env python3
"""Fast shard worker: direct ctranslate2 with batching (no argos overhead).

Usage: translate-fast.py <start> <end> <out_jsonl>
Pre: HTML-unescape, brand placeholder, glossary. Batch 32 via translate_batch.
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
BATCH = 32
PKG = '/home/hatch/.local/share/argos-translate/packages/en_es'

def preprocess(text, brand):
    t = ihtml.unescape(text)
    t = re.sub(r'\s+', ' ', t).strip()
    if brand and len(brand) >= 2:
        t = re.sub(re.escape(brand), PLACEHOLDER, t, flags=re.IGNORECASE)
    for en_term, es_term in GLOSSARY:
        t = re.sub(r'\b' + re.escape(en_term) + r'\b', es_term, t, flags=re.IGNORECASE)
    return t

def postprocess(out, brand):
    if brand and len(brand) >= 2:
        out = re.sub(re.escape(PLACEHOLDER), brand, out, flags=re.IGNORECASE)
    return out

def main():
    start, end, out_path = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    import ctranslate2, sentencepiece as spm
    sp = spm.SentencePieceProcessor()
    sp.load(PKG + '/sentencepiece.model')
    tr = ctranslate2.Translator(PKG + '/model', inter_threads=1, intra_threads=1)

    with open('/home/hatch/workspace/goals/ariashop-pe-site-build/hidden_files/desc-translate-work.jsonl') as f:
        rows = f.readlines()
    shard = [json.loads(l) for l in rows[start:end]]
    done = 0
    with open(out_path, 'w', encoding='utf-8') as out:
        for i in range(0, len(shard), BATCH):
            sl = shard[i:i+BATCH]
            pre = [preprocess(w['en'], w.get('brand')) for w in sl]
            toks = [sp.encode(t, out_type=str) for t in pre]
            try:
                res = tr.translate_batch(toks)
                es_list = [sp.decode(r.hypotheses[0]) for r in res]
            except Exception as e:
                print(f'WARN batch fail: {e}', file=sys.stderr)
                es_list = [w['en'] for w in sl]
            for w, es in zip(sl, es_list):
                es = postprocess(es, w.get('brand'))
                out.write(json.dumps({'file': w['file'], 'key': w['key'], 'es': es},
                                     ensure_ascii=False) + '\n')
                done += 1
            print(f'shard [{start}:{end}]: {done}/{len(shard)}', flush=True)
    print(f'shard [{start}:{end}] DONE: {done}')

main()
