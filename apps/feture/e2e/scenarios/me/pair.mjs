// Couple Q01/Q06/Q07: live lookup, invite, withdraw, accept as the partner (API), couple settings, stop, start over.
// Persona `inviter` (no couple) invites `invitee`; both are basic people of the lane, so the 10-a-day invite limit is
// the lane's own. `inviter` ends free again: «Создать новую пару» replaces the stopped couple (deleted), and that
// invitation is withdrawn. This file sends 3 invitations per run.
import { expect, until } from '../helpers.mjs';
const partner = t => t.persona('invitee');
const invites = async (t, as) => t.api('couple.invites', {}, as);
const coupleOf = async (t, as) => (await t.boot(as)).profiles?.find(p => p.kind === 'couple' && p.state !== 'deleted');
const withdrawAll = async t => { for (const o of (await invites(t)).outgoing || []) if (o.state === 'pending') await t.api('couple.inviteWithdraw', { opId: t.uuid7(), inviteId: o.id }); };
const restore = async t => {
  await withdrawAll(t);
  let c = await coupleOf(t);
  if (c?.state === 'active') await t.api('couple.stop', { opId: t.uuid7(), confirm: true }, undefined, c.id);
  if (c) { await t.api('couple.invite', { opId: t.uuid7(), handle: (await partner(t)).handle, replacePaused: true }); await withdrawAll(t); }
  c = await coupleOf(t); if (c) console.log('   !!! inviter still has a couple ' + c.id + ' state ' + c.state);
};

export default [
 { name: 'Q01 lookup states, invite by nick, withdraw', persona: 'inviter', route: '/n/me/pair', run: async t => {
   const T2 = (await partner(t)).email, nick = (await partner(t)).handle;
   if (await coupleOf(t)) await restore(t);
   expect(!(await coupleOf(t)), 'inviter must start without a couple');
   try {
     await t.see('input.inp'); await t.fill('input.inp', t.me.handle); await t.see('Это твой ник');
     await t.fill('input.inp', 'no_such_nick_e2e'); await t.see('Такого ника нет');
     expect(await t.page.locator('button:has-text("Пригласить")').isDisabled(), 'invite disabled without a hit');
     await t.fill('input.inp', nick); await t.see('.pill.ok');
     await t.tap('button:has-text("Пригласить")'); await t.see('Отозвать приглашение');
     expect((await invites(t)).outgoing.some(o => o.state === 'pending'), 'pending invite');
     expect((await invites(t, T2)).incoming.length > 0, 'invitee sees it');
     await t.tap('button:has-text("Отозвать приглашение")'); await t.see('input.inp');
     await until(async () => !(await invites(t)).outgoing.some(o => o.state === 'pending'), 'withdrawn');
   } finally { await withdrawAll(t); }
 } },
 { name: 'Q01→Q06→Q07 accept (partner), approval toggle, stop, agree to restore, start a new couple, withdraw', persona: 'inviter', route: '/n/me/pair', run: async t => {
   const T2 = (await partner(t)).email, nick = (await partner(t)).handle;
   if (await coupleOf(t)) await restore(t);
   expect(!(await coupleOf(t)), 'inviter must start without a couple');
   try {
     await t.see('input.inp'); await t.fill('input.inp', nick); await t.see('.pill.ok'); await t.tap('button:has-text("Пригласить")'); await t.see('Отозвать приглашение');
     const inv = (await invites(t, T2)).incoming[0]; expect(inv, 'invitee got it');
     const a = await t.api('couple.inviteAnswer', { opId: t.uuid7(), inviteId: inv.id, accept: true }, T2); expect(a.ok, 'accept ' + JSON.stringify(a));
     await t.page.reload(); await t.see('Настройки пары');
     const couple = await coupleOf(t);
     const sw = t.page.locator('button[role="switch"]'); const was = await sw.getAttribute('aria-checked');
     await sw.click(); await until(async () => (await sw.getAttribute('aria-checked')) !== was, 'approval toggled in UI');
     const me = (await t.api('couple.get', {}, undefined, couple.id)).couple.members.find(m => m.me); expect(String(me.approvesPartner) !== was, 'approval persisted');
     await sw.click(); await until(async () => (await sw.getAttribute('aria-checked')) === was, 'approval back');
     await t.tap('.li.danger:has-text("Остановить пару")'); await t.tap('.btn.text:has-text("Отмена")'); await t.see('.li.danger:has-text("Остановить пару")');
     await t.tap('.li.danger:has-text("Остановить пару")'); await t.tap('.btn.danger:has-text("Остановить пару")');
     await t.see('Связь остановлена'); await t.see('Согласиться на восстановление');
     await t.tap('button:has-text("Согласиться на восстановление")'); await t.see('Согласие отправлено');
     await t.tap('button:has-text("Создать новую пару")'); await t.see('.dialog.on'); await t.tap('.dialog.on button:has-text("Создать новую")');
     await t.see('input.inp'); await t.fill('input.inp', nick); await t.see('.pill.ok'); await t.tap('button:has-text("Пригласить")');
     await t.see('Отозвать приглашение');
     await until(async () => !(await coupleOf(t)), 'stopped couple replaced');
     await t.tap('button:has-text("Отозвать приглашение")'); await t.see('input.inp');
   } finally { await restore(t); }
 } },
];
