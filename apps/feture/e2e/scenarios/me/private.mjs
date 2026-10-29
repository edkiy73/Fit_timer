// «Я → Приватное» X01 (the tab is the private part, owner 29.10.2026) + editor P04: requests answered in the one
// «Доступы» screen (grant with a term, decline, revoke), description / photo / interest added in the tab, on/off, who may ask.
// A declined/revoked asker has a cooldown, so each run takes the next seed person that may ask.
// The asker is persona `asker` (a full person of the lane). Granting then revoking leaves no cooldown, so `full` is
// reused; a decline starts a 30-day cooldown for that pair, so the decline runs on a fresh `owner` each time.
import { pinned, expect, toastSee, pick, until, askAccess, uploaderDone, FIXTURES } from '../helpers.mjs';
const byme = async t => (await t.api('access.lists', { tab: 'byme' })).items;
const incoming = async t => (await t.api('access.lists', { tab: 'incoming' })).items;
const asker = async t => { const a = await askAccess(t, t.me.personId); await until(async () => (await incoming(t)).some(x => x.profile?.id === a.id), 'request arrived'); return a; };

export default [
 { name: 'P07 grant a request for 24 h, then revoke it', persona: 'full', route: '/n/me', allow4xx: true, run: async t => {
   const a = await asker(t);
   try {
     // «Я → Приватное» shows one «Доступы» row with the waiting count; it opens the screen on «Открыто».
     await t.go('/n/me?layer=priv'); await t.see('#privWho .li:has-text("Ждут ответа")'); await t.tap('#privWho .li');
     expect(t.page.url().includes('/n/me/access') && t.page.url().includes('tab=byme'), 'opened «Доступы → Открыто»: ' + t.page.url());
     const card = t.page.locator('.rqcard', { hasText: a.name });
     await card.waitFor({ timeout: 30000 }); await card.locator('button:has-text("Открыть доступ")').click();
     await t.see('.sheet.on'); await t.tap('.sheet.on [role="radio"]:has-text("24 часа")');
     await pinned(t, 'Открыть на 24 часа'); await t.tap('.sh-f button:has-text("Открыть на 24 часа")');
     const g = await until(async () => (await byme(t)).find(x => x.profile?.id === a.id), 'granted'); expect(g.until, 'granted with a term: ' + JSON.stringify(g));
     expect(Math.abs(new Date(g.until) - Date.now() - 24 * 3600e3) < 3600e3, 'term ≈ 24 h: ' + g.until);
     const row = t.page.locator('.rqcard', { hasText: a.name }).filter({ has: t.page.locator('button:has-text("Отозвать")') }); await row.waitFor({ timeout: 30000 }); await t.shot('priv-grant');
     await row.locator('button:has-text("Отозвать")').click(); await t.tap('.dialog.on button:has-text("Отозвать")');
     await until(async () => !(await byme(t)).some(x => x.profile?.id === a.id), 'revoked');
   } finally { for (const g of await byme(t)) if (g.profile?.id === a.id) await t.api('access.revoke', { opId: t.uuid7(), profileId: a.id }); }
 } },
 { name: 'P07 decline a request (grant sheet ✕ keeps it pending)', persona: 'owner', route: '/n/me', allow4xx: true, run: async t => {
   const a = await asker(t);
   await t.go('/n/me/access?tab=byme'); const card = t.page.locator('.rqcard', { hasText: a.name }); await card.waitFor({ timeout: 30000 });
   await card.locator('button:has-text("Открыть доступ")').click(); await t.see('.sheet.on'); await t.tap('.sheet.on .sh-h button'); await t.notSee('.sheet.on', 800);
   expect((await incoming(t)).some(x => x.profile?.id === a.id), 'still pending after ✕');
   await card.locator('button:has-text("Отказать")').click();
   await until(async () => !(await incoming(t)).some(x => x.profile?.id === a.id), 'declined');
 } },
 { name: 'X01 private description: edit in place → Сохранить → shown and persisted', persona: 'full', route: '/n/me?layer=priv', run: async t => {
   const me = await t.pid(); const before = (await t.api('private.get', { profileId: me })).text ?? '';
   const txt = 'e2e private ' + Date.now().toString(36);
   try {
     await t.tap('#privDesc button.blk-btn, #privDesc .ph-empty'); await t.see('.sheet.on textarea');
     await t.fill('.sheet.on textarea', txt); await t.tap('.sheet.on .sh-f button:has-text("Сохранить")'); await t.notSee('.sheet.on', 1500);
     await t.see(`#privDesc:has-text("${txt}")`); expect(t.page.url().includes('layer=priv'), 'still on the private layer: ' + t.page.url());
     await until(async () => (await t.api('private.get', { profileId: me })).text === txt, 'text saved');
   } finally { await t.api('private.setText', { opId: t.uuid7(), text: before }); }
 } },
 { name: 'X01 empty private part: add description, photo and a private interest in the tab — all three listed there', persona: 'basic', route: '/n/me?layer=priv', run: async t => {
   const me = await t.pid(); const p0 = await t.api('private.get', { profileId: me }); let topic = null;
   expect(!p0.text && !(p0.media ?? []).length, 'basic starts with an empty private part: ' + JSON.stringify(p0).slice(0, 200));
   try {
     await t.see('#privHead'); expect(await t.page.locator('#privHead button[role="switch"]').isDisabled(), 'switch is off while empty');
     await t.see('#privDesc .ph-empty'); await t.see('#privMedia .ph-empty'); await t.see('#privJars .ph-empty'); await t.see('#privWho .li:has-text("Доступы")');
     await t.shot('priv-empty');
     // Description
     await t.tap('#privDesc .ph-empty'); await t.fill('.sheet.on textarea', 'Сначала созвон, потом встреча.');
     await t.tap('.sheet.on .sh-f button:has-text("Сохранить")'); await t.see('#privDesc:has-text("Сначала созвон")');
     // Photo
     await t.page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(FIXTURES + 'photo.jpg'); await uploaderDone(t);
     await until(async () => ((await t.api('private.get', { profileId: me })).media ?? []).length === 1, 'photo saved');
     await t.see('#privMedia .mi');
     // Interest: the picker opens over the tab with «По доступу» preset and returns here
     await t.tap('#privJars .ph-empty'); await t.see('.sheet.on .chip'); expect(t.page.url().includes('layer=priv') && !t.page.url().includes('/interests'), 'picker over the tab: ' + t.page.url());
     await t.tap('.sheet.on .chip >> nth=0'); await t.tap('.sheet.on .sh-f .btn.primary'); await t.see('Интерес 1 из 1');
     expect(await t.page.locator('.sheet.on .chip[aria-pressed="true"]:has-text("По доступу")').count(), 'granted preset');
     await t.tap('.sheet.on .ans-scale button:has-text("6")'); await t.see('Проверь ответы'); await t.tap('.sheet.on .sh-f button:has-text("Сохранить")'); await t.notSee('.sheet.on', 1500);
     const it = await until(async () => (await t.api('interests.list', { profileId: me })).items.find(i => i.vis === 'granted'), 'private interest saved'); topic = it.topicId;
     await t.see('#privJars .sc'); expect(t.page.url().includes('/n/me') && t.page.url().includes('layer=priv'), 'never left the tab: ' + t.page.url());
     const p1 = await t.api('private.get', { profileId: me });
     expect(p1.text && p1.media.length === 1, 'private.get lists text and photo');
     expect(!p1.interests || p1.interests.some(i => i.topicId === topic), 'private.get lists the interest');
     expect(!(await t.page.locator('#privHead button[role="switch"]').isDisabled()), 'switch usable once filled');
     await t.shot('priv-filled');
   } finally {
     await t.api('private.setText', { opId: t.uuid7(), text: '' }); await t.api('private.setMedia', { opId: t.uuid7(), assetIds: [] });
     if (topic) await t.api('interests.remove', { opId: t.uuid7(), topicId: topic });
     await t.api('private.setOn', { opId: t.uuid7(), on: true });
   }
 } },
 { name: 'P04 private editor opened by link: back returns to «Я»', persona: 'full', route: '/n/me/edit?only=priv', run: async t => {
   await t.see('#privEdit'); await t.tap('.bar button[aria-label="Назад"]'); await t.see('.me18-seg'); expect(t.page.url().includes('/n/me'), t.page.url());
 } },
 { name: 'X01 private part off (confirm) and on again; who may ask', persona: 'full', route: '/n/me?layer=priv', allow4xx: true, run: async t => {
   try {
     const sw = '#privHead button[role="switch"][aria-label="Приватная часть"]';
     await t.tap(sw); await t.see('.dialog.on');
     await t.tap('.dialog.on button:has-text("Отмена")'); await t.notSee('.dialog.on', 600);
     expect((await t.api('profile.settings', {})).settings.privateOn === true, 'cancel keeps it on');
     await t.tap(sw); await t.tap('.dialog.on button:has-text("Выключить")');
     await until(async () => (await t.api('profile.settings', {})).settings.privateOn === false, 'off');
     await t.see('#privHead:has-text("попросить доступ нельзя")');
     await t.tap(sw);
     await until(async () => (await t.api('profile.settings', {})).settings.privateOn === true, 'on again');
     await pick(t, 'Кто может просить доступ', 'Взаимные');
     await until(async () => (await t.api('profile.settings', {})).settings.requestsFrom === 'matches', 'requestsFrom matches');
   } finally {
     await t.api('private.setOn', { opId: t.uuid7(), on: true });
     await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'requestsFrom', value: 'all' });
   }
 } },
];
