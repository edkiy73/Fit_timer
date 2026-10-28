// Photo drag to reorder on «Я» (saved at once, «Отменить») and in the photo editor (saved with «Сохранить»).
import { expect, toastSee, until, pngOf , uploaderDone } from '../helpers.mjs';
const prof = async t => (await t.api('profile.get', { profileId: await t.pid() })).profile;
const ids = async t => (await prof(t)).photos.map(x => x.id);
async function dragTo(t, grid, from, to) {
  const a = await t.page.locator(`${grid} .mi`).nth(from).boundingBox(), b = await t.page.locator(`${grid} .mi`).nth(to).boundingBox();
  await t.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await t.page.mouse.down();
  await t.page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await t.wait(250);
  await t.page.mouse.move(b.x + b.width / 2 + 2, b.y + b.height / 2 + 2, { steps: 2 }); await t.page.mouse.up();
}
async function ensureTwo(t) {
  const orig = await ids(t); if (orig.length >= 2) return { orig, extra: null };
  await t.go('/n/me/edit?only=media'); await t.see('.ph-slots');
  const [chooser] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.ph-add:not(.ghost)').first().click()]);
  await chooser.setFiles({ name: 'e2e.png', mimeType: 'image/png', buffer: await pngOf(t) });
  await uploaderDone(t);
  await t.page.locator('.ph-slots .mi').nth(orig.length).waitFor({ timeout: 30000 });
  await t.tap('.ctabar button:has-text("Сохранить")');
  const now = await until(async () => { const l = await ids(t); return l.length === orig.length + 1 && l; }, 'second photo added');
  await t.go('/n/me'); return { orig: now, extra: now.find(x => !orig.includes(x)), base: orig };
}
export default [
 { name: 'Me: drag the 2nd photo onto the main one → saved; «Отменить» restores', persona: 'full', route: '/n/me', run: async t => {
   const { orig, extra, base } = await ensureTwo(t);
   try {
     await t.see('#mePh .mi'); await t.wait(2500); await t.shot('pending-photo'); await dragTo(t, '#mePh', 1, 0);
     expect(!(await t.page.locator('.sheet.on').count()), 'a drag must not open the photo sheet');
     await toastSee(t, 'Порядок фото сохранён');
     await until(async () => (await ids(t))[0] === orig[1], 'new order saved');
     await t.tap('.toast .tb'); await until(async () => JSON.stringify(await ids(t)) === JSON.stringify(orig), 'undo restored');
     await t.tap('#mePh .mi .vw >> nth=0'); await t.see('.sheet.on'); // a plain tap still opens the sheet
   } finally { const want = extra ? base : orig; if (JSON.stringify(await ids(t)) !== JSON.stringify(want)) await t.api('profile.photosSet', { opId: t.uuid7(), assetIds: want }); }
 } },
 { name: 'Editor: drag reorders the draft; «Сохранить» writes it', persona: 'full', route: '/n/me', run: async t => {
   const { orig, extra, base } = await ensureTwo(t);
   try {
     await t.go('/n/me/edit?only=media'); await t.see('.ph-slots .mi');
     await dragTo(t, '.ph-slots', 0, 1);
     expect(JSON.stringify(await ids(t)) === JSON.stringify(orig), 'not saved before «Сохранить»');
     await t.tap('.ctabar button:has-text("Сохранить")');
     await until(async () => (await ids(t))[1] === orig[0], 'order saved');
   } finally { const want = extra ? base : orig; if (JSON.stringify(await ids(t)) !== JSON.stringify(want)) await t.api('profile.photosSet', { opId: t.uuid7(), assetIds: want }); }
 } },
];
