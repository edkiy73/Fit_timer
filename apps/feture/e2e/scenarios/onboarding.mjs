// Sign-up step 1 → step 2 (V21 A05): «Дальше» keeps nothing on the server yet; step 2 picks topics, previews a community
// with its rules and joins it; «Готово» saves the answers, sends the join and opens the feed on the chosen topics.
// Then the city picker in the profile editor: search, a country, «Добавить свой город». Read back through the API.
import { expect, until, toastSee } from './helpers.mjs';
import { PROD, uuid7 } from '../lib.mjs';

async function documents() {
  const r = await fetch(`${PROD}/api/catalog?resource=documents&locale=ru`, { cache: 'no-store' }).then(x => x.json());
  return r.documents.filter(d => d.requiresAccept).map(d => ({ id: d.id, contentHash: d.hash }));
}

const main = [{ name: 'sign-up step 2: topics, community preview and join, feed on the topics', persona: 'new', run: async t => {
  const handle = ('qa_' + t.me.email.split('@')[0].replace(/[^a-z0-9]/g, '')).slice(0, 20);
  const made = await t.api('account.create', { opId: uuid7(), handle, birthDate: '1993-03-03', locale: 'ru', documents: await documents(), newsOptIn: false });
  expect(made.ok, 'account.create ' + JSON.stringify(made).slice(0, 200));
  const pid = made.profileId;
  // An open community the newcomer can join (any published one from the catalog).
  const cat = await t.api('community.catalog', { privacy: 'open' }, undefined, pid);
  const open = (cat.items || []).find(c => !c.joined); expect(open, 'an open community exists');
  await t.go('/n/feed');
  await t.see('Дальше'); await t.tap('.ctabar button:has-text("Дальше")');
  await t.see('Что тебе интересно?');
  const chip = t.page.locator('.chips .chip').first(); const topicText = (await chip.innerText()).trim(); await chip.click(); await t.wait(1200);
  // The suggestion list follows the topics; the community we look for may not match them — clear the topic if needed.
  if (!(await t.page.locator('.li', { hasText: open.name }).count())) { await chip.click(); await t.wait(1500); }
  if (await t.page.locator('.li', { hasText: open.name }).count()) {
    await t.page.locator('.li', { hasText: open.name }).first().locator('button:has-text("Вступить")').click(); await t.wait(800);
    await t.see('.sheet.on'); await t.tap('.sheet.on .sh-f button:has-text("Вступить")'); // without the rules ticked → error
    await t.see('.sheet.on .ferr');
    await t.tap('.sheet.on button[role="checkbox"]'); await t.tap('.sheet.on .sh-f button:has-text("Вступить")');
    await t.notSee('.sheet.on', 800); await t.see('.li button:has-text("Не вступать")');
  }
  const joining = await t.page.locator('.li button:has-text("Не вступать")').count();
  if (!(await chip.evaluate(el => el.classList.contains('on')))) { await chip.click(); await t.wait(600); }
  await t.tap('.ctabar button:has-text("Готово")');
  await toastSee(t, 'Аккаунт создан'); await t.shot('onb-landed');
  const b = await t.boot(); expect(b.account?.onboarded, 'onboarded');
  if (joining) await until(async () => ((await t.api('community.mine', {}, undefined, pid)).member || []).some(c => c.id === open.id), 'joined the community');
  if (await t.page.locator('.toast:has-text("Лента — по темам")').count()) {
    expect((await t.page.locator('.toast').innerText()).includes(topicText), 'toast names the topic');
    await t.tap('.toast button:has-text("Показать всё")');
  }
  // The card «Заверши профиль» shows in the feed when the sign-up ended there (no photo chosen now).
  if (t.page.url().includes('/n/feed')) { await t.see('Заверши профиль'); await t.tap('button:has-text("Скрыть")'); await t.notSee('Заверши профиль', 800); }
}}, { name: 'city picker: search, country, add own city', persona: 'basic', route: '/n/me/edit?only=basics', run: async t => {
  await t.see('.sel-btn'); await t.tap('.sel-btn');
  await t.fill('.sheet.on input[type="search"]', 'Тби'); await t.see('.sheet.on .li:has-text("Тбилиси")');
  await t.fill('.sheet.on input[type="search"]', 'Герман'); await t.tap('.sheet.on .li:has-text("Германия")');
  await t.see('.sheet.on .chip.on:has-text("Германия")'); await t.see('.sheet.on .li:has-text("Мюнхен")');
  const own = 'Е2е' + Math.random().toString(36).slice(2, 6);
  await t.fill('.sheet.on input[type="search"]', own); await t.tap(`.sheet.on .li:has-text("Добавить «${own}»")`);
  await t.notSee('.sheet.on', 800); await t.see(`.sel-btn:has-text("${own}")`);
  await t.tap('.ctabar .btn.primary');
  const pid = await t.pid();
  await until(async () => (await t.api('profile.get', { profileId: pid })).profile?.city?.ru === own, 'own city saved (pending)');
  const p = (await t.api('profile.get', { profileId: pid })).profile; expect(p.city.pending === true, 'pending until checked');
  // Back to no city, so the persona stays as it was.
  await t.wait(1500); await t.go('/n/me'); await t.go('/n/me/edit?only=basics'); await t.see('.sel-btn:has-text("' + own + '")'); await t.shot('city-reopen'); await t.tap('.sel-btn'); await t.tap('.sheet.on .li:has-text("Не показывать")'); await t.tap('.ctabar .btn.primary');
  await until(async () => (await t.api('profile.get', { profileId: pid })).profile?.city === null, 'city cleared');
}}];
export const editor = [{ name: 'profile editor: nickname checked in place', persona: 'basic', route: '/n/me/edit?only=basics', run: async t => {
  const nick = t.page.locator('[data-field="handle"] input'); await nick.waitFor();
  const before = await nick.inputValue();
  await nick.fill('a..b'); await t.tap('.ctabar .btn.primary'); await t.see('[data-field="handle"] .ferr');
  await nick.fill('qa_mod1'); await t.tap('.ctabar .btn.primary'); await t.see('[data-field="handle"] .ferr:has-text("занят")');
  await nick.fill(before); await t.notSee('[data-field="handle"] .ferr', 500);
}}, { name: 'profile editor: last photo in Discover asks first', persona: 'full', route: '/n/me/edit?only=media', run: async t => {
  // A full persona has exactly one approved photo and is visible in Discover.
  await t.see('.mi img'); await t.page.locator('.mi').first().click(); await t.wait(600);
  await t.tap('.sheet.on .li:has-text("Убрать из профиля")'); await t.see('Убрать последнее фото?');
  await t.tap('[role="alertdialog"] button:has-text("Отмена"), .ask button:has-text("Отмена")'); await t.see('.mi img');
}}];
export default [...main, ...editor];
