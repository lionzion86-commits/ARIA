/* ============================================================
   A PNG, far enough decoded to answer one question: how much of this
   file is actually the logo?

   WHY THIS EXISTS (2026-09-22). logos/ssense.png was a valid 29,954-byte
   PNG, correctly wired, correctly referenced, and it rendered as what
   Danny called "plain styled text". The file was 2501x250 and the
   wordmark occupied the middle 685x146 of it -- 84% of the asset was
   empty white. object-fit: contain fits the CANVAS, so the letters came
   out a sixth of the size every other mark got, and no amount of CSS
   could have fixed it.

   Nothing in the pipeline could see that. The file exists, it decodes,
   it has a sane aspect ratio on paper. The only way to catch it is to
   look at the pixels, so that is what this does: inflate the IDAT,
   un-filter the scanlines, and measure the bounding box of everything
   that differs from the corner colour.

   Stdlib only (node:zlib), 8-bit non-interlaced, greyscale/RGB/palette/
   RGBA -- which is every logo in this repo. Anything else reports
   `unsupported` rather than guessing, and the test says so out loud
   instead of passing quietly.
   ============================================================ */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
export function inkCoverage(path) {
  const buf = readFileSync(path);
  if (buf.subarray(0, 8).toString("binary") !== "\x89PNG\r\n\x1a\n") return null;
  let i = 8, ihdr = null, idat = [], plte = null, trns = null;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), typ = buf.subarray(i + 4, i + 8).toString("ascii");
    const body = buf.subarray(i + 8, i + 8 + len);
    if (typ === "IHDR") ihdr = { w: body.readUInt32BE(0), h: body.readUInt32BE(4), depth: body[8], ctype: body[9], interlace: body[12] };
    else if (typ === "IDAT") idat.push(body);
    else if (typ === "PLTE") plte = body;
    else if (typ === "tRNS") trns = body;
    i += 12 + len;
  }
  const { w, h, depth, ctype, interlace } = ihdr;
  if (depth !== 8 || interlace !== 0) return { w, h, unsupported: `depth=${depth} interlace=${interlace}` };
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch) return { w, h, unsupported: `ctype=${ctype}` };
  const data = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  let pos = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = data[pos++];
    const line = Buffer.from(data.subarray(pos, pos + stride)); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(px, y * stride); prev = line;
  }
  const rgba = (o) => {
    if (ctype === 3) { const idx = px[o]; return [plte[idx*3], plte[idx*3+1], plte[idx*3+2], trns && idx < trns.length ? trns[idx] : 255]; }
    if (ctype === 0) return [px[o], px[o], px[o], 255];
    if (ctype === 4) return [px[o], px[o], px[o], px[o+1]];
    if (ctype === 2) return [px[o], px[o+1], px[o+2], 255];
    return [px[o], px[o+1], px[o+2], px[o+3]];
  };
  /* WHAT COUNTS AS BACKGROUND, and the transparent case is not the
     opaque one (2026-09-22). This read the top-left corner and called
     anything matching it background. On a flat-white file that is
     right. On a TRANSPARENT one it is badly wrong: the corner decodes
     as (0,0,0,0), so the reference RGB is black, and every black
     letterform matches it and is skipped — a correctly-cropped logo
     reports 0% ink and fails the coverage floor it was written to pass.
     Caught on the first transparent PNG to arrive (Golden Goose), which
     would have blocked a whole batch of clean files.

     So transparency decides first. When the corner is transparent the
     mark IS the opaque pixels, whatever colour they are; only when the
     corner is opaque does its colour become the background to subtract. */
  const corner = rgba(0);
  const bgIsTransparent = corner[3] < 8;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = rgba(y * stride + x * ch);
    if (p[3] < 8) continue;                       // see-through is never ink
    if (!bgIsTransparent &&
        Math.max(Math.abs(p[0]-corner[0]), Math.abs(p[1]-corner[1]), Math.abs(p[2]-corner[2])) <= 12) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { w, h, inkW: 0, inkH: 0, coverage: 0, inkAspect: 0, aspect: w / h, blank: true };
  const inkW = x1 - x0 + 1, inkH = y1 - y0 + 1;
  return { w, h, inkW, inkH, coverage: (inkW * inkH) / (w * h), inkAspect: inkW / inkH,
           aspect: w / h, transparent: bgIsTransparent };
}

/* ============================================================
   THE ALPHA SIDE OF THE SAME FILE.

   inkCoverage() answers "where is the artwork in this canvas" by
   COLOUR, against the corner pixel. A logo on transparency needs the
   other question answered: how much of it is opaque, and does its edge
   carry any antialiasing at all.

   WHY IT EXISTS (2026-09-23). aria-mark-transparent.png was pulled from
   the header with a note calling it "a soft glow". Measured, it was
   something else: a hard 1-bit mask -- 5.6% opaque, 94.4% clear and
   ZERO pixels in between -- whose ink filled 259x305 of a 658x439
   canvas. object-contain fits the canvas, so it drew a third of the
   size it should have, with jagged edges. Neither fault is visible to a
   colour-based bounding box: both live in the alpha channel.
   ============================================================ */
export function pngShape(path) {
  const cov = inkCoverage(path);
  if (!cov || cov.unsupported) return { width: 0, height: 0, alpha: { ink: 0, soft: 0, clear: 0 }, unsupported: cov?.unsupported };
  const buf = readFileSync(path);
  let i = 8, ihdr = null, idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), typ = buf.subarray(i + 4, i + 8).toString("ascii");
    const body = buf.subarray(i + 8, i + 8 + len);
    if (typ === "IHDR") ihdr = { w: body.readUInt32BE(0), h: body.readUInt32BE(4), depth: body[8], ctype: body[9] };
    else if (typ === "IDAT") idat.push(body);
    i += 12 + len;
  }
  const { w, h, ctype } = ihdr;
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const data = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  let pos = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = data[pos++];
    const line = Buffer.from(data.subarray(pos, pos + stride)); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(px, y * stride); prev = line;
  }
  // Alpha lives in the last channel, and only for ctype 4 and 6.
  let ink = 0, soft = 0, clear = 0;
  const hasAlpha = ctype === 4 || ctype === 6;
  for (let o = 0; o < px.length; o += ch) {
    const a = hasAlpha ? px[o + ch - 1] : 255;
    if (a === 0) clear++; else if (a === 255) ink++; else soft++;
  }
  /* `ink` counts the fully opaque pixels; `soft` is the antialiased
     edge, which a hard mask has none of; `clear` is the rest. */
  return { width: w, height: h, aspect: w / h, alpha: { ink, soft, clear }, cov };
}
