/* Local-first document sync: compiled ESM client against the real server handlers
   (auth + sync) on the memory store. Two "devices" share one account. */
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
const require = createRequire(import.meta.url);

let bad = 0;
const ok = (name, cond) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name);
};

const authHandler = require('../template/api/auth');
const { createSyncHandler } = require('../server/sync-core');
const { createSyncRegistry } = require('../server/sync-registry');
const { store } = require('../server/store');
const syncHandler = createSyncHandler({registry: createSyncRegistry([
  {scope:'account', key:'notes', free:true},
  {scope:'account', key:'settings', free:true},
  {scope:'account', key:'paid', free:false},
  {scope:'profile', prefix:'item:', free:true}
])});

const {createAuthClient} = await import('../dist/core/auth.js');
const {createSyncClient} = await import('../dist/core/sync-client.js');
const {createDocumentSync, mergeRecordMaps} = await import('../dist/core/document-sync.js');

let requestNo = 0;
function mount(handler, device){
  return async (_url, init) => {
    if(device.offline) throw new TypeError('Failed to fetch');
    const res = {statusCode:0, headers:{}, body:'', setHeader(k, v){ this.headers[k] = v; }, end(b){ this.body = b || ''; }};
    // A distinct address per request keeps the per-IP rate limiter out of the test.
    await handler({method:'POST', headers:{'x-forwarded-for':'10.0.0.' + (++requestNo % 250)}, body:JSON.parse(String(init.body))}, res);
    const payload = res.body ? JSON.parse(res.body) : {};
    if(device.afterPull && JSON.parse(String(init.body)).action === 'pull'){
      const hook = device.afterPull; device.afterPull = null;
      await hook();
    }
    if(device.dropNextPushResponse && payload && JSON.parse(String(init.body)).action === 'push'){
      device.dropNextPushResponse = false;
      throw new TypeError('connection reset');
    }
    return {ok:res.statusCode >= 200 && res.statusCode < 300, status:res.statusCode, json:async () => payload};
  };
}

const mapStorage = () => {
  const data = new Map();
  return {
    data,
    getItem:k => data.has(k) ? data.get(k) : null,
    setItem:(k, v) => { data.set(k, v); },
    removeItem:k => { data.delete(k); },
    get:async k => data.has(k) ? data.get(k) : null,
    set:async (k, v) => { data.set(k, v); return true; }
  };
};

// Documents in the test hold a record map; merge keeps changes from both devices.
const mergeNotes = ({local, remote}) => {
  const parse = raw => { try{ return JSON.parse(raw || '{}'); }catch{ return {}; } };
  return JSON.stringify(mergeRecordMaps(parse(local), parse(remote)));
};

function device(name){
  const dev = {name, offline:false, dropNextPushResponse:false, afterPull:null};
  const storage = mapStorage();
  dev.auth = createAuthClient({storage, fetch:mount(authHandler, dev), createDeviceId:() => 'device-' + name});
  dev.docs = createDocumentSync({
    client:createSyncClient({auth:dev.auth, fetch:mount(syncHandler, dev)}),
    owner:async () => (await dev.auth.getSession())?.email || null,
    storage,
    storageKey:'test.mirror',
    merge:mergeNotes
  });
  dev.signIn = async email => {
    const sent = await dev.auth.sendCode(email, 'en');
    await dev.auth.verifyCode({email, code:String(sent.devCode), locale:'en'});
  };
  dev.notes = async () => JSON.parse((await dev.docs.read('notes')) || '{}');
  dev.put = async (id, text, at) => {
    const notes = await dev.notes();
    notes[id] = {text, at:at || new Date().toISOString()};
    await dev.docs.write('notes', JSON.stringify(notes));
  };
  dev.drop = async (id, at) => {
    const notes = await dev.notes();
    notes[id] = {at:at || new Date().toISOString(), deleted:true};
    await dev.docs.write('notes', JSON.stringify(notes));
  };
  return dev;
}

const A = device('a'), B = device('b');
const t = s => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();

// 1. Signed out: the app works locally, sync is a no-op.
await A.put('a1', 'from A offline', t(1));
ok('signed out: writes are kept locally', (await A.notes()).a1.text === 'from A offline');
ok('signed out: sync reports signed_out and keeps changes pending',
  (await A.docs.sync()).status === 'signed_out' && await A.docs.pending());

// 2. First sign-in uploads local data.
await A.signIn('person@example.com');
const first = await A.docs.sync();
ok('first sign-in pushes local data', first.status === 'synced' && first.pushed === 1 && !(await A.docs.pending()));

// 3. Second device with its own offline data signs in: nothing is overwritten.
await B.put('b1', 'from B offline', t(2));
const changes = [];
B.docs.subscribe(change => changes.push(change));
await B.signIn('person@example.com');
const second = await B.docs.sync();
const bNotes = await B.notes();
ok('second device merges its offline data with the account', second.status === 'synced'
  && bNotes.a1?.text === 'from A offline' && bNotes.b1?.text === 'from B offline');
