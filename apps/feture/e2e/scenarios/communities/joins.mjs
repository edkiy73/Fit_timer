// Every way into a community (owner check of join flows, 28.10.2026), lane `jn`: open (join / leave), closed with and
// without a join question (request, pending card, withdraw, approve, decline and its 7-day wait), hidden by an invite
// link, a removed member (a ban: open takes a request), a block with the owner, and a couple (the partner's approval).
// The owner is persona `host`; joiners are `basic`, `stranger`, `temp` (fresh: a decline holds a new request for a week)
// and `pair`. Every step reads the result back through the API; each scenario leaves everybody outside again.
// Scenarios marked [server 28.10] need the server of this change deployed (request time, declined / waiting state,
// the 7-day rule, a hidden community reachable while asked).
import { expect, until, outOf } from '../helpers.mjs';

const sheet = '.sheet.on', dialog = '.dialog.on';
const toast = (t, s) => t.see('.toast:has-text("' + s + '")');
const get = async (t, id, as, profile) => (await t.api('community.get', { communityId: id }, as, profile)).community;
const host = t => t.persona('host');
const ANSWER = 'Хочу учиться у опытных людей и приходить на встречи.';
/** Host decides on `as`'s pending request through the API (the inbox UI is covered by host.mjs). */
async function decide(t, h, communityId, profileId, approve) {
  const items = (await t.api('community.requests', { communityId, tab: 'pending' }, h.email)).items ?? [];
  const r = items.find(x => x.profile.id === profileId);
  expect(r, 'host sees the request of ' + profileId);
  const d = await t.api('community.requestDecide', { opId: t.uuid7(), requestId: r.id, rev: r.rev, approve }, h.email);
  expect(d.state === (approve ? 'approved' : 'declined'), 'decide: ' + JSON.stringify(d).slice(0, 200));
}
/** Sends the join sheet: accepts the rules, answers the question when there is one. */
async function sendJoin(t, { answer } = {}) {
  await t.see(sheet);
  if (answer) await t.page.locator(sheet + ' textarea').fill(answer);
  // One button accepts the rules and joins / sends the request (owner 29.10.2026: no «Принимаю правила» box).
  await t.see(sheet + ' .sh-f .btn:has-text("Принять правила")');
  await t.page.locator(sheet + ' .sh-f .btn').click();
}
const asCouple = async (t, coupleId) => { await t.page.evaluate(id => sessionStorage.setItem('feture.fe.acting', id), coupleId); await t.page.reload(); await t.wait(1500); };

