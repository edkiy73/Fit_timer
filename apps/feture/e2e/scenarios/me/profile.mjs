// «Я» X01 + profile editor P02 + photos + visibility + «Моё». Run: FE_ADMIN_KEY=1234 APP=http://localhost:4233 node run.mjs profile.mjs
// «Нужно решить» on «Я» shows while something waits: `asker` (a full person of the lane) asks for the private part,
// and the request is cancelled at the end.
import { pinned, expect, pngOf, toastSee, pick, until, uploaderDone, askAccess, cancelAsk, FIXTURES } from '../helpers.mjs';
const prof = async t => (await t.api('profile.get', { profileId: await t.pid() })).profile;

export default [
 { name: 'X01 header: bell, how-seen, settings, Нужно решить', persona: 'full', route: '/n/me', run: async t => {
   const a = await askAccess(t, t.me.personId);
   try { await t.page.reload();
   await t.see('.me18-seg'); await t.see('#mePh');
   await t.tap('button[aria-label="Как видят"]'); await t.wait(800); expect(t.page.url().includes('/n/me/preview'), 'eye → preview: ' + t.page.url());
   await t.go('/n/me'); await t.tap('.me18-h button[aria-label^="Настройки"]'); await t.wait(800); expect(t.page.url().includes('/n/settings'), 'settings: ' + t.page.url());
   await t.go('/n/me'); await t.see('.me-todo'); await t.tap('.me-todo'); await t.wait(800); expect(t.page.url().includes('/n/inbox'), 'todo → inbox: ' + t.page.url());
   await t.go('/n/me'); await t.see('#mePh'); await t.page.locator('.me18-h .ibtn').first().click(); await t.wait(800); expect(t.page.url().includes('/n/inbox'), 'bell → inbox: ' + t.page.url());
   } finally {
     await cancelAsk(t, a);
   }
 } },
 { name: 'X01 tabs switch, keep ?layer, and a ?layer link while «Я» is open', persona: 'full', route: '/n/me', run: async t => {
   for (const [tab, layer, sel] of [['Приватное', 'priv', '#privHead'], ['Видимость', 'vis', 'select[aria-label="Режим"]'], ['Моё', 'mine', '.li:has-text("Сохранённое")'], ['Профиль', null, '#mePh']]) {
     await t.tap(`.me18-seg button:has-text("${tab}")`); await t.see(sel);
     expect(layer ? t.page.url().includes('layer=' + layer) : !t.page.url().includes('layer='), 'url for ' + tab + ': ' + t.page.url());
   }
   await t.go('/n/me?layer=vis'); await t.see('select[aria-label="Кто видит «Данные»"]');
 } },
 { name: 'P02 basics: bio, show age, city → Сохранить pinned → persisted', persona: 'full', route: '/n/me', run: async t => {
   const bio = 'e2e bio ' + Date.now().toString(36);
   try {
     await t.see('#mePh'); await t.page.locator('#meBasics button.blk-btn').click(); await t.see('textarea.inp');
     await pinned(t, 'Сохранить');
     expect(await t.page.locator('.ctabar button:has-text("Сохранить")').isDisabled(), 'save disabled while clean');
     await t.fill('textarea.inp', bio);
     await t.tap('button[role="switch"]:has-text("Показывать возраст")');
     await t.tap('button.sel-btn'); await t.see('.sheet.on'); await t.tap('.sheet.on .li >> nth=1'); await t.wait(300);
     await pinned(t, 'Сохранить'); await t.tap('.ctabar button:has-text("Сохранить")');
     await t.see('#mePh'); await t.see(bio);
     const p = await until(async () => { const p = await prof(t); return p.bio === bio && p; }, 'bio saved');
     expect(p.showAge === false, 'showAge off'); expect(!!p.cityId || !!p.city, 'city set');
   } finally {
     const p = await prof(t);
     const r = await t.api('profile.update', { opId: t.uuid7(), rev: p.rev, bio: '', showAge: true, cityId: null }); expect(r.ok, 'restore ' + JSON.stringify(r));
   }
 } },
 { name: 'P02 basics: empty name is refused in plain words', persona: 'full', route: '/n/me/edit?only=basics', allow4xx: true, run: async t => {
   await t.see('.field'); await t.fill('.field:has-text("Имя") input', '');
   await t.tap('.ctabar button:has-text("Сохранить")'); await t.wait(2000);
   if (!t.page.url().includes('/edit')) throw new Error('empty name was accepted');
   // Kit validation layer: the error shows under the field (before #validation it came back from the server as an alert).
   const err = await t.page.locator('.field.err .ferr, .alert.err').first().textContent({ timeout: 10000 });
   expect(!/invalid_input|undefined|\berror\b/i.test(err), 'plain words: ' + err);
 } },
 { name: 'P02 nickname: bad format refused', persona: 'full', route: '/n/me/edit?only=basics', allow4xx: true, run: async t => {
   await t.fill('.field:has-text("Ник") input', 'a!'); await t.tap('.ctabar button:has-text("Сохранить")'); await t.wait(1500);
   await t.see('[data-field="handle"] .ferr, .alert.err'); expect(t.page.url().includes('/edit'), 'stays on editor'); // checked in place since #1374
 } },
 { name: 'P02 details: role chip → Сохранить → persisted', persona: 'full', route: '/n/me', run: async t => {
   const before = (await prof(t)).details;
   try {
     await t.see('#mePh'); await t.page.locator('#meDet button.blk-btn, #meDet .ph-empty').first().click(); await t.see('.chips[aria-label="Роль"]');
     await pinned(t, 'Сохранить');
     const chip = t.page.locator('.chips[aria-label="Роль"] .chip:not(.on)').first(); const label = (await chip.textContent()).trim(); await chip.click(); await t.wait(200);
     await t.tap('.ctabar button:has-text("Сохранить")'); await t.see('#mePh'); await t.see(label);
     await until(async () => (await prof(t)).details.roles?.length === (before.roles?.length || 0) + 1, 'roles saved');
   } finally {
     const p = await prof(t);
     await t.api('profile.update', { opId: t.uuid7(), rev: p.rev, roles: before.roles ?? [] });
   }
 } },
 { name: 'P02 cancel: back without saving changes nothing', persona: 'full', route: '/n/me', run: async t => {
   const p0 = await prof(t);
   await t.see('#mePh'); await t.page.locator('#meBasics button.blk-btn').click(); await t.see('textarea.inp');
   await t.fill('textarea.inp', 'should not be saved'); await t.tap('.bar button[aria-label="Назад"]'); await t.see('#mePh');
   expect((await prof(t)).bio === p0.bio, 'bio unchanged');
 } },
 { name: 'P02 editor opened by link: Сохранить returns to «Я», not out of the app', persona: 'full', route: '/n/me/edit?only=basics', run: async t => {
   const p0 = await prof(t);
   try {
     await t.fill('textarea.inp', 'e2e link ' + Date.now().toString(36)); await t.tap('.ctabar button:has-text("Сохранить")');
     await t.see('#mePh'); expect(t.page.url().includes('/n/me'), t.page.url());
   } finally { const p = await prof(t); await t.api('profile.update', { opId: t.uuid7(), rev: p.rev, bio: p0.bio }); }
 } },
 { name: 'Photos: upload in editor, make main, delete on «Я» — order persisted and restored', persona: 'full', route: '/n/me', run: async t => {
   const orig = (await prof(t)).photos.map(x => x.id);
   try {
     await t.go('/n/me/edit?only=media'); await pinned(t, 'Сохранить');
     const [chooser] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.locator('.ph-add:not(.ghost)').first().click()]);
     await chooser.setFiles({ name: 'e2e.png', mimeType: 'image/png', buffer: await pngOf(t) });
     await uploaderDone(t);
     await t.page.locator('.ph-slots .mi').nth(orig.length).waitFor({ timeout: 30000 });
     await t.tap('.ctabar button:has-text("Сохранить")'); await t.see('#mePh');
     let p = await until(async () => { const p = await prof(t); return p.photos.length === orig.length + 1 && p; }, 'photo added');
     const added = p.photos.map(x => x.id).find(x => !orig.includes(x));
     await t.go('/n/me/edit?only=media'); await t.page.locator('.ph-slots .mi .vw').nth(orig.length).click(); await t.see('Сделать главным');
     await t.tap('.sheet.on button:has-text("Сделать главным")'); await t.tap('.ctabar button:has-text("Сохранить")');
     await until(async () => (await prof(t)).photos[0]?.id === added, 'new photo is main');
     await t.go('/n/me'); await t.page.locator('#mePh .mi .vw').first().click(); await t.see('.sheet.on .li.danger');
     await t.tap('.sheet.on .li.danger'); await toastSee(t, '');
     await until(async () => JSON.stringify((await prof(t)).photos.map(x => x.id)) === JSON.stringify(orig), 'back to original');
   } finally {
     const p = await prof(t);
     if (JSON.stringify(p.photos.map(x => x.id)) !== JSON.stringify(orig)) await t.api('profile.photosSet', { opId: t.uuid7(), assetIds: orig });
   }
 } },
 { name: 'Visibility: Discover mode, details audience, likes toggle persisted', persona: 'full', route: '/n/me?layer=vis', run: async t => {
   try {
     await t.see('select[aria-label="Режим"]');
     await pick(t, 'Кто видит «Данные»', 'По доступу');
     await until(async () => (await prof(t)).detailsVis === 'granted', 'detailsVis granted');
     const opts = await t.page.locator('select[aria-label="Режим"] option').allTextContents(); await pick(t, 'Режим', opts[1]);
     await until(async () => (await t.api('profile.settings', {})).settings.discoverMode === 'hidden', 'discover hidden');
     await t.tap('button[role="switch"]:has-text("Принимать симпатии")');
     await until(async () => (await t.api('profile.settings', {})).settings.acceptProfileLikes === false, 'likes off');
   } finally {
     const p = await prof(t);
     await t.api('profile.update', { opId: t.uuid7(), rev: p.rev, detailsVis: 'all' });
     await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'discoverMode', value: 'visible' });
     await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'acceptProfileLikes', value: true });
   }
 } },
 { name: 'Visibility (owner 28.10.2026): «Показываюсь» without a photo asks for one; the photo goes to review, then Discover is on', persona: 'basic', route: '/n/me?layer=vis', run: async t => {
   const before = (await t.api('profile.settings', {})).settings.discoverMode;
   const orig = (await prof(t)).photos.map(x => x.id);
   try {
     await t.see('select[aria-label="Режим"]');
     await t.notSee('.li:has-text("С фото ты появишься")', 300); // the «Добавить фото» row is gone
     await t.page.locator('select[aria-label="Режим"]').selectOption({ label: 'Показываюсь' });
     await t.see('.dialog.on:has-text("Нужно фото")');
     await t.tap('.dialog.on button:has-text("Не сейчас")'); await t.notSee('.dialog.on', 600);
     expect((await t.api('profile.settings', {})).settings.discoverMode === before, 'not switched on without a photo');
     await t.page.locator('select[aria-label="Режим"]').selectOption({ label: 'Показываюсь' });
     const fc = t.page.waitForEvent('filechooser', { timeout: 8000 });
     await t.tap('.dialog.on button:has-text("Загрузить фото")');
     await (await fc).setFiles(FIXTURES + 'photo.jpg');
     await uploaderDone(t);
     await toastSee(t, 'Фото на проверке');
     await until(async () => (await t.api('profile.settings', {})).settings.discoverMode === 'visible', 'discover on after the photo');
     expect((await prof(t)).photos.length === orig.length + 1, 'photo added to the profile');
   } finally {
     await t.api('profile.photosSet', { opId: t.uuid7(), assetIds: orig });
     await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'discoverMode', value: before });
   }
 } },
 { name: 'Моё: every row opens its screen', persona: 'full', route: '/n/me?layer=mine', allow4xx: true, run: async t => {
   for (const [row, path] of [['Публикации и статьи', '/n/me/posts'], ['Мои события', '/n/me/events'], ['Подписчики и подписки', '/n/me/follows'], ['Сохранённое', '/n/me/saved'], ['Мне открыли', '/n/me/shared'], ['Создать пару', '/n/me/pair']]) {
     await t.go('/n/me?layer=mine'); await t.tap(`.li:has-text("${row}")`); await t.wait(1500);
     expect(t.page.url().includes(path), row + ' → ' + t.page.url());
     expect(!(await t.page.locator('.empty[role="alert"]').count()), row + ' shows an error');
   }
 } },
];
