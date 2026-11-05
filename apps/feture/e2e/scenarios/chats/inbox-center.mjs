// Stage 5, the notification center (docs/notifications.md), lane `ibx`, on the LOCAL API only (e2e/local-api.mjs):
// a history of every card template and 70 older rows (seeded through `/local/inbox-seed`, which production has not),
// paging to the end, the tab and the filter kept in the address and on «Назад», «Нужно решить» with three kinds of task
// (a couple invitation, a link proposal, a join request with its answer), and a moderation decision's own card with
// «Обжаловать». Persona `basic` is the addressee; `stranger`, `inviter`, `invitee` act; `staff` restricts and lifts.
// SHOTS=<dir> also writes the review screenshots (390 light / dark, 768 for the inbox, 1280 light).
import fs from 'node:fs';
import { expect, until } from '../helpers.mjs';

const API = process.env.FE_API ?? '';
const SHOTS = process.env.SHOTS ?? '';
const local = () => { if (!/localhost|127\.0\.0\.1/.test(API)) throw new Error('inbox-center runs on the local API only (FE_API=http://localhost:…)'); };
const seed = async body => { const r = await fetch(API + '/local/inbox-seed', { method: 'POST', body: JSON.stringify(body) }); const j = await r.json(); expect(j.ok, 'seed: ' + JSON.stringify(j)); return j; };

/** The review screenshots of the screen as it is now: phone light and dark, tablet (the inbox), desktop. */
async function shots(t, name, { tablet = false } = {}) {
  // SHOTS_NAMES / SHOTS_ONLY (comma lists, e.g. `inbox-templates` / `390-light`) re-take only some of them.
  if (!SHOTS || (process.env.SHOTS_NAMES && !process.env.SHOTS_NAMES.split(',').includes(name))) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const only = process.env.SHOTS_ONLY?.split(',');
  const sizes = [[390, 844, 'light'], [390, 844, 'dark'], ...(tablet ? [[768, 1024, 'light']] : []), [1280, 900, 'light']]
    .filter(([w, , scheme]) => !only || only.includes(`${w}-${scheme}`));
  for (const [w, h, scheme] of sizes) {
    await t.page.emulateMedia({ colorScheme: scheme });
    await t.page.setViewportSize({ width: w, height: h });
    await t.wait(700);
    await t.page.screenshot({ path: `${SHOTS}/${name}-${w}-${scheme}.png` });
  }
  await t.page.emulateMedia({ colorScheme: 'light' });
  await t.page.setViewportSize({ width: 390, height: 844 });
}
/** Rows of every template, newest first, then a long history of 70 older rows. */
async function history(t) {
  const [s, i, v] = await Promise.all(['stranger', 'inviter', 'invitee'].map(k => t.persona(k)));
  const many = Array.from({ length: 70 }, (_, k) => ({ type: k % 3 === 0 ? 'follow' : k % 3 === 1 ? 'datingLaunched' : 'premiumRevoked', actor: k % 3 === 0 ? [s, i, v][k % 9 / 3 | 0].handle : null,
    minutesAgo: 600 + k * 37, read: true }));
  await seed({ handle: t.me.handle,
    events: [{ title: 'Вечер верёвки для новичков', inDays: 4, hour: 18, tz: 'Europe/Berlin' }, { title: 'Очень длинное название встречи, которое не помещается в одну строку', inDays: 9, hour: 16, tz: 'Asia/Tbilisi', state: 'cancelled' }],
    rows: [
      { type: 'like', actor: s.handle, minutesAgo: 1 },
      { type: 'postLike', actor: s.handle, collapse: 'postLike:seed', minutesAgo: 2 },
      { type: 'postLike', actor: i.handle, collapse: 'postLike:seed', minutesAgo: 3 },
      { type: 'postLike', actor: v.handle, collapse: 'postLike:seed', minutesAgo: 4 },
      { type: 'eventChanged', objectType: 'event', event: 0, minutesAgo: 5 },
      { type: 'eventCancelled', objectType: 'event', event: 1, minutesAgo: 6 },
      { type: 'contentRemoved', data: { targetType: 'post', targetId: '018f0000-0000-7000-8000-00000000beef', rule: 'spam' }, kind: 'result', minutesAgo: 7 },
      { type: 'linkAccepted', actor: i.handle, kind: 'result', minutesAgo: 8, read: true },
      { type: 'communityDeclined', kind: 'result', minutesAgo: 9, read: true },
      { type: 'follow', actor: v.handle, minutesAgo: 10, read: true },
      { type: 'eventReminder', objectType: 'event', event: 0, minutesAgo: 11, read: true },
      ...many,
    ] });
}

