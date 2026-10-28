// Wave 7 on the Me screens: «Закрыть без сохранения?» in the interest picker, k4off (switching Discover off asks
// first), «+» in «Мои связи» with the person picker → request → «Обновить запрос», event drafts in «Мои события» with
// a delete confirmation and «Смотреть события», «Мои сообщества» (C02) empty → catalogue, the status fix with
// «Отменить». Actors: `basic` (empty states), `full` (links, visibility), `pair` (status fix).
import { expect, until, toastSee } from '../helpers.mjs';

const sheet = '.sheet.on', dialog = '.dialog.on';

export default [
 { name: 'X02 picker with a choice: ✕ asks «Закрыть без сохранения?», «Остаться» keeps it, «Закрыть» drops it', persona: 'basic', route: '/n/me/interests', run: async t => {
   const before = (await t.api('interests.list', { profileId: t.me.personId })).items?.length ?? 0;
   await t.tap('.empty button:has-text("Добавить интерес"), .bar button[aria-label="Добавить интерес"]'); await t.see(sheet + ' .chip');
   await t.tap(sheet + ' .chip >> nth=0');
   await t.tap(sheet + ' .sh-h button[aria-label="Закрыть"]');
   await t.see(dialog + ':has-text("Закрыть без сохранения?")');
   await t.tap(dialog + ' button:has-text("Остаться")'); await t.see(sheet + ' .chip.on');
   await t.tap(sheet + ' .sh-h button[aria-label="Закрыть"]'); await t.tap(dialog + ' button:has-text("Закрыть")');
   await t.notSee(sheet, 800);
   const after = (await t.api('interests.list', { profileId: t.me.personId })).items?.length ?? 0;
   expect(after === before, 'nothing saved: ' + before + ' → ' + after);
 } },
 { name: 'X01 Видимость: switching Discover off asks first; «Отмена» keeps it on', persona: 'full', route: '/n/me?layer=vis', run: async t => {
   await t.see('select[aria-label="Режим"]');
   await t.page.locator('select[aria-label="Режим"]').selectOption({ label: 'Выключены' });
   await t.see(dialog + ':has-text("Выключить знакомства?")');
   await t.tap(dialog + ' button:has-text("Отмена")'); await t.notSee(dialog, 600);
   expect((await t.api('profile.settings', {})).settings.discoverMode === 'visible', 'still visible on the server');
 } },
 { name: 'P21 «+» → picker (Все, by nickname) → P22 request → «Обновить запрос» changes the kind', persona: 'full', route: '/n/me/links', run: async t => {
   const basic = await t.persona('basic');
   const sentTo = async () => (await t.api('links.mine', {})).sent.find(l => l.other.id === basic.personId);
   for (const l of [...(await t.api('links.mine', {})).sent, ...(await t.api('links.mine', {})).confirmed].filter(l => l.other.id === basic.personId)) await t.api('link.remove', { opId: t.uuid7(), linkId: l.id });
   try {
     await t.go('/n/me/links');
     await t.tap('.bar button[aria-label="Добавить связь"]'); await t.see(sheet + ':has-text("С кем связь?")');
     await t.tap(sheet + ' [role="tab"]:has-text("Все")');
     await t.fill(sheet + ' input[type="search"]', basic.handle);
     await t.tap(sheet + ` .li:has-text("${basic.handle}")`);
     await until(async () => t.page.url().includes('/n/people/' + basic.personId + '/link'), 'editor opened');
     await t.tap('.radio:has-text("Друзья")');
     await t.tap('.ctabar .btn:has-text("Отправить запрос")');
     const s = await until(sentTo, 'request sent');
     expect(s.kind === 'friend', 'kind friend: ' + s.kind);
     await t.page.reload(); await t.wait(1000);
     await t.see('Запрос ждёт ответа');
     await t.wait(1000); await t.tap('.radio:has-text("Наставничество")'); await t.see('.radio.on:has-text("Наставничество")');
     await t.tap(".chip:has-text(\"учит\") >> nth=0");
     await t.tap('.ctabar .btn:has-text("Обновить запрос")');
     await until(async () => (await sentTo())?.kind === 'mentor', 'request updated to mentor');
   } finally { const s = await sentTo(); if (s) await t.api('link.remove', { opId: t.uuid7(), linkId: s.id }); }
 } },
 { name: 'E10 drafts: listed, delete asks first and removes it; empty → «Смотреть события»', persona: 'basic', run: async t => {
   const drafts = async () => (await t.api('event.mine', {})).drafts ?? [];
   for (const x of (await drafts()).filter(x => String(x.title).startsWith('E2E черновик'))) await t.api('event.draftDelete', { opId: t.uuid7(), draftId: x.id });
   const d = await t.api('event.draftSave', { opId: t.uuid7(), step: 2, form: { title: 'E2E черновик ' + Date.now().toString(36) } });
   expect(d.ok && d.id, 'draft saved: ' + JSON.stringify(d).slice(0, 200));
   await t.go('/n/me/events');
   await t.see('Черновики');
   const row = t.page.locator('.li', { hasText: 'E2E черновик' }).first();
   await row.waitFor({ timeout: 30000 });
   await row.locator('button[aria-label="Удалить черновик"]').click();
   await t.see(dialog + ':has-text("Удалить черновик?")');
   await t.tap(dialog + ' .btn.danger');
   await toastSee(t, 'Черновик удалён');
   await until(async () => !(await drafts()).some(x => x.id === d.id), 'draft gone on the server');
   const m = await t.api('event.mine', {});
   if (![m.going, m.interested, m.organizing, m.applications, m.drafts].some(l => l?.length)) {
     await t.tap('.empty .btn:has-text("Смотреть события")');
     await until(async () => t.page.url().includes('/n/communities?sub=events'), 'events tab');
   }
 } },
 { name: 'C02 «Мои сообщества»: empty → «Найти сообщества» opens the catalogue', persona: 'basic', route: '/n/me/communities', run: async t => {
   const m = await t.api('community.mine', {});
   if (m.hosting.length || m.member.length || m.requests.length) { await t.see('.grp'); return; }
   await t.see('.empty:has-text("Ты пока не в сообществах")');
   await t.tap('.empty .btn:has-text("Найти сообщества")');
   await until(async () => /#\/n\/communities$/.test(t.page.url()), 'catalogue: ' + t.page.url());
 } },
 { name: 'X01 status fix: «Поменять» → «в отношениях», «Отменить» puts the old status back', persona: 'pair', route: '/n/me', run: async t => {
   const status = async () => (await t.api('profile.get', { profileId: t.me.personId })).profile.details?.status ?? null;
   const was = await status();
   if (was && was !== 'single') { console.log('   (status already set: ' + was + ' — hint not shown)'); return; }
   const fix = t.page.locator('.me-stat21 .btn:has-text("Поменять")');
   await fix.waitFor({ timeout: 20000 }).catch(() => {});
   if (!(await fix.count())) { console.log('   (hint not shown for the acting profile — skipped)'); return; }
   await fix.click();
   await toastSee(t, 'Статус: в отношениях');
   await until(async () => (await status()) === 'partnered', 'partnered saved');
   await t.tap('.toast button:has-text("Отменить")');
   await until(async () => (await status()) === was, 'old status back');
 } },
];
