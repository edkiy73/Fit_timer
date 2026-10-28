// «Подписки» activity cards (V21 actCard), lane `ac`: `basic` follows `full`; `full` likes seven posts of `stranger`
// and follows three people of the lane in one sitting. The likes card shows a sideways strip of thumbnails with «+N»
// that opens the list and «Свернуть» folds it back; the follows card shows faces; ⋯ → «Не показывать активность» hides
// the person's cards, «Вернуть» brings them back — each step read back through the API. Everything is undone in `finally`.
import { expect, until, toastSee, nameOf } from '../helpers.mjs';

const mark = () => 'ac-' + Date.now().toString(36);
const stream = async t => (await t.api('feed.list', { tab: 'following', activity: [], limit: 50 })).items ?? [];
const card = (t, who, text) => t.page.locator('article.actc').filter({ hasText: who }).filter({ hasText: text }).first();

export default [
 { name: '«Подписки»: likes as a strip with «+N» → list → «Свернуть», follows as faces, ⋯ mute → «Вернуть»', persona: 'basic', run: async t => {
   const A = await t.persona('full'), S = await t.persona('stranger');
   const others = [S, await t.persona('mate'), await t.persona('asker')];
   const before = new Set(((await t.api('profile.followers', { profileId: A.personId, following: true }, A.email)).items ?? []).map(x => x.id));
   const m = mark(); const posts = []; const who = await nameOf(t, A);
   try {
     await t.api('follow.set', { opId: t.uuid7(), profileId: A.personId, on: true });
     await t.api('activity.mute', { opId: t.uuid7(), profileId: A.personId, on: false });
     for (let i = 0; i < 7; i++) {
       const post = { type: 'post', body: `Пост ${i + 1} для активности ${m}`, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [],
         ...(i === 0 ? { poll: { question: 'Чай или кофе?', options: ['Чай', 'Кофе'] } } : {}) };
       const d = await t.api('post.saveDraft', { opId: t.uuid7(), post }, S.email);
       expect(d.id, 'saveDraft ' + JSON.stringify(d).slice(0, 200));
       expect((await t.api('post.publish', { opId: t.uuid7(), postId: d.id }, S.email)).state === 'published', 'publish');
       posts.push(d.id);
     }
     for (const id of posts) await t.api('reaction.set', { opId: t.uuid7(), targetType: 'post', targetId: id, on: true }, A.email);
     // A fresh burst of follows: a follow made long ago would not fold with these.
     for (const o of others) { await t.api('follow.set', { opId: t.uuid7(), profileId: o.personId, on: false }, A.email); await t.api('follow.set', { opId: t.uuid7(), profileId: o.personId, on: true }, A.email); }
     const likes = await until(async () => (await stream(t)).find(x => x.kind === 'activity' && x.actor.id === A.personId && x.activity === 'likes' && x.count >= 7), 'likes card on the server', 40000);
     const follows = await until(async () => (await stream(t)).find(x => x.kind === 'activity' && x.actor.id === A.personId && x.activity === 'follows' && x.count >= 3), 'follows card on the server', 40000);
     expect(likes.items.length >= 6 && likes.items.length <= 20, 'items sent ' + likes.items.length);
     expect(likes.items.some(x => posts.includes(x.id)), 'liked posts in the card');

     await t.go('/n/feed'); await t.tap('[role="tab"]:has-text("Подписки")');
     const lc = card(t, who, 'нравится'); await lc.waitFor({ timeout: 30000 });
     expect((await lc.innerText()).includes(String(likes.count)), 'the count in the line');
     const tiles = lc.locator('.actc-strip .actc-th');
     await tiles.first().waitFor();
     expect(await tiles.count() === likes.items.length, `tiles ${await tiles.count()} vs items ${likes.items.length}`);
     expect(await lc.locator('.actc-strip').evaluate(el => getComputedStyle(el).overflowX === 'auto' && el.scrollWidth > el.clientWidth), 'the strip scrolls sideways');
     // A server with thumbnails (`poll`, `thumb`, up to 20 things) shows a sent poll post as a poll tile.
     if (likes.items.some(x => x.poll === true)) expect(await lc.locator('.actc-th.kind').count() >= 1, 'the poll post is a poll tile');
     const more = lc.locator('.actc-more'); await more.waitFor(); await t.wait(800); await t.shot('ac-strip');
     expect(/^\+\d+$/.test((await more.innerText()).trim()), '«+N» on the right: ' + await more.innerText());
     await lc.locator('.actc-strip').evaluate(el => { el.scrollLeft = el.scrollWidth; });
     await more.click();
     const rows = lc.locator('.actc-list .actc-p'); await rows.first().waitFor();
     expect(await rows.count() === likes.items.length, 'the open list has every item'); await t.shot('ac-open');
     if (likes.count > likes.items.length) expect((await lc.innerText()).includes('И ещё ' + (likes.count - likes.items.length)), '«И ещё N» names the rest');
     await lc.locator('.actc-list .btn:has-text("Свернуть")').click();
     await tiles.first().waitFor(); expect(await lc.locator('.actc-list').count() === 0, 'folded back to the strip');
     // A tile opens the post.
     await tiles.first().click(); await t.page.waitForURL(/\/n\/feed\/post\//); await t.page.goBack();
     await t.tap('[role="tab"]:has-text("Подписки")');

     const fc = card(t, who, 'следит'); await fc.waitFor({ timeout: 30000 });
     expect(await fc.locator('.actc-strip .actc-th.round').count() >= 3, 'faces in the follows strip');

     // ⋯ → «Не показывать активность»: the person's cards leave, the server keeps it; «Вернуть» undoes it.
     await card(t, who, 'нравится').locator('[aria-label="Ещё"]').click(); await t.wait(400);
     await t.tap('.sheet.on .li:has-text("Не показывать активность")'); await toastSee(t, 'Активность');
     await until(async () => (await t.api('feedHide.list', {})).items.some(x => x.kind === 'activity' && (x.targetId ?? x.target_id) === A.personId), 'muted on the server');
     expect(!(await stream(t)).some(x => x.kind === 'activity' && x.actor.id === A.personId), 'no cards of the person on the server');
     await t.tap('.toast button:has-text("Вернуть")');
     await until(async () => !(await t.api('feedHide.list', {})).items.some(x => x.kind === 'activity' && (x.targetId ?? x.target_id) === A.personId), 'unmuted on the server');
     await card(t, who, 'нравится').waitFor({ timeout: 15000 });
   } finally {
     for (const id of posts) {
       await t.api('reaction.set', { opId: t.uuid7(), targetType: 'post', targetId: id, on: false }, A.email);
       await t.api('post.delete', { opId: t.uuid7(), postId: id }, S.email);
     }
     for (const o of others) if (!before.has(o.personId)) await t.api('follow.set', { opId: t.uuid7(), profileId: o.personId, on: false }, A.email);
     await t.api('activity.mute', { opId: t.uuid7(), profileId: A.personId, on: false });
     await t.api('follow.set', { opId: t.uuid7(), profileId: A.personId, on: false });
   }
 } },
];