export default [
 { name: 'JN-C1 open: «Вступить» → rules → member; «Выйти» asks, then out', persona: 'basic', run: async t => {
   const h = await host(t); await outOf(t, h.openId);
   try {
     await t.go('/n/communities/' + h.openId);
     await t.tap('.cm-act .btn:has-text("Вступить")');
     await t.see(sheet + ':has-text("Правила сообщества")');
     if (await t.page.locator(sheet + ' button.check').count()) throw new Error('a «Принимаю правила» box is back'); // the button accepts the rules
     await sendJoin(t);
     await t.see('.toast:has-text("Ты в «")');
     expect((await get(t, h.openId)).me?.state === 'active', 'member on the server');
     await t.see('.cm-act .pill:has-text("Ты участник"), .cm-act .pill.ok');
     await t.tap('button[aria-label="Ещё"]'); await t.tap(sheet + ' .li:has-text("Выйти из сообщества")');
     await t.see(dialog); await t.page.locator(dialog + ' .btn.danger').click();
     await toast(t, 'Ты больше не в сообществе');
     expect((await get(t, h.openId)).me?.state !== 'active', 'left on the server');
     await t.see('.cm-act .btn:has-text("Вступить")');
   } finally { await outOf(t, h.openId); }
 } },

 { name: 'JN-C2 closed with a question: short answer refused, request → one status card → «Отозвать» → asked again → approved → member → leave', persona: 'basic', run: async t => {
   const h = await host(t); await outOf(t, h.closedId);
   try {
     await t.go('/n/communities/' + h.closedId);
     await t.see('.veil-glass'); // discussions are for members
     await t.tap('.cm-act .btn:has-text("Подать заявку")');
     await t.see(sheet + ':has-text("Заявка в сообщество")');
     await sendJoin(t, { answer: 'коротко' }); await t.see('Ответь хотя бы парой предложений');
     await t.page.locator(sheet + ' textarea').fill(ANSWER); await t.page.locator(sheet + ' .sh-f .btn').click();
     await toast(t, 'Заявка отправлена ведущим');
     const c = await get(t, h.closedId); expect(c.request?.id, 'request stored');
     // One block: icon, state and «Отозвать» together (owner screen 5).
     await t.see('.k-status:has-text("Заявка на рассмотрении") .btn:has-text("Отозвать")');
     expect(!(await t.page.locator('.cm-act .pill').count()), 'no separate pill any more');
     await t.tap('.k-status .btn:has-text("Отозвать")'); await t.see(dialog + ':has-text("Отозвать заявку?")');
     await t.page.locator(dialog + ' .btn.danger').click(); await toast(t, 'Заявка отозвана');
     expect(!(await get(t, h.closedId)).request, 'withdrawn on the server');
     // Withdrawing has no wait: ask again, the host approves.
     await t.tap('.cm-act .btn:has-text("Подать заявку")'); await sendJoin(t, { answer: ANSWER }); await toast(t, 'Заявка отправлена ведущим');
     await decide(t, h, h.closedId, t.me.personId, true);
     await t.page.reload(); await t.see('.cm-act .pill.ok');
     expect((await get(t, h.closedId)).me?.state === 'active', 'member after approval');
     await t.notSee('.veil-glass', 500);
     // Leaving a closed one: coming back is a request again.
     await t.api('community.leave', { opId: t.uuid7(), communityId: h.closedId });
     await t.page.reload(); await t.see('.cm-act .btn:has-text("Подать заявку")');
   } finally { await outOf(t, h.closedId); }
 } },

 { name: 'JN-C3 closed without a question: the sheet has rules only; request and withdraw', persona: 'basic', run: async t => {
   const h = await host(t); await outOf(t, h.closedNoQId);
   try {
     await t.go('/n/communities/' + h.closedNoQId);
     await t.tap('.cm-act .btn:has-text("Подать заявку")');
     await t.see(sheet + ':has-text("Заявка в сообщество")');
     expect(!(await t.page.locator(sheet + ' textarea').count()), 'no question field');
     await sendJoin(t); await toast(t, 'Заявка отправлена ведущим');
     const c = await get(t, h.closedNoQId); expect(c.request?.id, 'request stored');
     await t.see('.k-status .btn:has-text("Отозвать")');
     await t.tap('.k-status .btn:has-text("Отозвать")'); await t.page.locator(dialog + ' .btn.danger').click();
     await toast(t, 'Заявка отозвана'); expect(!(await get(t, h.closedNoQId)).request, 'withdrawn');
   } finally { await outOf(t, h.closedNoQId); }
 } },

 { name: 'JN-C4 [server 28.10] the pending card says when it went; a decline shows its card and holds a new request for a week', persona: 'temp', run: async t => {
   const h = await host(t);
   await t.api('community.join', { opId: t.uuid7(), communityId: h.closedId, rulesAccepted: true, answer: ANSWER });
   await t.go('/n/communities/' + h.closedId);
   await t.see('.k-status:has-text("Заявка на рассмотрении"):has-text("Отправлена")');
   const pid = await t.pid();
   await decide(t, h, h.closedId, pid, false);
   await t.page.reload();
   await t.see('.k-status:has-text("Заявку отклонили"):has-text("Новую можно отправить")');
   expect(!(await t.page.locator('.cm-act .btn:has-text("Подать заявку")').count()), 'no request button during the wait');
   const c = await get(t, h.closedId); expect(c.declined?.until && Date.parse(c.declined.until) > Date.now() + 6 * 864e5, 'declined until a week later: ' + JSON.stringify(c.declined));
   const again = await t.api('community.join', { opId: t.uuid7(), communityId: h.closedId, rulesAccepted: true, answer: ANSWER });
   expect(again.rule === 'declined_recently', 'second request refused: ' + JSON.stringify(again).slice(0, 200));
 } },

 { name: 'JN-C5 hidden: nothing without the link; the invite link shows it, a request goes', persona: 'basic', run: async t => {
   const h = await host(t); await outOf(t, h.hiddenId);
   const { token } = await t.api('community.invite', { opId: t.uuid7(), communityId: h.hiddenId }, h.email);
   expect(token, 'invite token');
   try {
     expect((await t.api('community.get', { communityId: h.hiddenId })).status === 404, 'hidden without the link');
     await t.go('/n/communities/' + h.hiddenId + '?invite=' + token);
     await t.see('.cm-act .btn:has-text("Подать заявку")');
     await t.tap('.cm-act .btn:has-text("Подать заявку")'); await sendJoin(t, { answer: 'Меня пригласил ведущий клуба, давно знакомы.' });
     await toast(t, 'Заявка отправлена ведущим');
     expect((await t.api('community.get', { communityId: h.hiddenId, invite: token })).community?.request?.id, 'request stored');
     await t.see('.k-status:has-text("Заявка на рассмотрении")');
   } finally {
     await outOf(t, h.hiddenId).catch(() => {});
     const c = (await t.api('community.get', { communityId: h.hiddenId, invite: token })).community;
     if (c?.request) await t.api('community.requestWithdraw', { opId: t.uuid7(), requestId: c.request.id });
     await t.api('community.invite', { opId: t.uuid7(), communityId: h.hiddenId, revokeAll: true }, h.email);
   }
 } },

 { name: 'JN-C6 [server 28.10] hidden: who asked through the link still reaches the page (and «Отозвать») without it', persona: 'basic', allow4xx: true, run: async t => {
   const h = await host(t); await outOf(t, h.hiddenId);
   const { token } = await t.api('community.invite', { opId: t.uuid7(), communityId: h.hiddenId }, h.email);
   try {
     await t.api('community.join', { opId: t.uuid7(), communityId: h.hiddenId, rulesAccepted: true, answer: 'Меня пригласил ведущий клуба, давно знакомы.', invite: token });
     const c = await get(t, h.hiddenId); expect(c?.request?.id, 'reachable without the link while asked: ' + String(JSON.stringify(c)).slice(0, 120));
     await t.go('/n/communities/' + h.hiddenId);
     await t.tap('.k-status .btn:has-text("Отозвать")'); await t.page.locator(dialog + ' .btn.danger').click();
     await toast(t, 'Заявка отозвана');
     expect((await t.api('community.get', { communityId: h.hiddenId })).status === 404, 'gone again after withdrawing');
   } finally {
     const c = (await t.api('community.get', { communityId: h.hiddenId, invite: token })).community;
     if (c?.request) await t.api('community.requestWithdraw', { opId: t.uuid7(), requestId: c.request.id });
     await t.api('community.invite', { opId: t.uuid7(), communityId: h.hiddenId, revokeAll: true }, h.email);
   }
 } },

 { name: 'JN-C7 removed from an open community (a ban): «Подать заявку» instead of «Вступить»; approved → member again', persona: 'stranger', run: async t => {
   const h = await host(t); await outOf(t, h.openId);
   try {
     await t.api('community.join', { opId: t.uuid7(), communityId: h.openId, rulesAccepted: true });
     expect((await get(t, h.openId)).me?.state === 'active', 'joined');
     const rm = await t.api('community.member', { opId: t.uuid7(), communityId: h.openId, profileId: t.me.personId, change: 'remove' }, h.email);
     expect(rm.change === 'remove', 'removed: ' + JSON.stringify(rm).slice(0, 160));
     await t.go('/n/communities/' + h.openId);
     await t.see('.cm-act .btn:has-text("Подать заявку")');
     await t.tap('.cm-act .btn:has-text("Подать заявку")'); await t.see(sheet + ':has-text("Заявка в сообщество")');
     await sendJoin(t); await toast(t, 'Заявка отправлена ведущим');
     expect((await get(t, h.openId)).request?.id, 'a request, not a join');
     await decide(t, h, h.openId, t.me.personId, true);
     expect((await get(t, h.openId)).me?.state === 'active', 'member again after approval');
   } finally { await outOf(t, h.openId); }
 } },

 { name: 'JN-C8 a block with the owner: the community is gone for the blocked side, back after unblocking', persona: 'stranger', allow4xx: true, run: async t => {
   const h = await host(t);
   try {
     const b = await t.api('block.set', { opId: t.uuid7(), profileId: t.me.personId, on: true }, h.email);
     expect(b.status !== 400 && b.status !== 500, 'block: ' + JSON.stringify(b).slice(0, 160));
     expect((await t.api('community.get', { communityId: h.openId })).status === 404, 'hidden while blocked');
     await t.go('/n/communities/' + h.openId);
     await t.see('text=Сообщество недоступно');
     const j = await t.api('community.join', { opId: t.uuid7(), communityId: h.openId, rulesAccepted: true });
     expect(j.status === 404, 'no join while blocked: ' + j.status);
   } finally { await t.api('block.set', { opId: t.uuid7(), profileId: t.me.personId, on: false }, h.email); }
   expect((await get(t, h.openId))?.id === h.openId, 'visible again after unblocking');
 } },

 { name: 'JN-C9 couple: «Вступить от пары» joins at once without approvals; with approvals on it waits for the partner', persona: 'pair', run: async t => {
   const h = await host(t); const cp = t.me.coupleId, B = t.me.partner.email;
   await outOf(t, h.openId, undefined).catch(() => {});
   const out = async () => { const c = await get(t, h.openId, t.me.email, cp); if (c?.me?.state === 'active') await t.api('community.leave', { opId: t.uuid7(), communityId: h.openId }, t.me.email, cp); };
   const cancelMine = async () => { for (const a of (await t.api('decide.approvals', {}, t.me.email, cp)).items ?? []) if (a.mine && a.kind === 'community.join') await t.api('decide.cancel', { opId: t.uuid7(), approvalId: a.id }, t.me.email, cp); };
   await out(); await cancelMine();
   await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: false }, B, cp);
   try {
     await t.go('/n/communities/' + h.openId); await asCouple(t, cp);
     await t.tap('.cm-act .btn:has-text("Вступить от пары")'); await sendJoin(t);
     await t.see('.toast:has-text("Вы в «")');
     expect((await get(t, h.openId, t.me.email, cp)).me?.state === 'active', 'the couple is a member');
     await out();
     // Approvals on: the join waits for B.
     await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: true }, B, cp);
     await t.page.reload(); await t.wait(1000);
     await t.tap('.cm-act .btn:has-text("Вступить от пары")'); await sendJoin(t);
     await toast(t, 'Ждёт согласия партнёра');
     const waits = ((await t.api('decide.approvals', {}, t.me.email, cp)).items ?? []).filter(a => a.mine && a.kind === 'community.join');
     expect(waits.length === 1, 'one approval waits: ' + waits.length);
     expect((await get(t, h.openId, t.me.email, cp)).me?.state !== 'active', 'not a member before B agrees');
   } finally { await cancelMine(); await out(); await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: false }, B, cp); }
 } },

 { name: 'JN-C10 [server 28.10] couple: the waiting join is one status card; «Отозвать» takes the approval back', persona: 'pair', run: async t => {
   const h = await host(t); const cp = t.me.coupleId, B = t.me.partner.email;
   const cancelMine = async () => { for (const a of (await t.api('decide.approvals', {}, t.me.email, cp)).items ?? []) if (a.mine && a.kind === 'community.join') await t.api('decide.cancel', { opId: t.uuid7(), approvalId: a.id }, t.me.email, cp); };
   await cancelMine();
   const c0 = await get(t, h.openId, t.me.email, cp); if (c0?.me?.state === 'active') await t.api('community.leave', { opId: t.uuid7(), communityId: h.openId }, t.me.email, cp);
   await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: true }, B, cp);
   try {
     const r = await t.api('community.join', { opId: t.uuid7(), communityId: h.openId, rulesAccepted: true }, t.me.email, cp);
     expect(r.pending?.approvalId, 'waits for B: ' + JSON.stringify(r).slice(0, 160));
     expect((await get(t, h.openId, t.me.email, cp)).waiting?.id === r.pending.approvalId, 'community.get says it waits');
     await t.go('/n/communities/' + h.openId); await asCouple(t, cp);
     await t.see('.k-status:has-text("Ждёт согласия партнёра")');
     await t.tap('.k-status .btn:has-text("Отозвать")'); await t.page.locator(dialog + ' .btn.danger').click();
     await toast(t, 'Заявка отозвана');
     await until(async () => !(await get(t, h.openId, t.me.email, cp)).waiting, 'approval taken back');
     await t.see('.cm-act .btn:has-text("Вступить от пары")');
   } finally { await cancelMine(); await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: false }, B, cp); }
 } },
];
