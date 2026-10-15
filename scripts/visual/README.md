# Visual search (búsqueda por foto)

A shopper photographs a product; Aria returns the closest items from
its own catalogue. Danny's directive 2026-09-27; ingest rule
2026-09-28 ("embed at ingest so Phase 2 never re-processes the
catalogue"); built 2026-10-15.

## Pieces

- **Model**: OpenAI CLIP ViT-B/32 image encoder (512-d), exported to
  ONNX with the mean/std normalization baked into the graph, dynamic
  int8 quantization. Source checkpoint `ViT-B-32.pt`, sha256
  `40d365715913c9da98579312b702a82c18be219cc2a73407c4526f58eba950af`
  (OpenAI's published hash). The exported model is committed at
  `visual-index/model/clip-image-int8.onnx` and served as a static
  file; the function downloads it once per warm container.
- **Index**: `visual-index/manifest.json` + `shard-NNN.bin` /
  `shard-NNN.json`. Vectors are the pool's product photos embedded
  with the same model, L2-normalized, quantized to int8 (x127).
  Shards hold ~12,000 products; the manifest carries each shard's
  centroid so a query only searches the closest shards. Metadata
  rows carry exactly the fields the card renderers consume.
- **Function**: `netlify/functions/visual-search.js` — POST
  `{image: base64}` -> embed -> centroid routing -> shard search ->
  top 24 card objects. The photo is processed in memory only and
  never stored.
- **Client**: `openVisualSearch` / `runVisualSearch` /
  `showVisualResults` in the app bundle; photo buttons in the
  assistant composer and the search bars; results render through
  `addAssistantProductCard` (assistant) and `productCardHTML`
  (search), so prices and the size gate are the shop's own.

## Refresh pipeline (run after every catalog pull)

```sh
node scripts/visual/dump-pool.mjs            # visual-pool.json (gitignored)
python3 scripts/visual/embed-catalog.py \
  --pool visual-pool.json \
  --model visual-index/model/clip-image-int8.onnx \
  --out visual-embeddings/                   # resumable; skips embedded ids
python3 scripts/visual/build-shards.py \
  visual-embeddings/ids.json visual-embeddings/vectors.npy \
  visual-pool.json visual-index/ <version>
node scripts/test/visual-search-tests.mjs    # index integrity gate
```

The catalog pull pipeline lives outside this repo; plug the three
commands above into its post-pull step — that is what makes new
products searchable by photo from the day they land (the 2026-09-28
rule). Until then, re-running them by hand after a pull is enough.

Python deps for the pipeline: `onnxruntime requests pillow numpy`.
Node deps for the function: `jpeg-js pngjs` only. Inference runs on the WASM build of onnxruntime, committed as static files under `visual-index/runtime/` and downloaded by the function at cold start — the native onnxruntime-node package (~288MB installed) cannot ship in a Netlify function bundle.
(root package.json).
