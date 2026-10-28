// Wave 7 on the people screens: Discover filter «Рядом» (share an approximate place on tap, radius, «Закрыть без
// сохранения?»), «Отменить» after taking a like back, the first like from a profile with my dating off (R04 sheet), the
// follower menu («Убрать из подписчиков» → «Вернуть») and «Отменить» after following back.
// Actors: `full` looks, `mate` is the other person; `basic` (dating off) sends the R04 like.
import { expect, until, toastSee } from '../helpers.mjs';

const sheet = '.sheet.on', dialog = '.dialog.on';

export default [
 { name: 'D04 «Где искать» → «Рядом»: place on tap (rounded), radius, ask before closing, saved', persona: 'full', route: '/n/people', allow4xx: true, run: async t => {
   const before = (await t.api('discover.filter', {})).filter;
   try {
     await t.page.context().grantPermissions(['geolocation'], { origin: new URL(t.page.url()).origin });
     await t.page.context().setGeolocation({ latitude: 52.5213, longitude: 13.4127 });
     const open = t.page.locator('.bar button[aria-haspopup="dialog"]').last();
     await open.waitFor({ timeout: 30000 }); await until(async () => !(await open.isDisabled()), 'filter button enabled');
     await open.click(); await t.see(sheet + ' [role="radiogroup"]');
     await t.tap(sheet + ' [role="radio"]:has-text("Рядом")');
     await t.see(sheet + ':has-text("Только примерная область около 5 км")');
     // Whether a place is shared already is read when the sheet opens: wait for that answer (the share button or the
     // radius) instead of looking once — a look before it came skipped the click and the radius never showed.
     const share = t.page.locator(sheet + ' button:has-text("Определить примерное место")');
     const radius = t.page.locator(sheet + ' input[type="range"][aria-label="Радиус"]');
     await share.or(radius).first().waitFor({ timeout: 30000 });
     if (await share.count()) await share.click();
     await radius.waitFor({ timeout: 30000 });
     const loc = await until(async () => (await t.api('location.get', {})).location, 'location stored');
     expect(Math.abs(loc.lat - 52.5) < 1e-9 && Math.abs(loc.lon - 13.4) < 1e-9, 'rounded to the 0.05° grid: ' + JSON.stringify(loc));
     await t.page.locator(sheet + ' input[type="range"][aria-label="Радиус"]').fill('50'); await t.wait(300);
     await t.see(sheet + ':has-text("до 50 км")');
     // A changed draft: Esc asks; «Остаться» keeps the sheet and the draft.
     await t.page.keyboard.press('Escape'); await t.see(dialog + ':has-text("Закрыть без сохранения?")');
     await t.tap(dialog + ' button:has-text("Остаться")'); await t.see(sheet + ':has-text("до 50 км")');
     await t.tap(sheet + ' .sh-f .btn'); await t.notSee(sheet, 1500);
     const f = await until(async () => { const x = (await t.api('discover.filter', {})).filter; return x.placeMode === 'nearby' && x; }, 'filter saved as nearby');
     expect(f.radiusKm === 50, 'radius 50: ' + f.radiusKm);
   } finally {
     await t.api('discover.setFilter', { opId: t.uuid7(), filter: { ...before, placeMode: 'city' } });
     await t.api('location.clear', { opId: t.uuid7() });
   }
 } },
 { name: 'D06 «Твои»: take a like back → «Отменить» sends it again', persona: 'full', run: async t => {
   const mate = await t.persona('mate');
   const matched = (await t.api('matches.list', {})).items?.some(m => m.profile.id === mate.personId);
   if (matched) { console.log('   (full and mate matched — skipped)'); return; }
   await t.api('like.send', { opId: t.uuid7(), profileId: mate.personId, source: 'profile' });
   try {
     await t.go('/n/people?sub=likes');
     await t.tap('.view [role="tab"]:has-text("Твои")');
     const row = t.page.locator('.card.list .li', { hasText: mate.handle }).first();
     await row.waitFor({ timeout: 30000 });
     await row.locator('button[aria-label="Снять симпатию"]').click();
     await toastSee(t, 'Симпатия снята');
     await until(async () => !(await t.api('likes.outgoing', {})).items.some(l => l.profile.id === mate.personId), 'withdrawn on the server');
     await t.tap('.toast button:has-text("Отменить")');
     await until(async () => (await t.api('likes.outgoing', {})).items.some(l => l.profile.id === mate.personId), 'sent again after «Отменить»');
   } finally { await t.api('like.withdraw', { opId: t.uuid7(), profileId: mate.personId }); }
 } },
 { name: 'R04 dating off: the first like from a profile explains first, «Отправить симпатию» sends it', persona: 'basic', run: async t => {
   const mate = await t.persona('mate');
   expect((await t.api('profile.settings', {})).settings.discoverMode === 'off', 'basic has dating off');
   await t.api('like.withdraw', { opId: t.uuid7(), profileId: mate.personId });
   try {
     await t.go('/n/people/' + mate.personId);
     await t.see('.p-acts .btn:has-text("Нравится")'); await t.wait(2000); // own settings load first
     await t.tap('.p-acts .btn:has-text("Нравится")');
     await t.see(sheet + ':has-text("Симпатия при выключенных знакомствах")');
     await t.see(sheet + ':has-text("Твоя анкета в подборке не появится")');
     await t.tap(sheet + ' .sh-f .btn:has-text("Отправить симпатию")');
     await until(async () => (await t.api('likes.outgoing', {})).items.some(l => l.profile.id === mate.personId), 'like stored');
     await t.see('.p-acts .btn:has-text("Отправлено")');
   } finally { await t.api('like.withdraw', { opId: t.uuid7(), profileId: mate.personId }); }
 } },
 { name: 'P10 follower menu: «Убрать из подписчиков» → «Вернуть»; follow back → «Отменить»', persona: 'full', run: async t => {
   const mate = await t.persona('mate');
   await t.api('follow.set', { opId: t.uuid7(), profileId: t.me.personId, on: true }, mate.email);
   await t.api('follow.set', { opId: t.uuid7(), profileId: mate.personId, on: false });
   const followers = async () => (await t.api('profile.followers', { profileId: t.me.personId })).items.map(x => x.id);
   const following = async () => (await t.api('profile.followers', { profileId: t.me.personId, following: true })).items.map(x => x.id);
   await t.go('/n/me/follows?tab=followers');
   const row = () => t.page.locator('.card.list .li', { hasText: mate.handle }).first();
   await row().waitFor({ timeout: 30000 });
   await row().locator('button[aria-label^="Действия с подписчиком"]').click();
   await t.see(sheet + ':has-text("Убрать из подписчиков")');
   await t.tap(sheet + ' .li:has-text("Убрать из подписчиков")');
   await toastSee(t, 'больше не в подписчиках');
   await until(async () => !(await followers()).includes(mate.personId), 'removed on the server');
   await t.tap('.toast button:has-text("Вернуть")');
   await until(async () => (await followers()).includes(mate.personId), 'restored by «Вернуть»');
   await t.go('/n/me/follows?tab=followers');
   await row().waitFor({ timeout: 30000 });
   await row().locator('.btn:has-text("Подписаться в ответ")').click();
   await until(async () => (await following()).includes(mate.personId), 'followed back');
   await t.tap('.toast button:has-text("Отменить")');
   await until(async () => !(await following()).includes(mate.personId), '«Отменить» unfollows again');
 } },
];
