// Backlog wave 3 screens (posts, feed, search): each scenario taps what a person taps and reads the result back
// through the API. Two people of the lane: `full` (the viewer, interests, a photo) and `basic` (the other author).
// Everything a scenario creates is removed in its `finally`.
import { expect, until, toastSee } from '../helpers.mjs';
import { STAFF } from '../../personas.mjs';
import { uploadFixture } from '../../lib.mjs';

const tag = () => 'w3-' + Date.now().toString(36);
/** A published post of `as` (an e-mail); returns its id. */
async function publish(t, as, post) {
  const d = await t.api('post.saveDraft', { opId: t.uuid7(), post }, as);
  expect(d.id, 'saveDraft ' + JSON.stringify(d).slice(0, 200));
  const p = await t.api('post.publish', { opId: t.uuid7(), postId: d.id }, as);
  expect(p.ok, 'publish ' + JSON.stringify(p).slice(0, 200));
  return d.id;
}
const drop = (t, as, postId) => t.api('post.delete', { opId: t.uuid7(), postId }, as).catch(() => {});
const sheet = '.sheet.on';

export default [
 { name: 'likers: «Нравится: тебе» opens the list; the mention is a link and «Убрать упоминание меня» unlinks it', persona: 'full', run: async t => {
   const B = await t.persona('basic'); const mark = tag();
   const id = await publish(t, B.email, { body: `${mark} привет @${t.me.handle ?? 'qa_w3_full'} и @nobody_here_w3` });
   try {
     await t.api('reaction.set', { opId: t.uuid7(), targetType: 'post', targetId: id, on: true });
     await t.go('/n/feed/post/' + id);
     await t.see('.likes-line:has-text("Нравится: тебе")');
     await t.tap('.likes-line'); await t.see(`${sheet} .li:has-text("Ты")`);
     const l = await t.api('post.likers', { targetId: id }); expect(l.total >= 1 && l.items.some(x => x.id === t.me.personId), 'likers lists me');
     await t.tap(`${sheet} [aria-label="Закрыть"]`);
     // Only the DTO's mentions are links: my handle is, a made-up one stays text.
     await t.see('.md .mention'); expect(await t.page.locator('.md .mention').count() === 1, 'one linked mention');
     await t.tap('.post-h [aria-label="Ещё"]'); await t.tap(`${sheet} .li:has-text("Убрать упоминание меня")`);
     await toastSee(t, 'Упоминание убрано');
     const g = await t.api('post.get', { postId: id }); expect(!(g.post.mentions || []).some(m => m.id === t.me.personId), 'mention removed on the server');
     expect(!(await t.page.locator('.md .mention').count()), 'no link any more');
   } finally { await drop(t, B.email, id); }
 } },

 { name: 'poll voters: after the vote a count opens who chose it', persona: 'full', run: async t => {
   const B = await t.persona('basic'); const mark = tag();
   const id = await publish(t, B.email, { body: mark, poll: { question: 'Чай или кофе ' + mark, options: ['Чай', 'Кофе'] } });
   try {
     const before = await t.api('poll.voters', { postId: id, option: 0 }); expect(before.status === 403, 'voters closed before the vote: ' + before.status);
     await t.go('/n/feed/post/' + id);
     await t.tap('.poll-choice:has-text("Чай")'); await t.see('.poll.voted');
     await t.tap('button.poll-count >> nth=0'); await t.see(`${sheet} .li:has-text("Ты")`);
     const v = await t.api('poll.voters', { postId: id, option: 0 }); expect(v.total === 1 && v.items[0].id === t.me.personId, 'I am the voter');
   } finally { await drop(t, B.email, id); }
 } },

 { name: 'saved edits: «Сохранить правки» keeps the post, «Мои публикации» lists them, delete asks, publish applies', persona: 'full', run: async t => {
   const mark = tag(); const id = await publish(t, t.me.email, { body: 'Оригинал ' + mark });
   try {
     await t.go('/n/feed/post/' + id + '/edit');
     await t.see('.rte-ed'); await t.fill('.rte-ed', 'Правка ' + mark);
     await t.tap('.bar button:has-text("Сохранить правки")'); await toastSee(t, 'Правки сохранены');
     let m = await until(async () => { const r = await t.api('me.posts', {}); return r.pendingEdits?.find(e => e.postId === id) && r; }, 'saved edits on the server');
     expect(m.pendingEdits.find(e => e.postId === id).post.body === 'Правка ' + mark, 'saved body');
     expect((await t.api('post.get', { postId: id })).post.body === 'Оригинал ' + mark, 'post unchanged');
     await t.go('/n/me/posts'); await t.see('text=Сохранённые правки · 1');
     await t.tap(`.li:has-text("Правка ${mark}")`); await t.see(`${sheet}:has-text("Удалить правки")`);
     await t.tap(`${sheet} .li:has-text("Удалить правки")`); await t.see('.dialog.on:has-text("Удалить сохранённые правки?")');
     await t.tap('.dialog.on button:has-text("Удалить")'); await toastSee(t, 'Правки удалены');
     m = await t.api('me.posts', {}); expect(!m.pendingEdits.some(e => e.postId === id), 'discarded');
     // Saved again (API) → «Опубликовать правки» from the list.
     const rev = (await t.api('post.get', { postId: id })).post.rev;
     const se = await t.api('post.saveEdits', { opId: t.uuid7(), postId: id, rev, post: { body: 'Итог ' + mark } }); expect(se.saved, 'saveEdits ' + JSON.stringify(se).slice(0, 200));
     await t.page.reload(); await t.tap(`.li:has-text("Итог ${mark}")`); // same route: reload to read the list again await t.see(`${sheet} .li:has-text("Опубликовать правки")`); await t.wait(600);
     const pubReq = t.page.waitForResponse(r => /"action":"post.publishEdits"/.test(r.request().postData() || ''), { timeout: 15000 });
     await t.tap(`${sheet} .li:has-text("Опубликовать правки")`); const pr = await pubReq; expect(pr.status() === 200, 'publishEdits ' + pr.status() + ' ' + (await pr.text()).slice(0, 200));
     await toastSee(t, 'Правки опубликованы');
     await until(async () => (await t.api('post.get', { postId: id })).post.body === 'Итог ' + mark, 'edits published');
   } finally { await drop(t, t.me.email, id); }
 } },

 { name: 'feed filters: kinds of post with «Показать N», ✕ on the active chip; nothing → «Нет подходящих» disabled', persona: 'full', run: async t => {
   const B = await t.persona('basic'); const mark = tag();
   const id = await publish(t, B.email, { body: mark, poll: { question: 'Опрос ' + mark, options: ['Да', 'Нет'] } });
   try {
     await t.go('/n/feed'); await t.tap('.filterline .chip:has-text("Фильтры")');
     await t.tap(`${sheet} .chip:has-text("С опросом")`);
     const apply = t.page.locator(`${sheet} .sh-f button`);
     await until(async () => /^Показать/.test((await apply.innerText()).trim()), 'count on the button');
     expect(await apply.isEnabled(), 'enabled with posts');
     const req = t.page.waitForRequest(r => r.url().includes('/api/fe') && /"types":\["poll"\]/.test(r.postData() || ''));
     await apply.click(); await req; await toastSee(t, 'Фильтры применены');
     await t.see('.filterline .chip:has-text("С опросом")'); await t.see(`article.post:has-text("${mark}")`);
     // The list is replaced by the filtered one once the request answers; wait for it instead of counting the old one.
     await until(async () => { const cards = await t.page.locator('.posts > article.post').count(); const polls = await t.page.locator('.posts > article.post:has(.poll)').count(); return cards > 0 && cards === polls; }, 'only polls in the list');
     await t.tap('.filterline .chip:has-text("С опросом")'); await t.notSee('.filterline .chip:has-text("С опросом")', 1500);
     // «Подписки» of `full` (follows nobody in this lane) with only articles: nothing — the button says so and is off.
     // An empty «Подписки» without filters has nothing to filter: no «Фильтры» row under its empty state.
     await t.tap('[role="tab"]:has-text("Подписки")'); await t.wait(2500);
     if (!((await t.api('feed.list', { tab: 'following', activity: [], limit: 5 })).items ?? []).length) { await t.see('.empty'); expect(!(await t.page.locator('.filterline').count()), 'no filters on an empty tab'); return; }
     await t.tap('.filterline .chip:has-text("Фильтры")');
     await t.tap(`${sheet} .chip:has-text("Статьи")`); await t.tap(`${sheet} .chip:has-text("Лайки")`);
     const f = (await t.api('feed.list', { tab: 'following', types: ['note'], activity: ['likes'], limit: 50 }));
     if (!f.items.length) { await t.see(`${sheet} .sh-f button:has-text("Нет подходящих публикаций")`); expect(!(await apply.isEnabled()), 'disabled'); }
   } finally { await drop(t, B.email, id); }
 } },

 { name: '«Подписки»: an activity card, ⋯ → «Не показывать активность», «Вернуть»', persona: 'basic', run: async t => {
   const A = await t.persona('full'); const mark = tag();
   const id = await publish(t, t.me.email, { body: 'Пост для активности ' + mark });
   try {
     await t.api('follow.set', { opId: t.uuid7(), profileId: A.personId, on: true });
     await t.api('activity.mute', { opId: t.uuid7(), profileId: A.personId, on: false });
     await t.api('reaction.set', { opId: t.uuid7(), targetType: 'post', targetId: id, on: true }, A.email);
     await until(async () => (await t.api('feed.list', { tab: 'following', activity: [] })).items.some(x => x.kind === 'activity' && x.actor.id === A.personId), 'activity on the server');
     await t.go('/n/feed'); await t.tap('[role="tab"]:has-text("Подписки")');
     const card = t.page.locator('.actc', { hasText: 'нравится' }).first(); await card.waitFor({ timeout: 30000 });
     await card.locator('.actc-p').first().waitFor();
     await card.locator('[aria-label="Ещё"]').click(); await t.wait(400);
     await t.tap(`${sheet} .li:has-text("Не показывать активность")`); await toastSee(t, 'Активность');
     await until(async () => (await t.api('feedHide.list', {})).items.some(x => x.kind === 'activity' && (x.targetId ?? x.target_id) === A.personId), 'muted on the server');
     await t.tap('.toast button:has-text("Вернуть")');
     await until(async () => !(await t.api('feedHide.list', {})).items.some(x => x.kind === 'activity' && (x.targetId ?? x.target_id) === A.personId), 'unmuted on the server');
   } finally {
     await t.api('reaction.set', { opId: t.uuid7(), targetType: 'post', targetId: id, on: false }, A.email);
     await t.api('activity.mute', { opId: t.uuid7(), profileId: A.personId, on: false });
     await t.api('follow.set', { opId: t.uuid7(), profileId: A.personId, on: false });
     await drop(t, t.me.email, id);
   }
 } },

 { name: '«Популярное» by my interests, a chip per interest, «Как подбираем»', persona: 'full', run: async t => {
   await t.go('/n/feed');
   const req = t.page.waitForRequest(r => r.url().includes('/api/fe') && /"tab":"popular"/.test(r.postData() || '') && /"myInterests":true/.test(r.postData() || ''));
   await t.tap('[role="tab"]:has-text("Популярное")'); await req;
   await t.see('.chip:has-text("Все мои интересы")');
   const chips = await t.page.locator('.chips .chip:has-text("#")').count(); expect(chips >= 1, 'interest chips');
   const one = t.page.waitForRequest(r => /"myInterests":true/.test(r.postData() || '') && /"topics":\[/.test(r.postData() || ''));
   await t.page.locator('.chips .chip:has-text("#")').first().click(); await one;
   await t.tap('button:has-text("Как подбираем")'); await t.see(`${sheet}:has-text("Как подбираем популярное")`);
 } },

 { name: 'search filters: events online → nothing → «Сбросить фильтры»', persona: 'full', route: '/n/search?scope=events&q=zzqqw3', run: async t => {
   await t.tap('.chip:has-text("Фильтры")'); await t.tap(`${sheet} [role="radio"]:has-text("Онлайн")`);
   const req = t.page.waitForRequest(r => /"action":"event.catalog"/.test(r.postData() || '') && /"format":"online"/.test(r.postData() || ''));
   await t.tap(`${sheet} .sh-f button:has-text("Применить")`); await req;
   await t.see('button:has-text("Сбросить фильтры")'); await t.tap('button:has-text("Сбросить фильтры")');
   await t.notSee('button:has-text("Сбросить фильтры")', 2500);
 } },

 { name: 'unsent reply waits with «Повторить»; replies come in pages of 20, the next one on scrolling (LoadMore, no button)', persona: 'full', allow4xx: true, run: async t => {
   const B = await t.persona('basic'); const mark = tag();
   const id = await publish(t, B.email, { body: 'Ответы ' + mark });
   try {
     for (let i = 0; i < 21; i++) await t.api('reply.create', { opId: t.uuid7(), postId: id, body: `r${i} ${mark}` }, B.email);
     await t.go('/n/feed/post/' + id);
     await t.see('.cm'); expect(await t.page.locator('.th').count() === 20, 'the first page of 20 threads: ' + await t.page.locator('.th').count());
     expect(!(await t.page.locator('button:has-text("Показать ещё")').count()), 'no «Показать ещё» button');
     await t.page.locator('.th').last().scrollIntoViewIfNeeded(); await t.page.mouse.wheel(0, 4000);
     await until(async () => (await t.page.locator('.th').count()) === 21, 'the 21st thread after scrolling', 10000);
     let fail = true;
     await t.page.route('**/api/fe', async r => { if (fail && /"action":"reply.create"/.test(r.request().postData() || '')) { fail = false; await r.fulfill({ status: 409, contentType: 'application/json', body: '{"ok":false,"error":"conflict"}' }); } else await r.fallback(); });
     await t.fill('.inputbar textarea', 'Мой ответ ' + mark); await t.tap('.inputbar [aria-label="Отправить"]');
     await t.see('.alert:has-text("Не отправлено")'); await t.tap('.alert button:has-text("Повторить")');
     await toastSee(t, 'Ответ отправлен');
     const r = await t.api('post.replies', { postId: id }); expect(r.items.some(x => x.body === 'Мой ответ ' + mark), 'reply on the server');
   } finally { await drop(t, B.email, id); }
 } },

 { name: '«Скрыть публикацию» leaves a row with «Вернуть»; own name opens «Я»', persona: 'full', run: async t => {
   const B = await t.persona('basic'); const mark = tag();
   const id = await publish(t, B.email, { body: 'Скрыть ' + mark });
   const mine = await publish(t, t.me.email, { body: 'Своя ' + mark });
   try {
     await t.go('/n/feed');
     const art = t.page.locator('article.post', { hasText: 'Скрыть ' + mark }).first(); await art.waitFor({ timeout: 30000 });
     await art.locator('.post-h [aria-label="Ещё"]').click(); await t.tap(`${sheet} .li:has-text("Скрыть публикацию")`);
     await t.see('.alert:has-text("Публикация скрыта")');
     await until(async () => (await t.api('feedHide.list', {})).items.some(x => x.kind === 'post' && (x.targetId ?? x.target_id) === id), 'hidden on the server');
     await t.tap('.alert:has-text("Публикация скрыта") button:has-text("Вернуть")'); await t.see(`article.post:has-text("Скрыть ${mark}")`);
     await until(async () => !(await t.api('feedHide.list', {})).items.some(x => x.kind === 'post' && (x.targetId ?? x.target_id) === id), 'back on the server');
     await t.go('/n/feed/post/' + mine); await t.tap('.post-h .who'); await until(async () => t.page.url().endsWith('/n/me'), 'own name → «Я»', 10000);
   } finally { await drop(t, B.email, id); await drop(t, t.me.email, mine); }
 } },

 { name: 'composer: quick start, formatting bar (bold, link check), «Упомянуть» sheet → mention on the server', persona: 'full', run: async t => {
   const B = await t.persona('basic'); const mark = tag(); let id = null;
   try {
     await t.go('/n/feed'); await t.tap('.composer [aria-label="Создать"]'); await t.see(`${sheet}:has-text("Или сразу начать с")`);
     await t.tap(`${sheet} .create-q button:has-text("Опрос")`); await until(async () => t.page.url().includes('x=poll'), 'poll editor', 8000); await t.see('#pollQ');
     await t.go('/n/feed/new');
     const ta = t.page.locator('.rte-ed'); await ta.click(); await t.page.keyboard.type('жирный ' + mark);
     await ta.evaluate(el => { const n = el.querySelector('p')?.firstChild ?? el.firstChild; const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 6); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
     await t.tap('.rte-tb [aria-label="Жирный"]'); expect((await ta.locator('b, strong').first().innerText()) === 'жирный', 'bold shows as bold');
     await ta.evaluate(el => { el.focus(); const s = getSelection(); s.selectAllChildren(el); s.collapseToEnd(); });
     await t.tap('.rte-tb [aria-label="Ссылка"]'); await t.fill('#k-lnk-u', 'not a link'); await t.tap(`${sheet} .sh-f button:has-text("Вставить")`);
     await t.see(`${sheet} .ferr`); await t.fill('#k-lnk-t', 'пример'); await t.fill('#k-lnk-u', 'https://example.com'); await t.tap(`${sheet} .sh-f button:has-text("Вставить")`);
     expect((await ta.locator('a[href="https://example.com"]').innerText()) === 'пример', 'link inserted');
     await t.tap('.attach button:has-text("Упомянуть")'); await t.fill(`${sheet} input[type="search"]`, B.handle);
     await t.tap(`${sheet} .li:has-text("@${B.handle}")`); expect((await ta.innerText()).includes('@' + B.handle), 'mention inserted');
     await t.tap('.ctabar button:has-text("Опубликовать")'); await toastSee(t, 'Опубликовано');
     const mine = await until(async () => (await t.api('me.posts', {})).items.find(p => p.body.includes(mark)), 'post on the server');
     id = mine.id; expect(mine.body.includes('**жирный**') && (mine.mentions || []).some(m => m.id === B.personId), 'formatting and the mention: ' + JSON.stringify(mine.mentions));
   } finally { if (id) await drop(t, t.me.email, id); }
 } },

 { name: 'photo mark: «Подробнее» sheet → «Разрешить»; «Это я — против» asks before hiding', persona: 'full', run: async t => {
   const B = await t.persona('basic'); const mark = tag();
   const asset = await uploadFixture(B.email, 'post');
   const d = await t.api('post.saveDraft', { opId: t.uuid7(), post: { body: 'Фото ' + mark, mediaIds: [asset], tags: [t.me.personId] } }, B.email);
   const id = d.id;
   try {
     await t.api('post.publish', { opId: t.uuid7(), postId: id }, B.email);
     for (let i = 0; i < 20; i++) { const r = await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: asset, decision: 'approve', explicit: false }, STAFF); if (r.status === 200) break; await t.wait(3000); }
     await until(async () => (await t.api('post.get', { postId: id })).post?.tags?.some(x => x.id === t.me.personId && x.state === 'pending'), 'the mark waits for me', 60000);
     await t.go('/n/feed/post/' + id);
     await t.tap('.consent-note button:has-text("Подробнее")'); await t.see(`${sheet}:has-text("Отметка на фото")`); await t.see(`${sheet}:has-text("все участники")`);
     await t.tap(`${sheet} .sh-f button:has-text("Разрешить")`);
     await until(async () => (await t.api('post.get', { postId: id })).post.tags.some(x => x.id === t.me.personId && x.state === 'ok'), 'mark allowed');
     await t.tap('.post-h [aria-label="Ещё"]'); await t.tap(`${sheet} .li:has-text("Я против публикации")`);
     await t.see('.dialog.on:has-text("Ты на этом фото и против публикации?")'); await t.tap('.dialog.on button:has-text("Отмена")');
     expect((await t.api('post.get', { postId: id })).post, 'still visible after «Отмена»');
   } finally { await drop(t, B.email, id); }
 } },
];
