#!/usr/bin/env node
/* ==================================================================
   ARIA'S PLUSH STAR (#443 c.6647694000): the import, the component,
   every slot, and the Mountain Test.

   THE FIXTURE IS NOT THE STAR. Every check that needs frames uses two
   FLAT-COLOUR PNGs (teal = "open", magenta = "blink", blue = "talk1",
   purple = "talk2") written into this
   run's temp dir and deleted at the end. They are never committed and
   never shipped; they exist only to prove the wiring. The real frames
   come from Lucifer and go through scripts/import-aria-star.mjs.

     node scripts/test/aria-star-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/aria-star-tests.mjs   (also saves 390px screenshots, labelled FIXTURE)
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const IMP = await import("../import-aria-star.mjs");
const SHOT_DIR = process.env.SHOT_DIR || "";

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

/* ---- the fixture: flat-colour RGBA PNGs, stdlib only ---- */
function png(w, h, rgba) {
  const crcT = []; for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[i] = c >>> 0; }
  const crc = (buf) => { let x = ~0; for (const b of buf) x = crcT[(x ^ b) & 255] ^ (x >>> 8); return (~x) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    if (typeof rgba === "function") rgba(row, y);
    else for (let x = 0; x < w; x++) row.set(rgba, 1 + x * 4);
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
const TMP = mkdtempSync(join(tmpdir(), "aria-star-test-"));
const FX = { open: join(TMP, "fixture-open.png"), blink: join(TMP, "fixture-blink.png"), talk1: join(TMP, "fixture-talk1.png"), talk2: join(TMP, "fixture-talk2.png"), small: join(TMP, "fixture-small.png"), noise: join(TMP, "fixture-noise.png") };
writeFileSync(FX.open, png(800, 800, [31, 158, 137, 255]));
writeFileSync(FX.blink, png(800, 800, [194, 24, 91, 255]));
writeFileSync(FX.talk1, png(800, 800, [40, 90, 200, 255]));
writeFileSync(FX.talk2, png(800, 800, [120, 60, 170, 255]));
const FOUR = { open: FX.open, blink: FX.blink, talk1: FX.talk1, talk2: FX.talk2 };
const NAMES = ["open", "blink", "talk1", "talk2"];
writeFileSync(FX.small, png(600, 600, [194, 24, 91, 255]));
writeFileSync(FX.noise, png(800, 800, (row) => { randomBytes(row.length - 1).copy(row, 1); }));
const OUT = join(TMP, "star");
const quiet = () => {};

/* ==================================================================
   THE IMPORT
   ================================================================== */
let M = null;
await check("import: one on-screen size (240px) for all four frames (open, blink, talk1, talk2) as WebP, plus favicon PNGs and an ICO from the open frame", async () => {
  M = await IMP.importStar({ ...FOUR, out: OUT, log: quiet });
  const screen = M.files.filter((f) => f.role === "screen");
  assert.deepEqual(screen.map((f) => `${f.frame}@${f.width}`).sort(), ["blink@240", "open@240", "talk1@240", "talk2@240"]);
  for (const f of screen) {
    assert.match(f.file, /^star-(open|blink|talk1|talk2)-240\.[0-9a-f]{8}\.webp$/);
    const sz = IMP.imageSize(readFileSync(join(OUT, f.file)));
    assert.equal(sz.type, "webp"); assert.equal(sz.width, 240); assert.equal(sz.height, 240);
  }
  const fav = M.files.filter((f) => f.role === "favicon").map((f) => f.file).sort();
  assert.deepEqual(fav, ["favicon-16.png", "favicon-32.png", "favicon-48.png", "favicon.ico"]);
  assert.deepEqual(IMP.imageSize(readFileSync(join(OUT, "favicon.ico"))).sizes, [16, 32, 48]);
  for (const n of [16, 32, 48]) assert.equal(IMP.imageSize(readFileSync(join(OUT, `favicon-${n}.png`))).width, n);
  assert.ok(M.files.filter((f) => f.role === "favicon").every((f) => f.frame === "open"), "a favicon came from the blink frame");
});

await check("import: manifest.json carries every file with its dimensions and its real byte size; every slot names the same four frames", async () => {
  const disk = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
  assert.deepEqual(disk, M);
  for (const f of disk.files) assert.equal(statSync(join(OUT, f.file)).size, f.bytes, f.file);
  assert.deepEqual(Object.keys(disk.slots).sort(), ["avatar", "launcher", "loader", "presence"]);
  for (const s of Object.values(disk.slots)) assert.deepEqual(s.frames, disk.frames);
  assert.deepEqual(Object.keys(disk.frames), NAMES);
  assert.equal(disk.slots.launcher.css, 80); assert.equal(disk.slots.presence.css, 64);
  assert.equal(disk.limits.maxFrameBytes, 40960); assert.equal(disk.limits.maxChatPx, 320);
});

await check("import: every frame is at most 40 KB and at most 320 px; --check passes on the result", async () => {
  for (const f of M.files.filter((x) => x.role === "screen")) { assert.ok(f.bytes <= 40960, f.file + " " + f.bytes); assert.ok(f.width <= 320); }
  const r = IMP.checkStar({ out: OUT });
  assert.equal(r.state, "ok", r.problems.join("; "));
});

await check("import fails loudly, and writes nothing, over 320 px, over 40 KB, a frame missing, or frames of different sizes", async () => {
  const bad = join(TMP, "bad");
  await assert.rejects(IMP.importStar({ ...FOUR, out: bad, sizes: [384], log: quiet }), /over the 320px limit/);
  await assert.rejects(IMP.importStar({ open: FX.noise, blink: FX.noise, talk1: FX.noise, talk2: FX.noise, out: bad, sizes: [320], log: quiet }), /over 40960 bytes/);
  await assert.rejects(IMP.importStar({ ...FOUR, talk2: FX.small, out: bad, log: quiet }), /talk2 \(600x600\) not the same size/);
  await assert.rejects(IMP.importStar({ ...FOUR, talk1: undefined, out: bad, log: quiet }), /missing: talk1/);
  await assert.rejects(IMP.importStar({ ...FOUR, blink: join(TMP, "nope.webp"), out: bad, log: quiet }), /no such file/);
  assert.ok(!existsSync(bad), "a failed import left files behind");
});

await check("--check catches a frame that grew past 40 KB or a byte size that no longer matches", async () => {
  const dir = join(TMP, "tamper");
  const m = await IMP.importStar({ ...FOUR, out: dir, log: quiet });
  writeFileSync(join(dir, m.frames.talk1), Buffer.concat([readFileSync(join(dir, m.frames.talk1)), Buffer.alloc(41000)]));
  const r = IMP.checkStar({ out: dir });
  assert.equal(r.state, "broken");
  assert.ok(r.problems.some((p) => /over 40 KB/.test(p)) && r.problems.some((p) => /manifest says/.test(p)), r.problems.join("; "));
});

await check("the CLI: --check passes with no manifest (the orb stays) and fails with --require; on the repo, as it stands, it passes", async () => {
  const none = join(TMP, "none");
  const a = spawnSync(process.execPath, ["scripts/import-aria-star.mjs", "--check", "--out", none], { cwd: ROOT });
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.match(a.stdout.toString(), /no manifest yet/);
  const b = spawnSync(process.execPath, ["scripts/import-aria-star.mjs", "--check", "--require", "--out", none], { cwd: ROOT });
  assert.equal(b.status, 1);
  const c = spawnSync(process.execPath, ["scripts/import-aria-star.mjs", "--check", ...(existsSync("assets/aria/star/manifest.json") ? ["--require"] : [])], { cwd: ROOT });
  assert.equal(c.status, 0, c.stdout + c.stderr);
});

await check("the image tool: sharp when present, else python PIL, else ImageMagick; each backend that exists here produces the same contract", async () => {
  const have = [];
  for (const b of ["sharp", "pil", "magick"]) { try { await IMP.pickBackend(b); have.push(b); } catch {} }
  assert.ok(have.length, "no image tool at all");
  const def = await IMP.pickBackend();
  assert.equal(def.name, have[0], "the default is not the first available tool");
  for (const b of have) {
    const m = await IMP.importStar({ ...FOUR, out: join(TMP, "be-" + b), backend: b, log: quiet });
    assert.equal(m.backend, b);
    assert.equal(IMP.checkStar({ out: join(TMP, "be-" + b) }).state, "ok", b);
  }
  console.log("         (backends here: " + have.join(", ") + ")");
});

/* ==================================================================
   THE REPO: BEFORE THE FRAMES, AND AS IMPORTED

   "With no manifest the orb is unchanged" is checked on the repo as it
   stood just before the import (the parent of the commit that added
   assets/aria/star/manifest.json; HEAD while the import is uncommitted;
   the working tree itself when nothing is imported yet).
   ================================================================== */
const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 64 << 20 }).toString();
const REPO_MANIFEST = "assets/aria/star/manifest.json";
const REPO_IMPORTED = existsSync(REPO_MANIFEST);
const IMPORTED_AT = REPO_IMPORTED ? git("log", "--diff-filter=A", "--format=%H", "--", REPO_MANIFEST).trim().split("\n").filter(Boolean).pop() || "" : "";
const PRE_REV = REPO_IMPORTED ? (IMPORTED_AT ? IMPORTED_AT + "^1" : "HEAD") : null;
const fromPre = (f) => (PRE_REV ? git("show", `${PRE_REV}:${f}`) : readFileSync(f, "utf8"));
const STAR_JS_NOW = readFileSync("assets/js/aria-star.js", "utf8");
const STAR_JS = IMP.stampScript(STAR_JS_NOW, null);
const STAR_JS_PRE = fromPre("assets/js/aria-star.js");
const INDEX = fromPre("index.html");
const INDEX_NOW = readFileSync("index.html", "utf8");
const REAL = REPO_IMPORTED ? JSON.parse(readFileSync(REPO_MANIFEST, "utf8")) : null;
const LAUNCHER = readFileSync("assets/js/aria-launcher.js", "utf8");
const BUNDLE_NAME = /<script src="\/(build\/app-[0-9a-f]{16}\.js)" defer><\/script>/.exec(INDEX)[1];
const BUNDLE = readFileSync(BUNDLE_NAME, "utf8");

