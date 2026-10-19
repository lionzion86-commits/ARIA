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
/* Round-robin by store, each store's biggest markdowns first -- the same
   head scripts/build-ofertas-feed.mjs writes, so the first paint is every
   store, not the first four in the file. */
const byStore = new Map();
for (const it of feed.items) (byStore.get(it.retailer) || byStore.set(it.retailer, []).get(it.retailer)).push(it);
for (const list of byStore.values()) list.sort((a, b) => (1 - a.price / a.originalPrice) < (1 - b.price / b.originalPrice) ? 1 : -1);
const lists = [...byStore.values()];
const head = [];
for (let i = 0; head.length < Math.min(LITE_N, feed.items.length); i++)
  for (const l of lists) if (l[i] && head.length < LITE_N) head.push(l[i]);
const lite = {
  generatedAt: feed.generatedAt,
  count: head.length,
  /* The Ofertas department's own all-stores count (#386): the homepage's
     "Ver todo N ofertas" reads it from this file. */
  ...(feed.deptTotal ? { deptTotal: feed.deptTotal } : {}),
  lite: true,
  items: head,
};
writeFileSync(join(root, 'ofertas-feed-lite.json'), JSON.stringify(lite));
const fullMB = (statSync(join(root, 'ofertas-feed.json')).size / 1048576).toFixed(2);
const liteKB = Math.round(statSync(join(root, 'ofertas-feed-lite.json')).size / 1024);
console.log(`ofertas-feed-lite.json: ${lite.count} items, ${liteKB}KB (full: ${fullMB}MB)`);
