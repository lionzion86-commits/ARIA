#!/usr/bin/env python3
"""Build the visual-search index shards from embeddings.
Usage: build-shards.py <ids.json> <vectors.npy> <pool.json> <outdir> <version>
Emits into <outdir>: manifest.json + shard-NNN.bin (int8-quantized vectors)
+ shard-NNN.json (card metadata aligned by row). The function fetches the
manifest, scores shard centroids, and searches only the closest shards.
Run after embed-catalog.py on every catalog refresh."""
import sys, os, json, base64
import numpy as np

IDS_F, VEC_F, POOL_F, OUT, VERSION = sys.argv[1:6]
SHARD_SIZE = 12000
ids = json.load(open(IDS_F))
V = np.load(VEC_F).astype(np.float32)
pool = {i['id']: i for i in json.load(open(POOL_F))}
assert len(ids) == V.shape[0], (len(ids), V.shape)
os.makedirs(OUT, exist_ok=True)

META_FIELDS = ['id', 'title', 'brand', 'retailer', 'price', 'dutiableUsd', 'originalPrice',
               'onSale', 'weightKg', 'image', 'sizes']
shards = []
for s in range(0, len(ids), SHARD_SIZE):
    chunk_ids = ids[s:s + SHARD_SIZE]
    chunk = V[s:s + len(chunk_ids)]
    q = np.clip(np.round(chunk * 127), -127, 127).astype(np.int8)
    name = f'shard-{len(shards):03d}'
    q.tofile(os.path.join(OUT, f'{name}.bin'))
    meta = []
    for iid in chunk_ids:
        p = pool[iid]
        meta.append({k: p.get(k) for k in META_FIELDS})
    json.dump(meta, open(os.path.join(OUT, f'{name}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    centroid = chunk.mean(axis=0)
    centroid = centroid / np.linalg.norm(centroid)
    shards.append({'bin': f'{name}.bin', 'meta': f'{name}.json', 'count': len(chunk_ids),
                   'centroid': base64.b64encode(centroid.astype(np.float32).tobytes()).decode()})
    print(f'{name}: {len(chunk_ids)} items')

manifest = {'version': VERSION, 'model': 'openai-clip-vit-b-32', 'dim': int(V.shape[1]),
            'quant': 'int8x127', 'total': len(ids), 'shards': shards}
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'))
total_bytes = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f'manifest: {len(ids)} items, {len(shards)} shards, index size {total_bytes/1e6:.1f} MB')
