// Security audit 06.11.2026 (B1): IPv6 counted by its /64, throwaway mailboxes refused when a product opts in.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.ALLOW_MEMORY_STORE = '1';
const { ipKey, ipHash } = require('../server/util');
const { isDisposableEmail } = require('../server/disposable-domains');
const { createAuthHandler } = require('../server/auth-core');

assert.equal(ipKey('203.0.113.7'), '203.0.113.7');
assert.equal(ipKey('::ffff:203.0.113.7'), '203.0.113.7');
assert.equal(ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), ipKey('2001:db8:1:2::1'));
assert.notEqual(ipKey('2001:db8:1:3::1'), ipKey('2001:db8:1:2::1'));
const h = ip => ipHash({ headers: { 'x-forwarded-for': ip } });
assert.equal(h('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), h('2001:db8:1:2::9'), 'one /64 is one address');
assert.notEqual(h('203.0.113.7'), h('203.0.113.8'));

assert.equal(isDisposableEmail('bot@mailinator.com'), true);
assert.equal(isDisposableEmail('bot@x.y.mailinator.com'), true, 'a subdomain of a throwaway domain');
assert.equal(isDisposableEmail('anna@gmail.com'), false);
assert.equal(isDisposableEmail('anna@mailinator.com.example.org'), false);
process.env.DISPOSABLE_EMAIL_DOMAINS = 'burner.example';
assert.equal(isDisposableEmail('x@burner.example'), true, 'the environment extends the list');
delete process.env.DISPOSABLE_EMAIL_DOMAINS;

async function call(handler, body, ip = '10.40.0.1') {
  const res = { statusCode: 0, setHeader() {}, end(raw) { this.body = JSON.parse(raw); } };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': ip }, query: {}, body }, res);
  return res;
}
require('../template/lib/product');
const analytics = require('../template/lib/app-analytics');
const strict = createAuthHandler({ analytics, blockDisposableEmail: true });
const r = await call(strict, { action: 'send', email: 'bot@mailinator.com', locale: 'en' });
assert.equal(r.statusCode, 400);
assert.equal(r.body.error, 'email_not_allowed');
const open = createAuthHandler({ analytics });
assert.notEqual((await call(open, { action: 'send', email: 'bot@mailinator.com', locale: 'en' }, '10.40.0.2')).body?.error, 'email_not_allowed', 'off unless a product opts in');
console.log('auth-hardening ok');

// Cloudflare Turnstile (B1): off without a secret; with one, a code is only sent for a token Cloudflare accepts.
const { createTurnstile } = require('../server/turnstile');
const answers = []; let asked = 0;
const fakeFetch = async (url, init) => { asked++; return { json: async () => answers.shift() ?? { success: false } }; };
const ts = createTurnstile({ skip: e => /\.test$/.test(e), fetchImpl: fakeFetch, secret: () => process.env.TURNSTILE_SECRET_KEY });
delete process.env.TURNSTILE_SECRET_KEY;
assert.equal(await ts.ok({ headers: {} }, 'a@b.co', undefined), true, 'not set up: nothing is asked');
process.env.TURNSTILE_SECRET_KEY = 'secret-for-tests';
assert.equal(await ts.ok({ headers: {} }, 'a@b.co', undefined), false, 'no token');
assert.equal(asked, 0, 'no token never reaches Cloudflare');
assert.equal(await ts.ok({ headers: {} }, 'world@feture.test', undefined), true, 'a reserved test address is not asked');
answers.push({ success: true });
assert.equal(await ts.ok({ headers: { 'x-forwarded-for': '203.0.113.9' } }, 'a@b.co', 'tok'), true);
answers.push({ success: false });
assert.equal(await ts.ok({ headers: {} }, 'a@b.co', 'bad'), false, 'Cloudflare says no');
const down = createTurnstile({ fetchImpl: async () => { throw new Error('offline'); }, secret: () => 'k' });
assert.equal(await down.ok({ headers: {} }, 'a@b.co', 'tok'), true, 'an outage of the check does not lock everybody out');
const guarded = createAuthHandler({ analytics, captcha: ts });
const noToken = await call(guarded, { action: 'send', email: 'bot@example.org', locale: 'en' }, '10.40.0.3');
assert.equal(noToken.statusCode, 400);
assert.equal(noToken.body.error, 'captcha_failed');
delete process.env.TURNSTILE_SECRET_KEY;
console.log('turnstile ok');

// Idle expiry (B5): a session unused for 30 days dies; use renews it; a young session is never idle.
const { activeSession } = require('../server/util');
const day = 24 * 3600 * 1000;
const hex = c => c.repeat(64);
const mem = new Map();
const fakeStore = { get: async k => mem.get(k) ?? null, set: async (k, v) => { mem.set(k, v); } };
const dev = (h, ageDays) => ({ h, at: new Date(Date.now() - ageDays * day).toISOString() });
assert.equal(await activeSession(dev(hex('a'), 40), fakeStore), false, '40 days old and no use in the last 30');
mem.set('session:seen:' + hex('b'), '1');
assert.equal(await activeSession(dev(hex('b'), 40), fakeStore), true, 'used lately');
assert.equal(await activeSession(dev(hex('c'), 10), fakeStore), true, 'a young session is not idle');
assert.equal(mem.has('session:seen:' + hex('c')), true, 'and use leaves its marker');
assert.equal(await activeSession(dev(hex('d'), 100), fakeStore), false, 'the 90 days still end it');
mem.set('session:revoked:' + hex('e'), '1');
assert.equal(await activeSession(dev(hex('e'), 1), fakeStore), false, 'a revoked one stays revoked');
console.log('idle expiry ok');

// One mailbox, one budget: plus tags and Gmail dots do not make new addresses for the send limits.
const { limitMail } = require('../server/util');
assert.equal(limitMail('Anna+1@Mail.example'), 'anna@mail.example');
assert.equal(limitMail('a.n.n.a+x@gmail.com'), 'anna@gmail.com');
assert.equal(limitMail('anna@googlemail.com'), 'anna@gmail.com');
assert.equal(limitMail('a.nna@other.org'), 'a.nna@other.org', 'dots count outside Gmail');
assert.equal(limitMail('+@x.org'), '+@x.org', 'an address that is only a tag is left as it is');
console.log('limitMail ok');
