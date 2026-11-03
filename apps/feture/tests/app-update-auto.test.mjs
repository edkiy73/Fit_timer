// New APK builds publish themselves (lib/app-update.js publishLatestBuild): GitHub is faked, the store is a Map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { publishLatestBuild, KEY, AUTO_KEY } = require('../lib/app-update.js');

const META = 'https://github.com/edkiy73/Fit_timer/releases/download/feture-latest/FetUre-release.json';
const archive = (/** @type {number} */ code) => `https://github.com/edkiy73/Fit_timer/releases/download/feture-apk-archive/FetUre-${code}.apk`;

function memoryStore(/** @type {Record<string, unknown>} */ initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return { map, get: async (/** @type {string} */ k) => map.get(k) ?? null, set: async (/** @type {string} */ k, /** @type {string} */ v) => { map.set(k, v); } };
}
const published = (/** @type {any} */ store) => JSON.parse(store.map.get(KEY) || 'null');

/** @param {{meta?: any, head?: number, metaStatus?: number, throws?: boolean}} o */
function fakeGitHub(o) {
  /** @type {{url: string, method: string}[]} */
  const calls = [];
  const fetch = async (/** @type {string} */ url, /** @type {any} */ init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (o.throws) throw new TypeError('fetch failed');
    if (url === META) return new Response(JSON.stringify(o.meta), { status: o.metaStatus ?? 200 });
    if (init.method === 'HEAD') return new Response(null, { status: o.head ?? 200 });
    return new Response('', { status: 404 });
  };
  return { fetch: /** @type {any} */ (fetch), calls };
}
const build = (/** @type {number} */ code, extra = {}) => ({ versionCode: code, versionName: `0.3.${code - 1000}`, apkUrl: archive(code), commit: 'abc', builtAt: '2026-11-03T10:00:00Z', ...extra });
const PUBLISHED_1050 = { direct: { latestCode: 1050, minimumCode: 1050, latestName: '0.3.50', url: archive(1050), messageRu: 'Старое', messageEn: '' }, store: { latestCode: 7, minimumCode: 0, latestName: '', url: 'market://details?id=ru.feture.app', messageRu: '', messageEn: '' } };
const quiet = { env: {}, log: () => {} };

test('a newer build is published as a required update, exactly what the admin button sends', async () => {
  const store = memoryStore({ [KEY]: PUBLISHED_1050 });
  const gh = fakeGitHub({ meta: build(1051, { notes: 'Быстрее лента' }) });
  /** @type {string[]} */
  const lines = [];
  const r = await publishLatestBuild(store, { ...quiet, fetch: gh.fetch, now: 1e12, log: l => lines.push(l) });
  assert.deepEqual(r, { published: 1051 });
  assert.deepEqual(published(store).direct, { latestCode: 1051, minimumCode: 1051, latestName: '0.3.51', url: archive(1051), messageRu: 'Быстрее лента', messageEn: '' });
  assert.deepEqual(published(store).store, PUBLISHED_1050.store, 'the Play channel is untouched');
  assert.deepEqual(gh.calls.map(c => c.method + ' ' + c.url), [`GET ${META}`, `HEAD ${archive(1051)}`]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /1051/);
});

test('without notes in the build the published text stays; nothing published yet works too', async () => {
  const store = memoryStore({ [KEY]: PUBLISHED_1050 });
  await publishLatestBuild(store, { ...quiet, fetch: fakeGitHub({ meta: build(1052) }).fetch, now: 1e12 });
  assert.equal(published(store).direct.messageRu, 'Старое');
  const empty = memoryStore();
  assert.deepEqual(await publishLatestBuild(empty, { ...quiet, fetch: fakeGitHub({ meta: build(1001) }).fetch, now: 1e12 }), { published: 1001 });
  assert.equal(published(empty).direct.minimumCode, 1001);
});

