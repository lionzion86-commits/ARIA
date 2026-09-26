#!/usr/bin/env node
/* build-parts-glossary-inline.mjs
   Regenerates the AUTO_PART_TERMS_ES_EN block in index.html from the
   canonical shared module scripts/lib/es-en-parts-glossary.json.

   The JSON is SHARED INFRASTRUCTURE: the future Aria AI assistant imports
   it directly for part-name translation/recognition, so nothing about its
   structure is search-specific. This script only flattens it into the
   [es, en] pair list the browser search consumes. Do not hand-edit the
   inline block — edit the JSON and re-run this.

   Usage: node scripts/build-parts-glossary-inline.mjs
   It prints the replacement block to stdout; splice it into index.html
   between the GLOSSARY-BLOCK-START / GLOSSARY-BLOCK-END markers. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const glossary = JSON.parse(readFileSync(join(here, 'lib', 'es-en-parts-glossary.json'), 'utf8'));

const CATEGORIES = new Set(['brakes','filters','fluids','ignition','electrical','lighting',
  'cooling','fuel','exhaust','belts','suspension','steering','drivetrain',
  'transmission','wipers','body','wheels','sensors']);

const seen = new Map(); // normalized es -> entry es (dup detection)
const pairs = [];
for (const e of glossary.entries){
  if (!e.es || !Array.isArray(e.en) || !e.en.length)
    throw new Error(`Entry missing es/en: ${JSON.stringify(e)}`);
  if (!CATEGORIES.has(e.category))
    throw new Error(`Unknown category "${e.category}" on "${e.es}"`);
  const terms = [e.es, ...(e.synonyms_es || [])];
  for (const t of terms){
    const k = t.toLowerCase();
    if (seen.has(k)) throw new Error(`Duplicate Spanish term "${t}" (in "${e.es}" and "${seen.get(k)}")`);
    seen.set(k, e.es);
    pairs.push([t, e.en[0]]);
  }
}

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const lines = pairs.map(([es, en]) => `  [${q(es)}, ${q(en)}],`);

const out = `/* ==== GLOSSARY-BLOCK-START — GENERATED from scripts/lib/es-en-parts-glossary.json (v${glossary.version}).
      DO NOT HAND-EDIT. Edit the JSON and re-run: node scripts/build-parts-glossary-inline.mjs
      This glossary is SHARED INFRASTRUCTURE: the future Aria AI assistant imports the same
      JSON file as-is for part-name translation and recognition. Do not rebuild it as a
      duplicate list anywhere else. ==== */
const AUTO_PART_TERMS_ES_EN = [
${lines.join('\n')}
].sort((a, b) => b[0].length - a[0].length);
/* ==== GLOSSARY-BLOCK-END ==== */`;
console.log(out);
console.error(`ok: ${glossary.entries.length} concepts, ${pairs.length} flat pairs, glossary v${glossary.version}`);
