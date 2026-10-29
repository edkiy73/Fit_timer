// V21 N02 on PGlite as feture_api: web push with our own VAPID keys through a fake fetch (no network). Only the right
// account's browsers get it, only when its settings allow, gone subscriptions are dropped, the encrypted payload holds
// nothing private, and without keys nothing is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createDecipheriv, createHmac, createPublicKey, verify } from 'node:crypto';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { pushHandlers, pushTransport } from '../server/push.mjs';
import { createWebPush, webPushFromEnv, webSubscription } from '../server/webpush.mjs';
import { drain } from '../server/outbox.mjs';
import { NOTIFICATION_DEFAULTS } from '../contracts/me.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const vapid = createECDH('prime256v1');vapid.generateKeys();
const KEYS = { publicKey: vapid.getPublicKey().toString('base64url'), privateKey: vapid.getPrivateKey().toString('base64url'), subject: 'mailto:owner@example.com' };

/** A browser: its own P-256 key and auth secret, and the subscription JSON it would hand to push.register. */
function browser(/** @type {string} */ endpoint) {
  const ecdh = createECDH('prime256v1');ecdh.generateKeys();
  const auth = Buffer.from(Array.from({ length: 16 }, (_, i) => i + endpoint.length));
  const token = JSON.stringify({ endpoint, expirationTime: null, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } });
  /** RFC 8291 decryption, as the browser does it. @param {Buffer} body */
  const open = body => {
    const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
    const h = (/** @type {Buffer} */ k, /** @type {Buffer} */ d) => createHmac('sha256', k).update(d).digest();
    const ikm = h(h(auth, ecdh.computeSecret(asPublic)), Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
    const prk = h(salt, ikm);
    const d = createDecipheriv('aes-128-gcm', h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), h(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    assert.equal(plain.at(-1), 2); // the last (only) record
    return JSON.parse(plain.subarray(0, -1).toString());
  };
  return { token, open, endpoint };
}

/** Checks the VAPID header the way a push service does. @param {string} header @param {string} endpoint */
function checkVapid(header, endpoint) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.ok(m);
  assert.equal(m[2], KEYS.publicKey);
  const [h, c, s] = m[1].split('.');
  const pub = Buffer.from(KEYS.publicKey, 'base64url');
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.aud, new URL(endpoint).origin);
  assert.equal(claims.sub, KEYS.subject);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
}

async function world() {
  const env = await baseSetup({ commands: { ...platform, ...me, ...discover, ...chats, ...inbox }, push: { webKey: KEYS.publicKey } });
  const { db, person } = env;
  /** @type {{url: string, headers: Record<string, string>, body: Buffer}[]} */
  const posts = [];
  const fetch = async (/** @type {string} */ url, /** @type {any} */ init) => {
    posts.push({ url, headers: init.headers, body: Buffer.from(init.body) });
    return { status: url.includes('/gone') ? 410 : 201 };
  };
  const web = createWebPush({ ...KEYS, fetch });
  assert.ok(web);
  /** @type {string[]} */
  const native = [];
  const deliver = async (/** @type {any} */ transport = pushTransport({ web })) => {
    while ((await drain(db, { ...notifyHandlers(db), ...pushHandlers(db, transport) }, { limit: 100 })) > 0) { /* until empty */ }
  };
  const member = async (/** @type {string} */ user, /** @type {string} */ handle) => {
    const id = await person(user, handle);
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    const [a] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [id, account_id]);
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [a.id, id]);
    await db.query(`insert into feture.notification_settings (account_id, settings) values ($1, $2)`, [account_id, JSON.stringify({ quiet: { on: false, from: '23:00', to: '08:00' } })]);
    return { id, account: account_id };
  };
  return { ...env, posts, native, deliver, member };
}