ok('remote changes are announced to subscribers', changes.some(c => c.source === 'remote' && c.keys.some(k => k.key === 'notes')));
await A.docs.sync();
const aNotes = await A.notes();
ok('first device receives the merged result', aNotes.b1?.text === 'from B offline' && aNotes.a1?.text === 'from A offline');

// 4. Concurrent edits from the same base: the second push is stale, merged and retried.
await A.put('a2', 'A concurrent', t(10));
await B.put('b2', 'B concurrent', t(11));
// A pushes between B's pull and B's push.
B.afterPull = () => A.docs.sync();
const concurrent = await B.docs.sync();
await A.docs.sync();
const aFinal = await A.notes(), bFinal = await B.notes();
ok('concurrent edits: stale push is merged and retried', concurrent.status === 'synced' && concurrent.rounds === 2);
ok('concurrent edits: both devices end with both changes',
  aFinal.a2 && aFinal.b2 && bFinal.a2 && bFinal.b2 && JSON.stringify(aFinal) === JSON.stringify(bFinal));

// 5. Deletion travels as a tombstone and does not come back.
await A.drop('a1', t(20));
await A.docs.sync();
await B.put('b3', 'B later', t(21));
await B.docs.sync();
await A.docs.sync();
ok('deleted record stays deleted on both devices', (await A.notes()).a1.deleted && (await B.notes()).a1.deleted);

// 6. Offline: changes stay pending and go out later.
B.offline = true;
await B.put('b4', 'B offline again', t(30));
const offline = await B.docs.sync();
ok('offline sync reports offline and keeps the change', offline.status === 'offline' && await B.docs.pending());
B.offline = false;
await B.docs.sync();
await A.docs.sync();
ok('change made offline reaches the other device', (await A.notes()).b4?.text === 'B offline again');

// 7. Lost response: the server applied the push, the device did not hear back.
B.dropNextPushResponse = true;
await B.put('b5', 'first try', t(40));
ok('lost push response is reported as offline', (await B.docs.sync()).status === 'offline');
await B.put('b5', 'second try', t(41));
const retry = await B.docs.sync();
await A.docs.sync();
ok('retry after a lost response is accepted and keeps the newest value',
  retry.status === 'synced' && (await A.notes()).b5?.text === 'second try');

// 8. Free account without Premium: only free documents sync.
await A.docs.write('paid', 'x');
const paid = await A.docs.sync();
ok('non-free document without Premium fails with premium_required',
  paid.status === 'failed' && paid.error?.code === 'premium_required');
await A.docs.remove('paid');
ok('keys() lists stored documents and leaves removed ones out',
  (await A.docs.keys()).some(ref => ref.key === 'notes' && ref.profileId === '__account__') &&
  !(await A.docs.keys()).some(ref => ref.key === 'paid'));

// 9. Old clients (no base) keep the previous server rules.
const session = await A.auth.getSession();
const legacyPush = async (rev, value) => {
  const res = {statusCode:0, headers:{}, body:'', setHeader(){}, end(b){ this.body = b || ''; }};
  await syncHandler({method:'POST', headers:{'x-forwarded-for':'10.1.0.1'}, body:{
    action:'push', email:session.email, deviceId:session.deviceId, token:session.syncToken,
    docs:[{profileId:'__account__', key:'settings', value, rev}]
  }}, res);
  return JSON.parse(res.body);
};
const legacy = await legacyPush(5, 'legacy');
ok('push without base still uses revision order and reports no stale keys',
  legacy.ok === true && Array.isArray(legacy.stale) && legacy.stale.length === 0);
const manifest = JSON.parse(await store.get('s:' + require('crypto').createHash('sha256').update(session.email).digest('hex').slice(0, 32)));
ok('legacy push stored its own revision', manifest.accountDocs.settings.rev === 5);

// 10. Another account on the same device: local data is treated as new data for that account.
await A.auth.logout();
await A.signIn('other@example.com');
await A.docs.sync();
const otherB = device('c');
await otherB.signIn('other@example.com');
await otherB.docs.sync();
ok('device data follows the device into the next signed-in account', !!(await otherB.notes()).a2);
// 11. Account deleted on the server, same address signs up again: detach() re-uploads.
await A.auth.forget('all');
await A.docs.detach();
await A.signIn('other@example.com');
const reupload = await A.docs.sync();
const fresh = device('d');
await fresh.signIn('other@example.com');
await fresh.docs.sync();
ok('after detach() local data is uploaded again to a re-created account',
  reupload.status === 'synced' && reupload.pushed >= 1 && !!(await fresh.notes()).a2);

await A.docs.clear();
ok('clear() drops the local mirror', (await A.docs.read('notes')) === null && !(await A.docs.pending()));

// 12. Record merge helper.
const merged = mergeRecordMaps(
  {x:{at:t(1), v:1}, y:{at:t(5), deleted:true}},
  {x:{at:t(2), v:2}, y:{at:t(5), v:9}, z:{at:t(3), v:3}}
);
ok('mergeRecordMaps: newer wins, equal time deletion wins, unseen kept',
  merged.x.v === 2 && merged.y.deleted === true && merged.z.v === 3);

console.log(bad ? `\nDocument sync failures: ${bad}` : '\nDocument sync behavior is clean');
process.exit(bad ? 1 : 0);
