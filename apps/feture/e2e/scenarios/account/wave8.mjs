// Wave 8 «Аккаунт, оплата, поддержка» (lane `w8`): K06 sign-in & security (email change form, sessions), S01 support
// (a ticket, the staff reply, the answer back), MAINT (the maintenance screen — simulated in the browser only, never
// switched on in production from a scenario: it would lock every other agent out), B01 Premium (paywall, purchase
// confirmation without a provider, restore, gift form). Everything that reaches the server is read back through the API.
// Needs the wave-8 server (Core sessions/email-change actions, support.*, premium.* additions): marked «after deploy».
import { noLayer, sheet, toastSee } from '../helpers.mjs';
import { post, signInDevice } from '../../lib.mjs';

const ok = (r, what) => { if (!r?.ok) throw new Error(what + ': ' + JSON.stringify(r)); return r; };

export default [
 { name: 'K06 email change: the form checks the address (format, not the current one) before anything is sent', persona: 'basic', route: '/n/settings/security', run: async t => {
   await t.see('Способы входа'); await t.see(t.me.email);
   await t.tap('text=Сменить почту'); await t.see(sheet + ' >> text=Новая почта');
   await t.fill('#fe-k6-new', 'not-an-address'); await t.tap(sheet + ' >> text=Получить код');
   await t.see('Проверь адрес');
   await t.fill('#fe-k6-new', t.me.email.toUpperCase()); await t.tap(sheet + ' >> text=Получить код');
   await t.see('Это уже твоя почта');
   await t.page.keyboard.press('Escape'); await t.tap('.dialog >> text=Закрыть'); await noLayer(t).catch(async () => { await t.page.keyboard.press('Escape'); });
 } },
 { name: 'K06 email change: an address of another account is refused by the server (after deploy; no mail is sent)', persona: 'basic', route: '/n/settings/security', run: async t => {
   const other = await t.persona('stranger');
   await t.tap('text=Сменить почту');
   await t.fill('#fe-k6-new', other.email); await t.tap(sheet + ' >> text=Получить код');
   await t.see('Этот адрес уже занят другим аккаунтом');
 } },
 { name: 'K06 sessions: this device listed first, «Выйти везде кроме этого» signs a second device out (after deploy)', persona: 'basic', route: '/n/settings/security', run: async t => {
   await t.see('Это устройство'); await t.notSee('Не удалось загрузить список устройств', 800);
   // A second device of the same account, signed in through Core with the admin test code.
   const second = await signInDevice(t.me.email, 'e2e-w8-second');
   await t.page.reload(); await t.see('Завершить');
   await t.tap('text=Выйти везде, кроме этого устройства'); await t.tap('.dialog >> text=Выйти везде');
   await toastSee(t, 'Вышли на других устройствах');
   await t.notSee('text=Завершить', 3000);
   await t.see('Это устройство');
   // Read back: the second device's token no longer works.
   const st = await post('/api/auth', { action: 'status', ...second });
   if (st.status !== 403) throw new Error('second device still signed in: ' + st.status);
 } },
 { name: 'S01 support: a ticket reaches staff, the reply comes back to the person (after deploy)', persona: 'basic', route: '/n/help', run: async t => {
   const text = 'e2e w8 вопрос ' + Date.now().toString(36);
   await t.tap('text=Написать в поддержку'); await t.see(sheet + ' >> text=Сообщение');
   await t.fill('#fe-sup-text', 'abc'); await t.tap(sheet + ' >> text=Отправить'); await t.see('Напиши хотя бы пару слов');
   await t.tap(sheet + ' >> text=Аккаунт и вход');
   await t.fill('#fe-sup-text', text); await t.tap(sheet + ' >> text=Отправить');
   await toastSee(t, 'Сообщение отправлено');
   const mine = ok(await t.api('support.mine', {}), 'support.mine');
   const ticket = mine.tickets.find(x => x.messages.some(m => m.body === text));
   if (!ticket || ticket.topic !== 'account' || ticket.state !== 'open') throw new Error('ticket not saved: ' + JSON.stringify(mine.tickets[0]));
   const staff = (await t.persona('staff')).email;
   try {
     const q = ok(await t.api('staff.supportQueue', { state: 'open', limit: 50 }, staff), 'queue');
     if (!q.items.some(x => x.id === ticket.id)) throw new Error('not in the staff queue');
     ok(await t.api('staff.supportReply', { opId: t.uuid7(), ticketId: ticket.id, body: 'Ответ поддержки e2e' }, staff), 'reply');
     await t.page.reload(); await t.see('есть ответ');
     await t.tap('.li >> text=Аккаунт и вход'); await t.see('Ответ поддержки e2e');
     await t.page.keyboard.press('Escape');
     const after = ok(await t.api('support.mine', {}), 'mine after').tickets.find(x => x.id === ticket.id);
     if (after.state !== 'answered' || !after.messages.some(m => m.fromStaff)) throw new Error('answer not stored');
   } finally {
     await t.api('staff.supportReply', { opId: t.uuid7(), ticketId: ticket.id, close: true }, staff);
   }
 } },
 { name: 'Staff: support queue and the maintenance switch are shown (maintenance stays off)', persona: 'staff', route: '/n/staff', run: async t => {
   await t.see('.seg');
   await t.tap('.seg >> text=Поддержка'); await t.page.locator('.view .empty, .view .card').first().waitFor({ timeout: 15000 });
   const roles = (await t.api('staff.me', {})).roles ?? [];
   if (roles.some(r => r === 'owner' || r === 'lead')) {
     await t.tap('.seg >> text=Техработы'); await t.see('Режим техработ'); await t.see('Приложение работает для всех');
   }
   const m = ok(await t.api('platform.maintenance', {}), 'platform.maintenance');
   if (m.active) throw new Error('production is in maintenance');
 } },
 { name: 'MAINT: a «maintenance» answer swaps the app for the screen; «Проверить ещё раз» brings it back', persona: 'basic', route: '/n/settings', run: async t => {
   await t.see('Настройки');
   let down = true;
   await t.page.route('**/api/fe', async route => {
     const body = route.request().postDataJSON?.() ?? {};
     if (!down) return route.continue();
     if (body.action === 'platform.maintenance') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, active: true, message: 'Обновляем базу e2e' }) });
     return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'maintenance', message: 'Обновляем базу e2e' }) });
   });
   try {
     await t.tap('text=Помощь и безопасность');
     await t.see('Скоро вернёмся'); await t.see('Обновляем базу e2e');
     await t.tap('text=Проверить ещё раз'); await t.see('Работы ещё идут');
     down = false;
     await t.tap('text=Проверить ещё раз');
     await t.notSee('Скоро вернёмся', 8000);
   } finally { await t.page.unroute('**/api/fe'); }
 } },
 { name: 'B01 Premium: plans, the purchase confirmation says payment comes later (no charge), restore answers', persona: 'basic', route: '/n/premium', run: async t => {
   await t.see('FetUre Premium'); await t.see('Вернуть пропущенных');
   await t.tap('.pw-plan >> text=Месяц');
   await t.tap('.ctabar >> text=Оформить'); await t.see(sheet + ' >> text=Оформление Premium');
   await t.see('Оплата появится позже');
   if (await t.page.locator(sheet + ' .btn:has-text("Оплатить")').count()) throw new Error('a pay button without a provider');
   await t.page.keyboard.press('Escape'); await noLayer(t);
   const st = ok(await t.api('premium.status', {}), 'premium.status');
   if (st.payments !== false) throw new Error('payments should be off: ' + st.payments);
   await t.tap('text=Восстановить покупки'); await toastSee(t, 'Покупок на этом аккаунте не найдено');
   const r = ok(await t.api('premium.restore', { opId: t.uuid7() }), 'restore');
   if (r.restored !== 0) throw new Error('restored ' + r.restored);
 } },
 { name: 'B01 gift: find by exact nick, change, term, anonymous, confirm shows «оплата позже», back (after deploy)', persona: 'basic', route: '/n/premium', run: async t => {
   const other = await t.persona('stranger');
   await t.tap('text=Подарить Premium другому'); await t.see(sheet + ' >> text=Ник получателя');
   await t.fill('#fe-gift-nick', 'zz' + Date.now().toString(36)); await t.tap(sheet + ' >> text=Найти'); await t.see('Такого ника нет');
   await t.fill('#fe-gift-nick', t.me.handle); await t.tap(sheet + ' >> text=Найти'); await t.see('Себе подарить нельзя');
   await t.fill('#fe-gift-nick', other.handle); await t.tap(sheet + ' >> text=Найти'); await t.see('@' + other.handle);
   await t.tap(sheet + ' >> text=Другой'); await t.see('Ник получателя');
   await t.fill('#fe-gift-nick', other.handle); await t.tap(sheet + ' >> text=Найти'); await t.see('@' + other.handle);
   await t.tap('.pw-plan >> text=3 месяца'); await t.tap(sheet + ' button[role=switch]');
   await t.tap(sheet + ' >> text=К оплате'); await t.see('Подтверждение подарка'); await t.see('Оплата появится позже');
   await t.tap(sheet + ' >> text=Назад'); await t.see('Срок');
   await t.page.keyboard.press('Escape');
   const g = await t.api('premium.gift', { opId: t.uuid7(), handle: other.handle, plan: 'm1', anonymous: false });
   if (g.error !== 'payments_unavailable') throw new Error('gift must wait for payments: ' + JSON.stringify(g));
 } },
 { name: 'Paywall sheet from the viewing history (free account)', persona: 'basic', route: '/n/people/history', run: async t => {
   const btn = t.page.locator('.paywall .btn');
   if (await btn.count()) { await btn.click(); await t.see(sheet + ' >> text=Вся история просмотров'); await t.tap(sheet + ' >> text=Подробнее о Premium'); await t.page.waitForURL(/\/n\/premium/); }
 } },
];
