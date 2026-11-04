// Slice E on PGlite as feture_api: invitations, a couple that starts empty, per-member approval setting,
// stop with a 30-day restore window, restore by both, deletion after the window.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { access } from '../server/commands/access.mjs';
import { couples } from '../server/commands/couples.mjs';
import { social } from '../server/commands/social.mjs';
import { readFileSync } from 'node:fs';
import { runJobs } from '../server/jobs.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...access, ...couples, ...social } });

test('invitations: exact nickname, one outgoing, visible decline, withdraw, both must be free', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'alex' })).rule, 'self');
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'nobody' })).status, 404);
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: '@kira' });
    assert.equal(inv.status, 200);
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Noa' })).rule, 'invite_pending');
    assert.equal((await call('uc', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).status, 404); // not for Noa

    const seen = await call('ub', null, { action: 'couple.invites' });
    assert.deepEqual(seen.incoming.map(i => i.profile.handle), ['Alex']);
    assert.equal((await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: false })).state, 'declined');
    assert.deepEqual((await call('ua', null, { action: 'couple.invites' })).outgoing.map(i => i.state), ['declined']); // CPL-013

    const inv2 = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Noa' });
    assert.equal((await call('ua', null, { action: 'couple.inviteWithdraw', opId: op(), inviteId: inv2.id })).state, 'withdrawn');
    assert.equal((await call('uc', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv2.id, accept: true })).status, 409);

    // Kira invites Alex and Noa invites Alex; Alex accepts Kira: Noa's invitation is void, and nobody can join twice.
    const toAlex = await call('ub', null, { action: 'couple.invite', opId: op(), handle: 'Alex' });
    const fromNoa = await call('uc', null, { action: 'couple.invite', opId: op(), handle: 'Alex' });
    const ok = await call('ua', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: toAlex.id, accept: true });
    assert.equal(ok.state, 'accepted');
    assert.equal((await call('ua', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: fromNoa.id, accept: true })).status, 409);
    // Already in a couple reads like not found (owner 04.11.2026: an invitation never tells who is in a couple).
    assert.deepEqual(Object.entries(await call('uc', null, { action: 'couple.invite', opId: op(), handle: 'Kira' })).filter(([k]) => k !== 'requestId').sort(),
      Object.entries(await call('uc', null, { action: 'couple.invite', opId: op(), handle: 'nobody_here' })).filter(([k]) => k !== 'requestId').sort());
    assert.equal((await call('uc', null, { action: 'couple.invite', opId: op(), handle: 'Kira' })).status, 404);
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Noa' })).rule, 'already_in_couple');
    const [{ n }] = await db.query(`select count(*)::int n from feture.profile where kind = 'couple'`);
    assert.equal(n, 1);
    assert.ok(a && b && c);
  } finally { await pg.close(); }
});

test('a new couple starts empty, outside Discover, readable by both; approvals are each member’s own setting', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    await call('ua', a, { action: 'interests.set', opId: op(), topicId: 'bondage', value: 8, vis: 'public' });
    await call('ua', a, { action: 'private.setText', opId: op(), text: 'Личное' });
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;

    const mine = await call('ua', null, { action: 'profile.mine' });
    assert.deepEqual(mine.profiles.map(p => p.kind), ['person', 'couple']);
    const view = (await call('ub', pair, { action: 'couple.get' })).couple;
    assert.deepEqual([view.name, view.state, view.members.length, view.members[0].me], ['Alex и Kira', 'active', 2, true]);
    assert.equal((await call('ua', pair, { action: 'interests.list', profileId: pair })).items.length, 0); // nothing copied (CPL-003)
    assert.equal((await call('ua', pair, { action: 'private.get', profileId: pair })).text, '');
    assert.equal((await call('ua', pair, { action: 'profile.settings' })).settings.discoverMode, 'off'); // owner 28.10.2026: switched on with a photo

    // Kira asks to approve Alex's widening changes; Alex's own setting stays off.
    assert.equal((await call('ub', pair, { action: 'couple.setApproval', opId: op(), approvesPartner: true })).approvesPartner, true);
    const rows = await db.query(`select approves_partner from feture.profile_member where profile_id = $1 order by approves_partner`, [pair]);
    assert.deepEqual(rows.map(r => r.approves_partner), [false, true]);
    // As Alex, turning the couple's private part on now waits for Kira; as Kira it would apply at once.
    await call('ua', pair, { action: 'private.setOn', opId: op(), on: false });
    const pend = await call('ua', pair, { action: 'private.setOn', opId: op(), on: true });
    assert.ok(pend.pending?.approvalId);
    // Kira's own changes do not wait: Alex does not ask to approve them.
    assert.equal((await call('ub', pair, { action: 'private.setOn', opId: op(), on: true })).on, true);
  } finally { await pg.close(); }
});

