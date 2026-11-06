// The viewer's handle burned into someone's private pictures, served by our server after a fresh grant check (audit 06.11.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { setup } from './fe-helpers.mjs';
import { markedUrls, serveMarked, stamp } from '../server/media/watermark.mjs';

const SECRET = 'w'.repeat(40);

async function picture() {
  const sharp = (await import('sharp')).default;
  return new Uint8Array(await sharp({ create: { width: 480, height: 600, channels: 3, background: '#556677' } }).webp().toBuffer());
}
const run = async (deps, url) => {
  const query = Object.fromEntries(new URL(url).searchParams.entries());
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await serveMarked(deps, { query }, res);
  return res;
};

test('a viewer’s private picture carries their handle, only while the grant stands', async () => {
  const { pg, db, person } = await setup({ commands: { ...platform, ...me } });
  try {
    const owner = await person('uo', 'Olga'), viewer = await person('uv', 'Viktor');
    const [{ id: ownerAcc }] = await db.query('select id from feture.account where person_profile_id = $1', [owner]);
    const [{ id: viewerAcc }] = await db.query('select id from feture.account where person_profile_id = $1', [viewer]);
    const [{ id: asset }] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'private', 'o/x', 'image/webp', 10, 'approved', 'safe', now()) returning id`, [owner, ownerAcc]);
    await db.query(`insert into feture.media_attachment (asset_id, target_type, target_id) values ($1, 'private', $2)`, [asset, owner]);
    await db.query(`update feture.profile_settings set private_on = true where profile_id = $1`, [owner]);
    const original = await picture();
    const storage = { get: async () => original };
    const deps = { db, secret: SECRET, storage };
    const [url] = await markedUrls({ secret: SECRET, origin: 'https://app.test' }, { assetId: asset, variants: ['card'], viewerProfileId: viewer, accountId: viewerAcc });
    assert.match(url, /^https:\/\/app\.test\/api\/fe\?media=1&a=/);

    assert.equal((await run(deps, url)).statusCode, 403, 'no grant yet: nothing');
    await db.query(`insert into feture.access_grant (owner_profile_id, viewer_profile_id, viewer_account_ids, scopes, granted_by) values ($1, $2, array[$3::uuid], array['photos'], $4)`, [owner, viewer, viewerAcc, ownerAcc]);
    const ok = await run(deps, url);
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.headers['Content-Type'], 'image/webp');
    assert.notDeepEqual(new Uint8Array(ok.body), original, 'the handle is in the picture');
    assert.equal((await run(deps, url.replace('v=card', 'v=full'))).statusCode, 403, 'the token is for one variant');
    assert.equal((await run({ ...deps, secret: 'x'.repeat(40) }, url)).statusCode, 403, 'a forged link');
    await db.query(`update feture.access_grant set revoked_at = now() where owner_profile_id = $1`, [owner]);
    assert.equal((await run(deps, url)).statusCode, 403, 'the link alone is not enough once access is revoked');
    // The stamping itself: a different handle gives a different picture.
    assert.notDeepEqual(new Uint8Array(await stamp(original, '@a')), new Uint8Array(await stamp(original, '@b')));
  } finally { await pg.close(); }
});
