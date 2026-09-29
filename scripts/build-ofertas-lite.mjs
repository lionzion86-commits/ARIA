#!/usr/bin/env node
/* Build ofertas-feed-lite.json from ofertas-feed.json.
 *
 * The lite feed is the first 800 items of the full feed -- what the
 * homepage needs to paint the Ofertas rail and the first pages of the
 * deals grid. At ~650KB it downloads and parses ~7x faster than the
 * full ~5MB feed on a phone; the full feed merges in on idle.
 *
 * REGENERATE THIS whenever ofertas-feed.json is rebuilt, or the lite
 * file serves stale deals:
 *   node scripts/build-ofertas-lite.mjs
 */
import { readFileSync, writeFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LITE_N = 800;

const feed = JSON.parse(readFileSync(join(root, 'ofertas-feed.json'), 'utf8'));
const lite = {
  generatedAt: feed.generatedAt,
  count: Math.min(LITE_N, feed.items.length),
  lite: true,
  items: feed.items.slice(0, LITE_N),
};
writeFileSync(join(root, 'ofertas-feed-lite.json'), JSON.stringify(lite));
const fullMB = (statSync(join(root, 'ofertas-feed.json')).size / 1048576).toFixed(2);
const liteKB = Math.round(statSync(join(root, 'ofertas-feed-lite.json')).size / 1024);
console.log(`ofertas-feed-lite.json: ${lite.count} items, ${liteKB}KB (full: ${fullMB}MB)`);
