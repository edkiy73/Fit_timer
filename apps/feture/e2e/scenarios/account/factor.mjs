// Optional second factor for everyone (owner 29.10.2026, lane `u2f`): a person turns on «Код из приложения» in «Вход и
// безопасность» (QR + key, the first code, ten recovery codes once), then signs in on another device: the app asks for
// the code before anything else, the server refuses that sign-in until then (also Core's «Мои устройства»), and the code
// opens the app. Read back through the API; the factor is turned off again with a code.
// Needs 20261029180000_fe_user_second_factor.sql: run on the local API until it is deployed.
import { totpCode } from '../../../server/second-factor.mjs';
import { toastSee } from '../helpers.mjs';
import { factorKey, post, saveFactor, signInDevice, sleep } from '../../lib.mjs';

/** The next 30 s step (a code works once per account). */
const nextStep = () => sleep(30000 - (Date.now() % 30000) + 700);

export default [
 { name: 'App code: turn it on, sign in on a new device with the code, turn it off with a code', persona: 'temp', allow4xx: true, route: '/n/settings/security', run: async t => {
   const email = t.me.email;
   await t.see('Защита входа');
   await t.tap('text=Код из приложения');
   await t.see('svg[role=img][aria-label="QR-код для приложения-аутентификатора"]');
   const key = (await t.page.locator('.k-key-v').innerText()).replace(/\s/g, '');
   if (!/^[A-Z2-7]{32}$/.test(key)) throw new Error('key: ' + key);
   saveFactor(factorKey(email), { secret: key, at: Date.now() }); // the helpers enter codes for this persona from now on
   await t.page.locator('.code input').first().fill(totpCode(key));
   await t.see('Коды восстановления');
   const codes = await t.page.locator('.k-codes-l li').allInnerTexts();
   if (codes.length !== 10) throw new Error('recovery codes: ' + codes.length);
   saveFactor(factorKey(email), { secret: key, codes, at: Date.now() });
   await t.tap('text=Готово, коды сохранены');
   await toastSee(t, 'Код из приложения включён');
   await t.see('text=Включён'); await t.see('text=Новые коды восстановления');
   const f = await t.api('account.factor', {});
   if (!f.enabled || f.recoveryLeft !== 10) throw new Error('factor ' + JSON.stringify(f));

   // Another device signs in with the email code: the server refuses that sign-in everywhere until a code.
   const other = await signInDevice(email, 'e2e-u2f-' + Date.now());
   const h = { 'x-fit-email': other.email, 'x-fit-device': other.deviceId, 'x-fit-token': other.syncToken };
   const boot = await post('/api/fe', { action: 'session.bootstrap' }, h);
   if (boot.status !== 403 || boot.rule !== 'signin') throw new Error('bootstrap before the code: ' + JSON.stringify(boot));
   const list = await post('/api/auth', { action: 'sessions', ...other });
   if (list.status !== 403 || list.rule !== 'signin') throw new Error('sessions before the code: ' + JSON.stringify(list));

   // In the browser that device sees only the code screen; a wrong code is refused, the right one opens the app.
   await t.page.context().addInitScript(x => { localStorage.setItem('feture.auth.session', JSON.stringify({ email: x.email, deviceId: x.deviceId, syncToken: x.syncToken, handle: null, locale: 'ru', sub: null, premium: false, owned: [], fresh: false, expiresAt: null }));
     localStorage.setItem('feture.auth.device', x.deviceId); }, other);
   await t.go('/n/feed'); await t.page.reload(); // a new document, so the init script puts the other device in
   await t.see('Вход защищён. Введи 6 цифр из приложения-аутентификатора.');
   await t.shot('u2f-signin-step');
   await t.page.locator('.code input').first().fill(totpCode(key) === '000000' ? '111111' : '000000');
   await t.see('Код не подошёл. Осталось попыток: 4');
   await nextStep();
   await t.page.locator('.code input').first().fill(totpCode(key));
   await t.see('nav.dock');
   const after = await post('/api/fe', { action: 'session.bootstrap' }, h);
   if (after.status !== 200) throw new Error('bootstrap after the code: ' + JSON.stringify(after));

   // Off: asks for a current code (the original session, through the helpers).
   await nextStep();
   const off = await t.api('account.factorOff', { code: totpCode(key) });
   if (!off.off) throw new Error('factor off ' + JSON.stringify(off));
   if ((await t.api('account.factor', {})).enabled) throw new Error('still on');
 } },
];
