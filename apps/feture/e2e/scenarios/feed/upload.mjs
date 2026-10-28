// Kit uploader in the post composer: pick → format → crop → «Готово» → photo attached → published; read back.
// A clip longer than a minute (made on the device, owner 28.10.2026): taken, starts as its first minute, the note says so.
import { expect, until, pngOf, sourceClip } from '../helpers.mjs';
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
    // The previews follow the format: 1:1 square, 4:5 tall, «Как есть» the file's own shape (this one is square).
    const ratio = async () => { const b = await t.page.locator('.sheet.on .k-upthumb').first().boundingBox(); return b.width / b.height; };
    await t.tap('.sheet.on .seg button:has-text("1:1")'); await t.wait(800); expect(Math.abs(await ratio() - 1) < .03, '1:1 preview square');
    await t.shot('up-sheet-1x1');
    await t.tap('.sheet.on .seg button:has-text("Как есть")'); await t.wait(800); expect(Math.abs(await ratio() - 1) < .03, '«Как есть» follows the file');
    await t.tap('.sheet.on .seg button:has-text("4:5")'); await t.wait(800); expect(Math.abs(await ratio() - .8) < .03, '4:5 preview');
    await t.tap('.sheet.on .k-uprow >> nth=0 >> button:has-text("Кадрировать")'); await t.wait(1500); await t.see('.k-crop img');
    const b = await t.page.locator('.k-crop').boundingBox(); expect(Math.abs(b.width / b.height - .8) < .02, 'frame 4:5: ' + (b.width / b.height).toFixed(3));
    await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await t.page.mouse.down(); await t.page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 5 }); await t.page.mouse.up();
    await t.page.locator('.k-crop-zoom input').fill('1.6'); await t.shot('up-crop');
    await t.tap('.sheet.on .sh-f button:has-text("Применить")'); await t.see('.sheet.on .k-uprow');
    await t.tap('.sheet.on .k-uprow >> nth=1 >> button[aria-label="Убрать"]'); expect((await t.page.locator('.sheet.on .k-uprow').count()) === 1, 'removed one');
    await t.see('.sheet.on .sh-f button:has-text("Готово · 1")', 15000); await t.tap('.sheet.on .sh-f button:has-text("Готово")');
    await t.see('.edit-ph img', 30000); await t.notSee('.sheet.on .k-uprow', 300);
    const tile = await t.page.locator('.edit-ph > div').first().boundingBox(); expect(Math.abs(tile.width / tile.height - .8) < .03, 'composer tile 4:5');
    const body = 'e2e кроп ' + Math.random().toString(36).slice(2, 7); await t.fill('.compose .rte-ed', body); await t.tap('.ctabar .btn.primary');
    const p = await until(async () => (await mine(t)).find(x => x.body === body && x.state !== 'draft'), 'sent'); id = p.id;
    expect(p.media.length === 1, 'media ' + p.media.length);
    const m = p.media[0]; if (m.w && m.h) expect(Math.abs(m.w / m.h - .8) < .02, 'stored photo is 4:5: ' + m.w + 'x' + m.h);
  } finally { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }); }
}},
{ name: 'uploader: a 62 s clip is taken (sources up to 10 min) — it starts as its first minute, the note and the trim sheet say so', persona: 'full', route: '/n/feed/new', run: async t => {
  await t.see('.compose .rte-ed');
  // A small, long clip recorded in real time (a minute and two seconds).
  const src = await sourceClip(t, { w: 160, h: 90, seconds: 62, bitrate: 2e5, noise: false });
  const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.attach button').first().click()]);
  await ch.setFiles([src]);
  await t.see('.sheet.on .k-uprow:has-text("Видео · 1:00 из 1:02")', 30000);
  await t.see('.sheet.on .k-uprow .k-vbadge:has-text("1:00")');
  await t.see('.sheet.on .alert:has-text("до 10 минут")'); await t.see('.sheet.on .alert:has-text("до минуты")');
  await t.shot('up-long-clip');
  await t.tap('.sheet.on .k-upacts button:has-text("Обрезать")'); await t.see('.sheet.on .k-trim-strip');
  await t.see('.sheet.on .k-trim-meta:has-text("Длина 1:00.0")');
  // The part never grows past a minute: the end handle cannot go further while the start stays at 0.
  await t.page.locator('.k-trim-h.r').focus(); await t.page.keyboard.press('Shift+ArrowRight');
  await t.see('.sheet.on .k-trim-meta:has-text("Длина 1:00.0")');
  await t.see('.sheet.on .sh-f button:has-text("Первая минута")');
  await t.shot('up-long-trim');
  await t.page.keyboard.press('Escape');
}}];
