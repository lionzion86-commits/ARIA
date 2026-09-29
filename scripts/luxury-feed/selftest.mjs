#!/usr/bin/env node
/**
 * selftest.mjs — proves feed-to-catalog.mjs works end-to-end using a SYNTHETIC
 * feed written to /tmp. No real retailer data; nothing here is committed.
 * Run: node selftest.mjs
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const T = join(tmpdir(), 'luxury-feed-selftest');
mkdirSync(T, { recursive: true });

// Synthetic AWIN-shaped TSV: brand, price, image, sale, gender, junk rows
const rows = [
  ['aw_product_id', 'product_name', 'brand_name', 'search_price', 'rrp_price', 'merchant_image_url', 'aw_deep_link', 'description', 'merchant_category', 'colour', 'in_stock'],
  ['1', "Saint Laurent Monogramme Lou Belt Bag", 'Yves Saint Laurent', '1490.00', '1490.00', 'https://img.test/1.jpg', 'https://track.test/1', '<p>Quilted calfskin belt bag.</p>', "Women's Handbags", 'Black', '1'],
  ['2', 'Gucci Marmont Matelasse Shoulder Bag', 'Gucci', '1980.00', '2450.00', 'https://img.test/2.jpg', 'https://track.test/2', 'Chevron leather shoulder bag.', "Women's Handbags", 'Red', '1'],
  ['3', 'Burberry Check Cashmere Scarf', 'Burberry', '470.00', '', 'https://img.test/3.jpg', 'https://track.test/3', 'Iconic check scarf.', 'Unisex Accessories', 'Beige', '1'],
  ['4', "Men's Valentino Garavani Sneakers", 'Valentino', '795.00', '795.00', 'https://img.test/4.jpg', 'https://track.test/4', 'Leather sneakers.', "Men's Shoes", 'White', '1'],
  ['5', 'Coach Pebble Leather Tote', 'COACH', '328.00', '450.00', 'https://img.test/5.jpg', 'https://track.test/5', 'Everyday tote.', "Women's Bags", 'Brown', '1'],
  ['6', 'Tory Burch Robinson Card Case', 'Tory Burch', '148.00', '', 'https://img.test/6.jpg', 'https://track.test/6', 'Saffiano card case.', 'Accessories', 'Navy', '1'],
  ['7', 'Balenciaga City Bag', 'Balenciaga', '1950.00', '', 'https://img.test/7.jpg', 'https://track.test/7', 'Moto-inspired bag.', "Women's Handbags", 'Black', '1'],
  ['8', 'Some Random Runway Brand Dress', 'Atelier Obscura', '3200.00', '', 'https://img.test/8.jpg', 'https://track.test/8', 'Runway piece.', "Women's Dresses", 'Ivory', '1'],
  // rejects:
  ['9', 'No Image Bag', 'Gucci', '500.00', '', '', 'https://track.test/9', 'x', "Women's", 'Black', '1'],          // missing_image
  ['10', 'Bad Price Scarf', 'Burberry', 'free', '', 'https://img.test/10.jpg', 'https://track.test/10', 'x', 'Scarves', 'Red', '1'], // bad_price
  ['11', 'Designer Leather Sofa', 'Gucci', '8900.00', '', 'https://img.test/11.jpg', 'https://track.test/11', 'x', 'Furniture', 'Brown', '1'], // unshippable
  ['12', 'Out Of Stock Wallet', 'Coach', '150.00', '', 'https://img.test/12.jpg', 'https://track.test/12', 'x', 'Accessories', 'Black', '0'], // out_of_stock
  ['1', 'Saint Laurent Monogramme Lou Belt Bag DUP', 'Yves Saint Laurent', '1490.00', '', 'https://img.test/1.jpg', 'https://track.test/1b', 'x', "Women's", 'Black', '1'], // duplicate id
];
const feedPath = join(T, 'feed.tsv');
writeFileSync(feedPath, rows.map(r => r.join('\t')).join('\n'));
const outPath = join(T, 'saks-catalog.json');

const cmd = `node ${join(HERE, 'feed-to-catalog.mjs')} --feed ${feedPath} --mapping ${join(HERE, 'mappings', 'awin.json')} --store saks --label "Saks Fifth Avenue" --out ${outPath}`;
console.log('$ ' + cmd + '\n');
console.log(execSync(cmd, { encoding: 'utf8' }));

const cat = JSON.parse(readFileSync(outPath, 'utf8'));
const fails = [];
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg); if (!cond) fails.push(msg); };

// schema check vs macys-catalog.json item keys
const EXPECTED = ['brand', 'description', 'descriptionSource', 'description_en', 'image', 'images', 'name', 'onSale', 'price', 'rating', 'reviewCount', 'type', 'url'];
ok(cat.retailers?.saks?.label === 'Saks Fifth Avenue', 'retailer label');
ok(cat.recoveredProductCount === 8, `8 items recovered (got ${cat.recoveredProductCount})`);
ok(cat.declaredProductCount === 13, 'declared = 13 feed rows');
const all = [...cat.retailers.saks.departments.women.items, ...cat.retailers.saks.departments.men.items];
const byName = Object.fromEntries(all.map(i => [i.name, i]));
ok(Object.keys(byName[all[0].name]).sort().join(',') === EXPECTED.slice().sort().join(','), 'item keys match macys schema exactly');
ok(byName['Saint Laurent Monogramme Lou Belt Bag']?.brand === 'Saint Laurent', 'YSL alias → Saint Laurent');
ok(byName['Saint Laurent Monogramme Lou Belt Bag']?.type === 'HANDBAG', 'belt bag → HANDBAG');
ok(byName['Gucci Marmont Matelasse Shoulder Bag']?.onSale === true, 'sale detected (was 2450 > 1980)');
ok(byName['Burberry Check Cashmere Scarf']?.type === 'SCARF', 'scarf → SCARF');
ok(byName['Burberry Check Cashmere Scarf']?.description === 'Elegante bufanda Burberry en color beige.', 'Spanish one-liner from facts: ' + byName['Burberry Check Cashmere Scarf']?.description);
ok(byName['Burberry Check Cashmere Scarf']?.description_en === 'Iconic check scarf.', 'description_en keeps retailer copy');
ok(byName['Burberry Check Cashmere Scarf']?.descriptionSource === 'feed', 'descriptionSource=feed');
ok(byName["Men's Valentino Garavani Sneakers"] && !cat.retailers.saks.departments.women.items.some(i => i.name.includes('Valentino Garavani Sneakers')), "men's item not in women dept");
ok(cat.retailers.saks.departments.men.items.some(i => i.name.includes('Valentino Garavani Sneakers')), "men's item in men dept");
ok(byName['Coach Pebble Leather Tote']?.brand === 'Coach', 'COACH upper → Coach');
ok(byName['Coach Pebble Leather Tote']?.price === 328, 'price numeric 328');
ok(byName['Balenciaga City Bag'], 'Tier 2 brand included');
ok(byName['Some Random Runway Brand Dress'], 'Tier 3 brand included');
ok(!Object.keys(byName).some(n => n.includes('Sofa') || n.includes('No Image') || n.includes('Bad Price') || n.includes('Out Of Stock')), 'rejects excluded (image/price/furniture/stock)');
ok(!Object.keys(byName).some(n => n.includes('DUP')), 'duplicate excluded');
ok(all.every(i => /^https?:\/\//.test(i.image) && /^https?:\/\//.test(i.url) && i.price > 0), 'all items: real image, url, sane price');
ok(all.every(i => !/alimentaci|nutrition|spec|invent/i.test(i.description)), 'no invented specs in Spanish lines');

console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL SELFTESTS PASS');
process.exit(fails.length ? 1 : 0);
