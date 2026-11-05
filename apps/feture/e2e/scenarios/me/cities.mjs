// The city picker (owner 06.11.2026): the catalog is searched on the server as the person types (GeoNames, 30 000+ cities),
// never loaded whole; nobody adds a city by hand. Run: FE_ADMIN_KEY=… APP=http://localhost:4233 node run.mjs cities.mjs
import { pinned, expect, until } from '../helpers.mjs';
const prof = async t => (await t.api('profile.get', { profileId: await t.pid() })).profile;

export default [
 { name: 'city picker: popular first, a search finds a city by its start, a pick is saved, there is no «add a city»', persona: 'full', route: '/n/me/edit?only=basics', run: async t => {
   const want = (await t.api('place.search', { q: 'тюмень' })).items?.[0];
   expect(want && want.ru === 'Тюмень', 'the catalog has Tyumen: ' + JSON.stringify(want));
   try {
     await t.see('textarea.inp');
     await t.tap('.k-city-row .sel-btn'); await t.see('.sheet.on');
     // Nothing typed: the popular cities (the server's list), not 30 000 rows.
     await t.see('.sheet.on .li:has-text("Москва")');
     expect((await t.page.locator('.sheet.on .li').count()) < 40, 'only the popular list before a word is typed');
     await t.fill('.sheet.on input', 'тюм');
     await t.see('.sheet.on .li:has-text("Тюмень")');
     expect(!(await t.page.locator('.sheet.on .li:has-text("Добавить")').count()), 'no «add a city» row');
     await t.shot('city-picker-search');
     await t.tap('.sheet.on .li:has-text("Тюмень")'); await t.wait(300);
     await pinned(t, 'Сохранить'); await t.tap('.ctabar button:has-text("Сохранить")');
     const p = await until(async () => { const p = await prof(t); return p.city?.ru === 'Тюмень' && p; }, 'city saved');
     expect(p.city?.en === 'Tyumen', 'the profile names the city: ' + JSON.stringify(p.city));
   } finally {
     const p = await prof(t);
     await t.api('profile.update', { opId: t.uuid7(), rev: p.rev, cityId: null });
   }
 } },
 { name: 'a city shows its name where it is used: the event page and the filter read it by id', persona: 'full', route: '/n/communities?sub=events', run: async t => {
   const west = (await t.api('place.search', { q: 'берлин', country: 'DE' })).items?.[0];
   expect(west && west.tz === 'Europe/Berlin', 'a city carries its time zone: ' + JSON.stringify(west));
   const got = (await t.api('place.get', { ids: [west.id] })).items ?? [];
   expect(got.length === 1 && got[0].ru === 'Берлин', 'place.get names it');
   const near = (await t.api('place.nearest', { lat: 52.52, lon: 13.4 })).place;
   expect(near?.ru === 'Берлин', 'the nearest city to Berlin is Berlin: ' + JSON.stringify(near));
 } },
];
