// F «Новая публикация»: every control, checked by what the server stored — not by screenshots.
import { expect, until, pngOf, toastSee, stamp, leaveGuard } from '../helpers.mjs';
const mine = async t => (await t.api('me.posts', {})).items;
const newest = async (t, body) => until(async () => (await mine(t)).find(p => p.body === body && p.state !== 'draft'), 'post sent: ' + body);
const cleanup = async (t, id) => { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }); };
const ta = '.compose .rte-ed';
const text = async t => (await t.page.locator(ta).innerText()).replace(/\u00a0/g, ' ').trim();
const inView = async (t, sel) => { await t.wait(700); const b = await t.page.locator(sel).first().boundingBox(); const vh = t.page.viewportSize().height;
  expect(b && b.y > 0 && b.y < vh - 140, `${sel} not in view (y=${b && Math.round(b.y)})`); };
const publishBtn = '.ctabar .btn.primary';
/** An optional section is a row that opens in place: `row(t, 'Опрос')` taps it, `sec('Темы')` is its open body. */
const row = (t, name) => t.tap(`.k-exp > .li:has(b:text-is("${name}"))`);
const sec = name => `.k-exp:has(> .li b:text-is("${name}"))`;
/** The kit uploader sheet after a pick: wait for the row, «Готово», the photo lands in the form. */
const uploaded = async t => { await t.see('.sheet.on .k-uprow:has-text("без геометки")', 20000); await t.tap('.sheet.on .sh-f button:has-text("Готово")'); await t.see('.edit-ph img', 30000); };

