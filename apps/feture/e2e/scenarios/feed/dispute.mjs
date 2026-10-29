// «Это я на фото — против» guard (owner decision 28.10.2026), lane `dg`. A photo post is written by `stranger` (its
// photo approved by STAFF); claimants are fresh `temp` people (new, photo not verified → never trusted, so a claim only
// queues; a fresh one each run, so strikes from «не подтвердилось» never pile up on a lane persona). The instant hide is
// reached through a photo mark (`basic` marked on the photo). The trusted instant hide needs an account older than a
// week with a verified photo, which no lane persona has: tests/fe-dispute-postgres.mjs covers it.
import { expect, until, toastSee, stamp } from '../helpers.mjs';
import { STAFF } from '../../personas.mjs';
import { uploadFixture } from '../../lib.mjs';

const sheet = '.sheet.on', dialog = '.dialog.on';
async function photoPost(t, author, extra = {}) {
  const body = 'e2e спор ' + stamp();
  const asset = await uploadFixture(author.email, 'post');
  const d = await t.api('post.saveDraft', { opId: t.uuid7(), post: { type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [asset], interests: [], tags: [], ...extra } }, author.email);
  expect(d.id, 'draft ' + JSON.stringify(d));
  await t.api('post.publish', { opId: t.uuid7(), postId: d.id }, author.email);
  for (let i = 0; i < 20; i++) { const r = await t.api('staff.mediaDecide', { opId: t.uuid7(), assetId: asset, decision: 'approve', explicit: false }, STAFF); if (r.status === 200) break; await t.wait(3000); }
  await until(async () => (await t.api('post.get', { postId: d.id }, author.email)).post?.state === 'published', 'published', 60000);
  return { id: d.id, body };
}
const drop = async (t, author, id) => { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }, author.email); };
const dropTemp = async (t, p) => { if (p) await t.api('account.delete', { opId: t.uuid7(), confirmHandle: p.handle }, p.email); };
const queueItem = async (t, id) => (await t.api('staff.disputeQueue', { limit: 50 }, STAFF)).items?.find(i => i.id === id);

export default [
 { name: 'untrusted claim: dialog explains, «Отправить» → «Передали модераторам», the post stays visible, staff see it urgent and unnamed', persona: 'temp', route: '/n/feed', run: async t => {
   const author = await t.persona('stranger'), viewer = await t.persona('basic');
   let f;
   try {
     f = await photoPost(t, author);
     await t.go('/n/feed/post/' + f.id); const c = t.page.locator('article.post', { hasText: f.body }).first(); await c.waitFor();
     await c.locator('.post-h [aria-label="Ещё"]').click(); await t.see(sheet);
     await t.tap(`${sheet} .li:has-text("Это я на фото — против публикации")`);
     await t.see(`${dialog}:has-text("Если твоё фото профиля подтверждено")`);
     await t.tap(`${dialog} button:has-text("Отправить")`); await toastSee(t, 'Передали модераторам');
     // Still visible for everyone else; the author is told nothing.
     expect((await t.api('post.get', { postId: f.id }, viewer.email)).post, 'visible to others');
     expect(!(await t.api('post.get', { postId: f.id }, author.email)).post.dispute, 'author not told');
     const item = await until(() => queueItem(t, f.id), 'in the staff queue');
     expect(item.urgent && !item.hidden && !item.tagged && item.claims[0].trust !== 'trusted', 'urgent, untagged: ' + JSON.stringify(item));
     expect(!JSON.stringify(item).includes(t.me.personId), 'claimant not named to staff');
     // «Не подтвердилось»: the claim closes (the fresh claimant takes the strike).
     const r = await t.api('staff.disputeDecide', { opId: t.uuid7(), postId: f.id, restore: true }, STAFF);
     expect(r.state === 'published', 'restore ' + JSON.stringify(r));
     expect(!(await queueItem(t, f.id)), 'left the queue');
   } finally { await drop(t, author, f?.id); await dropTemp(t, t.me); }
 } },

 { name: 'author: hidden by the marked person → «Пост скрыт до проверки», explanation sent; staff see it with «отмечен на фото»', persona: 'stranger', route: '/n/feed', run: async t => {
   const marked = await t.persona('basic');
   let f;
   try {
     f = await photoPost(t, t.me, { tags: [marked.personId] });
     const o = await t.api('tag.object', { opId: t.uuid7(), postId: f.id }, marked.email);
     expect(o.hidden === true, 'marked person hides at once ' + JSON.stringify(o));
     await t.go('/n/feed/post/' + f.id); const c = t.page.locator('article.post', { hasText: f.body }).first(); await c.waitFor();
     await c.locator('.alert:has-text("Пост скрыт до проверки: человек на фото против публикации")').waitFor();
     await c.locator('button:has-text("Пояснить модераторам")').click(); await t.see(`${sheet}:has-text("Пояснение для модераторов")`);
     await t.fill(`${sheet} textarea`, 'На фото другой человек');
     await t.tap(`${sheet} .sh-f button:has-text("Отправить")`); await toastSee(t, 'Пояснение отправлено');
     await until(async () => (await t.api('post.get', { postId: f.id })).post.dispute?.note === 'На фото другой человек', 'note stored');
     await c.locator('.alert:has-text("На фото другой человек")').waitFor();
     const item = await until(() => queueItem(t, f.id), 'in the staff queue');
     expect(item.tagged && item.hidden && item.note === 'На фото другой человек', 'staff view: ' + JSON.stringify(item));
   } finally { await drop(t, t.me, f?.id); }
 } },

 { name: 'staff: dispute card shows urgency, mark and trust; «Подтвердилось» asks, then removes the post', persona: 'staff', route: '/n/staff', run: async t => {
   const author = await t.persona('stranger'); const claimant = await t.persona('temp');
   let f;
   try {
     f = await photoPost(t, author);
     const o = await t.api('tag.object', { opId: t.uuid7(), postId: f.id }, claimant.email);
     expect(o.hidden === false && o.queued, 'queued ' + JSON.stringify(o));
     await t.page.reload(); await t.page.locator('.seg[aria-label="Очереди проверки"] [role=tab]').first().waitFor({ timeout: 20000 });
     await t.page.locator('.seg[aria-label="Очереди проверки"] [role=tab]').filter({ hasText: /^Это я на фото/ }).first().click();
     const card = t.page.locator('.mod-card', { hasText: f.body.slice(0, 40) }).first(); await card.waitFor({ timeout: 15000 });
     await card.locator('text=Срочно: публикация видна').waitFor();
     await card.locator('text=не отмечен').first().waitFor();
     await card.locator('text=страйков: 0').first().waitFor();
     await card.locator('.btn').filter({ hasText: /^Подтвердилось$/ }).first().click();
     await card.locator('[role=alertdialog] .btn.danger').click();
     await t.see('Решение сохранено.');
     await until(async () => (await t.api('post.get', { postId: f.id }, author.email)).post?.state === 'removed', 'removed');
   } finally { await drop(t, author, f?.id); await dropTemp(t, claimant); }
 } },
];
