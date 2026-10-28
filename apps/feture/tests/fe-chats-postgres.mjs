// Slice G1 on PGlite as feture_api: conversations from matches, messages, read cursors, ephemeral media, endings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats, sweepEphemeral } from '../server/commands/chats.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';
import { couples } from '../server/commands/couples.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...discover, ...chats, ...couples } });

/** An asset of `profileId` for `purpose`, approved and safe, with served copies. */
async function asset(db, profileId, purpose = 'chat', viewRule = 'normal') {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at, view_rule)
     values ($1, $2, 'image', $3, 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now(), $4) returning id`, [profileId, account_id, purpose, viewRule]);
  return a.id;
}

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const member = async (/** @type {string} */ user, /** @type {string} */ handle, opts = {}) => {
    const id = await person(user, handle, opts);
    const av = await asset(db, id, 'avatar');
    await db.query(`update feture.profile set avatar_asset_id = $1 where id = $2`, [av, id]);
    return id;
  };
  /** Mutual like: returns the conversation id. */
  const matchUp = async (/** @type {string} */ ua, /** @type {string} */ a, /** @type {string} */ ub, /** @type {string} */ b) => {
    await call(ua, a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'like' });
    const r = await call(ub, b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' });
    assert.equal(r.state, 'matched', JSON.stringify(r));
    return r.conversationId;
  };
  return { ...env, member, matchUp };
}

test('a match opens a conversation: new-match row, messages with seq, unread per account, receipts, archive and mute', async () => {
  const { pg, call, member, matchUp } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    const conv = await matchUp('ua', a, 'ub', b);
    let list = (await call('ua', a, { action: 'chats.list' })).items;
    assert.deepEqual([list.length, list[0].newMatch, list[0].other.handle], [1, true, 'Kira']);
    assert.equal((await call('uc', c, { action: 'chat.messages', conversationId: conv })).status, 404); // not a member

    const m1 = await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет!' });
    await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Как дела?', replyTo: m1.id });
    assert.equal((await call('ub', b, { action: 'chats.list' })).items[0].unread, 2);
    const msgs = await call('ub', b, { action: 'chat.messages', conversationId: conv });
    assert.deepEqual(msgs.items.map((/** @type {any} */ m) => [m.seq, m.body, m.mine]), [[1, 'Привет!', false], [2, 'Как дела?', false]]);
    await call('ub', b, { action: 'chat.read', conversationId: conv, upToSeq: 99 });
    assert.equal((await call('ub', b, { action: 'chats.list' })).items[0].unread, 0);
    assert.equal((await call('ua', a, { action: 'chat.messages', conversationId: conv })).otherRead, 2);

    // Archived until a new message arrives.
    await call('ub', b, { action: 'chat.archive', conversationId: conv, on: true });
    assert.deepEqual((await call('ub', b, { action: 'chats.list' })).items, []);
    await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Ты тут?' });
    list = (await call('ub', b, { action: 'chats.list' })).items;
    assert.equal(list[0].archived, false);
  } finally { await pg.close(); }
});

test('ending: «Прекратить общение» and blocks end the conversation; history stays, nothing new goes out', async () => {
  const { pg, call, member, matchUp } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    const conv = await matchUp('ua', a, 'ub', b);
    await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет' });
    await call('ub', b, { action: 'match.end', opId: op(), profileId: a });
    const got = await call('ua', a, { action: 'chat.messages', conversationId: conv });
    assert.deepEqual([got.state, got.endedReason, got.items.length], ['ended', 'unmatch', 1]);
    assert.equal((await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Ещё' })).rule, 'ended');

    const conv2 = await matchUp('ua', a, 'uc', c);
    await call('uc', c, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.equal((await call('ua', a, { action: 'chat.messages', conversationId: conv2 })).status, 404);
    assert.ok(!(await call('ua', a, { action: 'chats.list' })).items.some((/** @type {any} */ i) => i.id === conv2));
  } finally { await pg.close(); }
});

test('ephemeral media: both sides adults, no link before a conscious open, «once» burns after it, timers expire in the sweep', async () => {
  const { pg, db, call, member, matchUp } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa', { verified: false });
    const conv = await matchUp('ua', a, 'ub', b);
    const other = await matchUp('ua', a, 'uc', c);
    assert.equal((await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: other, assetId: await asset(db, a, 'chat', 'once'), mode: 'once' })).rule, 'age_required');
    assert.deepEqual((await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: await asset(db, b, 'chat', 'once'), mode: 'once' })).fields, ['assetId']);

    const once = await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: await asset(db, a, 'chat', 'once'), mode: 'once' });
    const listed = (await call('ub', b, { action: 'chat.messages', conversationId: conv })).items[0].media;
    assert.deepEqual([listed.ephemeral, listed.state, listed.src], [true, 'unopened', undefined]);
    const opened = await call('ub', b, { action: 'chat.openMedia', opId: op(), messageId: once.id });
    assert.ok(opened.media.src.full);
    assert.equal((await call('ub', b, { action: 'chat.openMedia', opId: op(), messageId: once.id })).gone, true);
    const [{ state }] = await db.query(`select a.state from feture.message m join feture.media_asset a on a.id = m.media_asset_id where m.id = $1`, [once.id]);
    assert.equal(state, 'removed');

    // A timer runs from the first open; the sweep closes it afterwards and burns the file.
    const t = await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: await asset(db, a, 'chat', 'once'), mode: 't15' });
    assert.ok((await call('ub', b, { action: 'chat.openMedia', opId: op(), messageId: t.id })).until);
    await db.query(`update feture.message_media_view set opened_at = now() - interval '20 minutes' where message_id = $1`, [t.id]);
    assert.equal(await sweepEphemeral(db), 1);
    const [{ state: s2 }] = await db.query(`select a.state from feture.message m join feture.media_asset a on a.id = m.media_asset_id where m.id = $1`, [t.id]);
    assert.equal(s2, 'removed');

    // Normal media is blurred by default for the recipient (chatBlur).
    await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: await asset(db, a) });
    const last = (await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.at(-1).media;
    assert.equal(last.blurred, true);
    // A tap reveals it (no view is used up).
    const lastId = (await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.at(-1).id;
    assert.equal((await call('ub', b, { action: 'chat.openMedia', opId: op(), messageId: lastId })).media.blurred, false);
    // The mode was chosen at upload: a view-once file cannot go out as a normal one.
    assert.deepEqual((await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: await asset(db, a, 'chat', 'once') })).fields, ['mode']);
    // An explicit file is not used up for someone who has not turned explicit content on.
    const ex = await asset(db, a, 'chat', 'once');
    await db.query(`update feture.media_asset set explicitness = 'explicit' where id = $1`, [ex]);
    const exMsg = await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: ex, mode: 'once' });
    assert.equal((await call('ub', b, { action: 'chat.openMedia', opId: op(), messageId: exMsg.id })).rule, 'explicit_off');
    assert.equal((await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.at(-1).media.state, 'unopened');
  } finally { await pg.close(); }
});

test('review fixes: ex-partners keep nothing of a deleted couple’s chats; the account that liked back gets no «match» about itself', async () => {
  const { pg, db, call, coupleOf, member, matchUp } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    const pair = await coupleOf([b, c]);
    const av = await asset(db, pair, 'avatar');
    await db.query(`update feture.profile set avatar_asset_id = $1 where id = $2`, [av, pair]);
    await db.query(`update feture.account set age_verified_until = now() + interval '1 year' where person_profile_id in ($1, $2)`, [b, c]);
    const conv = await matchUp('ua', a, 'ub', pair);
    await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Секрет для пары' });
    assert.equal((await call('uc', null, { action: 'chats.list' })).items.length, 1);
    const { deleteCouple } = await import('../server/commands/couples.mjs');
    await db.tx(q => deleteCouple(q, pair, 'test'));
    assert.deepEqual((await call('uc', null, { action: 'chats.list' })).items, []);
    assert.equal((await call('ua', a, { action: 'chat.messages', conversationId: conv })).state, 'ended'); // the other side keeps history
    const { notifyHandlers } = await import('../server/notify.mjs');
    const { drain } = await import('../server/outbox.mjs');
    await drain(db, notifyHandlers(db), { limit: 100 });
    const rows = await db.query(`select x.person_profile_id from feture.notification n join feture.account x on x.id = n.recipient_account_id where n.type = 'match'`);
    assert.ok(!rows.some(r => r.person_profile_id === b)); // Kira liked back: no «match» about her own action
  } finally { await pg.close(); }
});

test('a normal photo still in review is a «pending» photo for the recipient, never an empty message; a removed one is «gone»', async () => {
  const { pg, db, call, member, matchUp } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    const conv = await matchUp('ua', a, 'ub', b);
    const id = await asset(db, a);
    await db.query(`update feture.media_asset set state = 'needs_review', copies_at = null where id = $1`, [id]);
    const sent = await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: id });
    assert.ok(sent.id, JSON.stringify(sent));
    const theirs = (await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.at(-1);
    assert.deepEqual([theirs.body, theirs.media], ['', { pending: true, src: null }]);
    const mine = (await call('ua', a, { action: 'chat.messages', conversationId: conv })).items.at(-1);
    assert.deepEqual([mine.media.pending, mine.media.src], [true, null]);
    await db.query(`update feture.media_asset set state = 'removed' where id = $1`, [id]);
    const gone = (await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.at(-1);
    assert.deepEqual(gone.media, { gone: true, src: null });
  } finally { await pg.close(); }
});

/** A video (chat) or voice message of `profileId`, approved, with served copies. */
async function avAsset(db, profileId, kind = 'audio', viewRule = 'normal') {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
  const video = kind === 'video';
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at, view_rule,
       duration_ms, poster_mime, poster_bytes, waveform, width, height)
     values ($1, $2, $3, $4, 'u/' || gen_random_uuid(), $5, 10, 'approved', $6, now(), $7, $8, $9, $10, $11, $12, $13) returning id`,
    [profileId, account_id, kind, video ? 'chat' : 'voice', video ? 'video/mp4' : 'audio/webm', video ? 'safe' : 'explicit', viewRule,
      video ? 12000 : 3500, video ? 'image/jpeg' : null, video ? 100 : null, video ? null : [3, 9, 20], video ? 720 : null, video ? 1280 : null]);
  return a.id;
}

