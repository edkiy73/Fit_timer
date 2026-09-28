/* Раскладка браузерных тестов по параллельным частям CI (scripts/browser-shards.mjs):
   каждый тест попадает ровно в одну часть, части примерно равны по времени. */
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const root = path.join(__dirname, '..');
  const { shardTests } = await import(path.join(root, 'scripts/browser-shards.mjs'));
  const { BROWSER_TESTS } = await import(path.join(root, 'scripts/test-lists.mjs'));
  const timings = require('./browser-timings.json');
  const sec = n => timings[n] ?? 10;

  for(const total of [1, 2, 4]){
    const shards = Array.from({length: total}, (_, i) => shardTests(BROWSER_TESTS, timings, i + 1, total));
    const flat = shards.flat();
    assert.equal(flat.length, BROWSER_TESTS.length, `${total} частей: каждый тест ровно один раз`);
    assert.deepEqual([...flat].sort(), [...BROWSER_TESTS].sort(), `${total} частей: тот же набор тестов`);
    shards.forEach(s => assert.deepEqual(s, BROWSER_TESTS.filter(n => s.includes(n)), 'порядок внутри части сохранён'));
    const loads = shards.map(s => s.reduce((a, n) => a + sec(n), 0));
    const sum = loads.reduce((a, b) => a + b, 0);
    const longest = Math.max(...BROWSER_TESTS.map(sec));
    assert.ok(Math.max(...loads) <= Math.max(longest, sum / total) + longest,
      `${total} частей: разбалансировано ${loads.join('/')}`);
  }
  console.log('ok  browser-shards');
})().catch(e => { console.error(e); process.exit(1); });