export default [
 { name: 'opening «Новая публикация» again starts a fresh form', persona: 'full', route: '/n/feed/new', run: async t => {
   await t.see(ta); expect(!(await t.page.locator('.attach button:has-text("Статья")').count()), 'the post composer offers no «Статья»'); await t.fill(ta, 'черновой текст');
   await t.page.evaluate(() => { location.hash = '#/n/feed'; }); await t.wait(800);
   const ask = t.page.locator('.dialog.on .btn.danger'); if (await ask.count()) await ask.click();
   await t.go('/n/feed/new'); await t.see(ta);
   expect((await text(t)) === '', 'old text stuck');
 } },
 { name: 'text: counter, «Кому видно» → «Подписчики», no in-feed switch → stored as typed', persona: 'full', route: '/n/feed/new', run: async t => {
   let id;
   try {
     const body = 'e2e текст ' + stamp();
     await t.see(ta); await t.fill(ta, body); await t.see(`.counter:has-text("${body.length} /")`);
     const aud = '.selrow:has(.selt:text-is("Кому видно"))'; await t.see(aud);
     await t.page.locator(aud + ' select').selectOption('followers'); await t.wait(300);
     expect((await t.page.locator(aud + ' .selv').innerText()).includes('Подписчики'), 'audience label: ' + await t.page.locator(aud + ' .selv').innerText());
     expect(!(await t.page.locator('[role="switch"]:near(:text("Показать в ленте"))').count()) && !(await t.page.locator('text=Показать в ленте').count()), 'no in-feed switch');
     await t.tap(publishBtn);
     const p = await newest(t, body); id = p.id;
     expect(p.audience === 'followers', 'audience ' + p.audience); expect(p.inFeed === true, 'inFeed ' + p.inFeed); expect(p.state === 'published', 'state ' + p.state);
   } finally { await cleanup(t, id); }
 } },
 { name: 'poll: add/remove options, validation, publish → stored poll', persona: 'full', route: '/n/feed/new', run: async t => {
   let id;
   try {
     await t.see(ta); await row(t, 'Опрос'); await t.see('#pollQ'); await inView(t, '#pollQ');
     await t.tap(publishBtn); await t.see('.ferr'); // empty question/options refused
     const body = 'e2e опрос ' + stamp();
     await t.fill(ta, body); await t.fill('#pollQ', 'Куда пойдём?');
     await t.tap('button:has-text("Добавить вариант")'); expect((await t.page.locator('.pollopt').count()) === 3, '3 options');
     await t.tap('.pollopt button[aria-label] >> nth=2'); expect((await t.page.locator('.pollopt').count()) === 2, 'option removed');
     await t.page.locator('.pollopt input').nth(0).fill('Кино'); await t.page.locator('.pollopt input').nth(1).fill('Кино');
     await t.tap(publishBtn); await t.see('.ferr:has-text("")'); // duplicates refused
     await t.page.locator('.pollopt input').nth(1).fill('Театр');
     await t.tap(publishBtn);
     const p = await newest(t, body); id = p.id;
     expect(p.poll?.question === 'Куда пойдём?' && JSON.stringify(p.poll.options) === '["Кино","Театр"]', 'poll ' + JSON.stringify(p.poll));
   } finally { await cleanup(t, id); }
 } },
 { name: 'article: its own editor, title + 20 chars rule, publish as note', persona: 'full', route: '/n/feed/new?x=note', run: async t => {
   let id;
   try {
     await t.see('#ntitle'); await t.see(ta);
     await t.fill('#ntitle', 'Ок'); await t.fill(ta, 'коротко'); await t.tap(publishBtn); expect((await t.page.locator('.ferr').count()) >= 2, 'title and body errors');
     const body = 'e2e статья ' + stamp() + ' — достаточно длинный текст статьи.';
     await t.fill('#ntitle', 'Заголовок статьи'); await t.fill(ta, body); await t.tap(publishBtn);
     const p = await newest(t, body); id = p.id;
     expect(p.type === 'note' && p.title === 'Заголовок статьи', 'note ' + p.type + ' ' + p.title);
   } finally { await cleanup(t, id); }
 } },
 { name: '@ inserts a mention; topics: toggle, max 3, «Все» sheet applies', persona: 'full', route: '/n/feed/new', run: async t => {
   let id;
   try {
     await t.see(ta); await t.fill(ta, 'привет');
     await t.page.locator(ta).click(); await t.page.keyboard.press('End'); await t.page.keyboard.type(' @'); await t.wait(200); expect((await text(t)) === 'привет @', 'mention: ' + await text(t));
     await row(t, 'Темы'); const chips = t.page.locator(sec('Темы') + ' .chips .chip:not(.more)');
     for (let i = 0; i < 3; i++) await chips.nth(i).click();
     expect((await t.page.locator(sec('Темы') + ' .chip.on').count()) === 3, '3 topics on');
     await chips.nth(3).click(); await toastSee(t, '');
     expect((await t.page.locator(sec('Темы') + ' .chip.on').count()) === 3, 'still 3 after the 4th');
     await chips.nth(0).click(); await t.tap('.chip.more'); await t.see('.sheet.on');
     expect(!(await t.page.locator('.sheet.on:has-text("Применить фильтры")').count()), 'post topic sheet must not be the feed filter');
     await t.page.locator('.sheet.on .chip:not(.on):not(.more)').first().click(); await t.page.locator('.sheet.on .chip:not(.on):not(.more)').first().click(); await toastSee(t, 'не больше 3');
     await t.tap('.sheet.on .sh-f button:has-text("Готово")'); await t.notSee('.sheet.on', 500);
     expect((await t.page.locator(sec('Темы') + ' .chip.on').count()) === 3, 'sheet applied 3');
     const body = 'e2e темы ' + stamp(); await t.fill(ta, body); await t.tap(publishBtn);
     const p = await newest(t, body); id = p.id; expect(p.topics.length === 3, 'topics ' + JSON.stringify(p.topics));
   } finally { await cleanup(t, id); }
 } },
 { name: 'my interests: attach up to 4, remove, publish → stored', persona: 'full', route: '/n/feed/new', run: async t => {
   let id;
   try {
     await t.see(ta); await row(t, 'Интересы'); await t.wait(500);
     const isec = sec('Интересы') + '.open';
     if (!(await t.page.locator(isec).count())) { await toastSee(t, ''); console.log('   no public interests — toast shown'); return; }
     await inView(t, isec);
     const on = await t.page.locator(isec + ' .chip.on').count(); expect(on >= 1 && on <= 4, 'preselected ' + on);
     const body = 'e2e интересы ' + stamp(); await t.fill(ta, body); await t.tap(publishBtn);
     const p = await newest(t, body); id = p.id; expect((p.interests ?? []).length === on, 'interests ' + JSON.stringify(p.interests));
   } finally { await cleanup(t, id); }
 } },
 { name: 'photo: upload, view, remove, add again, people sheet, publish → review', persona: 'full', route: '/n/feed/new', run: async t => {
   let id;
   try {
     await t.see(ta);
     let [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.attach button:has-text("Фото")').click()]);
     await ch.setFiles({ name: 'a.png', mimeType: 'image/png', buffer: await pngOf(t) });
     await uploaded(t); await inView(t, '.edit-ph img'); await t.tap('.edit-ph .vw'); await t.wait(600); await t.page.keyboard.press('Escape'); await t.wait(300);
     await t.tap('.edit-ph .rm'); await t.notSee('.edit-ph img', 400);
     [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.attach button:has-text("Фото")').click()]);
     await ch.setFiles({ name: 'b.png', mimeType: 'image/png', buffer: await pngOf(t) }); await uploaded(t);
     await t.tap('button.li:has-text("Люди на фото")'); await t.see('.sheet.on'); await t.tap('.sheet.on .sh-f .btn'); await t.notSee('.sheet.on', 400);
     const body = 'e2e фото ' + stamp(); await t.fill(ta, body);
     await t.tap(publishBtn);
     const p = await newest(t, body); id = p.id; expect(p.media.length === 1, 'media ' + p.media.length); expect(['review', 'published'].includes(p.state), 'state ' + p.state);
   } finally { await cleanup(t, id); }
 } },
 { name: '«Как увидят» preview → «Изменить» back; draft saved; leaving asks', persona: 'full', route: '/n/feed/new', run: async t => {
   let id;
   try {
     const body = 'e2e черновик ' + stamp(); await t.see(ta); await t.fill(ta, body);
     await t.tap('.prevbtn'); await t.see(`.preview-post:has-text("${body}")`); await t.tap('.ctabar .btn.soft'); await t.see(ta);
     expect((await text(t)) === body, 'text kept after preview');
     await t.tap('.bar .btn.text'); await toastSee(t, 'ерновик');
     const p = await until(async () => (await mine(t)).find(x => x.body === body && x.state === 'draft'), 'draft stored'); id = p.id;
     await t.fill(ta, body + ' ещё'); await t.tap('.bar .ibtn'); await t.see('.dialog.on'); await t.tap('.dialog.on .btn.danger'); await t.wait(800);
     expect(!t.page.url().includes('/feed/new'), 'left after discard: ' + t.page.url());
   } finally { await cleanup(t, id); }
 } },
 { name: '«Мои публикации → Черновики»: a draft card says what it holds and when it changed; ⋯ → «Удалить черновик» asks, then it is gone', persona: 'full', route: '/n/me/posts', run: async t => {
   const ids = [];
   try {
     const body = 'e2e черновик-карточка ' + stamp();
     ids.push((await t.api('post.saveDraft', { opId: t.uuid7(), post: { body } })).id);
     ids.push((await t.api('post.saveDraft', { opId: t.uuid7(), post: { poll: { question: 'Куда в субботу?', options: ['Озеро', 'Город'] } } })).id);
     await t.page.reload();
     const card = t.page.locator('.k-draft', { hasText: body }).first(); await card.waitFor({ timeout: 15000 });
     const head = await card.locator('.post-h').innerText();
     expect(head.includes('Черновик') && /Изменён (только что|\d+ (минут|секунд)|сейчас|\d+ \S+, \d\d:\d\d)/.test(head) && !head.includes('—'), 'draft head: ' + head);
     await t.see('.k-draft >> text=Черновик · опрос'); // no text: it says what it holds
     await t.shot('drafts-list');
     await card.locator('button[aria-label="Ещё"]').click(); await t.see('.sheet.on >> text=Удалить черновик');
     await t.tap('.sheet.on .li.danger'); await t.see('.dialog.on >> text=Удалить черновик?');
     await t.tap('.dialog.on .btn.danger'); await toastSee(t, 'Черновик удалён');
     await t.notSee(`.k-draft:has-text("${body}")`, 5000);
     await until(async () => !(await mine(t)).some(p => p.id === ids[0]), 'draft deleted on the server');
     ids.shift();
     // A tap on the card opens the editor with the draft.
     await t.tap('.k-draft >> text=Черновик · опрос'); await t.page.waitForURL(/\/edit/);
   } finally { for (const id of ids) await cleanup(t, id).catch(() => {}); }
 } },
 { name: 'publish plain text → back on the feed, post is there', persona: 'full', route: '/n/feed/new', run: async t => {
   let id;
   try {
     const body = 'e2e в ленту ' + stamp(); await t.see(ta); await t.fill(ta, body); await t.tap(publishBtn);
     const p = await newest(t, body); id = p.id; await t.wait(1000);
     expect(t.page.url().endsWith('/n/feed'), 'on feed: ' + t.page.url());
     await t.see(`.post:has-text("${body}"), article:has-text("${body}")`, 15000);
   } finally { await cleanup(t, id); }
 } },
 { name: '@ suggestions: typing «@ki» offers people, a pick writes «@nick »; published with it', persona: 'full', route: '/n/feed/new', run: async t => {
   let id;
   try {
     await t.see(ta); const tag = stamp(); await t.page.locator(ta).click(); await t.page.keyboard.type('e2e упоминание ' + tag + ' @ki');
     await t.see('.mention-sug button', 8000); const first = (await t.page.locator('.mention-sug button small').first().innerText()).trim();
     await t.tap('.mention-sug button >> nth=0'); await t.notSee('.mention-sug', 300);
     const v = (await t.page.locator(ta).innerText()).replace(/\u00a0/g, ' '); expect(v.trimEnd().endsWith(first), 'picked into text: ' + v);
     await t.page.keyboard.type('привет'); await t.tap(publishBtn);
     const p = await until(async () => (await mine(t)).find(x => x.body.includes(tag) && x.state !== 'draft'), 'stored'); id = p.id;
     expect(p.body.includes(first + ' привет'), 'body ' + p.body);
   } finally { await cleanup(t, id); }
 } },
 { name: 'leave guard: a typed post asks on own back, Browser Back and a tab; «Остаться» keeps the text, header shows no draft text until something is typed', persona: 'full', route: '/n/feed', run: async t => {
   // A reload gives the feed entry the router's own key, so Browser Back to it can be intercepted (as it is for a person who opened the app there).
   const open = async () => { await t.go('/n/feed'); await t.page.reload(); await t.tap('.bar [aria-label="Создать публикацию"]'); await t.tap('.sheet.on .li:has-text("Публикация")'); await t.see(ta); };
   await open();
   expect(!(await t.page.locator('.bar .btn:has-text("Сохранить черновик"), .bar .btn:has-text("В черновик")').count()), 'no draft text on a new empty post');
   const typed = async () => { await t.fill(ta, 'не потерять ' + stamp()); await t.see('.bar .btn:has-text("Сохранить черновик")'); };
   for (const via of ['back', 'browser', 'tab']) {
     if (via !== 'back') await open();
     await leaveGuard(t, { typed, kept: async () => (await text(t)).startsWith('не потерять'), via, url: '/feed/new' });
   }
   // three answers: «Сохранить черновик» / «Не сохранять» / «Остаться»
   await open(); await typed(); await t.tap('.bar .ibtn >> nth=0');
   for (const b of ['Сохранить черновик', 'Не сохранять', 'Остаться']) await t.see(`.dialog.on .btn:has-text("${b}")`);
   const body = await text(t);
   await t.tap('.dialog.on .btn.primary'); await until(async () => !t.page.url().includes('/feed/new'), 'left after saving the draft', 10000);
   const d = await until(async () => (await mine(t)).find(p => p.body === body && p.state === 'draft'), 'draft stored'); await cleanup(t, d.id);
 } },
];
