// Owner feedback 28.10.2026 (lane `ed`): «+» in the feed bar, the WYSIWYG editor (formatting shows while typing, the
// server gets the same safe Markdown), «Кому видно» row, no «Показать в ленте», a post and an article are separate
// editors, the article's first photo is the cover and further photos sit in the text, the viewer closes on «Назад» and
// covers everything under it, «Популярное» hint on one line.
import { expect, until, pngOf, stamp, sheet, uploaderDone } from '../helpers.mjs';

const ed = '.compose .rte-ed';
const mine = async t => (await t.api('me.posts', {})).items;
const sent = async (t, mark) => until(async () => (await mine(t)).find(p => (p.body + (p.title ?? '')).includes(mark) && p.state !== 'draft'), 'post sent: ' + mark, 30000);
const drop = async (t, id) => { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }).catch(() => {}); };
/** Picks a photo through the button that opens the file picker and lets the kit uploader finish. */
const photo = async (t, open) => {
  const [ch] = await Promise.all([t.page.waitForEvent('filechooser', { timeout: 10000 }), open()]);
  await ch.setFiles({ name: 'p.png', mimeType: 'image/png', buffer: await pngOf(t) }); await uploaderDone(t);
};
/** Puts the caret at the end of the editor's text. */
const toEnd = t => t.page.locator(ed).evaluate(el => { el.focus(); const s = getSelection(); s.selectAllChildren(el); s.collapseToEnd(); });