test('voice and video in chats: members only, «прослушано», voice always normal, clips follow the photo rules, blocks hide all', async () => {
  const { pg, db, call, member, matchUp } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    const conv = await matchUp('ua', a, 'ub', b);
    // A voice message goes out as is: no view rule, no caption, only one's own, once.
    const vid = await avAsset(db, a);
    assert.deepEqual((await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: vid, mode: 'once' })).fields, ['mode']);
    assert.deepEqual((await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: vid, body: 'подпись' })).fields, ['mode']);
    assert.deepEqual((await call('ub', b, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: vid })).fields, ['assetId']);
    const sent = await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: vid });
    assert.ok(sent.id, JSON.stringify(sent));
    assert.equal((await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: vid })).rule, 'already_sent');

    // The recipient hears it (never blurred, even with «blur all»); the list says what it is.
    await db.query(`update feture.account set chat_blur = true where person_profile_id = $1`, [b]);
    const theirs = (await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.at(-1).media;
    assert.deepEqual([theirs.kind, theirs.durationMs, theirs.peaks, theirs.blurred, !!theirs.src.file, theirs.listened], ['audio', 3500, [3, 9, 20], false, true, false]);
    assert.equal((await call('ub', b, { action: 'chats.list' })).items[0].last.kind, 'audio');
    // «Прослушано»: only the other side marks it, once; the sender then sees it.
    assert.equal((await call('ua', a, { action: 'chat.listened', messageId: sent.id })).listened, false);
    assert.equal((await call('ua', a, { action: 'chat.messages', conversationId: conv })).items.at(-1).media.listened, false);
    assert.equal((await call('ub', b, { action: 'chat.listened', messageId: sent.id })).listened, true);
    assert.equal((await call('ub', b, { action: 'chat.listened', messageId: sent.id })).listened, true);
    assert.equal((await db.query('select count(*)::int n from feture.message_listen'))[0].n, 1);
    assert.equal((await call('ua', a, { action: 'chat.messages', conversationId: conv })).items.at(-1).media.listened, true);
    assert.equal((await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.at(-1).media.listened, true);
    // Someone outside the conversation neither hears nor marks it; a text message is not a voice message.
    assert.equal((await call('uc', c, { action: 'chat.listened', messageId: sent.id })).status, 404);
    assert.equal((await call('uc', c, { action: 'chat.messages', conversationId: conv })).status, 404);
    const text = await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет' });
    assert.equal((await call('ub', b, { action: 'chat.listened', messageId: text.id })).status, 404);

    // A clip: blurred by default like a photo (poster blur only, no clip link) until a tap; then the clip and its length.
    const clip = await avAsset(db, a, 'video');
    await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: clip });
    const last = (await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.at(-1);
    assert.deepEqual([last.media.kind, last.media.blurred, Object.keys(last.media.src)], ['video', true, ['blur']]);
    const open = await call('ub', b, { action: 'chat.openMedia', opId: op(), messageId: last.id });
    assert.deepEqual([open.media.kind, open.media.durationMs, !!open.media.src.file, !!open.media.src.card], ['video', 12000, true, true]);
    // A disappearing clip: no link before the conscious open, gone after «once».
    const onceClip = await avAsset(db, a, 'video', 'once');
    const oc = await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: onceClip, mode: 'once' });
    const listed = (await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.at(-1).media;
    assert.deepEqual([listed.ephemeral, listed.kind, listed.src], [true, 'video', undefined]);
    assert.ok((await call('ub', b, { action: 'chat.openMedia', opId: op(), messageId: oc.id })).media.src.file);
    assert.equal((await call('ub', b, { action: 'chat.openMedia', opId: op(), messageId: oc.id })).gone, true);

    // A block hides the conversation, its voice messages and the «прослушано» mark either way.
    await call('ub', b, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.equal((await call('ua', a, { action: 'chat.messages', conversationId: conv })).status, 404);
    assert.equal((await call('ub', b, { action: 'chat.listened', messageId: sent.id })).status, 404);
    assert.equal((await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: await avAsset(db, a) })).status, 404);
  } finally { await pg.close(); }
});
