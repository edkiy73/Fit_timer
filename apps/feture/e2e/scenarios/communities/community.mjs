// C03 community page: join open/closed, withdraw, mute, leave, report, tabs, new discussion (poll / photo), reply.
import fs from 'node:fs';
// Communities of persona `host`: its open one and its closed one (with a join question). A visitor is `full`; the
// owner's own screens run as `host`. Every scenario leaves the visitor outside again and deletes what it posted.
import { FIXTURES, until, uploaderDone } from '../helpers.mjs';
let OPEN, CLOSED, MINE, OPEN_NAME, CLOSED_NAME;
async function init(t) {
  const h = t.me.kind === 'host' ? t.me : await t.persona('host');
  OPEN = h.openId; CLOSED = MINE = h.closedId;
  OPEN_NAME = (await t.api('community.get', { communityId: OPEN }, h.email)).community.name;
  CLOSED_NAME = (await t.api('community.get', { communityId: CLOSED }, h.email)).community.name;
}
const PNG = fs.readFileSync(FIXTURES + 'cover.png');
const sheet = '.sheet.on', dialog = '.dialog.on';
const toast = (t, s) => t.see('.toast:has-text("' + s + '")');
const me = async (t, id, as) => (await t.api('community.get', { communityId: id }, as)).community;
const ensureOut = async (t, id, as) => {
  const c = await me(t, id, as);
  if (c?.me?.state === 'active') await t.api('community.leave', { opId: t.uuid7(), communityId: id }, as);
  if (c?.request) await t.api('community.requestWithdraw', { opId: t.uuid7(), requestId: c.request.id }, as);
};
const scenarios = [
 { name: 'C03 open: join needs rules, joins, mute/unmute, leave (ask cancel + confirm)', persona: 'full', run: async t => {
   await ensureOut(t, OPEN);
   await t.go('/n/communities/' + OPEN);
   await t.see(`.cm-head h2:has-text("${OPEN_NAME}")`);
   await t.tap('.cm-act .btn:has-text("Вступить")');
   await t.see(sheet); await t.see('Правила сообщества');
   // The button accepts the rules (owner 29.10.2026): no separate box to tick.
   if (await t.page.locator(sheet + ' button.check').count()) throw new Error('a «Принимаю правила» box is back');
   await t.page.locator(sheet + ' .sh-f .btn:has-text("Принять правила и вступить")').click();
   await toast(t, OPEN_NAME);
   await t.see('.cm-act .pill.ok');
   if ((await me(t, OPEN)).me?.state !== 'active') throw new Error('not a member after join');
   await t.tap('button[aria-label="Ещё"]'); await t.see(sheet);
   await t.tap(sheet + ' .li:has-text("Не присылать уведомления")');
   await toast(t, 'Уведомления сообщества выключены');
   if (!(await me(t, OPEN)).me?.muted) throw new Error('mute not saved');
   await t.tap('button[aria-label="Ещё"]');
   await t.tap(sheet + ' .li:has-text("Присылать уведомления")');
   await toast(t, 'Уведомления сообщества включены');
   if ((await me(t, OPEN)).me?.muted) throw new Error('unmute not saved');
   await t.tap('button[aria-label="Ещё"]');
   await t.tap(sheet + ' .li:has-text("Выйти из сообщества")');
   await t.see(dialog);
   await t.page.locator(dialog + ' .btn.soft').click({ timeout: 5000 }); await t.wait(300);
   if (await t.page.locator(dialog).count()) throw new Error('cancel did not close ask');
   await t.tap('button[aria-label="Ещё"]');
   await t.tap(sheet + ' .li:has-text("Выйти из сообщества")');
   await t.page.locator(dialog + ' .btn.danger').click({ timeout: 5000 });
   await toast(t, 'Ты больше не в сообществе');
   if ((await me(t, OPEN)).me?.state === 'active') throw new Error('still a member after leave');
   await t.see('.cm-act .btn:has-text("Вступить")');
 } },
 { name: 'C03 closed: question validation, request, withdraw', persona: 'full', run: async t => {
   await ensureOut(t, CLOSED);
   await t.go('/n/communities/' + CLOSED);
   await t.see(`.cm-head h2:has-text("${CLOSED_NAME}")`);
   await t.see('.veil-glass');
   await t.tap('.cm-act .btn:has-text("Подать заявку")');
   await t.see(sheet); await t.see('Заявка в сообщество');
   const c = await me(t, CLOSED);
   if (c.joinQuestion) {
     await t.page.locator(sheet + ' textarea').fill('коротко');
     await t.page.locator(sheet + ' .sh-f .btn').click();
     await t.see('Ответь хотя бы парой предложений');
     await t.page.locator(sheet + ' textarea').fill('Мне интересна тема, хочу общаться и учиться у опытных людей.');
   }
   await t.see(sheet + ' .sh-f .btn:has-text("Принять правила и отправить заявку")');
   await t.page.locator(sheet + ' .sh-f .btn').click();
   await toast(t, 'Заявка отправлена ведущим');
   await t.see('.k-status:has-text("Заявка на рассмотрении"):has-text("Отправлена")'); // one block: state, when, «Отозвать»
   if (!(await me(t, CLOSED)).request) throw new Error('request not stored');
   await t.tap('.k-status .btn:has-text("Отозвать")');
   await t.page.locator(dialog + ' .btn.danger').click({ timeout: 5000 });
   await toast(t, 'Заявка отозвана');
   if ((await me(t, CLOSED)).request) throw new Error('request still pending');
   await t.see('.cm-act .btn:has-text("Подать заявку")');
 } },
 { name: 'C03 join sheet closes by ✕ and Esc', persona: 'full', run: async t => {
   await ensureOut(t, OPEN);
   await t.go('/n/communities/' + OPEN);
   await t.tap('.cm-act .btn:has-text("Вступить")'); await t.see(sheet);
   await t.page.locator(sheet + ' .sh-h button[aria-label="Закрыть"]').click(); await t.wait(300);
   if (await t.page.locator(sheet).count()) throw new Error('✕ did not close');
   await t.tap('.cm-act .btn:has-text("Вступить")'); await t.see(sheet);
   await t.page.keyboard.press('Escape'); await t.wait(300);
   if (await t.page.locator(sheet).count()) throw new Error('Esc did not close');
 } },
 { name: 'C03 report: reason required, sent', persona: 'full', route: '/n/communities/@MINE', run: async t => {
   await t.see(`.cm-head h2:has-text("${CLOSED_NAME}")`);
   await t.tap('button[aria-label="Ещё"]');
   await t.tap(sheet + ' .li:has-text("Пожаловаться")');
   await t.see('.sheet.on [role="radiogroup"]');
   await t.page.locator(sheet + ' .sh-f .btn').click();
   await t.see(sheet + ' .ferr:has-text("Выбери причину")'); await t.see(sheet + ' .ferr:has-text("Опиши, что случилось")');
   await t.page.locator(sheet + ' .radio').last().click();
   await t.page.locator(sheet + ' textarea').fill('e2e: проверка жалобы, можно отклонить');
   await t.page.locator(sheet + ' .sh-f .btn').click();
   await toast(t, 'Жалоба отправлена модераторам');
 } },
 { name: 'C03 tabs: events, members, rules render', persona: 'host', route: '/n/communities/@MINE', run: async t => {
   await t.see(`.cm-head h2:has-text("${CLOSED_NAME}")`);
   await t.tap('.seg button:has-text("Правила")'); await t.see('ol.rules li');
   await t.tap('.seg button:has-text("Люди")'); await t.see('Ведущие');
   await t.tap('.seg button:has-text("События")'); await t.wait(500);
   await t.tap('.seg button:has-text("Темы")'); await t.see('.view .composer');
 } },
 { name: 'C03 new discussion with a poll lands in the community; reply; cleanup', persona: 'host', route: '/n/communities/@MINE', run: async t => {
   const stamp = 'E2E опрос ' + Date.now().toString(36);
   await t.see('.view .composer');
   await t.tap('.view .composer button[aria-label="Опрос"]');
   await t.see('#pollQ');
   await t.page.locator('.compose .rte-ed').first().fill(stamp + ': как вам формат?');
   await t.page.locator('#pollQ').fill('Какой формат удобнее?');
   const opts = t.page.locator('.pollopt input');
   await opts.nth(0).fill('Онлайн'); await opts.nth(1).fill('Офлайн');
   await t.tap('.ctabar .btn:not(.soft)');
   await t.wait(1500);
   if (!t.page.url().includes('/n/communities/' + MINE)) throw new Error('not back on the community: ' + t.page.url());
   const d = (await t.api('community.discussions', { communityId: MINE })).items.find(x => x.excerpt.includes(stamp));
   if (!d) throw new Error('discussion not in the community');
   await t.see('.disc:has-text("' + stamp + '")');
   await t.tap('.disc:has-text("' + stamp + '")');
   await t.see('.inputbar textarea');
   await t.page.locator('.inputbar textarea').fill('E2E ответ в обсуждении');
   await t.tap('.inputbar .ibtn.send');
   await t.see('.reply-text:has-text("E2E ответ в обсуждении")'); // the reply is listed (not «Ответов пока нет» under «1 ответ»)
   await until(async () => !(await t.page.locator('.inputbar textarea').inputValue()), 'reply box not cleared', 10000);
   const r = await t.api('post.delete', { opId: t.uuid7(), postId: d.id });
   if (!r.ok) throw new Error('cleanup: ' + r.error);
 } },
 { name: 'C03 new discussion with a photo (file chooser opens), published; cleanup', persona: 'host', route: '/n/communities/@MINE', run: async t => {
   const stamp = 'E2E фото ' + Date.now().toString(36);
   await t.see('.view .composer');
   const fc = t.page.waitForEvent('filechooser', { timeout: 8000 });
   await t.tap('.view .composer .ibtn.ghost >> nth=0');
   const chooser = await fc;
   await chooser.setFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG });
   await uploaderDone(t);
   await t.see('.cmp-media img', 20000);
   await t.page.locator('.compose .rte-ed').first().fill(stamp);
   await t.tap('.ctabar .btn:not(.soft)');
   await t.see('.toast');
   await t.wait(1500);
   if (!t.page.url().includes('/n/communities/' + MINE)) throw new Error('not back on the community: ' + t.page.url());
   const d = (await t.api('community.discussions', { communityId: MINE })).items.find(x => x.excerpt.includes(stamp));
   const id = d?.id ?? (await t.api('me.posts', {})).items.find(x => (x.body ?? '').includes(stamp))?.id; // a photo post may wait for review
   if (!id) throw new Error('photo discussion not stored');
   await t.api('post.delete', { opId: t.uuid7(), postId: id });
 } },

 // One composer everywhere (owner 29.10.2026): the community's row is the feed's, its «+» is the same «Создать».
 { name: 'ONE «+» as host: «Создать» offers «Событие», made in this community', persona: 'host', route: '/n/communities/@MINE', run: async t => {
   await t.see('.view .composer .cmp-main:has-text("Новая тема")');
   await t.tap('.view .composer .ibtn.add'); await t.see(sheet + ':has-text("Создать")');
   await t.see(sheet + ' .li:has-text("Публикация")'); await t.see(sheet + ' .li:has-text("Статья")');
   await t.tap(sheet + ' .li:has-text("Событие")');
   await t.wait(800);
   if (!t.page.url().includes('/n/events/new?community=' + MINE)) throw new Error('event editor not for the community: ' + t.page.url());
   await t.see(CLOSED_NAME); // the event starts linked to the community
 } },
 { name: 'ONE «+» as member: «Публикация» and «Статья», no «Событие»', persona: 'full', run: async t => {
   await t.api('community.join', { opId: t.uuid7(), communityId: OPEN, rulesAccepted: true });
   await t.go('/n/communities/' + OPEN);
   await t.see('.view .composer'); await t.tap('.view .composer .ibtn.add');
   await t.see(sheet + ' .li:has-text("Публикация")'); await t.see(sheet + ' .li:has-text("Статья")');
   if (await t.page.locator(sheet + ' .li:has-text("Событие")').count()) throw new Error('a member is offered «Событие»');
   await t.shot('community-create-member');
 } },
 { name: 'ONE editor in a community: an article and «Мои интересы» are published there', persona: 'full', run: async t => {
   await t.api('community.join', { opId: t.uuid7(), communityId: OPEN, rulesAccepted: true });
   const stamp = 'E2E статья ' + Date.now().toString(36);
   const made = [];
   try {
     await t.go('/n/communities/' + OPEN);
     await t.tap('.view .composer .ibtn.add'); await t.tap(sheet + ' .li:has-text("Статья")');
     await t.see('#ntitle');
     await t.see('.view .li:has-text("Видят все")'); // who sees it is the community's, not a choice
     if (await t.page.locator('.view .selrow').count()) throw new Error('an audience selector in a community');
     await t.see('css=header .btn:has-text("В черновик")');
     await t.page.locator('#ntitle').fill(stamp);
     await t.page.locator('.compose .rte-ed').first().fill('Текст статьи внутри сообщества, длиннее двадцати знаков.');
     await t.tap('.ctabar .btn:not(.soft)');
     await until(() => t.page.url().includes('/n/communities/' + OPEN), 'back on the community', 15000);
     const a = (await t.api('community.discussions', { communityId: OPEN })).items.find(x => x.title === stamp);
     if (!a) throw new Error('article not in the community'); made.push(a.id);
     const art = (await t.api('post.get', { postId: a.id })).post;
     if (art.type !== 'note' || art.inFeed !== false) throw new Error('article: ' + art.type + ', in feed ' + art.inFeed);

     const ints = 'E2E интересы ' + Date.now().toString(36);
     await t.tap('.view .composer .ibtn.add'); await t.tap(sheet + ' .create-q button:has-text("Мои интересы")');
     await t.see('.cmp-ints', 15000);
     await t.page.locator('.compose .rte-ed').first().fill(ints);
     await t.tap('.ctabar .btn:not(.soft)');
     await until(() => t.page.url().includes('/n/communities/' + OPEN), 'back on the community', 15000);
     const p = (await t.api('community.discussions', { communityId: OPEN })).items.find(x => x.excerpt.includes(ints));
     if (!p) throw new Error('«Мои интересы» not in the community'); made.push(p.id);
     if (!(await t.api('post.get', { postId: p.id })).post.interests?.length) throw new Error('interests not on the post');
   } finally { for (const id of made) await t.api('post.delete', { opId: t.uuid7(), postId: id }); }
 } },
];

export default scenarios.map(sc => ({ ...sc, route: null, run: async t => {
  await init(t);
  if (sc.route) await t.go(sc.route.replace('@MINE', MINE));
  try { await sc.run(t); } finally { if (t.me.kind !== 'host') { await ensureOut(t, OPEN); await ensureOut(t, CLOSED); } }
} }));
