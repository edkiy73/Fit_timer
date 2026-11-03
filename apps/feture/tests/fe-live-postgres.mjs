// Live data (owner 03.11.2026, server/live.mjs) on PGlite: every command that queues something sends `changed` with an
// entity tag right after commit — to the profile the item is addressed to and to each `for` account's own channel —
// a new couple or a staff role sends `boot` to the people whose bootstrap changed, and the worker tick signals what its
// media handlers changed. Payloads stay a kind and an entity code: no ids, names or text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { couples } from '../server/commands/couples.mjs';
import { staff } from '../server/commands/staff.mjs';
import { channelFor, createSignals } from '../server/realtime.mjs';
import { enqueue } from '../server/outbox.mjs';
import { runJobs } from '../server/jobs.mjs';
import { actionEntities, topicEntities } from '../server/live.mjs';
import { setup as baseSetup, op, PEPPER } from './fe-helpers.mjs';

async function world({ kick = /** @type {(() => void) | null} */ (null) } = {}) {
  /** @type {any[]} */
  const sent = [];
  let signals;
  const env = await baseSetup({
    commands: { ...platform, ...me, ...couples, ...staff }, realtime: { url: 'https://app.example.com', key: 'sse', transport: 'sse' },
    signals: db => (signals = createSignals({ db, pepper: PEPPER, sender: async messages => { sent.push(...messages); } })),
    ...(kick ? { kick } : {}),
  });
  const accountOf = async (/** @type {string} */ p) => (await env.db.query('select id from feture.account where person_profile_id = $1', [p]))[0].id;
  /** The channel of a profile with its current active members. @param {string} p */
  const channel = async p => {
    const rows = await env.db.query(`select account_id from feture.profile_member where profile_id = $1 and state = 'active'`, [p]);
    return channelFor(PEPPER, p, rows.map(r => r.account_id));
  };
  /** What a channel heard, as `kind:tag`. @param {string} topic */
  const heard = topic => sent.filter(m => m.topic === topic).map(m => m.payload.k + (m.payload.t ? ':' + m.payload.t : ''));
  return { ...env, sent, signals: /** @type {any} */ (signals), accountOf, channel, heard };
}

test('a couple forms: both partners get `boot` on their own channels right after the accept commits', async () => {
  const { pg, call, person, sent, channel, heard } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    // The invite is account-addressed (`for` Kira): her own channel hears it at once, before any worker tick.
    assert.ok(heard(await channel(b)).includes('changed:decide'), JSON.stringify(sent));
    sent.length = 0;
    const accepted = await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true });
    assert.equal(accepted.status, 200, JSON.stringify(accepted));
    // The inviter's device listens on Alex's channel only (the couple channel is new): `boot` reaches it there.
    for (const p of [a, b]) {
      const got = heard(await channel(p));
      assert.ok(got.includes('changed:boot'), `${p}: ${JSON.stringify(got)}`);
      assert.ok(got.includes('changed:couple'), `${p}: ${JSON.stringify(got)}`);
    }
    // Nothing but codes on the wire.
    const wire = JSON.stringify(sent);
    for (const leak of [a, b, accepted.profileId, 'Alex', 'Kira', inv.id]) assert.ok(!wire.includes(leak), leak);
    for (const m of sent) assert.deepEqual(Object.keys(m.payload).sort(), m.payload.t ? ['k', 't'] : ['k']);
  } finally { await pg.close(); }
});

test('a queued item signals both its addressee and its `for` accounts after commit; a replay signals nothing', async () => {
  const { pg, call, person, sent, channel, heard } = await world();
  try {
    await person('ua', 'Alex'); const b = await person('ub', 'Kira');
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    sent.length = 0;
    // Alex, as the couple, asks Kira to approve changes: `couple.approvalChanged` to the couple, `for` Kira.
    const id = op();
    const r = await call('ua', pair, { action: 'couple.setApproval', opId: id, approvesPartner: true });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.ok(heard(await channel(pair)).includes('changed:couple'), JSON.stringify(sent));
    const kira = heard(await channel(b));
    assert.ok(kira.includes('changed:couple') && kira.includes('changed:boot'), JSON.stringify(kira));
    sent.length = 0;
    const again = await call('ua', pair, { action: 'couple.setApproval', opId: id, approvesPartner: true });
    assert.equal(again.replayed, true);
    assert.deepEqual(sent, []);
  } finally { await pg.close(); }
});

test('a staff role granted or revoked sends `boot` and `changed:counts` to the grantee', async () => {
  const { pg, db, call, person, sent, channel, heard } = await world();
  try {
    const boss = await person('uo', 'Boss'); const mira = await person('um', 'Mira');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    for (const grant of [true, false]) {
      sent.length = 0;
      const r = await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant });
      assert.equal(r.status, 200, JSON.stringify(r));
      const got = heard(await channel(mira));
      assert.ok(got.includes('changed:boot') && got.includes('changed:counts'), `${grant}: ${JSON.stringify(got)}`);
    }
  } finally { await pg.close(); }
});

test('the worker tick: an approved file sends `changed:media` to its owner', async () => {
  const { pg, db, person, sent, signals, channel, heard, accountOf } = await world();
  try {
    const a = await person('ua', 'Alex');
    const [asset] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at, view_rule)
       values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now(), 'normal') returning id`, [a, await accountOf(a)]);
    await db.tx(q => enqueue(q, 'media.approved', a, { assetId: asset.id }));
    sent.length = 0;
    await runJobs(db, { scan: null, signals });
    const got = heard(await channel(a));
    assert.ok(got.includes('changed:media') && got.includes('changed:post'), JSON.stringify(sent));
  } finally { await pg.close(); }
});

test('a command that queues something people are told about kicks the worker; history alone does not', async () => {
  let kicks = 0;
  const { pg, call, person } = await world({ kick: () => { kicks++; } });
  try {
    await person('ua', 'Alex'); await person('ub', 'Kira');
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' })).status, 200);
    assert.equal(kicks, 1);
    await call('ua', null, { action: 'session.bootstrap' });
    assert.equal(kicks, 1);
  } finally { await pg.close(); }
});

test('topic and action maps: staff markers and plumbing change nothing; unknown topics change counts', () => {
  assert.deepEqual(topicEntities('moderation.report'), []);
  assert.deepEqual(topicEntities('media.purge'), []);
  assert.deepEqual(topicEntities('something.new'), ['counts']);
  assert.ok(topicEntities('couple.stopped').includes('boot'));
  assert.ok(topicEntities('staff.role').includes('boot'));
  assert.deepEqual(actionEntities('staff.mediaDecide'), []);
  assert.deepEqual(actionEntities('profile.update'), ['profile']);
  assert.ok(actionEntities('decide.approval').includes('counts'));
});
