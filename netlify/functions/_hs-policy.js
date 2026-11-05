// ARIA HOME SHIELD -- policy reading: PDF text layer + flag extraction.
// Underscore: not an endpoint (hs-policy-review uses it).
//
// TEXT LAYER ONLY, NO OCR, NO DEPENDENCY. extractPdfText() walks the PDF's
// content streams (FlateDecode inflated with node:zlib), reads the text
// operators (Tj, TJ, ', ") from literal and hex strings, and maps hex
// glyph codes through any ToUnicode CMaps it finds. A scanned policy (just
// images) yields no text, and the review says so honestly instead of
// guessing.
//
// policyFindings() is deliberately plain pattern-reading over that text:
// the deductibles (all-perils, hurricane, wind/hail), roof settlement
// (actual cash value vs replacement cost), the common exclusions, water /
// mold sublimits, ordinance or law, matching, and loss of use. Each finding
// is "strong", "weak" or "note"; missing items become "improve" prompts.
// General information, not legal advice -- the copy says so.
import { inflateSync, inflateRawSync } from "node:zlib";

/* ---------------------------------------------------------------- PDF */
function inflate(buf) {
  try { return inflateSync(buf); } catch { /* try raw */ }
  try { return inflateRawSync(buf); } catch { return null; }
}

function readLiteral(s, i) {
  /* s[i] === "(" ; returns [string, nextIndex] */
  let depth = 1, out = "";
  i++;
  while (i < s.length && depth > 0) {
    const ch = s[i];
    if (ch === "\\") {
      const n = s[i + 1];
      const map = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      if (n in map) { out += map[n]; i += 2; continue; }
      if (/[0-7]/.test(n)) {
        let oct = n, j = i + 2;
        while (oct.length < 3 && /[0-7]/.test(s[j])) oct += s[j++];
        out += String.fromCharCode(parseInt(oct, 8));
        i = j; continue;
      }
      if (n === "\r" || n === "\n") { i += 2; if (n === "\r" && s[i] === "\n") i++; continue; }
      i += 2; continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") { depth--; if (depth === 0) { i++; break; } }
    out += ch; i++;
  }
  return [out, i];
}

function hexToBytes(h) {
  const clean = h.replace(/[^0-9a-fA-F]/g, "");
  const even = clean.length % 2 ? clean + "0" : clean;
  const out = [];
  for (let i = 0; i < even.length; i += 2) out.push(parseInt(even.slice(i, i + 2), 16));
  return out;
}

/** Parse every ToUnicode-style CMap found in the decoded streams into one code->text map. */
function parseCMaps(streams) {
  const map2 = new Map(), map1 = new Map();
  const put = (srcHex, str) => (srcHex.length > 2 ? map2 : map1).set(parseInt(srcHex, 16), str);
  const u16 = (hex) => {
    const b = hexToBytes(hex);
    let s = "";
    for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
    return s;
  };
  for (const s of streams) {
    if (!/begincmap/.test(s)) continue;
    for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) put(m[1], u16(m[2]));
    }
    for (const block of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
        const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
        if (hi - lo > 5000) continue;
        if (m[3].startsWith("<")) {
          const base = u16(m[3].slice(1, -1));
          const last = base.charCodeAt(base.length - 1);
          for (let c = lo; c <= hi; c++) put(c.toString(16).padStart(m[1].length, "0"), base.slice(0, -1) + String.fromCharCode(last + (c - lo)));
        } else {
          const items = [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => u16(x[1]));
          items.forEach((t, k) => put((lo + k).toString(16).padStart(m[1].length, "0"), t));
        }
      }
    }
  }
  return { map1, map2 };
}

function decodeHex(hex, cmap) {
  const b = hexToBytes(hex);
  if (cmap.map2.size && b.length % 2 === 0) {
    let s = "";
    for (let i = 0; i < b.length; i += 2) { const code = (b[i] << 8) | b[i + 1]; s += cmap.map2.get(code) ?? ""; }
    if (s) return s;
  }
  if (cmap.map1.size) return b.map((x) => cmap.map1.get(x) ?? String.fromCharCode(x)).join("");
  return b.map((x) => String.fromCharCode(x)).join("");
}

