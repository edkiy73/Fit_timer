// «Скрытое в ленте» and «Заблокированные» (P12) as `full`. The blocked person is `stranger` (a basic person of the
// lane), unblocked again at the end.
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 500)); } } throw last; };
const noDialog = async t => { await t.wait(400); if (await t.page.locator('.sheet.on, .dialog.on').count()) throw new Error('layer still open'); };
async function makeOther(t) { const p = await t.persona('stranger'); return { id: p.personId, handle: p.handle }; }

export default [
 { name: 'Hidden screen: empty state alone; a hidden post appears, «Показывать» brings it back (API)', persona: 'full', route: '/n/settings/hidden', run: async t => {
   const before = await t.api('feedHide.list', {});
   if (!before.items.length) await t.see('Ничего не скрыто');
   const feed = await t.api('feed.list', { tab: 'popular' });
   const post = (feed.items || feed.posts || []).find(x => x.id); if (!post) throw new Error('no post in feed');
   await t.api('feedHide.set', { opId: t.uuid7(), kind: 'post', targetId: post.id, on: true });
   try {
     await t.page.reload(); await t.see('Публикации · ');
     await t.notSee('Ничего не скрыто', 300);
     await t.page.locator('.li .btn:has-text("Показывать")').first().click(); await t.see('Публикация снова в ленте');
     await until(async () => { const l = await t.api('feedHide.list', {}); if (l.items.some(x => x.target_id === post.id)) throw new Error('still hidden'); });
     if (!before.items.length) await t.see('Ничего не скрыто');
   } finally { await t.api('feedHide.set', { opId: t.uuid7(), kind: 'post', targetId: post.id, on: false }); }
 } },
 { name: 'Blocked: empty state, a block appears, unblock dialog cancel/Esc keeps it, unblock removes it (API)', persona: 'full', route: '/n/settings/blocked', run: async t => {
   const p = await makeOther(t), otherNick = p.handle;
   try {
     const start = await t.api('blocks.list', {});
     if (!start.items.length) await t.see('Никого');
     await t.api('block.set', { opId: t.uuid7(), profileId: p.id, on: true });
     await t.page.reload(); await t.see(otherNick); await t.notSee('Никого', 300);
     const row = t.page.locator('.li', { hasText: otherNick });
     await row.locator('.btn:has-text("Разблокировать")').click(); await t.see('.dialog >> text=Разблокировать');
     await t.tap('.dialog >> text=Отмена'); await noDialog(t); await t.see(otherNick);
     await row.locator('.btn:has-text("Разблокировать")').click(); await t.page.keyboard.press('Escape'); await noDialog(t);
     await row.locator('.btn:has-text("Разблокировать")').click(); await t.tap('.dialog .btns .btn >> nth=0');
     await t.see('Разблокировано'); await t.notSee(`.li:has-text("${otherNick}")`, 500);
     await until(async () => { const l = await t.api('blocks.list', {}); if (l.items.some(x => x.id === p.id)) throw new Error('still blocked'); });
     if (!start.items.length) await t.see('Никого');
   } finally { await t.api('block.set', { opId: t.uuid7(), profileId: p.id, on: false }).catch(() => {}); }
 } },
];
