// Backlog wave 6 on PGlite as feture_api: «Вернуть на доработку» with a note and what the author then sees, the
// invitation link for a partner without an account, Q09 setup in one call, «Перестать делиться».
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { access } from '../server/commands/access.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { couples } from '../server/commands/couples.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...access, ...social, ...posts, ...inbox, ...couples } });
const draft = (/** @type {string} */ body) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] });

/** Alex and Kira as a couple through an invitation; Kira approves Alex's widening changes. */
async function pairWorld() {
  const env = await setup();
  const { call, person } = env;
  const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), d = await person('ud', 'Mia');
  const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
  const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
  await call('ub', pair, { action: 'couple.setApproval', opId: op(), approvesPartner: true });
  return { ...env, a, b, d, pair };
}

test('returned with a note: the author sees it with the preview and version, a new version replaces it, dropping it ends it', async () => {
  const { pg, call, pair } = await pairWorld();
  try {
    const p = await call('ua', pair, { action: 'profile.update', opId: op(), rev: 1, bio: 'Нас двое' });
    const id = p.pending.approvalId;
    // A note only when returning, at most 300 characters.
    assert.equal((await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: id, choice: 'approve', comment: 'ok' })).status, 400);
    assert.equal((await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: id, choice: 'return', comment: 'x'.repeat(301) })).status, 400);
    assert.equal((await call('ua', pair, { action: 'decide.approval', opId: op(), approvalId: id, choice: 'return' })).status, 403); // not the author
    assert.equal((await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: id, choice: 'return', comment: '  Короче, пожалуйста  ' })).state, 'returned');

    const mine = (await call('ua', pair, { action: 'decide.approvals' })).items;
    assert.equal(mine.length, 1);
    assert.deepEqual([mine[0].state, mine[0].comment, mine[0].mine, mine[0].version, mine[0].change.bio], ['returned', 'Короче, пожалуйста', true, 1, 'Нас двое']);
    const theirs = (await call('ub', pair, { action: 'decide.approvals' })).items;
    assert.deepEqual([theirs[0].state, theirs[0].mine], ['returned', false]);
    // «Нужно решить» of the author shows it as returned; nothing is left for the partner to decide.
    assert.ok((await call('ua', null, { action: 'decide.list' })).items.some((/** @type {any} */ x) => x.kind === 'jointReturned'));
    // Nobody else sees the couple's changes.
    assert.equal((await call('ud', pair, { action: 'decide.approvals' })).status, 403);

    // The next version replaces the returned one and counts as version 2.
    const p2 = await call('ua', pair, { action: 'profile.update', opId: op(), rev: 1, bio: 'Мы' });
    let list = (await call('ua', pair, { action: 'decide.approvals' })).items;
    assert.deepEqual(list.map((/** @type {any} */ x) => [x.id, x.state, x.version]), [[p2.pending.approvalId, 'pending', 2]]);
    assert.equal((await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: p2.pending.approvalId, choice: 'return' })).state, 'returned');
    list = (await call('ua', pair, { action: 'decide.approvals' })).items;
    assert.deepEqual([list[0].state, list[0].comment], ['returned', null]);
    // Only the author drops a returned change; then it is gone for both.
    assert.equal((await call('ub', pair, { action: 'decide.cancel', opId: op(), approvalId: p2.pending.approvalId })).status, 404);
    assert.equal((await call('ua', pair, { action: 'decide.cancel', opId: op(), approvalId: p2.pending.approvalId })).state, 'cancelled');
    assert.equal((await call('ub', pair, { action: 'decide.approvals' })).items.length, 0);
  } finally { await pg.close(); }
});

test('a joint post carries its preview; an edited draft shows that it changed since', async () => {
  const { pg, call, pair } = await pairWorld();
  try {
    const d = await call('ua', pair, { action: 'post.saveDraft', opId: op(), post: draft('Совместный пост') });
    const r = await call('ua', pair, { action: 'post.publish', opId: op(), postId: d.id });
    let item = (await call('ub', pair, { action: 'decide.approvals' })).items.find((/** @type {any} */ x) => x.id === r.pending.approvalId);
    assert.deepEqual([item.preview.post.body, item.preview.post.changed, item.version], ['Совместный пост', false, 1]);
    await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: r.pending.approvalId, choice: 'return', comment: 'Добавь фото' });
    await call('ua', pair, { action: 'post.saveDraft', opId: op(), postId: d.id, post: draft('Совместный пост, версия два') });
    item = (await call('ua', pair, { action: 'decide.approvals' })).items[0];
    assert.deepEqual([item.state, item.comment, item.preview.post.body, item.preview.post.changed], ['returned', 'Добавь фото', 'Совместный пост, версия два', true]);
    const r2 = await call('ua', pair, { action: 'post.publish', opId: op(), postId: d.id });
    item = (await call('ub', pair, { action: 'decide.approvals' })).items[0];
    assert.deepEqual([item.id, item.version, item.preview.post.changed], [r2.pending.approvalId, 2, false]);
  } finally { await pg.close(); }
});

