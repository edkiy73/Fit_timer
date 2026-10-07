import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layoutWeb, siteUrl } from '../scripts/web-layout.mjs';

// Landing at the root, the web app in /app with absolute asset paths (decision 17).
const dist = mkdtempSync(join(tmpdir(), 'unmute-web-'));
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'index.html'), '<link rel="icon" href="./icon.png"><script type="module" src="./assets/index-1.js"></script><link rel="stylesheet" href="./assets/index-1.css"><link rel="modulepreload" href="./assets/chunk.js">');
layoutWeb(dist, {site: 'https://example.app'});

const app = readFileSync(join(dist, 'app', 'index.html'), 'utf8');
assert.match(app, /src="\/assets\/index-1\.js"/);
assert.match(app, /href="\/assets\/index-1\.css"/);
assert.match(app, /href="\/assets\/chunk\.js"/);
assert.match(app, /href="\.\/icon\.png"/, 'other files stay relative: vercel.json maps /app/* to the root');

const landing = readFileSync(join(dist, 'index.html'), 'utf8');
assert.match(landing, /<meta property="og:image" content="https:\/\/example\.app\/og\.png">/);
assert.match(landing, /href="https:\/\/play\.google\.com\/store\/apps\/details\?id=app\.unmute\.english"/);
assert.match(landing, /href="\/app\/"/);
assert.match(landing, /location\.replace\('\/app\/'\+location\.hash\)/, 'old hash links open the app');
assert.ok(!landing.includes('{{'));
assert.ok(existsSync(new URL('../public/og.png', import.meta.url)), 'the preview picture is published');

assert.equal(siteUrl({UNMUTE_SITE_URL: 'https://unmute.app/'}), 'https://unmute.app');
assert.equal(siteUrl({VERCEL_PROJECT_PRODUCTION_URL: 'unmute99.vercel.app'}), 'https://unmute99.vercel.app');

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.match(vercel.buildCommand, /web-layout\.mjs/);
assert.ok(vercel.rewrites.some(rule => rule.source === '/app/:path+' && rule.destination === '/:path+'));
console.log('web layout: ok');
