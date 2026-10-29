import { dropsNew } from '../helpers.mjs';
// A04 → A04X → A05 with fresh accounts (persona `new`: signed in, no FetUre account yet); each one that registers is
// deleted at the end through K07, which also covers deletion and sign-out.
const N = process.env.REG_N || String(Date.now() % 1e7);
const nick = k => `e2e${N}${k}`.slice(0, 20);
/** Sign-up step 2 (topics and communities): «Готово» with nothing picked. */
const step2 = async t => { await t.see('Что тебе интересно?', 20000); await t.tap('.ctabar >> text=Готово'); };
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const dob = async (t, d, m, y) => { const s = t.page.locator('.dob select'); await s.nth(2).selectOption(String(y)); await s.nth(1).selectOption(String(m)); await s.nth(0).selectOption(String(d)); await t.wait(200); };
const adultYear = new Date().getFullYear() - 30, kidYear = new Date().getFullYear() - 15;
/** Deletes the account through K07 «Удалить аккаунт…» and checks the V21 start screen (A01) comes back. */
const deleteViaUi = async (t, handle) => {
  await t.go('/n/settings/data'); await t.tap('text=Удалить аккаунт…');
  await t.fill('.sheet input', handle); await t.tap('.sheet .btn >> text=Удалить навсегда');
  await t.see('Создать аккаунт', 20000);
};
const toAboutYou = async (t, k, d) => {
  await t.fill('input[autocomplete=username]', nick(k)); await t.see('Ник свободен');
  await dob(t, d, d, adultYear); await t.tap('role=checkbox[name=/Принимаю/]');
  await t.tap('.ctabar >> text=Дальше'); await t.see('Расскажи о себе', 20000);
};