test('a like and a message reach only that account\'s browsers, encrypted, with nothing private; gone ones are dropped', async () => {
  const { pg, db, call, posts, deliver, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    const kira = browser('https://fcm.googleapis.com/fcm/send/kira-1');
    const kiraGone = browser('https://updates.push.services.mozilla.com/wpush/v2/gone-kira');
    const noa = browser('https://fcm.googleapis.com/fcm/send/noa-1');
    for (const [u, br] of /** @type {const} */ ([['ub', kira], ['ub', kiraGone], ['uc', noa]])) {
      const r = await call(u, null, { action: 'push.register', opId: op(), platform: 'web', token: br.token, tz: 'UTC' });
      assert.equal(r.status, 200, JSON.stringify(r));
    }
    // A phone of Kira's is not reached while only the web sender is configured.
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'android', token: 'tok-kira-phone' });
    // Stored in one canonical form (the browser's extra fields are not kept), so a re-register is the same row.
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'web', token: kira.token });
    const rows = await db.query(`select token from feture.push_device where platform = 'web' and account_id = $1`, [b.account]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((/** @type {any} */ r) => !r.token.includes('expirationTime')));

    await call('ua', a.id, { action: 'like.send', opId: op(), profileId: b.id, source: 'profile' });
    await deliver();
    assert.deepEqual(posts.map(p => p.url).sort(), [kira.endpoint, kiraGone.endpoint].sort()); // never Noa's
    for (const p of posts) {
      checkVapid(p.headers.Authorization, p.url);
      assert.equal(p.headers['Content-Encoding'], 'aes128gcm');
      assert.ok(!p.body.toString('latin1').includes('Alex'));
    }
    const payload = kira.open(/** @type {any} */ (posts.find(p => p.url === kira.endpoint)).body);
    assert.deepEqual(payload, { title: 'FetUre', body: 'Новое уведомление', url: '/#/n/inbox' });
    // The 410 subscription is gone; the phone and the live browser stay.
    assert.deepEqual((await db.query(`select platform from feture.push_device where account_id = $1 order by platform`, [b.account])).map((/** @type {any} */ r) => r.platform), ['android', 'web']);

    // A message in «normal» mode («Обычные», owner 29.10.2026): the sender's name and the start of the text, only inside
    // the encrypted payload; opens the chats.
    await db.query(`update feture.notification_settings set settings = settings || '{"mode": "normal"}' where account_id = $1`, [b.account]);
    await call('ub', b.id, { action: 'like.send', opId: op(), profileId: a.id, source: 'likes' });
    const conv = (await db.query(`select id from feture.conversation limit 1`))[0].id;
    posts.length = 0;
    await call('ua', a.id, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Секретный текст' });
    await deliver();
    const msg = posts.filter(p => p.url === kira.endpoint).map(p => kira.open(p.body));
    assert.deepEqual(msg.at(-1), { title: 'Alex', body: 'Секретный текст', url: '/#/n/chats' });
    assert.ok(posts.every(p => !p.body.toString('latin1').includes('Alex') && !p.body.includes(Buffer.from('Секрет'))));

    // Push off in the settings: nothing goes out.
    await db.query(`update feture.notification_settings set settings = settings || '{"push": false}' where account_id = $1`, [b.account]);
    posts.length = 0;
    await call('ua', a.id, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Ещё' });
    await deliver();
    assert.equal(posts.length, 0);
    // Unregister removes the browser (sent in any key order, it is the same subscription).
    const s = JSON.parse(kira.token);
    await call('ub', null, { action: 'push.unregister', opId: op(), token: JSON.stringify({ keys: { auth: s.keys.auth, p256dh: s.keys.p256dh }, endpoint: s.endpoint }) });
    assert.equal((await db.query(`select count(*)::int n from feture.push_device where platform = 'web' and account_id = $1`, [b.account]))[0].n, 0);
    void c;
  } finally { await pg.close(); }
});

