// Post card and post screen: what every tap does, read back from the server. `full` taps; someone else's post is
// written by `stranger` (a basic person of the lane) and deleted at the end.
import { expect, until, toastSee, stamp } from '../helpers.mjs';
import { STAFF } from '../../personas.mjs';
import { uploadFixture } from '../../lib.mjs';
const author = async t => (await t.persona('stranger')).email;
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: ['bondage'], mediaIds: [], interests: [], tags: [], ...extra });
async function fixture(t, extra) {
  const body = 'e2e карточка ' + stamp();
  const T2 = await author(t);
  const d = await t.api('post.saveDraft', { opId: t.uuid7(), post: draft(body, extra) }, T2);
  const p = await t.api('post.publish', { opId: t.uuid7(), postId: d.id }, T2);
  expect(p.state === 'published', 'fixture ' + JSON.stringify(p)); return { id: d.id, body };
}
const get = async (t, id) => (await t.api('post.get', { postId: id })).post;
const drop = async (t, id) => { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }, await author(t)); };
const card = (t, body) => t.page.locator('article.post', { hasText: body }).first();

export default [
 { name: 'post screen: like / unlike, save → «Открыть», unsave → «Вернуть», share copies a link', persona: 'full', route: '/n/feed', run: async t => {
   const f = await fixture(t);
   try {
     await t.go('/n/feed/post/' + f.id); const c = card(t, f.body); await c.waitFor();
     await c.locator('.post-a button[aria-label="Нравится"], .post-a button').first().click();
     await until(async () => (await get(t, f.id)).liked === true, 'liked on server');
     expect((await c.locator('.post-a button').first().innerText()).trim() === '1', 'count shows 1');
     await c.locator('.post-a button').first().click(); await until(async () => (await get(t, f.id)).liked === false, 'unliked');
     await c.locator('.post-a .sp').click(); await toastSee(t, 'охран'); await until(async () => (await get(t, f.id)).saved === true, 'saved');
     await t.wait(3500); await c.locator('.post-a .sp').click(); await toastSee(t, '');
     await until(async () => (await get(t, f.id)).saved === false, 'unsaved');
     await t.tap('.toast .tb'); await until(async () => (await get(t, f.id)).saved === true, '«Вернуть» saved again');
     await t.wait(3500); await c.locator('.post-a button').last().click(); await toastSee(t, '');
   } finally { await t.api('saved.set', { opId: t.uuid7(), kind: 'post', targetId: f.id, on: false }); await drop(t, f.id); }
 } },
 { name: 'poll: vote → stored, results shown; «Отменить голос» clears it', persona: 'full', route: '/n/feed', run: async t => {
   const f = await fixture(t, { poll: { question: 'Что выбираешь?', options: ['Чай', 'Кофе'] } });
   try {
     await t.go('/n/feed/post/' + f.id); const c = card(t, f.body); await c.waitFor();
     await c.locator('.poll-choice').nth(1).click(); await until(async () => (await get(t, f.id)).poll?.myVote === 1, 'vote stored');
     await c.locator('.poll-count').first().waitFor();
     await c.locator('.poll-undo').click(); await until(async () => (await get(t, f.id)).poll?.myVote == null, 'vote cleared');
   } finally { await drop(t, f.id); }
 } },
 { name: 'replies: send, answer a reply, like a reply, edit and delete my reply', persona: 'full', route: '/n/feed', run: async t => {
   const f = await fixture(t);
   const replies = async () => (await t.api('post.replies', { postId: f.id })).items;
   try {
     await t.go('/n/feed/post/' + f.id); await card(t, f.body).waitFor();
     await t.tap('.note-empty'); await t.page.keyboard.type('первый ответ'); await t.tap('.inputbar .send');
     const r1 = await until(async () => (await replies()).find(r => r.body === 'первый ответ'), 'reply stored');
     await t.see('.reply-text:has-text("первый ответ")');
     await t.page.locator('.r-acts button[aria-label^="Ответить"]').first().click(); await t.see('.reply-target');
     await t.page.keyboard.type('ответ на ответ'); await t.page.keyboard.press('Enter');
     const r2 = await until(async () => (await replies()).find(r => r.body === 'ответ на ответ'), 'nested stored');
     expect(r2.parentId === r1.id, 'parent ' + r2.parentId);
     await t.page.locator('.r-acts button[aria-label="Нравится ответ"]').first().click();
     await until(async () => (await replies()).find(r => r.id === r1.id)?.liked === true, 'reply liked');
     await t.page.locator('.r-acts button[aria-label="Ещё"]').first().click(); await t.see('.sheet.on');
     await t.tap('.sheet.on .li:has-text("Изменить")'); await t.see('.reply-target'); await t.fill('.inputbar textarea', 'первый ответ (исправлен)'); await t.tap('.inputbar .send');
     await until(async () => (await replies()).find(r => r.id === r1.id)?.body === 'первый ответ (исправлен)', 'reply edited');
     await t.page.locator('.r-acts button[aria-label="Ещё"]').nth(1).click(); await t.see('.sheet.on'); await t.tap('.sheet.on .li:has-text("Удалить")');
     if (await t.page.locator('.dialog.on, .sheet.on .btn.danger').count()) await t.page.locator('.dialog.on .btn.danger, .sheet.on .btn.danger').first().click();
     await until(async () => { const r = (await replies()).find(x => x.id === r2.id); return !r || r.deleted; }, 'reply deleted');
   } finally { await drop(t, f.id); }
 } },
 { name: 'author, topic and body taps navigate', persona: 'full', route: '/n/feed', run: async t => {
   const f = await fixture(t);
   try {
     await t.go('/n/feed/post/' + f.id); const c = card(t, f.body); await c.waitFor();
     await c.locator('.tags button').first().click(); await t.wait(800); expect(t.page.url().includes('/n/topics/'), 'topic: ' + t.page.url());
     await t.go('/n/feed/post/' + f.id); await card(t, f.body).locator('.post-h .who').click(); await t.wait(800); expect(t.page.url().includes('/n/people/'), 'author: ' + t.page.url());
   } finally { await drop(t, f.id); }
 } },
 { name: '«⋯» on someone’s post: hide → gone from the feed with «Вернуть»; report → sent', persona: 'full', route: '/n/feed', allow4xx: true, run: async t => {
   const f = await fixture(t);
   try {
     await t.go('/n/feed/post/' + f.id); let c = card(t, f.body); await c.waitFor();
     await c.locator('.post-h button[aria-label="Ещё"]').click(); await t.see('.sheet.on');
     await t.tap('.sheet.on .li:has-text("Скрыть")'); await toastSee(t, '');
     await until(async () => !(await t.api('feed.list', { tab: 'forYou', limit: 50 })).items.some(p => p.id === f.id), 'hidden from feed');
     await t.tap('.toast .tb'); await until(async () => (await t.api('feed.list', { tab: 'forYou', limit: 50 })).items.some(p => p.id === f.id), '«Вернуть» brings it back');
     await t.go('/n/feed/post/' + f.id); c = card(t, f.body); await c.waitFor();
     await c.locator('.post-h button[aria-label="Ещё"]').click(); await t.tap('.sheet.on .li:has-text("Пожаловаться")'); await t.see('.sheet.on');
     await t.page.locator('.sheet.on [role="radio"]').first().click();
     await t.tap('.sheet.on .sh-f button:has-text("Отправить жалобу")'); await t.see('.sheet.on .ferr:has-text("Опиши, что случилось")'); // details are required
     await t.fill('.sheet.on textarea', 'e2e: проверка жалобы, можно отклонить');
     await t.tap('.sheet.on .sh-f button:has-text("Отправить жалобу")'); await toastSee(t, '');
     await t.wait(1500); expect(!(await t.page.locator('.sheet.on').count()), 'report sheet closed');
   } finally { await drop(t, f.id); }
 } },
 { name: '«⋯» on my post: edit text → saved; delete → gone', persona: 'full', route: '/n/feed', run: async t => {
   const body = 'e2e мой ' + stamp();
   const d = await t.api('post.saveDraft', { opId: t.uuid7(), post: draft(body) }); await t.api('post.publish', { opId: t.uuid7(), postId: d.id });
   let id = d.id;
   try {
     await t.go('/n/feed/post/' + id); const c = card(t, body); await c.waitFor();
     await c.locator('.post-h button[aria-label="Ещё"]').click(); await t.tap('.sheet.on .li:has-text("Редактировать")'); await t.see('.compose .rte-ed');
     await t.fill('.compose .rte-ed', body + ' исправлено'); await t.tap('.ctabar .btn.primary');
     await until(async () => (await get(t, id)).body === body + ' исправлено', 'edit saved');
     await t.go('/n/feed/post/' + id); await card(t, body).waitFor();
     await card(t, body).locator('.post-h button[aria-label="Ещё"]').click(); await t.tap('.sheet.on .li:has-text("Удалить")');
     await t.page.locator('.dialog.on .btn.danger, .sheet.on .btn.danger').first().click();
     await until(async () => !(await t.api('me.posts', {})).items.some(p => p.id === id && p.state === 'published'), 'deleted'); id = null;
   } finally { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }); }
 } },
 { name: 'viewer: a tap on the right / left third pages forward / back; the middle does not; arrows still work', persona: 'full', route: '/n/feed', run: async t => {
   const T2 = await author(t);
   const mediaIds = [await uploadFixture(T2, 'post'), await uploadFixture(T2, 'post')];
   const body = 'e2e листание ' + stamp();
   const d = await t.api('post.saveDraft', { opId: t.uuid7(), post: draft(body, { mediaIds }) }, T2);
   await t.api('post.publish', { opId: t.uuid7(), postId: d.id }, T2);
   const f = { id: d.id, body };
   try {
     // Photos are checked first: approve them as staff when the scan sends them there, then the post goes out.
     await until(async () => {
       for (const a of mediaIds) await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: a, decision: 'approve', explicit: false }, STAFF);
       return (await get(t, f.id))?.media?.filter(m => m.src).length === 2 || null;
     }, 'both photos ready', 180000);
     await t.go('/n/feed/post/' + f.id); const c = card(t, f.body); await c.waitFor();
     await c.locator('.mgrid .mcell').first().click(); await t.see('.viewer.on .vw-n:has-text("1 / 2")');
     const box = await t.page.locator('.viewer.on .vw-track').boundingBox();
     const at = async fx => { await t.page.mouse.click(box.x + box.width * fx, box.y + box.height / 2); await t.wait(450); return (await t.page.locator('.viewer.on .vw-n').innerText()).trim(); };
     expect(await at(.5) === '1 / 2', 'the middle does not page');
     expect(await at(.85) === '2 / 2', 'right third → next');
     expect(await at(.85) === '2 / 2', 'stays on the last');
     await t.shot('viewer-tap-paged');
     expect(await at(.15) === '1 / 2', 'left third → back');
     await t.page.keyboard.press('ArrowRight'); await t.wait(400);
     expect((await t.page.locator('.viewer.on .vw-n').innerText()).trim() === '2 / 2', 'arrow key');
     // A swipe is not also a tap.
     await t.page.mouse.move(box.x + box.width * .2, box.y + box.height / 2); await t.page.mouse.down();
     await t.page.mouse.move(box.x + box.width * .8, box.y + box.height / 2, { steps: 6 }); await t.page.mouse.up(); await t.wait(450);
     expect((await t.page.locator('.viewer.on .vw-n').innerText()).trim() === '1 / 2', 'swipe right → back once');
   } finally { await drop(t, f.id); }
 } },
];
