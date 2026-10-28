// Every action of the couple says it is the couple's (owner 28.10.2026: «Все кнопки под пары»): follow, like, save,
// RSVP, join, access request, report, block, profile save. Acting as the couple there is still no author picker — the
// buttons, toasts and confirmations carry «от пары» / «вдвоём» / «пара». Lane `cb`; the couple is `pair`, the people it
// acts on are `mate` (a full person with a private part) and `host` (an open community and an open event).
import { expect, toastSee, sheet } from '../helpers.mjs';

const actAs = (t, id) => t.page.addInitScript(v => { try { sessionStorage.setItem('feture.fe.acting', v); } catch { /* none */ } }, id);
const coupleOf = async t => (await t.boot()).profiles.find(p => p.kind === 'couple' && p.state === 'active');
const noPicker = async t => {
  for (const s of ['text=От кого', 'text=Я или мы', 'text=От себя'])
    expect(!(await t.page.locator(s).count()), 'an author picker is on screen: ' + s);
};

export default [
 { name: 'profile as the couple: «Подписать пару» → «Пара подписана» and back, like/report/block speak for the couple', persona: 'pair', run: async t => {
   const couple = await coupleOf(t); expect(couple, 'the pair has an active couple'); await actAs(t, couple.id);
   const mate = await t.persona('mate');
   // Whom the couple follows (the profile page reads the same list).
   const rel = async () => ({ iFollow: ((await t.api('profile.followers', { profileId: couple.id, following: true }, undefined, couple.id)).items ?? []).some(x => x.id === mate.personId) });
   // Start unfollowed (a previous run may have stopped half-way).
   if ((await rel()).iFollow) await t.api('follow.set', { opId: t.uuid7(), profileId: mate.personId, on: false }, undefined, couple.id);
   try {
     await t.go('/n/people/' + mate.personId);
     await t.tap('.p-acts button:has-text("Подписать пару")');
     await toastSee(t, 'Пара теперь в подписчиках');
     await t.see('.p-acts button:has-text("Пара подписана")');
     expect((await rel()).iFollow, 'the couple does not follow after the tap');
     await t.tap('.p-acts button:has-text("Пара подписана")');
     await toastSee(t, 'Пара отписалась от');
     await t.see('.p-acts button:has-text("Подписать пару")');
     // The like button (or why the couple likes from Discover only) — never the personal «Нравится».
     const like = t.page.locator('.p-acts button', { hasText: /Нам нравится|Пара отправила|Написать от нас/ });
     const why = t.page.locator('.profile-like-note');
     expect(await like.count() || await why.count(), 'no couple like button and no reason');
     await noPicker(t);
     // ⋯ → Пожаловаться: the sheet sends the report as the couple; Заблокировать: «для пары». Nothing is sent.
     await t.tap('[aria-label="Ещё"]'); await t.tap(sheet + ' .li:has-text("Пожаловаться")');
     await t.see(sheet + ' button:has-text("Отправить жалобу от пары")');
     await t.page.keyboard.press('Escape'); await t.wait(400);
     await t.tap('[aria-label="Ещё"]'); await t.tap(sheet + ' .li:has-text("Заблокировать")');
     await t.see(sheet + ' button:has-text("Заблокировать для пары")');
     await t.see(sheet + ' p:has-text("доступы пары")');
     await t.page.keyboard.press('Escape');
   } finally {
     if ((await rel()).iFollow) await t.api('follow.set', { opId: t.uuid7(), profileId: mate.personId, on: false }, undefined, couple.id);
   }
 } },
 { name: 'private part as the couple: «Попросить доступ от пары» → sheet «Запросить от пары» (not sent)', persona: 'pair', run: async t => {
   const couple = await coupleOf(t); await actAs(t, couple.id);
   const mate = await t.persona('mate');
   await t.go('/n/people/' + mate.personId);
   const ask = t.page.locator('.vault button', { hasText: /Попросить доступ от пары|Запрос от пары отправлен|Попросить больше от пары/ }).first();
   await ask.waitFor({ state: 'visible', timeout: 30000 });
   const label = (await ask.innerText()).trim();
   if (/Попросить доступ от пары/.test(label)) {
     await ask.click(); await t.see(sheet + ' button:has-text("Запросить от пары")');
     await t.see(sheet + ' :text("Доступ запрашивается для пары")');
     await t.page.keyboard.press('Escape');
   } else console.log('   the couple already asked mate — button: ' + label);
 } },
 { name: 'feed as the couple: like «Нравится от пары», save «Сохранить для пары» with the couple\'s toasts', persona: 'pair', run: async t => {
   const couple = await coupleOf(t); await actAs(t, couple.id);
   const items = (await t.api('feed.list', { tab: 'forYou', limit: 10 }, undefined, couple.id)).items ?? [];
   const post = items.find(x => x.id && x.type && x.rev == null && !x.liked && !x.saved);
   expect(post, 'the couple sees a post of someone else it has not liked or saved');
   const back = async () => {
     const p = (await t.api('post.get', { postId: post.id }, undefined, couple.id)).post;
     if (p?.liked) await t.api('reaction.set', { opId: t.uuid7(), targetType: 'post', targetId: post.id, on: false }, undefined, couple.id);
     if (p?.saved) await t.api('saved.set', { opId: t.uuid7(), kind: 'post', targetId: post.id, on: false }, undefined, couple.id);
   };
   try {
     await t.go('/n/feed/post/' + post.id);
     const like = t.page.locator('.post-a button[aria-label="Нравится от пары"]').first();
     await like.waitFor({ state: 'visible', timeout: 30000 });
     await like.click(); await t.wait(1200);
     expect((await t.api('post.get', { postId: post.id }, undefined, couple.id)).post?.liked, 'the couple\'s like did not reach the server');
     await like.click(); await t.wait(1200);
     const save = t.page.locator('.post-a button[aria-label="Сохранить для пары"]').first();
     await save.click(); await toastSee(t, '«Мы → Моё → Сохранённое»');
     await save.click(); await toastSee(t, 'Убрано из сохранённого пары');
     await noPicker(t);
   } finally { await back(); }
 } },
 { name: 'event as the couple: «Нам интересно / Идём вдвоём / Не идём», toast for the couple (or «ждёт согласия партнёра»)', persona: 'pair', run: async t => {
   const couple = await coupleOf(t); await actAs(t, couple.id);
   const id = (await t.persona('host')).eventId;
   const get = async () => (await t.api('event.get', { eventId: id }, undefined, couple.id)).event;
   if ((await get()).me.rsvp?.status) await t.api('event.rsvp', { opId: t.uuid7(), eventId: id, status: null }, undefined, couple.id);
   try {
     await t.go('/n/events/' + id);
     await t.see('.rsvp.us');
     await t.see('.rsvp-h :text("Пойдёте вдвоём?")');
     await t.see('.rsvp .r-interested:has-text("Нам интересно")');
     await t.see('.rsvp .r-going:has-text("Идём вдвоём")');
     await t.see('.rsvp .r-not:has-text("Не идём")');
     // Labels never wrap or cut (owner 29.10.2026): the two yes answers share a line, «Не идём» is the line under them.
     for (const w of [360, 390]) {
       await t.page.setViewportSize({ width: w, height: 800 }); await t.wait(200);
       const bad = await t.page.$$eval('.rsvp button span', ss => ss.filter(s => s.scrollWidth > s.clientWidth + 1 || s.getClientRects().length > 1).map(s => s.textContent));
       expect(!bad.length, 'rsvp labels wrapped or cut at ' + w + ': ' + bad.join(', '));
     }
     await t.tap('.rsvp .r-interested');
     await t.page.locator('.toast', { hasText: /Вам интересно|Ответ от пары ждёт согласия партнёра/ }).first().waitFor({ state: 'visible', timeout: 30000 });
     await noPicker(t);
   } finally {
     if ((await get()).me.rsvp?.status) await t.api('event.rsvp', { opId: t.uuid7(), eventId: id, status: null }, undefined, couple.id);
   }
 } },
 { name: 'community as the couple: «Вступить от пары» and the rules sheet button speaks for the couple (not joined)', persona: 'pair', run: async t => {
   const couple = await coupleOf(t); await actAs(t, couple.id);
   const host = await t.persona('host');
   const c = (await t.api('community.get', { communityId: host.openId }, undefined, couple.id)).community;
   if (c?.me?.member || c?.joined) { console.log('   the couple is a member of the open community — join button not checked'); return; }
   const approves = (await t.api('couple.get', {}, undefined, couple.id)).couple.members.find(m => !m.me)?.approvesPartner;
   await t.go('/n/communities/' + host.openId);
   await t.tap('button:has-text("Вступить от пары")');
   await t.see(sheet + ' button:has-text("' + (approves ? 'Принять правила — на согласие партнёру' : 'Принять правила и вступить от пары') + '")');
   await t.page.keyboard.press('Escape');
 } },
 { name: 'couple profile edit: the save button says when it goes to the partner', persona: 'pair', run: async t => {
   const couple = await coupleOf(t); await actAs(t, couple.id);
   const approves = (await t.api('couple.get', {}, undefined, couple.id)).couple.members.find(m => !m.me)?.approvesPartner;
   await t.go('/n/me/edit');
   await t.see('.ctabar button:has-text("' + (approves ? 'Сохранить — на согласие партнёру' : 'Сохранить') + '")');
   await noPicker(t);
 } },
 { name: 'as oneself: the same buttons keep the personal wording', persona: 'pair', run: async t => {
   const me = (await t.boot()).profiles.find(p => p.kind === 'person'); await actAs(t, me.id);
   const mate = await t.persona('mate');
   await t.go('/n/people/' + mate.personId);
   await t.see('.p-acts .btn');
   expect(!(await t.page.locator('.p-acts :text("от пары"), .p-acts :text("Пара подписана")').count()), 'couple words on a personal profile view');
   const id = (await t.persona('host')).eventId;
   await t.go('/n/events/' + id); await t.see('.rsvp');
   expect(!(await t.page.locator('.rsvp.us').count()), 'the couple RSVP shows as oneself');
 } },
];