test('subscriptions to anything but a known push service over https are refused; bootstrap shows only the public key', async () => {
  const { pg, call, member } = await world();
  try {
    await member('ua', 'Alex');
    const good = JSON.parse(browser('https://fcm.googleapis.com/fcm/send/x').token);
    for (const endpoint of ['http://fcm.googleapis.com/fcm/send/x', 'https://localhost/x', 'https://169.254.169.254/latest', 'https://fcm.googleapis.com.evil.test/x', 'https://evil.test/.push.apple.com']) {
      const r = await call('ua', null, { action: 'push.register', opId: op(), platform: 'web', token: JSON.stringify({ ...good, endpoint }) });
      assert.equal(r.status, 400, endpoint);
    }
    const bad = await call('ua', null, { action: 'push.register', opId: op(), platform: 'web', token: JSON.stringify({ ...good, keys: { ...good.keys, auth: 'AAAA' } }) });
    assert.equal(bad.status, 400);
    assert.ok(webSubscription(JSON.stringify({ ...good, endpoint: 'https://web.push.apple.com/abc' })));
    const boot = await call('ua', null, { action: 'session.bootstrap' });
    assert.deepEqual(boot.push, { webKey: KEYS.publicKey });
    assert.ok(!JSON.stringify(boot).includes(KEYS.privateKey));
    // The «offered» mark is kept with the notification settings.
    const upd = await call('ua', null, { action: 'notifications.settings.update', opId: op(), settings: { ...NOTIFICATION_DEFAULTS, offered: true } });
    assert.equal(upd.status, 200, JSON.stringify(upd));
    assert.equal((await call('ua', null, { action: 'notifications.settings.get' })).settings.offered, true);
  } finally { await pg.close(); }
});

test('without keys nothing is sent and it is said once; phones still go through the native sender', async () => {
  /** @type {string[]} */
  const said = [];
  assert.equal(webPushFromEnv({}, code => said.push(code)), null);
  assert.equal(webPushFromEnv({ FE_VAPID_PUBLIC_KEY: '' }, code => said.push(code)), null);
  assert.deepEqual(said, ['off_no_keys']);
  assert.equal(createWebPush({ ...KEYS, privateKey: 'short' }), null);
  assert.equal(createWebPush({ ...KEYS, subject: 'owner@example.com' }), null);
  assert.equal(pushTransport({}), null);
  // Keys pasted with the key file's quotes and commas still work.
  const pasted = webPushFromEnv({ FE_VAPID_PUBLIC_KEY: ` "${KEYS.publicKey}",`, FE_VAPID_PRIVATE_KEY: `"${KEYS.privateKey}",`, FE_VAPID_SUBJECT: `'${KEYS.subject}'` }, () => {});
  assert.equal(pasted?.publicKey, createWebPush(KEYS)?.publicKey);
  assert.ok(webPushFromEnv({ FE_VAPID_PUBLIC_KEY: KEYS.publicKey, FE_VAPID_PRIVATE_KEY: KEYS.privateKey, FE_VAPID_SUBJECT: 'owner@example.com' }, () => {}), 'a bare e-mail is a fine contact');
  assert.ok(webPushFromEnv({ FE_VAPID_PUBLIC_KEY: KEYS.publicKey, FE_VAPID_PRIVATE_KEY: KEYS.privateKey, FE_VAPID_SUBJECT: 'subject' }, () => {}), 'a stray contact falls back to the site');

  const { pg, db, call, posts, native, deliver, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'web', token: browser('https://fcm.googleapis.com/fcm/send/k').token });
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'tok-kira-ios' });
    await call('ua', a.id, { action: 'like.send', opId: op(), profileId: b.id, source: 'profile' });
    await deliver(pushTransport({ native: async (/** @type {string} */ p, /** @type {string} */ t) => { native.push(`${p}:${t}`); } }));
    assert.deepEqual([posts.length, native], [0, ['ios:tok-kira-ios']]);
    // The web device is kept: an unconfigured sender says nothing about the subscription.
    assert.equal((await db.query(`select count(*)::int n from feture.push_device where platform = 'web'`))[0].n, 1);
  } finally { await pg.close(); }
});
