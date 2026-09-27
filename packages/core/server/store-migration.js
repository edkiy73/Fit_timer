'use strict';

/* Перенос серверного хранилища между движками (Upstash ⇄ Supabase).

   Работает только в «парном» режиме APPBASE_STORE (redis+supabase или
   supabase+redis): источник — главный движок, приёмник — зеркало. Пока режим
   парный, каждая новая запись и так попадает в оба движка, поэтому копирование
   старых ключей и сверка дают полное совпадение без остановки приложения.

   Всё идёт пачками по курсору SCAN: одна функция Vercel не успеет перебрать всю
   базу, поэтому админка вызывает шаг за шагом, пока курсор не вернётся в '0'.
   Шаги идемпотентны — любой можно повторить. */

const { store } = require('./store');

const MAX_BATCH = 500;
const SAMPLE_LIMIT = 10;

function pairOrThrow(){
  const b = store.backends();
  if(!b.mirror || b.implicitMemory){
    throw Object.assign(new Error('storage_mode_not_paired'), {status: 409});
  }
  return b;
}

function batchSize(count){
  return Math.max(1, Math.min(MAX_BATCH, Math.round(+count || 200)));
}

function skipKey(key){
  return store.EPHEMERAL.test(key) || key === store.MIRROR_FAIL_KEY;
}

async function scanPage(backend, cursor, count){
  const [page] = await backend.exec([['SCAN', String(cursor || '0'), 'COUNT', String(count)]]);
  const next = String(page && page[0] != null ? page[0] : '0');
  const keys = Array.isArray(page && page[1]) ? page[1].map(String) : [];
  return {next, keys};
}

// Тип, срок жизни и значение каждого ключа — двумя запросами на всю пачку.
async function readRecords(backend, keys){
  if(!keys.length) return [];
  const meta = await backend.exec(keys.flatMap(k => [['TYPE', k], ['TTL', k]]));
  const recs = keys.map((key, i) => ({key, kind: String(meta[2 * i] || 'none'), ttl: +meta[2 * i + 1]}));
  const readable = recs.filter(r => r.kind === 'string' || r.kind === 'list');
  const values = readable.length
    ? await backend.exec(readable.map(r => r.kind === 'list' ? ['LRANGE', r.key, '0', '-1'] : ['GET', r.key]))
    : [];
  readable.forEach((r, i) => { r.value = values[i]; });
  return recs;
}

function putCommand(rec){
  const value = rec.kind === 'list' ? (rec.value || []).map(String) : String(rec.value == null ? '' : rec.value);
  const ttl = rec.ttl > 0 ? String(rec.ttl) : '-1';
  return ['KVPUT', rec.key, rec.kind, JSON.stringify(value), ttl];
}

async function writeRecords(backend, recs){
  for(let i = 0; i < recs.length; i += 100){
    await backend.exec(recs.slice(i, i + 100).map(putCommand));
  }
}

/* Один шаг копирования: страница ключей источника → приёмник. */
async function copyBatch({cursor = '0', count} = {}){
  const {primary, mirror} = pairOrThrow();
  const {next, keys} = await scanPage(primary, cursor, batchSize(count));
  const wanted = keys.filter(k => !skipKey(k));
  const recs = await readRecords(primary, wanted);
  const copy = recs.filter(r => r.kind === 'string' || r.kind === 'list');
  const unsupported = recs.filter(r => r.kind !== 'string' && r.kind !== 'list' && r.kind !== 'none');
  await writeRecords(mirror, copy);
  return {
    cursor: next,
    done: next === '0',
    scanned: keys.length,
    copied: copy.length,
    skipped: keys.length - wanted.length,
    vanished: recs.filter(r => r.kind === 'none').length,
    unsupported: unsupported.slice(0, SAMPLE_LIMIT).map(r => ({key: r.key, kind: r.kind})),
    unsupportedCount: unsupported.length
  };
}