await check("before the frames: aria-star.js carried a null manifest, so it stopped at once; it never fetches one", () => {
  assert.match(STAR_JS_PRE, /var M = \/\*ARIA-STAR-MANIFEST:START\*\/null\/\*ARIA-STAR-MANIFEST:END\*\/;/);
  assert.doesNotMatch(STAR_JS_NOW, /fetch\(|XMLHttpRequest|manifest\.json["']/, "the component requests its manifest");
  if (!REPO_IMPORTED) assert.equal(IMP.checkStar().state, "pending");
});

await check("before the frames: index.html's launcher and favicon were the orb, byte for byte the markup it had", () => {
  assert.match(INDEX, /<img id="ariaOrbImg" src="assets\/aria-orb-pixar-320\.webp" onerror="this\.onerror=null;this\.src='assets\/aria-orb-pixar-320\.png'" alt="Aria" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">/);
  assert.match(INDEX, /<img id="ariaOrbBlink" data-src="assets\/aria-orb-pixar-blink-320\.webp"/);
  assert.match(INDEX, /<link rel="icon" type="image\/png" href="assets\/aria-orb-pixar-64\.png">/);
  assert.match(LAUNCHER, /aria-orb-pixar-192\.webp/);
});

await check("the import's wiring: aria-star.js gets the manifest, index.html's launcher and favicon the star, CRLF kept, one deferred bundle tag", () => {
  const js = IMP.stampScript(STAR_JS, M);
  assert.match(js, /ARIA-STAR-MANIFEST:START\*\/\{"base":/);
  assert.equal(IMP.stampScript(js, null), STAR_JS, "stamping is not reversible");
  const html = IMP.wireIndex(INDEX, M);
  assert.equal((html.match(/\r\n/g) || []).length, (INDEX.match(/\r\n/g) || []).length, "CRLF line ends changed");
  assert.equal((html.match(/<script src="\/build\/app-[0-9a-f]{16}\.js" defer><\/script>/g) || []).length, 1);
  assert.ok(html.includes(`src="${(M.base + M.frames.open).slice(1)}"`));
  for (const k of ["blink", "talk1", "talk2"]) assert.ok(html.includes(`data-src="${(M.base + M.frames[k]).slice(1)}" data-aria-star="${k}"`), k);
  assert.equal(IMP.wireIndex(html, M), html, "a second import stacks the frames");
  assert.doesNotMatch(html.match(/<img id="ariaOrbImg"[^>]*>/)[0], /border-radius:50%|object-fit:cover/, "the star would be cropped to a circle");
  assert.doesNotMatch(html, /(src|data-src|onerror)="[^"]*aria-orb-pixar/, "the launcher still names an orb frame");
  assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="[^"]*favicon-32\.png">/);
});

await check("every page with the launcher loads aria-star.js deferred, just before aria-launcher.js; index.html after the bundle", () => {
  const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html") && readFileSync(f, "utf8").includes("/assets/js/aria-launcher.js"));
  assert.ok(pages.length >= 20, pages.length + " pages");
  for (const f of pages) assert.match(readFileSync(f, "utf8"), /<script src="\/assets\/js\/aria-star\.js" defer><\/script>\r?\n<script src="\/assets\/js\/aria-launcher\.js" defer><\/script>/, f);
  assert.match(INDEX_NOW, /<script src="\/build\/app-[0-9a-f]{16}\.js" defer><\/script>\r\n<script src="\/assets\/js\/aria-star\.js" defer><\/script>/);
  assert.equal((INDEX_NOW.match(/<script src="\/assets\/js\/aria-star\.js" defer><\/script>/g) || []).length, 1);
  assert.ok(STAR_JS.length < 18000, "aria-star.js is " + STAR_JS.length + " bytes");
});

await check("the hooks: setOrbState fires aria:state, the typing row aria:typing, product cards aria:results; the open chat's corner keeps today's orb behaviour", () => {
  assert.match(BUNDLE, /function setOrbState\(state\)\{[\s\S]{0,600}dispatchEvent\(new CustomEvent\('aria:state', \{ detail: \{ state: state \} \}\)\)/);
  assert.match(BUNDLE, /function showAssistantTyping\(label\)\{[\s\S]{0,900}CustomEvent\('aria:typing', \{ detail: \{ on: true \} \}\)/);
  assert.match(BUNDLE, /function hideAssistantTyping\(\)\{[\s\S]{0,200}CustomEvent\('aria:typing', \{ detail: \{ on: false \} \}\)/);
  assert.match(BUNDLE, /function rememberShownProduct\(item, retailer, card\)\{[\s\S]{0,400}CustomEvent\('aria:results'\)/);
  /* c.6648429009: while the chat is open the corner follows the orb's behaviour */
  assert.match(BUNDLE, /document\.getElementById\('assistantIconSpark'\)\.classList\.toggle\('hidden', assistantOpen\);\r?\n  document\.getElementById\('assistantIconClose'\)\.classList\.toggle\('hidden', !assistantOpen\);/);
  assert.doesNotMatch(BUNDLE, /keepFace/);
  assert.match(BUNDLE, /if \(window\.AriaStar && window\.AriaStar\.active\) return;\r?\n    var go = function/, "the orb's own blink timer would run on the star too");
});

await check("motion is transform/opacity only: no keyframe in aria-star.js touches a layout property", () => {
  const frames = [...STAR_JS.matchAll(/@keyframes (\w+)\{((?:[^{}]*\{[^}]*\})*)\}/g)];
  assert.ok(frames.length >= 2, "no keyframes found");
  for (const [, name, body] of frames) {
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    for (const p of props) assert.ok(["transform", "opacity"].includes(p), `${name} animates ${p}`);
  }
  assert.doesNotMatch(STAR_JS, /transition:\s*(width|height|top|left|margin)/);
});

await check("no video anywhere on the storefront: no <video>, no .mp4/.webm, in the pages, assets/js, the bundle or the shipped assets", () => {
  const bad = [];
  const scan = (f) => { const s = readFileSync(f, "utf8"); if (/<video\b|createElement\(\s*['"]video['"]|\.mp4\b|\.webm\b/i.test(s)) bad.push(f); };
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".html"))) scan(f);
  for (const f of readdirSync("assets/js")) scan(join("assets/js", f));
  scan(BUNDLE_NAME);
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (!/^(pdp|search|sections|vendor)$/.test(e.name)) walk(p); } else if (/\.(mp4|webm|mov|m4v)$/i.test(e.name)) bad.push(p); } };
  walk("assets");
  assert.deepEqual(bad, []);
});

/* ==================================================================
   IN THE BROWSER, 390px. A small static server; the "star" mode
   serves exactly what the import would write (the fixture's frames,
   aria-star.js stamped, index.html wired), all in memory.
   ================================================================== */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
const STAMPED = IMP.stampScript(STAR_JS, M);
const WIRED = IMP.wireIndex(INDEX, M);
/* No request interception: Playwright's routing turns the HTTP cache off,
   and the Mountain Test is about what a real phone's cache does. Three
   servers instead, each counting the requests that reached it; every
   other host fails fast in the resolver:
     orb      the site just before the import (null manifest, orb markup)
     star     the same site with the FIXTURE imported in memory
     real     the repo exactly as it is (the real frames, once imported) */
let HITS = [];
function serve(mode) {
  const star = mode === "star";
  const s = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const p = decodeURIComponent(u.pathname);
    HITS.push(p);
    if (/^\/(\.netlify\/functions|api)\//.test(p)) { res.writeHead(503, { "Content-Type": "application/json" }); res.end("{}"); return; }
    const send = (body, type) => { res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=3600" }); res.end(body); };
    if (mode === "orb") {
      if (p === "/assets/js/aria-star.js") return send(STAR_JS, TYPES[".js"]);
      if (p === "/" || p === "/index.html") return send(INDEX, TYPES[".html"]);
    }
    if (star) {
      if (p === "/assets/js/aria-star.js") return send(STAMPED, TYPES[".js"]);
      if (p === "/" || p === "/index.html") return send(WIRED, TYPES[".html"]);
      if (p.startsWith(M.base)) { const f = join(OUT, p.slice(M.base.length)); if (existsSync(f)) return send(readFileSync(f), TYPES[extname(f)]); res.writeHead(404); res.end(); return; }
    }
    let f = join(ROOT, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    send(readFileSync(f), TYPES[extname(f)] || "application/octet-stream");
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r(s)));
}
const SERVERS = { orb: await serve("orb"), star: await serve("star"), real: await serve("real") };
const url = (star) => `http://127.0.0.1:${SERVERS[star === "real" ? "real" : star ? "star" : "orb"].address().port}`;
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
  args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
});

async function open(path, { star = false, reduced = false, width = 390, clock = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: width < 1024, hasTouch: width < 1024, reducedMotion: reduced ? "reduce" : "no-preference" });
  const pg = await ctx.newPage();
  const types = [];
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  pg.on("request", (r) => types.push({ p: r.url(), type: r.resourceType() }));
  if (clock) await pg.clock.install();
  HITS = [];
  const hits = { get list() { return HITS.map((p) => ({ p })); }, types };
  await pg.goto(`${url(star)}/${path}`, { waitUntil: "load", timeout: 90000 });
  if (!clock) await pg.waitForTimeout(600);
  return { ctx, pg, hits, errs };
}
const faceHits = (hits) => hits.list.filter((h) => /aria-orb|\/orb[-.]|\/aria\/star\//.test(h.p)).map((h) => h.p);
async function label(pg, text) {
  await pg.evaluate((t) => {
    const d = document.createElement("div");
    d.textContent = t;
    d.setAttribute("style", "position:fixed;left:8px;top:8px;z-index:99999;background:#B42318;color:#fff;font:700 13px/1.3 sans-serif;padding:6px 9px;border-radius:6px;max-width:300px;pointer-events:none");
    document.body.appendChild(d);
  }, text);
}
async function shot(pg, name) { if (SHOT_DIR) await pg.screenshot({ path: join(SHOT_DIR, `aria-star-${name}.png`) }); }
const FIXTURE = "FIXTURE: cuadros de color plano de prueba. NO es la estrella.";

await check("no manifest (as shipped): the orb is the face, its float and breath run, the old blink frame loads, no star file is requested", async () => {
  const { ctx, pg, hits } = await open("index.html");
  const r = await pg.evaluate(() => ({
    active: window.AriaStar && window.AriaStar.active,
    on: document.documentElement.classList.contains("aria-star-on"),
    css: !!document.getElementById("ariaStarCss"),
    src: document.getElementById("ariaOrbImg").getAttribute("src"),
    float: getComputedStyle(document.getElementById("ariaOrbFloat")).animationName,
    spark: getComputedStyle(document.getElementById("assistantIconSpark")).animationName,
    radius: getComputedStyle(document.getElementById("ariaOrbImg")).borderRadius,
    head: !!document.querySelector("#assistantHeadFace > svg"),
  }));
  await shot(pg, "390-no-manifest-orb");
  await ctx.close();
  assert.equal(r.active, false); assert.equal(r.on, false); assert.equal(r.css, false);
  assert.equal(r.src, "assets/aria-orb-pixar-320.webp");
  assert.equal(r.float, "ariaOrbFloat"); assert.equal(r.spark, "ariaOrbBreathe");
  assert.equal(r.radius, "50%");
  assert.ok(r.head);
  assert.ok(!faceHits(hits).some((p) => /\/aria\/star\//.test(p)), "a star file was requested");
  assert.ok(faceHits(hits).includes("/assets/aria-orb-pixar-320.webp"));
});

await check("no manifest, desktop: opening the chat still swaps the launcher to its X, exactly as today", async () => {
  const { ctx, pg } = await open("index.html", { width: 1280 });
  const r = await pg.evaluate(() => { toggleAssistant(); return { spark: document.getElementById("assistantIconSpark").classList.contains("hidden"), x: document.getElementById("assistantIconClose").classList.contains("hidden") }; });
  await ctx.close();
  assert.deepEqual(r, { spark: true, x: false });
});

await check("no manifest, every other page: aria-launcher.js draws the orb picture, unchanged", async () => {
  const { ctx, pg, hits } = await open("nosotros.html");
  const r = await pg.evaluate(() => ({ active: window.AriaStar.active, pic: !!document.querySelector("#ariaLauncher picture img[src='/assets/aria-orb-pixar-64.png']"), star: !!document.querySelector("#ariaLauncher .aria-star") }));
  await ctx.close();
  assert.deepEqual(r, { active: false, pic: true, star: false });
  assert.ok(!faceHits(hits).some((p) => /\/aria\/star\//.test(p)));
});

const starFiles = () => NAMES.map((k) => M.base + M.frames[k]).sort();
let starHits = null;
await check("FIXTURE, home: the corner launcher is her (80px, not cropped, no ball), idling; the only face downloads are her four frames, once each", async () => {
  const { ctx, pg, hits, errs } = await open("index.html", { star: true });
  await pg.waitForFunction(() => window.AriaStar && window.AriaStar.blinkReady(), null, { timeout: 15000 });
  const r = await pg.evaluate(() => ({
    active: window.AriaStar.active,
    src: document.getElementById("ariaOrbImg").currentSrc,
    radius: getComputedStyle(document.getElementById("ariaOrbImg")).borderRadius,
    fit: getComputedStyle(document.getElementById("ariaOrbImg")).objectFit,
    float: getComputedStyle(document.getElementById("ariaOrbFloat")).animationName,
    glow: getComputedStyle(document.getElementById("assistantIconSpark"), "::before").display,
    ring: getComputedStyle(document.querySelector("#assistantIconSpark .aria-orb-ring")).display,
    box: document.getElementById("assistantBtn").getBoundingClientRect().toJSON(),
    vw: innerWidth, vh: innerHeight,
    state: window.AriaStar.state,
  }));
  await label(pg, FIXTURE + " Lanzador: ella en la esquina inferior derecha.");
  await shot(pg, "390-fixture-launcher");
  await ctx.close();
  assert.equal(r.active, true);
  assert.ok(r.src.endsWith(M.base + M.frames.open), r.src);
  assert.equal(r.radius, "0px"); assert.equal(r.fit, "contain");
  assert.equal(r.float, "ariaStarIdle"); assert.equal(r.state, "idle");
  assert.equal(r.glow, "none", "the orb's round glow is still behind her"); assert.equal(r.ring, "none");
  assert.equal(r.box.width, 80); assert.equal(r.box.height, 80);
  assert.equal(Math.round(r.vw - r.box.right), 12, "she moved from the bottom-right corner");
  assert.ok(r.vh - r.box.bottom >= 12 && r.vh - r.box.bottom <= 13, "she moved from the bottom-right corner");
  assert.ok(r.box.width + 12 <= 104, "she is bigger than the corner the page keeps clear (--orb-dock-safe)");
  const face = faceHits(hits);
  assert.deepEqual(face.sort(), starFiles(), "face requests: " + face.join(", "));
  starHits = hits.list;
  assert.ok(!errs.some((e) => /AriaStar|aria-star/.test(e)), errs.join("; "));
});

await check("Mountain Test: the star adds no request beyond her four frames (same requests as the orb page, orb frames swapped for star frames)", async () => {
  const base = await open("index.html");
  await base.pg.waitForTimeout(3500); /* the orb's blink frame loads after load */
  await base.ctx.close();
  const strip = (hs) => hs.map((h) => h.p).filter((p) => !/aria-orb|\/aria\/star\//.test(p));
  const a = new Set(strip(base.hits.list)), b = new Set(strip(starHits));
  const extra = [...b].filter((p) => !a.has(p));
  assert.deepEqual(extra, [], "the star page requested " + extra.join(", "));
  for (const f of starFiles()) assert.equal(starHits.filter((h) => h.p === f).length, 1, f);
});

await check("Mountain Test: no long task added (init under 20 ms, and no long task while she idles and blinks for 8 s)", async () => {
  const runs = {};
  for (const star of [false, true]) {
    const { ctx, pg } = await open("index.html", { star });
    await pg.waitForTimeout(1500);
    runs[star] = await pg.evaluate(() => new Promise((done) => {
      const seen = [];
      const ob = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push(Math.round(e.duration)); });
      ob.observe({ type: "longtask" });
      setTimeout(() => { ob.disconnect(); done({ seen, init: window.AriaStar.initMs, blinks: window.AriaStar.blinkCount ? window.AriaStar.blinkCount() : 0 }); }, 8000);
    }));
    await ctx.close();
  }
  assert.ok(runs.true.init < 20, "aria-star init took " + runs.true.init + " ms");
  assert.ok(runs.true.blinks >= 1, "she never blinked in 8 s");
  assert.ok(runs.true.seen.length <= runs.false.seen.length, `long tasks while idle: star ${runs.true.seen} vs orb ${runs.false.seen}`);
});

/* A page on a frozen clock, her frames loaded: only runFor moves time. */
async function frozen(opts = {}) {
  const o = await open("index.html", { star: true, clock: true, ...opts });
  for (let i = 0; i < 60 && !(await o.pg.evaluate(() => !!(window.AriaStar && window.AriaStar.blinkReady && window.AriaStar.blinkReady()))); i++) { await o.pg.clock.runFor(200); await o.pg.waitForTimeout(50); }
  if (!opts.reduced) assert.ok(await o.pg.evaluate(() => window.AriaStar.blinkReady()), "her frames never loaded");
  await o.pg.clock.pauseAt(await o.pg.evaluate(() => Date.now() + 1000));
  return o;
}
const shown = (pg, sel) => pg.evaluate((sel) => {
  const root = document.querySelector(sel);
  const on = [...root.querySelectorAll("img")].filter((i) => i.style.opacity !== "0" && (i.getAttribute("src") || "")).map((i) => i.getAttribute("data-frame") || i.getAttribute("data-aria-star") || (i.id === "ariaOrbImg" ? "open" : i.id));
  return { on, state: root.getAttribute("data-state") };
}, sel);

await check("FIXTURE, IDLE: blink swaps open/blink every 3.5-5 s at random, closed 150 ms, and the open frame comes back", async () => {
  const { ctx, pg } = await frozen();
  await pg.evaluate(() => { window.AriaStar.trace = []; });
  for (let t = 0; t < 60000; t += 250) await pg.clock.runFor(250);
  const log = await pg.evaluate(() => window.AriaStar.trace);
  const after = await shown(pg, "#assistantIconSpark");
  if (SHOT_DIR) {
    await pg.evaluate(() => { window.AriaStar.trace = null; });
    for (let t = 0; t < 6000 && !(await pg.evaluate(() => window.AriaStar.frame === "blink")); t += 20) await pg.clock.runFor(20);
    await label(pg, FIXTURE + " Parpadeo: el cuadro magenta es el fotograma cerrado.");
    await shot(pg, "390-fixture-blink");
  }
  await ctx.close();
  const ons = log.filter((e, i) => e.frame === "blink" && (i === 0 || log[i - 1].frame !== "blink"));
  assert.ok(ons.length >= 11 && ons.length <= 18, ons.length + " blinks in 60 s");
  for (const on of ons) {
    const off = log.find((e) => e.t > on.t && e.frame !== "blink");
    if (!off) continue;
    assert.equal(off.t - on.t, 150, "closed for " + (off.t - on.t) + " ms");
    assert.equal(off.frame, "open");
  }
  const gaps = ons.slice(1).map((e, i) => e.t - ons[i].t);
  for (const d of gaps) assert.ok(d >= 3500 && d <= 5000, "gap " + d + " ms");
  assert.ok(new Set(gaps.map((g) => Math.round(g / 100))).size > 2, "the gaps are not random: " + gaps);
  assert.equal(after.state, "idle"); assert.match(after.on.join(), /^(open|blink)$/);
});

await check("FIXTURE, SPEAKING: talk1/talk2 alternate every 120-180 ms only inside setOrbState('speaking'), the real TTS hook; idle again on its end", async () => {
  const { ctx, pg } = await frozen();
  /* the chat stays closed: opening it starts the greeting and the voice
     warm-up, whose own state calls would cut this window short */
  await pg.evaluate(() => { window.AriaStar.trace = []; });
  await pg.clock.runFor(2000);
  const before = await pg.evaluate(() => window.AriaStar.mouthFlips());
  await pg.evaluate(() => setOrbState("speaking"));
  const mid = [];
  for (let t = 0; t < 3000; t += 20) { await pg.clock.runFor(20); if (t === 1000) mid.push(await shown(pg, "#assistantIconSpark")); }
  await pg.evaluate(() => setOrbState("idle"));
  const flipsAtEnd = await pg.evaluate(() => window.AriaStar.mouthFlips());
  await pg.clock.runFor(3000);
  const r = await pg.evaluate(() => ({ flips: window.AriaStar.mouthFlips(), log: window.AriaStar.trace }));
  const head = await shown(pg, "#assistantIconSpark");
  await ctx.close();
  assert.equal(before, 0, "her mouth moved before she spoke");
  assert.equal(r.flips, flipsAtEnd, "her mouth kept moving after her audio ended");
  const talk = r.log.filter((e) => e.state === "speaking");
  assert.ok(talk.length >= 15, talk.length + " mouth frames in 3 s: " + JSON.stringify(r.log.map((e) => [e.t % 100000, e.state, e.frame])));
  for (const e of talk) assert.ok(e.frame === "talk1" || e.frame === "talk2", e.frame);
  for (let i = 1; i < talk.length; i++) {
    const d = talk[i].t - talk[i - 1].t;
    assert.ok(d >= 120 && d <= 180, "mouth swap after " + d + " ms");
    assert.notEqual(talk[i].frame, talk[i - 1].frame);
  }
  assert.equal(mid[0].state, "speaking");
  assert.equal(mid[0].on.length, 1); assert.match(mid[0].on[0], /^talk[12]$/);
  /* back to idle: open eyes, or a blink caught in its 150 ms -- never a mouth frame */
  assert.equal(head.state, "idle"); assert.equal(head.on.length, 1); assert.match(head.on[0], /^(open|blink)$/);
});

await check("FIXTURE, LISTENING: the shopper typing (#assistantInput) or the live call hearing her (setOrbState('listening')) leans her in; blink still runs", async () => {
  const { ctx, pg } = await frozen();
  await pg.evaluate(() => toggleAssistant());
  await pg.focus("#assistantInput");
  await pg.keyboard.type("zapa");
  const typing = await shown(pg, "#assistantHeadFace .aria-star");
  const lean = await pg.evaluate(() => getComputedStyle(document.querySelector("#assistantHeadFace .aria-star-b")).animationName);
  if (SHOT_DIR) { await label(pg, FIXTURE + " Escuchando: se inclina hacia la persona que escribe."); await shot(pg, "390-fixture-listening"); }
  await pg.clock.runFor(1600);
  const quiet = await shown(pg, "#assistantHeadFace .aria-star");
  await pg.evaluate(() => setOrbState("listening"));
  const voice = await shown(pg, "#assistantHeadFace .aria-star");
  await pg.evaluate(() => setOrbState("idle"));
  await ctx.close();
  assert.equal(typing.state, "listening"); assert.equal(lean, "ariaStarLean");
  assert.equal(quiet.state, "idle", "she kept leaning 1.6 s after the last keystroke");
  assert.equal(voice.state, "listening");
});

await check("FIXTURE, THINKING then HAPPY: setOrbState('thinking') / the typing row tilt and pulse her; product cards landing (rememberShownProduct) give the smile + hop, then idle", async () => {
  const { ctx, pg } = await frozen();
  await pg.evaluate(() => toggleAssistant());
  await pg.evaluate(() => { setOrbState("thinking"); showAssistantTyping(); });
  const think = await shown(pg, "#assistantHeadFace .aria-star");
  const anim = await pg.evaluate(() => getComputedStyle(document.querySelector("#assistantHeadFace .aria-star-b")).animationName);
  if (SHOT_DIR) { await label(pg, FIXTURE + " Pensando: inclinada, con pulso suave."); await shot(pg, "390-fixture-thinking"); }
  await pg.evaluate(() => {
    hideAssistantTyping(); setOrbState("idle");
    const card = document.createElement("div");
    rememberShownProduct({ name: "fixture" }, "fixture", card);
  });
  const happy = await shown(pg, "#assistantHeadFace .aria-star");
  if (SHOT_DIR) { await label(pg, FIXTURE + " Feliz: llegan productos (cuadro morado = sonrisa)."); await shot(pg, "390-fixture-happy"); }
  await pg.clock.runFor(1300);
  const back = await shown(pg, "#assistantHeadFace .aria-star");
  await ctx.close();
  assert.deepEqual(think, { on: ["open"], state: "thinking" }); /* no blink while thinking */
  assert.equal(anim, "ariaStarThink");
  assert.deepEqual(happy, { on: ["talk2"], state: "happy" });
  assert.equal(back.state, "idle"); assert.match(back.on.join(), /^(open|blink)$/);
});

await check("FIXTURE, prefers-reduced-motion: a still star in every state (no bob, no blink, no mouth, no pose), and only the open frame is downloaded", async () => {
  const { ctx, pg, hits } = await frozen({ reduced: true });
  await pg.clock.runFor(30000);
  const r = await pg.evaluate(() => {
    toggleAssistant();
    const out = {};
    const head = document.querySelector("#assistantHeadFace .aria-star");
    for (const s of ["speaking", "thinking", "listening"]) { setOrbState(s); out[s] = [head.getAttribute("data-state"), window.AriaStar.frame, getComputedStyle(head.querySelector(".aria-star-b")).animationName]; }
    setOrbState("idle");
    out.float = getComputedStyle(document.getElementById("ariaOrbFloat")).animationName;
    out.blinks = window.AriaStar.blinkCount(); out.flips = window.AriaStar.mouthFlips();
    return out;
  });
  await pg.clock.runFor(2000);
  await ctx.close();
  for (const s of ["speaking", "thinking", "listening"]) assert.deepEqual(r[s], ["idle", "open", "none"], s);
  assert.equal(r.float, "none"); assert.equal(r.blinks, 0); assert.equal(r.flips, 0);
  assert.deepEqual(faceHits(hits), [M.base + M.frames.open]);
});

await check("FIXTURE, 390px: she stays at the top of the open chat for the conversation, her messages and the typing row carry her face, the corner hides as the orb does, the X closes", async () => {
  const { ctx, pg, hits } = await open("index.html", { star: true });
  await pg.waitForFunction(() => window.AriaStar.blinkReady(), null, { timeout: 15000 });
  const before = faceHits(hits).length;
  await pg.click("#assistantBtn");
  await pg.waitForTimeout(400);
  const idle = await pg.evaluate(() => ({ anim: getComputedStyle(document.querySelector("#assistantHeadFace .aria-star-b")).animationName, corner: getComputedStyle(document.getElementById("assistantBtn")).display }));
  await pg.evaluate(() => { addAssistantMessage("bot", "Hola, soy Aria. ¿Qué estás buscando hoy?", null, { speak: false }); addAssistantMessage("user", "Zapatillas blancas"); addAssistantMessage("bot", "Mira estas opciones.", null, { speak: false }); showAssistantTyping(); });
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => {
    const panel = document.getElementById("assistantPanel").getBoundingClientRect();
    const head = document.querySelector("#assistantHeadFace .aria-star");
    const hb = head.getBoundingClientRect();
    const bots = [...document.querySelectorAll("#assistantMessages .ariaChatMsg:not(.ml-auto)")];
    const user = document.querySelector("#assistantMessages .ariaChatMsg.ml-auto");
    return {
      head: { w: hb.width, h: hb.height, inPanelTop: hb.top >= panel.top && hb.bottom <= panel.top + 110, shown: hb.width > 0 },
      imgs: [...head.querySelectorAll("img")].map((i) => i.getAttribute("src") || ""),
      svg: getComputedStyle(document.querySelector("#assistantHeadFace > svg")).display,
      name: document.querySelector("#assistantHeadFace").nextElementSibling.textContent.includes("Asistente Aria"),
      avatars: bots.map((b) => getComputedStyle(b, "::before").backgroundImage),
      userAvatar: getComputedStyle(user, "::before").content,
      typing: getComputedStyle(document.getElementById("assistantTyping"), "::before").backgroundImage,
      closeBtn: document.querySelector("[data-assistant-close]").getBoundingClientRect().width,
    };
  });
  await label(pg, FIXTURE + " Chat abierto: ella arriba, junto a sus mensajes y en «escribiendo».");
  await shot(pg, "390-fixture-chat-open");
  /* a long conversation: she is still at the top after the list scrolls */
  await pg.evaluate(() => { for (let i = 0; i < 12; i++) addAssistantMessage(i % 2 ? "user" : "bot", "Mensaje " + i, null, { speak: false }); });
  const stays = await pg.evaluate(() => { const hb = document.querySelector("#assistantHeadFace .aria-star").getBoundingClientRect(); return hb.width > 0 && hb.top >= document.getElementById("assistantPanel").getBoundingClientRect().top; });
  const after = faceHits(hits).length;
  await pg.click("[data-assistant-close]");
  await pg.waitForTimeout(300);
  const c = await pg.evaluate(() => ({ hidden: document.getElementById("assistantPanel").classList.contains("hidden"), corner: getComputedStyle(document.getElementById("assistantBtn")).display !== "none", face: !document.getElementById("assistantIconSpark").classList.contains("hidden") }));
  await ctx.close();
  assert.equal(idle.anim, "ariaStarIdle", "her place in the chat is not idling");
  assert.equal(idle.corner, "none", "the corner launcher does not hide on the phone sheet as the orb does");
  assert.ok(r.head.shown && r.head.inPanelTop, JSON.stringify(r.head));
  assert.equal(r.head.w, 64);
  assert.ok(r.name); assert.equal(r.svg, "none");
  assert.ok(r.imgs[0].endsWith(M.base + M.frames.open), r.imgs.join(", "));
  assert.equal(r.avatars.length, 2);
  for (const a of r.avatars) assert.ok(a.includes(M.base + M.frames.open), "no face beside her message: " + a);
  assert.equal(r.userAvatar, "none", "the shopper's message got her face");
  assert.ok(r.typing.includes(M.base + M.frames.open), "no face on the typing row");
  assert.ok(r.closeBtn >= 44, "the X is gone");
  assert.ok(stays, "she left the top of the chat");
  assert.equal(after, before, "opening the chat downloaded more face files");
  assert.deepEqual(c, { hidden: true, corner: true, face: true });
});

await check("FIXTURE, desktop: the corner follows today's orb behaviour while the chat is open (turns into its X); tapping it or the header X closes", async () => {
  const { ctx, pg } = await open("index.html", { star: true, width: 1280 });
  await pg.click("#assistantBtn");
  const r = await pg.evaluate(() => ({ open: !document.getElementById("assistantPanel").classList.contains("hidden"), spark: document.getElementById("assistantIconSpark").classList.contains("hidden"), x: document.getElementById("assistantIconClose").classList.contains("hidden"), head: document.querySelector("#assistantHeadFace .aria-star").getBoundingClientRect().width }));
  await pg.click("#assistantBtn");
  const closed = await pg.evaluate(() => document.getElementById("assistantPanel").classList.contains("hidden"));
  await pg.click("#assistantBtn");
  await pg.click("[data-assistant-close]");
  const closed2 = await pg.evaluate(() => ({ hidden: document.getElementById("assistantPanel").classList.contains("hidden"), face: !document.getElementById("assistantIconSpark").classList.contains("hidden") }));
  await ctx.close();
  assert.deepEqual(r, { open: true, spark: true, x: false, head: 64 });
  assert.ok(closed);
  assert.deepEqual(closed2, { hidden: true, face: true });
});

await check("FIXTURE, every other page: the corner launcher is her (80px, no ball), drawn from the same four frames, and never requests the orb", async () => {
  const { ctx, pg, hits } = await open("nosotros.html", { star: true });
  await pg.waitForFunction(() => window.AriaStar.blinkReady(), null, { timeout: 15000 });
  const r = await pg.evaluate(() => {
    const a = document.getElementById("ariaLauncher");
    const s = a.querySelector(".aria-star");
    const i = s && s.querySelector("img");
    const b = a.getBoundingClientRect();
    return { star: !!s, pic: !!a.querySelector("picture"), radius: i && getComputedStyle(i).borderRadius, w: Math.round(b.width), right: Math.round(innerWidth - b.right), filter: getComputedStyle(a).filter, href: a.getAttribute("href") };
  });
  await label(pg, FIXTURE + " Lanzador en otra página.");
  await shot(pg, "390-fixture-other-page");
  await ctx.close();
  assert.deepEqual(r, { star: true, pic: false, radius: "0px", w: 80, right: 12, filter: "none", href: "/?aria=1" });
  assert.deepEqual(faceHits(hits).sort(), starFiles());
});

/* ==================================================================
   THE REAL FRAMES (Lucifer's delivery, data/aria-brand dae5152), once
   imported. Skipped, and said so, while the repo has no manifest.
   ================================================================== */
const REALS = "FOTOGRAMAS REALES de Aria.";
const realFiles = () => NAMES.map((k) => REAL.base + REAL.frames[k]).sort();
await check("REAL: the four imported frames are 240px WebP at most 40 KB each; the 1600px masters are never referenced and are forced 404", () => {
  if (!REAL) { console.log("         (skipped: no frames imported yet)"); return; }
  assert.deepEqual(Object.keys(REAL.frames), NAMES);
  for (const k of NAMES) {
    const f = REAL.files.find((x) => x.file === REAL.frames[k]);
    const buf = readFileSync(join("assets/aria/star", f.file));
    const sz = IMP.imageSize(buf);
    assert.equal(sz.type, "webp"); assert.equal(sz.width, 240); assert.equal(sz.height, 240);
    assert.ok(buf.length <= 40960, `${k}: ${buf.length} bytes`);
    assert.equal(buf.length, f.bytes);
  }
  const refs = [];
  for (const f of readdirSync(ROOT).filter((x) => /\.(html|js)$/.test(x))) if (/assets\/aria-star\//.test(readFileSync(f, "utf8"))) refs.push(f);
  for (const f of readdirSync("assets/js")) if (/assets\/aria-star\//.test(readFileSync(join("assets/js", f), "utf8"))) refs.push(f);
  if (/assets\/aria-star\//.test(BUNDLE)) refs.push(BUNDLE_NAME);
  assert.deepEqual(refs, [], "a page names a master");
  assert.match(readFileSync("netlify.toml", "utf8"), /\[\[redirects\]\]\n  from = "\/assets\/aria-star\/\*"\n  to = "\/404"\n  status = 404\n  force = true/);
  assert.deepEqual(readFileSync("favicon.ico"), readFileSync("assets/aria/star/favicon.ico"));
  for (const f of ["index.html", "terminos.html", "privacidad.html", "checkout.html"]) assert.match(readFileSync(f, "utf8"), /<link rel="icon" type="image\/png" sizes="32x32" href="\/assets\/aria\/star\/favicon-32\.png">/, f);
});

await check("REAL, 390px: every slot and every state with her real frames; four frame requests, once each, no master, no orb", async () => {
  if (!REAL) { console.log("         (skipped: no frames imported yet)"); return; }
  const clipHead = async (pg, name) => {
    if (!SHOT_DIR) return;
    const b = await pg.evaluate(() => { const r = document.getElementById("assistantPanel").getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top), width: innerWidth, height: 150 }; });
    await pg.screenshot({ path: join(SHOT_DIR, `aria-star-real-${name}-header.png`), clip: b });
  };
  const ln = async (pg, t) => label(pg, REALS + " " + t);
  /* the corner, home and another page */
  {
    const { ctx, pg, hits } = await open("index.html", { star: "real" });
    await pg.waitForFunction(() => window.AriaStar && window.AriaStar.blinkReady(), null, { timeout: 15000 });
    await ln(pg, "Lanzador: ella en la esquina.");
    if (SHOT_DIR) { await pg.screenshot({ path: join(SHOT_DIR, "aria-star-real-launcher.png") }); await pg.screenshot({ path: join(SHOT_DIR, "aria-star-real-launcher-zoom.png"), clip: { x: 390 - 130, y: 844 - 130, width: 130, height: 130 } }); }
    const face = faceHits(hits);
    await ctx.close();
    assert.deepEqual(face.sort(), realFiles(), face.join(", "));
    assert.ok(!hits.list.some((h) => /\/assets\/aria-star\//.test(h.p)), "a master was requested");
  }
  {
    const { ctx, pg } = await open("producto.html", { star: "real" });
    await pg.waitForTimeout(800);
    await ln(pg, "Lanzador en la página de producto.");
    await shot(pg, "real-launcher-producto");
    await ctx.close();
  }
  /* the open chat: header presence, avatars, the typing row (loader) */
  {
    const { ctx, pg } = await open("index.html", { star: "real" });
    await pg.waitForFunction(() => window.AriaStar.blinkReady(), null, { timeout: 15000 });
    await pg.click("#assistantBtn");
    await pg.waitForTimeout(400);
    await pg.evaluate(() => { addAssistantMessage("bot", "Hola, soy Aria. ¿Qué estás buscando hoy?", null, { speak: false }); addAssistantMessage("user", "Zapatillas blancas"); addAssistantMessage("bot", "Mira estas opciones.", null, { speak: false }); showAssistantTyping(); });
    await pg.waitForTimeout(300);
    await ln(pg, "Chat abierto: arriba, junto a sus mensajes y en «escribiendo».");
    await shot(pg, "real-chat-open");
    if (SHOT_DIR) { const b = await pg.evaluate(() => { const r = document.getElementById("assistantMessages").getBoundingClientRect(); return { x: 0, y: r.top, width: innerWidth, height: Math.min(260, r.height) }; }); await pg.screenshot({ path: join(SHOT_DIR, "aria-star-real-avatar-loader.png"), clip: b }); }
    await ctx.close();
  }
  /* the states, on a frozen clock */
  {
    const { ctx, pg } = await frozen({ star: "real" });
    await pg.evaluate(() => toggleAssistant());
    await pg.evaluate(() => { for (const el of document.querySelectorAll("#assistantMessages > *")) el.remove(); });
    const st = async () => (await shown(pg, "#assistantHeadFace .aria-star"));
    const seen = {};
    seen.idle = await st();
    await ln(pg, "Reposo."); await shot(pg, "real-state-idle"); await clipHead(pg, "idle");
    for (let t = 0; t < 6000 && !(await pg.evaluate(() => window.AriaStar.frame === "blink")); t += 20) await pg.clock.runFor(20);
    seen.blink = await st();
    await ln(pg, "Parpadeo."); await shot(pg, "real-state-blink"); await clipHead(pg, "blink");
    await pg.clock.runFor(400);
    await pg.evaluate(() => setOrbState("speaking"));
    for (const want of ["talk1", "talk2"]) {
      for (let t = 0; t < 1000 && (await pg.evaluate(() => window.AriaStar.frame)) !== want; t += 10) await pg.clock.runFor(10);
      seen[want] = await st();
      await ln(pg, `Hablando (${want === "talk1" ? "boca abierta" : "sonrisa"}).`); await shot(pg, "real-state-speaking-" + want); await clipHead(pg, "speaking-" + want);
    }
    await pg.evaluate(() => setOrbState("idle"));
    await pg.focus("#assistantInput"); await pg.keyboard.type("zapa");
    seen.listening = await st();
    await ln(pg, "Escuchando: la persona escribe."); await shot(pg, "real-state-listening"); await clipHead(pg, "listening");
    await pg.clock.runFor(1600);
    await pg.evaluate(() => { document.getElementById("assistantInput").value = ""; setOrbState("thinking"); showAssistantTyping("Buscando…"); });
    seen.thinking = await st();
    await ln(pg, "Pensando: busca productos."); await shot(pg, "real-state-thinking"); await clipHead(pg, "thinking");
    await pg.evaluate(() => { hideAssistantTyping(); setOrbState("idle"); rememberShownProduct({ name: "x" }, "x", document.createElement("div")); });
    seen.happy = await st();
    await ln(pg, "Feliz: llegan productos."); await shot(pg, "real-state-happy"); await clipHead(pg, "happy");
    await ctx.close();
    assert.equal(seen.idle.state, "idle"); assert.deepEqual(seen.idle.on, ["open"]);
    assert.deepEqual(seen.blink.on, ["blink"]);
    assert.deepEqual(seen.talk1, { on: ["talk1"], state: "speaking" });
    assert.deepEqual(seen.talk2, { on: ["talk2"], state: "speaking" });
    assert.equal(seen.listening.state, "listening");
    assert.equal(seen.thinking.state, "thinking");
    assert.deepEqual(seen.happy, { on: ["talk2"], state: "happy" });
  }
  /* the favicon, as a browser tab draws it */
  if (SHOT_DIR) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 420 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await pg.goto(url("real") + "/terminos.html", { waitUntil: "domcontentloaded" });
    const B = REAL.base;
    await pg.setContent(`<body style="margin:0;font:600 13px system-ui;background:#fff;color:#0A1F44">
      <div style="background:#B42318;color:#fff;padding:6px 9px">${REALS} Favicon a su tamaño real y ampliado.</div>
      <div style="display:flex;gap:6px;padding:10px;background:#dee1e6"><div style="display:flex;align-items:center;gap:8px;background:#fff;border-radius:8px 8px 0 0;padding:8px 12px"><img src="${B}favicon-16.png" width="16" height="16">Aria Shop</div></div>
      <div style="display:flex;gap:6px;padding:10px;background:#202124;color:#e8eaed"><div style="display:flex;align-items:center;gap:8px;background:#35363a;border-radius:8px 8px 0 0;padding:8px 12px"><img src="${B}favicon-16.png" width="16" height="16">Aria Shop (tema oscuro)</div></div>
      <div style="display:flex;gap:18px;align-items:flex-end;padding:14px">
        <figure style="margin:0;text-align:center"><img src="${B}favicon-16.png" width="128" height="128" style="image-rendering:pixelated;border:1px solid #ccc"><figcaption>16 px x8</figcaption></figure>
        <figure style="margin:0;text-align:center"><img src="${B}favicon-32.png" width="96" height="96" style="image-rendering:pixelated;border:1px solid #ccc"><figcaption>32 px x3</figcaption></figure>
        <figure style="margin:0;text-align:center"><img src="${B}favicon-48.png" width="48" height="48" style="border:1px solid #ccc"><figcaption>48 px</figcaption></figure>
      </div></body>`);
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: join(SHOT_DIR, "aria-star-real-favicon.png") });
    await ctx.close();
  }
});

await check("no <video> element is ever in the page, orb or star, chat closed or open", async () => {
  for (const star of [false, true, "real"]) {
    const { ctx, pg, hits } = await open("index.html", { star });
    const n = await pg.evaluate(() => { toggleAssistant(); return document.querySelectorAll("video").length; });
    await ctx.close();
    assert.equal(n, 0);
    assert.ok(!hits.types.some((h) => h.type === "media" || /\.(mp4|webm|mov)(\?|$)/.test(h.p)));
  }
});

await browser.close();
for (const s of Object.values(SERVERS)) s.close();
rmSync(TMP, { recursive: true, force: true });

const MIN_CHECKS = 31;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
