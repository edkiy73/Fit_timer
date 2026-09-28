/* Раскладка браузерных тестов по параллельным частям CI (scripts/run-browser-tests.mjs --shard=i/n). */

// Время нового теста, пока его нет в browser-timings.json.
const UNKNOWN_SEC = 10;

// Жадная раскладка: самый долгий тест — в самую лёгкую часть. Детерминирована,
// поэтому каждая часть в CI сама вычисляет свой список без общего состояния.
export function shardTests(tests, timings, index, total){
  const load = Array.from({length: total}, () => 0);
  const owner = new Map();
  const sec = n => timings[n] ?? UNKNOWN_SEC;
  for(const name of [...tests].sort((a, b) => sec(b) - sec(a) || a.localeCompare(b))){
    let best = 0;
    for(let i = 1; i < total; i++) if(load[i] < load[best]) best = i;
    load[best] += sec(name);
    owner.set(name, best);
  }
  // Внутри части сохраняем исходный порядок BROWSER_TESTS.
  return tests.filter(n => owner.get(n) === index - 1);
}
