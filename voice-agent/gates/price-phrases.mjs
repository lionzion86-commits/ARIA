/* ============================================================
   THE FIRST GATE'S EXAM: DOES SHE HEAR THE NUMBER HE SAID?
   (#443 c.6399639486: "FIRST TEST GATE: STT Spanish number accuracy
   (prices!) before any full-conversation work.")

   A misheard price is the worst mistake a voice can make in a shop:
   "quinientos" heard as "cincuenta" is a budget ten times too small
   and a shelf of wrong products. These are the ways a Peruvian shopper
   says money and sizes -- soles and dólares, lucas, céntimos, mil,
   ranges, talla y medio -- each with the numbers the transcript must
   carry. stt-numbers.mjs speaks each one in the cast voice, hears it
   with the production ears, and scores it here.
   ============================================================ */

export const PHRASES = Object.freeze([
  { say: "Quiero unas zapatillas por menos de quinientos soles.", expect: [500] },
  { say: "Mi presupuesto es de mil doscientos cincuenta soles.", expect: [1250] },
  { say: "¿Cuánto cuesta en dólares? ¿Ciento veinte?", expect: [120] },
  { say: "Algo que cueste ochenta y nueve con noventa.", expect: [89.9] },
  { say: "Tengo dos mil lucas para el regalo.", expect: [2000] },
  { say: "Entre trescientos y cuatrocientos soles, por favor.", expect: [300, 400] },
  { say: "Busco un perfume de hasta sesenta dólares.", expect: [60] },
  { say: "La talla cuarenta y dos en zapatillas Nike.", expect: [42] },
  { say: "Calzo nueve y medio americano.", expect: [9.5] },
  { say: "¿Me sale menos de setecientos noventa y nueve soles con el envío?", expect: [799] },
  { say: "Quiero gastar como mucho tres mil quinientos.", expect: [3500] },
  { say: "Un juguete de veinticinco dólares para mi hija de seis años.", expect: [25, 6] },
  { say: "Dos pares, cada uno a ciento cuarenta y nueve soles.", expect: [2, 149] },
  { say: "Lo vi a quince dólares con noventa y nueve centavos.", expect: [15.99] },
  { say: "Muéstrame celulares de menos de mil dólares.", expect: [1000] },
  { say: "Necesito una casaca talla mediana por doscientos soles.", expect: [200] },
  { say: "¿Cuánto es cuatrocientos cincuenta en soles?", expect: [450] },
  { say: "El modelo del año dos mil veinte de la Toyota.", expect: [2020] },
  { say: "Tres polos de diecinueve noventa cada uno.", expect: [3, 19.9] },
  { say: "Hasta seiscientos sesenta y seis soles nomás.", expect: [666] },
]);

/* "dos mil" may come back as "2 mil"; "nueve y medio" as "9 y medio". */
const WORD_MULT = /(\d+(?:[.,]\d+)?)\s+mil\b/gi;
const AND_HALF = /(\d+)\s+y\s+medio\b/gi;

/**
 * The numbers in a transcript, as numbers. Group separators are read
 * the Peruvian way and the American way alike ("1.250", "1,250" and
 * "1 250" are all 1250; "89,90" and "89.90" are both 89.9).
 */
export function numbersIn(text) {
  let s = String(text || "");
  s = s.replace(AND_HALF, (_, n) => `${n}.5`);
  s = s.replace(WORD_MULT, (_, n) => String(Math.round(parseNum(n) * 1000)));
  const out = [];
  for (const m of s.matchAll(/\d+(?:[ .,]\d+)*/g)) out.push(parseNum(m[0]));
  return out.filter((n) => Number.isFinite(n));
}

function parseNum(raw) {
  let t = String(raw).trim();
  /* digits grouped by spaces in threes are thousands */
  if (/^\d{1,3}( \d{3})+$/.test(t)) return Number(t.replace(/ /g, ""));
  t = t.split(" ")[0];
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  const sep = Math.max(lastDot, lastComma);
  if (sep === -1) return Number(t);
  const tail = t.slice(sep + 1);
  const head = t.slice(0, sep).replace(/[.,]/g, "");
  /* one or two digits after the last separator: decimals; three: thousands */
  return tail.length === 3 ? Number(head + tail) : Number(head + "." + tail);
}

/** Every expected number heard, exactly. */
export function scorePhrase(transcript, expect) {
  const heard = numbersIn(transcript);
  const missing = expect.filter((n) => !heard.some((h) => Math.abs(h - n) < 0.001));
  return { ok: missing.length === 0, heard, missing };
}

export const MIN_ACCURACY_DEFAULT = 0.95;
