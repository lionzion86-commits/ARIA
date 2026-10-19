#!/usr/bin/env python3
"""Pull-time photo-index step: index the products a catalog pull just
added, so every new product is searchable by photo from the day it
lands. This wires Danny's 2026-09-28 rule ("store a CLIP embedding
for every product at ingest") into the catalog pipeline; until
2026-10-18 the index refresh was a manual, forgettable chore and
whole stores (BoxLunch, Hot Topic, Best Buy) sat unindexed.

TRIGGER — run at the END of every catalog pull, after the pull has
written the new catalogue JSONs into the repo and before (or as part
of) the commit that publishes them. The pull pipeline calls:

    python3 scripts/visual/index-new-products.py

It is safe to run by hand at any time and safe to re-run: with no
new products it exits 0 having changed nothing.

WHAT IT DOES
  1. Dumps the current pool (scripts/visual/dump-pool.mjs).
  2. Reads visual-index/manifest.json + shard metas -> the set of
     product ids already indexed.
  3. Embeds ONLY pool products that have an image and are not yet
     indexed, reusing scripts/visual/embed-catalog.py into the
     persistent state dir visual-embeddings/ (resumable; products
     whose image URLs fail stay unindexed and are retried on the
     next run — they never enter the indexed set).
  4. APPENDS new shards (12,000 products each, continuing the
     shard-NNN sequence). Existing shard files are never rewritten.
  5. Swaps in an updated manifest.json (version bumped to
     v<YYYY-MM-DD>.<seq>) as the very last step.
  6. Writes a coverage state file (default
     visual-embeddings/index-state.json): indexed total, stale
     count (indexed ids no longer in the pool), and the sha256 of
     the sorted indexed-id set, so the next run — and any coverage
     audit — can verify exactly what the index holds.

FAILURE BEHAVIOR: new shards are staged under temporary names and
renamed into place only after every embedding succeeded; the
manifest swap is atomic and last. A crash anywhere leaves the
previously published index serving untouched.

SCOPE: append-only, by design. Products that LEAVE the catalogue
are counted as stale in the state file but not removed here;
removal is a deliberate full-rebuild decision, never a pull-time
side effect. Prices, catalogue filing and store sections are never
touched — this script writes only visual-index/ data + state.

Requires: node (for dump-pool.mjs) and the embed pipeline's python
deps (onnxruntime, requests, pillow, numpy).
"""
import argparse, base64, hashlib, json, os, subprocess, sys, time
from datetime import date

import numpy as np

SHARD_SIZE = 12000
META_FIELDS = ['id', 'title', 'brand', 'retailer', 'price', 'dutiableUsd',
               'originalPrice', 'onSale', 'weightKg', 'image', 'sizes']


def load_indexed(index_dir):
    """Return (manifest, {id: None} ordered set of indexed ids)."""
    man = json.load(open(os.path.join(index_dir, 'manifest.json')))
    indexed = {}
    for s in man['shards']:
        for row in json.load(open(os.path.join(index_dir, s['meta']))):
            indexed[row['id']] = None
    assert len(indexed) == man['total'], (len(indexed), man['total'])
    return man, indexed


