// Photos through the kit uploader everywhere: profile photos (4:5 only) and a community cover (16:9).
import { expect, until, pngOf } from '../helpers.mjs';
const photos = async t => (await t.api('profile.get', { profileId: t.me.personId })).profile.photos;
export default [
 { name: 'profile photos: uploader offers only 4:5, «Готово», «Сохранить» → two more photos on the profile', persona: 'basic', route: '/n/me/edit?only=media', run: async t => {
   const before = (await photos(t)).map(p => p.id);
   try {
     await t.see('.ph-slots');
     const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.ph-add:not(.ghost)').first().click()]);
     await ch.setFiles([{ name: 'a.png', mimeType: 'image/png', buffer: await pngOf(t) }, { name: 'b.png', mimeType: 'image/png', buffer: await pngOf(t) }]);
     await t.see('.sheet.on .k-uprow:has-text("без геометки")', 20000);
     expect(!(await t.page.locator('.sheet.on .seg').count()), 'profile photos must not offer other formats');
     await t.tap('.sheet.on .k-uprow >> nth=0 >> button:has-text("Кадрировать")'); await t.see('.k-crop img');
     const b = await t.page.locator('.k-crop').boundingBox(); expect(Math.abs(b.width / b.height - .8) < .02, 'crop frame 4:5');
     await t.tap('.sheet.on .sh-f button:has-text("Применить")');
     await t.see('.sheet.on .sh-f button:has-text("Готово · 2")', 20000); await t.tap('.sheet.on .sh-f button:has-text("Готово")');
     await t.page.locator('.sheet.on .k-uprow').first().waitFor({ state: 'detached', timeout: 60000 });
     await t.wait(800);
     await t.tap('.ctabar button:has-text("Сохранить")');
     const after = await until(async () => { const l = await photos(t); return l.length === before.length + 2 && l; }, 'two photos saved', 40000);
     expect(after.length === before.length + 2, 'count');
   } finally { await t.api('profile.photosSet', { opId: t.uuid7(), assetIds: before }); }
 } },
 { name: 'community cover: uploader is 16:9, one photo, preview in the form', persona: 'basic', route: '/n/communities/new', run: async t => {
   await t.see('button:has-text("16:9")');
   const [ch] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('button:has-text("16:9")').first().click()]);
   await ch.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: await pngOf(t) });
   await t.see('.sheet.on .k-uprow:has-text("без геометки")', 20000);
   expect(!(await t.page.locator('.sheet.on button:has-text("Добавить ещё")').count()), 'one cover only');
   await t.tap('.sheet.on .k-uprow >> nth=0 >> button:has-text("Кадрировать")'); await t.see('.k-crop img');
   const b = await t.page.locator('.k-crop').boundingBox(); expect(Math.abs(b.width / b.height - 16 / 9) < .03, 'crop frame 16:9: ' + (b.width / b.height).toFixed(2));
   await t.tap('.sheet.on .sh-f button:has-text("Применить")'); await t.tap('.sheet.on .sh-f button:has-text("Готово")');
   await t.see('.evcov img', 30000);
 } },
];
