// The notification catalog (contracts/notifications.mjs) is complete and is the one destination resolver: every type
// the server writes and every «Нужно решить» kind has an entry with texts, a card, a destination, a push category and
// an email rule; no known type falls back to the generic «Уведомление»; every route the resolver makes passes the web
// service worker's rule and the app's (the same rule, copied); a written row carries its shape. On PGlite as feture_api.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CARDS, CATALOG, DECIDE_KINDS, EMAILS, FILTERS, PUSH_CATS, SETTING_CATS, destination, entryFor, noteKey, pushTag, routeOk, settingOf, textOf } from '../contracts/notifications.mjs';
import { PROFILE_SETTINGS } from '../contracts/me.mjs';
import { APPROVAL_KINDS } from '../server/approvals.mjs';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { posts } from '../server/commands/posts.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { setup, op } from './fe-helpers.mjs';

const read = (/** @type {string} */ p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ID = '018f0000-0000-7000-8000-00000000a001', ID2 = '018f0000-0000-7000-8000-00000000a002', ID3 = '018f0000-0000-7000-8000-00000000a003';

/** Every notification type server/notify.mjs can write: the TYPES table and the handlers' own `type`s. */
function writtenTypes() {
  const src = read('server/notify.mjs');
  const types = new Set([...src.matchAll(/\btype: '([a-zA-Z.]+)'(?!, id:)/g)].map(m => m[1]));
  for (const m of src.matchAll(/\['event\.\w+', '(\w+)', (?:true|false)\]/g)) types.add(m[1]);
  for (const m of src.matchAll(/\['community\.\w+', '(\w+)'\]/g)) types.add(m[1]);
  return types;
}

/** The web service worker's own route rule, run as the browser would load it. */
function swRule() {
  /** @type {any} */
  const ctx = { self: { addEventListener() {}, registration: {}, clients: {}, location: { origin: 'https://app.example' } }, URL, URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext(read('public/fe-sw.js'), ctx);
  return /** @type {(raw: unknown) => string} */ (ctx.safeUrl);
}

test('every type the server writes and every «Нужно решить» kind has a catalog entry', () => {
  const types = writtenTypes();
  assert.ok(types.size > 60, 'the scan found the types');
  for (const t of ['like', 'reply', 'eventCancelled', 'eventReminder', 'mentionRemoved', 'datingLaunched', 'mediaDecided', 'staffAlert', 'postReturned', 'communityClosed', 'pair.acted'])
    assert.ok(types.has(t), t);
  assert.deepEqual([...types].filter(t => !CATALOG[t]).sort(), [], 'types without a catalog entry');
  // The decisions query names its kinds as literals.
  const sql = read('server/commands/inbox.mjs');
  const body = sql.slice(sql.indexOf('async function decisions'), sql.indexOf('/** @type {Record<keyof typeof inboxCommands'));
  const kinds = new Set([...body.matchAll(/select '(\w+)'/g), ...body.matchAll(/then '(\w+)' else '(\w+)' end/g)].flatMap(m => m.slice(1)));
  assert.deepEqual([...kinds].sort(), [...DECIDE_KINDS].sort());
  for (const k of DECIDE_KINDS) assert.ok(CATALOG['decide.' + k], 'decide.' + k);
  assert.equal(CATALOG.notePublished, undefined, 'the dead type is gone');
});

test('subtypes with their own words are picked from the data', () => {
  const sub = (/** @type {string} */ type, /** @type {any} */ data, /** @type {string} */ key) => assert.equal(noteKey(type, data), key, `${type} ${JSON.stringify(data)}`);
  for (const c of ['host', 'unhost', 'readOnly', 'canWrite', 'remove']) sub('communityMember', { change: c }, 'communityMember.' + c);
  // Every `what` a partner's action for the couple can carry (the enqueue calls, and every visibility setting).
  const whats = new Set(Object.keys(PROFILE_SETTINGS));
  for (const f of ['server/commands/social.mjs', 'server/commands/photos.mjs', 'server/commands/people.mjs', 'server/commands/posts.mjs', 'server/commands/chats.mjs',
    'server/commands/me.mjs', 'server/commands/discover.mjs', 'server/commands/gallery.mjs', 'server/commands/couples.mjs', 'server/commands/events.mjs',
    'server/commands/access.mjs', 'server/commands/communities.mjs']) {
    for (const m of read(f).matchAll(/'couple\.changed'[^\n]*what: '(\w+)'/g)) whats.add(m[1]);
    // The trust-mode helper (server/approvals.mjs partnerActed) names its `what` second.
    for (const m of read(f).matchAll(/partnerActed\(q, \w+, '(\w+)'/g)) whats.add(m[1]);
  }
  for (const w of ['event', 'eventApply', 'community', 'access', 'linkShown']) assert.ok(whats.has(w), w);
  assert.ok(whats.size >= 20, [...whats].join());
  for (const w of whats) sub('pair.acted', { what: w }, 'pair.acted.' + w);
  for (const s of ['approved', 'rejected', 'cancelled', 'expired', 'superseded', 'stale']) sub('pair.decided', { state: s }, 'pair.decided.' + s);
  // Every approval kind has its own card line («{name} предлагает …»).
  for (const k of APPROVAL_KINDS) sub('decide.joint', { approvalKind: k }, 'decide.joint.' + k);
  sub('linkChanged', { answer: 'yes' }, 'linkChanged.yes'); sub('linkChanged', { answer: 'no' }, 'linkChanged.no');
  sub('pair.trust', { approves: true }, 'pair.trust.on'); sub('pair.trust', { approves: false }, 'pair.trust.off');
  sub('decide.req', { label: 'couple' }, 'decide.req.couple'); sub('decide.req', { label: 'me' }, 'decide.req');
  sub('like', {}, 'like');
});

test('every entry is complete: texts, card, destination, push, email; no known type says only «Уведомление»', () => {
  const routes = new Set(['inbox', 'me', 'chats', 'links', 'myPosts', 'interests', 'couple', 'approval', 'blocked', 'security', 'age', 'photoCheck', 'help',
    'premium', 'staff', 'people', 'access', 'visibility', 'post', 'postEdit', 'event', 'eventApplications', 'community', 'communityRequests', 'chat', 'actor',
    'actorPrivate', 'target', 'object', 'coupleGallery', 'moderation', 'accessRequest', 'invite', 'link', 'coupleRestore', 'eventDraft']);
  const icons = read('src/fe/inbox.tsx').match(/const ICONS:Record<string,LucideIcon>=\{([^}]*)\}/)?.[1].split(',').map(x => x.split(':')[0].trim());
  assert.ok(icons?.length, 'the inbox icon map');
  for (const [key, e] of Object.entries(CATALOG)) {
    for (const lang of ['ru', 'en']) {
      for (const couple of [false, true]) {
        const s = textOf(e.text, lang, couple);
        assert.ok(s && !['Уведомление', 'Notification'].includes(s), `${key} ${lang}: text`);
        // The name, when there is one, comes first.
        if (s.includes('{name}')) assert.ok(s.startsWith('{name}'), `${key} ${lang}: the name comes first`);
      }
      for (const f of [e.push.safe, e.push.normal, e.subject, e.gone]) assert.ok(textOf(f, lang), `${key} ${lang}: push / subject / gone`);
    }
    assert.ok(['notice', 'task', 'result'].includes(e.kind), key);
    assert.ok(CARDS.includes(e.card), `${key}: card`);
    assert.ok(FILTERS.includes(e.filter), `${key}: filter`);
    assert.ok(PUSH_CATS.includes(e.push.cat), `${key}: push category`);
    assert.ok(EMAILS.includes(e.email), `${key}: email`);
    assert.ok(routes.has(e.dest), `${key}: destination ${e.dest}`);
    assert.ok(['none', 'object', 'actor', 'type'].includes(e.collapse), key);
    assert.ok(icons.includes(e.icon), `${key}: icon ${e.icon} is in the inbox map`);
    if (key.startsWith('decide.')) assert.equal(e.kind, 'task', key);
  }
  for (const t of writtenTypes()) assert.ok(entryFor(t, {}), t);
  // Email rules of docs/notifications.md «Email».
  for (const t of ['signinNew', 'profileSuspended', 'profileRestricted', 'contentRemoved', 'appealDecided', 'premiumGranted', 'premiumRevoked']) assert.equal(CATALOG[t].email, 'now', t);
  for (const t of ['supportReply', 'eventCancelled', 'eventChanged', 'eventApplicationApproved', 'eventApplicationDeclined', ...DECIDE_KINDS.map(k => 'decide.' + k)]) assert.equal(CATALOG[t].email, 'now-if-unread', t);
  for (const t of ['message', 'pair.acted', 'pair.acted.post']) assert.equal(CATALOG[t].email, 'none', t);
  // A partner's action in trust mode pushes only when it matters (docs/notifications.md «Push»); summaries never push.
  const pushing = Object.keys(CATALOG).filter(k => k.startsWith('pair.acted') && !CATALOG[k].push.off).sort();
  assert.deepEqual(pushing, ['pair.acted.access', 'pair.acted.event', 'pair.acted.eventApply', 'pair.acted.link', 'pair.acted.linkShown', 'pair.acted.post']);
  assert.equal(CATALOG.communityJoins.push.off, true);
  for (const t of ['chatAccepted', 'pair.inviteExpired', 'supportClosed']) assert.equal(CATALOG[t].push.off, false, t);
});

test('push and email rules of stages 6 and 6B: settings categories that work, important, noisy, partner trust actions, tags', () => {
  // Every settings switch the screen shows is some entry's category; «Сообщения», «Решения», «Пара» are their own.
  const used = new Set(Object.values(CATALOG).map(e => settingOf(e)).filter(Boolean));
  for (const c of SETTING_CATS) assert.ok(used.has(c), `settings category ${c} is used`);
  assert.deepEqual([settingOf(CATALOG.message), settingOf(CATALOG['decide.req']), settingOf(CATALOG.chatRequest), settingOf(CATALOG['pair.stopped'])],
    ['messages', 'decide', 'req', 'pair']);
  const screen = read('src/fe/settings.tsx').match(/const CATS:[^=]*=\[([\s\S]*?)\];/)?.[1] ?? '';
  assert.deepEqual([...screen.matchAll(/\['(\w+)'/g)].map(m => m[1]), [...SETTING_CATS], 'the screen lists exactly the categories, in order');
  // Owner decision 4: tasks, an event cancelled or moved, security wait for the morning; social pushes do not.
  for (const t of [...DECIDE_KINDS.map(k => 'decide.' + k), 'eventCancelled', 'eventChanged', 'signinNew']) assert.ok(CATALOG[t].push.important, t);
  for (const t of ['like', 'follow', 'postLike', 'reply', 'match', 'message']) assert.ok(!CATALOG[t].push.important, t);
  for (const t of ['like', 'follow', 'postLike']) assert.ok(CATALOG[t].push.noisy && CATALOG[t].push.summary, t);
  // Tags: one per chat, task, noisy kind, collapse key or object; ids only.
  assert.equal(pushTag({ conversationId: ID }), `c:${ID}`);
  assert.equal(pushTag({ decide: { kind: 'eapp', id: ID } }), `d:eapp:${ID}`);
  assert.equal(pushTag({ key: 'like', notificationId: ID }), 's:like');
  assert.equal(pushTag({ key: 'reply', collapseKey: `reply:${ID}`, notificationId: ID2 }), `k:reply:${ID}`);
  assert.equal(pushTag({ key: 'eventCancelled', object: { type: 'event', id: ID }, notificationId: ID2 }), `o:event:${ID}`);
  assert.equal(pushTag({ key: 'premiumGranted', notificationId: ID2 }), `n:${ID2}`);
});

test('the migration fills the record kind the catalog says', () => {
  const sql = read('supabase/migrations/20261103120000_fe_notification_shape.sql');
  const listed = new Set([...sql.slice(sql.indexOf('when type in')).matchAll(/'([a-zA-Z.]+)'/g)].map(m => m[1]).filter(t => !['result', 'notice'].includes(t)));
  // Types added after that migration had no rows to fill.
  const later = ['pair.inviteExpired', 'eventLate'];
  const results = new Set([...writtenTypes()].filter(t => CATALOG[t].kind === 'result' && !later.includes(t)));
  assert.deepEqual([...listed].sort(), [...results].sort());
});

test('the resolver makes a precise route for every entry, and the service worker and the app accept exactly those', () => {
  const sw = swRule();
  /** @param {string} key */
  const sample = key => {
    // The type is the shortest catalog key the entry extends (`pair.acted.post` → `pair.acted`).
    const type = Object.keys(CATALOG).filter(k => key === k || key.startsWith(k + '.')).sort((x, y) => x.length - y.length)[0];
    const e = CATALOG[key];
    const objectType = { post: 'post', postEdit: 'post', event: 'event', eventApplications: 'event', community: 'community', communityRequests: 'community', chat: 'conversation',
      approval: 'approval', object: 'post', accessRequest: 'accessRequest', invite: 'invite', link: 'link' }[e.dest] ?? null;
    const subPart = key.slice(type.length + 1);
    const data = { conversationId: ID, ticketId: ID, target: ID2, targetType: 'post', targetId: ID, change: subPart, what: subPart, state: subPart, answer: subPart,
      ...(type === 'pair.trust' ? { approves: subPart === 'on' } : {}), ...(type === 'decide.req' ? { label: subPart || 'me' } : {}) };
    return { type, id: ID3, data, object: objectType ? { type: objectType, id: ID } : null, sub: type === 'reply' ? { type: 'reply', id: ID3 } : null, actor: ID2, addressee: ID3, couple: type.startsWith('pair.') ? ID3 : null };
  };
  for (const key of Object.keys(CATALOG)) {
    const n = sample(key);
    const route = destination(n);
    assert.ok(routeOk(route), `${key}: ${route}`);
    assert.equal(sw('/#' + route), '/#' + route, `${key}: the service worker accepts ${route}`);
    if (!['inbox', 'invite'].includes(CATALOG[key].dest)) assert.notEqual(route.split('?')[0], '/n/inbox', `${key} opens its place, not the inbox`);
  }
  // Precise places.
  assert.equal(destination({ type: 'reply', object: { type: 'post', id: ID }, sub: { type: 'reply', id: ID2 }, addressee: ID3 }), `/n/feed/post/${ID}?reply=${ID2}&as=${ID3}`);
  assert.equal(destination({ type: 'pair.decided', data: { state: 'approved' }, object: { type: 'approval', id: ID }, couple: ID3 }), `/n/me/pair?approval=${ID}&as=${ID3}`);
  assert.equal(destination({ type: 'match', object: { type: 'conversation', id: ID } }), `/n/chats/${ID}`);
  assert.equal(destination({ type: 'grant', actor: ID2 }), `/n/people/${ID2}?part=private`);
  assert.equal(destination({ type: 'decide.eapp', object: { type: 'event', id: ID } }), `/n/events/${ID}/applications`);
  assert.equal(destination({ type: 'eventLate', data: { draftId: ID } }), `/n/events/new?draft=${ID}`);
  assert.equal(destination({ type: 'eventLate', data: {} }), '/n/me/events');
  assert.equal(destination({ type: 'supportReply', data: { ticketId: ID } }), `/n/help?ticket=${ID}`);
  assert.equal(destination({ type: 'pair.acted', data: { what: 'discoverMode' }, couple: ID3 }), `/n/me?layer=vis&as=${ID3}`);
  // Stage 5: a moderation decision opens its own card; a request, an invitation and a link open that very one.
  for (const t of ['contentRemoved', 'reportResolved', 'profileSuspended', 'profileRestricted', 'profileRestored', 'profileUnrestricted', 'appealDecided'])
    assert.equal(destination({ type: t, id: ID, data: { targetType: 'post', targetId: ID2 } }), `/n/inbox/${ID}`, t);
  assert.equal(destination({ type: 'profileRestored', data: { rule: 'expired' } }), '/n/inbox');
  assert.equal(destination({ type: 'decide.req', object: { type: 'accessRequest', id: ID }, addressee: ID3 }), `/n/me/access?tab=byme&request=${ID}&as=${ID3}`);
  assert.equal(destination({ type: 'decide.pinv', object: { type: 'invite', id: ID } }), `/n/inbox?tab=todo&item=${ID}`);
  assert.equal(destination({ type: 'decide.link', object: { type: 'link', id: ID }, addressee: ID3 }), `/n/me/links?link=${ID}&as=${ID3}`);
  assert.equal(destination({ type: 'linkAccepted', object: { type: 'link', id: ID }, actor: ID2 }), `/n/me/links?link=${ID}`);
  // Anything unknown or broken: the inbox. Nothing else passes either rule.
  assert.equal(destination({ type: 'nope' }), '/n/inbox');
  assert.equal(destination({ type: 'reply', object: { type: 'post', id: 'x' } }), '/n/inbox');
  for (const bad of ['https://evil.example/#/n/chats', '/n/../x', '/n/chats?x=1', `/n/chats/${ID}?as=${ID}&as=${ID}`, '/n/me/pair?approval=1', `/n/feed/post/${ID.toUpperCase()}`,
    '/n/inbox?', '/n/chats/requests?tab=byme&x', '/admin', '', `/n/people/${ID}?part=public`]) {
    assert.equal(routeOk(bad), false, bad);
    assert.equal(sw('/#' + bad), '/#/n/inbox', bad);
  }
  assert.equal(sw('javascript:alert(1)'), '/#/n/inbox');
});

test('a written row has its shape: a reply to highlight, the couple by ID and name, the record kind, the collapse key, the exact push route', async () => {
  const { pg, db, call, person, coupleOf } = await setup({ commands: { ...platform, ...me, ...posts, ...inbox } });
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const pair = await coupleOf([b, c]);
    await db.query(`update feture.profile set chosen_name = 'Кира и Ноа' where id = $1`, [pair]);
    const post = { type: 'post', body: 'Наш пост', audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] };
    const d = await call('ub', pair, { action: 'post.saveDraft', opId: op(), post });
    assert.equal((await call('ub', pair, { action: 'post.publish', opId: op(), postId: d.id })).state, 'published');
    const r = await call('ua', a, { action: 'reply.create', opId: op(), postId: d.id, body: 'Привет вам' });
    while ((await drain(db, notifyHandlers(db), { limit: 50 })) > 0) { /* until empty */ }
    const [row] = await db.query(
      `select n.type, n.kind, n.sub_object_type, n.sub_object_id, n.couple_id, n.couple_name, n.actor_name, n.collapse_key, n.data
       from feture.notification n join feture.account ac on ac.id = n.recipient_account_id join feture.profile_member m on m.account_id = ac.id and m.profile_id = $1
       where n.type = 'reply' limit 1`, [c]);
    assert.deepEqual({ ...row, data: undefined }, { type: 'reply', kind: 'notice', sub_object_type: 'reply', sub_object_id: r.id, couple_id: pair, couple_name: 'Кира и Ноа',
      actor_name: 'Alex', collapse_key: 'reply:' + d.id, data: undefined });
    assert.equal(row.data.replyId, r.id);
    const [push] = await db.query(`select payload from feture.outbox where topic = 'push.deliver' and payload->>'key' = 'reply' limit 1`);
    assert.equal(push.payload.url, `/#/n/feed/post/${d.id}?reply=${r.id}&as=${pair}`);
    // The list hands the screen the reply and the couple (its name as it was then), never the actor's snapshot.
    await db.query(`update feture.profile set chosen_name = 'Новое имя' where id = $1`, [pair]);
    const [item] = (await call('uc', null, { action: 'notifications.list' })).items.filter((/** @type {any} */ n) => n.type === 'reply');
    assert.deepEqual([item.sub, item.couple, item.coupleName, item.actorName], [{ type: 'reply', id: r.id }, pair, 'Кира и Ноа', undefined]);
  } finally { await pg.close(); }
});

test('the migration backfills old rows: the couple from the addressee, names from the profiles, the kind from the type', async () => {
  const { pg, db, person, coupleOf } = await setup({ commands: { ...platform, ...me } });
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const pair = await coupleOf([b, c]);
    const [{ account_id: kira }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [b]);
    await db.query(`insert into feture.notification (recipient_account_id, addressee_profile_id, type, actor_profile_id, source) values
      ($1, $2, 'like', $3, 'old1'), ($1, $4, 'grant', $3, 'old2')`, [kira, pair, a, b]);
    await db.query(`update feture.notification set kind = null, couple_id = null, couple_name = null, actor_name = null`);
    // Run again as the owner, as a deploy does (the columns are already there: `add column if not exists`).
    await pg.exec('reset role;' + read('supabase/migrations/20261103120000_fe_notification_shape.sql') + ';set role feture_api;');
    const rows = await db.query(`select type, kind, couple_id, couple_name is not null named, actor_name from feture.notification order by source`);
    assert.deepEqual(rows.map(x => [x.type, x.kind, x.couple_id, x.named, x.actor_name]), [['like', 'notice', pair, true, 'Alex'], ['grant', 'result', null, false, 'Alex']]);
  } finally { await pg.close(); }
});
