// Kit uploader in the post composer: pick → format → crop → «Готово» → photo attached → published; read back.
import { expect, until, pngOf } from '../helpers.mjs';
const mine = async t => (await t.api('me.posts', {})).items;
export default [{ name: 'uploader: format, crop, ready, publish with a cropped 4:5 photo', persona: 'full', route: '/n/feed/new', run: async t => {
  let id;
  try {
    await t.see('.compose .rte-ed');
    const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.attach button:has-text("Фото")').click()]);
    await ch.setFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: await pngOf(t) }, { name: 'two.png', mimeType: 'image/png', buffer: await pngOf(t) }]);
    await t.see('.sheet.on .k-uprow'); await t.see('.sheet.on .k-uprow:has-text("без геометки")', 15000);
    expect((await t.page.locator('.sheet.on .k-uprow').count()) === 2, 'two rows');
    await t.shot('up-sheet');
    await t.tap('.sheet.on .seg button:has-text("1:1")'); await t.wait(800); await t.tap('.sheet.on .seg button:has-text("4:5")'); await t.wait(800);
    await t.tap('.sheet.on .k-uprow >> nth=0 >> button:has-text("Кадрировать")'); await t.wait(1500); await t.see('.k-crop img');
    const b = await t.page.locator('.k-crop').boundingBox(); expect(Math.abs(b.width / b.height - .8) < .02, 'frame 4:5: ' + (b.width / b.height).toFixed(3));
    await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await t.page.mouse.down(); await t.page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 5 }); await t.page.mouse.up();
    await t.page.locator('.k-crop-zoom input').fill('1.6'); await t.shot('up-crop');
    await t.tap('.sheet.on .sh-f button:has-text("Применить")'); await t.see('.sheet.on .k-uprow');
    await t.tap('.sheet.on .k-uprow >> nth=1 >> button:has-text("Убрать")'); expect((await t.page.locator('.sheet.on .k-uprow').count()) === 1, 'removed one');
    await t.see('.sheet.on .sh-f button:has-text("Готово · 1")', 15000); await t.tap('.sheet.on .sh-f button:has-text("Готово")');
    await t.see('.edit-ph img', 30000); await t.notSee('.sheet.on .k-uprow', 300);
    const body = 'e2e кроп ' + Math.random().toString(36).slice(2, 7); await t.fill('.compose .rte-ed', body); await t.tap('.ctabar .btn.primary');
    const p = await until(async () => (await mine(t)).find(x => x.body === body && x.state !== 'draft'), 'sent'); id = p.id;
    expect(p.media.length === 1, 'media ' + p.media.length);
    const m = p.media[0]; if (m.w && m.h) expect(Math.abs(m.w / m.h - .8) < .02, 'stored photo is 4:5: ' + m.w + 'x' + m.h);
  } finally { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }); }
}}];