export default [
 { name: 'feed bar «+» opens «Создать» with separate «Публикация» and «Статья»; the post editor has no «Статья»', persona: 'full', route: '/n/feed', run: async t => {
   await t.see('.bar [aria-label="Поиск"]'); const bar = t.page.locator('.bar .ibtn'); const labels = await bar.evaluateAll(b => b.map(x => x.getAttribute('aria-label')));
   const plus = labels.indexOf('Создать публикацию'), search = labels.indexOf('Поиск');
   expect(plus >= 0 && search === plus + 1, '«+» right before search: ' + labels.join(' | '));
   await t.tap('.bar [aria-label="Создать публикацию"]'); await t.see(`${sheet}:has-text("Публикация")`); await t.see(`${sheet}:has-text("Статья")`);
   await t.tap(`${sheet} .li:has-text("Статья")`); await t.see('#ntitle'); await t.see(ed);
   await t.go('/n/feed/new'); await t.see(ed);
   expect(!(await t.page.locator('#ntitle').count()), 'no title in a post'); expect(!(await t.page.locator('.attach button:has-text("Статья")').count()), 'no «Статья» in the post editor');
   expect(!(await t.page.locator('text=Показать в ленте').count()), 'no «Показать в ленте»');
   const row = t.page.locator('.selrow:has(.selt:text-is("Кому видно"))'); await row.waitFor();
   const [l, v] = await Promise.all([row.locator('.selt').boundingBox(), row.locator('.selv').boundingBox()]);
   expect(l && v && l.x < v.x, '«Кому видно» on the left, the value on the right');
 } },

 { name: 'post: bold / list / link show formatted while typing; the server stores Markdown', persona: 'full', route: '/n/feed/new', run: async t => {
   const mark = stamp(); let id;
   try {
     await t.page.locator(ed).click();
     await t.page.keyboard.type('Пост ' + mark + ' ');
     await t.page.keyboard.press('ControlOrMeta+b'); await t.page.keyboard.type('жирно'); await t.page.keyboard.press('ControlOrMeta+b');
     await t.page.keyboard.press('Enter'); await t.page.keyboard.type('- пункт один'); await t.page.keyboard.press('Enter'); await t.page.keyboard.type('пункт два');
     await t.page.keyboard.press('Enter'); await t.page.keyboard.press('Enter');
     expect((await t.page.locator(ed + ' b, ' + ed + ' strong').first().innerText()) === 'жирно', 'bold shows bold');
     expect((await t.page.locator(ed + ' ul li').count()) === 2, '«- » made a list: ' + await t.page.locator(ed).innerHTML());
     await t.tap('.rte-tb [aria-label="Ссылка"]'); await t.fill('#k-lnk-t', 'пример'); await t.fill('#k-lnk-u', 'example.com'); await t.tap(`${sheet} .sh-f button:has-text("Вставить")`);
     await t.see(ed + ' a[href="https://example.com"]');
     await t.tap('.ctabar .btn.primary');
     const p = await sent(t, mark); id = p.id;
     expect(p.body.includes('**жирно**'), 'bold in Markdown: ' + p.body);
     expect(p.body.includes('- пункт один\n- пункт два'), 'list in Markdown: ' + p.body);
     expect(p.body.includes('[пример](https://example.com)'), 'link in Markdown: ' + p.body);
     expect(!/<[a-z]/i.test(p.body), 'no HTML stored'); expect(p.inFeed === true, 'in the feed');
     await t.go('/n/feed/post/' + id); await t.see('.post .md b:has-text("жирно")'); await t.see('.post .md ul li:has-text("пункт два")');
   } finally { await drop(t, id); }
 } },

 { name: 'article: cover = first photo, a photo inserted in the text, card shows cover + title + excerpt; viewer: back closes it, nothing on top', persona: 'full', route: '/n/feed/new?x=note', viewport: { width: 360, height: 780 }, run: async t => {
   const mark = stamp(); let id;
   try {
     await t.fill('#ntitle', 'Статья ' + mark);
     await photo(t, () => t.page.locator('.cmp-media [aria-label="Добавить обложку"]').click());
     await t.see('.cmp-media .edit-ph img');
     await t.page.locator(ed).click(); await t.page.keyboard.type('Первый абзац статьи ' + mark + ', он достаточно длинный.');
     await photo(t, () => t.page.locator('.rte-tb [aria-label="Фото в текст"]').click());
     await t.see(ed + ' figure.rte-img img');
     await toEnd(t); await t.page.keyboard.type('Текст после фото.');
     await t.tap('.ctabar .btn.primary');
     const p = await sent(t, mark); id = p.id;
     const ids = p.media.map(m => m.id);
     expect(p.type === 'note' && p.title === 'Статья ' + mark, 'note: ' + p.type + ' ' + p.title);
     expect(ids.length === 2, 'cover + one inline: ' + ids.length);
     expect(p.body.includes(`![](media:${ids[1]})`) && !p.body.includes(`media:${ids[0]}`), 'the second photo in the text, the first is the cover: ' + p.body);
     expect(p.body.indexOf('Первый абзац') < p.body.indexOf('![](media:') && p.body.indexOf('![](media:') < p.body.indexOf('Текст после фото'), 'photo where the caret was');
     // The article screen (own post, even in review): cover on top, the photo in the text.
     await until(async () => (await t.api('post.get', { postId: id })).post?.media?.every(m => m.src), 'photo copies ready', 120000);
     await t.go('/n/feed/post/' + id); await t.see('.note-card.full .note-hero img'); await t.see('.note-card.full .md-img img');
     await t.see(`.note-card.full .note-hero .note-t:has-text("Статья ${mark}")`);
     // The viewer from a photo in the text: above the bars, the input bar and the toasts; «Назад» closes it, the screen stays.
     const url = t.page.url();
     await t.tap('.md-img button'); await t.see('.viewer.on');
     const top = await t.page.evaluate(() => [[180, 10], [180, 390], [180, 770], [20, 770], [340, 770]].every(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.viewer')));
     expect(top, 'nothing of the screen over the viewer');
     await t.page.goBack(); await t.notSee('.viewer', 3000); expect(t.page.url() === url, 'still on the article: ' + t.page.url());
     await t.see('.note-card.full');
     // ✕ closes without leaving a history entry behind: «Назад» then leaves the article.
     await t.tap('.md-img button'); await t.see('.viewer.on'); await t.tap('.viewer .vw-top [aria-label]'); await t.notSee('.viewer', 3000);
     expect(t.page.url() === url, 'still on the article after ✕');
     // The card in a list: cover + title + excerpt («Мои публикации» shows own posts in any state).
     await t.go('/n/me/posts');
     const card = t.page.locator('.note-card', { hasText: 'Статья ' + mark }).first(); await card.waitFor({ timeout: 20000 });
     await card.locator('.note-hero img').waitFor({ timeout: 15000 }); expect(await card.locator('.note-hero img').count() === 1, 'one cover on the card');
     expect(!(await card.locator('.note-hero .plate').count()), 'a photo cover, not the plate');
     expect((await card.locator('.note-hero .note-t').innerText()).includes('Статья ' + mark), 'the title is on the cover');
     expect((await card.locator('.note-x').innerText()).includes('Первый абзац'), 'excerpt on the card');
     expect(!(await card.locator('.md-img').count()), 'no photo of the text on the card');
   } finally { await drop(t, id); }
 } },

 { name: 'article without photos: the cover is its plate, the title large on it in white over the scrim, the same plate on the card and the page; always 16:9 at 360 px', persona: 'full', route: '/n/feed/new?x=note', viewport: { width: 360, height: 780 }, run: async t => {
   const mark = stamp(); let id;
   try {
     await t.fill('#ntitle', 'Статья без фото и с длинным заголовком о том, как говорить о границах ' + mark);
     await t.page.locator(ed).click(); await t.page.keyboard.type('Первый абзац статьи ' + mark + ', без единой картинки, но с обложкой.');
     await t.tap('.ctabar .btn.primary');
     const p = await sent(t, mark); id = p.id;
     expect(p.type === 'note' && !p.media.length, 'an article without media: ' + p.type + ' ' + p.media.length);
     /** The plate's colours and the title's look on one card. */
     const look = async loc => {
       await loc.locator('.note-hero .plate').waitFor({ timeout: 20000 });
       return loc.evaluate(el => { const pl = el.querySelector('.note-hero .plate'), tt = el.querySelector('.note-hero .note-t'), hero = el.querySelector('.note-hero');
         const s = getComputedStyle(tt), b = tt.getBoundingClientRect(), h = hero.getBoundingClientRect();
         return { plate: pl.getAttribute('style'), color: s.color, size: parseFloat(s.fontSize), text: tt.textContent, inside: b.top >= h.top - 1 && b.bottom <= h.bottom + 1, img: !!hero.querySelector('img'),
           ratio: h.width / h.height, lines: Math.round((b.height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) / parseFloat(s.lineHeight)) }; });
     };
     await t.go('/n/me/posts');
     const card = t.page.locator('.note-card', { hasText: mark }).first(); await card.waitFor({ timeout: 20000 });
     const a = await look(card);
     expect(!a.img && a.plate && a.plate.includes('--p1'), 'the plate is the cover: ' + JSON.stringify(a));
     expect(a.text.includes('Статья без фото') && a.inside, 'the title sits on the cover: ' + JSON.stringify(a));
     expect(a.color === 'rgb(255, 255, 255)' && a.size >= 22, 'large white title: ' + a.color + ' ' + a.size);
     // Always 16:9 (owner 28.10.2026); a long title still fits the box at 360 px (at most 3 lines).
     expect(Math.abs(a.ratio - 16 / 9) < 0.02 && a.lines <= 3, '16:9 and the title fits in 3 lines: ' + JSON.stringify(a));
     await t.shot('article-plate-card');
     await t.go('/n/feed/post/' + id);
     const b = await look(t.page.locator('.note-card.full'));
     expect(b.plate === a.plate, 'the same plate on the page as on the card: ' + b.plate + ' vs ' + a.plate);
     expect(b.size > a.size, 'larger title on the article page: ' + b.size + ' vs ' + a.size);
     expect(Math.abs(b.ratio - 16 / 9) < 0.02 && b.inside && b.lines <= 3, '16:9 on the page too, the title fits in 3 lines: ' + JSON.stringify(b));
   } finally { await drop(t, id); }
 } },

 { name: '«Популярное»: the hint and «Как подбираем» are one line at 360 px', persona: 'full', route: '/n/feed', viewport: { width: 360, height: 780 }, run: async t => {
   await t.tap('.seg button:has-text("Популярное")');
   const line = t.page.locator('.act-line'); await line.waitFor({ timeout: 15000 });
   const [p, a] = await Promise.all([line.boundingBox(), line.locator('button').boundingBox()]);
   const fs = await line.evaluate(el => [getComputedStyle(el).fontSize, getComputedStyle(el.querySelector('button')).fontSize]);
   expect(p.height < 26 && Math.abs(a.y - p.y) < 6, 'one line: ' + JSON.stringify({ p, a }));
   expect(fs[0] === fs[1], 'same size: ' + fs);
   expect(!(await line.locator('span').evaluate(el => el.scrollWidth > el.clientWidth)), 'the hint fits without «…»');
 } },
];
