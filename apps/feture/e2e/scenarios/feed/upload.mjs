// Kit uploader in the post composer: pick → format → crop → «Готово» → photo attached → published; read back.
// A clip longer than a minute (made on the device, owner 28.10.2026): taken, starts as its first minute, the note says so.
import { sheetBelowStatusBar, expect, until, pngOf, sourceClip } from '../helpers.mjs';
// The crop frame is on all four sides and inside its box, whatever the pan or zoom (owner, 29.10.2026).
const frameOk = async (t, what) => {
  const r = await t.page.evaluate(() => { const f = document.querySelector('.k-crop-frame'), c = document.querySelector('.k-crop'); if (!f || !c) return null;
    const cs = getComputedStyle(f), fb = f.getBoundingClientRect(), cb = c.getBoundingClientRect();
    return { w: ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(cs['border' + k + 'Width'])), fb: [fb.left, fb.top, fb.right, fb.bottom], cb: [cb.left, cb.top, cb.right, cb.bottom], guides: document.querySelectorAll('.k-crop-frame .k-crop-grid i').length }; });
  expect(r, what + ': frame element'); expect(r.w.every(x => x >= 1.5), what + ': border on 4 sides ' + r.w);
  expect(r.fb[0] >= r.cb[0] - 1 && r.fb[1] >= r.cb[1] - 1 && r.fb[2] <= r.cb[2] + 1 && r.fb[3] <= r.cb[3] + 1, what + ': frame inside its box');
  expect(r.guides === 4, what + ': thirds guides'); return r;
};
const mine = async t => (await t.api('me.posts', {})).items;
export default [{ name: 'uploader: format, crop, ready, publish with a cropped 4:5 photo', persona: 'full', route: '/n/feed/new', run: async t => {
  let id;
  try {
    await t.see('.compose .rte-ed');
    const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.attach button:has-text("Фото")').click()]);
    await ch.setFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: await pngOf(t) }, { name: 'two.png', mimeType: 'image/png', buffer: await pngOf(t) }]);
    await t.see('.sheet.on .k-uprow'); await t.see('.sheet.on .k-uprow:has(.k-upthumb img)', 15000);
    expect((await t.page.locator('.sheet.on .k-uprow').count()) === 2, 'two rows');
    await sheetBelowStatusBar(t); await t.shot('up-sheet-safe-top');
    await t.page.evaluate(() => document.querySelectorAll('html, .v21').forEach(e => e.style.removeProperty('--safe-area-inset-top')));
    await t.shot('up-sheet');
    // The previews follow the format: 1:1 square, 4:5 tall, «Свой» the file's own shape (this one is square).
    const ratio = async () => { const b = await t.page.locator('.sheet.on .k-upthumb').first().boundingBox(); return b.width / b.height; };
    await t.tap('.sheet.on .seg button:has-text("1:1")'); await t.wait(800); expect(Math.abs(await ratio() - 1) < .03, '1:1 preview square');
    await t.shot('up-sheet-1x1');
    await t.tap('.sheet.on .seg button:has-text("Свой")'); await t.wait(800); expect(Math.abs(await ratio() - 1) < .03, '«Свой» follows the file');
    await t.tap('.sheet.on .seg button:has-text("4:5")'); await t.wait(800); expect(Math.abs(await ratio() - .8) < .03, '4:5 preview');
    await t.tap('.sheet.on .k-uprow >> nth=0 >> button:has-text("Кадрировать")'); await t.wait(1500); await t.see('.k-crop img');
    const b = await t.page.locator('.k-crop').boundingBox(); expect(Math.abs(b.width / b.height - .8) < .02, 'frame 4:5: ' + (b.width / b.height).toFixed(3));
    await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await t.page.mouse.down(); await t.page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 5 }); await t.page.mouse.up();
    await t.page.locator('.k-crop-zoom input').fill('1.6'); await frameOk(t, '4:5 after pan+zoom'); await sheetBelowStatusBar(t); await t.shot('up-crop');
    await t.page.evaluate(() => document.querySelectorAll('html, .v21').forEach(e => e.style.removeProperty('--safe-area-inset-top')));
    await t.tap('.sheet.on .sh-f button:has-text("Применить")'); await t.see('.sheet.on .k-uprow');
    await t.tap('.sheet.on .k-uprow >> nth=1 >> button[aria-label="Убрать"]'); expect((await t.page.locator('.sheet.on .k-uprow').count()) === 1, 'removed one');
    await t.see('.sheet.on .sh-f button:has-text("Готово · 1")', 15000); await t.tap('.sheet.on .sh-f button:has-text("Готово")');
    await t.see('.k-ptiles img', 30000); await t.notSee('.sheet.on .k-uprow', 300);
    const tile = await t.page.locator('.k-ptiles .k-ptile').first().boundingBox(); expect(Math.abs(tile.width / tile.height - .8) < .03, 'composer tile 4:5');
    const body = 'e2e кроп ' + Math.random().toString(36).slice(2, 7); await t.fill('.compose .rte-ed', body); await t.tap('.ctabar .btn.primary');
    const p = await until(async () => (await mine(t)).find(x => x.body === body && x.state !== 'draft'), 'sent'); id = p.id;
    expect(p.media.length === 1, 'media ' + p.media.length);
    const m = p.media[0]; if (m.w && m.h) expect(Math.abs(m.w / m.h - .8) < .02, 'stored photo is 4:5: ' + m.w + 'x' + m.h);
  } finally { if (id) await t.api('post.delete', { opId: t.uuid7(), postId: id }); }
}},
{ name: 'uploader: «Свой» — free crop by dragging the frame borders, frame always on all four sides', persona: 'full', route: '/n/feed/new', run: async t => {
  await t.see('.compose .rte-ed');
  const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.attach button:has-text("Фото")').click()]);
  await ch.setFiles([{ name: 'free.png', mimeType: 'image/png', buffer: await pngOf(t) }]);
  await t.see('.sheet.on .k-uprow:has(.k-upthumb img)', 15000);
  // «Свой» comes first in the format chooser.
  expect((await t.page.locator('.sheet.on .seg button').first().innerText()).trim() === 'Свой', '«Свой» is the first format');
  await t.tap('.sheet.on .seg button:has-text("Свой")'); await t.wait(800);
  const ratio = async () => { const b = await t.page.locator('.sheet.on .k-upthumb').first().boundingBox(); return b.width / b.height; };
  const r0 = await ratio();
  await t.tap('.sheet.on .k-uprow >> button:has-text("Кадрировать")'); await t.wait(1200); await t.see('.k-crop.free .k-crop-frame');
  await frameOk(t, 'free initial'); await t.see('.k-crop-h.c-e'); await t.shot('up-crop-free');
  const grab = async h => { const b = await t.page.locator('.k-crop-h.c-' + h).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  // Drag the right border left and the bottom border up: the frame gets narrower and shorter by different amounts.
  const fw = async () => { const b = await t.page.locator('.k-crop-frame').boundingBox(); return b; };
  const f0 = await fw();
  let [x, y] = await grab('e'); await t.page.mouse.move(x, y); await t.page.mouse.down(); await t.page.mouse.move(x - f0.width * .4, y, { steps: 6 }); await t.page.mouse.up();
  [x, y] = await grab('s'); await t.page.mouse.move(x, y); await t.page.mouse.down(); await t.page.mouse.move(x, y - f0.height * .1, { steps: 6 }); await t.page.mouse.up();
  const f1 = await fw(); expect(f1.width < f0.width * .7 && f1.height < f0.height && f1.height > f0.height * .8, 'frame resized by its borders: ' + [f0.width, f0.height, f1.width, f1.height].map(Math.round));
  await frameOk(t, 'free after resize');
  // A corner, then zoom and pan: the frame stays visible on all four sides.
  [x, y] = await grab('nw'); await t.page.mouse.move(x, y); await t.page.mouse.down(); await t.page.mouse.move(x + 20, y + 20, { steps: 4 }); await t.page.mouse.up();
  await t.page.locator('.k-crop-zoom input').fill('2'); await frameOk(t, 'free after zoom');
  const cb = await t.page.locator('.k-crop').boundingBox(); await t.page.mouse.move(cb.x + 4, cb.y + 4); await t.page.mouse.down(); await t.page.mouse.move(cb.x + 60, cb.y + 60, { steps: 5 }); await t.page.mouse.up();
  await frameOk(t, 'free after pan');
  await t.tap('.sheet.on .sh-f button:has-text("Применить")'); await t.see('.sheet.on .k-uprow'); await t.wait(1200);
  const r1 = await ratio(); expect(Math.abs(r1 - r0) > .15, 'output aspect changed: ' + r0.toFixed(2) + ' -> ' + r1.toFixed(2));
  await t.shot('up-free-result');
  // Reopened, the saved frame is shown again.
  await t.tap('.sheet.on .k-uprow >> button:has-text("Кадрировать")'); await t.wait(1200); await frameOk(t, 'free reopened');
  const f2 = await fw(); expect(f2.width < cb.width * .9 || f2.height < cb.height * .9, 'saved frame restored');
  await t.page.keyboard.press('Escape');
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