export default [
 { name: 'IBX-1 history: every template, paging to the end, tab and filter in the address and on «Назад»', persona: 'basic', run: async t => {
   local();
   await history(t);
   await t.go('/n/inbox?tab=all');
   await t.see('.k-note-summary:has-text("и ещё")');
   for (const c of ['.k-note-news', '.k-note-event', '.k-note-safety', '.k-note-result', '.k-note-summary']) await t.see(c);
   await t.see('.k-note-event:has-text("Берлин")');
   await shots(t, 'inbox-templates', { tablet: true });
   // Paging: the oldest seeded row arrives through LoadMore, every row once.
   const box = t.page.locator('.main > .view');
   for (let k = 0; k < 12 && await t.page.locator('.k-more').count(); k++) { await box.evaluate(v => { v.scrollTop = v.scrollHeight; }); await t.wait(700); }
   const ids = await t.page.locator('.k-note').evaluateAll(els => els.map(e => e.id));
   expect(new Set(ids).size === ids.length, 'no row twice');
   expect(ids.length >= 75, 'the whole history is reachable: ' + ids.length);
   await box.evaluate(v => { v.scrollTop = Math.round(v.scrollHeight / 2); });
   await t.wait(500);
   await shots(t, 'inbox-history-scroll');
   // A filter goes into the address; going back to the inbox keeps the tab, the filter and the place.
   await box.evaluate(v => { v.scrollTop = 0; });
   await t.tap('.inbox-filters .chip:has-text("События")');
   await until(async () => t.page.url().includes('f=events'), 'the filter is in the address');
   await t.see('.k-note-event');
   expect(!(await t.page.locator('.k-note-summary').count()), 'the filter narrows on the server');
   const opened = (await t.page.locator('.k-note-event.unread:has-text("изменились")').first().getAttribute('id')).slice(5);
   await t.tap('#note-' + opened);
   await until(async () => /#\/n\/events\//.test(t.page.url()), 'the row opens its event');
   await t.page.goBack(); await t.wait(1200);
   expect(t.page.url().includes('tab=all') && t.page.url().includes('f=events'), 'back keeps the tab and the filter: ' + t.page.url());
   await t.see('.inbox-filters .chip.on:has-text("События")');
   // Opening a row read it on the server (no silent loss).
   expect((await t.api('notifications.list', { filter: 'events' })).items.find(n => n.id === opened)?.read === true, 'the opened row is read on the server');
   // «Все» counts the whole history from the server.
   const c = await t.api('inbox.counts', {});
   await t.see(`[role=tab]:has-text("Все уведомления") :text("${c.notifications}")`);
 } },

 { name: 'IBX-2 «Нужно решить»: an invitation, a link proposal and a join request name who, what and about what', persona: 'basic', run: async t => {
   local();
   const [inv, str, joiner, staff] = await Promise.all(['inviter', 'stranger', 'invitee', 'staff'].map(k => t.persona(k)));
   let club = null;
   try {
     const ci = await t.api('couple.invite', { opId: t.uuid7(), handle: t.me.handle, replacePaused: true }, inv.email);
     expect(ci.ok, 'couple.invite ' + JSON.stringify(ci));
     const lp = await t.api('link.propose', { opId: t.uuid7(), profileId: t.me.personId, kind: 'friend' }, str.email);
     expect(lp.ok || lp.rule === 'pending', 'link.propose ' + JSON.stringify(lp));
     const mine = (await t.api('community.mine', {})).hosting ?? [];
     club = mine.find(x => x.name === 'Клуб уведомлений')?.id ?? null;
     if (!club) {
       const cr = await t.api('community.create', { opId: t.uuid7(), name: 'Клуб уведомлений', privacy: 'closed', joinQuestion: 'Почему тебе интересно?',
         description: 'Встречи и разговоры для проверки центра уведомлений.', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose', coverAssetId: await t.cover('community') });
       expect(cr.ok, 'community.create ' + JSON.stringify(cr)); club = cr.id;
       const q = (await t.api('staff.communityQueue', {}, staff.email)).items.find(x => x.id === club);
       await t.api('staff.communityDecide', { opId: t.uuid7(), communityId: club, rev: q.rev, decision: 'approve' }, staff.email);
     }
     const jr = await t.api('community.join', { opId: t.uuid7(), communityId: club, rulesAccepted: true, answer: 'Хочу научиться безопасно, правила прочитала.' }, joiner.email);
     expect(jr.ok || jr.status === 409, 'community.join ' + JSON.stringify(jr));
     await t.go('/n/inbox?tab=todo');
     await t.see('.k-note-dec:has-text("приглашает")');
     await t.see('.k-note-dec:has-text("предлагает связь") :text("Друзья")');
     await t.see('.k-note-dec:has-text("Клуб уведомлений") :text("правила прочитала")');
     await shots(t, 'inbox-decide-three');
     // The card's middle opens the request; the invitation's own link lands on its card.
     const id = (await t.api('decide.list', {})).items.find(d => d.kind === 'pinv').id;
     await t.go('/n/inbox?tab=todo&item=' + id);
     await t.see('#item-' + id);
     await t.tap('.k-note-dec:has-text("Клуб уведомлений") .k-note-open');
     await until(async () => /communities\/.+\/requests/.test(t.page.url()), 'the join request opens its list');
   } finally {
     for (const x of (await t.api('couple.invites', {}, inv.email)).outgoing ?? []) if (x.state === 'pending') await t.api('couple.inviteWithdraw', { opId: t.uuid7(), inviteId: x.id }, inv.email);
     const l = await t.api('links.mine', {});
     for (const x of [...(l.incoming ?? []), ...(l.confirmed ?? [])]) if (x.other?.id === str.personId) await t.api('link.remove', { opId: t.uuid7(), linkId: x.id });
     if (club) { const r = (await t.api('community.requests', { communityId: club })).items?.find(x => x.profile?.id === joiner.personId); if (r) await t.api('community.requestWithdraw', { opId: t.uuid7(), requestId: r.id }, joiner.email); }
   }
 } },

 { name: 'IBX-3 a moderation decision opens its own card: what, why, until when, «Обжаловать»', persona: 'basic', run: async t => {
   local();
   const staff = await t.persona('staff');
   const r = await t.api('staff.restrict', { opId: t.uuid7(), profileId: t.me.personId, on: true, rule: 'spam', days: 7, note: '' }, staff.email);
   expect(r.restricted === true, 'staff.restrict ' + JSON.stringify(r));
   try {
     const row = await until(async () => (await t.api('notifications.list', {})).items.find(n => n.type === 'profileRestricted' && !n.read), 'the restriction reaches the inbox', 30000);
     await t.go('/n/inbox?tab=all');
     await t.tap('#note-' + row.id);
     await until(async () => t.page.url().includes('/n/inbox/' + row.id), 'the row opens its card');
     await t.see('.k-safety:has-text("Причина")');
     await t.see('.k-safety :text("Обжаловать")');
     await shots(t, 'moderation-card');
     await t.tap('.k-safety .btn:has-text("Обжаловать")');
     await t.see('.sheet.on:has-text("Обжаловать решение")');
   } finally {
     await t.api('staff.restrict', { opId: t.uuid7(), profileId: t.me.personId, on: false, rule: 'spam', note: '' }, staff.email);
   }
 } },
];
