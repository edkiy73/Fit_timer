// Old builds' chunks survive a deploy (server/assets-keep.mjs): copied once, kept for 3 builds or 7 days, then pruned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { keepAssets } from '../server/assets-keep.mjs';

const DAY = 24 * 3600e3;
const root = mkdtempSync(path.join(tmpdir(), 'fe-assets-'));
const keepDir = path.join(root, 'keep');

/** A build's dist/assets with its own entry and screen chunk. @param {string} tag */
function build(tag) {
  const dir = path.join(root, 'dist-' + tag);
  mkdirSync(dir, { recursive: true });
  for (const f of [`index-${tag}.js`, `me-${tag}.js`, `index-${tag}.css`]) writeFileSync(path.join(dir, f), tag);
  return dir;
}
const kept = () => readdirSync(keepDir).filter(f => !f.startsWith('.')).sort();

test('keeps the last three builds, then drops builds older than 7 days', () => {
  const t0 = Date.UTC(2026, 10, 1);
  keepAssets({ assetsDir: build('a'), keepDir, now: t0 });
  assert.deepEqual(kept(), ['index-a.css', 'index-a.js', 'me-a.js']);
  // Same build restarted later: nothing new, and its date stays the first start.
  assert.equal(keepAssets({ assetsDir: build('a'), keepDir, now: t0 + 9 * DAY }).copied, 0);
  keepAssets({ assetsDir: build('b'), keepDir, now: t0 + 10 * DAY });
  keepAssets({ assetsDir: build('c'), keepDir, now: t0 + 11 * DAY });
  assert.ok(existsSync(path.join(keepDir, 'me-a.js')), 'three builds: a is still kept');
  const r = keepAssets({ assetsDir: build('d'), keepDir, now: t0 + 12 * DAY });
  assert.equal(r.removed, 3, 'the 4th build drops a (12 days old)');
  assert.deepEqual(kept().filter(f => f.startsWith('me-')), ['me-b.js', 'me-c.js', 'me-d.js']);
});

test('a build younger than 7 days is kept even beyond three builds', () => {
  const t1 = Date.UTC(2026, 10, 20);
  for (const [i, tag] of ['e', 'f', 'g', 'h'].entries()) keepAssets({ assetsDir: build(tag), keepDir, now: t1 + i * 3600e3 });
  const me = kept().filter(f => f.startsWith('me-'));
  assert.deepEqual(me, ['me-e.js', 'me-f.js', 'me-g.js', 'me-h.js'], 'b–d are older than 7 days and not in the last three; e–h are fresh');
});

test('the running build is never pruned, even with a clock behind the others', () => {
  const r = keepAssets({ assetsDir: build('old-clock'), keepDir, now: 0 });
  assert.ok(existsSync(path.join(keepDir, 'me-old-clock.js')));
  assert.equal(r.copied, 3);
});