test('stop: immediate safety action by either partner; restore needs both within 30 days; otherwise deleted', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), d = await person('ud', 'Mia');
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    await db.query(`insert into feture.private_part (profile_id, text) values ($1, 'Текст пары') on conflict (profile_id) do update set text = excluded.text`, [pair]);
    const r = await call('ud', d, { action: 'access.request', opId: op(), profileId: pair, scopes: ['info'] });
    const g = await call('ua', pair, { action: 'access.grant', opId: op(), requestId: r.id, scopes: ['info'], term: 'none' });
    await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: g.pending.approvalId, choice: 'approve' });
    assert.equal((await call('ud', d, { action: 'private.get', profileId: pair })).text, 'Текст пары');

    const stop = await call('ub', pair, { action: 'couple.stop', opId: op(), confirm: true });
    assert.deepEqual([stop.state, stop.grants], ['paused', 1]);
    assert.equal((await call('ud', d, { action: 'private.get', profileId: pair })).status, 404); // a paused couple is not visible
    assert.equal((await call('ua', pair, { action: 'interests.set', opId: op(), topicId: 'bondage', value: 5, vis: 'public' })).error, 'profile_read_only');
    assert.equal((await call('ua', pair, { action: 'couple.get' })).couple.state, 'paused');

    assert.equal((await call('ua', pair, { action: 'couple.restore', opId: op() })).waitingForPartner, true);
    assert.equal((await call('ub', pair, { action: 'couple.restore', opId: op() })).state, 'active');
    assert.equal((await call('ua', pair, { action: 'profile.settings' })).settings.discoverMode, 'off'); // restored with Discover off
    assert.equal((await call('ud', d, { action: 'private.get', profileId: pair })).text, undefined); // access does not come back

    // Stopped again and not restored in time: deleted, both partners free again.
    await call('ua', pair, { action: 'couple.stop', opId: op(), confirm: true });
    await db.query(`update feture.profile set restore_until = now() - interval '1 minute' where id = $1`, [pair]);
    assert.equal((await call('ua', pair, { action: 'couple.restore', opId: op() })).status, 409);
    const tick = await runJobs(db, { scan: null });
    assert.equal(tick.couples, 1);
    assert.equal((await call('ua', pair, { action: 'couple.get' })).status, 403);
    assert.deepEqual((await call('ua', null, { action: 'profile.mine' })).profiles.map(p => p.kind), ['person']);
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' })).status, 200);
    assert.ok(a && b);
  } finally { await pg.close(); }
});

test('a paused couple blocks a new one unless the person chooses to end it for good', async () => {
  const { pg, call, person } = await setup();
  try {
    await person('ua', 'Alex'); await person('ub', 'Kira'); await person('uc', 'Noa');
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    await call('ua', pair, { action: 'couple.stop', opId: op(), confirm: true });
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Noa' })).rule, 'paused_couple_exists');
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Noa', replacePaused: true })).status, 200);
    assert.equal((await call('ub', pair, { action: 'couple.restore', opId: op() })).status, 403); // the old couple is gone for both
  } finally { await pg.close(); }
});