test('the same or an older build is a no-op (never a downgrade)', async () => {
  for (const code of [1050, 1049]) {
    const store = memoryStore({ [KEY]: PUBLISHED_1050 });
    const gh = fakeGitHub({ meta: build(code) });
    assert.deepEqual(await publishLatestBuild(store, { ...quiet, fetch: gh.fetch, now: 1e12 }), { skipped: 'current' });
    assert.deepEqual(published(store), PUBLISHED_1050);
    assert.equal(gh.calls.length, 1, 'no HEAD for a build that is not newer');
  }
});

test('a URL outside the archive release is rejected', async () => {
  for (const apkUrl of [
    'https://github.com/edkiy73/Fit_timer/releases/download/feture-latest/FetUre-latest.apk',
    'https://evil.example/edkiy73/Fit_timer/releases/download/feture-apk-archive/FetUre-1051.apk',
    'http://github.com/edkiy73/Fit_timer/releases/download/feture-apk-archive/FetUre-1051.apk',
    archive(1099),
  ]) {
    const store = memoryStore({ [KEY]: PUBLISHED_1050 });
    const gh = fakeGitHub({ meta: build(1051, { apkUrl }) });
    assert.deepEqual(await publishLatestBuild(store, { ...quiet, fetch: gh.fetch, now: 1e12 }), { skipped: 'bad_url' }, apkUrl);
    assert.deepEqual(published(store), PUBLISHED_1050);
    assert.ok(!gh.calls.some(c => c.method === 'HEAD'));
  }
});

test('an archive APK that does not answer 200 is not published; the next look after 5 minutes retries', async () => {
  const store = memoryStore({ [KEY]: PUBLISHED_1050 });
  assert.deepEqual(await publishLatestBuild(store, { ...quiet, fetch: fakeGitHub({ meta: build(1051), head: 404 }).fetch, now: 1e12 }), { skipped: 'not_uploaded' });
  assert.deepEqual(published(store), PUBLISHED_1050);
  assert.deepEqual(await publishLatestBuild(store, { ...quiet, fetch: fakeGitHub({ meta: build(1051) }).fetch, now: 1e12 + 60_000 }), { skipped: 'recent' });
  assert.deepEqual(await publishLatestBuild(store, { ...quiet, fetch: fakeGitHub({ meta: build(1051) }).fetch, now: 1e12 + 5 * 60_000 }), { published: 1051 });
});

test('GitHub is asked at most once per 5 minutes; network errors are quiet', async () => {
  const store = memoryStore({ [KEY]: PUBLISHED_1050 });
  const down = fakeGitHub({ throws: true });
  assert.deepEqual(await publishLatestBuild(store, { ...quiet, fetch: down.fetch, now: 1e12 }), { skipped: 'unavailable' });
  assert.equal(JSON.parse(store.map.get(AUTO_KEY)).checkedAt, 1e12);
  const gh = fakeGitHub({ meta: build(1051) });
  assert.deepEqual(await publishLatestBuild(store, { ...quiet, fetch: gh.fetch, now: 1e12 + 4 * 60_000 }), { skipped: 'recent' });
  assert.equal(gh.calls.length, 0);
  const missing = fakeGitHub({ meta: {}, metaStatus: 404 });
  assert.deepEqual(await publishLatestBuild(store, { ...quiet, fetch: missing.fetch, now: 1e12 + 10 * 60_000 }), { skipped: 'unavailable' });
  assert.deepEqual(published(store), PUBLISHED_1050);
});

test('FETURE_AUTO_PUBLISH_APK=0 does nothing', async () => {
  const store = memoryStore({ [KEY]: PUBLISHED_1050 });
  const gh = fakeGitHub({ meta: build(1051) });
  assert.deepEqual(await publishLatestBuild(store, { env: { FETURE_AUTO_PUBLISH_APK: '0' }, fetch: gh.fetch, now: 1e12, log: () => {} }), { skipped: 'off' });
  assert.equal(gh.calls.length, 0);
  assert.equal(store.map.has(AUTO_KEY), false);
  assert.deepEqual(published(store), PUBLISHED_1050);
});
