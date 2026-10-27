// K01 settings, K05 notifications, K06 sign-in, K07 data — every switch and select is read back through the API.
const settings = async t => (await t.api('settings.get', {})).settings;
const notif = async t => (await t.api('notifications.settings.get', {})).settings;
const sel = (t, label) => t.page.locator(`select[aria-label="${label}"]`).first();
const norm = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x);
const eq = (a, b, what) => { if (norm(a) !== norm(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 600)); } } throw last; };
const noDialog = async t => { await t.wait(400); if (await t.page.locator('.sheet.on, .dialog.on').count()) throw new Error('layer still open'); };

export default [
 { name: 'K01 loads every row, no error, no skeleton left', persona: 'full', route: '/n/settings', run: async t => {
   for (const s of ['Вход и безопасность', 'Проверка возраста', 'Фото-верификация', 'Premium', 'Язык', 'Тема оформления', 'Уведомления', 'Размывать', 'Скрытое в ленте', 'Заблокированные', 'Мои данные', 'Помощь и безопасность', 'Выйти']) await t.see(s);
   await t.see('.li >> text=подтверждено');
   await t.notSee('Не получилось', 500);
 } },
 { name: 'K01 chat blur switch persists (API + reload) and returns', persona: 'full', route: '/n/settings', run: async t => {
   const before = (await settings(t)).chatBlur;
   const sw = t.page.locator('button[role=switch]').first();
   await until(async () => { if (await sw.isDisabled()) throw new Error('switch still disabled'); });
   eq(await sw.getAttribute('aria-checked'), String(before), 'switch shows server value');
   await sw.click(); await t.see(before ? 'показываются сразу' : 'размываются');
   await until(async () => eq((await settings(t)).chatBlur, !before, 'chatBlur after tap'));
   await t.page.reload(); await t.wait(1500);
   await until(async () => eq(await sw.getAttribute('aria-checked'), String(!before), 'switch after reload'));
   await sw.click(); await until(async () => eq((await settings(t)).chatBlur, before, 'chatBlur restored'));
 } },
 { name: 'K01 language select: English, system, Russian — saved on the account', persona: 'full', route: '/n/settings', run: async t => {
   await sel(t, 'Язык').selectOption('en'); await t.see('Language: English'); await t.see('Settings');
   await until(async () => eq((await settings(t)).locale, 'en', 'locale en'));
   await sel(t, 'Language').selectOption('system');
   await until(async () => eq((await settings(t)).locale, 'system', 'locale system'));
   await t.see('Настройки');
   await sel(t, 'Язык').selectOption('ru'); await t.see('Язык: русский');
   await until(async () => eq((await settings(t)).locale, 'ru', 'locale ru'));
   await sel(t, 'Язык').selectOption('system');
   await until(async () => eq((await settings(t)).locale, 'system', 'locale back to system'));
 } },
 { name: 'K01 theme select: dark / light / system applies and survives reload', persona: 'full', route: '/n/settings', run: async t => {
   const theme = () => t.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
   await sel(t, 'Тема оформления').selectOption('dark'); await t.wait(300); eq(await theme(), 'dark', 'dark applied');
   await t.page.reload(); await t.wait(1200); eq(await theme(), 'dark', 'dark after reload');
   eq(await sel(t, 'Тема оформления').inputValue(), 'dark', 'select shows dark');
   await sel(t, 'Тема оформления').selectOption('light'); await t.wait(300); eq(await theme(), 'light', 'light applied');
   await sel(t, 'Тема оформления').selectOption('system'); await t.wait(300);
   const v = await theme(); if (v === 'dark' || v === 'light') { const mq = await t.page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); eq(v, mq, 'system follows the device'); }
 } },
 { name: 'K01 rows open their screens and come back', persona: 'full', route: '/n/settings', run: async t => {
   const back = async () => { await t.tap('header.bar button[aria-label="Назад"]'); await t.see('Размывать'); };
   await t.tap('text=Вход и безопасность'); await t.see('Способы входа'); await t.see(t.me.email); await t.see('Это устройство'); await back();
   await t.tap('text=Проверка возраста'); await t.page.waitForURL(/settings\/age/); await back();
   await t.tap('text=Фото-верификация'); await t.page.waitForURL(/settings\/photo-check/); await back();
   await t.tap('.li >> text=Premium'); await t.see('FetUre Premium'); await back();
   await t.tap('text=Уведомления'); await t.see('Что видно на экране блокировки'); await back();
   await t.tap('text=Заблокированные'); await t.page.waitForURL(/settings\/blocked/); await back();
   await t.tap('text=Мои данные и удаление'); await t.see('Скачать мои данные'); await back();
   await t.tap('text=Помощь и безопасность'); await t.see('Частые вопросы'); await back();
   await t.tap('text=Приватность'); await t.page.waitForURL(/\/n\/me/);
 } },
 { name: 'K01 hidden-from-feed sheet: open, ✕, Esc, scrim', persona: 'full', route: '/n/settings', run: async t => {
   await t.tap('text=Скрытое в ленте'); await t.see('.sheet >> text=Скрытое в ленте');
   await t.page.locator('.sheet .empty, .sheet .card.list').first().waitFor({ timeout: 10000 });
   await t.tap('.sheet button[aria-label="Закрыть"]'); await noDialog(t);
   await t.tap('text=Скрытое в ленте'); await t.see('.sheet >> text=Скрытое в ленте'); await t.page.keyboard.press('Escape'); await noDialog(t);
   await t.tap('text=Скрытое в ленте'); await t.see('.sheet >> text=Скрытое в ленте'); await t.page.locator('.scrim.on').click({ position: { x: 10, y: 10 } }); await noDialog(t);
 } },
 { name: 'K01 sign-out dialog: Отмена and Esc keep the session', persona: 'full', route: '/n/settings', run: async t => {
   await t.tap('.li.danger >> text=Выйти'); await t.see('Выйти из аккаунта?');
   await t.tap('.dialog >> text=Отмена'); await noDialog(t);
   await t.tap('.li.danger >> text=Выйти'); await t.see('Выйти из аккаунта?'); await t.page.keyboard.press('Escape'); await noDialog(t);
   await t.tap('.li.danger >> text=Выйти'); await t.page.locator('.scrim.on').click({ position: { x: 10, y: 10 } }); await noDialog(t);
   await t.see('Размывать');
 } },
 { name: 'K05 every switch, select and category persists', persona: 'full', route: '/n/settings/notifications', run: async t => {
   const orig = await notif(t);
   try {
     await t.see('Пуш на телефон');
     await t.tap('.nm >> text=Обычные'); await t.see('Обычные уведомления');
     await until(async () => eq((await notif(t)).mode, 'normal', 'mode'));
     await t.tap('.nm >> text=Безопасные'); await until(async () => eq((await notif(t)).mode, 'safe', 'mode back'));
     const push = t.page.locator('button[role=switch]:has-text("Пуш на телефон")');
     await push.click(); await until(async () => eq((await notif(t)).push, !orig.push, 'push'));
     if (orig.push) { if (!(await t.page.locator('.nt-t[aria-label^="Пуш:"]').first().isDisabled())) throw new Error('push column should be disabled'); }
     await push.click(); await until(async () => eq((await notif(t)).push, orig.push, 'push back'));
     const mail = t.page.locator('button[role=switch]:has-text("Письма на почту")');
     if (!orig.email) { await mail.click(); await until(async () => eq((await notif(t)).email, true, 'email on')); }
     await sel(t, 'Как присылать письма').selectOption('weekly'); await until(async () => eq((await notif(t)).digest, 'weekly', 'digest'));
     await sel(t, 'Как присылать письма').selectOption('instant'); await until(async () => eq((await notif(t)).digest, 'instant', 'digest'));
     await mail.click(); await until(async () => eq((await notif(t)).email, false, 'email off'));
     await t.notSee('select[aria-label="Как присылать письма"]', 300);
     await mail.click(); await until(async () => eq((await notif(t)).email, true, 'email on again'));
     for (const cat of ['Совпадения и сообщения', 'Новые симпатии', 'Сообщества', 'Новости FetUre']) {
       const b = t.page.locator(`.nt-t[aria-label="Почта: ${cat}"]`); const was = await b.getAttribute('aria-pressed');
       await b.click(); await until(async () => eq(await b.getAttribute('aria-pressed'), String(was !== 'true'), cat + ' pressed'));
       const p = t.page.locator(`.nt-t[aria-label="Пуш: ${cat}"]`); const wasP = await p.getAttribute('aria-pressed');
       await p.click(); await until(async () => eq(await p.getAttribute('aria-pressed'), String(wasP !== 'true'), cat + ' push pressed'));
     }
     await until(async () => { const n = await notif(t); eq(n.categories.groups.email, !orig.categories.groups.email, 'groups email'); eq(n.categories.match.push, !orig.categories.match.push, 'match push'); });
     const quiet = t.page.locator('button[role=switch]:has-text("Не беспокоить")');
     if (!orig.quiet.on) { await quiet.click(); await until(async () => eq((await notif(t)).quiet.on, true, 'quiet on')); }
     await sel(t, 'С').selectOption('22:30'); await until(async () => eq((await notif(t)).quiet.from, '22:30', 'quiet from'));
     await sel(t, 'До').selectOption('07:00'); await until(async () => eq((await notif(t)).quiet.to, '07:00', 'quiet to'));
     await t.see('Не беспокоить 22:30–07:00');
     await quiet.click(); await until(async () => eq((await notif(t)).quiet.on, false, 'quiet off'));
     await t.page.reload(); await t.see('Не беспокоить 22:30–07:00');
     eq(await t.page.locator('button[role=switch]:has-text("Не беспокоить")').getAttribute('aria-checked'), 'false', 'quiet off after reload');
   } finally { await t.api('notifications.settings.update', { opId: t.uuid7(), settings: orig }); }
   eq(await notif(t), orig, 'restored');
 } },
 { name: 'K05 rapid taps: both changes reach the server', persona: 'full', route: '/n/settings/notifications', run: async t => {
   const orig = await notif(t);
   try {
     await t.see('Пуш на телефон');
     const b1 = t.page.locator('.nt-t[aria-label="Почта: Новые симпатии"]'), b2 = t.page.locator('.nt-t[aria-label="Почта: Новые подписчики"]');
     await b1.click(); await b2.click(); await t.wait(2500);
     const n = await notif(t);
     eq([n.categories.likes.email, n.categories.follows.email], [!orig.categories.likes.email, !orig.categories.follows.email], 'both flips saved');
   } finally { await t.api('notifications.settings.update', { opId: t.uuid7(), settings: orig }); }
 } },
 { name: 'K06 sign-in & security shows the email and this device', persona: 'full', route: '/n/settings/security', run: async t => {
   await t.see('Способы входа'); await t.see(t.me.email); await t.see('основной'); await t.see('Это устройство');
 } },
 { name: 'K07 export downloads a JSON file; delete sheet refuses a wrong nickname; keep closes', persona: 'full', route: '/n/settings/data', run: async t => {
   await t.see('Скачать мои данные');
   const dl = t.page.waitForEvent('download', { timeout: 30000 });
   await t.tap('.btn >> text=Скачать мои данные'); const d = await dl; if (!/feture-data\.json/.test(d.suggestedFilename())) throw new Error('file ' + d.suggestedFilename());
   await t.see('Файл с твоими данными скачан');
   await t.tap('text=Удалить аккаунт…'); await t.see('Удалить аккаунт навсегда?');
   const fin = t.page.locator('.sheet .btn >> text=Удалить навсегда');
   if (!(await fin.isDisabled())) throw new Error('final delete should be disabled while empty');
   await t.fill('.sheet input', 'not-my-nick'); await fin.click(); await t.see('Ник не совпадает');
   await t.tap('.sheet >> text=Оставить аккаунт'); await noDialog(t);
   await t.tap('text=Удалить аккаунт…'); await t.page.keyboard.press('Escape'); await noDialog(t);
 } },
];