/** Text from one content stream. */
function textFromContent(s, cmap) {
  let out = "";
  let i = 0;
  const pending = [];
  const n = s.length;
  while (i < n) {
    const ch = s[i];
    if (ch === "(") { const [str, j] = readLiteral(s, i); pending.push(cmap.map1.size ? [...str].map((c) => cmap.map1.get(c.charCodeAt(0)) ?? c).join("") : str); i = j; continue; }
    if (ch === "<" && s[i + 1] !== "<") { const j = s.indexOf(">", i); if (j < 0) break; pending.push(decodeHex(s.slice(i + 1, j), cmap)); i = j + 1; continue; }
    if (ch === "[") { pending.push("["); i++; continue; }
    if (ch === "]") { pending.push("]"); i++; continue; }
    if (ch === "%") { const j = s.indexOf("\n", i); i = j < 0 ? n : j; continue; }
    if (/[-+.\d]/.test(ch)) {
      const m = /^[-+]?\d*\.?\d+/.exec(s.slice(i, i + 20));
      if (m) { pending.push(Number(m[0])); i += m[0].length; continue; }
    }
    if (/[A-Za-z'"*]/.test(ch)) {
      const m = /^[A-Za-z'"*]+/.exec(s.slice(i, i + 10));
      const op = m[0];
      i += op.length;
      if (op === "Tj" || op === "'" || op === '"') {
        const str = pending.filter((x) => typeof x === "string" && x !== "[" && x !== "]").pop() || "";
        if (op !== "Tj") out += "\n";
        out += str;
      } else if (op === "TJ") {
        const start = pending.lastIndexOf("[");
        const arr = start >= 0 ? pending.slice(start + 1) : pending;
        for (const x of arr) {
          if (typeof x === "number") { if (x < -180) out += " "; }
          else if (x !== "]") out += x;
        }
      } else if (op === "Td" || op === "TD" || op === "Tm") {
        const nums = pending.filter((x) => typeof x === "number");
        const ty = op === "Tm" ? nums[nums.length - 1] : nums[nums.length - 1];
        out += ty && Math.abs(ty) > 0.5 ? "\n" : " ";
      } else if (op === "T*") out += "\n";
      else if (op === "ET") out += "\n";
      pending.length = 0;
      continue;
    }
    i++;
  }
  return out;
}

/** The PDF's text layer as one string ("" when there is none). */
export function extractPdfText(buf) {
  const bin = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (bin.slice(0, 5).toString("latin1") !== "%PDF-") return "";
  const s = bin.toString("latin1");
  const decoded = [];
  const rx = /<<((?:(?!>>\s*stream)[\s\S]){0,4000})>>\s*stream\r?\n/g;
  let m;
  while ((m = rx.exec(s))) {
    const dict = m[1];
    const start = m.index + m[0].length;
    const lenM = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    let end = lenM ? start + Number(lenM[1]) : -1;
    if (end < 0 || s.slice(end, end + 30).indexOf("endstream") < 0) end = s.indexOf("endstream", start);
    if (end < 0) break;
    rx.lastIndex = end;
    if (/\/Subtype\s*\/Image|\/Type\s*\/XObject[\s\S]*\/Image|\/DCTDecode|\/JPXDecode|\/CCITTFax/.test(dict)) continue;
    if (/\/Type\s*\/ObjStm|\/Type\s*\/XRef/.test(dict)) continue;
    const raw = bin.subarray(start, end);
    let data = raw;
    if (/\/FlateDecode/.test(dict)) { data = inflate(raw); if (!data) continue; }
    else if (/\/Filter/.test(dict)) continue;
    decoded.push(data.toString("latin1"));
  }
  const cmap = parseCMaps(decoded);
  let text = "";
  for (const d of decoded) {
    if (/begincmap/.test(d)) continue;
    if (!/\bBT\b/.test(d)) continue;
    text += textFromContent(d, cmap) + "\n";
  }
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/* ---------------------------------------------------------------- flags */
const L = {
  en: {
    hurricane: (p) => `Hurricane deductible: ${p}% of the dwelling limit`,
    wind: (p) => `Windstorm / hail deductible: ${p}`,
    aop: (v) => `All-other-perils deductible: ${v}`,
    roofAcv: "Roof losses are paid at actual cash value (depreciated), not full replacement cost",
    roofRcv: "Replacement cost coverage is in the policy (check that it applies to the roof)",
    exclusions: (l) => `Excludes: ${l}`,
    water: (v) => `Water / mold damage sublimit: ${v}`,
    ordinance: (p) => `Ordinance or Law coverage: ${p}`,
    ordinanceMissing: "No Ordinance or Law coverage found: code upgrades after a loss may be on you",
    matchingLimited: "Matching of undamaged materials is limited or excluded",
    matching: "The policy addresses matching of undamaged materials",
    lossOfUse: (v) => `Loss of use / additional living expense: ${v}`,
    lossOfUseMissing: "No loss-of-use (additional living expense) coverage found",
    rcvMissing: "Could not find replacement cost wording: ask whether the dwelling is covered at replacement cost",
    noText: "This file has no readable text layer (it looks like a scan or a photo), so it could not be read automatically. You can upload the PDF your insurer emailed you, or describe your declarations page to Aria.",
    notPdf: "Only PDF files can be read automatically. Photos of a policy are kept with your case for the professional you choose.",
    summary: (s, w, i) => `What looks strong: ${s || "nothing clear yet"}. What looks weak: ${w || "nothing clear yet"}. Where it can improve: ${i || "nothing obvious"}. This is general information, not legal advice; a licensed professional you choose makes the final call.`,
    excl: { flood: "flood", earth: "earth movement", mold: "mold / fungi", wear: "wear and tear", seepage: "repeated seepage or leakage", cosmetic: "cosmetic damage", neglect: "neglect" },
  },
  es: {
    hurricane: (p) => `Deducible de huracán: ${p}% del límite de la vivienda`,
    wind: (p) => `Deducible de viento / granizo: ${p}`,
    aop: (v) => `Deducible de otros riesgos: ${v}`,
    roofAcv: "Los daños al techo se pagan a valor real en efectivo (depreciado), no a costo de reemplazo",
    roofRcv: "La póliza incluye costo de reemplazo (confirma que aplique al techo)",
    exclusions: (l) => `Excluye: ${l}`,
    water: (v) => `Sublímite por agua / moho: ${v}`,
    ordinance: (p) => `Cobertura de ordenanza o ley: ${p}`,
    ordinanceMissing: "No encontramos cobertura de ordenanza o ley: las mejoras exigidas por código después de un daño podrían correr por tu cuenta",
    matchingLimited: "La igualación de materiales no dañados está limitada o excluida",
    matching: "La póliza menciona la igualación de materiales no dañados",
    lossOfUse: (v) => `Pérdida de uso / gastos adicionales de vivienda: ${v}`,
    lossOfUseMissing: "No encontramos cobertura de pérdida de uso (gastos adicionales de vivienda)",
    rcvMissing: "No encontramos texto de costo de reemplazo: pregunta si la vivienda está cubierta a costo de reemplazo",
    noText: "Este archivo no tiene una capa de texto legible (parece un escaneo o una foto), así que no se pudo leer automáticamente. Puedes subir el PDF que te envió tu aseguradora, o describirle a Aria tu página de declaraciones.",
    notPdf: "Solo los archivos PDF se pueden leer automáticamente. Las fotos de una póliza quedan guardadas en tu caso para el profesional que elijas.",
    summary: (s, w, i) => `Lo que se ve fuerte: ${s || "nada claro todavía"}. Lo que se ve débil: ${w || "nada claro todavía"}. Dónde puede mejorar: ${i || "nada evidente"}. Esto es información general, no asesoría legal; un profesional con licencia que tú elijas tiene la última palabra.`,
    excl: { flood: "inundación", earth: "movimiento de tierra", mold: "moho / hongos", wear: "desgaste", seepage: "filtraciones repetidas", cosmetic: "daño cosmético", neglect: "negligencia" },
  },
};

const money = (v) => "$" + v.replace(/[^\d,]/g, "");

/** Findings from the policy text: { findings:[{key,tone,label}], flags:[label], strong, weak, improve, plainSummary }. */
export function policyFindings(text, lang = "en") {
  const t = L[lang === "es" ? "es" : "en"];
  const src = String(text || "").replace(/\s+/g, " ");
  const low = src.toLowerCase();
  const f = [];
  const add = (key, tone, label) => { if (!f.some((x) => x.key === key)) f.push({ key, tone, label }); };

  let m = /hurricane deductible[^%$.]{0,80}?(\d{1,2}(?:\.\d+)?)\s*%/.exec(low) || /(\d{1,2}(?:\.\d+)?)\s*%\s*hurricane deductible/.exec(low);
  if (m) add("hurricane_deductible", Number(m[1]) >= 5 ? "weak" : "note", t.hurricane(m[1]));
  m = /(?:windstorm|wind(?:storm)? (?:or|and|\/) hail|wind\/hail)\s+deductible[^%$.]{0,60}?(\d{1,2}(?:\.\d+)?\s*%|\$\s?[\d,]{3,})/.exec(low);
  if (m) add("wind_deductible", /%/.test(m[1]) && parseFloat(m[1]) >= 5 ? "weak" : "note", t.wind(m[1].replace(/\s+/g, "")));
  m = /(?:all other perils?|aop)(?: deductible)?[^%$.]{0,40}?(\$\s?[\d,]{3,}|\d{1,2}(?:\.\d+)?\s*%)/.exec(low);
  if (m) add("aop_deductible", "note", t.aop(/%/.test(m[1]) ? m[1].replace(/\s+/g, "") : money(m[1])));

  const roofAcv = /roof[^.]{0,160}actual cash value|actual cash value[^.]{0,160}roof/.test(low);
  if (roofAcv) add("roof_acv", "weak", t.roofAcv);
  else if (/replacement cost/.test(low)) add("rcv", "strong", t.roofRcv);

  const ex = [];
  const exText = (low.match(/(?:we do not (?:insure|cover)|exclu\w*|not covered)[^]{0,1200}/g) || []).join(" ");
  const pool = exText || "";
  if (/\bflood|surface water/.test(pool)) ex.push(t.excl.flood);
  if (/earth movement|earthquake|sinkhole/.test(pool)) ex.push(t.excl.earth);
  if (/\bmold|fungi|fungus/.test(pool)) ex.push(t.excl.mold);
  if (/wear and tear|deterioration/.test(pool)) ex.push(t.excl.wear);
  if (/continuous or repeated|seepage/.test(pool)) ex.push(t.excl.seepage);
  if (/cosmetic/.test(pool)) ex.push(t.excl.cosmetic);
  if (/\bneglect/.test(pool)) ex.push(t.excl.neglect);
  if (ex.length) add("exclusions", "note", t.exclusions(ex.join(", ")));

  m = /(?:water|mold|fungi|fungus)[^.]{0,120}?(?:sub-?limit|limit(?:ed)? to|limit of|maximum of|will not exceed|up to)[^.$]{0,30}(\$\s?[\d,]{3,})/.exec(low);
  if (m) add("water_sublimit", "weak", t.water(money(m[1])));

  m = /ordinance or law[^%$.]{0,80}?(\d{1,3})\s*%/.exec(low);
  if (m) add("ordinance_law", Number(m[1]) >= 25 ? "strong" : "note", t.ordinance(`${m[1]}%`));
  else if (/ordinance or law/.test(low)) add("ordinance_law", "note", t.ordinance(lang === "es" ? "incluida (sin porcentaje claro)" : "included (no clear percentage)"));

  if (/matching|uniform (?:appearance|color)/.test(low)) {
    const limited = /(?:not|no|limited|exclude\w*)[^.]{0,80}(?:matching|uniform)|(?:matching|uniform)[^.]{0,80}(?:not (?:covered|required|pay)|limited|exclude)/.test(low);
    add("matching", limited ? "weak" : "note", limited ? t.matchingLimited : t.matching);
  }

  m = /(?:loss of use|additional living expense|coverage d)[^.$%]{0,60}?(\$\s?[\d,]{3,}|\d{1,3}\s*%)/.exec(low);
  if (m) add("loss_of_use", "strong", t.lossOfUse(/%/.test(m[1]) ? m[1].replace(/\s+/g, "") : money(m[1])));
  else if (/loss of use|additional living expense/.test(low)) add("loss_of_use", "note", t.lossOfUse(lang === "es" ? "incluida" : "included"));

  const improve = [];
  if (!f.some((x) => x.key === "ordinance_law")) improve.push(t.ordinanceMissing);
  if (!f.some((x) => x.key === "loss_of_use")) improve.push(t.lossOfUseMissing);
  if (!/replacement cost/.test(low)) improve.push(t.rcvMissing);
  const strong = f.filter((x) => x.tone === "strong").map((x) => x.label);
  const weak = f.filter((x) => x.tone === "weak").map((x) => x.label);
  return {
    findings: f,
    flags: f.map((x) => x.label),
    strong, weak, improve,
    plainSummary: t.summary(strong.join("; "), weak.join("; "), improve.join("; ")),
  };
}

export const noTextMessage = (lang) => L[lang === "es" ? "es" : "en"].noText;
export const notPdfMessage = (lang) => L[lang === "es" ? "es" : "en"].notPdf;