const scenarios = [
 { name: 'A04 empty submit marks every field; nickname rules and «taken»', persona: 'new', route: '/n/feed', run: async t => {
   await t.see('Как тебя называть'); await t.see('.ctabar >> text=Дальше');
   await t.tap('.ctabar >> text=Дальше');
   await t.see('От 3 до 20 символов'); await t.see('Укажи дату рождения полностью'); await t.see('Без согласия с условиями');
   await t.fill('input[autocomplete=username]', '_ab'); await t.see('.field.err >> text=От 3 до 20 символов', 3000);
   const used = (await t.persona('basic')).handle; // a nickname of the lane that is surely taken
   await t.fill('input[autocomplete=username]', used); await t.wait(1500);
   const taken = await t.api('nick.check', { handle: used }); if (taken.available !== false) throw new Error(used + ' should be taken');
   await t.see(taken.reason === 'reserved' ? 'Этот ник нельзя занять' : 'Этот ник уже занят');
   await t.fill('input[autocomplete=username]', nick('a')); await t.see('Ник свободен');
   await t.tap('.k-check-row .btn'); await t.see('.sheet >> text=Условия и приватность'); await t.tap('.sheet >> text=Понятно');
   await t.tap('role=checkbox[name=/Принимаю/]'); if (await t.page.locator('role=checkbox[name=/Принимаю/]').getAttribute('aria-checked') !== 'true') throw new Error('terms not checked');
   await dob(t, 1, 2, adultYear); await t.see('Тебе 30.');
 } },
 { name: 'A04→A05 happy path: chips, «Все · N» picker, visibility, discover off, save — read back, then delete (K07)', persona: 'new', route: '/n/feed', run: async t => {
   await t.fill('input[autocomplete=username]', nick('b')); await t.see('Ник свободен');
   await dob(t, 15, 6, adultYear);
   await t.tap('role=checkbox[name=/Принимаю/]'); await t.tap('role=checkbox[name=/новости/]');
   await t.tap('.ctabar >> text=Дальше');
   await t.see('Расскажи о себе', 20000); await t.see('.ctabar >> text=Дальше'); await t.see('.ctabar >> text=Заполнить позже');
   await t.page.locator('.fin .chips[role=group] .chip').first().waitFor({ timeout: 15000 });
   // Owner 28.10.2026: Discover starts off; «Показываться» asks for a photo first, «Не сейчас» keeps it off.
   await t.see('role=radio[name="Не участвовать"][checked=true]');
   await t.tap('role=radio[name="Показываться"]'); await t.see('.dialog.on >> text=Нужно фото');
   await t.tap('.dialog.on >> text=Не сейчас'); await t.see('role=radio[name="Не участвовать"][checked=true]');
   await t.tap('role=radio[name="По доступу"]'); await t.see('Увидят только те, кому ты откроешь');
   await t.tap('role=radio[name="Да, вместе"]'); await t.see('пригласишь партнёра'); await t.tap('role=radio[name="Да, вместе"]'); await t.notSee('пригласишь партнёра', 300);
   const g = t.page.locator('.chips[aria-label="Гендер"] .chip:not(.more)').first(); const gName = (await g.innerText()).trim(); await g.click();
   const more = t.page.locator('.chips[aria-label="Ориентация"] .chip.more');
   let orientPicked = null;
   if (await more.count()) {
     await more.click(); await t.see('.sheet >> text=Популярное');
     await t.fill('.sheet input[type=search]', 'zzzzqq'); await t.see('.sheet >> text=Такого варианта нет');
     await t.fill('.sheet input[type=search]', '');
     const c = t.page.locator('.sheet .chip').last(); orientPicked = (await c.innerText()).trim(); await c.click();
     await t.see('.sheet >> text=Готово · 1'); await t.tap('.sheet >> text=Сбросить'); await t.see('.sheet .sh-f >> text=Готово');
     await c.click(); await t.page.keyboard.press('Escape'); await t.wait(300);
     await t.see(`.chips[aria-label="Ориентация"] .chip.on >> text=${orientPicked}`);
   }
   const st = t.page.locator('.chips[aria-label="Статус отношений"] .chip'); if (await st.count() > 1) { await st.nth(0).click(); await st.nth(1).click();
     eq(await t.page.locator('.chips[aria-label="Статус отношений"] .chip.on').count(), 1, 'status is single choice'); }
   await t.tap('.ctabar >> text=Дальше'); await step2(t);
   await t.see('nav.dock', 20000);
   const boot = await t.boot(); if (!boot.account.onboarded) throw new Error('not onboarded');
   const me = boot.profiles.find(p => p.kind === 'person');
   const s = await t.api('settings.get', {}); eq(s.settings.newsOptIn, true, 'news opt-in saved');
   const ps = await t.api('profile.settings', {}); eq(ps.settings.discoverMode, 'off', 'discover mode');
   const pv = await t.api('profile.get', { profileId: me.id }); const opts = (await t.api('catalog.get', {})).options;
   const code = (kind, label) => opts.find(o => o.kind === kind && o.ru === label)?.code;
   eq(pv.profile.details.genders, [code('gender', gName)], 'genders saved');
   if (orientPicked) eq(pv.profile.details.orients, [code('orient', orientPicked)], 'orients saved');
   eq(pv.profile.detailsVis, 'granted', 'details visibility saved');
   await deleteViaUi(t, nick('b'));
 } },
 { name: 'A05 «Заполнить позже» finishes with nothing chosen', persona: 'new', route: '/n/feed', run: async t => {
   await toAboutYou(t, 'c', 3);
   // Known (server): session.bootstrap says onboarded as soon as the profile exists, so a reload on A05 opens the app
   // instead of A05 — not covered here until the owner decides on the onboarded_at backfill.
   await t.tap('.ctabar >> text=Заполнить позже'); await step2(t);
   await t.see('nav.dock', 20000);
   const boot = await t.boot(); if (!boot.account.onboarded) throw new Error('not onboarded');
   await deleteViaUi(t, nick('c'));
 } },
 { name: 'A04 «‹» leaves the sign-up for the start screen', persona: 'new', route: '/n/feed', run: async t => {
   await t.see('Как тебя называть'); await t.tap('header.bar button[aria-label="Назад"]'); await t.see('Создать аккаунт', 15000);
 } },
 { name: 'A04X under 18: explained, «Дата указана неверно» returns with the date cleared, a new date asks to confirm, then the account is made', persona: 'new', route: '/n/feed', allow4xx: true, run: async t => {
   await t.fill('input[autocomplete=username]', nick('e')); await t.see('Ник свободен');
   await dob(t, 1, 1, kidYear); await t.tap('role=checkbox[name=/Принимаю/]');
   await t.tap('.ctabar >> text=Дальше'); await t.see('FetUre только для взрослых');
   await t.tap('text=Дата указана неверно'); await t.see('Как тебя называть');
   eq(await t.page.locator('.dob select').nth(2).inputValue(), '', 'year cleared');
   eq(await t.page.locator('input[autocomplete=username]').inputValue(), nick('e'), 'nickname kept');
   await dob(t, 1, 1, adultYear); await t.tap('.ctabar >> text=Дальше');
   await t.see('Подтверди дату рождения'); await t.tap('.dialog >> text=Изменить'); await t.notSee('.dialog.on', 300);
   await t.tap('.ctabar >> text=Дальше'); await t.tap('.dialog >> text=Подтверждаю');
   // The under-18 date never reaches the server (nothing is kept); the confirmed adult date creates the account.
   await t.see('Расскажи о себе', 20000);
   await t.tap('.ctabar >> text=Заполнить позже'); await step2(t); await t.see('nav.dock', 20000);
   await deleteViaUi(t, nick('e'));
 } },
 { name: 'K01 «Выйти» signs out to A01; signing back in with a code returns to the app; then delete', persona: 'new', route: '/n/feed', run: async t => {
   await toAboutYou(t, 'f', 4);
   await t.tap('.ctabar >> text=Заполнить позже'); await step2(t); await t.see('nav.dock', 20000);
   await t.go('/n/settings'); await t.tap('.li.danger >> text=Выйти'); await t.tap('.dialog .btn >> text=Выйти');
   await t.see('Создать аккаунт', 15000); await t.see('У меня уже есть аккаунт');
   await t.page.route('**/api/auth', async r => { const b = JSON.parse(r.request().postData() || '{}'); if (b.action !== 'send') return r.fallback(); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
   await t.tap('У меня уже есть аккаунт'); await t.fill('input[name=email]', t.me.email); await t.tap('text=Получить код'); await t.see('Введи код');
   const c = await t.admin('user_test_code', { email: t.me.email }); await t.page.locator('.code input').first().fill(String(c.code));
   await t.see('nav.dock', 20000);
   await deleteViaUi(t, nick('f'));
 } },
];

// A run that failed before K07 still leaves nothing: the fresh account is deleted through the API.
export default dropsNew(scenarios);