test('review fixes: partner sees values, stop closes the couple’s outgoing side, invite cooldown and limit, narrowing interests', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), d = await person('ud', 'Mia');
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    await call('ub', pair, { action: 'couple.setApproval', opId: op(), approvesPartner: true });

    // The partner decides on values, not on field names.
    const p = await call('ua', pair, { action: 'profile.update', opId: op(), rev: 1, bio: 'Нас двое' });
    const list = (await call('ub', pair, { action: 'decide.approvals' })).items;
    assert.equal(list.find(x => x.id === p.pending.approvalId).change.bio, 'Нас двое');

    // Narrowing an interest never waits; widening does.
    await call('ub', pair, { action: 'interests.set', opId: op(), topicId: 'bondage', value: 6, vis: 'public' }); // Kira: Alex does not ask
    assert.equal((await call('ua', pair, { action: 'interests.set', opId: op(), topicId: 'bondage', value: 6, vis: 'only' })).vis, 'only');
    await call('ub', pair, { action: 'interests.set', opId: op(), topicId: 'shibari', value: 4, vis: 'public' });
    // Showing it to fewer people but with new content is a change the partner decides on.
    assert.ok((await call('ua', pair, { action: 'interests.set', opId: op(), topicId: 'shibari', value: 9, vis: 'granted' })).pending);
    assert.ok((await call('ua', pair, { action: 'interests.set', opId: op(), topicId: 'bondage', value: 6, vis: 'public' })).pending);

    // The couple's outgoing request and the access Mia gave it end when it stops, and do not come back.
    await call('ud', d, { action: 'private.setText', opId: op(), text: 'Мой текст' });
    await db.query(`update feture.account set age_verified_until = now() + interval '1 year' where person_profile_id = any($1)`, [[a, b]]);
    const r1 = await call('ua', pair, { action: 'access.request', opId: op(), profileId: d, scopes: ['info'] });
    await call('ud', d, { action: 'access.grant', opId: op(), requestId: r1.id, scopes: ['info'], term: 'none' });
    await db.query(`update feture.access_request set state = 'declined', decided_at = now() - interval '40 days' where id = $1`, [r1.id]); // make room for a second one
    const r2 = await call('ub', pair, { action: 'access.request', opId: op(), profileId: d, scopes: ['info'] });
    assert.equal(r2.status, 200);
    assert.equal((await call('ua', pair, { action: 'private.get', profileId: d })).text, 'Мой текст');
    await call('ua', pair, { action: 'couple.stop', opId: op(), confirm: true });
    const [req] = await db.query('select state, closed_reason from feture.access_request where id = $1', [r2.id]);
    assert.deepEqual([req.state, req.closed_reason], ['closed', 'couple_stopped']);
    assert.equal((await db.query(`select count(*)::int n from feture.access_grant where viewer_profile_id = $1 and revoked_at is null`, [pair]))[0].n, 0);
    assert.equal((await db.query(`select count(*)::int n from feture.profile_member where profile_id = $1 and approves_partner`, [pair]))[0].n, 0);
    await call('ua', pair, { action: 'couple.restore', opId: op() });
    await call('ub', pair, { action: 'couple.restore', opId: op() });
    assert.equal((await call('ua', pair, { action: 'private.get', profileId: d })).text, undefined);
  } finally { await pg.close(); }
});

test('invitations: a week of quiet after a decline, twenty a day, deleted couples keep no content', async () => {
  const { pg, db, call, person } = await setup();
  try {
    await person('ua', 'Alex'); await person('ub', 'Kira');
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: false });
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' })).rule, 'invite_cooldown');
    for (let i = 0; i < 18; i++) await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'nobody' + i }); // not found, still counted
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'nobody19' })).status, 429);

    const [{ id: x }] = await db.query(`select id from feture.account where person_profile_id = (select id from feture.profile where handle = 'Kira')`);
    await person('uc', 'Noa');
    const inv2 = await call('uc', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv2.id, accept: true })).profileId;
    await call('ub', pair, { action: 'interests.set', opId: op(), topicId: 'bondage', value: 6, vis: 'public' });
    await call('ub', pair, { action: 'couple.stop', opId: op(), confirm: true });
    await db.query(`update feture.profile set restore_until = now() - interval '1 minute' where id = $1`, [pair]);
    const { runJobs } = await import('../server/jobs.mjs');
    await runJobs(db, { scan: null });
    assert.equal((await db.query('select count(*)::int n from feture.interest where profile_id = $1', [pair]))[0].n, 0);
    assert.ok(x);
  } finally { await pg.close(); }
});

