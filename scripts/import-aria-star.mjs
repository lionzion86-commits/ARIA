#!/usr/bin/env node
/* ==================================================================
   ARIA'S PLUSH STAR: THE IMPORT (#443 c.6647694000, Danny 2026-11-04).

   The star is four frames Lucifer delivers (same character, same pose):
   eyes open (idle), eyes closed (blink), talk1 (mouth open) and talk2
   (smile) -- c.6647694000 and the talking-star addendum c.6648427324. This script makes nothing new. It only
   RESIZES those two frames to the sizes the site's slots draw them at,
   checks the weight, and writes them where assets/js/aria-star.js
   will find them. Never feed it anything but the delivered frames: the
   identity (star silhouette, golden fur, big amber eyes) is in the
   art, and no frame here is drawn, generated or substituted.

     node scripts/import-aria-star.mjs --open <open.webp> --blink <blink.webp> --talk1 <talk1.webp> --talk2 <talk2.webp>
     node scripts/import-aria-star.mjs --check            (validate what is in the repo)

   Options
     --out <dir>        where the frames go (default assets/aria/star)
     --no-wire          only export + manifest; leave the pages and aria-star.js alone
     --backend <name>   sharp | pil | magick (default: the first one that exists)
     --check            validate assets/aria/star/manifest.json (exit 0 when no
                        manifest exists yet: the orb is still the face)
     --require          with --check: a missing manifest is a failure

   WHAT IT WRITES
     <out>/star-{open,blink,talk1,talk2}-240.<hash>.webp
         ONE on-screen size, 240px (the 80px corner launcher at 3x DPR).
         Every on-screen slot (the corner, her place at the top of the
         open chat, the face beside her messages, the "escribiendo" row)
         draws the SAME four files, so a visit downloads each frame once
         and the browser cache answers every other slot (the Mountain Test).
     <out>/favicon-16.png, favicon-32.png, favicon-48.png, favicon.ico
         from the open frame only.
     <out>/manifest.json
         files, dimensions and byte sizes, and which slot uses which.
     With wiring (the default):
       assets/js/aria-star.js   the manifest is stamped between its
                                ARIA-STAR-MANIFEST markers, so the page
                                never fetches the manifest (no extra request).
       index.html               the corner launcher's <img> point at the star's
                                frames (so the orb is not downloaded and then
                                thrown away), and the favicon link.
       terminos/privacidad/checkout.html, docs/mcp/index.html
                                their favicon link.
       favicon.ico (site root)  for every page with no icon link.

   HARD LIMITS (fail loudly, write nothing past the failure):
     - every frame at most 40 KB (40960 bytes)
     - launcher and chat frames at most 320 px
     - all four frames must be the same size (pixel-registered)
   ================================================================== */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve, relative, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUT = "assets/aria/star";
export const MAX_FRAME_BYTES = 40 * 1024;
export const MAX_CHAT_PX = 320;
/* The on-screen slots, with the CSS size each one draws the star at. One
   exported size covers all of them (the largest x 3 DPR), so the pair is
   downloaded once. */
export const SLOTS = {
  launcher: { css: 80, note: "the corner launcher, the whole character (index.html #assistantBtn, every other page #ariaLauncher)" },
  presence: { css: 64, note: "her place at the top of the open chat, beside «Asistente Aria», for the whole conversation" },
  avatar: { css: 24, note: "beside each of Aria's messages" },
  loader: { css: 20, note: "the «Aria está escribiendo…» row" },
};
export const SCREEN_SIZES = [240];
export const FRAMES = ["open", "blink", "talk1", "talk2"];
export const FAVICON_SIZES = [16, 32, 48];
export const MANIFEST_MARK = /\/\*ARIA-STAR-MANIFEST:START\*\/[\s\S]*?\/\*ARIA-STAR-MANIFEST:END\*\//;
const FAVICON_PAGES = ["index.html", "terminos.html", "privacidad.html", "checkout.html", "docs/mcp/index.html"];

