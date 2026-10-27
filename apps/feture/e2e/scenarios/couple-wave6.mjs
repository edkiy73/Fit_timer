// Backlog wave 6 «Пара»: approvals with a «на доработку» note both ways, Q01 (work list, Discover row, «Моё
// подтверждение», safety rows), Q09 set-up, «Действовать как» from the dock, the partner link (create / peek / revoke)
// and its landing. Every step reads the result back through the API.
import { expect, until } from './helpers.mjs';

const NOTE = 'Давай другое описание ' + (Date.now() % 1000);
const BIO = 'e2e w6 bio ' + (Date.now() % 100000);
let approvalId = null;
const B = t => t.me.partner?.email ?? 'qa-w6-pb@feture.test';
const approvals = (t, as) => t.api('decide.approvals', {}, as, t.me.coupleId).then(r => r.items ?? []);
/** Drops every open change of the couple (both authors) and turns approvals off, so each run starts clean. */
async function clean(t) {
  for (const as of [t.me.email, B(t)]) {
    for (const a of await approvals(t, as)) if (a.mine) await t.api('decide.cancel', { opId: t.uuid7(), approvalId: a.id }, as, t.me.coupleId);
    await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: false }, as, t.me.coupleId);
  }
}

export default [
 { name: 'A proposes (approval on): Q01 lists it with its version; dock «Я» opens «Действовать как»', persona: 'pair', run: async t => {
   const cp = t.me.coupleId; expect(cp, 'pair persona has a couple');
   await clean(t);
   await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: true }, B(t), cp);
   const prof = (await t.api('profile.get', { profileId: cp }, t.me.email, cp)).profile;
   const r = await t.api('profile.update', { opId: t.uuid7(), rev: prof.rev, bio: BIO }, t.me.email, cp);
   expect(r.pending?.approvalId, 'the change waits for B: ' + JSON.stringify(r).slice(0, 200));
   approvalId = r.pending.approvalId;
   await t.go('/n/me/pair');
   await t.see('text=Ждёт подтверждения');
   await t.see('text=Версия');
   await t.see('text=Пара в знакомствах'); await t.see('text=Моё подтверждение');
   await t.see('text=Скрыть из знакомств'); await t.see('text=Закрыть приватную часть');
   // Dock «Я» with an active couple: the act-as sheet with both cards.
   await t.tap('nav.dock button.me-tab');
   await t.see('.sheet.on .actor-card >> nth=1');
   expect(await t.page.locator('.sheet.on .actor-card').count() === 2, 'two cards');
   await t.tap('.sheet.on .actor-card:not(.selected) .actor-open');
   await t.page.waitForURL(/#\/n\/me$/, { timeout: 15000 });
   await t.shot('w6-dock-actas');
 } },
 { name: 'B returns it «на доработку» with a comment → returned, note stored', as: 'qa-w6-pb@feture.test', run: async t => {
   expect(approvalId, 'previous step made the approval');
   const cp = (await t.boot()).profiles.find(p => p.kind === 'couple' && p.state === 'active').id;
   await t.go('/n/me/pair?approval=' + approvalId);
   await t.see('.sheet.on .pair-review-meta');
   await t.see('.sheet.on button:has-text("Весь профиль после изменений")');
   await t.tap('.sheet.on .sh-f button:has-text("Вернуть на доработку")');
   await t.fill('.sheet.on textarea', NOTE);
   await t.tap('.sheet.on .sh-f button:has-text("Вернуть")');
   const a = await until(async () => (await t.api('decide.approvals', {}, undefined, cp)).items?.find(x => x.id === approvalId && x.state === 'returned'), 'returned with the note', 20000);
   expect(a.comment === NOTE, 'comment read back: ' + a.comment);
 } },
 { name: 'A sees the returned change: note, sent version, «Изменить» opens the editor as the couple', persona: 'pair', run: async t => {
   await t.go('/n/me/pair');
   await t.see(`text=${NOTE}`);
   await t.tap(`.li:has-text("${NOTE}")`);
   await t.see('.sheet.on .ret-note');
   await t.see('.sheet.on .sh-f button:has-text("Отменить изменения")');
   await t.tap('.sheet.on button:has-text("Посмотреть отправленную версию")');
   await t.see(`text=${BIO}`); await t.see('text=после изменений');
   await t.go('/n/me/pair?approval=' + approvalId);
   await t.tap('.sheet.on .sh-f button:has-text("Изменить")');
   await t.page.waitForURL(/#\/n\/me\/edit/, { timeout: 15000 });
   await t.shot('w6-returned-edit');
   // The author drops it: nothing open stays behind.
   await t.go('/n/me/pair?approval=' + approvalId);
   await t.tap('.sheet.on .sh-f button:has-text("Отменить изменения")');
   await until(async () => !(await approvals(t)).some(x => x.id === approvalId), 'cancelled', 20000);
 } },
 { name: 'Q09 set-up: my approval + who asks → Q01, read back', persona: 'pair', route: '/n/me/pair?setup=1', run: async t => {
   const cp = t.me.coupleId;
   await t.see('text=Настройте пару');
   await t.page.locator('select[aria-label="Моё подтверждение"]').selectOption('approve');
   await t.page.locator('select[aria-label="Кто просит доступ"]').selectOption('matches');
   await t.tap('.ctabar button:has-text("Готово")');
   await t.page.waitForURL(/#\/n\/me\/pair$/, { timeout: 15000 });
   const me = (await t.api('couple.get', {}, undefined, cp)).couple.members.find(m => m.me);
   expect(me.approvesPartner === true, 'approval on');
   const s = (await t.api('profile.settings', {}, undefined, cp)).settings;
   expect(s.requestsFrom === 'matches', 'requestsFrom matches: ' + s.requestsFrom);
   // «Моё подтверждение» sheet: turn it off again with the explanation in view.
   await t.tap('.li:has-text("Моё подтверждение")');
   await t.see('.sheet.on >> text=Приватную часть открываете только вдвоём');
   await t.tap('.sheet.on button[role="radio"]:has-text("Без моего подтверждения")');
   await t.tap('.sheet.on .sh-f button:has-text("Сохранить")');
   await until(async () => !(await t.api('couple.get', {}, undefined, cp)).couple.members.find(m => m.me).approvesPartner, 'approval off');
 } },
 { name: 'Q01 safety: hide from Discover, close the private part (revokeAll) — then restored', persona: 'pair', route: '/n/me/pair', run: async t => {
   const cp = t.me.coupleId;
   try {
     await t.tap('.li:has-text("Скрыть из знакомств")');
     await until(async () => (await t.api('profile.settings', {}, undefined, cp)).settings.discoverMode === 'off', 'discover off');
     await t.see('text=Пара скрыта из знакомств');
     await t.tap('.li:has-text("Закрыть приватную часть")');
     await t.tap('.dialog.on button:has-text("Закрыть")');
     await until(async () => (await t.api('profile.settings', {}, undefined, cp)).settings.requestsFrom === 'none', 'requests off');
     await t.see('text=Приватная часть закрыта');
   } finally {
     await clean(t);
     await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'discoverMode', value: 'visible' }, undefined, cp);
     await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'requestsFrom', value: 'all' }, undefined, cp);
   }
 } },
 { name: 'partner link: create → copy sheet → peek by another → revoke → dead', persona: 'basic', route: '/n/me/pair', run: async t => {
   const other = 'qa-w6-pa@feture.test'; // any other account may peek; peeking does not join anything
   const live = (await t.api('couple.invites', {})).link;
   if (live) await t.api('couple.linkRevoke', { opId: t.uuid7(), linkId: live.id });
   await t.tap('button:has-text("Скопировать ссылку для партнёра")');
   await t.see('.sheet.on input[name="pairLink"]');
   const url = await t.page.locator('.sheet.on input[name="pairLink"]').inputValue();
   const token = url.match(/link=([A-Za-z0-9_-]{43})/)?.[1]; expect(token, 'token in the link: ' + url);
   const inv = await t.api('couple.invites', {}); expect(inv.link?.id, 'a live link read back');
   const peek = await t.api('couple.linkPeek', { token }, other);
   expect(peek.from?.id === t.me.personId, 'peek names the inviter: ' + JSON.stringify(peek).slice(0, 200));
   await t.tap('.sheet.on .sh-h button[aria-label]');
   await t.tap('.li:has-text("Ссылка для партнёра действует") button:has-text("Отозвать")');
   await until(async () => !(await t.api('couple.invites', {})).link, 'link revoked');
   const dead = await t.api('couple.linkPeek', { token }, other);
   expect(dead.status === 404, 'revoked link no longer peeks: ' + dead.status);
 } },
 { name: 'partner link landing: who invites, «Не сейчас» keeps both free', persona: 'solo', run: async t => {
   const from = 'qa-w6-basic@feture.test';
   const l = await t.api('couple.linkCreate', { opId: t.uuid7() }, from);
   expect(l.token, 'link for the landing');
   try {
     await t.go('/n/me/pair?link=' + l.token);
     await t.see('text=приглашает тебя в пару');
     await t.see('button:has-text("Принять и создать пару")');
     await t.shot('w6-link-landing');
     await t.tap('button:has-text("Не сейчас")');
     await t.see('text=Пригласи партнёра');
     const b = await t.boot(); expect(!b.profiles.some(p => p.kind === 'couple'), 'no couple formed');
   } finally { await t.api('couple.linkRevoke', { opId: t.uuid7(), linkId: l.id }, from); }
 } },
];