def next_version(old):
    today = date.today().isoformat()
    if old and old.startswith('v' + today + '.'):
        try:
            return f"v{today}.{int(old.rsplit('.', 1)[1]) + 1}"
        except ValueError:
            pass
    return f"v{today}.1"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.',
                    help='repo root (default: current directory)')
    ap.add_argument('--state', default=None,
                    help='coverage state file (default: <repo>/visual-embeddings/index-state.json)')
    args = ap.parse_args()
    repo = os.path.abspath(args.repo)
    index_dir = os.path.join(repo, 'visual-index')
    emb_dir = os.path.join(repo, 'visual-embeddings')
    state_f = args.state or os.path.join(emb_dir, 'index-state.json')
    os.makedirs(emb_dir, exist_ok=True)

    # 1. Fresh pool, the same way the site assembles the catalogue.
    subprocess.run(['node', 'scripts/visual/dump-pool.mjs'], cwd=repo, check=True)
    pool = json.load(open(os.path.join(repo, 'visual-pool.json')))
    pool_by_id = {p['id']: p for p in pool}

    # 2. What is already indexed?
    man, indexed = load_indexed(index_dir)
    indexed_set = set(indexed)
    stale = indexed_set - set(pool_by_id)

    # 3. Embed only what is new (embed-catalog.py skips its own done set,
    #    so a crashed earlier run resumes instead of re-embedding).
    new_items = [p for p in pool if p.get('image') and p['id'] not in indexed_set]
    print(f"pool={len(pool)} indexed={len(indexed_set)} stale={len(stale)} new={len(new_items)}", flush=True)
    if new_items:
        # The committed model ships as 4 parts (a single 89MB file is
        # over the git API's blob limit — the search function joins
        # them at cold start the same way). Join them once into the
        # gitignored state dir for the embedder.
        model = os.path.join(repo, 'visual-index/model/clip-image-int8.onnx')
        if not os.path.exists(model):
            model = os.path.join(emb_dir, 'clip-image-int8.onnx')
            if not os.path.exists(model):
                parts = sorted(f for f in os.listdir(os.path.join(repo, 'visual-index/model'))
                               if f.startswith('clip-image-int8.onnx.part'))
                assert parts, 'model parts not found under visual-index/model/'
                with open(model, 'wb') as out:
                    for part in parts:
                        out.write(open(os.path.join(repo, 'visual-index/model', part), 'rb').read())
        new_pool_f = os.path.join(emb_dir, 'new-pool.json')
        json.dump(new_items, open(new_pool_f, 'w'))
        subprocess.run([sys.executable, 'scripts/visual/embed-catalog.py',
                        '--pool', new_pool_f,
                        '--model', model,
                        '--out', emb_dir], cwd=repo, check=True)

    # Candidates for appending: embedded, in the fresh pool with an image,
    # and not yet indexed — in pool order (the pool is sale-first).
    ids_f = os.path.join(emb_dir, 'ids.json')
    emb_ids = json.load(open(ids_f)) if os.path.exists(ids_f) else []
    emb_row = {iid: r for r, iid in enumerate(emb_ids)}
    todo = [p for p in pool
            if p.get('image') and p['id'] not in indexed_set and p['id'] in emb_row]
    failed = [p['id'] for p in new_items if p['id'] not in emb_row]

    new_entries = []
    if todo:
        V = np.load(os.path.join(emb_dir, 'vectors.npy')).astype(np.float32)
        first_new = len(man['shards'])
        staged = []
        for s in range(0, len(todo), SHARD_SIZE):
            chunk = todo[s:s + SHARD_SIZE]
            vecs = np.stack([V[emb_row[p['id']]] for p in chunk])
            q = np.clip(np.round(vecs * 127), -127, 127).astype(np.int8)
            name = f"shard-{first_new + len(staged):03d}"
            bin_tmp = os.path.join(index_dir, f'.{name}.bin.tmp')
            q.tofile(bin_tmp)
            meta = [{k: p.get(k) for k in META_FIELDS} for p in chunk]
            meta_tmp = os.path.join(index_dir, f'.{name}.json.tmp')
            json.dump(meta, open(meta_tmp, 'w'), ensure_ascii=False, separators=(',', ':'))
            centroid = vecs.mean(axis=0)
            centroid = centroid / np.linalg.norm(centroid)
            staged.append((bin_tmp, os.path.join(index_dir, f'{name}.bin'),
                           meta_tmp, os.path.join(index_dir, f'{name}.json')))
            new_entries.append({'bin': f'{name}.bin', 'meta': f'{name}.json',
                                'count': len(chunk),
                                'centroid': base64.b64encode(
                                    centroid.astype(np.float32).tobytes()).decode()})
            print(f'{name}: {len(chunk)} items', flush=True)
        # Publish: shards first, manifest last (atomic replace).
        for bt, bf, mt, mf in staged:
            os.replace(bt, bf)
            os.replace(mt, mf)
        man = {'version': next_version(man.get('version')), 'model': man['model'],
               'dim': man['dim'], 'quant': man['quant'],
               'total': man['total'] + len(todo),
               'shards': man['shards'] + new_entries}
        man_tmp = os.path.join(index_dir, '.manifest.json.tmp')
        json.dump(man, open(man_tmp, 'w'))
        os.replace(man_tmp, os.path.join(index_dir, 'manifest.json'))
        indexed_set |= {p['id'] for p in todo}

    # 6. Coverage state.
    state = {'version': man['version'], 'indexedTotal': len(indexed_set),
             'poolTotal': len(pool), 'staleCount': len(stale),
             'lastRunAdded': len(todo), 'lastRunImageFailures': len(failed),
             'indexedIdsSha256': hashlib.sha256(
                 '\n'.join(sorted(indexed_set)).encode()).hexdigest(),
             'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    tmp = state_f + '.tmp'
    json.dump(state, open(tmp, 'w'), indent=1)
    os.replace(tmp, state_f)
    print(f"state: {state}", flush=True)
    print(f"DONE indexed={len(indexed_set)} added={len(todo)} failed={len(failed)}")


if __name__ == '__main__':
    main()