test('invitation link: single use, revocable, expires, never one’s own, blocked looks like not found, forms the couple', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex');
    await person('ub', 'Kira'); const c = await person('uc', 'Noa'); await person('ud', 'Mia');
    const l = await call('ua', null, { action: 'couple.linkCreate', opId: op() });
    assert.match(l.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await call('ua', null, { action: 'couple.invites' })).link.id, l.id);
    // Only a hash is stored.
    assert.equal((await db.query(`select count(*)::int n from feture.couple_link where token_hash = sha256(convert_to($1, 'UTF8'))`, [l.token]))[0].n, 1);

    assert.equal((await call('ua', null, { action: 'couple.linkPeek', token: l.token })).status, 404); // own link
    await call('uc', c, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.equal((await call('uc', null, { action: 'couple.linkPeek', token: l.token })).status, 404); // blocked either way
    assert.equal((await call('uc', null, { action: 'couple.linkAccept', opId: op(), token: l.token })).status, 404);
    assert.equal((await call('ub', null, { action: 'couple.linkPeek', token: 'A'.repeat(43) })).status, 404);
    assert.equal((await call('ub', null, { action: 'couple.linkPeek', token: l.token })).from.handle, 'Alex');

    // A new link replaces the old one.
    const l2 = await call('ua', null, { action: 'couple.linkCreate', opId: op() });
    assert.equal((await call('ub', null, { action: 'couple.linkPeek', token: l.token })).status, 404);
    // Revoked and expired links stop working.
    assert.equal((await call('ub', null, { action: 'couple.linkRevoke', opId: op(), linkId: l2.id })).status, 404); // not Kira's
    assert.equal((await call('ua', null, { action: 'couple.linkRevoke', opId: op(), linkId: l2.id })).state, 'revoked');
    assert.equal((await call('ub', null, { action: 'couple.linkAccept', opId: op(), token: l2.token })).status, 404);
    const l3 = await call('ua', null, { action: 'couple.linkCreate', opId: op() });
    await db.query(`update feture.couple_link set expires_at = now() - interval '1 minute' where id = $1`, [l3.id]);
    assert.equal((await call('ub', null, { action: 'couple.linkAccept', opId: op(), token: l3.token })).status, 404);
    assert.equal((await call('ua', null, { action: 'couple.invites' })).link, null);

    // Accepting forms the couple like an accepted invitation; the link is used up.
    const l4 = await call('ua', null, { action: 'couple.linkCreate', opId: op() });
    const ok = await call('ub', null, { action: 'couple.linkAccept', opId: op(), token: l4.token });
    assert.equal(ok.state, 'accepted');
    assert.deepEqual((await call('ub', ok.profileId, { action: 'couple.get' })).couple.members.map((/** @type {any} */ m) => m.handle), ['Kira', 'Alex']);
    assert.equal((await call('ud', null, { action: 'couple.linkAccept', opId: op(), token: l4.token })).status, 404);
    assert.deepEqual((await call('ua', null, { action: 'couple.invites' })).outgoing.map((/** @type {any} */ i) => i.state), ['accepted']);
    // Someone in a couple can neither make nor use a link.
    assert.equal((await call('ua', null, { action: 'couple.linkCreate', opId: op() })).rule, 'already_in_couple');
    const l5 = await call('ud', null, { action: 'couple.linkCreate', opId: op() });
    assert.equal((await call('ub', null, { action: 'couple.linkAccept', opId: op(), token: l5.token })).rule, 'already_in_couple');
  } finally { await pg.close(); }
});

test('Q09 setup in one call after forming; requests widening waits for a partner who approves; stop sharing closes all', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'); await person('ub', 'Kira'); const d = await person('ud', 'Mia');
    assert.equal((await call('ua', a, { action: 'couple.setup', opId: op(), mode: 'trust', requestsFrom: 'all' })).rule, 'not_a_couple');
    const l = await call('ua', null, { action: 'couple.linkCreate', opId: op() });
    const pair = (await call('ub', null, { action: 'couple.linkAccept', opId: op(), token: l.token })).profileId;

    const s = await call('ub', pair, { action: 'couple.setup', opId: op(), mode: 'approve', requestsFrom: 'none' });
    assert.deepEqual([s.approvesPartner, s.requestsFrom], [true, 'none']);
    assert.equal((await call('ua', pair, { action: 'profile.settings' })).settings.requestsFrom, 'none');
    // Alex widens it: Kira approves Alex's changes, so it waits.
    const w = await call('ua', pair, { action: 'couple.setup', opId: op(), mode: 'trust', requestsFrom: 'all' });
    assert.deepEqual([w.approvesPartner, w.requestsFrom, !!w.pending?.approvalId], [false, null, true]);
    await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: w.pending.approvalId, choice: 'approve' });
    assert.equal((await call('ua', pair, { action: 'profile.settings' })).settings.requestsFrom, 'all');

    // «Перестать делиться» (V21 pairStopSharing) is access.revokeAll: grants revoked and requests turned off at once.
    await db.query(`update feture.account set age_verified_until = now() + interval '1 year'`);
    await db.query(`insert into feture.private_part (profile_id, text) values ($1, 'Текст пары') on conflict (profile_id) do update set text = excluded.text`, [pair]);
    const r = await call('ud', d, { action: 'access.request', opId: op(), profileId: pair, scopes: ['info'] });
    const g = await call('ub', pair, { action: 'access.grant', opId: op(), requestId: r.id, scopes: ['info'], term: 'none' });
    assert.ok(g.pending, JSON.stringify([r, g]));
    await call('ua', pair, { action: 'decide.approval', opId: op(), approvalId: g.pending.approvalId, choice: 'approve' });
    assert.equal((await call('ua', pair, { action: 'access.revokeAll', opId: op() })).confirmRequired, true);
    assert.equal((await call('ua', pair, { action: 'access.revokeAll', opId: op(), confirm: true })).grants, 1);
    assert.equal((await call('ub', pair, { action: 'profile.settings' })).settings.requestsFrom, 'none');
    assert.equal((await call('ud', d, { action: 'access.request', opId: op(), profileId: pair, scopes: ['info'] })).status, 422);
  } finally { await pg.close(); }
});
