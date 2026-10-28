// Security (owner 29.10.2026, lane `s2fa`): the staff second factor — a staff member without an authenticator sets it
// up on the staff screen (QR + key, a wrong code, the right one, ten recovery codes once) — and «Мои устройства»
// (each device with its last use, «Выйти» for one, «Выйти на всех остальных»). Read back through the API.
// Needs the second-factor server (20261029140000_fe_second_factor.sql): run on the local API until it is deployed.
import { totpCode } from '../../../server/second-factor.mjs';
import { toastSee } from '../helpers.mjs';
import { post, signInDevice } from '../../lib.mjs';
import { STAFF } from '../../personas.mjs';

export default [
 { name: 'Staff 2FA: after a reset by a lead, the staff member connects the app on the staff screen and gets recovery codes', persona: 'staff2', route: '/n/me', run: async t => {
   // The lead (STAFF) removes qa_mod2's authenticator; the helper enters the lead's fresh code when the server asks.
   await t.persona('staff');
   const r = await t.api('staff.totpReset', { opId: t.uuid7(), handle: t.me.handle }, STAFF);
   if (!r.ok) throw new Error('staff.totpReset ' + JSON.stringify(r));
   await t.go('/n/staff');
   await t.see('Защита входа');
   await t.see('svg[role=img][aria-label="QR-код для приложения-аутентификатора"]');
   const key = (await t.page.locator('.k-key-v').innerText()).replace(/\s/g, '');
   if (!/^[A-Z2-7]{32}$/.test(key)) throw new Error('key: ' + key);
   // A wrong code first: refused in place with the attempts left.
   const wrong = totpCode(key) === '000000' ? '111111' : '000000';
   await t.page.locator('.code input').first().fill(wrong);
   await t.see('Код не подошёл. Осталось попыток: 4');
   await t.page.locator('.code input').first().fill(totpCode(key));
   await t.see('Коды восстановления');
   const n = await t.page.locator('.k-codes-l li').count(); if (n !== 10) throw new Error('recovery codes: ' + n);
   await t.tap('text=Готово, коды сохранены');
   await t.see('.seg'); await t.notSee('Защита входа', 500);
   const me = await t.api('staff.me', {});
   if (!me.factor?.enrolled || !me.factor?.verified) throw new Error('factor ' + JSON.stringify(me.factor));
 } },
 { name: 'My devices: last use per device, «Выйти» for one, «Выйти на всех остальных» for the rest', persona: 'basic', route: '/n/settings/security', run: async t => {
   const a = await signInDevice(t.me.email, 'e2e-dev-a'), b = await signInDevice(t.me.email, 'e2e-dev-b');
   await t.page.reload(); await t.see('Мои устройства'); await t.see('Это устройство');
   await t.see('text=активно сейчас');
   const outs = t.page.locator('.card.list .btn:has-text("Выйти")');
   await outs.first().waitFor({ timeout: 15000 });
   if (await outs.count() < 2) throw new Error('other devices: ' + await outs.count());
   await outs.first().click(); await t.see('Выйти на этом устройстве?');
   await t.tap('.dialog .btn.danger'); await toastSee(t, 'Устройство отключено');
   await t.tap('text=Выйти на всех остальных'); await t.tap('.dialog .btn.danger');
   await toastSee(t, 'Отключено устройств:');
   await t.notSee('.card.list .btn:has-text("Выйти")', 2000);
   for (const d of [a, b]) {
     const st = await post('/api/auth', { action: 'status', ...d });
     if (st.status !== 403) throw new Error(d.deviceId + ' still signed in: ' + st.status);
   }
 } },
];