test('couple nick (owner 29.10.2026): suggested from the partners’ nicks, unique, changeable once for free, then the same limits; default name follows the partners', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Anya'), b = await person('ub', 'Max');
    await person('uc', 'anya_max'); // the obvious nick is taken by a person
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Max' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    let c = (await call('ub', pair, { action: 'couple.get' })).couple;
    assert.deepEqual([c.handle, c.name, c.chosenName], ['anya_max2', 'Anya и Max', '']);
    // The one invited signed up first: the nick follows the name's order (who signed up first), not who invited.
    const lea = await person('ul', 'Lea');
    await person('uz', 'Zoe');
    await db.query(`update feture.profile set created_at = now() - interval '1 day' where id = $1`, [lea]);
    const inv2 = await call('uz', null, { action: 'couple.invite', opId: op(), handle: 'Lea' });
    const pair2 = (await call('ul', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv2.id, accept: true })).profileId;
    const c2 = (await call('ul', pair2, { action: 'couple.get' })).couple;
    assert.deepEqual([c2.handle, c2.name], ['lea_zoe', 'Lea и Zoe']);
    // A partner's name change shows in the couple's default name.
    const pa = (await call('ua', a, { action: 'profile.get', profileId: a })).profile;
    await call('ua', a, { action: 'profile.update', opId: op(), rev: pa.rev, name: 'Аня' });
    assert.equal((await call('ub', pair, { action: 'couple.get' })).couple.name, 'Аня и Max');
    // The profile editor: the nick must stay unique; a free one and a name are taken; the first change was the free one.
    const pc = (await call('ub', pair, { action: 'profile.get', profileId: pair })).profile;
    assert.equal((await call('ub', pair, { action: 'profile.update', opId: op(), rev: pc.rev, handle: 'Max' })).field, 'handle');
    assert.equal((await call('ub', pair, { action: 'profile.update', opId: op(), rev: pc.rev, handle: 'two_of_us', name: 'Мы' })).status, 200);
    c = (await call('ub', pair, { action: 'couple.get' })).couple;
    assert.deepEqual([c.handle, c.name], ['two_of_us', 'Мы']);
    const own = (await call('ua', pair, { action: 'profile.get', profileId: pair })).profile;
    assert.deepEqual([own.handle, own.nickFirst, typeof own.nickAt], ['two_of_us', false, 'string']);
    const again = await call('ua', pair, { action: 'profile.update', opId: op(), rev: own.rev, handle: 'us_again' });
    assert.deepEqual([again.status, again.rule], [422, 'handle_change_cooldown']);
    // Cleared name: «Имя и Имя» again; the nick is a person's and a couple's alike (unique across both).
    assert.equal((await call('ua', pair, { action: 'profile.update', opId: op(), rev: own.rev, name: '' })).status, 200);
    assert.equal((await call('ub', pair, { action: 'couple.get' })).couple.name, 'Аня и Max');
    assert.equal((await call('uc', null, { action: 'nick.check', handle: 'two_of_us' })).available, false);
    // A couple always has a nick.
    const [{ n }] = await db.query(`select count(*)::int n from feture.profile where kind = 'couple' and state <> 'deleted' and handle is null`);
    assert.equal(n, 0);
    assert.ok(b);
  } finally { await pg.close(); }
});

