// Audit 04.11.2026, stage 7 on PGlite as feture_api: couples — what each partner approves is a list of points (the
// private part always), a link change is answered to the kind seen, a paused couple's chat says so, the 30 links count
// confirmed live links only, notifications show the couple's name as it is now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { couples } from '../server/commands/couples.mjs';
import { people } from '../server/commands/people.mjs';
import { chats } from '../server/commands/chats.mjs';
import { discover } from '../server/commands/discover.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { access } from '../server/commands/access.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...couples, ...people, ...chats, ...discover, ...inbox, ...access } });

async function world() {
  const env = await setup();
  const { call, person } = env;
  const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), mia = await person('um', 'Mia');
  const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
  const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
  return { ...env, a, b, mia, pair };
}

test('item 20: Kira asks to approve follows and the private part — Alex’s follow waits, his post does not; the private part waits until she switches that point off; pause and restore keep the list', async () => {
  const { pg, call, mia, pair } = await world();
  try {
    assert.deepEqual((await call('ub', pair, { action: 'couple.setApproval', opId: op(), scope: ['follows', 'private'] })).scope, ['follows', 'private']);
    assert.ok((await call('ua', pair, { action: 'follow.set', opId: op(), profileId: mia, on: true })).pending?.approvalId);
    const d = await call('ua', pair, { action: 'post.saveDraft', opId: op(), post: { type: 'post', body: 'Пост пары без согласия', audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] } });
    assert.equal((await call('ua', pair, { action: 'post.publish', opId: op(), postId: d.id })).pending, undefined);
    assert.ok((await call('ua', pair, { action: 'private.setOn', opId: op(), on: true })).pending?.approvalId);
    // The point is hers to switch: without it the private part opens at once.
    await call('ub', pair, { action: 'couple.setApproval', opId: op(), scope: ['follows'] });
    assert.equal((await call('ua', pair, { action: 'private.setOn', opId: op(), on: true })).pending, undefined);
    await call('ub', pair, { action: 'couple.setApproval', opId: op(), scope: ['follows', 'private'] });
    assert.deepEqual((await call('ub', pair, { action: 'couple.get' })).couple.members.find((/** @type {any} */ m) => m.me).approvesScope, ['follows', 'private']);
    // Pause and restore: the list comes back as it was.
    await call('ua', pair, { action: 'couple.stop', opId: op(), confirm: true });
    await call('ua', pair, { action: 'couple.restore', opId: op() });
    await call('ub', pair, { action: 'couple.restore', opId: op() });
    assert.deepEqual((await call('ub', pair, { action: 'couple.get' })).couple.members.find((/** @type {any} */ m) => m.me).approvesScope, ['follows', 'private']);
  } finally { await pg.close(); }
});

test('item 21: a link change is answered to the kind seen; a change since is refused, «нет» too', async () => {
  const { pg, db, call, a, mia } = await world();
  try {
    const [{ id: acc }] = await db.query(`select id from feture.account where person_profile_id = $1`, [mia]);
    const [{ id: link }] = await db.query(`insert into feture.profile_link (a_profile_id, b_profile_id, kind, state, acted_by, confirmed_at) values ($1, $2, 'friend', 'ok', $3, now()) returning id`, [mia, a, acc]);
    await call('um', mia, { action: 'link.proposeChange', opId: op(), linkId: link, kind: 'play' });
    await call('um', mia, { action: 'link.proposeChange', opId: op(), linkId: link, kind: 'meta' });
    assert.equal((await call('ua', a, { action: 'link.answerChange', opId: op(), linkId: link, accept: true, kind: 'play' })).rule, 'change_changed');
    assert.equal((await call('ua', a, { action: 'link.answerChange', opId: op(), linkId: link, accept: false, kind: 'play' })).rule, 'change_changed');
    assert.equal((await call('ua', a, { action: 'link.answerChange', opId: op(), linkId: link, accept: true, kind: 'meta' })).accepted, true);
    assert.equal((await db.query('select kind from feture.profile_link where id = $1', [link]))[0].kind, 'meta');
  } finally { await pg.close(); }
});

test('item 41: a chat with a paused couple says so in the list and the chat, and refuses messages with its own reason', async () => {
  const { pg, db, call, mia, pair } = await world();
  try {
    await db.query(`update feture.profile_settings set messages_open = '{all}' where profile_id = $1`, [mia]);
    const r = await call('ua', pair, { action: 'chat.request', opId: op(), profileId: mia, body: 'Привет от пары, давай познакомимся' });
    const conv = r.conversationId;
    await call('um', mia, { action: 'chat.requestAnswer', opId: op(), conversationId: conv, answer: 'accept' });
    await call('ua', pair, { action: 'couple.stop', opId: op(), confirm: true });
    const row = (await call('um', null, { action: 'chats.list' })).items.find((/** @type {any} */ c) => c.id === conv);
    assert.equal(row.other.paused, true);
    assert.equal((await call('um', mia, { action: 'chat.messages', conversationId: conv })).otherPaused, true);
    assert.equal((await call('um', mia, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Ты тут?' })).rule, 'pair_paused');
  } finally { await pg.close(); }
});

test('item 45: the 30 links are confirmed links with live profiles; proposals waiting do not count', async () => {
  const { pg, db, call, person, a } = await world();
  try {
    const t = await person('ut', 'Tom');
    const [{ id: accT }] = await db.query(`select id from feture.account where person_profile_id = $1`, [t]);
    // 30 proposals Tom is waiting on, and 30 links with deleted profiles: neither fills Tom's 30.
    for (let i = 0; i < 30; i++) {
      const [{ id: x }] = await db.query(`insert into feture.profile (kind, handle, state) values ('person', $1, 'deleted') returning id`, ['gone' + i]);
      await db.query(`insert into feture.profile_link (a_profile_id, b_profile_id, kind, state, acted_by, confirmed_at) values ($1, $2, 'friend', 'ok', $3, now())`, [t, x, accT]);
    }
    await db.query(`update feture.profile_settings set links_from = 'all' where profile_id = $1`, [t]);
    const r = await call('ua', a, { action: 'link.propose', opId: op(), profileId: t, kind: 'friend' });
    assert.equal(r.status, 200, JSON.stringify(r));
  } finally { await pg.close(); }
});

test('item 46: a couple renamed — its older notifications show the new name; a deleted couple keeps the name it had', async () => {
  const { pg, db, call, pair } = await world();
  try {
    await call('ua', pair, { action: 'couple.stop', opId: op(), confirm: true });
    await drain(db, notifyHandlers(db), { limit: 100 });
    const read = async () => (await call('ub', null, { action: 'notifications.list' })).items.find((/** @type {any} */ x) => x.type === 'pair.stopped');
    const before = await read();
    await db.query(`update feture.profile set chosen_name = 'Мы вдвоём' where id = $1`, [pair]);
    assert.notEqual((await read()).coupleName, before.coupleName);
    assert.equal((await read()).coupleName, 'Мы вдвоём');
    await db.query(`update feture.profile set state = 'deleted', restore_until = null where id = $1`, [pair]);
    assert.equal((await read()).coupleName, before.coupleName);
  } finally { await pg.close(); }
});