/* ------------------------------------------------------------------
   IMAGE HEADERS, read with no dependency (used by --check and to
   verify every export).
   ------------------------------------------------------------------ */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { type: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const fourcc = buf.toString("ascii", 12, 16);
    if (fourcc === "VP8X") return { type: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), alpha: !!(buf[20] & 0x10) };
    if (fourcc === "VP8L") { const b = buf.readUInt32LE(21); return { type: "webp", width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff), alpha: !!((b >> 28) & 1) }; }
    if (fourcc === "VP8 ") return { type: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, alpha: false };
  }
  if (buf.length > 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
    const n = buf.readUInt16LE(4), sizes = [];
    for (let i = 0; i < n; i++) sizes.push(buf[6 + i * 16] || 256);
    return { type: "ico", sizes };
  }
  return null;
}

/* An .ico that carries PNGs (every browser since IE Vista reads it). */
export function buildIco(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let off = 6 + dir.length;
  pngs.forEach((p, i) => {
    const { width, height } = imageSize(p);
    const e = i * 16;
    dir[e] = width >= 256 ? 0 : width; dir[e + 1] = height >= 256 ? 0 : height;
    dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(p.length, e + 8); dir.writeUInt32LE(off, e + 12);
    off += p.length;
  });
  return Buffer.concat([head, dir, ...pngs]);
}

/* ------------------------------------------------------------------
   BACKENDS. Each one does exactly two things to a delivered frame:
   fit it into an NxN transparent square (aspect kept, nothing cropped)
   and encode it. No filters, no recolouring, no redrawing.
   ------------------------------------------------------------------ */
const PIL_PROGRAM = `
import sys, json, io
from PIL import Image
job = json.load(sys.stdin)
im = Image.open(job["src"]); im.load(); im = im.convert("RGBA")
n = job["size"]
w, h = im.size
s = min(n / w, n / h)
nw, nh = max(1, round(w * s)), max(1, round(h * s))
r = im.resize((nw, nh), Image.LANCZOS)
c = Image.new("RGBA", (n, n), (0, 0, 0, 0))
c.paste(r, ((n - nw) // 2, (n - nh) // 2), r)
out = io.BytesIO()
if job["fmt"] == "webp":
    c.save(out, "WEBP", quality=job["quality"], method=6, alpha_quality=100)
else:
    c.save(out, "PNG", optimize=True)
sys.stdout.buffer.write(out.getvalue())
`;
const PIL_PROBE = `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]); im.load()
print(json.dumps({"width": im.size[0], "height": im.size[1], "mode": im.mode}))
`;

export async function pickBackend(want) {
  const order = want ? [want] : ["sharp", "pil", "magick"];
  const tried = [];
  for (const b of order) {
    if (b === "sharp") {
      try {
        const req = createRequire(join(ROOT, "package.json"));
        const sharp = (await import(pathToFileURL(req.resolve("sharp")).href)).default;
        return {
          name: "sharp",
          probe: async (src) => { const m = await sharp(src).metadata(); return { width: m.width, height: m.height, mode: m.hasAlpha ? "RGBA" : "RGB" }; },
          render: async (src, size, fmt, quality) => {
            const p = sharp(src).ensureAlpha().resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" });
            return fmt === "webp" ? p.webp({ quality, alphaQuality: 100, effort: 6 }).toBuffer() : p.png({ compressionLevel: 9 }).toBuffer();
          },
        };
      } catch { tried.push("sharp (not in node_modules)"); }
    }
    if (b === "pil") {
      const ok = spawnSync("python3", ["-I", "-c", "from PIL import Image, features; import sys; sys.exit(0 if features.check('webp') else 3)"]);
      if (ok.status === 0) {
        return {
          name: "pil",
          probe: async (src) => JSON.parse(execFileSync("python3", ["-I", "-c", PIL_PROBE, src]).toString()),
          render: async (src, size, fmt, quality) => execFileSync("python3", ["-I", "-c", PIL_PROGRAM], { input: JSON.stringify({ src, size, fmt, quality }), maxBuffer: 64 << 20 }),
        };
      }
      tried.push(ok.status === 3 ? "python PIL (no WebP support)" : "python PIL (not installed)");
    }
    if (b === "magick") {
      const bin = ["magick", "convert"].find((c) => spawnSync(c, ["-version"]).status === 0);
      const webp = bin && /\bWEBP\b/.test(spawnSync(bin, ["-list", "format"]).stdout.toString());
      if (bin && webp) {
        return {
          name: "magick",
          probe: async (src) => {
            const [w, h, a] = execFileSync(bin, [src + "[0]", "-format", "%w %h %A", "info:"]).toString().trim().split(/\s+/);
            return { width: +w, height: +h, mode: /true|blend/i.test(a) ? "RGBA" : "RGB" };
          },
          render: async (src, size, fmt, quality) => execFileSync(bin, [src + "[0]", "-alpha", "on", "-background", "none", "-filter", "Lanczos",
            "-resize", `${size}x${size}`, "-gravity", "center", "-extent", `${size}x${size}`,
            ...(fmt === "webp" ? ["-quality", String(quality), "-define", "webp:method=6", "-define", "webp:alpha-quality=100", "webp:-"] : ["-strip", "-define", "png:compression-level=9", "png32:-"])], { maxBuffer: 64 << 20 }),
        };
      }
      tried.push(bin ? "ImageMagick (no WebP delegate)" : "ImageMagick (not installed)");
    }
  }
  throw new Error("no image tool: tried " + tried.join(", ") + ". Install sharp (npm i sharp) or python3-PIL.");
}