test('stage 4: an invitation nobody answered expires and its inviter is told once — by the job or by the next read', async () => {
  const { pg, db, call, person } = await setup();
  try {
    await person('ua', 'Alex'); await person('ub', 'Kira'); await person('uc', 'Noa'); await person('ud', 'Dana');
    const i1 = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    const i2 = await call('uc', null, { action: 'couple.invite', opId: op(), handle: 'Dana' });
    await db.query(`update feture.couple_invite set expires_at = now() - interval '1 minute' where id = any($1)`, [[i1.id, i2.id]]);
    // Noa reads her invitations first: hers expires there; the job takes Alex's. Each inviter is told once.
    await call('uc', null, { action: 'couple.invites' });
    await runJobs(db, { scan: null });
    await runJobs(db, { scan: null });
    const rows = await db.query(
      `select a.person_profile_id, n.object_id, n.kind from feture.notification n join feture.account a on a.id = n.recipient_account_id
       where n.type = 'pair.inviteExpired' order by n.created_at`);
    assert.equal(rows.length, 2, JSON.stringify(rows));
    assert.deepEqual(rows.map(r => r.object_id).sort(), [i1.id, i2.id].sort());
    assert.ok(rows.every(r => r.kind === 'result'));
    const inviters = (await db.query(`select id from feture.profile where handle in ('Alex', 'Noa')`)).map(r => r.id).sort();
    assert.deepEqual(rows.map(r => r.person_profile_id).sort(), inviters, 'only the inviters');
    assert.equal((await call('ua', null, { action: 'couple.invites' })).outgoing[0].state, 'expired');
  } finally { await pg.close(); }
});

test('a partner is never blocked (audit item 42): from the personal profile or the couple, also while paused; follow stays; old blocks are removed', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Anya'), b = await person('ub', 'Max'), c = await person('uc', 'Noa');
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Max' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    const block = (user, prof, target) => call(user, prof, { action: 'block.set', opId: op(), profileId: target, on: true });
    assert.equal((await block('ua', a, b)).rule, 'partner_block');
    assert.equal((await block('ua', pair, b)).rule, 'partner_block');
    assert.equal((await block('ub', b, a)).rule, 'partner_block');
    assert.equal((await call('ua', a, { action: 'follow.set', opId: op(), profileId: b, on: true })).following, true);
    assert.equal((await call('ua', a, { action: 'profile.get', profileId: b })).profile.partner, true);
    assert.equal((await call('uc', c, { action: 'profile.get', profileId: b })).profile.partner, false);
    // Someone else is blocked as before.
    assert.equal((await block('ua', a, c)).blocked, true);
    // A paused couple: still partners.
    await db.query(`update feture.profile set state = 'paused', paused_at = now(), restore_until = now() + interval '30 days' where id = $1`, [pair]);
    assert.equal((await block('ua', a, b)).rule, 'partner_block');
    // Blocks made before the rule are removed by the migration; others stay.
    const [{ id: acc }] = await db.query('select id from feture.account where person_profile_id = $1', [a]);
    await db.query(`insert into feture.block (blocker_profile_id, blocked_profile_id, acted_by) values ($1, $2, $4), ($3, $2, $4)`, [a, b, pair, acc]);
    await pg.exec(readFileSync(new URL('../supabase/migrations/20261104100000_fe_audit_stage1.sql', import.meta.url), 'utf8'));
    const left = await db.query('select blocker_profile_id, blocked_profile_id from feture.block');
    assert.deepEqual(left.map(r => [r.blocker_profile_id, r.blocked_profile_id]), [[a, c]]);
  } finally { await pg.close(); }
});

test('«Не восстанавливать» (owner 04.11.2026): one partner ends a paused couple for good; both are free and can be invited again', async () => {
  const { pg, db, call, person } = await setup();
  try {
    await person('ua', 'Anya'); await person('ub', 'Max');
    const c = await person('uc', 'Noa');
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Max' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    assert.equal((await call('ua', pair, { action: 'couple.decline', opId: op() })).status, 409); // only a paused couple
    assert.equal((await call('ua', pair, { action: 'couple.stop', opId: op(), confirm: true })).state, 'paused');
    assert.equal((await call('uc', c, { action: 'couple.invite', opId: op(), handle: 'Max' })).status, 404); // still in a couple
    assert.equal((await call('ub', pair, { action: 'couple.decline', opId: op() })).state, 'deleted');
    assert.equal((await db.query('select state from feture.profile where id = $1', [pair]))[0].state, 'deleted');
    assert.equal((await call('uc', c, { action: 'couple.invite', opId: op(), handle: 'Max' })).status, 200);
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Noa' })).status, 200);
    const told = await db.query(`select payload from feture.outbox where topic = 'couple.deleted'`);
    assert.equal(told.length, 2);
  } finally { await pg.close(); }
});
