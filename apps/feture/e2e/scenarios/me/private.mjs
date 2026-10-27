// «Я → Приватное» X01 + private part editor P04: requests (grant with a term, decline), revoke, text, on/off, who may ask.
// A declined/revoked asker has a cooldown, so each run takes the next seed person that may ask.
// The asker is persona `asker` (a full person of the lane). Granting then revoking leaves no cooldown, so `full` is
// reused; a decline starts a 30-day cooldown for that pair, so the decline runs on a fresh `owner` each time.
import { pinned, expect, toastSee, pick, until, askAccess } from '../helpers.mjs';
const byme = async t => (await t.api('access.lists', { tab: 'byme' })).items;
const incoming = async t => (await t.api('access.lists', { tab: 'incoming' })).items;
const asker = async t => { const a = await askAccess(t, t.me.personId); await until(async () => (await incoming(t)).some(x => x.profile?.id === a.id), 'request arrived'); return a; };

export default [
 { name: 'P07 grant a request for 24 h, then revoke it', persona: 'full', route: '/n/me', allow4xx: true, run: async t => {
   const a = await asker(t);
   try {
     await t.go('/n/me?layer=priv'); const card = t.page.locator('.rqcard', { hasText: a.name });
     await card.waitFor({ timeout: 30000 }); await card.locator('button:has-text("Открыть доступ")').click();
     await t.see('.sheet.on'); await t.tap('.sheet.on [role="radio"]:has-text("24 часа")');
     await pinned(t, 'Открыть на 24 часа'); await t.tap('.sh-f button:has-text("Открыть на 24 часа")');
     const g = await until(async () => (await byme(t)).find(x => x.profile?.id === a.id), 'granted'); expect(g.until, 'granted with a term: ' + JSON.stringify(g));
     expect(Math.abs(new Date(g.until) - Date.now() - 24 * 3600e3) < 3600e3, 'term ≈ 24 h: ' + g.until);
     const row = t.page.locator('.li', { hasText: a.name }); await row.waitFor({ timeout: 30000 });
     await row.locator('button:has-text("Отозвать")').click();
     await until(async () => !(await byme(t)).some(x => x.profile?.id === a.id), 'revoked');
   } finally { for (const g of await byme(t)) if (g.profile?.id === a.id) await t.api('access.revoke', { opId: t.uuid7(), profileId: a.id }); }
 } },
 { name: 'P07 decline a request (grant sheet ✕ keeps it pending)', persona: 'owner', route: '/n/me', allow4xx: true, run: async t => {
   const a = await asker(t);
   await t.go('/n/me?layer=priv'); const card = t.page.locator('.rqcard', { hasText: a.name }); await card.waitFor({ timeout: 30000 });
   await card.locator('button:has-text("Открыть доступ")').click(); await t.see('.sheet.on'); await t.tap('.sheet.on .sh-h button'); await t.notSee('.sheet.on', 800);
   expect((await incoming(t)).some(x => x.profile?.id === a.id), 'still pending after ✕');
   await card.locator('button:has-text("Отказать")').click();
   await until(async () => !(await incoming(t)).some(x => x.profile?.id === a.id), 'declined');
 } },
 { name: 'P04 private text: edit → Сохранить → persisted', persona: 'full', route: '/n/me?layer=priv', run: async t => {
   const me = await t.pid(); const before = (await t.api('private.get', { profileId: me })).text ?? '';
   const txt = 'e2e private ' + Date.now().toString(36);
   try {
     await t.tap('button.vault'); await t.see('#privEdit textarea'); await pinned(t, 'Сохранить');
     await t.fill('#privEdit textarea', txt); await t.tap('.ctabar button:has-text("Сохранить")');
     await t.see('.grp-t:has-text("Настройки")'); expect(t.page.url().includes('layer=priv'), 'back on the private layer: ' + t.page.url());
     await until(async () => (await t.api('private.get', { profileId: me })).text === txt, 'text saved');
   } finally { await t.api('private.setText', { opId: t.uuid7(), text: before }); }
 } },
 { name: 'P04 private editor opened by link: back returns to «Я»', persona: 'full', route: '/n/me/edit?only=priv', run: async t => {
   await t.see('#privEdit'); await t.tap('.bar button[aria-label="Назад"]'); await t.see('.me18-seg'); expect(t.page.url().includes('/n/me'), t.page.url());
 } },
 { name: 'X01 private part off (confirm) and on again; who may ask', persona: 'full', route: '/n/me?layer=priv', allow4xx: true, run: async t => {
   try {
     await t.tap('button[role="switch"]:has-text("Приватная часть")'); await t.see('.dialog.on');
     await t.tap('.dialog.on button:has-text("Отмена")'); await t.notSee('.dialog.on', 600);
     expect((await t.api('profile.settings', {})).settings.privateOn === true, 'cancel keeps it on');
     await t.tap('button[role="switch"]:has-text("Приватная часть")'); await t.tap('.dialog.on button:has-text("Выключить")');
     await until(async () => (await t.api('profile.settings', {})).settings.privateOn === false, 'off');
     await t.tap('button:has-text("Включить приватную часть")');
     await until(async () => (await t.api('profile.settings', {})).settings.privateOn === true, 'on again');
     await pick(t, 'Кто может просить доступ', 'Взаимные');
     await until(async () => (await t.api('profile.settings', {})).settings.requestsFrom === 'matches', 'requestsFrom matches');
   } finally {
     await t.api('private.setOn', { opId: t.uuid7(), on: true });
     await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'requestsFrom', value: 'all' });
   }
 } },
];