/* The smallest-loss encode that fits the byte budget: highest quality
   first, stepping down. Below q50 the fur turns to mush, so it fails
   instead of shipping a smeared star. */
async function encodeWithin(backend, src, size, budget) {
  for (let q = 90; q >= 50; q -= 5) {
    const buf = await backend.render(src, size, "webp", q);
    if (buf.length <= budget) return { buf, quality: q };
  }
  throw new Error(`${basename(src)} at ${size}px is over ${budget} bytes even at WebP q50: not shipping it. Ask Lucifer for a lighter master.`);
}

const sha8 = (b) => createHash("sha256").update(b).digest("hex").slice(0, 8);

/* ------------------------------------------------------------------
   THE IMPORT
   ------------------------------------------------------------------ */
export async function importStar({ open, blink, talk1, talk2, out = DEFAULT_OUT, backend: want, sizes = SCREEN_SIZES, base: urlBase = "", log = console.log } = {}) {
  const SRC = { open, blink, talk1, talk2 };
  const missing = FRAMES.filter((k) => !SRC[k]);
  if (missing.length) throw new Error("usage: --open <file> --blink <file> --talk1 <file> --talk2 <file> (missing: " + missing.join(", ") + ")");
  for (const k of FRAMES) if (!existsSync(SRC[k])) throw new Error("no such file: " + SRC[k]);
  for (const n of sizes) if (n > MAX_CHAT_PX) throw new Error(`launcher/chat size ${n}px is over the ${MAX_CHAT_PX}px limit`);
  const backend = await pickBackend(want);
  log(`  backend: ${backend.name}`);
  const PR = {};
  for (const k of FRAMES) PR[k] = await backend.probe(SRC[k]);
  const po = PR.open;
  const odd = FRAMES.filter((k) => PR[k].width !== po.width || PR[k].height !== po.height);
  if (odd.length) throw new Error(`${odd.map((k) => `${k} (${PR[k].width}x${PR[k].height})`).join(", ")} not the same size as open (${po.width}x${po.height}): the frames would jump`);
  const warnings = [];
  if (FRAMES.some((k) => !/A/.test(PR[k].mode))) warnings.push("a source frame has no alpha channel: the star will sit on its own background, not on the page");
  if (Math.min(po.width, po.height) < Math.max(...sizes)) warnings.push(`the source (${po.width}x${po.height}) is smaller than the ${Math.max(...sizes)}px export: it is being upscaled`);

  const outAbs = resolve(ROOT, out);
  const staged = mkdtempSync(join(tmpdir(), "aria-star-"));
  const files = [];
  try {
    for (const n of sizes) {
      for (const frame of FRAMES) {
        const src = SRC[frame];
        const { buf, quality } = await encodeWithin(backend, src, n, MAX_FRAME_BYTES);
        const sz = imageSize(buf);
        if (!sz || sz.type !== "webp" || sz.width !== n || sz.height !== n) throw new Error(`export check failed for ${frame} ${n}px: got ${JSON.stringify(sz)}`);
        const name = `star-${frame}-${n}.${sha8(buf)}.webp`;
        writeFileSync(join(staged, name), buf);
        files.push({ role: "screen", frame, file: name, width: n, height: n, bytes: buf.length, quality });
      }
    }
    const favs = [];
    for (const n of FAVICON_SIZES) {
      const buf = await backend.render(open, n, "png");
      const sz = imageSize(buf);
      if (!sz || sz.width !== n) throw new Error(`favicon ${n}px export check failed`);
      writeFileSync(join(staged, `favicon-${n}.png`), buf);
      favs.push(buf);
      files.push({ role: "favicon", frame: "open", file: `favicon-${n}.png`, width: n, height: n, bytes: buf.length });
    }
    const ico = buildIco(favs);
    writeFileSync(join(staged, "favicon.ico"), ico);
    files.push({ role: "favicon", frame: "open", file: "favicon.ico", sizes: FAVICON_SIZES, bytes: ico.length });

    const over = files.filter((f) => f.role === "screen" && f.bytes > MAX_FRAME_BYTES);
    if (over.length) throw new Error("over 40 KB: " + over.map((f) => f.file).join(", "));

    /* The URL the page loads the frames from: the folder's place in the
       site, or (for an --out outside the repo, as in the tests) where the
       default import would put them. */
    const rel = relative(ROOT, outAbs).split("\\").join("/");
    const base = urlBase || (rel && !rel.startsWith("..") && !/^[a-z]:/i.test(rel) ? "/" + rel + "/" : "/" + DEFAULT_OUT + "/");
    const pick = (frame) => files.find((f) => f.role === "screen" && f.frame === frame && f.width === Math.max(...sizes)).file;
    const manifest = {
      version: 1,
      note: "Aria's plush star (#443 c.6647694000). Resized from Lucifer's delivered frames by scripts/import-aria-star.mjs; nothing drawn.",
      source: Object.fromEntries(FRAMES.map((k) => [k, { name: basename(SRC[k]), width: PR[k].width, height: PR[k].height, bytes: statSync(SRC[k]).size }])),
      backend: backend.name,
      base,
      frames: Object.fromEntries(FRAMES.map((k) => [k, pick(k)])),
      favicon: { ico: "favicon.ico", png32: "favicon-32.png", png16: "favicon-16.png" },
      slots: Object.fromEntries(Object.entries(SLOTS).map(([k, v]) => [k, { css: v.css, frames: Object.fromEntries(FRAMES.map((f) => [f, pick(f)])) }])),
      limits: { maxFrameBytes: MAX_FRAME_BYTES, maxChatPx: MAX_CHAT_PX },
      files,
      warnings,
    };
    writeFileSync(join(staged, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    /* Everything passed: only now does anything land in <out>. Old star
       frames there are replaced, not left to pile up. */
    mkdirSync(outAbs, { recursive: true });
    for (const f of readdirSync(outAbs)) if (/^star-(open|blink|talk1|talk2)-\d+\.[0-9a-f]{8}\.webp$|^favicon(-\d+\.png|\.ico)$|^manifest\.json$/.test(f)) unlinkSync(join(outAbs, f));
    for (const f of readdirSync(staged)) writeFileSync(join(outAbs, f), readFileSync(join(staged, f)));
    return manifest;
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------
   WIRING. Pure string functions, so the tests can run them in memory
   on the fixture and serve exactly what an import would produce.
   ------------------------------------------------------------------ */
/* The manifest the page needs, and nothing else. */
export function pageManifest(m) {
  return { base: m.base, frames: m.frames, slots: Object.fromEntries(Object.entries(m.slots).map(([k, v]) => [k, v.css])) };
}
export function stampScript(js, m) {
  if (!MANIFEST_MARK.test(js)) throw new Error("aria-star.js has lost its ARIA-STAR-MANIFEST markers");
  return js.replace(MANIFEST_MARK, () => `/*ARIA-STAR-MANIFEST:START*/${m ? JSON.stringify(pageManifest(m)) : "null"}/*ARIA-STAR-MANIFEST:END*/`);
}
/* index.html: the launcher's frames and the favicon. Binary-safe: only
   attribute values change, the CRLF line ends are untouched. */
export function wireIndex(html, m) {
  const [open, blink, talk1, talk2] = FRAMES.map((k) => m.base + m.frames[k]);
  let out = html;
  /* The whole tag is rewritten: the orb's circle crop (object-fit:cover;
     border-radius:50%) is inline, and a star must never be clipped. */
  const img = /<img id="ariaOrbImg" [^>]*>/;
  const blk = /<img id="ariaOrbBlink" [^>]*>/;
  if (!img.test(out) || !blk.test(out)) throw new Error("index.html: the launcher's two <img> are not where they were");
  const box = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;";
  out = out.replace(/<img data-src="[^"]*" data-aria-star="talk[12]"[^>]*>/g, ""); /* a re-import replaces, never stacks */
  const px = SLOTS.launcher.css;
  const hid = (id, k, src) => `<img ${id}data-src="${src.slice(1)}" data-aria-star="${k}" alt="" aria-hidden="true" width="${px}" height="${px}" style="${box}opacity:0;pointer-events:none;">`;
  out = out.replace(img, () => `<img id="ariaOrbImg" src="${open.slice(1)}" data-aria-star="open" alt="Aria" width="${px}" height="${px}" style="${box}">`);
  out = out.replace(blk, () => hid('id="ariaOrbBlink" ', "blink", blink) + hid("", "talk1", talk1) + hid("", "talk2", talk2));
  return wireFavicon(out, m);
}
export function wireFavicon(html, m, abs = false) {
  const href = (abs ? "https://ariashop.pe" : "") + m.base + m.favicon.png32;
  return html.replace(/<link rel="icon" type="image\/png" href="[^"]*">/, () => `<link rel="icon" type="image/png" sizes="32x32" href="${href}">`);
}
export function wireAll(m) {
  const changed = [];
  const put = (rel, next) => { const p = join(ROOT, rel); if (readFileSync(p, "utf8") !== next) { writeFileSync(p, next); changed.push(rel); } };
  put("assets/js/aria-star.js", stampScript(readFileSync(join(ROOT, "assets/js/aria-star.js"), "utf8"), m));
  put("index.html", wireIndex(readFileSync(join(ROOT, "index.html"), "utf8"), m));
  for (const f of FAVICON_PAGES.slice(1)) if (existsSync(join(ROOT, f))) put(f, wireFavicon(readFileSync(join(ROOT, f), "utf8"), m, f.startsWith("docs/")));
  writeFileSync(join(ROOT, "favicon.ico"), readFileSync(resolve(ROOT, m.base.slice(1), m.favicon.ico)));
  changed.push("favicon.ico");
  return changed;
}

/* ------------------------------------------------------------------
   --check
   ------------------------------------------------------------------ */
export function checkStar({ out = DEFAULT_OUT, require: must = false } = {}) {
  const dir = resolve(ROOT, out);
  const mp = join(dir, "manifest.json");
  const problems = [];
  if (!existsSync(mp)) {
    if (must) problems.push("no " + relative(ROOT, mp) + ": the star has not been imported");
    return { state: "pending", problems };
  }
  const m = JSON.parse(readFileSync(mp, "utf8"));
  for (const f of m.files || []) {
    const p = join(dir, f.file);
    if (!existsSync(p)) { problems.push("missing " + f.file); continue; }
    const buf = readFileSync(p);
    if (buf.length !== f.bytes) problems.push(`${f.file}: ${buf.length} bytes, manifest says ${f.bytes}`);
    const sz = imageSize(buf);
    if (f.role === "screen") {
      if (buf.length > MAX_FRAME_BYTES) problems.push(`${f.file}: ${buf.length} bytes is over 40 KB`);
      if (!sz || sz.type !== "webp") problems.push(`${f.file}: not a WebP`);
      else {
        if (sz.width !== f.width || sz.height !== f.height) problems.push(`${f.file}: ${sz.width}x${sz.height}, manifest says ${f.width}x${f.height}`);
        if (sz.width > MAX_CHAT_PX || sz.height > MAX_CHAT_PX) problems.push(`${f.file}: over ${MAX_CHAT_PX}px`);
      }
    }
  }
  for (const k of FRAMES) if (!m.frames || !(m.files || []).some((f) => f.file === m.frames[k])) problems.push(`the ${k} frame is not in the manifest's files`);
  const screen = (m.files || []).filter((f) => f.role === "screen");
  const bySize = {};
  for (const f of screen) (bySize[f.width] ||= []).push(f.frame);
  for (const [n, fr] of Object.entries(bySize)) if (fr.sort().join() !== [...FRAMES].sort().join()) problems.push(`${n}px does not have exactly one each of ${FRAMES.join(", ")}`);
  if (out === DEFAULT_OUT) {
    const js = readFileSync(join(ROOT, "assets/js/aria-star.js"), "utf8");
    const stamped = MANIFEST_MARK.exec(js);
    if (!stamped || stamped[0] !== stampScript(stamped ? stamped[0] : "", m)) problems.push("assets/js/aria-star.js carries a different manifest: re-run the import");
    const idx = readFileSync(join(ROOT, "index.html"), "utf8");
    if (!idx.includes(`src="${(m.base + m.frames.open).slice(1)}"`)) problems.push("index.html's launcher is not wired to the open frame");
  }
  return { state: problems.length ? "broken" : "ok", manifest: m, problems };
}

/* ------------------------------------------------------------------
   CLI
   ------------------------------------------------------------------ */
function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") o.check = true;
    else if (a === "--require") o.require = true;
    else if (a === "--no-wire") o.noWire = true;
    else if (["--open", "--blink", "--talk1", "--talk2", "--out", "--backend"].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new Error("unknown argument " + a);
  }
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = args(process.argv.slice(2));
    if (o.check) {
      const r = checkStar({ out: o.out || DEFAULT_OUT, require: o.require });
      if (r.state === "pending") console.log("  aria-star: no manifest yet, the orb is still Aria's face everywhere" + (r.problems.length ? "\n  FAIL " + r.problems.join("\n  FAIL ") : ""));
      else if (r.state === "ok") {
        console.log(`  aria-star: ok (${FRAMES.map((k) => r.manifest.frames[k]).join(", ")})`);
        for (const f of r.manifest.files) console.log(`    ${f.file.padEnd(36)} ${String(f.width || f.sizes.join("/")).padStart(5)}px ${String(f.bytes).padStart(7)} B`);
      } else console.log("  aria-star: BROKEN\n  FAIL " + r.problems.join("\n  FAIL "));
      process.exit(r.problems.length ? 1 : 0);
    }
    const m = await importStar({ open: o.open, blink: o.blink, talk1: o.talk1, talk2: o.talk2, out: o.out || DEFAULT_OUT, backend: o.backend });
    for (const f of m.files) console.log(`    ${f.file.padEnd(36)} ${String(f.width || f.sizes.join("/")).padStart(5)}px ${String(f.bytes).padStart(7)} B${f.quality ? "  q" + f.quality : ""}`);
    for (const w of m.warnings) console.log("  WARN " + w);
    if (!o.noWire) {
      if ((o.out || DEFAULT_OUT) !== DEFAULT_OUT) throw new Error("wiring needs the default --out (the pages point at /" + DEFAULT_OUT + "/); pass --no-wire");
      console.log("  wired: " + wireAll(m).join(", "));
    }
    const shot = m.files.filter((f) => f.role === "screen");
    console.log(`  shipped weight of the four frames: ${shot.map((f) => `${f.frame} ${f.bytes} B`).join(", ")}`);
  } catch (e) {
    console.error("  import-aria-star: FAILED\n  " + e.message);
    process.exit(1);
  }
}
