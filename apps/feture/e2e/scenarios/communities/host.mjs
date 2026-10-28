// C10 manage, C11 requests, C09 members, C08 edit, discussion host tools — on the closed community of persona `host`.
// Join requests come from `stranger` («ari» below: approved) and a fresh `temp` person each run («lina»: declined — a
// decline holds that person's next request for a week, so a fixed persona could ask only once); every scenario leaves
// the community without members or pending requests.
import fs from 'node:fs';
import { STAFF } from '../../personas.mjs';
import { FIXTURES, outOf, until, uploaderDone } from '../helpers.mjs';
let MINE, ARI, LINA; // set from the lane's personas (see the export at the end)
const sheet = '.sheet.on', dialog = '.dialog.on';
const toast = (t, s) => t.see('.toast:has-text("' + s + '")');
const get = async t => (await t.api('community.get', { communityId: MINE })).community;
const PNG = fs.readFileSync(FIXTURES + 'cover.png');
/** Back to pending requests from these people (default «ari»; C11 adds «lina»). */
async function restoreRequests(t, people = [ARI]) {
  for (const who of people.map(p => p.email)) {
    const c = (await t.api('community.get', { communityId: MINE }, who)).community;
    if (c?.me?.state === 'active') await t.api('community.leave', { opId: t.uuid7(), communityId: MINE }, who);
    const c2 = (await t.api('community.get', { communityId: MINE }, who)).community;
    if (!c2?.request) {
      const r = await t.api('community.join', { opId: t.uuid7(), communityId: MINE, rulesAccepted: true, answer: 'Хочу участвовать в разговорах и встречах клуба, правила прочитала.' }, who);
      if (!r.ok) throw new Error('restore join ' + who + ': ' + r.status + ' ' + r.error);
    }
  }
}
export { restoreRequests };
const scenarios = [
 { name: 'C10 manage: tiles and rows lead to requests and members', persona: 'host', route: '/n/communities/@MINE/manage', run: async t => {
   await t.see('.stat3');
   await t.see('Описание и правила');
   await t.tap('.card.list .li:has-text("Заявки")');
   await t.wait(500); if (!t.page.url().includes('/requests')) throw new Error('requests not opened');
   await t.go('/n/communities/' + MINE + '/manage');
   await t.tap('.card.list .li:has-text("Участники")');
   await t.wait(500); if (!t.page.url().includes('t=members')) throw new Error('members not opened: ' + t.page.url());
   await t.see('Ведущие');
 } },
 { name: 'C11 requests: approve ari, decline lina, history', persona: 'host', run: async t => {
   LINA = await t.persona('temp');
   await restoreRequests(t, [ARI, LINA]); await t.go('/n/communities/' + MINE + '/requests');
   await t.see('.application-card');
   const n0 = await t.page.locator('.application-card').count();
   if (n0 < 2) throw new Error('expected 2 pending, got ' + n0);
   await t.see('.application-answer');
   // The requests decided here (by id): other scenarios of the lane (wave7 C11, chats N01) use the same people on the
   // same community, so «the latest request of ari / lina» in the history may be someone else's by the time it is read.
   const pend = (await t.api('community.requests', { communityId: MINE, tab: 'pending' })).items;
   const [ra, rl] = [pend.find(x => x.profile.handle === ARI.handle)?.id, pend.find(x => x.profile.handle === LINA.handle)?.id];
   await t.page.locator('.application-card').filter({ hasText: ARI.handle }).first().locator('.btn:has-text("Одобрить")').click();
   await toast(t, 'Участие одобрено');
   await t.page.locator('.application-card').filter({ hasText: LINA.handle }).first().locator('.btn:has-text("Отклонить")').click();
   await toast(t, 'Заявка отклонена');
   await t.wait(800);
   if (await t.page.locator('.application-card .btn:has-text("Одобрить")').count() !== n0 - 2) throw new Error('decided cards still pending');
   await t.tap('.seg button:has-text("Решения")');
   // A decision goes out once its «Отменить» toast is gone (5 s); the open «Решения» tab reads the list again then.
   let h, a, l;
   await until(async () => {
     h = await t.api('community.requests', { communityId: MINE, tab: 'history' });
     [a, l] = [h.items.find(x => x.id === ra), h.items.find(x => x.id === rl)];
     return a && l;
   }, 'decisions sent', 20000).catch(() => {});
   await t.see('.application-card:has-text("' + ARI.handle + '"):has-text("Одобрено")'); await t.see('.application-card:has-text("' + LINA.handle + '"):has-text("Отклонено")');
   if (a?.state !== 'approved' || l?.state !== 'declined') throw new Error('history: ari ' + a?.state + ', lina ' + l?.state + ' · ' + JSON.stringify(h.items.slice(0, 3).map(x => [x.profile.handle, x.state])));
 } },
 { name: 'C09 members: make host, unhost, read-only, can write, remove; restore requests', persona: 'host', run: async t => {
   const ariId = ARI.personId;
   if ((await t.api('community.get', { communityId: MINE }, ARI.email)).community?.me?.state !== 'active') {
     await restoreRequests(t);
     const p = await t.api('community.requests', { communityId: MINE, tab: 'pending' });
     const r = p.items.find(x => x.profile.id === ariId); await t.api('community.requestDecide', { opId: t.uuid7(), requestId: r.id, rev: r.rev, approve: true });
   }
   const role = async () => (await t.api('community.members', { communityId: MINE })).items.find(m => m.id === ariId);
   await t.go('/n/communities/' + MINE + '/members');
   const row = () => t.page.locator('.li').filter({ hasText: ARI.handle }).first();
   await row().waitFor({ timeout: 10000 });
   await row().click(); await t.see(sheet);
   await t.tap(sheet + ' .li:has-text("Сделать ведущим")'); await toast(t, 'теперь ведёт сообщество');
   if ((await role()).role !== 'host') throw new Error('not host');
   await row().click(); await t.tap(sheet + ' .li:has-text("Снять с ведущих")'); await toast(t, 'больше не ведёт');
   if ((await role()).role !== 'member') throw new Error('still host');
   await row().click(); await t.tap(sheet + ' .li:has-text("Запретить писать")'); await toast(t, 'может только читать');
   if (!(await role()).read_only) throw new Error('not read-only');
   await row().click(); await t.tap(sheet + ' .li:has-text("Разрешить писать")'); await toast(t, 'снова может писать');
   if ((await role()).read_only) throw new Error('still read-only');
   await row().click(); await t.tap(sheet + ' .li:has-text("Удалить из сообщества")');
   await t.see(dialog); await t.page.locator(dialog + ' .btn.danger').click({ timeout: 5000 }); await toast(t, 'больше не в сообществе');
   if (await role()) throw new Error('still a member');

 } },
 { name: 'C08 edit: validation keeps the form, nothing saved; «Сохранить» above the dock', persona: 'host', route: '/n/communities/@MINE/edit', run: async t => {
   await t.see('input[name="name"]');
   const before = await get(t);
   await t.see('.ctabar .btn:has-text("Сохранить")');
   await t.page.locator('input[name="name"]').fill('ab');
   await t.page.locator('textarea[name="rules"]').fill('');
   await t.tap('.ctabar .btn');
   await t.see('.field.err:has-text("Минимум 3 символа")'); await t.see('.field.err:has-text("Нужно хотя бы одно правило")');
   if ((await get(t)).rev !== before.rev) throw new Error('saved despite errors');
 } },
 { name: 'C08 edit: rules and colour save right away, read back, restore', persona: 'host', route: '/n/communities/@MINE/edit', run: async t => {
   await t.see('textarea[name="rules"]');
   const before = await get(t);
   await t.page.locator('textarea[name="rules"]').fill(before.rules.join('\n') + '\nE2E правило');
   const newPlate = before.plate === 'sea' ? 'amber' : 'sea';
   await t.tap(`button[aria-label="${{ sea: 'Морской', amber: 'Янтарный' }[newPlate]}"]`);
   await t.tap('.ctabar .btn');
   await t.wait(1000);
   if (!t.page.url().includes('/manage')) throw new Error('not back on manage: ' + t.page.url());
   await t.see('.toast');
   const after = await get(t);
   if (after.rules.at(-1) !== 'E2E правило') throw new Error('rules not saved: ' + after.rules.join('|'));
   if (after.plate !== newPlate) throw new Error('plate not saved: ' + after.plate);
   const r = await t.api('community.update', { opId: t.uuid7(), communityId: MINE, rev: after.rev, rules: before.rules, plate: before.plate ?? 'lilac' });
   if (!r.ok) throw new Error('restore: ' + r.error);
 } },
 { name: 'C08 edit: cover upload → saved for review, then staff reject cleans up', persona: 'host', route: '/n/communities/@MINE/edit', run: async t => {
   await t.see('[data-field="cover"]');
   await t.page.locator('[data-field="cover"] input[type="file"]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
   await uploaderDone(t);
   await t.see('.evcov img', 20000);
   await t.tap('.ctabar .btn');
   await t.wait(1500);
   if (!t.page.url().includes('/manage')) throw new Error('not back on manage: ' + t.page.url());
   await t.see('.toast:has-text("На проверке")');
   const c = await get(t);
   if (!c.pendingChange?.coverAssetId) throw new Error('cover not pending: ' + JSON.stringify(c.pendingChange));
   const d = await t.api('staff.communityDecide', { opId: t.uuid7(), communityId: MINE, rev: c.rev, decision: 'reject', reason: 'e2e cleanup' }, STAFF);
   if (!d.ok) throw new Error('staff cleanup: ' + d.status + ' ' + d.error);
 } },
 { name: 'C10 privacy: hidden now, invite link, back to closed after review', persona: 'host', route: '/n/communities/@MINE/manage', run: async t => {
   await t.see('.stat3');
   const sel = t.page.locator('select[aria-label="Кто может вступить"]');
   await sel.selectOption('hidden');
   await toast(t, 'Сообщество скрыто');
   if ((await get(t)).privacy !== 'hidden') throw new Error('not hidden');
   await t.tap('.li:has-text("Пригласить по ссылке")');
   await t.see('.toast:has-text("Ссылка скопирована"), .toast:has-text("Не удалось скопировать")');
   await t.see('.li b:has-text("invite=")');
   await sel.selectOption('closed');
   await t.see('.toast:has-text("после проверки")');
   const c = await get(t);
   const d = await t.api('staff.communityDecide', { opId: t.uuid7(), communityId: MINE, rev: c.rev, decision: 'approve' }, STAFF);
   if (!d.ok) throw new Error('staff approve: ' + d.status + ' ' + d.error);
   if ((await get(t)).privacy !== 'closed') throw new Error('privacy not restored');
 } },
 { name: 'C03 host tools: pin, unpin, remove a discussion', persona: 'host', run: async t => {
   for (const d of (await t.api('community.discussions', { communityId: MINE })).items.filter(x => x.excerpt.startsWith('E2E '))) await t.api('post.delete', { opId: t.uuid7(), postId: d.id });
   const stamp = 'E2E обсуждение ' + Date.now().toString(36);
   const s = await t.api('post.saveDraft', { opId: t.uuid7(), post: { body: stamp + ' для проверки инструментов ведущего', communityId: MINE, inFeed: false } });
   if (!s.ok) throw new Error('draft: ' + s.error);
   const p = await t.api('post.publish', { opId: t.uuid7(), postId: s.id }); if (!p.ok) throw new Error('publish: ' + p.error);
   await t.go('/n/communities/' + MINE);
   const item = () => t.page.locator('.card.list > div').filter({ hasText: stamp }).first();
   await item().waitFor({ timeout: 10000 });
   await item().locator('button[aria-label]').last().click(); await t.see(sheet);
   await t.tap(sheet + ' .li:has-text("Закрепить")'); await toast(t, 'Обсуждение закреплено');
   await item().locator('.pill:has-text("Закреплено")').waitFor({ timeout: 8000 });
   await item().locator('button[aria-label]').last().click();
   await t.tap(sheet + ' .li:has-text("Открепить")'); await toast(t, 'Обсуждение откреплено');
   await item().locator('button[aria-label]').last().click();
   await t.tap(sheet + ' .li:has-text("Удалить")'); await t.see(dialog);
   await t.page.locator(dialog + ' .btn.danger').click({ timeout: 5000 }); await toast(t, 'Обсуждение удалено');
   await t.notSee('.disc:has-text("' + stamp + '")', 1500);
 } },
];

export default scenarios.map(sc => ({ ...sc, route: null, run: async t => {
  MINE = t.me.closedId; ARI = await t.persona('stranger'); LINA = null;
  if (sc.route) await t.go(sc.route.replace('@MINE', MINE));
  try { await sc.run(t); } finally { for (const p of [ARI, LINA].filter(Boolean)) await outOf(t, MINE, p.email); }
} }));
