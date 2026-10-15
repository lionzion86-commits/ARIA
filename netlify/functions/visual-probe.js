// TEMPORARY diagnostic probe for the visual-search function hang.
// Steps the cold-start sequence one stage at a time. DELETE BEFORE MERGE.
import { existsSync, writeFileSync, statSync, mkdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MODEL_PATH = "/tmp/clip-image-int8.onnx";
const MODEL_BYTES = 88997913;
const MODEL_PARTS = [1, 2, 3, 4].map((i) => `visual-index/model/clip-image-int8.onnx.part${i}`);
const RUNTIME_DIR = "/tmp/vs-runtime";
const RUNTIME_FILES = ["ort.wasm.bundle.min.mjs", "ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];

function origin() {
  return (process.env.DEPLOY_PRIME_URL || process.env.URL || "https://ariashop.pe").replace(/\/$/, "");
}
const json = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });

export const handler = async (event) => {
  const step = (event.queryStringParameters || {}).step || "ping";
  const t0 = Date.now();
  const marks = { origin: origin(), step };
  try {
    if (step === "ping") return json(200, { ...marks, ms: Date.now() - t0 });
    // step >= ort
    mkdirSync(RUNTIME_DIR, { recursive: true });
    for (const f of RUNTIME_FILES) {
      const p = `${RUNTIME_DIR}/${f}`;
      if (!existsSync(p) || statSync(p).size === 0) {
        const res = await fetch(`${origin()}/visual-index/runtime/${f}`);
        if (!res.ok) throw new Error(`runtime ${f} ${res.status}`);
        writeFileSync(p, Buffer.from(await res.arrayBuffer()));
      }
    }
    marks.ortFilesMs = Date.now() - t0;
    const ort = await import(pathToFileURL(`${RUNTIME_DIR}/ort.wasm.bundle.min.mjs`).href);
    ort.env.wasm.wasmPaths = `${RUNTIME_DIR}/`;
    ort.env.wasm.numThreads = 1;
    marks.ortImportMs = Date.now() - t0;
    if (step === "ort") return json(200, { ...marks, ms: Date.now() - t0 });
    // step >= model
    if (!existsSync(MODEL_PATH) || statSync(MODEL_PATH).size !== MODEL_BYTES) {
      const chunks = [];
      for (const part of MODEL_PARTS) {
        const res = await fetch(`${origin()}/${part}`);
        if (!res.ok) throw new Error(`model part ${res.status}`);
        chunks.push(Buffer.from(await res.arrayBuffer()));
      }
      const joined = Buffer.concat(chunks);
      if (joined.length !== MODEL_BYTES) throw new Error("model size mismatch");
      writeFileSync(MODEL_PATH, joined);
    }
    marks.modelMs = Date.now() - t0;
    if (step === "model") return json(200, { ...marks, ms: Date.now() - t0 });
    // step >= session
    const session = await ort.InferenceSession.create(readFileSync(MODEL_PATH));
    marks.sessionMs = Date.now() - t0;
    marks.inputs = session.inputNames;
    if (step === "session") return json(200, { ...marks, ms: Date.now() - t0 });
    // step == run: fixed dummy tensor
    const px = new Float32Array(3 * 224 * 224).fill(0.5);
    const out = await session.run({ pixels: new ort.Tensor("float32", px, [1, 3, 224, 224]) });
    marks.runMs = Date.now() - t0;
    marks.outDims = out.embedding.data.length;
    return json(200, { ...marks, ms: Date.now() - t0 });
  } catch (e) {
    return json(500, { ...marks, error: String(e).slice(0, 300), ms: Date.now() - t0 });
  }
};
