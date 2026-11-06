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
