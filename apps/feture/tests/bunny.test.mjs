// Bunny media adapter and the upload proxy (docs/infra/migration-plan.md). No network: fetch is faked,
// the proxy runs on a real local HTTP server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { bunnyToken, createBunnyStorage } from '../server/media/bunny.mjs';
import { createUploadHandler, uploadUrlFor } from '../server/media/upload-proxy.mjs';
import { signedStorageDelivery } from '../server/media/delivery.mjs';

const ID = '018f0000-0000-7000-8000-000000000001';

test('token matches Bunny published vectors (BunnyCDN.TokenAuthentication e2e/vectors.json «plain»)', () => {
  assert.equal(bunnyToken('SecurityKey', '/300kb.jpg', 1598024587), 'HS256-o10JRWlsAItyAsdKS6jJKjabHN4FrFsplDHPV1idcX4');
});

/** Fake Edge Storage: a map of path -> {bytes, type}; listing returns Bunny's documented fields. */
function fakeBunny() {
  /** @type {Map<string, {bytes: Uint8Array, type: string}>} */
  const files = new Map();
  /** @type {string[]} */ const calls = [];
  /** @type {typeof fetch} */
  const f = async (url, init = {}) => {
    const u = new URL(String(url));
    assert.equal(u.host, 'storage.bunnycdn.com');
    assert.equal(/** @type {any} */ (init.headers).AccessKey, 'pw');
    const path = decodeURIComponent(u.pathname.replace(/^\/zone\//, ''));
    const method = init.method ?? 'GET';
    calls.push(`${method} ${path}`);
    if (method === 'PUT') {
      const chunks = [];
      const body = /** @type {any} */ (init.body);
      if (body instanceof Uint8Array) chunks.push(Buffer.from(body));
      else for await (const c of body) chunks.push(Buffer.from(c));
      files.set(path, { bytes: new Uint8Array(Buffer.concat(chunks)), type: String(/** @type {any} */ (init.headers)['Content-Type']) });
      return new Response('{}', { status: 201 });
    }
    if (method === 'DELETE') {
      const hit = [...files.keys()].filter(k => k === path || (path.endsWith('/') && k.startsWith(path)));
      hit.forEach(k => files.delete(k));
      return new Response('{}', { status: hit.length ? 200 : 404 });
    }
    if (path.endsWith('/')) {
      const list = [...files.entries()].filter(([k]) => k.startsWith(path) && !k.slice(path.length).includes('/'))
        .map(([k, v]) => ({ ObjectName: k.slice(path.length), Length: v.bytes.byteLength, IsDirectory: false }));
      return new Response(JSON.stringify(list), { status: 200 });
    }
    const file = files.get(path);
    return file ? new Response(Buffer.from(file.bytes), { status: 200, headers: { 'content-length': String(file.bytes.byteLength) } }) : new Response('', { status: 404 });
  };
  return { files, calls, fetch: f };
}

const storageWith = (/** @type {ReturnType<typeof fakeBunny>} */ fake, extra = {}) => createBunnyStorage({
  zone: 'zone', accessKey: 'pw', cdnOrigin: 'https://media.example.com/', tokenKey: 'tk', fetch: fake.fetch, now: () => 1_000_000_000_000, ...extra,
});

test('quarantine upload: size and type come back from the listing, get reads it, remove clears the directory', async () => {
  const fake = fakeBunny();
  const s = storageWith(fake);
  assert.equal(await s.head(`u/${ID}`), null);
  await s.putStream(`u/${ID}`, [new Uint8Array([1, 2, 3])], { mime: 'image/jpeg', bytes: 3 });
  assert.deepEqual(await s.head(`u/${ID}`), { bytes: 3, mime: 'image/jpeg' });
  assert.deepEqual([...await s.get(`u/${ID}`, 10)], [1, 2, 3]);
  await assert.rejects(s.get(`u/${ID}`, 2), /storage_object_too_large/);
  // A second upload of the same key replaces the first instead of leaving two files.
  await s.putStream(`u/${ID}`, [new Uint8Array([9])], { mime: 'image/png', bytes: 1 });
  assert.deepEqual(await s.head(`u/${ID}`), { bytes: 1, mime: 'image/png' });
  await s.remove(`u/${ID}`);
  assert.equal(await s.head(`u/${ID}`), null);
  await s.remove(`u/${ID}`); // already gone: not an error
});

test('served copies keep their key as the path; links are Bunny-signed, short-lived, never for quarantine', async () => {
  const fake = fakeBunny();
  const s = storageWith(fake);
  await s.put(`v/${ID}/card.webp`, new Uint8Array([7]), 'image/webp');
  assert.ok(fake.files.has(`v/${ID}/card.webp`));
  const [url] = await s.signUrls([`v/${ID}/card.webp`], 600);
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, `https://media.example.com/v/${ID}/card.webp`);
  assert.equal(u.searchParams.get('expires'), String(1_000_000_000 + 600));
  assert.equal(u.searchParams.get('token'), bunnyToken('tk', `/v/${ID}/card.webp`, 1_000_000_600));
  await assert.rejects(s.signUrls([`u/${ID}`], 600), /storage_unavailable/);
  // Through the existing delivery: same address for repeated requests (browser cache), one signature per key.
  const delivery = signedStorageDelivery(s);
  const a = await delivery.urls([{ assetId: ID, variant: 'card', viewerProfileId: 'p', ttlSeconds: 600 }]);
  const b = await delivery.urls([{ assetId: ID, variant: 'card', viewerProfileId: 'p', ttlSeconds: 600 }]);
  assert.equal(a[0], b[0]);
  assert.match(a[0], new RegExp(`/v/${ID}/card\\.webp\\?token=HS256-`));
});

test('putUrl only for quarantine keys and only through the proxy', async () => {
  const s = storageWith(fakeBunny(), { uploadUrl: uploadUrlFor('x'.repeat(40), 'https://api.example.com/', () => 1_000_000_000_000) });
  const t = await s.putUrl(`u/${ID}`, { mime: 'image/jpeg', bytes: 5 }, 900);
  assert.equal(t.method, 'PUT');
  assert.equal(t.headers['content-type'], 'image/jpeg');
  assert.match(t.url, /^https:\/\/api\.example\.com\/api\/fe-upload\?k=u%2F/);
  await assert.rejects(s.putUrl(`o/${ID}`, { mime: 'image/jpeg', bytes: 5 }, 900), /storage_unavailable/);
  await assert.rejects(storageWith(fakeBunny()).putUrl(`u/${ID}`, { mime: 'image/jpeg', bytes: 5 }, 900), /storage_unavailable/);
});

test('upload proxy: a valid ticket streams exactly its bytes; anything else is refused', async () => {
  const fake = fakeBunny();
  const s = storageWith(fake);
  const secret = 's'.repeat(40);
  let clock = Date.now();
  const server = createServer(createUploadHandler({ secret, storage: s, now: () => clock }));
  await new Promise(r => server.listen(0, '127.0.0.1', () => r(null)));
  const origin = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
  const ticket = uploadUrlFor(secret, origin, () => clock);
  try {
    const t = ticket(`u/${ID}`, { mime: 'image/jpeg', bytes: 4 }, 900);
    const put = (/** @type {string} */ url, /** @type {Uint8Array} */ body, type = 'image/jpeg') =>
      fetch(url, { method: 'PUT', headers: { 'content-type': type }, body: Buffer.from(body) });

    const pre = await fetch(t.url, { method: 'OPTIONS' });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-methods'), 'PUT, OPTIONS');

    assert.equal((await put(t.url, new Uint8Array([1, 2, 3, 4]), 'image/png')).status, 415);
    assert.equal((await put(t.url, new Uint8Array([1, 2, 3]))).status, 400);
    assert.equal((await put(t.url.replace(/&s=[^&]+/, '&s=AAAA'), new Uint8Array([1, 2, 3, 4]))).status, 403);
    assert.equal((await put(t.url.replace(/b=4/, 'b=5'), new Uint8Array([1, 2, 3, 4, 5]))).status, 403, 'size is signed');
    assert.equal((await put(t.url.replace(encodeURIComponent(`u/${ID}`), encodeURIComponent(`u/${ID}.poster`)), new Uint8Array([1, 2, 3, 4]))).status, 403, 'key is signed');
    assert.equal(fake.files.size, 0);

    const ok = await put(t.url, new Uint8Array([1, 2, 3, 4]));
    assert.equal(ok.status, 200);
    assert.deepEqual(await s.head(`u/${ID}`), { bytes: 4, mime: 'image/jpeg' });

    clock += 901_000;
    assert.equal((await put(t.url, new Uint8Array([1, 2, 3, 4]))).status, 403, 'expired');
    assert.throws(() => ticket(`o/${ID}`, { mime: 'image/jpeg', bytes: 4 }, 900));
  } finally {
    server.close();
  }
});
