#!/usr/bin/env python3
"""Embed catalogue product photos with the CLIP image encoder.

This is the ingest half of Danny's 2026-09-28 rule ("store a CLIP
embedding for every product at ingest"): run it after every catalog
refresh, before build-shards.py. It is RESUMABLE — ids already in
the output are skipped, and failed downloads are retried on the
next run — and it uses the exact quantized ONNX model the
visual-search function serves with, so catalogue vectors and query
vectors live in the same space by construction.

Requires: onnxruntime, requests, pillow, numpy (pip).
Usage:
  python3 scripts/visual/embed-catalog.py \
      --pool visual-pool.json \
      --model visual-index/model/clip-image-int8.onnx \
      --out visual-embeddings/
Input pool: [{id, image, ...}] (see dump-pool.mjs). Items without an
image URL are skipped. Output: ids.json + vectors.npy (float32,
L2-normalized, row-aligned) + failures.json, all in --out.
Priority: pass the pool pre-sorted (e.g. on-sale first) and the run
covers the most valuable products first if interrupted."""
import argparse, io, json, os, time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
from PIL import Image


def save_state(ids_path, ids, vec_path, vecs, fail_path, failures):
    tmp = ids_path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(ids, f)
    os.replace(tmp, ids_path)
    np.save(vec_path, np.array(vecs, dtype=np.float32))
    tmp = fail_path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(failures, f)
    os.replace(tmp, fail_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--batch", type=int, default=64)
    args = ap.parse_args()

    import onnxruntime as ort
    sess = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])

    os.makedirs(args.out, exist_ok=True)
    ids_f = os.path.join(args.out, "ids.json")
    vec_f = os.path.join(args.out, "vectors.npy")
    fail_f = os.path.join(args.out, "failures.json")
    items = json.load(open(args.pool))
    done = json.load(open(ids_f)) if os.path.exists(ids_f) else []
    done_set = set(done)
    todo = [it for it in items if it.get("image") and it["id"] not in done_set]
    print(f"pool={len(items)} done={len(done)} todo={len(todo)}", flush=True)
    if not todo:
        print("nothing to do")
        return

    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

    def fetch(it):
        try:
            r = requests.get(it["image"], headers=headers, timeout=25)
            if r.status_code != 200 or len(r.content) < 800:
                return it["id"], None
            im = Image.open(io.BytesIO(r.content)).convert("RGB")
            # CLIP geometry: shorter side -> 224 (bicubic), center crop.
            w, h = im.size
            side = min(w, h)
            im = im.resize((round(224 * w / side), round(224 * h / side)), Image.BICUBIC)
            w, h = im.size
            x, y = (w - 224) // 2, (h - 224) // 2
            im = im.crop((x, y, x + 224, y + 224))
            arr = np.asarray(im, dtype=np.float32).transpose(2, 0, 1) / 255.0
            return it["id"], arr
        except Exception:
            return it["id"], None

    vecs = np.load(vec_f).tolist() if os.path.exists(vec_f) else []
    failures = json.load(open(fail_f)) if os.path.exists(fail_f) else []
    t0 = time.time()
    processed = 0
    with ThreadPoolExecutor(max_workers=10) as ex:
        for s in range(0, len(todo), args.batch):
            chunk = todo[s:s + args.batch]
            results = list(ex.map(fetch, chunk))
            ok = [(i, a) for i, a in results if a is not None]
            for i, a in results:
                if a is None and i not in failures:
                    failures.append(i)
            if ok:
                batch = np.stack([a for _, a in ok])
                emb = sess.run(None, {"pixels": batch})[0]
                for (iid, _), v in zip(ok, emb):
                    done.append(iid)
                    vecs.append(v.astype(np.float32))
            processed += len(chunk)
            save_state(ids_f, done, vec_f, vecs, fail_f, failures)
            rate = processed / max(1.0, time.time() - t0)
            print(f"{processed}/{len(todo)} embedded_total={len(done)} failed={len(failures)} rate={rate:.2f}/s", flush=True)
    print(f"DONE embedded={len(done)} failed={len(failures)}")


if __name__ == "__main__":
    main()
