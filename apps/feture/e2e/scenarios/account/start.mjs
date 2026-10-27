// A01 welcome → A02 email → A03 code, signed out (persona: null). The sign-in address is the lane's own
// (qa-<lane>-signin@feture.test, made by the admin `user_create`), so lanes never sign each other out.
const SIGNIN = `qa-${process.env.E2E_LANE || 'local'}-signin@feture.test`;
// Code e-mails are never really sent from tests: «send» is answered here (ok, or a mail failure).
const mockSend = (t, fail) => t.page.route('**/api/auth', async r => { const b = JSON.parse(r.request().postData() || '{}'); if (b.action !== 'send') return r.fallback();
  await r.fulfill(fail ? { status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'mail_failed' }) } : { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }); });
const closed = async t => { await t.wait(400); if (await t.page.locator('.sheet.on').count()) throw new Error('sheet still open'); };
export default [
 { name: 'A01 welcome: slides, arrows, dots (desktop)', persona: null, viewport: { width: 1280, height: 860 }, route: '/n/feed', run: async t => {
   await t.page.emulateMedia({ reducedMotion: 'reduce' });
   await t.see('Создать аккаунт'); await t.see('У меня уже есть аккаунт');
   await t.see('.w-count >> text=01');
   await t.tap('.w-arrows button >> nth=1'); await t.see('.w-count >> text=02');
   await t.tap('.w-arrows button >> nth=0'); await t.see('.w-count >> text=01');
   await t.tap('.w-arrows button >> nth=0'); await t.see('.w-count >> text=06');
   await t.tap('.w-pb >> nth=2'); await t.see('.w-count >> text=03');
 } },
 { name: 'A01 phone: progress dots switch slides', persona: null, route: '/n/feed', run: async t => {
   await t.page.emulateMedia({ reducedMotion: 'reduce' });
   await t.tap('.w-pb >> nth=3'); await t.see('.w-slide.on >> text=04 ·');
   await t.tap('.w-pb >> nth=0'); await t.see('.w-slide.on >> text=01 ·');
 } },
 { name: 'A01 language switch EN ↔ RU', persona: null, route: '/n/feed', run: async t => {
   await t.tap('.langsw button >> text=EN'); await t.see('Create account');
   await t.tap('.langsw button >> text=RU'); await t.see('Создать аккаунт');
 } },
 { name: 'A01 terms sheet: open, doc, back, ✕ / Esc / scrim / Понятно', persona: null, route: '/n/feed', run: async t => {
   await t.tap('.w-age a'); await t.see('Условия и приватность');
   await t.page.locator('.sheet .card.list .li').first().waitFor({ timeout: 15000 });
   await t.page.locator('.sheet .card.list .li').first().click(); await t.wait(400);
   await t.see('.sheet .sh-f >> text=Назад'); await t.tap('.sheet .sh-f >> text=Назад'); await t.see('.sheet >> text=Условия и приватность');
   await t.tap('.sheet button[aria-label="Закрыть"]'); await closed(t);
   await t.tap('.w-age a'); await t.see('Условия и приватность'); await t.page.keyboard.press('Escape'); await closed(t);
   await t.tap('.w-age a'); await t.see('Условия и приватность'); await t.page.locator('.scrim.on').click({ position: { x: 10, y: 10 } }); await closed(t);
   await t.tap('.w-age a'); await t.tap('.sheet >> text=Понятно'); await closed(t);
 } },
 { name: 'A02 sign-up / sign-in switch, validation, back', persona: null, route: '/n/feed', run: async t => {
   await t.tap('Создать аккаунт'); await t.see('Создадим аккаунт');
   await t.tap('.seg >> text=Вход'); await t.see('С возвращением');
   await t.tap('.seg >> text=Регистрация'); await t.see('Создадим аккаунт');
   await t.tap('text=Получить код'); await t.see('Введи электронную почту');
   await t.fill('input[name=email]', 'not-an-email'); await t.tap('text=Получить код'); await t.see('Похоже, в адресе ошибка');
   await t.fill('input[name=email]', 'a..b@mail.com'); await t.page.keyboard.press('Enter'); await t.see('Похоже, в адресе ошибка');
   await t.tap('header.bar button[aria-label="Назад"]'); await t.see('Создать аккаунт');
   await t.tap('У меня уже есть аккаунт'); await t.see('С возвращением');
 } },
 { name: 'A02→A03 sign-in with a real code; wrong code first', persona: null, route: '/n/feed', allow4xx: true, run: async t => {
   const email = SIGNIN; await mockSend(t);
   await t.admin('user_create', { email });
   await t.tap('У меня уже есть аккаунт');
   await t.fill('input[name=email]', email); await t.tap('text=Получить код');
   await t.see('Введи код');
   await t.tap('.auth-wrap >> text=Подтвердить'); await t.see('Введи все 6 цифр');
   const c = await t.admin('user_test_code', { email }); if (!c.code) throw new Error('no code ' + c.status);
   await t.page.locator('.code input').first().fill(c.code === '000000' ? '111111' : '000000'); await t.see('Неверный код. Осталось попыток', 15000);
   await t.page.locator('.code input').first().fill(String(c.code));
   // A verified new account lands on A04 (nickname) or the app.
   await t.page.locator('text=Ник').or(t.page.locator('.dock')).first().waitFor({ timeout: 20000 });
 } },
 { name: 'A03 «Изменить адрес» goes back with the email kept', persona: null, route: '/n/feed', run: async t => {
   await mockSend(t); await t.tap('У меня уже есть аккаунт');
   await t.fill('input[name=email]', SIGNIN); await t.tap('text=Получить код');
   await t.see('Введи код'); await t.tap('text=Изменить адрес'); await t.see('С возвращением');
   const v = await t.page.locator('input[name=email]').inputValue(); if (v !== SIGNIN) throw new Error('email lost: ' + v);
 } },
 { name: 'A02 mail failure → «У меня есть код» opens A03', persona: null, route: '/n/feed', allow4xx: true, run: async t => {
   await mockSend(t, true); await t.tap('Создать аккаунт');
   await t.fill('input[name=email]', `qa-${process.env.E2E_LANE || 'local'}-nomail@feture.test`); await t.tap('text=Получить код');
   await t.see('Письмо с кодом не отправилось'); await t.tap('.auth-wrap button >> text=У меня есть код');
   await t.see('Введи код'); await t.see('Введи код для');
 } },
];
