// OCR backend for the image-price scan (tesseract.js).
//
// Kept separate from price-text-detector.js so that module stays
// dependency-free and trivially testable; only the scripts that actually
// scan images pay for tesseract.js.
//
// Install once, at the repo root:
//   npm install --no-save tesseract.js @tesseract.js-data/eng sharp
//
// Language data is resolved from the @tesseract.js-data/eng package rather
// than downloaded at runtime, so a scan works with no access to the
// tesseract CDN and never re-downloads per run.
//
// WHY THIS TILES THE IMAGE
// Measured behaviour, not a guess. Given a 600x600 product shot with a
// 252x96 white-on-red "129.99" badge in the corner:
//
//   full image, any page-seg mode, any preprocessing  -> "" (nothing)
//   the same badge cropped out on its own             -> "129.99"
//   the same badge in black-on-white, same position   -> "129.99"
//
// So Tesseract's layout analysis discards a small saturated block inside a
// larger frame. Price badges are almost always exactly that, and almost
// always in a corner — so the image is scanned whole first and then as
// overlapping corner tiles, which makes the badge text-dominant and
// readable. Both polarities are tried because sale badges are usually
// light text on a saturated background, which grayscale flattens.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function resolveLangPath() {
  const pkg = path.dirname(require.resolve("@tesseract.js-data/eng/package.json"));
  for (const dir of fs.readdirSync(pkg)) {
    const candidate = path.join(pkg, dir);
    if (fs.existsSync(path.join(candidate, "eng.traineddata.gz"))) return candidate;
  }
  throw new Error("eng.traineddata.gz not found in @tesseract.js-data/eng");
}

// Whole image, then four corner tiles at 55% per side (10% overlap so a
// badge straddling the midline is not cut in half).
const TILES = [
  { name: "full", left: 0, top: 0, w: 1, h: 1 },
  { name: "tl", left: 0, top: 0, w: 0.55, h: 0.55 },
  { name: "tr", left: 0.45, top: 0, w: 0.55, h: 0.55 },
  { name: "bl", left: 0, top: 0.45, w: 0.55, h: 0.55 },
  { name: "br", left: 0.45, top: 0.45, w: 0.55, h: 0.55 },
];

const INSTALL_HINT =
  "OCR dependencies are not installed. From the repo root run:\n" +
  "  npm install --no-save tesseract.js @tesseract.js-data/eng sharp\n" +
  "They are deliberately kept out of package.json so Netlify never bundles\n" +
  "them — nothing at runtime needs OCR, only these offline scripts do.";

export async function createOcr({ langPath } = {}) {
  let createWorker, sharp, resolved;
  try {
    ({ createWorker } = await import("tesseract.js"));
    sharp = (await import("sharp")).default;
    resolved = langPath || resolveLangPath();
  } catch (err) {
    throw new Error(`${INSTALL_HINT}\n\nOriginal error: ${err.message}`);
  }

  const worker = await createWorker("eng", 1, {
    langPath: resolved,
    cachePath: resolved,
    gzip: true,
    logger: () => {},
    errorHandler: () => {},
  });

  async function renderTile(buffer, meta, tile, invert) {
    let img = sharp(buffer).flatten({ background: "#ffffff" }); // transparent PNGs otherwise OCR as black-on-black
    if (tile.w < 1 || tile.h < 1) {
      const left = Math.floor(meta.width * tile.left);
      const top = Math.floor(meta.height * tile.top);
      const width = Math.max(8, Math.min(Math.ceil(meta.width * tile.w), meta.width - left));
      const height = Math.max(8, Math.min(Math.ceil(meta.height * tile.h), meta.height - top));
      img = img.extract({ left, top, width, height });
    }
    img = img.resize({ width: 900, withoutEnlargement: false, fit: "inside" }).grayscale();
    if (invert) img = img.negate();
    return img.png().toBuffer();
  }

  /**
   * Scans an image for price text.
   *
   * `containsPriceText` is injected so the pure detector stays the single
   * source of truth for what counts as a price. Stops at the first tile
   * that finds one, so a dirty image is cheap; a clean image pays for the
   * full sweep, which is the right way round for an offline batch job.
   *
   * @returns {{hasPrice:boolean, matches:string[], text:string, ok:boolean, where?:string}}
   *   ok=false means OCR could not read the image at all. That is NOT the
   *   same as "clean" and callers must not treat it as such.
   */
  async function scanImageForPriceText(buffer, containsPriceText) {
    let meta;
    try {
      meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height) throw new Error("no dimensions");
    } catch (err) {
      return { hasPrice: false, matches: [], text: "", ok: false, error: err.message };
    }

    const collected = [];
    let anyRead = false;
    for (const tile of TILES) {
      for (const invert of [false, true]) {
        let text = "";
        try {
          const { data } = await worker.recognize(await renderTile(buffer, meta, tile, invert));
          text = data.text || "";
        } catch {
          continue; // one tile/polarity failing is not fatal
        }
        anyRead = true;
        if (!text.trim()) continue;
        collected.push(text);
        const verdict = containsPriceText(text);
        if (verdict.hasPrice) {
          return { hasPrice: true, matches: verdict.matches, text: collected.join("\n"), ok: true, where: `${tile.name}${invert ? "-inv" : ""}` };
        }
      }
    }
    // Nothing readable anywhere is suspicious rather than clean: a decode
    // failure and a genuinely textless photo are indistinguishable here, so
    // ok reflects whether any pass actually ran.
    return { hasPrice: false, matches: [], text: collected.join("\n"), ok: anyRead };
  }

  return { scanImageForPriceText, close: () => worker.terminate() };
}
