// A moderator acts on the thing itself (owner 06.11.2026): «⋯» → «Действия модератора» → a second sheet that names each
// action and on whom → reason, note, confirm. Roles come from the QA moderators (e2e/personas.mjs MOD_ROLES): the
// moderator may take down, restrict, block and watch; the auditor only reads the history; support has no such row.
import { expect, until } from '../helpers.mjs';
const sheet = '.sheet.on';

/** A published community owned by the lane's `host` persona, made for this run (the moderator removes it). */
let made;
/** One community per run for the tests that only read it (the owner may create five a day). */
async function community(t, fresh = false) {
  if (made && !fresh) return made;
  const host = await t.persona('host'), staff = await t.persona('staff');
  const name = 'Мод-проверка ' + Date.now().toString(36);
  const r = await t.api('community.create', { opId: t.uuid7(), name, privacy: 'open', description: 'Сообщество для проверки действий модератора, его уберёт сценарий.',
    topics: ['bondage'], rules: ['Уважай границы'], plate: 'lilac', coverAssetId: await t.cover('community', host.email) }, host.email);
  expect(r.id, 'community.create ' + JSON.stringify(r));
  const q = (await t.api('staff.communityQueue', {}, staff.email)).items.find(x => x.id === r.id);
  const d = await t.api('staff.communityDecide', { opId: t.uuid7(), communityId: r.id, rev: q.rev, decision: 'approve' }, staff.email);
  expect(d.ok || d.decision, 'approved ' + JSON.stringify(d));
  return (made = { id: r.id, name, host });
}
const open = async (t, id) => { await t.go('/n/communities/' + id); await t.tap('button[aria-label="Ещё"]'); await t.see(sheet); };

export default [
 { name: 'moderator: «⋯» has one row; the second sheet names each action and whom it is for; removing a community takes it down', persona: 'mod-moderator', route: '/n/communities', allow4xx: true, run: async t => {
   const c = await community(t, true);
   await open(t, c.id);
   await t.see(sheet + ' .li:has-text("Действия модератора")');
   expect(!(await t.page.locator(sheet + ' .li:has-text("Убрать сообщество")').count()), 'the first sheet has only the one row, not the actions');
   await t.tap(sheet + ' .li:has-text("Действия модератора")');
   await t.see(sheet + ` .li:has-text("Убрать сообщество «${c.name}»")`);
   for (const row of ['Ограничить владельца', 'Заблокировать владельца', 'Взять владельца', 'История решений']) await t.see(sheet + ` .li:has-text("${row}")`);
   await t.shot('mod-actions-menu');
   await t.tap(sheet + ` .li:has-text("Убрать сообщество «${c.name}»")`);
   await t.see(sheet + ' >> text=Какое правило нарушено');
   expect(await t.page.locator(sheet + ' .foot button:has-text("Убрать сообщество"), ' + sheet + ' button:has-text("Убрать сообщество «")').first().isDisabled(), 'the action waits for a rule');
   await t.tap(sheet + ' .radio:has-text("Спам")');
   await t.page.locator(sheet + ' textarea').fill('e2e: проверка действий модератора');
   await t.shot('mod-actions-remove');
   await t.tap(sheet + ` button:has-text("Убрать сообщество «${c.name}»")`);
   await t.see('.dialog.on'); await t.shot('mod-actions-ask');
   await t.tap('.dialog.on button:has-text("Убрать")');
   await until(async () => { const g = await t.api('community.get', { communityId: c.id }, c.host.email); return g.status === 404 || g.community?.state === 'hidden'; }, 'the community is taken down');
   made = null;
   const h = await t.api('staff.history', { targetType: 'community', targetId: c.id });
   expect(h.items?.[0]?.action === 'report.remove' && h.items[0].rule === 'spam', 'the decision is in the history: ' + JSON.stringify(h.items?.[0]));
 } },
 { name: 'auditor: the row is there but the sheet offers only the history', persona: 'mod-auditor', route: '/n/communities', allow4xx: true, run: async t => {
   const c = await community(t);
   await open(t, c.id);
   await t.tap(sheet + ' .li:has-text("Действия модератора")');
   await t.see(sheet + ' .li:has-text("История решений")');
   for (const row of ['Убрать сообщество', 'Ограничить владельца', 'Заблокировать владельца', 'Взять владельца']) expect(!(await t.page.locator(sheet + ` .li:has-text("${row}")`).count()), 'no «' + row + '» for an auditor');
 } },
 { name: 'support: no moderator row at all', persona: 'mod-support', route: '/n/communities', allow4xx: true, run: async t => {
   const c = await community(t);
   await open(t, c.id);
   await t.see(sheet + ' .li:has-text("Пожаловаться")');
   expect(!(await t.page.locator(sheet + ' .li:has-text("Действия модератора")').count()), 'support does not see the moderator row');
 } },
 { name: 'moderator on a profile: restrict, block, watch and the history, no «Убрать»; restricting opens the measures sheet on «Ограничить»', persona: 'mod-moderator', route: '/n/communities', allow4xx: true, run: async t => {
   const host = await t.persona('host');
   await t.go('/n/people/' + host.personId); await t.tap('button[aria-label="Ещё"]'); await t.see(sheet);
   await t.tap(sheet + ' .li:has-text("Действия модератора")');
   for (const row of ['Ограничить ', 'Заблокировать ', 'под наблюдение', 'История решений: ']) await t.see(sheet + ` .li:has-text("${row}")`);
   expect(!(await t.page.locator(sheet + ' .li:has-text("Убрать")').count()), 'a person is not «removed»: restrict or block');
   await t.tap(sheet + ' .li:has-text("Ограничить ")');
   await t.see(sheet + ' >> text=Какое правило нарушено'); await t.shot('mod-actions-restrict');
 } },
];