function sameValue(a, b){
  if(a.kind !== b.kind) return false;
  if(a.kind === 'list') return JSON.stringify((a.value || []).map(String)) === JSON.stringify((b.value || []).map(String));
  return String(a.value) === String(b.value);
}

// Сроки жизни сравниваем грубо: «вечный» против «истекающего» — расхождение,
// а разница в секунды между двумя истекающими — нет (часы и задержка сети).
function sameTtl(a, b){
  if((a.ttl > 0) !== (b.ttl > 0)) return false;
  if(a.ttl > 0) return Math.abs(a.ttl - b.ttl) <= Math.max(120, a.ttl * 0.01);
  return true;
}

/* Один шаг сверки.
   Прямой проход (по источнику): чего нет в приёмнике и что отличается.
   Обратный проход (reverse, по приёмнику): что осталось в приёмнике лишним.
   repair=true сразу чинит найденное: докопирует или удаляет лишнее. */
async function verifyBatch({cursor = '0', count, repair = false, reverse = false} = {}){
  const {primary, mirror} = pairOrThrow();
  const from = reverse ? mirror : primary;
  const {next, keys} = await scanPage(from, cursor, batchSize(count));
  const wanted = keys.filter(k => !skipKey(k));
  const [src, dst] = await Promise.all([readRecords(primary, wanted), readRecords(mirror, wanted)]);

  const out = {
    cursor: next, done: next === '0', reverse: !!reverse,
    checked: 0, same: 0, missing: 0, different: 0, ttlDifferent: 0, extra: 0, repaired: 0,
    samples: []
  };
  const fix = [];
  const drop = [];
  const note = (key, problem) => { if(out.samples.length < SAMPLE_LIMIT) out.samples.push({key, problem}); };

  src.forEach((s, i) => {
    const d = dst[i];
    if(s.kind === 'none' && d.kind === 'none') return;          // истёк между шагами
    out.checked++;
    if(s.kind === 'none'){ out.extra++; note(s.key, 'extra'); drop.push(s.key); return; }
    if(s.kind !== 'string' && s.kind !== 'list') return;
    if(d.kind === 'none'){ out.missing++; note(s.key, 'missing'); fix.push(s); return; }
    if(!sameValue(s, d)){ out.different++; note(s.key, 'different'); fix.push(s); return; }
    if(!sameTtl(s, d)){ out.ttlDifferent++; note(s.key, 'ttl'); fix.push(s); return; }
    out.same++;
  });

  if(repair){
    if(fix.length) await writeRecords(mirror, fix);
    if(drop.length) await mirror.exec([['DEL', ...drop]]);
    out.repaired = fix.length + drop.length;
  }
  return out;
}

async function migrationStatus(){
  const b = store.backends();
  const info = store.info();
  const count = async backend => {
    if(!backend) return null;
    try{ return +(await backend.exec([['DBSIZE']]))[0]; }catch(e){ return null; }
  };
  let mirrorFailed = null;
  if(b.primary && !b.implicitMemory){
    try{ mirrorFailed = +(await b.primary.exec([['GET', store.MIRROR_FAIL_KEY]]))[0] || 0; }catch(_){ }
  }
  const [primaryKeys, mirrorKeys] = await Promise.all([count(b.implicitMemory ? null : b.primary), count(b.mirror)]);
  return {
    mode: info.mode,
    modeValid: info.modeValid,
    modes: store.MODES,
    primary: info.primary,
    mirror: info.mirror,
    mirrorMissing: info.mirrorMissing,
    paired: !!b.mirror && !b.implicitMemory,
    redis: info.redis,
    supabase: info.supabase,
    region: info.build.region,
    primaryKeys,
    mirrorKeys,
    mirrorFailed
  };
}

async function resetMirrorFailures(){
  const b = store.backends();
  if(b.primary && !b.implicitMemory) await b.primary.exec([['DEL', store.MIRROR_FAIL_KEY]]);
  return true;
}

module.exports = { copyBatch, verifyBatch, migrationStatus, resetMirrorFailures };
